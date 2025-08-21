import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type { ILogger, ServiceError } from '../_shared/types.ts';
import { isCitationsArray } from '../_shared/utils/type_guards.ts';
import type { SaveContributionEditPayload, DialecticContribution } from './dialectic.interface.ts';
import type { Database } from '../types_db.ts';

// Placeholder for actual file upload logic if content is stored as files
// For now, assuming content is text and stored directly or path is managed abstractly

type OriginalContributionQueryResult = {
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
    dialectic_projects: {
      user_id: string;
    } | null;
    current_stage_id: string | null;
  } | null;
};

export async function saveContributionEdit(
  payload: SaveContributionEditPayload,
  dbClient: SupabaseClient<Database>,
  user: User,
  logger: ILogger
): Promise<{ data?: DialecticContribution; error?: ServiceError; status?: number }> {
  logger.info('saveContributionEdit action started', { userId: user.id, payload_originalContributionIdToEdit: payload.originalContributionIdToEdit });

  const { originalContributionIdToEdit, editedContentText } = payload;
  logger.info('[saveContributionEdit] Received originalContributionIdToEdit in handler', { originalContributionIdToEdit });
  logger.info('[saveContributionEdit] User performing action:', { userId: user.id });

  if (!originalContributionIdToEdit) {
    logger.warn('[saveContributionEdit] originalContributionIdToEdit is missing from payload');
    return { error: { message: 'originalContributionIdToEdit is required.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }
  if (editedContentText === undefined || editedContentText === null) {
    logger.warn('[saveContributionEdit] editedContentText is missing from payload');
    return { error: { message: 'editedContentText is required.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }

  try {
    // TEMPORARY DEBUG LOGGING:
    logger.info('[saveContributionEdit] DEBUG: Attempting pre-flight checks for contribution:', { originalContributionIdToEdit });
    try {
        const { data: quickCheck, error: quickCheckError } = await dbClient
            .from('dialectic_contributions')
            .select('id, session_id, user_id, stage, iteration_number, edit_version') // Added more fields
            .eq('id', originalContributionIdToEdit)
            .maybeSingle(); 
        logger.info('[saveContributionEdit] DEBUG: Quick check for contribution result:', { originalContributionIdToEdit_debug: originalContributionIdToEdit, quickCheck, quickCheckError: quickCheckError ? { message: quickCheckError.message, code: quickCheckError.code } : null });

        if (quickCheck && quickCheck.session_id) {
            logger.info('[saveContributionEdit] DEBUG: Contribution found in quick check, now checking session:', { session_id_debug: quickCheck.session_id });
            const { data: sessionCheck, error: sessionCheckError } = await dbClient
                .from('dialectic_sessions')
                .select('id, project_id, dialectic_projects (id, user_id, project_name)') // Added project_name
                .eq('id', quickCheck.session_id)
                .maybeSingle();
            logger.info('[saveContributionEdit] DEBUG: Session check for contribution result:', { session_id_debug: quickCheck.session_id, sessionCheck, sessionCheckError: sessionCheckError ? { message: sessionCheckError.message, code: sessionCheckError.code } : null });
            if (sessionCheck && sessionCheck.dialectic_projects && sessionCheck.dialectic_projects.user_id !== user.id) {
                 logger.warn('[saveContributionEdit] DEBUG: Project owner mismatch!', { 
                    expectedOwner: user.id, 
                    actualOwner: sessionCheck.dialectic_projects.user_id,
                    projectName: sessionCheck.dialectic_projects.project_name
                });
            }
        } else if (quickCheck && !quickCheck.session_id) {
            logger.warn('[saveContributionEdit] DEBUG: Contribution found in quick check, but it has no session_id!', { quickCheck });
        } else {
            logger.warn('[saveContributionEdit] DEBUG: Contribution NOT found in quick check or quickCheckError occurred.');
        }
    } catch (debugErr) {
        if (debugErr instanceof Error) {
            logger.error('[saveContributionEdit] DEBUG: Exception during debug pre-flight checks:', { errorMessage: debugErr.message, stack: debugErr.stack });
        } else {
            logger.error('[saveContributionEdit] DEBUG: Exception during debug pre-flight checks:', { error: String(debugErr) });
        }
    }
    // END TEMPORARY DEBUG LOGGING

    logger.info('[saveContributionEdit] Attempting to fetch original contribution with ID:', { originalContributionIdToEdit });
    const { data: originalContribution, error: fetchError } = await dbClient
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
          dialectic_projects ( user_id ),
          current_stage_id
        )
      `)
      .eq('id', originalContributionIdToEdit)
      .single();

    logger.info('[saveContributionEdit] Result of fetching original contribution', { 
        originalContributionIdToEdit_used: originalContributionIdToEdit, 
        originalContributionData_is_truthy: !!originalContribution, 
        fetchError: fetchError ? { message: fetchError.message, code: fetchError.code, details: fetchError.details } : null
    });

    if (fetchError || !originalContribution) {
      logger.error('[saveContributionEdit] Error fetching original contribution or not found - RETURNING 404', { originalContributionIdToEdit, fetchError });
      return { error: { message: 'Original contribution not found.', status: 404, code: 'NOT_FOUND' }, status: 404 };
    }
    
    const typedOriginalContribution: OriginalContributionQueryResult = originalContribution;

    logger.info('[saveContributionEdit] Original contribution fetched successfully', { id: typedOriginalContribution.id, projectOwnerUserId: typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id, currentUser: user.id });

    if (!typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id || typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id !== user.id) {
        logger.warn('[saveContributionEdit] User attempted to edit contribution in a project they do not own', {
            userId: user.id,
            projectOwner: typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id,
            projectId: typedOriginalContribution.dialectic_sessions?.project_id,
            contributionId: originalContributionIdToEdit
        });
        return { error: { message: 'Not authorized to edit this contribution.', status: 403, code: 'FORBIDDEN' }, status: 403 };
    }

    // Add a null check for the current_stage_id
    if (!typedOriginalContribution.dialectic_sessions.current_stage_id) {
        logger.error('[saveContributionEdit] Session is missing current_stage_id', {
            sessionId: typedOriginalContribution.session_id,
            contributionId: originalContributionIdToEdit
        });
        return { error: { message: 'Data integrity error: Session is missing a current stage.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
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
        p_stage: typedOriginalContribution.dialectic_sessions.current_stage_id,        
        p_iteration_number: typedOriginalContribution.iteration_number,
        p_storage_bucket: 'dialectic_contributions_content',
        p_storage_path: placeholderContentStoragePath, 
        p_mime_type: placeholderContentMimeType,
        p_size_bytes: placeholderContentSizeBytes,
        p_raw_response_storage_path: '',
        p_tokens_used_input: 0,
        p_tokens_used_output: 0,
        p_processing_time_ms: 0,
        p_citations: null,
        p_target_contribution_id: originalContributionIdToEdit, 
        p_edit_version: newEditVersion,
        p_is_latest_edit: true,
        p_original_model_contribution_id: newOriginalModelContributionId,
        p_error_details: '',
        p_contribution_type: 'user_edit'
    };

    logger.info('[saveContributionEdit] Parameters for save_contribution_edit_atomic RPC:', { rpcParams });

    const { data: rpcData, error: transactionError } = await dbClient.rpc('save_contribution_edit_atomic', rpcParams);

    if (transactionError) {
      logger.error('[saveContributionEdit] Error in save_contribution_edit_atomic transaction', { transactionError, rpcParamsSent: rpcParams });
      return { error: { message: 'Failed to save contribution edit.', status: 500, code: 'DB_TRANSACTION_ERROR', details: transactionError.message }, status: 500 };
    }
    
    const newContributionId = rpcData; 
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
    
    const dbContributionRow = newContributionDbRow; // Alias for clarity

    // Fetch the full stage object based on stage (which is stage_id) from the new contribution
    if (!dbContributionRow.stage) {
        logger.error('[saveContributionEdit] Newly created contribution is missing stage_id (dbContributionRow.stage is null)', { contributionId: dbContributionRow.id });
        return { error: { message: 'Data integrity error: new contribution is missing stage_id.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    const { data: stageObject, error: stageFetchError } = await dbClient
        .from('dialectic_stages')
        .select('*')
        .eq('id', dbContributionRow.stage)
        .single();

    if (stageFetchError || !stageObject) {
        logger.error('[saveContributionEdit] Failed to fetch stage details for new contribution', { stageIdProvided: dbContributionRow.stage, stageFetchError });
        return { error: { message: 'Data integrity error: Could not fetch stage details for the new contribution.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    let parsedCitations: { text: string; url?: string }[] | null = null;
    if (dbContributionRow.citations) {
        if (typeof dbContributionRow.citations === 'string') {
            try {
                const parsed = JSON.parse(dbContributionRow.citations);
                if (isCitationsArray(parsed)) {
                    parsedCitations = parsed;
                }
            } catch (jsonError) {
                logger.error('[saveContributionEdit] Failed to parse citations JSON string for contribution.', { contributionId: dbContributionRow.id, citationsString: dbContributionRow.citations, error: jsonError });
            }
        } else if (isCitationsArray(dbContributionRow.citations)) {
            parsedCitations = dbContributionRow.citations;
        }
    }

    const resultContribution: DialecticContribution = {
        id: dbContributionRow.id,
        session_id: dbContributionRow.session_id,
        user_id: dbContributionRow.user_id,
        stage: stageObject.slug, // Use the fetched stage object
        iteration_number: dbContributionRow.iteration_number,
        model_id: dbContributionRow.model_id,
        model_name: dbContributionRow.model_name,
        prompt_template_id_used: dbContributionRow.prompt_template_id_used,
        seed_prompt_url: dbContributionRow.seed_prompt_url,
        
        // Map content storage fields from db row's storage fields
        storage_bucket: dbContributionRow.storage_bucket,
        storage_path: dbContributionRow.storage_path,
        mime_type: dbContributionRow.mime_type,
        size_bytes: dbContributionRow.size_bytes,
        
        edit_version: dbContributionRow.edit_version,
        is_latest_edit: dbContributionRow.is_latest_edit,
        original_model_contribution_id: dbContributionRow.original_model_contribution_id,
        raw_response_storage_path: dbContributionRow.raw_response_storage_path,
        target_contribution_id: dbContributionRow.target_contribution_id,
        tokens_used_input: dbContributionRow.tokens_used_input,
        tokens_used_output: dbContributionRow.tokens_used_output,
        processing_time_ms: dbContributionRow.processing_time_ms,
        error: dbContributionRow.error,
        citations: parsedCitations, // Use parsed citations
        created_at: dbContributionRow.created_at,
        updated_at: dbContributionRow.updated_at,
        contribution_type: dbContributionRow.contribution_type,
        file_name: dbContributionRow.file_name,
    };

    logger.info('[saveContributionEdit] action completed successfully', { newContributionId: resultContribution.id });
    return { data: resultContribution, status: 201 };

  } catch (e) {
    if (e instanceof Error) {
        logger.error('[saveContributionEdit] Unexpected error', { errorMessage: e.message, stack: e.stack });
    } else {
        logger.error('[saveContributionEdit] Unexpected error', { error: String(e) });
    }
    return { error: { message: 'An unexpected error occurred.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
  }
} 