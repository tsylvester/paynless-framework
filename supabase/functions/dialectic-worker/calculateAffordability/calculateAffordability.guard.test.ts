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
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
} from "./calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
  buildMockBoundCalculateAffordabilityFn,
} from "./calculateAffordability.mock.ts";
import {
  isBoundCalculateAffordabilityFn,
  isCalculateAffordabilityCompressedReturn,
  isCalculateAffordabilityDeps,
  isCalculateAffordabilityDirectReturn,
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityParams,
  isCalculateAffordabilityPayload,
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
