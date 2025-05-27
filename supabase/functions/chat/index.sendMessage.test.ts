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
    // MockTokenWalletService, // Removed
    // AdapterResponsePayload, // Removed
    // TokenWalletServiceMethodImplementations, // Removed
    // CountTokensForMessagesFn // Removed
} from "./index.test.ts"; // Path to the shared setup file

import type { Database, Json } from "../types_db.ts"; 
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    ChatHandlerDeps,
    IMockQueryBuilder,
    AdapterResponsePayload // Added
} from '../_shared/types.ts'; 
import type { 
    MockTokenWalletService, // Added
    TokenWalletServiceMethodImplementations // Added
} from '../_shared/services/tokenWalletService.mock.ts';
import { logger } from '../_shared/logger.ts';

import type { ChatHandlerSuccessResponse } from '../_shared/types.ts';
import { MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import { assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

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
        error_type: null,
        response_to_message_id: null
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
        error_type: null,
        response_to_message_id: null
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
                select: { 
                    data: [{ 
                        id: testProviderId, 
                        name: "Mock Provider for sendMessage tests",
                        api_identifier: testApiIdentifier, 
                        provider: testProviderString, 
                        is_active: true,
                        default_model_id: "a-default-model",
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
            assertEquals((await response.json()).error, 'Invalid request body: message: Required');
        });

        await t.step("POST request with history fetch error proceeds as new chat", async () => {
            // Define expected rows for *this specific test's inserts*
            const userMessageContentForThisTest = "initiate with bad history chatid";

            // Expected message results will use the chatId captured by the chats.insert spy
            const getExpectedUserMessageInsertResult = (chatId: string): ChatMessageRow => ({
                id: ChatTestConstants.testUserMsgId,
                chat_id: chatId, // Use dynamic chatId
                role: 'user',
                content: userMessageContentForThisTest,
                created_at: ChatTestConstants.nowISO,
                updated_at: ChatTestConstants.nowISO,
                user_id: ChatTestConstants.testUserId,
                ai_provider_id: ChatTestConstants.testProviderId,
                system_prompt_id: ChatTestConstants.testPromptId,
                token_usage: null,
                is_active_in_thread: true,
                error_type: null,
                response_to_message_id: null
            });
            const getExpectedAssistantMessageInsertResult = (chatId: string): ChatMessageRow => ({
                id: ChatTestConstants.testAsstMsgId,
                chat_id: chatId, // Use dynamic chatId
                role: 'assistant',
                content: ChatTestConstants.testAiContent,
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
                error_type: null,
                response_to_message_id: null
            });

            const historyErrorSupaConfig = { 
                ...currentTestSupaConfigBase, 
                genericMockResults: {
                    ...currentTestSupaConfigBase.genericMockResults,
                    'chat_messages': {
                        ...currentTestSupaConfigBase.genericMockResults!['chat_messages'],
                        select: { data: null, error: new Error("Simulated DB history fetch error"), status: 500, count: 0 },
                        insert: (state: any) => {
                            const payloadArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData];
                            const actualInsertedPayload = payloadArray[0] as Partial<ChatMessageRow> | undefined;
                            // The chat_id for these messages will come from the handler, which generates a new one
                            // due to the history fetch error. We can't predict it here directly for the expected result
                            // so the test assertions later will verify the AI response.
                            // The key is that the insert mock for chat_messages receives the correct chat_id from the handler.
                            const dynamicChatId = actualInsertedPayload?.chat_id;
                            if (!dynamicChatId) {
                                const err = new Error("chat_messages insert mock did not receive a chat_id in payload");
                                logger.error(err.message, { actualInsertedPayload });
                                return Promise.resolve({ data: null, error: err, status: 500, count: 0 });
                            }
            
                            if (actualInsertedPayload?.role === 'assistant') {
                                return Promise.resolve({
                                    data: [getExpectedAssistantMessageInsertResult(dynamicChatId)],
                                    error: null,
                                    status: 201,
                                    count: 1
                                });
                            } else if (actualInsertedPayload?.role === 'user') {
                                return Promise.resolve({
                                    data: [getExpectedUserMessageInsertResult(dynamicChatId)],
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
                        // MODIFIED: chats.insert is now a spy to capture the handler-generated ID
                        insert: spy((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                            const insertData = state.insertData as Database['public']['Tables']['chats']['Insert'];
                            assertExists(insertData.id, "Handler should provide an ID for new chat insert");
                            assertEquals(insertData.user_id, testUserId);
                            assertEquals(insertData.system_prompt_id, testPromptId); // Assuming testPromptId is used
                            assertEquals(insertData.title, userMessageContentForThisTest.substring(0,50));
                            return { 
                                data: [{ 
                                    id: insertData.id, // Return the ID that the handler provided
                                    user_id: insertData.user_id, 
                                    system_prompt_id: insertData.system_prompt_id, 
                                    title: insertData.title,
                                    organization_id: insertData.organization_id || null,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                    metadata: null,
                                    ai_provider_id: null // Or map from providerId if available
                                }], 
                                error: null, 
                                status: 201, 
                                count: 1 
                            };
                        })
                    }
                }
            };
            const { deps } = createTestDeps(
                historyErrorSupaConfig as unknown as MockSupabaseDataConfig, 
                localMockAdapterSuccessResponse,
                { getWalletForContext: () => Promise.resolve({ walletId: 'wallet-hist-err', balance: '1000', currency:'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), user_id: testUserId }) },
                () => 10
            );
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ 
                    message: userMessageContentForThisTest, 
                    providerId: testProviderId, 
                    promptId: testPromptId, 
                    chatId: ChatTestConstants.testChatId // This is the "existing" chat ID that will fail history fetch
                })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const responseData = await response.json() as ChatHandlerSuccessResponse;
            
            assertExists(responseData.chatId, "Response data should include chatId");
            assert(typeof responseData.chatId === 'string', "responseData.chatId should be a string");
            assertMatch(responseData.chatId, /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "responseData.chatId should be a UUID");

            // Verify that the chatId in the response matches the ID captured by the chats.insert spy
            const chatInsertSpy = historyErrorSupaConfig.genericMockResults.chats.insert as unknown as Spy<any, any[], any>;
            assertSpyCalls(chatInsertSpy, 1);
            const insertedChatData = chatInsertSpy.calls[0].args[0].insertData as Database['public']['Tables']['chats']['Insert'];
            assertExists(insertedChatData.id, "Chat insert spy should have captured an ID from the handler");
            assertEquals(responseData.chatId, insertedChatData.id, "chatId in response should match the id provided by the handler during chat insert");
            
            assertExists(responseData.assistantMessage, "Assistant message should exist in response");
            assertEquals(responseData.assistantMessage.content, ChatTestConstants.testAiContent);
            // Also ensure the assistant message's chat_id matches the new chat ID
            assertEquals(responseData.assistantMessage.chat_id, responseData.chatId, "Assistant message chat_id should match the new chatId");
            // And the user message's chat_id also matches
            assertExists(responseData.userMessage, "User message should exist in response");
            assertEquals(responseData.userMessage?.chat_id, responseData.chatId, "User message chat_id should match the new chatId");
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