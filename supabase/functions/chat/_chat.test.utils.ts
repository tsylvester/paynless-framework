import { stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database } from "../types_db.ts";
import type {
    AiProviderAdapterInstance,
    ChatApiRequest,
    AdapterResponsePayload,
    ChatHandlerDeps,
    FactoryDependencies,
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

// Re-exporting common testing utilities if needed by other test files
export { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
export { spy, type Spy, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock";

// Export main handler and default dependencies for direct use or modification in tests
export { handler, defaultDeps, logger };

// --- Exported Types ---
export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
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
    if (key === 'DUMMY_API_KEY') return 'sk-test-dummy-key';
    return undefined;
});

// --- Exported Mock Creation Helpers ---
export const createMockAiAdapter = (sendMessageResult: AdapterResponsePayload | Error): AiProviderAdapterInstance => {
    const sendMessageSpyFn = sendMessageResult instanceof Error
        ? (_request: ChatApiRequest, _modelIdentifier: string) => Promise.reject(sendMessageResult)
        : (_request: ChatApiRequest, _modelIdentifier: string) => Promise.resolve(sendMessageResult);
    const actualSpy = spy(sendMessageSpyFn);
    return {
        sendMessage: actualSpy,
        listModels: spy(() => Promise.resolve([])),
    };
};

export interface CreateTestDepsResult {
    deps: ChatHandlerDeps;
    mockSupabaseClientSetup: MockSupabaseClientSetup; // Expose the whole setup
    mockTokenWalletService: MockTokenWalletService;
    clearSupabaseClientStubs: MockSupabaseClientSetup['clearAllStubs'];
    clearTokenWalletStubs: () => void;
    mockAdapterSpy?: Spy<any, [ChatApiRequest, string], Promise<AdapterResponsePayload>>;
}

// Overrides for core dependencies, allowing for more granular control in specific tests
export interface CoreDepsOverride extends Partial<Omit<ChatHandlerDeps, 'createSupabaseClient' | 'tokenWalletService' | 'getAiProviderAdapter' | 'countTokens' | 'logger' >> {
  getAiProviderAdapter?: ChatHandlerDeps['getAiProviderAdapter'];
  countTokens?: ChatHandlerDeps['countTokens'];
  logger?: Partial<Logger>;
}

// Main factory for creating test dependencies
export const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  adapterSendMessageResult?: AdapterResponsePayload | Error,
  tokenWalletConfig?: TokenWalletServiceMethodImplementations,
  countTokensFnOverride?: ChatHandlerDeps['countTokens'],
  pDepOverrides?: CoreDepsOverride,
): CreateTestDepsResult => {
  const mockSupabaseClientSetup = createMockSupabaseClient(testUserId, supaConfig);
  const tokenWalletServiceToUse = createMockTokenWalletService(tokenWalletConfig || {});

  // Create a base deps object. We will override the factory.
  const deps: ChatHandlerDeps = { ...defaultDeps };

  // Override the createSupabaseClient factory with a spy.
  // This spy will return our pre-configured mock client instance whenever it's called.
  deps.createSupabaseClient = spy((_url, _key, _options) => {
    return mockSupabaseClientSetup.client;
  }) as unknown as typeof createClient;

  // Inject the mock token wallet service instance
  deps.tokenWalletService = tokenWalletServiceToUse.instance;

  // Handle AI Provider Adapter mocking
  let mockAdapterSpy;
  if (adapterSendMessageResult) {
    const mockAdapter = createMockAiAdapter(adapterSendMessageResult);
    mockAdapterSpy = spy(mockAdapter, 'sendMessage');
    // If a mock response is provided, make the factory always return this mock adapter
    deps.getAiProviderAdapter = spy((_dependencies: FactoryDependencies) => mockAdapter);
  } else {
    // Otherwise, just spy on the real implementation for tracking calls
    deps.getAiProviderAdapter = spy(deps.getAiProviderAdapter);
  }

  // Override token counting function if provided
  if (countTokensFnOverride) {
    deps.countTokens = countTokensFnOverride;
  }

  // Override logger if provided
  if (pDepOverrides?.logger) {
    deps.logger = { ...deps.logger, ...pDepOverrides.logger };
  }

  // Override any other dependencies
  if (pDepOverrides) {
    const { getAiProviderAdapter, countTokens, logger, ...rest } = pDepOverrides;
    Object.assign(deps, rest);
  }

  return {
    deps: deps,
    mockSupabaseClientSetup: mockSupabaseClientSetup, // Return the whole setup
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

export const mockAdapterTokenData = { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 };

export const mockAdapterSuccessResponse: AdapterResponsePayload = {
        role: 'assistant',
        content: testAiContent,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
    token_usage: mockAdapterTokenData,
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
    mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: nowISO },
    getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: nowISO } }, error: null },
    rpcResults: {
        'record_token_transaction': {
            data: [{
                transaction_id: 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6',
                wallet_id: 'wallet-uuid',
                transaction_type: 'DEBIT_USAGE',
                amount: 40,
                balance_after_txn: 960,
                recorded_by_user_id: 'user-auth-xyz',
                idempotency_key: 'some-idempotency-key',
                related_entity_id: 'e2a73c08-a97c-4ee0-ac8b-8c25a915ad75',
                related_entity_type: 'chat_message',
                notes: 'Mocked transaction',
                "timestamp": new Date().toISOString(),
                payment_transaction_id: null
            }],
            error: null
        }
    },
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
                        }
                    }],
                    error: null,
                    status: 200,
                    count: 1
                }
            },
            'token_wallets': {
                select: { data: [{ wallet_id: 'wallet-uuid', user_id: testUserId, organization_id: null, balance: 1000, currency: 'USD' }], error: null, status: 200, count: 1 }
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
                        const messageToInsert = state.insertData[0];
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
                select: { data: [], error: null, status: 200, count: 0 }
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

// This file is a utility module for other test files in this directory.
// It should not contain any Deno.test blocks.
