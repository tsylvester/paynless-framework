import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  isDialecticJobRow,
  isFailedAttemptError,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import {
  RetryJobDeps,
  RetryJobParams,
  RetryJobPayload,
  RetryJobNotifiedReturn,
  RetryJobNotificationFailedReturn,
  RetryJobErrorReturn,
  RetryJobUpdateError,
  RetryJobNotificationError,
} from "./retryJob.interface.ts";

export function isRetryJobDeps(value: unknown): value is RetryJobDeps {
  if (!isRecord(value)) return false;
  if (!isRecord(value.logger)) return false;
  if (!isRecord(value.notificationService)) return false;
  if (typeof value.notificationService.sendContributionRetryingEvent !== "function") return false;
  return true;
}

export function isRetryJobParams(value: unknown): value is RetryJobParams {
  if (!isRecord(value)) return false;
  if (!isRecord(value.dbClient)) return false;
  if (!isDialecticJobRow(value.job)) return false;
  if (typeof value.job.attempt_count !== "number" || !Number.isFinite(value.job.attempt_count) || value.job.attempt_count < 0) return false;
  if (typeof value.job.user_id !== "string" || value.job.user_id.trim().length === 0) return false;
  return true;
}

export function isRetryJobPayload(value: unknown): value is RetryJobPayload {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.failedAttempts)) return false;
  if (value.failedAttempts.length === 0) return false;
  if (!value.failedAttempts.every(isFailedAttemptError)) return false;
  return true;
}

export function isRetryJobNotifiedReturn(value: unknown): value is RetryJobNotifiedReturn {
  if (!isRecord(value)) return false;
  if (value.notified !== true) return false;
  return true;
}

export function isRetryJobNotificationFailedReturn(value: unknown): value is RetryJobNotificationFailedReturn {
  if (!isRecord(value)) return false;
  if (value.notified !== false) return false;
  if (!(value.notificationError instanceof Error)) return false;
  return true;
}

export function isRetryJobErrorReturn(value: unknown): value is RetryJobErrorReturn {
  if (!isRecord(value)) return false;
  if (!isRetryJobUpdateError(value.error)) return false;
  if (typeof value.retriable !== "boolean") return false;
  return true;
}

export function isRetryJobUpdateError(value: unknown): value is RetryJobUpdateError {
  return value instanceof RetryJobUpdateError;
}

export function isRetryJobNotificationError(value: unknown): value is RetryJobNotificationError {
  return value instanceof RetryJobNotificationError;
}
