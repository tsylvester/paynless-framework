// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.ts

import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityCompressedReturn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityDirectReturn,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
} from "./calculateAffordability.interface.ts";

export function isCalculateAffordabilityDeps(value: unknown): value is CalculateAffordabilityDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!("logger" in value) || !isRecord(value.logger)) {
    return false;
  }
  if (!("countTokens" in value) || typeof value.countTokens !== "function") {
    return false;
  }
  if (!("compressPrompt" in value) || typeof value.compressPrompt !== "function") {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityParams(value: unknown): value is CalculateAffordabilityParams {
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
  if (!("walletBalance" in value) || typeof value.walletBalance !== "number") {
    return false;
  }
  if (!("extendedModelConfig" in value) || !isRecord(value.extendedModelConfig)) {
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
  if ("inputsRelevance" in value) {
    if (!Array.isArray(value.inputsRelevance)) {
      return false;
    }
  }
  return true;
}

export function isCalculateAffordabilityPayload(value: unknown): value is CalculateAffordabilityPayload {
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
  if (!("systemInstruction" in value) || typeof value.systemInstruction !== "string") {
    return false;
  }
  if (!("chatApiRequest" in value) || !isRecord(value.chatApiRequest)) {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityDirectReturn(
  value: unknown,
): value is CalculateAffordabilityDirectReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("wasCompressed" in value) || value.wasCompressed !== false) {
    return false;
  }
  if (!("maxOutputTokens" in value) || typeof value.maxOutputTokens !== "number") {
    return false;
  }
  if ("error" in value || "retriable" in value) {
    return false;
  }
  if ("chatApiRequest" in value || "resolvedInputTokenCount" in value) {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityCompressedReturn(
  value: unknown,
): value is CalculateAffordabilityCompressedReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("wasCompressed" in value) || value.wasCompressed !== true) {
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
  if ("error" in value || "retriable" in value) {
    return false;
  }
  if ("maxOutputTokens" in value) {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityErrorReturn(
  value: unknown,
): value is CalculateAffordabilityErrorReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value) || !(value.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in value) || typeof value.retriable !== "boolean") {
    return false;
  }
  if ("wasCompressed" in value || "maxOutputTokens" in value) {
    return false;
  }
  if ("chatApiRequest" in value || "resolvedInputTokenCount" in value || "resourceDocuments" in value) {
    return false;
  }
  return true;
}

export function isBoundCalculateAffordabilityFn(value: unknown): value is BoundCalculateAffordabilityFn {
  return typeof value === "function";
}
