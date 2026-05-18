// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import type {
  CalculateAffordabilityCompressedReturn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityDirectReturn,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityParams,
  CalculateAffordabilityReturn,
  UserConfig,
} from "./calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
} from "./calculateAffordability.mock.ts";

Deno.test("calculateAffordability contract: valid non-oversized adequate balance shape", () => {
  const result: CalculateAffordabilityDirectReturn = buildCalculateAffordabilityDirectReturn(0);
  assertEquals(result.wasCompressed, false);
  assertEquals(typeof result.maxOutputTokens, "number");
  assertEquals(result.maxOutputTokens >= 0, true);
  assertEquals(typeof result.resolvedInputTokenCount, "number");
  assertEquals(result.resolvedInputTokenCount >= 0, true);
  assertEquals("error" in result, false);
});

Deno.test("calculateAffordability contract: valid oversized compress success shape", () => {
  const result: CalculateAffordabilityCompressedReturn = buildCalculateAffordabilityCompressedReturn({
    resolvedInputTokenCount: 0,
  });
  assertEquals(result.wasCompressed, true);
  assertEquals(typeof result.chatApiRequest, "object");
  assertEquals(typeof result.resolvedInputTokenCount, "number");
  assertEquals(result.resolvedInputTokenCount >= 0, true);
  assertEquals("error" in result, false);
});

Deno.test("calculateAffordability contract: invalid non-oversized NSF shape", () => {
  const err: Error = new Error(
    "Insufficient funds: estimated total cost (99) exceeds wallet balance (1).",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "Insufficient funds");
    assertEquals(result.retriable, false);
    assertEquals("wasCompressed" in result, false);
  }
});

Deno.test("calculateAffordability contract: invalid context window exhausted shape", () => {
  const err: ContextWindowError = new ContextWindowError(
    "No input window remains after reserving output budget.",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
    assertEquals("wasCompressed" in result, false);
  }
});

Deno.test("calculateAffordability contract: invalid oversized NSF for entire operation including embeddings", () => {
  const err: Error = new Error(
    "Insufficient funds for the entire operation (including embeddings). Estimated cost: 500, Balance: 100",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "Insufficient funds for the entire operation");
    assertEquals(result.retriable, false);
  }
});

Deno.test("calculateAffordability contract: invalid oversized estimated cost exceeds 80% rationality threshold", () => {
  const err: Error = new Error(
    "Estimated cost (900) exceeds 80% of the user's balance (1000).",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("calculateAffordability contract: invalid oversized balanceAfterCompression <= 0 shape", () => {
  const err: Error = new Error(
    "Insufficient funds: compression requires 500 tokens, balance is 400.",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "Insufficient funds: compression requires");
    assertEquals(result.retriable, false);
  }
});

Deno.test("calculateAffordability contract: invalid oversized infeasible solver target shape", () => {
  const err: ContextWindowError = new ContextWindowError(
    "Unable to determine a feasible input size target given current balance.",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("calculateAffordability contract: invalid oversized total estimated cost exceeds balance", () => {
  const err: Error = new Error(
    "Insufficient funds: total estimated cost (compression + final I/O) 900 exceeds balance 800.",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("calculateAffordability contract: invalid oversized total estimated cost exceeds 80% rationality threshold", () => {
  const err: Error = new Error(
    "Estimated cost (850) exceeds 80% of the user's balance (1000).",
  );
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(err, false);
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("calculateAffordability contract: invalid compressPrompt error propagated shape", () => {
  const propagated: Error = new Error("compressPrompt failure body");
  const result: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(
    propagated,
    false,
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error, propagated);
    assertEquals("wasCompressed" in result, false);
  }
});

Deno.test("calculateAffordability contract: union result accepts direct branch", () => {
  const result: CalculateAffordabilityReturn = buildCalculateAffordabilityDirectReturn(10);
  assertEquals("wasCompressed" in result && result.wasCompressed === false, true);
});

Deno.test("calculateAffordability contract: union result accepts compressed branch", () => {
  const result: CalculateAffordabilityReturn = buildCalculateAffordabilityCompressedReturn();
  assertEquals("wasCompressed" in result && result.wasCompressed === true, true);
});

Deno.test("calculateAffordability contract: union result accepts error branch", () => {
  const result: CalculateAffordabilityReturn = buildCalculateAffordabilityErrorReturn(
    new Error("union error"),
    false,
  );
  assertEquals("error" in result, true);
});

Deno.test("UserConfig shape has exactly tier_output_cap_tokens number | null", () => {
  const uc: UserConfig = { tier_output_cap_tokens: null };
  const uc2: UserConfig = { tier_output_cap_tokens: 32768 };
  assertEquals(uc.tier_output_cap_tokens, null);
  assertEquals(uc2.tier_output_cap_tokens, 32768);
});

Deno.test(
  "CalculateAffordabilityParams contract: userConfig is UserConfig per interface",
  () => {
    const whenNull: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: null };
    const whenNumber: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: 32768 };
    assertEquals(whenNull.tier_output_cap_tokens, null);
    assertEquals(whenNumber.tier_output_cap_tokens, 32768);
  },
);

Deno.test("userConfig with tier_output_cap_tokens null is valid", () => {
  const userConfig: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: null };
  assertEquals(userConfig.tier_output_cap_tokens, null);
});

Deno.test("userConfig with tier_output_cap_tokens 32768 is valid", () => {
  const userConfig: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: 32768 };
  assertEquals(userConfig.tier_output_cap_tokens, 32768);
});

Deno.test("CalculateAffordabilityDeps contract: getMaxOutputTokens is a required key", () => {
  const key: keyof CalculateAffordabilityDeps = "getMaxOutputTokens";
  assertEquals(key, "getMaxOutputTokens");
});
