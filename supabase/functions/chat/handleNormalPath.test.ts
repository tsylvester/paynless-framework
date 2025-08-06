import {
    assertEquals,
    assertRejects,
    assert,
  } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
  import {
    createMockSupabaseClient,
    type MockSupabaseClientSetup,
  } from "../_shared/supabase.mock.ts";
  import { logger } from "../_shared/logger.ts";
  import {
    createMockTokenWalletService,
    type MockTokenWalletService,
  } from "../_shared/services/tokenWalletService.mock.ts";
  import { type ITokenWalletService, type TokenWallet } from "../_shared/types/tokenWallet.types.ts";
  import {
    type AiModelExtendedConfig,
    type ChatApiRequest,
    type ChatHandlerDeps,
    type ChatMessageRow,
    type ChatHandlerSuccessResponse,
    type ILogger,
    type TokenUsage,
    AiProviderAdapterInstance,
  } from "../_shared/types.ts";
  import { handleNormalPath } from "./handleNormalPath.ts";
  import { getMockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
  import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
  import { type Database } from "../types_db.ts";
  import { defaultDeps } from "./index.ts";
import { type PathHandlerContext } from "./prepareChatContext.ts";
  
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

Deno.test("handleNormalPath: happy path - creates new chat and saves messages", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      "test-user-id",
      {
        genericMockResults: {
          chats: {
            select: () => Promise.resolve({ data: [], error: null, status: 200, statusText: 'OK', count: 0 }),
            insert: () =>
              Promise.resolve({ data: [{ id: "new-chat-id" }], error: null, status: 201, statusText: 'Created', count: 1 }),
          },
          chat_messages: {
            select: () => Promise.resolve({ data: [], error: null, status: 200, statusText: 'OK', count: 0 }),
            insert: (state) => {
              const data = state.insertData;
              if (typeof data === 'object' && data !== null && !Array.isArray(data) && 'role' in data && 'content' in data) {
                if (data.role === "user") {
                  return Promise.resolve({
                    data: [ { id: "user-message-id", role: "user", content: data.content } ],
                    error: null, status: 201, statusText: 'Created', count: 1
                  });
                }
                return Promise.resolve({
                  data: [ { id: "assistant-message-id", role: "assistant", content: data.content } ],
                  error: null, status: 201, statusText: 'Created', count: 1
                });
              }
              return Promise.reject(new Error("Mock insert failed: insertData was not a single message object."));
            },
          },
        },
      },
    );
  
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
    mockAiAdapter.controls.setMockResponse({ content: "Assistant response" });
  
    const mockTokenWalletService: MockTokenWalletService =
      createMockTokenWalletService();

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokensForMessages: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Hello",
      providerId: "test-provider",
      promptId: "__none__",
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
  
    // Act
    const result = await handleNormalPath(context);
    
    // Assert
    assert(!('error' in result), `Expected success, but got an error: ${('error' in result && result.error.message) || 'Unknown'}`);
    const successResult: ChatHandlerSuccessResponse = result;
    assert(successResult.userMessage, "User message should not be undefined on success.");
    assert(successResult.assistantMessage, "Assistant message should not be undefined on success.");
    assertEquals(successResult.chatId, "new-chat-id");
    assertEquals(successResult.userMessage.content, "Hello");
    assertEquals(
      successResult.assistantMessage.content,
      "Assistant response",
    );
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 1);
    const insertCalls = mockSupabase.spies.getHistoricQueryBuilderSpies(
      "chat_messages",
      "insert",
    );
    assertEquals(insertCalls?.callCount, 2);
  });
  
  Deno.test("handleNormalPath: AI adapter fails, saves error message", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      "test-user-id",
      {
        genericMockResults: {
          chats: {
            select: () => Promise.resolve({ data: [], error: null, status: 200, statusText: 'OK', count: 0 }),
            insert: () =>
              Promise.resolve({ data: [{ id: "new-chat-id" }], error: null, status: 201, statusText: 'Created', count: 1 }),
          },
          chat_messages: {
            insert: (state) => {
                const data = state.insertData;
                if (typeof data === 'object' && data !== null && !Array.isArray(data) && 'role' in data) {
                    if (data.role === 'user') {
                        return Promise.resolve({ data: [{ id: 'user-msg-id' }], error: null, status: 201, statusText: 'Created', count: 1 });
                    }
                    return Promise.resolve({ data: [{ id: 'assistant-err-msg-id' }], error: null, status: 201, statusText: 'Created', count: 1 });
                }
                return Promise.reject(new Error("Mock insert failed: insertData was not a single message object."));
            }
          },
        },
      },
    );
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockError(new Error("AI provider exploded"));
  
    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: createMockTokenWalletService().instance,
      countTokensForMessages: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Hello",
      providerId: "test-provider",
      promptId: "__none__",
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
    const result = await handleNormalPath(context);
  
    // Assert
    assert('error' in result, "Expected an error result");
    assertEquals(result.error.message, "AI provider exploded");
    assertEquals(result.error.status, 502);
  
    const insertCalls = mockSupabase.spies.getHistoricQueryBuilderSpies('chat_messages', 'insert');
    assertEquals(insertCalls?.callCount, 2); // user message + assistant error message
  });
  
  Deno.test("handleNormalPath: message persistence fails, triggers refund", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      "test-user-id",
      {
        genericMockResults: {
          chats: {
            select: () => Promise.resolve({ data: [], error: null, status: 200, statusText: 'OK', count: 0 }),
            insert: () =>
              Promise.resolve({ data: [{ id: "new-chat-id" }], error: null, status: 201, statusText: 'Created', count: 1 }),
          },
          chat_messages: {
            insert: () => Promise.reject(new Error("DB insert failed")),
          },
        },
      },
    );
  
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: "test-model-api-id",
        input_token_cost_rate: 0.01,
        output_token_cost_rate: 0.02,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };

    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "Assistant response" });
  
    const mockTokenWalletService = createMockTokenWalletService();
  
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: {
        ...defaultDeps,
        logger: logger,
        tokenWalletService: mockTokenWalletService.instance,
        countTokensForMessages: spy(() => 10),
        getAiProviderAdapter: spy(() => mockAiAdapter.instance),
      },
      userId: "test-user-id",
      requestBody: { message: "Hello", providerId: "test-provider", promptId: "__none__" },
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
      () => handleNormalPath(context),
      Error,
      "DB insert failed",
    );
  
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 2);
    assertEquals(
      mockTokenWalletService.stubs.recordTransaction.calls[0].args[0].type,
      "DEBIT_USAGE",
    );
    assertEquals(
      mockTokenWalletService.stubs.recordTransaction.calls[1].args[0].type,
      "CREDIT_ADJUSTMENT",
    );
  });
  
  Deno.test("handleNormalPath: existing chat history is included in adapter call", async () => {
    // Arrange
    const chatId = crypto.randomUUID();
    const existingHistory: ChatMessageRow[] = [
        { id: 'hist-user-1', content: 'Previous user message', role: 'user', chat_id: chatId, created_at: new Date().toISOString(), ai_provider_id: null, error_type: null, is_active_in_thread: true, response_to_message_id: null, user_id: null, system_prompt_id: null, token_usage: null, updated_at: new Date().toISOString() },
        { id: 'hist-asst-1', content: 'Previous assistant response', role: 'assistant', chat_id: chatId, created_at: new Date().toISOString(), ai_provider_id: null, error_type: null, is_active_in_thread: true, response_to_message_id: null, user_id: null, system_prompt_id: null, token_usage: null, updated_at: new Date().toISOString() }
    ];
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            chats: {
                select: { data: [{ id: chatId }], error: null },
            },
            chat_messages: {
                select: { data: existingHistory, error: null },
                insert: (state) => {
                    const data = state.insertData;
                    return Promise.resolve({ data: [{ ...data, id: crypto.randomUUID() }], error: null });
                }
            },
        },
    });
  
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "Follow-up response" });
    
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: {
        ...defaultDeps,
        logger: logger,
        tokenWalletService: createMockTokenWalletService().instance,
        countTokensForMessages: spy(() => 15),
        getAiProviderAdapter: spy(() => mockAiAdapter.instance),
      },
      userId: "test-user-id",
      requestBody: { message: "Follow up question", providerId: "test-provider", promptId: "__none__", chatId },
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: "System prompt text",
      finalSystemPromptIdForDb: "prompt-id",
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    await handleNormalPath(context);
  
    // Assert
    assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 1);
    const adapterArgs = mockAiAdapter.sendMessageSpy.calls[0].args[0].messages;
    assert(adapterArgs);
    assertEquals(adapterArgs.length, 4); // System + History User + History Asst + Current User
    assertEquals(adapterArgs[0].role, 'system');
    assertEquals(adapterArgs[1].content, 'Previous user message');
    assertEquals(adapterArgs[2].content, 'Previous assistant response');
    assertEquals(adapterArgs[3].content, 'Follow up question');
  });
  
  Deno.test("handleNormalPath: affordability check fails (insufficient funds)", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            chats: {
                insert: { data: [{ id: 'new-chat-id' }], error: null },
            },
        },
    });
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 1, output_token_cost_rate: 1, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve({ balance: '0', currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date(), walletId: "test-wallet" }),
    });
  
    const context: PathHandlerContext = {
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        deps: {
            ...defaultDeps,
            logger: logger,
            tokenWalletService: mockTokenWalletService.instance,
            countTokensForMessages: spy(() => 100),
            getAiProviderAdapter: spy(() => mockAiAdapter.instance),
        },
        userId: "test-user-id",
        requestBody: { message: "Test message, insufficient funds", providerId: "test-provider", promptId: "__none__" },
        wallet: { walletId: "test-wallet", balance: "0", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
        aiProviderAdapter: mockAiAdapter.instance,
        modelConfig: modelConfig as AiModelExtendedConfig,
        actualSystemPromptText: null,
        finalSystemPromptIdForDb: null,
        apiKey: "test-api-key",
        providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleNormalPath(context);
  
    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 402);
    assert(result.error.message.includes("Insufficient token balance"));
  });
  
  Deno.test("handleNormalPath: countTokensFn throws error", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            chats: {
                insert: { data: [{ id: 'new-chat-id' }], error: null },
            },
        },
    });
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    const mockTokenWalletService = createMockTokenWalletService();
    const countTokensErrorMessage = "Simulated error during token counting";
  
    const context: PathHandlerContext = {
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        deps: {
            ...defaultDeps,
            logger: logger,
            tokenWalletService: mockTokenWalletService.instance,
            countTokensForMessages: spy(() => { throw new Error(countTokensErrorMessage); }),
            getAiProviderAdapter: spy(() => mockAiAdapter.instance),
        },
        userId: "test-user-id",
        requestBody: { message: "Test message", providerId: "test-provider", promptId: "__none__" },
        wallet: { walletId: "test-wallet", balance: "1000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
        aiProviderAdapter: mockAiAdapter.instance,
        modelConfig,
        actualSystemPromptText: null,
        finalSystemPromptIdForDb: null,
        apiKey: "test-api-key",
        providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleNormalPath(context);
  
    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 500);
    assert(result.error.message.includes(countTokensErrorMessage));
  });
  
  Deno.test("handleNormalPath: returns 413 if input tokens exceed provider limit", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            chats: {
                insert: { data: [{ id: 'new-chat-id' }], error: null },
            },
        },
    });
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", provider_max_input_tokens: 50, input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    const mockTokenWalletService = createMockTokenWalletService();
    const mockCountTokensFn = (_messages: any[], _config: any) => 100;
  
    const context: PathHandlerContext = {
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        deps: {
            ...defaultDeps,
            logger: logger,
            tokenWalletService: mockTokenWalletService.instance,
            countTokensForMessages: spy(mockCountTokensFn),
            getAiProviderAdapter: spy(() => mockAiAdapter.instance),
        },
        userId: "test-user-id",
        requestBody: { message: "This message is too long", providerId: "test-provider", promptId: "__none__" },
        wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
        aiProviderAdapter: mockAiAdapter.instance,
        modelConfig,
        actualSystemPromptText: null,
        finalSystemPromptIdForDb: null,
        apiKey: "test-api-key",
        providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleNormalPath(context);
  
    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 413);
    assert(result.error.message.includes("maximum allowed length for this model is 50 tokens"));
  });
  
  Deno.test("handleNormalPath: history fetch error proceeds as new chat", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            chat_messages: {
                select: { data: null, error: new Error("Simulated DB history fetch error") },
                insert: (state) => Promise.resolve({ data: [{ ...(state.insertData), id: crypto.randomUUID() }], error: null }),
            },
            chats: {
                insert: { data: [{ id: 'new-chat-id' }], error: null },
            }
        },
    });
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    mockAiAdapter.controls.setMockResponse({ content: "Response for new chat" });
    const mockTokenWalletService = createMockTokenWalletService();
  
    const context: PathHandlerContext = {
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        deps: {
            ...defaultDeps,
            logger: logger,
            tokenWalletService: mockTokenWalletService.instance,
            countTokensForMessages: spy(() => 10),
            getAiProviderAdapter: spy(() => mockAiAdapter.instance),
        },
        userId: "test-user-id",
        requestBody: { message: "initiate with bad history chatid", providerId: "test-provider", promptId: "__none__", chatId: "bad-chat-id" },
        wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
        aiProviderAdapter: mockAiAdapter.instance,
        modelConfig,
        actualSystemPromptText: null,
        finalSystemPromptIdForDb: null,
        apiKey: "test-api-key",
        providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    const result = await handleNormalPath(context);
  
    // Assert
    assert(!('error' in result));
    assert(result.chatId !== 'bad-chat-id');
  });
  
  Deno.test("handleNormalPath: should not duplicate message content", async () => {
    // Arrange
    const userMessageContent = "This is the single message from the user.";
    const existingHistory: ChatMessageRow[] = [
        { id: 'hist-user-1', content: 'Previous user message', role: 'user', chat_id: 'test-chat-id', created_at: new Date().toISOString(), ai_provider_id: null, error_type: null, is_active_in_thread: true, response_to_message_id: null, user_id: null, system_prompt_id: null, token_usage: null, updated_at: new Date().toISOString() },
        { id: 'hist-asst-1', content: 'Previous assistant response', role: 'assistant', chat_id: 'test-chat-id', created_at: new Date().toISOString(), ai_provider_id: null, error_type: null, is_active_in_thread: true, response_to_message_id: null, user_id: null, system_prompt_id: null, token_usage: null, updated_at: new Date().toISOString() }
    ];
  
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            chats: { 
                select: { data: [{ id: 'test-chat-id' }], error: null },
                insert: { data: [{ id: "new-chat-id" }], error: null } 
            },
            chat_messages: { 
                select: { data: existingHistory, error: null },
                insert: (state) => Promise.resolve({ data: [{ ...(state.insertData), id: crypto.randomUUID() }], error: null }) 
            },
        },
    });
    const modelConfig: AiModelExtendedConfig = { api_identifier: "test-model-api-id", input_token_cost_rate: 0.01, output_token_cost_rate: 0.02, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } };
    const mockAiAdapter = createSpiedMockAdapter(modelConfig);
    
    const context: PathHandlerContext = {
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
      deps: {
        ...defaultDeps,
        logger: logger,
        tokenWalletService: createMockTokenWalletService().instance,
        countTokensForMessages: spy(() => 10),
        getAiProviderAdapter: spy(() => mockAiAdapter.instance),
      },
      userId: "test-user-id",
      requestBody: { message: userMessageContent, providerId: "test-provider", promptId: "__none__", chatId: "test-chat-id" },
      wallet: { walletId: "test-wallet", balance: "10000", currency: "AI_TOKEN", createdAt: new Date(), updatedAt: new Date() },
      aiProviderAdapter: mockAiAdapter.instance,
      modelConfig,
      actualSystemPromptText: 'System prompt text',
      finalSystemPromptIdForDb: 'prompt-id',
      apiKey: "test-api-key",
      providerApiIdentifier: "test-model-api-id",
    };
  
    // Act
    await handleNormalPath(context);
  
    // Assert
    assertEquals(mockAiAdapter.sendMessageSpy.calls.length, 1);
    const adapterArgs = mockAiAdapter.sendMessageSpy.calls[0].args[0].messages;
    assert(adapterArgs);
    assertEquals(adapterArgs.length, 4);
    assertEquals(adapterArgs[0].role, 'system');
    assertEquals(adapterArgs[1].content, 'Previous user message');
    assertEquals(adapterArgs[2].content, 'Previous assistant response');
    assertEquals(adapterArgs[3].content, userMessageContent);
  });
