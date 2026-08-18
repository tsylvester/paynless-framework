import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getEncoding } from "npm:js-tiktoken@1.0.7";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { assembleAiResponse } from "./assembleAiResponse.ts";
import { isAssembleAiResponseSuccessReturn } from "./assembleAiResponse.guard.ts";
import {
  buildAssembleAiResponseDeps,
  buildAssembleAiResponseParams,
  buildAssembleAiResponsePayload,
} from "./assembleAiResponse.mock.ts";

// Boundary: the tokenizer. The real countTokens from _shared/utils/tokenizer_utils.ts,
// bound with real CountTokensDeps, runs against the real assembleAiResponse. No
// repo-owned function is mocked.
// Mocked: nothing inside the chain. The encoder the tokenizer loads is the true
// external edge and is used as it is in production, which is what makes the count real.

const realModelConfig: AiModelExtendedConfig = {
  api_identifier: "gpt-4o",
  input_token_cost_rate: 0.01,
  output_token_cost_rate: 0.01,
  tokenization_strategy: {
    type: "tiktoken",
    tiktoken_encoding_name: "cl100k_base",
  },
  hard_cap_output_tokens: 500,
  provider_max_output_tokens: 500,
  context_window_tokens: 128000,
  provider_max_input_tokens: 128000,
};

const realTokenizerDeps: CountTokensDeps = {
  getEncoding: (encodingName: string) => {
    if (!isKnownTiktokenEncoding(encodingName)) {
      throw new Error(`Unknown tiktoken encoding: ${encodingName}`);
    }
    return getEncoding(encodingName);
  },
  countTokensAnthropic: (_text: string) => 0,
  logger: new MockLogger(),
};

/**
 * Contract: given a payload whose tokenUsage is null and whose content is non-empty,
 *   over a real model config, the response's completion_tokens equals the real
 *   tokenizer's count for that content — a number asserted independently and unequal
 *   to the content's character length, so the case fails against a .length
 *   implementation and against a stubbed counter alike.
 * Arrange: payload with tokenUsage null, content "The quick brown fox jumps over the lazy dog";
 *   deps from buildAssembleAiResponseDeps with countTokens overridden by the real countTokens
 *   bound with real CountTokensDeps; params with the real model config.
 * Act:     assembleAiResponse over the real-tokenizer payload.
 * Assert:  success arm; completion_tokens equals the independently computed real token count;
 *   completion_tokens is not equal to the content's character length.
 * Boundary: the tokenizer — real countTokens from _shared/utils/tokenizer_utils.ts, bound
 *   with real CountTokensDeps (real js-tiktoken getEncoding), runs against real assembleAiResponse.
 * Mocked: nothing inside the chain. The encoder is the true external edge, used as in production.
 */
Deno.test("assembleAiResponse integration: real tokenizer produces completion_tokens unequal to character length", () => {
  // Arrange
  const content = "The quick brown fox jumps over the lazy dog";
  const expectedTokenCount = countTokens(realTokenizerDeps, { message: content }, realModelConfig);
  const deps = buildAssembleAiResponseDeps({
    countTokens: (payload, modelConfig) => countTokens(realTokenizerDeps, payload, modelConfig),
  });
  const params = buildAssembleAiResponseParams({ modelConfig: realModelConfig });
  const payload = buildAssembleAiResponsePayload({ assembledContent: content, tokenUsage: null });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.tokenUsage!.completion_tokens, expectedTokenCount);
    assertNotEquals(result.aiResponse.tokenUsage!.completion_tokens, content.length);
  }
});

/**
 * Contract: given a payload whose content is a single multi-token word, the response's
 *   completion_tokens is greater than 1, proving the count is a token count rather than
 *   a word count.
 * Arrange: payload with tokenUsage null, content "uncharacteristically" (one word, multiple tokens);
 *   deps from buildAssembleAiResponseDeps with countTokens overridden by the real countTokens
 *   bound with real CountTokensDeps; params with the real model config.
 * Act:     assembleAiResponse over the single-word payload.
 * Assert:  success arm; completion_tokens is greater than 1.
 * Boundary: the tokenizer — real countTokens from _shared/utils/tokenizer_utils.ts, bound
 *   with real CountTokensDeps (real js-tiktoken getEncoding), runs against real assembleAiResponse.
 * Mocked: nothing inside the chain. The encoder is the true external edge, used as in production.
 */
Deno.test("assembleAiResponse integration: a single multi-token word proves the count is tokens not words", () => {
  // Arrange
  const content = "uncharacteristically";
  const deps = buildAssembleAiResponseDeps({
    countTokens: (payload, modelConfig) => countTokens(realTokenizerDeps, payload, modelConfig),
  });
  const params = buildAssembleAiResponseParams({ modelConfig: realModelConfig });
  const payload = buildAssembleAiResponsePayload({ assembledContent: content, tokenUsage: null });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assert(result.aiResponse.tokenUsage!.completion_tokens > 1);
  }
});
