import {
    assert, 
    assertEquals, 
    assertExists, 
    assertObjectMatch, 
    spy, 
    stub, 
    type Spy, 
    assertSpyCalls,
    handler, 
    defaultDeps, 
    logger, 
    createTestDeps, 
    envGetStub, 
    originalDenoEnvGet,
    mockSupaConfigBase, 
    mockAdapterSuccessResponse,
    ChatTestConstants, 
    type ChatTestCase, 
    type ChatMessageRow, 
    mockSupabaseUrl,
    mockUserDbRow,
    mockAssistantDbRow,
    testChatId,
    testProviderId,
    testPromptId,
    testUserId,
    testAiContent,
    mockAdapterTokenData,
    testApiIdentifier,
    type CreateTestDepsResult,
    type MockAdapterTokenUsage
} from "./index.test.ts";
import type { Database, Json } from "../types_db.ts";
import type { 
    AdapterResponsePayload, 
    ChatApiRequest,
    ChatHandlerDeps, 
    ChatHandlerSuccessResponse, 
    AiProviderAdapter
} from '../_shared/types.ts';
import type { MockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import type { MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';

// --- Test Suite for Chat Provider Functionality ---
Deno.test("Chat Provider Tests", async (t) => { // Added Deno.test wrapper
    // --- Individual Tests (Should now use refactored mockSupaConfig) ---
    try { 
        await t.step("POST request with existing chat history includes history in adapter call", async () => {
            // Specific config for this test
            let insertCallCount = 0;
            const currentTestChatId = crypto.randomUUID(); // Use a valid UUID
            const existingHistory: ChatMessageRow[] = [
                { ...mockUserDbRow, id: 'hist-user-1', content: 'Previous user message', chat_id: currentTestChatId },
                { ...mockAssistantDbRow, id: 'hist-asst-1', content: 'Previous assistant response', chat_id: currentTestChatId }
            ];
            const userMessageForThisTest: ChatMessageRow = {
            ...mockUserDbRow,
            id: 'new-user-msg-existing-chat',
            content: 'Follow up question',
            chat_id: currentTestChatId
            };
            const assistantMessageForThisTest: ChatMessageRow = {
            ...mockAssistantDbRow,
            id: 'new-asst-msg-existing-chat',
                content: testAiContent, // Ensure this is the mock AI content
            chat_id: currentTestChatId
            };

            const perTestConfig: MockSupabaseDataConfig = {
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
                    'chat_messages': {
                        select: ((callArgs?: any) => {
                            if (callArgs && callArgs.filters && callArgs.filters.some((f: any) => f.column === 'chat_id' && f.value === currentTestChatId)) {
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
                chatId: currentTestChatId
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
            
            assertExists(adapterArgs_History.messages); // Ensure messages array exists
            // Expect System + History User + History Asst + Current User
            assertEquals(adapterArgs_History.messages.length, 4, "Adapter payload should include system, 2 history messages, and current user message");
            assertEquals(adapterArgs_History.messages[0].role, 'system');
            assertEquals(adapterArgs_History.messages[1].role, 'user');
            assertEquals(adapterArgs_History.messages[1].content, existingHistory[0].content);
            assertEquals(adapterArgs_History.messages[2].role, 'assistant');
            assertEquals(adapterArgs_History.messages[2].content, existingHistory[1].content);
            assertEquals(adapterArgs_History.messages[3].role, 'user');
            assertEquals(adapterArgs_History.messages[3].content, body.message);
            assertEquals(adapterArgs_History.chatId, currentTestChatId); // Verify chatId passed correctly
        });

         await t.step("POST request with invalid providerId (DB lookup fails) returns 404", async () => {
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
                             status: 404, // Or appropriate error status
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
            assertEquals(response.status, 404);
            assertEquals((await response.json()).error, `Provider with ID ${testProviderId} not found or error fetching details.`);
        });

        await t.step("POST request with inactive provider returns 400", async () => {
            const providerName = "Inactive Test Provider";
            const inactiveProviderSupaConfig: MockSupabaseDataConfig = { 
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            'ai_providers': {
                        select: { 
                            data: [{ 
                                id: testProviderId, 
                                name: providerName, 
                                api_identifier: testApiIdentifier, 
                                provider: ChatTestConstants.testProviderString,
                                is_active: false, // Set to inactive
                                config: { api_identifier: testApiIdentifier, tokenization_strategy: {type: "tiktoken", tiktoken_encoding_name: "cl100k_base"}} as Json
                            }], 
                            error: null, 
                            status: 200, 
                            count: 1
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
            assertEquals((await response.json()).error, `Provider '${providerName}' is currently inactive.`); 
        });


        await t.step("POST request with invalid promptId (DB lookup fails) returns 200 (proceeds with null prompt)", async () => {
            const invalidPromptSupaConfig: MockSupabaseDataConfig = {
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            // Ensure the default ai_provider mock from mockSupaConfigBase is used (which is active)
            'system_prompts': {
                         select: { 
                            data: null, 
                            error: new Error("DB Error: Test: Prompt not found"),
                            status: 500, // Simulate a DB error status
                            count: 0
                         }
                     }
                 }
             };
            const { deps, mockAdapterSpy } = createTestDeps(invalidPromptSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 200); // Expect 200 as handler proceeds with null prompt
            // Check that adapter was called and system message was null or absent in its arguments
            assertSpyCalls(mockAdapterSpy!, 1);
            const adapterCallArgs = mockAdapterSpy!.calls[0].args[0] as ChatApiRequest;
            const systemMessageInAdapterCall = adapterCallArgs.messages?.find(m => m.role === 'system');
            assert(systemMessageInAdapterCall === undefined || systemMessageInAdapterCall?.content === null || systemMessageInAdapterCall?.content === "", "System message to AI should be null or empty if prompt fetch failed");
        });

        await t.step("POST request with inactive prompt returns 200 (proceeds with null prompt)", async () => {
            const inactivePromptSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfigBase,
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'system_prompts': {
                        select: (state: any) => { // Ensure MockQueryBuilderState if possible, or use any if too complex
                            if (state.filters && state.filters.some((f: any) => f.column === 'id' && f.value === testPromptId)) {
                                if (state.selectColumns === 'prompt_text, is_active' || state.selectColumns === '*') {
                                    // LINTER FIX: Data should be an array for select, .single() will take the first element.
                                    return Promise.resolve({ 
                                        data: [{ id: testPromptId, prompt_text: "Inactive System Prompt", is_active: false }], 
                                        error: null, 
                                        status: 200, 
                                        count: 1 
                                    });
                                }
                            }
                            return Promise.resolve({ data: null, error: new Error("Mock for system_prompts not hit as expected or columns mismatch"), status: 404, count: 0 });
                        }
                    }
                }
            };
            const { deps, mockAdapterSpy } = createTestDeps(inactivePromptSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 200); // Expect 200 as handler proceeds with null prompt
            // Check that adapter was called and system message was null or absent
            assertSpyCalls(mockAdapterSpy!, 1);
            const adapterCallArgs = mockAdapterSpy!.calls[0].args[0] as ChatApiRequest;
            const systemMessageInAdapterCall = adapterCallArgs.messages?.find(m => m.role === 'system');
            assert(systemMessageInAdapterCall === undefined || systemMessageInAdapterCall?.content === null || systemMessageInAdapterCall?.content === "", "System message to AI should be null or empty if prompt was inactive");
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
              insert: spy((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                const insertData = state.insertData as Database['public']['Tables']['chats']['Insert'];
                assertExists(insertData.id, "Handler should provide an ID for chat insert");
                assertEquals(insertData.title, "test no prompt");
                assertEquals(insertData.system_prompt_id, null);
                return { data: [{ 
                    id: insertData.id, // Use the ID from the insertData
                    user_id: testUserId, 
                    organization_id: null, 
                    title: insertData.title, 
                    system_prompt_id: null,
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    metadata: null, 
                    ai_provider_id: null 
                }], error: null, count: 1, status: 201 };
              }) as any,
              select: ((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                const filterId = state.filters.find(f => f.column === 'id')?.value;
                if(filterId) {
                   return { data: [{ id: filterId, system_prompt_id: null, title: "test no prompt", user_id: testUserId, organization_id: null }], error: null, status: 200, count: 1 };
                }
                return { data: null, error: new Error("Chat select mock not finding ID"), status: 404, count: 0 };
              }) as any,
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
                const chatInsertSpy = tc.mockSupaConfig.genericMockResults.chats.insert as unknown as Spy<any, any[], any>; // Cast to Spy
                const insertedChatData = chatInsertSpy.calls[0].args[0].insertData as Database['public']['Tables']['chats']['Insert'];
                assertEquals(chatResponse.chatId, insertedChatData.id, "chatId in response should match the id provided during chat insert");

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
                            data: [{ 
                                id: testProviderId, 
                                name: "Provider With Null String", // Added name
                                api_identifier: testApiIdentifier, 
                                provider: null, // This is the critical part for the test
                                is_active: true, // Explicitly active to bypass inactive check for this test's purpose
                                config: { api_identifier: testApiIdentifier, tokenization_strategy: {type: "tiktoken", tiktoken_encoding_name: "cl100k_base"}} as Json
                            }], 
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
            assertEquals((await response.json()).error, "Configuration for provider ID '123e4567-e89b-12d3-a456-426614174000' has an invalid provider name."); 
        });

        await t.step("POST request with unsupported provider returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const unsupportedProviderId = crypto.randomUUID(); // Use a valid UUID
            const unsupportedProviderSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfigBase, 
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'ai_providers': {
                        ...mockSupaConfigBase.genericMockResults?.['ai_providers'],
                        select: async (state: any) => { // Function to check the passed ID, made async
                            if (state.filters && state.filters.some((f: any) => f.column === 'id' && f.value === unsupportedProviderId)) {
                                return Promise.resolve({ 
                                    data: [{ 
                                        id: unsupportedProviderId, 
                                        name: "Test Unsupported Provider", // Added name for completeness
                                        api_identifier: 'unsupported-model', 
                                        provider: 'unsupported-provider', // The crucial part for factory to return null via override
                                        is_active: true, // To pass the active check
                                        config: { api_identifier: 'unsupported-model', tokenization_strategy: {type: "tiktoken", tiktoken_encoding_name: "cl100k_base"}} as Json
                                    }], 
                                    error: null,
                                    status: 200,
                                    count: 1
                                });
                            }
                            // Fallback for other IDs, though not expected in this specific test call
                            return Promise.resolve({ data: null, error: new Error("Provider not found by test mock"), status: 404, count: 0 });
                        }
                    }
                }
            };
            
            // Store original Deno.env.get and stub it for this step
            const stepOriginalEnvGet = Deno.env.get;
            Deno.env.get = (key: string) => {
                if (key === 'UNSUPPORTED-PROVIDER_API_KEY') {
                    return 'dummy-api-key-for-unsupported';
                }
                // Fallback to the original Deno.env.get captured by the test suite
                return originalDenoEnvGet(key);
            };

            const mockGetAiProviderAdapterReturnsNull = spy(() => null); // Factory returns null

            const { deps } = createTestDeps(
                unsupportedProviderSupaConfig, 
                undefined, 
                undefined, 
                undefined, 
                { getAiProviderAdapter: mockGetAiProviderAdapterReturnsNull } // Override factory
            );
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                // FIX: Use the UUID for providerId
                body: JSON.stringify({ message: "test unsupported", providerId: unsupportedProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            // This error message now comes from the 3-stage check in index.ts when preliminaryAdapter is null
            // because we mocked getAiProviderAdapter to return null.
            assertEquals((await response.json()).error, `Unsupported or misconfigured AI provider: unsupported-model`);
            
            // Restore Deno.env.get for this step
            Deno.env.get = stepOriginalEnvGet;
        });

        await t.step("POST request with unsupported provider type returns 400", async () => {
            const unknownProviderId = crypto.randomUUID(); // Valid UUID
            const unsupportedProviderTypeSupaConfig: MockSupabaseDataConfig = {
                ...mockSupaConfigBase,
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'ai_providers': { 
                        select: { 
                            data: [{ 
                                id: unknownProviderId, 
                                name: "Unsupported Type Provider Test", 
                                api_identifier: "some-model-for-unsupported", 
                                provider: "unsupportable_provider_co", // This type is not supported by AiServiceFactory
                                is_active: true, 
                                config: { api_identifier: "some-model-for-unsupported", tokenization_strategy: {type: "tiktoken", tiktoken_encoding_name: "cl100k_base"}} as Json
                            }], 
                            error: null, 
                            status: 200, 
                            count: 1
                        }
                    }
                }
            };

            // Stub Deno.env.get for this step, falling back to the suite's originalDenoEnvGet
            const stepOriginalEnvGet = Deno.env.get;
            Deno.env.get = (key: string) => {
                if (key === 'UNSUPPORTABLE_PROVIDER_CO_API_KEY') {
                    return 'dummy-api-key-for-unsupportable';
                }
                // Use originalDenoEnvGet imported from index.test.ts for other keys
                // This ensures we are not affected by previous steps' stubs if they weren't cleaned up.
                return originalDenoEnvGet(key); 
            };

            // Pass undefined for adapterSendMessageResult if not needed
            const { deps } = createTestDeps(unsupportedProviderTypeSupaConfig, undefined); 
            
            const req = new Request('http://localhost/chat', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ 
                    message: "test unsupported type", 
                    providerId: unknownProviderId, // Use the valid UUID
                    promptId: testPromptId 
                })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            // The error message from AiServiceFactory includes provider and model identifier
            assertEquals((await response.json()).error, "Unsupported or misconfigured AI provider: some-model-for-unsupported");
            
            // Restore Deno.env.get for this step to avoid affecting subsequent steps before suite cleanup
            Deno.env.get = stepOriginalEnvGet;
        });

        await t.step("POST request succeeds with a different provider (Anthropic)", async () => {
            console.log("--- Running Anthropic Provider POST test ---");
            const anthropicProviderId = crypto.randomUUID(); // Valid UUID for this test
            const anthropicApiIdentifier = "claude-3-opus-20240229";
            const currentChatId = "chat-anthropic-test-123"; // Define a chat ID for this test
            let insertCallCount = 0;

            const userMessageForAnthropicTest: ChatMessageRow = {
                ...mockUserDbRow,
                id: 'user-anthropic-msg',
                chat_id: currentChatId,
                content: "Hello Anthropic!",
                ai_provider_id: anthropicProviderId,
                system_prompt_id: testPromptId,
            };
            const assistantMessageForAnthropicTest: ChatMessageRow = {
                ...mockAssistantDbRow,
                id: 'asst-anthropic-msg',
                chat_id: currentChatId,
                content: testAiContent, // This should be mockAdapterSuccessResponse.content ideally
                ai_provider_id: anthropicProviderId,
                system_prompt_id: testPromptId,
                token_usage: mockAdapterTokenData as unknown as Json, // Ensure token usage is part of the mock
            };

            const anthropicProviderConfig: MockSupabaseDataConfig = {
                ...mockSupaConfigBase,
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'ai_providers': { 
                        select: { 
                            data: [{
                                id: anthropicProviderId, 
                                name: "Test Anthropic Provider", 
                                api_identifier: anthropicApiIdentifier, 
                                provider: "anthropic", 
                                is_active: true, 
                                config: { 
                                    api_identifier: anthropicApiIdentifier, 
                                    tokenization_strategy: { 
                                        type: "tiktoken", 
                                        tiktoken_encoding_name: "cl100k_base",
                                        tiktoken_model_name_for_rules_fallback: anthropicApiIdentifier
                                    },
                                    input_token_cost_rate: 0.01,
                                    output_token_cost_rate: 0.03
                                } as Json
                            }], 
                            error: null, 
                            status: 200, 
                            count: 1
                        }
                    },
                    'chats': {
                        // Mock for creating a new chat if one doesn't exist
                        insert: { data: [{ id: currentChatId, user_id: testUserId, title: "Hello Anthropic!", system_prompt_id: testPromptId }], error: null, status: 201, count: 1 },
                        // Mock for selecting an existing chat (though new chat is likely for this test)
                        select: { data: [{ id: currentChatId, user_id: testUserId, title: "Hello Anthropic!", system_prompt_id: testPromptId }], error: null, status: 200, count: 1 }
                    },
                    'chat_messages': {
                        ...(mockSupaConfigBase.genericMockResults!['chat_messages'] || {}), // Spread any base select/other mocks
                        select: ((callArgs?: any) => { // For fetching history (likely empty for new chat)
                            if (callArgs && callArgs.filters && callArgs.filters.some((f: any) => f.column === 'chat_id' && f.value === currentChatId)) {
                                return { data: [], error: null, status: 200, count: 0 }; // No history for new chat
                            }
                            // Fallback to base mock if needed, or a generic empty result
                            const baseSelect = mockSupaConfigBase.genericMockResults!['chat_messages']?.select;
                            if (typeof baseSelect === 'function') return baseSelect(callArgs);
                            return { data: [], error: null, status: 200, count: 0 }; 
                        }) as any,
                        insert: ((callArgs?: any) => {
                            insertCallCount++;
                            if (insertCallCount === 1) { // User message insert
                                return { data: [userMessageForAnthropicTest], error: null, status: 201, count: 1 };
                            } else { // Assistant message insert
                                return { data: [assistantMessageForAnthropicTest], error: null, status: 201, count: 1 };
                            }
                        }) as any
                    },
                }
            };

            const { deps, mockAdapterSpy } = createTestDeps(anthropicProviderConfig, mockAdapterSuccessResponse); 

            const body: ChatApiRequest = {
                message: "Hello Anthropic!",
                providerId: anthropicProviderId, 
                promptId: testPromptId,
                // Ensure chatId is passed if a new chat is to be created and then messages added to it.
                // If the test implies creating a new chat, chatId should be initially undefined or handled by the 'chats' insert mock.
                // For simplicity, let's assume a new chat is created, so existingChatId is not in the initial request body.
                // The currentChatId will be established by the 'chats' insert mock.
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify(body)
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const responseJson = await response.json() as ChatHandlerSuccessResponse;
            assertExists(responseJson.assistantMessage);
            assertEquals(responseJson.assistantMessage.content, testAiContent); // From mockAdapterSuccessResponse
            
            // Verify the correct provider was used by the adapter spy if possible
            // (mockAdapterSuccessResponse doesn't carry provider info back, but AiServiceFactory uses it)
            assertSpyCalls(mockAdapterSpy!, 1);
            // Check that the getAiProviderAdapter was called and it used the anthropic provider details
            const getAdapterSpy = deps.getAiProviderAdapter as Spy<any>;
            assertSpyCalls(getAdapterSpy, 1);
            // The factory function inside getAiProviderAdapter receives (providerString, apiKey, modelApiIdentifier, logger)
            // We can check the providerString and modelApiIdentifier passed to it.
            // However, the default spy on getAiProviderAdapter in createTestDeps doesn't easily expose these internal factory args.
            // For now, successful response (200) implies the factory found/created an adapter.
        });

    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
    }
}); // End Test Suite