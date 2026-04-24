import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { ILogger } from '../../_shared/types.ts';
import type { IFileManager } from '../../_shared/types/file_manager.types.ts';
import type { NotificationServiceType } from '../../_shared/types/notification.service.types.ts';
import type { BoundDebitTokens } from '../../_shared/utils/debitTokens.interface.ts';
import type { SanitizeJsonContentFn } from '../../_shared/utils/jsonSanitizer/jsonSanitizer.interface.ts';
import type {
  BuildUploadContextFn,
  ContinueJobFn,
  DetermineContinuationFn,
  IsIntermediateChunkFn,
  ResolveFinishReasonFn,
  RetryJobFn,
} from '../createJobContext/JobContext.interface.ts';
import type { BoundEnqueueRenderJobFn } from '../enqueueRenderJob/enqueueRenderJob.interface.ts';

export interface NodeTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface SaveResponseParams {
  job_id: string;
  dbClient: SupabaseClient<Database>;
}

export interface SaveResponsePayload {
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
  finish_reason: string | null;
}

export interface SaveResponseRequestBody {
  job_id: string;
  assembled_content: string;
  token_usage: NodeTokenUsage | null;
  finish_reason: string | null;
}

export interface SaveResponseDeps {
  logger: ILogger;
  fileManager: IFileManager;
  notificationService: NotificationServiceType;
  continueJob: ContinueJobFn;
  retryJob: RetryJobFn;
  resolveFinishReason: ResolveFinishReasonFn;
  isIntermediateChunk: IsIntermediateChunkFn;
  determineContinuation: DetermineContinuationFn;
  buildUploadContext: BuildUploadContextFn;
  debitTokens: BoundDebitTokens;
  sanitizeJsonContent: SanitizeJsonContentFn;
  enqueueRenderJob: BoundEnqueueRenderJobFn;
}

export type SaveResponseSuccessReturn = {
  status: 'completed' | 'needs_continuation' | 'continuation_limit_reached';
};

export type SaveResponseErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type SaveResponseReturn = SaveResponseSuccessReturn | SaveResponseErrorReturn;

export type SaveResponseFn = (
  deps: SaveResponseDeps,
  params: SaveResponseParams,
  payload: SaveResponsePayload,
) => Promise<SaveResponseReturn>;
