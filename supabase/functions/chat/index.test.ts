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
} from "../_shared/supabase.mock.ts";
// Import main handler, deps type, and the REAL defaultDeps for comparison/base
import { mainHandler, defaultDeps } from './index.ts';
import { logger } from '../_shared/logger.ts';

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
            const { deps } = createTestDeps(); 
            const req = new Request('http://localhost/chat', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }); 
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 204);
            assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
        });

        await t.step("GET request should return 405 Method Not Allowed", async () => {
            const { deps } = createTestDeps();
            const req = new Request('http://localhost/chat', { method: 'GET' });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 405);
        });

        await t.step("POST request missing Auth header should return 401", async () => {
            const { deps } = createTestDeps({}); 
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
            const { deps, mockClient } = createTestDeps(mockSupaConfig, mockAdapterSuccessResponse);

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
            const fromSpy = mockClient.from as Spy<any>;

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
             const { deps } = createTestDeps(
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
             const { deps } = createTestDeps(historySupaConfig, mockAdapterSuccessResponse);
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
            const { deps } = createTestDeps(invalidProviderSupaConfig);
            const req = new Request('http://localhost/chat', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
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
            const { deps } = createTestDeps(inactiveProviderSupaConfig); 
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
            const { deps } = createTestDeps(invalidPromptSupaConfig);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
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
            const { deps } = createTestDeps(inactivePromptSupaConfig);
            const req = new Request('http://localhost/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
                body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
            });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 400);
            assertEquals((await response.json()).error, "System prompt not found or inactive.");
        });

        await t.step("POST request with promptId __none__ succeeds and sends no system message", async () => {
            const { deps } = createTestDeps(mockSupaConfig, mockAdapterSuccessResponse);
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
            const { deps } = createTestDeps(dbErrorSupaConfig, mockAdapterSuccessResponse);
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
            const { deps } = createTestDeps(mockSupaConfig, adapterError);
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
            const { deps } = createTestDeps(undefined, undefined);
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
            const { deps } = createTestDeps(historyErrorSupaConfig, mockAdapterSuccessResponse);
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
            const { deps } = createTestDeps(messageInsertErrorSupaConfig, mockAdapterSuccessResponse); 
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
            const { deps } = createTestDeps(missingProviderStringSupaConfig); 
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
            const { deps } = createTestDeps(
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
            const { deps } = createTestDeps(anthropicSupaConfig, anthropicAdapterResponse);

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

            const { deps, mockClient } = createTestDeps(supaConfigForOrgChat, mockAdapterSuccessResponse);

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
            const fromSpy = mockClient.from as Spy<any>;
            const chatsFromCall = fromSpy.calls.find(c => c.args[0] === 'chats');
            assertExists(chatsFromCall, "Call to .from('chats') missing");

            // Get the spy for the .insert() call from the query builder returned by .from('chats')
            const queryBuilder = chatsFromCall.returned;
            const insertSpy = queryBuilder.insert as Spy<any>; 
            assertSpyCalls(insertSpy, 1);

            // Check the actual data passed to insert
            const insertedChatData = insertSpy.calls[0].args[0]; // This is the object itself
            assertExists(insertedChatData, "Chat data was not inserted"); 
            assertEquals(insertedChatData.organization_id, testOrganizationId, "organization_id was not correctly passed to chats.insert");
            assertEquals(insertedChatData.user_id, testUserId, "user_id was not correctly passed to chats.insert");
            assertExists(insertedChatData.title, "title should have been generated for new org chat");
        });

    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
    }
}); // End Test Suite