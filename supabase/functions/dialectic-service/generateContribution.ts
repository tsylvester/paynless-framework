// deno-lint-ignore-file no-explicit-any
import { 
    GenerateContributionsPayload, 
    GenerateContributionsSuccessResponse, 
    SelectedAiProvider,
    FailedAttemptError,
    DialecticContribution,
    isResourceDescription,
  } from "./dialectic.interface.ts";
  import type { Database } from "../types_db.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import type { UploadContext } from "../_shared/types/file_manager.types.ts";
  import { GenerateContributionsDeps } from "./dialectic.interface.ts";
  import { logger } from "../_shared/logger.ts";

  console.log("generateContribution function started");
  
  // Define Dependencies Interface
  function isSelectedAiProvider(obj: unknown): obj is SelectedAiProvider {
    const provider = obj as SelectedAiProvider;
    return (
      provider &&
      typeof provider.id === 'string' &&
      typeof provider.provider === 'string' &&
      typeof provider.name === 'string' &&
      typeof provider.api_identifier === 'string' && provider.api_identifier.length > 0
    );
  }
  
export async function generateContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateContributionsPayload,
    authToken: string, 
    deps: GenerateContributionsDeps,
  ): Promise<{ success: boolean; data?: GenerateContributionsSuccessResponse; error?: { message: string; status?: number; details?: string | FailedAttemptError[]; code?: string } }> {

    const { sessionId, iterationNumber = 1, stageSlug, continueUntilComplete } = payload;
    logger.info(`[generateContributions] Starting for session ID: ${sessionId}, stage: ${stageSlug}, iteration: ${iterationNumber}, continueUntilComplete: ${continueUntilComplete}`);
    if (!stageSlug) {
      deps.logger.error("[generateContributions] stageSlug is required in the payload.");
      return { success: false, error: { message: "stageSlug is required in the payload.", status: 400 } };
    }

    // --- FIX: Fetch the full stage object from the database ---
    const { data: stage, error: stageError } = await dbClient
      .from('dialectic_stages')
      .select('*')
      .eq('slug', stageSlug)
      .single();

    if (stageError || !stage) {
      deps.logger.error(`[generateContributions] Error fetching stage with slug '${stageSlug}': DETAILS: ${stageError?.message}`);
      return { success: false, error: { message: `Stage with slug '${stageSlug}' not found.`, status: 404, details: stageError?.message } };
    }
    // --- END FIX ---

      try {
        deps.logger.info(`[generateContributions] Starting for session ID: ${sessionId}, stage: ${stage.slug}, iteration: ${iterationNumber}`);
    
        // 1. Fetch session details (includes project_id)
        const sessionQuery = dbClient
          .from('dialectic_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();
        const { data, error: sessionError } = await sessionQuery;
        const sessionDetails: Database['public']['Tables']['dialectic_sessions']['Row'] | null = data;
    
        if (sessionError || !sessionDetails) {
          deps.logger.error(`[generateContributions] Error fetching session ${sessionId}:`, { error: sessionError });
          return { success: false, error: { message: "Session not found or error fetching details.", status: 404, details: sessionError?.message } };
        }
        
        const projectId = sessionDetails.project_id;
        if (!projectId) {
          deps.logger.error(`[generateContributions] Project ID is missing for session ${sessionId}.`);
          return { success: false, error: { message: "Project ID is missing for session.", status: 500 } };
        }

        // 1.B Fetch project owner user_id from dialectic_projects table
        const projectQuery = dbClient
          .from('dialectic_projects')
          .select('user_id')
          .eq('id', projectId)
          .single();
        const { data: projectData, error: projectError } = await projectQuery;

      if (projectError || !projectData || !projectData.user_id) {
          deps.logger.error(`[generateContributions] Error fetching project owner user_id for project ${projectId}:`, { error: projectError });
          return { success: false, error: { message: "Could not determine project owner for contribution attribution.", status: 500, details: projectError?.message } };
        }
      const projectOwnerUserId = projectData.user_id;

        const expectedStatus = `pending_${stage.slug}`;
      const canRegenerateStatus = `${stage.slug}_generation_failed`;
  
      if (sessionDetails.status !== expectedStatus && sessionDetails.status !== canRegenerateStatus) {
        deps.logger.warn(`[generateContributions] Session ${sessionId} is not in a valid status for generation. Expected '${expectedStatus}' or '${canRegenerateStatus}', but got '${sessionDetails.status}'.`);
        return { 
          success: false, 
          error: { 
            message: `Session is not in a valid status for generation. Current status: ${sessionDetails.status}`, 
            status: 400 
          } 
        };
        }

        // Moved: Check if models are selected for the session BEFORE fetching resources
        if (!sessionDetails.selected_model_ids || sessionDetails.selected_model_ids.length === 0) {
          deps.logger.error(`[generateContributions] No models selected for session ${sessionId} (selected_model_ids is null or empty).`);
          return { success: false, error: { message: "No models selected for this session.", status: 400, code: 'NO_MODELS_SELECTED' } };
        }
    
        const associatedChatId = sessionDetails.associated_chat_id;

        // 2. Fetch seed prompt resource details from the database
        deps.logger.info(`[generateContributions] Fetching seed prompt resources for project ${projectId}`);
        
        const { data: projectResources, error: projectResourcesError } = await dbClient
          .from('dialectic_project_resources')
          .select('storage_bucket, storage_path, resource_description, file_name')
          .eq('project_id', projectId);
        
        if (projectResourcesError || !projectResources) {
          deps.logger.error(`[generateContributions] Error fetching project resources for project ${projectId}`, { error: projectResourcesError });
          return { success: false, error: { message: "Could not fetch project resources.", status: 500, details: projectResourcesError?.message } };
        }

        const seedPromptResource = projectResources.find(resource => {
        if (typeof resource.resource_description !== 'string') {
            // If it's an object but not a string, we can check it directly
            if (resource.resource_description && typeof resource.resource_description === 'object' && !Array.isArray(resource.resource_description)) {
                const desc = resource.resource_description as unknown; // Cast to unknown to satisfy type guard
                if (isResourceDescription(desc)) {
                    return desc.type === 'seed_prompt' &&
                           desc.session_id === sessionId &&
                           desc.stage_slug === stage.slug &&
                           desc.iteration === iterationNumber;
                }
            }
            return false;
        }
        // If it's a string, parse it
        try {
          const desc = JSON.parse(resource.resource_description);
          if (isResourceDescription(desc)) {
            return desc.type === 'seed_prompt' &&
                   desc.session_id === sessionId &&
                   desc.stage_slug === stage.slug &&
                   desc.iteration === iterationNumber;
          }
          return false;
          } catch (e) {
            // Log if parsing failed for a resource, but continue search
            deps.logger.debug(`[generateContributions] Failed to parse resource_description for resource ${resource.file_name} while finding seed prompt. Content: ${resource.resource_description}`, { error: e });
            return false;
          }
        });

        if (!seedPromptResource) {
          deps.logger.error(`[generateContributions] No specific seed prompt resource found matching criteria for session ${sessionId}, project ${projectId}, stage ${stage.slug}, iteration ${iterationNumber} after filtering ${projectResources.length} resources.`);
          return { success: false, error: { message: "Seed prompt resource metadata not found or description mismatch.", status: 500 } };
        }

        const seedPromptDir = seedPromptResource.storage_path;
        const seedPromptFileName = seedPromptResource.file_name;
        const seedPromptBucketName = seedPromptResource.storage_bucket;

        if (!seedPromptDir || !seedPromptFileName) {
          deps.logger.error(`[generateContributions] Seed prompt resource is missing storage_path or file_name. Dir: ${seedPromptDir}, File: ${seedPromptFileName}, Bucket: ${seedPromptBucketName}`);
          return { success: false, error: { message: "Seed prompt resource metadata is incomplete (missing path or filename).", status: 500 } };
        }

        // Ensure no leading/trailing slashes on dir and no leading slash on filename to prevent double slashes or incorrect paths
        const cleanedDir = seedPromptDir.endsWith('/') ? seedPromptDir.slice(0, -1) : seedPromptDir;
        const cleanedFileName = seedPromptFileName.startsWith('/') ? seedPromptFileName.slice(1) : seedPromptFileName;
        
        const fullSeedPromptPath = `${cleanedDir}/${cleanedFileName}`;

        deps.logger.info(`[generateContributions] Fetching seed prompt content from bucket: ${seedPromptBucketName}, path: ${fullSeedPromptPath}`);

        const { data: promptContentBuffer, error: promptDownloadError } = await deps.downloadFromStorage(dbClient, seedPromptBucketName, fullSeedPromptPath);

        if (promptDownloadError || !promptContentBuffer) {
          deps.logger.error(`[generateContributions] Failed to download seed prompt from bucket: ${seedPromptBucketName}, path: ${fullSeedPromptPath}`, { error: promptDownloadError });
          return { success: false, error: { message: "Could not retrieve the seed prompt for this stage.", status: 500, details: promptDownloadError?.message } };
        }

        const renderedPrompt = new TextDecoder().decode(promptContentBuffer);
    
        // Added: Check for empty rendered prompt
        if (!renderedPrompt || renderedPrompt.trim() === "") {
          deps.logger.error(`[generateContributions] Rendered seed prompt is empty for session ${sessionId}, project ${projectId}, stage ${stage.slug}.`);
          return { success: false, error: { message: "Rendered seed prompt is empty. Cannot proceed.", status: 400, code: 'EMPTY_SEED_PROMPT' } };
        }
    
      const successfulContributions: DialecticContribution[] = [];
        const failedContributionAttempts: FailedAttemptError[] = [];
    
        const modelPromises = sessionDetails.selected_model_ids.map(async (modelCatalogId) => {
          // Fetch AI provider details for this modelCatalogId
          const { data: providerData, error: providerError } = await dbClient
            .from('ai_providers')
            .select('id, provider, name, api_identifier') // Use direct field names as per types_db
            .eq('id', modelCatalogId)
            .single();
    
          if (providerError || !providerData) {
            deps.logger.error(`[generateContributions] Failed to fetch AI Provider details for model ID ${modelCatalogId}. Session ${sessionId}.`, { error: providerError });
          // Reject the promise for this specific model so Promise.allSettled can capture it.
            return Promise.reject({
              modelId: modelCatalogId,
              error: "Failed to fetch AI Provider details from database.",
              details: providerError?.message,
              code: providerError?.code || 'PROVIDER_FETCH_FAILED'
            });
          }
          
        if (!isSelectedAiProvider(providerData)) {
          deps.logger.error(`[generateContributions] Fetched provider data for model ID ${modelCatalogId} does not match the expected SelectedAiProvider interface.`, { data: providerData });
          return Promise.reject({
            modelId: modelCatalogId,
            error: "Fetched provider data does not match expected structure.",
            code: 'PROVIDER_DATA_MISMATCH'
          });
        }
        const providerDetails: SelectedAiProvider = providerData;
    
          const modelIdForCall = providerDetails.id; 
          const modelSlugForPath = providerDetails.api_identifier || providerDetails.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
          const modelIdentifier = `${providerDetails.provider || 'Unknown Provider'} - ${providerDetails.name} (ProviderID: ${modelIdForCall}, API_ID: ${providerDetails.api_identifier})`;
          deps.logger.info(`[generateContributions] Processing model: ${modelIdentifier} for session ${sessionId}`);
    
          try {
            deps.logger.debug(`[generateContributions] Rendered prompt for ${modelIdentifier}:`, { prompt: renderedPrompt.substring(0, 100) + "..."});
    
            const aiResponse = await deps.callUnifiedAIModel(
              modelIdForCall,
              renderedPrompt,
              associatedChatId,
              authToken,
              undefined, // No options are passed in the original code
              continueUntilComplete, // ADDED: Pass the flag here
            );
            deps.logger.info(`[generateContributions] AI response received from ${modelIdentifier}`, { hasError: !!aiResponse.error, tokens: {in: aiResponse.inputTokens, out: aiResponse.outputTokens} });
    
    
            if (aiResponse.error || !aiResponse.content) {
              deps.logger.error(`[generateContributions] Error from callUnifiedAIModel for ${modelIdentifier}:`, { error: aiResponse.error });
            // This throw is caught by the outer `catch` inside the .map, which then rejects the promise for this model.
              throw {
                modelId: modelIdForCall,
                modelName: providerDetails.name,
                providerName: providerDetails.provider,
                error: aiResponse.error,
                code: 'AI_MODEL_ERROR',
                content: null // No content to save
              };
            }
    
            const contributionContent = aiResponse.content;
            const determinedContentType = aiResponse.contentType || "text/markdown";
  
          const uploadContext: UploadContext = {
            pathContext: {
              projectId: projectId,
              fileType: 'model_contribution_main',
              sessionId: sessionId,
              iteration: iterationNumber,
              stageSlug: stage.slug,
              modelSlug: modelSlugForPath, 
              originalFileName: `${modelSlugForPath}_${stage.slug}${deps.getExtensionFromMimeType(determinedContentType)}`,
            },
              fileContent: contributionContent,
              mimeType: determinedContentType,
            sizeBytes: new TextEncoder().encode(contributionContent).byteLength,
              userId: projectOwnerUserId,
            description: `Contribution for stage '${stage.slug}' by model ${providerDetails.name}`,
              contributionMetadata: {
                sessionId: sessionId,
                modelIdUsed: modelIdForCall,
              modelNameDisplay: providerDetails.name,
                stageSlug: stage.slug,
              iterationNumber: iterationNumber,
                rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
              tokensUsedInput: aiResponse.inputTokens,
              tokensUsedOutput: aiResponse.outputTokens,
              processingTimeMs: aiResponse.processingTimeMs,
                seedPromptStoragePath: fullSeedPromptPath, 
              contributionType: 'model_generated', // Or derive from stage if needed
              editVersion: 1,
              isLatestEdit: true,
              }
            };
  
          const uploadResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);
  
            if (uploadResult.error) {
              deps.logger.error(`[generateContributions] Failed to upload and register contribution file for model ${modelIdentifier}:`, { error: uploadResult.error });
              throw {
                modelId: modelIdForCall,
                modelName: providerDetails.name,
                providerName: providerDetails.provider,
                error: uploadResult.error?.message || "FileManagerService failed to process contribution.",
                code: uploadResult.error?.code || 'FILE_MANAGER_ERROR',
                ...aiResponse // Pass through token usage etc.
              };
            }
    
            deps.logger.info(`[generateContributions] Contribution processed by FileManagerService for ${modelIdentifier}`, { contributionId: uploadResult.record.id });
          return uploadResult.record as DialecticContribution;
    
        } catch (error: unknown) {
            const modelError = error as Partial<FailedAttemptError> & { message?: string };
            deps.logger.error(`[generateContributions] An error occurred while processing model ${modelIdentifier} for session ${sessionId}.`, { error: modelError });
            // This reject is how we pass the failure details to Promise.allSettled
            return Promise.reject({
                modelId: modelError.modelId || modelIdForCall,
                modelName: modelError.modelName || providerDetails.name,
                providerName: modelError.providerName || providerDetails.provider,
                error: modelError.error || "An unexpected error occurred during model processing.",
                details: modelError.details || modelError.message,
                code: modelError.code || 'UNHANDLED_MODEL_PROCESSING_ERROR',
                inputTokens: modelError.inputTokens,
                outputTokens: modelError.outputTokens,
                processingTimeMs: modelError.processingTimeMs,
                api_identifier: providerDetails.api_identifier,
            });
          }
        });
    
        const results = await Promise.allSettled(modelPromises);

      results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            // The result.value here is the single contribution row from the DB insert
            successfulContributions.push(result.value);
          } else if (result.status === 'rejected') {
            if (!sessionDetails.selected_model_ids) return; // Should not happen due to earlier check, but for type safety
            const modelCatalogId = sessionDetails.selected_model_ids[index];
            deps.logger.warn(`[generateContributions] Model with catalog ID ${modelCatalogId} failed for session ${sessionId}. Reason:`, { reason: result.reason });
            failedContributionAttempts.push({
              modelId: result.reason.modelId || modelCatalogId,
              modelName: result.reason.modelName,
              providerName: result.reason.providerName,
              error: result.reason.error || 'Unknown error',
              details: result.reason.details,
              code: result.reason.code,
              inputTokens: result.reason.inputTokens,
              outputTokens: result.reason.outputTokens,
              processingTimeMs: result.reason.processingTimeMs,
              api_identifier: result.reason.api_identifier,
            });
        }
      });
    
      deps.logger.info(`[generateContributions] Finished all models for session ${sessionId}. Success: ${successfulContributions.length}, Failed: ${failedContributionAttempts.length}`);
    
      // Final step: Update the session status based on the outcomes
      const finalStatus = failedContributionAttempts.length > 0
          ? `${stage.slug}_generation_failed`
          : `${stage.slug}_generation_complete`;

      deps.logger.info(`[generateContributions] Updating session ${sessionId} to final status: ${finalStatus}`);
      const { error: updateError } = await dbClient
            .from('dialectic_sessions')
          .update({ status: finalStatus })
            .eq('id', sessionId);
          
      if (updateError) {
          deps.logger.error(`[generateContributions] CRITICAL: Failed to update final session status for ${sessionId} to ${finalStatus}.`, { error: updateError });
          return { 
            success: false, 
            error: { 
                message: `CRITICAL: Failed to update final session status for session ${sessionId}. The operation succeeded, but the final status could not be recorded.`,
                status: 500,
                details: updateError.message
            } 
        };
      }
      
      // Send a notification to the user that the process is complete.
      const notificationTitle = `Contribution Generation Complete`;
      let notificationMessage = `We've finished generating contributions for stage: ${stage.display_name}.`;

      if (failedContributionAttempts.length > 0 && successfulContributions.length > 0) {
        notificationMessage = `Generation for stage '${stage.display_name}' finished with ${failedContributionAttempts.length} error(s). Click to review.`;
      } else if (failedContributionAttempts.length > 0 && successfulContributions.length === 0) {
        notificationMessage = `Generation for stage '${stage.display_name}' failed for all models. Please review the errors and try again.`;
          }

      deps.logger.info(`[generateContributions] Sending completion notification to user ${projectOwnerUserId} for session ${sessionId}`);
        await dbClient.rpc('create_notification_for_user', {
          target_user_id: projectOwnerUserId,
          notification_type: 'contribution_generation_complete',
          notification_data: {
          title: notificationTitle,
          message: notificationMessage,
            sessionId: sessionId,
          projectId: projectId,
            stageSlug: stage.slug,
          finalStatus: finalStatus,
          successful_contributions: successfulContributions.map(c => c.id),
          failed_contributions: failedContributionAttempts.map(f => f.modelId),
        },
      });

      const responseData: GenerateContributionsSuccessResponse = {
        sessionId: sessionId,
        projectId: projectId,
        stage: stage.slug,
        iteration: iterationNumber,
        status: finalStatus,
        successfulContributions: successfulContributions,
        failedAttempts: failedContributionAttempts,
      };

      return { success: true, data: responseData };

    } catch (error: unknown) {
      const anyError = error as { message?: string };
      deps.logger.error(`[generateContributions] Unhandled exception in generateContributions for session ${sessionId}.`, { error: anyError });
      
      const failedStatus = `${stage.slug}_generation_failed`;
      deps.logger.info(`[generateContributions] Attempting to update session ${sessionId} to failed status: ${failedStatus}`);
      const { error: updateError } = await dbClient
        .from('dialectic_sessions')
        .update({ status: failedStatus })
        .eq('id', sessionId);

      if (updateError) {
        deps.logger.error(`[generateContributions] CRITICAL: Failed to update session status to '${failedStatus}' after unhandled exception.`, { error: updateError });
      }

      return { 
        success: false, 
        error: { 
          message: "An unexpected server error occurred during contribution generation.", 
          status: 500,
          details: anyError.message,
          code: 'UNHANDLED_GENERATION_FAILURE'
      }
    };
    }
  }
  