// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.guard.ts

import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticJobRow } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptFitsReturn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptPendingReturn,
} from "./compressPrompt.interface.ts";

export function isCompressPromptDeps(value: unknown): value is CompressPromptDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!("logger" in value) || !isRecord(value.logger)) {
    return false;
  }
  if (!("getSortedCompressionCandidates" in value) || typeof value.getSortedCompressionCandidates !== "function") {
    return false;
  }
  if (!("enqueueCompressJobs" in value) || typeof value.enqueueCompressJobs !== "function") {
    return false;
  }
  if (!("resolveCompressionSource" in value) || typeof value.resolveCompressionSource !== "function") {
    return false;
  }
  if (!("constructStoragePath" in value) || typeof value.constructStoragePath !== "function") {
    return false;
  }
  if (!("downloadFromStorage" in value) || typeof value.downloadFromStorage !== "function") {
    return false;
  }
  if (!("countTokens" in value) || typeof value.countTokens !== "function") {
    return false;
  }
  return true;
}

export function isCompressPromptParams(value: unknown): value is CompressPromptParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("dbClient" in value) || !isRecord(value.dbClient)) {
    return false;
  }
  if (!("isContinuationFlowInitial" in value) || typeof value.isContinuationFlowInitial !== "boolean") {
    return false;
  }
  if (!("finalTargetThreshold" in value) || typeof value.finalTargetThreshold !== "number") {
    return false;
  }
  if (!("balanceAfterCompression" in value) || typeof value.balanceAfterCompression !== "number") {
    return false;
  }
  if (!("walletBalance" in value) || typeof value.walletBalance !== "number") {
    return false;
  }
  return true;
}

export function isCompressPromptPayload(value: unknown): value is CompressPromptPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("parentJob" in value) || !isDialecticJobRow(value.parentJob)) {
    return false;
  }
  if (!("extendedModelConfig" in value) || !isAiModelExtendedConfig(value.extendedModelConfig)) {
    return false;
  }
  if (!("inputsRelevance" in value) || !Array.isArray(value.inputsRelevance)) {
    return false;
  }
  if (!("resourceDocuments" in value) || !Array.isArray(value.resourceDocuments)) {
    return false;
  }
  if (!("conversationHistory" in value) || !Array.isArray(value.conversationHistory)) {
    return false;
  }
  if (!("currentUserPrompt" in value) || typeof value.currentUserPrompt !== "string") {
    return false;
  }
  return true;
}

export function isCompressPromptFitsReturn(value: unknown): value is CompressPromptFitsReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value || "retriable" in value) {
    return false;
  }
  if (!("fits" in value) || value.fits !== true) {
    return false;
  }
  if (!("resourceDocuments" in value) || !Array.isArray(value.resourceDocuments)) {
    return false;
  }
  if (!("conversationHistory" in value) || !Array.isArray(value.conversationHistory)) {
    return false;
  }
  if (!("resolvedInputTokenCount" in value) || typeof value.resolvedInputTokenCount !== "number") {
    return false;
  }
  return true;
}

export function isCompressPromptPendingReturn(value: unknown): value is CompressPromptPendingReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("resourceDocuments" in value || "conversationHistory" in value || "resolvedInputTokenCount" in value || "error" in value || "retriable" in value) {
    return false;
  }
  if (!("fits" in value) || value.fits !== false) {
    return false;
  }
  return true;
}

export function isCompressPromptErrorReturn(value: unknown): value is CompressPromptErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value) || !(value.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in value) || typeof value.retriable !== "boolean") {
    return false;
  }
  if ("fits" in value || "resourceDocuments" in value || "conversationHistory" in value || "resolvedInputTokenCount" in value) {
    return false;
  }
  return true;
}

export function isBoundCompressPromptFn(value: unknown): value is BoundCompressPromptFn {
  return typeof value === "function";
}
