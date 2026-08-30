// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityFn,
  CalculateAffordabilityOverBudgetReturn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityReturn,
  CalculateAffordabilitySuccessReturn,
  CalculateAffordabilityWithinBudgetReturn,
  GetMaxOutputTokensFn,
  TierOutputCapTokens,
  UserConfig,
} from "./calculateAffordability.interface.ts";

/** Contract: CalculateAffordabilityDeps requires exactly logger, countTokens, getMaxOutputTokens. */
Deno.test("CalculateAffordabilityDeps has the required surface", () => {
  const surface: Record<keyof CalculateAffordabilityDeps, true> = {
    logger: true,
    countTokens: true,
    getMaxOutputTokens: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

/** Contract: CalculateAffordabilityParams requires exactly walletBalance, userConfig. */
Deno.test("CalculateAffordabilityParams has the required surface", () => {
  const surface: Record<keyof CalculateAffordabilityParams, true> = {
    walletBalance: true,
    userConfig: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: CalculateAffordabilityPayload requires exactly extendedModelConfig, resourceDocuments, conversationHistory, currentUserPrompt, systemInstruction. */
Deno.test("CalculateAffordabilityPayload has the required surface", () => {
  const surface: Record<keyof CalculateAffordabilityPayload, true> = {
    extendedModelConfig: true,
    resourceDocuments: true,
    conversationHistory: true,
    currentUserPrompt: true,
    systemInstruction: true,
  };
  assertEquals(Object.keys(surface).length, 5);
});

/** Contract: CalculateAffordabilityWithinBudgetReturn requires exactly overBudget, maxOutputTokens, resolvedInputTokenCount. */
Deno.test("CalculateAffordabilityWithinBudgetReturn has the required surface", () => {
  const surface: Record<keyof CalculateAffordabilityWithinBudgetReturn, true> = {
    overBudget: true,
    maxOutputTokens: true,
    resolvedInputTokenCount: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

/** Contract: CalculateAffordabilityOverBudgetReturn requires exactly overBudget, resolvedInputTokenCount, finalTargetThreshold, balanceAfterCompression. */
Deno.test("CalculateAffordabilityOverBudgetReturn has the required surface", () => {
  const surface: Record<keyof CalculateAffordabilityOverBudgetReturn, true> = {
    overBudget: true,
    resolvedInputTokenCount: true,
    finalTargetThreshold: true,
    balanceAfterCompression: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

/** Contract: CalculateAffordabilityErrorReturn requires exactly error, retriable. */
Deno.test("CalculateAffordabilityErrorReturn has the required surface", () => {
  const surface: Record<keyof CalculateAffordabilityErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: UserConfig requires exactly tier_output_cap_tokens. */
Deno.test("UserConfig has the required surface", () => {
  const surface: Record<keyof UserConfig, true> = {
    tier_output_cap_tokens: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: both success flavors assign to CalculateAffordabilitySuccessReturn which assigns to CalculateAffordabilityReturn, and CalculateAffordabilityErrorReturn assigns to CalculateAffordabilityReturn — flavors nested inside the success arm. */
Deno.test("CalculateAffordabilityReturn is a two-arm union with flavors nested in the success arm", () => {
  const within: CalculateAffordabilityWithinBudgetReturn = {
    overBudget: false,
    maxOutputTokens: 100,
    resolvedInputTokenCount: 50,
  };
  const successFromWithin: CalculateAffordabilitySuccessReturn = within;
  const returnFromWithin: CalculateAffordabilityReturn = successFromWithin;
  assertEquals(returnFromWithin === within, true);

  const over: CalculateAffordabilityOverBudgetReturn = {
    overBudget: true,
    resolvedInputTokenCount: 50,
    finalTargetThreshold: 30,
    balanceAfterCompression: 200,
  };
  const successFromOver: CalculateAffordabilitySuccessReturn = over;
  const returnFromOver: CalculateAffordabilityReturn = successFromOver;
  assertEquals(returnFromOver === over, true);

  const err: CalculateAffordabilityErrorReturn = {
    error: new Error("mock-affordability-error"),
    retriable: false,
  };
  const returnFromError: CalculateAffordabilityReturn = err;
  assertEquals(returnFromError === err, true);
});

/** Contract: the within-budget flavor carries overBudget false with maxOutputTokens and resolvedInputTokenCount; the over-budget flavor carries overBudget true with resolvedInputTokenCount, finalTargetThreshold and balanceAfterCompression. */
Deno.test("each success flavor carries its declared members by typed literal", () => {
  const withinBudget: CalculateAffordabilityWithinBudgetReturn = {
    overBudget: false,
    maxOutputTokens: 256,
    resolvedInputTokenCount: 128,
  };
  assertEquals(withinBudget.overBudget, false);
  assertEquals(typeof withinBudget.maxOutputTokens, "number");
  assertEquals(typeof withinBudget.resolvedInputTokenCount, "number");

  const overBudget: CalculateAffordabilityOverBudgetReturn = {
    overBudget: true,
    resolvedInputTokenCount: 128,
    finalTargetThreshold: 64,
    balanceAfterCompression: 500,
  };
  assertEquals(overBudget.overBudget, true);
  assertEquals(typeof overBudget.resolvedInputTokenCount, "number");
  assertEquals(typeof overBudget.finalTargetThreshold, "number");
  assertEquals(typeof overBudget.balanceAfterCompression, "number");
});

/** Contract: CalculateAffordabilityFn and BoundCalculateAffordabilityFn return Promise<CalculateAffordabilityReturn>. */
Deno.test("CalculateAffordabilityFn and BoundCalculateAffordabilityFn resolve to CalculateAffordabilityReturn", () => {
  const success: CalculateAffordabilitySuccessReturn = {
    overBudget: false,
    maxOutputTokens: 100,
    resolvedInputTokenCount: 50,
  };

  const fnReturned: ReturnType<CalculateAffordabilityFn> = Promise.resolve(success);
  const fnDeclared: Promise<CalculateAffordabilityReturn> = fnReturned;
  assertEquals(fnDeclared instanceof Promise, true);

  const boundReturned: ReturnType<BoundCalculateAffordabilityFn> = Promise.resolve(success);
  const boundDeclared: Promise<CalculateAffordabilityReturn> = boundReturned;
  assertEquals(boundDeclared instanceof Promise, true);
});

/** Contract: GetMaxOutputTokensFn returns number. */
Deno.test("GetMaxOutputTokensFn returns number", () => {
  const result: ReturnType<GetMaxOutputTokensFn> = 0;
  const declared: number = result;
  assertEquals(declared, 0);
});

/** Contract: TierOutputCapTokens admits null and number. */
Deno.test("TierOutputCapTokens admits null and number", () => {
  const whenNull: TierOutputCapTokens = null;
  const whenNumber: TierOutputCapTokens = 32768;
  assertEquals(whenNull, null);
  assertEquals(whenNumber, 32768);
});

/** Contract: UserConfig.tier_output_cap_tokens is TierOutputCapTokens, accepting null and number. */
Deno.test("UserConfig shape has exactly tier_output_cap_tokens number | null", () => {
  const uc: UserConfig = { tier_output_cap_tokens: null };
  const uc2: UserConfig = { tier_output_cap_tokens: 32768 };
  assertEquals(uc.tier_output_cap_tokens, null);
  assertEquals(uc2.tier_output_cap_tokens, 32768);
});

/** Contract: CalculateAffordabilityParams.userConfig is UserConfig per interface. */
Deno.test(
  "CalculateAffordabilityParams contract: userConfig is UserConfig per interface",
  () => {
    const whenNull: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: null };
    const whenNumber: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: 32768 };
    assertEquals(whenNull.tier_output_cap_tokens, null);
    assertEquals(whenNumber.tier_output_cap_tokens, 32768);
  },
);

/** Contract: UserConfig with tier_output_cap_tokens null is valid. */
Deno.test("userConfig with tier_output_cap_tokens null is valid", () => {
  const userConfig: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: null };
  assertEquals(userConfig.tier_output_cap_tokens, null);
});

/** Contract: UserConfig with tier_output_cap_tokens 32768 is valid. */
Deno.test("userConfig with tier_output_cap_tokens 32768 is valid", () => {
  const userConfig: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: 32768 };
  assertEquals(userConfig.tier_output_cap_tokens, 32768);
});

/** Contract: getMaxOutputTokens is a required key of CalculateAffordabilityDeps. */
Deno.test("CalculateAffordabilityDeps contract: getMaxOutputTokens is a required key", () => {
  const key: keyof CalculateAffordabilityDeps = "getMaxOutputTokens";
  assertEquals(key, "getMaxOutputTokens");
});
