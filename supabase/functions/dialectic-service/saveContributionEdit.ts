import { User } from 'npm:@supabase/supabase-js';
import { ServiceError } from '../_shared/types.ts';
import { isEditedDocumentResource } from '../_shared/utils/type-guards/type_guards.dialectic.ts';
import {
  SaveContributionEditPayload,
  EditedDocumentResource,
  SaveContributionEditSuccessResponse,
  SaveContributionEditContext,
  OriginalContributionQueryResult,
} from './dialectic.interface.ts';
import { FileManagerResponse, FileRecord, FileType, UploadContext } from '../_shared/types/file_manager.types.ts';
import { DeconstructedPathInfo } from '../_shared/utils/path_deconstructor.types.ts';
import { Json } from '../types_db.ts';

export async function saveContributionEdit(
  payload: SaveContributionEditPayload,
  user: User,
  deps: SaveContributionEditContext
): Promise<{ data?: SaveContributionEditSuccessResponse; error?: ServiceError; status?: number }> {
  deps.logger.info('saveContributionEdit action started', { userId: user.id, payload_originalContributionIdToEdit: payload.originalContributionIdToEdit });

  const {
    originalContributionIdToEdit,
    editedContentText,
    documentKey,
    resourceType,
  } = payload;
  deps.logger.info('[saveContributionEdit] Received originalContributionIdToEdit in handler', { originalContributionIdToEdit });
  deps.logger.info('[saveContributionEdit] User performing action:', { userId: user.id });

  if (!originalContributionIdToEdit) {
    deps.logger.warn('[saveContributionEdit] originalContributionIdToEdit is missing from payload');
    return { error: { message: 'originalContributionIdToEdit is required.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }
  if (editedContentText === undefined || editedContentText === null) {
    deps.logger.warn('[saveContributionEdit] editedContentText is missing from payload');
    return { error: { message: 'editedContentText is required.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }
  if (!documentKey) {
    deps.logger.warn('[saveContributionEdit] documentKey is missing from payload');
    return { error: { message: 'Document key is required for doc-centric edits.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }
  if (!resourceType) {
    deps.logger.warn('[saveContributionEdit] resourceType is missing from payload');
    return { error: { message: 'resourceType is required for doc-centric edits.', status: 400, code: 'INVALID_PAYLOAD' }, status: 400 };
  }

  try {
    // TEMPORARY DEBUG LOGGING:
    deps.logger.info('[saveContributionEdit] DEBUG: Attempting pre-flight checks for contribution:', { originalContributionIdToEdit });
    try {
        const { data: quickCheck, error: quickCheckError } = await deps.dbClient
            .from('dialectic_contributions')
            .select('id, session_id, user_id, stage, iteration_number, edit_version') // Added more fields
            .eq('id', originalContributionIdToEdit)
            .maybeSingle(); 
        deps.logger.info('[saveContributionEdit] DEBUG: Quick check for contribution result:', { originalContributionIdToEdit_debug: originalContributionIdToEdit, quickCheck, quickCheckError: quickCheckError ? { message: quickCheckError.message, code: quickCheckError.code } : null });

        if (quickCheck && quickCheck.session_id) {
            deps.logger.info('[saveContributionEdit] DEBUG: Contribution found in quick check, now checking session:', { session_id_debug: quickCheck.session_id });
            const { data: sessionCheck, error: sessionCheckError } = await deps.dbClient
                .from('dialectic_sessions')
                .select('id, project_id, dialectic_projects (id, user_id, project_name)') // Added project_name
                .eq('id', quickCheck.session_id)
                .maybeSingle();
            deps.logger.info('[saveContributionEdit] DEBUG: Session check for contribution result:', { session_id_debug: quickCheck.session_id, sessionCheck, sessionCheckError: sessionCheckError ? { message: sessionCheckError.message, code: sessionCheckError.code } : null });
            if (sessionCheck && sessionCheck.dialectic_projects && sessionCheck.dialectic_projects.user_id !== user.id) {
                 deps.logger.warn('[saveContributionEdit] DEBUG: Project owner mismatch!', { 
                    expectedOwner: user.id, 
                    actualOwner: sessionCheck.dialectic_projects.user_id,
                    projectName: sessionCheck.dialectic_projects.project_name
                });
            }
        } else if (quickCheck && !quickCheck.session_id) {
            deps.logger.warn('[saveContributionEdit] DEBUG: Contribution found in quick check, but it has no session_id!', { quickCheck });
        } else {
            deps.logger.warn('[saveContributionEdit] DEBUG: Contribution NOT found in quick check or quickCheckError occurred.');
        }
    } catch (debugErr) {
        if (debugErr instanceof Error) {
            deps.logger.error('[saveContributionEdit] DEBUG: Exception during debug pre-flight checks:', { errorMessage: debugErr.message, stack: debugErr.stack });
        } else {
            deps.logger.error('[saveContributionEdit] DEBUG: Exception during debug pre-flight checks:', { error: String(debugErr) });
        }
    }
    // END TEMPORARY DEBUG LOGGING

    deps.logger.info('[saveContributionEdit] Attempting to fetch original contribution with ID:', { originalContributionIdToEdit });
    const { data: originalContribution, error: fetchError } = await deps.dbClient
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

    deps.logger.info('[saveContributionEdit] Result of fetching original contribution', { 
        originalContributionIdToEdit_used: originalContributionIdToEdit, 
        originalContributionData_is_truthy: !!originalContribution, 
        fetchError: fetchError ? { message: fetchError.message, code: fetchError.code, details: fetchError.details } : null
    });

    if (fetchError || !originalContribution) {
      deps.logger.error('[saveContributionEdit] Error fetching original contribution or not found - RETURNING 404', { originalContributionIdToEdit, fetchError });
      return { error: { message: 'Original contribution not found.', status: 404, code: 'NOT_FOUND' }, status: 404 };
    }
    
    const typedOriginalContribution: OriginalContributionQueryResult = originalContribution;

    deps.logger.info('[saveContributionEdit] Original contribution fetched successfully', { id: typedOriginalContribution.id, projectOwnerUserId: typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id, currentUser: user.id });

    if (!typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id || typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id !== user.id) {
        deps.logger.warn('[saveContributionEdit] User attempted to edit contribution in a project they do not own', {
            userId: user.id,
            projectOwner: typedOriginalContribution.dialectic_sessions?.dialectic_projects?.user_id,
            projectId: typedOriginalContribution.dialectic_sessions?.project_id,
            contributionId: originalContributionIdToEdit
        });
        return { error: { message: 'Not authorized to edit this contribution.', status: 403, code: 'FORBIDDEN' }, status: 403 };
    }

    // Add a null check for the current_stage_id
    if (!typedOriginalContribution.dialectic_sessions.current_stage_id) {
        deps.logger.error('[saveContributionEdit] Session is missing current_stage_id', {
            sessionId: typedOriginalContribution.session_id,
            contributionId: originalContributionIdToEdit
        });
        return { error: { message: 'Data integrity error: Session is missing a current stage.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }
    // Fail-fast on missing DI
    if (!deps || !deps.fileManager) {
        deps.logger.error('[saveContributionEdit] fileManager dependency not provided');
        return { error: { message: 'Internal configuration error.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Deconstruct original path to derive canonical parameters
    if (!originalContribution.storage_path || !originalContribution.file_name) {
        deps.logger.error('[saveContributionEdit] Original contribution missing storage_path or file_name');
        return { error: { message: 'Data integrity error: original contribution lacks storage fields.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }
    const deconstructed: DeconstructedPathInfo = deps.pathDeconstructor({
      storageDir: originalContribution.storage_path,
      fileName: originalContribution.file_name,
      dbOriginalFileName: originalContribution.file_name,
    });
    if (deconstructed.error || !deconstructed.originalProjectId || !deconstructed.stageSlug || deconstructed.attemptCount === undefined || !deconstructed.modelSlug || deconstructed.iteration === undefined) {
        deps.logger.error('[saveContributionEdit] Failed to deconstruct original path; aborting to prevent partial/incorrect clone', { deconstructed });
        return { error: { message: 'Failed to parse original file path for canonical context.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    const newEditVersion: number = typedOriginalContribution.edit_version + 1;

    // Ensure required model metadata is present
    if (!originalContribution.model_id || !originalContribution.model_name) {
        deps.logger.error('[saveContributionEdit] Original contribution missing model metadata (model_id/model_name)');
        return { error: { message: 'Data integrity error: original contribution missing model metadata.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    const resolvedDocumentKey: FileType = documentKey;

    const fileTypeForRenderedDocument: FileType = FileType.RenderedDocument;
    const descriptionMetadata: Json = {
        document_key: resolvedDocumentKey,
        model_id: originalContribution.model_id,
        model_name: originalContribution.model_name,
        iteration_number: deconstructed.iteration,
        edit_version: newEditVersion,
        original_contribution_id: originalContributionIdToEdit,
    };

    const uploadContext: UploadContext = {
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
    };

    const uploadResult: FileManagerResponse = await deps.fileManager.uploadAndRegisterFile(uploadContext);

    if (uploadResult.error || !uploadResult.record) {
        deps.logger.error('[saveContributionEdit] FileManager uploadAndRegisterFile failed', { error: uploadResult.error });
        return { error: { message: 'Failed to save contribution edit.', status: 500, code: 'DB_TRANSACTION_ERROR', details: uploadResult.error?.message }, status: 500 };
    }

    const newResourceRow: FileRecord = uploadResult.record;

    if (!('resource_type' in newResourceRow) || !('project_id' in newResourceRow) || !('session_id' in newResourceRow)) {
        deps.logger.error('[saveContributionEdit] FileManager returned unexpected record type for rendered document edit');
        return { error: { message: 'Failed to create rendered document resource.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    // Mark original as not latest
    const { error: updateOriginalError } = await deps.dbClient
        .from('dialectic_contributions')
        .update({ is_latest_edit: false })
        .eq('id', originalContributionIdToEdit);

    if (updateOriginalError) {
        deps.logger.error('[saveContributionEdit] Failed to update original is_latest_edit=false; attempting cleanup', { updateOriginalError });
        // Best-effort cleanup: remove the uploaded file path
        try {
            const fullNewPath: string = `${newResourceRow.storage_path}/${newResourceRow.file_name}`;
            const bucketEnv: string | undefined = Deno.env.get('SB_CONTENT_STORAGE_BUCKET');
            if (bucketEnv) {
                await deps.dbClient.storage.from(bucketEnv).remove([fullNewPath]);
            }
            await deps.dbClient.from('dialectic_project_resources').delete().eq('id', newResourceRow.id);
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
        deps.logger.error('[saveContributionEdit] Mapped resource failed EditedDocumentResource validation', { resourceResponse });
        return { error: { message: 'Failed to normalize rendered document resource.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
    }

    const responsePayload: SaveContributionEditSuccessResponse = {
        resource: resourceResponse,
        sourceContributionId: originalContributionIdToEdit,
    };

    deps.logger.info('[saveContributionEdit] action completed successfully', { newResourceId: responsePayload.resource.id });
    return { data: responsePayload, status: 201 };

  } catch (e) {
    if (e instanceof Error) {
        deps.logger.error('[saveContributionEdit] Unexpected error', { errorMessage: e.message, stack: e.stack });
    } else {
        deps.logger.error('[saveContributionEdit] Unexpected error', { error: String(e) });
    }
    return { error: { message: 'An unexpected error occurred.', status: 500, code: 'INTERNAL_SERVER_ERROR' }, status: 500 };
  }
} 