import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Tables } from '../../types_db.ts';
import type {
  ChatApiRequest,
  GetAiProviderAdapterFn,
  ILogger,
} from '../../_shared/types.ts';
import type { IFileManager } from '../../_shared/types/file_manager.types.ts';
import type { ITokenWalletService } from '../../_shared/types/tokenWallet.types.ts';
import type { NotificationServiceType } from '../../_shared/types/notification.service.types.ts';
import type { DebitTokens } from '../../_shared/utils/debitTokens.interface.ts';
import type {
  DialecticContributionRow,
  DialecticJobRow,
  DialecticSessionRow,
} from '../../dialectic-service/dialectic.interface.ts';
import type {
  BuildUploadContextFn,
  ContinueJobFn,
  DetermineContinuationFn,
  IsIntermediateChunkFn,
  ResolveFinishReasonFn,
  RetryJobFn,
} from '../createJobContext/JobContext.interface.ts';

export interface ExecuteModelCallAndSaveDeps {
  logger: ILogger;
  fileManager: IFileManager;
  getAiProviderAdapter: GetAiProviderAdapterFn;
  tokenWalletService: ITokenWalletService;
  notificationService: NotificationServiceType;
  continueJob: ContinueJobFn;
  retryJob: RetryJobFn;
  resolveFinishReason: ResolveFinishReasonFn;
  isIntermediateChunk: IsIntermediateChunkFn;
  determineContinuation: DetermineContinuationFn;
  buildUploadContext: BuildUploadContextFn;
  debitTokens: DebitTokens;
}

export interface ExecuteModelCallAndSaveParams {
  dbClient: SupabaseClient<Database>;
  job: DialecticJobRow;
  providerRow: Tables<'ai_providers'>;
  userAuthToken: string;
  sessionData: DialecticSessionRow;
  projectOwnerUserId: string;
  stageSlug: string;
  iterationNumber: number;
  projectId: string;
  sessionId: string;
  model_id: string;
  walletId: string;
  output_type: string;
  sourcePromptResourceId: string;
}

export interface ExecuteModelCallAndSavePayload {
  chatApiRequest: ChatApiRequest;
  preflightInputTokens: number;
}

export type ExecuteModelCallAndSaveSuccessReturn = {
  contribution: DialecticContributionRow;
  needsContinuation: boolean;
  stageRelationshipForStage: string | undefined;
  documentKey: string | undefined;
  fileType: string;
  storageFileType: string;
};

export type ExecuteModelCallAndSaveErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type ExecuteModelCallAndSaveReturn =
  | ExecuteModelCallAndSaveSuccessReturn
  | ExecuteModelCallAndSaveErrorReturn;

export type ExecuteModelCallAndSaveFn = (
  deps: ExecuteModelCallAndSaveDeps,
  params: ExecuteModelCallAndSaveParams,
  payload: ExecuteModelCallAndSavePayload,
) => Promise<ExecuteModelCallAndSaveReturn>;

export type BoundExecuteModelCallAndSaveFn = (
  params: ExecuteModelCallAndSaveParams,
  payload: ExecuteModelCallAndSavePayload,
) => Promise<ExecuteModelCallAndSaveReturn>;

