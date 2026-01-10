import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type {
  GetSessionDetailsPayload,
  DialecticSession,
  GetSessionDetailsResponse,
  DialecticStage,
} from './dialectic.interface.ts';
import type { AssembledPrompt } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import type { ServiceError } from '../_shared/types.ts';
import { logger } from '../_shared/logger.ts';
import { downloadFromStorage } from '../_shared/supabase_storage_utils.ts';

export async function getSessionDetails(
  payload: GetSessionDetailsPayload,
  dbClient: SupabaseClient,
  user: User,
): Promise<{ data?: GetSessionDetailsResponse; error?: ServiceError; status?: number }> {
  const { sessionId, skipSeedPrompt } = payload;

  if (!sessionId) {
    logger.warn('getSessionDetails: Missing sessionId in payload', { payload });
    return { error: { message: 'Session ID is required.', code: 'VALIDATION_ERROR' }, status: 400 };
  }

  logger.info('getSessionDetails: Fetching session details', { sessionId, userId: user.id });

  try {
    // Step 1: Fetch the session by ID and join with dialectic_stages
    const { data: session, error: sessionError } = await dbClient
      .from('dialectic_sessions')
      .select(`
        *,
        dialectic_stages (*)
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError) {
      logger.error('getSessionDetails: Error fetching session from database', { sessionId, error: sessionError });
      if (sessionError.code === 'PGRST116') { // PostgREST error code for "Not found"
        return { error: { message: 'Session not found.', code: 'NOT_FOUND' }, status: 404 };
      }
      return { error: { message: 'Failed to fetch session.', code: 'DB_ERROR', details: sessionError.message }, status: 500 };
    }

    if (!session) {
      // This case should ideally be covered by PGRST116, but as a fallback
      logger.warn('getSessionDetails: Session not found after query (no error)', { sessionId });
      return { error: { message: 'Session not found.', code: 'NOT_FOUND' }, status: 404 };
    }

    // Step 2: Fetch the associated project to verify ownership
    const { data: project, error: projectError } = await dbClient
      .from('dialectic_projects')
      .select('user_id')
      .eq('id', session.project_id)
      .single();

    if (projectError) {
      logger.error('getSessionDetails: Error fetching associated project', { projectId: session.project_id, sessionId, error: projectError });
      // If the project isn't found, it's a data integrity issue, not a standard DB error.
      if (projectError.code === 'PGRST116') {
        return { error: { message: 'Associated project not found for session.', code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
      }
      return { error: { message: 'Failed to verify session ownership.', code: 'DB_ERROR', details: projectError.message }, status: 500 };
    }

    // Step 3: Verify that the authenticated user owns the project
    if (project.user_id !== user.id) {
      logger.warn('getSessionDetails: User forbidden to access session (project ownership mismatch)', { sessionId, sessionProjectId: session.project_id, projectOwnerUserId: project.user_id, requestingUserId: user.id });
      return { error: { message: 'You are not authorized to access this session.', code: 'FORBIDDEN' }, status: 403 };
    }

    // Step 4: Fetch the seed prompt for the session (only one seed_prompt exists per session)
    // If skipSeedPrompt is true, skip the query and return null for activeSeedPrompt
    let activeSeedPrompt: AssembledPrompt | null = null;
    if (!skipSeedPrompt) {
      // Query for the seed prompt using only session_id and resource_type
      // Only one seed_prompt exists per session, so no need to filter by stage_slug or iteration_number
      logger.info(`getSessionDetails: Querying for seed prompt for session ${sessionId}`);
      const { data: seedPromptResource, error: resourceError } = await dbClient
        .from('dialectic_project_resources')
        .select('id, storage_path, file_name, storage_bucket')
        .eq('resource_type', 'seed_prompt')
        .eq('session_id', sessionId)
        .single();

      if (resourceError) {
        logger.error('getSessionDetails: Error fetching seed prompt resource', { sessionId, error: resourceError });
        if (resourceError.code === 'PGRST116') {
          return { error: { message: 'Seed prompt is required but not found.', code: 'MISSING_REQUIRED_RESOURCE' }, status: 500 };
        }
        return { error: { message: 'Failed to fetch seed prompt resource.', code: 'DB_ERROR', details: resourceError.message }, status: 500 };
      }

      if (!seedPromptResource || !seedPromptResource.storage_path || !seedPromptResource.file_name || !seedPromptResource.storage_bucket) {
        logger.error('getSessionDetails: Seed prompt resource found but missing required fields', { sessionId, seedPromptResource });
        return { error: { message: 'Seed prompt is required but not found.', code: 'MISSING_REQUIRED_RESOURCE' }, status: 500 };
      }

      // Download the seed prompt content from storage
      const fullStoragePath = `${seedPromptResource.storage_path}/${seedPromptResource.file_name}`;
      const { data: fileArrayBuffer, error: downloadError } = await downloadFromStorage(
        dbClient,
        seedPromptResource.storage_bucket,
        fullStoragePath
      );

      if (downloadError) {
        logger.error('getSessionDetails: Error downloading seed prompt content from storage', { sessionId, storagePath: fullStoragePath, error: downloadError });
        return { error: { message: 'Failed to download seed prompt content from storage.', code: 'STORAGE_ERROR', details: downloadError.message }, status: 500 };
      }

      if (!fileArrayBuffer) {
        logger.error('getSessionDetails: Seed prompt content is null after download', { sessionId, storagePath: fullStoragePath });
        return { error: { message: 'Seed prompt content is required but not found.', code: 'MISSING_REQUIRED_RESOURCE' }, status: 500 };
      }

      try {
        const promptContent = new TextDecoder().decode(fileArrayBuffer);
        activeSeedPrompt = {
          promptContent: promptContent,
          source_prompt_resource_id: seedPromptResource.id,
        };
      } catch (e: unknown) {
        let errorMessage = 'An unknown error occurred while reading the prompt content.';
        if (e instanceof Error) {
          errorMessage = e.message;
        }
        logger.error('getSessionDetails: Error decoding prompt content from ArrayBuffer', { sessionId, error: errorMessage });
        return { error: { message: 'Failed to read seed prompt content.', code: 'PARSE_ERROR', details: errorMessage }, status: 500 };
      }
    } else {
      logger.info(`getSessionDetails: Skipping seed prompt query as skipSeedPrompt is true for session ${sessionId}`);
    }
    
    logger.info('getSessionDetails: Successfully fetched and authorized session', { sessionId, userId: user.id, projectId: session.project_id, activeSeedPrompt });
    
    // Extract session and stage details
    const { dialectic_stages, ...sessionFields } = session;
    
    const typedSession: DialecticSession = {
        id: sessionFields.id,
        project_id: sessionFields.project_id,
        session_description: sessionFields.session_description,
        user_input_reference_url: sessionFields.user_input_reference_url,
        iteration_count: sessionFields.iteration_count,
        selected_model_ids: sessionFields.selected_model_ids,
        status: sessionFields.status,
        associated_chat_id: sessionFields.associated_chat_id,
        current_stage_id: sessionFields.current_stage_id,
        created_at: sessionFields.created_at,
        updated_at: sessionFields.updated_at,
      };

    const currentStageDetails: DialecticStage | null = dialectic_stages 
      ? {
          id: dialectic_stages.id,
          slug: dialectic_stages.slug, 
          display_name: dialectic_stages.display_name,
          description: dialectic_stages.description, 
          default_system_prompt_id: dialectic_stages.default_system_prompt_id,
          expected_output_template_ids: dialectic_stages.expected_output_template_ids,
          active_recipe_instance_id: dialectic_stages.active_recipe_instance_id,
          recipe_template_id: dialectic_stages.recipe_template_id,
          created_at: dialectic_stages.created_at,
        }
      : null;

    return { data: { session: typedSession, currentStageDetails, activeSeedPrompt }, status: 200 };

  } catch (e) {
    let errorMessage = 'An unknown error occurred.';
    let errorStack = undefined;

    if (e instanceof Error) {
      errorMessage = e.message;
      errorStack = e.stack;
    } else {
      errorMessage = String(e);
    }
    
    logger.error('getSessionDetails: An unexpected error occurred', { sessionId, errorMessage, stack: errorStack });
    return { error: { message: 'An unexpected error occurred.', code: 'UNHANDLED_EXCEPTION', details: errorMessage }, status: 500 };
  }
}
