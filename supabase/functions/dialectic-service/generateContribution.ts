// deno-lint-ignore-file no-explicit-any
import { 
    GenerateContributionsPayload, 
    GenerateContributionsSuccessResponse, 
    SelectedAiProvider,
    DialecticContribution,
    UnifiedAIResponse,
    CallUnifiedAIModelOptions,
    DialecticStage,
    FailedAttemptError,
  } from "./dialectic.interface.ts";
  import { uploadToStorage, getFileMetadata, deleteFromStorage, downloadFromStorage } from "../_shared/supabase_storage_utils.ts";
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
    downloadFromStorage: typeof downloadFromStorage;
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
    downloadFromStorage: downloadFromStorage,
    getExtensionFromMimeType: getExtensionFromMimeType,
    logger: logger,
    randomUUID: crypto.randomUUID,
  };

export async function generateContributions(
    dbClient: SupabaseClient<Database>,
    payload: GenerateContributionsPayload,
    authToken: string, 
    partialDeps?: Partial<GenerateContributionsDeps> 
  ): Promise<{ success: boolean; data?: GenerateContributionsSuccessResponse; error?: { message: string; status?: number; details?: string | FailedAttemptError[]; code?: string } }> {
    const deps = { ...defaultGenerateContributionsDeps, ...partialDeps };
    const { logger, callUnifiedAIModel, uploadToStorage, getFileMetadata, deleteFromStorage, getExtensionFromMimeType, downloadFromStorage, randomUUID } = deps;

    const { sessionId, iterationNumber, stageSlug } = payload;
    if (!stageSlug) {
      return { success: false, error: { message: "stageSlug is required in the payload.", status: 400 } };
    }

    // --- FIX: Fetch the full stage object from the database ---
    const { data: stage, error: stageError } = await dbClient
      .from('dialectic_stages')
      .select('*')
      .eq('slug', stageSlug)
      .single();

    if (stageError || !stage) {
      logger.error(`[generateContributions] Error fetching stage with slug '${stageSlug}':`, { error: stageError });
      return { success: false, error: { message: `Stage with slug '${stageSlug}' not found.`, status: 404, details: stageError?.message } };
    }
    // --- END FIX ---

    logger.info(`[generateContributions] Starting for session ID: ${sessionId}, stage: ${stage.slug}, iteration: ${iterationNumber}`);
    const BUCKET_NAME = 'dialectic-contributions';
  
    try {
      // 1. Fetch session details and project_id
      const { data: sessionDetails, error: sessionError } = await dbClient
        .from('dialectic_sessions')
        .select(
          `
          id,
          project_id,
          status,
          associated_chat_id,
          selected_model_catalog_ids
        `
        )
        .eq('id', sessionId)
        .single();
  
      if (sessionError || !sessionDetails) {
        logger.error(`[generateContributions] Error fetching session ${sessionId}:`, { error: sessionError });
        return { success: false, error: { message: "Session not found or error fetching details.", status: 404, details: sessionError?.message } };
      }
      
      const projectId = sessionDetails.project_id;
      if (!projectId) {
        logger.error(`[generateContributions] Project ID is missing for session ${sessionId}.`);
        return { success: false, error: { message: "Project ID is missing for session.", status: 500 } };
      }

      const expectedStatus = `pending_${stage.slug}`;
      if (sessionDetails.status !== expectedStatus) {
        logger.warn(`[generateContributions] Session ${sessionId} is not in '${expectedStatus}' status. Current status: ${sessionDetails.status}`);
        return { success: false, error: { message: `Session is not in '${expectedStatus}' status. Current status: ${sessionDetails.status}`, status: 400 } };
      }
  
      const associatedChatId = sessionDetails.associated_chat_id;
      if (!associatedChatId) {
          logger.error(`[generateContributions] Associated chat ID is missing for session ${sessionId}`);
          return { success: false, error: { message: "Associated chat ID is missing for session.", status: 500 } };
      }

      // 2. Derive seed prompt path and fetch its content
      const seedPromptPath = `projects/${projectId}/sessions/${sessionId}/iteration_${iterationNumber}/${stage.slug}/seed_prompt.md`;
      logger.info(`[generateContributions] Fetching seed prompt from: ${seedPromptPath}`);

      const { data: promptContentBuffer, error: promptDownloadError } = await downloadFromStorage(dbClient, BUCKET_NAME, seedPromptPath);

      if (promptDownloadError || !promptContentBuffer) {
        logger.error(`[generateContributions] Failed to download seed prompt from ${seedPromptPath}`, { error: promptDownloadError });
        return { success: false, error: { message: "Could not retrieve the seed prompt for this stage.", status: 500, details: promptDownloadError?.message } };
      }

      const renderedPrompt = new TextDecoder().decode(promptContentBuffer);
  
      if (!sessionDetails.selected_model_catalog_ids || sessionDetails.selected_model_catalog_ids.length === 0) {
        logger.error(`[generateContributions] No models selected for session ${sessionId} (selected_model_catalog_ids is null or empty).`);
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
          logger.error(`[generateContributions] Failed to fetch AI Provider details for model ID ${modelCatalogId}. Session ${sessionId}.`, { error: providerError });
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
        logger.info(`[generateContributions] Processing model: ${modelIdentifier} for session ${sessionId}`);
  
        let contentStoragePath = '';
        let rawResponseStoragePath = '';
  
        try {
          logger.debug(`[generateContributions] Rendered prompt for ${modelIdentifier}:`, { prompt: renderedPrompt.substring(0, 100) + "..."});
  
          const aiResponse = await callUnifiedAIModel(
            modelIdForCall,
            renderedPrompt,
            associatedChatId,
            authToken,
          );
          logger.info(`[generateContributions] AI response received from ${modelIdentifier}`, { hasError: !!aiResponse.error, tokens: {in: aiResponse.inputTokens, out: aiResponse.outputTokens} });
  
  
          if (aiResponse.error || !aiResponse.content) {
            logger.error(`[generateContributions] Error from callUnifiedAIModel for ${modelIdentifier}:`, { error: aiResponse.error });
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
          const fileExtension = getExtensionFromMimeType(determinedContentType);
          const contributionId = randomUUID();
  
          contentStoragePath = `projects/${projectId}/sessions/${sessionId}/contributions/${contributionId}/${stage.slug}${fileExtension}`;
          rawResponseStoragePath = `projects/${projectId}/sessions/${sessionId}/contributions/${contributionId}/raw_${stage.slug}_response.json`;
  
          logger.info(`[generateContributions] Uploading content for ${modelIdentifier} to: ${contentStoragePath}`);
          const { error: contentUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, contentStoragePath, contributionContent, { contentType: determinedContentType });
          if (contentUploadError) {
            logger.error(`[generateContributions] Failed to upload content for ${modelIdentifier} to ${contentStoragePath}:`, { error: contentUploadError });
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
          logger.info(`[generateContributions] Content uploaded successfully for ${modelIdentifier}`);
  
          logger.info(`[generateContributions] Uploading raw response for ${modelIdentifier} to: ${rawResponseStoragePath}`);
          const { error: rawResponseUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, rawResponseStoragePath, JSON.stringify(aiResponse.rawProviderResponse || {}), { contentType: "application/json" });
          if (rawResponseUploadError) {
            logger.warn(`[generateContributions] Failed to upload raw AI response for ${modelIdentifier} to ${rawResponseStoragePath}:`, { error: rawResponseUploadError });
          } else {
              logger.info(`[generateContributions] Raw response uploaded successfully for ${modelIdentifier}`);
          }
          
          let contentSizeBytes = 0;
          try {
              const metadata = await getFileMetadata(dbClient, BUCKET_NAME, contentStoragePath);
              if (metadata && !metadata.error && metadata.size !== undefined) {
                  contentSizeBytes = metadata.size;
                  logger.info(`[generateContributions] Fetched metadata for ${contentStoragePath}, size: ${contentSizeBytes}`);
              } else {
                  logger.warn(`[generateContributions] Could not get file metadata for ${contentStoragePath}. File not found, no metadata returned, or error. Defaulting size to 0.`, { error: metadata?.error });
              }
          } catch (metaError) {
              logger.warn(`[generateContributions] Error fetching metadata for ${contentStoragePath}. Defaulting size to 0.`, { error: metaError });
          }
  
  
          logger.info(`[generateContributions] Inserting contribution to DB for ${modelIdentifier}`);
          const { data: dbContribution, error: dbInsertError } = await dbClient
            .from('dialectic_contributions')
            .insert({
              id: contributionId,
              session_id: sessionId,
              model_id: modelIdForCall, 
              model_name: providerDetails.name, 
              user_id: null,
              stage: stage.slug,
              iteration_number: iterationNumber,
              seed_prompt_url: seedPromptPath,
              content_storage_bucket: BUCKET_NAME,
              content_storage_path: contentStoragePath,
              content_mime_type: determinedContentType,
              raw_response_storage_path: rawResponseStoragePath,
              tokens_used_input: aiResponse.inputTokens,
              tokens_used_output: aiResponse.outputTokens,
              content_size_bytes: contentSizeBytes,
              processing_time_ms: aiResponse.processingTimeMs,
              edit_version: 1,
              is_latest_edit: true,
              original_model_contribution_id: null,
            })
            .select()
            .single();
  
          if (dbInsertError) {
            logger.error(`[generateContributions] Error inserting contribution to DB for ${modelIdentifier}:`, { error: dbInsertError });
            throw dbInsertError; 
          }
  
          logger.info(`[generateContributions] Contribution inserted to DB successfully for ${modelIdentifier}`, { contributionId: dbContribution.id });
          successfulContributions.push(dbContribution);
  
        } catch (error) {
          const typedError = error as { code?: string; message: string; };
          logger.warn(`[generateContributions] Running storage cleanup for failed attempt by ${modelIdentifier}`);
          const filesToClean: string[] = [];
          if (contentStoragePath) {
            filesToClean.push(contentStoragePath);
          }
          if (rawResponseStoragePath) {
            filesToClean.push(rawResponseStoragePath);
          }
          
          if (filesToClean.length > 0) {
            const { error: deleteError } = await deleteFromStorage(dbClient, BUCKET_NAME, filesToClean);
            if (deleteError) {
              logger.warn(`[generateContributions] Failed to clean up storage for ${modelIdentifier}. Files: ${filesToClean.join(', ')}`, { error: deleteError });
            } else {
              logger.info(`[generateContributions] Storage cleanup successful for ${modelIdentifier}.`, { deletedFiles: filesToClean });
            }
          }

          failedContributionAttempts.push({
              modelId: modelIdForCall,
              modelName: providerDetails.name,
              providerName: providerDetails.provider,
              error: "Failed to insert contribution into database.",
              details: typedError.message,
              code: typedError.code || 'DB_INSERT_FAIL'
          });
        }
      } // End of for...of modelCatalogId loop
  
      logger.info(`[generateContributions] Finished processing all models for session ${sessionId}`, { successful: successfulContributions.length, failed: failedContributionAttempts.length });
  
      if (successfulContributions.length === 0 && sessionDetails.selected_model_catalog_ids.length > 0) { // Check if models were supposed to run
        logger.error(`[generateContributions] All models failed to generate contributions for session ${sessionId}`, { errors: failedContributionAttempts });
        // Update session status to indicate failure
        const failedStatus = `${stage.slug}_generation_failed`;
        await dbClient.from('dialectic_sessions').update({ status: failedStatus }).eq('id', sessionId);

        return {
          success: false,
          error: {
            message: "All models failed to generate stage contributions.",
            status: 500,
            details: failedContributionAttempts,
          }
        };
      }
  
      // If at least one contribution was successful
      const finalStatus = failedContributionAttempts.length > 0 ? `${stage.slug}_generation_partial` : `${stage.slug}_generation_complete`;
      
      logger.info(`[generateContributions] Updating session ${sessionId} status to: ${finalStatus}`);
      const { error: sessionUpdateError } = await dbClient
        .from('dialectic_sessions')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
  
      if (sessionUpdateError) {
        // This is tricky. Contributions were made, but session status update failed.
        // Log heavily. The client will still get the successful contributions.
        // The session status might be stale, requiring manual intervention or a retry mechanism for status updates.
        logger.error(`[generateContributions] CRITICAL: Failed to update session status for ${sessionId} to ${finalStatus}, but contributions were made. Error:`, { error: sessionUpdateError });
      } else {
          logger.info(`[generateContributions] Session ${sessionId} status updated to ${finalStatus}`);
      }
      
      const responseData: GenerateContributionsSuccessResponse = {
        message: failedContributionAttempts.length > 0 
          ? `Stage generation partially complete for session ${sessionId}. ${successfulContributions.length} succeeded, ${failedContributionAttempts.length} failed.`
          : `Stage generation fully complete for session ${sessionId}.`,
        sessionId: sessionId,
        status: finalStatus,
        contributions: successfulContributions.map(c => ({
          ...c,
          parent_contribution_id: c.target_contribution_id,
          stage: c.stage || '', 
          citations: c.citations ? (c.citations as any[]).map(cit => ({ text: cit.text, url: cit.url })) : null,
        })) as any as DialecticContribution[],
        errors: failedContributionAttempts.length > 0 ? failedContributionAttempts.map(f => ({
            modelId: f.modelId, 
            modelName: f.modelName, // Propagated from failedContributionAttempts
            providerName: f.providerName, // Propagated from failedContributionAttempts
            message: f.error,
            details: `Code: ${f.code || 'N/A'}, Details: ${f.details || 'N/A'}${f.inputTokens !== undefined ? `, Input Tokens: ${f.inputTokens}` : ''}${f.outputTokens !== undefined ? `, Output Tokens: ${f.outputTokens}` : ''}${f.processingTimeMs !== undefined ? `, Processing Time: ${f.processingTimeMs}ms` : ''}`
        })) : undefined,
      };
      
      logger.info(`[generateContributions] Successfully completed for session ${sessionId}. Status: ${finalStatus}`, { numSuccess: successfulContributions.length, numFailed: failedContributionAttempts.length });
      return { success: true, data: responseData };
  
    } catch (error) {
      logger.error(`[generateContributions] Critical unhandled error in generateContributions for session ${payload.sessionId}:`, { error });
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
  