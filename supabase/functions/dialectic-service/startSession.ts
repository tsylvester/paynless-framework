// deno-lint-ignore-file no-explicit-any
import { 
    StartSessionPayload, 
    StartSessionSuccessResponse, 
    DialecticStage,
} from "./dialectic.interface.ts";
import { createSupabaseClient } from "../_shared/auth.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { ILogger } from "../_shared/types.ts";

console.log("startSession function started");

// Define Dependencies Interface
export interface StartSessionDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  randomUUID: () => string;
  logger: ILogger;
}

// Define default dependencies
const defaultStartSessionDeps: StartSessionDeps = {
  createSupabaseClient: createSupabaseClient,
  randomUUID: () => crypto.randomUUID(),
  logger: logger,
};

export async function startSession(
  req: Request, // For user authentication
  dbClient: SupabaseClient<Database>,
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps> 
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
  const deps = { ...defaultStartSessionDeps, ...partialDeps };
  const { createSupabaseClient, randomUUID, logger } = deps;

  logger.info(`startSession called with payload: ${JSON.stringify(payload)}`);

  const { data: userSession, error: authError } = await createSupabaseClient(req).auth.getUser();

  if (authError || !userSession?.user?.id) {
    logger.warn(`[startSession] User not authenticated.`, { error: authError });
    return { error: { message: "User not authenticated", status: 401, code: "AUTH_UNAUTHENTICATED" } };
  }
  const userId = userSession.user.id;
  logger.info(`[startSession] User ${userId} authenticated.`);

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
    .select('id, user_id, initial_user_prompt, selected_domain_tag, selected_domain_overlay_id')
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
    } else if (project.selected_domain_overlay_id) {
      logger.info(`[startSession] Fetching system_prompt_id from domain_specific_prompt_overlays for overlay ID: ${project.selected_domain_overlay_id}`);
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

  logger.info(`[startSession] Inserting dialectic_sessions record for project ${project.id} with stage ${sessionStage} and status ${sessionStatus}`);
  const { data: sessionData, error: sessionInsertError } = await dbClient
    .from('dialectic_sessions')
    .insert({
      project_id: project.id,
      session_description: payload.sessionDescription,
      stage: sessionStage, // Using the new stage field
      status: sessionStatus, // Still using status for now, can be reviewed
      iteration_count: 1, 
      associated_chat_id: associatedChatIdToUse,
      selected_model_catalog_ids: payload.selectedModelCatalogIds, // Storing selected model IDs
      // Removed: active_thesis_prompt_template_id, active_antithesis_prompt_template_id
      // We will store the rendered seed prompt, not just template IDs.
      // The actual system_prompt_id used for the first stage will be stored in the first dialectic_contribution record.
    })
    .select('id') 
    .single();

  if (sessionInsertError || !sessionData) {
    logger.error("[startSession] Error inserting dialectic session:", { projectId: project.id, error: sessionInsertError });
    return { error: { message: "Failed to create session.", details: sessionInsertError?.message, status: 500 } };
  }
  const newSessionId = sessionData.id;
  logger.info(`[startSession] Session ${newSessionId} created with stage ${sessionStage}.`);

  // The dialectic_session_models table is removed. Model IDs are now an array in dialectic_sessions.
  // So, no separate insertion for dialectic_session_models is needed.
  logger.info(`[startSession] Selected model IDs ${payload.selectedModelCatalogIds.join(', ')} stored in session ${newSessionId}.`);
  
  // Construct the seed prompt for the initial stage (e.g., Thesis)
  // This prompt will be used to generate the first contribution.
  // It should be stored in the first dialectic_contribution record, not directly in dialectic_sessions.
  // However, the user might want to see what this initial prompt looks like.
  const initialStageSeedPrompt = `Rendered System Prompt for ${payload.stageAssociation}:
${systemPromptText}

Initial User Prompt (from project):
${project.initial_user_prompt}`;
  
  logger.info(`[startSession] Initial seed prompt for session ${newSessionId} constructed. This will be used for the first contribution of stage ${payload.stageAssociation}.`);
  // The field 'current_stage_seed_prompt' was removed from 'dialectic_sessions' table.
  // This information will now be part of the first 'dialectic_contributions' record for this session and stage.
  // No direct update to the session record with this seed prompt is performed here.

  logger.info(`[startSession] Session ${newSessionId} started successfully. Stage: ${sessionStage}, Status: ${sessionStatus}. Associated chat ID for /chat interactions: ${associatedChatIdToUse}.`);

  return { 
      data: { 
          message: "Session started successfully", 
          sessionId: newSessionId, 
          initialStatus: sessionStatus, // Consider returning 'initialStage' as well or instead
          associatedChatId: associatedChatIdToUse,
          // Potentially return initialStageSeedPrompt or systemPromptText if useful for the client
      } 
  }; 
}
  