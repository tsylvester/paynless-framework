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
    ChatMessage
} from "../_shared/types.ts";
import {
  // Shared instances & state
  supabaseAdminClient,
  currentTestDeps, // Use currentTestDeps from utils
  mockAiAdapter,
  // JWT token getter
  getTestUserAuthToken,
  // Core handler
  chatHandler, // Use chatHandler from utils
  // Constants
  CHAT_FUNCTION_URL
} from "./_integration.test.utils.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { createMockSupabaseClient, type MockQueryBuilderState, type MockResolveQueryResult } from "../_shared/supabase.mock.ts";

export async function runHappyPathTests(
    thp: Deno.TestContext, // Renamed t to thp (test happy path) to avoid conflict if t is used inside steps
    initializeTestGroupEnvironment: (options?: { 
        userProfile?: Partial<{ role: string; first_name: string }>; 
        initialWalletBalance?: number; 
    }) => Promise<string>
) {
    await thp.step("[Happy Path] Successful chat with user wallet debit (standard rates)", async () => {
      const initialBalance = 1000;
      // Use the passed initializeTestGroupEnvironment, which calls coreInitializeTestStep
      const testUserId = await initializeTestGroupEnvironment({ 
        userProfile: { first_name: 'Happy Path User' },
        initialWalletBalance: initialBalance 
      });
      const currentAuthToken = getTestUserAuthToken(); // Get the token set by initializeTestGroupEnvironment

      const { data: providerData, error: providerError } = await supabaseAdminClient
        .from('ai_providers')
        .select('id, api_identifier, config')
        .eq('api_identifier', 'gpt-3.5-turbo-test')
        .single();

      if (providerError || !providerData) {
        throw new Error(`Could not fetch provider 'gpt-3.5-turbo-test': ${providerError?.message}`);
      }
      const actualProviderDbId = providerData.id;
      const providerApiIdentifier = providerData.api_identifier;
      const providerConfig = providerData.config as unknown as AiModelExtendedConfig;

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

      const response = await chatHandler(request, currentTestDeps); // Use chatHandler and currentTestDeps from utils

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
      const testUserId = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'Costly Model User' },
        initialWalletBalance: initialBalance 
      });
      const currentAuthToken = getTestUserAuthToken();

      const { data: providerData, error: providerError } = await supabaseAdminClient
        .from('ai_providers')
        .select('id, api_identifier, config')
        .eq('api_identifier', 'gpt-4-costly-test')
        .single();

      if (providerError || !providerData) {
        throw new Error(`Could not fetch provider 'gpt-4-costly-test': ${providerError?.message}`);
      }
      const actualProviderDbId = providerData.id;
      const providerApiIdentifier = providerData.api_identifier;
      const providerConfig = providerData.config as unknown as AiModelExtendedConfig;

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
      
      const response = await chatHandler(request, currentTestDeps); 

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
      const testUserId = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'Rewind User' },
        initialWalletBalance: initialBalance
      });
      const currentAuthToken = getTestUserAuthToken();

      const { data: providerData, error: providerError } = await supabaseAdminClient
        .from('ai_providers')
        .select('id, api_identifier, config')
        .eq('api_identifier', 'gpt-3.5-turbo-test')
        .single();

      if (providerError || !providerData) {
        throw new Error(`Could not fetch provider 'gpt-3.5-turbo-test': ${providerError?.message}`);
      }
      const providerDbId = providerData.id;
      const providerApiIdentifier = providerData.api_identifier;
      const providerConfig = providerData.config as unknown as AiModelExtendedConfig;

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
      const initialResponse = await chatHandler(initialRequest, currentTestDeps);
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
      const rewindResponse = await chatHandler(rewindRequest, currentTestDeps);
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
      const testUserId = await initializeTestGroupEnvironment({ 
        userProfile: { first_name: 'System Prompt User' },
        initialWalletBalance: 3000 
      });
      const currentAuthToken = getTestUserAuthToken();

      const { data: providerData, error: providerError } = await supabaseAdminClient
        .from('ai_providers')
        .select('id, api_identifier, config')
        .eq('api_identifier', 'gpt-3.5-turbo-test')
        .single();
      if (providerError || !providerData) throw providerError;
      const providerDbId = providerData.id;
      const providerApiIdentifier = providerData.api_identifier;

      const systemPromptText = "You are a VERY helpful pirate assistant. ARR matey!";
      const testSystemPromptId = crypto.randomUUID();

      const { error: seedError } = await supabaseAdminClient.from('system_prompts').insert({
        id: testSystemPromptId,
        prompt_text: systemPromptText,
        name: `Pirate Test Prompt ${crypto.randomUUID().slice(0, 8)}`,
      });
      if (seedError) throw seedError;

      const { client: mockSystemPromptSupabaseClient } = createMockSupabaseClient(testUserId, {
        genericMockResults: {
          system_prompts: { 
            select: (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | null; count: number | null; status: number; statusText: string; }> => { 
              if (
                state.operation === 'select' && 
                state.filters.some(
                  (f: MockQueryBuilderState['filters'][0]) => 
                    f.column === 'id' &&
                    f.value === testSystemPromptId &&
                    f.type === 'eq'
                ) &&
                state.selectColumns?.includes('prompt_text') 
              ) {
                return Promise.resolve({
                  data: [{ prompt_text: systemPromptText }],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                });
              }
              return Promise.resolve({ 
                data: [], 
                error: new Error(`Mock for system_prompts.select not configured for query: ${JSON.stringify(state)}`), 
                count: 0, 
                status: 404, 
                statusText: 'Mock Not Found' 
              });
            }
          },
        },
      });

      const mockAiResponseContent = "Aye, Captain! The weather be fine!";
      const mockTokenUsage: TokenUsage = { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 };
      mockAiAdapter.setSimpleMockResponse(
        providerApiIdentifier,
        mockAiResponseContent,
        providerDbId,
        null,
        mockTokenUsage
      );
      
      const requestBody: ChatApiRequest = {
        providerId: providerDbId,
        promptId: testSystemPromptId,
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

        const response = await chatHandler(request, currentTestDeps);
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
      const testUserId = await initializeTestGroupEnvironment({
        userProfile: { first_name: 'Max Tokens Test User' },
        initialWalletBalance: 1000
      });
      const currentAuthToken = getTestUserAuthToken();

      const { data: providerData, error: providerError } = await supabaseAdminClient
        .from('ai_providers')
        .select('id, api_identifier')
        .eq('api_identifier', 'gpt-3.5-turbo-test')
        .single();

      if (providerError || !providerData) {
        throw new Error(`Could not fetch provider 'gpt-3.5-turbo-test': ${providerError?.message}`);
      }
      const actualProviderDbId = providerData.id;
      const providerApiIdentifier = providerData.api_identifier;

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
      
      const response = await chatHandler(request, currentTestDeps); 

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