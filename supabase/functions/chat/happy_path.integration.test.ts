import {
  assertEquals,
  assertExists,
  assertStringIncludes,
  // assertNotEquals, // Not used in these happy path tests yet
  // assertAlmostEquals, // Not used
  // assertArrayIncludes, // Not used
  // fail // Not used
} from "https://deno.land/std@0.220.1/assert/mod.ts";
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
import { handler as chatHandler, defaultDeps as chatDefaultDeps } from "./index.ts"; // Corrected path and new import
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database, Json } from "../types_db.ts"; // Added Json
import { createMockSupabaseClient, type MockQueryBuilderState, type MockResolveQueryResult } from "../_shared/supabase.mock.ts";

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
      (pr.resource as any)?.api_identifier === providerApiIdentifier
  );

  if (!providerResource || !providerResource.resource) {
    console.error(`[getProviderForTest] Provider NOT FOUND. Searched for: "${providerApiIdentifier}". Available 'ai_providers' resources:`, JSON.stringify(providerResourcesFromProcessed.map(pr => pr.resource), null, 2));
    // Fallback to direct query IF REALLY NEEDED, but ideally processedResources should be complete
    // For now, let's throw if not found in processedResources as it indicates a setup issue.
    throw new Error(
      `Provider with api_identifier '${providerApiIdentifier}' not found in processedResources. Check test setup.`
    );
  }
  const providerData = providerResource.resource as any; // Cast to any to access properties
  return {
    id: providerData.id,
    api_identifier: providerData.api_identifier,
    config: providerData.config as AiModelExtendedConfig,
  };
}

// This helper function creates the deps for each test call to chatHandler
const createDepsForTest = (): ChatHandlerDeps => {
  const deps: ChatHandlerDeps = {
    ...chatDefaultDeps,
    logger: currentTestDeps.logger,
    getAiProviderAdapter: (
      _providerApiIdentifier: string,
      _providerDbConfig: Json | null,
      _apiKey: string,
      _loggerFromDep?: ILogger
    ): AiProviderAdapter => mockAiAdapter,
    supabaseClient: currentTestDeps.supabaseClient || undefined,
    createSupabaseClient: currentTestDeps.createSupabaseClient || chatDefaultDeps.createSupabaseClient,
  };
  return deps;
};

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

      const providerInfo = await getProviderForTest("gpt-3.5-turbo-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      const mockAiResponseContent = "This is a happy path response from mock AI.";
      const mockTokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
      
      mockAiAdapter.setSimpleMockResponse(
        providerApiIdentifier,
        mockAiResponseContent,
        actualProviderDbId, 
        null, 
        mockTokenUsage
      );
      
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
          },
          body: JSON.stringify(requestBody),
      });

      const response = await chatHandler(request, createDepsForTest()); // Use createDepsForTest

      const responseText = await response.text(); 
      let responseJson: ChatHandlerSuccessResponse;
      try {
          responseJson = JSON.parse(responseText) as ChatHandlerSuccessResponse;
      } catch (e) {
          throw new Error(`Failed to parse response JSON. Status: ${response.status}, Text: ${responseText}, Error: ${e}`);
      }
      
      assertEquals(response.status, 200, `Response: ${responseText}`);
      
      assertExists(responseJson.assistantMessage, "Assistant message should exist in response");
      assertEquals(responseJson.assistantMessage.content, mockAiResponseContent, "Assistant message content mismatch with mock.");
      assertEquals(responseJson.assistantMessage.ai_provider_id, actualProviderDbId);
      assertEquals(responseJson.assistantMessage.user_id, testUserId);
      const assistantMessageTokenUsage = responseJson.assistantMessage.token_usage as unknown as TokenUsage;
      assertEquals(assistantMessageTokenUsage?.prompt_tokens, mockTokenUsage.prompt_tokens);
      assertEquals(assistantMessageTokenUsage?.completion_tokens, mockTokenUsage.completion_tokens);

      assertExists(responseJson.userMessage, "User message should exist in response");
      assertEquals(responseJson.userMessage.content, requestBody.message);
      assertEquals(responseJson.userMessage.user_id, testUserId);
      assertEquals(responseJson.userMessage.chat_id, responseJson.chatId);
      assertEquals(responseJson.assistantMessage.chat_id, responseJson.chatId);

      const costRateInput = providerConfig.input_token_cost_rate || 0;
      const costRateOutput = providerConfig.output_token_cost_rate || 0;
      const expectedCost = (mockTokenUsage.prompt_tokens * costRateInput) + (mockTokenUsage.completion_tokens * costRateOutput);
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

      const providerInfo = await getProviderForTest("gpt-4-costly-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      const mockAiResponseContent = "I am a costly model response.";
      const mockTokenUsage: TokenUsage = { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 };
      mockAiAdapter.setSimpleMockResponse(
          providerApiIdentifier,
          mockAiResponseContent,
          actualProviderDbId,
          null,
          mockTokenUsage
      );

      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: "__none__",
        message: "Tell me something expensive.",
        max_tokens_to_generate: 150,
      };
      
      const request = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
          body: JSON.stringify(requestBody),
      });
      
      const response = await chatHandler(request, createDepsForTest()); 

      const responseTextCostly = await response.text();
      let responseJsonCostly: ChatHandlerSuccessResponse;
      try {
          responseJsonCostly = JSON.parse(responseTextCostly) as ChatHandlerSuccessResponse;
      } catch (e) {
          throw new Error(`Failed to parse response JSON for costly model. Status: ${response.status}, Text: ${responseTextCostly}, Error: ${e}`);
      }

      assertEquals(response.status, 200, responseTextCostly);
      assertExists(responseJsonCostly.assistantMessage);
      assertEquals(responseJsonCostly.assistantMessage.content, mockAiResponseContent);

      const costRateInput = providerConfig.input_token_cost_rate || 0;
      const costRateOutput = providerConfig.output_token_cost_rate || 0;
      const expectedCost = (mockTokenUsage.prompt_tokens * costRateInput) + (mockTokenUsage.completion_tokens * costRateOutput);
      const expectedBalance = initialBalance - Math.ceil(expectedCost);

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

      const providerInfo = await getProviderForTest("gpt-3.5-turbo-test", processedResources);
      const providerConfig = providerInfo.config;

      // --- 1. First Chat turn (user + assistant) ---
      const firstMockAiResponseContent = "This is the first AI response.";
      const firstMockTokenUsage: TokenUsage = { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 };
      mockAiAdapter.setSimpleMockResponse(
          providerInfo.api_identifier,
          firstMockAiResponseContent,
          providerInfo.id,
          null,
          firstMockTokenUsage
      );
      
      const firstRequestBody: ChatApiRequest = {
        providerId: providerInfo.id,
        promptId: "__none__",
        message: "This is the first message in the chat.",
      };
      
      const firstRequest = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
          body: JSON.stringify(firstRequestBody),
      });

      const firstResponse = await chatHandler(firstRequest, createDepsForTest());
      const firstResponseText = await firstResponse.text();
      assertEquals(firstResponse.status, 200, `First response failed: ${firstResponseText}`);
      const firstResponseJson = JSON.parse(firstResponseText) as ChatHandlerSuccessResponse;
      
      const firstMessageCost = Math.ceil(
        (firstMockTokenUsage.prompt_tokens * providerConfig.input_token_cost_rate!) + 
        (firstMockTokenUsage.completion_tokens * providerConfig.output_token_cost_rate!)
      );
      const balanceAfterFirstMessage = initialBalance - firstMessageCost;

      // --- 2. Rewind operation ---
      const rewindMockAiResponseContent = "This is the new AI response after rewind.";
      const rewindMockTokenUsage: TokenUsage = { prompt_tokens: 12, completion_tokens: 15, total_tokens: 27 };
      mockAiAdapter.setSimpleMockResponse(
          providerInfo.api_identifier,
          rewindMockAiResponseContent,
          providerInfo.id,
          null,
          rewindMockTokenUsage
      );

      const rewindRequestBody: ChatApiRequest = {
        chatId: firstResponseJson.chatId,
        rewindFromMessageId: firstResponseJson.assistantMessage.id, // Rewind from the first assistant message
        providerId: providerInfo.id,
        promptId: "__none__",
        message: "This is a new user message for the rewind.",
      };

      const rewindRequest = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
        body: JSON.stringify(rewindRequestBody),
      });

      const rewindResponse = await chatHandler(rewindRequest, createDepsForTest());
      const rewindResponseText = await rewindResponse.text();
      assertEquals(rewindResponse.status, 200, `Rewind response failed: ${rewindResponseText}`);
      
      const rewindMessageCost = Math.ceil(
        (rewindMockTokenUsage.prompt_tokens * providerConfig.input_token_cost_rate!) +
        (rewindMockTokenUsage.completion_tokens * providerConfig.output_token_cost_rate!)
      );
      
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

      const providerInfo = await getProviderForTest("gpt-3.5-turbo-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      // Find the system prompt from processedResources
      const systemPromptResource = processedResources.find(
        (pr) => pr.tableName === "system_prompts" && (pr.resource as any)?.name === "Specific System Prompt for Happy Path"
      );
      if (!systemPromptResource || !systemPromptResource.resource) {
        throw new Error("Specific system prompt not found in processedResources for test.");
      }
      const systemPrompt = systemPromptResource.resource as any;

      const mockAiResponseContent = "Response using specific system prompt.";
      // This token usage doesn't need to be perfect, just representative.
      const mockTokenUsage: TokenUsage = { prompt_tokens: 35, completion_tokens: 15, total_tokens: 50 };
      mockAiAdapter.setSimpleMockResponse(
        providerApiIdentifier,
        mockAiResponseContent,
        actualProviderDbId,
        null,
        mockTokenUsage
      );
      
      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: systemPrompt.id,
        message: "What be the weather today?",
      };

      const request = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
          body: JSON.stringify(requestBody),
      });

      const response = await chatHandler(request, createDepsForTest());
      const responseText = await response.text();
      let responseJson: ChatHandlerSuccessResponse;
      try {
        responseJson = JSON.parse(responseText) as ChatHandlerSuccessResponse;
      } catch (e) {
        throw new Error(`Failed to parse response JSON. Status: ${response.status}, Text: ${responseText}, Error: ${e}`);
      }

      assertEquals(response.status, 200, responseText);
      assertExists(responseJson.assistantMessage, "Assistant message should exist");
      assertEquals(responseJson.assistantMessage.content, mockAiResponseContent, "Assistant message content mismatch");
      assertExists(responseJson.userMessage, "User message should exist");
      assertEquals(responseJson.userMessage.system_prompt_id, systemPrompt.id, "User message should have the correct system_prompt_id");
      assertEquals(responseJson.assistantMessage.system_prompt_id, systemPrompt.id, "Assistant message should have the correct system_prompt_id");

      // Also assert that the system prompt was passed to the AI adapter
      const lastCall = mockAiAdapter.getLastRecordedCall();
      const systemMessageInCall = lastCall?.messages.find(m => m.role === 'system');
      assertExists(systemMessageInCall, "System prompt was not in the messages sent to the AI adapter.");
      assertEquals(systemMessageInCall.content, systemPrompt.prompt_text, "The content of the system prompt sent to the adapter was incorrect.");
      
      // Finally, verify the wallet debit
      const expectedCost = (mockTokenUsage.prompt_tokens * providerConfig.input_token_cost_rate!) + (mockTokenUsage.completion_tokens * providerConfig.output_token_cost_rate!);
      const expectedBalance = initialBalance - Math.ceil(expectedCost);
      
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

      const providerInfo = await getProviderForTest("gpt-3.5-turbo-test", processedResources);
      const actualProviderDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;

      const mockAiResponseContent = "Short response generated.";
      const mockTokenUsage: TokenUsage = { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 };
      mockAiAdapter.setSimpleMockResponse(
        providerApiIdentifier, 
        mockAiResponseContent,
        actualProviderDbId, 
        null, 
        mockTokenUsage
      );
      
      const specificMaxTokens = 25;
      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId, 
        promptId: "__none__",
        message: "Generate a short response.",
        max_tokens_to_generate: specificMaxTokens,
      };

      const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
      });
      
      const response = await chatHandler(request, createDepsForTest()); 

      const responseTextMaxTokens = await response.text();
      let responseJsonMaxTokens: ChatHandlerSuccessResponse;
      try {
          responseJsonMaxTokens = JSON.parse(responseTextMaxTokens) as ChatHandlerSuccessResponse;
      } catch (e) {
          throw new Error(`Failed to parse response JSON for max_tokens test. Status: ${response.status}, Text: ${responseTextMaxTokens}, Error: ${e}`);
      }
      assertEquals(response.status, 200, responseTextMaxTokens);
      assertExists(responseJsonMaxTokens.assistantMessage);
      assertEquals(responseJsonMaxTokens.assistantMessage.content, mockAiResponseContent);

      const recordedCalls = mockAiAdapter.getRecordedCalls();
      const lastCall = recordedCalls.find(call => call.modelIdentifier === providerApiIdentifier && call.messages.some(m => m.content === requestBody.message));
      
      assertExists(lastCall, "No call recorded to the mock adapter for this test scenario.");
      assertEquals(lastCall?.max_tokens_to_generate, specificMaxTokens, "max_tokens_to_generate was not passed correctly to the AI adapter.");
    });
} 