import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import {
  type GenerateContributionsDeps,
  type GenerateContributionsPayload,
  type SelectedAiProvider,
  type FailedAttemptError,
  type DialecticContributionRow,
  type UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext } from '../_shared/types/file_manager.types.ts';
import { getSeedPromptForStage } from '../_shared/utils/dialectic_utils.ts';
import { continueJob } from './continueJob.ts';
import { retryJob } from './retryJob.ts';
import { isDialecticContribution, isSelectedAiProvider, validatePayload } from "../_shared/utils/type_guards.ts";

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export async function processSimpleJob(
    dbClient: SupabaseClient<Database>,
    job: Job,
    payload: GenerateContributionsPayload,
    projectOwnerUserId: string,
    deps: GenerateContributionsDeps,
    authToken: string,
) {
    const { id: jobId } = job;

    const { 
        iterationNumber = 1, 
        stageSlug, 
        projectId, 
        selectedModelIds,
        sessionId,
    } = payload;
    
    deps.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}`);

    const successfulContributions: DialecticContributionRow[] = [];
    const failedContributionAttempts: FailedAttemptError[] = [];
    let continuationEnqueued = false;

    try {
        if (!stageSlug) throw new Error('stageSlug is required in the payload.');
        if (!projectId) throw new Error('projectId is required in the payload.');

        // This is now redundant as it's fetched for strategy routing
        // const { data: stage, error: stageError } = await dbClient.from('dialectic_stages').select('*').eq('slug', stageSlug).single();
        // if (stageError || !stage) throw new Error(`Stage with slug '${stageSlug}' not found.`);

        const { data: sessionData, error: sessionError } = await dbClient.from('dialectic_sessions').select('*').eq('id', sessionId).single();
        if (sessionError || !sessionData) throw new Error(`Session ${sessionId} not found.`);

        const renderedPrompt = await getSeedPromptForStage(
          dbClient,
          projectId,
          sessionId,
          stageSlug,
          iterationNumber,
          deps.downloadFromStorage
        );

        let modelsToProcess = selectedModelIds || [];
        let currentAttempt = 0;

        for (currentAttempt = 0; currentAttempt <= job.max_retries && modelsToProcess.length > 0; currentAttempt++) {
            deps.logger.info(`[dialectic-worker] [processJob] Attempt ${currentAttempt + 1} for job ID: ${jobId}`);
            
            if (currentAttempt > 0) {
                const retryResult = await retryJob(
                    { logger: deps.logger },
                    dbClient,
                    job,
                    currentAttempt,
                    failedContributionAttempts,
                    projectOwnerUserId
                );

                if (retryResult.error) {
                    // If even updating the retry status fails, we have a bigger problem.
                    // Throw the error to be caught by the main catch block and fail the job.
                    throw retryResult.error;
                }
            }

            const currentAttemptFailedModels: FailedAttemptError[] = [];
            
            const modelPromises = modelsToProcess.map(async (modelCatalogId: string) => {
              let providerDetails: SelectedAiProvider;
              try {
                const { data: providerData, error: providerError } = await dbClient.from('ai_providers').select('*').eq('id', modelCatalogId).single();
                if (providerError || !providerData) throw new Error(`Failed to fetch provider details for model ID ${modelCatalogId}.`);
                
                if (!isSelectedAiProvider(providerData)) {
                  throw new Error(`Fetched provider data for model ID ${modelCatalogId} does not match expected structure.`);
                }
                providerDetails = providerData;

                // Send started notification for every model we begin processing
                if (projectOwnerUserId) {
                  await dbClient.rpc('create_notification_for_user', {
                    target_user_id: projectOwnerUserId,
                    notification_type: 'dialectic_contribution_started',
                    notification_data: {
                      sessionId,
                      stageSlug,
                      model_id: providerDetails.id,
                    },
                  });
                }

              } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                currentAttemptFailedModels.push({ modelId: modelCatalogId, error: error.message, api_identifier: 'unknown' });
                return;
              }
              
              // --- Start of Continuation Handling Logic ---
              let previousContent = '';
              if (payload.target_contribution_id) {
                try {
                  deps.logger.info(`[dialectic-worker] [processJob] This is a continuation job. Fetching previous content for contribution ${payload.target_contribution_id}.`);
                  const { data: prevContribution, error: prevContribError } = await dbClient
                    .from('dialectic_contributions')
                    .select('storage_path, storage_bucket, file_name')
                    .eq('id', payload.target_contribution_id)
                    .single();

                  if (prevContribError || !prevContribution) {
                    throw new Error(`Failed to find previous contribution record ${payload.target_contribution_id}: ${prevContribError?.message || 'Not found'}`);
                  }
                  
                  const { data: downloadedData, error: downloadError } = await deps.downloadFromStorage(
                    dbClient,
                    prevContribution.storage_bucket,
                    prevContribution.storage_path && prevContribution.file_name ? `${prevContribution.storage_path}/${prevContribution.file_name}` : ''
                  );

                  if (downloadError || !downloadedData) {
                    throw new Error(`Failed to download previous content: ${downloadError?.message || 'No data'}`);
                  }
                  
                  previousContent = new TextDecoder().decode(downloadedData);

                } catch(e) {
                   const error = e instanceof Error ? e : new Error(String(e));
                   deps.logger.error(`[dialectic-worker] [processJob] Failed to process continuation for job ${jobId}.`, { error });
                   currentAttemptFailedModels.push({ modelId: modelCatalogId, api_identifier: providerDetails.api_identifier, error: `Failed to retrieve previous content for continuation: ${error.message}` });
                   return;
                }
              }
              // --- End of Continuation Handling Logic ---
              
              const fullPrompt = previousContent || renderedPrompt.content;
              
              const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
                providerDetails.api_identifier, 
                fullPrompt, 
                sessionData.associated_chat_id ?? undefined, 
                authToken, 
                undefined, 
                false
              );
        
              if (aiResponse.error || !aiResponse.content) {
                currentAttemptFailedModels.push({ 
                    modelId: modelCatalogId, 
                    api_identifier: providerDetails.api_identifier, 
                    error: `AI response error: ${aiResponse.error || 'Unknown error'}`, 
                    code: aiResponse.errorCode ?? undefined,
                    inputTokens: aiResponse.inputTokens,
                    outputTokens: aiResponse.outputTokens,
                    processingTimeMs: aiResponse.processingTimeMs,
                });
                return;
              }

              const finalContent = previousContent + (aiResponse.content || '');
              const determinedContentType = aiResponse.contentType || "text/markdown";

              const uploadContext: UploadContext = {
                  pathContext: {
                      projectId: projectId,
                      fileType: 'model_contribution_main',
                      sessionId: sessionId,
                      iteration: iterationNumber,
                      stageSlug: stageSlug,
                      modelSlug: providerDetails.api_identifier,
                      originalFileName: `${providerDetails.api_identifier}_${stageSlug}${deps.getExtensionFromMimeType(determinedContentType)}`,
                  },
                  fileContent: finalContent,
                  mimeType: determinedContentType,
                  sizeBytes: finalContent.length,
                  userId: projectOwnerUserId,
                  description: `Contribution for stage '${stageSlug}' by model ${providerDetails.name}`,
                  contributionMetadata: {
                      sessionId: sessionId,
                      modelIdUsed: providerDetails.id,
                      modelNameDisplay: providerDetails.name,
                      stageSlug: stageSlug,
                      iterationNumber: iterationNumber,
                      rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
                      tokensUsedInput: aiResponse.inputTokens,
                      tokensUsedOutput: aiResponse.outputTokens,
                      processingTimeMs: aiResponse.processingTimeMs,
                      seedPromptStoragePath: renderedPrompt.fullPath,
                      target_contribution_id: payload.target_contribution_id,
                  },
              };
         
               const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

              if (savedResult.error) {
                currentAttemptFailedModels.push({ modelId: modelCatalogId, api_identifier: providerDetails.api_identifier, error: `Failed to save contribution: ${savedResult.error.message}` });
                return;
              } else if (isDialecticContribution(savedResult.record)) {
                // The record has been safely validated by the type guard.
                successfulContributions.push(savedResult.record);

                // --- Continuation Logic ---
                // Replace the inline logic with a call to the dedicated continueJob function.
                const continueResult = await continueJob(
                    { logger: deps.logger },
                    dbClient,
                    job,
                    payload,
                    aiResponse,
                    savedResult.record,
                    projectOwnerUserId
                );

                // The original notification logic is preserved, but now it uses the result from continueJob.
                if (projectOwnerUserId) {
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId,
                        notification_type: 'dialectic_contribution_received',
                        notification_data: { 
                            contribution: { 
                                id: savedResult.record.id,
                                session_id: savedResult.record.session_id,
                                stage: savedResult.record.stage,
                                model_name: savedResult.record.model_name,
                                file_name: savedResult.record.file_name,
                                contribution_type: savedResult.record.contribution_type
                            },
                            is_continuing: continueResult.enqueued,
                        },
                    });
                }

                // Handle the outcome of the continuation attempt.
                if (continueResult.enqueued) {
                    continuationEnqueued = true;
                    deps.logger.info(`[dialectic-worker] [processJob] Successfully enqueued continuation job for contribution ${savedResult.record.id}.`);
                } else if (continueResult.error) {
                    // If enqueuing failed, log it as a failure for this model's attempt.
                    deps.logger.error(`[dialectic-worker] [processJob] Failed to enqueue continuation job.`, { error: continueResult.error });
                    currentAttemptFailedModels.push({ 
                        modelId: modelCatalogId, 
                        api_identifier: providerDetails.api_identifier, 
                        error: continueResult.error.message 
                    });
                }
                // --- End Continuation Logic ---

              } else {
                // This case handles when the record is null or not a valid DialecticContribution.
                currentAttemptFailedModels.push({
                  modelId: modelCatalogId,
                  api_identifier: providerDetails.api_identifier,
                  error: 'Failed to save contribution: The record returned from storage was invalid or null.',
                });
                return;
              }
            });
        
            await Promise.allSettled(modelPromises);

            if (currentAttemptFailedModels.length > 0) {
                failedContributionAttempts.push(...currentAttemptFailedModels);
                modelsToProcess = currentAttemptFailedModels.map(f => f.modelId);
                if (currentAttempt >= job.max_retries) {
                    deps.logger.error(`[dialectic-worker] [processJob] Job ${jobId} failed after exhausting all ${job.max_retries} retries.`);
                }
            } else {
                // All models in this attempt succeeded, so we can exit the loop.
                modelsToProcess = [];
                // If a continuation was created, we stop processing this job here.
                if (continuationEnqueued) {
                    deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} has enqueued a continuation. Completing current job without sending final notification.`);
                    
                    try {
                        const { error } = await dbClient.from('dialectic_generation_jobs').update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            results: {
                                successfulContributions: successfulContributions.map(c => ({ ...c })),
                                status_reason: 'Job completed by dispatching a continuation job.'
                            },
                        }).eq('id', jobId);

                        if (error) {
                            deps.logger.error(`[dialectic-worker] [processJob] FATAL: Failed to update job status to completed for job ${jobId}.`, { error });
                        }
                    } catch (updateError) {
                        deps.logger.error(`[dialectic-worker] [processJob] FATAL: Failed to update job status to 'completed' for continuation job ${jobId}.`, { error: updateError });
                    }
                    return; // Exit completely.
                }
            }
        }
        
        // --- Final Result Processing ---
        const successfulModelIds = new Set(successfulContributions.map(c => c.model_id));
        const finalFailedModels = selectedModelIds.filter(id => !successfulModelIds.has(id));

        // Find the last recorded error for each model that ultimately failed.
        const finalFailedAttempts: FailedAttemptError[] = finalFailedModels.map(failedId => {
            return failedContributionAttempts.slice().reverse().find(a => a.modelId === failedId)
                || { modelId: failedId, error: 'Model failed to produce a contribution after all retries.', api_identifier: 'unknown' };
        });
    
        if (finalFailedAttempts.length === 0) {
            const resultsJson: Json = {
              successfulContributions: successfulContributions.map(c => ({ ...c })),
              failedAttempts: [], // No final failures
            };
        
            try {
                const { error } = await dbClient.from('dialectic_generation_jobs').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    results: resultsJson,
                    attempt_count: currentAttempt,
                  }).eq('id', jobId);
            
                if (error) {
                    deps.logger.error(`[dialectic-worker] [processJob] FATAL: Failed to update job status to completed for job ${jobId}.`, { error });
                    throw error;
                }

                if (projectOwnerUserId) {
                    const notificationTitle = `Contribution Generation Complete`;
                    const notificationMessage = `We've finished generating contributions for stage: ${stageSlug}.`;
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId,
                        notification_type: 'contribution_generation_complete',
                        notification_data: { 
                            title: notificationTitle,
                            message: notificationMessage,
                            sessionId: sessionId,
                            stageSlug: stageSlug,
                            finalStatus: `${stageSlug}_generation_complete`,
                            successful_contributions: successfulContributions.map(c => c.id),
                            failed_contributions: [],
                        },
                    });
                }
            } catch (updateError) {
                // Don't log here as it will be caught and logged by the outer exception handler
                throw updateError;
            }
        } else {
            const errorDetails = {
                final_error: `Job failed for ${finalFailedAttempts.length} model(s) after exhausting all ${job.max_retries} retries.`,
                failedAttempts: finalFailedAttempts.map(e => ({...e})),
                successfulContributions: successfulContributions.map(c => ({...c})),
            };
            const { error } = await dbClient.from('dialectic_generation_jobs').update({
                status: 'retry_loop_failed',
                completed_at: new Date().toISOString(),
                error_details: errorDetails,
                attempt_count: currentAttempt + 1,
            }).eq('id', jobId);

            if (error) {
                deps.logger.error(`[dialectic-worker] [processJob] FATAL: Failed to update job status to retry_loop_failed for job ${jobId}.`, { error });
            }

            if (projectOwnerUserId) {
                const notificationTitle = `Contribution Generation Issues`;
                let notificationMessage = `Generation for stage '${stageSlug}' finished with ${finalFailedAttempts.length} error(s). Click to review.`;
                if (successfulContributions.length === 0) {
                    notificationMessage = `Generation for stage '${stageSlug}' failed for all models. Please review the errors and try again.`;
                }

                // Send failure notification for the failed models
                await dbClient.rpc('create_notification_for_user', {
                    target_user_id: projectOwnerUserId,
                    notification_type: 'contribution_generation_failed',
                    notification_data: { 
                        title: notificationTitle,
                        message: notificationMessage,
                        sessionId: sessionId, 
                        stageSlug: stageSlug, 
                        error: errorDetails,
                        successful_contributions: successfulContributions.map(c => c.id),
                        failed_contributions: finalFailedAttempts.map(f => f.modelId),
                    },
                });

                // For partial failures (some succeeded), also send completion notification
                if (successfulContributions.length > 0) {
                    const completionTitle = `Contribution Generation Complete`;
                    const completionMessage = `We've finished generating contributions for stage: ${stageSlug}.`;
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId,
                        notification_type: 'contribution_generation_complete',
                        notification_data: { 
                            title: completionTitle,
                            message: completionMessage,
                            sessionId: sessionId,
                            stageSlug: stageSlug,
                            finalStatus: `${stageSlug}_generation_complete`,
                            successful_contributions: successfulContributions.map(c => c.id),
                            failed_contributions: finalFailedAttempts.map(f => f.modelId),
                        },
                    });
                }
            }
        }

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        deps.logger.error(`[dialectic-worker] [processJob] Unhandled error in job ${jobId}`, { error });
        
        const errorDetails = {
          final_error: error.message,
          failedAttempts: failedContributionAttempts.map(e => ({...e})),
        };

        if (projectOwnerUserId) {
            await dbClient.rpc('create_notification_for_user', {
                target_user_id: projectOwnerUserId,
                notification_type: 'contribution_generation_failed',
                notification_data: { 
                    sessionId: payload.sessionId, 
                    stageSlug: payload.stageSlug, 
                    error: errorDetails,
                },
            });
        }
    
        const { error: finalUpdateError } = await dbClient.from('dialectic_generation_jobs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_details: errorDetails,
            attempt_count: job.attempt_count + 1,
        }).eq('id', jobId);

        if (finalUpdateError) {
            deps.logger.error(`[dialectic-worker] [processJob] FATAL: Failed to update job ${jobId} to 'failed' status after another error.`, { originalError: error, finalUpdateError });
        }
    }
}

