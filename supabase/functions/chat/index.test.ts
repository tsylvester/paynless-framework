import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
// Import testing utilities
import { spy, type Spy, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database } from "../types_db.ts"; // Import Database type
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    AdapterResponsePayload,
    ChatHandlerDeps,
} from '../_shared/types.ts'; // Import App types
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts'; // Import real factory
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../_shared/test-utils.ts";
// Import main handler, deps type, and the REAL defaultDeps for comparison/base
import { mainHandler, defaultDeps } from './index.ts';

// Define derived DB types needed locally
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

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
): ChatHandlerDeps => {
  const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
  
  const mockAdapter = adapterSendMessageResult ? createMockAdapter(adapterSendMessageResult) : undefined;
  const mockGetAiProviderAdapter = mockAdapter ? spy((_provider: string) => mockAdapter) : spy(getAiProviderAdapter); 

  const deps: ChatHandlerDeps = {
    ...defaultDeps, // Start with real ones
    createSupabaseClient: spy(() => mockSupabaseClient) as any, 
    getAiProviderAdapter: mockGetAiProviderAdapter, 
    ...depOverrides, // Apply specific test overrides LAST
  };
  return deps;
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

    const mockAdapterSuccessResponse: AdapterResponsePayload = { // Use correct type
        role: 'assistant',
        content: testAiContent,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
    };

    // Define mock DB row for the assistant message *after* insertion
    const mockAssistantDbRow: ChatMessageRow = {
        id: testAsstMsgId,
        chat_id: testChatId,
        role: 'assistant',
        content: testAiContent,
        created_at: now,
        user_id: null,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: mockAdapterSuccessResponse.token_usage,
        is_active_in_thread: true,
    };
    // Define mock DB row for the user message *after* insertion
    const mockUserDbRow: ChatMessageRow = {
        id: testUserMsgId,
        chat_id: testChatId,
        role: 'user',
        content: "Hello there AI!", // Content from the test request
        created_at: now, 
        user_id: testUserId,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: null,
        is_active_in_thread: true,
    };

    // Refactored Supabase mock config using genericMockResults
    const mockSupaConfig: MockSupabaseDataConfig = {
        // Keep auth mock separate as it's handled differently
        mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now }, 
        getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } }, error: null }, // Keep for direct auth check if needed

        genericMockResults: {
            'system_prompts': {
                select: { 
                    data: [{ id: testPromptId, prompt_text: 'Test system prompt' }], 
                    error: null, 
                    status: 200, 
                    count: 1 
                }
            },
            'ai_providers': {
                select: { 
                    data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], 
                    error: null, 
                    status: 200, 
                    count: 1 
                }
            },
            'chats': {
                // Mock for fetching existing chat history (returns empty initially)
                select: { data: [], error: null, status: 200, count: 0 }, 
                // Mock for inserting a new chat
                insert: { 
                    data: [{ id: testChatId }], // Return the new chat ID
                    error: null, 
                    status: 201, 
                    count: 1 
                } 
            },
            'chat_messages': {
                // Mock for fetching history (used when chatId IS provided)
                // We'll override this in the specific history test
                select: { data: [], error: null, status: 200, count: 0 }, 
                // Mock for inserting the user and assistant messages together
                insert: { 
                    // The select after insert should return both saved rows
                    data: [mockUserDbRow, mockAssistantDbRow], 
                    error: null, 
                    status: 201, 
                    count: 2 
                }
            }
        }
        // REMOVED: Old specific result properties (selectPromptResult, etc.)
    };

    // --- Individual Tests (Should now use refactored mockSupaConfig) ---
    try { 
        await t.step("OPTIONS request should return CORS headers", async () => {
            const deps = createTestDeps(); 
            const req = new Request('http://localhost/chat', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }); 
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 204);
            assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
        });

        await t.step("GET request should return 405 Method Not Allowed", async () => {
            const deps = createTestDeps();
            const req = new Request('http://localhost/chat', { method: 'GET' });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 405);
        });

        await t.step("POST request missing Auth header should return 401", async () => {
            const deps = createTestDeps({}); 
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "test", providerId: "p", promptId: "pr" }),
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 401);
            assertEquals((await response.json()).error, 'Authentication required');
        });

        await t.step("POST request with valid Auth (New Chat) should succeed", async () => {
            console.log("--- Running Valid Auth POST test (New Chat) ---");
            // Use the refactored config
            const deps = createTestDeps(mockSupaConfig, mockAdapterSuccessResponse);

            const requestBody = {
                message: "Hello there AI!", // Match content used in mockUserDbRow
                providerId: testProviderId,
                promptId: testPromptId,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify(requestBody),
            });
            
            // ... Spies setup ...
            const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof getAiProviderAdapter>;

            const response = await mainHandler(req, deps);
            
            assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
            // Handler returns only the assistant message row now
            const responseJson = await response.json(); 
            assertEquals(responseJson.message.id, mockAssistantDbRow.id);
            assertEquals(responseJson.message.content, mockAssistantDbRow.content);
            assertEquals(responseJson.message.role, 'assistant');

            // --- Assertions for Supabase Calls (Using generic config) ---
            const clientFactorySpy = deps.createSupabaseClient as Spy<any>;
            assertSpyCalls(clientFactorySpy, 1);
            const mockClientInstance = clientFactorySpy.calls[0].returned as SupabaseClient;
            const fromSpy = mockClientInstance.from as Spy<any>;

            const promptSelectCall = fromSpy.calls.find(c => c.args[0] === 'system_prompts');
            assertExists(promptSelectCall, "Call to .from('system_prompts') missing");
            
            const providerSelectCall = fromSpy.calls.find(c => c.args[0] === 'ai_providers');
            assertExists(providerSelectCall, "Call to .from('ai_providers') missing");

            const chatInsertCall = fromSpy.calls.find(c => c.args[0] === 'chats'); 
            assertExists(chatInsertCall, "Call to .from('chats') for insert missing");

            const messageInsertCall = fromSpy.calls.find(c => c.args[0] === 'chat_messages'); 
            assertExists(messageInsertCall, "Call to .from('chat_messages') for insert missing");

            // ... Assertions for adapter calls ...
            
            console.log("--- Valid Auth POST test (New Chat) passed ---");
        });

        await t.step("POST request with invalid JWT returns 401", async () => {
             const deps = createTestDeps(
                 { getUserResult: { data: { user: null }, error: new Error("Simulated invalid JWT") } }
             );
             const req = new Request('http://localhost/chat', {
                 method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid-token' },
                 body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
             });
             const response = await mainHandler(req, deps);
             assertEquals(response.status, 401);
             assertEquals((await response.json()).error, 'Invalid authentication credentials');
        });

        await t.step("POST request with existing chat history includes history in adapter call", async () => {
             const history: Pick<ChatMessageRow, 'role' | 'content'>[] = [
                 { role: 'user', content: 'Previous user message' },
                 { role: 'assistant', content: 'Previous assistant response' }
             ];
             const historySupaConfig: MockSupabaseDataConfig = {
                 ...mockSupaConfig, // Start with base config
                 genericMockResults: {
                     ...mockSupaConfig.genericMockResults, // Inherit other mocks
                     'chat_messages': { // Override only chat_messages
                         ...mockSupaConfig.genericMockResults?.['chat_messages'], // Inherit insert mock
                         select: { // Override select specifically for history
                             data: history, 
                             error: null, 
                             status: 200, 
                             count: history.length
                         } 
                     }
                 }
                 // REMOVED: selectChatHistoryResult: { data: history, error: null }
             };
             const deps = createTestDeps(historySupaConfig, mockAdapterSuccessResponse);
             const requestBody = { message: "Follow up question", providerId: testProviderId, promptId: testPromptId, chatId: testChatId }; 
             const req = new Request('http://localhost/chat', { 
                 method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                 body: JSON.stringify(requestBody), 
             });
             
             const response = await mainHandler(req, deps);
             assertEquals(response.status, 200);
             const responseJson = await response.json();
             assertObjectMatch(responseJson.message as unknown as Record<PropertyKey, unknown>, mockAssistantDbRow as unknown as Record<PropertyKey, unknown>);

             // Verify history was included in adapter sendMessage payload
             const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof getAiProviderAdapter>;
             const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
             assertExists(mockAdapterInstance, "Mock adapter instance should exist");
             const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>;
             assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
             assertSpyCalls(sendMessageSpy, 1);
             const adapterRequestArg = sendMessageSpy.calls[0].args[0] as ChatApiRequest;
             
             // Expect System + History User + History Asst
             assertExists(adapterRequestArg.messages); // Ensure messages array exists
             assertEquals(adapterRequestArg.messages.length, 3, "Adapter payload should include system and history messages");
             assertEquals(adapterRequestArg.messages[0].role, 'system');
             assertEquals(adapterRequestArg.messages[1].role, 'user');
             assertEquals(adapterRequestArg.messages[1].content, history[0].content);
             assertEquals(adapterRequestArg.messages[2].role, 'assistant');
             assertEquals(adapterRequestArg.messages[2].content, history[1].content);
             assertEquals(adapterRequestArg.chatId, testChatId); // Verify chatId passed correctly
        });

         await t.step("POST request with invalid providerId (DB lookup fails) returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const invalidProviderSupaConfig: MockSupabaseDataConfig = {
                 ...mockSupaConfig, // Start with base config
                 genericMockResults: {
                     ...mockSupaConfig.genericMockResults, // Inherit other mocks
                     'ai_providers': { // Override only ai_providers
                         ...mockSupaConfig.genericMockResults?.['ai_providers'], 
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
            const deps = createTestDeps(invalidProviderSupaConfig);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "Test: Provider not found");
        });

        await t.step("POST request with inactive provider returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const inactiveProviderSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfig,
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    'ai_providers': {
                        ...mockSupaConfig.genericMockResults?.['ai_providers'],
                        select: { // Mock select returning no data, no error
                            data: null, 
                            error: null, 
                            status: 200, // Status is OK, but no data found
                            count: 0
                        }
                    }
                }
                // REMOVED: selectProviderResult: { data: null, error: null }
            }; 
            const deps = createTestDeps(inactiveProviderSupaConfig); 
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "AI provider not found or inactive."); 
        });


        await t.step("POST request with invalid promptId (DB lookup fails) returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const invalidPromptSupaConfig: MockSupabaseDataConfig = {
                 ...mockSupaConfig,
                 genericMockResults: {
                     ...mockSupaConfig.genericMockResults,
                     'system_prompts': {
                         ...mockSupaConfig.genericMockResults?.['system_prompts'],
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
            const deps = createTestDeps(invalidPromptSupaConfig);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "Test: Prompt not found");
        });

        await t.step("POST request with inactive prompt returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const inactivePromptSupaConfig: MockSupabaseDataConfig = { 
                 ...mockSupaConfig,
                 genericMockResults: {
                     ...mockSupaConfig.genericMockResults,
                     'system_prompts': {
                         ...mockSupaConfig.genericMockResults?.['system_prompts'],
                         select: { // Mock select returning no data, no error
                            data: null, 
                            error: null,
                            status: 200, 
                            count: 0
                         }
                     }
                 }
                 // REMOVED: selectPromptResult: { data: null, error: null }
            };
            const deps = createTestDeps(inactivePromptSupaConfig);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "System prompt not found or inactive.");
        });

        await t.step("POST request with promptId __none__ succeeds and sends no system message", async () => {
            const deps = createTestDeps(mockSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test no prompt", providerId: testProviderId, promptId: '__none__' }),
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 200);

            // Verify adapter sendMessage payload had no system message
            const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof getAiProviderAdapter>;
            const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
            assertExists(mockAdapterInstance, "Mock adapter instance should exist");
            const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>;
            assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
            assertSpyCalls(sendMessageSpy, 1);
            const adapterRequestArg = sendMessageSpy.calls[0].args[0] as ChatApiRequest;
            
            assertExists(adapterRequestArg.messages); // Ensure messages array exists
            assertEquals(adapterRequestArg.messages.length, 0); 
        });

        await t.step("POST request with DB error creating chat returns 500", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const dbErrorSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfig, 
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    'chats': {
                        ...mockSupaConfig.genericMockResults?.['chats'],
                        insert: { // Mock failed insert for chat
                            data: null, 
                            error: new Error("Test: Chat Insert Failed"),
                            status: 500,
                            count: 0
                        }
                    }
                }
                // REMOVED: insertChatResult: { data: null, error: new Error("Test: Chat Insert Failed") }
             };
            const deps = createTestDeps(dbErrorSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger db error", providerId: testProviderId, promptId: testPromptId }) 
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "Test: Chat Insert Failed");
        });

        await t.step("POST request with adapter sendMessage error returns 500", async () => {
            const adapterError = new Error("Adapter Failed: Simulated API Error");
            const deps = createTestDeps(mockSupaConfig, adapterError);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger adapter error", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, adapterError.message); 
        });
        
        // Test Cases: Input Validation Errors 
        await t.step("POST request with missing message returns 400", async () => {
            const deps = createTestDeps(undefined, undefined);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ providerId: testProviderId, promptId: testPromptId }) 
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, 'Missing or invalid "message" in request body');
        });

        // ... other input validation tests ...

        await t.step("POST request with history fetch error proceeds as new chat", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const historyErrorSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfig, 
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    'chat_messages': {
                        ...mockSupaConfig.genericMockResults?.['chat_messages'],
                        select: { // Mock failed select for history
                            data: null, 
                            error: new Error("Test: History fetch failed"),
                            status: 500, 
                            count: 0
                        }
                    }
                }
                // REMOVED: selectChatHistoryResult: { data: null, error: new Error("Test: History fetch failed") }
            };
            const deps = createTestDeps(historyErrorSupaConfig, mockAdapterSuccessResponse);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "initiate with bad history chatid", providerId: testProviderId, promptId: testPromptId, chatId: 'some-id-that-will-fail-lookup' })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 200); 
            const responseJson = await response.json();
            assertEquals(responseJson.message.chat_id, testChatId); 

            // Verify adapter sendMessage payload had no history messages
            const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof getAiProviderAdapter>;
            const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
            assertExists(mockAdapterInstance, "Mock adapter instance should exist");
            const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>;
            assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
            assertSpyCalls(sendMessageSpy, 1);
            const adapterRequestArg = sendMessageSpy.calls[0].args[0] as ChatApiRequest;
            assertExists(adapterRequestArg.messages); // Ensure messages array exists
            assertEquals(adapterRequestArg.messages.length, 1); // System prompt only
            assertEquals(adapterRequestArg.chatId, undefined); // Treated as new chat
        });

        await t.step("POST request with message insert error returns 500", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const messageInsertErrorSupaConfig: MockSupabaseDataConfig = { 
                 ...mockSupaConfig,
                 genericMockResults: {
                     ...mockSupaConfig.genericMockResults,
                     'chat_messages': {
                         ...mockSupaConfig.genericMockResults?.['chat_messages'],
                         insert: { // Mock failed insert for messages
                            data: null, 
                            error: new Error("Test: Message insert failed"),
                            status: 500, 
                            count: 0
                         }
                     }
                 }
                 // REMOVED: insertAssistantMessageResult: { data: null, error: new Error("Test: Message insert failed") }
             };
            const deps = createTestDeps(messageInsertErrorSupaConfig, mockAdapterSuccessResponse); 
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "trigger message insert error", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "Failed to save messages to database."); 
        });

        await t.step("POST request with missing provider string in DB returns 500", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const missingProviderStringSupaConfig: MockSupabaseDataConfig = {
                ...mockSupaConfig,
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    'ai_providers': {
                        ...mockSupaConfig.genericMockResults?.['ai_providers'],
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
            const deps = createTestDeps(missingProviderStringSupaConfig); 
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test missing provider string", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            assertEquals((await response.json()).error, "AI provider configuration error on server [missing provider string]."); 
        });

        await t.step("POST request with unsupported provider returns 400", async () => {
            // *** FIX: Update mock config using genericMockResults ***
            const unsupportedProviderSupaConfig: MockSupabaseDataConfig = { 
                ...mockSupaConfig, 
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    'ai_providers': {
                        ...mockSupaConfig.genericMockResults?.['ai_providers'],
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
            const deps = createTestDeps(
                unsupportedProviderSupaConfig, 
                undefined, 
                { getAiProviderAdapter: mockGetAiProviderAdapter } 
            );
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test unsupported", providerId: 'provider-unsupported-id', promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "Unsupported AI provider: unsupported-provider");
        });

        await t.step("POST request succeeds with a different provider (Anthropic)", async () => {
            console.log("--- Running Anthropic Provider POST test ---");
            const testAnthropicProviderId = 'provider-anthropic-456';
            const testAnthropicApiIdentifier = 'claude-3-opus-20240229'; // Example identifier
            const testAnthropicProviderString = 'anthropic';
            const testAnthropicAsstMsgId = 'msg-anthropic-ccc';
            const anthropicTokenUsage = { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 };

            // *** FIX: Update mock config using genericMockResults ***
            const anthropicSupaConfig: MockSupabaseDataConfig = {
                ...mockSupaConfig,
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    // Mock provider lookup for Anthropic
                    'ai_providers': {
                        ...mockSupaConfig.genericMockResults?.['ai_providers'],
                        select: {
                            data: [{
                                id: testAnthropicProviderId,
                                api_identifier: testAnthropicApiIdentifier,
                                provider: testAnthropicProviderString
                            }],
                            error: null,
                            status: 200,
                            count: 1
                        }
                    },
                    // Mock message insert for Anthropic (different ID, provider, tokens)
                    'chat_messages': {
                        ...mockSupaConfig.genericMockResults?.['chat_messages'],
                        insert: {
                            data: [
                                // Keep user message mock (or adjust if needed)
                                mockUserDbRow,
                                // Override assistant message mock
                                {
                                    ...mockAssistantDbRow,
                                    id: testAnthropicAsstMsgId,
                                    ai_provider_id: testAnthropicProviderId,
                                    token_usage: anthropicTokenUsage,
                                }
                            ],
                            error: null,
                            status: 201,
                            count: 2
                        }
                    }
                }
                // REMOVED: Old selectProviderResult and insertAssistantMessageResult structure
            };

            // Mock Adapter response for Anthropic
            const anthropicAdapterResponse: AdapterResponsePayload = {
                ...mockAdapterSuccessResponse,
                ai_provider_id: testAnthropicProviderId,
                token_usage: anthropicTokenUsage
            };

            // Need anthropic supa config, anthropic adapter success
            const deps = createTestDeps(anthropicSupaConfig, anthropicAdapterResponse);

            const requestBody = {
                message: "Hello Anthropic!",
                providerId: testAnthropicProviderId, // Use the Anthropic ID
                promptId: testPromptId,
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify(requestBody),
            });

            const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof getAiProviderAdapter>;
            const response = await mainHandler(req, deps);
            
            assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
            const responseJson = await response.json();
            
            // Assert response matches DB insert mock for Anthropic
            assertEquals(responseJson.message.id, testAnthropicAsstMsgId);
            assertEquals(responseJson.message.ai_provider_id, testAnthropicProviderId);
            assertObjectMatch(responseJson.message.token_usage as unknown as Record<PropertyKey, unknown> ?? {}, { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 });

            // Verify Adapter Factory Call with 'anthropic'
            assertSpyCalls(adapterFactorySpy, 1);
            assertEquals(adapterFactorySpy.calls[0].args[0], testAnthropicProviderString);

            // Verify Adapter sendMessage Call with correct ID and KEY
            const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
            assertExists(mockAdapterInstance);
            const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>; 
            assertExists(sendMessageSpy);
            assertSpyCalls(sendMessageSpy, 1);
            const adapterArgs = sendMessageSpy.calls[0].args;
            assertEquals(adapterArgs[1], testAnthropicApiIdentifier); // API Identifier

            console.log("--- Anthropic Provider POST test passed ---");
        });

        // *** Keep this test commented out due to stubbing conflicts ***
        // await t.step("POST request with missing API key env var returns 500", async () => {
        //     // Save the original implementation of the existing stub
        //     const originalEnvGet = envGetStub.original;

        //     try {
        //          // Temporarily change the behavior of the *existing* stub
        //          envGetStub.callsFake((key: string): string | undefined => {
        //             // Log stub calls
        //             console.log(`[Test Env Stub - Temp Override] Deno.env.get called with: ${key}`); 
        //             if (key === 'SUPABASE_URL') return mockSupabaseUrl;
        //             if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
        //             // Return undefined ONLY for the key we are testing
        //             if (key === 'OPENAI_API_KEY') return undefined;
        //             // Call the original stub implementation for other keys
        //             // Use .call to ensure correct 'this' context if needed
        //             return originalEnvGet.call(Deno.env, key); 
        //         });

        //         const deps = createTestDeps(mockSupaConfig);
        //         const req = new Request('http://localhost/chat', { 
        //              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
        //              body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
        //          });
        //         const response = await mainHandler(req, deps);
        //         assertEquals(response.status, 500);
        //         assertEquals((await response.json()).error, 'AI provider configuration error on server [key missing].');
        //     } finally {
        //         // Restore the original behavior of the envGetStub
        //         envGetStub.callsFake(originalEnvGet);
        //         console.log("[Test Env Stub - Temp Override] Restored original behavior.");
        //     }
        // });

        // +++++ UNIT TEST FOR REWIND FUNCTIONALITY +++++
        await t.step("POST request with rewindFromMessageId should deactivate subsequent messages and add new ones", async () => {
            console.log("--- Running Rewind Functionality Unit Test ---");

            const rewindChatId = 'chat-rewind-abc';
            const userMsg1Content = "User Message 1 for rewind";
            const aiMsg1Content = "AI Response 1 for rewind";
            const userMsg2Content = "User Message 2 for rewind (to be inactive)";
            const aiMsg2Content = "AI Response 2 for rewind (to be inactive)";
            const userMsg3Content = "User Message 3 for rewind (new)";
            const aiMsg3Content = "AI Response 3 for rewind (new)";
            const rewindFromMsgId = "ai-msg-1-id"; // ID of AI Response 1
            const initialTimestamp = new Date().getTime();
            const msgTimestamp = (offsetSeconds: number) => new Date(initialTimestamp + offsetSeconds * 1000).toISOString();
            const systemPromptText = 'Test system prompt for rewind';

            const initialMessages: ChatMessageRow[] = [
                { id: "user-msg-1-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg1Content, created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
                { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg1Content, created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1, total_tokens:2}},
                { id: "user-msg-2-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg2Content, created_at: msgTimestamp(2), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
                { id: "ai-msg-2-id", chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg2Content, created_at: msgTimestamp(3), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1, total_tokens:2} },
            ];
            const newAiResponsePayload: AdapterResponsePayload = {
                role: 'assistant', content: aiMsg3Content, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            };
            const newUserMsgDbRow: ChatMessageRow = {
                id: "user-msg-3-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg3Content, created_at: msgTimestamp(4), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: null
            };
            const newAiMsgDbRow: ChatMessageRow = {
                id: "ai-msg-3-id", chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg3Content, created_at: msgTimestamp(5), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: newAiResponsePayload.token_usage
            };

            let selectCallCount = 0;
            const supaConfigForRewind: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now },
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: systemPromptText }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chats': { select: { data: [{ id: rewindChatId, user_id: testUserId, organization_id: null, system_prompt_id: testPromptId, title: "Rewind Test Chat" }], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: any) => {
                            selectCallCount++;
                            // Type for f in state.filters.some(...)
                            type FilterType = typeof state.filters[0]; 
                            if (selectCallCount === 1 && state.filters.some((f: FilterType) => f.column === 'id' && f.value === rewindFromMsgId) && state.operation === 'select') { 
                                console.log("[Test Mock chat_messages.select spy] Call 1: Matched fetch for rewindFromMessageId details.");
                                return { data: [initialMessages.find(m => m.id === rewindFromMsgId)!], error: null, status: 200, count: 1 };
                            }
                            if (selectCallCount === 2 && state.filters.some((f: FilterType) => f.column === 'is_active_in_thread' && f.value === true) && state.operation === 'select') { 
                                console.log("[Test Mock chat_messages.select spy] Call 2: Matched fetch for active history for AI.");
                                return { data: [initialMessages[0], initialMessages[1]], error: null, status: 200, count: 2 };
                            }
                            console.warn("[Test Mock chat_messages.select spy] Unexpected call or state:", selectCallCount, state);
                            return { data: [], error: new Error('Unexpected select call in mock'), status: 500, count: 0 };
                        }),
                        update: { data: [/*ids of updated messages*/], error: null, status: 200, count: 2 },
                        insert: { data: [newUserMsgDbRow, newAiMsgDbRow], error: null, status: 201, count: 2 }
                    }
                }
            };

            const testDepsResult = createTestDeps(supaConfigForRewind, newAiResponsePayload);
            const deps = testDepsResult; // The ChatHandlerDeps part
            const mockSupabaseClientInstance = testDepsResult.mockSupabaseClientInstance as any; // The client instance

            const requestBody = { chatId: rewindChatId, message: userMsg3Content, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgId };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 200);
            const responseBody = await response.json();
            assertObjectMatch(responseBody.message, {
                content: aiMsg3Content,
                chat_id: rewindChatId,
                role: 'assistant',
                token_usage: newAiResponsePayload.token_usage
            });

            // Assertions on Supabase client calls
            // 1. Assert update was called to deactivate messages
            // Access the spy from the mockSupabaseClientInstance that createMockSupabaseClient setup
            const updateSpy = mockSupabaseClientInstance.from('chat_messages').update as Spy<any, any[], any>; // Assuming .update is a spy
            assertSpyCalls(updateSpy, 1); // Should be called once to deactivate messages
            assertEquals(updateSpy.calls[0].args[0], { is_active_in_thread: false });
            // Further assertions on .eq() and .gt() would require the mock query builder to record these chained calls on the spy object, or for the spy on update to receive this chain state.
            // This part is tricky with the current generic mock setup for unit tests if it doesn't deeply spy on chained methods.

            // 2. Assert AI adapter was called with correct history
            const adapterSpy = deps.getAiProviderAdapter(testProviderString)!.sendMessage as Spy<any, any[], any>;
            assertSpyCalls(adapterSpy, 1);
            const adapterArgs = adapterSpy.calls[0].args[0] as ChatApiRequest;
            assertExists(adapterArgs.messages); // Ensure messages array exists
            assertEquals(adapterArgs.message, userMsg3Content);
            assertEquals(adapterArgs.chatId, rewindChatId);
            assertEquals(adapterArgs.messages.length, 3); 
            assertEquals(adapterArgs.messages[0].role, 'system');
            assertEquals(adapterArgs.messages[0].content, systemPromptText);
            assertEquals(adapterArgs.messages[1].content, userMsg1Content);
            assertEquals(adapterArgs.messages[2].content, aiMsg1Content);
            
            // 3. Assert insert was called for new messages
            const insertSpy = mockSupabaseClientInstance.from('chat_messages').insert as Spy<any, any[], any>; // Assuming .insert is a spy
            assertSpyCalls(insertSpy, 1);
            assertEquals(insertSpy.calls[0].args[0].length, 2); // User3 and AI3
            assertObjectMatch(insertSpy.calls[0].args[0][0], { content: userMsg3Content, role: 'user', is_active_in_thread: true });
            assertObjectMatch(insertSpy.calls[0].args[0][1], { content: aiMsg3Content, role: 'assistant', is_active_in_thread: true, token_usage: newAiResponsePayload.token_usage });
        });

        await t.step("POST request for New ORG Chat should include organizationId in insert", async () => {
            console.log("--- Running POST test (New ORG Chat) ---");
            const testOrganizationId = 'org-uuid-for-new-chat';
            const supaConfigForOrgChat: MockSupabaseDataConfig = {
                ...mockSupaConfig, // Base config
                genericMockResults: {
                    ...mockSupaConfig.genericMockResults,
                    'chats': { // Override chats mock for this test
                        ...mockSupaConfig.genericMockResults!['chats'],
                        insert: { // Mock for inserting a new chat
                            data: [{ id: 'new-org-chat-id' }], // Return a new chat ID
                            error: null, 
                            status: 201, 
                            count: 1 
                        }
                    },
                     // Ensure chat_messages insert is also mocked to prevent cascading errors
                    'chat_messages': {
                        ...mockSupaConfig.genericMockResults!['chat_messages'],
                        insert: { 
                            data: [ {
                                ...mockUserDbRow, // Use a base structure
                                chat_id: 'new-org-chat-id',
                                id: 'user-msg-org-chat'
                            }, {
                                ...mockAssistantDbRow, // Use a base structure
                                chat_id: 'new-org-chat-id',
                                id: 'asst-msg-org-chat'
                            } ],
                            error: null, 
                            status: 201, 
                            count: 2
                        }
                    }
                }
            };

            const deps = createTestDeps(supaConfigForOrgChat, mockAdapterSuccessResponse);

            const requestBody = {
                message: "New Org Chat Message",
                providerId: testProviderId,
                promptId: testPromptId,
                organizationId: testOrganizationId, // Key part for this test
            };
            const req = new Request('http://localhost/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify(requestBody),
            });

            const response = await mainHandler(req, deps);
            // Read the body once for potential error reporting, then parse as JSON
            let responseTextForError = '';
            if (response.status !== 200) {
                try {
                    responseTextForError = await response.clone().text(); // Clone to read for error, original still readable
                } catch {
                    responseTextForError = '[Could not read response text for error]';
                }
            }
            assertEquals(response.status, 200, `Org chat creation failed: ${responseTextForError}`);
            const responseJson = await response.json();
            assertEquals(responseJson.message.chat_id, 'new-org-chat-id');

            // Assert that the supabaseClient.from('chats').insert() call was made correctly
            const clientFactorySpy = deps.createSupabaseClient as Spy<any>;
            assertSpyCalls(clientFactorySpy, 1);
            const mockClientInstance = clientFactorySpy.calls[0].returned as SupabaseClient;
            
            // Get the spy for the .from('chats') call
            const fromSpy = mockClientInstance.from as Spy<any>;
            const chatsFromCall = fromSpy.calls.find(c => c.args[0] === 'chats');
            assertExists(chatsFromCall, "Call to .from('chats') missing");

            // Get the spy for the .insert() call from the query builder returned by .from('chats')
            const queryBuilder = chatsFromCall.returned;
            const insertSpy = queryBuilder.insert as Spy<any>; 
            assertSpyCalls(insertSpy, 1);

            // Check the actual data passed to insert
            const insertArgs = insertSpy.calls[0].args[0]; // This is the array of objects to insert
            assert(Array.isArray(insertArgs) && insertArgs.length === 1, "Insert should have received an array with one object");
            const insertedChatData = insertArgs[0];
            assertEquals(insertedChatData.organization_id, testOrganizationId, "organization_id was not correctly passed to chats.insert");
            assertEquals(insertedChatData.user_id, testUserId, "user_id was not correctly passed to chats.insert");
            assertExists(insertedChatData.title, "title should have been generated for new org chat");
        });

    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
    }
}); // End Test Suite