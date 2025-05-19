import { ChatApiRequest } from '../_shared/types.ts';

// Import shared testing utilities, types, constants, and helpers
import {
    assert, assertEquals, assertExists, assertObjectMatch,
    assertSpyCalls, // Assuming this was used or will be
    type Spy, // Assuming this was used or will be
    spy,
    handler, // Changed from: mainChatHandler as handler
    createTestDeps,
    originalDenoEnvGet,
    envGetStub,
    mockSupaConfigBase, // Base supa config
    mockAdapterSuccessResponse, // Default adapter response
    ChatTestConstants, // Collection of common test IDs, etc.
    type ChatTestCase, // Shared TestCase interface
    type ChatMessageRow, // If needed directly by tests beyond what ChatTestCase provides
    type MockTokenWalletService, // For type hints if setting up wallet stubs
    type AdapterResponsePayload, // For type hints
    // IMockSupabaseClient might not be needed directly if createTestDeps handles it
    type MockSupabaseDataConfig,
    type ChatHandlerDeps,
    type ChatHandlerSuccessResponse,
    type MockAdapterTokenUsage,
    mockSupabaseUrl,
    mockUserDbRow,
    mockAssistantDbRow,
    testChatId,
    testProviderId,
    testPromptId,
    testUserId,
    testAiContent,
    mockAdapterTokenData,
    AiProviderAdapter,
    testApiIdentifier,
  } from "./index.test.ts";

// Added import for Json type
import type { Json } from "../types_db.ts";
  
// --- Test Suite for Chat Provider Functionality ---
Deno.test("Chat Provider Tests", async (t) => { // Added Deno.test wrapper
    // --- Individual Tests (Should now use refactored mockSupaConfig) ---
    try { 
        await t.step("POST request with existing chat history includes history in adapter call", async () => {
            // Specific config for this test
            let insertCallCount = 0;
            const existingHistory: ChatMessageRow[] = [
                { ...mockUserDbRow, id: 'hist-user-1', content: 'Previous user message', chat_id: testChatId },
                { ...mockAssistantDbRow, id: 'hist-asst-1', content: 'Previous assistant response', chat_id: testChatId }
            ];
            const userMessageForThisTest: ChatMessageRow = {
            ...mockUserDbRow,
            id: 'new-user-msg-existing-chat',
            content: 'Follow up question',
            chat_id: testChatId
            };
            const assistantMessageForThisTest: ChatMessageRow = {
            ...mockAssistantDbRow,
            id: 'new-asst-msg-existing-chat',
                content: testAiContent, // Ensure this is the mock AI content
            chat_id: testChatId
            };

            const perTestConfig: MockSupabaseDataConfig = {
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
                    'chat_messages': {
                        select: ((callArgs?: any) => {
                            if (callArgs && callArgs.filters && callArgs.filters.some((f: any) => f.column === 'chat_id' && f.value === testChatId)) {
                                return { data: existingHistory, error: null, status: 200, count: existingHistory.length };
                            }
                            return { data: [], error: null, status: 200, count: 0 }; 
                        }) as any,
                        insert: ((callArgs?: any) => {
                            insertCallCount++;
                            if (insertCallCount === 1) { 
                                return { data: [userMessageForThisTest], error: null, status: 201, count: 1 };
                            } else { 
                                return { data: [assistantMessageForThisTest], error: null, status: 201, count: 1 };
                            }
                        }) as any
                    }
                }
            };

            const { deps, mockSupabaseClient } = createTestDeps(perTestConfig, mockAdapterSuccessResponse);
            const body: ChatApiRequest = { 
                message: "Follow up question", 
                providerId: testProviderId, 
                promptId: testPromptId,
                chatId: testChatId 
            };
            const req = new Request(mockSupabaseUrl + '/chat', {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer test-token',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const responseJson = await response.json();

            assertExists(responseJson.userMessage, "User message should exist in response");
            assertEquals(responseJson.userMessage.id, 'new-user-msg-existing-chat');
            assertEquals(responseJson.userMessage.content, body.message);


            assertExists(responseJson.assistantMessage, "Assistant message should exist in response");
            assertEquals(responseJson.assistantMessage.id, 'new-asst-msg-existing-chat');
            assertEquals(responseJson.assistantMessage.content, testAiContent);
            assertObjectMatch(responseJson.assistantMessage.token_usage ?? {}, {
                prompt_tokens: mockAdapterTokenData.prompt_tokens,
                completion_tokens: mockAdapterTokenData.completion_tokens,
            });
            
            // Verify adapter call includes history
            const getAdapterSpy_History = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance_History = getAdapterSpy_History.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy_History = adapterInstance_History.sendMessage as Spy<any>;
            assertSpyCalls(sendMessageSpy_History, 1);
            const adapterArgs_History = sendMessageSpy_History.calls[0].args[0] as ChatApiRequest;
            
            // Expect System + History User + History Asst + Current User
            assertExists(adapterArgs_History.messages); // Ensure messages array exists
            assertEquals(adapterArgs_History.messages.length, 4, "Adapter payload should include system, 2 history messages, and current user message");
            assertEquals(adapterArgs_History.messages[0].role, 'system');
            assertEquals(adapterArgs_History.messages[1].role, 'user');
            assertEquals(adapterArgs_History.messages[1].content, existingHistory[0].content);
            assertEquals(adapterArgs_History.messages[2].role, 'assistant');
            assertEquals(adapterArgs_History.messages[2].content, existingHistory[1].content);
            assertEquals(adapterArgs_History.messages[3].role, 'user');
            assertEquals(adapterArgs_History.messages[3].content, body.message);
            assertEquals(adapterArgs_History.chatId, testChatId); // Verify chatId passed correctly
        });

         await t.step("POST request with invalid providerId (DB lookup fails) returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const invalidProviderSupaConfig: MockSupabaseDataConfig = {
                 ...mockSupaConfigBase, // Start with base config
                 genericMockResults: {
                     ...mockSupaConfigBase.genericMockResults, // Inherit other mocks
                     'ai_providers': { // Override only ai_providers
                         ...mockSupaConfigBase.genericMockResults?.['ai_providers'], 
                         select: { // Mock a failed select for the provider
                             data: null, 
                             error: new Error("Test: Provider not found"),
                             status: 400, // Or appropriate error status
                             count: 0
                         }
                     }
                 }
                 // REMOVED: selectProviderResult: { data: null, error: new Error("Test: Provider not found") }
             };
            const { deps } = createTestDeps(invalidProviderSupaConfig);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "Test: Provider not found");
        });

        await t.step("POST request with inactive provider returns 400", async () => {
            const inactiveProviderSupaConfig: MockSupabaseDataConfig = { 
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            'ai_providers': {
                        select: { // Mock select returning no data, no error
                            data: null, 
                            error: null, 
                            status: 200, // Status is OK, but no data found
                            count: 0
                        }
                    }
                }
            }; 
            const { deps } = createTestDeps(inactiveProviderSupaConfig); 
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "Query returned no rows (data was null after .single())"); 
        });


        await t.step("POST request with invalid promptId (DB lookup fails) returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const invalidPromptSupaConfig: MockSupabaseDataConfig = {
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            'system_prompts': {
                         ...mockSupaConfigBase.genericMockResults?.['system_prompts'],
                         select: { // Mock failed select for prompt
                            data: null, 
                            error: new Error("Test: Prompt not found"),
                            status: 400, 
                            count: 0
                         }
                     }
                 }
                 // REMOVED: selectPromptResult: { data: null, error: new Error("Test: Prompt not found") }
             };
            const { deps } = createTestDeps(invalidPromptSupaConfig);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "Test: Prompt not found");
        });

        await t.step("POST request with inactive prompt returns 400", async () => {
            const inactivePromptSupaConfig: MockSupabaseDataConfig = { 
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            'system_prompts': {
                         select: { // Mock select returning no data, no error
                            data: null, 
                            error: null,
                            status: 200, 
                            count: 0
                         }
                     }
                 }
            };
            const { deps } = createTestDeps(inactivePromptSupaConfig);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "Query returned no rows (data was null after .single())");
        });

        await t.step("POST request with promptId __none__ succeeds and sends no system message", async () => {
            let insertCallCount = 0;
            const userMessageForThisTest: ChatMessageRow = {
                ...mockUserDbRow,
                id: 'user-no-prompt-msg',
                content: "test no prompt",
                system_prompt_id: null, // Key difference
                chat_id: 'chat-no-prompt-test'
            };
            const assistantMessageForThisTest: ChatMessageRow = {
                ...mockAssistantDbRow,
                id: 'asst-no-prompt-msg',
                content: testAiContent,
                system_prompt_id: null, // Key difference
                chat_id: 'chat-no-prompt-test'
            };

            const tc = {
                body: { message: "test no prompt", providerId: testProviderId, promptId: "__none__" } as ChatApiRequest,
                expectedStatus: 200,
        mockSupaConfig: {
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            'system_prompts': {
              select: { data: null, error: new Error("Should not be called for __none__"), status: 404, count: 0 }
            },
            'chats': {
              insert: { data: [{ id: 'chat-no-prompt-test', system_prompt_id: null, title: "test no prompt", user_id: testUserId, organization_id: null }], error: null, status: 201, count: 1 },
              select: { data: [{ id: 'chat-no-prompt-test', system_prompt_id: null, title: "test no prompt", user_id: testUserId, organization_id: null }], error: null, status: 200, count: 1 }
            },
            'chat_messages': {
              insert: ((callArgs?: any) => {
                                insertCallCount++;
                                if (insertCallCount === 1) { 
                                    return { data: [userMessageForThisTest], error: null, status: 201, count: 1 };
                } else {
                                    return { data: [assistantMessageForThisTest], error: null, status: 201, count: 1 };
                }
              }) as any
                        }
                    }
                },
                expectedAdapterHistoryLength: 1, // Only the user message
            };

            const { deps } = createTestDeps(tc.mockSupaConfig as unknown as MockSupabaseDataConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
                body: JSON.stringify(tc.body),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, tc.expectedStatus);
            const responseData = await response.json();
            if (tc.expectedStatus === 200) {
                const chatResponse = responseData as ChatHandlerSuccessResponse; 

                assertExists(chatResponse.chatId, "Response data should include chatId for new chat");
                if (tc.mockSupaConfig?.genericMockResults?.chats?.insert && 
                    typeof tc.mockSupaConfig.genericMockResults.chats.insert === 'object' && 
                    'data' in tc.mockSupaConfig.genericMockResults.chats.insert && 
                    Array.isArray(tc.mockSupaConfig.genericMockResults.chats.insert.data) && 
                    tc.mockSupaConfig.genericMockResults.chats.insert.data.length > 0) {
                    assertEquals(chatResponse.chatId, tc.mockSupaConfig.genericMockResults.chats.insert.data[0].id);
                }

                assertExists(chatResponse.userMessage, "userMessage should exist in the response");
                assertExists(chatResponse.userMessage?.id, "userMessage.id should exist");
                if (tc.body && 'message' in tc.body && tc.body.message) {
                     assertEquals(chatResponse.userMessage?.content, tc.body.message, "userMessage.content should match the request message");
                }

                assertExists(chatResponse.assistantMessage, "assistantMessage should exist in the response");
                assertExists(chatResponse.assistantMessage.id, "assistantMessage.id should exist");
                
                // Assertions specific to this test case (promptId __none__), using mockAdapterSuccessResponse
                assertEquals(chatResponse.assistantMessage.content, mockAdapterSuccessResponse.content);
                if (mockAdapterSuccessResponse.token_usage) {
                    assertExists(chatResponse.assistantMessage.token_usage, "token_usage should exist");
                    assertObjectMatch(
                        chatResponse.assistantMessage.token_usage as Record<string, unknown>, 
                        mockAdapterSuccessResponse.token_usage as Record<string, unknown>
                    );
                }
            } 
        });

        await t.step("POST request with DB error creating chat returns 500", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const dbErrorSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfigBase, 
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'chats': {
                        ...mockSupaConfigBase.genericMockResults?.['chats'],
                        insert: { data: null, error: new Error("Test: Chat Insert Failed"), status: 500, count: 0 },
                        select: {
                           data: null, // No data if insert failed
                           error: new Error("Test: Chat Insert Failed"), // CORRECTED from "Test: Chat Insert Failed (simulated in select)"
                           status: 500, 
                           count: 0
                        }
                    }
                }
            };
            const { deps } = createTestDeps(dbErrorSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger db error", providerId: testProviderId, promptId: testPromptId }) 
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 500);
            // The error that surfaces from the .single() call on a failed insert().select() chain is the one from the 'select' mock part.
            assertEquals((await response.json()).error, "Test: Chat Insert Failed");
        });

        await t.step("POST request with missing provider string in DB returns 500", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const missingProviderStringSupaConfig: MockSupabaseDataConfig = {
                ...mockSupaConfigBase,
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'ai_providers': {
                        ...mockSupaConfigBase.genericMockResults?.['ai_providers'],
                        select: { 
                            // Simulate provider lookup returning data but missing the crucial 'provider' string
                            data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: null }], 
                            error: null, 
                            status: 200,
                            count: 1
                        }
                    }
                }
                // REMOVED: Old selectProviderResult structure
            };
            const { deps } = createTestDeps(missingProviderStringSupaConfig); 
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test missing provider string", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "AI provider configuration error on server [missing provider string]."); 
        });

        await t.step("POST request with unsupported provider returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const unsupportedProviderSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfigBase, 
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'ai_providers': {
                        ...mockSupaConfigBase.genericMockResults?.['ai_providers'],
                        select: { 
                            data: [{ 
                                id: 'provider-unsupported-id', 
                                api_identifier: 'unsupported-model', 
                                provider: 'unsupported-provider' // The crucial part
                            }], 
                            error: null,
                            status: 200,
                            count: 1
                        }
                    }
                }
                // REMOVED: Old selectProviderResult structure
            };
            // Need specific supa config, no adapter, env, override factory
            const mockGetAiProviderAdapter = spy((_provider: string) => null); // Factory returns null
            const { deps } = createTestDeps(
                unsupportedProviderSupaConfig, 
                undefined, // mockAdapterResponse - none for this test as adapter shouldn't be reached
                undefined, // tokenWalletConfig - no specific token wallet behavior needed
                undefined, // countTokensFnOverride - no specific count tokens behavior needed
                { getAiProviderAdapter: mockGetAiProviderAdapter } // depOverrides
            );
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test unsupported", providerId: 'provider-unsupported-id', promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "Unsupported AI provider: unsupported-provider");
        });

        await t.step("POST request succeeds with a different provider (Anthropic)", async () => {
            console.log("--- Running Anthropic Provider POST test ---");
            const testAnthropicProviderId = 'provider-anthropic-456';
            const testAnthropicApiIdentifier = 'claude-3-opus-20240229';
            const testAnthropicProviderString = 'anthropic';
            const testAnthropicUserMsgId = 'user-anthropic-temp-id';
            const testAnthropicAsstMsgId = 'msg-anthropic-ccc';
            const testAnthropicAiContent = "Anthropic AI Test Response";
            const testAnthropicChatId = "chat-anthropic-111";

            const mockAnthropicAdapterTokenData: MockAdapterTokenUsage = { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 };
            const mockAnthropicAdapterSuccessResponse: AdapterResponsePayload = {
                role: 'assistant',
                content: testAnthropicAiContent,
                ai_provider_id: testAnthropicProviderId,
                system_prompt_id: testPromptId, // Assuming same system prompt for simplicity
                token_usage: mockAnthropicAdapterTokenData as unknown as Json,
            };

            const userMessageAnthropic: ChatMessageRow = {
                ...mockUserDbRow,
                id: testAnthropicUserMsgId,
                chat_id: testAnthropicChatId,
                content: "Hello Anthropic!",
                ai_provider_id: testAnthropicProviderId,
            };
            const assistantMessageAnthropic: ChatMessageRow = {
                ...mockAssistantDbRow,
                id: testAnthropicAsstMsgId,
                chat_id: testAnthropicChatId,
                content: testAnthropicAiContent,
                ai_provider_id: testAnthropicProviderId,
                token_usage: { // Match specific token usage for Anthropic
                    prompt_tokens: mockAnthropicAdapterTokenData.prompt_tokens,
                    completion_tokens: mockAnthropicAdapterTokenData.completion_tokens,
                }
            };
            
            let insertCallCount = 0;

            const anthropicTestConfig: MockSupabaseDataConfig = {
                ...mockSupaConfigBase,
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'ai_providers': { 
                        select: { data: [{ id: testAnthropicProviderId, api_identifier: testAnthropicApiIdentifier, provider: testAnthropicProviderString }], error: null, status: 200, count: 1 }
                    },
                    'chats': {
                         insert: { data: [{ ...(mockSupaConfigBase.genericMockResults!['chats']!.insert as {data: any[]}).data[0], id: testAnthropicChatId, title: "Hello Anthropic!".substring(0,50) }], error: null, status: 201, count: 1 },
                         select: { data: [{ ...(mockSupaConfigBase.genericMockResults!['chats']!.select as {data: any[]}).data[0], id: testAnthropicChatId, title: "Hello Anthropic!".substring(0,50) }], error: null, status: 200, count: 1 }
                    },
                    'chat_messages': {
                        ...mockSupaConfigBase.genericMockResults!['chat_messages'],
                        insert: ((callArgs?: any) => {
                            insertCallCount++;
                            if (insertCallCount === 1) { 
                                return { data: [userMessageAnthropic], error: null, status: 201, count: 1 };
                            } else { 
                                return { data: [assistantMessageAnthropic], error: null, status: 201, count: 1 };
                            }
                        }) as any
                    }
                }
            };

            const { deps } = createTestDeps(anthropicTestConfig, mockAnthropicAdapterSuccessResponse);
            const body: ChatApiRequest = { message: "Hello Anthropic!", providerId: testAnthropicProviderId, promptId: testPromptId };
            const req = new Request(mockSupabaseUrl + '/chat', {
                method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          },
                body: JSON.stringify(body),
        });

        const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const chatResponse = await response.json() as ChatHandlerSuccessResponse; // Directly cast

            assertExists(chatResponse.chatId, "Response data should include chatId for Anthropic chat");
            assertEquals(chatResponse.chatId, testAnthropicChatId);
            assertExists(chatResponse.userMessage?.id);
            assertEquals(chatResponse.userMessage?.content, "Hello Anthropic!");
            assertExists(chatResponse.assistantMessage?.id);
            assertEquals(chatResponse.assistantMessage.content, testAnthropicAiContent);
            
            const tokenUsage = chatResponse.assistantMessage.token_usage;
            assert(typeof tokenUsage === 'object' && tokenUsage !== null, "Token usage should be an object if present");
            assertObjectMatch(tokenUsage as Record<string, unknown>, { 
                prompt_tokens: 20,
                completion_tokens: 30,
            });

            console.log("--- Anthropic Provider POST test passed ---");
        });

    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
    }
}); // End Test Suite