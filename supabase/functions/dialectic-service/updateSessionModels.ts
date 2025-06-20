import { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4';
import type { Database } from '../types_db.ts';
import type { DialecticSession, UpdateSessionModelsPayload } from './dialectic.interface.ts';
import type { ServiceError } from '../_shared/types.ts';
import { logger } from '../_shared/logger.ts';

export async function handleUpdateSessionModels(
  dbClient: SupabaseClient<Database>,
  payload: UpdateSessionModelsPayload,
  userId: string,
): Promise<{ data?: DialecticSession; error?: ServiceError; status?: number }> {
  const { sessionId, selectedModelCatalogIds } = payload;

  logger.info(`[handleUpdateSessionModels] Attempting to update models for session ${sessionId} by user ${userId}.`, { payload });

  // First, verify that the session belongs to the user making the request
  const { data: sessionData, error: sessionFetchError } = await dbClient
    .from('dialectic_sessions')
    .select('id, project_id')
    .eq('id', sessionId)
    .single();

  if (sessionFetchError) {
    // Check if the error is due to no rows found (PGRST116)
    if (sessionFetchError.code === 'PGRST116') {
      logger.warn('[handleUpdateSessionModels] Session not found for update:', { sessionId });
      return { error: { message: 'Session not found.', status: 404, code: 'SESSION_NOT_FOUND' }, status: 404 };
    }
    // Otherwise, it's a different database error
    logger.error('[handleUpdateSessionModels] Error fetching session for verification:', { sessionId, error: sessionFetchError });
    return { error: { message: 'Error fetching session for update.', status: 500, code: 'SESSION_FETCH_ERROR', details: sessionFetchError.message }, status: 500 };
  }

  // Now verify project ownership
   const { data: projectData, error: projectFetchError } = await dbClient
    .from('dialectic_projects')
    .select('id, user_id')
    .eq('id', sessionData.project_id)
    .eq('user_id', userId)
    .single();

  if (projectFetchError) {
    // Check if the error is due to no rows found (PGRST116)
    if (projectFetchError.code === 'PGRST116') {
      logger.warn('[handleUpdateSessionModels] User does not own the project associated with the session, or project not found.', { sessionId, projectId: sessionData.project_id, userId });
      return { error: { message: 'Forbidden: You do not have permission to update this session.', status: 403, code: 'FORBIDDEN_SESSION_UPDATE' }, status: 403 };
    }
    // Otherwise, it's a different database error
    logger.error('[handleUpdateSessionModels] Error fetching project for session ownership verification:', { projectId: sessionData.project_id, error: projectFetchError });
    return { error: { message: 'Error verifying project ownership.', status: 500, code: 'PROJECT_FETCH_ERROR', details: projectFetchError.message }, status: 500 };
  }

  // Proceed with the update
  const { data: updatedSession, error: updateError } = await dbClient
    .from('dialectic_sessions')
    .update({ selected_model_catalog_ids: selectedModelCatalogIds })
    .eq('id', sessionId)
    .select(
      `
      id,
      project_id,
      session_description,
      user_input_reference_url,
      iteration_count,
      selected_model_catalog_ids,
      status,
      associated_chat_id,
      current_stage_id,
      created_at,
      updated_at
    `
    )
    .single();

  if (updateError) {
    logger.error('[handleUpdateSessionModels] Error updating session models in DB:', { sessionId, error: updateError });
    return { error: { message: 'Failed to update session models.', status: 500, code: 'DB_UPDATE_FAILED', details: updateError.message }, status: 500 };
  }

  if (!updatedSession) {
    logger.error('[handleUpdateSessionModels] Session not found after update (should not happen if update was successful without error):', { sessionId });
    return { error: { message: 'Failed to retrieve session after update.', status: 500, code: 'SESSION_RETRIEVAL_FAILED' }, status: 500 };
}

  logger.info(`[handleUpdateSessionModels] Successfully updated models for session ${sessionId}.`, { updatedSession });
  return { data: updatedSession as DialecticSession, status: 200 };
} 