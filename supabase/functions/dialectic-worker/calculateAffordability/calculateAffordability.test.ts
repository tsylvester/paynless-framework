// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type { GetMaxOutputTokensFn } from "./calculateAffordability.interface.ts";
import { calculateAffordability } from "./calculateAffordability.ts";
import {
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityOverBudgetReturn,
  isCalculateAffordabilityWithinBudgetReturn,
} from "./calculateAffordability.guard.ts";
import {
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
} from "./calculateAffordability.mock.ts";

/**
 * Contract: context_window_tokens not a number → error "context_window_tokens is not defined", retriable false.
 * Arrange: extendedModelConfig with context_window_tokens set to a non-number.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error message includes "context_window_tokens is not defined"; retriable false.
 */
Deno.test("context_window_tokens not a number returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: "not-a-number" as unknown as number,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100 }),
  });
  const params = buildCalculateAffordabilityParams();
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertStringIncludes(result.error.message, "context_window_tokens is not defined");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: within-window and adequate balance → within-budget return; maxOutputTokens matches deps.getMaxOutputTokens.
 * Arrange: initialTokenCount below context_window_tokens, walletBalance adequate, default config.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals deps.getMaxOutputTokens result; resolvedInputTokenCount equals initialTokenCount.
 */
Deno.test("within-window adequate balance returns within-budget return matching getMaxOutputTokens", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 1000;
  const walletBalance = 1_000_000;
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload();

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  const expectedMax = deps.getMaxOutputTokens(
    walletBalance,
    initialTokenCount,
    payload.extendedModelConfig,
    logger,
    0,
    params.userConfig.tier_output_cap_tokens,
  );
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (isCalculateAffordabilityWithinBudgetReturn(result)) {
    assertEquals(result.maxOutputTokens, expectedMax);
    assertEquals(result.resolvedInputTokenCount, initialTokenCount);
  }
});

/**
 * Contract: within-window and getMaxOutputTokens negative → error "Insufficient funds to cover the input prompt cost.", retriable false.
 * Arrange: walletBalance too small to cover input cost, initialTokenCount below window.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 */
Deno.test("within-window NSF returns error with retriable false", async () => {
  // Arrange
  const logger = new MockLogger();
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 1000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 5 });
  const payload = buildCalculateAffordabilityPayload();

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: within-window and provider_max_input_tokens not a number → error "provider_max_input_tokens is not defined", retriable false.
 * Arrange: extendedModelConfig with provider_max_input_tokens set to a non-number, initialTokenCount below window.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error message includes "provider_max_input_tokens is not defined"; retriable false.
 */
Deno.test("within-window provider_max_input_tokens not a number returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    provider_max_input_tokens: "not-a-number" as unknown as number,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100 }),
  });
  const params = buildCalculateAffordabilityParams();
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertStringIncludes(result.error.message, "provider_max_input_tokens is not defined");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: within-window and allowedInput <= 0 → ContextWindowError, retriable false.
 * Arrange: provider_max_input_tokens small enough that allowedInput (provider_max_input - plannedOutput - 32) is <= 0.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error is ContextWindowError; retriable false.
 */
Deno.test("within-window allowedInput <= 0 returns ContextWindowError", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    provider_max_input_tokens: 100,
    context_window_tokens: 200_000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 5000 }),
  });
  const params = buildCalculateAffordabilityParams();
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: within-window and initialTokenCount > allowedInput → ContextWindowError, retriable false.
 * Arrange: initialTokenCount below window but above allowedInput (provider_max_input - plannedOutput - 32).
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error is ContextWindowError; error message includes "exceed allowed input"; retriable false.
 */
Deno.test("within-window initialTokenCount exceeds allowedInput returns ContextWindowError", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 60;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 200,
    provider_max_input_tokens: 100,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 100 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertStringIncludes(result.error.message, "exceed allowed input");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: within-window and estimated total cost exceeds balance → error "Insufficient funds: estimated total cost...", retriable false.
 * Arrange: rates and balance set so estimated input + output cost exceeds walletBalance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error message includes "Insufficient funds"; retriable false.
 */
Deno.test("within-window estimated cost exceeds wallet returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 10;
  const walletBalance = 5;
  const extendedModelConfig = buildExtendedModelConfig({
    input_token_cost_rate: 1,
    output_token_cost_rate: 10,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertStringIncludes(result.error.message, "Insufficient funds");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: within-window and SSOT caps output at 400 → within-budget return with maxOutputTokens 400.
 * Arrange: rates and balance set so getMaxOutputTokens returns 400, initialTokenCount below window.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals 400 and equals getMaxOutputTokens; resolvedInputTokenCount equals initialTokenCount.
 */
Deno.test("within-window SSOT caps maxOutputTokens at 400", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100;
  const walletBalance = 1000;
  const extendedModelConfig = buildExtendedModelConfig({
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
    context_window_tokens: 10000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  const expectedMax = deps.getMaxOutputTokens(
    walletBalance,
    initialTokenCount,
    extendedModelConfig,
    logger,
    0,
    params.userConfig.tier_output_cap_tokens,
  );
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (isCalculateAffordabilityWithinBudgetReturn(result)) {
    assertEquals(result.maxOutputTokens, 400);
    assertEquals(result.maxOutputTokens, expectedMax);
    assertEquals(result.resolvedInputTokenCount, initialTokenCount);
  }
});

/**
 * Contract: within-window and final max_tokens_to_generate equals SSOT(final input) → within-budget return.
 * Arrange: initialTokenCount below window, rates set so getMaxOutputTokens returns 400.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals 400 and equals getMaxOutputTokens; resolvedInputTokenCount equals initialTokenCount.
 */
Deno.test("within-window max_tokens_to_generate equals SSOT of final input", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 50;
  const walletBalance = 1000;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 1000,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 500,
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  const expectedMax = deps.getMaxOutputTokens(
    walletBalance,
    initialTokenCount,
    extendedModelConfig,
    logger,
    0,
    params.userConfig.tier_output_cap_tokens,
  );
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (isCalculateAffordabilityWithinBudgetReturn(result)) {
    assertEquals(result.maxOutputTokens, 400);
    assertEquals(result.maxOutputTokens, expectedMax);
    assertEquals(result.resolvedInputTokenCount, initialTokenCount);
  }
});

/**
 * Contract: within-window and deps.getMaxOutputTokens receives params.userConfig.tier_output_cap_tokens value → within-budget return.
 * Arrange: tier_output_cap_tokens set to a number, recording getMaxOutputTokens asserts it receives that value.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals injected return; getMaxOutputTokens called with the tier cap.
 */
Deno.test("within-window getMaxOutputTokens receives tier_output_cap_tokens number", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100;
  const tierCap = 16384;
  const returnedMax = 555;
  let depsMaxCalls = 0;
  const getMaxOutputTokensDep: GetMaxOutputTokensFn = (
    _user_balance_tokens,
    _prompt_input_tokens,
    _modelConfig,
    _logger,
    _deficit_tokens_allowed,
    passedTierOutputCapTokens,
  ) => {
    depsMaxCalls += 1;
    assertEquals(passedTierOutputCapTokens, tierCap);
    return returnedMax;
  };
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
    getMaxOutputTokens: getMaxOutputTokensDep,
  });
  const params = buildCalculateAffordabilityParams({
    userConfig: { tier_output_cap_tokens: tierCap },
  });
  const payload = buildCalculateAffordabilityPayload();

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (isCalculateAffordabilityWithinBudgetReturn(result)) {
    assertEquals(result.maxOutputTokens, returnedMax);
  }
  assertEquals(depsMaxCalls >= 1, true);
});

/**
 * Contract: within-window and deps.getMaxOutputTokens receives null tier_output_cap_tokens → within-budget return.
 * Arrange: default userConfig (tier_output_cap_tokens null), recording getMaxOutputTokens asserts it receives null.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityWithinBudgetReturn; maxOutputTokens equals injected return; getMaxOutputTokens called with null.
 */
Deno.test("within-window getMaxOutputTokens receives null tier_output_cap_tokens", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100;
  const returnedMax = 777;
  let depsMaxCalls = 0;
  const getMaxOutputTokensDep: GetMaxOutputTokensFn = (
    _user_balance_tokens,
    _prompt_input_tokens,
    _modelConfig,
    _logger,
    _deficit_tokens_allowed,
    passedTierOutputCapTokens,
  ) => {
    depsMaxCalls += 1;
    assertEquals(passedTierOutputCapTokens, null);
    return returnedMax;
  };
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
    getMaxOutputTokens: getMaxOutputTokensDep,
  });
  const params = buildCalculateAffordabilityParams();
  const payload = buildCalculateAffordabilityPayload();

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(result), true);
  if (isCalculateAffordabilityWithinBudgetReturn(result)) {
    assertEquals(result.maxOutputTokens, returnedMax);
  }
  assertEquals(depsMaxCalls >= 1, true);
});

/**
 * Contract: within-window and calculateAffordability invokes deps.getMaxOutputTokens at least once.
 * Arrange: recording getMaxOutputTokens wrapping the real implementation, initialTokenCount below window.
 * Act:     calculateAffordability.
 * Assert:  getMaxOutputTokens called at least once.
 */
Deno.test("within-window calculateAffordability invokes getMaxOutputTokens at least once", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100;
  let depsMaxCalls = 0;
  const recordingGetMax: GetMaxOutputTokensFn = (
    user_balance_tokens,
    prompt_input_tokens,
    modelConfig,
    log,
    deficit_tokens_allowed,
    tierOutputCapTokens,
  ) => {
    depsMaxCalls += 1;
    return getMaxOutputTokens(
      user_balance_tokens,
      prompt_input_tokens,
      modelConfig,
      log,
      deficit_tokens_allowed,
      tierOutputCapTokens,
    );
  };
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
    getMaxOutputTokens: recordingGetMax,
  });
  const params = buildCalculateAffordabilityParams();
  const payload = buildCalculateAffordabilityPayload();

  // Act
  await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(depsMaxCalls >= 1, true);
});

/**
 * Contract: over-window and adequate balance → over-budget verdict with finalTargetThreshold, balanceAfterCompression, resolvedInputTokenCount.
 * Arrange: initialTokenCount above context_window_tokens, walletBalance large enough to pass all checks.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityOverBudgetReturn; finalTargetThreshold is a number; balanceAfterCompression is a number; resolvedInputTokenCount equals initialTokenCount.
 */
Deno.test("over-window adequate balance returns over-budget verdict", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100_000;
  const walletBalance = 10_000_000;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityOverBudgetReturn(result), true);
  if (isCalculateAffordabilityOverBudgetReturn(result)) {
    assertEquals(typeof result.finalTargetThreshold, "number");
    assertEquals(typeof result.balanceAfterCompression, "number");
    assertEquals(result.resolvedInputTokenCount, initialTokenCount);
  }
});

/**
 * Contract: over-window with documents lacking identity → over-budget verdict (identity check removed).
 * Arrange: initialTokenCount above window, resourceDocuments with empty stage_slug (fails old identity check).
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityOverBudgetReturn.
 */
Deno.test("over-window documents without identity return over-budget verdict", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100_000;
  const walletBalance = 10_000_000;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({
    extendedModelConfig,
    resourceDocuments: [buildResourceDocument({ stage_slug: "" })],
  });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityOverBudgetReturn(result), true);
});

/**
 * Contract: over-window with params carrying no inputsRelevance → over-budget verdict (inputsRelevance gate removed).
 * Arrange: initialTokenCount above window, params built without inputsRelevance (the only way to build them now).
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityOverBudgetReturn.
 */
Deno.test("over-window params without inputsRelevance return over-budget verdict", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100_000;
  const walletBalance = 10_000_000;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityOverBudgetReturn(result), true);
});

/**
 * Contract: over-window path calls deps.countTokens exactly once and reaches no other collaborator.
 * Arrange: spy on countTokens recording call count, initialTokenCount above window.
 * Act:     calculateAffordability.
 * Assert:  countTokens called exactly once; isCalculateAffordabilityOverBudgetReturn.
 */
Deno.test("over-window calls countTokens exactly once", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 100_000;
  const walletBalance = 10_000_000;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
  });
  let countTokensCalls = 0;
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({
      countTokens: () => {
        countTokensCalls += 1;
        return initialTokenCount;
      },
    }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(countTokensCalls, 1);
  assertEquals(isCalculateAffordabilityOverBudgetReturn(result), true);
});

/**
 * Contract: over-window and embeddings-inclusive NSF → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so totalEstimatedInputCostWithEmbeddings exceeds balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 */
Deno.test("over-window embeddings-inclusive NSF returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100_000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 100_000 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and estimated embedding cost exceeds 80% rationality → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so totalEstimatedInputCostWithEmbeddings exceeds 80% of balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 */
Deno.test("over-window estimated embedding cost exceeds 80% rationality returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100_000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 100_000 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and balanceAfterCompression <= 0 → error, retriable false.
 * Arrange: initialTokenCount above window, walletBalance small enough that compression cost exceeds balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 */
Deno.test("over-window balanceAfterCompression <= 0 returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100_000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 100 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and infeasible solver target → ContextWindowError, retriable false.
 * Arrange: initialTokenCount above window, output_token_cost_rate set to NaN.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error is ContextWindowError; retriable false.
 */
Deno.test("over-window infeasible solver target returns ContextWindowError", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 50_000,
    input_token_cost_rate: 0.01,
    output_token_cost_rate: Number.NaN,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100_000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 10_000_000 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and total estimated cost exceeds balance → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so total estimated cost (compression + final I/O) exceeds balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 */
Deno.test("over-window total estimated cost exceeds balance returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 80_000,
    provider_max_input_tokens: 50_000,
    input_token_cost_rate: 1,
    output_token_cost_rate: 80_000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100_000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 200_000 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and total estimated cost exceeds 80% rationality threshold → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so total estimated cost (compression + final I/O) exceeds 80% of balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; retriable false.
 */
Deno.test("over-window total estimated cost exceeds 80% rationality threshold returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 80_000,
    provider_max_input_tokens: 50_000,
    input_token_cost_rate: 1,
    output_token_cost_rate: 6_000,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => 100_000 }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance: 250_000 });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and estimated cost exceeds 80% of the user's balance → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so totalEstimatedInputCostWithEmbeddings exceeds 80% of balance but not balance itself.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error message includes "exceeds 80% of the user's balance"; retriable false.
 */
Deno.test("over-window estimated cost exceeds 80% of balance returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 500;
  const walletBalance = 1000;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 100,
    provider_max_input_tokens: 200,
    provider_max_output_tokens: 50,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertStringIncludes(result.error.message, "exceeds 80% of the user's balance");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and absolute NSF including embeddings → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so totalEstimatedInputCostWithEmbeddings exceeds balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error message includes "Insufficient funds for the entire operation"; retriable false.
 */
Deno.test("over-window absolute NSF including embeddings returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 251;
  const walletBalance = 250;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 100,
    provider_max_input_tokens: 200,
    provider_max_output_tokens: 50,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertStringIncludes(result.error.message, "Insufficient funds for the entire operation");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: over-window and total planned spend exceeds 80% budget → error, retriable false.
 * Arrange: initialTokenCount above window, rates and balance set so total estimated cost exceeds 80% of balance.
 * Act:     calculateAffordability.
 * Assert:  isCalculateAffordabilityErrorReturn; error message includes "80%"; retriable false.
 */
Deno.test("over-window total planned spend exceeds 80% budget returns error", async () => {
  // Arrange
  const logger = new MockLogger();
  const initialTokenCount = 300;
  const walletBalance = 450;
  const extendedModelConfig = buildExtendedModelConfig({
    context_window_tokens: 200,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 1000,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  });
  const deps = buildCalculateAffordabilityDeps({
    logger,
    countTokens: createMockCountTokens({ countTokens: () => initialTokenCount }),
  });
  const params = buildCalculateAffordabilityParams({ walletBalance });
  const payload = buildCalculateAffordabilityPayload({ extendedModelConfig });

  // Act
  const result = await calculateAffordability(deps, params, payload);

  // Assert
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (isCalculateAffordabilityErrorReturn(result)) {
    assertStringIncludes(result.error.message, "80%");
    assertEquals(result.retriable, false);
  }
});
