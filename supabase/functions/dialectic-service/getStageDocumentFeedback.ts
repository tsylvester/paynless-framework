import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { downloadFromStorage } from '../_shared/supabase_storage_utils.ts';
import type { ILogger } from '../_shared/types.ts';
import type {
  DialecticFeedbackRow,
  DialecticServiceResponse,
  GetStageDocumentFeedbackPayload,
  GetStageDocumentFeedbackResponse,
  StageDocumentFeedback,
  GetStageDocumentFeedbackDeps,
} from './dialectic.interface.ts';

export async function getStageDocumentFeedback(
  payload: GetStageDocumentFeedbackPayload,
  dbClient: SupabaseClient<Database>,
  deps: GetStageDocumentFeedbackDeps,
): Promise<DialecticServiceResponse<GetStageDocumentFeedbackResponse>> {
  const { sessionId, stageSlug, iterationNumber, modelId, documentKey } =
    payload;

  if (
    !sessionId ||
    !stageSlug ||
    iterationNumber === undefined ||
    !modelId ||
    documentKey === undefined
  ) {
    deps.logger.warn('getStageDocumentFeedback: missing required payload fields.', {
      sessionId,
      stageSlug,
      iterationNumber,
      modelId,
      documentKey,
    });
    return {
      error: {
        message: 'Missing required fields: sessionId, stageSlug, iterationNumber, modelId, documentKey.',
        status: 400,
      },
    };
  }

  deps.logger.info('getStageDocumentFeedback: fetching feedback for logical doc.', {
    sessionId,
    stageSlug,
    iterationNumber,
    modelId,
    documentKey,
  });

  const { data: row, error: queryError } = await dbClient
    .from('dialectic_feedback')
    .select('*')
    .eq('session_id', sessionId)
    .eq('stage_slug', stageSlug)
    .eq('iteration_number', iterationNumber)
    .filter('resource_description->>document_key', 'eq', documentKey)
    .filter('resource_description->>model_id', 'eq', modelId)
    .maybeSingle();

  if (queryError) {
    deps.logger.warn('getStageDocumentFeedback: DB query failed.', {
      error: queryError.message,
      sessionId,
      stageSlug,
    });
    return {
      error: {
        message: 'Failed to fetch feedback record.',
        details: queryError.message,
        status: 500,
      },
    };
  }

  if (row === null) {
    deps.logger.info('getStageDocumentFeedback: no feedback found for logical doc.', {
      sessionId,
      stageSlug,
      documentKey,
    });
    return { data: [] };
  }

  const feedbackRow: DialecticFeedbackRow = row;
  const bucket: string = feedbackRow.storage_bucket;
  const storagePath: string = feedbackRow.storage_path;
  const fileName: string = feedbackRow.file_name;

  if (!bucket || !storagePath || !fileName) {
    deps.logger.warn('getStageDocumentFeedback: feedback row missing storage fields.', {
      id: feedbackRow.id,
    });
    return {
      error: {
        message: 'Feedback record has incomplete storage information.',
        status: 500,
      },
    };
  }

  const fullPath: string = `${storagePath}/${fileName}`;

  const { data: arrayBuffer, error: downloadError } = await downloadFromStorage(
    dbClient,
    bucket,
    fullPath,
  );

  if (downloadError) {
    deps.logger.warn('getStageDocumentFeedback: storage download failed.', {
      error: downloadError.message,
      bucket,
      fullPath,
    });
    return {
      error: {
        message: 'Failed to download feedback content.',
        details: downloadError.message,
        status: 500,
      },
    };
  }

  if (arrayBuffer === null) {
    deps.logger.warn('getStageDocumentFeedback: storage returned no data.', {
      bucket,
      fullPath,
    });
    return {
      error: {
        message: 'Feedback content not found in storage.',
        status: 500,
      },
    };
  }

  const content: string = new TextDecoder().decode(arrayBuffer);

  const item: StageDocumentFeedback = {
    id: feedbackRow.id,
    content,
    createdAt: feedbackRow.created_at,
  };

  return { data: [item] };
}
