// deno-lint-ignore-file no-explicit-any
import { 
    StartSessionPayload, 
    StartSessionSuccessResponse, 
} from "./dialectic.interface.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../types_db.ts";
import { logger as defaultLogger } from "../_shared/logger.ts";
import type { ILogger } from "../_shared/types.ts";
import { uploadToStorage } from "../_shared/supabase_storage_utils.ts";

export interface StartSessionDeps {
  randomUUID: () => string;
  logger: ILogger;
}

const defaultStartSessionDeps: StartSessionDeps = {
  randomUUID: () => crypto.randomUUID(),
  logger: defaultLogger,
};

// Define a type for the complex query result
type InitialStageData = {
    dialectic_stages: {
        id: string;
        stage_name: string;
        system_prompts: {
            id: string;
            prompt_text: string;
        }[];
    } | null;
} | null;


export async function startSession(
  user: User,
  dbClient: SupabaseClient<Database>,
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps> 
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
    const deps = { ...defaultStartSessionDeps, ...partialDeps };
    const { randomUUID, logger } = deps;

    logger.info(`[startSession] Function started for user ${user.id} with payload projectId: ${payload.projectId}`);

    const { projectId, originatingChatId, selectedModelCatalogIds, sessionDescription } = payload;
    const userId = user.id;

    const { data: project, error: projectError } = await dbClient
        .from('dialectic_projects')
        .select('id, user_id, project_name, initial_user_prompt, process_template_id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

    if (projectError || !project) {
        logger.error("[startSession] Error fetching project or project not found/access denied:", { projectId, userId, error: projectError });
        return { error: { message: "Project not found or access denied.", status: projectError?.code === 'PGRST116' ? 404 : 500 } };
    }
    logger.info(`[startSession] Project ${project.id} details fetched.`);

    if (!project.process_template_id) {
        logger.error(`[startSession] Project ${project.id} is missing a 'process_template_id'. Cannot start session.`);
        return { error: { message: "Project is not configured with a process template.", status: 400 } };
    }

    // 1. Find the initial stage for the project's process template
    const { data: initialStageData, error: initialStageError } = await dbClient
        .from('dialectic_stage_transitions')
        .select(`
            dialectic_stages!from_stage_id(
                id,
                stage_name,
                system_prompts(id, prompt_text)
            )
        `)
        .eq('process_template_id', project.process_template_id)
        .eq('is_entry_point', true)
        .single();

    if (initialStageError || !initialStageData || !(initialStageData as unknown as InitialStageData)?.dialectic_stages) {
        logger.error("[startSession] Could not find an entry point stage for the project's process template.", { processTemplateId: project.process_template_id, dbError: initialStageError });
        return { error: { message: "Failed to determine initial process stage.", status: 500 } };
    }
    
    const initialStage = (initialStageData as unknown as InitialStageData)!.dialectic_stages!;
    const initialStageName = initialStage.stage_name;
    const defaultSystemPrompt = initialStage.system_prompts[0]; 

    if (!defaultSystemPrompt) {
        logger.error(`[startSession] Initial stage '${initialStageName}' has no associated system prompt.`, { stageId: initialStage.id });
        return { error: { message: `Configuration error: Initial stage '${initialStageName}' is missing a default prompt.`, status: 500 } };
    }
    logger.info(`[startSession] Determined initial stage: '${initialStageName}' (ID: ${initialStage.id})`);

    const systemPromptText = defaultSystemPrompt.prompt_text;
    const initialStageSeedPromptText = `Rendered System Prompt for ${initialStageName}:\n${systemPromptText}\n\nInitial User Prompt (from project):\n${project.initial_user_prompt}`;

    const associatedChatId = originatingChatId || randomUUID();
    const descriptionForDb = sessionDescription?.trim() || `${project.project_name || 'Unnamed Project'} - New Session`;

    const { data: newSession, error: sessionInsertError } = await dbClient
        .from('dialectic_sessions')
        .insert({
            project_id: project.id,
            session_description: descriptionForDb,
            current_stage_id: initialStage.id,
            status: `pending_${initialStageName}`,
            iteration_count: 1,
            associated_chat_id: associatedChatId,
            selected_model_catalog_ids: selectedModelCatalogIds,
        })
        .select()
        .single();

    if (sessionInsertError || !newSession) {
        logger.error("[startSession] Database error during session insertion", { projectId, userId, dbError: sessionInsertError });
        return { error: { message: "Failed to create the session.", details: sessionInsertError?.message, status: 500 } };
    }
    logger.info(`[startSession] Session ${newSession.id} created successfully, currently at stage: ${initialStageName}`);
    
    const iterationNumber = 1;
    const seedPromptStoragePath = `projects/${project.id}/sessions/${newSession.id}/iteration_${iterationNumber}/${initialStageName}/seed_prompt.md`;
    const dialecticContributionsBucket = Deno.env.get("CONTENT_STORAGE_BUCKET") || "dialectic-contributions";

    try {
        logger.info(`[startSession] Uploading initial seed prompt to: ${seedPromptStoragePath}`);
        const { error: uploadError } = await uploadToStorage(
            dbClient,
            dialecticContributionsBucket,
            seedPromptStoragePath,
            initialStageSeedPromptText,
            { contentType: "text/markdown", upsert: true }
        );

        if (uploadError) {
            throw uploadError;
        }
        logger.info(`[startSession] Successfully uploaded seed prompt for initial stage.`);
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        logger.error("[startSession] Failed to upload initial seed prompt. Cleaning up session.", { sessionId: newSession.id, error: errorMessage });
        
        await dbClient.from('dialectic_sessions').delete().eq('id', newSession.id);
        
        return { error: { message: `Failed to prepare session: could not save initial prompt.`, details: errorMessage, status: 500 } };
    }

    logger.info(`[startSession] Responding with success for session ${newSession.id}`);
    
    return {
        data: {
            ...(newSession as Tables<'dialectic_sessions'>),
            dialectic_session_models: [],
            dialectic_contributions: []
        }
    };
}
  