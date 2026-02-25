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
  const { sessionId, selectedModels }: UpdateSessionModelsPayload = payload;

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
   const { data: _projectData, error: projectFetchError } = await dbClient
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
    .update({ selected_model_ids: selectedModels.map(model => model.id) })
    .eq('id', sessionId)
    .select(
      `
      id,
      project_id,
      session_description,
      user_input_reference_url,
      iteration_count,
      selected_model_ids,
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

  const rawIds = updatedSession.selected_model_ids;
  const ids: string[] = rawIds === null || rawIds === undefined ? [] : rawIds;
  const displayNameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: catalogRows, error: catalogError } = await dbClient
      .from('ai_providers')
      .select('id, name')
      .in('id', ids);
    if (catalogError) {
      logger.error('[handleUpdateSessionModels] Error fetching model display names from ai_providers', { sessionId, error: catalogError });
      return { error: { message: 'Failed to fetch model details.', status: 500, code: 'DB_ERROR', details: catalogError.message }, status: 500 };
    }
    if (catalogRows !== null && catalogRows !== undefined) {
      for (const catalogRow of catalogRows) {
        if (catalogRow !== null && catalogRow !== undefined && catalogRow.id != null && catalogRow.name != null) {
          displayNameById.set(catalogRow.id, catalogRow.name);
        }
      }
    }
    const missingIds = ids.filter((id: string) => !displayNameById.has(id));
    if (missingIds.length > 0) {
      logger.error('[handleUpdateSessionModels] Selected model ids not found in ai_providers catalog', { sessionId, missingIds });
      return { error: { message: 'Selected model details not found in catalog.', status: 500, code: 'DB_ERROR', details: `Missing display names for model ids: ${missingIds.join(', ')}` }, status: 500 };
    }
  }


  const data: DialecticSession = {
    id: updatedSession.id,
    project_id: updatedSession.project_id,
    session_description: updatedSession.session_description,
    user_input_reference_url: updatedSession.user_input_reference_url,
    iteration_count: updatedSession.iteration_count,
    selected_models: selectedModels,
    status: updatedSession.status,
    associated_chat_id: updatedSession.associated_chat_id,
    current_stage_id: updatedSession.current_stage_id,
    created_at: updatedSession.created_at,
    updated_at: updatedSession.updated_at,
  };

  logger.info(`[handleUpdateSessionModels] Successfully updated models for session ${sessionId}.`, { data });
  return { data, status: 200 };
} 