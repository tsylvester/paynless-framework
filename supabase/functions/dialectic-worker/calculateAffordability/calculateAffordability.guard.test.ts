// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
import {
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityOverBudgetReturn,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
  buildCalculateAffordabilityWithinBudgetReturn,
  buildUserConfig,
  invalidateCalculateAffordabilityDeps,
  invalidateCalculateAffordabilityErrorReturn,
  invalidateCalculateAffordabilityOverBudgetReturn,
  invalidateCalculateAffordabilityParams,
  invalidateCalculateAffordabilityPayload,
  invalidateCalculateAffordabilityWithinBudgetReturn,
  invalidateUserConfig,
  mockBoundCalculateAffordability,
  mockCalculateAffordability,
  mockGetMaxOutputTokens,
} from "./calculateAffordability.mock.ts";
import {
  isBoundCalculateAffordabilityFn,
  isCalculateAffordabilityDeps,
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityFn,
  isCalculateAffordabilityOverBudgetReturn,
  isCalculateAffordabilityParams,
  isCalculateAffordabilityPayload,
  isCalculateAffordabilityWithinBudgetReturn,
  isGetMaxOutputTokensFn,
  isTierOutputCapTokens,
  isUserConfig,
} from "./calculateAffordability.guard.ts";

/** the builder's valid default is accepted. */
Deno.test("isCalculateAffordabilityDeps accepts the valid default", () => {
  const valid: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps();
  assertEquals(isCalculateAffordabilityDeps(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isCalculateAffordabilityDeps accepts valid overrides", () => {
  const valid: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
    getMaxOutputTokens: mockGetMaxOutputTokens,
  });
  assertEquals(isCalculateAffordabilityDeps(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCalculateAffordabilityDeps rejects non-objects", () => {
  assertEquals(isCalculateAffordabilityDeps(null), false);
  assertEquals(isCalculateAffordabilityDeps(undefined), false);
  assertEquals(isCalculateAffordabilityDeps("not-a-record"), false);
  assertEquals(isCalculateAffordabilityDeps(42), false);
  assertEquals(isCalculateAffordabilityDeps([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCalculateAffordabilityDeps rejects each corrupted property", () => {
  assertEquals(
    isCalculateAffordabilityDeps(invalidateCalculateAffordabilityDeps({ logger: "not-a-record" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDeps(invalidateCalculateAffordabilityDeps({ countTokens: "not-a-function" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDeps(invalidateCalculateAffordabilityDeps({ getMaxOutputTokens: "not-a-function" })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCalculateAffordabilityDeps rejects each omitted required property", () => {
  const { logger: _omitLogger, ...missingLogger } = buildCalculateAffordabilityDeps();
  assertEquals(isCalculateAffordabilityDeps(missingLogger), false);

  const { countTokens: _omitCountTokens, ...missingCountTokens } = buildCalculateAffordabilityDeps();
  assertEquals(isCalculateAffordabilityDeps(missingCountTokens), false);

  const { getMaxOutputTokens: _omitGetMax, ...missingGetMax } = buildCalculateAffordabilityDeps();
  assertEquals(isCalculateAffordabilityDeps(missingGetMax), false);
});

/** the builder's valid default is accepted. */
Deno.test("isCalculateAffordabilityParams accepts the valid default", () => {
  const valid: CalculateAffordabilityParams = buildCalculateAffordabilityParams();
  assertEquals(isCalculateAffordabilityParams(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isCalculateAffordabilityParams accepts valid overrides", () => {
  const valid: CalculateAffordabilityParams = buildCalculateAffordabilityParams({
    walletBalance: 500,
  });
  assertEquals(isCalculateAffordabilityParams(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCalculateAffordabilityParams rejects non-objects", () => {
  assertEquals(isCalculateAffordabilityParams(null), false);
  assertEquals(isCalculateAffordabilityParams(undefined), false);
  assertEquals(isCalculateAffordabilityParams("not-a-record"), false);
  assertEquals(isCalculateAffordabilityParams(42), false);
  assertEquals(isCalculateAffordabilityParams([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCalculateAffordabilityParams rejects each corrupted property", () => {
  assertEquals(
    isCalculateAffordabilityParams(invalidateCalculateAffordabilityParams({ walletBalance: "not-a-number" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityParams(invalidateCalculateAffordabilityParams({ userConfig: "not-a-record" })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCalculateAffordabilityParams rejects each omitted required property", () => {
  const { walletBalance: _omitWalletBalance, ...missingWalletBalance } = buildCalculateAffordabilityParams();
  assertEquals(isCalculateAffordabilityParams(missingWalletBalance), false);

  const { userConfig: _omitUserConfig, ...missingUserConfig } = buildCalculateAffordabilityParams();
  assertEquals(isCalculateAffordabilityParams(missingUserConfig), false);
});

/** the builder's valid default is accepted. */
Deno.test("isCalculateAffordabilityPayload accepts the valid default", () => {
  const valid: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isCalculateAffordabilityPayload accepts valid overrides", () => {
  const valid: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload({
    currentUserPrompt: "overridden prompt",
  });
  assertEquals(isCalculateAffordabilityPayload(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCalculateAffordabilityPayload rejects non-objects", () => {
  assertEquals(isCalculateAffordabilityPayload(null), false);
  assertEquals(isCalculateAffordabilityPayload(undefined), false);
  assertEquals(isCalculateAffordabilityPayload("not-a-record"), false);
  assertEquals(isCalculateAffordabilityPayload(42), false);
  assertEquals(isCalculateAffordabilityPayload([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCalculateAffordabilityPayload rejects each corrupted property", () => {
  assertEquals(
    isCalculateAffordabilityPayload(invalidateCalculateAffordabilityPayload({ extendedModelConfig: "not-a-record" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityPayload(invalidateCalculateAffordabilityPayload({ resourceDocuments: "not-an-array" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityPayload(invalidateCalculateAffordabilityPayload({ conversationHistory: "not-an-array" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityPayload(invalidateCalculateAffordabilityPayload({ currentUserPrompt: 42 })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityPayload(invalidateCalculateAffordabilityPayload({ systemInstruction: 42 })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCalculateAffordabilityPayload rejects each omitted required property", () => {
  const { extendedModelConfig: _omitExtendedModelConfig, ...missingExtendedModelConfig } = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(missingExtendedModelConfig), false);

  const { resourceDocuments: _omitResourceDocuments, ...missingResourceDocuments } = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(missingResourceDocuments), false);

  const { conversationHistory: _omitConversationHistory, ...missingConversationHistory } = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(missingConversationHistory), false);

  const { currentUserPrompt: _omitCurrentUserPrompt, ...missingCurrentUserPrompt } = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(missingCurrentUserPrompt), false);

  const { systemInstruction: _omitSystemInstruction, ...missingSystemInstruction } = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(missingSystemInstruction), false);
});

/** the builder's valid default is accepted. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn accepts the valid default", () => {
  const valid: CalculateAffordabilityWithinBudgetReturn = buildCalculateAffordabilityWithinBudgetReturn();
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn accepts valid overrides", () => {
  const valid: CalculateAffordabilityWithinBudgetReturn = buildCalculateAffordabilityWithinBudgetReturn({
    maxOutputTokens: 200,
  });
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn rejects non-objects", () => {
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(null), false);
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(undefined), false);
  assertEquals(isCalculateAffordabilityWithinBudgetReturn("not-a-record"), false);
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(42), false);
  assertEquals(isCalculateAffordabilityWithinBudgetReturn([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn rejects each corrupted property", () => {
  assertEquals(
    isCalculateAffordabilityWithinBudgetReturn(invalidateCalculateAffordabilityWithinBudgetReturn({ overBudget: "not-a-boolean" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityWithinBudgetReturn(invalidateCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: "not-a-number" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityWithinBudgetReturn(invalidateCalculateAffordabilityWithinBudgetReturn({ resolvedInputTokenCount: "not-a-number" })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn rejects each omitted required property", () => {
  const { overBudget: _omitOverBudget, ...missingOverBudget } = buildCalculateAffordabilityWithinBudgetReturn();
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(missingOverBudget), false);

  const { maxOutputTokens: _omitMaxOutputTokens, ...missingMaxOutputTokens } = buildCalculateAffordabilityWithinBudgetReturn();
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(missingMaxOutputTokens), false);

  const { resolvedInputTokenCount: _omitResolvedInputTokenCount, ...missingResolvedInputTokenCount } = buildCalculateAffordabilityWithinBudgetReturn();
  assertEquals(isCalculateAffordabilityWithinBudgetReturn(missingResolvedInputTokenCount), false);
});

/** rejects the other flavor. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn rejects the over-budget flavor", () => {
  assertEquals(
    isCalculateAffordabilityWithinBudgetReturn(buildCalculateAffordabilityOverBudgetReturn()),
    false,
  );
});

/** rejects a built error return. */
Deno.test("isCalculateAffordabilityWithinBudgetReturn rejects an error return", () => {
  assertEquals(
    isCalculateAffordabilityWithinBudgetReturn(buildCalculateAffordabilityErrorReturn()),
    false,
  );
});

/** the builder's valid default is accepted. */
Deno.test("isCalculateAffordabilityOverBudgetReturn accepts the valid default", () => {
  const valid: CalculateAffordabilityOverBudgetReturn = buildCalculateAffordabilityOverBudgetReturn();
  assertEquals(isCalculateAffordabilityOverBudgetReturn(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isCalculateAffordabilityOverBudgetReturn accepts valid overrides", () => {
  const valid: CalculateAffordabilityOverBudgetReturn = buildCalculateAffordabilityOverBudgetReturn({
    finalTargetThreshold: 1000,
  });
  assertEquals(isCalculateAffordabilityOverBudgetReturn(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCalculateAffordabilityOverBudgetReturn rejects non-objects", () => {
  assertEquals(isCalculateAffordabilityOverBudgetReturn(null), false);
  assertEquals(isCalculateAffordabilityOverBudgetReturn(undefined), false);
  assertEquals(isCalculateAffordabilityOverBudgetReturn("not-a-record"), false);
  assertEquals(isCalculateAffordabilityOverBudgetReturn(42), false);
  assertEquals(isCalculateAffordabilityOverBudgetReturn([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCalculateAffordabilityOverBudgetReturn rejects each corrupted property", () => {
  assertEquals(
    isCalculateAffordabilityOverBudgetReturn(invalidateCalculateAffordabilityOverBudgetReturn({ overBudget: "not-a-boolean" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityOverBudgetReturn(invalidateCalculateAffordabilityOverBudgetReturn({ resolvedInputTokenCount: "not-a-number" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityOverBudgetReturn(invalidateCalculateAffordabilityOverBudgetReturn({ finalTargetThreshold: "not-a-number" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityOverBudgetReturn(invalidateCalculateAffordabilityOverBudgetReturn({ balanceAfterCompression: "not-a-number" })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCalculateAffordabilityOverBudgetReturn rejects each omitted required property", () => {
  const { overBudget: _omitOverBudget, ...missingOverBudget } = buildCalculateAffordabilityOverBudgetReturn();
  assertEquals(isCalculateAffordabilityOverBudgetReturn(missingOverBudget), false);

  const { resolvedInputTokenCount: _omitResolvedInputTokenCount, ...missingResolvedInputTokenCount } = buildCalculateAffordabilityOverBudgetReturn();
  assertEquals(isCalculateAffordabilityOverBudgetReturn(missingResolvedInputTokenCount), false);

  const { finalTargetThreshold: _omitFinalTargetThreshold, ...missingFinalTargetThreshold } = buildCalculateAffordabilityOverBudgetReturn();
  assertEquals(isCalculateAffordabilityOverBudgetReturn(missingFinalTargetThreshold), false);

  const { balanceAfterCompression: _omitBalanceAfterCompression, ...missingBalanceAfterCompression } = buildCalculateAffordabilityOverBudgetReturn();
  assertEquals(isCalculateAffordabilityOverBudgetReturn(missingBalanceAfterCompression), false);
});

/** rejects the other flavor. */
Deno.test("isCalculateAffordabilityOverBudgetReturn rejects the within-budget flavor", () => {
  assertEquals(
    isCalculateAffordabilityOverBudgetReturn(buildCalculateAffordabilityWithinBudgetReturn()),
    false,
  );
});

/** rejects a built error return. */
Deno.test("isCalculateAffordabilityOverBudgetReturn rejects an error return", () => {
  assertEquals(
    isCalculateAffordabilityOverBudgetReturn(buildCalculateAffordabilityErrorReturn()),
    false,
  );
});

/** the builder's valid default is accepted. */
Deno.test("isCalculateAffordabilityErrorReturn accepts the valid default", () => {
  const valid: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn();
  assertEquals(isCalculateAffordabilityErrorReturn(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isCalculateAffordabilityErrorReturn accepts valid overrides", () => {
  const valid: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn({
    retriable: true,
  });
  assertEquals(isCalculateAffordabilityErrorReturn(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isCalculateAffordabilityErrorReturn rejects non-objects", () => {
  assertEquals(isCalculateAffordabilityErrorReturn(null), false);
  assertEquals(isCalculateAffordabilityErrorReturn(undefined), false);
  assertEquals(isCalculateAffordabilityErrorReturn("not-a-record"), false);
  assertEquals(isCalculateAffordabilityErrorReturn(42), false);
  assertEquals(isCalculateAffordabilityErrorReturn([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isCalculateAffordabilityErrorReturn rejects each corrupted property", () => {
  assertEquals(
    isCalculateAffordabilityErrorReturn(invalidateCalculateAffordabilityErrorReturn({ error: "not-an-error" })),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn(invalidateCalculateAffordabilityErrorReturn({ retriable: "not-a-boolean" })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isCalculateAffordabilityErrorReturn rejects each omitted required property", () => {
  const { error: _omitError, ...missingError } = buildCalculateAffordabilityErrorReturn();
  assertEquals(isCalculateAffordabilityErrorReturn(missingError), false);

  const { retriable: _omitRetriable, ...missingRetriable } = buildCalculateAffordabilityErrorReturn();
  assertEquals(isCalculateAffordabilityErrorReturn(missingRetriable), false);
});

/** an error return carrying overBudget, maxOutputTokens, finalTargetThreshold or balanceAfterCompression is rejected. */
Deno.test("isCalculateAffordabilityErrorReturn rejects error returns carrying flavor members", () => {
  const valid: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn();
  assertEquals(
    isCalculateAffordabilityErrorReturn({ ...valid, overBudget: false }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn({ ...valid, maxOutputTokens: 100 }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn({ ...valid, finalTargetThreshold: 50 }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn({ ...valid, balanceAfterCompression: 200 }),
    false,
  );
});

/** the mock function is accepted. */
Deno.test("isCalculateAffordabilityFn accepts a function", () => {
  const fn: CalculateAffordabilityFn = mockCalculateAffordability;
  assertEquals(isCalculateAffordabilityFn(fn), true);
});

/** null, undefined, object, and string are rejected. */
Deno.test("isCalculateAffordabilityFn rejects non-functions", () => {
  assertEquals(isCalculateAffordabilityFn(null), false);
  assertEquals(isCalculateAffordabilityFn(undefined), false);
  assertEquals(isCalculateAffordabilityFn({}), false);
  assertEquals(isCalculateAffordabilityFn("not-a-function"), false);
});

/** the mock function is accepted. */
Deno.test("isBoundCalculateAffordabilityFn accepts a function", () => {
  const fn: BoundCalculateAffordabilityFn = mockBoundCalculateAffordability;
  assertEquals(isBoundCalculateAffordabilityFn(fn), true);
});

/** null, undefined, object, and string are rejected. */
Deno.test("isBoundCalculateAffordabilityFn rejects non-functions", () => {
  assertEquals(isBoundCalculateAffordabilityFn(null), false);
  assertEquals(isBoundCalculateAffordabilityFn(undefined), false);
  assertEquals(isBoundCalculateAffordabilityFn({}), false);
  assertEquals(isBoundCalculateAffordabilityFn("not-a-function"), false);
});

/** a valid number is accepted. */
Deno.test("isTierOutputCapTokens accepts a valid number", () => {
  const value: TierOutputCapTokens = 32768;
  assertEquals(isTierOutputCapTokens(value), true);
});

/** null is accepted. */
Deno.test("isTierOutputCapTokens accepts null", () => {
  const value: TierOutputCapTokens = null;
  assertEquals(isTierOutputCapTokens(value), true);
});

/** undefined, string, object, boolean, and array are rejected. */
Deno.test("isTierOutputCapTokens rejects non-number non-null values", () => {
  assertEquals(isTierOutputCapTokens(undefined), false);
  assertEquals(isTierOutputCapTokens("not-a-number"), false);
  assertEquals(isTierOutputCapTokens({}), false);
  assertEquals(isTierOutputCapTokens(true), false);
  assertEquals(isTierOutputCapTokens([]), false);
});

/** the builder's valid default is accepted. */
Deno.test("isUserConfig accepts the valid default", () => {
  const valid: UserConfig = buildUserConfig();
  assertEquals(isUserConfig(valid), true);
});

/** valid overrides are accepted. */
Deno.test("isUserConfig accepts valid overrides", () => {
  const valid: UserConfig = buildUserConfig({ tier_output_cap_tokens: 32768 });
  assertEquals(isUserConfig(valid), true);
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isUserConfig rejects non-objects", () => {
  assertEquals(isUserConfig(null), false);
  assertEquals(isUserConfig(undefined), false);
  assertEquals(isUserConfig("not-a-record"), false);
  assertEquals(isUserConfig(42), false);
  assertEquals(isUserConfig([]), false);
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isUserConfig rejects each corrupted property", () => {
  assertEquals(
    isUserConfig(invalidateUserConfig({ tier_output_cap_tokens: "not-a-number" })),
    false,
  );
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isUserConfig rejects each omitted required property", () => {
  const { tier_output_cap_tokens: _omit, ...missing } = buildUserConfig();
  assertEquals(isUserConfig(missing), false);
});

/** the mock function is accepted. */
Deno.test("isGetMaxOutputTokensFn accepts a function", () => {
  const fn: GetMaxOutputTokensFn = mockGetMaxOutputTokens;
  assertEquals(isGetMaxOutputTokensFn(fn), true);
});

/** null, undefined, object, and string are rejected. */
Deno.test("isGetMaxOutputTokensFn rejects non-functions", () => {
  assertEquals(isGetMaxOutputTokensFn(null), false);
  assertEquals(isGetMaxOutputTokensFn(undefined), false);
  assertEquals(isGetMaxOutputTokensFn({}), false);
  assertEquals(isGetMaxOutputTokensFn("not-a-function"), false);
});
