// deno-lint-ignore-file no-explicit-any
import { 
    GenerateContributionsPayload, 
    GenerateContributionsSuccessResponse, 
    SelectedAiProvider,
    UnifiedAIResponse,
    CallUnifiedAIModelOptions,
    FailedAttemptError,
    DialecticContribution,
  } from "./dialectic.interface.ts";
  import { downloadFromStorage, deleteFromStorage } from "../_shared/supabase_storage_utils.ts";
  import { getExtensionFromMimeType } from "../_shared/path_utils.ts";
  import type { Database } from "../types_db.ts";
  import { callUnifiedAIModel } from "./callModel.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import type { ILogger } from "../_shared/types.ts";
  import type { PostgrestError } from '@supabase/supabase-js';
  import { FileManagerService } from "../_shared/services/file_manager.ts";
  import type { IFileManager, PathContext, UploadContext } from "../_shared/types/file_manager.types.ts";
  import { logger } from "../_shared/logger.ts";

  console.log("generateContribution function started");
  
  // Define Dependencies Interface
  export interface GenerateContributionsDeps {
    callUnifiedAIModel: (modelId: string, prompt: string, chatId: string | null | undefined, authToken: string, options?: CallUnifiedAIModelOptions) => Promise<UnifiedAIResponse>;
    downloadFromStorage: typeof downloadFromStorage;
    getExtensionFromMimeType: typeof getExtensionFromMimeType;
    logger: ILogger;
    randomUUID: () => string;
    fileManager: IFileManager;
    deleteFromStorage: typeof deleteFromStorage;
  }
  
export async function generateContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateContributionsPayload,
    authToken: string, 
    deps: GenerateContributionsDeps
  ): Promise<{ success: boolean; data?: GenerateContributionsSuccessResponse; error?: { message: string; status?: number; details?: string | FailedAttemptError[]; code?: string } }> {
    const BUCKET_NAME = 'dialectic-contributions';

    const { sessionId, iterationNumber, stageSlug } = payload;
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

    deps.logger.info(`[generateContributions] Starting for session ID: ${sessionId}, stage: ${stage.slug}, iteration: ${iterationNumber}`);
  
    try {
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
      const projectDetails: Pick<Database['public']['Tables']['dialectic_projects']['Row'], 'user_id'> | null = projectData;

      if (projectError || !projectDetails || !projectDetails.user_id) {
        deps.logger.error(`[generateContributions] Error fetching project owner user_id for project ${projectId}:`, { error: projectError });
        return { success: false, error: { message: "Could not determine project owner for contribution attribution.", status: 500, details: projectError?.message } };
      }
      const projectOwnerUserId = projectDetails.user_id;

      const expectedStatus = `pending_${stage.slug}`;
      if (sessionDetails.status !== expectedStatus) {
        deps.logger.warn(`[generateContributions] Session ${sessionId} is not in '${expectedStatus}' status. Current status: ${sessionDetails.status}`);
        return { success: false, error: { message: `Session is not in '${expectedStatus}' status. Current status: ${sessionDetails.status}`, status: 400 } };
      }

      // Moved: Check if models are selected for the session BEFORE fetching resources
      if (!sessionDetails.selected_model_catalog_ids || sessionDetails.selected_model_catalog_ids.length === 0) {
        deps.logger.error(`[generateContributions] No models selected for session ${sessionId} (selected_model_catalog_ids is null or empty).`);
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
        if (typeof resource.resource_description !== 'string') return false;
        try {
          const desc = JSON.parse(resource.resource_description) as {
            type?: unknown;
            session_id?: unknown;
            stage_slug?: unknown;
            iteration?: unknown;
          };

          return typeof desc.type === 'string' && desc.type === 'seed_prompt' && 
                 typeof desc.session_id === 'string' && desc.session_id === sessionId &&
                 typeof desc.stage_slug === 'string' && desc.stage_slug === stage.slug &&
                 typeof desc.iteration === 'number' && desc.iteration === iterationNumber;
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
  
      const successfulContributions: Database['public']['Tables']['dialectic_contributions']['Row'][] = [];
      const failedContributionAttempts: FailedAttemptError[] = [];
  
  
      for (const modelCatalogId of sessionDetails.selected_model_catalog_ids) {
        // Fetch AI provider details for this modelCatalogId
        const { data: providerData, error: providerError } = await dbClient
          .from('ai_providers')
          .select('id, provider, name, api_identifier') // Use direct field names as per types_db
          .eq('id', modelCatalogId)
          .single();
  
        if (providerError || !providerData) {
          deps.logger.error(`[generateContributions] Failed to fetch AI Provider details for model ID ${modelCatalogId}. Session ${sessionId}.`, { error: providerError });
          failedContributionAttempts.push({
            modelId: modelCatalogId,
            error: "Failed to fetch AI Provider details from database.",
            details: providerError?.message,
            code: providerError?.code || 'PROVIDER_FETCH_FAILED'
          });
          continue;
        }
        
        const providerDetails = providerData as unknown as SelectedAiProvider;
  
        const modelIdForCall = providerDetails.id; 
        const modelSlugForPath = providerDetails.api_identifier || providerDetails.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
        const modelIdentifier = `${providerDetails.provider || 'Unknown Provider'} - ${providerDetails.name} (ProviderID: ${modelIdForCall}, API_ID: ${providerDetails.api_identifier})`;
        deps.logger.info(`[generateContributions] Processing model: ${modelIdentifier} for session ${sessionId}`);
  
        let tempContentPathForCatch: string | null = null;
        let tempRawPathForCatch: string | null = null;
  
        try {
          deps.logger.debug(`[generateContributions] Rendered prompt for ${modelIdentifier}:`, { prompt: renderedPrompt.substring(0, 100) + "..."});
  
          const aiResponse = await deps.callUnifiedAIModel(
            modelIdForCall,
            renderedPrompt,
            associatedChatId,
            authToken,
          );
          deps.logger.info(`[generateContributions] AI response received from ${modelIdentifier}`, { hasError: !!aiResponse.error, tokens: {in: aiResponse.inputTokens, out: aiResponse.outputTokens} });
  
  
          if (aiResponse.error || !aiResponse.content) {
            deps.logger.error(`[generateContributions] Error from callUnifiedAIModel for ${modelIdentifier}:`, { error: aiResponse.error });
            failedContributionAttempts.push({
              modelId: modelIdForCall,
              modelName: providerDetails.name,
              providerName: providerDetails.provider,
              error: aiResponse.error || "AI model returned no content.",
              details: typeof aiResponse.errorCode === 'string' ? aiResponse.errorCode : undefined,
              code: aiResponse.errorCode || 'AI_CALL_FAILED',
              inputTokens: aiResponse.inputTokens,
              outputTokens: aiResponse.outputTokens,
              processingTimeMs: aiResponse.processingTimeMs,
            });
            continue; // Move to the next model
          }
  
          const contributionContent = aiResponse.content;
          const determinedContentType = aiResponse.contentType || "text/markdown";
          const fileExtension = deps.getExtensionFromMimeType(determinedContentType);
  
          const mainContentOriginalFileName = `${modelSlugForPath}_${stage.slug}${fileExtension}`;
  
          // For potential use in the catch block if manual cleanup is attempted
          // This is a simplified reconstruction for logging/debug, actual paths are made by path_constructor via FileManager
          tempContentPathForCatch = `projects/${projectId}/sessions/${sessionId}/contributions/SOME_ID/${stage.slug}${fileExtension}`;
          tempRawPathForCatch = `projects/${projectId}/sessions/${sessionId}/contributions/SOME_ID/raw_${stage.slug}_response.json`;
  
          const pathContextForMain: PathContext = {
            projectId: projectId,
            fileType: 'model_contribution_main',
            sessionId: sessionId,
            iteration: iterationNumber,
            stageSlug: stage.slug,
            modelSlug: modelSlugForPath, 
            originalFileName: mainContentOriginalFileName,
          };

          const uploadContextForMain: UploadContext = {
            pathContext: pathContextForMain,
            fileContent: contributionContent,
            mimeType: determinedContentType,
            sizeBytes: new TextEncoder().encode(contributionContent).byteLength, // Calculate size accurately
            userId: projectOwnerUserId,
            description: `Main content for stage ${stage.slug} by model ${providerData.name}`,
            contributionMetadata: {
              sessionId: sessionId,
              modelIdUsed: modelIdForCall,
              modelNameDisplay: providerData.name,
              stageSlug: stage.slug,
              iterationNumber: iterationNumber ?? 0,
              rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
              tokensUsedInput: aiResponse.inputTokens, tokensUsedOutput: aiResponse.outputTokens, processingTimeMs: aiResponse.processingTimeMs,
              seedPromptStoragePath: fullSeedPromptPath, 
              contributionType: stage.slug, 
              errorDetails: null, 
              promptTemplateIdUsed: null, 
              targetContributionId: null, editVersion: 1, isLatestEdit: true, originalModelContributionId: null,
            }
          };

          deps.logger.info(`[generateContributions] Calling FileManagerService for ${modelIdentifier}`);
          const { record: dbContributionRow, error: fmError } = await deps.fileManager.uploadAndRegisterFile(uploadContextForMain);

          if (fmError || !dbContributionRow) {
            deps.logger.error(`[generateContributions] FileManagerService failed for ${modelIdentifier}:`, { error: fmError });
            failedContributionAttempts.push({
              modelId: modelIdForCall, modelName: providerData.name, providerName: providerData.provider,
              error: fmError?.message || "FileManagerService failed to process contribution.", 
              code: 'FILE_MANAGER_ERROR',
              inputTokens: aiResponse.inputTokens, outputTokens: aiResponse.outputTokens, processingTimeMs: aiResponse.processingTimeMs,
            });
            continue; 
          }
  
          deps.logger.info(`[generateContributions] Contribution processed by FileManagerService for ${modelIdentifier}`, { contributionId: dbContributionRow.id });
          successfulContributions.push(dbContributionRow as Database['public']['Tables']['dialectic_contributions']['Row']);
  
        } catch (error) { 
          const typedError = error as { code?: string; message: string; };
          deps.logger.warn(`[generateContributions] Running storage cleanup for failed attempt by ${modelIdentifier}`);
          const filesToClean: string[] = [];
          if (tempContentPathForCatch) { filesToClean.push(tempContentPathForCatch); }
          if (tempRawPathForCatch) { filesToClean.push(tempRawPathForCatch); }
          
          if (filesToClean.length > 0) {
            const { error: deleteError } = await deps.deleteFromStorage(dbClient, BUCKET_NAME, filesToClean);
            if (deleteError) {
              deps.logger.warn(`[generateContributions] Failed to clean up storage for ${modelIdentifier}. Files: ${filesToClean.join(', ')}`, { error: deleteError });
            } else {
              deps.logger.info(`[generateContributions] Storage cleanup successful for ${modelIdentifier}.`, { deletedFiles: filesToClean });
            }
          }

          failedContributionAttempts.push({
              modelId: modelIdForCall,
              modelName: providerData.name,
              providerName: providerData.provider,
              error: "Failed to insert contribution into database.",
              details: typedError.message,
              code: typedError.code || 'DB_INSERT_FAIL'
          });
        }
      } // End of for...of modelCatalogId loop
  
      deps.logger.info(`[generateContributions] Finished processing all models for session ${sessionId}`, { successful: successfulContributions.length, failed: failedContributionAttempts.length });
  
      if (successfulContributions.length === 0 && sessionDetails.selected_model_catalog_ids.length > 0) { // Check if models were supposed to run
        deps.logger.error(`[generateContributions] All models failed to generate contributions for session ${sessionId}`, { errors: failedContributionAttempts });
        // Update session status to indicate failure
        const failedStatus = `${stage.slug}_generation_failed`;
        await dbClient.from('dialectic_sessions').update({ status: failedStatus }).eq('id', sessionId);

        return {
          success: false,
          error: {
            message: "All models failed to generate stage contributions.",
            status: 500,
            details: failedContributionAttempts.map(f => ({ ...f, message: f.error })),
          }
        };
      }
  
      // If we got here, all models were processed or skipped appropriately.
      // Update session status
      const finalStatus = successfulContributions.length > 0
        ? `${stage.slug}_generation_complete` // Align with test expectation
        : expectedStatus; // Revert to pending if all attempts failed for all models

      let updateSessionError: PostgrestError | null = null; // Declare updateSessionError here with correct type

      if (sessionDetails.status !== finalStatus) {
        const { error: sessionUpdateOpError } = await dbClient
          .from('dialectic_sessions')
          .update({ status: finalStatus, iteration_count: iterationNumber })
          .eq('id', sessionId);
        
        updateSessionError = sessionUpdateOpError; // Assign to the outer scope variable

        if (updateSessionError) {
          deps.logger.error(`[generateContributions] Failed to update session ${sessionId} status to ${finalStatus}:`, { error: updateSessionError });
          // Non-fatal for the generation itself, but needs logging/alerting
        } else {
          deps.logger.info(`[generateContributions] Session ${sessionId} status updated to ${finalStatus}`);
        }
      }
      
      if (updateSessionError) {
        deps.logger.error(`[generateContributions] CRITICAL: Failed to update session status for ${sessionId} to ${finalStatus} but contributions were generated and response sent. Manual follow-up may be needed.`, { error: updateSessionError });
      }

      const responseMessage = failedContributionAttempts.length > 0
        ? `Stage generation partially complete for session ${sessionId}. ${successfulContributions.length} succeeded, ${failedContributionAttempts.length} failed.`
        : `Stage generation fully complete for session ${sessionId}.`;

      const responseData: GenerateContributionsSuccessResponse = {
        message: responseMessage,
        sessionId: sessionId,
        status: finalStatus, 
        contributions: successfulContributions.map(c => {
          let parsedCitations: { text: string; url?: string }[] | null = null;
          if (c.citations) {
            if (typeof c.citations === 'string') {
              try {
                parsedCitations = JSON.parse(c.citations);
              } catch (jsonError) {
                deps.logger.error('[generateContributions] Failed to parse citations JSON string for contribution.', { contributionId: c.id, citationsString: c.citations, error: jsonError });
                parsedCitations = null; // Default to null on parsing error
              }
            } else {
              // If it's not a string, assume it's already in the correct format or null
              parsedCitations = c.citations as { text: string; url?: string }[] | null;
            }
          }

          const mapped: DialecticContribution = {
            ...c, 
            stage: stage.slug, 
            storage_bucket: c.storage_bucket,
            storage_path: c.storage_path,
            mime_type: c.mime_type,
            size_bytes: c.size_bytes,
            citations: parsedCitations, // Use the parsed and typed citations
            // Ensure file_name is present; it should be from ...c if c.file_name exists
            // If c.file_name can be null and DialecticContribution.file_name cannot, adjust as needed.
            // Assuming c.file_name aligns with DialecticContribution.file_name: string | null
          };
          return mapped;
        }),
        errors: failedContributionAttempts.length > 0 ? failedContributionAttempts.map(f => ({
          modelId: f.modelId, 
          modelName: f.modelName,
          providerName: f.providerName,
          message: f.error,
          details: f.details,
        })) : undefined,
      };
      
      deps.logger.info(`[generateContributions] Successfully completed for session ${sessionId}. Status: ${finalStatus}`, { numSuccess: successfulContributions.length, numFailed: failedContributionAttempts.length });
      return { success: true, data: responseData };
  
    } catch (error) {
      deps.logger.error(`[generateContributions] Critical unhandled error in generateContributions for session ${payload.sessionId}:`, { error });
      return { 
        success: false, 
        error: { 
          message: "A critical unexpected error occurred while generating stage contributions.", 
          status: 500, 
          details: error instanceof Error ? error.message : String(error) 
        } 
      };
    }
  }
  