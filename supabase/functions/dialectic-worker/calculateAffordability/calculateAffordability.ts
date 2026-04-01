// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts

import type { AiModelExtendedConfig, Messages } from "../../_shared/types.ts";
import type { CountableChatPayload, CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { isApiChatMessage } from "../../_shared/utils/type_guards.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import {
  isValidInputTokenCostRate,
  isValidOutputTokenCostRate,
} from "../../_shared/utils/type-guards/type_guards.affordability.ts";
import { isCompressPromptErrorReturn } from "../compressPrompt/compressPrompt.guard.ts";
import type {
  CompressPromptParams,
  CompressPromptPayload,
} from "../compressPrompt/compressPrompt.interface.ts";
import type {
  CalculateAffordabilityDeps,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityReturn,
} from "./calculateAffordability.interface.ts";

export async function calculateAffordability(
  deps: CalculateAffordabilityDeps,
  params: CalculateAffordabilityParams,
  payload: CalculateAffordabilityPayload,
): Promise<CalculateAffordabilityReturn> {
  const extendedModelConfig: AiModelExtendedConfig = params.extendedModelConfig;
  const walletBalance: number = params.walletBalance;
  const inputRate: number = params.inputRate;
  const outputRate: number = params.outputRate;

  const tokenizerDeps: CountTokensDeps = {
    getEncoding: (_name: string) => ({
      encode: (input: string) => Array.from(input ?? "", (_ch, index: number) => index),
    }),
    countTokensAnthropic: (text: string) => (text ?? "").length,
    logger: deps.logger,
  };

  const initialAssembledMessages: Messages[] = payload.conversationHistory
    .filter((msg) => msg.role !== "function");

  const initialEffectiveMessages: { role: "system" | "user" | "assistant"; content: string }[] =
    initialAssembledMessages
      .filter(isApiChatMessage)
      .filter((m): m is { role: "system" | "user" | "assistant"; content: string } =>
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
    const plannedMaxOutputTokens: number = getMaxOutputTokens(
      walletBalance,
      initialTokenCount,
      extendedModelConfig,
      deps.logger,
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

    const out: CalculateAffordabilityReturn = {
      wasCompressed: false,
      maxOutputTokens: plannedMaxOutputTokens,
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

  if (params.inputsRelevance === undefined) {
    return {
      error: new Error("inputsRelevance is required"),
      retriable: false,
    };
  }

  const inputsRelevance = params.inputsRelevance;

  for (const doc of payload.resourceDocuments) {
    const hasDocKey: boolean = typeof doc.document_key === "string" && doc.document_key !== "";
    const hasType: boolean = typeof doc.type === "string" && doc.type !== "";
    const hasStage: boolean = typeof doc.stage_slug === "string" && doc.stage_slug !== "";
    if (!(hasDocKey && hasType && hasStage)) {
      return {
        error: new Error(
          "Compression requires document identity: document_key, type, and stage_slug must be present.",
        ),
        retriable: false,
      };
    }
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
    `Initial prompt token count (${initialTokenCount}) exceeds model limit (${maxTokensLimit}) for job ${params.jobId}. Attempting compression.`,
  );

  if (!extendedModelConfig.provider_max_input_tokens) {
    return {
      error: new Error("Provider max input tokens is not defined"),
      retriable: false,
    };
  }

  const providerMaxInputForPre: number = extendedModelConfig.provider_max_input_tokens;

  const getAllowedInputFor = (balanceTokens: number, tokenCount: number): number => {
    const plannedOut: number = getMaxOutputTokens(
      balanceTokens,
      tokenCount,
      extendedModelConfig,
      deps.logger,
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

  const plannedMaxOutPostPrecheck: number = getMaxOutputTokens(
    balanceAfterCompression,
    finalTargetThreshold,
    extendedModelConfig,
    deps.logger,
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

  const compressParams: CompressPromptParams = {
    dbClient: params.dbClient,
    jobId: params.jobId,
    projectOwnerUserId: params.projectOwnerUserId,
    sessionId: params.sessionId,
    stageSlug: params.stageSlug,
    walletId: params.walletId,
    extendedModelConfig,
    inputsRelevance,
    inputRate,
    outputRate,
    isContinuationFlowInitial: params.isContinuationFlowInitial,
    finalTargetThreshold,
    balanceAfterCompression,
    walletBalance,
  };

  const compressPayload: CompressPromptPayload = {
    compressionStrategy: payload.compressionStrategy,
    resourceDocuments: payload.resourceDocuments,
    conversationHistory: payload.conversationHistory,
    currentUserPrompt: payload.currentUserPrompt,
    chatApiRequest: payload.chatApiRequest,
    tokenizerDeps,
  };

  const compressResult = await deps.compressPrompt(compressParams, compressPayload);

  if (isCompressPromptErrorReturn(compressResult)) {
    return {
      error: compressResult.error,
      retriable: compressResult.retriable,
    };
  }

  const success: CalculateAffordabilityReturn = {
    wasCompressed: true,
    chatApiRequest: compressResult.chatApiRequest,
    resolvedInputTokenCount: compressResult.resolvedInputTokenCount,
    resourceDocuments: compressResult.resourceDocuments,
  };
  return success;
}
