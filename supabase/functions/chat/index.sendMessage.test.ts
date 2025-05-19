import {
    assert, assertEquals, assertExists, assertObjectMatch,
    spy, type Spy, assertSpyCalls, stub, // Mokcing utils
    handler, // Changed from: mainChatHandler as handler
    createTestDeps, // Shared test dependency creation function
    originalDenoEnvGet, // Original Deno.env.get for restoration
    envGetStub, // Shared Deno.env.get stub
    mockSupaConfigBase, // Base supa config for convenience
    mockAdapterSuccessResponse, // Default AI adapter success response
    ChatTestConstants, // Collection of common test IDs, strings, etc.
    type ChatTestCase, // Interface for generic test cases, if applicable
    type ChatMessageRow, // DB row type for chat messages
    type MockTokenWalletService, // Type for the mock token wallet service
    type AdapterResponsePayload, // Type for AI adapter responses
    type TokenWalletServiceMethodImplementations, // Type for token wallet mock config
    type CountTokensForMessagesFn // Type for countTokensFn
} from "./index.test.ts"; // Path to the shared setup file

import type { Database, Json } from "../types_db.ts"; 
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    ChatHandlerDeps,
    IMockQueryBuilder
} from '../_shared/types.ts'; 
import { logger } from '../_shared/logger.ts';

import type { ChatHandlerSuccessResponse } from '../_shared/types.ts';

interface MockAdapterTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number; 
}

// --- Test Suite ---
Deno.test("Chat Function Tests (Adapter Refactor)", async (t) => {
    
    // Use ChatTestConstants from shared import
    const { 
        testProviderId, testApiIdentifier, testProviderString, testPromptId, 
        testUserId, testChatId, testUserMsgId, testAsstMsgId, testAiContent, 
        nowISO, mockAdapterTokenData: sharedAdapterTokenData 
    } = ChatTestConstants;

    const localMockAdapterSuccessResponse = mockAdapterSuccessResponse; // Alias if needed for clarity

    const mockAssistantDbRow: ChatMessageRow = {
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
            prompt_tokens: sharedAdapterTokenData.prompt_tokens,
            completion_tokens: sharedAdapterTokenData.completion_tokens,
            total_tokens: sharedAdapterTokenData.total_tokens,
        },
        is_active_in_thread: true,
    };
    const mockUserDbRow: ChatMessageRow = {
        id: testUserMsgId,
        chat_id: testChatId,
        role: 'user',
        content: "Hello there AI!", 
        created_at: nowISO, 
        updated_at: nowISO,
        user_id: testUserId,
        ai_provider_id: testProviderId, // This might differ from shared mockSupaConfigBase, adjust if needed
        system_prompt_id: testPromptId, // This might differ, adjust if needed
        token_usage: null,
        is_active_in_thread: true,
    };

    // Base config for Supabase mocks, can be overridden per test
    const currentTestSupaConfigBase = {
        ...mockSupaConfigBase, // Use shared base
        // Override genericMockResults if specific tests need different default DB responses
        genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            'system_prompts': {
                select: { data: [{ id: testPromptId, prompt_text: 'Test system prompt' }], error: null, status: 200, count: 1 }
            },
            'ai_providers': {
                select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString, default_model_id: "a-default-model" }], error: null, status: 200, count: 1 }
            },
            'chats': {
                insert: { data: [{ id: testChatId, system_prompt_id: testPromptId, title: "Test Chat Title".substring(0,50), user_id: testUserId, organization_id: null }], error: null, status: 201, count: 1 },
                select: { data: [{ id: testChatId, system_prompt_id: testPromptId, title: "Test Chat Title".substring(0,50), user_id: testUserId, organization_id: null }], error: null, status: 200, count: 1 }
            },
            'chat_messages': {
                // Default to returning these specific rows for inserts, can be overridden
                insert: { data: [mockUserDbRow, mockAssistantDbRow], error: null, status: 201, count: 2 }, 
                select: { data: [mockUserDbRow, mockAssistantDbRow], error: null, status: 200, count: 2 } 
            }
        }
    };

    // --- Test Definitions using shared createTestDeps ---
    try { 
        await t.step("POST request with adapter sendMessage error returns 502", async () => {
            const adapterError = new Error("Adapter Failed: Simulated API Error");
            // Use shared createTestDeps, providing supaConfig, adapter error, default tokenWalletConfig, default countTokensFn
            const { deps } = createTestDeps(
                currentTestSupaConfigBase, 
                adapterError, 
                {}, // Default token wallet mock
                () => 10 // Default count tokens mock
            );
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger adapter error", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 502);
            assertEquals((await response.json()).error, "Adapter Failed: Simulated API Error"); 
        });
        
        await t.step("POST request with missing message returns 400", async () => {
            const { deps } = createTestDeps(
                undefined, // No specific supa config needed for this validation error
                undefined, // No adapter interaction
                {}, 
                () => 10
            );
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ providerId: testProviderId, promptId: testPromptId }) 
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, 'Missing or invalid "message" in request body');
        });

        await t.step("POST request with history fetch error proceeds as new chat", async () => {
            // Define expected rows for *this specific test's inserts*
            const userMessageContentForThisTest = "initiate with bad history chatid";
            const newChatIdForThisTest = "new-chat-after-fail";

            const expectedUserMessageInsertResult: ChatMessageRow = {
                id: ChatTestConstants.testUserMsgId, // Can use a generic ID or a new one
                chat_id: newChatIdForThisTest,
                role: 'user',
                content: userMessageContentForThisTest,
                created_at: ChatTestConstants.nowISO,
                updated_at: ChatTestConstants.nowISO,
                user_id: ChatTestConstants.testUserId,
                ai_provider_id: ChatTestConstants.testProviderId,
                system_prompt_id: ChatTestConstants.testPromptId,
                token_usage: null,
                is_active_in_thread: true,
            };
            const expectedAssistantMessageInsertResult: ChatMessageRow = {
                id: ChatTestConstants.testAsstMsgId, // Can use a generic ID or a new one
                chat_id: newChatIdForThisTest,
                role: 'assistant',
                content: ChatTestConstants.testAiContent, // This is 'Mock AI response content from adapter'
                created_at: ChatTestConstants.nowISO,
                updated_at: ChatTestConstants.nowISO,
                user_id: null,
                ai_provider_id: ChatTestConstants.testProviderId,
                system_prompt_id: ChatTestConstants.testPromptId,
                token_usage: { 
                    prompt_tokens: ChatTestConstants.mockAdapterTokenData.prompt_tokens,
                    completion_tokens: ChatTestConstants.mockAdapterTokenData.completion_tokens,
                    total_tokens: ChatTestConstants.mockAdapterTokenData.total_tokens,
                },
                is_active_in_thread: true,
            };

            const historyErrorSupaConfig = { 
                ...currentTestSupaConfigBase, 
                genericMockResults: {
                    ...currentTestSupaConfigBase.genericMockResults,
                    'chat_messages': {
                        ...currentTestSupaConfigBase.genericMockResults!['chat_messages'],
                        select: { data: null, error: new Error("Simulated DB history fetch error"), status: 500, count: 0 },
                        // Provide the specific insert results for this test's flow
                        insert: (state: any) => {
                            // The actual data being inserted is in state.insertData
                            const payloadArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData];
                            const actualInsertedPayload = payloadArray[0] as Partial<ChatMessageRow> | undefined;
            
                            if (actualInsertedPayload?.role === 'assistant') {
                                return Promise.resolve({
                                    data: [expectedAssistantMessageInsertResult],
                                    error: null,
                                    status: 201,
                                    count: 1
                                });
                            } else if (actualInsertedPayload?.role === 'user') {
                                return Promise.resolve({
                                    data: [expectedUserMessageInsertResult],
                                    error: null,
                                    status: 201,
                                    count: 1
                                });
                            }
                            const err = new Error(`Unexpected payload in chat_messages insert mock for 'history error' test. Role: ${actualInsertedPayload?.role}, Content: ${actualInsertedPayload?.content}`);
                            logger.error(err.message, actualInsertedPayload);
                            return Promise.resolve({ data: null, error: err, status: 500, count: 0 });
                        }
                    },
                    'chats': {
                        ...currentTestSupaConfigBase.genericMockResults!['chats'],
                        insert: { data: [{ id: newChatIdForThisTest, user_id: testUserId, system_prompt_id: testPromptId, title: userMessageContentForThisTest.substring(0,50) }], error: null, status: 201, count: 1 }
                    }
                }
            };
            const { deps } = createTestDeps(
                historyErrorSupaConfig, 
                localMockAdapterSuccessResponse, // Adapter should succeed for the new chat part
                { getWalletForContext: () => Promise.resolve({ walletId: 'wallet-hist-err', balance: '1000', currency:'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), user_id: testUserId }) },
                () => 10
            );
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ 
                    message: "initiate with bad history chatid", 
                    providerId: testProviderId, 
                    promptId: testPromptId, 
                    chatId: "some-id-that-will-fail-lookup" 
                })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const responseData = await response.json();
            assertExists(responseData.chatId);
            assertEquals(responseData.chatId, newChatIdForThisTest); // Ensure new chat ID is used
            assertExists(responseData.assistantMessage);
            assertEquals(responseData.assistantMessage.content, ChatTestConstants.testAiContent);
        });

        await t.step("POST request with message insert error returns 500", async () => {
            const insertErrorSupaConfig = {
                ...currentTestSupaConfigBase,
                genericMockResults: {
                    ...currentTestSupaConfigBase.genericMockResults,
                    'chat_messages': {
                        ...currentTestSupaConfigBase.genericMockResults!['chat_messages'],
                        // This will affect both user and assistant message insert attempts if not distinguished
                        insert: { data: null, error: new Error("Test: Message insert failed"), status: 500, count: 0 }
                    }
                }
            };
            const { deps } = createTestDeps(
                insertErrorSupaConfig, 
                localMockAdapterSuccessResponse, // Adapter part succeeds
                { getWalletForContext: () => Promise.resolve({ walletId: 'wallet-ins-err', balance: '1000', currency:'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), user_id: testUserId }) },
                () => 10
            );
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ 
                    message: "trigger message insert error", 
                    providerId: testProviderId, 
                    promptId: testPromptId 
                })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "Test: Message insert failed"); 
        });

    } finally {
        // Restore Deno.env.get ONLY if the stub is still active and was ours
        if (envGetStub.restored === false) {
            envGetStub.restore();
        }
        // If using a global Supabase client mock that needs clearing:
        // mockSupabaseClient.clearAllTrackedBuilders?.();
    }
});