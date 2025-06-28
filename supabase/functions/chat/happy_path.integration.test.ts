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
      const expectedBalance = initialBalance - expectedCost;

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
      const providerDbId = providerInfo.id;
      const providerApiIdentifier = providerInfo.api_identifier;
      const providerConfig = providerInfo.config;

      const initialUserMessageContent = "This is the first message in the chat.";
      const initialAiResponseContent = "This is the first AI response.";
      const initialPromptTokens = 5;
      const initialCompletionTokens = 8;
      const initialTokenUsage: TokenUsage = { 
          prompt_tokens: initialPromptTokens, 
          completion_tokens: initialCompletionTokens, 
          total_tokens: initialPromptTokens + initialCompletionTokens 
      };

      mockAiAdapter.setSimpleMockResponse(
          providerApiIdentifier,
          initialAiResponseContent,
          providerDbId,
          null,
          initialTokenUsage
      );

      const initialRequestBody: ChatApiRequest = {
        providerId: providerDbId,
        promptId: "__none__",
        message: initialUserMessageContent,
      };
      const initialRequest = new Request(CHAT_FUNCTION_URL, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
          body: JSON.stringify(initialRequestBody),
      });
      const initialResponse = await chatHandler(initialRequest, createDepsForTest());
      const initialResponseText = await initialResponse.text();
      let initialResponseJson: ChatHandlerSuccessResponse;
      try {
          initialResponseJson = JSON.parse(initialResponseText) as ChatHandlerSuccessResponse;
      } catch (e) {
          throw new Error(`Failed to parse initial response JSON for rewind test. Status: ${initialResponse.status}, Text: ${initialResponseText}, Error: ${e}`);
      }
      assertEquals(initialResponse.status, 200, `Initial response error: ${initialResponseText}`);
      assertExists(initialResponseJson.userMessage, "Initial user message missing.");
      assertExists(initialResponseJson.assistantMessage, "Initial assistant message missing.");
      const firstUserMessageId = initialResponseJson.userMessage.id;
      const firstAssistantMessageId = initialResponseJson.assistantMessage.id;
      console.log(`Rewind Test: First User Msg ID: ${firstUserMessageId}, First AI Msg ID: ${firstAssistantMessageId}`);

      const chatId = initialResponseJson.chatId;
      const lastMessageId = initialResponseJson.assistantMessage.id; 

      assertExists(chatId, "Chat ID missing from initial response.");
      assertExists(lastMessageId, "Last message ID missing from initial response.");
      
      const initialCost = (initialTokenUsage.prompt_tokens * (providerConfig.input_token_cost_rate || 0)) + 
                          (initialTokenUsage.completion_tokens * (providerConfig.output_token_cost_rate || 0));
      let currentExpectedBalance = initialBalance - initialCost;

      const rewindAiResponseContent = "This is the new AI response after rewind.";
      const rewindPromptTokens = 12; 
      const rewindCompletionTokens = 15;
      const rewindTokenUsage: TokenUsage = { 
          prompt_tokens: rewindPromptTokens, 
          completion_tokens: rewindCompletionTokens, 
          total_tokens: rewindPromptTokens + rewindCompletionTokens
      };
      mockAiAdapter.setSimpleMockResponse(
          providerApiIdentifier,
          rewindAiResponseContent,
          providerDbId,
          null,
          rewindTokenUsage
      );

      const rewindRequestBody: ChatApiRequest = {
        providerId: providerDbId,
        promptId: "__none__",
        message: "This is a new user message for the rewind.",
        chatId: chatId,
        rewindFromMessageId: lastMessageId, 
      };
      
      const rewindRequest = new Request(CHAT_FUNCTION_URL, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
          body: JSON.stringify(rewindRequestBody),
      });
      const rewindResponse = await chatHandler(rewindRequest, createDepsForTest());
      const rewindResponseText = await rewindResponse.text();
      let finalResponseJson: ChatHandlerSuccessResponse;
      try {
          finalResponseJson = JSON.parse(rewindResponseText) as ChatHandlerSuccessResponse;
      } catch (e) {
          throw new Error(`Failed to parse final response JSON for rewind test. Status: ${rewindResponse.status}, Text: ${rewindResponseText}, Error: ${e}`);
      }

      assertEquals(rewindResponse.status, 200, `Rewind call failed: ${rewindResponseText}`);
      assertExists(finalResponseJson.userMessage, "User message from rewind response missing.");
      assertExists(finalResponseJson.assistantMessage, "Assistant message from rewind response missing.");
      
      const rewindUserMessageContent = "This is a new user message for the rewind.";
      const mockRewindAiResponseContent = "This is the new AI response after rewind.";

      const { data: messagesAfterRewind, error: messagesError } = await supabaseAdminClient
        .from('chat_messages')
        .select('id, role, content, is_active_in_thread, created_at')
        .eq('chat_id', initialResponseJson.chatId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;
      assertExists(messagesAfterRewind, "Could not fetch messages after rewind for verification.");
      
      console.log("All messages in chat after rewind for debugging:", JSON.stringify(messagesAfterRewind, null, 2));

      const originalUserMsg = messagesAfterRewind.find(m => m.content === initialUserMessageContent && m.role === 'user');
      const originalAiMsg = messagesAfterRewind.find(m => m.content === initialAiResponseContent && m.role === 'assistant');
      const newUserMsg = messagesAfterRewind.find(m => m.content === rewindUserMessageContent && m.role === 'user');
      const newAiMsg = messagesAfterRewind.find(m => m.content === mockRewindAiResponseContent && m.role === 'assistant');

      assertExists(originalUserMsg, `Original user message ('${initialUserMessageContent}') not found by content after rewind.`);
      assertEquals(originalUserMsg.is_active_in_thread, false, `Original user message ('${initialUserMessageContent}') should be inactive. Found: ${JSON.stringify(originalUserMsg)}`);

      assertExists(originalAiMsg, `Original AI message ('${initialAiResponseContent}') not found by content after rewind.`);
      assertEquals(originalAiMsg.is_active_in_thread, false, `Original AI message ('${initialAiResponseContent}') should be inactive. Found: ${JSON.stringify(originalAiMsg)}`);

      assertExists(newUserMsg, `New user message ('${rewindUserMessageContent}') not found by content after rewind.`);
      assertEquals(newUserMsg.is_active_in_thread, true, `New user message ('${rewindUserMessageContent}') should be active. Found: ${JSON.stringify(newUserMsg)}`);
      assertEquals(newUserMsg.id, finalResponseJson.userMessage.id, "New user message ID mismatch with response.");

      assertExists(newAiMsg, `New AI message ('${mockRewindAiResponseContent}') not found by content after rewind.`);
      assertEquals(newAiMsg.is_active_in_thread, true, `New AI message ('${mockRewindAiResponseContent}') should be active. Found: ${JSON.stringify(newAiMsg)}`);
      assertEquals(newAiMsg.id, finalResponseJson.assistantMessage.id, "New AI message ID mismatch with response.");

      const rewindCost = (rewindTokenUsage.prompt_tokens * (providerConfig.input_token_cost_rate || 0)) + 
                         (rewindTokenUsage.completion_tokens * (providerConfig.output_token_cost_rate || 0));
      currentExpectedBalance -= rewindCost;
      
      const { data: finalWallet, error: finalWalletError } = await supabaseAdminClient
        .from('token_wallets')
        .select('balance')
        .eq('user_id', testUserId)
        .is('organization_id', null)
        .single();
      if (finalWalletError) throw finalWalletError;
      assertEquals(finalWallet?.balance, currentExpectedBalance, "Wallet balance not debited correctly after rewind.");

      // --- Verification of message states ---
      const { data: finalMessages, error: finalMessagesError } = await supabaseAdminClient
        .from('chat_messages')
        .select('id, content, is_active_in_thread, role')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (finalMessagesError) throw finalMessagesError;
      assertExists(finalMessages);

      const originalUserMessageInDb = finalMessages.find(m => m.id === initialResponseJson.userMessage!.id);
      assertExists(originalUserMessageInDb, "Original user message (that was before the rewound AI message) should still exist after rewind.");
      assertEquals(originalUserMessageInDb?.is_active_in_thread, false, "User message that led to the original rewound AI message should now be INACTIVE.");

      const originalAssistantMessageInDb = finalMessages.find(m => m.id === initialResponseJson.assistantMessage.id); 
      assertExists(originalAssistantMessageInDb, "Original assistant message that was rewound should still exist in DB.");
      assertEquals(originalAssistantMessageInDb?.is_active_in_thread, false, "Original assistant message that was rewound should be inactive.");
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

      // Find the system prompt from processedResources
      const systemPromptResource = processedResources.find(
        (pr) => pr.tableName === "system_prompts" && (pr.resource as any)?.prompt_text.includes("Specific System Prompt for Happy Path")
      );
      if (!systemPromptResource || !systemPromptResource.resource) {
        throw new Error("Specific system prompt not found in processedResources for test.");
      }
      const systemPromptIdToUse = (systemPromptResource.resource as any).id;
      const systemPromptText = (systemPromptResource.resource as any).prompt_text;

      const mockAiResponseContent = "Response using specific system prompt.";
      const mockTokenUsage: TokenUsage = { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 };
      mockAiAdapter.setSimpleMockResponse(
        providerApiIdentifier,
        mockAiResponseContent,
        actualProviderDbId,
        null,
        mockTokenUsage
      );
      
      const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: systemPromptIdToUse,
        message: "What be the weather today?",
      };

      const request = new Request(CHAT_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
          body: JSON.stringify(requestBody),
      });

      const originalSupabaseClient = currentTestDeps.supabaseClient;
      try {
        // console.log("[TEST DEBUG] Overriding supabaseClient. testSystemPromptId:", testSystemPromptId, "systemPromptText:", systemPromptText);
        // console.log("[TEST DEBUG] currentTestDeps.supabaseClient before override:", currentTestDeps.supabaseClient === supabaseAdminClient ? "supabaseAdminClient (real)" : "Unknown or mock");
        // @ts-expect-error supabaseClient is optionally defined for testing
        currentTestDeps.supabaseClient = mockSystemPromptSupabaseClient as unknown as SupabaseClient<Database>;
        // console.log("[TEST DEBUG] currentTestDeps.supabaseClient after override:", currentTestDeps.supabaseClient !== originalSupabaseClient ? " SUCCESSFULLY Overridden (different from original)" : "!!! NOT Overridden (still original) !!!");

        const response = await chatHandler(request, createDepsForTest());
        const responseText = await response.text();
        let responseJson: ChatHandlerSuccessResponse;
        try {
            responseJson = JSON.parse(responseText) as ChatHandlerSuccessResponse;
        } catch (e) {
            throw new Error(`Failed to parse response JSON. Status: ${response.status}, Text: ${responseText}, Error: ${e}`);
        }

        assertEquals(response.status, 200, `Full response: ${responseText}`);
        assertExists(responseJson.assistantMessage, "Assistant message missing.");
        assertEquals(responseJson.assistantMessage.content, mockAiResponseContent);
        
        // Crucial assertion: check what system prompt content the mock AI adapter received
        const lastCallToMockAdapter = mockAiAdapter.getLastRecordedCall();
        assertExists(lastCallToMockAdapter, "Mock AI adapter was not called.");
        
        const systemMessageInAiCall = lastCallToMockAdapter.messages.find((m: { role: 'system' | 'user' | 'assistant'; content: string }) => m.role === 'system');
        assertExists(systemMessageInAiCall, "System message not found in AI call.");
        assertEquals(
            systemMessageInAiCall.content, 
            systemPromptText,
            "System prompt content mismatch in AI call."
        );

      } finally {
        // Restore the original Supabase client
        currentTestDeps.supabaseClient = originalSupabaseClient;
        mockAiAdapter.reset(); // Reset for subsequent tests
      }
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