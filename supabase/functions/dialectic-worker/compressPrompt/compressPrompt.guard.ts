// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.guard.ts

import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptSuccessReturn,
} from "./compressPrompt.interface.ts";

export function isCompressPromptDeps(value: unknown): value is CompressPromptDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!("logger" in value) || !isRecord(value.logger)) {
    return false;
  }
  if (!("ragService" in value) || !isRecord(value.ragService)) {
    return false;
  }
  if (!("embeddingClient" in value) || !isRecord(value.embeddingClient)) {
    return false;
  }
  if (!("tokenWalletService" in value) || !isRecord(value.tokenWalletService)) {
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
  if (!("jobId" in value) || typeof value.jobId !== "string") {
    return false;
  }
  if (!("projectOwnerUserId" in value) || typeof value.projectOwnerUserId !== "string") {
    return false;
  }
  if (!("sessionId" in value) || typeof value.sessionId !== "string") {
    return false;
  }
  if (!("stageSlug" in value) || typeof value.stageSlug !== "string") {
    return false;
  }
  if (!("walletId" in value) || typeof value.walletId !== "string") {
    return false;
  }
  if (!("extendedModelConfig" in value) || !isRecord(value.extendedModelConfig)) {
    return false;
  }
  if (!("inputsRelevance" in value) || !Array.isArray(value.inputsRelevance)) {
    return false;
  }
  if (!("inputRate" in value) || typeof value.inputRate !== "number") {
    return false;
  }
  if (!("outputRate" in value) || typeof value.outputRate !== "number") {
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
  if (!("compressionStrategy" in value) || typeof value.compressionStrategy !== "function") {
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
  if (!("chatApiRequest" in value) || !isRecord(value.chatApiRequest)) {
    return false;
  }
  if (!("tokenizerDeps" in value) || !isRecord(value.tokenizerDeps)) {
    return false;
  }
  return true;
}

export function isCompressPromptSuccessReturn(
  value: unknown,
): value is CompressPromptSuccessReturn {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value || "retriable" in value) {
    return false;
  }
  if (!("chatApiRequest" in value) || !isRecord(value.chatApiRequest)) {
    return false;
  }
  if (!("resolvedInputTokenCount" in value) || typeof value.resolvedInputTokenCount !== "number") {
    return false;
  }
  if (!("resourceDocuments" in value) || !Array.isArray(value.resourceDocuments)) {
    return false;
  }
  return true;
}

export function isCompressPromptErrorReturn(
  value: unknown,
): value is CompressPromptErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value) || !(value.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in value) || typeof value.retriable !== "boolean") {
    return false;
  }
  if ("chatApiRequest" in value || "resolvedInputTokenCount" in value || "resourceDocuments" in value) {
    return false;
  }
  return true;
}

export function isBoundCompressPromptFn(value: unknown): value is BoundCompressPromptFn {
  return typeof value === "function";
}
