// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.interface.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  createMockSupabaseClient,
  type IMockSupabaseClient,
} from "../../_shared/supabase.mock.ts";
import type { Database } from "../../types_db.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import type {
  CompressPromptReturn,
  CompressPromptSuccessReturn,
} from "./compressPrompt.interface.ts";
import {
  buildCompressPromptErrorReturn,
  buildCompressPromptSuccessReturn,
  buildChatApiRequest,
  buildCompressPromptParams,
  buildCompressPromptPayload,
  buildResourceDocument,
  createCompressPromptMock,
  DbClient,
} from "./compressPrompt.mock.ts";

Deno.test("compressPrompt contract: valid indexed candidate skipped outcome shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const initialResolved: number = 5555;
  const resourceDocuments = [buildResourceDocument()];
  const chatApiRequest = buildChatApiRequest(resourceDocuments, "contract prompt");
  const successReturn: CompressPromptSuccessReturn = buildCompressPromptSuccessReturn({
    chatApiRequest,
    resolvedInputTokenCount: initialResolved,
    resourceDocuments,
  });
  const { compressPrompt } = createCompressPromptMock({ result: successReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload({
      resourceDocuments,
      currentUserPrompt: "contract prompt",
      chatApiRequest,
    }),
  );
  assertEquals("error" in result, false);
  if ("error" in result) {
    throw new Error("contract test expected success branch");
  }
  assertEquals(result.resolvedInputTokenCount, initialResolved);
  assertEquals(typeof result.chatApiRequest, "object");
});

Deno.test("compressPrompt contract: valid single candidate compressed outcome shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const compressedContent = "compressed-by-rag-body";
  const resourceDocuments = [
    buildResourceDocument({ content: compressedContent }),
  ];
  const chatApiRequest = buildChatApiRequest(resourceDocuments, "contract prompt", {
    max_tokens_to_generate: 42,
  });
  const successReturn: CompressPromptSuccessReturn = buildCompressPromptSuccessReturn({
    chatApiRequest,
    resolvedInputTokenCount: 120,
    resourceDocuments,
  });
  const { compressPrompt } = createCompressPromptMock({ result: successReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload({
      resourceDocuments,
      currentUserPrompt: "contract prompt",
      chatApiRequest,
    }),
  );
  assertEquals("error" in result, false);
  if ("error" in result) {
    throw new Error("contract test expected success branch");
  }
  const docs = result.resourceDocuments;
  assertEquals(docs[0].content, compressedContent);
  const maxOut = result.chatApiRequest.max_tokens_to_generate;
  assertEquals(typeof maxOut, "number");
  if (typeof maxOut === "number") {
    assertEquals(maxOut > 0, true);
  }
});

Deno.test("compressPrompt contract: valid no candidates outcome preserves request body and sets max tokens", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const payload = buildCompressPromptPayload();
  const fromBalanceMaxTokens = 777;
  const chatApiRequest = {
    ...payload.chatApiRequest,
    max_tokens_to_generate: fromBalanceMaxTokens,
  };
  const successReturn: CompressPromptSuccessReturn = buildCompressPromptSuccessReturn({
    chatApiRequest,
    resolvedInputTokenCount: 1000,
    resourceDocuments: payload.resourceDocuments,
  });
  const { compressPrompt } = createCompressPromptMock({ result: successReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    payload,
  );
  assertEquals("error" in result, false);
  if ("error" in result) {
    throw new Error("contract test expected success branch");
  }
  assertEquals(result.chatApiRequest.message, payload.chatApiRequest.message);
  assertEquals(result.chatApiRequest.providerId, payload.chatApiRequest.providerId);
  assertEquals(result.chatApiRequest.max_tokens_to_generate, fromBalanceMaxTokens);
});

Deno.test("compressPrompt contract: invalid missing document identity error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new Error(
      "Compression requires document identity: document_key, type, and stage_slug must be present.",
    ),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "document identity");
    assertEquals(result.retriable, false);
    assertEquals("chatApiRequest" in result, false);
  }
});

Deno.test("compressPrompt contract: invalid provider_max_input_tokens undefined error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new Error("Provider max input tokens is not defined"),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid context_window_tokens undefined error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: undefined,
  });
  const errReturn = buildCompressPromptErrorReturn(
    new Error("context_window_tokens is not defined"),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient), {
      extendedModelConfig: cfg,
    }),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid ragResult.error propagated error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const ragFailure: Error = new Error("rag service rejected request");
  const errReturn = buildCompressPromptErrorReturn(ragFailure, false);
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error, ragFailure);
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid empty RAG context error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new Error("RAG context is empty for candidate contract-candidate-id"),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "RAG context is empty");
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid post-loop still oversized ContextWindowError shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new ContextWindowError(
      "Compressed prompt token count (999999) still exceeds model limit (128000) and allowed input (1000).",
    ),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid recordTransaction NSF error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new Error("Insufficient funds for RAG operation. Cost: 50 tokens."),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "Insufficient funds for RAG operation");
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid post-compression allowedInputPost exhausted ContextWindowError shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new ContextWindowError(
      "No input window remains after reserving output budget (100) and safety buffer (32).",
    ),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid post-compression final input exceeds allowed ContextWindowError shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new ContextWindowError(
      "Final input tokens (5000) exceed allowed input (4000) after reserving output budget.",
    ),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("compressPrompt contract: invalid post-compression NSF error shape", async () => {
  const { client: dbClient } = createMockSupabaseClient();
  const errReturn = buildCompressPromptErrorReturn(
    new Error(
      "Insufficient funds: estimated total cost (999999) exceeds wallet balance (100) after compression.",
    ),
    false,
  );
  const { compressPrompt } = createCompressPromptMock({ result: errReturn });
  const result: CompressPromptReturn = await compressPrompt(
    buildCompressPromptParams(DbClient(dbClient)),
    buildCompressPromptPayload(),
  );
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertStringIncludes(result.error.message, "Insufficient funds");
    assertEquals(result.retriable, false);
  }
});
