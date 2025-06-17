// deno-lint-ignore-file no-explicit-any
import { 
    StartSessionPayload, 
    StartSessionSuccessResponse, 
} from "./dialectic.interface.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../types_db.ts";
import { logger as defaultLogger, type Logger } from "../_shared/logger.ts";
import type { ILogger } from "../_shared/types.ts";
import { uploadAndRegisterResource } from "./uploadProjectResourceFile.ts";
import { PromptAssembler, type ProjectContext, type StageContext } from "../_shared/prompt-assembler.ts";

async function getInitialPromptContent(
    dbClient: SupabaseClient<Database>,
    project: ProjectContext,
    logger: ILogger
): Promise<{ content?: string, error?: string }> {
    if (project.initial_user_prompt) {
        logger.info(`[getInitialPromptContent] Using direct initial_user_prompt for project ${project.id}.`);
        return { content: project.initial_user_prompt };
    }

    if (project.initial_prompt_resource_id) {
        logger.info(`[getInitialPromptContent] No direct prompt, attempting to fetch from resource ID ${project.initial_prompt_resource_id} for project ${project.id}.`);
        const { data: resource, error: resourceError } = await dbClient
            .from('dialectic_project_resources')
            .select('storage_bucket, storage_path')
            .eq('id', project.initial_prompt_resource_id)
            .single();

        if (resourceError || !resource) {
            logger.error(`[getInitialPromptContent] Could not find dialectic_project_resources record for ID ${project.initial_prompt_resource_id}.`, { dbError: resourceError });
            return { error: `Could not find prompt resource details for ID ${project.initial_prompt_resource_id}.` };
        }

        const { data: blob, error: downloadError } = await dbClient
            .storage
            .from(resource.storage_bucket)
            .download(resource.storage_path);
        
        if (downloadError || !blob) {
            logger.error(`[getInitialPromptContent] Failed to download prompt file from storage.`, { bucket: resource.storage_bucket, path: resource.storage_path, downloadError });
            return { error: `Failed to download prompt file from storage.` };
        }
        
        const content = await blob.text();
        logger.info(`[getInitialPromptContent] Successfully downloaded and read prompt content from resource.`);
        return { content };
    }

    logger.warn(`[getInitialPromptContent] Project ${project.id} has neither a direct prompt nor a resource file.`);
    return { content: 'No prompt provided.' }; // Fallback content
}

export interface StartSessionDeps {
  randomUUID: () => string;
  logger: ILogger;
  uploadAndRegisterResource: typeof uploadAndRegisterResource;
}

const defaultStartSessionDeps: StartSessionDeps = {
  randomUUID: () => crypto.randomUUID(),
  logger: defaultLogger,
  uploadAndRegisterResource,
};

export async function startSession(
  user: User,
  dbClient: SupabaseClient<Database>,
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps> 
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
    const deps = { ...defaultStartSessionDeps, ...partialDeps };
    const { randomUUID, logger, uploadAndRegisterResource: doUpload } = deps;

    logger.info(`[startSession] Function started for user ${user.id} with payload projectId: ${payload.projectId}`);

    const { projectId, originatingChatId, selectedModelCatalogIds, sessionDescription } = payload;
    const userId = user.id;

    const { data: project, error: projectError } = await dbClient
        .from('dialectic_projects')
        .select('*, dialectic_domains ( name )')
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

    // 1. Find the initial stage for the session.
    // If a stageSlug is provided, use it. Otherwise, find the template's entry point.
    let initialStageId: string | undefined;
    let initialStageName: string | undefined;
    let defaultSystemPrompt: { id: string, prompt_text: string } | undefined;

    if (payload.stageSlug) {
        logger.info(`[startSession] Attempting to find initial stage using provided slug: '${payload.stageSlug}'`);

        // First, validate the stage is part of the project's template and get its details.
        const { data: stageTransitions, error: transitionError } = await dbClient
            .from('dialectic_stage_transitions')
            .select('source_stage_id, target_stage_id')
            .eq('process_template_id', project.process_template_id);

        if (transitionError) {
             logger.error("[startSession] DB error fetching stage transitions for template.", { processTemplateId: project.process_template_id, dbError: transitionError });
             return { error: { message: "Failed to validate process template stages.", status: 500 } };
        }
        const validStageIds = new Set(stageTransitions?.flatMap(t => [t.source_stage_id, t.target_stage_id]) ?? []);

        const { data: stageData, error: stageError } = await dbClient
            .from('dialectic_stages')
            .select('id, display_name, default_system_prompt_id')
            .eq('slug', payload.stageSlug)
            .in('id', Array.from(validStageIds))
            .single();

        if (stageError || !stageData) {
            logger.error("[startSession] Could not find a valid stage for the given slug and project.", { slug: payload.stageSlug, projectId: project.id, dbError: stageError });
            return { error: { message: "Provided initial stage is invalid for this project.", status: 400 } };
        }
        if (!stageData.default_system_prompt_id) {
            logger.error(`[startSession] Stage '${stageData.display_name}' is missing a default_system_prompt_id.`, { stageId: stageData.id });
            return { error: { message: `Configuration error: Stage '${stageData.display_name}' is missing a default prompt.`, status: 500 } };
        }

        // Now, fetch the system prompt using the direct ID.
        const { data: prompt, error: promptError } = await dbClient
            .from('system_prompts')
            .select('id, prompt_text')
            .eq('id', stageData.default_system_prompt_id)
            .single();

        if (promptError || !prompt) {
             logger.error(`[startSession] Could not find system prompt with ID from stage.`, { promptId: stageData.default_system_prompt_id, dbError: promptError });
             return { error: { message: `Configuration error: Default prompt for stage '${stageData.display_name}' not found.`, status: 500 } };
        }
        
        initialStageId = stageData.id;
        initialStageName = stageData.display_name;
        defaultSystemPrompt = prompt;

    } else {
        // Fallback to entry point logic if no slug is provided
        logger.info(`[startSession] No stage slug provided, finding entry point for template: ${project.process_template_id}`);
        
        type EntryPointResponse = {
            dialectic_stages: {
                id: string;
                display_name: string;
                system_prompts: {
                    id: string;
                    prompt_text: string;
                }[] | null;
            } | null;
        }

        const { data: entryPoint, error: entryPointError } = await dbClient
            .from('dialectic_stage_transitions')
            .select('dialectic_stages!to_stage_id(id, display_name, system_prompts(id, prompt_text))')
            .eq('process_template_id', project.process_template_id)
            .eq('is_entry_point', true)
            .single<EntryPointResponse>();

        if (entryPointError || !entryPoint || !entryPoint.dialectic_stages) {
            logger.error("[startSession] Could not find an entry point stage for the project's process template.", { processTemplateId: project.process_template_id, dbError: entryPointError });
            return { error: { message: "Failed to determine initial process stage.", status: 500 } };
        }
        const stage = entryPoint.dialectic_stages;
        if (!stage.system_prompts || stage.system_prompts.length === 0) {
             logger.error(`[startSession] Entry point stage '${stage.display_name}' has no associated system prompt.`, { stageId: stage.id });
             return { error: { message: `Configuration error: Initial stage '${stage.display_name}' is missing a default prompt.`, status: 500 } };
        }
        initialStageId = stage.id;
        initialStageName = stage.display_name;
        defaultSystemPrompt = stage.system_prompts[0];
    }
    
    if (!initialStageId || !initialStageName || !defaultSystemPrompt) {
        logger.error(`[startSession] Failed to definitively determine a valid initial stage or prompt.`, { initialStageId, initialStageName, defaultSystemPromptExists: !!defaultSystemPrompt });
        return { error: { message: "Could not determine a valid starting stage for the session.", status: 500 } };
    }

    // Now that we have the stage ID, fetch the full stage object and overlays separately
    const { data: fullStageData, error: fullStageError } = await dbClient
        .from('dialectic_stages')
        .select('*')
        .eq('id', initialStageId)
        .single();
    
    if(fullStageError || !fullStageData) {
        logger.error("[startSession] Could not fetch the full initial stage data.", { stageId: initialStageId, dbError: fullStageError });
        return { error: { message: "Failed to load initial stage configuration.", status: 500 } };
    }

    const { data: overlays, error: overlaysError } = await dbClient
        .from('domain_specific_prompt_overlays')
        .select('overlay_values')
        .eq('system_prompt_id', defaultSystemPrompt.id)
        .eq('domain_id', project.selected_domain_id);
    
    if (overlaysError) {
        logger.error("[startSession] Could not fetch domain-specific overlays.", { systemPromptId: defaultSystemPrompt.id, domainId: project.selected_domain_id, dbError: overlaysError });
        return { error: { message: "Failed to load domain-specific prompt configuration.", status: 500 } };
    }

    logger.info(`[startSession] Determined initial stage: '${initialStageName}' (ID: ${initialStageId})`);

    const associatedChatId = originatingChatId || randomUUID();
    const descriptionForDb = sessionDescription?.trim() || `${project.project_name || 'Unnamed Project'} - New Session`;

    // We create the session first to get its ID for the assembler context
    const { data: newSession, error: sessionInsertError } = await dbClient
        .from('dialectic_sessions')
        .insert({
            project_id: project.id,
            session_description: descriptionForDb,
            current_stage_id: initialStageId,
            status: `pending_${initialStageName.replace(/\s+/g, '_').toLowerCase()}`, // Create a slug-like status
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

    // Get the initial prompt content (either from text or file)
    const { content: initialPromptContent, error: promptContentError } = await getInitialPromptContent(dbClient, project, logger);
    if (promptContentError) {
         logger.error("[startSession] Failed to get initial prompt content. Cleaning up session.", { sessionId: newSession.id, error: promptContentError });
         await dbClient.from('dialectic_sessions').delete().eq('id', newSession.id);
         return { error: { message: `Failed to prepare session: ${promptContentError}`, status: 500 } };
    }

    // Assemble the prompt using our new utility
    const assembler = new PromptAssembler(dbClient);
    
    const stageContextForAssembler: StageContext = {
        ...fullStageData,
        system_prompts: { prompt_text: defaultSystemPrompt.prompt_text },
        domain_specific_prompt_overlays: overlays?.map(o => ({ overlay_values: o.overlay_values })) ?? [],
    };

    const assembledPrompt = await assembler.assemble(
        project,
        newSession,
        stageContextForAssembler,
        initialPromptContent!
    );

    const resourceDescription = JSON.stringify({
        type: "seed_prompt",
        stage_id: newSession.current_stage_id,
        session_id: newSession.id,
        iteration: newSession.iteration_count,
        stage_slug: fullStageData.slug
    });

    const { error: uploadError } = await doUpload(
        dbClient,
        user,
        logger as Logger,
        project.id,
        new Blob([assembledPrompt], { type: 'text/markdown' }),
        'seed_prompt.md',
        'text/markdown',
        resourceDescription
    );
    
    if (uploadError) {
        logger.error("[startSession] Failed to upload and register the initial seed prompt. Cleaning up session.", { sessionId: newSession.id, error: uploadError });
        await dbClient.from('dialectic_sessions').delete().eq('id', newSession.id);
        return { error: { message: "Failed to create initial seed prompt.", details: uploadError.details, status: uploadError.status } };
    }

    logger.info(`[startSession] Session ${newSession.id} started successfully for project ${project.id}.`);

    return { data: newSession as StartSessionSuccessResponse };
}
  