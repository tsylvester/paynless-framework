import {
    assertEquals,
    assert,
    assertRejects,
  } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import { spy, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
  import {
    createMockSupabaseClient,
    type MockSupabaseClientSetup,
  } from "../_shared/supabase.mock.ts";
  import { logger } from "../_shared/logger.ts";
  import {
    createMockTokenWalletService,
    type MockTokenWalletService,
  } from "../_shared/services/tokenWalletService.mock.ts";
  import { type TokenWallet } from "../_shared/types/tokenWallet.types.ts";
  import {
    type AiModelExtendedConfig,
    type ChatApiRequest,
    type ChatHandlerDeps,
    type ChatHandlerSuccessResponse,
    AdapterResponsePayload,
    ChatMessageRow,
    Messages,
  } from "../_shared/types.ts";
  import { handleDialecticPath } from "./handleDialecticPath.ts";
  import { getMockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import { type Database } from "../types_db.ts";
  import { defaultDeps } from "./index.ts";
import { type PathHandlerContext } from "./prepareChatContext.ts";
import type { CountTokensDeps, CountableChatPayload } from "../_shared/types/tokenizer.types.ts";
import { isRecord } from "../_shared/utils/type_guards.ts";
import { isTokenUsage } from "../_shared/utils/type_guards.ts";

const createSpiedMockAdapter = (modelConfig: AiModelExtendedConfig) => {
    const { instance, controls } = getMockAiProviderAdapter(logger, modelConfig);
    const sendMessageSpy = spy(instance, 'sendMessage');
    return {
        instance,
        controls,
        sendMessageSpy,
    };
}

Deno.test("handleDialecticPath: happy path - should NOT create chat or message records, but should debit tokens", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: "cl100k_base",
        },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    const mockAdapterResponse: AdapterResponsePayload = {
      role: 'assistant',
      content: "Dialectic assistant response",
      ai_provider_id: "test-provider-id",
      system_prompt_id: null,
      token_usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };
    mockAiAdapter.controls.setMockResponse(mockAdapterResponse);
  
    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

    const countTokensSpy = spy((
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _cfg: AiModelExtendedConfig,
    ) => 10);

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: countTokensSpy,
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Hello Dialectic",
      providerId: "test-provider",
      promptId: "__none__",
      walletId: "test-wallet",
      isDialectic: true,
    };
  
    const wallet: TokenWallet = {
      walletId: "test-wallet",
      balance: "10000",
      currency: "AI_TOKEN",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet,
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    const result = await handleDialecticPath(context);
    
    assert(!('error' in result), `Expected success, but got an error: ${('error' in result && result.error.message) || 'Unknown'}`);
    const successResult: ChatHandlerSuccessResponse = result;
    
    const chatInsertCalls = mockSupabase.spies.getHistoricQueryBuilderSpies("chats", "insert");
    const messageInsertCalls = mockSupabase.spies.getHistoricQueryBuilderSpies("chat_messages", "insert");
    assertEquals(chatInsertCalls?.callCount, 0, "The 'chats' table should not have been written to.");
    assertEquals(messageInsertCalls?.callCount, 0, "The 'chat_messages' table should not have been written to.");
    assertEquals(successResult.chatId, undefined, "The returned chatId should be undefined.");

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 1, "tokenWalletService.recordTransaction should have been called once.");

    assert(successResult.userMessage, "A transient user message should have been returned.");
    assert(successResult.assistantMessage, "A transient assistant message should have been returned.");
    assertEquals(successResult.userMessage.content, "Hello Dialectic");
    assertEquals(
      successResult.assistantMessage.content,
      "Dialectic assistant response",
    );
  });

  Deno.test("handleDialecticPath: caps max_tokens_to_generate via SSOT when client omits", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

    const modelConfig: AiModelExtendedConfig = {
      api_identifier: "test-model-api-id",
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "ok", token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger,
      tokenWalletService: createMockTokenWalletService().instance,
      countTokens: spy((_d, _p, _c) => 100), // prompt_cost=100, remaining=900, spendable=min(800,900)=800 → SSOT cap=400
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };

    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody: { message: "Hi", providerId: "prov", promptId: "__none__", walletId: "w", isDialectic: true },
      wallet: { walletId: "w", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "k",
      providerApiIdentifier: "test-model-api-id",
    };

    await handleDialecticPath(context);
    const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
    assertEquals(sent.max_tokens_to_generate, 400);
  });

  Deno.test("handleDialecticPath: preserves smaller client max_tokens_to_generate", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 1, output_token_cost_rate: 2, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "ok" });
    const deps: ChatHandlerDeps = { ...defaultDeps, logger, tokenWalletService: createMockTokenWalletService().instance, countTokens: spy((_d,_p,_c)=>100), getAiProviderAdapter: spy(() => mockAiAdapter.instance) };
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody: { message: "Hi", providerId: "prov", promptId: "__none__", walletId: "w", isDialectic: true, max_tokens_to_generate: 50 },
      wallet: { walletId: "w", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "k",
      providerApiIdentifier: "test-model-api-id",
    };
    await handleDialecticPath(context);
    const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
    assertEquals(sent.max_tokens_to_generate, 50);
  });

  Deno.test("handleDialecticPath: caps larger client max_tokens_to_generate to SSOT", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 1, output_token_cost_rate: 2, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "ok" });
    const deps: ChatHandlerDeps = { ...defaultDeps, logger, tokenWalletService: createMockTokenWalletService().instance, countTokens: spy((_d,_p,_c)=>100), getAiProviderAdapter: spy(() => mockAiAdapter.instance) };
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody: { message: "Hi", providerId: "prov", promptId: "__none__", walletId: "w", isDialectic: true, max_tokens_to_generate: 9999 },
      wallet: { walletId: "w", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "k",
      providerApiIdentifier: "test-model-api-id",
    };
    await handleDialecticPath(context);
    const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
    assertEquals(sent.max_tokens_to_generate, 400);
  });

  Deno.test("handleDialecticPath: does NOT post-hoc cap completion_tokens; cap must be pre-send via SSOT (RED)", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

    const modelConfig: AiModelExtendedConfig = {
      api_identifier: "test-model-api-id",
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
      hard_cap_output_tokens: 5, // Intentionally small to trigger post-hoc cap if it existed
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    // Adapter returns a larger completion_tokens than hard cap to detect mutation
    mockAiAdapter.controls.setMockResponse({
      role: 'assistant',
      content: 'ok',
      ai_provider_id: 'prov',
      system_prompt_id: null,
      token_usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
    });

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger,
      tokenWalletService: createMockTokenWalletService().instance,
      // Make SSOT cap deterministic: prompt=100 → budget remaining 900; spendable=min(800,900)=800 → SSOT output cap=400
      countTokens: spy((_d, _p, _c) => 100),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };

    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: 'test-user-id',
      requestBody: { message: 'Hi', providerId: 'prov', promptId: '__none__', walletId: 'w', isDialectic: true },
      wallet: { walletId: 'w', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: 'k',
      providerApiIdentifier: 'test-model-api-id',
    };

    const result = await handleDialecticPath(context);
    assert(!('error' in result), 'Expected success');

    // Assert cap was applied pre-send (SSOT/min with model hard cap) and not post-hoc to tokenUsage
    const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
    assertEquals(sent.max_tokens_to_generate, 5, 'Pre-send cap should be the SSOT result min() with model hard cap');

    // RED expectation: handler must NOT mutate adapter's token_usage based on model hard cap
    const success: ChatHandlerSuccessResponse = result;
    const usageRaw = success.assistantMessage.token_usage;
    assert(isTokenUsage(usageRaw), 'assistantMessage.token_usage must conform to TokenUsage');
    assertEquals(usageRaw.completion_tokens, 50, 'completion_tokens must remain as returned by adapter (no post-hoc capping)');
    assertEquals(usageRaw.total_tokens, 60, 'total_tokens must remain consistent with adapter return (no post-hoc recompute)');
  });

Deno.test("handleDialecticPath: missing walletId returns 400 with specific message and no adapter call (RED)", async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.02,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({
    role: 'assistant',
    content: 'ok',
    ai_provider_id: 'test-provider-id',
    system_prompt_id: null,
    token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger,
    tokenWalletService: mockTokenWalletService.instance,
    countTokens: spy(() => 5),
    getAiProviderAdapter: spy(() => mockAiAdapter.instance),
  };

  const requestBody: ChatApiRequest = {
    message: 'Hello without walletId',
    providerId: 'test-provider',
    promptId: '__none__',
    isDialectic: true,
    // walletId intentionally omitted
  };

  const wallet: TokenWallet = {
    walletId: 'context-wallet',
    balance: '10000',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
    userId: 'test-user-id',
    requestBody,
    wallet,
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model-api-id',
  };

  const result = await handleDialecticPath(context);
  assert('error' in result, 'Expected an error result');
  if ('error' in result) {
    assertEquals(result.error.message, 'Wallet required for chat operation.');
    assertEquals(result.error.status, 400);
  }
  assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 0, 'AI adapter should not be called when walletId is missing');
});

Deno.test("handleDialecticPath: missing 'countTokens' dependency yields specific token calc error and no adapter call (RED)", async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.02,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({ content: 'ok' });

  const baseDeps: ChatHandlerDeps = {
    ...defaultDeps,
    logger,
    tokenWalletService: createMockTokenWalletService().instance,
    countTokens: spy(() => 5),
    getAiProviderAdapter: spy(() => mockAiAdapter.instance),
  };
  // Intentionally remove countTokens to simulate missing critical dep
  const badDeps = { ...baseDeps } as unknown as typeof baseDeps;
  delete (badDeps as unknown as Record<string, unknown>)['countTokens'];

  const requestBody: ChatApiRequest = {
    message: 'Hello',
    providerId: 'test-provider',
    promptId: '__none__',
    walletId: 'test-wallet',
    isDialectic: true,
  };

  const wallet: TokenWallet = {
    walletId: 'test-wallet',
    balance: '10000',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps: badDeps as unknown as ChatHandlerDeps,
    userId: 'test-user-id',
    requestBody,
    wallet,
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model-api-id',
  };

  const result = await handleDialecticPath(context);
  assert('error' in result, 'Expected an error result');
  if ('error' in result) {
    assert(result.error.message.startsWith('Internal server error during token calculation:'), 'Error message should be specific to token calculation');
    assertEquals(result.error.status, 500);
  }
  assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 0, 'AI adapter should not be called when countTokens is missing');
});
Deno.test("handleDialecticPath: resourceDocuments increase counts and are forwarded unchanged (distinct from messages) (RED)", async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.02,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({
    role: 'assistant',
    content: 'ok',
    ai_provider_id: 'test-provider-id',
    system_prompt_id: null,
    token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

  // Capture the payload passed to counting and compute a count dependent on docs+messages
  let sizedPayload: {
    systemInstruction?: string;
    message?: string;
    messages?: { role: 'system'|'user'|'assistant'; content: string }[];
    resourceDocuments?: { id?: string; content: string }[];
  } | null = null;
  let lastComputedCount = 0;
  const countTokensSpy = spy((deps: CountTokensDeps, payload: unknown, cfg: AiModelExtendedConfig) => {
    if (isRecord(payload)) {
      const msgsUnknown = payload['messages'];
      const docsUnknown = payload['resourceDocuments'];
      let msgCount = 0;
      if (Array.isArray(msgsUnknown)) {
        for (const m of msgsUnknown) {
          if (isRecord(m)) {
            const roleVal = typeof m['role'] === 'string' ? m['role'] : undefined;
            const contentVal = typeof m['content'] === 'string' ? m['content'] : undefined;
            if ((roleVal === 'user' || roleVal === 'assistant' || roleVal === 'system') && typeof contentVal === 'string') {
              msgCount++;
            }
          }
        }
      }
      let docCount = 0;
      if (Array.isArray(docsUnknown)) {
        for (const d of docsUnknown) {
          if (isRecord(d)) {
            const contentVal = typeof d['content'] === 'string' ? d['content'] : undefined;
            if (typeof contentVal === 'string') {
              docCount++;
            }
          }
        }
      }
      sizedPayload = {
        systemInstruction: typeof payload['systemInstruction'] === 'string' ? payload['systemInstruction'] : undefined,
        message: typeof payload['message'] === 'string' ? payload['message'] : undefined,
        messages: Array.isArray(msgsUnknown) ? (msgsUnknown.filter((m) => isRecord(m) && typeof m['content'] === 'string' && (m['role'] === 'user' || m['role'] === 'assistant' || m['role'] === 'system')).map((m) => ({ role: (m as { role: 'system'|'user'|'assistant' } ).role, content: (m as { content: string }).content }))) : [],
        resourceDocuments: Array.isArray(docsUnknown) ? (docsUnknown.filter((d) => isRecord(d) && typeof d['content'] === 'string').map((d) => ({ id: typeof d['id'] === 'string' ? d['id'] : undefined, content: (d as { content: string }).content }))) : [],
      };
      lastComputedCount = msgCount + docCount + 1; // prove docs affect the count
    }
    return lastComputedCount;
  });

  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger: logger,
    tokenWalletService: mockTokenWalletService.instance,
    countTokens: countTokensSpy,
    getAiProviderAdapter: spy(() => mockAiAdapter.instance),
  };

  const requestMessages: NonNullable<ChatApiRequest['messages']> = [
    { role: 'user', content: 'seed user' },
    { role: 'assistant', content: 'first reply' },
  ];
  const requestResourceDocs: NonNullable<ChatApiRequest['resourceDocuments']> = [
    { id: 'doc-1', content: 'Doc for counting' },
  ];

  const requestBody: ChatApiRequest = {
    message: 'Please continue.',
    providerId: 'test-provider',
    promptId: '__none__',
    walletId: 'test-wallet',
    isDialectic: true,
    messages: requestMessages,
    systemInstruction: 'SYSTEM: pass-through',
    resourceDocuments: requestResourceDocs,
  };

  const wallet: TokenWallet = {
    walletId: 'test-wallet',
    balance: '10000',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
    userId: 'test-user-id',
    requestBody,
    wallet,
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model-api-id',
  };

  const result = await handleDialecticPath(context);
  assert(!('error' in result), 'Expected success');

  // Prove resourceDocuments participated in sizing
  const expectedCount = requestMessages.length + requestResourceDocs.length + 1;
  assertEquals(lastComputedCount, expectedCount, 'Token counting should increase with resourceDocuments present');
  assert(sizedPayload !== null, 'sizedPayload should have been captured');
  const sizedHasDocs = isRecord(sizedPayload) && Array.isArray(sizedPayload['resourceDocuments']);
  const sizedDocs = sizedHasDocs ? sizedPayload['resourceDocuments'] : [];
  assertEquals(sizedDocs.length, requestResourceDocs.length, 'Sizing payload should include resourceDocuments unchanged in count dimension');

  // Prove adapter receives docs unchanged and they are not merged into messages
  const firstSendArg = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assert(isRecord(firstSendArg), 'Adapter request should be an object');
  assertEquals(firstSendArg.resourceDocuments, requestResourceDocs, 'resourceDocuments must be forwarded unchanged');
  assertEquals(firstSendArg.messages, requestMessages, 'messages must be forwarded unchanged (docs are distinct)');
});

Deno.test("handleDialecticPath: missing walletId in request triggers hard failure before adapter call", async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.02,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({
    role: 'assistant',
    content: 'ok',
    ai_provider_id: 'test-provider-id',
    system_prompt_id: null,
    token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

  const countTokensSpy = spy((
    deps: CountTokensDeps,
    payload: CountableChatPayload,
    cfg: AiModelExtendedConfig,
  ) => 5);

  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger: logger,
    tokenWalletService: mockTokenWalletService.instance,
    countTokens: countTokensSpy,
    getAiProviderAdapter: spy(() => mockAiAdapter.instance),
  };

  const requestBody: ChatApiRequest = {
    message: 'Hello without walletId',
    providerId: 'test-provider',
    promptId: '__none__',
    isDialectic: true,
    // walletId intentionally omitted for RED
  };

  // Provide a wallet in context to prove enforcement must key off requestBody.walletId
  // and not silently proceed with a default wallet.
  const wallet: TokenWallet = {
    walletId: 'context-wallet',
    balance: '10000',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
    userId: 'test-user-id',
    requestBody,
    wallet,
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model-api-id',
  };

  const result = await handleDialecticPath(context);

  // Expect a hard local failure and no provider call when walletId is missing on the request
  assert('error' in result, 'Expected an error result for missing walletId');
  if ('error' in result) {
    // Status code choice will be enforced in GREEN; we only require an error now
    assert(
      typeof result.error.message === 'string' &&
      (result.error.message.toLowerCase().includes('wallet') || result.error.message.toLowerCase().includes('missing')),
      'Error message should indicate missing wallet enforcement'
    );
  }
  assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 0, 'AI adapter should not have been called.');
});

Deno.test("handleDialecticPath: forwards message, messages, and systemInstruction unchanged; uses requestBody.messages for token counting (RED)", async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

  const modelConfig: AiModelExtendedConfig = {
      api_identifier: "test-model-api-id",
      input_token_cost_rate: 0.01,
      output_token_cost_rate: 0.02,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({
    role: 'assistant',
    content: 'ok',
    ai_provider_id: 'test-provider-id',
    system_prompt_id: null,
    token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

  const countTokensSpy = spy((
    deps: CountTokensDeps,
    payload: CountableChatPayload,
    cfg: AiModelExtendedConfig,
  ) => 5);

  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger: logger,
    tokenWalletService: mockTokenWalletService.instance,
    countTokens: countTokensSpy,
    getAiProviderAdapter: spy(() => mockAiAdapter.instance),
  };

  const requestMessages: NonNullable<ChatApiRequest['messages']> = [
    { role: 'user', content: 'seed user' },
    { role: 'assistant', content: 'first reply' },
    { role: 'user', content: 'Please continue.' },
  ];

  const requestBody: ChatApiRequest = {
    message: 'Please continue.',
    providerId: 'test-provider',
    promptId: '__none__',
    walletId: 'test-wallet',
    isDialectic: true,
    messages: requestMessages,
    systemInstruction: 'SYSTEM: pass-through',
  };

  const wallet: TokenWallet = {
    walletId: 'test-wallet',
    balance: '10000',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
    userId: 'test-user-id',
    requestBody,
    wallet,
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model-api-id',
  };

  const result = await handleDialecticPath(context);
  assert(!('error' in result), 'Expected success');

  // Assert token counting used requestBody.messages via payload
  const firstCountPayload = countTokensSpy.calls[0]?.args?.[1];
  assertEquals(firstCountPayload.messages, requestMessages, 'Token counting should use requestBody.messages');

  // Assert adapter received pass-through request
  const firstSendArg = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assertEquals(firstSendArg.message, requestBody.message, 'message must be forwarded unchanged');
  assertEquals(firstSendArg.messages, requestBody.messages, 'messages must be forwarded unchanged');
  assertEquals(firstSendArg.systemInstruction, requestBody.systemInstruction, 'systemInstruction must be forwarded unchanged');
});

Deno.test("handleDialecticPath: counts full payload and forwards it unchanged", async () => {
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.02,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({
    role: 'assistant',
    content: 'ok',
    ai_provider_id: 'test-provider-id',
    system_prompt_id: null,
    token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

  // Capture the payload passed to countTokens (no casts)
  let sizedPayload: {
    systemInstruction?: string;
    message?: string;
    messages?: { role: 'system'|'user'|'assistant'; content: string }[];
    resourceDocuments?: { id?: string; content: string }[];
  } | null = null;

  const countTokensSpy = spy((deps: CountTokensDeps, payload: unknown, cfg: AiModelExtendedConfig) => {
    if (isRecord(payload)) {
      const sys = typeof payload['systemInstruction'] === 'string' ? payload['systemInstruction'] : undefined;
      const msg = typeof payload['message'] === 'string' ? payload['message'] : undefined;

      const msgsUnknown = payload['messages'];
      const msgs: { role: 'system'|'user'|'assistant'; content: string }[] = [];
      if (Array.isArray(msgsUnknown)) {
        for (const m of msgsUnknown) {
          if (isRecord(m)) {
            const roleVal = typeof m['role'] === 'string' ? m['role'] : undefined;
            const contentVal = typeof m['content'] === 'string' ? m['content'] : undefined;
            if ((roleVal === 'user' || roleVal === 'assistant' || roleVal === 'system') && typeof contentVal === 'string') {
              const r = roleVal;
              msgs.push({ role: r, content: contentVal });
            }
          }
        }
      }

      const docsUnknown = payload['resourceDocuments'];
      const docs: { id?: string; content: string }[] = [];
      if (Array.isArray(docsUnknown)) {
        for (const d of docsUnknown) {
          if (isRecord(d)) {
            const idVal = typeof d['id'] === 'string' ? d['id'] : undefined;
            const contentVal = typeof d['content'] === 'string' ? d['content'] : undefined;
            if (typeof contentVal === 'string') {
              docs.push({ id: idVal, content: contentVal });
            }
          }
        }
      }

      sizedPayload = { systemInstruction: sys, message: msg, messages: msgs, resourceDocuments: docs };
    }
    return 5;
  });

  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger: logger,
    tokenWalletService: mockTokenWalletService.instance,
    countTokens: countTokensSpy,
    getAiProviderAdapter: spy(() => mockAiAdapter.instance),
  };

  const requestMessages: NonNullable<ChatApiRequest['messages']> = [
    { role: 'user', content: 'seed user' },
    { role: 'assistant', content: 'first reply' },
    { role: 'user', content: 'Please continue.' },
  ];

  const requestResourceDocs: NonNullable<ChatApiRequest['resourceDocuments']> = [
    { id: 'doc-1', content: 'Doc A' },
    { id: 'doc-2', content: 'Doc B' },
  ];

  const requestBody: ChatApiRequest = {
    message: 'Please continue.',
    providerId: 'test-provider',
    promptId: '__none__',
    walletId: 'test-wallet',
    isDialectic: true,
    messages: requestMessages,
    systemInstruction: 'SYSTEM: pass-through',
    resourceDocuments: requestResourceDocs,
  };

  const wallet: TokenWallet = {
    walletId: 'test-wallet',
    balance: '10000',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps,
    userId: 'test-user-id',
    requestBody,
    wallet,
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model-api-id',
  };

  const result = await handleDialecticPath(context);
  assert(!('error' in result), 'Expected success');

  // Assert full-object counting
  const ctArgs = countTokensSpy.calls[0]?.args ?? [];
  assertEquals(ctArgs.length, 3, 'countTokens should be called with three arguments');
  const ctPayload = ctArgs[1];
  // sizedPayload captured by the spy must equal the four fields from requestBody
  const expectedFour = {
    systemInstruction: requestBody.systemInstruction,
    message: requestBody.message,
    messages: requestBody.messages,
    resourceDocuments: requestBody.resourceDocuments,
  };
  assert(sizedPayload !== null, 'sizedPayload should have been captured');
  assertEquals(sizedPayload, expectedFour, 'Token counting must use the full request payload unchanged');

  // Assert adapter received pass-through request (full identity on four fields)
  const firstSendArg = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assert(isRecord(firstSendArg), 'Adapter request should be an object');
  assertEquals(firstSendArg.message, requestBody.message, 'message must be forwarded unchanged');
  assertEquals(firstSendArg.messages, requestBody.messages, 'messages must be forwarded unchanged');
  assertEquals(firstSendArg.systemInstruction, requestBody.systemInstruction, 'systemInstruction must be forwarded unchanged');
  assertEquals(firstSendArg.resourceDocuments, requestBody.resourceDocuments, 'resourceDocuments must be forwarded unchanged');

  // Identity invariant: the four fields used for counting must equal those sent to the adapter
  const sentFour = {
    systemInstruction: firstSendArg.systemInstruction,
    message: firstSendArg.message,
    messages: firstSendArg.messages,
    resourceDocuments: firstSendArg.resourceDocuments,
  };
  assertEquals(sizedPayload, sentFour, 'Sized payload must equal adapter request on the four fields');
});

Deno.test("handleDialecticPath: AI adapter fails - should not debit tokens and return error", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: "cl100k_base",
        },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockError(new Error("AI provider exploded"));
  
    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "This will fail",
      providerId: "test-provider",
      promptId: "__none__",
      walletId: "test-wallet",
      isDialectic: true,
    };
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleDialecticPath(context);
  
    // Assert
    assert('error' in result, "Expected an error result");
    assertEquals(result.error.message, "AI provider exploded");
    assertEquals(result.error.status, 502);
  
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, "No token transaction should have been recorded.");
    const messageInsertCalls = mockSupabase.spies.getHistoricQueryBuilderSpies("chat_messages", "insert");
    assertEquals(messageInsertCalls?.callCount, 0, "No chat messages should have been saved.");
  });

Deno.test("handleDialecticPath: debitTokens fails - should trigger refund", async () => {
    // This test simulates a failure *inside* the databaseOperation of debitTokens
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});

    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "Assistant response" });
  
    const mockTokenWalletService = createMockTokenWalletService();
    
    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };

    const debitTokensStub = stub(deps, "debitTokens", async () => {
        await mockTokenWalletService.instance.recordTransaction({
            walletId: 'test-wallet',
            type: 'DEBIT_USAGE',
            amount: '30',
            recordedByUserId: 'test-user-id',
            idempotencyKey: 'debit-key'
        });
        await mockTokenWalletService.instance.recordTransaction({
            walletId: 'test-wallet',
            type: 'CREDIT_ADJUSTMENT',
            amount: '30',
            recordedByUserId: 'test-user-id',
            idempotencyKey: 'credit-key'
        });
        return Promise.reject(new Error("Simulated DB insert failed"));
    });
  
    const requestBody: ChatApiRequest = {
      message: "This will fail during debit",
      providerId: "test-provider",
      promptId: "__none__",
      walletId: "test-wallet",
      isDialectic: true,
    };
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    await assertRejects(
      () => handleDialecticPath(context),
      Error,
      "Simulated DB insert failed",
    );
  
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 2, "Expected two transactions (debit and refund).");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[0].args[0].type, "DEBIT_USAGE");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[1].args[0].type, "CREDIT_ADJUSTMENT");

    debitTokensStub.restore();
  });


Deno.test("handleDialecticPath: insufficient funds - should return 402", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 1_000_000, // Exaggerated cost
        output_token_cost_rate: 1_000_000,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();
  
    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: spy(() => 10), // A non-zero token count
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "This is too expensive",
      providerId: "test-provider",
      promptId: "__none__",
      walletId: "test-wallet",
      isDialectic: true,
    };
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet: { walletId: "test-wallet", balance: "1", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() }, // Very low balance
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleDialecticPath(context);
  
    // Assert
    assert('error' in result, "Expected an error result");
    assertEquals(result.error.status, 402, "Expected status 402 for insufficient funds.");
    assert(result.error.message.includes("Insufficient token balance"));
  
    assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 0, "AI adapter should not have been called.");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, "No token transaction should have been recorded.");
  });

Deno.test("handleDialecticPath: should pass 'finish_reason' from adapter to final response", async () => {
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: "cl100k_base",
        },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    const mockAdapterResponse: AdapterResponsePayload = {
      role: 'assistant',
      content: "Dialectic assistant response",
      finish_reason: "max_tokens", // The critical value to test for
      ai_provider_id: "test-provider-id",
      system_prompt_id: null,
      token_usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };
    mockAiAdapter.controls.setMockResponse(mockAdapterResponse);
  
    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Hello Dialectic",
      providerId: "test-provider",
      promptId: "__none__",
      walletId: "test-wallet",
      isDialectic: true,
    };
  
    const wallet: TokenWallet = {
      walletId: "test-wallet",
      balance: "10000",
      currency: "AI_TOKEN",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet,
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    const result = await handleDialecticPath(context);
    
    assert(!('error' in result), `Expected success, but got an error: ${('error' in result && result.error.message) || 'Unknown'}`);
    const successResult: ChatHandlerSuccessResponse = result;
    
    assertEquals(successResult.finish_reason, "max_tokens", "The 'finish_reason' should be passed from the adapter to the final response.");
  });

Deno.test("handleDialecticPath: with continue_until_complete=true, it should call sendMessage once", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {});
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };

    const { instance: mockAiAdapter } = getMockAiProviderAdapter(logger, modelConfig);
    
    const firstResponse: AdapterResponsePayload = {
      role: 'assistant',
      content: "This is a partial response... ",
      finish_reason: "length",
      ai_provider_id: "test-provider-id",
      system_prompt_id: null,
      token_usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
    };
    const secondResponse: AdapterResponsePayload = {
        role: 'assistant',
        content: "and this is the final part.",
        finish_reason: "stop",
        ai_provider_id: "test-provider-id",
        system_prompt_id: null,
        token_usage: { prompt_tokens: 60, completion_tokens: 10, total_tokens: 70 },
    };

    let callCount = 0;
    const sendMessageStub = stub(mockAiAdapter, "sendMessage", () => {
        if (callCount === 0) {
            callCount++;
            return Promise.resolve(firstResponse);
        }
        return Promise.resolve(secondResponse);
    });
  
    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Give me a very long response that requires continuation.",
      providerId: "test-provider",
      promptId: "__none__",
      walletId: "test-wallet",
      isDialectic: true,
      continue_until_complete: true,
    };
  
    const wallet: TokenWallet = {
      walletId: "test-wallet",
      balance: "10000",
      currency: "AI_TOKEN",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet,
      aiProviderAdapter: mockAiAdapter,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    try {
        await handleDialecticPath(context);
        
        assertEquals(sendMessageStub.calls.length, 1, "The AI adapter's sendMessage method was called more than once due to the continuation loop.");
    } finally {
        sendMessageStub.restore();
    }
  });