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
import { isDialecticBaseJobPayload, dialecticBaseJobPayloadAllowedKeys } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
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
    throw new Error('Payload must be a non-null object.');
  }

  // Base Payload Checks (delegated — does not catch)
  isDialecticBaseJobPayload(value);

  // Narrowing checks: required where the base leaves optional
  if (!('stageSlug' in value) || !isDialecticStageSlug(value.stageSlug)) throw new Error('Missing or invalid stageSlug.');
  if (!('iterationNumber' in value) || !isNonNegativeInteger(value.iterationNumber)) throw new Error('Missing or invalid iterationNumber.');
  if (!('model_slug' in value) || !isNonEmptyString(value.model_slug)) throw new Error('Missing or invalid model_slug.');

  // Arm-specific required members
  if (!('targetKey' in value) || !isModelContributionFileType(value.targetKey)) throw new Error('Missing or invalid targetKey.');
  if (!('mode' in value) || !isCompressionMode(value.mode)) throw new Error('Missing or invalid mode.');
  if (!('content' in value) || !isNonEmptyString(value.content)) throw new Error('Missing or invalid content.');
  if (!('sourceType' in value) || !isCompressionSourceType(value.sourceType)) throw new Error('Missing or invalid sourceType.');

  // Per-sourceType identity members
  if (value.sourceType === 'contribution' || value.sourceType === 'resource' || value.sourceType === 'feedback') {
    if (!('documentKey' in value) || !isFileType(value.documentKey)) throw new Error('Missing or invalid documentKey.');
  } else if (value.sourceType === 'history') {
    if (!('sourceId' in value) || !isNonEmptyString(value.sourceId)) throw new Error('Missing or invalid sourceId.');
    if (!('role' in value) || !isCompressionHistoryRole(value.role)) throw new Error('Missing or invalid role.');
  }

  // Json-mode trio
  if (value.mode === 'json') {
    if (!('documentKey' in value) || !isFileType(value.documentKey)) throw new Error('Missing or invalid documentKey.');
    if (!('docType' in value) || !isModelContributionFileType(value.docType)) throw new Error('Missing or invalid docType.');
    if (!('sourceStageSlug' in value) || !isDialecticStageSlug(value.sourceStageSlug)) throw new Error('Missing or invalid sourceStageSlug.');
  }

  // Optional arm members
  if ('documentKey' in value && value.documentKey !== undefined && !isFileType(value.documentKey)) throw new Error('Invalid documentKey.');
  if ('docType' in value && value.docType !== undefined && !isModelContributionFileType(value.docType)) throw new Error('Invalid docType.');
  if ('sourceStageSlug' in value && value.sourceStageSlug !== undefined && !isDialecticStageSlug(value.sourceStageSlug)) throw new Error('Invalid sourceStageSlug.');
  if ('chunk_index' in value && value.chunk_index !== undefined && !isNonNegativeInteger(value.chunk_index)) throw new Error('Invalid chunk_index.');
  if ('chunk_total' in value && value.chunk_total !== undefined && !isNonNegativeInteger(value.chunk_total)) throw new Error('Invalid chunk_total.');

  // Final check for extraneous properties to enforce a strict shape.
  const allowedKeys = new Set<string>([
    ...dialecticBaseJobPayloadAllowedKeys,
    'targetKey', 'mode', 'content', 'sourceType', 'sourceId', 'role',
    'documentKey', 'docType', 'sourceStageSlug', 'chunk_index', 'chunk_total',
  ]);

  const unknownKeys = Object.keys(value).filter(key => !allowedKeys.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(`Payload contains unknown properties: ${unknownKeys.join(', ')}`);
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
    "userJwt",
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
  if (!isNonEmptyString(value.userJwt)) {
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
