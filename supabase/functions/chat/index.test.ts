import { stub, type Spy } from "jsr:@std/testing@0.225.1/mock"; 
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database, Json } from "../types_db.ts"; 
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    AdapterResponsePayload,
    ChatHandlerDeps,
} from '../_shared/types.ts'; 
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup
} from "../_shared/supabase.mock.ts";
import { handler, defaultDeps } from './index.ts'; 
import { logger } from '../_shared/logger.ts';
import { 
    createMockTokenWalletService, 
    type MockTokenWalletService,
    type TokenWalletServiceMethodImplementations
} from "../_shared/services/tokenWalletService.mock.ts";
import { Logger } from "../_shared/logger.ts";
import {
  assertEquals,
} from "jsr:@std/assert@0.225.3";
import {
  assertSpyCalls,
} from "jsr:@std/testing@0.225.1/mock";

// Re-exporting common testing utilities if needed by other test files
export { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
export { spy, type Spy, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock";

// Export main handler and default dependencies for direct use or modification in tests
export { handler, defaultDeps, logger };

// --- Exported Types ---
// The re-export block that was here has been removed.
// Types like ChatApiRequest, MockSupabaseDataConfig, etc., if needed by other files,
// must be imported directly from their canonical locations.

export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
export interface MockAdapterTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
export type MockDbInsertResultType = ChatMessageRow;

// --- Exported Mock Data Constants ---
export const mockSupabaseUrl = 'http://localhost:54321';
export const mockAnonKey = 'test-anon-key';
export const mockServiceRoleKey = 'test-service-role-key';
export const mockOpenAiKey = 'test-openai-key';
export const mockAnthropicKey = 'test-anthropic-key'; 
export const mockGoogleKey = 'test-google-key';
export const mockIpAddress = "127.0.0.1";
export const nowISO = new Date().toISOString();

export const mockConnInfo: ConnInfo = {
  localAddr: { transport: "tcp", hostname: "localhost", port: 8000 },
  remoteAddr: { transport: "tcp", hostname: mockIpAddress, port: 12345 },
};

// --- Exported Original Deno.env.get & Stub ---
export const originalDenoEnvGet = globalThis.Deno.env.get;
export const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
    // console.log(`[Test Env Stub] Deno.env.get called with: ${key}`); 
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return mockServiceRoleKey;
    if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
    if (key === 'ANTHROPIC_API_KEY') return mockAnthropicKey;
    if (key === 'GOOGLE_API_KEY') return mockGoogleKey;
    return undefined; 
});

// --- Exported Mock Creation Helpers ---
export const createMockAiAdapter = (sendMessageResult: AdapterResponsePayload | Error): AiProviderAdapter => {
    const sendMessageSpyFn = sendMessageResult instanceof Error 
        ? () => Promise.reject(sendMessageResult) 
        : () => Promise.resolve(sendMessageResult);
    // Spy on the function that either resolves or rejects
    const actualSpy = spy(sendMessageSpyFn);
    return {
        sendMessage: actualSpy as any, // Cast the spy to any if its signature doesn't exactly match
        listModels: spy(() => Promise.resolve([])),
    } as unknown as AiProviderAdapter; 
};

export interface CreateTestDepsResult {
    deps: ChatHandlerDeps;
    mockSupabaseClient: MockSupabaseClientSetup['client'];
    mockTokenWalletService: MockTokenWalletService;
    clearSupabaseClientStubs: MockSupabaseClientSetup['clearAllStubs'];
    clearTokenWalletStubs: () => void;
    mockAdapterSpy?: Spy<any[]>; 
}

// Overrides for core dependencies, allowing for more granular control in specific tests
export interface CoreDepsOverride extends Partial<Omit<ChatHandlerDeps, 'supabaseClient' | 'tokenWalletService' | 'getAiProviderAdapter' | 'countTokensForMessages' | 'logger' >> {
  getAiProviderAdapter?: ChatHandlerDeps['getAiProviderAdapter'];
  countTokensForMessages?: ChatHandlerDeps['countTokensForMessages'];
  logger?: Partial<Logger>; 
}

// Main factory for creating test dependencies
export const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  adapterSendMessageResult?: AdapterResponsePayload | Error,
  tokenWalletConfig?: TokenWalletServiceMethodImplementations,
  countTokensFnOverride?: ChatHandlerDeps['countTokensForMessages'],
  pDepOverrides?: CoreDepsOverride,
): CreateTestDepsResult => {
  const mockSupabaseClientSetup = createMockSupabaseClient(testUserId, supaConfig);
  const tokenWalletServiceToUse = createMockTokenWalletService(tokenWalletConfig || {});

  // Start with a fresh copy of default dependencies
  const deps: ChatHandlerDeps = { ...defaultDeps };
  
  // Override createSupabaseClient to use our mock
  deps.createSupabaseClient = spy(() => mockSupabaseClientSetup.client as unknown as SupabaseClient<Database>) as any;
  
  // Inject the mock token wallet service instance
  deps.tokenWalletService = tokenWalletServiceToUse.instance;

  // Handle AI Provider Adapter mocking
  let mockAdapterSpy: Spy<any[]> | undefined;
  if (adapterSendMessageResult) {
    const mockAdapter = createMockAiAdapter(adapterSendMessageResult);
    mockAdapterSpy = mockAdapter.sendMessage as Spy<any[]>;
    // If a mock response is provided, make the factory always return this mock adapter
    deps.getAiProviderAdapter = spy((_provider: string) => mockAdapter);
  } else {
    // Otherwise, just spy on the real implementation for tracking calls
    deps.getAiProviderAdapter = spy(deps.getAiProviderAdapter);
  }

  // Override token counting function if provided
  if (countTokensFnOverride) {
    deps.countTokensForMessages = countTokensFnOverride;
  }

  // Override logger if provided
  if (pDepOverrides?.logger) {
    deps.logger = { ...deps.logger, ...pDepOverrides.logger } as Logger;
  }

  // Override any other dependencies
  if (pDepOverrides) {
    const { getAiProviderAdapter, countTokensForMessages, logger, ...rest } = pDepOverrides;
    Object.assign(deps, rest);
  }

  return {
    deps: deps,
    mockSupabaseClient: mockSupabaseClientSetup.client,
    mockTokenWalletService: tokenWalletServiceToUse,
    clearSupabaseClientStubs: mockSupabaseClientSetup.clearAllStubs,
    clearTokenWalletStubs: tokenWalletServiceToUse.clearStubs,
    mockAdapterSpy
  };
};

// --- Exported Shared Mock Data Objects ---
export const testProviderId = '123e4567-e89b-12d3-a456-426614174000';
export const testApiIdentifier = 'openai-gpt-4o';
export const testProviderString = 'openai';
export const testPromptId = 'abcdef01-2345-6789-abcd-ef0123456789';
export const testUserId = 'user-auth-xyz';
export const testChatId = crypto.randomUUID();
export const testUserMsgId = 'msg-user-aaa'; 
export const testAsstMsgId = 'msg-asst-bbb';
export const testAiContent = 'Mock AI response content from adapter';

export const mockAdapterTokenData: MockAdapterTokenUsage = { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 };

export const mockAdapterSuccessResponse: AdapterResponsePayload = { 
        role: 'assistant',
        content: testAiContent,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
    token_usage: mockAdapterTokenData as unknown as Json, 
    };

export const mockAssistantDbRow: ChatMessageRow = {
        id: testAsstMsgId,
        chat_id: testChatId,
        role: 'assistant',
        content: testAiContent,
    created_at: nowISO,
    updated_at: nowISO,
        user_id: null,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
    token_usage: { 
        prompt_tokens: mockAdapterTokenData.prompt_tokens, 
        completion_tokens: mockAdapterTokenData.completion_tokens,
            total_tokens: mockAdapterTokenData.total_tokens,
        },
        is_active_in_thread: true,
        error_type: null,
        response_to_message_id: null,
    };
export const mockUserDbRow: ChatMessageRow = {
        id: testUserMsgId,
        chat_id: testChatId,
        role: 'user',
    content: "Hello there AI!", 
    created_at: nowISO, 
    updated_at: nowISO,
        user_id: testUserId,
    ai_provider_id: null, // User messages typically don't have this set on insert
    system_prompt_id: null, // User messages typically don't have this set on insert
        token_usage: null,
        is_active_in_thread: true,
        error_type: null,
        response_to_message_id: null,
    };

export const mockSupaConfigBase: MockSupabaseDataConfig = {
    mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: nowISO } as any, 
    getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: nowISO } as any }, error: null },
        genericMockResults: {
            'system_prompts': {
                select: { data: [{ id: testPromptId, prompt_text: 'Test system prompt', is_active: true }], error: null, status: 200, count: 1 }
            },
            'ai_providers': {
                select: { 
                    data: [{
                        id: testProviderId, 
                        name: "Mock Default Provider",
                        api_identifier: testApiIdentifier, 
                        provider: testProviderString, 
                        is_active: true,
                        config: {
                            api_identifier: testApiIdentifier, 
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            input_token_cost_rate: 0.001,
                            output_token_cost_rate: 0.002
                        } as Json
                    }], 
                    error: null, 
                    status: 200, 
                    count: 1 
                }
            },
            'chats': {
                insert: { data: [{ id: testChatId, system_prompt_id: testPromptId, title: "Hello there AI!".substring(0,50), user_id: testUserId, organization_id: null }], error: null, status: 201, count: 1 },
                select: { data: [{ id: testChatId, system_prompt_id: testPromptId, title: "Hello there AI!".substring(0,50), user_id: testUserId, organization_id: null }], error: null, status: 200, count: 1 }
            },
            'chat_messages': {
                insert: (state) => {
                    // Assuming state.insertData is an array of records to insert
                    // For chat_messages, we usually insert one message at a time from the handler
                    if (Array.isArray(state.insertData) && state.insertData.length > 0) {
                        const messageToInsert = state.insertData[0] as Partial<ChatMessageRow>;
                        if (messageToInsert.role === 'assistant') {
                            // If it's an assistant message, return the mock assistant row
                            // We might need to merge some details from messageToInsert if they vary per test
                            // For now, let's assume mockAssistantDbRow is generally sufficient
                            // or augment it with the content from messageToInsert
                            const assistantResponse = {
                                ...mockAssistantDbRow,
                                content: messageToInsert.content || mockAssistantDbRow.content,
                                // Potentially merge other fields if needed
                            };
                            return Promise.resolve({ data: [assistantResponse], error: null, status: 201, count: 1 });
                        } else if (messageToInsert.role === 'user') {
                             // If it's a user message, return the mock user row
                             const userResponse = {
                                ...mockUserDbRow,
                                content: messageToInsert.content || mockUserDbRow.content,
                             };
                            return Promise.resolve({ data: [userResponse], error: null, status: 201, count: 1 });
                        }
                    }
                    // Default fallback or if insertData is not as expected
                    // This could be an empty array or a more generic user message
                    return Promise.resolve({ data: [mockUserDbRow], error: null, status: 201, count: 1 }); 
                },
                select: { data: [mockUserDbRow, mockAssistantDbRow], error: null, status: 200, count: 2 }
            }
        }
    };

// --- Exported Generic TestCase Interface ---
// This can be imported and used by other test files, or they can define their own.
export interface ChatTestCase {
    testName: string;
    method?: "POST" | "OPTIONS" | "GET" | "DELETE"; // Default to POST if not specified by test
    path?: string; 
    body?: ChatApiRequest | Record<string, unknown>;
    headers?: Record<string, string>;
    mockUser?: { id: string } | null; 
    mockSupaConfig?: MockSupabaseDataConfig;
    mockAdapterConfig?: { 
        response: AdapterResponsePayload | Error; 
    };
    mockTokenWalletSetup?: (mockTokenWallet: MockTokenWalletService, testCaseConsts: typeof ChatTestConstants) => void;
    expectedStatus: number;
    expectedBody?: Record<string, any> | ((responseBody: any, testCaseConsts: typeof ChatTestConstants) => boolean | void); 
    expectedErrorMessage?: string; 
    extraAssertions?: (responseJson: any, testCase: ChatTestCase, depsAndMocks: CreateTestDepsResult, testCaseConsts: typeof ChatTestConstants) => void | Promise<void>; 
    expectedAdapterCallCount?: number;
}

// Group common constants for easier passing to test case callbacks
export const ChatTestConstants = {
    testProviderId,
    testApiIdentifier,
    testProviderString,
    testPromptId,
    testUserId,
    testChatId,
    testUserMsgId,
    testAsstMsgId,
    testAiContent,
    nowISO,
    mockAdapterTokenData,
    mockAdapterSuccessResponse,
    mockAssistantDbRow,
    mockUserDbRow
};

// This file no longer contains Deno.test blocks.
// It serves as a utility module for other test files in this directory.

Deno.test('[Corrected] handlePostRequest should apply a fallback cap when model config is missing a hard cap', async (t) => {
  await t.step('it should prevent huge token requests for high-balance users if model config is incomplete', async () => {
    // 1. Setup: The "Perfect Storm"
    const highUserBalance = 1_000_000;
    const promptInputTokens = 100;
    // With a high balance and no hard cap, the old logic would calculate a huge number:
    // budget_for_output = 1M - (100*1) = 999,900
    // twenty_percent_cap = floor((0.20 * 999,900) / 2) = 99,990. THIS IS THE BUG.
    const buggyLargeOutput = 99990; 
    const FALLBACK_SYSTEM_CAP = 4096; // What we EXPECT the code to fall back to.

    const mockRequestBody: ChatApiRequest = {
      message: 'Test message for the real bug',
      providerId: '123e4567-e89b-12d3-a456-426614174000',
      promptId: '__none__',
      // CRITICAL: max_tokens_to_generate is UNDEFINED in the request.
    };

    // CRITICAL: The mock config is missing `hard_cap_output_tokens`.
    const mockIncompleteProviderConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Incomplete Provider',
        api_identifier: 'test-model-incomplete',
        provider: 'openai',
        is_active: true,
        config: {
            api_identifier: 'test-model-incomplete',
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
            input_token_cost_rate: 1,
            output_token_cost_rate: 2,
            // hard_cap_output_tokens is intentionally missing
        } as Json,
    };

    const { deps, mockAdapterSpy, clearSupabaseClientStubs, clearTokenWalletStubs } = createTestDeps(
      {
        mockUser: { id: testUserId } as any,
        genericMockResults: {
          'ai_providers': { select: { data: [mockIncompleteProviderConfig], error: null, count: 1, status: 200 } },
          'chats': { insert: { data: [{ id: testChatId }], error: null, count: 1, status: 201 } },
          'chat_messages': { insert: { data: [mockUserDbRow, mockAssistantDbRow], error: null, count: 2, status: 201 } },
        }
      },
      mockAdapterSuccessResponse,
      {
        getWalletForContext: () => Promise.resolve({
            walletId: 'wallet-uuid-test',
            balance: String(highUserBalance),
            ownerId: testUserId, ownerType: 'user', tokenType: 'standard',
            createdAt: new Date(nowISO), updatedAt: new Date(nowISO),
            organizationId: undefined, currency: 'AI_TOKEN',
        }),
        recordTransaction: () => Promise.resolve({
            transactionId: 'txn-uuid-test', walletId: 'wallet-uuid-test', type: 'DEBIT_USAGE',
            amount: '100', balanceAfterTxn: String(highUserBalance - 100),
            createdAt: nowISO, idempotencyKey: 'idempotency-key', recordedByUserId: testUserId,
            timestamp: new Date(nowISO),
        })
      },
      () => promptInputTokens
    );

    // 2. Execution
    const request = new Request('http://localhost/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
      body: JSON.stringify(mockRequestBody),
    });

    await handler(request, deps);

    // 3. Assertion
    if (!mockAdapterSpy) throw new Error("Adapter spy is not defined.");
    assertSpyCalls(mockAdapterSpy, 1);

    const passedChatRequest = mockAdapterSpy.calls[0].args[0] as ChatApiRequest;
    
    // This assertion should FAIL with the current code.
    // The current code will pass `buggyLargeOutput`. We want it to pass `FALLBACK_SYSTEM_CAP`.
    assertEquals(
      passedChatRequest.max_tokens_to_generate,
      FALLBACK_SYSTEM_CAP,
      `max_tokens_to_generate should be capped at the system fallback (${FALLBACK_SYSTEM_CAP}), not the erroneously calculated large value (${buggyLargeOutput})`
    );

    // 4. Teardown
    clearSupabaseClientStubs?.();
    clearTokenWalletStubs?.();
  });
});

Deno.test('handlePostRequest should cap max_tokens_to_generate based on affordability, overriding a larger request value', async () => {
  // 1. Setup
  const highRequestedMaxTokens = 4096;
  const userBalance = 1000;
  const promptInputTokens = 100;

  // This is the expected value based on the logic in getMaxOutputTokens.
  // prompt_cost = 100 * 1 (input_rate) = 100
  // budget_for_output = 1000 (balance) - 100 = 900
  // max_spendable_output_tokens = 900 / 2 (output_rate) = 450
  // twenty_percent_cap_raw = (0.20 * 900) / 2 = 90
  // dynamic_hard_cap = min(90, 4096 (model_hard_cap)) = 90
  // final_result = min(450, 90) = 90
  const expectedMaxAllowedOutputTokens = 90;

  const mockRequestBody: ChatApiRequest = {
    message: 'Test message',
    providerId: '123e4567-e89b-12d3-a456-426614174000',
    promptId: '__none__',
    max_tokens_to_generate: highRequestedMaxTokens, // User requests a large amount
  };

  const mockProviderConfig = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Capping Provider',
      api_identifier: 'test-model-capper',
      provider: 'openai',
      is_active: true,
      config: {
          api_identifier: 'test-model-capper',
          tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
          input_token_cost_rate: 1,
          output_token_cost_rate: 2,
          hard_cap_output_tokens: 4096, // Model's own hard cap
      } as Json,
  };

  const { deps, mockAdapterSpy, clearSupabaseClientStubs, clearTokenWalletStubs } = createTestDeps(
    {
      mockUser: { id: testUserId } as any,
      genericMockResults: {
        'ai_providers': { select: { data: [mockProviderConfig], error: null, count: 1, status: 200 } },
        'chats': { insert: { data: [{ id: testChatId }], error: null, count: 1, status: 201 } },
        'chat_messages': { insert: { data: [mockUserDbRow, mockAssistantDbRow], error: null, count: 2, status: 201 } },
      }
    },
    mockAdapterSuccessResponse, // Mock a successful response from the AI
    {
      getWalletForContext: () => Promise.resolve({
          walletId: 'wallet-uuid-test',
          balance: String(userBalance), // Changed to string
          ownerId: testUserId,
          ownerType: 'user',
          tokenType: 'standard',
          createdAt: new Date(nowISO),
          updatedAt: new Date(nowISO),
          organizationId: undefined,
          currency: 'AI_TOKEN',
      }),
      recordTransaction: () => Promise.resolve({
          transactionId: 'txn-uuid-test',
          walletId: 'wallet-uuid-test',
          type: 'DEBIT_USAGE',
          amount: '100', // Dummy value
          balanceAfterTxn: String(userBalance - 100),
          createdAt: nowISO,
          idempotencyKey: 'idempotency-key',
          recordedByUserId: testUserId,
          timestamp: new Date(nowISO),
      })
    },
    () => promptInputTokens // Mock the token counter to return a fixed value
  );

  // 2. Execution
  const request = new Request('http://localhost/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
    body: JSON.stringify(mockRequestBody),
  });

  await handler(request, deps);

  // 3. Assertion
  if (!mockAdapterSpy) {
    throw new Error("mockAdapterSpy is not defined. Check test setup.");
  }
  assertSpyCalls(mockAdapterSpy, 1);

  const adapterCallArgs = mockAdapterSpy.calls[0].args;
  const passedChatRequest = adapterCallArgs[0] as ChatApiRequest;

  assertEquals(
    passedChatRequest.max_tokens_to_generate,
    expectedMaxAllowedOutputTokens,
    `max_tokens_to_generate should be capped at the affordable amount (${expectedMaxAllowedOutputTokens}), not the requested amount (${highRequestedMaxTokens})`
  );
  
  // 4. Teardown
  clearSupabaseClientStubs?.();
  clearTokenWalletStubs?.();
});