import {
  isRecord,
  isLoggerShape,
  isSupabaseClientShape,
} from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  isMessages,
} from "../../_shared/utils/type-guards/type_guards.chat.ts";
import {
  isFileType,
  isDialecticStageSlug,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isResourceDocument } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.guard.ts';
import type {
  ApplyCompressionOverlayDeps,
  ApplyCompressionOverlayParams,
  ApplyCompressionOverlayPayload,
  ApplyCompressionOverlaySuccessReturn,
  ApplyCompressionOverlayErrorReturn,
} from "./applyCompressionOverlay.interface.ts";

export function isApplyCompressionOverlayDeps(
  value: unknown,
): value is ApplyCompressionOverlayDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!("logger" in value) || !isLoggerShape(value.logger)) {
    return false;
  }
  if (
    !("downloadFromStorage" in value) ||
    typeof value.downloadFromStorage !== "function"
  ) {
    return false;
  }
  return true;
}

export function isApplyCompressionOverlayParams(
  value: unknown,
): value is ApplyCompressionOverlayParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value) || !isSupabaseClientShape(value.dbClient)) {
    return false;
  }
  if (!("projectId" in value) || typeof value.projectId !== "string" || value.projectId === "") {
    return false;
  }
  if (!("sessionId" in value) || typeof value.sessionId !== "string" || value.sessionId === "") {
    return false;
  }
  if (!("iterationNumber" in value) || typeof value.iterationNumber !== "number") {
    return false;
  }
  if (!("stageSlug" in value) || !isDialecticStageSlug(value.stageSlug)) {
    return false;
  }
  if (!("output_type" in value) || !isFileType(value.output_type)) {
    return false;
  }
  return true;
}

export function isApplyCompressionOverlayPayload(
  value: unknown,
): value is ApplyCompressionOverlayPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("resourceDocuments" in value) || !Array.isArray(value.resourceDocuments)) {
    return false;
  }
  if (!value.resourceDocuments.every(isResourceDocument)) {
    return false;
  }
  if (!("conversationHistory" in value) || !Array.isArray(value.conversationHistory)) {
    return false;
  }
  if (!value.conversationHistory.every(isMessages)) {
    return false;
  }
  return true;
}

export function isApplyCompressionOverlaySuccessReturn(
  value: unknown,
): value is ApplyCompressionOverlaySuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("resourceDocuments" in value) || !Array.isArray(value.resourceDocuments)) {
    return false;
  }
  if (!("conversationHistory" in value) || !Array.isArray(value.conversationHistory)) {
    return false;
  }
  if (!("overlaidCount" in value) || typeof value.overlaidCount !== "number") {
    return false;
  }
  if ("error" in value || "retriable" in value) {
    return false;
  }
  return true;
}

export function isApplyCompressionOverlayErrorReturn(
  value: unknown,
): value is ApplyCompressionOverlayErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value) || !(value.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in value) || typeof value.retriable !== "boolean") {
    return false;
  }
  if ("resourceDocuments" in value || "conversationHistory" in value || "overlaidCount" in value) {
    return false;
  }
  return true;
}
