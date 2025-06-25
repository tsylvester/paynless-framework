// supabase/functions/dialectic-service/submitStageResponses.ts
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { ILogger } from '../_shared/types.ts';
import type { ServiceError } from '../_shared/types.ts';
import type { Database, Tables, Json } from '../types_db.ts';
import {
  SubmitStageResponsesPayload,
  type DialecticContribution,
  type InputArtifactRules,
  type ArtifactSourceRule,
  type SubmitStageResponsesDependencies,
  type SubmitStageResponsesResponse,
  type DialecticSession,
  type DialecticFeedback,
  type DialecticStage,
  type DialecticProject,
} from './dialectic.interface.ts';
import {
  downloadFromStorage,
} from '../_shared/supabase_storage_utils.ts';
import type { PathContext } from '../_shared/types/file_manager.types.ts';
import { renderPrompt } from '../_shared/prompt-renderer.ts';
import { formatResourceDescription } from '../_shared/utils/resourceDescriptionFormatter.ts';

// Get storage bucket from environment variables, with a fallback for safety.
const STORAGE_BUCKET = Deno.env.get('SB_CONTENT_STORAGE_BUCKET');

/**
 * Fetches and assembles content from various artifacts based on a set of rules.
 * This function is responsible for gathering the necessary context (e.g., previous
 * AI contributions, user feedback) to construct the seed prompt for a subsequent stage.
 */
async function fetchAndAssembleArtifacts(
  rules: InputArtifactRules,
  dbClient: SupabaseClient<Database>,
  dependencies: {
    downloadFromStorage: typeof downloadFromStorage;
    logger: ILogger;
  },
  context: {
    projectId: string;
    sessionId: string;
    iterationNumber: number;
  },
): Promise<{
  contributionsContent: string;
  feedbackContent: string;
}> {
  if (!STORAGE_BUCKET) {
    throw new Error('SUPABASE_CONTENT_STORAGE_BUCKET environment variable is not set.');
  }
  const { downloadFromStorage, logger } = dependencies;
  const { projectId, sessionId, iterationNumber } = context;

  let contributionsContent = '';
  let feedbackContent = '';

  const stageSlugsForDisplayName = rules.sources
    .map((rule: ArtifactSourceRule) => rule.stage_slug)
    .filter(
      (slug: string, index: number, self: string[]) =>
        self.indexOf(slug) === index,
    );

  const { data: stagesData, error: stagesError } = await dbClient
    .from('dialectic_stages')
    .select('slug, display_name')
    .in('slug', stageSlugsForDisplayName);

  if (stagesError) {
    logger.warn('Could not fetch display names for some stages.', {
      error: stagesError,
    });
  }
  const displayNameMap = new Map(
    stagesData?.map((s) => [s.slug, s.display_name]) || [],
  );

  for (const rule of rules.sources) {
    const displayName = displayNameMap.get(rule.stage_slug) ||
      (rule.stage_slug.charAt(0).toUpperCase() + rule.stage_slug.slice(1));

    if (rule.type === 'contribution') {
      const blockHeader = rule.section_header 
        ? `${rule.section_header}\n\n` 
        : `### Contributions from ${displayName} Stage\n\n`;
      
      contributionsContent += blockHeader;

      const { data: aiContributions, error: aiContribError } = await dbClient
        .from('dialectic_contributions')
        .select<string, DialecticContribution>(
          'id, storage_path, file_name, storage_bucket, model_name',
        )
        .eq('session_id', sessionId)
        .eq('iteration_number', iterationNumber)
        .eq('stage', rule.stage_slug)
        .eq('is_latest_edit', true);

      if (aiContribError) {
        logger.error(
          `Failed to retrieve AI contributions for prompt assembly. Stage: '${displayName}' (slug: ${rule.stage_slug}). Full error: ${aiContribError.message}`,
          { error: aiContribError, rule, projectId, sessionId, iterationNumber },
        );
        // Throwing error as expected by database test 4.4 for this specific message.
        throw new Error('Failed to retrieve AI contributions for prompt assembly.');
      }

      if (aiContributions && aiContributions.length > 0) {
        for (const contrib of aiContributions) {
          if (contrib.storage_path && contrib.storage_bucket) {
            let pathToDownload = contrib.storage_path;
            if (contrib.file_name) {
              const baseDir = contrib.storage_path.endsWith('/') ? contrib.storage_path : contrib.storage_path + '/';
              pathToDownload = baseDir + contrib.file_name;
            }

            const { data: content, error: downloadError } =
              await downloadFromStorage(
                dbClient,
                contrib.storage_bucket,
                pathToDownload,
              );
            if (content && !downloadError) {
              contributionsContent +=
                `#### Contribution from ${contrib.model_name || 'AI Model'}\n\n${
                  new TextDecoder().decode(content)
                }\n\n---\n`;
            } else { // This implies downloadError is present or content is null
              logger.error(
                `Failed to download content for contribution ${contrib.id} (stage '${displayName}') for prompt assembly.`,
                {
                  path: contrib.storage_path,
                  error: downloadError,
                  rule,
                  projectId,
                  sessionId,
                  iterationNumber,
                },
              );
              // Throwing error as expected by storage test 5.3 for this specific message.
              throw new Error('Failed to download content for prompt assembly.');
            }
          }
        }
      } else {
        contributionsContent += `No AI-generated content was provided for this stage

---
`;
      }
    } else if (rule.type === 'feedback') {
      const blockHeader = rule.section_header 
        ? `${rule.section_header}\n\n` 
        : `### Feedback from ${displayName} Stage\n\n`;
      feedbackContent += blockHeader;

      const feedbackPath =
        `projects/${projectId}/sessions/${sessionId}/iteration_${iterationNumber}/${rule.stage_slug}/user_feedback_${rule.stage_slug}.md`;
      const { data: content, error: downloadError } =
        await downloadFromStorage(dbClient, STORAGE_BUCKET, feedbackPath);

      if (content && !downloadError) {
        feedbackContent += `#### User Feedback for ${displayName}\n\n${new TextDecoder().decode(content)}\n\n---\n`;
      } else {
        // Handle cases where content is null or downloadError is present
        if (downloadError) { // Explicit download error occurred
          if (rule.required === true) {
            logger.error(
              `Failed to download REQUIRED feedback file for rule. Path: ${feedbackPath}`,
              { error: downloadError, rule, projectId, sessionId, iterationNumber },
            );
            throw new Error(
              `Failed to download feedback for stage '${displayName}' (slug: ${rule.stage_slug}) for prompt assembly. Storage error: ${downloadError.message}`
            );
          } else {
            logger.warn(
              `Failed to download OPTIONAL feedback file for rule, continuing. Path: ${feedbackPath}`,
              { error: downloadError, rule, projectId, sessionId, iterationNumber },
            );
            feedbackContent += `No optional user feedback was provided or an error occurred while fetching it for this section.\n\n---\n`;
          }
        } else { // No explicit downloadError, but content might be null (e.g., file not found for optional feedback)
          logger.warn(
            `No feedback file found or content was empty for rule. Path: ${feedbackPath}`,
            { rule, projectId, sessionId, iterationNumber },
          );
          feedbackContent += `No user feedback was found for this section.\n\n---\n`;
        }
      }
    }
  }

  return { contributionsContent, feedbackContent };
}

function parseInputArtifactRules(data: Json | null): InputArtifactRules {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Rules must be a JSON object.');
  }

  if (!('sources' in data) || !Array.isArray(data.sources)) {
    throw new Error('Rules object must contain a "sources" array.');
  }

  const sourcesRaw: (Json | undefined)[] = data.sources;

  const parsedSources: ArtifactSourceRule[] = sourcesRaw.map(
    (sourceRuleData: Json | undefined, index: number): ArtifactSourceRule => {
      if (sourceRuleData === null || typeof sourceRuleData !== 'object' || Array.isArray(sourceRuleData)) {
        throw new Error(`Source at index ${index} must be a JSON object.`);
      }

      // Check for required properties
      if (!('type' in sourceRuleData) || !('stage_slug' in sourceRuleData)) {
        throw new Error(
          `Source at index ${index} must contain "type" and "stage_slug" properties.`,
        );
      }

      const type = sourceRuleData.type;
      const stage_slug = sourceRuleData.stage_slug;

      // Validate 'type' property
      if (
        typeof type !== 'string' ||
        (type !== 'contribution' && type !== 'feedback')
      ) {
        throw new Error(
          `Source at index ${index} has an invalid "type". Expected 'contribution' or 'feedback', got "${type}".`,
        );
      }

      // Validate 'stage_slug' property
      if (typeof stage_slug !== 'string') {
        throw new Error(
          `Source at index ${index} has an invalid "stage_slug". Expected a string, got "${stage_slug}".`,
        );
      }
      
      const parsedRule: ArtifactSourceRule = {
        type: type as 'contribution' | 'feedback',
        stage_slug: stage_slug,
      };

      // Process optional fields, explicitly accessing them from sourceRuleData
      const purpose = sourceRuleData.purpose;
      const required = sourceRuleData.required;
      const multiple = sourceRuleData.multiple;
      const section_header = sourceRuleData.section_header;

      if (purpose !== undefined) {
        if (typeof purpose === 'string') {
          parsedRule.purpose = purpose;
        } else {
          throw new Error(`Source at index ${index} has 'purpose' with incorrect type. Expected string, got ${typeof purpose}.`);
        }
      }

      if (required !== undefined) {
        if (typeof required === 'boolean') {
          parsedRule.required = required;
        } else {
          throw new Error(`Source at index ${index} has 'required' with incorrect type. Expected boolean, got ${typeof required}.`);
        }
      }

      if (multiple !== undefined) {
        if (typeof multiple === 'boolean') {
          parsedRule.multiple = multiple;
        } else {
          throw new Error(`Source at index ${index} has 'multiple' with incorrect type. Expected boolean, got ${typeof multiple}.`);
        }
      }

      if (section_header !== undefined) {
        if (typeof section_header === 'string') {
          parsedRule.section_header = section_header;
        } else {
          throw new Error(`Source at index ${index} has 'section_header' with incorrect type. Expected string, got ${typeof section_header}.`);
        }
      }
      
      return parsedRule;
    },
  );

  const finalRules: InputArtifactRules = {
    sources: parsedSources,
  };

  return finalRules;
}

async function prepareNextStageSeedPrompt(
  session: DialecticSession & { project: DialecticProject; stage: DialecticStage },
  nextStage: DialecticStage,
  dependencies: {
    logger: ILogger;
    downloadFromStorage: (
      client: SupabaseClient,
      bucket: string,
      path: string,
    ) => Promise<{
      data: ArrayBuffer | null;
      mimeType?: string;
      error: Error | null;
    }>;
    dbClient: SupabaseClient<Database>;
  },
): Promise<{ prompt: string; path: PathContext }> {
  const { logger, downloadFromStorage, dbClient } = dependencies;
  const { project, id: sessionId, iteration_count: iterationNumber } = session;

  // 1. Parse and validate the artifact rules for the next stage
  let rules: InputArtifactRules;
  try {
    rules = parseInputArtifactRules(nextStage.input_artifact_rules);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    throw new Error(
      `Configuration error: Invalid artifact rules for next stage '${
        nextStage.slug
      }': ${message}`,
    );
  }

  const { contributionsContent, feedbackContent } =
    await fetchAndAssembleArtifacts(
      rules,
      dbClient,
      { downloadFromStorage, logger },
      {
        projectId: project.id,
        sessionId,
        iterationNumber,
      },
    );

  // 2. Get the prompt template for the next stage
  if (!nextStage.default_system_prompt_id) {
    throw new Error(
      `Configuration error: Next stage '${nextStage.display_name}' has no default system prompt.`,
    );
  }

  const { data: systemPromptRecord, error: systemPromptError } = await dbClient
    .from('system_prompts')
    .select('prompt_text')
    .eq('id', nextStage.default_system_prompt_id)
    .single();

  if (systemPromptError || !systemPromptRecord) {
    logger.error(
      `Failed to retrieve system prompt template for next stage: ${nextStage.slug}`,
      { error: systemPromptError },
    );
    throw new Error('Failed to retrieve system prompt template for next stage.');
  }

  // 3. Fetch domain overlay if it exists
  let domainOverlayValues: Json | null = null;
  if (project.selected_domain_overlay_id) {
    const { data: overlayData, error: overlayError } = await dbClient
      .from('domain_specific_prompt_overlays')
      .select('overlay_values')
      .eq('id', project.selected_domain_overlay_id)
      .single();

    if (overlayError) {
      logger.warn(
        'Failed to fetch domain specific prompt overlay, continuing without it.',
        { error: overlayError },
      );
    } else {
      domainOverlayValues = overlayData.overlay_values;
    }
  }

  // 4. Render the prompt
  const renderedPrompt = renderPrompt(
    systemPromptRecord.prompt_text,
    {
      user_objective: project.project_name,
      context_description: project.initial_user_prompt,
      prior_stage_ai_outputs: contributionsContent,
      prior_stage_user_feedback: feedbackContent,
    },
    domainOverlayValues,
    null, // userProjectOverlayValues is not supported yet
  );

  const path: PathContext = {
    projectId: project.id,
    fileType: 'seed_prompt',
    sessionId: sessionId,
    iteration: iterationNumber,
    stageSlug: nextStage.slug,
    originalFileName: `seed_prompt.md`,
  };

  return { prompt: renderedPrompt, path };
}

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
  const { logger, fileManager, downloadFromStorage } = dependencies;
  const {
    sessionId,
    projectId,
    stageSlug,
    currentIterationNumber,
    responses,
    userStageFeedback,
  } = payload;
  logger.info(
    `[submitStageResponses] Received payload for session: ${sessionId}`,
    { payload },
  );

  // --- 1. Authentication and Validation ---
  if (!user) {
    return { error: { message: 'User not authenticated.' }, status: 401 };
  }

  if (
    !sessionId || !projectId || !stageSlug || !currentIterationNumber || responses === null || responses === undefined
  ) {
    return {
      error: { message: 'Invalid payload: missing required fields (sessionId, projectId, stageSlug, currentIterationNumber, and responses array must be provided).' },
      status: 400,
    };
  }
  for (const r of responses) {
    if (!r.originalContributionId || !r.responseText) {
      return {
        error: { message: 'Invalid response item: missing fields.' },
        status: 400,
      };
    }
  }

  // --- 2. Fetch Session and Verify Ownership ---
  const { data: sessionData, error: sessionError } = await dbClient
    .from('dialectic_sessions')
    .select('*, project:dialectic_projects(*), stage:dialectic_stages!current_stage_id(*)')
    .eq('id', sessionId)
    .eq('dialectic_projects.id', projectId)
    .single();

  if (sessionError || !sessionData || !sessionData.project || !sessionData.stage) {
    logger.error('Failed to fetch session or project, or access denied.', {
      error: sessionError,
    });
    return {
      error: { message: 'Session not found or access denied.' },
      status: 404,
    };
  }
  if (sessionData.project.user_id !== user.id) {
    return { error: { message: 'User does not own the project.' }, status: 403 };
  }
  if (sessionData.stage.slug !== stageSlug) {
    return { error: { message: 'Stage slug mismatch.' }, status: 400 };
  }

  // --- 3. Validate Contribution IDs ---
  for (const response of responses) {
    const { data: contribution, error: contribError } = await dbClient
      .from('dialectic_contributions')
      .select('id, session_id')
      .eq('id', response.originalContributionId)
      .single();
    if (contribError || !contribution || contribution.session_id !== sessionId) {
      logger.error(
        `Invalid originalContributionId: ${response.originalContributionId}`,
        { error: contribError },
      );
      return {
        error: { message: `Invalid contribution ID: ${response.originalContributionId}` },
        status: 400,
      };
    }
  }

  let savedStageFeedbackRecord: DialecticFeedback | null = null;

  // 2. Save the consolidated user feedback for the current stage if provided
  if (userStageFeedback && userStageFeedback.content) {
    logger.info('User stage feedback provided. Saving to storage...', {
      sessionId,
      projectId,
      stageSlug,
      iteration: currentIterationNumber,
    });
    try {
      const feedbackPathContext: PathContext = {
        projectId: projectId,
        sessionId: sessionId,
        iteration: currentIterationNumber,
        stageSlug: stageSlug,
        fileType: 'user_feedback',
        originalFileName: `user_feedback_${stageSlug}.md`,
      };

      const feedbackCustomMetadata: Record<string, string> = {
        feedbackType: userStageFeedback.feedbackType,
      };

      if (userStageFeedback.resourceDescription !== undefined) {
        feedbackCustomMetadata.resourceDescription = JSON.stringify(userStageFeedback.resourceDescription);
      }

      const feedbackUploadContext = {
        pathContext: feedbackPathContext,
        fileContent: userStageFeedback.content,
        mimeType: 'text/markdown',
        sizeBytes: new TextEncoder().encode(userStageFeedback.content).length,
        userId: user.id,
        description: `User feedback for project ${projectId}, session ${sessionId}, stage ${stageSlug}, iteration ${currentIterationNumber}`,
        customMetadata: feedbackCustomMetadata,
      };

      const { record: feedbackFileRecord, error: fileManagerError } =
        await fileManager.uploadAndRegisterFile(feedbackUploadContext);

      if (fileManagerError || !feedbackFileRecord) {
        logger.error('Failed to save user stage feedback via FileManagerService.', {
          error: fileManagerError,
        });
        return {
          error: {
            message: 'Failed to save user feedback.',
            details: fileManagerError?.message,
          },
          status: 500,
        };
      }
      savedStageFeedbackRecord = feedbackFileRecord as unknown as DialecticFeedback;
      logger.info('User stage feedback saved successfully.', {
        feedbackRecordId: savedStageFeedbackRecord.id,
      });
    } catch (e) {
      logger.error('Exception while saving user stage feedback.', { error: e });
      return { error: { message: 'Failed to save user feedback due to an exception.' }, status: 500 };
    }
  }

  // --- 4. Determine Next Stage ---
  if (!sessionData.project.process_template_id) {
    return {
      error: { message: 'Project is not associated with a process template.' },
      status: 400,
    };
  }
  const { data: transition, error: transitionError } = await dbClient
    .from('dialectic_stage_transitions')
    .select('target_stage:dialectic_stages!target_stage_id(*)')
    .eq('process_template_id', sessionData.project.process_template_id)
    .eq('source_stage_id', sessionData.stage.id)
    .maybeSingle();

  if (transitionError) {
    return {
      error: { message: 'Failed to look up stage transition.', details: JSON.stringify(transitionError) },
      status: 500,
    };
  }

  const nextStage = transition?.target_stage as DialecticStage | undefined;
  if (!nextStage) {
    // This is the final stage.
    const { data: updated, error: updateError } = await dbClient
      .from('dialectic_sessions')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      return {
        error: {
          message: 'Failed to update session status at completion',
          details: JSON.stringify(updateError),
        },
        status: 500,
      };
    }
    return {
      data: {
        message: 'Session completed successfully.',
        feedbackRecords: savedStageFeedbackRecord ? [savedStageFeedbackRecord] : [],
        nextStageSeedPromptPath: null,
        updatedSession: updated,
      },
      status: 200,
    };
  }

  logger.info(`Transitioning from ${stageSlug} to ${nextStage.slug}`);

  // --- 5. Prepare and Store Next Stage Seed Prompt ---
  let seedPromptResult: { prompt: string; path: PathContext } | undefined; // Initialize as undefined
  let seedPromptError: Error | null = null;
  try {
    seedPromptResult = await prepareNextStageSeedPrompt(
      sessionData,
      nextStage,
      { logger, downloadFromStorage, dbClient },
    );
  } catch (err) {
    const errorMessage = (err && typeof err === 'object' && 'message' in err)
      ? (err as { message: string }).message
      : String(err);
    logger.error(
      `Failed to prepare or save seed prompt for next stage: ${nextStage.slug}`,
      { error: err },
    );
    seedPromptError = new Error(errorMessage);
  }

  // Combined check for an error during preparation OR an undefined result
  if (seedPromptError || !seedPromptResult) {
    // This block handles cases where seed prompt preparation failed or yielded no result
    const errorMessage = seedPromptError ? seedPromptError.message : 'Result was undefined without explicit error.';
    logger.error('Failed to prepare next stage seed prompt.', {
      errorDetails: errorMessage,
    });
    return {
      status: 500, // Critical failure
      error: { message: `Failed to prepare seed prompt for the next stage: ${errorMessage}` },
    };
  }
  // If we reach here, seedPromptResult IS defined and seedPromptError is null.
  // Now, try to save the seed prompt to storage.
  let savedSeedPromptRecord: DialecticFeedback | null = null; // This might need to be a more generic file record type
  let nextStageSeedPromptPathForResult: string | null = null; // Changed from const and initialized to null

  try {
    const seedPromptUploadContext = {
      pathContext: seedPromptResult.path,
      fileContent: seedPromptResult.prompt,
      mimeType: 'text/markdown',
      sizeBytes: new TextEncoder().encode(seedPromptResult.prompt).length,
      userId: user.id,
      description: formatResourceDescription({
        type: seedPromptResult.path.fileType, 
        session_id: seedPromptResult.path.sessionId!,      
        stage_slug: seedPromptResult.path.stageSlug!,     
        iteration: seedPromptResult.path.iteration!,       
        original_file_name: seedPromptResult.path.originalFileName!,
        project_id: seedPromptResult.path.projectId,    
      }),
    };
    const { record: seedFileRecord, error: seedFileError } =
      await fileManager.uploadAndRegisterFile(seedPromptUploadContext);

    if (seedFileError || !seedFileRecord) {
      logger.error('Failed to save next stage seed prompt via FileManagerService.', {
        error: seedFileError,
      });
      return {
        status: 500, // Critical failure
        error: {
          message: 'Failed to save seed prompt for the next stage.',
          details: seedFileError?.message,
        },
      };
    }
    // Consider if this cast is always safe, or if seedFileRecord is a generic file record
    savedSeedPromptRecord = seedFileRecord as unknown as DialecticFeedback;
    nextStageSeedPromptPathForResult = savedSeedPromptRecord.storage_path; // Assign actual storage path
    logger.info('Next stage seed prompt saved successfully.', {
      seedPromptRecordId: savedSeedPromptRecord.id,
    });
  } catch (e) {
    const errorMessage = (e && typeof e === 'object' && 'message' in e)
    ? (e as { message: string }).message
    : String(e);
    logger.error('Exception while saving next stage seed prompt.', { error: e });
    return {
        status: 500, // Critical failure
        error: { message: `Failed to save seed prompt for the next stage due to an exception: ${errorMessage}` },
     };
  }

  // --- 6. Update Session Status ---
  const { data: updatedSession, error: updateError } = await dbClient
    .from('dialectic_sessions')
    .update({
      current_stage_id: nextStage.id,
      status: `pending_${nextStage.slug}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) {
    logger.error('Failed to update session to next stage.', { error: updateError });
    // This is a more critical error as the session state is inconsistent.
    return {
      error: { message: 'Failed to update session to next stage.', details: updateError.message },
      status: 500,
    };
  }
  
  return {
    data: {
      message: 'Responses submitted and next stage prepared.',
      updatedSession: updatedSession, 
      feedbackRecords: savedStageFeedbackRecord ? [savedStageFeedbackRecord] : [],
      nextStageSeedPromptPath: nextStageSeedPromptPathForResult, // Use the variable holding the actual storage path
    },
    status: 200,
  };
} 