import type {
  PrepareResponseContentDeps,
  PrepareResponseContentParams,
  PrepareResponseContentPayload,
  PrepareResponseContentRetryRequiredReturn,
  PrepareResponseContentPreparedReturn,
  PrepareResponseContentErrorReturn,
} from "./prepareResponseContent.interface.ts";
import {
  PrepareResponseContentSanitizeError,
  PrepareResponseContentContinuationError,
} from "./prepareResponseContent.interface.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  isUnifiedAIResponse,
  isContextForDocument,
  isContentToInclude,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isFinishReason } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isCompressionMode } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";

export function isPrepareResponseContentDeps(
  value: unknown,
): value is PrepareResponseContentDeps {
  if (!isRecord(value)) return false;
  if (!isRecord(value.logger)) return false;
  if (typeof value.resolveFinishReason !== "function") return false;
  if (typeof value.isIntermediateChunk !== "function") return false;
  if (typeof value.sanitizeJsonContent !== "function") return false;
  if (typeof value.determineContinuation !== "function") return false;
  return true;
}

export function isPrepareResponseContentParams(
  value: unknown,
): value is PrepareResponseContentParams {
  if (!isRecord(value)) return false;
  if (typeof value.jobId !== "string") return false;
  if (value.jobId.trim() === "") return false;
  if (value.mode !== undefined && !isCompressionMode(value.mode)) return false;
  if (typeof value.continueUntilComplete !== "boolean") return false;
  if (
    value.documentKey !== undefined &&
    value.documentKey !== null &&
    typeof value.documentKey !== "string"
  ) {
    return false;
  }
  if (value.contextForDocuments !== undefined) {
    if (!Array.isArray(value.contextForDocuments)) return false;
    for (const doc of value.contextForDocuments) {
      if (!isContextForDocument(doc)) return false;
    }
  }
  if (value.sourceObject !== undefined) {
    if (!isContentToInclude(value.sourceObject)) return false;
  }
  return true;
}

export function isPrepareResponseContentPayload(
  value: unknown,
): value is PrepareResponseContentPayload {
  if (!isRecord(value)) return false;
  if (!isUnifiedAIResponse(value.aiResponse)) return false;
  return true;
}

export function isPrepareResponseContentRetryRequiredReturn(
  value: unknown,
): value is PrepareResponseContentRetryRequiredReturn {
  if (!isRecord(value)) return false;
  if (value.retryRequired !== true) return false;
  if (typeof value.reason !== "string") return false;
  if (value.reason === "") return false;
  return true;
}

export function isPrepareResponseContentPreparedReturn(
  value: unknown,
): value is PrepareResponseContentPreparedReturn {
  if (!isRecord(value)) return false;
  if (value.retryRequired !== false) return false;
  if (typeof value.contentForStorage !== "string") return false;
  if (typeof value.shouldContinue !== "boolean") return false;
  if (!isFinishReason(value.resolvedFinishReason)) return false;
  if (typeof value.needsContinuation !== "boolean") return false;
  if (typeof value.isIntermediate !== "boolean") return false;
  return true;
}

export function isPrepareResponseContentErrorReturn(
  value: unknown,
): value is PrepareResponseContentErrorReturn {
  if (!isRecord(value)) return false;
  if (
    !(value.error instanceof PrepareResponseContentSanitizeError) &&
    !(value.error instanceof PrepareResponseContentContinuationError)
  ) {
    return false;
  }
  if (typeof value.retriable !== "boolean") return false;
  return true;
}

export function isPrepareResponseContentSanitizeError(
  value: unknown,
): value is PrepareResponseContentSanitizeError {
  return value instanceof PrepareResponseContentSanitizeError;
}

export function isPrepareResponseContentContinuationError(
  value: unknown,
): value is PrepareResponseContentContinuationError {
  return value instanceof PrepareResponseContentContinuationError;
}
