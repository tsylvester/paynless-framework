// deno-lint-ignore-file no-explicit-any
import { 
  DialecticServiceRequest, 
  CreateProjectPayload, 
  UpdateProjectDomainTagPayload, 
  StartSessionPayload, 
  GenerateThesisContributionsPayload, 
  StartSessionSuccessResponse, 
  GenerateThesisContributionsSuccessResponse, 
  CallUnifiedAIModelOptions, 
  UnifiedAIResponse,
  SelectedAiProvider
} from "./dialectic.interface.ts";
import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { createSupabaseAdminClient, createSupabaseClient } from "../_shared/auth.ts";
import { DomainOverlayItem, extractDistinctDomainTags, isValidDomainTag } from "../_shared/domain-utils.ts";
import { uploadToStorage, getFileMetadata, deleteFromStorage } from "../_shared/supabase_storage_utils.ts";
import { getExtensionFromMimeType } from "../_shared/path_utils.ts";
import type {
    ChatApiRequest,
    TokenUsage,
    ChatHandlerSuccessResponse,
    ChatMessageRole
} from "../_shared/types.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
console.log("dialectic-service function started");

// Initialize Supabase admin client once
const supabaseAdmin = createSupabaseAdminClient();

// Extracted helper function

// DomainOverlayItem and extractDistinctDomainTags are now imported

async function listAvailableDomainTags(dbClient: typeof supabaseAdmin) {
  const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('domain_tag')
    .neq('domain_tag', null);

  if (error) {
    console.error("Error fetching domain tags:", error);
    return { error: { message: "Failed to fetch domain tags", details: error.message, status: 500 } };
  }

  // Use the imported utility function
  const distinctTags = extractDistinctDomainTags(data as DomainOverlayItem[]);
  return { data: distinctTags };
}

async function updateProjectDomainTag(
  req: Request,
  dbAdminClient: typeof supabaseAdmin,
  payload: UpdateProjectDomainTagPayload
) {
  const { projectId, domainTag } = payload;

  if (!projectId) {
    return { error: { message: "projectId is required", status: 400 } };
  }

  const supabaseUserClient = createSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    console.warn("User not authenticated for updateProjectDomainTag", userError);
    return { error: { message: "User not authenticated", status: 401 } };
  }

  if (domainTag !== null) {
    const tagIsValid = await isValidDomainTag(dbAdminClient, domainTag);
    if (!tagIsValid) {
      return { error: { message: `Invalid domainTag: "${domainTag}"`, status: 400 } };
    }
  }

  const { data: projectData, error: projectError } = await dbAdminClient
    .from('dialectic_projects')
    .update({ selected_domain_tag: domainTag, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id)
    .select('id, project_name, selected_domain_tag, updated_at')
    .single();

  if (projectError) {
    console.error("Error updating project domain tag:", projectError);
    if (projectError.code === 'PGRST116') {
        return { error: { message: "Project not found or access denied", status: 404 } };
    }
    return { error: { message: "Failed to update project domain tag", details: projectError.message, status: 500 } };
  }

  if (!projectData) {
    return { error: { message: "Project not found or access denied after update attempt", status: 404 } };
  }

  return { data: projectData };
}

async function createProject(
  req: Request,
  dbAdminClient: typeof supabaseAdmin,
  payload: CreateProjectPayload
) {
  const { projectName, initialUserPrompt, selected_domain_tag } = payload;

  if (!projectName || !initialUserPrompt) {
    return { error: { message: "projectName and initialUserPrompt are required", status: 400 } };
  }

  const supabaseUserClient = createSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    console.warn("User not authenticated for createProject", userError);
    return { error: { message: "User not authenticated", status: 401 } };
  }

  if (selected_domain_tag) {
    const tagIsValid = await isValidDomainTag(dbAdminClient, selected_domain_tag);
    if (!tagIsValid) {
      return { error: { message: `Invalid selectedDomainTag: "${selected_domain_tag}"`, status: 400 } };
    }
  }

  const { data: newProjectData, error: createError } = await dbAdminClient
    .from('dialectic_projects')
    .insert({
      user_id: user.id,
      project_name: projectName,
      initial_user_prompt: initialUserPrompt,
      selected_domain_tag: selected_domain_tag,
      // status is 'active' by default due to table definition
      // created_at and updated_at are handled by default in table definition
    })
    .select() // Select all columns of the new project
    .single();

  if (createError) {
    console.error("Error creating project:", createError);
    // Check for specific DB errors if needed, e.g., unique constraint violation
    return { error: { message: "Failed to create project", details: createError.message, status: 500 } };
  }

  if (!newProjectData) {
    // This case should ideally not be reached if insert was successful without error
    // but as a safeguard.
    return { error: { message: "Failed to create project, no data returned.", status: 500 }};
  }
  
  return { data: newProjectData };
}


// DomainOverlayItem and extractDistinctDomainTags are now imported

async function startSession(
  req: Request, // For user authentication
  dbClient: typeof supabaseAdmin,
  payload: StartSessionPayload
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string } }> {
  console.log("startSession called with payload:", payload);
  const {
      projectId,
      selectedModelCatalogIds,
      sessionDescription,
      thesisPromptTemplateName,
      antithesisPromptTemplateName,
      originatingChatId
  } = payload;

  // 1. Verify user and project ownership (critical)
  const supabaseUserClient = createSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
  if (userError || !user) {
    return { error: { message: "User not authenticated", status: 401 } };
  }

  const { data: project, error: projectError } = await dbClient
    .from('dialectic_projects')
    .select('id, user_id, initial_user_prompt, selected_domain_tag')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
    console.error("Error fetching project or project not found/access denied:", projectError);
    const status = (projectError && projectError.code === 'PGRST116') || !project ? 404 : 500;
    return { error: { message: "Project not found or access denied.", status } };
  }

  // 2. Fetch prompt template IDs (thesis, antithesis)
  let thesisPromptId: string | null = null;
  let antithesisPromptId: string | null = null;
  let thesisPromptText: string | null = null;

  try {
    let thesisQuery = dbClient.from('system_prompts').select('id, prompt_text').eq('is_active', true);
    if (thesisPromptTemplateName) {
      thesisQuery = thesisQuery.eq('name', thesisPromptTemplateName);
    } else {
      thesisQuery = thesisQuery.eq('stage_association', 'thesis').eq('is_stage_default', true)
                   .eq('context', project.selected_domain_tag || 'general');
    }
    const { data: thesisP, error: thesisErr } = await thesisQuery.maybeSingle(); 
    if (thesisErr) throw new Error(`Error fetching thesis prompt: ${thesisErr.message}`);
    if (!thesisP) throw new Error(`No suitable thesis prompt found for name '${thesisPromptTemplateName || "default"}' or default for context '${project.selected_domain_tag || 'general'}'.`);
    thesisPromptId = thesisP.id;
    thesisPromptText = thesisP.prompt_text;

    let antithesisQuery = dbClient.from('system_prompts').select('id').eq('is_active', true);
    if (antithesisPromptTemplateName) {
      antithesisQuery = antithesisQuery.eq('name', antithesisPromptTemplateName);
    } else {
      antithesisQuery = antithesisQuery.eq('stage_association', 'antithesis').eq('is_stage_default', true)
                   .eq('context', project.selected_domain_tag || 'general');
    }
    const { data: antithesisP, error: antithesisErr } = await antithesisQuery.maybeSingle();
    if (antithesisErr) throw new Error(`Error fetching antithesis prompt: ${antithesisErr.message}`);
    if (!antithesisP) throw new Error(`No suitable antithesis prompt found for name '${antithesisPromptTemplateName || "default"}' or default for context '${project.selected_domain_tag || 'general'}'.`);
    antithesisPromptId = antithesisP.id;

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Prompt fetching error:", errorMessage);
    return { error: { message: errorMessage, status: 400 } };
  }
  
  // Determine associated_chat_id
  // If originatingChatId is provided, use it. Otherwise, generate a new UUID for this dialectic session's chat interactions.
  const associatedChatId = originatingChatId || crypto.randomUUID();

  // 3. & 5. Create dialectic_sessions record with status 'pending_thesis'
  const sessionStatus = 'pending_thesis';
  const { data: sessionData, error: sessionInsertError } = await dbClient
    .from('dialectic_sessions')
    .insert({
      project_id: project.id,
      session_description: sessionDescription,
      active_thesis_prompt_template_id: thesisPromptId,
      active_antithesis_prompt_template_id: antithesisPromptId,
      status: sessionStatus,
      iteration_count: 1, 
      associated_chat_id: associatedChatId, // Store the chat ID
    })
    .select('id') 
    .single();

  if (sessionInsertError || !sessionData) {
    console.error("Error inserting dialectic session:", sessionInsertError);
    return { error: { message: "Failed to create session.", details: sessionInsertError?.message, status: 500 } };
  }
  const newSessionId = sessionData.id;

  // 4. Create dialectic_session_models records
  const sessionModelsData = selectedModelCatalogIds.map(modelId => ({
    session_id: newSessionId,
    model_id: modelId, 
  }));

  const { error: sessionModelsInsertError } = await dbClient
    .from('dialectic_session_models')
    .insert(sessionModelsData);

  if (sessionModelsInsertError) {
    console.error("Error inserting session models:", sessionModelsInsertError);
    await dbClient.from('dialectic_sessions').delete().eq('id', newSessionId); 
    return { error: { message: "Failed to associate models with session.", details: sessionModelsInsertError.message, status: 500 } };
  }

  // 6. Construct and store current_stage_seed_prompt
  const currentStageSeedPrompt = `Rendered Thesis Prompt: ${thesisPromptText}
Initial User Prompt: ${project.initial_user_prompt}`;
  
  const { data: updatedSession, error: updateSessionError } = await dbClient
    .from('dialectic_sessions')
    .update({ current_stage_seed_prompt: currentStageSeedPrompt })
    .eq('id', newSessionId)
    .select('id') 
    .single();

  if (updateSessionError || !updatedSession) {
      console.error("Error updating session with seed prompt:", updateSessionError);
      return { error: { message: "Failed to set initial prompt for session.", details: updateSessionError?.message, status: 500 } };
  }

  // 7. `startSession` concludes. Thesis generation triggered by separate user action.
  console.log(`Session ${newSessionId} started successfully. Associated chat ID for /chat interactions: ${associatedChatId}. Waiting for user to trigger thesis generation.`);

  return { 
      data: { 
          message: "Session started successfully", 
          sessionId: newSessionId, 
          initialStatus: sessionStatus,
          associatedChatId: associatedChatId,
      } 
  }; 
}

async function generateThesisContributions(
  dbClient: typeof supabaseAdmin,
  payload: GenerateThesisContributionsPayload,
  authToken: string 
): Promise<{ success: boolean; data?: GenerateThesisContributionsSuccessResponse; error?: { message: string; status?: number; details?: string } }> {
  const { sessionId } = payload;
  logger.info(`[generateThesisContributions] Starting for session ID: ${sessionId}`);
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
      logger.error(`[generateThesisContributions] Error fetching session ${sessionId}:`, { error: sessionError });
      return { success: false, error: { message: "Session not found or error fetching details.", status: 404, details: sessionError?.message } };
    }

    // Based on logs, dialectic_projects is returned as a single object for this query,
    // despite types_db.ts suggesting an array. Use 'as unknown as' to bridge this.
    const projectDetails = sessionDetails.dialectic_projects as unknown as { initial_user_prompt: string; selected_domain_tag: string | null } | null | undefined;

    logger.info(`[generateThesisContributions] Fetched session details for ${sessionId}`, { 
      joinedProjectData: projectDetails, // Log the raw joined data
      numModels: sessionDetails.dialectic_session_models.length 
    });

    if (sessionDetails.status !== 'pending_thesis') {
      logger.warn(`[generateThesisContributions] Session ${sessionId} is not in 'pending_thesis' status. Current status: ${sessionDetails.status}`);
      return { success: false, error: { message: `Session is not in 'pending_thesis' status. Current status: ${sessionDetails.status}`, status: 400 } };
    }

    // projectDetails is already the object we need, or null/undefined if not found.
    if (!projectDetails) {
        logger.error(`[generateThesisContributions] Project details (from joined dialectic_projects table) not found for session ${sessionId}.`, { joinedData: sessionDetails.dialectic_projects });
        return { success: false, error: { message: "Project details (from joined dialectic_projects table) not found for session.", status: 500 } };
    }
    
    const { initial_user_prompt, selected_domain_tag } = projectDetails;
    if (!initial_user_prompt) {
        logger.error(`[generateThesisContributions] Initial user prompt is missing for session ${sessionId}`);
        return { success: false, error: { message: "Initial user prompt is missing for session.", status: 500 } };
    }

    const associatedChatId = sessionDetails.associated_chat_id;
    if (!associatedChatId) {
        logger.error(`[generateThesisContributions] Associated chat ID is missing for session ${sessionId}`);
        return { success: false, error: { message: "Associated chat ID is missing for session.", status: 500 } };
    }

    const successfulContributions: Database['public']['Tables']['dialectic_contributions']['Row'][] = []; // Typed contributions
    const failedContributionAttempts: { modelId: string; sessionModelId: string; error: string; details?: string; code?: string; inputTokens?: number; outputTokens?: number, cost?: number, processingTimeMs?: number }[] = [];


    for (const sessionModel of sessionDetails.dialectic_session_models) {
      // Runtime logs show ai_providers is a single object here due to the to-one join from dialectic_session_models.
      // The `as unknown` is to bridge the gap if types_db.ts generally types it as an array.
      const providerDetails = sessionModel.ai_providers as unknown as SelectedAiProvider | null | undefined;

      if (!providerDetails || typeof providerDetails !== 'object') {
        logger.error(`[generateThesisContributions] AI Provider details (expected as direct object) missing or not an object for sessionModel ${sessionModel.id} (model_id: ${sessionModel.model_id}). Value: ${JSON.stringify(providerDetails)}`);
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
      logger.info(`[generateThesisContributions] Processing model: ${modelIdentifier} for session ${sessionId}`);

      try {
        // TODO: Implement proper prompt rendering using project's initial_user_prompt and selected_domain_tag
        // For now, using initial_user_prompt directly.
        const renderedPrompt = initial_user_prompt; 
        logger.debug(`[generateThesisContributions] Rendered prompt for ${modelIdentifier}:`, { prompt: renderedPrompt.substring(0, 100) + "..."});


        const aiResponse = await callUnifiedAIModel(
          modelId,
          renderedPrompt,
          associatedChatId,
          authToken,
          // TODO: Pass system_prompt_id if available from session/project setup
        );
        logger.info(`[generateThesisContributions] AI response received from ${modelIdentifier}`, { hasError: !!aiResponse.error, tokens: {in: aiResponse.inputTokens, out: aiResponse.outputTokens}, cost: aiResponse.cost });


        if (aiResponse.error || !aiResponse.content) {
          logger.error(`[generateThesisContributions] Error from callUnifiedAIModel for ${modelIdentifier}:`, { error: aiResponse.error });
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
        const contributionId = crypto.randomUUID();

        const contentStoragePath = `projects/${sessionDetails.project_id}/sessions/${sessionId}/contributions/${contributionId}/thesis${fileExtension}`;
        const rawResponseStoragePath = `projects/${sessionDetails.project_id}/sessions/${sessionId}/contributions/${contributionId}/raw_thesis_response.json`;

        logger.info(`[generateThesisContributions] Uploading content for ${modelIdentifier} to: ${contentStoragePath}`);
        const { error: contentUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, contentStoragePath, contributionContent, { contentType });
        if (contentUploadError) {
          logger.error(`[generateThesisContributions] Failed to upload content for ${modelIdentifier} to ${contentStoragePath}:`, { error: contentUploadError });
          failedContributionAttempts.push({ 
            modelId: modelId, 
            sessionModelId: sessionModelId,
            error: "Failed to upload contribution content.", 
            details: contentUploadError.message, 
            code: 'STORAGE_UPLOAD_ERROR' 
          });
          continue;
        }
        logger.info(`[generateThesisContributions] Content uploaded successfully for ${modelIdentifier}`);

        logger.info(`[generateThesisContributions] Uploading raw response for ${modelIdentifier} to: ${rawResponseStoragePath}`);
        const { error: rawResponseUploadError } = await uploadToStorage(dbClient, BUCKET_NAME, rawResponseStoragePath, JSON.stringify(aiResponse.rawProviderResponse || {}), { contentType: "application/json" });
        if (rawResponseUploadError) {
          logger.warn(`[generateThesisContributions] Failed to upload raw AI response for ${modelIdentifier} to ${rawResponseStoragePath}:`, { error: rawResponseUploadError });
          // Non-critical, log and continue, but maybe add to a "warnings" array in the future.
        } else {
            logger.info(`[generateThesisContributions] Raw response uploaded successfully for ${modelIdentifier}`);
        }
        
        let contentSizeBytes = 0;
        try {
            const metadata = await getFileMetadata(dbClient, BUCKET_NAME, contentStoragePath);
            if (metadata && !metadata.error && metadata.size !== undefined) {
                contentSizeBytes = metadata.size;
                logger.info(`[generateThesisContributions] Fetched metadata for ${contentStoragePath}, size: ${contentSizeBytes}`);
            } else {
                logger.warn(`[generateThesisContributions] Could not get file metadata for ${contentStoragePath}. File not found, no metadata returned, or error. Defaulting size to 0.`, { error: metadata?.error });
            }
        } catch (metaError) {
            logger.warn(`[generateThesisContributions] Error fetching metadata for ${contentStoragePath}. Defaulting size to 0.`, { error: metaError });
        }


        logger.info(`[generateThesisContributions] Inserting contribution to DB for ${modelIdentifier}`);
        const { data: dbContribution, error: dbInsertError } = await dbClient
          .from('dialectic_contributions')
          .insert({
            session_id: sessionId,
            session_model_id: sessionModelId, // Link to the specific dialectic_session_models.id
            stage: 'thesis',
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
          logger.error(`[generateThesisContributions] Error inserting contribution to DB for ${modelIdentifier}:`, { error: dbInsertError });
          // Attempt to delete orphaned storage files if DB insert fails
          logger.warn(`[generateThesisContributions] Attempting to clean up storage for failed DB insert for ${modelIdentifier}`);
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
        logger.info(`[generateThesisContributions] Contribution inserted to DB successfully for ${modelIdentifier}`, { contributionId: dbContribution.id });
        successfulContributions.push(dbContribution);

      } catch (modelProcessingError) {
        logger.error(`[generateThesisContributions] Unhandled error processing model ${modelIdentifier}:`, { error: modelProcessingError });
        failedContributionAttempts.push({
          modelId: modelId,
          sessionModelId: sessionModelId,
          error: "Unhandled error during model processing.",
          details: modelProcessingError instanceof Error ? modelProcessingError.message : String(modelProcessingError),
          code: 'MODEL_PROCESSING_ERROR'
        });
      }
    } // End of for...of sessionModels loop

    logger.info(`[generateThesisContributions] Finished processing all models for session ${sessionId}`, { successful: successfulContributions.length, failed: failedContributionAttempts.length });

    if (successfulContributions.length === 0) {
      logger.error(`[generateThesisContributions] All models failed to generate contributions for session ${sessionId}`, { errors: failedContributionAttempts });
      // Return a generic error, but include details of all failures
      const errorDetails = failedContributionAttempts.map(f => `Model (SM_ID ${f.sessionModelId}): ${f.error} (${f.details || f.code})`).join('; ');
      return { 
        success: false, 
        error: { 
          message: "All models failed to generate thesis contributions.", 
          status: 500, 
          details: errorDetails 
        } 
      };
    }

    // If at least one contribution was successful
    const finalStatus = failedContributionAttempts.length > 0 ? 'thesis_generation_partial' : 'thesis_generation_complete';
    
    logger.info(`[generateThesisContributions] Updating session ${sessionId} status to: ${finalStatus}`);
    const { error: sessionUpdateError } = await dbClient
      .from('dialectic_sessions')
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (sessionUpdateError) {
      // This is tricky. Contributions were made, but session status update failed.
      // Log heavily. The client will still get the successful contributions.
      // The session status might be stale, requiring manual intervention or a retry mechanism for status updates.
      logger.error(`[generateThesisContributions] CRITICAL: Failed to update session status for ${sessionId} to ${finalStatus}, but contributions were made. Error:`, { error: sessionUpdateError });
    } else {
        logger.info(`[generateThesisContributions] Session ${sessionId} status updated to ${finalStatus}`);
    }
    
    const responseData: GenerateThesisContributionsSuccessResponse = {
      message: failedContributionAttempts.length > 0 
        ? `Thesis generation partially complete for session ${sessionId}. ${successfulContributions.length} succeeded, ${failedContributionAttempts.length} failed.`
        : `Thesis generation fully complete for session ${sessionId}.`,
      sessionId: sessionId,
      status: finalStatus,
      contributions: successfulContributions, // Contains successfully inserted DB records
      errors: failedContributionAttempts.length > 0 ? failedContributionAttempts.map(f => ({
          modelId: f.modelId, // This is ai_providers.id
          // sessionModelId: f.sessionModelId, // We might want to expose this to the client if useful for retry/display
          message: f.error,
          details: `Code: ${f.code}, Details: ${f.details}${f.inputTokens !== undefined ? `, Input Tokens: ${f.inputTokens}` : ''}${f.outputTokens !== undefined ? `, Output Tokens: ${f.outputTokens}` : ''}${f.cost !== undefined ? `, Cost: ${f.cost}` : ''}${f.processingTimeMs !== undefined ? `, Processing Time: ${f.processingTimeMs}ms` : ''}`
      })) : undefined,
    };
    
    logger.info(`[generateThesisContributions] Successfully completed for session ${sessionId}. Status: ${finalStatus}`, { numSuccess: successfulContributions.length, numFailed: failedContributionAttempts.length });
    return { success: true, data: responseData };

  } catch (error) {
    logger.error(`[generateThesisContributions] Critical unhandled error in generateThesisContributions for session ${payload.sessionId}:`, { error });
    return { 
      success: false, 
      error: { 
        message: "A critical unexpected error occurred while generating thesis contributions.", 
        status: 500, 
        details: error instanceof Error ? error.message : String(error) 
      } 
    };
  }
}

// --- AI Model Interaction Utilities ---

async function callUnifiedAIModel(
  modelCatalogId: string, // This is ai_providers.id, will be passed as providerId in ChatApiRequest
  renderedPrompt: string,
  associatedChatId: string, // Chat ID for the /chat function
  authToken: string,        // User's JWT for calling /chat
  options?: CallUnifiedAIModelOptions
): Promise<UnifiedAIResponse> {
  console.log(`callUnifiedAIModel invoked for ai_providers.id (providerId): ${modelCatalogId}, chatId: ${associatedChatId}`);
  const startTime = Date.now();

  // Note: callUnifiedAIModel is designed to handle interaction with a single AI model provider (via the /chat function)
  // for a single prompt. Functions that require generating responses from multiple AI models for a given stage
  // (e.g., generateThesisContributions) are responsible for iterating through the selected models
  // (obtained from dialectic_session_models linked to the session) and calling callUnifiedAIModel individually for each one.

  const historyForChatApi: { role: ChatMessageRole; content: string }[] = 
    options?.customParameters?.historyMessages?.map(hm => ({
        content: hm.content,
        role: hm.role as ChatMessageRole // Asserting role is of stricter type
    })).filter(hm => ['system', 'user', 'assistant'].includes(hm.role as string)) || [];

  const chatApiRequest: ChatApiRequest = {
      message: renderedPrompt,
      providerId: modelCatalogId,
      promptId: options?.currentStageSystemPromptId || "__none__",
      chatId: associatedChatId,
      messages: historyForChatApi,
      max_tokens_to_generate: options?.customParameters?.max_tokens_to_generate,
      // organizationId might be relevant if dialectics are org-specific
  };

  try {
    // TODO: Determine the correct URL for invoking the /chat function.
    // It might be via supabaseClient.functions.invoke or a direct fetch to a known internal URL.
    // Using direct fetch for now as an example.
    const chatFunctionUrl = `${Deno.env.get("SUPABASE_INTERNAL_FUNCTIONS_URL") || Deno.env.get("SUPABASE_URL")}/functions/v1/chat`;
    
    console.log("Attempting to call /chat function at URL:", chatFunctionUrl);
    console.log("Request payload to /chat:", JSON.stringify(chatApiRequest, null, 2));


    const response = await fetch(chatFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        // Supabase Edge Functions might require an API key for function-to-function calls
        // if not using the client library's invoke method with service_role.
        // For user-context calls, the user's Bearer token is primary.
        // "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "", // May or may not be needed depending on /chat setup
      },
      body: JSON.stringify(chatApiRequest),
    });

    const processingTimeMs = Date.now() - startTime;

    if (!response.ok) {
      let errorBodyText = "No error body from /chat.";
      try {
          errorBodyText = await response.text(); // Try to get more details
      } catch (_e) { /* ignore if reading body fails */ }
      
      console.error(`/chat function call failed with status ${response.status}:`, errorBodyText);
      return {
        content: null,
        error: `/chat function call failed: ${response.status} ${response.statusText}. Details: ${errorBodyText}`,
        errorCode: 'CHAT_API_CALL_FAILED',
        processingTimeMs,
      };
    }

    // Try to parse as JSON. If /chat returns non-JSON for success (e.g. empty string), handle it.
    let chatResponseData: unknown;
    try {
        chatResponseData = await response.json();
    } catch (jsonParseError) {
        console.error("/chat function returned non-JSON response:", jsonParseError);
        const responseText = await response.text(); // Attempt to get text if JSON fails
        return {
            content: null,
            error: `/chat function returned non-JSON response. Status: ${response.status}. Body: ${responseText}`,
            errorCode: 'CHAT_API_INVALID_RESPONSE_FORMAT',
            processingTimeMs,
        };
    }
    
    const chatResponse = chatResponseData as ChatHandlerSuccessResponse; // Cast after parsing
    
    console.log("/chat function response:", JSON.stringify(chatResponse, null, 2));
    
    // The ChatHandlerSuccessResponse type itself does not have an 'error' field.
    // Errors from /chat should be indicated by a non-ok HTTP status, which is handled above.
    // If /chat sends a 200 OK but signifies a logical error within its JSON payload
    // (outside the ChatHandlerSuccessResponse structure), that would need a different handling strategy.
    // For now, assuming a 200 OK with valid JSON parse to ChatHandlerSuccessResponse means success.

    if (!chatResponse.assistantMessage) {
        console.error("/chat function response missing assistantMessage:", chatResponse);
        return {
            content: null,
            error: "/chat function response did not include an assistantMessage.",
            errorCode: 'CHAT_API_INVALID_RESPONSE',
            processingTimeMs,
            rawProviderResponse: chatResponse,
        };
    }
    
    const assistantMessage = chatResponse.assistantMessage;
    // Assuming ChatMessageRow (type of assistantMessage) includes token_usage and cost
    const tokenUsage = assistantMessage.token_usage as TokenUsage | null; 

    return {
      content: assistantMessage.content,
      inputTokens: tokenUsage?.prompt_tokens,
      outputTokens: tokenUsage?.completion_tokens,
      cost: (assistantMessage as unknown as { cost?: number }).cost ?? undefined, // Explicitly cast to any for cost if type is not fully resolved
      processingTimeMs,
      rawProviderResponse: assistantMessage, 
      error: null, 
      errorCode: null,
    };

  } catch (e) {
    const processingTimeMs = Date.now() - startTime;
    console.error("Error invoking /chat function:", e);
    return {
      content: null,
      error: `Failed to invoke /chat function: ${e instanceof Error ? e.message : String(e)}`,
      errorCode: 'NETWORK_OR_UNHANDLED_ERROR',
      processingTimeMs,
    };
  }
}
// --- End AI Model Interaction Utilities ---

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  let authToken: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        authToken = authHeader.substring(7);
    }

    if (req.headers.get("content-type") !== "application/json") {
      return createErrorResponse("Invalid content type, expected application/json", 400, req);
    }

    const requestBody: DialecticServiceRequest = await req.json();
    const { action, payload } = requestBody;

    // Adjusted 'result' type to properly accommodate the 'success' field from actions that return it.
    let result: {
      success?: boolean;
      data?: unknown;
      error?: { message: string; status?: number; details?: string };
    };

    switch (action) {
      case 'listAvailableDomainTags':
        result = await listAvailableDomainTags(supabaseAdmin);
        break;
      case 'updateProjectDomainTag':
        if (!payload) {
            result = { error: { message: "Payload is required for updateProjectDomainTag", status: 400 } };
        } else {
            result = await updateProjectDomainTag(req, supabaseAdmin, payload as unknown as UpdateProjectDomainTagPayload);
        }
        break;
      case 'createProject':
        if (!payload) {
            result = { error: { message: "Payload is required for createProject", status: 400 } };
        } else {
            result = await createProject(req, supabaseAdmin, payload as unknown as CreateProjectPayload);
        }
        break;
      case 'startSession':
        if (!payload) {
            result = { error: { message: "Payload is required for startSession", status: 400 } };
        } else {
            result = await startSession(req, supabaseAdmin, payload as unknown as StartSessionPayload);
        }
        break;
      case 'generateThesisContributions': 
        if (!payload) {
            result = { success: false, error: { message: "Payload is required for generateThesisContributions", status: 400 } };
        } else if (!authToken) {
             result = { success: false, error: { message: "User authentication token is required for generateThesisContributions", status: 401 } };
        }
        else {
            result = await generateThesisContributions(supabaseAdmin, payload as unknown as GenerateThesisContributionsPayload, authToken);
        }
        break;
      default:
        result = { error: { message: `Unknown action: ${action}`, status: 404 } };
    }

    if (result.error) {
      // If 'success' is explicitly false, or if it's an error from a simpler action
      // that doesn't use the 'success' flag, create an error response.
      return createErrorResponse(
        result.error.message || "Action failed",
        result.error.status || 400,
        req,
        result.error.details ? new Error(result.error.details) : undefined
      );
    }

    // For successful responses:
    // If 'result' comes from an action like generateThesisContributions, it will be an object like { success: true, data: { ... } }.
    // If 'result' comes from an action like listAvailableDomainTags, it will be an object like { data: [...] }.
    // Passing 'result' directly to createSuccessResponse will ensure the correct structure.
    return createSuccessResponse(result, 200, req);

  } catch (e) {
    console.error("Critical error in dialectic-service:", e);
    const error = e instanceof Error ? e : new Error(String(e));
    return createErrorResponse("Internal Server Error", 500, req, error);
  }
}); 