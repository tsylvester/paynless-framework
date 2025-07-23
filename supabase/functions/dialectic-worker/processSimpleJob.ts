import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { type Logger } from '../_shared/logger.ts';
import { type Database } from '../types_db.ts';
import {
  type DialecticJobPayload,
  type SelectedAiProvider,
  type FailedAttemptError,
  type UnifiedAIResponse,
  type ProcessSimpleJobDeps,
  type ModelProcessingResult,
  type Job,
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext } from '../_shared/types/file_manager.types.ts';
import { isDialecticContribution, isSelectedAiProvider } from "../_shared/utils/type_guards.ts";

export async function processSimpleJob(
    dbClient: SupabaseClient<Database>,
    job: Job & { payload: DialecticJobPayload },
    projectOwnerUserId: string,
    deps: ProcessSimpleJobDeps,
    authToken: string,
) {
    const { id: jobId, attempt_count: currentAttempt, max_retries } = job;
    const { 
        iterationNumber = 1, 
        stageSlug, 
        projectId, 
        model_id,
        sessionId,
        walletId,
        continueUntilComplete,
    } = job.payload;
    
    deps.logger.info(`[dialectic-worker] [processSimpleJob] Starting attempt ${currentAttempt + 1}/${max_retries + 1} for job ID: ${jobId}`);
    let providerDetails: SelectedAiProvider | undefined;

    try {
        if (!stageSlug) throw new Error('stageSlug is required in the payload.');
        if (!projectId) throw new Error('projectId is required in the payload.');

        const { data: sessionData, error: sessionError } = await dbClient.from('dialectic_sessions').select('*').eq('id', sessionId).single();
        if (sessionError || !sessionData) throw new Error(`Session ${sessionId} not found.`);

        const renderedPrompt = await deps.getSeedPromptForStage(
          dbClient, projectId, sessionId, stageSlug, iterationNumber, deps.downloadFromStorage
        );
        
        const { data: providerData, error: providerError } = await dbClient.from('ai_providers').select('*').eq('id', model_id).single();
        if (providerError || !providerData || !isSelectedAiProvider(providerData)) {
            throw new Error(`Failed to fetch valid provider details for model ID ${model_id}.`);
        }
        providerDetails = providerData;

        if (currentAttempt === 0 && projectOwnerUserId) {
            await dbClient.rpc('create_notification_for_user', {
                target_user_id: projectOwnerUserId, notification_type: 'dialectic_contribution_started',
                notification_data: { sessionId, stageSlug, model_id: providerDetails.id },
            });
        }
        
        let previousContent = '';
        if (job.payload.target_contribution_id) {
             const { data: prevContribution, error: prevContribError } = await dbClient
              .from('dialectic_contributions').select('storage_path, storage_bucket, file_name').eq('id', job.payload.target_contribution_id).single();
            if (prevContribError || !prevContribution) throw new Error(`Failed to find previous contribution record ${job.payload.target_contribution_id}.`);
            
            if (!prevContribution || !prevContribution.storage_path) {
                throw new Error(`Previous contribution ${job.payload.target_contribution_id} not found or has no storage path.`);
            }

            const downloadPath = `${prevContribution.storage_path}/${prevContribution.file_name}`;
            
            const { data: downloadedData, error: downloadError } = await deps.downloadFromStorage(prevContribution.storage_bucket, downloadPath);
            
            if (downloadError) {
                throw new Error('Failed to download previous content.', { cause: downloadError });
            }

            if (!downloadedData) {
                throw new Error('Downloaded previous content is empty.');
            }

            previousContent = new TextDecoder().decode(downloadedData);
        }
        
        const options = {
            walletId: walletId,
        };

        const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
            providerDetails.id, previousContent || renderedPrompt.content, sessionData.associated_chat_id, authToken, options
        );
  
        if (aiResponse.error || !aiResponse.content) {
            throw new Error(aiResponse.error || 'AI response was empty.');
        }

        const finalContent = previousContent + aiResponse.content;
        const uploadContext: UploadContext = {
            pathContext: {
                projectId, fileType: 'model_contribution_main', sessionId, iteration: iterationNumber,
                stageSlug, modelSlug: providerDetails.api_identifier,
                originalFileName: `${providerDetails.api_identifier}_${stageSlug}${deps.getExtensionFromMimeType(aiResponse.contentType || "text/markdown")}`,
            },
            fileContent: finalContent, mimeType: aiResponse.contentType || "text/markdown",
            sizeBytes: finalContent.length, userId: projectOwnerUserId,
            description: `Contribution for stage '${stageSlug}' by model ${providerDetails.name}`,
            contributionMetadata: {
                sessionId, modelIdUsed: providerDetails.id, modelNameDisplay: providerDetails.name,
                stageSlug, iterationNumber, rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
                tokensUsedInput: aiResponse.inputTokens, tokensUsedOutput: aiResponse.outputTokens,
                processingTimeMs: aiResponse.processingTimeMs, seedPromptStoragePath: renderedPrompt.fullPath,
                target_contribution_id: job.payload.target_contribution_id,
            },
        };
   
        const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

        deps.logger.info(`[dialectic-worker] [processSimpleJob] Received record from fileManager: ${JSON.stringify(savedResult.record, null, 2)}`);

        if (savedResult.error || !isDialecticContribution(savedResult.record)) {
            throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
        }

        const contribution = savedResult.record;
        
        // First, determine if a continuation is needed based on the AI response.
        const needsContinuation = job.payload.continueUntilComplete && (aiResponse.finish_reason === 'length');

        // Then, mark the current job as completed. Its task is done.
        const modelProcessingResult: ModelProcessingResult = { 
            modelId: model_id, 
            status: needsContinuation ? 'needs_continuation' : 'completed', 
            attempts: currentAttempt + 1, 
            contributionId: contribution.id 
        };

        const { error: finalUpdateError } = await dbClient
            .from('dialectic_generation_jobs')
            .update({
                status: 'completed', // This job's task is done, so it is always marked 'completed'.
                results: JSON.stringify({ modelProcessingResult }),
                completed_at: new Date().toISOString(),
                attempt_count: currentAttempt + 1,
            })
            .eq('id', jobId);
        
        if (finalUpdateError) {
            // Log a critical error but proceed to notification and continuation logic,
            // as the core AI work was successful.
            deps.logger.error(`[dialectic-worker] [processSimpleJob] CRITICAL: Failed to mark job as 'completed'.`, { finalUpdateError });
        }
        
        // Now, after the current job is finalized, enqueue the next one if needed.
        if (needsContinuation) {
            await deps.continueJob({ logger: deps.logger }, dbClient, job, aiResponse, contribution, projectOwnerUserId);
        }

        if (projectOwnerUserId) {
            await dbClient.rpc('create_notification_for_user', {
                target_user_id: projectOwnerUserId, notification_type: 'dialectic_contribution_received',
                notification_data: { contribution: { id: contribution.id, session_id: contribution.session_id, stage: contribution.stage, model_name: contribution.model_name, file_name: contribution.file_name, contribution_type: contribution.contribution_type }, is_continuing: needsContinuation },
            });
        }

        deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} finished successfully. Results: ${JSON.stringify(modelProcessingResult)}. Final Status: completed`);

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        const failedAttempt: FailedAttemptError = {
            modelId: model_id,
            api_identifier: providerDetails?.api_identifier || 'unknown',
            error: error.message,
        };
        deps.logger.warn(`[dialectic-worker] [processSimpleJob] Attempt ${currentAttempt + 1} failed for model ${model_id}: ${failedAttempt.error}`);
        
        if (currentAttempt < max_retries) {
            await deps.retryJob({ logger: deps.logger }, dbClient, job, currentAttempt + 1, [failedAttempt], projectOwnerUserId);
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
            await dbClient.rpc('create_notification_for_user', {
                target_user_id: projectOwnerUserId,
                notification_type: 'contribution_generation_failed',
                notification_data: {
                    message: `Generation for stage '${stageSlug}' has failed after all retry attempts.`,
                    sessionId: sessionId,
                    stageSlug: stageSlug,
                    successful_contributions: [],
                    failed_contributions: [model_id],
                },
            });
        }
        return;
    }
}

