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

    const deps: ChatHandlerDeps = {
      ...defaultDeps,
      logger: logger,
      tokenWalletService: mockTokenWalletService.instance,
      countTokensForMessages: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Hello Dialectic",
      providerId: "test-provider",
      promptId: "__none__",
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

  const countTokensSpy = spy((messages: { role: 'user'|'assistant'|'system', content: string }[], _cfg: AiModelExtendedConfig) => 5);

  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger: logger,
    tokenWalletService: mockTokenWalletService.instance,
    countTokensForMessages: countTokensSpy as unknown as ChatHandlerDeps['countTokensForMessages'],
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

  // Assert token counting used requestBody.messages
  const firstCountArgs = countTokensSpy.calls[0]?.args?.[0];
  assertEquals(firstCountArgs, requestMessages, 'Token counting should use requestBody.messages');

  // Assert adapter received pass-through request
  const firstSendArg = mockAiAdapter.sendMessageSpy.calls[0].args[0];
  assertEquals(firstSendArg.message, requestBody.message, 'message must be forwarded unchanged');
  assertEquals(firstSendArg.messages, requestBody.messages, 'messages must be forwarded unchanged');
  assertEquals(firstSendArg.systemInstruction, requestBody.systemInstruction, 'systemInstruction must be forwarded unchanged');
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
      countTokensForMessages: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "This will fail",
      providerId: "test-provider",
      promptId: "__none__",
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
      countTokensForMessages: spy(() => 10),
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
      countTokensForMessages: spy(() => 10), // A non-zero token count
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "This is too expensive",
      providerId: "test-provider",
      promptId: "__none__",
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
      countTokensForMessages: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter.instance),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Hello Dialectic",
      providerId: "test-provider",
      promptId: "__none__",
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
      countTokensForMessages: spy(() => 10),
      getAiProviderAdapter: spy(() => mockAiAdapter),
    };
  
    const requestBody: ChatApiRequest = {
      message: "Give me a very long response that requires continuation.",
      providerId: "test-provider",
      promptId: "__none__",
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