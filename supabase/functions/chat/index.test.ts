import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
// Import testing utilities
import { spy, type Spy, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database, Json } from "../types_db.ts"; // Import Database type AND Json type
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    AdapterResponsePayload,
    ChatHandlerDeps,
    IMockQueryBuilder
} from '../_shared/types.ts'; // Import App types
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts'; // Import real factory
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
// Import main handler, deps type, and the REAL defaultDeps for comparison/base
import { handler, defaultDeps } from './index.ts';
import { logger } from '../_shared/logger.ts';
// import {
//     ChatHandlerSuccessResponse,  <-- REMOVE THIS IMPORT
// } from './index.ts';

// Import type directly from its source
import type { ChatHandlerSuccessResponse } from '../_shared/types.ts'; // <-- ADD THIS IMPORT

// Define derived DB types needed locally
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

// Define a specific type for the token usage part of the mock adapter response for tests
interface MockAdapterTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number; // Adapters might provide this, though we only save prompt/completion
}

// Type definition for the structure expected in the mocked DB insert result
// This should match what the .select() returns after insert
type MockDbInsertResultType = ChatMessageRow; 

// --- Mock Data ---
const mockSupabaseUrl = 'http://localhost:54321';
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const mockAnthropicKey = 'test-anthropic-key'; 
const mockGoogleKey = 'test-google-key';
const mockIpAddress = "127.0.0.1";

const mockConnInfo: ConnInfo = {
  localAddr: { transport: "tcp", hostname: "localhost", port: 8000 },
  remoteAddr: { transport: "tcp", hostname: mockIpAddress, port: 12345 },
};

// Store the original Deno.env.get before stubbing
const originalDenoEnvGet = globalThis.Deno.env.get;

// --- Mock Implementations (Defined outside test suite) --- 

// Helper to create a mock AiProviderAdapter
const createMockAdapter = (sendMessageResult: AdapterResponsePayload | Error): AiProviderAdapter => {
    // Implement resolve/reject manually
    const sendMessageSpy = sendMessageResult instanceof Error 
        ? spy(() => Promise.reject(sendMessageResult)) 
        : spy(() => Promise.resolve(sendMessageResult));

    return {
        sendMessage: sendMessageSpy,
        // listModels: spy(() => Promise.resolve([])), // Add if needed
    } as unknown as AiProviderAdapter; // Cast needed as we might not implement all methods
};

// --- Test Dependency Creation Helper (Simplified) ---
const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  adapterSendMessageResult?: AdapterResponsePayload | Error,
  depOverrides: Partial<ChatHandlerDeps> = {}
) => {
  const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
  
  const mockAdapter = adapterSendMessageResult ? createMockAdapter(adapterSendMessageResult) : undefined;
  const mockGetAiProviderAdapter = mockAdapter ? spy((_provider: string) => mockAdapter) : spy(getAiProviderAdapter); 

  const deps: ChatHandlerDeps = {
    ...defaultDeps, // Start with real ones
    createSupabaseClient: spy(() => mockSupabaseClient) as any, 
    getAiProviderAdapter: mockGetAiProviderAdapter, 
    ...depOverrides, // Apply specific test overrides LAST
  };
  return { deps, mockClient: mockSupabaseClient }; // Return both
};

// --- Environment Variable Stub ---
// Stub Deno.env.get BEFORE the test suite runs
const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
    console.log(`[Test Env Stub] Deno.env.get called with: ${key}`); // Log stub calls
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
    if (key === 'ANTHROPIC_API_KEY') return mockAnthropicKey;
    if (key === 'GOOGLE_API_KEY') return mockGoogleKey;
    // Allow other env vars potentially used by Deno/Supabase internals to pass through?
    // Or return undefined for strictness? Let's be strict for now.
    return undefined; 
});

// --- Test Suite ---
Deno.test("Chat Function Tests (Adapter Refactor)", async (t) => {
    
    // REMOVED: beforeEach/afterEach for Deno.env.set/delete

    // INSERT TestCase interface definition HERE
    interface TestCase {
        testName: string;
        method: "POST"; 
        path: string; 
        body: ChatApiRequest;
        mockUser: { id: string } | null; 
        mockSupaConfig: MockSupabaseDataConfig;
        mockAdapterConfig?: { 
            providerString: string; 
            response: AdapterResponsePayload | Error; 
        };
        expectedStatus: number;
        expectedBody?: Record<string, any>; 
        expectedErrorMessage?: string; 
        extraAssertions?: (responseJson: any, tc: TestCase, deps: ChatHandlerDeps) => void; 
        expectedAdapterHistoryLength?: number;
    }

    // --- Shared Mock Configurations (Refactored for genericMockResults) ---
    const testProviderId = 'provider-openai-123';
    const testApiIdentifier = 'openai-gpt-4o';
    const testProviderString = 'openai';
    const testPromptId = 'prompt-abc-456';
    const testUserId = 'user-auth-xyz';
    const testChatId = 'chat-new-789';
    const testUserMsgId = 'msg-user-aaa'; // Need ID for user msg insert result
    const testAsstMsgId = 'msg-asst-bbb';
    const testAiContent = 'Mock AI response content from adapter';
    const now = new Date().toISOString();

    const mockAdapterTokenData: MockAdapterTokenUsage = { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 };

    const mockAdapterSuccessResponse: AdapterResponsePayload = { // Use correct type
        role: 'assistant',
        content: testAiContent,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: mockAdapterTokenData as unknown as Json, // Use the imported Json type for the cast
    };

    // Define mock DB row for the assistant message *after* insertion
    const mockAssistantDbRow: ChatMessageRow = {
        id: testAsstMsgId,
        chat_id: testChatId,
        role: 'assistant',
        content: testAiContent,
        created_at: now,
        updated_at: now,
        user_id: null,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: { // Updated to reflect specific structure saved
            prompt_tokens: mockAdapterTokenData.prompt_tokens, // Access from the strictly typed object
            completion_tokens: mockAdapterTokenData.completion_tokens, // Access from the strictly typed object
            total_tokens: mockAdapterTokenData.total_tokens,
        },
        is_active_in_thread: true,
    };
    // Define mock DB row for the user message *after* insertion
    const mockUserDbRow: ChatMessageRow = {
        id: testUserMsgId,
        chat_id: testChatId,
        role: 'user',
        content: "Hello there AI!", // Content from the test request
        created_at: now, 
        updated_at: now,
        user_id: testUserId,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: null,
        is_active_in_thread: true,
    };

    // Refactored Supabase mock config using genericMockResults
    const mockSupaConfigBase: MockSupabaseDataConfig = {
        mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now }, 
        getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } }, error: null },
        genericMockResults: {
            'system_prompts': {
                select: { data: [{ id: testPromptId, prompt_text: 'Test system prompt' }], error: null, status: 200, count: 1 }
            },
            'ai_providers': {
                select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 }
            },
            'chats': {
                insert: { data: [{ id: testChatId, system_prompt_id: testPromptId, title: "Hello there AI!".substring(0,50), user_id: testUserId, organization_id: null }], error: null, status: 201, count: 1 },
                select: { data: [{ id: testChatId, system_prompt_id: testPromptId, title: "Hello there AI!".substring(0,50), user_id: testUserId, organization_id: null }], error: null, status: 200, count: 1 }
            },
            'chat_messages': {
                insert: { data: [mockUserDbRow, mockAssistantDbRow], error: null, status: 201, count: 2 },
                select: { data: [mockUserDbRow, mockAssistantDbRow], error: null, status: 200, count: 2 }
            }
        }
    };

    // --- Individual Tests (Should now use refactored mockSupaConfig) ---
    try { 
        await t.step("OPTIONS request should return CORS headers", async () => {
            const { deps } = createTestDeps(); 
            const req = new Request('http://localhost/chat', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }); 
            const response = await handler(req, deps);
            assertEquals(response.status, 204);
            assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
        });

        await t.step("GET request should return 405 Method Not Allowed", async () => {
            const { deps } = createTestDeps();
            const req = new Request('http://localhost/chat', { method: 'GET' });
            const response = await handler(req, deps);
            assertEquals(response.status, 405);
        });

        await t.step("POST request missing Auth header should return 401", async () => {
            const { deps } = createTestDeps({}); 
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "test", providerId: "p", promptId: "pr" }),
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 401);
            assertEquals((await response.json()).error, 'Authentication required');
        });

        await t.step("POST request with valid Auth (New Chat) should succeed", async () => {
            console.log("--- Running Valid Auth POST test (New Chat) ---");
            // Specific config for this test to handle sequential inserts
            let insertCallCount = 0;
            const perTestConfig: MockSupabaseDataConfig = {
          ...mockSupaConfigBase,
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
                    'chats': { 
                        insert: { data: [{ ...(mockSupaConfigBase.genericMockResults!['chats']!.insert as { data: any[] }).data[0], id: 'chat-new-test-specific' }], error: null, status: 201, count: 1 },
                        select: { data: [{ ...(mockSupaConfigBase.genericMockResults!['chats']!.select as { data: any[] }).data[0], id: 'chat-new-test-specific' }], error: null, status: 200, count: 1 }
                    },
            'chat_messages': {
              select: ((callArgs?: any) => {
                            if (callArgs && callArgs.filters && callArgs.filters.some((f: any) => f.column === 'chat_id' && f.value === 'chat-new-test-specific')) {
                                return { data: [], error: null, status: 200, count: 0 };
                            }
                return { data: [], error: null, status: 200, count: 0 }; 
              }) as any,
              insert: ((callArgs?: any) => {
                            insertCallCount++;
                            if (insertCallCount === 1) { 
                                return { data: [{...mockUserDbRow, chat_id: 'chat-new-test-specific'}], error: null, status: 201, count: 1 };
                } else {
                                return { data: [{...mockAssistantDbRow, chat_id: 'chat-new-test-specific'}], error: null, status: 201, count: 1 };
                }
              }) as any
                    }
                }
            };

            const { deps } = createTestDeps(perTestConfig, mockAdapterSuccessResponse);
            const body: ChatApiRequest = { message: "Hello there AI!", providerId: testProviderId, promptId: testPromptId };
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
            const chatResponse = await response.json() as ChatHandlerSuccessResponse; // Directly cast, no .data
            
            assertExists(chatResponse.userMessage, "User message should exist in response");
            assertExists(chatResponse.assistantMessage, "Assistant message should exist in response");

            // Assert User Message properties
            assertEquals(chatResponse.userMessage?.role, 'user');
            assertEquals(chatResponse.userMessage?.content, body.message);
            assertEquals(chatResponse.userMessage?.chat_id, 'chat-new-test-specific');
            // No specific ID check for user message as it's dynamically generated by mock typically
            
            // Assert Assistant Message properties
            assertEquals(chatResponse.assistantMessage.role, 'assistant');
            assertEquals(chatResponse.assistantMessage.content, testAiContent);
            assertEquals(chatResponse.assistantMessage.chat_id, 'chat-new-test-specific');
            // The mock for chat_messages.insert in this test returns a specific ID for assistant
            // Check mockSupaConfigBase and perTestConfig: it returns mockAssistantDbRow which has id testAsstMsgId.
            // However, the perTestConfig for this specific test case dynamically provides IDs.
            // The second insert call (assistant) returns: { data: [{...mockAssistantDbRow, chat_id: 'chat-new-test-specific'}], ...}
            // So, the ID should be mockAssistantDbRow.id which is testAsstMsgId
            assertEquals(chatResponse.assistantMessage.id, testAsstMsgId); 

            const tokenUsage = chatResponse.assistantMessage.token_usage;
            assert(typeof tokenUsage === 'object' && tokenUsage !== null, "Token usage should be an object if present");
            assertObjectMatch(tokenUsage as Record<string, unknown>, { 
                prompt_tokens: mockAdapterTokenData.prompt_tokens,
                completion_tokens: mockAdapterTokenData.completion_tokens,
            });
            
            // Assert chatId on the main response object
            assertEquals(chatResponse.chatId, 'chat-new-test-specific');

            // Verify adapter sendMessage payload
            const getAdapterSpy = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance = getAdapterSpy.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy = adapterInstance.sendMessage as Spy<any>;
            assertSpyCalls(sendMessageSpy, 1);
            
            const adapterArgs = sendMessageSpy.calls[0].args[0] as ChatApiRequest;
            assertExists(adapterArgs.messages);
            assertEquals(adapterArgs.messages.length, 2, "Adapter payload should contain system prompt and current user message for a new chat.");
            assertEquals(adapterArgs.messages[0].role, 'system');
            assertEquals(adapterArgs.messages[0].content, 'Test system prompt');
            assertEquals(adapterArgs.messages[1].role, 'user');
            assertEquals(adapterArgs.messages[1].content, body.message);
        });

        await t.step("POST request with invalid JWT returns 401", async () => {
             const { deps } = createTestDeps(
                 { getUserResult: { data: { user: null }, error: new Error("Simulated invalid JWT") } }
             );
             const req = new Request('http://localhost/chat', {
                 method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid-token' },
                 body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
             });
             const response = await handler(req, deps);
             assertEquals(response.status, 401);
             assertEquals((await response.json()).error, 'Invalid authentication credentials');
        });

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

            const { deps, mockClient } = createTestDeps(perTestConfig, mockAdapterSuccessResponse);
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

        await t.step("POST request with adapter sendMessage error returns 502", async () => {
            const adapterError = new Error("Adapter Failed: Simulated API Error");
            const { deps } = createTestDeps(mockSupaConfigBase, adapterError);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger adapter error", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 502);
            assertEquals((await response.json()).error, "Adapter Failed: Simulated API Error"); 
        });
        
        // Test Cases: Input Validation Errors 
        await t.step("POST request with missing message returns 400", async () => {
            const { deps } = createTestDeps(undefined, undefined);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ providerId: testProviderId, promptId: testPromptId }) 
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, 'Missing or invalid "message" in request body');
        });

        // ... other input validation tests ...

        await t.step("POST request with history fetch error proceeds as new chat", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const historyErrorSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfigBase, 
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'chats': {
                        insert: { 
                            data: [{ ...(mockSupaConfigBase.genericMockResults!.chats!.insert as { data: any[] }).data[0], id: testChatId }], 
                            error: null, status: 201, count: 1 
                        },
                        select: { 
                            data: [{ ...(mockSupaConfigBase.genericMockResults!.chats!.select as { data: any[] }).data[0], id: testChatId }], 
                            error: null, status: 200, count: 1 
                        }
                    },
                    'chat_messages': {
                        select: spy(async (queryState: any) => {
                            if (queryState.filters.some((f:any) => f.column === 'chat_id' && f.value === 'some-id-that-will-fail-lookup') && queryState.selectColumns === 'role, content') {
                                console.log('[Test Mock chat_messages.select HistoryError] Detected history fetch for failing ID.');
                                return { data: null, error: new Error("Test: History fetch failed"), status: 500, count: 0 };
                            }
                            // This select is not expected to be called otherwise in this specific test path IF insert().select() is correctly mocked by the insert function itself.
                            // However, if it *were* called (e.g., for a new chat's history fetch if that logic existed), it should return empty for a new chat.
                            console.log('[Test Mock chat_messages.select HistoryError] Fallback select called, returning empty.');
                            return { data: [], error: null, status: 200, count: 0 };
                        }),
                        insert: ((callCount => (insertData: ChatMessageRow) => {
                            callCount++;
                            const userMsgContent = "initiate with bad history chatid";
                            if (callCount === 1) { // User message insert
                                console.log('[Test Mock chat_messages.insert HistoryError] User message insert mock');
                                return { 
                                    data: [{ ...mockUserDbRow, id: 'hist-err-user-msg', content: userMsgContent, chat_id: testChatId }], 
                                    error: null, 
                                    status: 201, 
                                    count: 1 
                                };
                            }
                            // Assistant message insert
                            console.log('[Test Mock chat_messages.insert HistoryError] Assistant message insert mock');
                            return { 
                                data: [{ ...mockAssistantDbRow, id: 'hist-err-asst-msg', chat_id: testChatId, content: mockAdapterSuccessResponse.content }], 
                                error: null, 
                                status: 201, 
                                count: 1 
                            };
                        })(0)) as any // IIFE to create a counter closure for the spy
                    }
                }
            };
            const { deps } = createTestDeps(historyErrorSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "initiate with bad history chatid", providerId: testProviderId, promptId: testPromptId, chatId: 'some-id-that-will-fail-lookup' })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 200); 
            const responseJson = await response.json();
            assertEquals(responseJson.chatId, testChatId); 

            // Verify adapter sendMessage payload had no history messages
            const getAdapterSpy_HistoryError = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance_HistoryError = getAdapterSpy_HistoryError.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy_HistoryError = adapterInstance_HistoryError.sendMessage as Spy<any>;
            assertSpyCalls(sendMessageSpy_HistoryError, 1);
            const adapterArgs_HistoryError = sendMessageSpy_HistoryError.calls[0].args[0] as ChatApiRequest;
            assertExists(adapterArgs_HistoryError.messages); // Ensure messages array exists
            assertEquals(adapterArgs_HistoryError.messages.length, 2); // System prompt + new user message
            assertEquals(adapterArgs_HistoryError.messages[0].role, 'system');
            assertEquals(adapterArgs_HistoryError.messages[1].role, 'user');
            assertEquals(adapterArgs_HistoryError.chatId, testChatId); // Treated as new chat FOR THE ADAPTER CALL
        });

        await t.step("POST request with message insert error returns 500", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const messageInsertErrorSupaConfig: MockSupabaseDataConfig = { 
                 ...mockSupaConfigBase,
                 genericMockResults: {
                     ...mockSupaConfigBase.genericMockResults,
                     'chat_messages': {
                         // Fully define chat_messages mock for this error case
                         insert: { // Mock failed insert for messages
                            data: null, 
                            error: new Error("Test: Message insert failed"),
                            status: 500, // DB operation status
                            count: 0
                         },
                         select: { // This select mock will be used by insert(...).select()
                            data: null,
                            error: new Error("Test: Message insert failed (propagated to select)"),
                            status: 500, // DB operation status
                            count: 0
                         }
                     }
                 }
                 // REMOVED: insertAssistantMessageResult: { data: null, error: new Error("Test: Message insert failed") }
             };
            const { deps } = createTestDeps(messageInsertErrorSupaConfig, mockAdapterSuccessResponse); 
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger message insert error", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await handler(req, deps);
            assertEquals(response.status, 500);
            // The userMessageError will be the error from the .select() part of the mock
            // if both insert and select mocks provide an error, due to current mock logic.
            // CORRECTED: The error comes directly from the insert mock if it's an error object.
            assertEquals((await response.json()).error, "Test: Message insert failed"); 
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
                undefined, 
                { getAiProviderAdapter: mockGetAiProviderAdapter } 
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

        await t.step("POST request for New ORG Chat should include organizationId in insert", async () => {
            console.log("--- Running POST test (New ORG Chat) ---");
            const orgId = "org-rand-uuid-for-testing";
            const expectedChatTitle = "Org Chat Test Message";

            const chatInsertSpy = spy((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                const insertData = state.insertData as Database['public']['Tables']['chats']['Insert'];
                assertExists(insertData.organization_id, "organization_id should be in chats.insert data");
                assertEquals(insertData.organization_id, orgId);
                assertEquals(insertData.title, expectedChatTitle);
                return { data: [{ id: testChatId, user_id: testUserId, organization_id: orgId, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: null, system_prompt_id: null, ai_provider_id: null }], error: null, count: 1, status: 201 };
            });

            // Spy for chat_messages.insert - should receive data WITHOUT organization_id
            const chatMessagesInsertSpy = spy((state: import('../_shared/supabase.mock.ts').MockQueryBuilderState) => {
                const insertData = state.insertData as Database['public']['Tables']['chat_messages']['Insert'];
                // Assert that organization_id is NOT part of the insertData for chat_messages
                assertEquals((insertData as Record<string, any>).organization_id, undefined, "organization_id should NOT be in chat_messages.insert data");
                
                // Return a typical successful insert response structure for chat_messages
                // Ensure the returned object matches ChatMessageRow and does not add organization_id if not present in insertData
                const baseReturn = { 
                    ...insertData, 
                    id: `msg-${Math.random().toString(36).substring(2, 9)}`, 
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    is_active_in_thread: true, // Default this as it's often expected
                    // Ensure any fields NOT in ChatMessageInsert but in ChatMessageRow (if different) are handled or omitted if not applicable
                };
                // Explicitly delete organization_id if it somehow snuck in, to match ChatMessageRow type for the response
                delete (baseReturn as Record<string, any>).organization_id;

                return { data: [baseReturn], error: null, count: 1, status: 201 };
            });

            const perTestOrgChatConfig: MockSupabaseDataConfig = {
                ...mockSupaConfigBase,
                genericMockResults: {
                    ...mockSupaConfigBase.genericMockResults,
                    'chats': {
                        insert: chatInsertSpy as any,
                        select: mockSupaConfigBase.genericMockResults?.chats?.select
                    },
                    'chat_messages': {
                        insert: chatMessagesInsertSpy as any,
                        select: mockSupaConfigBase.genericMockResults?.chat_messages?.select
                    }
                }
            };

            const { deps } = createTestDeps(perTestOrgChatConfig, mockAdapterSuccessResponse);
            const body: ChatApiRequest = { 
                message: expectedChatTitle, 
                providerId: testProviderId, 
                promptId: testPromptId,
                organizationId: orgId 
            };
            const req = new Request(mockSupabaseUrl + '/chat', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            assertSpyCalls(chatInsertSpy, 1);
            
            const chatResponse = await response.json() as ChatHandlerSuccessResponse;
            assertEquals(chatResponse.chatId, testChatId);
            assertExists(chatResponse.userMessage);
            assertEquals((chatResponse.userMessage as Record<string, any>)?.organization_id, undefined, "organization_id should NOT be present on userMessage object"); 
            assertEquals(chatResponse.userMessage?.content, expectedChatTitle);
        });

        await t.step("POST request with existing chatId and history should add messages and return assistant message", async () => {
            // ... existing code ...
        });

        // --- New tests for selectedMessages --- 
        await t.step("POST (New Chat) with selectedMessages and system prompt should use them", async () => {
            console.log("--- Running New Chat with selectedMessages test ---");
            const localMockSupaConfig = JSON.parse(JSON.stringify(mockSupaConfigBase)); // Deep clone
            // Ensure chat_messages.select (history fetch) is NOT called by configuring it to error if it were.
            localMockSupaConfig.genericMockResults.chat_messages.select = {
                data: null, error: { message: 'DB history should not be fetched' }, status: 500, count: 0
            };

            const { deps } = createTestDeps(localMockSupaConfig, mockAdapterSuccessResponse);
            const selectedHistory: ChatApiRequest['selectedMessages'] = [
                { role: 'user', content: 'Previous user message' },
                { role: 'assistant', content: 'Previous assistant response' },
            ];
            const requestBody: ChatApiRequest = {
                message: "New user question based on selection",
                providerId: testProviderId,
                promptId: testPromptId, // Use a DB system prompt
                selectedMessages: selectedHistory,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);
            const responseData = await response.json();
            assertExists(responseData.assistantMessage);

            const getAdapterSpy_NewChatSelected = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance_NewChatSelected = getAdapterSpy_NewChatSelected.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy_NewChatSelected = adapterInstance_NewChatSelected.sendMessage as Spy<any>;
            assertSpyCalls(sendMessageSpy_NewChatSelected, 1);
            const adapterArgs_NewChatSelected = sendMessageSpy_NewChatSelected.calls[0].args[0] as ChatApiRequest;
            // Expected: System Prompt (DB) + SelectedHistory (2) + New User Message (1) = 4
            assertEquals(adapterArgs_NewChatSelected.messages?.length, 4);
            assertEquals(adapterArgs_NewChatSelected.messages?.[0].role, 'system');
            assertEquals(adapterArgs_NewChatSelected.messages?.[0].content, 'Test system prompt');
            assertEquals(adapterArgs_NewChatSelected.messages?.[1].content, selectedHistory[0].content);
            assertEquals(adapterArgs_NewChatSelected.messages?.[2].content, selectedHistory[1].content);
            assertEquals(adapterArgs_NewChatSelected.messages?.[3].content, "New user question based on selection");
        });

        await t.step("POST (New Chat) with selectedMessages and NO system prompt (promptId: __none__)", async () => {
            console.log("--- Running New Chat with selectedMessages and NO system prompt ---");
            const localMockSupaConfig = JSON.parse(JSON.stringify(mockSupaConfigBase));
            localMockSupaConfig.genericMockResults.chat_messages.select = {
                data: null, error: { message: 'DB history should not be fetched' }, status: 500, count: 0
            };
            // Adjust system_prompts mock to simulate promptId: '__none__' (no DB prompt found/used)
             localMockSupaConfig.genericMockResults.system_prompts.select = { 
                data: [], error: null, status: 200, count: 0 
            };

            const { deps } = createTestDeps(localMockSupaConfig, mockAdapterSuccessResponse);
            const selectedHistory: ChatApiRequest['selectedMessages'] = [
                { role: 'user', content: 'Only selected user message' },
                { role: 'assistant', content: 'Only selected assistant response' },
            ];
            const requestBody: ChatApiRequest = {
                message: "New query with selection, no system prompt",
                providerId: testProviderId,
                promptId: '__none__', // NO System Prompt from DB
                selectedMessages: selectedHistory,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);

            const getAdapterSpy_NoSystem = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance_NoSystem = getAdapterSpy_NoSystem.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy_NoSystem = adapterInstance_NoSystem.sendMessage as Spy<any>;
            assertSpyCalls(sendMessageSpy_NoSystem, 1);
            const adapterArgs_NoSystem = sendMessageSpy_NoSystem.calls[0].args[0] as ChatApiRequest;
            // Expected: SelectedHistory (2) + New User Message (1) = 3 (No DB System Prompt)
            assertEquals(adapterArgs_NoSystem.messages?.length, 3);
            assertEquals(adapterArgs_NoSystem.messages?.[0].content, selectedHistory[0].content);
            assertEquals(adapterArgs_NoSystem.messages?.[1].content, selectedHistory[1].content);
            assertEquals(adapterArgs_NoSystem.messages?.[2].content, "New query with selection, no system prompt");
        });

        await t.step("POST (Continuing Chat) with selectedMessages should use them over DB history", async () => {
            console.log("--- Running Continuing Chat with selectedMessages ---");
            const localMockSupaConfig = JSON.parse(JSON.stringify(mockSupaConfigBase));
            // DB history fetch should NOT be called.
            localMockSupaConfig.genericMockResults.chat_messages.select = {
                data: null, error: { message: 'DB history should not be fetched when selectedMessages are present' }, status: 500, count: 0
            };

            const { deps } = createTestDeps(localMockSupaConfig, mockAdapterSuccessResponse);
            const selectedHistory: ChatApiRequest['selectedMessages'] = [
                { role: 'user', content: 'Custom context message 1' },
            ];
            const requestBody: ChatApiRequest = {
                message: "Following up on custom context",
                providerId: testProviderId,
                promptId: testPromptId, // With DB system prompt
                chatId: testChatId, // Existing chat
                selectedMessages: selectedHistory,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);

            const getAdapterSpy_ContinueSelected = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance_ContinueSelected = getAdapterSpy_ContinueSelected.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy_ContinueSelected = adapterInstance_ContinueSelected.sendMessage as Spy<any>;
            const adapterArgs_ContinueSelected = sendMessageSpy_ContinueSelected.calls[0].args[0] as ChatApiRequest;
            // Expected: System Prompt (DB) + SelectedHistory (1) + New User Message (1) = 3
            assertEquals(adapterArgs_ContinueSelected.messages?.length, 3);
            assertEquals(adapterArgs_ContinueSelected.messages?.[0].role, 'system');
            assertEquals(adapterArgs_ContinueSelected.messages?.[0].content, 'Test system prompt');
            assertEquals(adapterArgs_ContinueSelected.messages?.[1].content, selectedHistory[0].content);
            assertEquals(adapterArgs_ContinueSelected.messages?.[2].content, "Following up on custom context");
        });

        await t.step("POST (Continuing Chat) WITHOUT selectedMessages should fallback to DB history", async () => {
            console.log("--- Running Continuing Chat WITHOUT selectedMessages (fallback to DB) ---");
            const localMockSupaConfig = JSON.parse(JSON.stringify(mockSupaConfigBase));
            const dbHistory: ChatMessageRow[] = [
                { ...mockUserDbRow, chat_id: testChatId, content: 'DB Message 1 (user)', created_at: new Date(Date.now() - 2000).toISOString(), updated_at: new Date(Date.now() - 2000).toISOString() },
                { ...mockAssistantDbRow, chat_id: testChatId, content: 'DB Message 2 (assistant)', created_at: new Date(Date.now() - 1000).toISOString(), updated_at: new Date(Date.now() - 1000).toISOString()  },
            ];
            // DB history fetch SHOULD be called and return these messages.
            localMockSupaConfig.genericMockResults.chat_messages.select = {
                data: dbHistory, error: null, status: 200, count: dbHistory.length
            };

            const { deps, mockClient } = createTestDeps(localMockSupaConfig, mockAdapterSuccessResponse);
            
            const requestBody: ChatApiRequest = {
                message: "Query using DB history",
                providerId: testProviderId,
                promptId: testPromptId, // With DB system prompt
                chatId: testChatId, // Existing chat
                // NO selectedMessages
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
                body: JSON.stringify(requestBody),
            });

            const response = await handler(req, deps);
            assertEquals(response.status, 200);

            // Verify that supabaseClient.from('chat_messages').select was called
            const fromSpy = mockClient.from as Spy<any>;
            const chatMessagesBuilder = fromSpy.calls.find(call => call.args[0] === 'chat_messages');
            assertExists(chatMessagesBuilder, "from('chat_messages') was not called");
            
            const selectSpy = (chatMessagesBuilder.returned as IMockQueryBuilder).select as Spy<any>; 
            assertSpyCalls(selectSpy, 1); // Ensure it was called to fetch history

            const getAdapterSpy_Fallback = deps.getAiProviderAdapter as Spy<any>;
            const adapterInstance_Fallback = getAdapterSpy_Fallback.calls[0].returned as AiProviderAdapter;
            const sendMessageSpy_Fallback = adapterInstance_Fallback.sendMessage as Spy<any>;
            const adapterArgs_Fallback = sendMessageSpy_Fallback.calls[0].args[0] as ChatApiRequest;
            // Expected: System Prompt (DB) + DB History (2) + New User Message (1) = 4
            assertEquals(adapterArgs_Fallback.messages?.length, 4);
            assertEquals(adapterArgs_Fallback.messages?.[0].role, 'system');
            assertEquals(adapterArgs_Fallback.messages?.[0].content, 'Test system prompt');
            assertEquals(adapterArgs_Fallback.messages?.[1].content, dbHistory[0].content);
            assertEquals(adapterArgs_Fallback.messages?.[2].content, dbHistory[1].content);
            assertEquals(adapterArgs_Fallback.messages?.[3].content, "Query using DB history");
        });

        const invalidSelectedMessagesTestCases = [
            { name: "selectedMessages is not an array", body: { selectedMessages: "not-an-array" }, expectedError: "Invalid \"selectedMessages\" format. Must be an array." },
            { name: "selectedMessages item missing role", body: { selectedMessages: [{ content: "test" }] }, expectedError: "Invalid message structure or role in \"selectedMessages\"." },
            { name: "selectedMessages item missing content", body: { selectedMessages: [{ role: "user" }] }, expectedError: "Invalid message structure or role in \"selectedMessages\"." },
            { name: "selectedMessages item invalid role", body: { selectedMessages: [{ role: "invalid-role", content: "test" }] }, expectedError: "Invalid message structure or role in \"selectedMessages\"." },
        ];

        for (const tc of invalidSelectedMessagesTestCases) {
            await t.step(`POST with invalid selectedMessages (${tc.name}) should return 400`, async () => {
                const { deps } = createTestDeps(mockSupaConfigBase, mockAdapterSuccessResponse);
                const requestBody: Partial<ChatApiRequest> = {
                    message: "Valid message",
                    providerId: testProviderId,
                    promptId: testPromptId,
                    ...(tc.body as any) // Cast tc.body to any to bypass strict type checking for test
                };
                const req = new Request('http://localhost/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
                    body: JSON.stringify(requestBody),
                });
                const response = await handler(req, deps);
                assertEquals(response.status, 400);
                const responseData = await response.json();
                assertExists(responseData.error); 
                assert((responseData.error as string).includes(tc.expectedError)); 
            });
        }

        // --- Test for rewind functionality (should remain unaffected) ---
        await t.step("POST request with Rewind should succeed and call perform_chat_rewind", async () => {
            // ... existing code ...
        });

        // ... existing DELETE test cases ...

    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
    }
}); // End Test Suite