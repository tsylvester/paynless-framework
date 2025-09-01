import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  type DialecticJobPayload,
  type SelectedAiProvider,
  type FailedAttemptError,
  type IDialecticJobDeps,
  type ModelProcessingResult,
  type Job,
  type PromptConstructionPayload,
  type SourceDocument,
} from '../dialectic-service/dialectic.interface.ts';
import { isSelectedAiProvider } from "../_shared/utils/type_guards.ts";
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { type Messages } from '../_shared/types.ts';
import { type AssemblerSourceDocument, type StageContext } from '../_shared/prompt-assembler.interface.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { getInitialPromptContent } from '../_shared/utils/project-initial-prompt.ts';

export async function processSimpleJob(
    dbClient: SupabaseClient<Database>,
    job: Job & { payload: DialecticJobPayload },
    projectOwnerUserId: string,
    deps: IDialecticJobDeps,
    authToken: string,
) {
    const { id: jobId, attempt_count: currentAttempt, max_retries } = job;
    const {
        stageSlug,
        projectId,
        model_id,
        sessionId,
    } = job.payload;
    
    deps.logger.info(`[dialectic-worker] [processSimpleJob] Starting attempt ${currentAttempt + 1}/${max_retries + 1} for job ID: ${jobId}`);
    let providerDetails: SelectedAiProvider | undefined;

    try {
        if (!stageSlug) throw new Error('stageSlug is required in the payload.');
        if (!projectId) throw new Error('projectId is required in the payload.');
        if (!sessionId) throw new Error('sessionId is required in the payload.');

        const { data: sessionData, error: sessionError } = await dbClient.from('dialectic_sessions').select('*').eq('id', sessionId).single();
        if (sessionError || !sessionData) throw new Error(`Session ${sessionId} not found.`);

        const { data: providerData, error: providerError } = await dbClient.from('ai_providers').select('*').eq('id', model_id).single();
        if (providerError || !providerData || !isSelectedAiProvider(providerData)) {
            throw new Error(`Failed to fetch valid provider details for model ID ${model_id}.`);
        }
        providerDetails = providerData;

        if (currentAttempt === 0 && projectOwnerUserId) {
            await deps.notificationService.sendDialecticContributionStartedEvent({
                sessionId,
                modelId: providerDetails.id,
                iterationNumber: sessionData.iteration_count,
                type: 'dialectic_contribution_started',
                job_id: jobId,
            }, projectOwnerUserId);
        }
        
        const { data: project } = await dbClient.from('dialectic_projects').select('*, dialectic_domains(id, name, description)').eq('id', projectId).single();
        if (!project) {
            throw new Error(`Project ${projectId} not found.`);
        }
        if (!project.dialectic_domains) {
            throw new Error(`Project domain not found for project ${projectId}.`);
        }

        const { data: stageResult, error: stageError } = await dbClient
            .from('dialectic_stages')
            .select('*, system_prompts(prompt_text)')
            .eq('slug', stageSlug)
            .single();

        if (stageError || !stageResult) {
            throw new Error(`Could not retrieve stage details for slug: ${stageSlug}`);
        }
        const { system_prompts, ...stageData } = stageResult;
        if (!system_prompts) {
            throw new Error(`System prompt not found for stage: ${stageData.id}`);
        }

        if (!deps.promptAssembler) {
            throw new Error('PromptAssembler dependency is missing.');
        }

        let conversationHistory: Messages[] = [];
        let gatheredInputs: AssemblerSourceDocument[] = [];
        let currentUserPrompt: string;
        const resourceDocuments: SourceDocument[] = [];

        if (job.payload.target_contribution_id) {
            conversationHistory = await deps.promptAssembler.gatherContinuationInputs(
                job.payload.target_contribution_id
            );
            currentUserPrompt = "Please continue.";
        } else {
            const stageContext: StageContext = { ...stageData, system_prompts, domain_specific_prompt_overlays: [] };
            gatheredInputs = await deps.promptAssembler.gatherInputsForStage(
                stageContext,
                project,
                sessionData,
                sessionData.iteration_count,
            );
            conversationHistory = gatheredInputs.map((input) => {
                if (input.type === 'contribution') {
                    return { role: 'assistant', content: input.content };
                } else {
                    return { role: 'user', content: input.content };
                }
            });

            const initialPromptResult = await getInitialPromptContent(
                dbClient,
                project,
                deps.logger,
                (_client, bucket, path) => deps.downloadFromStorage(bucket, path)
            );

            const directPrompt = typeof project.initial_user_prompt === 'string' ? project.initial_user_prompt.trim() : '';
            const loaderContent = (initialPromptResult && typeof initialPromptResult.content === 'string') ? initialPromptResult.content.trim() : '';
            const hasLoaderSource = !!(initialPromptResult && initialPromptResult.storagePath);

            if (directPrompt) {
                currentUserPrompt = directPrompt;
            } else if (hasLoaderSource && loaderContent) {
                currentUserPrompt = loaderContent;
            } else {
                throw new Error('Initial prompt is required to start this stage, but none was provided.');
            }
            // Render the prompt template using the resolved initial prompt and gathered context
            const dynamicContext = await deps.promptAssembler.gatherContext(
                project,
                sessionData,
                stageContext,
                currentUserPrompt,
                sessionData.iteration_count,
            );
            const renderedPrompt = deps.promptAssembler.render(
                stageContext,
                dynamicContext,
                project.user_domain_overlay_values ?? null,
            );
            const renderedTrimmed = (renderedPrompt || '').trim();
            if (!renderedTrimmed) {
                throw new Error('Rendered initial prompt is empty.');
            }
            currentUserPrompt = renderedTrimmed;
            console.log('currentUserPrompt', currentUserPrompt);
        }
        
        // Pass-through-only: include systemInstruction if an upstream value is provided in the future.
        const maybeSystemInstruction: string | undefined = undefined;

        const promptConstructionPayload: PromptConstructionPayload = {
            ...(maybeSystemInstruction !== undefined ? { systemInstruction: maybeSystemInstruction } : {}),
            conversationHistory,
            resourceDocuments,
            currentUserPrompt,
        };

        await deps.executeModelCallAndSave({
            dbClient,
            deps,
            authToken,
            job,
            projectOwnerUserId,
            providerDetails,
            sessionData,
            promptConstructionPayload,
            compressionStrategy: getSortedCompressionCandidates,
        });

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        
        if (e instanceof ContextWindowError) {
            deps.logger.error(`[dialectic-worker] [processSimpleJob] ContextWindowError for job ${jobId}: ${error.message}`);
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { message: `Context window limit exceeded: ${error.message}` },
            }).eq('id', jobId);
            // Emit internal failure event for UI state routing
            if (projectOwnerUserId) {
                await deps.notificationService.sendContributionGenerationFailedEvent({
                    type: 'other_generation_failed',
                    sessionId: sessionId,
                    job_id: jobId,
                    error: {
                        code: 'CONTEXT_WINDOW_ERROR',
                        message: `Context window limit exceeded, message too large to send to the model and it cannot be compressed further: ${error.message}`,
                    },
                }, projectOwnerUserId);

                // User-facing historical notification
                await deps.notificationService.sendContributionFailedNotification({
                    type: 'contribution_generation_failed',
                    sessionId: job.payload.sessionId ?? sessionId,
                    stageSlug: job.payload.stageSlug ?? 'unknown',
                    projectId: job.payload.projectId ?? '',
                    error: {
                        code: 'CONTEXT_WINDOW_ERROR',
                        message: `Context window limit exceeded, message too large to send to the model and it cannot be compressed further: ${error.message}`,
                    },
                    job_id: jobId,
                }, projectOwnerUserId);
            }
            return;
        }

        // Classify non-retryable failures (fail immediately, emit internal + user-facing notifications)
        const message = error.message || '';
        const lower = message.toLowerCase();

        const emitImmediateFailure = async (code: string, userMessage: string) => {
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { code, message: userMessage },
            }).eq('id', jobId);

            if (projectOwnerUserId) {
                // Internal event (UI state routing)
                await deps.notificationService.sendContributionGenerationFailedEvent({
                    type: 'other_generation_failed',
                    sessionId: sessionId,
                    job_id: jobId,
                    error: { code, message: userMessage },
                }, projectOwnerUserId);

                // User-facing historical notification
                await deps.notificationService.sendContributionFailedNotification({
                    type: 'contribution_generation_failed',
                    sessionId: job.payload.sessionId ?? 'unknown',
                    stageSlug: job.payload.stageSlug ?? 'unknown',
                    projectId: job.payload.projectId ?? '',
                    error: { code, message: userMessage },
                    job_id: jobId,
                }, projectOwnerUserId);
            }
        };

        // Affordability / NSF signals
        if (lower.includes('insufficient funds')) {
            await emitImmediateFailure('INSUFFICIENT_FUNDS', message);
            return;
        }

        // Wallet missing
        if (lower.includes('wallet is required')) {
            await emitImmediateFailure('WALLET_MISSING', message);
            return;
        }

        // Missing or invalid initial prompt signals
        if (lower.includes('initial prompt is required') || lower.includes('rendered initial prompt is empty')) {
            await emitImmediateFailure('INVALID_INITIAL_PROMPT', message);
            return;
        }

        // Continuation dependency missing
        if (lower.includes('failed to retrieve root contribution')) {
            await emitImmediateFailure('CONTINUATION_ROOT_MISSING', message);
            return;
        }

        // Missing core entities / config
        if (lower.includes('session ') && lower.includes(' not found')) {
            await emitImmediateFailure('SESSION_NOT_FOUND', message);
            return;
        }
        if (lower.startsWith('project ') && lower.includes(' not found')) {
            await emitImmediateFailure('PROJECT_NOT_FOUND', message);
            return;
        }
        if (lower.includes('project domain not found')) {
            await emitImmediateFailure('DOMAIN_NOT_FOUND', message);
            return;
        }
        if (lower.includes('could not retrieve stage details') || lower.includes('system prompt not found')) {
            await emitImmediateFailure('STAGE_CONFIG_MISSING', message);
            return;
        }

        // Dependency/configuration problems
        if (lower.includes('affordability preflight') || lower.includes('token wallet service is required')) {
            await emitImmediateFailure('INTERNAL_DEPENDENCY_MISSING', message);
            return;
        }
        if (lower.includes('promptassembler dependency is missing')) {
            await emitImmediateFailure('INTERNAL_DEPENDENCY_MISSING', message);
            return;
        }
        if (lower.includes("dependency 'counttokens' is not provided") ||
            lower.includes("dependency 'callunifiedaimodel' is not provided") ||
            lower.includes('required services for prompt compression')) {
            await emitImmediateFailure('INTERNAL_DEPENDENCY_MISSING', message);
            return;
        }
        if (lower.includes('could not fetch full provider details') ||
            lower.includes('failed to fetch valid provider details') ||
            lower.includes('has invalid or missing configuration')) {
            await emitImmediateFailure('PROVIDER_CONFIG_INVALID', message);
            return;
        }

        // Wallet/balance parsing issues
        if (lower.includes('could not parse wallet balance')) {
            await emitImmediateFailure('WALLET_BALANCE_INVALID', message);
            return;
        }

        // File save failures
        if (lower.includes('failed to save contribution')) {
            await emitImmediateFailure('SAVE_FAILED', message);
            return;
        }

        const failedAttempt: FailedAttemptError = {
            modelId: model_id,
            api_identifier: providerDetails?.api_identifier || 'unknown',
            error: error.message,
        };
        deps.logger.warn(`[dialectic-worker] [processSimpleJob] Attempt ${currentAttempt + 1} failed for model ${model_id}: ${failedAttempt.error}`);
        
        if (currentAttempt < max_retries) {
            await deps.retryJob({ logger: deps.logger, notificationService: deps.notificationService }, dbClient, job, currentAttempt + 1, [failedAttempt], projectOwnerUserId);
            return;
        }

        deps.logger.error(`[dialectic-worker] [processSimpleJob] Final attempt failed for job ${jobId}. Exhausted all ${max_retries + 1} retries.`);
        const modelProcessingResult: ModelProcessingResult = { modelId: model_id, status: 'failed', attempts: currentAttempt + 1, error: failedAttempt.error };
        
        const { error: finalUpdateError } = await dbClient
            .from('dialectic_generation_jobs')
            .update({
                status: 'retry_loop_failed',
                error_details: JSON.stringify({ finalError: failedAttempt, modelProcessingResult }),
                completed_at: new Date().toISOString(),
                attempt_count: currentAttempt + 1,
            })
            .eq('id', jobId);
        
        if (finalUpdateError) {
            deps.logger.error(`[dialectic-worker] [processSimpleJob] CRITICAL: Failed to mark job as 'retry_loop_failed'.`, { finalUpdateError });
        }
        
        if (projectOwnerUserId) {
            // User-facing notification (preserve existing behavior)
            await deps.notificationService.sendContributionFailedNotification({
                type: 'contribution_generation_failed',
                sessionId: job.payload.sessionId ?? 'unknown',
                stageSlug: job.payload.stageSlug ?? 'unknown',
                projectId: job.payload.projectId ?? '',
                error: {
                    code: 'RETRY_LOOP_FAILED',
                    message: `Generation for stage '${job.payload.stageSlug}' has failed after all retry attempts.`,
                },
                job_id: jobId,
            }, projectOwnerUserId);

            // Internal event for UI placeholder transition to failed
            await deps.notificationService.sendContributionGenerationFailedEvent({
                type: 'other_generation_failed',
                sessionId: sessionId,
                job_id: jobId,
                error: {
                    code: 'RETRY_LOOP_FAILED',
                    message: failedAttempt.error,
                },
            }, projectOwnerUserId);
        }
        return;
    }
}

