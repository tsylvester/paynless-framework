import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type { ILogger, ServiceError } from '../_shared/types.ts';
import { isEditedDocumentResource } from '../_shared/utils/type-guards/type_guards.dialectic.ts';
import type {
  SaveContributionEditPayload,
  EditedDocumentResource,
  SaveContributionEditSuccessResponse,
} from './dialectic.interface.ts';
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
): Promise<{ data?: SaveContributionEditSuccessResponse; error?: ServiceError; status?: number }> {
  logger.info('saveContributionEdit action started', { userId: user.id, payload_originalContributionIdToEdit: payload.originalContributionIdToEdit });

  const {
    originalContributionIdToEdit,
    editedContentText,
    documentKey,
    resourceType,
  } = payload;
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

    // Ensure required model metadata is present
    if (!originalContribution.model_id || !originalContribution.model_name) {
        logger.error('[saveContributionEdit] Original contribution missing model metadata (model_id/model_name)');
        return { error: { message: 'Data integrity error: original contribution missing model metadata.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    if (!documentKey) {
        logger.error('[saveContributionEdit] Missing document key for rendered document update');
        return { error: { message: 'Document key is required for doc-centric edits.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
    }

    if (!resourceType) {
        logger.error('[saveContributionEdit] Missing resourceType for rendered document update');
        return { error: { message: 'resourceType is required for doc-centric edits.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
    }

    const resolvedDocumentKey = documentKey;

    const fileTypeForRenderedDocument = FileType.RenderedDocument;
    const descriptionMetadata = {
        document_key: resolvedDocumentKey,
        model_id: originalContribution.model_id,
        model_name: originalContribution.model_name,
        iteration_number: deconstructed.iteration,
        edit_version: newEditVersion,
        original_contribution_id: originalContributionIdToEdit,
    };

    const uploadResult = await deps.fileManager.uploadAndRegisterFile({
        pathContext: {
            projectId: deconstructed.originalProjectId,
            sessionId: typedOriginalContribution.session_id,
            iteration: deconstructed.iteration,
            stageSlug: deconstructed.stageSlug,
            fileType: fileTypeForRenderedDocument,
            modelSlug: deconstructed.modelSlug,
            attemptCount: deconstructed.attemptCount,
            originalFileName: `${deconstructed.modelSlug}_${deconstructed.attemptCount}_${resolvedDocumentKey}.md`,
            documentKey: resolvedDocumentKey,
            sourceContributionId: typedOriginalContribution.id,
        },
        resourceTypeForDb: resourceType,
        resourceDescriptionForDb: descriptionMetadata,
        fileContent: editedContentText,
        mimeType: 'text/markdown',
        sizeBytes: new TextEncoder().encode(editedContentText).length,
        userId: user.id,
        description: 'user_edit_of_document',
    });

    if (uploadResult.error || !uploadResult.record) {
        logger.error('[saveContributionEdit] FileManager uploadAndRegisterFile failed', { error: uploadResult.error });
        return { error: { message: 'Failed to save contribution edit.', status: 500, code: 'DB_TRANSACTION_ERROR', details: uploadResult.error?.details }, status: 500 };
    }

    const newResourceRow = uploadResult.record;

    if (!('resource_type' in newResourceRow) || !('project_id' in newResourceRow) || !('session_id' in newResourceRow)) {
        logger.error('[saveContributionEdit] FileManager returned unexpected record type for rendered document edit');
        return { error: { message: 'Failed to create rendered document resource.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
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
            const fullNewPath = `${newResourceRow.storage_path}/${newResourceRow.file_name}`;
            const bucketEnv = Deno.env.get('SB_CONTENT_STORAGE_BUCKET');
            if (bucketEnv) {
                await dbClient.storage.from(bucketEnv).remove([fullNewPath]);
            }
            await dbClient.from('dialectic_project_resources').delete().eq('id', newResourceRow.id);
        } catch (_) { /* swallow cleanup errors; we already log the primary failure */ }
        return { error: { message: 'Failed to finalize edit; original update failed.', status: 500, code: 'DB_TRANSACTION_ERROR' }, status: 500 };
    }

    const resourceResponse: EditedDocumentResource = {
        id: newResourceRow.id,
        resource_type: newResourceRow.resource_type,
        project_id: newResourceRow.project_id,
        session_id: newResourceRow.session_id,
        stage_slug: newResourceRow.stage_slug,
        iteration_number: newResourceRow.iteration_number,
        document_key: resolvedDocumentKey,
        source_contribution_id: newResourceRow.source_contribution_id,
        storage_bucket: newResourceRow.storage_bucket,
        storage_path: newResourceRow.storage_path,
        file_name: newResourceRow.file_name,
        mime_type: newResourceRow.mime_type,
        size_bytes: newResourceRow.size_bytes,
        created_at: newResourceRow.created_at,
        updated_at: newResourceRow.updated_at,
    };

    if (!isEditedDocumentResource(resourceResponse)) {
        logger.error('[saveContributionEdit] Mapped resource failed EditedDocumentResource validation', { resourceResponse });
        return { error: { message: 'Failed to normalize rendered document resource.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    const responsePayload: SaveContributionEditSuccessResponse = {
        resource: resourceResponse,
        sourceContributionId: originalContributionIdToEdit,
    };

    logger.info('[saveContributionEdit] action completed successfully', { newResourceId: responsePayload.resource.id });
    return { data: responsePayload, status: 201 };

  } catch (e) {
    if (e instanceof Error) {
        logger.error('[saveContributionEdit] Unexpected error', { errorMessage: e.message, stack: e.stack });
    } else {
        logger.error('[saveContributionEdit] Unexpected error', { error: String(e) });
    }
    return { error: { message: 'An unexpected error occurred.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
  }
} 