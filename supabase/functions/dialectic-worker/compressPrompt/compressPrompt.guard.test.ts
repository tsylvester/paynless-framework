// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.guard.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptSuccessReturn,
} from "./compressPrompt.interface.ts";
import {
  isBoundCompressPromptFn,
  isCompressPromptDeps,
  isCompressPromptErrorReturn,
  isCompressPromptParams,
  isCompressPromptPayload,
  isCompressPromptSuccessReturn,
} from "./compressPrompt.guard.ts";
import {
  buildCompressPromptErrorReturn,
  buildCompressPromptSuccessReturn,
  buildChatApiRequest,
  buildCompressPromptDeps,
  buildCompressPromptPayload,
  buildResourceDocument,
  buildCompressPromptParams,
  createCompressPromptMock,
  DbClient,
} from "./compressPrompt.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";

Deno.test("isCompressPromptDeps accepts valid deps and rejects invalid deps", () => {
  const valid: CompressPromptDeps = buildCompressPromptDeps();
  assertEquals(isCompressPromptDeps(valid), true);

  assertEquals(isCompressPromptDeps(null), false);
  assertEquals(isCompressPromptDeps(undefined), false);
  assertEquals(isCompressPromptDeps({}), false);
  assertEquals(
    isCompressPromptDeps({
      logger: valid.logger,
      ragService: valid.ragService,
      embeddingClient: valid.embeddingClient,
      tokenWalletService: valid.tokenWalletService,
    }),
    false,
  );
  assertEquals(
    isCompressPromptDeps({
      logger: valid.logger,
      ragService: valid.ragService,
      embeddingClient: valid.embeddingClient,
      tokenWalletService: valid.tokenWalletService,
      countTokens: "not-a-function",
    }),
    false,
  );
});

Deno.test("isCompressPromptParams accepts valid params and rejects invalid params", () => {
  const { client } = createMockSupabaseClient();
  const valid: CompressPromptParams = buildCompressPromptParams(DbClient(client));
  assertEquals(isCompressPromptParams(valid), true);

  assertEquals(isCompressPromptParams(null), false);
  assertEquals(isCompressPromptParams(undefined), false);
  assertEquals(isCompressPromptParams({}), false);
  assertEquals(
    isCompressPromptParams({
      dbClient: valid.dbClient,
      jobId: valid.jobId,
      projectOwnerUserId: valid.projectOwnerUserId,
      sessionId: valid.sessionId,
      stageSlug: valid.stageSlug,
      walletId: valid.walletId,
      extendedModelConfig: valid.extendedModelConfig,
      inputsRelevance: valid.inputsRelevance,
      inputRate: valid.inputRate,
      outputRate: valid.outputRate,
      isContinuationFlowInitial: valid.isContinuationFlowInitial,
      finalTargetThreshold: valid.finalTargetThreshold,
      balanceAfterCompression: valid.balanceAfterCompression,
      walletBalance: "not-a-number",
    }),
    false,
  );
  assertEquals(
    isCompressPromptParams({
      dbClient: valid.dbClient,
      jobId: valid.jobId,
      projectOwnerUserId: valid.projectOwnerUserId,
      sessionId: valid.sessionId,
      stageSlug: valid.stageSlug,
      walletId: valid.walletId,
      extendedModelConfig: valid.extendedModelConfig,
      inputsRelevance: "not-an-array",
      inputRate: valid.inputRate,
      outputRate: valid.outputRate,
      isContinuationFlowInitial: valid.isContinuationFlowInitial,
      finalTargetThreshold: valid.finalTargetThreshold,
      balanceAfterCompression: valid.balanceAfterCompression,
      walletBalance: valid.walletBalance,
    }),
    false,
  );
});

Deno.test("isCompressPromptPayload accepts valid payload and rejects invalid payload", () => {
  const valid: CompressPromptPayload = buildCompressPromptPayload();
  assertEquals(isCompressPromptPayload(valid), true);

  assertEquals(isCompressPromptPayload(null), false);
  assertEquals(isCompressPromptPayload(undefined), false);
  assertEquals(isCompressPromptPayload({}), false);
  assertEquals(
    isCompressPromptPayload({
      compressionStrategy: valid.compressionStrategy,
      resourceDocuments: valid.resourceDocuments,
      conversationHistory: valid.conversationHistory,
      currentUserPrompt: valid.currentUserPrompt,
      chatApiRequest: valid.chatApiRequest,
      tokenizerDeps: "not-deps",
    }),
    false,
  );
});

Deno.test("isCompressPromptSuccessReturn accepts valid success and rejects invalid", () => {
  const resourceDocuments = [buildResourceDocument()];
  const chatApiRequest = buildChatApiRequest(resourceDocuments, "p");
  const valid: CompressPromptSuccessReturn = buildCompressPromptSuccessReturn({
    chatApiRequest,
    resolvedInputTokenCount: 10,
    resourceDocuments,
  });
  assertEquals(isCompressPromptSuccessReturn(valid), true);

  assertEquals(isCompressPromptSuccessReturn(null), false);
  assertEquals(isCompressPromptSuccessReturn(undefined), false);
  assertEquals(isCompressPromptSuccessReturn({}), false);
  assertEquals(
    isCompressPromptSuccessReturn({
      chatApiRequest: valid.chatApiRequest,
      resolvedInputTokenCount: "not-a-number",
      resourceDocuments: valid.resourceDocuments,
    }),
    false,
  );
  assertEquals(
    isCompressPromptSuccessReturn(buildCompressPromptErrorReturn(new Error("x"), false)),
    false,
  );
});

Deno.test("isCompressPromptErrorReturn accepts valid error return and rejects invalid", () => {
  const valid: CompressPromptErrorReturn = buildCompressPromptErrorReturn(new Error("guard contract"), false);
  assertEquals(isCompressPromptErrorReturn(valid), true);

  assertEquals(isCompressPromptErrorReturn(null), false);
  assertEquals(isCompressPromptErrorReturn(undefined), false);
  assertEquals(isCompressPromptErrorReturn({}), false);
  assertEquals(
    isCompressPromptErrorReturn({
      error: "not-error-instance",
      retriable: false,
    }),
    false,
  );
  assertEquals(
    isCompressPromptErrorReturn({
      error: new Error("x"),
      retriable: "not-boolean",
    }),
    false,
  );
  assertEquals(
    isCompressPromptErrorReturn(
      buildCompressPromptSuccessReturn({
        chatApiRequest: buildChatApiRequest([buildResourceDocument()], "m"),
        resolvedInputTokenCount: 1,
        resourceDocuments: [buildResourceDocument()],
      }),
    ),
    false,
  );
});

Deno.test("isBoundCompressPromptFn accepts async functions and rejects non-functions", () => {
  const { compressPrompt } = createCompressPromptMock({
    result: buildCompressPromptSuccessReturn({
      chatApiRequest: buildChatApiRequest([buildResourceDocument()], "z"),
      resolvedInputTokenCount: 0,
      resourceDocuments: [buildResourceDocument()],
    }),
  });
  assertEquals(isBoundCompressPromptFn(compressPrompt), true);

  assertEquals(isBoundCompressPromptFn(null), false);
  assertEquals(isBoundCompressPromptFn(undefined), false);
  assertEquals(isBoundCompressPromptFn({}), false);
  assertEquals(isBoundCompressPromptFn("not-a-function"), false);
  assertEquals(isBoundCompressPromptFn(42), false);
});
