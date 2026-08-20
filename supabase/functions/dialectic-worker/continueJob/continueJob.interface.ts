import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger } from "../../_shared/types.ts";
import type {
  DialecticContributionRow,
  DialecticJobRow,
  DialecticProjectResourceRow,
} from "../../dialectic-service/dialectic.interface.ts";

export interface ContinueJobDeps {
  logger: ILogger;
}

export interface ContinueJobParams {
  dbClient: SupabaseClient<Database>;
  projectOwnerUserId: string;
}

export interface ContinueJobPayload {
  job: DialecticJobRow;
  savedOutput: DialecticContributionRow | DialecticProjectResourceRow;
}

export interface ContinueJobEnqueuedReturn {
  enqueued: true;
}

export interface ContinueJobLimitReachedReturn {
  enqueued: false;
  reason: "continuation_limit_reached";
}

export interface ContinueJobErrorReturn {
  error: Error;
  retriable: boolean;
}

export type ContinueJobSuccessReturn =
  | ContinueJobEnqueuedReturn
  | ContinueJobLimitReachedReturn;

export type ContinueJobReturn =
  | ContinueJobSuccessReturn
  | ContinueJobErrorReturn;

export type ContinueJobFn = (
  deps: ContinueJobDeps,
  params: ContinueJobParams,
  payload: ContinueJobPayload,
) => Promise<ContinueJobReturn>;

export type BoundContinueJobFn = (params: ContinueJobParams, payload: ContinueJobPayload) => Promise<ContinueJobReturn>;

export class ContinueJobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContinueJobValidationError";
  }
}

export class ContinueJobEnqueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContinueJobEnqueueError";
  }
}
