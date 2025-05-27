import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts'; 
// import { ChatApiRequest } from '../_shared/types.ts'; // ChatApiRequest will be imported from index.test.ts or _shared/types.ts as decided
import type { TokenWalletTransaction } from '../_shared/types/tokenWallet.types.ts';
import type { Database, Json } from "../types_db.ts";

// Import shared testing utilities, types, constants, and helpers
import {
    assert, 
    assertEquals, 
    assertExists, 
    assertObjectMatch,
    spy,
    assertSpyCalls, // Assuming this was used or will be
    type Spy, // Assuming this was used or will be
    handler, // Use the exported handler
    createTestDeps,
    originalDenoEnvGet,
    envGetStub,
    mockSupaConfigBase, // Base supa config
    mockAdapterSuccessResponse, // Default adapter response
    ChatTestConstants, // Collection of common test IDs, etc.
    type ChatTestCase, // Shared TestCase interface
    type ChatMessageRow, // If needed directly by tests beyond what ChatTestCase provides
    // MockTokenWalletService, // Removed
    // AdapterResponsePayload, // Removed
    // TokenWalletServiceMethodImplementations // Removed
  } from "./index.test.ts";
import type { 
    ChatApiRequest, // Assuming this is the primary location now
    AdapterResponsePayload 
} from '../_shared/types.ts';
import type { 
    MockTokenWalletService, 
    TokenWalletServiceMethodImplementations 
} from '../_shared/services/tokenWalletService.mock.ts';
  

// --- Test Suite for Chat Functionality with selectedMessages ---
Deno.test("Chat Selected Messages Tests", async (t) => {
  try {
    // Env stub is managed globally by ./index.test.ts; ensure restoration in finally.

    await t.step("POST (New Chat) with selectedMessages and system prompt (DB) should use them", async () => {
      let stepClearSupabaseStubs: (() => void) | undefined;
      let stepClearTokenWalletStubs: (() => void) | undefined;
      try {
        console.log("--- Running New Chat with selectedMessages and DB system prompt test ---");
        
        const localMockSupaConfig = JSON.parse(JSON.stringify(mockSupaConfigBase)); 

        // Define expected rows for this specific test's inserts
        const testUserMessageContent = "New user question based on selection"; // from requestBody
        const expectedUserMessageInsertResult: ChatMessageRow = {
            ...ChatTestConstants.mockUserDbRow,
            id: ChatTestConstants.testUserMsgId + "-sm1", // unique id for this test
            chat_id: ChatTestConstants.testChatId, // Will be overridden by actual chatId from 'chats' insert
            content: testUserMessageContent,
            user_id: ChatTestConstants.testUserId,
            error_type: null,
            response_to_message_id: null
        };
        const expectedAssistantMessageInsertResult: ChatMessageRow = {
            ...ChatTestConstants.mockAssistantDbRow,
            id: ChatTestConstants.testAsstMsgId + "-sm1", // unique id for this test
            chat_id: ChatTestConstants.testChatId, // Will be overridden by actual chatId from 'chats' insert
            content: ChatTestConstants.testAiContent, // from mockAdapterSuccessResponse
            ai_provider_id: ChatTestConstants.testProviderId,
            system_prompt_id: ChatTestConstants.testPromptId,
            token_usage: ChatTestConstants.mockAdapterTokenData as unknown as Json,
            error_type: null,
            response_to_message_id: null
        };
        
        if (localMockSupaConfig.genericMockResults && localMockSupaConfig.genericMockResults.chat_messages) {
            localMockSupaConfig.genericMockResults.chat_messages.select = { // History fetch should not happen
                data: null, error: { message: 'DB history should not be fetched for new chat with selectedMessages' }, status: 500, count: 0
            };
            localMockSupaConfig.genericMockResults.chat_messages.insert = (state: any) => {
                const insertData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                if (insertData.role === 'assistant') {
                    return Promise.resolve({ data: [{...expectedAssistantMessageInsertResult, chat_id: insertData.chat_id || ChatTestConstants.testChatId }], error: null, status: 201, count: 1 });
                } else if (insertData.role === 'user') {
                    return Promise.resolve({ data: [{...expectedUserMessageInsertResult, chat_id: insertData.chat_id || ChatTestConstants.testChatId }], error: null, status: 201, count: 1 });
                }
                // Fallback for unexpected roles or if more detailed handling is needed
                return Promise.resolve({ data: [ChatTestConstants.mockUserDbRow], error: new Error("Mock insert issue: unexpected role"), status: 500, count: 0 });
            };
        }
        // Ensure 'chats' insert mock returns a consistent chatId that can be used by chat_messages
        if (localMockSupaConfig.genericMockResults && localMockSupaConfig.genericMockResults.chats) {
            localMockSupaConfig.genericMockResults.chats.insert = {
                data: [{ id: ChatTestConstants.testChatId, user_id: ChatTestConstants.testUserId, system_prompt_id: ChatTestConstants.testPromptId, title: testUserMessageContent.substring(0,50) }],
                error: null, status: 201, count: 1
            };
        }

        const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
          getWalletForContext: spy(() => Promise.resolve({ walletId: 'wallet-sm1', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), user_id: ChatTestConstants.testUserId, organization_id: null })),
          checkBalance: spy(() => Promise.resolve(true)),
          recordTransaction: spy(() => Promise.resolve({
              transactionId: 'txn-sm1',
              walletId: 'wallet-sm1',
              type: 'DEBIT_USAGE',
              amount: '10', 
              balanceAfterTxn: '990',
              recordedByUserId: ChatTestConstants.testUserId,
              relatedEntityId: ChatTestConstants.testChatId, 
              relatedEntityType: 'chat_flow',
              timestamp: new Date(),
          } as TokenWalletTransaction))
        };

        const { deps, mockTokenWalletService, mockSupabaseClient, mockAdapterSpy, clearSupabaseClientStubs, clearTokenWalletStubs } = createTestDeps(
          localMockSupaConfig, 
          mockAdapterSuccessResponse, 
          tokenWalletConfig 
        );
        stepClearSupabaseStubs = clearSupabaseClientStubs;
        stepClearTokenWalletStubs = clearTokenWalletStubs;

        assertExists(mockTokenWalletService, "mockTokenWalletService should be returned by createTestDeps");

            const selectedHistory: ChatApiRequest['selectedMessages'] = [
        { role: 'user', content: 'Previous user message from selection' },
        { role: 'assistant', content: 'Previous assistant response from selection' },
            ];
      
            const requestBody: ChatApiRequest = {
                message: "New user question based on selection",
        providerId: ChatTestConstants.testProviderId,
        messages: [{ role: 'user', content: "New user question based on selection" }],
        promptId: ChatTestConstants.testPromptId,
                selectedMessages: selectedHistory,
            };
      
            const req = new Request('http://localhost/chat', {
                method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer mock-user-token` },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const responseData = await response.json();
            // console.log("--- responseData for failing test ---"); // Removed
            // console.log(JSON.stringify(responseData, null, 2)); // Removed
      assertExists(responseData.assistantMessage?.content); // Changed from responseData.messages?.[0]?.content

      assertExists(mockAdapterSpy, "mockAdapterSpy should exist");
      assertSpyCalls(mockAdapterSpy, 1);
      const adapterCallArgs = mockAdapterSpy.calls[0].args[0] as ChatApiRequest;
      
      assertExists(adapterCallArgs.messages, "Adapter arguments should include messages");
      assertEquals(adapterCallArgs.messages?.length, 4);
      assertEquals(adapterCallArgs.messages?.[0].role, 'system');
      assertEquals(adapterCallArgs.messages?.[0].content, 'Test system prompt'); 
      assertEquals(adapterCallArgs.messages?.[1].role, 'user');
      assertEquals(adapterCallArgs.messages?.[1].content, selectedHistory[0].content);
      assertEquals(adapterCallArgs.messages?.[2].role, 'assistant');
      assertEquals(adapterCallArgs.messages?.[2].content, selectedHistory[1].content);
      assertEquals(adapterCallArgs.messages?.[3].role, 'user');
      assertExists(requestBody.messages);
      assertEquals(adapterCallArgs.messages?.[3].content, requestBody.messages[0].content);
      } finally {
        stepClearSupabaseStubs?.();
        stepClearTokenWalletStubs?.();
      }
    });

    await t.step("POST (New Chat) with selectedMessages and NO system_prompt_id (or inline system_prompt)", async () => {
      let stepClearSupabaseStubs: (() => void) | undefined;
      let stepClearTokenWalletStubs: (() => void) | undefined;
      try {
        console.log("--- Running New Chat with selectedMessages and no system prompt test ---");
        
        const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
          getWalletForContext: spy(() => Promise.resolve({ walletId: 'wallet-sm2', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), user_id: ChatTestConstants.testUserId, organization_id: null })),
          checkBalance: spy(() => Promise.resolve(true)),
          recordTransaction: spy(() => Promise.resolve({
              transactionId: 'txn-sm2',
              walletId: 'wallet-sm2',
              type: 'DEBIT_USAGE',
              amount: '10',
              balanceAfterTxn: '990',
              recordedByUserId: ChatTestConstants.testUserId,
              relatedEntityId: ChatTestConstants.testChatId,
              relatedEntityType: 'chat_flow',
              timestamp: new Date(),
          } as TokenWalletTransaction))
        };
        
        const { deps, mockTokenWalletService, mockAdapterSpy, clearSupabaseClientStubs, clearTokenWalletStubs } = createTestDeps(
          mockSupaConfigBase, 
          mockAdapterSuccessResponse,
          tokenWalletConfig 
        );
        stepClearSupabaseStubs = clearSupabaseClientStubs;
        stepClearTokenWalletStubs = clearTokenWalletStubs;

        assertExists(mockTokenWalletService, "mockTokenWalletService should be returned by createTestDeps");

            const selectedHistory: ChatApiRequest['selectedMessages'] = [
                { role: 'user', content: 'Only selected user message' },
                { role: 'assistant', content: 'Only selected assistant response' },
            ];
            const requestBody: ChatApiRequest = {
        message: "New question, no explicit system prompt",
        providerId: ChatTestConstants.testProviderId,
        promptId: '__none__',
        messages: [{ role: 'user', content: "New question, no explicit system prompt" }],
                selectedMessages: selectedHistory,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer mock-user-token` },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);

      assertExists(mockAdapterSpy, "mockAdapterSpy should exist");
      assertSpyCalls(mockAdapterSpy, 1);
      const adapterCallArgs = mockAdapterSpy.calls[0].args[0] as ChatApiRequest;
      assertExists(adapterCallArgs.messages, "Adapter arguments should include messages");
      assertEquals(adapterCallArgs.messages?.length, 3);
      assertEquals(adapterCallArgs.messages?.[0].role, 'user'); 
      assertEquals(adapterCallArgs.messages?.[0].content, selectedHistory[0].content);
      assertEquals(adapterCallArgs.messages?.[1].role, 'assistant');
      assertEquals(adapterCallArgs.messages?.[1].content, selectedHistory[1].content);
      assertEquals(adapterCallArgs.messages?.[2].role, 'user');
      assertExists(requestBody.messages);
      assertEquals(adapterCallArgs.messages?.[2].content, requestBody.messages[0].content);
      } finally {
        stepClearSupabaseStubs?.();
        stepClearTokenWalletStubs?.();
      }
    });

    await t.step("POST (Existing Chat) with selectedMessages should IGNORE DB history and use selected", async () => {
        let stepClearSupabaseStubs: (() => void) | undefined;
        let stepClearTokenWalletStubs: (() => void) | undefined;
        try {
          console.log("--- Running Existing Chat with selectedMessages test ---");
          
            const localMockSupaConfig = JSON.parse(JSON.stringify(mockSupaConfigBase));
        if (localMockSupaConfig.genericMockResults && localMockSupaConfig.genericMockResults.chat_messages) {
            localMockSupaConfig.genericMockResults.chat_messages.select = {
                data: [{ role: 'user', content: 'VERY OLD DB MESSAGE', id:'old-db-msg', chat_id: ChatTestConstants.testChatId, created_at: new Date().toISOString(), is_active_in_thread: true, user_id: ChatTestConstants.testUserId, ai_provider_id: null, system_prompt_id: null, token_usage: null }], 
                error: null, 
                status: 200, 
                count: 1 
            };
            localMockSupaConfig.genericMockResults.chat_messages.insert = (state: any) => {
                if (Array.isArray(state.insertData) && state.insertData.length > 0) {
                    const messageToInsert = state.insertData[0] as Partial<ChatMessageRow>;
                    if (messageToInsert.role === 'assistant') {
                        const assistantResponse = {
                            ...ChatTestConstants.mockAssistantDbRow,
                            id: crypto.randomUUID(),
                            content: messageToInsert.content || ChatTestConstants.mockAssistantDbRow.content,
                            chat_id: messageToInsert.chat_id || ChatTestConstants.mockAssistantDbRow.chat_id,
                            ai_provider_id: messageToInsert.ai_provider_id || ChatTestConstants.mockAssistantDbRow.ai_provider_id,
                            system_prompt_id: messageToInsert.system_prompt_id || ChatTestConstants.mockAssistantDbRow.system_prompt_id,
                            token_usage: messageToInsert.token_usage || ChatTestConstants.mockAssistantDbRow.token_usage,
                            response_to_message_id: messageToInsert.response_to_message_id || null,
                        };
                        return Promise.resolve({ data: [assistantResponse], error: null, status: 201, count: 1 });
                    } else if (messageToInsert.role === 'user') {
                        const userResponse = {
                            ...ChatTestConstants.mockUserDbRow,
                            id: crypto.randomUUID(),
                            content: messageToInsert.content || ChatTestConstants.mockUserDbRow.content,
                            chat_id: messageToInsert.chat_id || ChatTestConstants.mockUserDbRow.chat_id,
                            ai_provider_id: messageToInsert.ai_provider_id || ChatTestConstants.mockUserDbRow.ai_provider_id,
                            system_prompt_id: messageToInsert.system_prompt_id || ChatTestConstants.mockUserDbRow.system_prompt_id,
                        };
                        return Promise.resolve({ data: [userResponse], error: null, status: 201, count: 1 });
                    }
                }
                // Fallback
                const fallbackResponse = {
                    ...ChatTestConstants.mockUserDbRow,
                    id: crypto.randomUUID(),
                    chat_id: (state.insertData && state.insertData[0]?.chat_id) ? state.insertData[0].chat_id : ChatTestConstants.mockUserDbRow.chat_id,
                    content: (state.insertData && state.insertData[0]?.content) ? state.insertData[0].content : ChatTestConstants.mockUserDbRow.content,
                };
                return Promise.resolve({ data: [fallbackResponse], error: null, status: 201, count: 1 });
            };
        }

        const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
            getWalletForContext: spy(() => Promise.resolve({ walletId: 'wallet-sm3', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), user_id: ChatTestConstants.testUserId, organization_id: null })),
            checkBalance: spy(() => Promise.resolve(true)),
            recordTransaction: spy(() => Promise.resolve({
                transactionId: 'txn-sm3',
                walletId: 'wallet-sm3',
                type: 'DEBIT_USAGE',
                amount: '10',
                balanceAfterTxn: '990',
                recordedByUserId: ChatTestConstants.testUserId,
                relatedEntityId: ChatTestConstants.testChatId,
                relatedEntityType: 'chat_flow',
                timestamp: new Date(),
            } as TokenWalletTransaction))
        };

        const { deps, mockTokenWalletService, mockAdapterSpy, clearSupabaseClientStubs, clearTokenWalletStubs } = createTestDeps(
            localMockSupaConfig, 
            mockAdapterSuccessResponse,
            tokenWalletConfig 
        );
        stepClearSupabaseStubs = clearSupabaseClientStubs;
        stepClearTokenWalletStubs = clearTokenWalletStubs;

            const selectedHistory: ChatApiRequest['selectedMessages'] = [
            { role: 'user', content: 'Selected user message for existing chat' },
            { role: 'assistant', content: 'Selected assistant response for existing chat' },
            ];
            const requestBody: ChatApiRequest = {
            message: "New question for existing chat, using selection",
            providerId: ChatTestConstants.testProviderId,
            messages: [{ role: 'user', content: "New question for existing chat, using selection" }],
            chatId: ChatTestConstants.testChatId,
            promptId: ChatTestConstants.testPromptId,
                selectedMessages: selectedHistory,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer mock-user-token` },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);

        assertExists(mockAdapterSpy, "mockAdapterSpy should exist");
        assertSpyCalls(mockAdapterSpy, 1);
        const adapterCallArgs = mockAdapterSpy.calls[0].args[0] as ChatApiRequest;
        assertExists(adapterCallArgs.messages, "Adapter arguments should include messages");
        assertEquals(adapterCallArgs.messages?.length, 4);
        assertEquals(adapterCallArgs.messages?.[0].role, 'system');
        assertEquals(adapterCallArgs.messages?.[0].content, 'Test system prompt');
        assertEquals(adapterCallArgs.messages?.[1].role, 'user');
        assertEquals(adapterCallArgs.messages?.[1].content, selectedHistory[0].content);
        assertEquals(adapterCallArgs.messages?.[2].role, 'assistant');
        assertEquals(adapterCallArgs.messages?.[2].content, selectedHistory[1].content);
        assertEquals(adapterCallArgs.messages?.[3].role, 'user');
        assertExists(requestBody.messages);
        assertEquals(adapterCallArgs.messages?.[3].content, requestBody.messages[0].content);
        } finally {
          stepClearSupabaseStubs?.();
          stepClearTokenWalletStubs?.();
        }
    });

    // Add more tests specific to selectedMessages if needed:
    // - selectedMessages with an inline system_prompt
    // - selectedMessages that are empty or undefined (should fall back to DB history for existing chat)
    // - Error handling if selectedMessages are malformed (though type system should help)

    } finally {
        // Restore Deno.env.get if our stub is active
        if (envGetStub && !envGetStub.restored) {
            envGetStub.restore();
        }
    }
});