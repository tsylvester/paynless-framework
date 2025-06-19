// deno-lint-ignore-file no-explicit-any
import { 
    StartSessionPayload, 
    StartSessionSuccessResponse, 
} from "./dialectic.interface.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { ILogger } from "../_shared/types.ts";
import { PromptAssembler, type ProjectContext, type StageContext } from "../_shared/prompt-assembler.ts";
import { FileManagerService } from "../_shared/services/file_manager.ts";
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

async function getInitialPromptContent(
    dbClient: SupabaseClient<Database>,
    project: ProjectContext,
    logger: ILogger
): Promise<{ content?: string; storagePath?: string; error?: string }> {
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
        
        // We don't download the content anymore, we pass the path for the service to copy
        return { content: '', storagePath: resource.storage_path };
    }

    logger.warn(`[getInitialPromptContent] Project ${project.id} has neither a direct prompt nor a resource file.`);
    return { content: 'No prompt provided.' }; // Fallback content
}

export interface StartSessionDeps {
  randomUUID: () => string;
  logger: ILogger;
  fileManager: FileManagerService;
}

export async function startSession(
  user: User,
  dbClient: SupabaseClient<Database>,
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps> 
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
    const deps: StartSessionDeps = { 
        randomUUID: () => crypto.randomUUID(),
        logger: logger,
        fileManager: new FileManagerService(dbClient),
        ...partialDeps 
    };
    const { randomUUID, logger: log, fileManager } = deps;

    log.info(`[startSession] Function started for user ${user.id} with payload projectId: ${payload.projectId}`);

    const { projectId, originatingChatId, selectedModelCatalogIds, sessionDescription } = payload;
    const userId = user.id;

    const { data: project, error: projectError } = await dbClient
        .from('dialectic_projects')
        .select('*, dialectic_domains ( name )')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

    if (projectError || !project) {
        log.error("[startSession] Error fetching project or project not found/access denied:", { projectId, userId, error: projectError });
        return { error: { message: "Project not found or access denied.", status: projectError?.code === 'PGRST116' ? 404 : 500 } };
    }
    log.info(`[startSession] Project ${project.id} details fetched.`);

    if (!project.process_template_id) {
        log.error(`[startSession] Project ${project.id} is missing a 'process_template_id'. Cannot start session.`);
        return { error: { message: "Project is not configured with a process template.", status: 400 } };
    }

    // 1. Find the initial stage for the session.
    // If a stageSlug is provided, use it. Otherwise, find the template's entry point.
    let initialStageId: string | undefined;
    let initialStageName: string | undefined;
    let defaultSystemPrompt: { id: string, prompt_text: string } | undefined;

    if (payload.stageSlug) {
        log.info(`[startSession] Attempting to find initial stage using provided slug: '${payload.stageSlug}'`);

        // First, validate the stage is part of the project's template and get its details.
        const { data: stageTransitions, error: transitionError } = await dbClient
            .from('dialectic_stage_transitions')
            .select('source_stage_id, target_stage_id')
            .eq('process_template_id', project.process_template_id);

        if (transitionError) {
             log.error("[startSession] DB error fetching stage transitions for template.", { processTemplateId: project.process_template_id, dbError: transitionError });
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
            log.error("[startSession] Could not find a valid stage for the given slug and project.", { slug: payload.stageSlug, projectId: project.id, dbError: stageError });
            return { error: { message: "Provided initial stage is invalid for this project.", status: 400 } };
        }
        if (!stageData.default_system_prompt_id) {
            log.error(`[startSession] Stage '${stageData.display_name}' is missing a default_system_prompt_id.`, { stageId: stageData.id });
            return { error: { message: `Configuration error: Stage '${stageData.display_name}' is missing a default prompt.`, status: 500 } };
        }

        // Now, fetch the system prompt using the direct ID.
        const { data: prompt, error: promptError } = await dbClient
            .from('system_prompts')
            .select('id, prompt_text')
            .eq('id', stageData.default_system_prompt_id)
            .single();

        if (promptError || !prompt) {
             log.error(`[startSession] Could not find system prompt with ID from stage.`, { promptId: stageData.default_system_prompt_id, dbError: promptError });
             return { error: { message: `Configuration error: Default prompt for stage '${stageData.display_name}' not found.`, status: 500 } };
        }
        
        initialStageId = stageData.id;
        initialStageName = stageData.display_name;
        defaultSystemPrompt = prompt;

    } else {
        // Fallback to entry point logic if no slug is provided
        log.info(`[startSession] No stage slug provided, finding entry point for template: ${project.process_template_id}`);
        
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
            log.error("[startSession] Could not find an entry point stage for the project's process template.", { processTemplateId: project.process_template_id, dbError: entryPointError });
            return { error: { message: "Failed to determine initial process stage.", status: 500 } };
        }
        const stage = entryPoint.dialectic_stages;
        if (!stage.system_prompts || stage.system_prompts.length === 0) {
             log.error(`[startSession] Entry point stage '${stage.display_name}' has no associated system prompt.`, { stageId: stage.id });
             return { error: { message: `Configuration error: Initial stage '${stage.display_name}' is missing a default prompt.`, status: 500 } };
        }
        initialStageId = stage.id;
        initialStageName = stage.display_name;
        defaultSystemPrompt = stage.system_prompts[0];
    }
    
    if (!initialStageId || !initialStageName || !defaultSystemPrompt) {
        log.error(`[startSession] Failed to definitively determine a valid initial stage or prompt.`, { initialStageId, initialStageName, defaultSystemPromptExists: !!defaultSystemPrompt });
        return { error: { message: "Could not determine a valid starting stage for the session.", status: 500 } };
    }

    // Now that we have the stage ID, fetch the full stage object and overlays separately
    const { data: fullStageData, error: fullStageError } = await dbClient
        .from('dialectic_stages')
        .select('*')
        .eq('id', initialStageId)
        .single();
    
    if(fullStageError || !fullStageData) {
        log.error("[startSession] Could not fetch the full initial stage data.", { stageId: initialStageId, dbError: fullStageError });
        return { error: { message: "Failed to load initial stage configuration.", status: 500 } };
    }

    const { data: overlays, error: overlaysError } = await dbClient
        .from('domain_specific_prompt_overlays')
        .select('overlay_values')
        .eq('system_prompt_id', defaultSystemPrompt.id)
        .eq('domain_id', project.selected_domain_id);
    
    if (overlaysError) {
        log.error("[startSession] Could not fetch domain-specific overlays.", { systemPromptId: defaultSystemPrompt.id, domainId: project.selected_domain_id, dbError: overlaysError });
        return { error: { message: "Failed to load domain-specific prompt configuration.", status: 500 } };
    }

    log.info(`[startSession] Determined initial stage: '${initialStageName}' (ID: ${initialStageId})`);

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
        log.error("[startSession] Database error during session insertion", { projectId, userId, dbError: sessionInsertError });
        return { error: { message: "Failed to create the session.", details: sessionInsertError?.message, status: 500 } };
    }

    // Get the initial prompt content (either from text or file)
    const { content: initialPromptContent, storagePath, error: promptContentError } = await getInitialPromptContent(dbClient, project, log);
    if (promptContentError) {
         log.error("[startSession] Failed to get initial prompt content. Cleaning up session.", { sessionId: newSession.id, error: promptContentError });
         await dbClient.from('dialectic_sessions').delete().eq('id', newSession.id);
         return { error: { message: `Failed to prepare session: ${promptContentError}`, status: 500 } };
    }

    if (storagePath) {
        // If there's a storage path, we need to copy the file for the new session
        // This functionality will be added to FileManagerService later.
        // For now, we'll re-upload the content we just downloaded.
        // This part needs to be implemented properly with a copy function.
        log.warn(`[startSession] File copy from storagePath not implemented in FileManagerService yet. Re-uploading content for now.`);
    }

    // Save the user prompt for the session using the file manager
    const userPromptContent = initialPromptContent || 'No prompt provided';
    const userPromptBuffer = Buffer.from(new TextEncoder().encode(userPromptContent));
    const { record: userPromptRecord, error: userPromptError } = await fileManager.uploadAndRegisterFile({
        pathContext: {
            projectId: project.id,
            fileType: 'user_prompt',
            sessionId: newSession.id,
            iteration: 1,
            stageSlug: fullStageData.slug,
            originalFileName: project.initial_prompt_resource_id ? 'user_prompt.md' : 'user_prompt.txt',
        },
        fileContent: userPromptBuffer,
        mimeType: project.initial_prompt_resource_id ? 'text/markdown' : 'text/plain',
        sizeBytes: userPromptBuffer.byteLength,
        userId: user.id,
        description: 'Initial user prompt for the session.',
    });
    
    if (userPromptError || !userPromptRecord) {
        log.error("[startSession] Failed to save user prompt via FileManagerService. Cleaning up session.", { sessionId: newSession.id, error: userPromptError });
        await dbClient.from('dialectic_sessions').delete().eq('id', newSession.id);
        return { error: { message: `Failed to save user prompt: ${userPromptError?.message}`, status: 500 } };
    }
    
    log.info(`[startSession] User prompt saved with resource ID: ${userPromptRecord.id}`);


    // Assemble the prompt using our new utility
    const assembler = new PromptAssembler(dbClient);
    const stageContext: StageContext = {
      ...fullStageData,
      domain_specific_prompt_overlays: overlays?.map(o => ({ overlay_values: o.overlay_values as Json })) ?? [],
      system_prompts: defaultSystemPrompt ? { prompt_text: defaultSystemPrompt.prompt_text } : null
    }

    // Prepare system settings for saving
    const systemSettings = {
        session_id: newSession.id,
        project_id: project.id,
        domain: project.dialectic_domains?.name,
        process_template_id: project.process_template_id,
        initial_stage: {
            id: fullStageData.id,
            name: fullStageData.display_name,
            slug: fullStageData.slug,
        },
        selected_models: selectedModelCatalogIds,
        session_description: newSession.session_description,
    };
    const systemSettingsContent = JSON.stringify(systemSettings, null, 2);
    const systemSettingsBuffer = Buffer.from(new TextEncoder().encode(systemSettingsContent));

    // Save system settings using the file manager
    const { record: systemSettingsRecord, error: systemSettingsError } = await fileManager.uploadAndRegisterFile({
        pathContext: {
            projectId: project.id,
            fileType: 'system_settings',
            sessionId: newSession.id,
            iteration: 1,
            stageSlug: fullStageData.slug,
            originalFileName: 'system_settings.json',
        },
        fileContent: systemSettingsBuffer,
        mimeType: 'application/json',
        sizeBytes: systemSettingsBuffer.byteLength,
        userId: user.id,
        description: 'System settings for the session.',
    });

    if (systemSettingsError || !systemSettingsRecord) {
        log.error("[startSession] Failed to save system settings via FileManagerService. Cleaning up session.", { sessionId: newSession.id, error: systemSettingsError });
        await dbClient.from('dialectic_sessions').delete().eq('id', newSession.id);
        // Also clean up the user prompt file that was already created
        await dbClient.from('dialectic_project_resources').delete().eq('id', userPromptRecord.id);
        return { error: { message: `Failed to save system settings: ${systemSettingsError?.message}`, status: 500 } };
    }

    log.info(`[startSession] System settings saved with resource ID: ${systemSettingsRecord.id}`);


    const savedSeedPromptResourceIds: string[] = [];

    for (const modelId of selectedModelCatalogIds) {
        const {data: modelInfo, error: modelError} = await dbClient.from('ai_providers').select('api_identifier').eq('id', modelId).single();
        if(modelError || !modelInfo) {
            log.warn(`[startSession] Could not find model info for ID ${modelId}. Skipping seed prompt generation for this model.`);
            continue;
        }

        const assembledPrompt = await assembler.assemble(
            { ...project, initial_user_prompt: initialPromptContent || '' },
            newSession,
            stageContext,
            initialPromptContent || '',
        );

        const seedPromptBuffer = Buffer.from(new TextEncoder().encode(assembledPrompt));

        const { record: seedPromptRecord, error: seedPromptError } = await fileManager.uploadAndRegisterFile({
            pathContext: {
                projectId: project.id,
                fileType: 'seed_prompt',
                sessionId: newSession.id,
                iteration: 1,
                stageSlug: fullStageData.slug,
                modelSlug: modelInfo.api_identifier,
                originalFileName: `seed_prompt_${modelInfo.api_identifier}.md`,
            },
            fileContent: seedPromptBuffer,
            mimeType: 'text/markdown',
            sizeBytes: seedPromptBuffer.byteLength,
            userId: user.id,
            description: `Seed prompt for model ${modelInfo.api_identifier} in stage ${fullStageData.slug}.`,
        });

        if(seedPromptError || !seedPromptRecord) {
            log.error(`[startSession] Failed to save seed prompt for model ${modelInfo.api_identifier}. Continuing, but this model may fail.`, { sessionId: newSession.id, error: seedPromptError });
            // Don't kill the whole session, just log the error and move on.
        } else {
            savedSeedPromptResourceIds.push(seedPromptRecord.id);
            log.info(`[startSession] Saved seed prompt for model ${modelInfo.api_identifier} with resource ID ${seedPromptRecord.id}`);
        }
    }


    // Update the session with the created resource IDs
    const { error: sessionUpdateError } = await dbClient
        .from('dialectic_sessions')
        .update({
            user_input_reference_url: userPromptRecord.storage_path,
            system_settings_reference_url: systemSettingsRecord.storage_path,
            seed_prompt_reference_urls: savedSeedPromptResourceIds.map(id => fileManager.getFileSignedUrl(id, 'dialectic_contributions')),
        })
        .eq('id', newSession.id);

    if (sessionUpdateError) {
        // This is a critical failure, as the session is now in an inconsistent state.
        // Manual cleanup might be required. Log everything.
        log.error("[startSession] CRITICAL: Failed to update session with resource IDs after creating files.", {
            sessionId: newSession.id,
            userPromptResourceId: userPromptRecord.id,
            systemSettingsResourceId: systemSettingsRecord.id,
            seedPromptResourceIds: savedSeedPromptResourceIds,
            dbError: sessionUpdateError
        });
        // We don't delete the session here, as the files are already in storage and the records exist.
        // Returning an error to the user is the best we can do.
        return { error: { message: `Failed to finalize session setup. Please contact support. Session ID: ${newSession.id}`, status: 500 } };
    }


    log.info(`[startSession] Successfully created session ${newSession.id} and all initial resources.`);
    
    return {
        data: {
            id: newSession.id,
            project_id: newSession.project_id,
            status: newSession.status,
            created_at: newSession.created_at,
            current_stage_id: newSession.current_stage_id,
            iteration_count: newSession.iteration_count,
            selected_model_catalog_ids: newSession.selected_model_catalog_ids,
            associated_chat_id: newSession.associated_chat_id,
            user_input_reference_url: userPromptRecord.storage_path,
            session_description: newSession.session_description,
            updated_at: newSession.updated_at,
        }
    };
}
  