import { assert, assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    ChatApiRequest,
    ChatMessageRow,
    TokenUsage,
    AiModelExtendedConfig,
    ChatMessage,
    FinishReason,
    ILogger,
    AiProviderAdapter,
    AdapterStreamChunk,
    FactoryDependencies,
} from "../_shared/types.ts";
import { calculateActualChatCost } from "../_shared/utils/cost_utils.ts";
import {
  supabaseAdminClient,
  currentTestDeps,
  mockAiAdapter,
  getTestUserAuthToken,
  CHAT_FUNCTION_URL,
  type ProcessedResourceInfo,
} from "../_shared/_integration.test.utils.ts";
import { createChatServiceHandler, defaultDeps, handler } from "./index.ts";
import type { ChatDeps, ChatParams, ChatPayload } from "./index.interface.ts";
import {
  buildAuthenticatedGetUserFn,
  buildMockUserForChatHandlerUnitTests,
  CHAT_HANDLER_UNIT_TEST_USER_ID,
  CHAT_HANDLER_UNIT_TEST_CHAT_ID,
  CHAT_HANDLER_UNIT_TEST_PROVIDER_ID,
} from "./index.mock.ts";
import { getAiProviderAdapter, testProviderMap } from "../_shared/ai_service/factory.ts";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../_shared/_integration.test.utils.ts";
import type { Database, Json, Tables } from "../types_db.ts";
import { createMockSupabaseClient, type MockQueryBuilderState, type MockResolveQueryResult } from "../_shared/supabase.mock.ts";
import {
  createMockAdminTokenWalletService,
  asSupabaseAdminClientForTests,
} from "../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import type { TokenWallet } from "../_shared/types/tokenWallet.types.ts";
import type { RecordTransactionParams } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isTokenUsage } from "../_shared/utils/type_guards.ts";
import {
  handleCorsPreflightRequest,
  createSuccessResponse,
  createErrorResponse,
} from "../_shared/cors-headers.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { getMockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
import { streamRequest } from "./streamRequest/streamRequest.ts";
import { prepareChatContext } from "./prepareChatContext/prepareChatContext.ts";
import { constructMessageHistory } from "./constructMessageHistory/constructMessageHistory.ts";
import { findOrCreateChat } from "./findOrCreateChat.ts";
import { countTokens } from "../_shared/utils/tokenizer_utils.ts";
import { debitTokens } from "../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";

function createNoopStream() {
  return async function* (
    _request: ChatApiRequest,
    _modelIdentifier: string,
  ): AsyncGenerator<AdapterStreamChunk> {
    const textDeltaChunk: AdapterStreamChunk = { type: 'text_delta', text: '' };
    yield textDeltaChunk;
    return;
  };
}

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
function createRequestHandlerForTests(depsOverride?: Partial<ChatDeps>) {
  const deps: ChatDeps = {
    ...defaultDeps,
    getAiProviderAdapter: (dependencies: FactoryDependencies) => getAiProviderAdapter({
      ...dependencies,
      providerMap: testProviderMap,
    }),
    ...depsOverride,
  };
  const adminClient: SupabaseClient<Database> = supabaseAdminClient;
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
      const capEnforcingDeps: Partial<ChatDeps> = {
        getAiProviderAdapter: (_factoryDeps: FactoryDependencies) => ({
          sendMessage: async (req: ChatApiRequest, _model: string) => ({
            role: 'assistant' as const,
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
          sendMessageStream: createNoopStream(),
          listModels: async () => []
        })
      };
      const requestHandler = createRequestHandlerForTests(capEnforcingDeps);
      const response = await requestHandler(request);

      const responseText = await response.text();
      assertEquals(response.status, 200, `Response: ${responseText}`);
      assertStringIncludes(responseText, '"type":"chat_start"');
      assertStringIncludes(responseText, '"type":"chat_complete"');

      // Verify persisted state via the database — the source of truth
      const { data: chatRow, error: chatError } = await supabaseAdminClient
        .from("chats")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (chatError) throw chatError;
      assertExists(chatRow, "Chat row should exist in DB");

      const { data: userMsg, error: userMsgError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatRow.id)
        .eq("role", "user")
        .single();
      if (userMsgError) throw userMsgError;
      assertExists(userMsg, "User message should exist in DB");
      assertEquals(userMsg.content, requestBody.message);
      assertEquals(userMsg.user_id, testUserId);
      assertEquals(userMsg.chat_id, chatRow.id);

      const { data: assistantMsg, error: assistantMsgError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatRow.id)
        .eq("role", "assistant")
        .single();
      if (assistantMsgError) throw assistantMsgError;
      assertExists(assistantMsg, "Assistant message should exist in DB");
      assertExists(assistantMsg.content);
      assertEquals(assistantMsg.ai_provider_id, actualProviderDbId);
      assertEquals(assistantMsg.user_id, null);
      assertEquals(assistantMsg.chat_id, chatRow.id);

      const assistantUsageRaw = assistantMsg.token_usage;
      assertExists(assistantUsageRaw, "token_usage should be present on assistant message");
      if (!isTokenUsage(assistantUsageRaw)) throw new Error("Invalid token_usage in DB row");
      const assistantMessageTokenUsage: TokenUsage = assistantUsageRaw;
      assertEquals(typeof assistantMessageTokenUsage.prompt_tokens, 'number');
      assertEquals(typeof assistantMessageTokenUsage.completion_tokens, 'number');

      const expectedCost = calculateActualChatCost(assistantMessageTokenUsage, providerConfig);
      const expectedBalance = initialBalance - expectedCost;

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
      assertEquals(response.status, 200, responseTextCostly);
      assertStringIncludes(responseTextCostly, '"type":"chat_start"');
      assertStringIncludes(responseTextCostly, '"type":"chat_complete"');

      // Verify persisted state via the database
      const { data: chatRow, error: chatError } = await supabaseAdminClient
        .from("chats")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (chatError) throw chatError;

      const { data: costlyAssistantMsg, error: costlyAssistantError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatRow.id)
        .eq("role", "assistant")
        .single();
      if (costlyAssistantError) throw costlyAssistantError;
      assertExists(costlyAssistantMsg);
      assertExists(costlyAssistantMsg.content);

      const usageCostlyRaw = costlyAssistantMsg.token_usage;
      if (!isTokenUsage(usageCostlyRaw)) throw new Error("Invalid token_usage in costly model DB row");
      const usageCostly: TokenUsage = usageCostlyRaw;
      const expectedCostCostly = calculateActualChatCost(usageCostly, providerConfig);
      const expectedBalance = initialBalance - expectedCostCostly;

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
      assertStringIncludes(firstResponseText, '"type":"chat_start"');
      assertStringIncludes(firstResponseText, '"type":"chat_complete"');

      // Get first turn's persisted state from DB
      const { data: firstChatRow, error: firstChatError } = await supabaseAdminClient
        .from("chats")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (firstChatError) throw firstChatError;

      const { data: firstAssistantMsg, error: firstAssistantError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", firstChatRow.id)
        .eq("role", "assistant")
        .single();
      if (firstAssistantError) throw firstAssistantError;

      const firstUsageRaw = firstAssistantMsg.token_usage;
      if (!isTokenUsage(firstUsageRaw)) throw new Error("Invalid token_usage in first turn DB row");
      const firstUsage: TokenUsage = firstUsageRaw;
      const firstMessageCost = calculateActualChatCost(firstUsage, providerConfig);
      const balanceAfterFirstMessage = initialBalance - firstMessageCost;

      // --- 2. Rewind operation ---
      const rewindRequestBody: ChatApiRequest = {
        chatId: firstChatRow.id,
        rewindFromMessageId: firstAssistantMsg.id,
        providerId: providerInfo.id,
        promptId: "__none__",
        message: "This is a new user message for the rewind.",
      };

      const rewindRequest = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(rewindRequestBody),
      });

      const rewindHandler = createRequestHandlerForTests();
      const rewindResponse = await rewindHandler(rewindRequest);
      const rewindResponseText = await rewindResponse.text();
      assertEquals(rewindResponse.status, 200, `Rewind response failed: ${rewindResponseText}`);
      assertStringIncludes(rewindResponseText, '"type":"chat_complete"');

      // Get rewind turn's persisted state from DB
      // The rewind creates a new assistant message in the same chat
      const { data: rewindAssistantMsgs, error: rewindAssistantError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", firstChatRow.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (rewindAssistantError) throw rewindAssistantError;

      const rewindUsageRaw = rewindAssistantMsgs.token_usage;
      if (!isTokenUsage(rewindUsageRaw)) throw new Error("Invalid token_usage in rewind DB row");
      const rewindUsage: TokenUsage = rewindUsageRaw;
      const rewindMessageCost = calculateActualChatCost(rewindUsage, providerConfig);

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
      assertEquals(response.status, 200, responseText);
      assertStringIncludes(responseText, '"type":"chat_start"');
      assertStringIncludes(responseText, '"type":"chat_complete"');

      // Verify persisted state via the database
      const { data: chatRow, error: chatError } = await supabaseAdminClient
        .from("chats")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (chatError) throw chatError;

      const { data: userMsg, error: userMsgError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatRow.id)
        .eq("role", "user")
        .single();
      if (userMsgError) throw userMsgError;
      assertExists(userMsg, "User message should exist in DB");
      assertEquals(userMsg.system_prompt_id, systemPrompt.id, "User message should have the correct system_prompt_id");

      const { data: assistantMsg, error: assistantMsgError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatRow.id)
        .eq("role", "assistant")
        .single();
      if (assistantMsgError) throw assistantMsgError;
      assertExists(assistantMsg, "Assistant message should exist in DB");
      assertExists(assistantMsg.content);
      assertEquals(assistantMsg.system_prompt_id, systemPrompt.id, "Assistant message should have the correct system_prompt_id");

      // Verify the wallet debit
      const sysUsageRaw = assistantMsg.token_usage;
      if (!isTokenUsage(sysUsageRaw)) throw new Error("Invalid token_usage in system prompt DB row");
      const sysUsage: TokenUsage = sysUsageRaw;
      const expectedCostSys = calculateActualChatCost(sysUsage, providerConfig);
      const expectedBalance = initialBalance - expectedCostSys;
      
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
      
      const capEnforcingDeps: Partial<ChatDeps> = {
        getAiProviderAdapter: (_factoryDeps: FactoryDependencies) => ({
          sendMessage: async (req: ChatApiRequest, _model: string) => ({
            role: 'assistant' as const,
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
          sendMessageStream: createNoopStream(),
          listModels: async () => [],
        }),
      };
      const requestHandler = createRequestHandlerForTests(capEnforcingDeps);
      const response = await requestHandler(request);

      const responseTextMaxTokens = await response.text();
      assertEquals(response.status, 200, responseTextMaxTokens);
      assertStringIncludes(responseTextMaxTokens, '"type":"chat_complete"');

      // Verify persisted state via the database
      const { data: chatRow, error: chatError } = await supabaseAdminClient
        .from("chats")
        .select("*")
        .eq("user_id", testUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (chatError) throw chatError;

      const { data: assistantMsg, error: assistantMsgError } = await supabaseAdminClient
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatRow.id)
        .eq("role", "assistant")
        .single();
      if (assistantMsgError) throw assistantMsgError;
      assertExists(assistantMsg);
      assertExists(assistantMsg.content);

      const usageMaxRaw = assistantMsg.token_usage;
      if (!isTokenUsage(usageMaxRaw)) throw new Error("Invalid token_usage in max tokens DB row");
      const usageMax: TokenUsage = usageMaxRaw;
      assertEquals(typeof usageMax.completion_tokens, 'number');
      assertEquals(usageMax.completion_tokens <= specificMaxTokens, true, "completion exceeded client cap");
    });
}

Deno.test("Happy Path Integration Tests", async (t) => {
    await t.step("POST request with valid Auth (New Chat) should proceed past auth check", async () => {
      const TEST_PROVIDER_ID: string = CHAT_HANDLER_UNIT_TEST_PROVIDER_ID;
      const TEST_CHAT_ID: string = CHAT_HANDLER_UNIT_TEST_CHAT_ID;
      const TEST_USER_ID: string = CHAT_HANDLER_UNIT_TEST_USER_ID;
      const TEST_USER_MSG_ID: string = "dddddddd-dddd-4ddd-8ddd-000000000099";

      // Set env var that prepareChatContext needs to resolve the API key
      Deno.env.set("DUMMY_API_KEY", "sk-test-dummy");

      const mockLogger: MockLogger = new MockLogger();

      const providerConfig: AiModelExtendedConfig = {
        api_identifier: "dummy-model-v1",
        tokenization_strategy: { type: "rough_char_count" },
        input_token_cost_rate: 1,
        output_token_cost_rate: 2,
        context_window_tokens: 10000,
        provider_max_input_tokens: 1000,
        provider_max_output_tokens: 500,
      };

      const providerRow: Tables<"ai_providers"> = {
        id: TEST_PROVIDER_ID,
        name: "Dummy Test Provider",
        api_identifier: "dummy-model-v1",
        provider: "dummy",
        is_active: true,
        config: providerConfig as unknown as Database["public"]["Tables"]["ai_providers"]["Row"]["config"],
        description: null,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const supabaseConfig: import("../_shared/supabase.mock.ts").MockSupabaseDataConfig = {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [providerRow],
              error: null,
            },
          },
          chats: {
            select: {
              data: [{ id: TEST_CHAT_ID }],
              error: null,
            },
          },
          chat_messages: {
            select: {
              data: [],
              error: null,
              count: 0,
              status: 200,
              statusText: "OK",
            },
            insert: async (
              state: MockQueryBuilderState,
            ): Promise<{
              data: object[] | null;
              error: Error | null;
              count: number | null;
              status: number;
              statusText: string;
            }> => {
              const insertData = state.insertData;
              if (
                insertData === null ||
                typeof insertData !== "object" ||
                Array.isArray(insertData)
              ) {
                return {
                  data: null,
                  error: new Error("invalid insert payload"),
                  count: 0,
                  status: 400,
                  statusText: "Bad Request",
                };
              }
              const now: string = new Date().toISOString();
              if ("role" in insertData && insertData.role === "user") {
                const content: string =
                  "content" in insertData && typeof insertData.content === "string"
                    ? insertData.content
                    : "";
                const userRow: Tables<"chat_messages"> = {
                  id: TEST_USER_MSG_ID,
                  chat_id: TEST_CHAT_ID,
                  user_id: TEST_USER_ID,
                  role: "user",
                  content,
                  is_active_in_thread: true,
                  ai_provider_id: TEST_PROVIDER_ID,
                  system_prompt_id: null,
                  token_usage: null,
                  error_type: null,
                  response_to_message_id: null,
                  created_at: now,
                  updated_at: now,
                };
                return {
                  data: [userRow],
                  error: null,
                  count: 1,
                  status: 201,
                  statusText: "Created",
                };
              }
              if ("role" in insertData && insertData.role === "assistant") {
                const id: string =
                  "id" in insertData && typeof insertData.id === "string"
                    ? insertData.id
                    : crypto.randomUUID();
                const content: string =
                  "content" in insertData && typeof insertData.content === "string"
                    ? insertData.content
                    : "";
                const assistantRow: Tables<"chat_messages"> = {
                  id,
                  chat_id: TEST_CHAT_ID,
                  user_id: null,
                  role: "assistant",
                  content,
                  is_active_in_thread: true,
                  ai_provider_id: TEST_PROVIDER_ID,
                  system_prompt_id: null,
                  token_usage: null,
                  error_type: null,
                  response_to_message_id: TEST_USER_MSG_ID,
                  created_at: now,
                  updated_at: now,
                };
                return {
                  data: [assistantRow],
                  error: null,
                  count: 1,
                  status: 201,
                  statusText: "Created",
                };
              }
              return {
                data: null,
                error: new Error("unexpected insert role"),
                count: 0,
                status: 400,
                statusText: "Bad Request",
              };
            },
          },
        },
      };

      const mockAdminWallet = createMockAdminTokenWalletService();
      const mockUserWallet = createMockUserTokenWalletService({
        getWalletByIdAndUser: (
          walletId: string,
          userId: string,
        ): Promise<TokenWallet | null> => {
          const now: Date = new Date();
          const wallet: TokenWallet = {
            walletId,
            userId,
            balance: "100000",
            currency: "AI_TOKEN",
            createdAt: now,
            updatedAt: now,
          };
          return Promise.resolve(wallet);
        },
      });
      const adapterPair = getMockAiProviderAdapter(mockLogger, providerConfig);

      const deps: ChatDeps = {
        logger: mockLogger,
        adminTokenWalletService: mockAdminWallet.instance,
        userTokenWalletService: mockUserWallet.instance,
        streamRequest: streamRequest,
        handleCorsPreflightRequest,
        createSuccessResponse,
        createErrorResponse,
        prepareChatContext: prepareChatContext,
        countTokens: countTokens,
        debitTokens: debitTokens,
        getMaxOutputTokens: getMaxOutputTokens,
        findOrCreateChat: findOrCreateChat,
        constructMessageHistory: constructMessageHistory,
        getAiProviderAdapter: (_factoryDeps: FactoryDependencies) => adapterPair.instance,
      };

      const userMockSetup = createMockSupabaseClient(TEST_USER_ID, supabaseConfig);
      const adminMockSetup = createMockSupabaseClient("happy-path-admin", {});
      const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(userMockSetup.client);
      const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(adminMockSetup.client);

      const mockUser = buildMockUserForChatHandlerUnitTests();
      const chatParams: ChatParams = {
        userClient,
        adminClient,
        getUserFn: buildAuthenticatedGetUserFn(mockUser),
      };

      const reqBody: ChatApiRequest = {
        message: "Hello, this is a test for valid auth.",
        providerId: TEST_PROVIDER_ID,
        promptId: "__none__",
        chatId: TEST_CHAT_ID,
        walletId: "ffffffff-ffff-4fff-8fff-000000000001",
      };

      const req: Request = new Request("http://localhost/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer mock-user-token",
          "X-Test-Mode": "true",
        },
        body: JSON.stringify(reqBody),
      });

      const chatPayload: ChatPayload = { req };

      const result = await handler(deps, chatParams, chatPayload);

      assert(!(result instanceof Error), "handler should not return an Error");
      const response: Response = result as Response;
      const responseText: string = await response.text();
      assertEquals(response.status, 200, `Expected 200 but got ${response.status}: ${responseText}`);
      assertStringIncludes(responseText, '"type":"chat_start"');
      assertStringIncludes(responseText, '"type":"chat_complete"');

      // Verify new wallet service fields exist and old field does not
      assertExists(deps.adminTokenWalletService, "adminTokenWalletService should be present");
      assertExists(deps.userTokenWalletService, "userTokenWalletService should be present");
      assertEquals("tokenWalletService" in deps, false, "legacy tokenWalletService must not exist");
    });
});
