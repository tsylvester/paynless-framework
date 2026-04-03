// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.test.ts

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { AiModelExtendedConfig, Messages, ResourceDocument } from "../../_shared/types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import type { RelevanceRule } from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { createMockTokenWalletService } from "../../_shared/services/tokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
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
import type {
  CompressPromptDeps,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
} from "./compressPrompt.interface.ts";

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

Deno.test("should orchestrate RAG and debit tokens for un-indexed history chunks", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "summary", mockTokensUsed: 10 });

  let tokenCalls: number = 0;
  const countTokens: CountTokensFn = createMockCountTokens({
    countTokens: (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _cfg: AiModelExtendedConfig,
    ): number => {
      tokenCalls++;
      if (tokenCalls === 1) {
        return 200;
      }
      return 50;
    },
  });

  const oneCandidateStrategy: ICompressionStrategy = async () => [
    {
      id: "history-msg-3",
      content: "long content",
      sourceType: "history",
      originalIndex: 3,
      valueScore: 0.5,
      effectiveScore: 0.5,
    },
  ];

  const conversationHistory: Messages[] = [
    { id: "history-msg-0", role: "system", content: "You are a helpful assistant." },
    { id: "history-msg-1", role: "user", content: "first" },
    { id: "history-msg-2", role: "assistant", content: "second" },
    { id: "history-msg-3", role: "user", content: "very long middle that should be summarized" },
    { id: "history-msg-4", role: "assistant", content: "tail-1" },
    { id: "history-msg-5", role: "assistant", content: "tail-2" },
  ];
  const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "first" },
    { role: "assistant", content: "second" },
    { role: "user", content: "very long middle that should be summarized" },
    { role: "assistant", content: "tail-1" },
    { role: "assistant", content: "tail-2" },
  ];

  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 100,
    provider_max_output_tokens: 50,
    provider_max_input_tokens: 200,
  });

  const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService();
  const deps = buildCompressPromptDeps({
    ragService: mockRag,
    tokenWalletService: mockTokenWalletService,
    countTokens,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    jobId: "job-rag-debit-history",
    projectOwnerUserId: "user-789",
    sessionId: "session-rag-debit",
    stageSlug: "thesis",
    walletId: "wallet-ghi",
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
    inputRate: 0.01,
    outputRate: 0.01,
    isContinuationFlowInitial: false,
    finalTargetThreshold: 50,
    balanceAfterCompression: 900_000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: oneCandidateStrategy,
    resourceDocuments: [],
    conversationHistory,
    currentUserPrompt: "current",
    chatApiRequest: buildChatApiRequest([], "current", {
      providerId: "00000000-0000-4000-8000-000000000001",
      promptId: "__none__",
      walletId: "wallet-ghi",
      systemInstruction: "You are a helpful assistant.",
      messages: apiMessages,
    }),
    tokenizerDeps: buildTokenizerDeps(),
  });

  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));

  assertEquals(tokenWalletStubs.recordTransaction.calls.length, 1, "recordTransaction should be called exactly once");
  const firstArg = tokenWalletStubs.recordTransaction.calls[0].args[0];
  assertEquals(firstArg.walletId, "wallet-ghi");
  assertEquals(firstArg.type, "DEBIT_USAGE");
  assertEquals(firstArg.amount, "10");
  assertEquals(firstArg.recordedByUserId, "user-789");
  assertEquals(firstArg.idempotencyKey, "rag:job-rag-debit-history:history-msg-3");
  assertEquals(firstArg.relatedEntityId, "history-msg-3");
  assertEquals(firstArg.relatedEntityType, "rag_compression");
  assertEquals(firstArg.notes, "RAG compression for job job-rag-debit-history");
});

Deno.test("does not debit when compression tokensUsedForIndexing is zero", async () => {
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "summary", mockTokensUsed: 0 });

  let tokenCalls: number = 0;
  const countTokens: CountTokensFn = createMockCountTokens({
    countTokens: (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _cfg: AiModelExtendedConfig,
    ): number => {
      tokenCalls++;
      if (tokenCalls === 1) {
        return 200;
      }
      return 50;
    },
  });

  const oneCandidateStrategy: ICompressionStrategy = async () => [
    {
      id: "history-msg-3",
      content: "long content",
      sourceType: "history",
      originalIndex: 3,
      valueScore: 0.5,
      effectiveScore: 0.5,
    },
  ];

  const conversationHistory: Messages[] = [
    { id: "history-msg-0", role: "system", content: "You are a helpful assistant." },
    { id: "history-msg-1", role: "user", content: "first" },
    { id: "history-msg-2", role: "assistant", content: "second" },
    { id: "history-msg-3", role: "user", content: "very long middle that should be summarized" },
  ];
  const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "first" },
    { role: "assistant", content: "second" },
    { role: "user", content: "very long middle that should be summarized" },
  ];

  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 100,
    provider_max_output_tokens: 50,
    provider_max_input_tokens: 200,
  });

  const { instance: mockTokenWalletService, stubs: tokenWalletStubs } = createMockTokenWalletService();
  const deps = buildCompressPromptDeps({
    ragService: mockRag,
    tokenWalletService: mockTokenWalletService,
    countTokens,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    jobId: "job-rag-zero-debit",
    projectOwnerUserId: "user-789",
    sessionId: "session-rag-zero",
    stageSlug: "thesis",
    walletId: "wallet-ghi",
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
    inputRate: 0.01,
    outputRate: 0.01,
    isContinuationFlowInitial: false,
    finalTargetThreshold: 50,
    balanceAfterCompression: 900_000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: oneCandidateStrategy,
    resourceDocuments: [],
    conversationHistory,
    currentUserPrompt: "current",
    chatApiRequest: buildChatApiRequest([], "current", {
      providerId: "00000000-0000-4000-8000-000000000001",
      promptId: "__none__",
      walletId: "wallet-ghi",
      systemInstruction: "You are a helpful assistant.",
      messages: apiMessages,
    }),
    tokenizerDeps: buildTokenizerDeps(),
  });

  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
  assertEquals(tokenWalletStubs.recordTransaction.calls.length, 0, "recordTransaction should not be called");
});

Deno.test("should perform affordable compression, checking balance once", async () => {
  const longMiddle: string =
    "This is the third message, which is now significantly longer to ensure it absolutely needs to be indexed and will exceed the context window. To achieve this, I will add a substantial amount of additional text here to make sure it is long enough to push us well over the one hundred token limit for this specific test case, which is a much better approach than manipulating the configuration and hoping for the best. This method ensures that the test is robust and accurately reflects the real-world scenario where a long conversation history requires summarization before being passed to the model for processing, which is the entire point of this unit test.";

  const mockRagService: MockRagService = new MockRagService();
  const ragSpy = spy(mockRagService, "getContextForModel");
  mockRagService.setConfig({
    mockContextResult: "brief summary",
    mockTokensUsed: 10,
  });

  let tokenCalls: number = 0;
  const countTokens: CountTokensFn = createMockCountTokens({
    countTokens: (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _cfg: AiModelExtendedConfig,
    ): number => {
      tokenCalls++;
      if (tokenCalls === 1) {
        return 200;
      }
      return 50;
    },
  });

  const oneCandidateStrategy: ICompressionStrategy = async () => [
    {
      id: "history-msg-3",
      content: longMiddle,
      sourceType: "history",
      originalIndex: 3,
      valueScore: 0.5,
      effectiveScore: 0.5,
    },
  ];

  const conversationHistory: Messages[] = [
    { id: "history-msg-0", role: "system", content: "You are a helpful assistant." },
    { id: "history-msg-1", role: "user", content: "This is the first message." },
    { id: "history-msg-2", role: "assistant", content: "This is the second message." },
    { id: "history-msg-3", role: "user", content: longMiddle },
    { id: "history-msg-4", role: "assistant", content: "This is an interstitial message to create a valid middle." },
    { id: "history-msg-5", role: "user", content: "This is the penultimate message." },
    { id: "history-msg-6", role: "assistant", content: "This is the second to last message." },
    { id: "history-msg-7", role: "assistant", content: "This is the final message before the current prompt." },
  ];
  const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "This is the first message." },
    { role: "assistant", content: "This is the second message." },
    { role: "user", content: longMiddle },
    { role: "assistant", content: "This is an interstitial message to create a valid middle." },
    { role: "user", content: "This is the penultimate message." },
    { role: "assistant", content: "This is the second to last message." },
    { role: "assistant", content: "This is the final message before the current prompt." },
  ];

  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 100,
    input_token_cost_rate: 1,
    provider_max_output_tokens: 5,
    provider_max_input_tokens: 200,
  });

  const { instance: mockTokenWalletService } = createMockTokenWalletService();
  const deps = buildCompressPromptDeps({
    ragService: mockRagService,
    tokenWalletService: mockTokenWalletService,
    countTokens,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    jobId: "job-affordable-compression",
    projectOwnerUserId: "user-789",
    sessionId: "session-affordable",
    stageSlug: "thesis",
    walletId: "wallet-ghi",
    inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
    inputRate: 1,
    outputRate: 1,
    isContinuationFlowInitial: false,
    finalTargetThreshold: 50,
    balanceAfterCompression: 900_000,
    walletBalance: 1_000_000,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: oneCandidateStrategy,
    resourceDocuments: [],
    conversationHistory,
    currentUserPrompt: "",
    chatApiRequest: buildChatApiRequest([], "", {
      providerId: "00000000-0000-4000-8000-000000000001",
      promptId: "__none__",
      walletId: "wallet-ghi",
      systemInstruction: "",
      messages: apiMessages,
    }),
    tokenizerDeps: buildTokenizerDeps(),
  });

  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
  assertEquals(ragSpy.calls.length, 1, "RAG service should be called once for compression.");
});

Deno.test("preserves continuation anchors after compression", async () => {
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 50,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 50,
  });
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "rag-summary", mockTokensUsed: 10 });
  let countCallIdx = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    countCallIdx++;
    return countCallIdx === 1 ? 100 : 40;
  };
  const anchorStrategy: ICompressionStrategy = async () => [
    {
      id: "mid-1",
      content: "MID-1",
      sourceType: "history",
      originalIndex: 3,
      valueScore: 0.2,
      effectiveScore: 0.2,
    },
    {
      id: "mid-2",
      content: "MID-2",
      sourceType: "history",
      originalIndex: 4,
      valueScore: 0.3,
      effectiveScore: 0.3,
    },
  ];
  const conversationHistory: Messages[] = [
    { id: "orig-user", role: "user", content: "ORIGINAL USER" },
    { id: "first-assistant", role: "assistant", content: "FIRST ASSIST" },
    { id: "mid-1", role: "user", content: "MID-1" },
    { id: "mid-2", role: "assistant", content: "MID-2" },
    { id: "last-assistant-1", role: "assistant", content: "TAIL ASSIST 1" },
    { id: "user-interstitial", role: "user", content: "Okay, go on." },
    { id: "last-assistant-2", role: "assistant", content: "TAIL ASSIST 2" },
    { id: "please-continue", role: "user", content: "Please continue." },
  ];
  const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "user", content: "ORIGINAL USER" },
    { role: "assistant", content: "FIRST ASSIST" },
    { role: "user", content: "MID-1" },
    { role: "assistant", content: "MID-2" },
    { role: "assistant", content: "TAIL ASSIST 1" },
    { role: "user", content: "Okay, go on." },
    { role: "assistant", content: "TAIL ASSIST 2" },
    { role: "user", content: "Please continue." },
  ];
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
    jobId: "job-anchors-port",
    projectOwnerUserId: "user-789",
    sessionId: "session-anchors",
    stageSlug: "thesis",
    walletId: "wallet-ctn",
    inputsRelevance: [],
    isContinuationFlowInitial: true,
    finalTargetThreshold: 50,
    balanceAfterCompression: 1_000_000,
    walletBalance: 1_000_000,
    inputRate: 1,
    outputRate: 1,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: anchorStrategy,
    resourceDocuments: [],
    conversationHistory,
    currentUserPrompt: "Please continue.",
    chatApiRequest: buildChatApiRequest([], "Please continue.", {
      providerId: "00000000-0000-4000-8000-000000000001",
      promptId: "__none__",
      walletId: "wallet-ctn",
      systemInstruction: "SYS",
      messages: apiMessages,
    }),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
  if (!isCompressPromptSuccessReturn(result)) {
    return;
  }
  const arg = result.chatApiRequest;
  assert(isRecord(arg) && Array.isArray(arg.messages), "ChatApiRequest should contain messages");
  const msgsUnknown = arg["messages"];
  const normalized: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (Array.isArray(msgsUnknown)) {
    for (const m of msgsUnknown) {
      if (isRecord(m)) {
        const roleVal = typeof m["role"] === "string" ? m["role"] : undefined;
        const contentVal = typeof m["content"] === "string" ? m["content"] : undefined;
        if (
          (roleVal === "user" || roleVal === "assistant" || roleVal === "system") &&
          typeof contentVal === "string"
        ) {
          const r = roleVal;
          normalized.push({ role: r, content: contentVal });
        }
      }
    }
  }
  assert(
    normalized.some((m) => m.role === "user" && m.content === "ORIGINAL USER"),
    "Original user message must be preserved",
  );
  assert(
    normalized.some((m) => m.role === "assistant" && m.content === "FIRST ASSIST"),
    "First assistant message must be preserved",
  );
  assert(
    normalized.some((m) => m.role === "assistant" && m.content === "TAIL ASSIST 1"),
    "Tail assistant 1 must be preserved",
  );
  assert(
    normalized.some((m) => m.role === "assistant" && m.content === "TAIL ASSIST 2"),
    "Tail assistant 2 must be preserved",
  );
  const lastMsg = normalized[normalized.length - 1];
  assert(
    lastMsg && lastMsg.role === "user" && lastMsg.content === "Please continue.",
    "The trailing message must be the continuation prompt",
  );
});

Deno.test("RAG debits use stable idempotency keys tied to job and candidate", async () => {
  const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 100,
    provider_max_input_tokens: 10000,
    provider_max_output_tokens: 50,
  });
  const mockRag: MockRagService = new MockRagService();
  mockRag.setConfig({ mockContextResult: "summary", mockTokensUsed: 7 });
  const { instance: mockTokenWalletService, stubs: walletStubs } = createMockTokenWalletService();
  let walletCountIdx = 0;
  const countTokens: CountTokensFn = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _cfg: AiModelExtendedConfig,
  ): number => {
    walletCountIdx++;
    if (walletCountIdx === 1) return 300;
    if (walletCountIdx === 2) return 150;
    return 80;
  };
  const docForWallet = buildResourceDocument({
    id: "docX",
    content: "very long doc",
  });
  const mockCompressionStrategy: ICompressionStrategy = async () => [
    {
      id: "docX",
      content: "long content A",
      sourceType: "document",
      originalIndex: 0,
      valueScore: 0.2,
      effectiveScore: 0.2,
    },
    {
      id: "cand-2",
      content: "long content B",
      sourceType: "history",
      originalIndex: 1,
      valueScore: 0.3,
      effectiveScore: 0.3,
    },
  ];
  const conversationHistory: Messages[] = [
    { id: "u1", role: "user", content: "seed" },
    { id: "cand-2", role: "assistant", content: "reply" },
  ];
  const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "user", content: "seed" },
    { role: "assistant", content: "reply" },
  ];
  const deps = buildCompressPromptDeps({
    tokenWalletService: mockTokenWalletService,
    ragService: mockRag,
    countTokens,
  });
  const { client } = createMockSupabaseClient("compress-prompt-unit", {
    genericMockResults: {
      dialectic_memory: {
        select: () => Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const params = buildCompressPromptParams(DbClient(client), {
    extendedModelConfig: cfg,
    jobId: "job-id-123",
    projectOwnerUserId: "user-789",
    sessionId: "session-stable",
    stageSlug: "thesis",
    walletId: "wallet-stable",
    inputsRelevance: [],
    finalTargetThreshold: 80,
    balanceAfterCompression: 1_000_000,
    walletBalance: 1_000_000,
    inputRate: 1,
    outputRate: 1,
  });
  const payload = buildCompressPromptPayload({
    compressionStrategy: mockCompressionStrategy,
    resourceDocuments: [docForWallet],
    conversationHistory,
    currentUserPrompt: "current",
    chatApiRequest: buildChatApiRequest([docForWallet], "current", {
      providerId: "00000000-0000-4000-8000-000000000001",
      promptId: "__none__",
      walletId: "wallet-stable",
      systemInstruction: "",
      messages: apiMessages,
    }),
    tokenizerDeps: buildTokenizerDeps(),
  });
  const result = await compressPrompt(deps, params, payload);
  assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
  const calls = walletStubs.recordTransaction.calls;
  assertEquals(calls.length, 2, "Expected one debit per RAG compression iteration");
  const jobId = "job-id-123";
  const seenKeys = new Set<string>();
  for (const c of calls) {
    const arg = c.args[0] as {
      walletId: string;
      type: string;
      amount: string;
      recordedByUserId: string;
      idempotencyKey: string;
      relatedEntityId?: string;
      relatedEntityType?: string;
      notes?: string;
    };
    assertEquals(arg.type, "DEBIT_USAGE");
    assertEquals(arg.relatedEntityType, "rag_compression");
    assert(
      arg.relatedEntityId === "docX" || arg.relatedEntityId === "cand-2",
      "relatedEntityId should match candidate id",
    );
    assert(typeof arg.idempotencyKey === "string" && arg.idempotencyKey.length > 0, "idempotencyKey should be present");
    const expectedKey = `rag:${jobId}:${arg.relatedEntityId}`;
    assertEquals(arg.idempotencyKey, expectedKey, "idempotencyKey must be stable and derived from job and candidate");
    seenKeys.add(arg.idempotencyKey);
  }
  assertEquals(seenKeys.size, 2, "Idempotency keys should be unique per candidate and stable across retries");
});

Deno.test(
  "uses SSOT-based output headroom (budget) to compute allowed input during compression",
  async () => {
    const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      provider_max_input_tokens: 200,
      provider_max_output_tokens: 1000,
      input_token_cost_rate: 0,
      output_token_cost_rate: 1,
    });
    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({ mockContextResult: "z", mockTokensUsed: 0 });
    const { instance: mockTokenWalletService } = createMockTokenWalletService({
      getBalance: () => Promise.resolve("100"),
    });
    let ssotIdx = 0;
    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _cfg: AiModelExtendedConfig,
    ): number => {
      ssotIdx++;
      if (ssotIdx === 1) return 120;
      if (ssotIdx === 2) return 89;
      return 88;
    };
    const mockCompressionStrategy: ICompressionStrategy = async () => [
      {
        id: "cand-1",
        content: "middle-1",
        sourceType: "history",
        originalIndex: 3,
        valueScore: 0.2,
        effectiveScore: 0.2,
      },
      {
        id: "cand-2",
        content: "middle-2",
        sourceType: "document",
        originalIndex: 1,
        valueScore: 0.3,
        effectiveScore: 0.3,
      },
    ];
    const docSsot = buildResourceDocument({
      id: "cand-2",
      content: "middle-2",
    });
    const conversationHistory: Messages[] = [
      { role: "system", content: "SYS" },
      { id: "cand-1", role: "user", content: "A".repeat(400) },
      { role: "assistant", content: "B" },
    ];
    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: "SYS" },
      { role: "user", content: "A".repeat(400) },
      { role: "assistant", content: "B" },
    ];
    const deps = buildCompressPromptDeps({
      tokenWalletService: mockTokenWalletService,
      ragService: mockRag,
      countTokens,
    });
    const { client } = createMockSupabaseClient("compress-prompt-unit", {
      genericMockResults: {
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const params = buildCompressPromptParams(DbClient(client), {
      extendedModelConfig: cfg,
      jobId: "job-ssot-headroom-port",
      projectOwnerUserId: "user-abc",
      sessionId: "session-ssot",
      stageSlug: "thesis",
      walletId: "wallet-ssot",
      inputsRelevance: [],
      finalTargetThreshold: 88,
      balanceAfterCompression: 100,
      walletBalance: 100,
      inputRate: 0,
      outputRate: 1,
    });
    const payload = buildCompressPromptPayload({
      compressionStrategy: mockCompressionStrategy,
      resourceDocuments: [docSsot],
      conversationHistory,
      currentUserPrompt: "CURR",
      chatApiRequest: buildChatApiRequest([docSsot], "CURR", {
        providerId: "00000000-0000-4000-8000-000000000001",
        promptId: "__none__",
        walletId: "wallet-ssot",
        systemInstruction: "",
        messages: apiMessages,
      }),
      tokenizerDeps: buildTokenizerDeps(),
    });
    const result = await compressPrompt(deps, params, payload);
    assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
  },
);

Deno.test(
  "forwards inputsRelevance to compressionStrategy params and rag getContextForModel",
  async () => {
    const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      provider_max_input_tokens: 256,
    });
    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({ mockContextResult: "summary", mockTokensUsed: 0 });
    const ragSpy = spy(mockRag, "getContextForModel");

    const inputsRelevance: RelevanceRule[] = [
      { document_key: FileType.business_case, type: "document", relevance: 1 },
    ];
    let seenStrategyInputsRelevance: RelevanceRule[] | undefined;
    const capturingCompressionStrategy: ICompressionStrategy = async (
      _deps,
      paramsArg,
      payloadArg,
    ) => {
      seenStrategyInputsRelevance = paramsArg.inputsRelevance;
      const firstDoc: ResourceDocument = payloadArg.documents[0];
      return [
        {
          id: firstDoc.id,
          content: firstDoc.content,
          sourceType: "document",
          originalIndex: 0,
          valueScore: 0.1,
          effectiveScore: 0.1,
        },
      ];
    };
    const doc: ResourceDocument = buildResourceDocument({
      id: "docA",
      content: "very long content",
      document_key: FileType.business_case,
    });
    const { instance: tokenWalletService } = createMockTokenWalletService({
      getBalance: () => Promise.resolve("100000"),
    });
    let plumbCountIdx: number = 0;
    const countTokens: CountTokensFn = createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _cfg: AiModelExtendedConfig,
      ): number => {
        plumbCountIdx++;
        if (plumbCountIdx === 1) return 500;
        return 90;
      },
    });
    const deps: CompressPromptDeps = buildCompressPromptDeps({
      tokenWalletService,
      ragService: mockRag,
      countTokens,
    });
    const { client } = createMockSupabaseClient("compress-prompt-unit", {
      genericMockResults: {
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const params: CompressPromptParams = buildCompressPromptParams(DbClient(client), {
      extendedModelConfig: cfg,
      jobId: "job-rag2-plumb",
      inputsRelevance,
      finalTargetThreshold: 100,
      balanceAfterCompression: 900000,
      walletBalance: 1_000_000,
    });
    const payload: CompressPromptPayload = buildCompressPromptPayload({
      compressionStrategy: capturingCompressionStrategy,
      resourceDocuments: [doc],
      currentUserPrompt: "CURR",
      chatApiRequest: buildChatApiRequest([doc], "CURR"),
      tokenizerDeps: buildTokenizerDeps(),
    });
    const result: CompressPromptReturn = await compressPrompt(deps, params, payload);
    assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
    assert(Array.isArray(seenStrategyInputsRelevance), "compressionStrategy should receive inputsRelevance");
    assertEquals(seenStrategyInputsRelevance, inputsRelevance);
    assertEquals(ragSpy.calls.length >= 1, true);
    const firstRagArgs = ragSpy.calls[0].args;
    assertEquals(firstRagArgs[4], inputsRelevance);
  },
);

Deno.test(
  "forwards empty inputsRelevance as [] to compressionStrategy params and rag getContextForModel",
  async () => {
    const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      provider_max_input_tokens: 256,
    });
    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({ mockContextResult: "summary", mockTokensUsed: 0 });
    const ragSpy = spy(mockRag, "getContextForModel");

    let seenStrategyInputsRelevance: RelevanceRule[] | undefined;
    const capturingCompressionStrategy: ICompressionStrategy = async (
      _deps,
      paramsArg,
      payloadArg,
    ) => {
      seenStrategyInputsRelevance = paramsArg.inputsRelevance;
      const firstDoc: ResourceDocument = payloadArg.documents[0];
      return [
        {
          id: firstDoc.id,
          content: firstDoc.content,
          sourceType: "document",
          originalIndex: 0,
          valueScore: 0.1,
          effectiveScore: 0.1,
        },
      ];
    };
    const doc: ResourceDocument = buildResourceDocument({
      id: "docB",
      content: "long content",
    });
    const { instance: tokenWalletService } = createMockTokenWalletService({
      getBalance: () => Promise.resolve("100000"),
    });
    let emptyRelCountIdx: number = 0;
    const countTokens: CountTokensFn = createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _cfg: AiModelExtendedConfig,
      ): number => {
        emptyRelCountIdx++;
        if (emptyRelCountIdx === 1) return 1000;
        return 90;
      },
    });
    const deps = buildCompressPromptDeps({
      tokenWalletService,
      ragService: mockRag,
      countTokens,
    });
    const { client } = createMockSupabaseClient("compress-prompt-unit", {
      genericMockResults: {
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const params: CompressPromptParams = buildCompressPromptParams(DbClient(client), {
      extendedModelConfig: cfg,
      jobId: "job-rag2-empty",
      inputsRelevance: [],
      finalTargetThreshold: 100,
      balanceAfterCompression: 900000,
      walletBalance: 1_000_000,
    });
    const payload: CompressPromptPayload = buildCompressPromptPayload({
      compressionStrategy: capturingCompressionStrategy,
      resourceDocuments: [doc],
      currentUserPrompt: "CURR",
      chatApiRequest: buildChatApiRequest([doc], "CURR"),
      tokenizerDeps: buildTokenizerDeps(),
    });
    const result = await compressPrompt(deps, params, payload);
    assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
    assert(Array.isArray(seenStrategyInputsRelevance));
    assertEquals(seenStrategyInputsRelevance, []);
    assertEquals(ragSpy.calls.length >= 1, true);
    assertEquals(ragSpy.calls[0].args[4], []);
  },
);

Deno.test(
  "rag2 port: with empty inputsRelevance mock strategy yields deterministic first RAG victim order",
  async () => {
    const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      provider_max_input_tokens: 256,
    });
    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({ mockContextResult: "s", mockTokensUsed: 1 });
    const ragSpy = spy(mockRag, "getContextForModel");

    const orderedStrategy: ICompressionStrategy = async (_d, _p, _pl) => [
      {
        id: "alpha",
        content: "alpha",
        sourceType: "document",
        originalIndex: 0,
        valueScore: 0.1,
        effectiveScore: 0.05,
      },
      {
        id: "beta",
        content: "beta",
        sourceType: "document",
        originalIndex: 1,
        valueScore: 0.2,
        effectiveScore: 0.2,
      },
    ];
    const docAlpha: ResourceDocument = buildResourceDocument({
      id: "alpha",
      content: "alpha",
      document_key: FileType.business_case,
    });
    const docBeta: ResourceDocument = buildResourceDocument({
      id: "beta",
      content: "beta",
      document_key: FileType.success_metrics,
    });
    const { instance: tokenWalletService } = createMockTokenWalletService({
      getBalance: () => Promise.resolve("100000"),
    });
    let orderCountIdx: number = 0;
    const countTokens: CountTokensFn = createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _cfg: AiModelExtendedConfig,
      ): number => {
        orderCountIdx++;
        if (orderCountIdx === 1) return 400;
        return 80;
      },
    });
    const deps: CompressPromptDeps = buildCompressPromptDeps({
      tokenWalletService,
      ragService: mockRag,
      countTokens,
    });
    const { client } = createMockSupabaseClient("compress-prompt-unit", {
      genericMockResults: {
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const params: CompressPromptParams = buildCompressPromptParams(DbClient(client), {
      extendedModelConfig: cfg,
      jobId: "job-rag2-order",
      inputsRelevance: [],
      finalTargetThreshold: 80,
      balanceAfterCompression: 900000,
      walletBalance: 1_000_000,
    });
    const payload: CompressPromptPayload = buildCompressPromptPayload({
      compressionStrategy: orderedStrategy,
      resourceDocuments: [docAlpha, docBeta],
      currentUserPrompt: "CURR",
      chatApiRequest: buildChatApiRequest([docAlpha, docBeta], "CURR"),
      tokenizerDeps: buildTokenizerDeps(),
    });
    const result: CompressPromptReturn = await compressPrompt(deps, params, payload);
    assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
    assertEquals(ragSpy.calls.length >= 1, true);
    const firstVictimId: unknown = ragSpy.calls[0].args[0][0]?.id;
    assertEquals(firstVictimId, "alpha");
  },
);

Deno.test(
  "wrapper compressionStrategy exposes non-decreasing effectiveScore candidate list",
  async () => {
    const cfg: AiModelExtendedConfig = buildExtendedModelConfig({
      context_window_tokens: 100,
      provider_max_input_tokens: 256,
    });
    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({ mockContextResult: "s", mockTokensUsed: 0 });
    const innerStrategy: ICompressionStrategy = async () => [
      {
        id: "A",
        content: "x",
        sourceType: "document",
        originalIndex: 0,
        valueScore: 0.1,
        effectiveScore: 0.1,
      },
      {
        id: "B",
        content: "x",
        sourceType: "document",
        originalIndex: 1,
        valueScore: 0.2,
        effectiveScore: 0.15,
      },
    ];
    let returnedCandidates: CompressionCandidate[] | null = null;
    const wrapperStrategy: ICompressionStrategy = async (d, p, pl) => {
      const list: CompressionCandidate[] = await innerStrategy(d, p, pl);
      returnedCandidates = list;
      return list;
    };

    const d1: ResourceDocument = buildResourceDocument({
      id: "A",
      content: "x",
      document_key: FileType.business_case,
    });
    const d2: ResourceDocument = buildResourceDocument({
      id: "B",
      content: "x",
      document_key: FileType.success_metrics,
    });
    const { instance: tokenWalletService } = createMockTokenWalletService({
      getBalance: () => Promise.resolve("100000"),
    });
    let tiesCountIdx: number = 0;
    const countTokens: CountTokensFn = createMockCountTokens({
      countTokens: (
        _deps: CountTokensDeps,
        _payload: CountableChatPayload,
        _cfg: AiModelExtendedConfig,
      ): number => {
        tiesCountIdx++;
        if (tiesCountIdx === 1) return 500;
        return 90;
      },
    });
    const deps: CompressPromptDeps = buildCompressPromptDeps({
      tokenWalletService,
      ragService: mockRag,
      countTokens,
    });
    const { client } = createMockSupabaseClient("compress-prompt-unit", {
      genericMockResults: {
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const params: CompressPromptParams = buildCompressPromptParams(DbClient(client), {
      extendedModelConfig: cfg,
      jobId: "job-rag2-ties",
      inputsRelevance: [],
      finalTargetThreshold: 100,
      balanceAfterCompression: 900000,
      walletBalance: 1_000_000,
    });
    const payload: CompressPromptPayload = buildCompressPromptPayload({
      compressionStrategy: wrapperStrategy,
      resourceDocuments: [d1, d2],
      currentUserPrompt: "CURR",
      chatApiRequest: buildChatApiRequest([d1, d2], "CURR"),
      tokenizerDeps: buildTokenizerDeps(),
    });
    const result: CompressPromptReturn = await compressPrompt(deps, params, payload);
    assertEquals(isCompressPromptSuccessReturn(result), true, describeCompressPromptReturnForTestFailure(result));
    const cands: CompressionCandidate[] = Array.isArray(returnedCandidates) ? returnedCandidates : [];
    assertEquals(cands.length >= 1, true);
    for (let i: number = 1; i < cands.length; i++) {
      const prevRaw: CompressionCandidate | undefined = cands[i - 1];
      const currRaw: CompressionCandidate | undefined = cands[i];
      const prev: number | undefined = prevRaw?.effectiveScore;
      const curr: number | undefined = currRaw?.effectiveScore;
      assert(typeof prev === "number" && typeof curr === "number");
      assert(prev <= curr);
    }
  },
);
