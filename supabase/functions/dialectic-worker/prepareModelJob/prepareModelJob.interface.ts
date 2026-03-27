import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Tables } from '../../types_db.ts';
import type { ILogger } from '../../_shared/types.ts';
import type { DownloadFromStorageFn } from '../../_shared/supabase_storage_utils.ts';
import type { CountTokensFn } from '../../_shared/types/tokenizer.types.ts';
import type { ITokenWalletService } from '../../_shared/types/tokenWallet.types.ts';
import type { IRagService } from '../../_shared/services/rag_service.interface.ts';
import type { IEmbeddingClient } from '../../_shared/services/indexing_service.interface.ts';
import type { ICompressionStrategy } from '../../_shared/utils/vector_utils.interface.ts';
import type {
  DialecticContributionRow,
  DialecticJobRow,
  DialecticSessionRow,
  InputRule,
  PromptConstructionPayload,
  RelevanceRule,
} from '../../dialectic-service/dialectic.interface.ts';
import type {
  PickLatestFn,
  ApplyInputsRequiredScopeFn,
  ValidateWalletBalanceFn,
  ValidateModelCostRatesFn,
} from '../JobContext.interface.ts';
import type { BoundExecuteModelCallAndSaveFn } from '../executeModelCallAndSave/executeModelCallAndSave.interface.ts';
import type { BoundEnqueueRenderJobFn } from '../enqueueRenderJob/enqueueRenderJob.interface.ts';

export interface PrepareModelJobDeps {
  logger: ILogger;
  pickLatest: PickLatestFn;
  downloadFromStorage: DownloadFromStorageFn;
  applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
  countTokens: CountTokensFn;
  tokenWalletService: ITokenWalletService;
  validateWalletBalance: ValidateWalletBalanceFn;
  validateModelCostRates: ValidateModelCostRatesFn;
  ragService: IRagService;
  embeddingClient: IEmbeddingClient;
  executeModelCallAndSave: BoundExecuteModelCallAndSaveFn;
  enqueueRenderJob: BoundEnqueueRenderJobFn;
}

export interface PrepareModelJobParams {
  dbClient: SupabaseClient<Database>;
  authToken: string;
  job: DialecticJobRow;
  projectOwnerUserId: string;
  providerRow: Tables<'ai_providers'>;
  sessionData: DialecticSessionRow;
}

export interface PrepareModelJobPayload {
  promptConstructionPayload: PromptConstructionPayload;
  compressionStrategy: ICompressionStrategy;
  inputsRelevance?: RelevanceRule[];
  inputsRequired?: InputRule[];
}

export type PrepareModelJobSuccessReturn = {
  contribution: DialecticContributionRow;
  needsContinuation: boolean;
  renderJobId: string | null;
};

export type PrepareModelJobErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type PrepareModelJobReturn =
  | PrepareModelJobSuccessReturn
  | PrepareModelJobErrorReturn;

export type PrepareModelJobFn = (
  deps: PrepareModelJobDeps,
  params: PrepareModelJobParams,
  payload: PrepareModelJobPayload,
) => Promise<PrepareModelJobReturn>;

/**
 * Thrown by callers when prepareModelJob returns an error-shaped result.
 * Preserves retriable so processSimpleJob can fail fast without entering the retry loop.
 */
export class PrepareModelJobExecutionError extends Error {
  readonly retriable: boolean;
  readonly causeError: Error;

  constructor(message: string, retriable: boolean, causeError: Error) {
    super(message);
    this.name = 'PrepareModelJobExecutionError';
    this.retriable = retriable;
    this.causeError = causeError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
