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
import { isDialecticBaseJobPayload, dialecticBaseJobPayloadAllowedKeys, isDialecticJobRow } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import {
  CompressJobEnqueueError,
  CompressJobValidationError,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsSuccessReturn,
  enqueueCompressJobsVictim,
  CompressJobValidationErrorConstructorParams,
  CompressJobEnqueueErrorConstructorParams,
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
  if (!('output_type' in value) || !isModelContributionFileType(value.output_type)) throw new Error('Missing or invalid output_type.');
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
    'output_type', 'mode', 'content', 'sourceType', 'sourceId', 'role',
    'documentKey', 'docType', 'sourceStageSlug', 'chunk_index', 'chunk_total',
  ]);

  const unknownKeys = Object.keys(value).filter(key => !allowedKeys.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(`Payload contains unknown properties: ${unknownKeys.join(', ')}`);
  }

  return true;
}

export function isenqueueCompressJobsVictim(value: unknown): value is enqueueCompressJobsVictim {
  if (!isRecord(value)) {
    return false;
  }
  if (!("mode" in value) || !("content" in value) || !("sourceType" in value)) {
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

  return true;
}

export function isenqueueCompressJobsPayload(value: unknown): value is enqueueCompressJobsPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("victim" in value) || !isenqueueCompressJobsVictim(value.victim)) {
    return false;
  }
  if (!("parentJob" in value) || !isDialecticJobRow(value.parentJob)) {
    return false;
  }
  if (!("modelConfig" in value) || !isAiModelExtendedConfig(value.modelConfig)) {
    return false;
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
  if (!("dbClient" in value) || !isSupabaseClientShape(value.dbClient)) {
    return false;
  }
  return true;
}

export function isCompressJobValidationErrorConstructorParams(value: unknown): value is CompressJobValidationErrorConstructorParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("message" in value) || !isNonEmptyString(value.message)) {
    return false;
  }
  return true;
}

export function isCompressJobValidationError(value: unknown): value is CompressJobValidationError {
  return value instanceof CompressJobValidationError;
}

export function isCompressJobEnqueueErrorConstructorParams(value: unknown): value is CompressJobEnqueueErrorConstructorParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("message" in value) || !isNonEmptyString(value.message)) {
    return false;
  }
  return true;
}

export function isCompressJobEnqueueError(value: unknown): value is CompressJobEnqueueError {
  return value instanceof CompressJobEnqueueError;
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
