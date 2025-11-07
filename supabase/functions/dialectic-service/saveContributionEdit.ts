import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type { ILogger, ServiceError } from '../_shared/types.ts';
import { isCitationsArray, isContributionType, isDialecticContribution } from '../_shared/utils/type_guards.ts';
import type { SaveContributionEditPayload, DialecticContribution } from './dialectic.interface.ts';
import type { Database } from '../types_db.ts';
import { FileType, type IFileManager } from '../_shared/types/file_manager.types.ts';
import type { DeconstructedPathInfo } from '../_shared/utils/path_deconstructor.types.ts';
import type { ConstructedPath } from '../_shared/utils/path_constructor.ts';

type PathDeconstructor = (params: { storageDir: string; fileName: string; dbOriginalFileName?: string }) => DeconstructedPathInfo;
type PathConstructor = (context: import('../_shared/types/file_manager.types.ts').PathContext) => ConstructedPath;

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

export type SaveContributionEditDeps = {
  fileManager: IFileManager;
  logger: ILogger;
  dbClient: SupabaseClient<Database>;
  pathDeconstructor: PathDeconstructor;
  pathConstructor: PathConstructor;
};

export async function saveContributionEdit(
  payload: SaveContributionEditPayload,
  dbClient: SupabaseClient<Database>,
  user: User,
  logger: ILogger,
  deps: SaveContributionEditDeps
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
        model_id,
        model_name,
        storage_path,
        file_name,
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
    // Fail-fast on missing DI
    if (!deps || !deps.fileManager) {
        logger.error('[saveContributionEdit] fileManager dependency not provided');
        return { error: { message: 'Internal configuration error.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Deconstruct original path to derive canonical parameters
    if (!originalContribution.storage_path || !originalContribution.file_name) {
        logger.error('[saveContributionEdit] Original contribution missing storage_path or file_name');
        return { error: { message: 'Data integrity error: original contribution lacks storage fields.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }
    const deconstructed = deps.pathDeconstructor({ storageDir: originalContribution.storage_path, fileName: originalContribution.file_name, dbOriginalFileName: originalContribution.file_name });
    if (deconstructed.error || !deconstructed.originalProjectId || !deconstructed.stageSlug || deconstructed.attemptCount === undefined || !deconstructed.modelSlug || deconstructed.iteration === undefined) {
        logger.error('[saveContributionEdit] Failed to deconstruct original path; aborting to prevent partial/incorrect clone', { deconstructed });
        return { error: { message: 'Failed to parse original file path for canonical context.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    const newEditVersion = typedOriginalContribution.edit_version + 1;
    const originalModelContributionId = typedOriginalContribution.original_model_contribution_id || typedOriginalContribution.id;

    // Ensure required model metadata is present
    if (!originalContribution.model_id || !originalContribution.model_name) {
        logger.error('[saveContributionEdit] Original contribution missing model metadata (model_id/model_name)');
        return { error: { message: 'Data integrity error: original contribution missing model metadata.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Determine contribution type for path/metadata
    const pathContributionType: ReturnType<typeof isContributionType> extends true ? never : import('./dialectic.interface.ts').ContributionType | null =
        (deconstructed.contributionType && isContributionType(deconstructed.contributionType))
        ? deconstructed.contributionType
        : (isContributionType(deconstructed.stageSlug) ? deconstructed.stageSlug : null);
    if (!pathContributionType) {
        logger.error('[saveContributionEdit] Unable to determine contribution type from deconstructed path/stage.');
        return { error: { message: 'Failed to determine contribution type for edited file.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Upload new edited content via FileManager
    const uploadResult = await deps.fileManager.uploadAndRegisterFile({
        pathContext: {
            projectId: deconstructed.originalProjectId,
            sessionId: typedOriginalContribution.session_id,
            iteration: deconstructed.iteration,
            stageSlug: deconstructed.stageSlug,
            fileType: FileType.business_case, // TODO: Use the actual file type from the stage recipe, this is a placeholder
            modelSlug: deconstructed.modelSlug,
            attemptCount: deconstructed.attemptCount,
            contributionType: pathContributionType,
            originalFileName: `${deconstructed.modelSlug}_${deconstructed.attemptCount}_${deconstructed.contributionType}.md`,
        },
        fileContent: editedContentText,
        mimeType: 'text/markdown',
        sizeBytes: new TextEncoder().encode(editedContentText).length,
        userId: user.id,
        description: 'user_edit_of_model_contribution',
        contributionMetadata: {
            sessionId: typedOriginalContribution.session_id,
            modelIdUsed: originalContribution.model_id,
            modelNameDisplay: originalContribution.model_name,
            stageSlug: deconstructed.stageSlug,
            iterationNumber: deconstructed.iteration,
            rawJsonResponseContent: '',
            editVersion: newEditVersion,
            isLatestEdit: true,
            originalModelContributionId,
            target_contribution_id: typedOriginalContribution.id,
            contributionType: pathContributionType,
            document_relationships: null,
        },
    });

    if (uploadResult.error || !uploadResult.record) {
        logger.error('[saveContributionEdit] FileManager uploadAndRegisterFile failed', { error: uploadResult.error });
        return { error: { message: 'Failed to save contribution edit.', status: 500, code: 'DB_TRANSACTION_ERROR', details: uploadResult.error?.details }, status: 500 };
    }

    const newContributionDbRow = uploadResult.record;

    if (!isDialecticContribution(newContributionDbRow)) {
        logger.error('[saveContributionEdit] FileManager returned non-contribution record for model_contribution_main');
        return { error: { message: 'Failed to create contribution record.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Mark original as not latest
    const { error: updateOriginalError } = await dbClient
        .from('dialectic_contributions')
        .update({ is_latest_edit: false })
        .eq('id', originalContributionIdToEdit);

    if (updateOriginalError) {
        logger.error('[saveContributionEdit] Failed to update original is_latest_edit=false; attempting cleanup', { updateOriginalError });
        // Best-effort cleanup: remove the uploaded file path
        try {
            const fullNewPath = `${newContributionDbRow.storage_path}/${newContributionDbRow.file_name}`;
            const bucketEnv = Deno.env.get('SB_CONTENT_STORAGE_BUCKET');
            if (bucketEnv) {
                await dbClient.storage.from(bucketEnv).remove([fullNewPath]);
            }
            await dbClient.from('dialectic_contributions').delete().eq('id', newContributionDbRow.id);
        } catch (_) { /* swallow cleanup errors; we already log the primary failure */ }
        return { error: { message: 'Failed to finalize edit; original update failed.', status: 500, code: 'DB_TRANSACTION_ERROR' }, status: 500 };
    }

    const dbContributionRow = newContributionDbRow; // Alias for mapping

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
        contribution_type: (dbContributionRow.contribution_type && isContributionType(dbContributionRow.contribution_type))
          ? dbContributionRow.contribution_type
          : (stageObject.slug && isContributionType(stageObject.slug) ? stageObject.slug : null),
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