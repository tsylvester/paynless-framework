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
  UnifiedAIResponse } from "./dialectic.interface.ts";
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
    ChatMessageRole,
} from "../_shared/types.ts";

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
  authToken: string // Added authToken
): Promise<{ success: boolean; data?: GenerateThesisContributionsSuccessResponse; error?: { message: string; status?: number; details?: string } }> {
  const { sessionId } = payload;
  console.log(`generateThesisContributions called for sessionId: ${sessionId}`);

  // 1. Fetch session, models, and seed prompt
  const { data: sessionDetails, error: sessionError } = await dbClient
    .from('dialectic_sessions')
    .select(`
      id,
      project_id,
      current_stage_seed_prompt,
      status,
      associated_chat_id,
      active_thesis_prompt_template_id,
      dialectic_projects ( user_id ),
      dialectic_session_models ( id, model_id )
    `)
    .eq('id', sessionId)
    .single();

  if (sessionError || !sessionDetails) {
    console.error(`Error fetching session details for ${sessionId}:`, sessionError);
    return { success: false, error: { message: "Failed to fetch session details or session not found.", status: sessionError?.code === 'PGRST116' ? 404 : 500, details: sessionError?.message } };
  }
  console.log(`Session details for ${sessionId} fetched successfully.`);

  if (sessionDetails.status !== 'pending_thesis') {
    const message = `Session ${sessionId} is not in 'pending_thesis' state, current state: ${sessionDetails.status}.`;
    console.warn(message);
    return { success: false, error: { message, status: 409 } };
  }

  const { error: statusUpdateError } = await dbClient
    .from('dialectic_sessions')
    .update({ status: 'generating_thesis', updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (statusUpdateError) {
    console.error(`Error updating session ${sessionId} status to 'generating_thesis':`, statusUpdateError);
  } else {
    console.log(`Session ${sessionId} status updated to 'generating_thesis'.`);
  }

  const contributions: unknown[] = []; 
  const errors: { modelId: string; message: string; details?: string }[] = [];
  const bucketName = "dialectic-contributions";

  const MAX_RETRIES = 3;
  const INITIAL_BACKOFF_MS = 1000; 

  for (const sessionModel of sessionDetails.dialectic_session_models) {
    const modelId = sessionModel.model_id;
    console.log(`Processing model: ${modelId} for session ${sessionId}`);

    let aiResponse: UnifiedAIResponse | null = null;
    let lastErrorString: string | null = null; // Renamed to avoid conflict if error object is used
    let attempt = 0;

    // --- Retry Loop for AI Model Call ---
    while (attempt < MAX_RETRIES && !aiResponse) {
      attempt++;
      if (attempt > 1) {
        const backoffDelay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 2); 
        console.log(`Retrying model ${modelId} (attempt ${attempt}/${MAX_RETRIES}) after ${backoffDelay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
      try {
        const currentAIResponse = await callUnifiedAIModel(
          modelId, 
          sessionDetails.current_stage_seed_prompt || "",
          sessionDetails.associated_chat_id,
          authToken, 
          {
            currentStageSystemPromptId: sessionDetails.active_thesis_prompt_template_id || "__none__"
          }
        );

        if (currentAIResponse.error) {
          lastErrorString = currentAIResponse.error;
          console.warn(`Attempt ${attempt} for model ${modelId} failed: ${lastErrorString}`);
          if (attempt === MAX_RETRIES) {
            aiResponse = currentAIResponse; // Use this error response after max retries
          }
        } else {
          aiResponse = currentAIResponse; // Success
        }
      } catch (e) { 
        lastErrorString = e instanceof Error ? e.message : String(e);
        console.error(`Attempt ${attempt} for model ${modelId} threw an exception: ${lastErrorString}`, e);
        if (attempt === MAX_RETRIES) {
            aiResponse = { 
                content: null,
                error: `Model call failed after ${MAX_RETRIES} attempts: ${lastErrorString}`,
                errorCode: 'MAX_RETRIES_EXCEEDED',
                inputTokens: undefined, outputTokens: undefined, cost: undefined, processingTimeMs: undefined, rawProviderResponse: undefined
            };
        }
      }
    }
    // --- End Retry Loop ---

    // If aiResponse is still null after retries (should be set by the loop, but as a safeguard)
    if (!aiResponse) {
        console.error(`Model ${modelId} call definitively failed after ${MAX_RETRIES} attempts. Last error: ${lastErrorString}`);
        errors.push({ modelId, message: "AI model call failed after retries.", details: lastErrorString || "Unknown error after retries." });
        const errorContributionId = crypto.randomUUID();
        await dbClient.from('dialectic_contributions').insert({
            id: errorContributionId,
            session_id: sessionId,
            session_model_id: sessionModel.id,
            stage: 'thesis',
            error: `AI model call failed after ${MAX_RETRIES} retries: ${lastErrorString || 'Unknown'}`,
            actual_prompt_sent: sessionDetails.current_stage_seed_prompt,
        });
        continue; // Move to the next model
    }

    console.log(`AI response finalized for model ${modelId} (after attempt ${attempt}). Content length: ${aiResponse.content?.length}, Error: ${aiResponse.error}`);

    // --- Process the final aiResponse (success or error after retries) ---
    try {
      if (aiResponse.error) {
        console.error(`Error from callUnifiedAIModel for model ${modelId} (final):`, aiResponse.error);
        errors.push({ modelId, message: "AI model call failed.", details: aiResponse.error });
        const contributionId = crypto.randomUUID();
        const { error: insertErrorContributionError } = await dbClient
          .from('dialectic_contributions')
          .insert({
            id: contributionId,
            session_id: sessionId,
            session_model_id: sessionModel.id,
            stage: 'thesis',
            error: aiResponse.error,
            actual_prompt_sent: sessionDetails.current_stage_seed_prompt,
            tokens_used_input: aiResponse.inputTokens,
            tokens_used_output: aiResponse.outputTokens,
            cost: aiResponse.cost,
            processing_time_ms: aiResponse.processingTimeMs,
          });
        if (insertErrorContributionError) {
            console.error(`Failed to insert error contribution for model ${modelId}:`, insertErrorContributionError);
        }
        // No continue here, the error is recorded, and we proceed to next model via the main loop
      } else {
        // AI Call was successful (or deemed successful for processing by retry logic)
        const contributionId = crypto.randomUUID();
        const contentType = "text/markdown"; 
        const extension = getExtensionFromMimeType(contentType);
        const storagePath = `${sessionDetails.project_id}/${sessionId}/${contributionId}${extension}`;

        console.log(`Uploading content for model ${modelId} to path: ${storagePath} with contentType: ${contentType}`);
        const { path: uploadedPath, error: uploadError } = await uploadToStorage(
          dbClient, 
          bucketName,
          storagePath,
          aiResponse.content || "", 
          { contentType, upsert: false }
        );

        if (uploadError || !uploadedPath) {
          console.error(`Error uploading to storage for model ${modelId}, path ${storagePath}:`, uploadError);
          errors.push({ modelId, message: "Storage upload failed.", details: uploadError?.message });
          const storageErrorContributionId = crypto.randomUUID();
          await dbClient.from('dialectic_contributions').insert({
              id: storageErrorContributionId,
              session_id: sessionId,
              session_model_id: sessionModel.id,
              stage: 'thesis',
              content_storage_bucket: bucketName,
              content_storage_path: storagePath,
              content_mime_type: contentType,
              error: `Storage upload failed: ${uploadError?.message || 'Unknown storage error'}`,
              actual_prompt_sent: sessionDetails.current_stage_seed_prompt,
              tokens_used_input: aiResponse.inputTokens,
              tokens_used_output: aiResponse.outputTokens,
              cost: aiResponse.cost,
              processing_time_ms: aiResponse.processingTimeMs,
            });
        } else {
          console.log(`Content for model ${modelId} uploaded successfully to: ${uploadedPath}`);
          let fileSize: number | undefined | null = null;
          const { size, error: metadataError } = await getFileMetadata(dbClient, bucketName, uploadedPath);
          if (metadataError) {
            console.warn(`Could not get file metadata for ${uploadedPath}:`, metadataError.message);
          } else {
            fileSize = size;
            console.log(`File size for ${uploadedPath}: ${fileSize} bytes`);
          }

          const { data: dbContribution, error: insertError } = await dbClient
            .from('dialectic_contributions')
            .insert({
              id: contributionId,
              session_id: sessionId,
              session_model_id: sessionModel.id,
              stage: 'thesis',
              content_storage_bucket: bucketName,
              content_storage_path: uploadedPath,
              content_mime_type: contentType,
              content_size_bytes: fileSize,
              actual_prompt_sent: sessionDetails.current_stage_seed_prompt,
              tokens_used_input: aiResponse.inputTokens,
              tokens_used_output: aiResponse.outputTokens,
              cost: aiResponse.cost,
              processing_time_ms: aiResponse.processingTimeMs,
              prompt_template_id_used: sessionDetails.active_thesis_prompt_template_id,
            })
            .select()
            .single();

          if (insertError) {
            console.error(`Error inserting contribution to DB for model ${modelId}, path ${uploadedPath}:`, insertError);
            errors.push({ modelId, message: "DB insert failed.", details: insertError.message });
            console.warn(`Attempting to delete orphaned file from storage: ${uploadedPath}`);
            const { error: deleteError } = await deleteFromStorage(dbClient, bucketName, [uploadedPath]);
            if (deleteError) {
                console.error(`Failed to delete orphaned file ${uploadedPath}:`, deleteError.message);
            }
          } else {
            console.log(`Contribution for model ${modelId} (ID: ${contributionId}) saved successfully to DB.`);
            contributions.push(dbContribution);
          }
        }
      }
    } catch (e) { // Catch-all for unexpected errors during this model's post-AI processing
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Outer catch: Unexpected error processing model ${modelId} after AI call:`, e);
      errors.push({ modelId, message: "Unexpected error during post-AI processing.", details: errorMessage });
      const unexpectedErrorContributionId = crypto.randomUUID();
      await dbClient.from('dialectic_contributions').insert({
          id: unexpectedErrorContributionId,
          session_id: sessionId,
          session_model_id: sessionModel.id,
          stage: 'thesis',
          error: `Unexpected error after AI call for model ${modelId}: ${errorMessage}`,
          actual_prompt_sent: sessionDetails.current_stage_seed_prompt,
        });
    } // End of outer try-catch for this model's processing
  } // End of for...of loop over sessionModels

  let finalSessionStatus = 'thesis_complete';
  if (errors.length > 0 && contributions.length === 0) {
    finalSessionStatus = 'thesis_failed_to_generate'; 
  } else if (errors.length > 0) {
    finalSessionStatus = 'thesis_complete_with_errors';
  }
  
  console.log(`All models processed for session ${sessionId}. Finalizing session status to: ${finalSessionStatus}`);
  const { error: finalStatusUpdateError } = await dbClient
    .from('dialectic_sessions')
    .update({ status: finalSessionStatus, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (finalStatusUpdateError) {
    console.error(`Error updating final session status for ${sessionId} to '${finalSessionStatus}':`, finalStatusUpdateError);
  } else {
     console.log(`Session ${sessionId} final status updated to '${finalSessionStatus}'.`);
  }
  
  if (contributions.length === 0 && errors.length > 0) {
     return { success: false, error: { message: "Failed to generate any thesis contributions.", status: 500, details: JSON.stringify(errors) } };
  }

  return {
    success: true,
    data: {
      message: "Thesis contributions processing completed.",
      sessionId,
      status: finalSessionStatus,
      contributions,
      errors,
    },
  };
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