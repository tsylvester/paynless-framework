// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { DbClient } from "../compressPrompt/compressPrompt.mock.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityCompressedReturn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityDirectReturn,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityFn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  GetMaxOutputTokensFn,
  TierOutputCapTokens,
  UserConfig,
} from "./calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
  buildMockBoundCalculateAffordabilityFn,
  buildMockCalculateAffordabilityFn,
  buildMockGetMaxOutputTokens,
  buildUserConfig,
  invalidateUserConfig,
} from "./calculateAffordability.mock.ts";
import {
  isBoundCalculateAffordabilityFn,
  isCalculateAffordabilityCompressedReturn,
  isCalculateAffordabilityDeps,
  isCalculateAffordabilityDirectReturn,
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityFn,
  isCalculateAffordabilityParams,
  isCalculateAffordabilityPayload,
  isGetMaxOutputTokensFn,
  isTierOutputCapTokens,
  isUserConfig,
} from "./calculateAffordability.guard.ts";

Deno.test("isCalculateAffordabilityDeps accepts valid deps and rejects invalid deps", () => {
  const valid: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps();
  assertEquals(isCalculateAffordabilityDeps(valid), true);

  assertEquals(isCalculateAffordabilityDeps(null), false);
  assertEquals(isCalculateAffordabilityDeps(undefined), false);
  assertEquals(isCalculateAffordabilityDeps({}), false);
  assertEquals(
    isCalculateAffordabilityDeps({
      logger: valid.logger,
      countTokens: valid.countTokens,
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDeps({
      logger: valid.logger,
      countTokens: valid.countTokens,
      compressPrompt: "not-a-function",
    }),
    false,
  );
});

Deno.test("isCalculateAffordabilityParams accepts valid params and rejects invalid params", () => {
  const { client } = createMockSupabaseClient();
  const valid: CalculateAffordabilityParams = buildCalculateAffordabilityParams(DbClient(client));
  assertEquals(isCalculateAffordabilityParams(valid), true);

  assertEquals(isCalculateAffordabilityParams(null), false);
  assertEquals(isCalculateAffordabilityParams(undefined), false);
  assertEquals(isCalculateAffordabilityParams({}), false);
  assertEquals(
    isCalculateAffordabilityParams({
      dbClient: valid.dbClient,
      jobId: valid.jobId,
      projectOwnerUserId: valid.projectOwnerUserId,
      sessionId: valid.sessionId,
      stageSlug: valid.stageSlug,
      walletId: valid.walletId,
      extendedModelConfig: valid.extendedModelConfig,
      inputRate: valid.inputRate,
      outputRate: valid.outputRate,
      isContinuationFlowInitial: valid.isContinuationFlowInitial,
      walletBalance: "not-a-number",
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityParams({
      dbClient: valid.dbClient,
      jobId: valid.jobId,
      projectOwnerUserId: valid.projectOwnerUserId,
      sessionId: valid.sessionId,
      stageSlug: valid.stageSlug,
      walletId: valid.walletId,
      walletBalance: valid.walletBalance,
      extendedModelConfig: valid.extendedModelConfig,
      inputRate: valid.inputRate,
      outputRate: valid.outputRate,
      isContinuationFlowInitial: valid.isContinuationFlowInitial,
      inputsRelevance: "not-an-array",
    }),
    false,
  );
});

Deno.test("isCalculateAffordabilityPayload accepts valid payload and rejects invalid payload", () => {
  const valid: CalculateAffordabilityPayload = buildCalculateAffordabilityPayload();
  assertEquals(isCalculateAffordabilityPayload(valid), true);

  assertEquals(isCalculateAffordabilityPayload(null), false);
  assertEquals(isCalculateAffordabilityPayload(undefined), false);
  assertEquals(isCalculateAffordabilityPayload({}), false);
  assertEquals(
    isCalculateAffordabilityPayload({
      compressionStrategy: valid.compressionStrategy,
      resourceDocuments: valid.resourceDocuments,
      conversationHistory: valid.conversationHistory,
      currentUserPrompt: valid.currentUserPrompt,
      systemInstruction: valid.systemInstruction,
      chatApiRequest: "not-chat-api-request",
    }),
    false,
  );
});

Deno.test("isCalculateAffordabilityDirectReturn accepts valid direct return and rejects invalid", () => {
  const valid: CalculateAffordabilityDirectReturn = buildCalculateAffordabilityDirectReturn(10);
  assertEquals(isCalculateAffordabilityDirectReturn(valid), true);

  assertEquals(isCalculateAffordabilityDirectReturn(null), false);
  assertEquals(isCalculateAffordabilityDirectReturn(undefined), false);
  assertEquals(isCalculateAffordabilityDirectReturn({}), false);
  assertEquals(
    isCalculateAffordabilityDirectReturn({
      wasCompressed: false,
      maxOutputTokens: "not-a-number",
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDirectReturn({
      wasCompressed: false,
      maxOutputTokens: 10,
      resolvedInputTokenCount: "not-a-number",
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDirectReturn({
      wasCompressed: false,
      maxOutputTokens: 10,
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDirectReturn(
      buildCalculateAffordabilityCompressedReturn(),
    ),
    false,
  );
  assertEquals(
    isCalculateAffordabilityDirectReturn(
      buildCalculateAffordabilityErrorReturn(new Error("x"), false),
    ),
    false,
  );
});

Deno.test("isCalculateAffordabilityCompressedReturn accepts valid compressed return and rejects invalid", () => {
  const valid: CalculateAffordabilityCompressedReturn = buildCalculateAffordabilityCompressedReturn({
    resolvedInputTokenCount: 10,
  });
  assertEquals(isCalculateAffordabilityCompressedReturn(valid), true);

  assertEquals(isCalculateAffordabilityCompressedReturn(null), false);
  assertEquals(isCalculateAffordabilityCompressedReturn(undefined), false);
  assertEquals(isCalculateAffordabilityCompressedReturn({}), false);
  assertEquals(
    isCalculateAffordabilityCompressedReturn({
      wasCompressed: true,
      chatApiRequest: valid.chatApiRequest,
      resolvedInputTokenCount: "not-a-number",
      resourceDocuments: valid.resourceDocuments,
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityCompressedReturn(buildCalculateAffordabilityDirectReturn(0)),
    false,
  );
  assertEquals(
    isCalculateAffordabilityCompressedReturn(
      buildCalculateAffordabilityErrorReturn(new Error("x"), false),
    ),
    false,
  );
});

Deno.test("isCalculateAffordabilityErrorReturn accepts valid error return and rejects invalid", () => {
  const valid: CalculateAffordabilityErrorReturn = buildCalculateAffordabilityErrorReturn(
    new Error("guard contract"),
    false,
  );
  assertEquals(isCalculateAffordabilityErrorReturn(valid), true);

  assertEquals(isCalculateAffordabilityErrorReturn(null), false);
  assertEquals(isCalculateAffordabilityErrorReturn(undefined), false);
  assertEquals(isCalculateAffordabilityErrorReturn({}), false);
  assertEquals(
    isCalculateAffordabilityErrorReturn({
      error: "not-error-instance",
      retriable: false,
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn({
      error: new Error("x"),
      retriable: "not-boolean",
    }),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn(buildCalculateAffordabilityDirectReturn(0)),
    false,
  );
  assertEquals(
    isCalculateAffordabilityErrorReturn(buildCalculateAffordabilityCompressedReturn()),
    false,
  );
});

Deno.test("isBoundCalculateAffordabilityFn accepts async functions and rejects non-functions", () => {
  const bound: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
  assertEquals(isBoundCalculateAffordabilityFn(bound), true);

  assertEquals(isBoundCalculateAffordabilityFn(null), false);
  assertEquals(isBoundCalculateAffordabilityFn(undefined), false);
  assertEquals(isBoundCalculateAffordabilityFn({}), false);
  assertEquals(isBoundCalculateAffordabilityFn("not-a-function"), false);
});

Deno.test("isCalculateAffordabilityParams accepts params with userConfig: { tier_output_cap_tokens: null }", () => {
  const { client } = createMockSupabaseClient();
  const params: CalculateAffordabilityParams = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: null },
  });
  assertEquals(isCalculateAffordabilityParams(params), true);
});

Deno.test("isCalculateAffordabilityParams accepts params with userConfig: { tier_output_cap_tokens: 32768 }", () => {
  const { client } = createMockSupabaseClient();
  const params: CalculateAffordabilityParams = buildCalculateAffordabilityParams(DbClient(client), {
    userConfig: { tier_output_cap_tokens: 32768 },
  });
  assertEquals(isCalculateAffordabilityParams(params), true);
});

Deno.test("isCalculateAffordabilityParams rejects params missing userConfig", () => {
  const { client } = createMockSupabaseClient();
  const valid: CalculateAffordabilityParams = buildCalculateAffordabilityParams(DbClient(client));
  const { userConfig: _userConfig, ...missingUserConfig } = valid;
  assertEquals(isCalculateAffordabilityParams(missingUserConfig), false);
});

Deno.test("isCalculateAffordabilityParams rejects params where userConfig is not a record", () => {
  const { client } = createMockSupabaseClient();
  const valid: CalculateAffordabilityParams = buildCalculateAffordabilityParams(DbClient(client));
  assertEquals(
    isCalculateAffordabilityParams({
      ...valid,
      userConfig: "not-a-record",
    }),
    false,
  );
});

Deno.test("isCalculateAffordabilityDeps rejects deps missing getMaxOutputTokens", () => {
  const valid: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps();
  const { getMaxOutputTokens: _getMaxOutputTokens, ...missingGetMaxOutputTokens } = valid;
  assertEquals(isCalculateAffordabilityDeps(missingGetMaxOutputTokens), false);
});

Deno.test("isCalculateAffordabilityDeps rejects deps with non-function getMaxOutputTokens", () => {
  const valid: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps();
  assertEquals(
    isCalculateAffordabilityDeps({
      logger: valid.logger,
      countTokens: valid.countTokens,
      compressPrompt: valid.compressPrompt,
      getMaxOutputTokens: "not-a-function",
    }),
    false,
  );
});

/** Contract: case 1 — a valid number is accepted. */
Deno.test("isTierOutputCapTokens accepts a valid number", () => {
  const value: TierOutputCapTokens = 32768;
  assertEquals(isTierOutputCapTokens(value), true);
});

/** Contract: case 2 — null is accepted. */
Deno.test("isTierOutputCapTokens accepts null", () => {
  const value: TierOutputCapTokens = null;
  assertEquals(isTierOutputCapTokens(value), true);
});

/** Contract: case 3 — undefined, string, object, boolean, and array are rejected. */
Deno.test("isTierOutputCapTokens rejects non-number non-null values", () => {
  assertEquals(isTierOutputCapTokens(undefined), false);
  assertEquals(isTierOutputCapTokens("not-a-number"), false);
  assertEquals(isTierOutputCapTokens({}), false);
  assertEquals(isTierOutputCapTokens(true), false);
  assertEquals(isTierOutputCapTokens([]), false);
});

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isUserConfig accepts the valid default", () => {
  const valid: UserConfig = buildUserConfig();
  assertEquals(isUserConfig(valid), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isUserConfig accepts valid overrides", () => {
  const valid: UserConfig = buildUserConfig({ tier_output_cap_tokens: 32768 });
  assertEquals(isUserConfig(valid), true);
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isUserConfig rejects non-objects", () => {
  assertEquals(isUserConfig(null), false);
  assertEquals(isUserConfig(undefined), false);
  assertEquals(isUserConfig("not-a-record"), false);
  assertEquals(isUserConfig(42), false);
  assertEquals(isUserConfig([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isUserConfig rejects each corrupted property", () => {
  assertEquals(
    isUserConfig(invalidateUserConfig({ tier_output_cap_tokens: "not-a-number" })),
    false,
  );
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isUserConfig rejects each omitted required property", () => {
  const { tier_output_cap_tokens: _omit, ...missing } = buildUserConfig();
  assertEquals(isUserConfig(missing), false);
});

/** Contract: case 1 — the mock function is accepted. */
Deno.test("isGetMaxOutputTokensFn accepts a function", () => {
  const fn: GetMaxOutputTokensFn = buildMockGetMaxOutputTokens();
  assertEquals(isGetMaxOutputTokensFn(fn), true);
});

/** Contract: case 3 — null, undefined, object, and string are rejected. */
Deno.test("isGetMaxOutputTokensFn rejects non-functions", () => {
  assertEquals(isGetMaxOutputTokensFn(null), false);
  assertEquals(isGetMaxOutputTokensFn(undefined), false);
  assertEquals(isGetMaxOutputTokensFn({}), false);
  assertEquals(isGetMaxOutputTokensFn("not-a-function"), false);
});

/** Contract: case 1 — the mock function is accepted. */
Deno.test("isCalculateAffordabilityFn accepts a function", () => {
  const fn: CalculateAffordabilityFn = buildMockCalculateAffordabilityFn();
  assertEquals(isCalculateAffordabilityFn(fn), true);
});

/** Contract: case 3 — null, undefined, object, and string are rejected. */
Deno.test("isCalculateAffordabilityFn rejects non-functions", () => {
  assertEquals(isCalculateAffordabilityFn(null), false);
  assertEquals(isCalculateAffordabilityFn(undefined), false);
  assertEquals(isCalculateAffordabilityFn({}), false);
  assertEquals(isCalculateAffordabilityFn("not-a-function"), false);
});
