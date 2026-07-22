import {
  isLoggerShape,
  isRecord,
} from "../../../utils/type-guards/type_guards.common.ts";
import type {
  DownloadedChunkText,
  MergeChunkContentDeps,
  MergeChunkContentErrorReturn,
  MergeChunkContentParams,
  MergeChunkContentPayload,
  MergeChunkContentSuccessReturn,
} from "./mergeChunkContent.interface.ts";

export function isDownloadedChunkText(
  value: unknown,
): value is DownloadedChunkText {
  if (!isRecord(value)) {
    return false;
  }
  if (!("chunkId" in value) || typeof value.chunkId !== "string") {
    return false;
  }
  if (!("text" in value) || typeof value.text !== "string") {
    return false;
  }
  if (!("rawJsonPath" in value) || typeof value.rawJsonPath !== "string") {
    return false;
  }
  return true;
}

export function isMergeChunkContentDeps(
  value: unknown,
): value is MergeChunkContentDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !("downloadFromStorage" in value) ||
    typeof value.downloadFromStorage !== "function"
  ) {
    return false;
  }
  if (!("logger" in value) || !isLoggerShape(value.logger)) {
    return false;
  }
  if (
    !("sanitizeJsonContent" in value) ||
    typeof value.sanitizeJsonContent !== "function"
  ) {
    return false;
  }
  return true;
}

export function isMergeChunkContentParams(
  value: unknown,
): value is MergeChunkContentParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value)) {
    return false;
  }
  return isRecord(value.dbClient);
}

export function isMergeChunkContentPayload(
  value: unknown,
): value is MergeChunkContentPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("orderedChunks" in value) || !Array.isArray(value.orderedChunks)) {
    return false;
  }
  if (value.orderedChunks.length === 0) {
    return false;
  }
  return true;
}

export function isMergeChunkContentSuccessReturn(
  value: unknown,
): value is MergeChunkContentSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value) {
    return false;
  }
  if (
    !("mergedStructuredData" in value) ||
    !isRecord(value.mergedStructuredData)
  ) {
    return false;
  }
  return true;
}

export function isMergeChunkContentErrorReturn(
  value: unknown,
): value is MergeChunkContentErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("mergedStructuredData" in value) {
    return false;
  }
  if (!("error" in value) || !("retriable" in value)) {
    return false;
  }
  if (!(value.error instanceof Error)) {
    return false;
  }
  return typeof value.retriable === "boolean";
}
