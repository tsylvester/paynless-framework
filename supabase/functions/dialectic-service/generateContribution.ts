// deno-lint-ignore-file no-explicit-any
import { 
    GenerateStageContributionsPayload, 
    GenerateStageContributionsSuccessResponse, 
    SelectedAiProvider,
    DialecticContribution,
    UnifiedAIResponse,
    CallUnifiedAIModelOptions
  } from "./dialectic.interface.ts";
  import { uploadToStorage as originalUploadToStorage, getFileMetadata as originalGetFileMetadata, deleteFromStorage as originalDeleteFromStorage } from "../_shared/supabase_storage_utils.ts";
  import { getExtensionFromMimeType as originalGetExtensionFromMimeType } from "../_shared/path_utils.ts";
  import type {

  } from "../_shared/types.ts";
  import type { Database } from "../types_db.ts";
  import { logger as originalLogger, type Logger } from "../_shared/logger.ts";
  import { callUnifiedAIModel as originalCallUnifiedAIModel } from "./callModel.ts";
  import { createSupabaseAdminClient } from "../_shared/auth.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  
  console.log("generateContribution function started");
  
  // Define Dependencies Interface
  export interface GenerateContributionsDeps {
    callUnifiedAIModel: (modelId: string, prompt: string, chatId: string, authToken: string, options?: CallUnifiedAIModelOptions) => Promise<UnifiedAIResponse>;
    uploadToStorage: typeof originalUploadToStorage;
    getFileMetadata: typeof originalGetFileMetadata;
    deleteFromStorage: typeof originalDeleteFromStorage;
    getExtensionFromMimeType: typeof originalGetExtensionFromMimeType;
    logger: Logger;
    randomUUID: () => string;
  }
  
  // Define default dependencies
  const defaultGenerateContributionsDeps: GenerateContributionsDeps = {
    callUnifiedAIModel: originalCallUnifiedAIModel,
    uploadToStorage: originalUploadToStorage,
    getFileMetadata: originalGetFileMetadata,
    deleteFromStorage: originalDeleteFromStorage,
    getExtensionFromMimeType: originalGetExtensionFromMimeType,
    logger: originalLogger,
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
  
    try {
      // 1. Fetch session details: project_id, initial_user_prompt, selected_domain_tag, and selected models
      const { data: sessionDetails, error: sessionError } = await dbClient
        .from('dialectic_sessions')
        .select(
          `
          id,
          project_id,
          status,
          associated_chat_id,
          dialectic_projects (
            initial_user_prompt,
            selected_domain_tag
          ),
          dialectic_session_models (
            id,
            model_id,
            ai_providers (
              id,
              provider_name: provider,
              model_name: name,
              api_identifier
            )
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
        joinedProjectData: projectDetails, // Log the raw joined data
        numModels: sessionDetails.dialectic_session_models.length 
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
  
      const successfulContributions: Database['public']['Tables']['dialectic_contributions']['Row'][] = []; // Typed contributions
      const failedContributionAttempts: { modelId: string; sessionModelId: string; error: string; details?: string; code?: string; inputTokens?: number; outputTokens?: number, cost?: number, processingTimeMs?: number }[] = [];
  
  
      for (const sessionModel of sessionDetails.dialectic_session_models) {
        // Runtime logs show ai_providers is a single object here due to the to-one join from dialectic_session_models.
        // The `as unknown` is to bridge the gap if types_db.ts generally types it as an array.
        const providerDetails = sessionModel.ai_providers as unknown as SelectedAiProvider | null | undefined;
  
        if (!providerDetails || typeof providerDetails !== 'object') {
          logger.error(`[generateStageContributions] AI Provider details (expected as direct object) missing or not an object for sessionModel ${sessionModel.id} (model_id: ${sessionModel.model_id}). Value: ${JSON.stringify(providerDetails)}`);
          failedContributionAttempts.push({
            modelId: sessionModel.model_id, 
            sessionModelId: sessionModel.id,
            error: "AI Provider details (expected as direct object from joined 'ai_providers' table) missing, null, or not an object.",
            code: 'PROVIDER_DETAILS_OBJECT_ISSUE' 
          });
          continue;
        }
  
        const modelId = providerDetails.id; 
        const sessionModelId = sessionModel.id; // This is dialectic_session_models.id
        const modelIdentifier = `${providerDetails.provider_name} - ${providerDetails.model_name} (SM_ID: ${sessionModelId}, ProviderID: ${modelId}, API_ID: ${providerDetails.api_identifier})`;
        logger.info(`[generateStageContributions] Processing model: ${modelIdentifier} for session ${sessionId}`);
  
        try {
          // TODO: Implement proper prompt rendering using project's initial_user_prompt and selected_domain_tag
          // For now, using initial_user_prompt directly.
          const renderedPrompt = initial_user_prompt; 
          logger.debug(`[generateStageContributions] Rendered prompt for ${modelIdentifier}:`, { prompt: renderedPrompt.substring(0, 100) + "..."});
  
  
          const aiResponse = await callUnifiedAIModel(
            modelId,
            renderedPrompt,
            associatedChatId,
            authToken,
            // TODO: Pass system_prompt_id if available from session/project setup
          );
          logger.info(`[generateStageContributions] AI response received from ${modelIdentifier}`, { hasError: !!aiResponse.error, tokens: {in: aiResponse.inputTokens, out: aiResponse.outputTokens}, cost: aiResponse.cost });
  
  
          if (aiResponse.error || !aiResponse.content) {
            logger.error(`[generateStageContributions] Error from callUnifiedAIModel for ${modelIdentifier}:`, { error: aiResponse.error });
            failedContributionAttempts.push({ 
              modelId: modelId, 
              sessionModelId: sessionModelId,
              error: aiResponse.error || "AI model returned no content.", 
              details: typeof aiResponse.errorCode === 'string' ? aiResponse.errorCode : undefined, 
              code: aiResponse.errorCode || 'AI_CALL_FAILED',
              inputTokens: aiResponse.inputTokens,
              outputTokens: aiResponse.outputTokens,
              cost: aiResponse.cost,
              processingTimeMs: aiResponse.processingTimeMs,
            });
            continue; // Move to the next model
          }
  
          const contributionContent = aiResponse.content;
          const contentType = "text/markdown"; // Assuming markdown for now, TODO: make dynamic based on AI response or settings
          const fileExtension = getExtensionFromMimeType(contentType);
          const contributionId = randomUUID();
  
          const contentStoragePath = `projects/${sessionDetails.project_id}/sessions/${sessionId}/contributions/${contributionId}/thesis${fileExtension}`;
          const rawResponseStoragePath = `projects/${sessionDetails.project_id}/sessions/${sessionId}/contributions/${contributionId}/raw_thesis_response.json`;
  
          logger.info(`[generateStageContributions] Uploading content for ${modelIdentifier} to: ${contentStoragePath}`);
          const { error: contentUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, contentStoragePath, contributionContent, { contentType });
          if (contentUploadError) {
            logger.error(`[generateStageContributions] Failed to upload content for ${modelIdentifier} to ${contentStoragePath}:`, { error: contentUploadError });
            failedContributionAttempts.push({ 
              modelId: modelId, 
              sessionModelId: sessionModelId,
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
              session_model_id: sessionModelId, // Link to the specific dialectic_session_models.id
              user_id: null,
              parent_contribution_id: null,
              stage: 'thesis',
              content_storage_bucket: BUCKET_NAME, // Ensure the bucket name is included
              content_storage_path: contentStoragePath,
              raw_response_storage_path: rawResponseStoragePath,
              tokens_used_input: aiResponse.inputTokens,
              tokens_used_output: aiResponse.outputTokens,
              cost_usd: aiResponse.cost,
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
              modelId: modelId, 
              sessionModelId: sessionModelId,
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
            modelId: modelId,
            sessionModelId: sessionModelId,
            error: "Unhandled error during model processing.",
            details: modelProcessingError instanceof Error ? modelProcessingError.message : String(modelProcessingError),
            code: 'MODEL_PROCESSING_ERROR'
          });
        }
      } // End of for...of sessionModels loop
  
      logger.info(`[generateStageContributions] Finished processing all models for session ${sessionId}`, { successful: successfulContributions.length, failed: failedContributionAttempts.length });
  
      if (successfulContributions.length === 0) {
        logger.error(`[generateStageContributions] All models failed to generate contributions for session ${sessionId}`, { errors: failedContributionAttempts });
        // Return a generic error, but include details of all failures
        const errorDetails = failedContributionAttempts.map(f => `Model (SM_ID ${f.sessionModelId}): ${f.error} (${f.details || f.code})`).join('; ');
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
            modelId: f.modelId, // This is ai_providers.id
            // sessionModelId: f.sessionModelId, // We might want to expose this to the client if useful for retry/display
            message: f.error,
            details: `Code: ${f.code}, Details: ${f.details}${f.inputTokens !== undefined ? `, Input Tokens: ${f.inputTokens}` : ''}${f.outputTokens !== undefined ? `, Output Tokens: ${f.outputTokens}` : ''}${f.cost !== undefined ? `, Cost: ${f.cost}` : ''}${f.processingTimeMs !== undefined ? `, Processing Time: ${f.processingTimeMs}ms` : ''}`
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
  