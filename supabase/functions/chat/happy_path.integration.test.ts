import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { 
    ChatApiRequest, 
    ChatHandlerSuccessResponse, 
    TokenUsage,
    AiModelExtendedConfig,
    ChatMessage,
    ChatHandlerDeps,
    ILogger,
    AiProviderAdapter
} from "../_shared/types.ts";
import {
  // Shared instances & state
  supabaseAdminClient,
  currentTestDeps, // Use currentTestDeps from utils
  mockAiAdapter,
  // JWT token getter
  getTestUserAuthToken,
  // Core handler
  // chatHandler, // Removed: This was incorrectly imported
  // Constants
  CHAT_FUNCTION_URL,
  type ProcessedResourceInfo // Added ProcessedResourceInfo here
} from "../_shared/_integration.test.utils.ts";
import { createChatServiceHandler, defaultDeps } from "./index.ts";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../_shared/_integration.test.utils.ts";
import type { Database, Json } from "../types_db.ts";
import { createMockSupabaseClient, type MockQueryBuilderState, type MockResolveQueryResult } from "../_shared/supabase.mock.ts";
import { createTestDeps, mockAdapterSuccessResponse } from './_chat.test.utils.ts';
import type { TokenWalletTransaction } from '../_shared/types/tokenWallet.types.ts';
import type { TokenWalletServiceMethodImplementations } from '../_shared/services/tokenWalletService.mock.ts';
import { ChatTestConstants } from './_chat.test.utils.ts';
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isTokenUsage } from "../_shared/utils/type_guards.ts";

// Helper function to get provider data from processedResources
async function getProviderForTest(
  providerApiIdentifier: string,
  processedResources: ProcessedResourceInfo<any>[]
): Promise<{ id: string; api_identifier: string; config: AiModelExtendedConfig }> {
  console.log(`[getProviderForTest] Searching for providerApiIdentifier: "${providerApiIdentifier}"`);
  const providerResourcesFromProcessed = processedResources.filter(pr => pr.tableName === 'ai_providers');
  console.log(`[getProviderForTest] Found ${providerResourcesFromProcessed.length} 'ai_providers' in processedResources:`);
  providerResourcesFromProcessed.forEach(pr => {
      console.log(`  - Resource: ${JSON.stringify(pr.resource)}`);
  });

  const providerResource = processedResources.find(
    (pr) =>
      pr.tableName === "ai_providers" &&
      (pr.resource)?.api_identifier === providerApiIdentifier
  );

  if (!providerResource || !providerResource.resource) {
    console.error(`[getProviderForTest] Provider NOT FOUND. Searched for: "${providerApiIdentifier}". Available 'ai_providers' resources:`, JSON.stringify(providerResourcesFromProcessed.map(pr => pr.resource), null, 2));
    // Fallback to direct query IF REALLY NEEDED, but ideally processedResources should be complete
    // For now, let's throw if not found in processedResources as it indicates a setup issue.
    throw new Error(
      `Provider with api_identifier '${providerApiIdentifier}' not found in processedResources. Check test setup.`
    );
  }
  const providerData = providerResource.resource;
  return {
    id: providerData.id,
    api_identifier: providerData.api_identifier,
    config: providerData.config,
  };
}

// Build a production-style request handler for tests
function createRequestHandlerForTests(depsOverride?: Partial<ChatHandlerDeps>) {
  const deps: ChatHandlerDeps = { ...defaultDeps, ...depsOverride };
  const adminClient = currentTestDeps.supabaseClient as SupabaseClient<Database>;
  const getSupabaseClient = (token: string | null) => currentTestDeps.createSupabaseClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined,
  ) as SupabaseClient<Database>;
  return createChatServiceHandler(deps, getSupabaseClient, adminClient);
}

export async function runHappyPathTests(
    thp: Deno.TestContext, // Renamed t to thp (test happy path) to avoid conflict if t is used inside steps
    initializeTestGroupEnvironment: (options?: { 
        userProfile?: Partial<{ role: "user" | "admin"; first_name: string }>;
        initialWalletBalance?: number; 
    }) => Promise<{ primaryUserId: string; processedResources: ProcessedResourceInfo<any>[]; }>
) {
    await thp.step("[Happy Path] Successful chat with user wallet debit (standard rates)", async () => {
      const initialBalance = 1000;
      // Use the passed initializeTestGroupEnvironment, which calls coreInitializeTestStep
      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({ 
        userProfile: { first_name: 'Happy Path User' },
        initialWalletBalance: initialBalance 
      });
      const currentAuthToken = getTestUserAuthToken(); // Get the token set by initializeTestGroupEnvironment

      const providerInfo = await getProviderForTest("openai-gpt-3.5-turbo-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      // Use test-mode dummy adapter for provider behavior
      
      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: "__none__", 
        message: "Hello, this is a test message for the happy path.",
        max_tokens_to_generate: 50, 
      };

      const request = new Request(CHAT_FUNCTION_URL, { 
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${currentAuthToken}`,
              "X-Test-Mode": "true",
          },
          body: JSON.stringify(requestBody),
      });

      // Inject an adapter that enforces the client cap for this step
      const specificMaxTokens = requestBody.max_tokens_to_generate ?? 0;
      const capEnforcingDeps: Partial<ChatHandlerDeps> = {
        getAiProviderAdapter: (_factoryDeps) => ({
          sendMessage: async (req, _model) => ({
            role: 'assistant',
            content: 'Capped response',
            ai_provider_id: actualProviderDbId,
            system_prompt_id: null,
            token_usage: {
              prompt_tokens: 0,
              completion_tokens: Math.min(req.max_tokens_to_generate ?? 0, specificMaxTokens),
              total_tokens: Math.min(req.max_tokens_to_generate ?? 0, specificMaxTokens)
            },
            finish_reason: 'max_tokens'
          }),
          listModels: async () => []
        })
      };
      const requestHandler = createRequestHandlerForTests(capEnforcingDeps);
      const response = await requestHandler(request);

      const responseText = await response.text(); 
      let responseJson: ChatHandlerSuccessResponse;
      try {
          responseJson = JSON.parse(responseText);
      } catch (e) {
          throw new Error(`Failed to parse response JSON. Status: ${response.status}, Text: ${responseText}, Error: ${e}`);
      }
      
      assertEquals(response.status, 200, `Response: ${responseText}`);
      
      assertExists(responseJson.assistantMessage, "Assistant message should exist in response");
      assertExists(responseJson.assistantMessage.content);
      assertEquals(responseJson.assistantMessage.ai_provider_id, actualProviderDbId);
      assertEquals(responseJson.assistantMessage.user_id, null);
      const assistantUsageRaw = responseJson.assistantMessage.token_usage;
      assertExists(assistantUsageRaw, "token_usage should be present on assistantMessage");
      if (!isTokenUsage(assistantUsageRaw)) throw new Error("Invalid token_usage in response");
      const assistantMessageTokenUsage: TokenUsage = assistantUsageRaw;
      assertEquals(typeof assistantMessageTokenUsage.prompt_tokens, 'number');
      assertEquals(typeof assistantMessageTokenUsage.completion_tokens, 'number');

      assertExists(responseJson.userMessage, "User message should exist in response");
      assertExists(responseJson.userMessage);
      assertEquals(responseJson.userMessage?.content, requestBody.message);
      assertEquals(responseJson.userMessage?.user_id, testUserId);
      assertEquals(responseJson.userMessage?.chat_id, responseJson.chatId);
      assertEquals(responseJson.assistantMessage.chat_id, responseJson.chatId);

      const expectedCost = assistantMessageTokenUsage.total_tokens > 0
        ? assistantMessageTokenUsage.total_tokens
        : assistantMessageTokenUsage.prompt_tokens + assistantMessageTokenUsage.completion_tokens;
      const expectedBalance = initialBalance - Math.ceil(expectedCost);

      const { data: wallet, error: walletError } = await supabaseAdminClient
        .from('token_wallets')
        .select('balance')
        .eq('user_id', testUserId)
        .is('organization_id', null)
        .single();

      if (walletError) throw walletError;
      assertExists(wallet, "Wallet not found for user after chat.");
      assertEquals(wallet.balance, expectedBalance, "Wallet balance not debited correctly.");
    });

    await thp.step("[Happy Path] Successful chat with costly model and correct debit", async () => {
      const initialBalance = 20000;
      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'Costly Model User' },
        initialWalletBalance: initialBalance 
      });
      const currentAuthToken = getTestUserAuthToken();

      const providerInfo = await getProviderForTest("openai-gpt-4-costly-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      // Use test-mode dummy adapter, relying on returned token_usage

      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: "__none__",
        message: "Tell me something expensive.",
        max_tokens_to_generate: 150,
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
          body: JSON.stringify(requestBody),
      });
      
      const requestHandler = createRequestHandlerForTests();
      const response = await requestHandler(request); 

      const responseTextCostly = await response.text();
      let responseJsonCostly: ChatHandlerSuccessResponse;
      try {
          responseJsonCostly = JSON.parse(responseTextCostly);
      } catch (e) {
          throw new Error(`Failed to parse response JSON for costly model. Status: ${response.status}, Text: ${responseTextCostly}, Error: ${e}`);
      }

      assertEquals(response.status, 200, responseTextCostly);
      assertExists(responseJsonCostly.assistantMessage);
      assertExists(responseJsonCostly.assistantMessage.content);

      const usageCostlyRaw = responseJsonCostly.assistantMessage.token_usage;
      if (!isTokenUsage(usageCostlyRaw)) throw new Error("Invalid token_usage in costly model response");
      const usageCostly: TokenUsage = usageCostlyRaw;
      const expectedCostCostly = usageCostly.total_tokens > 0
        ? usageCostly.total_tokens
        : usageCostly.prompt_tokens + usageCostly.completion_tokens;
      const expectedBalance = initialBalance - Math.ceil(expectedCostCostly);

      const { data: wallet, error: walletError } = await supabaseAdminClient
          .from('token_wallets')
          .select('balance')
          .eq('user_id', testUserId)
          .is('organization_id', null)
          .single();
      if (walletError) throw walletError;
      assertEquals(wallet?.balance, expectedBalance, "Costly model debit incorrect.");
    });

    await thp.step("[Happy Path] Successful rewind operation with correct debit", async () => {
      const initialBalance = 5000;
      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'Rewind User' },
        initialWalletBalance: initialBalance
      });
      const currentAuthToken = getTestUserAuthToken();

      const providerInfo = await getProviderForTest("openai-gpt-3.5-turbo-test", processedResources);
      const providerConfig = providerInfo.config;

      // --- 1. First Chat turn (user + assistant) ---
      
      const firstRequestBody: ChatApiRequest = {
        providerId: providerInfo.id,
        promptId: "__none__",
        message: "This is the first message in the chat.",
      };
      
      const firstRequest = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
          body: JSON.stringify(firstRequestBody),
      });

      const firstHandler = createRequestHandlerForTests();
      const firstResponse = await firstHandler(firstRequest);
      const firstResponseText = await firstResponse.text();
      assertEquals(firstResponse.status, 200, `First response failed: ${firstResponseText}`);
      const firstResponseJson = JSON.parse(firstResponseText);
      
      const firstUsageRaw = firstResponseJson.assistantMessage.token_usage;
      if (!isTokenUsage(firstUsageRaw)) throw new Error("Invalid token_usage in first response");
      const firstUsage: TokenUsage = firstUsageRaw;
      const firstMessageCost = Math.ceil(
        firstUsage.total_tokens > 0
          ? firstUsage.total_tokens
          : (firstUsage.prompt_tokens + firstUsage.completion_tokens)
      );
      const balanceAfterFirstMessage = initialBalance - firstMessageCost;

      // --- 2. Rewind operation ---
      // Second turn using dummy adapter

      const rewindRequestBody: ChatApiRequest = {
        chatId: firstResponseJson.chatId,
        rewindFromMessageId: firstResponseJson.assistantMessage.id, // Rewind from the first assistant message
        providerId: providerInfo.id,
        promptId: "__none__",
        message: "This is a new user message for the rewind.",
      };

      const rewindRequest = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(rewindRequestBody),
      });

      // Use mocked handler for rewind so RPC is available
      const { deps: rewindDeps, mockSupabaseClientSetup: rewindMockClient } = createTestDeps(
        {
          genericMockResults: {
            'ai_providers': {
              select: { data: [{ id: providerInfo.id, name: "Dummy Test Provider", api_identifier: providerInfo.api_identifier, provider: 'dummy', is_active: true, default_model_id: "some-model", config: providerConfig }], error: null, status: 200, count: 1 }
            },
            'chats': {
              insert: { data: [{ id: firstResponseJson.chatId, user_id: testUserId, system_prompt_id: null, title: "rewind" }], error: null, status: 201, count: 1 },
              select: { data: [{ id: firstResponseJson.chatId, user_id: testUserId, system_prompt_id: null, title: "rewind" }], error: null, status: 200, count: 1 }
            },
            'chat_messages': {
              select: async (state) => {
                const idFilter = state.filters.find(f => f.type === 'eq' && f.column === 'id');
                const chatIdFilter = state.filters.find(f => f.type === 'eq' && f.column === 'chat_id');
                const isActiveFilter = state.filters.find(f => f.type === 'eq' && f.column === 'is_active_in_thread');
                const now = new Date();
                const earlier = new Date(now.getTime() - 1000).toISOString();
                const nowIso = now.toISOString();
                // Query for rewind point created_at
                if (idFilter && idFilter.value === firstResponseJson.assistantMessage.id) {
                  return Promise.resolve({ data: [{ created_at: earlier }], error: null, count: 1, status: 200, statusText: 'OK' });
                }
                // History up to rewind point
                if (chatIdFilter && chatIdFilter.value === firstResponseJson.chatId && isActiveFilter && isActiveFilter.value === true) {
                  return Promise.resolve({ data: [
                    { id: firstResponseJson.userMessage.id, chat_id: firstResponseJson.chatId, user_id: testUserId, role: 'user', content: firstResponseJson.userMessage.content, is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null, created_at: earlier, updated_at: earlier },
                    { id: firstResponseJson.assistantMessage.id, chat_id: firstResponseJson.chatId, user_id: null, role: 'assistant', content: firstResponseJson.assistantMessage.content, is_active_in_thread: true, ai_provider_id: providerInfo.id, system_prompt_id: null, token_usage: firstResponseJson.assistantMessage.token_usage, error_type: null, response_to_message_id: firstResponseJson.userMessage.id, created_at: nowIso, updated_at: nowIso },
                  ], error: null, count: 2, status: 200, statusText: 'OK' });
                }
                return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
              },
              insert: (state) => {
                const inserted = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                if (inserted && (inserted).role === 'user') {
                  return Promise.resolve({ data: [{ ...ChatTestConstants.mockUserDbRow, id: crypto.randomUUID(), chat_id: firstResponseJson.chatId, content: inserted.content }], error: null, status: 201, count: 1 });
                }
                if (inserted && (inserted).role === 'assistant') {
                  return Promise.resolve({ data: [{ ...ChatTestConstants.mockAssistantDbRow, id: crypto.randomUUID(), chat_id: firstResponseJson.chatId, content: inserted.content, token_usage: inserted.token_usage }], error: null, status: 201, count: 1 });
                }
                return Promise.resolve({ data: null, error: new Error('Unexpected insert'), status: 500, count: 0 });
              }
            }
          },
          rpcResults: {
            'perform_chat_rewind': async () => ({
              data: {
                id: crypto.randomUUID(),
                chat_id: firstResponseJson.chatId,
                user_id: null,
                role: 'assistant',
                content: 'Rewind assistant response',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_active_in_thread: true,
                token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                ai_provider_id: providerInfo.id,
                system_prompt_id: null,
                error_type: null,
                response_to_message_id: firstResponseJson.userMessage.id,
              },
              error: null
            })
          }
        }
      );
      const rewindAdminClient = rewindMockClient.client as unknown as SupabaseClient<Database>;
      const getRewindUserClient = (_token: string | null) => rewindMockClient.client as unknown as SupabaseClient<Database>;
      const rewindHandler = createChatServiceHandler(rewindDeps, getRewindUserClient, rewindAdminClient);
      const rewindResponse = await rewindHandler(rewindRequest);
      const rewindResponseText = await rewindResponse.text();
      assertEquals(rewindResponse.status, 200, `Rewind response failed: ${rewindResponseText}`);
      
      const rewindJson: ChatHandlerSuccessResponse = JSON.parse(rewindResponseText);
      const rewindUsageRaw = rewindJson.assistantMessage.token_usage;
      if (!isTokenUsage(rewindUsageRaw)) throw new Error("Invalid token_usage in rewind response");
      const rewindUsage: TokenUsage = rewindUsageRaw;
      const rewindMessageCost = Math.ceil(rewindUsage.total_tokens > 0 ? rewindUsage.total_tokens : (rewindUsage.prompt_tokens + rewindUsage.completion_tokens));
      
      // The final balance should be the balance after the first message, minus the cost of the rewind.
      // The cost of the first message is NOT refunded.
      const expectedFinalBalance = balanceAfterFirstMessage - rewindMessageCost;

      const { data: finalWallet, error: finalWalletError } = await supabaseAdminClient
        .from('token_wallets')
        .select('balance')
        .eq('user_id', testUserId)
        .is('organization_id', null)
        .single();
      
      if (finalWalletError) throw finalWalletError;
      
      assertEquals(finalWallet?.balance, expectedFinalBalance, "Final balance after rewind is incorrect.");
    });

    await thp.step("[Happy Path] Successful chat using a valid system_prompt_id", async () => {
      const initialBalance = 1000;
      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'SystemPrompt User' },
        initialWalletBalance: initialBalance,
      });
      const currentAuthToken = getTestUserAuthToken();

      const providerInfo = await getProviderForTest("openai-gpt-3.5-turbo-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      // Find the system prompt from processedResources
      const systemPromptResource = processedResources.find(
        (pr) => pr.tableName === "system_prompts" && (pr.resource)?.name === "Specific System Prompt for Happy Path"
      );
      if (!systemPromptResource || !systemPromptResource.resource) {
        throw new Error("Specific system prompt not found in processedResources for test.");
      }
      const systemPrompt = systemPromptResource.resource;

      // Use test mode dummy adapter
      
      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: systemPrompt.id,
        message: "What be the weather today?",
      };

      const request = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
          body: JSON.stringify(requestBody),
      });
      
      const requestHandler = createRequestHandlerForTests();
      const response = await requestHandler(request);
      const responseText = await response.text();
      let responseJson: ChatHandlerSuccessResponse;
      try {
        responseJson = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Failed to parse response JSON. Status: ${response.status}, Text: ${responseText}, Error: ${e}`);
      }

      assertEquals(response.status, 200, responseText);
      assertExists(responseJson.assistantMessage, "Assistant message should exist");
      assertExists(responseJson.assistantMessage.content);
      assertExists(responseJson.userMessage, "User message should exist");
      assertEquals(responseJson.userMessage.system_prompt_id, systemPrompt.id, "User message should have the correct system_prompt_id");
      assertEquals(responseJson.assistantMessage.system_prompt_id, systemPrompt.id, "Assistant message should have the correct system_prompt_id");

      // Ensure system_prompt_id threaded
      assertEquals(responseJson.assistantMessage.system_prompt_id, systemPrompt.id);
      
      // Finally, verify the wallet debit
      const sysUsageRaw = responseJson.assistantMessage.token_usage;
      if (!isTokenUsage(sysUsageRaw)) throw new Error("Invalid token_usage in system prompt response");
      const expectedCostSys = sysUsageRaw.total_tokens > 0
        ? sysUsageRaw.total_tokens
        : sysUsageRaw.prompt_tokens + sysUsageRaw.completion_tokens;
      const expectedBalance = initialBalance - Math.ceil(expectedCostSys);
      
      const { data: wallet, error: walletError } = await supabaseAdminClient
        .from('token_wallets')
        .select('balance')
        .eq('user_id', testUserId)
        .is('organization_id', null)
        .single();
      
      if (walletError) throw walletError;
      assertEquals(wallet?.balance, expectedBalance, "Wallet balance for system prompt test is incorrect.");
    });

    await thp.step("[Happy Path] max_tokens_to_generate from client is respected/passed to AI", async () => {
      const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'Max Tokens Test User' },
        initialWalletBalance: 1000
      });
      const currentAuthToken = getTestUserAuthToken();

      const providerInfo = await getProviderForTest("openai-gpt-3.5-turbo-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;

      // Use test mode dummy adapter
      
      const specificMaxTokens = 25;
      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId, 
        promptId: "__none__",
        message: "Generate a short response.",
        max_tokens_to_generate: specificMaxTokens,
      };

      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(requestBody),
      });
      
      const capEnforcingDeps: Partial<ChatHandlerDeps> = {
        getAiProviderAdapter: (_factoryDeps) => ({
          sendMessage: async (req) => ({
            role: 'assistant',
            content: 'Capped response',
            ai_provider_id: actualProviderDbId,
            system_prompt_id: null,
            token_usage: {
              prompt_tokens: 0,
              completion_tokens: Math.min(req.max_tokens_to_generate ?? 0, specificMaxTokens),
              total_tokens: Math.min(req.max_tokens_to_generate ?? 0, specificMaxTokens),
            },
            finish_reason: 'max_tokens',
          }),
          listModels: async () => [],
        }),
      };
      const requestHandler = createRequestHandlerForTests(capEnforcingDeps);
      const response = await requestHandler(request); 

      const responseTextMaxTokens = await response.text();
      let responseJsonMaxTokens: ChatHandlerSuccessResponse;
      try {
          responseJsonMaxTokens = JSON.parse(responseTextMaxTokens);
      } catch (e) {
          throw new Error(`Failed to parse response JSON for max_tokens test. Status: ${response.status}, Text: ${responseTextMaxTokens}, Error: ${e}`);
      }
      assertEquals(response.status, 200, responseTextMaxTokens);
      assertExists(responseJsonMaxTokens.assistantMessage);
      assertExists(responseJsonMaxTokens.assistantMessage.content);
      const usageMaxRaw = responseJsonMaxTokens.assistantMessage.token_usage;
      if (!isTokenUsage(usageMaxRaw)) throw new Error("Invalid token_usage in max tokens response");
      const usageMax: TokenUsage = usageMaxRaw;
      assertEquals(typeof usageMax.completion_tokens, 'number');
      assertEquals(usageMax.completion_tokens <= specificMaxTokens, true, "completion exceeded client cap");
    });
}

Deno.test("Happy Path Integration Tests", async (t) => {
    await t.step("POST request with valid Auth (New Chat) should proceed past auth check", async () => {
      const tokenWalletConfigForTest: TokenWalletServiceMethodImplementations = {
        getWalletForContext: () => Promise.resolve({
          walletId: 'test-wallet-id',
          balance: '100000', // Sufficient balance
          currency: 'AI_TOKEN',
          createdAt: new Date(),
          updatedAt: new Date(),
          organization_id: null,
          user_id: ChatTestConstants.testUserId
        }),
        recordTransaction: (params) => Promise.resolve({ 
          transactionId: "txn_123",
          walletId: params.walletId,
          type: params.type,
          amount: params.amount,
          balanceAfterTxn: "99990",
          recordedByUserId: params.recordedByUserId,
          relatedEntityId: params.relatedEntityId,
          relatedEntityType: params.relatedEntityType,
          timestamp: new Date(),
          idempotencyKey: params.idempotencyKey,
        })
      };

      const { deps, mockTokenWalletService, mockSupabaseClientSetup } = createTestDeps(
        { 
          genericMockResults: {
            'ai_providers': {
                select: { data: [{ id: ChatTestConstants.testProviderId, name: "Dummy Test Provider", api_identifier: 'dummy-model-v1', provider: 'dummy', is_active: true, default_model_id: "some-model", config: { api_identifier: 'dummy-model-v1', input_token_cost_rate: 1, output_token_cost_rate: 2, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } } }], error: null, status: 200, count: 1 }
            },
            'system_prompts': {
                select: { data: [{ id: ChatTestConstants.testPromptId, prompt_text: 'Test system prompt', is_active: true }], error: null, status: 200, count: 1 }
            },
            'chats': {
                insert: { data: [{ id: ChatTestConstants.testChatId, user_id: ChatTestConstants.testUserId, system_prompt_id: ChatTestConstants.testPromptId, title:"test" }], error: null, status: 201, count: 1 },
                select: { data: [{ id: ChatTestConstants.testChatId, user_id: ChatTestConstants.testUserId, system_prompt_id: ChatTestConstants.testPromptId, title:"test" }], error: null, status: 200, count: 1 } 
            },
            'chat_messages': {
                insert: (state) => {
                  const insertedData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                  let responseData = null;
                  if (insertedData && (insertedData).role === 'user') {
                    responseData = { ...ChatTestConstants.mockUserDbRow, id: crypto.randomUUID(), chat_id: ChatTestConstants.testChatId, ...insertedData };
                  } else if (insertedData && (insertedData).role === 'assistant') {
                    responseData = { ...ChatTestConstants.mockAssistantDbRow, id: crypto.randomUUID(), chat_id: ChatTestConstants.testChatId, ...insertedData };
                  }
                  if (!responseData) {
                    console.warn('[Test Mock chat_messages insert] Unexpected insertData:', state.insertData);
                    return Promise.resolve({ data: null, error: new Error('Mock insert for chat_messages received unexpected data'), status: 500, count: 0 });
                  }
                  return Promise.resolve({ data: [responseData], error: null, status: 201, count: 1 });
                },
            }
          }
        },
        undefined,
        tokenWalletConfigForTest,
        () => 10
      );

      const reqBodyMessages: { role: 'user' | 'system' | 'assistant'; content: string }[] = [{ role: "user", content: "Hello, this is a test for valid auth." }];
      const reqBody: ChatApiRequest = {
        message: reqBodyMessages[0].content,
        providerId: ChatTestConstants.testProviderId,
        messages: reqBodyMessages,
        promptId: ChatTestConstants.testPromptId,
      };

      const req = new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer mock-user-token`,
            'X-Test-Mode': 'true'
        },
        body: JSON.stringify(reqBody),
      });

      // Build handler using the deps and mock client from createTestDeps so the mocked token wallet is used
      const adminClient = mockSupabaseClientSetup.client as unknown as SupabaseClient<Database>;
      const getSupabaseClient = (_token: string | null) => mockSupabaseClientSetup.client as unknown as SupabaseClient<Database>;
      const requestHandler = createChatServiceHandler(deps, getSupabaseClient, adminClient);
      const response = await requestHandler(req);
      
      assertEquals(response.status, 200); 
      const responseData = await response.json();
      assertExists(responseData.chatId);
      assertExists(responseData.assistantMessage);
      assertEquals(responseData.assistantMessage.role, "assistant");

      assertExists(deps.tokenWalletService, 'tokenWalletService should be present');
    });
}); 
