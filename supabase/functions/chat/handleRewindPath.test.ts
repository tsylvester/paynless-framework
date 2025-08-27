import {
    assertEquals,
    assertRejects,
    assert,
    assertExists,
    assertObjectMatch,
  } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import { spy, assertSpyCalls } from "https://deno.land/std@0.224.0/testing/mock.ts";
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
    type AdapterResponsePayload,
    type AiModelExtendedConfig,
    type ChatApiRequest,
    type ChatHandlerDeps,
    type ChatHandlerSuccessResponse,
    type ChatMessageRow,
    FactoryDependencies,
} from "../_shared/types.ts";
  import { handleRewindPath } from "./handleRewindPath.ts";
  import { getMockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import { type Database } from "../types_db.ts";
  import { defaultDeps } from "./index.ts";
  import { type PathHandlerContext } from "./prepareChatContext.ts";
  import type { CountableChatPayload } from "../_shared/types/tokenizer.types.ts";

  // Helper to create a fully-typed mock adapter with spies
const createSpiedMockAdapter = (modelConfig: AiModelExtendedConfig) => {
    const { instance, controls } = getMockAiProviderAdapter(logger, modelConfig);
    const sendMessageSpy = spy(instance, 'sendMessage');
    return {
        instance,
        controls,
        sendMessageSpy,
    };
}
  
  Deno.test("handleRewindPath: failure in perform_chat_rewind RPC call triggers refund", async () => {
    // Arrange
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
        "test-user-id",
        {
            genericMockResults: {
                chat_messages: {
                    select: { data: [{ created_at: new Date().toISOString() }], error: null, count: 1, status: 200, statusText: 'OK' },
                },
            },
            rpcResults: {
                perform_chat_rewind: { data: null, error: new Error("RPC exploded") },
            },
        }
    );
  
    const mockTokenWalletService = createMockTokenWalletService();
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "This should not be used" });
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: { ...defaultDeps, logger, tokenWalletService: mockTokenWalletService.instance, countTokens: spy((_deps, _payload, _cfg) => 10), getAiProviderAdapter: spy((_deps: FactoryDependencies) => mockAiAdapter.instance) },
      userId: "test-user-id",
      requestBody: { message: "test", providerId: "test", promptId: "test", rewindFromMessageId: "test", chatId: "test" },
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act & Assert
    await assertRejects(
      () => handleRewindPath(context),
      Error,
      "RPC exploded"
    );
  
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 2);
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[0].args[0].type, "DEBIT_USAGE");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls[1].args[0].type, "CREDIT_ADJUSTMENT");
  });
  
  Deno.test("handleRewindPath: AI adapter failure saves error messages", async () => {
    // Arrange
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
        "test-user-id",
        {
            genericMockResults: {
                chat_messages: {
                    select: { data: [{ created_at: new Date().toISOString() }], error: null, count: 1, status: 200, statusText: 'OK' },
                    insert: { data: [{ id: "saved-message-id" }], error: null, count: 1, status: 201, statusText: 'Created' },
                },
            },
        }
    );
  
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockError(new Error("AI provider exploded"));
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: { ...defaultDeps, logger, countTokens: spy((_deps, _payload, _cfg) => 10), getAiProviderAdapter: spy((_deps: FactoryDependencies) => mockAiAdapter.instance) },
      userId: "test-user-id",
      requestBody: { message: "test", providerId: "test", promptId: "test", rewindFromMessageId: "test", chatId: "test" },
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleRewindPath(context);
  
    // Assert
    assert(!('error' in result));
    const successResult: ChatHandlerSuccessResponse = result;
    assert(successResult.assistantMessage.content?.includes("AI service request failed (rewind): AI provider exploded"));
    const insertSpies = mockSupabase.spies.getHistoricQueryBuilderSpies('chat_messages', 'insert');
    assertEquals(insertSpies?.callCount, 2);
  });
  
  Deno.test("handleRewindPath: history fetch failure returns error", async () => {
    // Arrange
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
        "test-user-id",
        {
            genericMockResults: {
                chat_messages: {
                    select: { data: null, error: new Error("History fetch failed"), count: 0, status: 500, statusText: 'Error' },
                },
            },
        }
    );
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: { ...defaultDeps, logger, countTokens: spy((_deps, _payload, _cfg) => 10), getAiProviderAdapter: spy((_deps: FactoryDependencies) => mockAiAdapter.instance) },
      userId: "test-user-id",
      requestBody: { message: "test", providerId: "test", promptId: "test", rewindFromMessageId: "test", chatId: "test" },
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleRewindPath(context);
  
    // Assert
    assert('error' in result);
    assertEquals(result.error.message, "History fetch failed");
    assertEquals(result.error.status, 500);
  });

Deno.test("handleRewindPath: non-existent rewindFromMessageId returns 404", async () => {
    // Arrange
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
        "test-user-id",
        {
            genericMockResults: {
                chat_messages: {
                    select: { data: null, error: null, count: 0, status: 200, statusText: 'OK' }, // Simulate message not found
                },
            },
        }
    );
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);

    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: { ...defaultDeps, logger, countTokens: spy((_deps, _payload, _cfg) => 10), getAiProviderAdapter: spy((_deps: FactoryDependencies) => mockAiAdapter.instance) },
      userId: "test-user-id",
      requestBody: { message: "test", providerId: "test", promptId: "test", rewindFromMessageId: "non-existent", chatId: "test" },
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };

    // Act
    const result = await handleRewindPath(context);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 404);
    assert(result.error.message.includes("Rewind point message with ID non-existent not found"));
});

Deno.test("handleRewindPath: POST request with rewindFromMessageId should call RPC and use its result", async () => {
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const rewindChatId = crypto.randomUUID();
    const userMsg1Content = "User Message 1 for RPC rewind";
    const aiMsg1Content = "AI Response 1 for RPC rewind";
    const userMsg3NewContent = "User Message 3 for RPC rewind (new user input)";
    const aiMsg3NewContentFromAdapter = "AI Response 3 from adapter for RPC rewind (new from AI)";
    const rewindFromMsgId = crypto.randomUUID();
    const initialTimestamp = new Date().getTime();
    const msgTimestamp = (offsetSeconds: number) => new Date(initialTimestamp + offsetSeconds * 1000).toISOString();
    const systemPromptText = 'Test system prompt for RPC rewind';
    const mockNewUserMessageIdRpc = crypto.randomUUID();
    const mockNewAssistantMessageIdRpc = crypto.randomUUID();
    const testProviderId = crypto.randomUUID();
    const testPromptId = crypto.randomUUID();

    const historyForAIAdapter: ChatMessageRow[] = [
        { id: "user-msg-1-rpc-id", chat_id: rewindChatId, user_id: 'test-user-id', role: 'user', content: userMsg1Content, created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, updated_at: msgTimestamp(0), error_type: null, response_to_message_id: null },
        { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg1Content, created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1}, updated_at: msgTimestamp(1), error_type: null, response_to_message_id: 'user-msg-1-rpc-id' },
    ];
    
    const newAiResponseFromAdapterPayload: Partial<AdapterResponsePayload> = {
        role: 'assistant', content: aiMsg3NewContentFromAdapter, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };

    const tokenUsage = newAiResponseFromAdapterPayload.token_usage;
    if (!tokenUsage) {
        throw new Error("Token usage is required");
    }
    const mockAssistantMessageFromRpc: ChatMessageRow = {
        id: mockNewAssistantMessageIdRpc,
        chat_id: rewindChatId, 
        user_id: null, 
        role: 'assistant',
        content: aiMsg3NewContentFromAdapter,
        created_at: msgTimestamp(5),
        is_active_in_thread: true,
        token_usage: tokenUsage,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        updated_at: msgTimestamp(5),
        error_type: null,
        response_to_message_id: mockNewUserMessageIdRpc,
    };
    
    let selectCallCount = 0;
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
        "test-user-id",
        {
            genericMockResults: {
                chat_messages: {
                    select: (_state) => {
                        selectCallCount++;
                        if (selectCallCount === 1) { // Fetch rewind point created_at
                            return Promise.resolve({ data: [{ created_at: historyForAIAdapter[1].created_at }], error: null });
                        }
                        if (selectCallCount === 2) { // Fetch history for AI
                            return Promise.resolve({ data: historyForAIAdapter, error: null });
                        }
                        // This test does not check for the final message fetch, so we can ignore further calls
                        return Promise.resolve({ data: [mockAssistantMessageFromRpc], error: null });
                    },
                },
            },
            rpcResults: {
                perform_chat_rewind: {
                    data: mockAssistantMessageFromRpc,
                    error: null
                }
            }
        }
    );

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse(newAiResponseFromAdapterPayload);

    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService();
    const countTokensSpy = spy((_deps, payload: CountableChatPayload, _cfg) => 10);
    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokens: countTokensSpy,
      getAiProviderAdapter: spy((_deps: FactoryDependencies) => mockAiAdapter.instance),
    };

    const requestBody: ChatApiRequest = {
      message: userMsg3NewContent,
      providerId: testProviderId,
      promptId: testPromptId,
      chatId: rewindChatId,
      rewindFromMessageId: rewindFromMsgId,
    };

    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps,
      userId: "test-user-id",
      requestBody,
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date()},
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: systemPromptText,
      finalSystemPromptIdForDb: testPromptId,
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };

    // Act
    const result = await handleRewindPath(context);

    // Assert
    assert(!('error' in result), `Expected success, but got an error: ${('error' in result && result.error.message) || 'Unknown'}`);
    const successResult: ChatHandlerSuccessResponse = result;
    
    assertObjectMatch(successResult.assistantMessage, {
        role: 'assistant',
        content: aiMsg3NewContentFromAdapter,
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;
    assertEquals(rpcSpy.calls.length, 1);
    assertEquals(rpcSpy.calls[0].args[0], 'perform_chat_rewind');
    assertObjectMatch(rpcSpy.calls[0].args[1], {
        p_chat_id: rewindChatId,
        p_rewind_from_message_id: rewindFromMsgId,
        p_user_id: "test-user-id",
        p_new_user_message_content: userMsg3NewContent,
        p_new_assistant_message_content: aiMsg3NewContentFromAdapter,
    });

    assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 1);
    const adapterHistory = mockAiAdapter.sendMessageSpy.calls[0].args[0].messages;
    assert(adapterHistory);
    assertEquals(adapterHistory[0].role, 'system');
    assertEquals(adapterHistory[1].role, 'user');
    assertEquals(adapterHistory[2].role, 'assistant');

    // Ensure sized equals sent: payload used for counting matches adapter request messages
    const countSpyCalls = countTokensSpy.calls;
    const payloadUsed = countSpyCalls && countSpyCalls[0] ? countSpyCalls[0].args[1] : undefined;
    assertEquals(payloadUsed?.messages, adapterHistory);
});

Deno.test("handleRewindPath: caps max_tokens_to_generate via SSOT when client omits", async () => {
  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  let selectCallCount = 0;
  const chatId1 = crypto.randomUUID();
  const rewindMsgId1 = crypto.randomUUID();
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
    genericMockResults: {
      chat_messages: {
        select: (_state) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve({ data: [{ created_at: new Date().toISOString() }], error: null });
          }
          return Promise.resolve({ data: [{ id: crypto.randomUUID(), role: 'user', content: 'hi', created_at: new Date().toISOString() }], error: null });
        },
      },
    },
    rpcResults: {
      perform_chat_rewind: { data: { id: crypto.randomUUID(), chat_id: chatId1, user_id: null, role: 'assistant', content: 'rewound assistant', created_at: new Date().toISOString(), is_active_in_thread: true, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, ai_provider_id: 'p', system_prompt_id: 'pr', updated_at: new Date().toISOString(), error_type: null, response_to_message_id: rewindMsgId1 }, error: null },
    },
  });

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({ content: "ok", token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });

  const mockTokenWalletService = createMockTokenWalletService();
  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps: { ...defaultDeps, logger, tokenWalletService: mockTokenWalletService.instance, countTokens: spy((_d, _p, _c) => 100), getAiProviderAdapter: spy((_f: FactoryDependencies) => mockAiAdapter.instance) },
    userId: "test-user-id",
    requestBody: { message: "m", providerId: "p", promptId: "pr", chatId: crypto.randomUUID(), rewindFromMessageId: crypto.randomUUID() },
    wallet: { walletId: "w", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: "k",
    providerApiIdentifier: modelConfig.api_identifier,
  };

  await handleRewindPath(context);
  const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assertEquals(sent.max_tokens_to_generate, 400);
});

Deno.test("handleRewindPath: preserves smaller client max_tokens_to_generate", async () => {
  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  let selectCallCount = 0;
  const chatId2 = crypto.randomUUID();
  const rewindMsgId2 = crypto.randomUUID();
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
    genericMockResults: {
      chat_messages: {
        select: (_state) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve({ data: [{ created_at: new Date().toISOString() }], error: null });
          }
          return Promise.resolve({ data: [{ id: crypto.randomUUID(), role: 'user', content: 'hi', created_at: new Date().toISOString() }], error: null });
        },
      },
    },
    rpcResults: {
      perform_chat_rewind: { data: { id: crypto.randomUUID(), chat_id: chatId2, user_id: null, role: 'assistant', content: 'rewound assistant', created_at: new Date().toISOString(), is_active_in_thread: true, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, ai_provider_id: 'p', system_prompt_id: 'pr', updated_at: new Date().toISOString(), error_type: null, response_to_message_id: rewindMsgId2 }, error: null },
    },
  });

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({ content: "ok", token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });

  const mockTokenWalletService = createMockTokenWalletService();
  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps: { ...defaultDeps, logger, tokenWalletService: mockTokenWalletService.instance, countTokens: spy((_d, _p, _c) => 100), getAiProviderAdapter: spy((_f: FactoryDependencies) => mockAiAdapter.instance) },
    userId: "test-user-id",
    requestBody: { message: "m", providerId: "p", promptId: "pr", chatId: crypto.randomUUID(), rewindFromMessageId: crypto.randomUUID(), max_tokens_to_generate: 50 },
    wallet: { walletId: "w", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: "k",
    providerApiIdentifier: modelConfig.api_identifier,
  };

  await handleRewindPath(context);
  const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assertEquals(sent.max_tokens_to_generate, 50);
});

Deno.test("handleRewindPath: caps larger client max_tokens_to_generate to SSOT", async () => {
  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "test-model-api-id",
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
  };

  let selectCallCount = 0;
  const chatId3 = crypto.randomUUID();
  const rewindMsgId3 = crypto.randomUUID();
  const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
    genericMockResults: {
      chat_messages: {
        select: (_state) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve({ data: [{ created_at: new Date().toISOString() }], error: null });
          }
          return Promise.resolve({ data: [{ id: crypto.randomUUID(), role: 'user', content: 'hi', created_at: new Date().toISOString() }], error: null });
        },
      },
    },
    rpcResults: {
      perform_chat_rewind: { data: { id: crypto.randomUUID(), chat_id: chatId3, user_id: null, role: 'assistant', content: 'rewound assistant', created_at: new Date().toISOString(), is_active_in_thread: true, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, ai_provider_id: 'p', system_prompt_id: 'pr', updated_at: new Date().toISOString(), error_type: null, response_to_message_id: rewindMsgId3 }, error: null },
    },
  });

  const mockAiAdapter = createSpiedMockAdapter(modelConfig);
  mockAiAdapter.controls.setMockResponse({ content: "ok", token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });

  const mockTokenWalletService = createMockTokenWalletService();
  const context: PathHandlerContext = {
    supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    deps: { ...defaultDeps, logger, tokenWalletService: mockTokenWalletService.instance, countTokens: spy((_d, _p, _c) => 100), getAiProviderAdapter: spy((_f: FactoryDependencies) => mockAiAdapter.instance) },
    userId: "test-user-id",
    requestBody: { message: "m", providerId: "p", promptId: "pr", chatId: crypto.randomUUID(), rewindFromMessageId: crypto.randomUUID(), max_tokens_to_generate: 9999 },
    wallet: { walletId: "w", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
    aiProviderAdapter: mockAiAdapter.instance,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: "k",
    providerApiIdentifier: modelConfig.api_identifier,
  };

  await handleRewindPath(context);
  const sent: ChatApiRequest = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assertEquals(sent.max_tokens_to_generate, 400);
});