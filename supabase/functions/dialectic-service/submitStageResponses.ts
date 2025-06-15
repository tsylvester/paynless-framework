// supabase/functions/dialectic-service/submitStageResponses.ts
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { ILogger } from '../_shared/types.ts';
import type { ServiceError } from '../_shared/types.ts';
import type { Database, Tables } from '../types_db.ts';
import {
  SubmitStageResponsesPayload,
  type DialecticContribution,
  type InputArtifactRules,
  type ArtifactSourceRule,
  type SubmitStageResponsesDependencies,
  type SubmitStageResponsesResponse,
  type DialecticSession,
  type DialecticFeedback,
} from './dialectic.interface.ts';
import {
  downloadFromStorage,
} from '../_shared/supabase_storage_utils.ts';
import { renderPrompt } from '../_shared/prompt-renderer.ts';

// Get storage bucket from environment variables, with a fallback for safety.
const STORAGE_BUCKET = Deno.env.get('CONTENT_STORAGE_BUCKET') || 'dialectic-contributions';

/**
 * Maps a raw database feedback record to the structured DialecticFeedback interface.
 */
function mapDbFeedbackToInterface(
  dbFeedback: Tables<'dialectic_feedback'>,
): DialecticFeedback {
  return {
    id: dbFeedback.id,
    session_id: dbFeedback.session_id,
    contribution_id: dbFeedback.contribution_id,
    user_id: dbFeedback.user_id,
    feedback_type: dbFeedback.feedback_type,
    feedback_value_text: dbFeedback.feedback_value_text,
    feedback_value_structured: dbFeedback.feedback_value_structured as Record<
      string,
      unknown
    > | null,
    created_at: dbFeedback.created_at,
    updated_at: dbFeedback.updated_at,
  };
}

/**
 * Maps a raw database session record to the structured DialecticSession interface.
 * Note: This creates a "flat" session object without nested relations, which is
 * sufficient for this function's response.
 */
function mapDbSessionToInterface(
  dbSession: Tables<'dialectic_sessions'>,
): DialecticSession {
  return {
    id: dbSession.id,
    project_id: dbSession.project_id,
    session_description: dbSession.session_description,
    user_input_reference_url: dbSession.user_input_reference_url,
    iteration_count: dbSession.iteration_count,
    selected_model_catalog_ids: dbSession.selected_model_catalog_ids,
    status: dbSession.status,
    associated_chat_id: dbSession.associated_chat_id,
    current_stage_id: dbSession.current_stage_id,
    created_at: dbSession.created_at,
    updated_at: dbSession.updated_at,
    // Nested properties are not populated here as they are not needed for this response.
  };
}

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
  const { downloadFromStorage, logger } = dependencies;
  const { projectId, sessionId, iterationNumber } = context;

  let contributionsContent = '';
  let feedbackContent = '';

  // Fetch all required stage display names in one go to avoid multiple DB calls in a loop.
  const stageSlugsForDisplayName = rules.sources
    .map((rule: ArtifactSourceRule) => rule.stage_slug)
    .filter(
      (slug: string, index: number, self: string[]) =>
        self.indexOf(slug) === index,
    ); // Unique slugs

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
      const { data: aiContributions, error: aiContribError } = await dbClient
        .from('dialectic_contributions')
        .select<string, DialecticContribution>(
          'id, content_storage_path, content_storage_bucket, model_name',
        )
        .eq('session_id', sessionId)
        .eq('iteration_number', iterationNumber)
        .eq('stage', rule.stage_slug)
        .eq('is_latest_edit', true);

      if (aiContribError) {
        logger.error('Failed to retrieve AI contributions for prompt assembly.', {
          error: aiContribError,
        });
        throw new Error('Failed to retrieve AI contributions for prompt assembly.');
      }

      if (aiContributions && aiContributions.length > 0) {
        if (!contributionsContent) {
          contributionsContent += `## AI Contributions from Prior Stages\n\n`;
        }
        contributionsContent +=
          `### Contributions from ${displayName} Stage\n\n`;
        for (const contrib of aiContributions) {
          if (
            contrib.content_storage_path && contrib.content_storage_bucket
          ) {
            const { data: content, error: downloadError } =
              await downloadFromStorage(
                dbClient,
                contrib.content_storage_bucket,
                contrib.content_storage_path,
              );
            if (content && !downloadError) {
              contributionsContent +=
                `#### Contribution from ${contrib.model_name || 'AI Model'}\n\n${
                  new TextDecoder().decode(content)
                }\n\n---\n`;
            } else {
              logger.error(
                `Failed to download content for contribution ${contrib.id} for prompt assembly.`,
                { path: contrib.content_storage_path, error: downloadError },
              );
              throw new Error(
                `Failed to download content for prompt assembly for contribution ${contrib.id}`,
              );
            }
          }
        }
      } else {
        contributionsContent += `## AI Contributions from ${displayName}\n\n`;
      }
    } else if (rule.type === 'feedback') {
      if (!feedbackContent) {
        feedbackContent += `## User Feedback from Prior Stages\n\n`;
      }
      const feedbackPath =
        `projects/${projectId}/sessions/${sessionId}/iteration_${iterationNumber}/${rule.stage_slug}/user_feedback_${rule.stage_slug}.md`;
      const { data: content, error: downloadError } =
        await downloadFromStorage(dbClient, STORAGE_BUCKET, feedbackPath);
      if (content && !downloadError) {
        feedbackContent +=
          `### Feedback from ${displayName} Stage\n\n${
            new TextDecoder().decode(content)
          }\n\n---\n`;
      } else {
        logger.warn(`Could not find or download feedback file`, {
          path: feedbackPath,
          error: downloadError,
        });
      }
    }
  }

  return { contributionsContent, feedbackContent };
}

export async function submitStageResponses(
  payload: SubmitStageResponsesPayload,
  dbClient: SupabaseClient<Database>,
  user: User,
  dependencies: SubmitStageResponsesDependencies,
): Promise<{
  data?: SubmitStageResponsesResponse;
  error?: ServiceError;
  status?: number;
}> {
  const { logger, uploadToStorage, downloadFromStorage } = dependencies;
  logger.info(
    `[submitStageResponses] Received payload for session: ${payload.sessionId}`,
    { payload },
  );

  if (!user) {
    return {
      error: { message: 'User not authenticated.' },
      status: 401,
    };
  }

  const { sessionId, currentStageSlug, currentIterationNumber, responses } =
    payload;

  // Basic payload validation
  if (!sessionId) {
      return { error: { message: 'Invalid payload. Missing sessionId.' }, status: 400 };
  }
  if (!currentStageSlug) {
      return { error: { message: 'Invalid payload. Missing currentStageSlug.' }, status: 400 };
  }
  if (!currentIterationNumber && currentIterationNumber !== 0) {
      return { error: { message: 'Invalid payload. Missing currentIterationNumber.' }, status: 400 };
  }
  if (!responses || responses.length === 0) {
      return { error: { message: 'Invalid payload. responses array must be provided and cannot be empty.' }, status: 400 };
  }
  for (const response of responses) {
      if (!response.originalContributionId || !response.responseText) {
          return { error: { message: 'Invalid item in responses array. Missing originalContributionId or responseText.' }, status: 400 };
      }
  }

  try {
    // 1. Fetch Session and Project Data, then verify user ownership
    const { data: sessionData, error: sessionError } = await dbClient
      .from('dialectic_sessions')
      .select(
        `
        *,
        project:dialectic_projects(*),
        stage:dialectic_stages(*)
      `,
      )
      .eq('id', sessionId)
      .single();

    if (sessionError) {
      logger.error('Error fetching session', { error: sessionError });
      return {
        error: { message: 'Session not found or error fetching it.', code: 'SESSION_NOT_FOUND' },
        status: 404,
      };
    }
    
    if (!sessionData) {
      // This case is for when the query executes but finds no matching session.
      return { error: { message: `Session not found: ${sessionId}`, code: 'SESSION_NOT_FOUND' }, status: 404 };
    }
    
    const project = sessionData.project;
    const stage = sessionData.stage;

    if (!project) {
      logger.error('Error fetching project for session', { sessionId });
      return {
        error: { message: 'Project not found for the session.' },
        status: 404,
      };
    }

    if (!stage) {
      // This is an inconsistent state, as a session should always have a stage.
      // It might happen with bad data or if the stage relation fails.
      return { 
        error: { 
          message: `Could not determine current stage for session: ${sessionId}`, 
          code: 'STAGE_NOT_FOUND' 
        }, 
        status: 500
      };
    }

    // Validate that the payload's stage slug matches the DB's stage slug for the session
    if (stage.slug !== currentStageSlug) {
      return {
        error: {
          message: `Mismatched stage slug. The session is currently at stage '${stage.slug}', but the payload specified '${currentStageSlug}'.`,
          code: 'MISMATCHED_STAGE_SLUG',
        },
        status: 400,
      };
    }

    if (project.user_id !== user.id) {
      return {
        error: {
          message:
            'User does not own the project associated with this session.',
        },
        status: 403,
      };
    }

    // 2. Store Individual User Responses in dialectic_feedback
    const feedbackRecordsToInsert = responses.map((response) => {
        return {
            session_id: sessionId,
            contribution_id: response.originalContributionId,
            user_id: user.id,
            feedback_type: 'text_response',
            feedback_value_text: response.responseText,
        };
    });

    let createdFeedbackRecords: Tables<'dialectic_feedback'>[] = [];
    if (feedbackRecordsToInsert.length > 0) {
        const { data: insertedData, error: feedbackInsertError } = await dbClient
            .from('dialectic_feedback')
            .insert(feedbackRecordsToInsert)
            .select();

        if (feedbackInsertError) {
            logger.error('Error inserting feedback', {
              error: feedbackInsertError,
            });
            return {
              error: {
                message: 'Failed to store user responses.',
                details: feedbackInsertError.message,
              },
              status: 500,
            };
        }
        createdFeedbackRecords = insertedData;
    }

    // 3. Concatenate and Store user_feedback_{stage}.md
    let concatenatedFeedbackMarkdown =
      `## User Feedback for ${stage.display_name} - Iteration ${currentIterationNumber}\n\n`;
    for (const response of responses) {
      const { data: contributionContext, error: contributionError } = await dbClient
        .from('dialectic_contributions')
        .select('model_name, id, session_id')
        .eq('id', response.originalContributionId)
        .single();

      if (contributionError || !contributionContext || contributionContext.session_id !== sessionId) {
          logger.error('Invalid originalContributionId or not linked to session', { contributionId: response.originalContributionId, sessionId });
          return { error: { message: `Invalid originalContributionId: ${response.originalContributionId}. It was not found or does not belong to the session.` }, status: 400 };
      }
      const modelName =
        contributionContext?.model_name ||
        `Contribution ID: ${contributionContext?.id || response.originalContributionId}`;
      concatenatedFeedbackMarkdown +=
        `### Response to Contribution by ${modelName}\n\n${response.responseText}\n\n---\n`;
    }

    const userFeedbackFilePath =
      `projects/${project.id}/sessions/${sessionId}/iteration_${currentIterationNumber}/${stage.slug}/user_feedback_${stage.slug}.md`;
    const { error: uploadUserFeedbackError } = await uploadToStorage(
      dbClient,
      STORAGE_BUCKET,
      userFeedbackFilePath,
      concatenatedFeedbackMarkdown,
      { contentType: 'text/markdown', upsert: true },
    );

    if (uploadUserFeedbackError) {
      logger.error('Error uploading user feedback file', {
        error: uploadUserFeedbackError,
      });
      return {
        error: {
          message: 'Failed to store consolidated user feedback.',
          details: uploadUserFeedbackError.message,
        },
        status: 500,
      };
    }

    // 4. Prepare and Store Seed Input for Next Stage using new architecture
    let nextStageSeedPath: string | null = null;
    let nextStage:
      | Database['public']['Tables']['dialectic_stages']['Row']
      | null = null;

    if (project.process_template_id) {
      const { data: transition, error: transitionError } = await dbClient
        .from('dialectic_stage_transitions')
        .select('target_stage:dialectic_stages!target_stage_id(*)')
        .eq('process_template_id', project.process_template_id)
        .eq('source_stage_id', stage.id)
        .maybeSingle();

      if (transitionError) {
        logger.error('Error fetching next stage transition', {
          error: transitionError,
        });
        return {
          error: { message: 'Could not determine next stage.' },
          status: 500,
        };
      }
      
      if (transition?.target_stage) {
        nextStage = transition.target_stage as Database['public']['Tables']['dialectic_stages']['Row'];
      }
    } else {
      logger.warn(
        'Project is missing process_template_id, cannot determine next stage.',
        { projectId: project.id },
      );
    }

    if (nextStage) {
      // Logic for preparing seed prompt based on `input_artifact_rules`.
      const inputRules = nextStage.input_artifact_rules as
        | InputArtifactRules
        | null;
      logger.info('Assembling next stage seed prompt based on rules', {
        nextStage: nextStage.slug,
        rules: inputRules,
      });

      // 4.1 Assemble artifacts from previous stages based on the rules.
      let priorStageContributions = '';
      let priorStageFeedback = '';

      if (inputRules && inputRules.sources.length > 0) {
        try {
          const assembledArtifacts = await fetchAndAssembleArtifacts(
            inputRules,
            dbClient,
            { downloadFromStorage, logger },
            {
              projectId: project.id,
              sessionId,
              iterationNumber: currentIterationNumber,
            },
          );
          priorStageContributions = assembledArtifacts.contributionsContent;
          priorStageFeedback = assembledArtifacts.feedbackContent;
        } catch (assemblyError: unknown) {
          logger.error('Error assembling artifacts for next stage', {
            error: assemblyError,
          });
          return {
            error: {
              message: assemblyError instanceof Error ? assemblyError.message : 'Failed to assemble required inputs for the next stage.',
            },
            status: 500,
          };
        }
      } else {
        logger.warn(
          `No input_artifact_rules found for stage ${nextStage.slug}. Seed prompt may be incomplete.`,
        );
      }

      // 4.2 Fetch system_settings.json for the iteration
      const systemSettingsPath =
        `projects/${project.id}/sessions/${sessionId}/iteration_${currentIterationNumber}/0_seed_inputs/system_settings.json`;
      const { data: systemSettingsContent, error: systemSettingsError } =
        await downloadFromStorage(dbClient, STORAGE_BUCKET, systemSettingsPath);
      if (systemSettingsError || !systemSettingsContent) {
        logger.error('Failed to download system settings', {
          error: systemSettingsError,
        });
        return {
          error: {
            message: 'Failed to retrieve system settings for next stage.',
          },
          status: 500,
        };
      }
      const systemSettings = JSON.parse(
        new TextDecoder().decode(systemSettingsContent),
      );

      // 4.3 Fetch system prompt template for next stage from dialectic_stages table
      const systemPromptIdForNextStage = nextStage.default_system_prompt_id;

      if (!systemPromptIdForNextStage) {
        logger.error(
          `Default system prompt ID for next stage '${nextStage.slug}' not found in dialectic_stages table.`,
        );
        return {
          error: {
            message:
              `Configuration missing for system prompt of stage: ${nextStage.display_name}.`,
          },
          status: 500,
        };
      }

      const { data: systemPromptNextStage, error: spError } = await dbClient
        .from('system_prompts')
        .select('*')
        .eq('id', systemPromptIdForNextStage)
        .single();

      if (spError || !systemPromptNextStage) {
        logger.error('Failed to fetch system prompt for next stage', {
          error: spError,
        });
        return {
          error: {
            message:
              'Failed to retrieve system prompt template for next stage.',
          },
          status: 500,
        };
      }

      // 4.4 Render the prompt for the next stage using the assembled artifacts
      const promptContext = {
        prior_stage_ai_outputs: priorStageContributions,
        prior_stage_user_feedback: priorStageFeedback,
        // Feedback from the *current* stage is now explicitly named.
        // The prompt template must be updated to use this variable if it needs it.
        current_stage_user_feedback: concatenatedFeedbackMarkdown,
        ...systemSettings, // Assuming systemSettings has other variables like user_objective, etc.
      };

      const renderedPrompt = renderPrompt(
        systemPromptNextStage.prompt_text,
        promptContext,
      );

      // 4.5 Store the fully constructed prompt
      nextStageSeedPath =
        `projects/${project.id}/sessions/${sessionId}/iteration_${currentIterationNumber}/${nextStage.slug}/seed_prompt.md`;
      const { error: uploadSeedPromptError } = await uploadToStorage(
        dbClient,
        STORAGE_BUCKET,
        nextStageSeedPath,
        renderedPrompt,
        { contentType: 'text/markdown', upsert: true },
      );

      if (uploadSeedPromptError) {
        logger.error('Failed to upload seed prompt for next stage', {
          error: uploadSeedPromptError,
        });
        return {
          error: {
            message: 'Failed to store seed prompt for next stage.',
            details: uploadSeedPromptError.message,
          },
          status: 500,
        };
      }
    }

    // 5. Update Session Status
    // Linter may be using an outdated schema for the session table. Casting as a workaround.
    const updatePayload: { updated_at: string; current_stage_id?: string; status?: string } = {
      updated_at: new Date().toISOString(),
    };

    if (nextStage) {
      updatePayload.current_stage_id = nextStage.id;
      updatePayload.status = `pending_${nextStage.slug}`;
    } else {
      updatePayload.status = 'iteration_complete_pending_review';
    }

    const { data: updatedSessionData, error: sessionUpdateError } =
      await dbClient
        .from('dialectic_sessions')
        .update(updatePayload)
        .eq('id', sessionId)
        .select()
        .single();

    if (sessionUpdateError) {
      logger.error('Error updating session status', {
        error: sessionUpdateError,
      });
      // This is potentially a critical error if the session state is not advanced.
      return {
        error: {
          message: 'Failed to update session status at completion.',
          details: sessionUpdateError.message,
        },
        status: 500,
      };
    }

    // 6. Return Response
    return {
      data: {
        message: 'Responses submitted and next stage prepared successfully.',
        updatedSession: mapDbSessionToInterface(updatedSessionData),
        nextStageSeedPromptPath: nextStageSeedPath || null,
        feedbackRecords: createdFeedbackRecords.map(mapDbFeedbackToInterface),
      },
      status: 200,
    };
  } catch (error: unknown) {
    logger.error('Unexpected error in submitStageResponses', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      error: {
        message: 'An unexpected error occurred.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      status: 500,
    };
  }
} 