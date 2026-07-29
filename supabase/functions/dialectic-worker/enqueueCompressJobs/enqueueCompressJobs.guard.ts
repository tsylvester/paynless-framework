import {
  isCompressionHistoryRole,
  isCompressionMode,
  isCompressionSourceType,
  isFileType,
  isModelContributionFileType,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
  isLoggerShape,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isSupabaseClientShape,
} from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticStageSlug } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
  CompressJobEnqueueError,
  CompressJobValidationError,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsSuccessReturn,
  type DialecticCompressJobPayload,
} from "./enqueueCompressJobs.interface.ts";

export function isDialecticCompressJobPayload(value: unknown): value is DialecticCompressJobPayload {
  if (!isRecord(value)) {
    return false;
  }

  const requiredKeys: (keyof DialecticCompressJobPayload)[] = [
    "job_type",
    "sessionId",
    "projectId",
    "stageSlug",
    "targetKey",
    "iterationNumber",
    "model_id",
    "model_slug",
    "mode",
    "content",
    "sourceType",
    "walletId",
    "user_id",
  ];
  for (const key of requiredKeys) {
    if (!(key in value)) {
      return false;
    }
  }

  if (value.job_type !== "COMPRESS") {
    return false;
  }
  if (!isNonEmptyString(value.sessionId)) {
    return false;
  }
  if (!isNonEmptyString(value.projectId)) {
    return false;
  }
  if (!isDialecticStageSlug(value.stageSlug)) {
    return false;
  }
  if (!isModelContributionFileType(value.targetKey)) {
    return false;
  }
  if (!isNonNegativeInteger(value.iterationNumber)) {
    return false;
  }
  if (!isNonEmptyString(value.model_id)) {
    return false;
  }
  if (!isNonEmptyString(value.model_slug)) {
    return false;
  }
  if (!isCompressionMode(value.mode)) {
    return false;
  }
  if (!isNonEmptyString(value.content)) {
    return false;
  }
  if (!isCompressionSourceType(value.sourceType)) {
    return false;
  }
  if (!isNonEmptyString(value.walletId)) {
    return false;
  }
  if (!isNonEmptyString(value.user_id)) {
    return false;
  }

  if (value.sourceType === "contribution" || value.sourceType === "resource" || value.sourceType === "feedback") {
    if (!isFileType(value.documentKey)) {
      return false;
    }
  } else if (value.sourceType === "history") {
    if (!isNonEmptyString(value.sourceId)) {
      return false;
    }
    if (!isCompressionHistoryRole(value.role)) {
      return false;
    }
  }

  if (value.mode === "json") {
    if (
      !isFileType(value.documentKey) ||
      !isModelContributionFileType(value.docType) ||
      !isDialecticStageSlug(value.sourceStageSlug)
    ) {
      return false;
    }
  }

  if (value.chunk_index !== undefined && !isNonNegativeInteger(value.chunk_index)) {
    return false;
  }
  if (value.chunk_total !== undefined && !isNonNegativeInteger(value.chunk_total)) {
    return false;
  }
  if (value.continuation_count !== undefined && !isNonNegativeInteger(value.continuation_count)) {
    return false;
  }

  return true;
}

export function isenqueueCompressJobsPayload(value: unknown): value is enqueueCompressJobsPayload {
  if (!isRecord(value) || !("victim" in value)) {
    return false;
  }
  const victim = value.victim;
  if (!isRecord(victim)) {
    return false;
  }
  if (!("mode" in victim) || !("content" in victim) || !("sourceType" in victim)) {
    return false;
  }
  if (!isCompressionMode(victim.mode)) {
    return false;
  }
  if (!isNonEmptyString(victim.content)) {
    return false;
  }
  if (!isCompressionSourceType(victim.sourceType)) {
    return false;
  }

  if (victim.sourceType === "contribution" || victim.sourceType === "resource" || victim.sourceType === "feedback") {
    if (!isFileType(victim.documentKey)) {
      return false;
    }
  } else if (victim.sourceType === "history") {
    if (!isNonEmptyString(victim.sourceId)) {
      return false;
    }
    if (!isCompressionHistoryRole(victim.role)) {
      return false;
    }
  }

  if (victim.mode === "json") {
    if (
      !isFileType(victim.documentKey) ||
      !isModelContributionFileType(victim.docType) ||
      !isDialecticStageSlug(victim.sourceStageSlug)
    ) {
      return false;
    }
  }

  return true;
}

export function isenqueueCompressJobsDeps(value: unknown): value is enqueueCompressJobsDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !("logger" in value) ||
    !("textSplitter" in value) ||
    !("countTokens" in value) ||
    !("constructStoragePath" in value)
  ) {
    return false;
  }
  if (!isLoggerShape(value.logger)) {
    return false;
  }
  if (!isRecord(value.textSplitter) || typeof value.textSplitter.splitText !== "function") {
    return false;
  }
  if (typeof value.countTokens !== "function") {
    return false;
  }
  if (typeof value.constructStoragePath !== "function") {
    return false;
  }
  return true;
}

export function isenqueueCompressJobsParams(value: unknown): value is enqueueCompressJobsParams {
  if (!isRecord(value)) {
    return false;
  }
  const requiredKeys: (keyof enqueueCompressJobsParams)[] = [
    "dbClient",
    "parentJob",
    "sessionId",
    "projectId",
    "stageSlug",
    "targetKey",
    "iterationNumber",
    "modelId",
    "modelSlug",
    "walletId",
    "modelConfig",
    "tokenizerDeps",
  ];
  for (const key of requiredKeys) {
    if (!(key in value)) {
      return false;
    }
  }

  if (!isSupabaseClientShape(value.dbClient)) {
    return false;
  }

  const parentJob = value.parentJob;
  if (
    !isRecord(parentJob) ||
    !isNonEmptyString(parentJob.id) ||
    !isNonEmptyString(parentJob.user_id) ||
    typeof parentJob.is_test_job !== "boolean"
  ) {
    return false;
  }

  if (!isNonEmptyString(value.sessionId)) {
    return false;
  }
  if (!isNonEmptyString(value.projectId)) {
    return false;
  }
  if (!isDialecticStageSlug(value.stageSlug)) {
    return false;
  }
  if (!isModelContributionFileType(value.targetKey)) {
    return false;
  }
  if (!isNonNegativeInteger(value.iterationNumber)) {
    return false;
  }
  if (!isNonEmptyString(value.modelId)) {
    return false;
  }
  if (!isNonEmptyString(value.modelSlug)) {
    return false;
  }
  if (!isNonEmptyString(value.walletId)) {
    return false;
  }
  if (!isRecord(value.modelConfig)) {
    return false;
  }

  const tokenizerDeps = value.tokenizerDeps;
  if (
    !isRecord(tokenizerDeps) ||
    typeof tokenizerDeps.getEncoding !== "function" ||
    typeof tokenizerDeps.countTokensAnthropic !== "function" ||
    !isRecord(tokenizerDeps.logger) ||
    typeof tokenizerDeps.logger.warn !== "function" ||
    typeof tokenizerDeps.logger.error !== "function"
  ) {
    return false;
  }

  return true;
}

export function isenqueueCompressJobsSuccessReturn(value: unknown): value is enqueueCompressJobsSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("createdCount" in value)) {
    return false;
  }
  if ("error" in value) {
    return false;
  }
  return typeof value.createdCount === "number";
}

export function isenqueueCompressJobsErrorReturn(value: unknown): value is enqueueCompressJobsErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value) || !("retriable" in value)) {
    return false;
  }
  if (typeof value.retriable !== "boolean") {
    return false;
  }
  const err = value.error;
  return err instanceof CompressJobValidationError || err instanceof CompressJobEnqueueError;
}
