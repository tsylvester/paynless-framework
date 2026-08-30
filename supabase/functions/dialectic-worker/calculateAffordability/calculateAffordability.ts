// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts

import { countTokens as countTokensAnthropic } from "npm:@anthropic-ai/tokenizer@0.0.4";
import { getEncoding as rawGetEncoding } from "npm:js-tiktoken@1.0.7";
import type { AiModelExtendedConfig, ChatMessageRole, Messages } from "../../_shared/types.ts";
import type { CountableChatPayload, CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { isApiChatMessage } from "../../_shared/utils/type_guards.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import {
  isValidInputTokenCostRate,
  isValidOutputTokenCostRate,
} from "../../_shared/utils/type-guards/type_guards.affordability.ts";
import { isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import type {
  CalculateAffordabilityDeps,
  CalculateAffordabilityOverBudgetReturn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityReturn,
  CalculateAffordabilityWithinBudgetReturn,
} from "./calculateAffordability.interface.ts";

export async function calculateAffordability(
  deps: CalculateAffordabilityDeps,
  params: CalculateAffordabilityParams,
  payload: CalculateAffordabilityPayload,
): Promise<CalculateAffordabilityReturn> {
  const extendedModelConfig: AiModelExtendedConfig = payload.extendedModelConfig;
  const walletBalance: number = params.walletBalance;

  const tokenizerDeps: CountTokensDeps = {
    getEncoding: (encodingName: string) => {
      if (!isKnownTiktokenEncoding(encodingName)) {
        throw new Error(`Unsupported tiktoken encoding: ${encodingName}`);
      }
      return rawGetEncoding(encodingName);
    },
    countTokensAnthropic,
    logger: deps.logger,
  };

  const initialAssembledMessages: Messages[] = payload.conversationHistory
    .filter((msg) => msg.role !== "function");

  const initialEffectiveMessages =
    initialAssembledMessages
      .filter(isApiChatMessage)
      .filter((m): m is { role: ChatMessageRole; content: string } =>
        m.content !== null
      );

  const fullPayload: CountableChatPayload = {
    systemInstruction: payload.systemInstruction,
    message: payload.currentUserPrompt,
    messages: initialEffectiveMessages,
    resourceDocuments: payload.resourceDocuments,
  };

  const initialTokenCount: number = deps.countTokens(
    tokenizerDeps,
    fullPayload,
    extendedModelConfig,
  );

  if (typeof extendedModelConfig.context_window_tokens !== "number") {
    return {
      error: new Error("context_window_tokens is not defined"),
      retriable: false,
    };
  }

  const maxTokens: number = extendedModelConfig.context_window_tokens;

  const isOversized: boolean =
    maxTokens !== undefined && initialTokenCount > maxTokens;

  if (!isOversized) {
    const plannedMaxOutputTokens: number = deps.getMaxOutputTokens(
      walletBalance,
      initialTokenCount,
      extendedModelConfig,
      deps.logger,
      0,
      params.userConfig.tier_output_cap_tokens,
    );
    if (plannedMaxOutputTokens < 0) {
      return {
        error: new Error("Insufficient funds to cover the input prompt cost."),
        retriable: false,
      };
    }

    if (typeof extendedModelConfig.provider_max_input_tokens !== "number") {
      return {
        error: new Error("provider_max_input_tokens is not defined"),
        retriable: false,
      };
    }
    const providerMaxInputTokens = extendedModelConfig.provider_max_input_tokens

    const safetyBufferTokens: number = 32;
    const allowedInput: number = providerMaxInputTokens - (plannedMaxOutputTokens + safetyBufferTokens)

    if (allowedInput <= 0) {
      return {
        error: new ContextWindowError(
          `No input window remains after reserving output budget (${plannedMaxOutputTokens}) and safety buffer (${safetyBufferTokens}).`,
        ),
        retriable: false,
      };
    }

    if (initialTokenCount > allowedInput) {
      return {
        error: new ContextWindowError(
          `Initial input tokens (${initialTokenCount}) exceed allowed input (${allowedInput}) after reserving output budget.`,
        ),
        retriable: false,
      };
    }

    if (!isValidInputTokenCostRate(extendedModelConfig.input_token_cost_rate)) {
      return {
        error: new Error(
          `Model is missing a valid 'input_token_cost_rate' in its configuration and cannot be used for operations that require cost estimation.`,
        ),
        retriable: false,
      };
    }

    if (!isValidOutputTokenCostRate(extendedModelConfig.output_token_cost_rate)) {
      return {
        error: new ContextWindowError(
          `Model is missing a valid 'output_token_cost_rate' in its configuration and cannot be used for operations that require output budget estimation.`,
        ),
        retriable: false,
      };
    }

    const inputRate = extendedModelConfig.input_token_cost_rate;
    const outputRate = extendedModelConfig.output_token_cost_rate;

    const estimatedInputCost: number = initialTokenCount * inputRate;
    const estimatedOutputCost: number = plannedMaxOutputTokens * outputRate;
    const estimatedTotalCost: number = estimatedInputCost + estimatedOutputCost;

    if (estimatedTotalCost > walletBalance) {
      return {
        error: new Error(
          `Insufficient funds: estimated total cost (${estimatedTotalCost}) exceeds wallet balance (${walletBalance}).`,
        ),
        retriable: false,
      };
    }

    const out: CalculateAffordabilityWithinBudgetReturn = {
      overBudget: false,
      maxOutputTokens: plannedMaxOutputTokens,
      resolvedInputTokenCount: initialTokenCount,
    };
    return out;
  }

  if (maxTokens === undefined) {
    return {
      error: new Error("context_window_tokens is not defined"),
      retriable: false,
    };
  }

  const maxTokensLimit: number = maxTokens;

  if (!isValidInputTokenCostRate(extendedModelConfig.input_token_cost_rate)) {
    return {
      error: new Error(
        `Model is missing a valid 'input_token_cost_rate' in its configuration and cannot be used for operations that require cost estimation.`,
      ),
      retriable: false,
    };
  }

  if (!isValidOutputTokenCostRate(extendedModelConfig.output_token_cost_rate)) {
    return {
      error: new ContextWindowError(
        `Model is missing a valid 'output_token_cost_rate' in its configuration and cannot be used for operations that require output budget estimation.`,
      ),
      retriable: false,
    };
  }

  const inputRate = extendedModelConfig.input_token_cost_rate;
  const outputRate = extendedModelConfig.output_token_cost_rate;

  const tokensToBeRemoved: number = initialTokenCount - maxTokensLimit;

  const estimatedTotalRagCost: number = tokensToBeRemoved * inputRate;
  const estimatedFinalPromptCost: number = maxTokensLimit * inputRate;
  const totalEstimatedInputCost: number = estimatedTotalRagCost + estimatedFinalPromptCost;

  const estimatedEmbeddingTokens: number = Math.max(0, tokensToBeRemoved);
  const estimatedEmbeddingCost: number = estimatedEmbeddingTokens * inputRate;
  const totalEstimatedInputCostWithEmbeddings: number =
    totalEstimatedInputCost + estimatedEmbeddingCost;

  const currentUserBalance: number = walletBalance;

  if (currentUserBalance < totalEstimatedInputCostWithEmbeddings) {
    return {
      error: new Error(
        `Insufficient funds for the entire operation (including embeddings). Estimated cost: ${totalEstimatedInputCostWithEmbeddings}, Balance: ${currentUserBalance}`,
      ),
      retriable: false,
    };
  }

  const rationalityThreshold: number = 0.80;
  if (totalEstimatedInputCostWithEmbeddings > currentUserBalance * rationalityThreshold) {
    return {
      error: new Error(
        `Estimated cost (${totalEstimatedInputCostWithEmbeddings}) exceeds ${rationalityThreshold * 100}% of the user's balance (${currentUserBalance}).`,
      ),
      retriable: false,
    };
  }

  deps.logger.info(
    `Initial prompt token count (${initialTokenCount}) exceeds model limit (${maxTokensLimit}); returning over-budget verdict.`,
  );

  if (!extendedModelConfig.provider_max_input_tokens) {
    return {
      error: new Error("Provider max input tokens is not defined"),
      retriable: false,
    };
  }

  const providerMaxInputForPre: number = extendedModelConfig.provider_max_input_tokens;

  const getAllowedInputFor = (balanceTokens: number, tokenCount: number): number => {
    const plannedOut: number = deps.getMaxOutputTokens(
      balanceTokens,
      tokenCount,
      extendedModelConfig,
      deps.logger,
      0,
      null,
    );
    const safetyBufferTokensPre: number = 32;
    return providerMaxInputForPre - (plannedOut + safetyBufferTokensPre);
  };

  const solveTargetForBalance = (balanceTokens: number): number => {
    let t: number = Math.min(
      maxTokensLimit,
      initialTokenCount,
    );
    for (let i = 0; i < 5; i++) {
      const allowed: number = getAllowedInputFor(balanceTokens, t);
      const next: number = Math.min(
        maxTokensLimit,
        allowed,
      );
      if (!(next < t - 1)) break;
      t = Math.max(0, Math.floor(next));
    }
    return Math.max(0, Math.floor(t));
  };

  const prelimTarget: number = solveTargetForBalance(walletBalance);
  const prelimTokensToRemove: number = Math.max(0, initialTokenCount - prelimTarget);
  const estimatedCompressionCost: number = prelimTokensToRemove * inputRate;
  const balanceAfterCompression: number = walletBalance - estimatedCompressionCost;
  if (!Number.isFinite(balanceAfterCompression) || balanceAfterCompression <= 0) {
    return {
      error: new Error(
        `Insufficient funds: compression requires ${estimatedCompressionCost} tokens, balance is ${walletBalance}.`,
      ),
      retriable: false,
    };
  }

  const finalTargetThreshold: number = solveTargetForBalance(balanceAfterCompression);
  if (!(finalTargetThreshold >= 0)) {
    return {
      error: new ContextWindowError(
        `Unable to determine a feasible input size target given current balance.`,
      ),
      retriable: false,
    };
  }

  const plannedMaxOutPostPrecheck: number = deps.getMaxOutputTokens(
    balanceAfterCompression,
    finalTargetThreshold,
    extendedModelConfig,
    deps.logger,
    0,
    null,
  );
  const estimatedFinalInputCost: number = finalTargetThreshold * inputRate;
  const estimatedFinalOutputCost: number = plannedMaxOutPostPrecheck * outputRate;
  const totalEstimatedCost: number =
    estimatedCompressionCost + estimatedFinalInputCost + estimatedFinalOutputCost;
  if (totalEstimatedCost > walletBalance) {
    return {
      error: new Error(
        `Insufficient funds: total estimated cost (compression + final I/O) ${totalEstimatedCost} exceeds balance ${walletBalance}.`,
      ),
      retriable: false,
    };
  }

  const rationalityThresholdTotal: number = 0.80;
  if (totalEstimatedCost > walletBalance * rationalityThresholdTotal) {
    return {
      error: new Error(
        `Estimated cost (${totalEstimatedCost}) exceeds ${rationalityThresholdTotal * 100}% of the user's balance (${walletBalance}).`,
      ),
      retriable: false,
    };
  }

  const verdict: CalculateAffordabilityOverBudgetReturn = {
    overBudget: true,
    resolvedInputTokenCount: initialTokenCount,
    finalTargetThreshold,
    balanceAfterCompression,
  };
  return verdict;
}
