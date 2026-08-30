/**
 * Integration tests for `calculateAffordability`: real implementation, real `countTokens`,
 * real `getMaxOutputTokens`. Boundary-only fakes: `MockLogger` (silenced output).
 * Deterministic `countTokens` stub only where the scenario requires a fixed token count (NSF test).
 *
 * Boundary: calculateAffordability → real countTokens (tokenizer_utils) → real getMaxOutputTokens (affordability_utils).
 * Mocked: MockLogger (silenced output); no RAG, wallet, or DB collaborators constructed.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countTokens as countTokensAnthropic } from "npm:@anthropic-ai/tokenizer@0.0.4";
import { getEncoding as rawGetEncoding } from "npm:js-tiktoken@1.0.7";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type {
  AiModelExtendedConfig,
} from "../../_shared/types.ts";
import type { ResourceDocuments } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
} from "../../_shared/types/tokenizer.types.ts";
import { calculateAffordability } from "./calculateAffordability.ts";
import {
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityOverBudgetReturn,
  isCalculateAffordabilityWithinBudgetReturn,
} from "./calculateAffordability.guard.ts";
import type {
  CalculateAffordabilityDeps,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
} from "./calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
} from "./calculateAffordability.mock.ts";

function buildRealTokenizerDeps(logger: MockLogger): CountTokensDeps {
  return {
    getEncoding: (encodingName: string) => {
      if (!isKnownTiktokenEncoding(encodingName)) {
        throw new Error(`Unsupported tiktoken encoding: ${encodingName}`);
      }
      return rawGetEncoding(encodingName);
    },
    countTokensAnthropic,
    logger,
  };
}

function buildIntegrationResourceDocuments(): ResourceDocuments {
  return [
    buildResourceDocument({
      id: "integration-doc-id",
      content: "integration resource body",
      document_key: FileType.HeaderContext,
      stage_slug: "thesis",
      type: "document",
    }),
  ];
}

/**
 * Contract: non-oversized prompt with real config and real countTokens → within-budget return; maxOutputTokens matches real getMaxOutputTokens.
 * Arrange: real extendedModelConfig (context window 128k), real resourceDocuments, short prompt, walletBalance 1M.
 * Act:     calculateAffordability with real countTokens and real getMaxOutputTokens.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals real getMaxOutputTokens(walletBalance, realTokenCount, config, logger, 0, tier_cap).
 * Boundary: calculateAffordability → real countTokens (tokenizer_utils) → real getMaxOutputTokens (affordability_utils).
 * Mocked:  MockLogger (silenced output); countTokens and getMaxOutputTokens are real.
 */
Deno.test("calculateAffordability integration: non-oversized → within-budget return (real config + real countTokens)", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 128_000,
    provider_max_input_tokens: 128_000,
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.01,
  });
  const resourceDocuments = buildIntegrationResourceDocuments();
  const currentUserPrompt = "short integration prompt";
  const deps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
    logger,
    countTokens,
  });
  const params: CalculateAffordabilityParams = buildCalculateAffordabilityParams({
    walletBalance: 1_000_000,
  });
  const payload: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload({
    extendedModelConfig,
    resourceDocuments,
    conversationHistory: [],
    currentUserPrompt,
    systemInstruction: "integration system instruction",
  });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (!isCalculateAffordabilityWithinBudgetReturn(result)) {
    return;
  }
  const realTokenizerDeps = buildRealTokenizerDeps(logger);
  const fullPayload: CountableChatPayload = {
    systemInstruction: payload.systemInstruction,
    message: payload.currentUserPrompt,
    messages: [],
    resourceDocuments: payload.resourceDocuments,
  };
  const initialTokenCount = countTokens(
    realTokenizerDeps,
    fullPayload,
    extendedModelConfig,
  );
  const expectedMax = deps.getMaxOutputTokens(
    params.walletBalance,
    initialTokenCount,
    extendedModelConfig,
    deps.logger,
    0,
    params.userConfig.tier_output_cap_tokens,
  );
  assertEquals(result.maxOutputTokens, expectedMax);
});

/**
 * Contract: oversized working set with real countTokens → over-budget verdict; finalTargetThreshold at or below window; positive balanceAfterCompression.
 * Arrange: real extendedModelConfig (context window 50k), oversized resourceDocuments (long body), walletBalance 1M, real countTokens.
 * Act:     calculateAffordability with real countTokens and real getMaxOutputTokens.
 * Assert:  isCalculateAffordabilityOverBudgetReturn; finalTargetThreshold <= context_window_tokens; balanceAfterCompression > 0; resolvedInputTokenCount > 0.
 * Boundary: calculateAffordability → real countTokens (tokenizer_utils) → real getMaxOutputTokens (affordability_utils), over-budget verdict path.
 * Mocked:  MockLogger (silenced output); no RAG, wallet, or DB collaborators constructed.
 */
Deno.test("calculateAffordability integration: oversized working set → over-budget verdict (real countTokens)", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    input_token_cost_rate: 0.0001,
    output_token_cost_rate: 0.0001,
    hard_cap_output_tokens: 100_000,
    provider_max_output_tokens: 100_000,
    context_window_tokens: 50_000,
    provider_max_input_tokens: 128_000,
  });
  const longBody = "word ".repeat(200_000);
  const resourceDocuments: ResourceDocuments = [
    buildResourceDocument({
      id: crypto.randomUUID(),
      content: longBody,
      document_key: FileType.HeaderContext,
      stage_slug: "thesis",
      type: "document",
    }),
  ];
  const currentUserPrompt = "integration user message oversized";
  const deps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
    logger,
    countTokens,
  });
  const params: CalculateAffordabilityParams = buildCalculateAffordabilityParams({
    walletBalance: 1_000_000,
  });
  const payload: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload({
    extendedModelConfig,
    resourceDocuments,
    conversationHistory: [],
    currentUserPrompt,
    systemInstruction: "sys",
  });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityOverBudgetReturn(result), true);
  if (!isCalculateAffordabilityOverBudgetReturn(result)) {
    return;
  }
  const contextWindow = extendedModelConfig.context_window_tokens;
  if (typeof contextWindow !== "number") {
    throw new Error("context_window_tokens must be a number to reach the over-budget verdict");
  }
  assertEquals(result.finalTargetThreshold <= contextWindow, true);
  assertEquals(result.balanceAfterCompression > 0, true);
  assertEquals(result.resolvedInputTokenCount > 0, true);
});

/**
 * Contract: non-oversized prompt with insufficient balance → error return, retriable false.
 * Arrange: real extendedModelConfig (context window 128k), fixed countTokens returning 1000, walletBalance 5.
 * Act:     calculateAffordability with fixed countTokens and real getMaxOutputTokens.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 * Boundary: calculateAffordability → fixed countTokens stub → real getMaxOutputTokens (affordability_utils).
 * Mocked:  MockLogger (silenced output); countTokens is stubbed to a fixed 1000 to force the NSF branch deterministically; getMaxOutputTokens is real.
 */
Deno.test("calculateAffordability integration: NSF (non-oversized) → error return", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 128_000,
    provider_max_input_tokens: 128_000,
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.01,
  });
  const resourceDocuments = buildIntegrationResourceDocuments();
  const currentUserPrompt = "x";
  const countTokensFixed: CalculateAffordabilityDeps["countTokens"] = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _modelConfig: AiModelExtendedConfig,
  ): number => 1000;
  const deps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: countTokensFixed,
  });
  const params: CalculateAffordabilityParams = buildCalculateAffordabilityParams({
    walletBalance: 5,
  });
  const payload: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload({
    extendedModelConfig,
    resourceDocuments,
    conversationHistory: [],
    currentUserPrompt,
    systemInstruction: "integration system instruction",
  });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (!isCalculateAffordabilityErrorReturn(result)) {
    return;
  }
  assertEquals(result.retriable, false);
});

/**
 * Contract: tierOutputCapTokens=32768 is binding → maxOutputTokens capped at 32768; matches real getMaxOutputTokens.
 * Arrange: real extendedModelConfig (context window 500k, hard cap 200k), real resourceDocuments, tier_output_cap_tokens 32768, walletBalance 1M.
 * Act:     calculateAffordability with real countTokens and real getMaxOutputTokens.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals 32768 and equals real getMaxOutputTokens(walletBalance, realTokenCount, config, logger, 0, 32768).
 * Boundary: calculateAffordability → real countTokens (tokenizer_utils) → real getMaxOutputTokens (affordability_utils), tier cap binding.
 * Mocked:  MockLogger (silenced output); countTokens and getMaxOutputTokens are real.
 */
Deno.test("calculateAffordability integration: tierOutputCapTokens=32768 is binding → maxOutputTokens capped at 32768", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 500_000,
    provider_max_input_tokens: 500_000,
    hard_cap_output_tokens: 200_000,
    provider_max_output_tokens: 200_000,
    input_token_cost_rate: 0.0001,
    output_token_cost_rate: 0.0001,
  });
  const resourceDocuments = buildIntegrationResourceDocuments();
  const currentUserPrompt = "tier cap binding test";
  const deps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
    logger,
    countTokens,
  });
  const params: CalculateAffordabilityParams = buildCalculateAffordabilityParams({
    walletBalance: 1_000_000,
    userConfig: { tier_output_cap_tokens: 32768 },
  });
  const payload: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload({
    extendedModelConfig,
    resourceDocuments,
    conversationHistory: [],
    currentUserPrompt,
    systemInstruction: "integration system instruction",
  });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (!isCalculateAffordabilityWithinBudgetReturn(result)) {
    return;
  }
  const realTokenizerDeps = buildRealTokenizerDeps(logger);
  const fullPayload: CountableChatPayload = {
    systemInstruction: payload.systemInstruction,
    message: payload.currentUserPrompt,
    messages: [],
    resourceDocuments: payload.resourceDocuments,
  };
  const initialTokenCount = countTokens(
    realTokenizerDeps,
    fullPayload,
    extendedModelConfig,
  );
  const expectedMax = deps.getMaxOutputTokens(
    params.walletBalance,
    initialTokenCount,
    extendedModelConfig,
    deps.logger,
    0,
    params.userConfig.tier_output_cap_tokens,
  );
  assertEquals(result.maxOutputTokens, expectedMax);
  assertEquals(expectedMax, 32768);
});
