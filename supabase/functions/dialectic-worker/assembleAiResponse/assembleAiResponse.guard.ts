import type {
  AssembleAiResponseDeps,
  AssembleAiResponseParams,
  AssembleAiResponsePayload,
  AssembleAiResponseSuccessReturn,
  AssembleAiResponseErrorReturn,
} from "./assembleAiResponse.interface.ts";
import { AssembleAiResponseTokenCountError } from "./assembleAiResponse.interface.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isAiModelExtendedConfig, isTokenUsage } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isUnifiedAIResponse } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

export function isAssembleAiResponseDeps(value: unknown): value is AssembleAiResponseDeps {
  if (!isRecord(value)) return false;
  return typeof value.countTokens === "function";
}

export function isAssembleAiResponseParams(value: unknown): value is AssembleAiResponseParams {
  if (!isRecord(value)) return false;
  if (typeof value.processingTimeMs !== "number" || !Number.isFinite(value.processingTimeMs) || value.processingTimeMs < 0) return false;
  if (typeof value.preflightInputTokens !== "number" || !Number.isFinite(value.preflightInputTokens) || value.preflightInputTokens < 0) return false;
  if (!isAiModelExtendedConfig(value.modelConfig)) return false;
  return true;
}

export function isAssembleAiResponsePayload(value: unknown): value is AssembleAiResponsePayload {
  if (!isRecord(value)) return false;
  if (typeof value.assembledContent !== "string") return false;
  if (value.tokenUsage !== null && !isTokenUsage(value.tokenUsage)) return false;
  if (value.finishReason !== null && typeof value.finishReason !== "string") return false;
  return true;
}

export function isAssembleAiResponseSuccessReturn(value: unknown): value is AssembleAiResponseSuccessReturn {
  if (!isRecord(value)) return false;
  return isUnifiedAIResponse(value.aiResponse);
}

export function isAssembleAiResponseErrorReturn(value: unknown): value is AssembleAiResponseErrorReturn {
  if (!isRecord(value)) return false;
  if (!isAssembleAiResponseTokenCountError(value.error)) return false;
  return typeof value.retriable === "boolean";
}

export function isAssembleAiResponseTokenCountError(value: unknown): value is AssembleAiResponseTokenCountError {
  return value instanceof AssembleAiResponseTokenCountError;
}
