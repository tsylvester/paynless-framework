import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
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
    job: Job,
    payload: DialecticJobPayload,
    projectOwnerUserId: string,
    deps: ProcessSimpleJobDeps,
    authToken: string,
) {
    const { id: jobId, attempt_count: initialAttemptCount } = job;
    const { 
        iterationNumber = 1, 
        stageSlug, 
        projectId, 
        model_id,
        sessionId,
        walletId,
        continueUntilComplete,
    } = payload;
    
    deps.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}`);

    let modelProcessingResult: ModelProcessingResult | undefined;

    try {
        if (!stageSlug) throw new Error('stageSlug is required in the payload.');
        if (!projectId) throw new Error('projectId is required in the payload.');

        const { data: sessionData, error: sessionError } = await dbClient.from('dialectic_sessions').select('*').eq('id', sessionId).single();
        if (sessionError || !sessionData) throw new Error(`Session ${sessionId} not found.`);

        const renderedPrompt = await deps.getSeedPromptForStage(
          dbClient, projectId, sessionId, stageSlug, iterationNumber, deps.downloadFromStorage
        );

        let providerDetails: SelectedAiProvider | undefined;
        
        for (let attempt = 1; attempt <= job.max_retries + 1; attempt++) {
            try {
                deps.logger.info(`[dialectic-worker] [processSimpleJob] Processing model ${model_id}, attempt ${attempt}.`);

                const { data: providerData, error: providerError } = await dbClient.from('ai_providers').select('*').eq('id', model_id).single();
                if (providerError || !providerData || !isSelectedAiProvider(providerData)) {
                    throw new Error(`Failed to fetch valid provider details for model ID ${model_id}.`);
                }
                providerDetails = providerData;

                if (attempt === 1 && projectOwnerUserId) {
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId, notification_type: 'dialectic_contribution_started',
                        notification_data: { sessionId, stageSlug, model_id: providerDetails.id },
                    });
                }
                
                let previousContent = '';
                if (payload.target_contribution_id) {
                     const { data: prevContribution, error: prevContribError } = await dbClient
                      .from('dialectic_contributions').select('storage_path, storage_bucket, file_name').eq('id', payload.target_contribution_id).single();
                    if (prevContribError || !prevContribution) throw new Error(`Failed to find previous contribution record ${payload.target_contribution_id}.`);
                    
                    const { data: downloadedData, error: downloadError } = await deps.downloadFromStorage(dbClient, prevContribution.storage_bucket!, `${prevContribution.storage_path!}/${prevContribution.file_name!}`);
                    if (downloadError || !downloadedData) throw new Error(`Failed to download previous content.`);
                    previousContent = new TextDecoder().decode(downloadedData);
                }
                
                const options = {
                    walletId: walletId,
                };

                const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
                    providerDetails.api_identifier, previousContent || renderedPrompt.content, sessionData.associated_chat_id, authToken, options, continueUntilComplete
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
                        target_contribution_id: payload.target_contribution_id,
                    },
                };
           
                const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

                deps.logger.info(`[dialectic-worker] [processSimpleJob] Received record from fileManager: ${JSON.stringify(savedResult.record, null, 2)}`);

                if (savedResult.error || !isDialecticContribution(savedResult.record)) {
                    throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
                }

                const contribution = savedResult.record;
                const continueResult = await deps.continueJob({ logger: deps.logger }, dbClient, job, payload, aiResponse, contribution, projectOwnerUserId);
                
                if (projectOwnerUserId) {
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId, notification_type: 'dialectic_contribution_received',
                        notification_data: { contribution: { id: contribution.id, session_id: contribution.session_id, stage: contribution.stage, model_name: contribution.model_name, file_name: contribution.file_name, contribution_type: contribution.contribution_type }, is_continuing: continueResult.enqueued, },
                    });
                }

                modelProcessingResult = { modelId: model_id, status: continueResult.enqueued ? 'needs_continuation' : 'completed', attempts: attempt, contributionId: contribution.id };
                break; // Success, exit this model's processing loop.

            } catch (e) {
                const error: FailedAttemptError = {
                    modelId: model_id,
                    api_identifier: providerDetails?.api_identifier || 'unknown',
                    error: e instanceof Error ? e.message : String(e),
                };
                deps.logger.warn(`[dialectic-worker] [processSimpleJob] Attempt ${attempt} failed for model ${model_id}: ${error.error}`);
                
                if (attempt <= job.max_retries) {
                    await deps.retryJob({ logger: deps.logger }, dbClient, job, attempt, [error], projectOwnerUserId);
                } else {
                    modelProcessingResult = { modelId: model_id, status: 'failed', attempts: attempt, error: error.error };
                    break; // Failed all retries, exit loop.
                }
            }
        }
        
        // If a job spawns a continuation, its own status is 'completed'. The 'needs_continuation' state is tracked in the results.
        const finalStatus = modelProcessingResult?.status === 'needs_continuation' ? 'completed' : (modelProcessingResult?.status || 'failed');
        deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} finished. Results: ${JSON.stringify(modelProcessingResult)}. Final Status: ${finalStatus}`);
        
        // Final update to the job with results
        const { error: updateError } = await dbClient.from('dialectic_generation_jobs').update({
            status: finalStatus,
            results: JSON.stringify({ modelProcessingResult }),
            completed_at: new Date().toISOString(),
            attempt_count: initialAttemptCount + 1,
        }).eq('id', jobId);

        if (updateError) {
            deps.logger.error(`[dialectic-worker] [processJob] CRITICAL: Failed to update job ${jobId} with final results.`, { error: updateError });
        }

        // Send final notifications based on outcome
        if (projectOwnerUserId && modelProcessingResult) {
            const isSuccess = modelProcessingResult.status === 'completed' || modelProcessingResult.status === 'needs_continuation';
            const isFailure = modelProcessingResult.status === 'failed';

            await dbClient.rpc('create_notification_for_user', {
                target_user_id: projectOwnerUserId,
                notification_type: isFailure ? 'contribution_generation_failed' : 'contribution_generation_complete',
                notification_data: {
                    message: `Generation for stage '${stageSlug}' has finished.`,
                    sessionId: sessionId,
                    stageSlug: stageSlug,
                    successful_contributions: isSuccess && modelProcessingResult.contributionId ? [modelProcessingResult.contributionId] : [],
                    failed_contributions: isFailure ? [model_id] : [],
                },
            });
        }

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        deps.logger.error(`[dialectic-worker] [processJob] Unrecoverable error in job ${jobId}.`, { error: error.message, stack: error.stack });
        
        try {
            const { error: finalUpdateError } = await dbClient
                .from('dialectic_generation_jobs')
                .update({
                    status: 'failed',
                    error_details: JSON.stringify({ unrecoverableError: error.message, modelProcessingResult }),
                    completed_at: new Date().toISOString(),
                })
                .eq('id', jobId);

            if (finalUpdateError) {
                throw new Error(`Primary error: ${error.message}. Additionally, failed to mark job as 'failed': ${finalUpdateError.message}`);
            }
        } catch (finalError) {
            const final = finalError instanceof Error ? finalError : new Error(String(finalError));
            deps.logger.error(`[dialectic-worker] [processJob] CRITICAL: Failed to mark job ${jobId} as 'failed' in the database after another error.`, { finalError: final.message, finalStack: final.stack });
        }
    }
}

