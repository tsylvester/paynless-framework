import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type {
  GetSessionDetailsPayload,
  DialecticSession,
  GetSessionDetailsResponse,
  DialecticStage,
} from './dialectic.interface.ts';
import type { ServiceError } from '../_shared/types.ts';
import { logger } from '../_shared/logger.ts';

export async function getSessionDetails(
  payload: GetSessionDetailsPayload,
  dbClient: SupabaseClient,
  user: User,
): Promise<{ data?: GetSessionDetailsResponse; error?: ServiceError; status?: number }> {
  const { sessionId } = payload;

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
      return { error: { message: 'Failed to verify session ownership.', code: 'DB_ERROR', details: projectError.message }, status: 500 };
    }

    if (!project) {
      logger.error('getSessionDetails: Associated project not found for session (data inconsistency likely)', { projectId: session.project_id, sessionId });
      return { error: { message: 'Associated project not found for session.', code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Step 3: Verify that the authenticated user owns the project
    if (project.user_id !== user.id) {
      logger.warn('getSessionDetails: User forbidden to access session (project ownership mismatch)', { sessionId, sessionProjectId: session.project_id, projectOwnerUserId: project.user_id, requestingUserId: user.id });
      return { error: { message: 'You are not authorized to access this session.', code: 'FORBIDDEN' }, status: 403 };
    }

    logger.info('getSessionDetails: Successfully fetched and authorized session', { sessionId, userId: user.id, projectId: session.project_id });
    
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
          expected_output_artifacts: dialectic_stages.expected_output_artifacts,
          input_artifact_rules: dialectic_stages.input_artifact_rules,
          created_at: dialectic_stages.created_at,
          // Ensure all properties from DialecticStage (Database['public']['Tables']['dialectic_stages']['Row']) are mapped here
          // For example, if there are other non-nullable fields in the DB type not covered by the linter error message,
          // they should be explicitly mapped from dialectic_stages.propertyName
        }
      : null;

    return { data: { session: typedSession, currentStageDetails }, status: 200 };

  } catch (e) {
    const error = e as Error;
    logger.error('getSessionDetails: An unexpected error occurred', { sessionId, errorMessage: error.message, stack: error.stack });
    return { error: { message: 'An unexpected error occurred.', code: 'UNHANDLED_EXCEPTION', details: error.message }, status: 500 };
  }
}
