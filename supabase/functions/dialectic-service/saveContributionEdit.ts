import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type { ILogger, ServiceError } from '../_shared/types.ts';
import type { SaveContributionEditPayload, DialecticContribution, DialecticContributionSql } from './dialectic.interface.ts';
import type { Database } from '../types_db.ts';

// Placeholder for actual file upload logic if content is stored as files
// For now, assuming content is text and stored directly or path is managed abstractly

export async function saveContributionEdit(
  payload: SaveContributionEditPayload,
  dbClient: SupabaseClient<Database>,
  user: User,
  logger: ILogger
): Promise<{ data?: DialecticContribution; error?: ServiceError; status?: number }> {
  logger.info('saveContributionEdit action started', { userId: user.id, payload_originalContributionIdToEdit: payload.originalContributionIdToEdit });

  const { originalContributionIdToEdit, editedContentText } = payload;
  logger.info('[saveContributionEdit] Received originalContributionIdToEdit in handler', { originalContributionIdToEdit });

  if (!originalContributionIdToEdit) {
    logger.warn('[saveContributionEdit] originalContributionIdToEdit is missing from payload');
    return { error: { message: 'originalContributionIdToEdit is required.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }
  if (editedContentText === undefined || editedContentText === null) {
    logger.warn('[saveContributionEdit] editedContentText is missing from payload');
    return { error: { message: 'editedContentText is required.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }

  try {
    logger.info('[saveContributionEdit] Attempting to fetch original contribution with ID:', { originalContributionIdToEdit });
    const { data: originalContributionData, error: fetchError } = await dbClient
      .from('dialectic_contributions')
      .select(`
        id,
        session_id,
        stage,
        iteration_number,
        edit_version,
        original_model_contribution_id,
        target_contribution_id,
        user_id,
        dialectic_sessions (
          project_id,
          dialectic_projects ( user_id )
        )
      `)
      .eq('id', originalContributionIdToEdit)
      .single();

    logger.info('[saveContributionEdit] Result of fetching original contribution', { 
        originalContributionIdToEdit_used: originalContributionIdToEdit, 
        originalContributionData_is_truthy: !!originalContributionData, 
        fetchError: fetchError ? { message: fetchError.message, code: fetchError.code, details: fetchError.details } : null
    });

    if (fetchError || !originalContributionData) {
      logger.error('[saveContributionEdit] Error fetching original contribution or not found - RETURNING 404', { originalContributionIdToEdit, fetchError });
      return { error: { message: 'Original contribution not found.', status: 404, code: 'NOT_FOUND' }, status: 404 };
    }
    
    const typedOriginalContribution = originalContributionData as unknown as {
        id: string;
        session_id: string;
        stage: string;
        iteration_number: number;
        edit_version: number;
        original_model_contribution_id: string | null;
        target_contribution_id: string | null; 
        user_id: string | null;
        dialectic_sessions: {
            project_id: string;
            dialectic_projects: { user_id: string; } | null;
        } | null;
    };

    logger.info('[saveContributionEdit] Original contribution fetched successfully', { id: typedOriginalContribution.id, projectOwnerUserId: typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id, currentUser: user.id });

    if (typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id !== user.id) {
        logger.warn('[saveContributionEdit] User attempted to edit contribution in a project they do not own', {
            userId: user.id,
            projectOwner: typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id,
            projectId: typedOriginalContribution.dialectic_sessions?.project_id,
            contributionId: originalContributionIdToEdit
        });
        return { error: { message: 'Not authorized to edit this contribution.', status: 403, code: 'FORBIDDEN' }, status: 403 };
    }

    const newOriginalModelContributionId = typedOriginalContribution.original_model_contribution_id || typedOriginalContribution.id;
    const newEditVersion = typedOriginalContribution.edit_version + 1;

    const placeholderContentStoragePath = `edits/${user.id}/${Date.now()}_edit.md`;
    const placeholderContentMimeType = 'text/markdown';
    const placeholderContentSizeBytes = new TextEncoder().encode(editedContentText).length;

    logger.info('[saveContributionEdit] Calling save_contribution_edit_atomic RPC', { originalContributionIdToEdit, newEditVersion });

    const rpcParams = {
        p_original_contribution_id: originalContributionIdToEdit,
        p_session_id: typedOriginalContribution.session_id,
        p_user_id: user.id,
        p_stage: typedOriginalContribution.stage,
        p_iteration_number: typedOriginalContribution.iteration_number,
        p_content_storage_bucket: 'dialectic_contributions_content',
        p_content_storage_path: placeholderContentStoragePath, 
        p_content_mime_type: placeholderContentMimeType,
        p_content_size_bytes: placeholderContentSizeBytes,
        p_raw_response_storage_path: null,
        p_tokens_used_input: null,
        p_tokens_used_output: null,
        p_processing_time_ms: null,
        p_citations: null, 
        p_target_contribution_id: originalContributionIdToEdit, 
        p_edit_version: newEditVersion,
        p_is_latest_edit: true,
        p_original_model_contribution_id: newOriginalModelContributionId as any,
        p_error_details: null,
        p_model_id: null as any,
        p_contribution_type: 'user_edit'
    };

    logger.info('[saveContributionEdit] Parameters for save_contribution_edit_atomic RPC:', { rpcParams });

    const { data: rpcData, error: transactionError } = await dbClient.rpc('save_contribution_edit_atomic' as any, rpcParams);

    if (transactionError) {
      logger.error('[saveContributionEdit] Error in save_contribution_edit_atomic transaction', { transactionError, rpcParamsSent: rpcParams });
      return { error: { message: 'Failed to save contribution edit.', status: 500, code: 'DB_TRANSACTION_ERROR', details: transactionError.message }, status: 500 };
    }
    
    const newContributionId = rpcData as string; 
    logger.info('[saveContributionEdit] RPC call successful, new contribution ID:', { newContributionId });

    if (!newContributionId) {
        logger.error('[saveContributionEdit] RPC save_contribution_edit_atomic did not return a new contribution ID', { dataFromRPC: rpcData });
        return { error: { message: 'Failed to create new contribution record (no ID returned).', status: 500, code: 'DB_ERROR' }, status: 500 };
    }

    const { data: newContributionDbRow, error: fetchNewError } = await dbClient
        .from('dialectic_contributions')
        .select('*')
        .eq('id', newContributionId)
        .single();

    if (fetchNewError || !newContributionDbRow) {
        logger.error('[saveContributionEdit] Failed to fetch newly created contribution record', { newContributionId, fetchNewError });
        return { error: { message: 'Failed to retrieve new contribution record after creation.', status: 500, code: 'DB_FETCH_ERROR' }, status: 500 };
    }
    
    const tempNewContributionDbRow = newContributionDbRow as any; 

    const resultContribution: DialecticContribution = {
        id: tempNewContributionDbRow.id,
        session_id: tempNewContributionDbRow.session_id,
        model_id: tempNewContributionDbRow.model_id, 
        model_name: null, 
        user_id: tempNewContributionDbRow.user_id, 
        stage: tempNewContributionDbRow.stage,
        iteration_number: tempNewContributionDbRow.iteration_number,
        actual_prompt_sent: tempNewContributionDbRow.actual_prompt_sent, 
        content_storage_bucket: tempNewContributionDbRow.content_storage_bucket,
        content_storage_path: tempNewContributionDbRow.content_storage_path,
        content_mime_type: tempNewContributionDbRow.content_mime_type,
        content_size_bytes: tempNewContributionDbRow.content_size_bytes,
        raw_response_storage_path: tempNewContributionDbRow.raw_response_storage_path,
        tokens_used_input: tempNewContributionDbRow.tokens_used_input,
        tokens_used_output: tempNewContributionDbRow.tokens_used_output,
        processing_time_ms: tempNewContributionDbRow.processing_time_ms,
        citations: tempNewContributionDbRow.citations ? JSON.parse(JSON.stringify(tempNewContributionDbRow.citations)) : null,
        parent_contribution_id: tempNewContributionDbRow.target_contribution_id, 
        created_at: tempNewContributionDbRow.created_at,
        updated_at: tempNewContributionDbRow.updated_at,
        edit_version: tempNewContributionDbRow.edit_version,
        is_latest_edit: tempNewContributionDbRow.is_latest_edit,
        original_model_contribution_id: tempNewContributionDbRow.original_model_contribution_id,
        error: tempNewContributionDbRow.error,
        contribution_type: tempNewContributionDbRow.contribution_type
    };

    logger.info('[saveContributionEdit] action completed successfully', { newContributionId: resultContribution.id });
    return { data: resultContribution, status: 201 };

  } catch (e) {
    const error = e as Error;
    logger.error('[saveContributionEdit] Unexpected error', { errorMessage: error.message, stack: error.stack });
    return { error: { message: 'An unexpected error occurred.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
  }
} 