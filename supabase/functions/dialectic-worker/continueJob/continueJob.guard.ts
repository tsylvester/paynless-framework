import {
  isLoggerShape,
  isNonEmptyString,
  isRecord,
  isSupabaseClientShape,
} from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  isDialecticContribution,
  isDialecticJobRow,
  isDialecticProjectResourceRow,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import type {
  ContinueJobDeps,
  ContinueJobEnqueuedReturn,
  ContinueJobErrorReturn,
  ContinueJobLimitReachedReturn,
  ContinueJobParams,
  ContinueJobPayload,
  ContinueJobSuccessReturn,
} from "./continueJob.interface.ts";

export function isContinueJobDeps(value: unknown): value is ContinueJobDeps {
  if (!isRecord(value)) return false;
  if (!("logger" in value)) return false;
  if (!isLoggerShape(value.logger)) return false;
  return true;
}

export function isContinueJobParams(value: unknown): value is ContinueJobParams {
  if (!isRecord(value)) return false;
  if (!("dbClient" in value)) return false;
  if (!("projectOwnerUserId" in value)) return false;
  if (!isSupabaseClientShape(value.dbClient)) return false;
  if (!isNonEmptyString(value.projectOwnerUserId)) return false;
  return true;
}

export function isContinueJobPayload(value: unknown): value is ContinueJobPayload {
  if (!isRecord(value)) return false;
  if (!("job" in value)) return false;
  if (!("savedOutput" in value)) return false;
  if (!isDialecticJobRow(value.job)) return false;
  if (!isDialecticContribution(value.savedOutput) && !isDialecticProjectResourceRow(value.savedOutput)) return false;
  return true;
}

export function isContinueJobEnqueuedReturn(value: unknown): value is ContinueJobEnqueuedReturn {
  if (!isRecord(value)) return false;
  if (!("enqueued" in value)) return false;
  if (value.enqueued !== true) return false;
  if ("error" in value) return false;
  return true;
}

export function isContinueJobLimitReachedReturn(value: unknown): value is ContinueJobLimitReachedReturn {
  if (!isRecord(value)) return false;
  if (!("enqueued" in value)) return false;
  if (!("reason" in value)) return false;
  if (value.enqueued !== false) return false;
  if (value.reason !== "continuation_limit_reached") return false;
  return true;
}

export function isContinueJobErrorReturn(value: unknown): value is ContinueJobErrorReturn {
  if (!isRecord(value)) return false;
  if (!("error" in value)) return false;
  if (!("retriable" in value)) return false;
  if ("enqueued" in value) return false;
  if (!(value.error instanceof Error)) return false;
  if (typeof value.retriable !== "boolean") return false;
  return true;
}

export function isContinueJobSuccessReturn(value: unknown): value is ContinueJobSuccessReturn {
  return isContinueJobEnqueuedReturn(value) || isContinueJobLimitReachedReturn(value);
}
