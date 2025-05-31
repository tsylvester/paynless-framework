// deno-lint-ignore-file no-explicit-any
import { 
    StartSessionPayload, 
    StartSessionSuccessResponse, 
} from "./dialectic.interface.ts";
import { createSupabaseClient as originalCreateSupabaseClient } from "../_shared/auth.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { logger as originalLogger, type Logger } from "../_shared/logger.ts";

console.log("startSession function started");

// Define Dependencies Interface
export interface StartSessionDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  randomUUID: () => string;
  logger: Logger;
}

// Define default dependencies
const defaultStartSessionDeps: StartSessionDeps = {
  createSupabaseClient: originalCreateSupabaseClient,
  randomUUID: () => crypto.randomUUID(),
  logger: originalLogger,
};

export async function startSession(
  req: Request, // For user authentication
  dbClient: SupabaseClient<Database>, // Corrected type
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps> 
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
  const deps = { ...defaultStartSessionDeps, ...partialDeps };
  // Revert to const as logger methods are not reassigned by the function itself
  const { createSupabaseClient, randomUUID, logger } = deps;

  logger.info(`startSession called with payload: ${JSON.stringify(payload)}`);

  const { data: userSession, error: authError } = await createSupabaseClient(req).auth.getUser();

  if (authError || !userSession?.user?.id) {
    logger.warn(`[startSession] User not authenticated.`, { error: authError });
    return { error: { message: "User not authenticated", status: 401, code: "AUTH_UNAUTHENTICATED" } };
  }
  const userId = userSession.user.id;
  logger.info(`[startSession] User ${userId} authenticated.`);

  // Explicitly check for originatingChatId
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
    .select('id, user_id, initial_user_prompt, selected_domain_tag')
    .eq('id', payload.projectId)
    .eq('user_id', userId)
    .single();

  if (projectError || !project) {
    logger.error("[startSession] Error fetching project or project not found/access denied:", { projectId: payload.projectId, userId: userId, error: projectError });
    const status = (projectError && projectError.code === 'PGRST116') || !project ? 404 : 500;
    return { error: { message: "Project not found or access denied.", status } };
  }
  logger.info(`[startSession] Project ${project.id} details fetched.`);

  // 2. Fetch prompt template IDs (thesis, antithesis)
  let thesisPromptId: string | null = null;
  let antithesisPromptId: string | null = null;
  let thesisPromptText: string | null = null;

  try {
    logger.info(`[startSession] Fetching thesis prompt for project ${project.id}, template name: ${payload.thesisPromptTemplateName || "default"}, context: ${project.selected_domain_tag || 'general'}`);
    let thesisQuery = dbClient.from('system_prompts').select('id, prompt_text').eq('is_active', true);
    if (payload.thesisPromptTemplateName) {
      thesisQuery = thesisQuery.eq('name', payload.thesisPromptTemplateName);
    } else {
      thesisQuery = thesisQuery.eq('stage_association', 'thesis').eq('is_stage_default', true)
                   .eq('context', project.selected_domain_tag || 'general');
    }
    const { data: thesisP, error: thesisErr } = await thesisQuery.maybeSingle(); 
    if (thesisErr) throw new Error(`Error fetching thesis prompt: ${thesisErr.message}`);
    if (!thesisP) throw new Error(`No suitable thesis prompt found for name '${payload.thesisPromptTemplateName || "default"}' or default for context '${project.selected_domain_tag || 'general'}'`);
    thesisPromptId = thesisP.id;
    thesisPromptText = thesisP.prompt_text;
    logger.info(`[startSession] Thesis prompt ID ${thesisPromptId} fetched.`);

    logger.info(`[startSession] Fetching antithesis prompt for project ${project.id}, template name: ${payload.antithesisPromptTemplateName || "default"}, context: ${project.selected_domain_tag || 'general'}`);
    let antithesisQuery = dbClient.from('system_prompts').select('id').eq('is_active', true);
    if (payload.antithesisPromptTemplateName) {
      antithesisQuery = antithesisQuery.eq('name', payload.antithesisPromptTemplateName);
    } else {
      antithesisQuery = antithesisQuery.eq('stage_association', 'antithesis').eq('is_stage_default', true)
                   .eq('context', project.selected_domain_tag || 'general');
    }
    const { data: antithesisP, error: antithesisErr } = await antithesisQuery.maybeSingle();
    if (antithesisErr) throw new Error(`Error fetching antithesis prompt: ${antithesisErr.message}`);
    if (!antithesisP) throw new Error(`No suitable antithesis prompt found for name '${payload.antithesisPromptTemplateName || "default"}' or default for context '${project.selected_domain_tag || 'general'}'`);
    antithesisPromptId = antithesisP.id;
    logger.info(`[startSession] Antithesis prompt ID ${antithesisPromptId} fetched.`);

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("[startSession] Prompt fetching error:", { error: errorMessage });
    return { error: { message: errorMessage, status: 400 } };
  }
  
  // 3. & 5. Create dialectic_sessions record with status 'pending_thesis'
  const sessionStatus = 'pending_thesis';
  logger.info(`[startSession] Inserting dialectic_sessions record for project ${project.id} with status ${sessionStatus}`);
  const { data: sessionData, error: sessionInsertError } = await dbClient
    .from('dialectic_sessions')
    .insert({
      project_id: project.id,
      session_description: payload.sessionDescription,
      active_thesis_prompt_template_id: thesisPromptId,
      active_antithesis_prompt_template_id: antithesisPromptId,
      status: sessionStatus,
      iteration_count: 1, 
      associated_chat_id: associatedChatIdToUse, 
    })
    .select('id') 
    .single();

  if (sessionInsertError || !sessionData) {
    logger.error("[startSession] Error inserting dialectic session:", { projectId: project.id, error: sessionInsertError });
    return { error: { message: "Failed to create session.", details: sessionInsertError?.message, status: 500 } };
  }
  const newSessionId = sessionData.id;
  logger.info(`[startSession] Session ${newSessionId} created.`);

  // 4. Create dialectic_session_models records
  logger.info(`[startSession] Inserting dialectic_session_models for session ${newSessionId}`, { modelIds: payload.selectedModelCatalogIds });
  const sessionModelsData = payload.selectedModelCatalogIds.map(modelId => ({
    session_id: newSessionId,
    model_id: modelId, 
  }));

  const { error: sessionModelsInsertError } = await dbClient
    .from('dialectic_session_models')
    .insert(sessionModelsData);

  if (sessionModelsInsertError) {
    logger.error("[startSession] Error inserting session models:", { sessionId: newSessionId, error: sessionModelsInsertError });
    // Attempt to clean up the created session
    logger.warn(`[startSession] Attempting to delete orphaned session ${newSessionId} due to session_models insert failure.`);
    await dbClient.from('dialectic_sessions').delete().eq('id', newSessionId); 
    return { error: { message: "Failed to associate models with session.", details: sessionModelsInsertError.message, status: 500 } };
  }
  logger.info(`[startSession] Session models associated with session ${newSessionId}.`);

  // 6. Construct and store current_stage_seed_prompt
  const currentStageSeedPrompt = `Rendered Thesis Prompt: ${thesisPromptText}
Initial User Prompt: ${project.initial_user_prompt}`;
  
  logger.info(`[startSession] Updating session ${newSessionId} with current_stage_seed_prompt.`);
  const { data: updatedSession, error: updateSessionError } = await dbClient
    .from('dialectic_sessions')
    .update({ current_stage_seed_prompt: currentStageSeedPrompt })
    .eq('id', newSessionId)
    .select('id') 
    .single();

  if (updateSessionError || !updatedSession) {
      logger.error("[startSession] Error updating session with seed prompt:", { sessionId: newSessionId, error: updateSessionError });
      return { error: { message: "Failed to set initial prompt for session.", details: updateSessionError?.message, status: 500 } };
  }
  logger.info(`[startSession] Session ${newSessionId} updated with seed prompt.`);

  // 7. \`startSession\` concludes. Thesis generation triggered by separate user action.
  logger.info(`[startSession] Session ${newSessionId} started successfully. Associated chat ID for /chat interactions: ${associatedChatIdToUse}. Waiting for user to trigger thesis generation.`);

  return { 
      data: { 
          message: "Session started successfully", 
          sessionId: newSessionId, 
          initialStatus: sessionStatus,
          associatedChatId: associatedChatIdToUse,
      } 
  }; 
}
  