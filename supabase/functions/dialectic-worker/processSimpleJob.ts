import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  DialecticJobPayload,
  DialecticSession,
  SelectedAiProvider,
  SelectedModels,
  FailedAttemptError,
  ModelProcessingResult,
  Job,
  PromptConstructionPayload,
  SourceDocument,
} from '../dialectic-service/dialectic.interface.ts';
import { IJobContext } from './JobContext.interface.ts';
import { createExecuteJobContext } from './createJobContext.ts';
import { isSelectedAiProvider } from "../_shared/utils/type_guards.ts";
import { isRecord } from "../_shared/utils/type_guards.ts";
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { Messages } from '../_shared/types.ts';
import { StageContext, type AssemblePromptOptions } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import { DialecticRecipeStep } from '../dialectic-service/dialectic.interface.ts';
import { isDialecticRecipeTemplateStep, isDialecticStageRecipeStep } from '../_shared/utils/type-guards/type_guards.dialectic.recipe.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { getInitialPromptContent } from '../_shared/utils/project-initial-prompt.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';

export async function processSimpleJob(
    dbClient: SupabaseClient<Database>,
    job: Job & { payload: DialecticJobPayload },
    projectOwnerUserId: string,
    ctx: IJobContext,
    authToken: string,
) {
    const { id: jobId, attempt_count: currentAttempt, max_retries } = job;
    const {
        stageSlug,
        projectId,
        model_id,
        sessionId,
    } = job.payload;
    
    ctx.logger.info(`[dialectic-worker] [processSimpleJob] Starting attempt ${currentAttempt + 1}/${max_retries + 1} for job ID: ${jobId}`);
    let providerDetails: SelectedAiProvider | undefined;

    // Track document key and step for notifications where possible
    let notificationDocumentKey: FileType | undefined;
    let stepKeyForNotification: string | undefined;

    try {
        if (!stageSlug) throw new Error('stageSlug is required in the payload.');
        if (!projectId) throw new Error('projectId is required in the payload.');
        if (!sessionId) throw new Error('sessionId is required in the payload.');

        const { data: sessionData, error: sessionError } = await dbClient.from('dialectic_sessions').select('*').eq('id', sessionId).single();
        if (sessionError || !sessionData) throw new Error(`Session ${sessionId} not found.`);

        const ids = sessionData.selected_model_ids ?? [];
        const selected_models: SelectedModels[] = ids.map((id) => ({ id, displayName: id }));
        const sessionForExecute: DialecticSession = {
            id: sessionData.id,
            project_id: sessionData.project_id,
            session_description: sessionData.session_description,
            user_input_reference_url: sessionData.user_input_reference_url,
            iteration_count: sessionData.iteration_count,
            selected_models,
            status: sessionData.status,
            associated_chat_id: sessionData.associated_chat_id,
            current_stage_id: sessionData.current_stage_id,
            created_at: sessionData.created_at,
            updated_at: sessionData.updated_at,
        };

        const { data: providerData, error: providerError } = await dbClient.from('ai_providers').select('*').eq('id', model_id).single();
        if (providerError || !providerData || !isSelectedAiProvider(providerData)) {
            throw new Error(`Failed to fetch valid provider details for model ID ${model_id}.`);
        }
        providerDetails = providerData;

        if (currentAttempt === 0 && projectOwnerUserId) {
            await ctx.notificationService.sendDialecticContributionStartedEvent({
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
            .select('*, system_prompts(id, prompt_text)')
            .eq('slug', stageSlug)
            .single();

        if (stageError || !stageResult) {
            throw new Error(`Could not retrieve stage details for slug: ${stageSlug}`);
        }
        const { system_prompts, ...stageData } = stageResult;
        if (!system_prompts) {
            throw new Error(`System prompt not found for stage: ${stageData.id}`);
        }

        if (!ctx.promptAssembler) {
            throw new Error('PromptAssembler dependency is missing.');
        }

        const payloadUserJwt = job.payload.user_jwt;
        if (!payloadUserJwt) {
            throw new Error('payload.user_jwt required');
        }
        const payloadHasJwt = typeof payloadUserJwt === 'string' && payloadUserJwt.length > 0;
        ctx.logger.info('[processSimpleJob] DIAGNOSTIC: payload jwt presence', {
            jobId,
            hasJwtKey: payloadHasJwt,
            jwtLen: payloadUserJwt.length,
        });

        const conversationHistory: Messages[] = [];
        const resourceDocuments: SourceDocument[] = [];

        // Fetch domain-specific overlays for this stage's system prompt and selected domain
        const systemPromptId = system_prompts.id;
        if (!systemPromptId) {
            throw new Error('STAGE_CONFIG_MISSING_OVERLAYS');
        }
        const { data: overlayRows, error: overlayErr } = await dbClient
            .from('domain_specific_prompt_overlays')
            .select('overlay_values')
            .eq('system_prompt_id', systemPromptId)
            .eq('domain_id', project.selected_domain_id);

        if (overlayErr || !overlayRows || overlayRows.length === 0) {
            throw new Error('STAGE_CONFIG_MISSING_OVERLAYS');
        }

        // Resolve the correct recipe_step for this EXECUTE job
        let metadataUnknown: Record<string, unknown> | null = null;
        if (isRecord(job.payload) && 'planner_metadata' in job.payload) {
            const metadataCandidate = job.payload['planner_metadata'];
            if (isRecord(metadataCandidate)) {
                metadataUnknown = metadataCandidate;
            }
        }
        let recipeStepId: string | undefined;
        if (metadataUnknown && typeof metadataUnknown['recipe_step_id'] === 'string') {
            recipeStepId = metadataUnknown['recipe_step_id'];
        }
        let templateIdFromMetadata: string | undefined;
        if (metadataUnknown && typeof metadataUnknown['recipe_template_id'] === 'string') {
            templateIdFromMetadata = metadataUnknown['recipe_template_id'];
        }
        let stepSlugInPayload: string | undefined;
        if (isRecord(job.payload) && typeof job.payload['step_slug'] === 'string') {
            stepSlugInPayload = job.payload['step_slug'];
        }

        let resolvedRecipeStep: DialecticRecipeStep | null = null;
        if (typeof recipeStepId === 'string') {
            const { data: instanceStep, error: instanceErr } = await dbClient
                .from('dialectic_stage_recipe_steps')
                .select('*')
                .eq('id', recipeStepId)
                .single();
            if (!instanceErr && instanceStep && isDialecticStageRecipeStep(instanceStep)) {
                resolvedRecipeStep = instanceStep;
            }
            if (!resolvedRecipeStep) {
                const { data: templateStep, error: templateErr } = await dbClient
                    .from('dialectic_recipe_template_steps')
                    .select('*')
                    .eq('id', recipeStepId)
                    .single();
                if (!templateErr && templateStep && isDialecticRecipeTemplateStep(templateStep)) {
                    resolvedRecipeStep = templateStep;
                }
            }
        }

        if (!resolvedRecipeStep && typeof stepSlugInPayload === 'string') {
            if (stageData.active_recipe_instance_id) {
                const { data: bySlugInstance } = await dbClient
                    .from('dialectic_stage_recipe_steps')
                    .select('*')
                    .eq('instance_id', stageData.active_recipe_instance_id)
                    .eq('step_slug', stepSlugInPayload);
                let candidate: unknown = null;
                if (Array.isArray(bySlugInstance) && bySlugInstance.length > 0) {
                    candidate = bySlugInstance[0];
                }
                if (candidate && isDialecticStageRecipeStep(candidate)) {
                    resolvedRecipeStep = candidate;
                }
            }
            if (!resolvedRecipeStep) {
                const templateId = stageData.recipe_template_id || templateIdFromMetadata;
                if (templateId) {
                    const { data: bySlugTemplate } = await dbClient
                        .from('dialectic_recipe_template_steps')
                        .select('*')
                        .eq('template_id', templateId)
                        .eq('step_slug', stepSlugInPayload);
                    let candidate: unknown = null;
                    if (Array.isArray(bySlugTemplate) && bySlugTemplate.length > 0) {
                        candidate = bySlugTemplate[0];
                    }
                    if (candidate && isDialecticRecipeTemplateStep(candidate)) {
                        resolvedRecipeStep = candidate;
                    }
                }
            }
        }

        if (!resolvedRecipeStep) {
            throw new Error('RECIPE_STEP_RESOLUTION_FAILED');
        }

        // Track document key and step for notifications using the recipe step value exactly as provided
        notificationDocumentKey = resolvedRecipeStep.output_type;
        stepKeyForNotification = resolvedRecipeStep.step_slug;

        // Emit execute_started at EXECUTE job start
        if (currentAttempt === 0 && projectOwnerUserId) {
            await ctx.notificationService.sendJobNotificationEvent({
                type: 'execute_started',
                sessionId,
                stageSlug,
                job_id: jobId,
                document_key: notificationDocumentKey,
                modelId: providerDetails.id,
                iterationNumber: sessionData.iteration_count,
                step_key: resolvedRecipeStep.step_slug,
            }, projectOwnerUserId);
        }

        const stageContext: StageContext = {
            ...stageData,
            system_prompts,
            domain_specific_prompt_overlays: overlayRows.map((o) => ({ overlay_values: o.overlay_values})),
            recipe_step: resolvedRecipeStep,
        };

        // Determine projectInitialUserPrompt (required by assembler for non-continuation; safe to supply for continuation)
        const initialPromptResult = await getInitialPromptContent(
            dbClient,
            project,
            ctx.logger,
            (_client, bucket, path) => ctx.downloadFromStorage(_client, bucket, path)
        );
        let resolvedProjectInitialUserPrompt: string | undefined;
        if (typeof project.initial_user_prompt === 'string' && project.initial_user_prompt.length > 0) {
            resolvedProjectInitialUserPrompt = project.initial_user_prompt;
        } else if (
            initialPromptResult &&
            typeof initialPromptResult.content === 'string' &&
            initialPromptResult.content.length > 0 &&
            initialPromptResult.storagePath
        ) {
            resolvedProjectInitialUserPrompt = initialPromptResult.content;
        }
        if (!resolvedProjectInitialUserPrompt) {
            throw new Error('Initial prompt is required to start this stage, but none was provided.');
        }
        const projectInitialUserPrompt = resolvedProjectInitialUserPrompt;

        // Continuation-specific metadata
        let sourceContributionId: string | undefined;
        if (
            typeof job.payload.target_contribution_id === 'string' &&
            job.payload.target_contribution_id.length > 0
        ) {
            sourceContributionId = job.payload.target_contribution_id;
        }
        let continuationContent: string | undefined;
        if (sourceContributionId) {
            continuationContent = 'Please continue.';
        }

        // Assemble prompt using the unified facade
        const assembleOptions: AssemblePromptOptions = {
            project,
            session: sessionData,
            stage: stageContext,
            projectInitialUserPrompt,
            iterationNumber: sessionData.iteration_count,
            job,
        };
        if (continuationContent) {
            assembleOptions.continuationContent = continuationContent;
        }
        if (sourceContributionId) {
            assembleOptions.sourceContributionId = sourceContributionId;
        }
        const assembled = await ctx.promptAssembler.assemble(assembleOptions);
        
        const promptConstructionPayload: PromptConstructionPayload = {
            conversationHistory,
            resourceDocuments,
            currentUserPrompt: assembled.promptContent,
            source_prompt_resource_id: assembled.source_prompt_resource_id,
        };
        promptConstructionPayload.sourceContributionId = sourceContributionId;

        const executeCtx = createExecuteJobContext(ctx);
        await ctx.executeModelCallAndSave({
            dbClient,
            deps: executeCtx,
            authToken,
            job,
            projectOwnerUserId,
            providerDetails,
            sessionData: sessionForExecute,
            promptConstructionPayload,
            inputsRelevance: stageContext.recipe_step.inputs_relevance,
            inputsRequired: stageContext.recipe_step.inputs_required,
            compressionStrategy: getSortedCompressionCandidates,
        });

        if (projectOwnerUserId) {
            await ctx.notificationService.sendJobNotificationEvent({
                type: 'execute_completed',
                sessionId,
                stageSlug,
                job_id: jobId,
                step_key: resolvedRecipeStep.step_slug,
                modelId: providerDetails.id,
                iterationNumber: sessionData.iteration_count,
                document_key: notificationDocumentKey,
            }, projectOwnerUserId);
        }

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        
        if (e instanceof ContextWindowError) {
            ctx.logger.error(`[dialectic-worker] [processSimpleJob] ContextWindowError for job ${jobId}: ${error.message}`);
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { message: `Context window limit exceeded: ${error.message}` },
            }).eq('id', jobId);
            // Emit internal failure event for UI state routing
            if (projectOwnerUserId) {
                await ctx.notificationService.sendContributionGenerationFailedEvent({
                    type: 'other_generation_failed',
                    sessionId: sessionId,
                    job_id: jobId,
                    error: {
                        code: 'CONTEXT_WINDOW_ERROR',
                        message: `Context window limit exceeded, message too large to send to the model and it cannot be compressed further: ${error.message}`,
                    },
                }, projectOwnerUserId);

                // User-facing historical notification
                await ctx.notificationService.sendContributionFailedNotification({
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

                // Document-centric failure event
                if (notificationDocumentKey) {
                    await ctx.notificationService.sendJobNotificationEvent({
                        type: 'job_failed',
                        sessionId: String(sessionId),
                        stageSlug: String(stageSlug),
                        job_id: jobId,
                        step_key: stepKeyForNotification ?? 'unknown',
                        document_key: notificationDocumentKey,
                        modelId: model_id,
                        iterationNumber: job.iteration_number,
                        error: { code: 'CONTEXT_WINDOW_ERROR', message: error.message },
                    }, projectOwnerUserId);
                }
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
                await ctx.notificationService.sendContributionGenerationFailedEvent({
                    type: 'other_generation_failed',
                    sessionId: sessionId,
                    job_id: jobId,
                    error: { code, message: userMessage },
                }, projectOwnerUserId);

                // User-facing historical notification
                await ctx.notificationService.sendContributionFailedNotification({
                    type: 'contribution_generation_failed',
                    sessionId: job.payload.sessionId ?? 'unknown',
                    stageSlug: job.payload.stageSlug ?? 'unknown',
                    projectId: job.payload.projectId ?? '',
                    error: { code, message: userMessage },
                    job_id: jobId,
                }, projectOwnerUserId);

                // Document-centric failure event
                if (notificationDocumentKey) {
                    await ctx.notificationService.sendJobNotificationEvent({
                        type: 'job_failed',
                        sessionId: String(sessionId),
                        stageSlug: String(stageSlug),
                        job_id: jobId,
                        step_key: stepKeyForNotification ?? 'unknown',
                        document_key: notificationDocumentKey,
                        modelId: model_id,
                        iterationNumber: job.iteration_number,
                        error: { code, message: userMessage },
                    }, projectOwnerUserId);
                }
            }
        };

        // Auth missing on payload should fail immediately and surface to caller
        if (lower.includes('payload.user_jwt required')) {
            await emitImmediateFailure('AUTH_MISSING', message);
            throw error;
        }

        // Affordability / NSF signals
        if (lower.includes('insufficient funds')) {
            await emitImmediateFailure('INSUFFICIENT_FUNDS', message);
            throw error;
        }

        // Wallet missing
        if (lower.includes('wallet is required')) {
            await emitImmediateFailure('WALLET_MISSING', message);
            throw error;
        }

        // Missing or invalid initial prompt signals
        if (lower.includes('initial prompt is required') || lower.includes('rendered initial prompt is empty')) {
            await emitImmediateFailure('INVALID_INITIAL_PROMPT', message);
            throw error;
        }

        // Overlays missing for stage configuration
        if (lower.includes('stage_config_missing_overlays')) {
            await emitImmediateFailure('STAGE_CONFIG_MISSING_OVERLAYS', message);
            throw error;
        }

        // Continuation dependency missing
        if (lower.includes('failed to retrieve root contribution')) {
            await emitImmediateFailure('CONTINUATION_ROOT_MISSING', message);
            throw error;
        }

        // Missing core entities / config
        if (lower.includes('session ') && lower.includes(' not found')) {
            await emitImmediateFailure('SESSION_NOT_FOUND', message);
            throw error;
        }
        if (lower.startsWith('project ') && lower.includes(' not found')) {
            await emitImmediateFailure('PROJECT_NOT_FOUND', message);
            throw error;
        }
        if (lower.includes('project domain not found')) {
            await emitImmediateFailure('DOMAIN_NOT_FOUND', message);
            throw error;
        }
        if (lower.includes('could not retrieve stage details') || lower.includes('system prompt not found')) {
            await emitImmediateFailure('STAGE_CONFIG_MISSING', message);
            throw error;
        }

        // Dependency/configuration problems
        if (lower.includes('affordability preflight') || lower.includes('token wallet service is required')) {
            await emitImmediateFailure('INTERNAL_DEPENDENCY_MISSING', message);
            throw error;
        }
        if (lower.includes('promptassembler dependency is missing')) {
            await emitImmediateFailure('INTERNAL_DEPENDENCY_MISSING', message);
            throw error;
        }
        if (lower.includes("dependency 'counttokens' is not provided") ||
            lower.includes("dependency 'callunifiedaimodel' is not provided") ||
            lower.includes('required services for prompt compression')) {
            await emitImmediateFailure('INTERNAL_DEPENDENCY_MISSING', message);
            throw error;
        }
        if (lower.includes('could not fetch full provider details') ||
            lower.includes('failed to fetch valid provider details') ||
            lower.includes('has invalid or missing configuration')) {
            await emitImmediateFailure('PROVIDER_CONFIG_INVALID', message);
            throw error;
        }

        // Wallet/balance parsing issues
        if (lower.includes('could not parse wallet balance')) {
            await emitImmediateFailure('WALLET_BALANCE_INVALID', message);
            throw error;
        }

        // File save failures
        if (lower.includes('failed to save contribution')) {
            await emitImmediateFailure('SAVE_FAILED', message);
            throw error;
        }

        const failedAttempt: FailedAttemptError = {
            modelId: model_id,
            api_identifier: providerDetails?.api_identifier || 'unknown',
            error: error.message,
        };
        ctx.logger.warn(`[dialectic-worker] [processSimpleJob] Attempt ${currentAttempt + 1} failed for model ${model_id}: ${failedAttempt.error}`);
        
        if (currentAttempt < max_retries) {
            await ctx.retryJob({ logger: ctx.logger, notificationService: ctx.notificationService }, dbClient, job, currentAttempt + 1, [failedAttempt], projectOwnerUserId);
            return;
        }

        ctx.logger.error(`[dialectic-worker] [processSimpleJob] Final attempt failed for job ${jobId}. Exhausted all ${max_retries + 1} retries.`);
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
            ctx.logger.error(`[dialectic-worker] [processSimpleJob] CRITICAL: Failed to mark job as 'retry_loop_failed'.`, { finalUpdateError });
        }
        
        if (projectOwnerUserId) {
            // User-facing notification (preserve existing behavior)
            await ctx.notificationService.sendContributionFailedNotification({
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
            await ctx.notificationService.sendContributionGenerationFailedEvent({
                type: 'other_generation_failed',
                sessionId: sessionId,
                job_id: jobId,
                error: {
                    code: 'RETRY_LOOP_FAILED',
                    message: failedAttempt.error,
                },
            }, projectOwnerUserId);

            // Document-centric failure event on terminal failure
            if (notificationDocumentKey) {
                await ctx.notificationService.sendJobNotificationEvent({
                    type: 'job_failed',
                    sessionId: String(sessionId),
                    stageSlug: String(stageSlug),
                    job_id: jobId,
                    step_key: stepKeyForNotification ?? 'unknown',
                    document_key: notificationDocumentKey,
                    modelId: model_id,
                    iterationNumber: job.iteration_number,
                    error: { code: 'RETRY_LOOP_FAILED', message: failedAttempt.error },
                }, projectOwnerUserId);
            }
        }
        return;
    }
}



