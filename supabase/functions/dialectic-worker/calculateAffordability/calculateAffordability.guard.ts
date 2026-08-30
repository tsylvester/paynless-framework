// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.ts

import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityFn,
  CalculateAffordabilityOverBudgetReturn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityWithinBudgetReturn,
  GetMaxOutputTokensFn,
  TierOutputCapTokens,
  UserConfig,
} from "./calculateAffordability.interface.ts";

export function isTierOutputCapTokens(value: unknown): value is TierOutputCapTokens {
  return typeof value === "number" || value === null;
}

export function isUserConfig(value: unknown): value is UserConfig {
  if (!isRecord(value)) {
    return false;
  }
  if (!("tier_output_cap_tokens" in value)) {
    return false;
  }
  if (!isTierOutputCapTokens(value.tier_output_cap_tokens)) {
    return false;
  }
  return true;
}

export function isGetMaxOutputTokensFn(value: unknown): value is GetMaxOutputTokensFn {
  return typeof value === "function";
}

export function isCalculateAffordabilityFn(value: unknown): value is CalculateAffordabilityFn {
  return typeof value === "function";
}

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
  if (!("getMaxOutputTokens" in value) || !isGetMaxOutputTokensFn(value.getMaxOutputTokens)) {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityParams(value: unknown): value is CalculateAffordabilityParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("walletBalance" in value) || typeof value.walletBalance !== "number") {
    return false;
  }
  if (!("userConfig" in value) || !isUserConfig(value.userConfig)) {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityPayload(value: unknown): value is CalculateAffordabilityPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("extendedModelConfig" in value) || !isAiModelExtendedConfig(value.extendedModelConfig)) {
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
  return true;
}

export function isCalculateAffordabilityWithinBudgetReturn(
  value: unknown,
): value is CalculateAffordabilityWithinBudgetReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("overBudget" in value) || value.overBudget !== false) {
    return false;
  }
  if (!("maxOutputTokens" in value) || typeof value.maxOutputTokens !== "number") {
    return false;
  }
  if (!("resolvedInputTokenCount" in value) || typeof value.resolvedInputTokenCount !== "number") {
    return false;
  }
  if ("error" in value || "retriable" in value) {
    return false;
  }
  if ("finalTargetThreshold" in value || "balanceAfterCompression" in value) {
    return false;
  }
  return true;
}

export function isCalculateAffordabilityOverBudgetReturn(
  value: unknown,
): value is CalculateAffordabilityOverBudgetReturn {
  if (!isRecord(value)) {
    return false;
  }
  if (!("overBudget" in value) || value.overBudget !== true) {
    return false;
  }
  if (!("resolvedInputTokenCount" in value) || typeof value.resolvedInputTokenCount !== "number") {
    return false;
  }
  if (!("finalTargetThreshold" in value) || typeof value.finalTargetThreshold !== "number") {
    return false;
  }
  if (!("balanceAfterCompression" in value) || typeof value.balanceAfterCompression !== "number") {
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
  if ("overBudget" in value || "maxOutputTokens" in value) {
    return false;
  }
  if ("resolvedInputTokenCount" in value || "finalTargetThreshold" in value || "balanceAfterCompression" in value) {
    return false;
  }
  return true;
}

export function isBoundCalculateAffordabilityFn(value: unknown): value is BoundCalculateAffordabilityFn {
  return typeof value === "function";
}
