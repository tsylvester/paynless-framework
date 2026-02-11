import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type {
  IFileManager,
  PathContext,
  UserFeedbackUploadContext,
} from '../_shared/types/file_manager.types.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import type { ILogger } from '../_shared/types.ts';
import {
  type DialecticServiceResponse,
  type SubmitStageDocumentFeedbackPayload,
} from './dialectic.interface.ts';

export interface SubmitStageDocumentFeedbackDeps {
  fileManager: IFileManager;
  logger: ILogger;
}

export async function submitStageDocumentFeedback(
  payload: SubmitStageDocumentFeedbackPayload,
  dbClient: SupabaseClient<Database>,
  deps: SubmitStageDocumentFeedbackDeps,
): Promise<DialecticServiceResponse<Database['public']['Tables']['dialectic_feedback']['Row']>> {
  const {
    sessionId,
    stageSlug,
    iterationNumber,
    documentKey,
    modelId,
    feedbackContent,
    feedbackType,
    userId,
    projectId,
    feedbackId,
    sourceContributionId,
  } = payload;

  if (
    !sessionId || !stageSlug || iterationNumber === undefined || !documentKey ||
    !modelId || !feedbackContent || !userId || !projectId
  ) {
    deps.logger.warn('Missing required fields in feedback payload.', { payload });
    return {
      error: { message: 'Missing required fields in feedback payload.' },
    };
  }

  const { fileManager, logger } = deps;
  let resolvedSourceContributionId: string | null;
  if (sourceContributionId === undefined) {
    resolvedSourceContributionId = null;
  } else {
    resolvedSourceContributionId = sourceContributionId;
  }

  let originalStoragePath: string | undefined;
  let originalBaseName: string | undefined;
  if (resolvedSourceContributionId !== null) {
    const { data: resourceRows, error: resourceError } = await dbClient
      .from('dialectic_project_resources')
      .select('id, storage_path, file_name, updated_at, created_at')
      .eq('source_contribution_id', resolvedSourceContributionId)
      .eq('resource_type', 'rendered_document');

    if (resourceError) {
      logger.warn('Original document lookup failed for feedback placement.', {
        sourceContributionId: resolvedSourceContributionId,
        errorMessage: resourceError.message,
      });
      return {
        error: { message: 'Original document not found for feedback placement.' },
      };
    }

    if (resourceRows === null) {
      logger.warn('Original document lookup returned null data.', {
        sourceContributionId: resolvedSourceContributionId,
      });
      return {
        error: { message: 'Original document not found for feedback placement.' },
      };
    }

    if (!Array.isArray(resourceRows)) {
      logger.warn('Original document lookup returned non-array data.', {
        sourceContributionId: resolvedSourceContributionId,
      });
      return {
        error: { message: 'Original document not found for feedback placement.' },
      };
    }

    if (resourceRows.length === 0) {
      logger.warn('Original document not found for feedback placement.', {
        sourceContributionId: resolvedSourceContributionId,
      });
      return {
        error: { message: 'Original document not found for feedback placement.' },
      };
    }

    const firstRow = resourceRows[0];
    if (resourceRows.length === 1) {
      if (!firstRow.storage_path || !firstRow.file_name) {
        logger.warn('Original document row is missing required fields.', {
          sourceContributionId: resolvedSourceContributionId,
        });
        return {
          error: { message: 'Original document not found for feedback placement.' },
        };
      }

      originalStoragePath = firstRow.storage_path;
      if (firstRow.file_name.endsWith('.md')) {
        originalBaseName = firstRow.file_name.slice(0, -3);
      } else {
        originalBaseName = firstRow.file_name;
      }
    } else {
      if (
        !firstRow.id || !firstRow.storage_path || !firstRow.file_name ||
        !firstRow.updated_at || !firstRow.created_at
      ) {
        logger.warn('Original document rows are missing required fields for deterministic selection.', {
          sourceContributionId: resolvedSourceContributionId,
        });
        return {
          error: { message: 'Original document not found for feedback placement.' },
        };
      }

      const firstUpdatedAtMs = Date.parse(firstRow.updated_at);
      const firstCreatedAtMs = Date.parse(firstRow.created_at);
      if (!Number.isFinite(firstUpdatedAtMs) || !Number.isFinite(firstCreatedAtMs)) {
        logger.warn('Original document rows contain invalid timestamps.', {
          sourceContributionId: resolvedSourceContributionId,
        });
        return {
          error: { message: 'Original document not found for feedback placement.' },
        };
      }

      let selectedRow = firstRow;
      let selectedUpdatedAtMs = firstUpdatedAtMs;
      let selectedCreatedAtMs = firstCreatedAtMs;

      for (let i = 1; i < resourceRows.length; i += 1) {
        const row = resourceRows[i];
        if (!row) {
          logger.warn('Original document lookup returned an undefined row.', {
            sourceContributionId: resolvedSourceContributionId,
          });
          return {
            error: { message: 'Original document not found for feedback placement.' },
          };
        }

        if (
          !row.id || !row.storage_path || !row.file_name || !row.updated_at ||
          !row.created_at
        ) {
          logger.warn('Original document rows are missing required fields for deterministic selection.', {
            sourceContributionId: resolvedSourceContributionId,
          });
          return {
            error: { message: 'Original document not found for feedback placement.' },
          };
        }

        const rowUpdatedAtMs = Date.parse(row.updated_at);
        const rowCreatedAtMs = Date.parse(row.created_at);
        if (!Number.isFinite(rowUpdatedAtMs) || !Number.isFinite(rowCreatedAtMs)) {
          logger.warn('Original document rows contain invalid timestamps.', {
            sourceContributionId: resolvedSourceContributionId,
          });
          return {
            error: { message: 'Original document not found for feedback placement.' },
          };
        }

        if (rowUpdatedAtMs > selectedUpdatedAtMs) {
          selectedRow = row;
          selectedUpdatedAtMs = rowUpdatedAtMs;
          selectedCreatedAtMs = rowCreatedAtMs;
          continue;
        }

        if (rowUpdatedAtMs < selectedUpdatedAtMs) {
          continue;
        }

        if (rowCreatedAtMs > selectedCreatedAtMs) {
          selectedRow = row;
          selectedCreatedAtMs = rowCreatedAtMs;
          continue;
        }

        if (rowCreatedAtMs < selectedCreatedAtMs) {
          continue;
        }

        if (row.id > selectedRow.id) {
          selectedRow = row;
        }
      }

      originalStoragePath = selectedRow.storage_path;
      if (selectedRow.file_name.endsWith('.md')) {
        originalBaseName = selectedRow.file_name.slice(0, -3);
      } else {
        originalBaseName = selectedRow.file_name;
      }
    }
  }

  const fileName =
    `feedback_${documentKey}_${modelId}_${new Date().toISOString()}.md`;
  const fileBuffer = new TextEncoder().encode(feedbackContent);
  const blob = new Blob([fileBuffer], { type: 'text/markdown' });

  const pathContext: PathContext & { fileType: FileType.UserFeedback } = {
    projectId: projectId,
    fileType: FileType.UserFeedback,
    sessionId: sessionId,
    iteration: iterationNumber,
    stageSlug: stageSlug,
    documentKey: documentKey,
    modelSlug: modelId,
    originalFileName: fileName,
    sourceContributionId: resolvedSourceContributionId,
  };

  if (originalStoragePath !== undefined) {
    if (originalBaseName === undefined) {
      logger.warn('Original document base name is missing while storage path is present.', {
        sourceContributionId: resolvedSourceContributionId,
      });
      return {
        error: { message: 'Original document not found for feedback placement.' },
      };
    }

    pathContext.originalStoragePath = originalStoragePath;
    pathContext.originalBaseName = originalBaseName;
  } else {
    if (originalBaseName !== undefined) {
      logger.warn('Original document storage path is missing while base name is present.', {
        sourceContributionId: resolvedSourceContributionId,
      });
      return {
        error: { message: 'Original document not found for feedback placement.' },
      };
    }
  }
  const uploadContext: UserFeedbackUploadContext = {
    fileContent: feedbackContent,
    mimeType: 'text/markdown',
    sizeBytes: blob.size,
    userId: userId,
    description: `User feedback for document ${documentKey}`,
    pathContext,
    feedbackTypeForDb: feedbackType,
    resourceDescriptionForDb: {
      document_key: documentKey,
      model_id: modelId,
    },
  };

  const { record: fileRecord, error: fileError } = await fileManager
    .uploadAndRegisterFile(uploadContext);

  if (fileError || !fileRecord) {
    let fileErrorMessage: string;
    if (fileError) {
      fileErrorMessage = fileError.message;
    } else {
      fileErrorMessage = 'Unknown file manager error';
    }
    logger.error(
      `Failed to upload feedback for session ${sessionId}, doc ${documentKey}: ${fileErrorMessage}`,
    );
    return {
      error: { message: 'Failed to upload and register feedback file.' },
    };
  }

  // Type assertion to ensure we have the correct fields from the union type
  if (
    !('storage_bucket' in fileRecord) || !('storage_path' in fileRecord) ||
    !('size_bytes' in fileRecord) || fileRecord.size_bytes === null || !fileRecord.file_name
  ) {
    logger.error('File record from fileManager is missing required fields.', {
      fileRecord,
    });
    return { error: { message: 'Invalid file record returned from storage.' } };
  }

  const dbRecord = {
    session_id: sessionId,
    project_id: projectId,
    user_id: userId,
    stage_slug: stageSlug,
    iteration_number: iterationNumber,
    feedback_type: feedbackType,
    resource_description: {
      document_key: documentKey,
      model_id: modelId,
    },
    file_name: fileRecord.file_name,
    storage_bucket: fileRecord.storage_bucket,
    storage_path: fileRecord.storage_path,
    size_bytes: fileRecord.size_bytes,
    mime_type: fileRecord.mime_type,
    target_contribution_id: resolvedSourceContributionId,
  };

  if (feedbackId) {
    const { data, error } = await dbClient
      .from('dialectic_feedback')
      .update(dbRecord)
      .eq('id', feedbackId)
      .select()
      .single();

    if (error) {
      logger.error(`DB update error for feedback ${feedbackId}: ${error.message}`);
      return { error };
    }
    return { data };
  } else {
    const { data, error } = await dbClient
      .from('dialectic_feedback')
      .insert(dbRecord)
      .select()
      .single();

    if (error) {
      logger.error(`DB insert error for feedback: ${error.message}`);
      return { error };
    }
    return { data };
  }
}
