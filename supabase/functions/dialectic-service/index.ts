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
import type {
    ChatApiRequest,
    TokenUsage,
    ChatHandlerSuccessResponse,
    ChatMessageRole,
} from "../_shared/types.ts";

console.log("dialectic-service function started");

// Initialize Supabase admin client once
const supabaseAdmin = createSupabaseAdminClient();

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
  const { projectName, initialUserPrompt, selectedDomainTag } = payload;

  if (!projectName || !initialUserPrompt) {
    return { error: { message: "projectName and initialUserPrompt are required", status: 400 } };
  }

  const supabaseUserClient = createSupabaseClient(req);
  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    console.warn("User not authenticated for createProject", userError);
    return { error: { message: "User not authenticated", status: 401 } };
  }

  if (selectedDomainTag) { // if null or undefined, we don't need to validate
    const tagIsValid = await isValidDomainTag(dbAdminClient, selectedDomainTag);
    if (!tagIsValid) {
      return { error: { message: `Invalid selectedDomainTag: "${selectedDomainTag}"`, status: 400 } };
    }
  }

  const { data: newProjectData, error: createError } = await dbAdminClient
    .from('dialectic_projects')
    .insert({
      user_id: user.id,
      project_name: projectName,
      initial_user_prompt: initialUserPrompt,
      selected_domain_tag: selectedDomainTag,
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
  console.log("generateThesisContributions called with payload:", payload);
  const { sessionId } = payload;

  // 1. Fetch dialectic_session, its models, seed prompt, and associated_chat_id
  // Also fetch project_id for constructing storage paths later.
  const { data: sessionDetails, error: sessionFetchError } = await dbClient
    .from('dialectic_sessions')
    .select(`
      id,
      project_id,
      current_stage_seed_prompt,
      associated_chat_id,
      status,
      dialectic_session_models ( id, model_id ),
      dialectic_projects ( user_id )
    `)
    .eq('id', sessionId)
    .single();

  if (sessionFetchError || !sessionDetails) {
    console.error("Error fetching session details:", sessionFetchError);
    return { success: false, error: { message: "Failed to fetch session details.", details: sessionFetchError?.message, status: sessionFetchError ? 500 : 404 } };
  }

  // User Ownership Check (Example - can be more sophisticated or rely on RLS for writes)
  // This requires decoding the JWT (authToken) to get the user ID if not already available.
  // For simplicity, let's assume a function getUserIdFromAuthToken(authToken) exists
  // const currentUserId = await getUserIdFromAuthToken(authToken); 
  // if (sessionDetails.dialectic_projects?.user_id !== currentUserId) {
  //   return { success: false, error: { message: "User does not own the project associated with this session.", status: 403 } };
  // }

  // 2. Verify session status is pending_thesis. Update to generating_thesis. Log.
  if (sessionDetails.status !== 'pending_thesis') {
    return {
      success: false,
      error: {
        message: `Session status is '${sessionDetails.status}', expected 'pending_thesis' to generate thesis contributions.`,
        status: 409, // Conflict
      },
    };
  }

  const { error: updateStatusError } = await dbClient
    .from('dialectic_sessions')
    .update({ status: 'generating_thesis', updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (updateStatusError) {
    console.error(`Failed to update session ${sessionId} status to 'generating_thesis':`, updateStatusError);
    // Decide if we should still proceed or return an error. For now, logging and proceeding.
    // Consider implications for retries or inconsistent states.
    return { success: false, error: { message: "Failed to update session status before generating contributions.", details: updateStatusError.message, status: 500 } };
  }
  console.log(`Session ${sessionId} status updated to 'generating_thesis'.`);

  if (!sessionDetails.associated_chat_id) {
    return { success: false, error: { message: "Session is missing an associated_chat_id required for AI interactions.", status: 500 }};
  }
  const associatedChatId = sessionDetails.associated_chat_id;

  // TODO: Verify user ownership via project.user_id against user from authToken if needed, or rely on RLS for table writes.

  // TODO: 2. Verify session status is pending_thesis. Update to generating_thesis. Log.
  console.log(`Updating session ${sessionId} status to generating_thesis (Placeholder)`);
  
  const seedPrompt = sessionDetails.current_stage_seed_prompt;
  if (!seedPrompt) {
    return { success: false, error: { message: "Session is missing a seed prompt for thesis generation.", status: 500 }};
  }

  const modelsToCall = sessionDetails.dialectic_session_models;
  if (!modelsToCall || modelsToCall.length === 0) {
    // No models, so no contributions can be generated. Update status back or to thesis_complete_no_models?
    // For now, let's consider this an issue that prevents thesis completion as expected.
    await dbClient.from('dialectic_sessions').update({ status: 'pending_thesis', updated_at: new Date().toISOString() }).eq('id', sessionId); // Revert status
    return { success: false, error: { message: "No models associated with this session for thesis generation.", status: 400 }};
  }

  console.log(`Generating thesis for session ${sessionId} using ${modelsToCall.length} models.`);
  
  const generatedContributionsForResponse: unknown[] = [];
  let allContributionsFailed = true; // Assume failure until a contribution succeeds

  // Ensure sessionDetails.dialectic_projects is correctly typed/accessed.
  // Reverting to direct object access as it worked and linter seems mistaken here.
  const userIdFromProject = sessionDetails.dialectic_projects?.user_id;
  if (!userIdFromProject) {
    console.error(`User ID not found for project associated with session ${sessionId}. Cannot construct storage paths.`);
    return { success: false, error: { message: "User ID missing for storage path construction.", status: 500 } };
  }
  const userIdForStoragePath = userIdFromProject;

  for (const sessionModel of modelsToCall) {
    const modelId = sessionModel.model_id; // This is ai_model_catalog.id (UUID)
    const sessionModelId = sessionModel.id; // PK of the dialectic_session_models row

    if (!modelId || !sessionModelId) {
      console.error(`Session ${sessionId} has a session_model entry with missing model_id or id. Skipping this model.`);
      continue;
    }

    console.log(`Processing model ${modelId} for session ${sessionId}, using session_model_id ${sessionModelId}`);

    const aiModelInvokeOptions: CallUnifiedAIModelOptions = {
      // customParameters: { ... } // If needed
      // currentStageSystemPromptId: null // If needed
    };

    let contributionSuccessfulThisIteration = false;
    try {
      // Use the locally defined callUnifiedAIModel
      const aiResponse: UnifiedAIResponse = await callUnifiedAIModel(
        modelId,
        seedPrompt,
        associatedChatId,
        authToken, // authToken is passed to generateThesisContributions
        aiModelInvokeOptions
      );
      console.log(`AI response for model ${modelId}, session ${sessionId}:`, JSON.stringify(aiResponse));

      if (aiResponse.error || !aiResponse.content) {
        console.error(`AI call failed for model ${modelId}, session ${sessionId}:`, aiResponse.error || "No content");
        continue; 
      }

      const contributionContent = aiResponse.content;
      const rawResponse = aiResponse.rawProviderResponse || { note: "Raw response not available from adapter." };
      const contentToStore = JSON.stringify({
        prompt: seedPrompt,
        response: contributionContent,
        // model_details: aiResponse.modelDetails, // Removed as modelDetails is not in UnifiedAIResponse
      });
      const rawResponseToStore = JSON.stringify(rawResponse);

      const timestamp = new Date().toISOString();
      // Use the resolved userIdForStoragePath
      const contentFilePath = `${userIdForStoragePath}/${sessionId}/${sessionModelId}_${timestamp}_content.json`;
      const rawResponseFilePath = `${userIdForStoragePath}/${sessionId}/${sessionModelId}_${timestamp}_raw_response.json`;

      // Upload main content
      console.log(`Attempting to upload content to: ${contentFilePath} for session ${sessionId}`);
      const { error: contentUploadError } = await uploadToStorage(
        dbClient,
        "dialectic-contributions",
        contentFilePath,
        contentToStore,
        { contentType: "application/json" } // Corrected options
      );
      if (contentUploadError) {
        console.error(`Failed to upload content for model ${modelId}, session ${sessionId}:`, contentUploadError);
        continue; 
      }
      console.log(`Successfully uploaded content to: ${contentFilePath}`);

      // Upload raw response
      console.log(`Attempting to upload raw response to: ${rawResponseFilePath} for session ${sessionId}`);
      const { error: rawResponseUploadError } = await uploadToStorage(
        dbClient,
        "dialectic-contributions",
        rawResponseFilePath,
        rawResponseToStore,
        { contentType: "application/json" } // Corrected options
      );
      if (rawResponseUploadError) {
        console.error(`Failed to upload raw response for model ${modelId}, session ${sessionId}:`, rawResponseUploadError);
        continue; 
      }
      console.log(`Successfully uploaded raw response to: ${rawResponseFilePath}`);

      // Insert into DB
      console.log(`Attempting to insert contribution record into DB for session ${sessionId}, session_model_id ${sessionModelId}`);
      const { data: newContribution, error: insertError } = await dbClient
        .from('dialectic_contributions')
        .insert({
          session_id: sessionId,
          session_model_id: sessionModelId,
          stage: 'THESIS',
          content_storage_path: contentFilePath,
          content_storage_bucket: 'dialectic-contributions',
          content_mime_type: 'application/json',
          content_size_bytes: contentToStore.length,
          actual_prompt_sent: seedPrompt, // Assuming seedPrompt is the final prompt for now
          raw_response_storage_path: rawResponseFilePath,
          // TODO: Add tokens_used_input, tokens_used_output, cost_usd, model_version_details from aiResponse if available
          // error: null, // Explicitly set error to null for successful contributions
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`Failed to insert contribution to DB for model ${modelId}, session ${sessionId}:`, insertError);
        // If DB insert fails, we should ideally clean up the stored files.
        // This is a critical error for this attempt.
        // TODO: Implement cleanup of stored files on DB insert failure.
        continue; // Try next model
      }
      console.log(`Successfully inserted contribution to DB. ID: ${newContribution?.id}`);

      contributionSuccessfulThisIteration = true;
      allContributionsFailed = false; // At least one contribution succeeded
      generatedContributionsForResponse.push({
          contributionId: newContribution.id,
          modelIdUsed: modelId,
          contentPath: contentFilePath,
          // Add other relevant details for the response
      });
      // break; // If we only need one successful contribution, uncomment this. For now, try all models.

    } catch (e) {
      console.error(`Unhandled exception during contribution generation for model ${modelId}, session ${sessionId}:`, e);
      // This specific attempt failed.
    }
  } // End loop over modelsToCall

  if (allContributionsFailed) {
    // ... existing code ...
  }

  // 4. Update dialectic_sessions.status to thesis_complete. Log.
  const finalSessionStatus = generatedContributionsForResponse.length > 0 ? 'thesis_complete' : 'thesis_complete_no_models';
  const { error: finalStatusUpdateError } = await dbClient
    .from('dialectic_sessions')
    .update({ status: finalSessionStatus, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (finalStatusUpdateError) {
    console.error(`Failed to update session ${sessionId} status to '${finalSessionStatus}':`, finalStatusUpdateError);
    // This is tricky: contributions are made, but final status update failed.
    // The client might get a success response but the session status is stale.
    // For now, we will still return success with contributions if any were made.
  }
  console.log(`Session ${sessionId} status updated to '${finalSessionStatus}'. Processed ${generatedContributionsForResponse.length} models.`);
  
  // 5. This action concludes. Antithesis triggered by separate user action.
  return { 
    success: true, 
    data: { 
      message: `Thesis contributions generation completed for session ${sessionId}. ${generatedContributionsForResponse.length} models processed successfully.`,
      contributions: generatedContributionsForResponse // Return the array of successfully created contribution objects
    } 
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