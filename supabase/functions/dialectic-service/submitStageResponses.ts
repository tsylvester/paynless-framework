// supabase/functions/dialectic-service/submitStageResponses.ts
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { ServiceError } from '../_shared/types.ts';
import type { Database } from '../types_db.ts';
import {
  SubmitStageResponsesPayload,
  type SubmitStageResponsesDependencies,
  type SubmitStageResponsesResponse,
  type DialecticFeedback,
  type DialecticStage,
  type DialecticProject,
  StartSessionRecipeStep,
} from './dialectic.interface.ts';
import type { PathContext, UserFeedbackUploadContext } from '../_shared/types/file_manager.types.ts';
import { PromptAssembler } from "../_shared/prompt-assembler/prompt-assembler.ts";
import { AssembledPrompt, ProjectContext, SessionContext, StageContext } from "../_shared/prompt-assembler/prompt-assembler.interface.ts";
import { getInitialPromptContent } from '../_shared/utils/project-initial-prompt.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';

// Get storage bucket from environment variables, with a fallback for safety.
const STORAGE_BUCKET = Deno.env.get('SB_CONTENT_STORAGE_BUCKET');

export async function submitStageResponses(
  payload: SubmitStageResponsesPayload,
  dbClient: SupabaseClient<Database>,
  user: User | null,
  dependencies: SubmitStageResponsesDependencies,
): Promise<{
  data?: SubmitStageResponsesResponse;
  error?: ServiceError;
  status?: number;
}> {
  // 0. Validate incoming payload for required fields
  if (
    !payload ||
    !payload.sessionId ||
    !payload.projectId ||
    !payload.stageSlug ||
    payload.currentIterationNumber === undefined || // Check for undefined as 0 is a valid iteration
    !payload.responses || 
    !Array.isArray(payload.responses)
    // We could add more specific validation for sessionId format (e.g., UUID) if needed
  ) {
    return {
      error: {
        message:
          "Invalid payload: missing required fields (sessionId, projectId, stageSlug, currentIterationNumber, and responses array must be provided).",
        status: 400,
      },
      status: 400,
    };
  }
  
  const { logger, fileManager, promptAssembler } = dependencies;
  const userId = user?.id;

  if (!STORAGE_BUCKET) {
    logger.error(
      '[submitStageResponses] SB_CONTENT_STORAGE_BUCKET environment variable is not set.',
    );
    return {
      error: {
        message:
          'Server configuration error: Content storage bucket is not defined.',
        status: 500,
      },
      status: 500,
    };
  }

  // Add explicit check for unauthenticated user
  if (!userId) {
    logger.warn(
      '[submitStageResponses] Attempt to submit responses without authentication.',
    );
    return {
      error: { message: 'User not authenticated.', status: 401 },
      status: 401,
    };
  }

  logger.info(
    `[submitStageResponses] Function started. SessionId: ${payload.sessionId}, StageSlug: ${payload.stageSlug}`,
  );

  // 1. Fetch current session details, including project and current stage information.
  const { data: sessionData, error: sessionError } = await dbClient
    .from('dialectic_sessions')
    .select(
      `
      *,
      project:dialectic_projects!inner(*, process_template:dialectic_process_templates!inner(*), dialectic_domains!inner(id, name, description)),
      stage:dialectic_stages!inner(*)
    `,
    )
    .eq('id', payload.sessionId)
    .single();

  if (sessionError || !sessionData) {
    logger.error('[submitStageResponses] Error fetching session details:', {
      error: sessionError,
    });
    return {
      error: { message: 'Session not found or access denied.', status: 404 },
      status: 404,
    };
  }
  if (!sessionData.project || !sessionData.stage) {
    logger.error(
      '[submitStageResponses] Session data is incomplete (missing project or stage).',
      { sessionData },
    );
    return {
      error: {
        message: 'Session data is incomplete.',
        status: 500,
        details: 'Project or stage details missing from session.',
      },
      status: 500,
    };
  }

  // Type assertion for project and stage as they are checked above
  const project: DialecticProject & { dialectic_domains: { id: string; name: string; description: string | null } | null } = sessionData.project;
  const currentStage: DialecticStage = sessionData.stage;

  // Validate that all originalContributionIds in the payload exist for this session, stage, and iteration.
  if (payload.responses && payload.responses.length > 0) {
    const { data: stageContributions, error: stageContributionsError } = await dbClient
      .from('dialectic_contributions')
      .select('id')
      .eq('session_id', payload.sessionId)
      .eq('stage', currentStage.slug)
      .eq('iteration_number', payload.currentIterationNumber);

    if (stageContributionsError) {
      logger.error(`[submitStageResponses] Error fetching contributions for validation:`, { error: stageContributionsError });
      return { error: { message: "Database error during contribution validation.", status: 500 }, status: 500 };
    }

    const validContributionIds = new Set(stageContributions?.map(c => c.id) ?? []);
    for (const response of payload.responses) {
      if (!validContributionIds.has(response.originalContributionId)) {
        return {
          error: { message: `Contribution with ID ${response.originalContributionId} not found for this session, stage, and iteration.`, status: 400 },
          status: 400,
        };
      }
    }
  }

  // Additional validation for items in payload.responses
  for (const responseItem of payload.responses) {
    if (!responseItem.originalContributionId || typeof responseItem.originalContributionId !== 'string' || responseItem.originalContributionId.trim() === '' ||
        !responseItem.responseText || typeof responseItem.responseText !== 'string' || responseItem.responseText.trim() === '') {
      logger.warn('[submitStageResponses] Invalid item in responses array.', { responseItem });
      return {
        error: { message: "Invalid response item: missing or empty originalContributionId or responseText.", status: 400 },
        status: 400,
      };
    }
  }

  if (currentStage.slug !== payload.stageSlug) {
    logger.error(
      `[submitStageResponses] Mismatch: Payload stage slug (${payload.stageSlug}) vs session's current stage slug (${currentStage.slug}).`,
    );
    return {
      error: {
        message: 'Stage slug mismatch with current session stage.',
        status: 400,
      },
      status: 400,
    };
  }
  
  if (sessionData.iteration_count !== payload.currentIterationNumber) {
     logger.warn(
       `[submitStageResponses] Mismatch: Payload iteration number (${payload.currentIterationNumber}) vs session's current iteration (${sessionData.iteration_count}). Using session's.`,
     );
     // Use sessionData.iteration_count as the source of truth
  }

  const iterationNumber = sessionData.iteration_count;


  // 2. Validate user's permissions (if applicable, e.g., only project owner can submit)
  // For now, assuming if the user can fetch the session, they can submit.
  // Add more robust checks if needed.
  if (userId && project.user_id !== userId) {
    logger.warn(
      `[submitStageResponses] Unauthorized: User ${userId} attempted to submit responses for project ${project.id} owned by ${project.user_id}.`,
    );
    return {
      error: { message: 'Unauthorized to submit to this project.', status: 403 },
      status: 403,
    };
  }

  const createdFeedbackRecords: DialecticFeedback[] = [];

  // 3. Process and store user's feedback for the current stage (if provided)
  if (payload.userStageFeedback && payload.userStageFeedback.content) {
    logger.info(
      `[submitStageResponses] Processing userStageFeedback for session ${payload.sessionId}`,
    );
    const feedbackFileName =
      `user_feedback_${currentStage.slug}.md`;
    
    const feedbackPathContext: PathContext = {
      projectId: project.id,
      sessionId: payload.sessionId,
      iteration: iterationNumber,
      stageSlug: currentStage.slug,
      fileType: FileType.UserFeedback,
      originalFileName: feedbackFileName,
    };

    const { record: feedbackFileRecord, error: feedbackFileError } =
      await fileManager.uploadAndRegisterFile({
        pathContext: feedbackPathContext,
        fileContent: payload.userStageFeedback.content,
        mimeType: 'text/markdown',
        sizeBytes:
          new TextEncoder().encode(payload.userStageFeedback.content).length,
        userId: userId || '',
        description: `Consolidated user feedback for stage: ${currentStage.display_name}, iteration: ${iterationNumber}`,
        feedbackTypeForDb: payload.userStageFeedback.feedbackType,
        resourceDescriptionForDb: payload.userStageFeedback.resourceDescription,
      } as UserFeedbackUploadContext);

    if (feedbackFileError || !feedbackFileRecord) {
      logger.error(
        `[submitStageResponses] Failed to save user feedback file for session ${payload.sessionId}.`,
        { error: feedbackFileError },
      );
      // Decide if this is a critical error. For now, log and continue.
      return { error: { message: "Failed to store user feedback.", status: 500, details: feedbackFileError?.message }, status: 500 };
    } else {
      logger.info(
        `[submitStageResponses] User feedback file saved: ${feedbackFileRecord.id}`,
      );
      // The feedbackFileRecord from FileManagerService is from 'dialectic_feedback' table
      createdFeedbackRecords.push({
        ...feedbackFileRecord,
        project_id: project.id,
        stage_slug: currentStage.slug,
        feedback_type: payload.userStageFeedback.feedbackType,
        user_id: userId || '',
        resource_description: payload.userStageFeedback.resourceDescription,
        file_name: feedbackFileRecord.file_name || '',
        mime_type: feedbackFileRecord.mime_type,
        size_bytes: feedbackFileRecord.size_bytes ?? 0,
        storage_bucket: feedbackFileRecord.storage_bucket,
        session_id: payload.sessionId,
        iteration_number: payload.currentIterationNumber,
      });
    }
  } else {
    logger.info(
      `[submitStageResponses] No consolidated userStageFeedback provided for session ${payload.sessionId}.`,
    );
  }
  
  // Critical check: Ensure project has a process_template_id
  // Try to get it from the nested structure (new query) or directly (base table column)
  const projectProcessTemplateId = sessionData.project.process_template?.id ?? 
    sessionData.project.process_template_id;

  if (!projectProcessTemplateId) {
    logger.error(
      `Critical error: Project is missing an associated process_template or process_template_id.`,
      { projectId: sessionData.project.id },
    );
    return { error: { message: "Project configuration error: Missing process template ID.", status: 500 }, status: 500 };
  }

  // 4. Determine the next stage in the process
  const { data: nextStageTransition, error: transitionError } = await dbClient
    .from('dialectic_stage_transitions')
    .select(
      `
      target_stage:dialectic_stages!dialectic_stage_transitions_target_stage_id_fkey!inner (
        *
      )
    `,
    )
    .eq('source_stage_id', currentStage.id)
    .eq('process_template_id', projectProcessTemplateId)
    .maybeSingle(); // Use maybeSingle as a stage might be a terminal stage

  if (transitionError) {
    logger.error(
      '[submitStageResponses] Error fetching next stage transition:',
      { error: transitionError },
    );
    return {
      error: { message: 'Failed to determine next process stage.', status: 500 },
      status: 500,
    };
  }

  let nextStageFull: DialecticStage | null = null;
  if (nextStageTransition && nextStageTransition.target_stage) {
    const ts = nextStageTransition.target_stage;
    
    // The target_stage from the query should match NextStageQueryResult
    nextStageFull = {
        ...ts, // Spreads properties of Tables<'dialectic_stages'>
    };
    logger.info(
      `[submitStageResponses] Next stage determined: ${nextStageFull.display_name} (ID: ${nextStageFull.id})`,
    );
  } else {
    logger.info(
      `[submitStageResponses] Current stage '${currentStage.display_name}' is a terminal stage. No next stage.`,
    );
    // This is a successful completion of the current stage, but no new seed prompt needed.
    // Update session status to reflect completion or a specific terminal state.
    const { data: updatedTerminalSession, error: terminalUpdateError } = await dbClient
        .from('dialectic_sessions')
        .update({ status: `completed_${currentStage.slug}` })
        .eq('id', payload.sessionId)
        .select()
        .single();
    
    if (terminalUpdateError) {
        logger.error("[submitStageResponses] Error updating session status for terminal stage:", { error: terminalUpdateError });
        // Non-critical, proceed with response
    }

    return {
      data: {
        message: 'Stage responses submitted. Current stage is terminal.',
        updatedSession: updatedTerminalSession || sessionData, // return updated or original if update failed
        feedbackRecords: createdFeedbackRecords,
      },
      status: 200,
    };
  }
  
  // Ensure nextStageFull is not null before proceeding with assembler logic
  if (!nextStageFull) {
    // This case should ideally be fully covered by the terminal stage logic above.
    // If we reach here, it implies an unexpected state or a logic flaw in terminal stage handling.
    logger.error("[submitStageResponses] Critical error: nextStageFull is null after terminal stage check. This should not happen.");
    return { error: { message: "Internal server error: Failed to determine next stage for prompt assembly.", status: 500 }, status: 500 };
  }

  // 5. Prepare and save the seed prompt for the NEXT stage using PromptAssembler
  logger.info(
    `[submitStageResponses] Preparing seed prompt for next stage: ${nextStageFull.display_name}`,
  );

  // **Perform critical checks for ProjectContext components before instantiation**
  // Note: initial_prompt_resource_id is now always populated for all projects (both string and file inputs are stored as files)

  // sessionData.project is the raw result of SELECT * from dialectic_projects
  const rawDbProject = sessionData.project;

  // Check process_template_id directly from rawDbProject
  if (typeof rawDbProject.process_template_id !== 'string' || !rawDbProject.process_template_id) {
    logger.error("[submitStageResponses] Critical configuration error: project.process_template_id from DB is missing or invalid.", {details: `ID was: ${rawDbProject.process_template_id}`});
    return { error: { message: "Project configuration integrity error: Process template ID in DB is invalid.", status: 500 }, status: 500 };
  }

  if (!project.dialectic_domains || typeof project.dialectic_domains.name !== 'string' || !project.dialectic_domains.name) {
    logger.error("[submitStageResponses] Critical configuration error: project.dialectic_domains.name is missing or invalid.");
    return { error: { message: "Project configuration error: Missing or invalid dialectic domain name.", status: 500 }, status: 500 };
  }

  const assembler = promptAssembler || new PromptAssembler(
    dbClient,
    fileManager,
    (bucket: string, path: string) => dependencies.downloadFromStorage(dbClient, bucket, path)
);

  const projectContextForAssembler: ProjectContext = {
      id: project.id, 
      user_id: project.user_id, 
      project_name: project.project_name, 
      initial_user_prompt: project.initial_user_prompt, 
      initial_prompt_resource_id: project.initial_prompt_resource_id ?? null, 
      selected_domain_id: project.selected_domain_id, 
      process_template_id: rawDbProject.process_template_id, // Checked: known to be a non-null string
      repo_url: null, 
      status: project.status, 
      created_at: project.created_at, 
      updated_at: project.updated_at, 
      selected_domain_overlay_id: project.selected_domain_overlay_id ?? null, 
      user_domain_overlay_values: rawDbProject.user_domain_overlay_values ?? null, 
      dialectic_domains: { name: project.dialectic_domains.name }, 
  };

  // Omit joined fields (project, stage) from sessionData for SessionContext
  const { project: _p, stage: _s, ...sessionBaseData } = sessionData;
  const sessionContextForAssembler: SessionContext = {
      ...sessionBaseData,
  };
  
  const { data: systemPrompt, error: promptError } = await dbClient
    .from('system_prompts')
    .select('id, prompt_text')
    .eq('id', nextStageFull.default_system_prompt_id || '')
    .single();

  if (promptError && nextStageFull.default_system_prompt_id) {
    logger.warn(`Could not fetch system prompt for stage ${nextStageFull.slug}`, { error: promptError });
  }
  
  // Fetch overlays for next stage based on (system_prompt_id, project.selected_domain_id)
  let overlays: { overlay_values: ProjectContext['user_domain_overlay_values'] }[] | null = null;
  if (!systemPrompt || !systemPrompt.id || !project.selected_domain_id) {
    logger.error('[submitStageResponses] Missing required identifiers for overlay fetch.', { system_prompt: systemPrompt, selected_domain_id: project.selected_domain_id });
    return { error: { message: 'Required domain overlays are missing for this stage.', status: 500, code: 'STAGE_CONFIG_MISSING_OVERLAYS' }, status: 500 };
  }

  const { data: overlayRows, error: overlaysError } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('overlay_values')
    .eq('system_prompt_id', systemPrompt.id)
    .eq('domain_id', project.selected_domain_id);

  if (overlaysError || !overlayRows || overlayRows.length === 0) {
    logger.error('[submitStageResponses] Overlays missing for next stage.', { overlaysError, system_prompt_id: systemPrompt.id, domain_id: project.selected_domain_id });
    return { error: { message: 'Required domain overlays are missing for this stage.', status: 500, code: 'STAGE_CONFIG_MISSING_OVERLAYS' }, status: 500 };
  }
  overlays = overlayRows as { overlay_values: ProjectContext['user_domain_overlay_values'] }[];

  const startSessionRecipeStep: StartSessionRecipeStep = {
    prompt_type: 'Seed',
    step_number: 1,
    step_name: 'Assemble Seed Prompt',
  };

  const stageContextForAssembler: StageContext = {
    ...nextStageFull,
    recipe_step: startSessionRecipeStep,
    system_prompts: systemPrompt ? { prompt_text: systemPrompt.prompt_text } : null,
    domain_specific_prompt_overlays: overlays,
  };
  
  // Robust handling for getInitialPromptContent
  const initialUserPromptData = await getInitialPromptContent(dbClient, projectContextForAssembler, logger, dependencies.downloadFromStorage);
  if (!initialUserPromptData) {
      logger.error("[submitStageResponses] Critical error: Initial project prompt data object is missing.");
      return { error: { message: "Critical error: Initial project prompt data is missing.", status: 500 }, status: 500 };
  }
  if (initialUserPromptData.error) {
      // Ensure errorMessage is always a non-empty string for the ServiceError's message field.
      const errorMessage = typeof initialUserPromptData.error === 'string' && initialUserPromptData.error.trim() !== ''
                         ? initialUserPromptData.error
                         : "Failed to get initial project prompt content due to an unspecified error.";
      logger.error("[submitStageResponses] Failed to get initial project prompt content due to an error.", { error: initialUserPromptData.error }); 
      return { error: { message: errorMessage, status: 500 }, status: 500 };
  }
  if (typeof initialUserPromptData.content !== 'string') {
      logger.error("[submitStageResponses] Critical error: Initial project prompt content is invalid (not a string).");
      return { error: { message: "Critical error: Initial project prompt content is invalid.", status: 500 }, status: 500 };
  }
  const projectInitialUserPrompt = initialUserPromptData.content; 

  let assembledSeedPrompt: AssembledPrompt;
  try {
    assembledSeedPrompt = await assembler.assemble({
      project: projectContextForAssembler,
      session: sessionContextForAssembler,
      stage: stageContextForAssembler,
      projectInitialUserPrompt,
      iterationNumber,
    });
    console.log(
      `[submitStageResponses DBG] Assembled seed prompt text:`,
      assembledSeedPrompt.promptContent
    );
  } catch (assemblyError) {
    logger.error(
      `[submitStageResponses] Error assembling seed prompt: ${ (assemblyError instanceof Error) ? assemblyError.message : String(assemblyError) }`, 
      { error: assemblyError }
    );
    let errorDetailsString: string | undefined = undefined;
    if (assemblyError instanceof Error) {
        errorDetailsString = assemblyError.stack || assemblyError.message;
    } else if (typeof assemblyError === 'string') {
        errorDetailsString = assemblyError;
    } else if (assemblyError) {
        try {
            errorDetailsString = JSON.stringify(assemblyError);
        } catch {
            errorDetailsString = "Could not stringify error details.";
        }
    }
    return {
      error: {
        message: `Failed to assemble seed prompt for next stage: ${(assemblyError instanceof Error) ? assemblyError.message : 'Unknown assembly error'}`,
        status: 500,
        details: errorDetailsString,
      },
      status: 500,
    };
  }

  if (!assembledSeedPrompt || !assembledSeedPrompt.promptContent) {
    logger.error("[submitStageResponses] Critical error: assembledSeedPrompt is null or has no content after assembling seed prompt.");
    return { error: { message: "Internal server error: Failed to assemble seed prompt.", status: 500 }, status: 500 };
  }

  // 6. Update session status to pending for the next stage
  const nextSessionStatus = `pending_${nextStageFull.slug.replace(/\s+/g, '_').toLowerCase()}`;
  const { data: updatedSession, error: updateError } = await dbClient
    .from('dialectic_sessions')
    .update({ 
        status: nextSessionStatus, 
        current_stage_id: nextStageFull.id,
        // iteration_count potentially increments if we are looping, but for simple transition, it might stay same
        // For now, assume iteration_count does not change on simple stage transition.
        // It would change upon explicit "start new iteration" or similar.
    })
    .eq('id', payload.sessionId)
    .select()
    .single();

  if (updateError) {
    logger.error('[submitStageResponses] Error updating session status:', {
      error: updateError,
    });
    // Non-critical, proceed with response but log error
    return {
      error: {
        message: 'Failed to update session status after processing stage responses.',
        status: 500,
        details: updateError.message,
      },
      status: 500,
    };
  }

  logger.info(
    `[submitStageResponses] Function completed successfully for session ${payload.sessionId}. Next stage: ${nextStageFull.display_name}`,
  );

  return {
    data: {
      message: 'Stage responses submitted successfully. Next stage pending.',
      updatedSession: updatedSession || sessionData, 
      feedbackRecords: createdFeedbackRecords,
    },
    status: 200,
  };
}
