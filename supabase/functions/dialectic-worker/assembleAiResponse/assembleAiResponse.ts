import type {
  AssembleAiResponseDeps,
  AssembleAiResponseParams,
  AssembleAiResponsePayload,
  AssembleAiResponseFn,
  AssembleAiResponseSuccessReturn,
  AssembleAiResponseErrorReturn,
} from "./assembleAiResponse.interface.ts";
import { AssembleAiResponseTokenCountError, AssembleAiResponseMissingPreflightError } from "./assembleAiResponse.interface.ts";
import type { TokenUsage, FinishReason } from "../../_shared/types.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import type { CountableChatPayload } from "../../_shared/types/tokenizer.types.ts";
import { isFinishReason } from "../../_shared/utils/type-guards/type_guards.chat.ts";

export const assembleAiResponse: AssembleAiResponseFn = (
  deps,
  params,
  payload,
) => {
  // Content derivation
  const trimmedContent: string = payload.assembledContent.trim();
  const contentString: string | null = trimmedContent === "" ? null : trimmedContent;

  // Finish-reason branches
  const resolvedReason: FinishReason = isFinishReason(payload.finishReason)
    ? (payload.finishReason === null ? "unknown" : payload.finishReason)
    : "unknown";

  // Usage branches
  let effectiveTokenUsage: TokenUsage | null = null;
  if (payload.tokenUsage !== null) {
    effectiveTokenUsage = {
      prompt_tokens: payload.tokenUsage.prompt_tokens,
      completion_tokens: payload.tokenUsage.completion_tokens,
      total_tokens: payload.tokenUsage.total_tokens,
    };
  }
  if (effectiveTokenUsage === null && contentString !== null) {
    if (params.preflightInputTokens === undefined) {
      const error: AssembleAiResponseMissingPreflightError = new AssembleAiResponseMissingPreflightError({
        apiIdentifier: params.modelConfig.api_identifier,
      });
      const errorReturn: AssembleAiResponseErrorReturn = { error, retriable: false };
      return errorReturn;
    }
    const preflightInputTokens: number = params.preflightInputTokens;
    const countablePayload: CountableChatPayload = { message: contentString };
    try {
      const completionTokens: number = deps.countTokens(countablePayload, params.modelConfig);
      effectiveTokenUsage = {
        prompt_tokens: preflightInputTokens,
        completion_tokens: completionTokens,
        total_tokens: preflightInputTokens + completionTokens,
      };
    } catch (thrownValue: unknown) {
      const error: AssembleAiResponseTokenCountError = new AssembleAiResponseTokenCountError({
        apiIdentifier: params.modelConfig.api_identifier,
        thrownValue: String(thrownValue),
      });
      const errorReturn: AssembleAiResponseErrorReturn = { error, retriable: false };
      return errorReturn;
    }
  }

  // Assembly
  const aiResponse: UnifiedAIResponse = {
    content: contentString,
    tokenUsage: effectiveTokenUsage,
    inputTokens: effectiveTokenUsage?.prompt_tokens,
    outputTokens: effectiveTokenUsage?.completion_tokens,
    processingTimeMs: params.processingTimeMs,
    finish_reason: resolvedReason,
    rawProviderResponse: {
      token_usage: effectiveTokenUsage,
      finish_reason: resolvedReason,
    },
  };

  const successReturn: AssembleAiResponseSuccessReturn = { aiResponse };
  return successReturn;
};
