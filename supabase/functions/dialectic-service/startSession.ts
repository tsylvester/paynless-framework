// deno-lint-ignore-file no-explicit-any
import {
    StartSessionPayload,
    StartSessionSuccessResponse,
} from "./dialectic.interface.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { ILogger } from "../_shared/types.ts";
import { PromptAssembler } from "../_shared/prompt-assembler.ts";
import { ProjectContext, StageContext, SessionContext, IPromptAssembler } from "../_shared/prompt-assembler.interface.ts";
import { FileManagerService } from "../_shared/services/file_manager.ts";
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import { formatResourceDescription } from '../_shared/utils/resourceDescriptionFormatter.ts';
import { getInitialPromptContent } from '../_shared/utils/project-initial-prompt.ts';
import { downloadFromStorage } from '../_shared/supabase_storage_utils.ts';
import { IRagServiceDependencies } from '../_shared/services/rag_service.interface.ts';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import { OpenAIEmbeddingClient, IndexingService, LangchainTextSplitter } from '../_shared/services/indexing_service.ts';
import { IFileManager } from '../_shared/types/file_manager.types.ts';
import { FileType } from "../_shared/types/file_manager.types.ts";
import { isAiModelExtendedConfig } from '../_shared/utils/type_guards.ts';

export interface StartSessionDeps {
    logger: ILogger;
    fileManager: IFileManager;
    promptAssembler: IPromptAssembler;
    randomUUID: () => string;
}


export async function startSession(
  user: User,
  dbClient: SupabaseClient<Database>,
  payload: StartSessionPayload,
  partialDeps?: Partial<StartSessionDeps>
): Promise<{ data?: StartSessionSuccessResponse; error?: { message: string; status?: number; details?: string, code?: string } }> {
    const log: ILogger = partialDeps?.logger || logger;
    const fileManager: IFileManager = partialDeps?.fileManager || new FileManagerService(dbClient);
    const randomUUID = partialDeps?.randomUUID || (() => crypto.randomUUID());

    log.info(`[startSession] Function started for user ${user.id} with payload projectId: ${payload.projectId}`);

    const { projectId, originatingChatId, selectedModelIds, sessionDescription } = payload;
    const userId = user.id;

    const { data: project, error: projectError } = await dbClient
        .from('dialectic_projects')
        .select('*, dialectic_domains ( id, name, description )')
        .eq('id', projectId)
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
        // Use project.process_template_id to find the template, then its starting_stage_id
        log.info(`[startSession] No stage slug provided. Looking up starting stage for project template ID: ${project.process_template_id}`);
        
        if (!project.process_template_id) {
            log.error(`[startSession] Project ${project.id} is missing a 'process_template_id'. Cannot determine starting stage.`);
            return { error: { message: "Project is not configured with a process template.", status: 400 } };
        }

        // Fetch the process template to get its starting_stage_id
        const { data: processTemplate, error: templateError } = await dbClient
            .from('dialectic_process_templates')
            .select('id, name, starting_stage_id')
            .eq('id', project.process_template_id)
            .single();

        if (templateError || !processTemplate) {
            log.error("[startSession] Error fetching process template or template not found.", { processTemplateId: project.process_template_id, dbError: templateError });
            return { error: { message: "Process template not found.", status: templateError?.code === 'PGRST116' ? 404 : 500 } };
        }

        if (!processTemplate.starting_stage_id) {
            log.error(`[startSession] Process template ${processTemplate.id} ('${processTemplate.name}') does not have a 'starting_stage_id' defined.`);
            return { error: { message: "Process template does not have a starting stage defined.", status: 500 } };
        }
        
        const actualStartingStageId = processTemplate.starting_stage_id;
        log.info(`[startSession] Template's starting_stage_id is: ${actualStartingStageId}`);

        // Fetch the stage details using the starting_stage_id from the template
        const { data: stageData, error: stageError } = await dbClient
            .from('dialectic_stages')
            .select('id, display_name, default_system_prompt_id')
            .eq('id', actualStartingStageId)
            .single();

        if (stageError || !stageData) {
            log.error("[startSession] Could not find the starting stage defined by the process template.", { startingStageId: actualStartingStageId, dbError: stageError });
            return { error: { message: "Failed to find the initial stage specified by the process template.", status: 500 } };
        }

        if (!stageData.default_system_prompt_id) {
            log.error(`[startSession] Starting stage '${stageData.display_name}' (ID: ${stageData.id}) is missing a default_system_prompt_id.`);
            return { error: { message: `Configuration error: Initial stage '${stageData.display_name}' is missing a default prompt.`, status: 500 } };
        }

        // Fetch the system prompt using the default_system_prompt_id from the stage
        const { data: prompt, error: promptError } = await dbClient
            .from('system_prompts')
            .select('id, prompt_text')
            .eq('id', stageData.default_system_prompt_id)
            .single();

        if (promptError || !prompt) {
             log.error(`[startSession] Could not find system prompt with ID from starting stage.`, { promptId: stageData.default_system_prompt_id, dbError: promptError });
             return { error: { message: `Configuration error: Default prompt for initial stage '${stageData.display_name}' not found.`, status: 500 } };
        }
        
        initialStageId = stageData.id;
        initialStageName = stageData.display_name;
        defaultSystemPrompt = prompt;
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
        log.warn(`[startSession] Could not fetch overlays for prompt ${defaultSystemPrompt.id} and domain ${project.selected_domain_id}. Proceeding without.`, { dbError: overlaysError });
    }

    log.info(`[startSession] Determined initial stage: '${initialStageName}' (ID: ${initialStageId})`);

    // Prepare prompt assembly context
    const { dialectic_domains, ...projectData } = project;
    const projectContext: ProjectContext = {
        ...projectData,
        dialectic_domains: dialectic_domains ? { name: dialectic_domains.name } : { name: 'General' },
    };

    const stageContext: StageContext = {
        ...fullStageData,
        system_prompts: { prompt_text: defaultSystemPrompt.prompt_text },
        domain_specific_prompt_overlays: overlaysError ? [] : (overlays || []).map(o => ({ overlay_values: o.overlay_values as Json })),
    };
    
    const initialPrompt = await getInitialPromptContent(dbClient, projectContext, log, downloadFromStorage);

    if (!initialPrompt) {
        log.error(`[startSession] Failed to get initial prompt details for project ${project.id}`);
        return { error: { message: "Failed to retrieve initial prompt details.", status: 500 } };
    }
    if (initialPrompt.error || typeof initialPrompt.content !== 'string') {
        log.error(`[startSession] Failed to get initial prompt content for project ${project.id}`, { error: initialPrompt.error });
        return { error: { message: initialPrompt.error || "Failed to retrieve initial prompt content.", status: 500 } };
    }
    
    const { data: modelConfigRecord, error: modelConfigError } = await dbClient
        .from('ai_providers')
        .select('config')
        .eq('api_identifier', 'text-embedding-ada-002')
        .single();

    if (modelConfigError || !modelConfigRecord || !modelConfigRecord.config) {
        log.error('[startSession] Failed to fetch model config for OpenAI embedding model.', { error: modelConfigError });
        return { error: { message: "Configuration for embedding model not found.", status: 500 } };
    }

    const modelConfig = modelConfigRecord.config;
    if (!isAiModelExtendedConfig(modelConfig)) {
        log.error('[startSession] Fetched model config is not a valid AiModelExtendedConfig.', { config: modelConfig });
        return { error: { message: "Invalid AI model configuration.", status: 500 } };
    }
   
    const assembler: IPromptAssembler = partialDeps?.promptAssembler || (() => {
        const openAiAdapter = new OpenAiAdapter(Deno.env.get('OPENAI_API_KEY')!, log, modelConfig);
        const embeddingClient = new OpenAIEmbeddingClient(openAiAdapter);
        const textSplitter = new LangchainTextSplitter();
        const indexingService = new IndexingService(dbClient, log, textSplitter, embeddingClient);

        return new PromptAssembler(dbClient, (bucket, path) => downloadFromStorage(dbClient, bucket, path));
    })();


    // Create the session record first, so its ID and other details can be used by the assembler
    const sessionId = randomUUID();
    const initialSessionStatus = `pending_${initialStageName.replace(/\s+/g, '_').toLowerCase()}`;

    const { data: newSessionRecord, error: sessionInsertError } = await dbClient
        .from('dialectic_sessions')
        .insert({
            id: sessionId,
            project_id: projectId,
            current_stage_id: initialStageId,
            status: initialSessionStatus,
            iteration_count: 1,
            selected_model_ids: selectedModelIds ?? [],
            session_description: sessionDescription ?? `Session for ${project.project_name} - ${initialStageName}`,
            associated_chat_id: originatingChatId,
        })
        .select()
        .single();

    if (sessionInsertError || !newSessionRecord) {
        log.error("[startSession] Error inserting new session:", { dbError: sessionInsertError });
        return { error: { message: "Failed to create new session.", status: 500, details: sessionInsertError.message } };
    }
    log.info(`[startSession] New session ${newSessionRecord.id} created.`);

    // Now that newSessionRecord exists, create the SessionContext for the assembler
    const sessionContextForAssembler: SessionContext = {
        ...newSessionRecord, 
    };

    const assembledSeedPrompt = await assembler.assemble(
        projectContext, 
        sessionContextForAssembler, 
        stageContext, 
        initialPrompt.content,
        1
    );

    if (!assembledSeedPrompt) {
        log.error(`[startSession] PromptAssembler failed to assemble seed prompt for project ${project.id}, stage ${stageContext.slug}`);
        // Attempt to cleanup session if assembler fails after session creation
        await dbClient.from('dialectic_sessions').delete().eq('id', newSessionRecord.id);
        log.info(`[startSession] Cleaned up session ${newSessionRecord.id} due to prompt assembly failure.`);
        return { error: { message: "Failed to assemble initial seed prompt for the session.", status: 500 } };
    }
    
    // 3. Save the Assembled Seed Prompt (the actual prompt sent to the first model)
    // This is distinct from the initial user prompt and system settings.
    const seedPromptBuffer = Buffer.from(assembledSeedPrompt, 'utf-8');
    const seedPromptUploadResult = await fileManager.uploadAndRegisterFile({
        pathContext: {
            projectId: project.id,
            fileType: FileType.SeedPrompt, 
            sessionId: newSessionRecord.id,
            iteration: 1,
            stageSlug: stageContext.slug,
            originalFileName: `seed_prompt.md`,
        },
        fileContent: seedPromptBuffer,
        mimeType: 'text/markdown',
        sizeBytes: seedPromptBuffer.byteLength,
        userId: userId,
        description: formatResourceDescription({
            type: 'seed_prompt',
            session_id: newSessionRecord.id,
            stage_slug: stageContext.slug,
            iteration: 1, // Corresponds to pathContext.iteration for initial seed
            original_file_name: `seed_prompt.md`,
            project_id: project.id, // Added project_id for completeness
        }),
    });

    if (seedPromptUploadResult.error || !seedPromptUploadResult.record) {
        log.error('[startSession] Failed to save assembled seed prompt using FileManagerService.', { error: seedPromptUploadResult.error });
        // Attempt to clean up session, user prompt, and system settings files
        log.info(`[startSession] Attempting to clean up session ${newSessionRecord.id} and files due to seed prompt save failure.`);
        await dbClient.from('dialectic_sessions').delete().eq('id', newSessionRecord.id);
        // Potentially delete userPromptResourceId and systemSettingsResourceId from storage
        return { error: { message: seedPromptUploadResult.error?.message || 'Failed to save assembled seed prompt for the session.', status: 500 } };
    }
    const seedPromptResourceId = seedPromptUploadResult.record.id;
    log.info(`[startSession] Assembled seed prompt saved with resource ID: ${seedPromptResourceId}`);


    // No longer updating dialectic_sessions with user_input_reference_url here as per user feedback.
    // The relevant resources can be found via dialectic_project_resources table using projectId/sessionId.

    log.info(`[startSession] Session ${newSessionRecord.id} successfully set up with all resources created.`);

    // Construct the success response - which is the DialecticSession record itself
    const successResponse: StartSessionSuccessResponse = newSessionRecord;

    return { data: successResponse };
}
