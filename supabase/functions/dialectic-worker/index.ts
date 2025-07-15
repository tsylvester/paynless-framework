// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import {
  type GenerateContributionsDeps,
  type GenerateContributionsPayload,
  type SelectedAiProvider,
  type FailedAttemptError,
  type DialecticContribution,
  type UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext } from '../_shared/types/file_manager.types.ts';
import { getSeedPromptForStage } from '../_shared/utils/dialectic_utils.ts';
import { shouldContinue } from '../_shared/utils/continue_util.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

/**
 * A true type guard that safely checks if an object is a SelectedAiProvider
 * using runtime property inspection without any type casting.
 */
export function isSelectedAiProvider(obj: unknown): obj is SelectedAiProvider {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const checks = [
    { key: 'id', type: 'string', required: true },
    { key: 'provider', type: 'string', required: false }, // Can be null
    { key: 'name', type: 'string', required: true },
    { key: 'api_identifier', type: 'string', required: true },
  ];

  for (const check of checks) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, check.key);
    if (check.required && (!descriptor || typeof descriptor.value !== check.type)) {
      return false;
    }
    if (!check.required && descriptor && typeof descriptor.value !== check.type && descriptor.value !== null) {
        return false;
    }
    // Ensure required strings are not empty
    if (check.required && typeof descriptor?.value === 'string' && descriptor.value.length === 0) {
      return false;
    }
  }

  return true;
}


/**
 * A true type guard that safely checks if a record is a DialecticContribution
 * using runtime property inspection without any type casting.
 */
export function isDialecticContribution(record: unknown): record is DialecticContribution {
  if (typeof record !== 'object' || record === null) {
    return false;
  }

  const checks = [
    { key: 'id', type: 'string' },
    { key: 'session_id', type: 'string' },
    { key: 'stage', type: 'string' },
    { key: 'iteration_number', type: 'number' },
    { key: 'model_id', type: 'string' },
    { key: 'contribution_type', type: 'string', value: 'model_generated' },
  ];

  for (const check of checks) {
    const descriptor = Object.getOwnPropertyDescriptor(record, check.key);
    if (!descriptor || typeof descriptor.value !== check.type) {
      return false;
    }
    if (check.value && descriptor.value !== check.value) {
      return false;
    }
  }

  return true;
}

// Validation function that safely converts Json to GenerateContributionsPayload
export function validatePayload(payload: Json): GenerateContributionsPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload must be a valid object');
  }
  
  // Use proper type narrowing without casting
  if (!('sessionId' in payload) || typeof payload.sessionId !== 'string') {
    throw new Error('sessionId must be a string');
  }
  if (!('projectId' in payload) || typeof payload.projectId !== 'string') {
    throw new Error('projectId must be a string');
  }
  if (!('selectedModelIds' in payload) || !Array.isArray(payload.selectedModelIds) || 
      !payload.selectedModelIds.every((id: unknown) => typeof id === 'string')) {
    throw new Error('selectedModelIds must be an array of strings');
  }
  
  // Build the validated payload with proper types
  const validatedPayload: GenerateContributionsPayload = {
    sessionId: payload.sessionId,
    projectId: payload.projectId,
    selectedModelIds: payload.selectedModelIds,
    stageSlug: ('stageSlug' in payload && typeof payload.stageSlug === 'string') ? payload.stageSlug : undefined,
    iterationNumber: ('iterationNumber' in payload && typeof payload.iterationNumber === 'number') ? payload.iterationNumber : undefined,
    chatId: ('chatId' in payload && (typeof payload.chatId === 'string' || payload.chatId === null)) ? payload.chatId : undefined,
    walletId: ('walletId' in payload && typeof payload.walletId === 'string') ? payload.walletId : undefined,
    continueUntilComplete: ('continueUntilComplete' in payload && typeof payload.continueUntilComplete === 'boolean') ? payload.continueUntilComplete : undefined,
    maxRetries: ('maxRetries' in payload && typeof payload.maxRetries === 'number') ? payload.maxRetries : undefined,
    continuation_count: ('continuation_count' in payload && typeof payload.continuation_count === 'number') ? payload.continuation_count : undefined,
    target_contribution_id: ('target_contribution_id' in payload && typeof payload.target_contribution_id === 'string') ? payload.target_contribution_id : undefined,
  };
  
  return validatedPayload;
}

async function processJob(
    dbClient: SupabaseClient<Database>,
    job: Job,
    payload: GenerateContributionsPayload,
    projectOwnerUserId: string,
    deps: GenerateContributionsDeps,
    authToken: string,
) {
    const { id: jobId, max_retries } = job;
    const { 
        iterationNumber = 1, 
        stageSlug, 
        continueUntilComplete, 
        projectId, 
        selectedModelIds,
        sessionId,
        continuation_count,
    } = payload;
    
    deps.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}`);

    const successfulContributions: DialecticContribution[] = [];
    const failedContributionAttempts: FailedAttemptError[] = [];
    let continuationEnqueued = false;

    try {
        if (!stageSlug) throw new Error('stageSlug is required in the payload.');
        if (!projectId) throw new Error('projectId is required in the payload.');

        const { data: stage, error: stageError } = await dbClient.from('dialectic_stages').select('*').eq('slug', stageSlug).single();
        if (stageError || !stage) throw new Error(`Stage with slug '${stageSlug}' not found.`);

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

        for (currentAttempt = 0; currentAttempt < job.max_retries && modelsToProcess.length > 0; currentAttempt++) {
            deps.logger.info(`[dialectic-worker] [processJob] Attempt ${currentAttempt + 1} for job ID: ${jobId}`);
            
            if (currentAttempt > 0) {
                const { error } = await dbClient.from('dialectic_generation_jobs').update({
                    status: 'retrying',
                    attempt_count: currentAttempt,
                    error_details: {
                        failedAttempts: failedContributionAttempts.map(e => ({...e})),
                    },
                }).eq('id', jobId);

                if (error) {
                    throw new Error(`Failed to update job status to 'retrying': ${error.message}`);
                }

                if (projectOwnerUserId) {
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId,
                        notification_type: 'contribution_generation_retrying',
                        notification_data: { 
                            sessionId: sessionId, 
                            stageSlug: stageSlug,
                            attempt: currentAttempt + 1,
                            max_attempts: job.max_retries,
                        },
                    });
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

                const willContinue = shouldContinue(aiResponse.finish_reason ?? null, continuation_count ?? 0, 5) && continueUntilComplete;

                if (projectOwnerUserId) {
                    await dbClient.rpc('create_notification_for_user', {
                        target_user_id: projectOwnerUserId,
                        notification_type: 'dialectic_contribution_received',
                        notification_data: { 
                            contribution: { ...savedResult.record }, // Spread to fix linter error
                            is_continuing: willContinue,
                        },
                    });
                }

                // --- Continuation Logic ---
                // Use job's attempt_count for the continuation logic, as it reflects the chain.
                if (willContinue) {
                  continuationEnqueued = true; // Mark that a continuation is happening.
                  deps.logger.info(`[dialectic-worker] [processJob] Continuation required for job ${jobId}. Enqueuing new job.`);

                  const newPayload: Json = {
                    sessionId: payload.sessionId,
                    projectId: payload.projectId,
                    selectedModelIds: payload.selectedModelIds,
                    stageSlug: payload.stageSlug,
                    iterationNumber: payload.iterationNumber,
                    continueUntilComplete: payload.continueUntilComplete,
                    target_contribution_id: savedResult.record.id,
                    continuation_count: (continuation_count ?? 0) + 1,
                  };

                  if (payload.chatId) {
                    newPayload.chatId = payload.chatId;
                  }
                  if (payload.walletId) {
                    newPayload.walletId = payload.walletId;
                  }
                  if (payload.maxRetries) {
                    newPayload.maxRetries = payload.maxRetries;
                  }

                  // Insert the new job into the database.
                  const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert({
                    session_id: sessionId,
                    user_id: projectOwnerUserId,
                    stage_slug: stageSlug,
                    iteration_number: iterationNumber,
                    payload: newPayload,
                    status: 'pending',
                    attempt_count: 0,
                    max_retries: max_retries,
                  });

                  if (insertError) {
                    deps.logger.error(`[dialectic-worker] [processJob] Failed to enqueue continuation job.`, { error: insertError });
                    currentAttemptFailedModels.push({ modelId: modelCatalogId, api_identifier: providerDetails.api_identifier, error: `Failed to enqueue continuation job: ${insertError.message}` });
                    // No return here, because the first part was successful. The failure is in the *next* step.
                  } else {
                    deps.logger.info(`[dialectic-worker] [processJob] Successfully enqueued continuation job for contribution ${savedResult.record.id}.`);
                  }
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
                if (currentAttempt + 1 >= job.max_retries) {
                    deps.logger.error(`[dialectic-worker] [processJob] Job ${jobId} failed after exhausting all ${job.max_retries} retries.`);
                }
            } else {
                // All models in this attempt succeeded, so we can exit the loop.
                modelsToProcess = [];
                // If a continuation was created, we stop processing this job here.
                if (continuationEnqueued) {
                    deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} has enqueued a continuation. Completing current job without sending final notification.`);
                    
                    const { error } = await dbClient.from('dialectic_generation_jobs').update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        results: {
                            successfulContributions: successfulContributions.map(c => ({ ...c })),
                            status_reason: 'Job completed by dispatching a continuation job.'
                        },
                    }).eq('id', jobId);

                    if (error) {
                       deps.logger.error(`[dialectic-worker] [processJob] Failed to update job status to 'completed' for continuation job ${jobId}`, { error });
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
        
            const { error } = await dbClient.from('dialectic_generation_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                results: resultsJson,
                attempt_count: currentAttempt,
              }).eq('id', jobId);
        
            if (error) {
                throw error;
            }

            if (projectOwnerUserId) {
                const notificationTitle = `Contribution Generation Complete`;
                const notificationMessage = `We've finished generating contributions for stage: ${stage.display_name}.`;
                await dbClient.rpc('create_notification_for_user', {
                    target_user_id: projectOwnerUserId,
                    notification_type: 'contribution_generation_complete',
                    notification_data: { 
                        title: notificationTitle,
                        message: notificationMessage,
                        sessionId: sessionId,
                        stageSlug: stage.slug,
                        finalStatus: `${stage.slug}_generation_complete`,
                        successful_contributions: successfulContributions.map(c => c.id),
                        failed_contributions: [],
                    },
                });
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
                attempt_count: job.max_retries,
            }).eq('id', jobId);

            if (error) {
                throw error;
            }

            if (projectOwnerUserId) {
                const notificationTitle = `Contribution Generation Issues`;
                let notificationMessage = `Generation for stage '${stage.display_name}' finished with ${finalFailedAttempts.length} error(s). Click to review.`;
                if (successfulContributions.length === 0) {
                    notificationMessage = `Generation for stage '${stage.display_name}' failed for all models. Please review the errors and try again.`;
                }

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
                    sessionId: sessionId, 
                    stageSlug: stageSlug, 
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
            deps.logger.error(
                `[dialectic-worker] [processJob] CRITICAL: Failed to update job ${jobId} to 'failed' status after another error.`, 
                { originalError: error, finalUpdateError }
            );
        }
    }
}


export async function handleJob(
  dbClient: SupabaseClient<Database>,
  job: Job,
  deps: GenerateContributionsDeps,
  authToken: string,
): Promise<void> {
  const { id: jobId, user_id: projectOwnerUserId, payload: jobPayload } = job;

  // --- Start of Validation Block ---
  if (!projectOwnerUserId) {
      deps.logger.error(`[dialectic-worker] Job ${jobId} is missing a user_id and cannot be processed.`);
      await dbClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: { message: 'Job is missing a user_id.' },
      }).eq('id', jobId);
      return;
  }
  
  // Validate and convert the payload
  let validatedPayload: GenerateContributionsPayload;
  try {
    validatedPayload = validatePayload(jobPayload);
  } catch (validationError) {
    const error = validationError instanceof Error ? validationError : new Error(String(validationError));
    deps.logger.error(`[dialectic-worker] Job ${jobId} has invalid payload: ${error.message}`, { error });
    await dbClient.from('dialectic_generation_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: { message: `Invalid payload: ${error.message}` },
    }).eq('id', jobId);

    if (projectOwnerUserId) {
        await dbClient.rpc('create_notification_for_user', {
            target_user_id: projectOwnerUserId,
            notification_type: 'contribution_generation_failed',
            notification_data: { 
                sessionId: job.session_id, // Use from job as payload is invalid
                stageSlug: job.stage_slug, 
                reason: `An unexpected error occurred: ${error.toString()}`,
            },
        });
    }
    return;
  }
  // --- End of Validation Block ---

  try {
    // Update job status to 'processing'
    await dbClient.from('dialectic_generation_jobs').update({
        status: 'processing',
        started_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Notify user that the job has started
    if (projectOwnerUserId) {
        await dbClient.rpc('create_notification_for_user', {
            target_user_id: projectOwnerUserId,
            notification_type: 'contribution_generation_started',
            notification_data: { sessionId: validatedPayload.sessionId, stageSlug: validatedPayload.stageSlug },
        });
    }

    // Call the internal processing function with validated, typed payload
    await processJob(dbClient, job, validatedPayload, projectOwnerUserId, deps, authToken);
  } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      deps.logger.error(`[dialectic-worker] [handleJob] Unhandled exception during processJob for job ${jobId}`, { error });
      
      const errorDetails = {
        final_error: `Unhandled exception: ${error.message}`,
        failedAttempts: [],
      };

      await dbClient.rpc('create_notification_for_user', {
          target_user_id: projectOwnerUserId,
          notification_type: 'contribution_generation_failed',
          notification_data: { 
              sessionId: job.session_id, 
              stageSlug: job.stage_slug, 
              error: errorDetails
          },
      });
  
      await dbClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: errorDetails,
      }).eq('id', jobId);
  }
}
