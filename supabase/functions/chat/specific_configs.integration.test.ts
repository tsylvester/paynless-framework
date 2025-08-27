import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { ChatApiRequest, TokenUsage, AiModelExtendedConfig, ChatHandlerSuccessResponse, ChatHandlerDeps, AiProviderAdapter, ILogger } from "../_shared/types.ts";
import {
    CHAT_FUNCTION_URL,
    supabaseAdminClient,
    currentTestDeps,
    type ProcessedResourceInfo,
    getTestUserAuthToken
} from "../_shared/_integration.test.utils.ts";
import { defaultDeps, createChatServiceHandler } from "./index.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import type { MockQueryBuilderState, MockPGRSTError } from "../_shared/supabase.mock.ts";
import { DEFAULT_INPUT_TOKEN_COST_RATE, DEFAULT_OUTPUT_TOKEN_COST_RATE } from "../_shared/config/token_cost_defaults.ts";
import { isRecord } from "../_shared/utils/type_guards.ts";

// Store original Deno.env.get and a flag to ensure restore is called once
const originalDenoEnvGet = Deno.env.get;
let envGetStubbed = false;
let dummyApiKeyStub: any | null = null;

function setupEnvStub() {
  if (!envGetStubbed) {
    dummyApiKeyStub = stub(Deno.env, "get", (key: string) => {
      if (key === "DUMMY_API_KEY") {
        return "dummy_test_key";
      }
      return originalDenoEnvGet.call(Deno.env, key);
    });
    envGetStubbed = true;
  }
}

function restoreEnvStub() {
  if (envGetStubbed && dummyApiKeyStub) {
    dummyApiKeyStub.restore();
    envGetStubbed = false;
    dummyApiKeyStub = null;
  }
}

function createRequestHandlerForTests() {
  const deps: ChatHandlerDeps = { ...defaultDeps };
  const adminClient = currentTestDeps.supabaseClient as SupabaseClient<Database>;
  const getSupabaseClient = (token: string | null) => currentTestDeps.supabaseClient as SupabaseClient<Database>;
  return createChatServiceHandler(deps, getSupabaseClient, adminClient);
}

export async function runSpecificConfigsTests(
  t: Deno.TestContext,
  initializeTestGroupEnvironment: (options?: {
    userProfile?: Partial<{ role: "user" | "admin"; first_name: string }>;
    initialWalletBalance?: number;
    aiProviderConfigOverride?: Partial<AiModelExtendedConfig>;
    aiProviderApiIdentifier?: string; 
  }) => Promise<{ primaryUserId: string; processedResources: ProcessedResourceInfo<any>[]; }>
) {
  setupEnvStub(); // Setup stub before tests run
  try {
    await t.step("[Specific Config] Model with missing cost rates (defaults applied for debit)", async () => {
      const initialBalance = 1000;
      const providerApiIdForTest = "gpt-3.5-turbo-missing-rates";

      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "Missing Rates User" },
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: providerApiIdForTest,
        aiProviderConfigOverride: {
          input_token_cost_rate: null,
          output_token_cost_rate: null,
        },
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);
      assertExists(supabaseAdminClient);
      assertExists(currentTestDeps);
      // Handler created per-request via createChatServiceHandler; no direct adapter mocking

      const providerResource = processedResources.find(
        (r) => r.tableName === 'ai_providers' && (r.resource)?.api_identifier === providerApiIdForTest
      );
      const providerIdForTest = providerResource?.resource ? (providerResource.resource).id : undefined;
      assertExists(providerIdForTest, `Failed to get DB ID for provider ${providerApiIdForTest} from processedResources`);
      
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: providerApiIdForTest,
        input_token_cost_rate: null, 
        output_token_cost_rate: null,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        hard_cap_output_tokens: 1000,
      };

      const mockProviderDataForDbQuery = {
          id: providerIdForTest,
          api_identifier: providerApiIdForTest,
          provider: "openai",
          name: `Custom Test Provider (${providerApiIdForTest})`,
          is_active: true,
          config: modelConfig,
      };

      // No direct adapter mocking; DummyAdapter echoes and computes token usage

      const requestBody: ChatApiRequest = {
        providerId: providerIdForTest,
        promptId: "__none__",
        message: "Test message to model with missing rates.",
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(requestBody),
      });

      const mockSupabaseSetup = createMockSupabaseClient(
          testUserId,
          {
              genericMockResults: {
                  ai_providers: {
                      select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                          const idFilter = state.filters.find(f => f.column === 'id' && f.value === providerIdForTest);
                          if (state.operation === 'select' && idFilter) {
                              return { data: [mockProviderDataForDbQuery], error: null, count: 1, status: 200, statusText: "OK" };
                          }
                          return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for ai_providers", code:"TMU001"}, count: 0, status: 404, statusText: "Not Found by Mock" };
                      }
                  },
                  token_wallets: {
                      select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                          const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === testUserId);
                          if (state.operation === 'select' && userIdFilter) {
                              return { 
                                  data: [{ wallet_id: crypto.randomUUID(), user_id: testUserId, balance: initialBalance, currency: "AI_TOKEN" }], 
                                  error: null, 
                                  count: 1, 
                                  status: 200, 
                                  statusText: "OK" 
                              };
                          }
                          return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for token_wallets", code:"TMU002"}, count: 0, status: 404, statusText: "Not Found by Mock" };
                      }
                  },
                  chats: {
                      insert: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                          console.log(`[Test Specific Config Mock DB] Mocking insert for chats table. Data: ${JSON.stringify(state.insertData)}`);
                          const chatData = state.insertData;
                          let user_id: string = crypto.randomUUID();
                          let title: string = 'test';
                          if (isRecord(chatData)) {
                              if (typeof chatData.user_id === 'string') user_id = chatData.user_id;
                              if (typeof chatData.title === 'string') title = chatData.title;
                          } else if (Array.isArray(chatData) && chatData.length > 0 && isRecord(chatData[0])) {
                              const first = chatData[0];
                              if (typeof first.user_id === 'string') user_id = first.user_id;
                              if (typeof first.title === 'string') title = first.title;
                          }
                          return {
                              data: [{ id: crypto.randomUUID(), user_id, title, created_at: new Date().toISOString() }],
                              error: null,
                              count: 1,
                              status: 201, 
                              statusText: "Created"
                          };
                      }
                  },
                  chat_messages: {
                      insert: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                          console.log(`[Test Specific Config Mock DB] Mocking insert for chat_messages table. Data: ${JSON.stringify(state.insertData)}`);
                          const messageData = state.insertData;
                          
                          const insertedMessages = (Array.isArray(messageData) ? messageData : [messageData]).map(msg => ({
                              id: msg.id || crypto.randomUUID(),
                              chat_id: msg.chat_id,
                              user_id: msg.user_id,
                              role: msg.role,
                              content: msg.content,
                              ai_provider_id: msg.ai_provider_id,
                              token_usage: msg.token_usage,
                              is_active_in_thread: msg.is_active_in_thread !== undefined ? msg.is_active_in_thread : true,
                              created_at: new Date().toISOString(),
                              updated_at: new Date().toISOString(),
                              system_prompt_id: msg.system_prompt_id,
                              response_to_message_id: msg.response_to_message_id,
                              error_type: msg.error_type,
                          }));

                          return {
                              data: insertedMessages,
                              error: null,
                              count: insertedMessages.length,
                              status: 201,
                              statusText: "Created"
                          };
                      }
                  }
              },
          }
      );

      let response: Response | undefined;
      try {
        const adminClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const getSupabaseClient = (_token: string | null) => mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const requestHandler = createChatServiceHandler({ ...defaultDeps }, getSupabaseClient, adminClient);
        response = await requestHandler(request);
      } finally {
        if (mockSupabaseSetup.clearAllStubs) {
          mockSupabaseSetup.clearAllStubs();
        }
      }

      assertExists(response);
      const responseJson = await response.json();

      assertEquals(response.status, 200, "Expected 200 OK. Body: " + JSON.stringify(responseJson));
      assertExists(responseJson.assistantMessage, "Response JSON should contain an assistant message.");
      assertExists(responseJson.assistantMessage.content);

      const { data: walletAfter, error: walletErrorAfter } = await supabaseAdminClient
        .from("token_wallets")
        .select("balance")
        .eq("user_id", testUserId)
        .is("organization_id", null)
        .single();

      if (walletErrorAfter) throw walletErrorAfter;
      assertExists(walletAfter, "Wallet data should exist after the call.");
      
      const usage = responseJson.assistantMessage.token_usage as TokenUsage;
      const expectedCost = Math.ceil((usage.prompt_tokens * DEFAULT_INPUT_TOKEN_COST_RATE) + 
                           (usage.completion_tokens * DEFAULT_OUTPUT_TOKEN_COST_RATE));
      const expectedBalanceAfter = initialBalance - expectedCost;

      assertEquals(walletAfter.balance, expectedBalanceAfter, 
        `Wallet balance should reflect debit using default rates. Expected: ${expectedBalanceAfter}, Got: ${walletAfter.balance}. Cost: ${expectedCost}`);
    });

    await t.step("[Specific Config] Model with hard cap on output tokens (cap respected when AI returns more)", async () => {
      const initialBalance = 1000;
      const hardCappedOutputLimit = 10;
      const mockPromptTokens = 5;
      const mockCompletionTokensFromAI = 20; // AI returns more than cap
      const providerApiIdForTest = "gpt-hardcapped-output";

      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "HardCap User" },
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: providerApiIdForTest,
        aiProviderConfigOverride: {
          input_token_cost_rate: 1,
          output_token_cost_rate: 1,
          hard_cap_output_tokens: hardCappedOutputLimit,
          tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        },
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      const providerResource = processedResources.find(
        (r) => r.tableName === 'ai_providers' && (r.resource)?.api_identifier === providerApiIdForTest
      );
      const providerIdForTest = providerResource?.resource ? (providerResource.resource).id : undefined;
      assertExists(providerIdForTest, `Failed to get DB ID for provider ${providerApiIdForTest} from processedResources`);

      const modelConfig: AiModelExtendedConfig = {
        api_identifier: providerApiIdForTest,
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        hard_cap_output_tokens: hardCappedOutputLimit,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
      };

      const mockProviderDataForDbQuery = {
        id: providerIdForTest,
        api_identifier: providerApiIdForTest,
        provider: "openai",
        name: `Custom Test Provider (${providerApiIdForTest})`,
        is_active: true,
        config: modelConfig,
      };

      // No direct adapter mocking; simulate large output via message tag to trigger capping

      const requestBody: ChatApiRequest = {
        providerId: providerIdForTest,
        promptId: "__none__",
        message: "SIMULATE_LARGE_OUTPUT_KB=64 Test message to hardcapped model.",
      };

      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(requestBody),
      });

      const mockSupabaseSetup = createMockSupabaseClient(
        testUserId,
        {
          genericMockResults: {
            ai_providers: {
              select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === providerIdForTest);
                if (state.operation === 'select' && idFilter) {
                  return { data: [mockProviderDataForDbQuery], error: null, count: 1, status: 200, statusText: "OK" };
                }
                return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for ai_providers (hardcap test)", code: "TMUHC01" }, count: 0, status: 404, statusText: "Not Found by Mock" };
              }
            },
            token_wallets: {
              select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === testUserId && f.operator === 'eq');
                if (state.operation === 'select' && userIdFilter) {
                  return {
                    data: [{ wallet_id: crypto.randomUUID(), user_id: testUserId, balance: initialBalance, currency: "AI_TOKEN" }],
                    error: null, count: 1, status: 200, statusText: "OK"
                  };
                }
                return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for token_wallets (hardcap test)", code: "TMUHC02" }, count: 0, status: 404, statusText: "Not Found by Mock" };
              }
            },
            chats: {
              insert: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const chatData = state.insertData;
                let user_id: string = crypto.randomUUID();
                let title: string = 'test';
                if (isRecord(chatData)) {
                  if (typeof chatData.user_id === 'string') user_id = chatData.user_id;
                  if (typeof chatData.title === 'string') title = chatData.title;
                } else if (Array.isArray(chatData) && chatData.length > 0 && isRecord(chatData[0])) {
                  const first = chatData[0];
                  if (typeof first.user_id === 'string') user_id = first.user_id;
                  if (typeof first.title === 'string') title = first.title;
                }
                return {
                  data: [{ id: crypto.randomUUID(), user_id, title, created_at: new Date().toISOString() }],
                  error: null, count: 1, status: 201, statusText: "Created"
                };
              }
            },
            chat_messages: {
              insert: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const messageData = state.insertData;
                const insertedMessages = (Array.isArray(messageData) ? messageData : [messageData]).map(msg => ({
                  id: msg.id || crypto.randomUUID(), chat_id: msg.chat_id, user_id: msg.user_id, role: msg.role, content: msg.content,
                  ai_provider_id: msg.ai_provider_id, token_usage: msg.token_usage, is_active_in_thread: msg.is_active_in_thread !== undefined ? msg.is_active_in_thread : true,
                  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), system_prompt_id: msg.system_prompt_id,
                  response_to_message_id: msg.response_to_message_id, error_type: msg.error_type,
                }));
                return { data: insertedMessages, error: null, count: insertedMessages.length, status: 201, statusText: "Created" };
              }
            }
          },
        }
      );

      let response: Response | undefined;
      try {
        const adminClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const getSupabaseClient = (_token: string | null) => mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const requestHandler = createChatServiceHandler({ ...defaultDeps }, getSupabaseClient, adminClient);
        response = await requestHandler(request);
      } finally {
        if (mockSupabaseSetup.clearAllStubs) {
          mockSupabaseSetup.clearAllStubs();
        }
      }

      assertExists(response);
      const responseJson = await response.json();

      assertEquals(response.status, 200, "Expected 200 OK for hardcap test. Body: " + JSON.stringify(responseJson));
      assertExists(responseJson.assistantMessage, "Response JSON should contain an assistant message.");
      assertExists(responseJson.assistantMessage.content);

      // Verify token_usage directly from the response JSON, as this reflects what the handler processed and would save.
      assertExists(responseJson.assistantMessage.token_usage, "Response JSON assistant message should have token_usage.");
      const responseTokenUsage: TokenUsage = responseJson.assistantMessage.token_usage; // Already cast in handler's return type, but good for clarity
      
      assertExists(responseTokenUsage.prompt_tokens, "Response prompt tokens should exist");
      assertEquals(responseTokenUsage.completion_tokens, hardCappedOutputLimit, 
        `Response completion tokens should be capped at hard_cap_output_tokens. Expected: ${hardCappedOutputLimit}, Got: ${responseTokenUsage.completion_tokens}`);

      // Verify wallet balance using the actual Supabase admin client, as the debit RPC uses it.
      const { data: walletAfter, error: walletErrorAfter } = await supabaseAdminClient
        .from("token_wallets")
        .select("balance")
        .eq("user_id", testUserId)
        .is("organization_id", null)
        .single();

      if (walletErrorAfter) throw walletErrorAfter;
      assertExists(walletAfter, "Wallet data should exist after the call.");
      
      const inputRate = mockProviderDataForDbQuery.config.input_token_cost_rate ?? DEFAULT_INPUT_TOKEN_COST_RATE;
      const outputRate = mockProviderDataForDbQuery.config.output_token_cost_rate ?? DEFAULT_OUTPUT_TOKEN_COST_RATE;

      const expectedCost = Math.ceil((mockPromptTokens * inputRate) + (hardCappedOutputLimit * outputRate));
      const expectedBalanceAfter = initialBalance - expectedCost;

      assertEquals(walletAfter.balance, expectedBalanceAfter,
        `Wallet balance should reflect debit using the hard-capped completion tokens. Expected: ${expectedBalanceAfter}, Got: ${walletAfter.balance}. Cost: ${expectedCost}, CappedCompletion: ${hardCappedOutputLimit}`);
    });

    await t.step("[Specific Config] Model with input_token_cost_rate = 0 AND output_token_cost_rate = 0 (no debit)", async () => {
      const initialBalance = 500;
      const providerApiIdForTest = "gpt-zero-cost-model";
      const mockPromptTokens = 10;
      const mockCompletionTokens = 15;

      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "ZeroCost User" },
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: providerApiIdForTest,
        aiProviderConfigOverride: {
          input_token_cost_rate: 0,
          output_token_cost_rate: 0,
          tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
          hard_cap_output_tokens: 1000, // Standard cap, shouldn't affect zero cost
        },
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      const providerResource = processedResources.find(
        (r) => r.tableName === 'ai_providers' && (r.resource)?.api_identifier === providerApiIdForTest
      );
      const providerIdForTest = providerResource?.resource ? (providerResource.resource).id : undefined;
      assertExists(providerIdForTest, `Failed to get DB ID for provider ${providerApiIdForTest} from processedResources`);

      const modelConfig: AiModelExtendedConfig = {
        api_identifier: providerApiIdForTest,
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        hard_cap_output_tokens: 1000,
      };

      const mockProviderDataForDbQuery = {
        id: providerIdForTest,
        api_identifier: providerApiIdForTest,
        provider: "openai", // Can be any, openai is fine for structure
        name: `Custom Test Provider (${providerApiIdForTest})`,
        is_active: true,
        config: modelConfig,
      };

      // No direct adapter mocking; DummyAdapter echoes and computes token usage

      const requestBody: ChatApiRequest = {
        providerId: providerIdForTest,
        promptId: "__none__",
        message: "Test message to zero-cost model.",
      };

      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(requestBody),
      });

      // Setup mock Supabase client interactions
      const mockSupabaseSetup = createMockSupabaseClient(
        testUserId,
        {
          genericMockResults: {
            ai_providers: {
              select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === providerIdForTest);
                if (state.operation === 'select' && idFilter) {
                  return { data: [mockProviderDataForDbQuery], error: null, count: 1, status: 200, statusText: "OK" };
                }
                return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for ai_providers (zero-cost test)", code: "TMUZC01" }, count: 0, status: 404, statusText: "Not Found by Mock" };
              }
            },
            token_wallets: {
              select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === testUserId && f.operator === 'eq');
                if (state.operation === 'select' && userIdFilter) {
                  return { data: [{ wallet_id: crypto.randomUUID(), user_id: testUserId, balance: initialBalance, currency: "AI_TOKEN" }], error: null, count: 1, status: 200, statusText: "OK" };
                }
                return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for token_wallets (zero-cost test)", code: "TMUZC02" }, count: 0, status: 404, statusText: "Not Found by Mock" };
              }
            },
            chats: { // Standard mock for chat creation
              insert: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const chatData = state.insertData;
                let user_id: string = crypto.randomUUID();
                let title: string = 'test';
                if (isRecord(chatData)) {
                  if (typeof chatData.user_id === 'string') user_id = chatData.user_id;
                  if (typeof chatData.title === 'string') title = chatData.title;
                } else if (Array.isArray(chatData) && chatData.length > 0 && isRecord(chatData[0])) {
                  const first = chatData[0];
                  if (typeof first.user_id === 'string') user_id = first.user_id;
                  if (typeof first.title === 'string') title = first.title;
                }
                return { data: [{ id: crypto.randomUUID(), user_id, title, created_at: new Date().toISOString() }], error: null, count: 1, status: 201, statusText: "Created" };
              }
            },
            chat_messages: { // Standard mock for message insertion
              insert: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const messageData = state.insertData;
                const insertedMessages = (Array.isArray(messageData) ? messageData : [messageData]).map(msg => ({
                  id: msg.id || crypto.randomUUID(), chat_id: msg.chat_id, user_id: msg.user_id, role: msg.role, content: msg.content,
                  ai_provider_id: msg.ai_provider_id, token_usage: msg.token_usage, is_active_in_thread: msg.is_active_in_thread !== undefined ? msg.is_active_in_thread : true,
                  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), system_prompt_id: msg.system_prompt_id,
                  response_to_message_id: msg.response_to_message_id, error_type: msg.error_type,
                }));
                return { data: insertedMessages, error: null, count: insertedMessages.length, status: 201, statusText: "Created" };
              }
            }
          },
        }
      );

      let response: Response | undefined;
      try {
        const adminClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const getSupabaseClient = (_token: string | null) => mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const requestHandler = createChatServiceHandler({ ...defaultDeps }, getSupabaseClient, adminClient);
        response = await requestHandler(request);
      } finally {
        if (mockSupabaseSetup.clearAllStubs) {
          mockSupabaseSetup.clearAllStubs();
        }
      }

      assertExists(response);
      const responseJson = await response.json();

      assertEquals(response.status, 200, "Expected 200 OK for zero-cost test. Body: " + JSON.stringify(responseJson));
      assertExists(responseJson.assistantMessage, "Response JSON should contain an assistant message.");
      assertExists(responseJson.assistantMessage.content);
      assertExists(responseJson.assistantMessage.token_usage, "Response assistant message should have token_usage.");
      
      const responseTokenUsage: TokenUsage = responseJson.assistantMessage.token_usage;
      assertEquals(typeof responseTokenUsage.prompt_tokens, 'number');
      assertEquals(typeof responseTokenUsage.completion_tokens, 'number');

      // Verify wallet balance has not changed
      const { data: walletAfter, error: walletErrorAfter } = await supabaseAdminClient
        .from("token_wallets")
        .select("balance")
        .eq("user_id", testUserId)
        .is("organization_id", null)
        .single();

      if (walletErrorAfter) throw walletErrorAfter;
      assertExists(walletAfter, "Wallet data should exist after the call for zero-cost test.");
      assertEquals(walletAfter.balance, initialBalance, 
        `Wallet balance should remain unchanged for zero-cost model. Expected: ${initialBalance}, Got: ${walletAfter.balance}`);
    });

    await t.step("[Specific Config] Inactive Provider (should result in error)", async () => {
      const initialBalance = 100; // Balance not critical, but good to have a user context
      const providerApiIdForTest = "gpt-inactive-provider";

      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "InactiveAccess User" },
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: providerApiIdForTest,
        aiProviderConfigOverride: { // Add a default config to ensure it's seeded
          api_identifier: providerApiIdForTest, // Ensure this matches
          input_token_cost_rate: 1, // Default, doesn't matter for this test
          output_token_cost_rate: 1, // Default, doesn't matter for this test
          tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
          hard_cap_output_tokens: 1000,
          // is_active will be handled by the Supabase mock for the select query in this test
        },
        // is_active will be controlled by the mock DB response for ai_providers for this test
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);
      
      const providerResource = processedResources.find(
        (r) => r.tableName === 'ai_providers' && (r.resource)?.api_identifier === providerApiIdForTest
      );
      const providerIdForTest = providerResource?.resource ? (providerResource.resource).id : undefined;
      assertExists(providerIdForTest, `Failed to get DB ID for provider ${providerApiIdForTest} from processedResources`);

      const modelConfig: AiModelExtendedConfig = {
        api_identifier: providerApiIdForTest,
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        hard_cap_output_tokens: 1000,
      };

      // Override the provider data to ensure is_active is false for this specific test call
      const mockInactiveProviderData = {
          id: providerIdForTest,
          api_identifier: providerApiIdForTest,
          provider: "openai",
          name: `Custom Test Provider (Inactive - ${providerApiIdForTest})`,
          is_active: false, // Key part of this test
          config: modelConfig,
      };

      const requestBody: ChatApiRequest = {
        providerId: providerIdForTest,
        promptId: "__none__",
        message: "Test message to inactive provider.",
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
      });

      const mockSupabaseSetup = createMockSupabaseClient(
          testUserId,
          {
              genericMockResults: {
                  ai_providers: {
                      select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                          const idFilter = state.filters.find(f => f.column === 'id' && f.value === providerIdForTest);
                          if (state.operation === 'select' && idFilter) {
                              // Return the inactive provider data for this test
                              return { data: [mockInactiveProviderData], error: null, count: 1, status: 200, statusText: "OK" };
                          }
                          // Fallback for other ai_provider selects if any happen (shouldn't for this test path)
                          return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for ai_providers (inactive test)", code:"TMUIA01"}, count: 0, status: 404, statusText: "Not Found by Mock" };
                      }
                  },
                  // Token wallets might be queried by the getWalletForContext call even if the main logic exits early.
                  token_wallets: {
                      select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                          const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === testUserId && f.operator === 'eq');
                          if (state.operation === 'select' && userIdFilter) {
                              return { data: [{ wallet_id: crypto.randomUUID(), user_id: testUserId, balance: initialBalance, currency: "AI_TOKEN" }], error: null, count: 1, status: 200, statusText: "OK" };
                          }
                          return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for token_wallets (inactive test)", code:"TMUIA02"}, count: 0, status: 404, statusText: "Not Found by Mock" };
                      }
                  },
                  // No chat or message inserts should occur
              },
          }
      );

      let response: Response | undefined;
      try {
        const adminClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const getSupabaseClient = (_token: string | null) => mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const requestHandler = createChatServiceHandler({ ...defaultDeps }, getSupabaseClient, adminClient);
        response = await requestHandler(request);
      } finally {
        if (mockSupabaseSetup.clearAllStubs) {
          mockSupabaseSetup.clearAllStubs();
        }
      }

      assertExists(response);
      const responseJson = await response.json();

      assertEquals(response.status, 400, "Expected 400 Bad Request for inactive provider. Body: " + JSON.stringify(responseJson));
      assertExists(responseJson.error, "Response JSON should contain an error field.");
      assertStringIncludes(responseJson.error, "is currently inactive", "Error message should indicate provider is inactive.");

      // Verify wallet balance has not changed, as a safety check
      const { data: walletAfter, error: walletErrorAfter } = await supabaseAdminClient
        .from("token_wallets")
        .select("balance")
        .eq("user_id", testUserId)
        .is("organization_id", null)
        .single();

      if (walletErrorAfter) throw walletErrorAfter;
      assertExists(walletAfter, "Wallet data should exist after the call for inactive provider test.");
      assertEquals(walletAfter.balance, initialBalance, 
        `Wallet balance should remain unchanged for inactive provider. Expected: ${initialBalance}, Got: ${walletAfter.balance}`);
    });

    await t.step("[Specific Config] Non-existent Provider ID (should result in error)", async () => {
      const initialBalance = 200;
      const nonExistentProviderId = crypto.randomUUID(); // Generate a random UUID

      const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "NonExistentAccess User" },
        initialWalletBalance: initialBalance,
        // No specific aiProviderApiIdentifier or config override needed, as we are testing a non-existent ID.
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      const requestBody: ChatApiRequest = {
        providerId: nonExistentProviderId,
        promptId: "__none__",
        message: "Test message to non-existent provider.",
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
      });

      // For this test, the main Supabase client mock can be simpler as the provider query should fail early.
      // We only need to mock the user's wallet to check it later.
      const mockSupabaseSetup = createMockSupabaseClient(
        testUserId,
        {
          genericMockResults: {
            ai_providers: {
              select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                // This mock specifically expects the query for the nonExistentProviderId to find nothing.
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === nonExistentProviderId);
                if (state.operation === 'select' && idFilter) {
                  return { data: null, error: { name: "PGRST116", message: "Requested resource not found", code:"PGRST116"}, count: 0, status: 404, statusText: "Not Found" }; 
                }
                // Fallback for any other ai_provider selects (e.g. if test utils try to get a default one - though unlikely here)
                return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for ai_providers (non-existent ID test)", code:"TMUNE01"}, count: 0, status: 404, statusText: "Not Found by Mock" };
              }
            },
            token_wallets: { // Still need to mock wallet for balance check
              select: async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | MockPGRSTError | null; count: number | null; status: number; statusText: string; }> => {
                const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === testUserId && f.operator === 'eq');
                if (state.operation === 'select' && userIdFilter) {
                  return { data: [{ wallet_id: crypto.randomUUID(), user_id: testUserId, balance: initialBalance, currency: "AI_TOKEN" }], error: null, count: 1, status: 200, statusText: "OK" };
                }
                return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for token_wallets (non-existent ID test)", code:"TMUNE02"}, count: 0, status: 404, statusText: "Not Found by Mock" };
              }
            },
          },
        }
      );

      let response: Response | undefined;
      try {
        const adminClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const getSupabaseClient = (_token: string | null) => mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
        const requestHandler = createChatServiceHandler({ ...defaultDeps }, getSupabaseClient, adminClient);
        response = await requestHandler(request);
      } finally {
        if (mockSupabaseSetup.clearAllStubs) {
          mockSupabaseSetup.clearAllStubs();
        }
      }

      assertExists(response);
      const responseJson = await response.json();

      // The main handler should catch the "provider not found" and return a 404 or 400
      // Let's aim for 404 if the provider itself isn't found by ID.
      assertEquals(response.status, 404, "Expected 404 Not Found for non-existent provider. Body: " + JSON.stringify(responseJson));
      assertExists(responseJson.error, "Response JSON should contain an error field.");
      assertStringIncludes(responseJson.error, `Provider with ID ${nonExistentProviderId} not found`, "Error message should indicate specific provider ID not found."); 

      // Verify wallet balance has not changed
      const { data: walletAfter, error: walletErrorAfter } = await supabaseAdminClient
        .from("token_wallets")
        .select("balance")
        .eq("user_id", testUserId)
        .is("organization_id", null)
        .single();

      if (walletErrorAfter) throw walletErrorAfter;
      assertExists(walletAfter, "Wallet data should exist after the call for non-existent provider test.");
      assertEquals(walletAfter.balance, initialBalance, 
        `Wallet balance should remain unchanged for non-existent provider. Expected: ${initialBalance}, Got: ${walletAfter.balance}`);
    });

    await t.step("[Specific Config] Chat with a provider using 'rough_char_count'", async () => {
      const initialBalance = 2000;
      const providerApiIdForTest = "char-count-model-v1";
      const charsPerToken = 4;
      const inputCostRate = 0.5;
      const outputCostRate = 0.75;

      const charCountConfig: Partial<AiModelExtendedConfig> = {
          tokenization_strategy: {
              type: "rough_char_count",
              chars_per_token_ratio: charsPerToken,
          },
          input_token_cost_rate: inputCostRate,
          output_token_cost_rate: outputCostRate,
          hard_cap_output_tokens: 100,
      };

      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
          userProfile: { first_name: "Char Count User" },
          initialWalletBalance: initialBalance,
          aiProviderApiIdentifier: providerApiIdForTest,
          aiProviderConfigOverride: charCountConfig,
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      const providerResource = processedResources.find(
        (r) => r.tableName === 'ai_providers' && (r.resource)?.api_identifier === providerApiIdForTest
      );
      const providerIdForTest = providerResource?.resource ? (providerResource.resource).id : undefined;
      assertExists(providerIdForTest, `Failed to get DB ID for provider ${providerApiIdForTest} from processedResources`);

      // Ensure the provider is not treated as "dummy" by directly updating its 'provider' column.
      const { error: updateProviderError } = await supabaseAdminClient
          .from("ai_providers")
          .update({ provider: "openai" }) // Set to a non-dummy provider type like "openai"
          .eq("id", providerIdForTest);
      if (updateProviderError) {
          console.error("Failed to update provider type for char-count test:", updateProviderError);
          throw updateProviderError;
      }

      const userMessageContent = "Test message for char count."; // 28 Chars
      const mockAiContent = "AI response for char count."; // 27 Chars

      const expectedPromptTokensByChar = Math.ceil(userMessageContent.length / charsPerToken);
      const expectedCompletionTokensByChar = Math.ceil(mockAiContent.length / charsPerToken);

      // No direct adapter mocking; rely on rough_char_count strategy to compute usage

      const requestBody: ChatApiRequest = {
          providerId: providerIdForTest,
          promptId: "__none__",
          message: userMessageContent,
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
          body: JSON.stringify(requestBody),
      });

      const requestHandler = createRequestHandlerForTests();
      const response = await requestHandler(request);

      assertExists(response);
      const responseJson = await response.json();

      assertEquals(response.status, 200, "Expected 200 OK. Body: " + JSON.stringify(responseJson));
      assertExists(responseJson.assistantMessage, "Response JSON should contain an assistant message.");
      assertExists(responseJson.assistantMessage.content);

      const { data: walletAfter, error: walletErrorAfter } = await supabaseAdminClient
          .from("token_wallets")
          .select("balance")
          .eq("user_id", testUserId)
          .is("organization_id", null)
          .single();

      if (walletErrorAfter) throw walletErrorAfter;
      assertExists(walletAfter, "Wallet data should exist after the call.");
      
      const usageChar: TokenUsage = responseJson.assistantMessage.token_usage;
      const expectedCost = Math.ceil((usageChar.prompt_tokens * inputCostRate) + 
                                    (usageChar.completion_tokens * outputCostRate));
      const expectedBalanceAfter = initialBalance - expectedCost;

      assertEquals(walletAfter.balance, expectedBalanceAfter, 
        `Wallet balance should reflect debit using char_count rates. ` +
        `Expected: ${expectedBalanceAfter}, Got: ${walletAfter.balance}. ` +
        `Cost: ${expectedCost}, Input Chars: ${userMessageContent.length} -> Tokens: ${expectedPromptTokensByChar}, ` +
        `Output Chars: ${mockAiContent.length} -> Tokens: ${expectedCompletionTokensByChar}`);
    });

    // This test should now pass with the DUMMY_API_KEY stubbed
    await t.step("[Specific Config] Chat with a non-existent system_prompt_id", async () => {
      const initialBalance = 1000;
      const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({ // Updated destructuring
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: 'dummy-echo-test', 
      }); 

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken, "Test user auth token was not set.");

      const { data: provider, error: providerErr } = await supabaseAdminClient
        .from('ai_providers')
        .select('id')
        .eq('api_identifier', 'dummy-echo-test') // Use a known, working provider
        .single();
      if (providerErr) throw providerErr;
      assertExists(provider, "Could not find the 'dummy-echo-test' provider.");

      const nonExistentPromptId = crypto.randomUUID(); // Changed to crypto.randomUUID()

      const requestBody: ChatApiRequest = {
        providerId: provider.id,
        promptId: nonExistentPromptId, // Using the non-existent ID
        message: "Test message with non-existent prompt ID",
        max_tokens_to_generate: 50,
      };
      
      // No direct adapter mocking; DummyAdapter will echo

      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentAuthToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      const requestHandler = createRequestHandlerForTests();
      const response = await requestHandler(request);
      const responseText = await response.text();
      
      // Expecting a 200 OK (fallback) for non-existent prompt ID, but got ${response.status}. Body: ${responseText}`);
      assertEquals(response.status, 200, `Expected 200 OK (fallback) for non-existent prompt ID, but got ${response.status}. Body: ${responseText}`);
      
      let responseJson: ChatHandlerSuccessResponse;
      try {
          responseJson = JSON.parse(responseText);
      } catch (e) {
          throw new Error(`Failed to parse response JSON. Status: ${response.status}, Text: ${responseText}, Error: ${e}`);
      }

      assertExists(responseJson.assistantMessage, "Assistant message should exist even with non-existent prompt ID.");
      assertStringIncludes(responseJson.assistantMessage.content, "Test message with non-existent prompt ID", "Response should contain the original message echoed by dummy provider.");

      // Verify no system prompt was actually used by checking for its absence or a default behavior
      // For the dummy provider, it just echoes, so the absence of specific system prompt text is the check.
      assertNotEquals(responseJson.assistantMessage.content.toLowerCase().includes("system prompt:"), true, "Response should not contain system prompt content for non-existent ID.");

      // Check wallet balance - should be unchanged if dummy provider (or charged normally if a real provider was used and succeeded)
      const { data: wallet, error: walletErr } = await supabaseAdminClient
          .from('token_wallets')
          .select('balance')
          .eq('user_id', testUserId) 
          .is('organization_id', null)
          .single();
      if (walletErr) throw walletErr;
      assertExists(wallet, "Wallet data was null for test user.");
      // For dummy-echo-test, balance should be unchanged. If we used a real provider, it would be charged.
      assertEquals(wallet.balance, initialBalance, "Wallet balance should remain unchanged for dummy provider with non-existent prompt ID.");
      // No adapter reset needed
    });

    // This test should now pass
    await t.step("[Context Handling] Chat continuation with existing chatId", async () => {
      const initialBalance = 1000;
      const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({ // Updated destructuring
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: 'dummy-echo-test', 
      }); 

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      const { data: provider, error: providerErr } = await supabaseAdminClient
        .from('ai_providers')
        .select('id')
        .eq('api_identifier', 'dummy-echo-test')
        .single();
      if (providerErr) throw providerErr;
      assertExists(provider);

      // 1. First message to establish the chat
      const firstMessageContent = "Hello, this is the first message.";
      const firstRequestBody: ChatApiRequest = {
        providerId: provider.id,
        promptId: "__none__",
        message: firstMessageContent,
        max_tokens_to_generate: 50,
      };
      
      // No direct adapter mocking; DummyAdapter will echo
      
      const firstRequest = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` },
        body: JSON.stringify(firstRequestBody),
      });

      const requestHandler1 = createRequestHandlerForTests();
      const firstResponse = await requestHandler1(firstRequest);
      const firstResponseText = await firstResponse.text();
      assertEquals(firstResponse.status, 200, `First message failed. Body: ${firstResponseText}`);
      const firstResponseJson = JSON.parse(firstResponseText);
      assertExists(firstResponseJson.chatId, "chatId missing from first response.");
      const existingChatId = firstResponseJson.chatId;
      assertExists(firstResponseJson.assistantMessage.content);

      // 2. Second message using existingChatId
      const secondMessageContent = "This is the second message in the same chat.";
      const secondRequestBody: ChatApiRequest = {
        providerId: provider.id,
        promptId: "__none__", // Prompt ID can be __none__ for continuations if not changing system prompt
        message: secondMessageContent,
        max_tokens_to_generate: 50,
        chatId: existingChatId, // Provide the existing chatId
      };

      // No direct adapter mocking; DummyAdapter will echo

      const secondRequest = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` },
        body: JSON.stringify(secondRequestBody),
      });

      const requestHandler2 = createRequestHandlerForTests();
      const secondResponse = await requestHandler2(secondRequest);
      const secondResponseText = await secondResponse.text();
      assertEquals(secondResponse.status, 200, `Second message failed. Body: ${secondResponseText}`);
      const secondResponseJson = JSON.parse(secondResponseText);
      
      assertEquals(secondResponseJson.chatId, existingChatId, "chatId from second response does not match first.");
      assertExists(secondResponseJson.assistantMessage.content);

      // 3. Verify messages in DB for the chat
      const { data: messages, error: messagesError } = await supabaseAdminClient
        .from('chat_messages')
        .select('content, role, chat_id')
        .eq('chat_id', existingChatId)
        .order('created_at', { ascending: true });
      
      if (messagesError) throw messagesError;
      assertExists(messages, "Messages query returned null.");
      assertEquals(messages.length, 4, "Should be 2 user messages and 2 assistant responses."); 
      // user1, assistant1, user2, assistant2
      assertEquals(messages[0].content, firstMessageContent);
      assertEquals(messages[0].role, "user");
      assertStringIncludes(messages[1].content, "Echo");
      assertEquals(messages[1].role, "assistant");
      assertEquals(messages[2].content, secondMessageContent);
      assertEquals(messages[2].role, "user");
      assertStringIncludes(messages[3].content, "Echo");
      assertEquals(messages[3].role, "assistant");

      // Check wallet balance
      const { data: wallet, error: walletErr } = await supabaseAdminClient
          .from('token_wallets')
          .select('balance')
          .eq('user_id', testUserId) 
          .is('organization_id', null)
          .single();
      if (walletErr) throw walletErr;
      assertExists(wallet);
      assertEquals(wallet.balance, initialBalance, "Wallet balance should remain unchanged after two dummy messages.");
    });

    // This test should now pass
    await t.step("[Context Handling] Chat continuation with selected messages", async () => {
      const initialBalance = 1000;
      const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({ // Updated destructuring
        initialWalletBalance: initialBalance,
        aiProviderApiIdentifier: 'dummy-echo-test', 
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      const { data: provider, error: providerErr } = await supabaseAdminClient
        .from('ai_providers')
        .select('id')
        .eq('api_identifier', 'dummy-echo-test')
        .single();
      if (providerErr) throw providerErr;
      assertExists(provider);

      // 1. First message 
      const firstMsgContent = "First message for selection context.";
      const firstReqBody: ChatApiRequest = { providerId: provider.id, promptId: "__none__", message: firstMsgContent, max_tokens_to_generate: 10 };
      
      // No direct adapter mocking; DummyAdapter will echo

      const firstReq = new Request(CHAT_FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` }, body: JSON.stringify(firstReqBody) });
      const requestHandler3 = createRequestHandlerForTests();
      const firstResp = await requestHandler3(firstReq);
      const firstRespText = await firstResp.text();
      assertEquals(firstResp.status, 200, `Selection Test: First message failed. Body: ${firstRespText}`);
      const firstRespJson = JSON.parse(firstRespText);
      const chatId = firstRespJson.chatId;
      assertExists(chatId);
      const firstUserMessageId = firstRespJson.userMessage?.id;
      const firstAssistantMessageId = firstRespJson.assistantMessage.id;
      assertExists(firstUserMessageId);
      assertExists(firstAssistantMessageId);
      assertExists(firstRespJson.assistantMessage.content);

      // 2. Second message
      const secondMsgContent = "Second message, should be ignored due to selection.";
      const secondReqBody: ChatApiRequest = { providerId: provider.id, promptId: "__none__", message: secondMsgContent, chatId: chatId, max_tokens_to_generate: 10 };
      
      // No direct adapter mocking; DummyAdapter will echo
      
      const secondReq = new Request(CHAT_FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` }, body: JSON.stringify(secondReqBody) });
      const secondResp = await requestHandler3(secondReq);
      const secondRespText = await secondResp.text();
      assertEquals(secondResp.status, 200, `Selection Test: Second message failed. Body: ${secondRespText}`);
      const secondRespJson = JSON.parse(secondRespText);
      const secondUserMessageId = secondRespJson.userMessage?.id;
      assertExists(secondUserMessageId);
      assertExists(secondRespJson.assistantMessage.content);

      // 3. Third message with selectedMessages (only the first user message)
      const thirdMsgContent = "Third message, context should be from first message only.";
      const thirdReqBody: ChatApiRequest = {
        providerId: provider.id,
        promptId: "__none__",
        message: thirdMsgContent,
        chatId: chatId,
        selectedMessages: [{ role: "user", content: firstMsgContent }],
        max_tokens_to_generate: 50,
      };

      // No direct adapter mocking; DummyAdapter will echo

      const thirdReq = new Request(CHAT_FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` }, body: JSON.stringify(thirdReqBody) });
      const thirdResp = await requestHandler3(thirdReq);
      const thirdRespText = await thirdResp.text();
      assertEquals(thirdResp.status, 200, `Selection Test: Third message failed. Body: ${thirdRespText}`);
      const thirdRespJson = JSON.parse(thirdRespText);

      assertEquals(thirdRespJson.chatId, chatId, "Chat ID should be consistent.");
      // Dummy provider just echoes the current message. A more sophisticated mock would be needed to truly test context selection.
      assertExists(thirdRespJson.assistantMessage.content);

      // Verify database state: check that all messages are there, as selection is for context, not for DB storage of the current turn.
      const { data: messages, error: messagesError } = await supabaseAdminClient
        .from('chat_messages')
        .select('id, content, role')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      if (messagesError) throw messagesError;
      assertExists(messages);
      assertEquals(messages.length, 6, "Should be 3 user messages and 3 assistant responses in DB.");
      assertEquals(messages[0].id, firstUserMessageId);
      assertEquals(messages[2].id, secondUserMessageId);
      assertEquals(messages[4].id, thirdRespJson.userMessage?.id);

      // Check wallet balance
      const { data: wallet, error: walletErr } = await supabaseAdminClient.from('token_wallets').select('balance').eq('user_id', testUserId).is('organization_id', null).single();
      if (walletErr) throw walletErr;
      assertExists(wallet);
      assertEquals(wallet.balance, initialBalance, "Wallet balance should be unchanged.");
    });

    // This test should now pass
    await t.step("[Error Handling] Provider config missing tokenization_strategy", async () => {
      const initialBalance = 1000;
      const providerApiIdMissingTokenization = "test-provider-missing-tokenization";

      const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({ // Updated destructuring
        initialWalletBalance: initialBalance,
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      // 2. Create a provider with missing tokenization_strategy in config
      const providerMissingStratId = crypto.randomUUID();
      const { error: insertError } = await supabaseAdminClient.from('ai_providers').insert({
        id: providerMissingStratId,
        provider: 'dummy',
        name: 'Missing Tokenization Strat Provider',
        api_identifier: providerApiIdMissingTokenization,
        is_active: true,
        // Config explicitly missing tokenization_strategy or it's null
        config: { input_token_cost_rate: 1, output_token_cost_rate: 1 /* no tokenization_strategy */ },
      });
      if (insertError) throw new Error(`Failed to insert test provider: ${insertError.message}`);

      // 3. Attempt chat
      const requestBody: ChatApiRequest = {
        providerId: providerMissingStratId,
        promptId: "__none__",
        message: "This chat should fail due to missing tokenization strategy.",
        max_tokens_to_generate: 50,
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
      });

      const handler = createRequestHandlerForTests();
      const response = await handler(request);
      const responseText = await response.text();

      // 4. Assert error response
      // Expecting a 500 or 400 error. The exact code might depend on how deep the validation goes before failing.
      assertNotEquals(response.status, 200, `Expected error response, but got 200. Body: ${responseText}`);
      assertStringIncludes(responseText.toLowerCase(), "tokenization", "Error message should mention tokenization or config issue.");
      // Or more specific: assertStringIncludes(responseText.toLowerCase(), "missing tokenization_strategy");

      // 5. Verify wallet balance unchanged
      const { data: wallet, error: walletErr } = await supabaseAdminClient
          .from('token_wallets')
          .select('balance')
          .eq('user_id', testUserId) 
          .is('organization_id', null)
          .single();
      if (walletErr) throw walletErr;
      assertExists(wallet);
      assertEquals(wallet.balance, initialBalance, "Wallet balance should be unchanged after failed chat.");
      
      // Cleanup: Delete the test provider
      await supabaseAdminClient.from('ai_providers').delete().eq('id', providerMissingStratId);
    });

    // This test should now pass
    await t.step("[Error Handling] Provider config has invalid tokenization_strategy type", async () => {
      const initialBalance = 1000;
      const providerApiIdInvalidTokenization = "test-provider-invalid-tokenization-type";

      const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({ // Updated destructuring
        initialWalletBalance: initialBalance,
      });

      const currentAuthToken = getTestUserAuthToken();
      assertExists(currentAuthToken);

      // 2. Create a provider with an invalid tokenization_strategy.type in config
      const providerInvalidStratId = crypto.randomUUID();
      const invalidConfig = {
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: { type: "this_is_not_a_valid_type" }
      };

      const { error: insertError } = await supabaseAdminClient.from('ai_providers').insert({
        id: providerInvalidStratId,
        provider: 'dummy',
        name: 'Invalid Tokenization Type Provider',
        api_identifier: providerApiIdInvalidTokenization,
        is_active: true,
        config: invalidConfig,
      });
      if (insertError) throw new Error(`Failed to insert test provider with invalid tokenization type: ${insertError.message}`);

      // 3. Attempt chat
      const requestBody: ChatApiRequest = {
        providerId: providerInvalidStratId,
        promptId: "__none__",
        message: "This chat should fail due to invalid tokenization strategy type.",
        max_tokens_to_generate: 50,
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
      });

      const handler = createRequestHandlerForTests();
      const response = await handler(request);
      const responseText = await response.text();

      // 4. Assert error response
      assertNotEquals(response.status, 200, `Expected error response for invalid type, but got 200. Body: ${responseText}`);
      assertStringIncludes(responseText.toLowerCase(), "tokenization", "Error message should mention tokenization or config issue for invalid type.");
      // Consider a more specific check if the error message is known:
      // assertStringIncludes(responseText.toLowerCase(), "invalid tokenization_strategy type");

      // 5. Verify wallet balance unchanged
      const { data: wallet, error: walletErr } = await supabaseAdminClient
          .from('token_wallets')
          .select('balance')
          .eq('user_id', testUserId) 
          .is('organization_id', null)
          .single();
      if (walletErr) throw walletErr;
      assertExists(wallet);
      assertEquals(wallet.balance, initialBalance, "Wallet balance should be unchanged after failed chat with invalid type.");
      
      // Cleanup: Delete the test provider
      await supabaseAdminClient.from('ai_providers').delete().eq('id', providerInvalidStratId);
    });
  } finally {
    restoreEnvStub(); // Restore stub after all tests in this suite
  }
} 