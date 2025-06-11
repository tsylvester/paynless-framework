// deno-lint-ignore-file no-explicit-any
import { 
    StartSessionPayload, 
    StartSessionSuccessResponse, 
} from "./dialectic.interface.ts";
// import { createSupabaseClient } from "../_shared/auth.ts"; // No longer needed for direct auth here
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2"; // Added User
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { ILogger } from "../_shared/types.ts";
import type { DialecticSession } from "./dialectic.interface.ts";
console.log("startSession function started");

// Define Dependencies Interface
export interface StartSessionDeps {
  // createSupabaseClient: (req: Request) => SupabaseClient; // Removed if only used for auth
  randomUUID: () => string;
  logger: ILogger;
}

// Define default dependencies
const defaultStartSessionDeps: StartSessionDeps = {
  // createSupabaseClient: createSupabaseClient, // Removed
  randomUUID: () => crypto.randomUUID(),
  logger: logger,
};

export async function startSession(
  // req: Request, // For user authentication -> Removed
  user: User, // Added user object
  dbClient: SupabaseClient<Database>,
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps> 
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
  const deps = { ...defaultStartSessionDeps, ...partialDeps };
  // const { createSupabaseClient, randomUUID, logger } = deps; // createSupabaseClient removed from here
  const { randomUUID, logger } = deps;

  logger.info(`startSession called with payload: ${JSON.stringify(payload)} for user ${user.id}`);

  // const { data: userSession, error: authError } = await createSupabaseClient(req).auth.getUser(); // Removed auth call

  // if (authError || !userSession?.user?.id) { // User is now passed directly and assumed to be valid
  //   logger.warn(`[startSession] User not authenticated.`, { error: authError });
  //   return { error: { message: "User not authenticated", status: 401, code: "AUTH_UNAUTHENTICATED" } };
  // }
  // const userId = userSession.user.id; // Use user.id directly
  const userId = user.id;
  logger.info(`[startSession] User ${userId} authenticated (passed to function).`);

  let associatedChatIdToUse: string;
  if (payload.originatingChatId) {
    logger.info(`[startSession] Using provided originatingChatId: ${payload.originatingChatId}`);
    associatedChatIdToUse = payload.originatingChatId;
  } else {
    logger.info(`[startSession] No originatingChatId provided, generating a new one.`);
    associatedChatIdToUse = randomUUID();
  }

  const { data: project, error: projectError } = await dbClient
    .from('dialectic_projects')
    .select('id, user_id, project_name, initial_user_prompt, selected_domain_tag, selected_domain_overlay_id')
    .eq('id', payload.projectId)
    .eq('user_id', userId)
    .single();

  if (projectError || !project) {
    logger.error("[startSession] Error fetching project or project not found/access denied:", { projectId: payload.projectId, userId: userId, error: projectError });
    const status = (projectError && projectError.code === 'PGRST116') || !project ? 404 : 500;
    return { error: { message: "Project not found or access denied.", status } };
  }
  logger.info(`[startSession] Project ${project.id} details fetched.`);

  // Fetch system prompt based on project's selected_domain_overlay_id or payload.promptTemplateId
  let systemPromptId: string | null = null;
  let systemPromptText: string | null = null;

  try {
    if (payload.promptTemplateId) {
        logger.info(`[startSession] Using provided promptTemplateId: ${payload.promptTemplateId}`);
        const { data: directPrompt, error: directPromptErr } = await dbClient
            .from('system_prompts')
            .select('id, prompt_text')
            .eq('id', payload.promptTemplateId)
            .eq('is_active', true)
            .single();
        if (directPromptErr) throw new Error(`Error fetching prompt by direct ID ${payload.promptTemplateId}: ${directPromptErr.message}`);
        if (!directPrompt) throw new Error(`No active prompt found for ID ${payload.promptTemplateId}`);
        systemPromptId = directPrompt.id;
        systemPromptText = directPrompt.prompt_text;
    } else if (payload.selectedDomainOverlayId) {
      logger.info(`[startSession] Using provided selectedDomainOverlayId from payload: ${payload.selectedDomainOverlayId} to fetch system_prompt_id.`);
      const { data: overlay, error: overlayErr } = await dbClient
        .from('domain_specific_prompt_overlays')
        .select('system_prompt_id')
        .eq('id', payload.selectedDomainOverlayId)
        .single();

      if (overlayErr) throw new Error(`Error fetching domain_specific_prompt_overlay using payload ID: ${overlayErr.message}`);
      if (!overlay || !overlay.system_prompt_id) throw new Error(`Domain overlay ${payload.selectedDomainOverlayId} (from payload) not found or has no system_prompt_id.`);
      
      logger.info(`[startSession] Fetched system_prompt_id: ${overlay.system_prompt_id} using payload overlay ID. Now fetching prompt text.`);
      const { data: promptFromOverlay, error: promptFromOverlayErr } = await dbClient
        .from('system_prompts')
        .select('id, prompt_text')
        .eq('id', overlay.system_prompt_id)
        .eq('is_active', true)
        .single();
      
      if (promptFromOverlayErr) throw new Error(`Error fetching system prompt using ID from payload overlay (${overlay.system_prompt_id}): ${promptFromOverlayErr.message}`);
      if (!promptFromOverlay) throw new Error(`No active system prompt found for ID ${overlay.system_prompt_id} (linked from payload overlay ${payload.selectedDomainOverlayId})`);
      
      systemPromptId = promptFromOverlay.id;
      systemPromptText = promptFromOverlay.prompt_text;
    } else if (project.selected_domain_overlay_id) {
      logger.info(`[startSession] Fetching system_prompt_id from domain_specific_prompt_overlays for project's overlay ID: ${project.selected_domain_overlay_id}`);
      const { data: overlay, error: overlayErr } = await dbClient
        .from('domain_specific_prompt_overlays')
        .select('system_prompt_id')
        .eq('id', project.selected_domain_overlay_id)
        .single();

      if (overlayErr) throw new Error(`Error fetching domain_specific_prompt_overlay: ${overlayErr.message}`);
      if (!overlay || !overlay.system_prompt_id) throw new Error(`Domain overlay ${project.selected_domain_overlay_id} not found or has no system_prompt_id.`);
      
      logger.info(`[startSession] Fetched system_prompt_id: ${overlay.system_prompt_id}. Now fetching prompt text.`);
      const { data: promptFromOverlay, error: promptFromOverlayErr } = await dbClient
        .from('system_prompts')
        .select('id, prompt_text')
        .eq('id', overlay.system_prompt_id)
        .eq('is_active', true)
        .single();
      
      if (promptFromOverlayErr) throw new Error(`Error fetching system prompt using ID from overlay (${overlay.system_prompt_id}): ${promptFromOverlayErr.message}`);
      if (!promptFromOverlay) throw new Error(`No active system prompt found for ID ${overlay.system_prompt_id} (linked from overlay ${project.selected_domain_overlay_id})`);
      
      systemPromptId = promptFromOverlay.id;
      systemPromptText = promptFromOverlay.prompt_text;
    } else {
      // Fallback or default logic if neither promptTemplateId nor selected_domain_overlay_id is present
      // This might involve fetching a generic default based on stageAssociation or other criteria
      logger.info(`[startSession] No promptTemplateId or project.selected_domain_overlay_id. Fetching default prompt for stage: ${payload.stageAssociation}, context: ${project.selected_domain_tag || 'general'}`);
      const { data: defaultPrompt, error: defaultPromptErr } = await dbClient
        .from('system_prompts')
        .select('id, prompt_text')
        .eq('is_active', true)
        .eq('stage_association', payload.stageAssociation)
        .eq('is_stage_default', true)
        .eq('context', project.selected_domain_tag || 'general')
        .maybeSingle(); // Use maybeSingle as a default might not exist
      
      if (defaultPromptErr) throw new Error(`Error fetching default prompt: ${defaultPromptErr.message}`);
      if (!defaultPrompt) throw new Error(`No suitable default prompt found for stage '${payload.stageAssociation}' and context '${project.selected_domain_tag || 'general'}'`);
      
      systemPromptId = defaultPrompt.id;
      systemPromptText = defaultPrompt.prompt_text;
    }
    logger.info(`[startSession] System prompt ID ${systemPromptId} and text fetched.`);

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("[startSession] Prompt fetching error:", { error: errorMessage });
    return { error: { message: `Prompt fetching failed: ${errorMessage}`, status: 400 } };
  }
  
  const sessionStage = payload.stageAssociation.toUpperCase() as Database["public"]["Enums"]["dialectic_stage_enum"]; // Ensure stage is uppercase and type-casted
  const sessionStatus = `pending_${payload.stageAssociation.toLowerCase()}`; // e.g. pending_thesis

  // Construct a user-friendly session description
  const friendlySessionDescription = `${project.project_name || 'Unnamed Project'} - ${payload.stageAssociation} (${project.selected_domain_tag || 'General'})`;
  logger.info(`[startSession] Constructed friendly session description: "${friendlySessionDescription}"`);

  logger.info(`[startSession] Inserting dialectic_sessions record for project ${project.id} with stage ${sessionStage} and status ${sessionStatus}`);
  const { data: sessionData, error: sessionInsertError } = await dbClient
    .from('dialectic_sessions')
    .insert({
      project_id: project.id,
      session_description: friendlySessionDescription, // Use the friendly description
      stage: sessionStage, // Using the new stage field
      status: sessionStatus, // Still using status for now, can be reviewed
      iteration_count: 1, 
      associated_chat_id: associatedChatIdToUse,
      selected_model_catalog_ids: payload.selectedModelCatalogIds, // Storing selected model IDs
    })
    .select('*')  // Changed from select('id') to select('*')
    .single();

  if (sessionInsertError || !sessionData) {
    logger.error("[startSession] Error inserting dialectic session:", { projectId: project.id, error: sessionInsertError });
    return { error: { message: "Failed to create session.", details: sessionInsertError?.message, status: 500 } };
  }
  // const newSessionId = sessionData.id; // sessionData is now the full session object
  logger.info(`[startSession] Session ${sessionData.id} created with stage ${sessionStage}.`);

  logger.info(`[startSession] Selected model IDs ${payload.selectedModelCatalogIds.join(', ')} stored in session ${sessionData.id}.`);
  
  const initialStageSeedPrompt = `Rendered System Prompt for ${payload.stageAssociation}:\n${systemPromptText}\n\nInitial User Prompt (from project):\n${project.initial_user_prompt}`;
  
  logger.info(`[startSession] Initial seed prompt for session ${sessionData.id} constructed. This will be used for the first contribution of stage ${payload.stageAssociation}.`);

  logger.info(`[startSession] Session ${sessionData.id} started successfully. Stage: ${sessionStage}, Status: ${sessionStatus}. Associated chat ID for /chat interactions: ${associatedChatIdToUse}.`);

  // Construct the DialecticSession object explicitly to match the interface
  const resultSession: DialecticSession = {
    id: sessionData.id,
    project_id: sessionData.project_id,
    session_description: sessionData.session_description,
    current_stage_seed_prompt: initialStageSeedPrompt,
    iteration_count: sessionData.iteration_count, // This is 1 from DB insert
    status: sessionData.status, // e.g. pending_thesis
    associated_chat_id: sessionData.associated_chat_id,

    active_thesis_prompt_template_id: null,
    active_antithesis_prompt_template_id: null,
    active_synthesis_prompt_template_id: null,
    active_parenthesis_prompt_template_id: null,
    active_paralysis_prompt_template_id: null,

    formal_debate_structure_id: null,
    max_iterations: payload.maxIterations ?? 10, // Default to 10 if not provided in payload
    current_iteration: sessionData.iteration_count, // This is 1 for a new session
    convergence_status: null,
    preferred_model_for_stage: null,
    
    created_at: sessionData.created_at,
    updated_at: sessionData.updated_at,

    dialectic_session_models: [], // Initialize as empty, to be populated later if needed
    dialectic_contributions: [], // Initialize as empty, to be populated later if needed
  };

  // Set the active prompt template ID based on the current stage
  const stageLower = payload.stageAssociation.toLowerCase();
  if (systemPromptId) { // systemPromptId was fetched earlier
    if (stageLower === "thesis") resultSession.active_thesis_prompt_template_id = systemPromptId;
    else if (stageLower === "antithesis") resultSession.active_antithesis_prompt_template_id = systemPromptId;
    else if (stageLower === "synthesis") resultSession.active_synthesis_prompt_template_id = systemPromptId;
    else if (stageLower === "parenthesis") resultSession.active_parenthesis_prompt_template_id = systemPromptId;
    else if (stageLower === "paralysis") resultSession.active_paralysis_prompt_template_id = systemPromptId;
  }
  
  return { data: resultSession }; 
}
  