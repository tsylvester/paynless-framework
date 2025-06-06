// deno-lint-ignore-file no-explicit-any
import { 
    GenerateStageContributionsPayload, 
    GenerateStageContributionsSuccessResponse, 
    SelectedAiProvider,
    DialecticContribution,
    UnifiedAIResponse,
    CallUnifiedAIModelOptions
  } from "./dialectic.interface.ts";
  import { uploadToStorage, getFileMetadata, deleteFromStorage } from "../_shared/supabase_storage_utils.ts";
  import { getExtensionFromMimeType } from "../_shared/path_utils.ts";
  import type { Database } from "../types_db.ts";
  import { logger } from "../_shared/logger.ts";
  import { callUnifiedAIModel } from "./callModel.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import type { ILogger } from "../_shared/types.ts";
  
  console.log("generateContribution function started");
  
  // Define Dependencies Interface
  export interface GenerateContributionsDeps {
    callUnifiedAIModel: (modelId: string, prompt: string, chatId: string, authToken: string, options?: CallUnifiedAIModelOptions) => Promise<UnifiedAIResponse>;
    uploadToStorage: typeof uploadToStorage;
    getFileMetadata: typeof getFileMetadata;
    deleteFromStorage: typeof deleteFromStorage;
    getExtensionFromMimeType: typeof getExtensionFromMimeType;
    logger: ILogger;
    randomUUID: () => string;
  }
  
  // Define default dependencies
  const defaultGenerateContributionsDeps: GenerateContributionsDeps = {
    callUnifiedAIModel: callUnifiedAIModel,
    uploadToStorage: uploadToStorage,
    getFileMetadata: getFileMetadata,
    deleteFromStorage: deleteFromStorage,
    getExtensionFromMimeType: getExtensionFromMimeType,
    logger: logger,
    randomUUID: crypto.randomUUID,
  };

export async function generateStageContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateStageContributionsPayload,
    authToken: string, 
    partialDeps?: Partial<GenerateContributionsDeps> 
  ): Promise<{ success: boolean; data?: GenerateStageContributionsSuccessResponse; error?: { message: string; status?: number; details?: string; code?: string } }> {
    const deps = { ...defaultGenerateContributionsDeps, ...partialDeps };
    const { logger, callUnifiedAIModel, uploadToStorage, getFileMetadata, deleteFromStorage, getExtensionFromMimeType, randomUUID } = deps;

    const { sessionId } = payload;
    logger.info(`[generateStageContributions] Starting for session ID: ${sessionId}`);
    const BUCKET_NAME = 'dialectic-contributions'; // Define bucket name
    // const ASSUMED_CONTENT_TYPE = "text/markdown"; // No longer needed here as we use determinedContentType
  
    try {
      // 1. Fetch session details: project_id, initial_user_prompt, selected_domain_tag, and selected_model_catalog_ids
      const { data: sessionDetails, error: sessionError } = await dbClient
        .from('dialectic_sessions')
        .select(
          `
          id,
          project_id,
          status,
          associated_chat_id,
          selected_model_catalog_ids, 
          dialectic_projects (
            initial_user_prompt,
            selected_domain_tag
          )
        `
        )
        .eq('id', sessionId)
        .single();
  
      if (sessionError || !sessionDetails) {
        logger.error(`[generateStageContributions] Error fetching session ${sessionId}:`, { error: sessionError });
        return { success: false, error: { message: "Session not found or error fetching details.", status: 404, details: sessionError?.message } };
      }
  
      // Based on logs, dialectic_projects is returned as a single object for this query,
      // despite types_db.ts suggesting an array. Use 'as unknown as' to bridge this.
      const projectDetails = sessionDetails.dialectic_projects as unknown as { initial_user_prompt: string; selected_domain_tag: string | null } | null | undefined;
  
      logger.info(`[generateStageContributions] Fetched session details for ${sessionId}`, {
        joinedProjectData: projectDetails,
        numSelectedModels: sessionDetails.selected_model_catalog_ids?.length ?? 0
      });
  
      if (sessionDetails.status !== 'pending_thesis') {
        logger.warn(`[generateStageContributions] Session ${sessionId} is not in 'pending_thesis' status. Current status: ${sessionDetails.status}`);
        return { success: false, error: { message: `Session is not in 'pending_thesis' status. Current status: ${sessionDetails.status}`, status: 400 } };
      }
  
      // projectDetails is already the object we need, or null/undefined if not found.
      if (!projectDetails) {
          logger.error(`[generateStageContributions] Project details (from joined dialectic_projects table) not found for session ${sessionId}.`, { joinedData: sessionDetails.dialectic_projects });
          return { success: false, error: { message: "Project details (from joined dialectic_projects table) not found for session.", status: 500 } };
      }
      
      const { initial_user_prompt, selected_domain_tag } = projectDetails;
      if (!initial_user_prompt) {
          logger.error(`[generateStageContributions] Initial user prompt is missing for session ${sessionId}`);
          return { success: false, error: { message: "Initial user prompt is missing for session.", status: 500 } };
      }
  
      const associatedChatId = sessionDetails.associated_chat_id;
      if (!associatedChatId) {
          logger.error(`[generateStageContributions] Associated chat ID is missing for session ${sessionId}`);
          return { success: false, error: { message: "Associated chat ID is missing for session.", status: 500 } };
      }
  
      if (!sessionDetails.selected_model_catalog_ids || sessionDetails.selected_model_catalog_ids.length === 0) {
        logger.error(`[generateStageContributions] No models selected for session ${sessionId} (selected_model_catalog_ids is null or empty).`);
        return { success: false, error: { message: "No models selected for this session.", status: 400, code: 'NO_MODELS_SELECTED' } };
      }
  
      const successfulContributions: Database['public']['Tables']['dialectic_contributions']['Row'][] = [];
      const failedContributionAttempts: {
        modelId: string; // This is ai_providers.id
        modelName?: string;
        providerName?: string | null;
        error: string;
        details?: string;
        code?: string;
        inputTokens?: number;
        outputTokens?: number;
        processingTimeMs?: number;
      }[] = [];
  
  
      for (const modelCatalogId of sessionDetails.selected_model_catalog_ids) {
        // Fetch AI provider details for this modelCatalogId
        const { data: providerData, error: providerError } = await dbClient
          .from('ai_providers')
          .select('id, provider, name, api_identifier') // Use direct field names as per types_db
          .eq('id', modelCatalogId)
          .single();
  
        if (providerError || !providerData) {
          logger.error(`[generateStageContributions] Failed to fetch AI Provider details for model ID ${modelCatalogId}. Session ${sessionId}.`, { error: providerError });
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
        const modelIdentifier = `${providerDetails.provider || 'Unknown Provider'} - ${providerDetails.name} (ProviderID: ${modelIdForCall}, API_ID: ${providerDetails.api_identifier})`;
        logger.info(`[generateStageContributions] Processing model: ${modelIdentifier} for session ${sessionId}`);
  
        try {
          // TODO: Implement proper prompt rendering using project's initial_user_prompt and selected_domain_tag
          // For now, using initial_user_prompt directly.
          const renderedPrompt = initial_user_prompt; 
          logger.debug(`[generateStageContributions] Rendered prompt for ${modelIdentifier}:`, { prompt: renderedPrompt.substring(0, 100) + "..."});
  
  
          const aiResponse = await callUnifiedAIModel(
            modelIdForCall,
            renderedPrompt,
            associatedChatId,
            authToken,
            // TODO: Pass system_prompt_id if available from session/project setup
          );
          logger.info(`[generateStageContributions] AI response received from ${modelIdentifier}`, { hasError: !!aiResponse.error, tokens: {in: aiResponse.inputTokens, out: aiResponse.outputTokens} });
  
  
          if (aiResponse.error || !aiResponse.content) {
            logger.error(`[generateStageContributions] Error from callUnifiedAIModel for ${modelIdentifier}:`, { error: aiResponse.error });
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
          // Use contentType from aiResponse, fallback to a default if not present
          const determinedContentType = aiResponse.contentType || "text/markdown";
          const fileExtension = getExtensionFromMimeType(determinedContentType);
          const contributionId = randomUUID();
  
          const contentStoragePath = `projects/${sessionDetails.project_id}/sessions/${sessionId}/contributions/${contributionId}/thesis${fileExtension}`;
          const rawResponseStoragePath = `projects/${sessionDetails.project_id}/sessions/${sessionId}/contributions/${contributionId}/raw_thesis_response.json`;
  
          logger.info(`[generateStageContributions] Uploading content for ${modelIdentifier} to: ${contentStoragePath}`);
          const { error: contentUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, contentStoragePath, contributionContent, { contentType: determinedContentType });
          if (contentUploadError) {
            logger.error(`[generateStageContributions] Failed to upload content for ${modelIdentifier} to ${contentStoragePath}:`, { error: contentUploadError });
            failedContributionAttempts.push({
              modelId: modelIdForCall,
              modelName: providerDetails.name,
              providerName: providerDetails.provider,
              error: "Failed to upload contribution content.",
              details: contentUploadError.message,
              code: 'STORAGE_UPLOAD_ERROR'
            });
            continue;
          }
          logger.info(`[generateStageContributions] Content uploaded successfully for ${modelIdentifier}`);
  
          logger.info(`[generateStageContributions] Uploading raw response for ${modelIdentifier} to: ${rawResponseStoragePath}`);
          const { error: rawResponseUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, rawResponseStoragePath, JSON.stringify(aiResponse.rawProviderResponse || {}), { contentType: "application/json" });
          if (rawResponseUploadError) {
            logger.warn(`[generateStageContributions] Failed to upload raw AI response for ${modelIdentifier} to ${rawResponseStoragePath}:`, { error: rawResponseUploadError });
            // Non-critical, log and continue, but maybe add to a "warnings" array in the future.
          } else {
              logger.info(`[generateStageContributions] Raw response uploaded successfully for ${modelIdentifier}`);
          }
          
          let contentSizeBytes = 0;
          try {
              const metadata = await getFileMetadata(dbClient, BUCKET_NAME, contentStoragePath);
              if (metadata && !metadata.error && metadata.size !== undefined) {
                  contentSizeBytes = metadata.size;
                  logger.info(`[generateStageContributions] Fetched metadata for ${contentStoragePath}, size: ${contentSizeBytes}`);
              } else {
                  logger.warn(`[generateStageContributions] Could not get file metadata for ${contentStoragePath}. File not found, no metadata returned, or error. Defaulting size to 0.`, { error: metadata?.error });
              }
          } catch (metaError) {
              logger.warn(`[generateStageContributions] Error fetching metadata for ${contentStoragePath}. Defaulting size to 0.`, { error: metaError });
          }
  
  
          logger.info(`[generateStageContributions] Inserting contribution to DB for ${modelIdentifier}`);
          const { data: dbContribution, error: dbInsertError } = await dbClient
            .from('dialectic_contributions')
            .insert({
              session_id: sessionId,
              model_id: modelIdForCall, 
              model_name: providerDetails.name, 
              user_id: null,
              parent_contribution_id: null,
              stage: payload.stage, // Use dynamic stage from payload
              content_storage_bucket: BUCKET_NAME, // Ensure the bucket name is included
              content_storage_path: contentStoragePath,
              content_mime_type: determinedContentType, // Use the determinedContentType from aiResponse
              raw_response_storage_path: rawResponseStoragePath,
              tokens_used_input: aiResponse.inputTokens, // This should come from aiResponse.tokenUsage.prompt_tokens
              tokens_used_output: aiResponse.outputTokens, // This should come from aiResponse.tokenUsage.completion_tokens
              content_size_bytes: contentSizeBytes,
              processing_time_ms: aiResponse.processingTimeMs,
              // model_name, provider_name can be joined if needed later
            })
            .select()
            .single();
  
          if (dbInsertError) {
            logger.error(`[generateStageContributions] Error inserting contribution to DB for ${modelIdentifier}:`, { error: dbInsertError });
            // Attempt to delete orphaned storage files if DB insert fails
            logger.warn(`[generateStageContributions] Attempting to clean up storage for failed DB insert for ${modelIdentifier}`);
            await deleteFromStorage(dbClient, BUCKET_NAME, [contentStoragePath]).catch(e => logger.error(`Cleanup error for ${contentStoragePath}:`, {error: e}));
            await deleteFromStorage(dbClient, BUCKET_NAME, [rawResponseStoragePath]).catch(e => logger.error(`Cleanup error for ${rawResponseStoragePath}:`, {error: e}));
            failedContributionAttempts.push({
              modelId: modelIdForCall,
              modelName: providerDetails.name,
              providerName: providerDetails.provider,
              error: "Failed to insert contribution into database.",
              details: dbInsertError.message,
              code: dbInsertError.code || 'DB_INSERT_ERROR'
            });
            continue;
          }
          logger.info(`[generateStageContributions] Contribution inserted to DB successfully for ${modelIdentifier}`, { contributionId: dbContribution.id });
          successfulContributions.push(dbContribution);
  
        } catch (modelProcessingError) {
          logger.error(`[generateStageContributions] Unhandled error processing model ${modelIdentifier}:`, { error: modelProcessingError });
          failedContributionAttempts.push({
            modelId: modelIdForCall,
            modelName: providerDetails.name,
            providerName: providerDetails.provider,
            error: "Unhandled error during model processing.",
            details: modelProcessingError instanceof Error ? modelProcessingError.message : String(modelProcessingError),
            code: 'MODEL_PROCESSING_ERROR'
          });
        }
      } // End of for...of modelCatalogId loop
  
      logger.info(`[generateStageContributions] Finished processing all models for session ${sessionId}`, { successful: successfulContributions.length, failed: failedContributionAttempts.length });
  
      if (successfulContributions.length === 0 && sessionDetails.selected_model_catalog_ids.length > 0) { // Check if models were supposed to run
        logger.error(`[generateStageContributions] All models failed to generate contributions for session ${sessionId}`, { errors: failedContributionAttempts });
        // Return a generic error, but include details of all failures
        const errorDetails = failedContributionAttempts.map(f => `Model (ID ${f.modelId}, Name: ${f.modelName || 'N/A'}): ${f.error} (${f.details || f.code})`).join('; ');
        return {
          success: false,
          error: {
            message: "All models failed to generate stage contributions.",
            status: 500,
            details: errorDetails
          }
        };
      }
  
      // If at least one contribution was successful
      const finalStatus = failedContributionAttempts.length > 0 ? 'thesis_generation_partial' : 'thesis_generation_complete';
      
      logger.info(`[generateStageContributions] Updating session ${sessionId} status to: ${finalStatus}`);
      const { error: sessionUpdateError } = await dbClient
        .from('dialectic_sessions')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
  
      if (sessionUpdateError) {
        // This is tricky. Contributions were made, but session status update failed.
        // Log heavily. The client will still get the successful contributions.
        // The session status might be stale, requiring manual intervention or a retry mechanism for status updates.
        logger.error(`[generateStageContributions] CRITICAL: Failed to update session status for ${sessionId} to ${finalStatus}, but contributions were made. Error:`, { error: sessionUpdateError });
      } else {
          logger.info(`[generateStageContributions] Session ${sessionId} status updated to ${finalStatus}`);
      }
      
      const responseData: GenerateStageContributionsSuccessResponse = {
        message: failedContributionAttempts.length > 0 
          ? `Stage generation partially complete for session ${sessionId}. ${successfulContributions.length} succeeded, ${failedContributionAttempts.length} failed.`
          : `Stage generation fully complete for session ${sessionId}.`,
        sessionId: sessionId,
        status: finalStatus,
        contributions: successfulContributions as unknown as DialecticContribution[],
        errors: failedContributionAttempts.length > 0 ? failedContributionAttempts.map(f => ({
            modelId: f.modelId, 
            modelName: f.modelName, // Propagated from failedContributionAttempts
            providerName: f.providerName, // Propagated from failedContributionAttempts
            message: f.error,
            details: `Code: ${f.code || 'N/A'}, Details: ${f.details || 'N/A'}${f.inputTokens !== undefined ? `, Input Tokens: ${f.inputTokens}` : ''}${f.outputTokens !== undefined ? `, Output Tokens: ${f.outputTokens}` : ''}${f.processingTimeMs !== undefined ? `, Processing Time: ${f.processingTimeMs}ms` : ''}`
        })) : undefined,
      };
      
      logger.info(`[generateStageContributions] Successfully completed for session ${sessionId}. Status: ${finalStatus}`, { numSuccess: successfulContributions.length, numFailed: failedContributionAttempts.length });
      return { success: true, data: responseData };
  
    } catch (error) {
      logger.error(`[generateStageContributions] Critical unhandled error in generateStageContributions for session ${payload.sessionId}:`, { error });
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
  