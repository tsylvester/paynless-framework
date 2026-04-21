import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Tables } from '../../types_db.ts';
import type { ILogger } from '../../_shared/types.ts';
import type { IUserTokenWalletService } from '../../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts';
import type { ICompressionStrategy } from '../../_shared/utils/vector_utils.interface.ts';
import type {
  DialecticJobRow,
  DialecticSessionRow,
  InputRule,
  PromptConstructionPayload,
  RelevanceRule,
} from '../../dialectic-service/dialectic.interface.ts';
import type {
  ApplyInputsRequiredScopeFn,
  ValidateWalletBalanceFn,
  ValidateModelCostRatesFn,
} from '../createJobContext/JobContext.interface.ts';
import type { BoundCalculateAffordabilityFn } from '../calculateAffordability/calculateAffordability.interface.ts';
import type { BoundEnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.interface.ts';

export interface PrepareModelJobDeps {
  logger: ILogger;
  applyInputsRequiredScope: ApplyInputsRequiredScopeFn;
  tokenWalletService: IUserTokenWalletService;
  validateWalletBalance: ValidateWalletBalanceFn;
  validateModelCostRates: ValidateModelCostRatesFn;
  calculateAffordability: BoundCalculateAffordabilityFn;
  enqueueModelCall: BoundEnqueueModelCallFn;
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
  queued: true;
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
