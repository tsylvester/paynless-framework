import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type { IFileManager, UserFeedbackUploadContext } from '../_shared/types/file_manager.types.ts';
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
  } = payload;

  if (
    !sessionId || !stageSlug || !iterationNumber === undefined || !documentKey ||
    !modelId || !feedbackContent || !userId || !projectId
  ) {
    deps.logger.warn('Missing required fields in feedback payload.', { payload });
    return {
      error: { message: 'Missing required fields in feedback payload.' },
    };
  }

  const { fileManager, logger } = deps;

  const fileName =
    `feedback_${documentKey}_${modelId}_${new Date().toISOString()}.md`;
  const fileBuffer = new TextEncoder().encode(feedbackContent);
  const blob = new Blob([fileBuffer], { type: 'text/markdown' });

  const uploadContext: UserFeedbackUploadContext = {
    fileContent: feedbackContent,
    mimeType: 'text/markdown',
    sizeBytes: blob.size,
    userId: userId,
    description: `User feedback for document ${documentKey}`,
    pathContext: {
      projectId: projectId,
      fileType: FileType.UserFeedback,
      sessionId: sessionId,
      iteration: iterationNumber,
      stageSlug: stageSlug,
      documentKey: documentKey,
      modelSlug: modelId,
      originalFileName: fileName,
    },
    feedbackTypeForDb: feedbackType,
    resourceDescriptionForDb: {
      document_key: documentKey,
      model_id: modelId,
    },
  };

  const { record: fileRecord, error: fileError } = await fileManager
    .uploadAndRegisterFile(uploadContext);

  if (fileError || !fileRecord) {
    logger.error(
      `Failed to upload feedback for session ${sessionId}, doc ${documentKey}: ${fileError?.message}`,
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
