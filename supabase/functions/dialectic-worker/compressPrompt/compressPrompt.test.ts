// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { AiModelExtendedConfig, Messages } from "../../_shared/types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { createMockTokenWalletService } from "../../_shared/services/tokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import type { CompressionCandidate } from "../../_shared/utils/vector_utils.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import {
  isCompressPromptErrorReturn,
  isCompressPromptSuccessReturn,
} from "./compressPrompt.guard.ts";
import { compressPrompt } from "./compressPrompt.ts";
import {
  buildChatApiRequest,
  buildCompressPromptDeps,
  buildCompressPromptParams,
  buildCompressPromptPayload,
  buildResourceDocument,
  buildTokenizerDeps,
  DbClient,
  describeCompressPromptReturnForTestFailure,
} from "./compressPrompt.mock.ts";

Deno.test("indexed candidate skipped — getContextForModel not called", async () => {
  const mockRag: MockRagService = new MockRagService();
  const ragSpy = spy(mockRag, "getContextForModel");
  const candidate: CompressionCandidate = {
    id: "indexed-only",
    content: "body",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({
    id: "indexed-only",
    content: "long-body",
  });
  const counts: number[] = [200000, 200000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () =>
          Promise.resolve({ data: [{ source_contribution_id: "indexed-only" }], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    jobId: "job-a",
    finalTargetThreshold: 50000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    currentUserPrompt: "hi",
    chatApiRequest: buildChatApiRequest([doc], "hi"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(ragSpy.calls.length, 0);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.retriable, false);
    assertEquals(result.error instanceof ContextWindowError, true);
  }
});

Deno.test("single compression replaces resource document content and updates resolved count", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({
    mockContextResult: "rag-compressed-text",
    mockTokensUsed: 50,
  });
  const candidate: CompressionCandidate = {
    id: "doc-one",
    content: "long",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({
    id: "doc-one",
    content: "long-original",
  });
  const counts: number[] = [120000, 40000, 40000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    jobId: "job-b",
    finalTargetThreshold: 50000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    currentUserPrompt: "hi",
    chatApiRequest: buildChatApiRequest([doc], "hi"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true);
  if (isCompressPromptSuccessReturn(result)) {
    assertEquals(result.resourceDocuments[0].content, "rag-compressed-text");
    assertEquals(result.resolvedInputTokenCount, 40000);
  }
});

Deno.test("wallet debit uses idempotency rag:{jobId}:{candidateId} and DEBIT_USAGE", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 10 });
  const candidate: CompressionCandidate = {
    id: "debit-id",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "debit-id" });
  const counts: number[] = [200000, 2000, 2000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const walletMock = createMockTokenWalletService();
  const deps = buildCompressPromptDeps({
    ragService: mockRag,
    countTokens,
    tokenWalletService: walletMock.instance,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    jobId: "job-debit",
    finalTargetThreshold: 1000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "hi"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  await compressPrompt(deps, params, payload);
  assertEquals(walletMock.stubs.recordTransaction.calls.length >= 1, true);
  const firstCall = walletMock.stubs.recordTransaction.calls[0];
  const args = firstCall.args[0];
  assertEquals(args.type, "DEBIT_USAGE");
  assertEquals(args.idempotencyKey, "rag:job-debit:debit-id");
});

Deno.test("compressPrompt: balance decremented by tokensUsed * inputRate affects post-compression max output", async () => {
  const mockRagHigh: MockRagService = new MockRagService();
  mockRagHigh.setConfig({ mockContextResult: "a", mockTokensUsed: 1000 });
  const mockRagZero: MockRagService = new MockRagService();
  mockRagZero.setConfig({ mockContextResult: "a", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "bal-doc",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "bal-doc" });
  // Small numbers: wallet budgets max output before the context cap. After compression,
  // finalTokens=5000, balance 20_000 → max output 15_000; after 1_000 RAG debit → 14_000.
  // provider_max_input_tokens must exceed reserved output + prompt + buffer (compressPrompt).
  const counts: number[] = [20_000, 5_000, 5_000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const walletMock = createMockTokenWalletService();
  const depsHigh = buildCompressPromptDeps({
    ragService: mockRagHigh,
    countTokens,
    tokenWalletService: walletMock.instance,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const ragDebitWalletUnits: number = 1000;
  const params = buildCompressPromptParams(DbClient(client), {
    jobId: "job-bal",
    finalTargetThreshold: 10_000,
    inputRate: 1,
    outputRate: 1,
    walletBalance: 25_000,
    balanceAfterCompression: 20_000,
    extendedModelConfig: buildExtendedModelConfig({
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      provider_max_input_tokens: 30_000,
      hard_cap_output_tokens: 100_000,
      provider_max_output_tokens: 100_000,
      context_window_tokens: 20_000,
    }),
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const resultHigh = await compressPrompt(depsHigh, params, payload);
  countIdx = 0;
  const depsZero = buildCompressPromptDeps({
    ragService: mockRagZero,
    countTokens,
    tokenWalletService: walletMock.instance,
  });
  const resultZero = await compressPrompt(depsZero, params, payload);
  assertEquals(
    isCompressPromptSuccessReturn(resultHigh),
    true,
    `resultHigh (mockRagHigh tokensUsed=1000): ${describeCompressPromptReturnForTestFailure(resultHigh)}`,
  );
  assertEquals(
    isCompressPromptSuccessReturn(resultZero),
    true,
    `resultZero (mockRagZero tokensUsed=0): ${describeCompressPromptReturnForTestFailure(resultZero)}`,
  );
  if (isCompressPromptSuccessReturn(resultHigh) && isCompressPromptSuccessReturn(resultZero)) {
    const finalTokens: number = resultHigh.resolvedInputTokenCount;
    assertEquals(finalTokens, resultZero.resolvedInputTokenCount);
    const expectedHigh: number = getMaxOutputTokens(
      params.balanceAfterCompression - ragDebitWalletUnits,
      finalTokens,
      params.extendedModelConfig,
      depsHigh.logger,
    );
    const expectedZero: number = getMaxOutputTokens(
      params.balanceAfterCompression,
      finalTokens,
      params.extendedModelConfig,
      depsZero.logger,
    );
    assertEquals(resultHigh.chatApiRequest.max_tokens_to_generate, expectedHigh);
    assertEquals(resultZero.chatApiRequest.max_tokens_to_generate, expectedZero);
    assertEquals(expectedHigh < expectedZero, true);
  }
});

Deno.test("consecutive same-role history messages get alternation separators", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "fixed", mockTokensUsed: 100 });
  const history: Messages[] = [
    { id: "h1", role: "assistant", content: "a1" },
    { id: "h2", role: "assistant", content: "a2" },
  ];
  const candidate: CompressionCandidate = {
    id: "h2",
    content: "a2",
    sourceType: "history",
    originalIndex: 1,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument();
  const counts: number[] = [200000, 2000, 2000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    finalTargetThreshold: 5000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    conversationHistory: history,
    currentUserPrompt: "u",
    chatApiRequest: buildChatApiRequest([doc], "u"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true);
  if (isCompressPromptSuccessReturn(result)) {
    const msgs = result.chatApiRequest.messages ?? [];
    const joined = msgs.map((m) => m.content).join("|");
    assertStringIncludes(joined, "Please continue.");
  }
});

Deno.test("loop exits early when token count <= finalTargetThreshold before exhausting candidates", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "s", mockTokensUsed: 1 });
  const c1: CompressionCandidate = {
    id: "first",
    content: "a",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const c2: CompressionCandidate = {
    id: "second",
    content: "b",
    sourceType: "document",
    originalIndex: 1,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [c1, c2];
  const d1 = buildResourceDocument({ id: "first" });
  const d2 = buildResourceDocument({ id: "second", document_key: FileType.HeaderContext });
  const ragSpy = spy(mockRag, "getContextForModel");
  const counts: number[] = [200000, 1000, 1000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    finalTargetThreshold: 50000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [d1, d2],
    chatApiRequest: buildChatApiRequest([d1, d2], "p"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  await compressPrompt(deps, params, payload);
  assertEquals(ragSpy.calls.length, 1);
});

Deno.test("post-loop still oversized returns ContextWindowError", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "x", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "only",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "only" });
  const counts: number[] = [200000, 200000, 200000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    finalTargetThreshold: 50000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "z"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("ragResult.error propagated as error return", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ shouldThrowError: true, errorMessage: "rag failed unit" });
  const candidate: CompressionCandidate = {
    id: "e1",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "e1" });
  const counts: number[] = [200000, 2000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    finalTargetThreshold: 1000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "q"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertStringIncludes(result.error.message, "rag failed unit");
    assertEquals(result.retriable, false);
  }
});

Deno.test("recordTransaction throws yields Insufficient funds for RAG operation", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 5 });
  const walletMock = createMockTokenWalletService({
    recordTransaction: () => Promise.reject(new Error("nsf")),
  });
  const candidate: CompressionCandidate = {
    id: "w1",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "w1" });
  const counts: number[] = [200000, 2000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({
    ragService: mockRag,
    countTokens,
    tokenWalletService: walletMock.instance,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    finalTargetThreshold: 1000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "q"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertStringIncludes(result.error.message, "Insufficient funds for RAG operation");
    assertEquals(result.retriable, false);
  }
});

Deno.test("isContinuationFlowInitial true does not prepend user prompt to assembled messages", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "cf",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "cf" });
  const counts: number[] = [200000, 500, 500];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    isContinuationFlowInitial: true,
    finalTargetThreshold: 1000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    currentUserPrompt: "UNIQUE_USER_PROMPT",
    chatApiRequest: buildChatApiRequest([doc], "UNIQUE_USER_PROMPT"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true);
  if (isCompressPromptSuccessReturn(result)) {
    const msgs = result.chatApiRequest.messages ?? [];
    const firstUser = msgs.find((m) => m.role === "user" && m.content === "UNIQUE_USER_PROMPT");
    assertEquals(firstUser === undefined, true);
  }
});

Deno.test("missing document identity returns error", async () => {
  const mockRag: MockRagService = new MockRagService();
  const strategy: ICompressionStrategy = async () => [];
  const badDoc = buildResourceDocument({ document_key: "" });
  const deps = buildCompressPromptDeps({ ragService: mockRag });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), { walletBalance: 1_000_000 });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [badDoc],
    chatApiRequest: buildChatApiRequest([badDoc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertStringIncludes(result.error.message, "document identity");
    assertEquals(result.retriable, false);
  }
});

Deno.test("provider_max_input_tokens undefined returns error", async () => {
  const mockRag: MockRagService = new MockRagService();
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    provider_max_input_tokens: undefined,
  });
  const strategy: ICompressionStrategy = async () => [];
  const doc = buildResourceDocument();
  const deps = buildCompressPromptDeps({ ragService: mockRag });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("context_window_tokens undefined returns error", async () => {
  const mockRag: MockRagService = new MockRagService();
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: undefined,
  });
  const strategy: ICompressionStrategy = async () => [];
  const doc = buildResourceDocument();
  const deps = buildCompressPromptDeps({ ragService: mockRag });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.retriable, false);
  }
});

Deno.test("post-compression allowedInputPost <= 0 returns ContextWindowError", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "p1",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "p1" });
  const providerMaxInputTokensForFixture: number = 128000;
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    provider_max_input_tokens: providerMaxInputTokensForFixture,
    hard_cap_output_tokens: 10_000_000,
    provider_max_output_tokens: 10_000_000,
    context_window_tokens: 128000,
  });
  const finalInputTokens: number = 32;
  const counts: number[] = [200000, 2000, finalInputTokens];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    finalTargetThreshold: 1000,
    walletBalance: 10_000_000,
    balanceAfterCompression: 10_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  const plannedMax: number = getMaxOutputTokens(
    params.balanceAfterCompression,
    finalInputTokens,
    cfg,
    deps.logger,
  );
  const safetyBuffer: number = 32;
  const allowedInputPost: number =
    providerMaxInputTokensForFixture - (plannedMax + safetyBuffer);
  assertEquals(allowedInputPost <= 0, true);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("post-compression final input exceeds allowed returns ContextWindowError", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "p2",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "p2" });
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    provider_max_input_tokens: 200,
    hard_cap_output_tokens: 50,
    provider_max_output_tokens: 50,
    context_window_tokens: 128000,
  });
  const counts: number[] = [200000, 5000, 5000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    finalTargetThreshold: 1000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertEquals(result.error instanceof ContextWindowError, true);
    assertEquals(result.retriable, false);
  }
});

Deno.test("post-compression NSF returns Insufficient funds", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "nsf",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "nsf" });
  const counts: number[] = [200000, 2000, 2000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    finalTargetThreshold: 1000,
    walletBalance: 1,
    balanceAfterCompression: 1,
    inputRate: 1,
    outputRate: 1,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptErrorReturn(result), true);
  if (isCompressPromptErrorReturn(result)) {
    assertStringIncludes(result.error.message, "Insufficient funds");
    assertEquals(result.retriable, false);
  }
});

Deno.test("success sets max_tokens_to_generate from getMaxOutputTokens", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 0 });
  const candidate: CompressionCandidate = {
    id: "ok",
    content: "c",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  const strategy: ICompressionStrategy = async () => [candidate];
  const doc = buildResourceDocument({ id: "ok" });
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig();
  const counts: number[] = [200000, 2000, 2000];
  let countIdx: number = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    modelCfg: AiModelExtendedConfig,
  ): number => {
    const next: number = countIdx < counts.length ? counts[countIdx] : counts[counts.length - 1];
    countIdx++;
    return next;
  };
  const deps = buildCompressPromptDeps({ ragService: mockRag, countTokens });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    finalTargetThreshold: 10000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: strategy,
    resourceDocuments: [doc],
    chatApiRequest: buildChatApiRequest([doc], "x"),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true);
  if (isCompressPromptSuccessReturn(result)) {
    const finalTokens: number = result.resolvedInputTokenCount;
    const planned: number = getMaxOutputTokens(
      params.walletBalance,
      finalTokens,
      cfg,
      deps.logger,
    );
    const maxOut = result.chatApiRequest.max_tokens_to_generate;
    assertEquals(typeof maxOut, "number");
    assertEquals(maxOut, planned);
  }
});
