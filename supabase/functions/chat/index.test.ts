import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
// Import testing utilities
import { spy, type Spy, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock"; 
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database } from "../types_db.ts"; // Import Database type
import type { AiProviderAdapter, ChatApiRequest as AdapterChatRequest } from '../_shared/types.ts'; // Import App types
import { getAiProviderAdapter as actualGetAiProviderAdapter } from '../_shared/ai_service/factory.ts'; // Import real factory
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../_shared/test-utils.ts";
import { stub } from "https://deno.land/std@0.177.0/testing/mock.ts";
// Import main handler, deps type, and the REAL defaultDeps for comparison/base
import { mainHandler, type ChatHandlerDeps, defaultDeps as realDefaultDeps } from './index.ts';

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
const createMockAdapter = (sendMessageResult: ChatMessageRow | Error): AiProviderAdapter => {
    // Implement resolve/reject manually
    const sendMessageSpy = sendMessageResult instanceof Error 
        ? spy(() => Promise.reject(sendMessageResult)) 
        : spy(() => Promise.resolve(sendMessageResult));

    return {
        sendMessage: sendMessageSpy,
        // listModels: spy(() => Promise.resolve([])), // Add if needed
    } as unknown as AiProviderAdapter; // Cast needed as we might not implement all methods
};

// --- Test Dependency Creation Helper --- 
const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  adapterSendMessageResult?: ChatMessageRow | Error, // Make optional for tests not needing it
  envVars: Record<string, string | undefined> = {},
  depOverrides: Partial<ChatHandlerDeps> = {}
): ChatHandlerDeps => {
  const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
  
  // Create mock adapter and factory ONLY if adapterSendMessageResult is provided
  const mockAdapter = adapterSendMessageResult ? createMockAdapter(adapterSendMessageResult) : undefined;
  const mockGetAiProviderAdapter = mockAdapter ? spy((_provider: string) => mockAdapter) : spy(actualGetAiProviderAdapter); // Return real factory if no mock needed

  const mockGetEnv = spy((key: string): string | undefined => envVars[key]);

  // Build deps, starting from REAL defaults and overriding specifics
  const deps: ChatHandlerDeps = {
    ...realDefaultDeps, // Start with real ones (includes real response creators)
    createSupabaseClient: spy(() => mockSupabaseClient) as any, // Cast spy to avoid complex type issues
    getEnv: mockGetEnv, // Mocked env getter
    getAiProviderAdapter: mockGetAiProviderAdapter, // Use the potentially mocked factory
    // fetch: fetch, // No longer needed directly in deps for AI call
    ...depOverrides, // Apply specific test overrides LAST
  };
  return deps;
};

// --- Test Suite ---
Deno.test("Chat Function Tests (Adapter Refactor)", async (t) => {
    // --- Shared Mock Configurations ---
    const testProviderId = 'provider-openai-123'; // UUID for the DB record
    const testApiIdentifier = 'openai-gpt-4o';     // Actual model identifier for the API
    const testProviderString = 'openai';          // Provider string used by factory
    const testPromptId = 'prompt-abc-456';
    const testUserId = 'user-auth-xyz';
    const testChatId = 'chat-new-789';
    const testAsstMsgId = 'msg-asst-bbb';
    const testAiContent = 'Mock AI response content from adapter';
    const now = new Date().toISOString();

    // Define the successful response the MOCK adapter's sendMessage should return
    const mockAdapterSuccessResponse: ChatMessageRow = {
        id: 'temp-adapter-msg-id', 
        chat_id: testChatId, 
        role: 'assistant', 
        content: testAiContent,
        created_at: now, 
        user_id: null,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
    };

    // Define the successful message structure returned by the DB INSERT 
    // (and thus the API response) - should strictly match ChatMessageRow
    const mockDbInsertResult: ChatMessageRow = {
        id: testAsstMsgId, 
        chat_id: testChatId,
        role: 'assistant', 
        content: testAiContent, 
        created_at: now, 
        user_id: null,
        ai_provider_id: testProviderId,
        system_prompt_id: testPromptId,
        token_usage: mockAdapterSuccessResponse.token_usage, 
    };

    // Base Supabase mock config - ENSURE provider is included
    const mockSupaConfig: MockSupabaseDataConfig = {
        getUserResult: { data: { user: { id: testUserId } }, error: null },
        selectPromptResult: { data: { id: testPromptId, prompt_text: 'Test system prompt' }, error: null },
        selectProviderResult: { data: { id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString } as any, error: null }, 
        insertChatResult: { data: { id: testChatId }, error: null },
        insertAssistantMessageResult: { data: mockDbInsertResult, error: null }, // Mock the successful DB insert
        selectChatHistoryResult: { data: [], error: null },
        mockUser: { id: testUserId } 
    };

    // Base Env Vars
    const mockEnvVars: Record<string, string | undefined> = {
        SUPABASE_URL: mockSupabaseUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
        OPENAI_API_KEY: mockOpenAiKey, 
        // ANTHROPIC_API_KEY: mockAnthropicKey, 
        // GOOGLE_API_KEY: mockGoogleKey,
    };

    // --- Individual Tests ---

    await t.step("OPTIONS request should return CORS headers", async () => {
        // No adapter mock needed
        const deps = createTestDeps(); 
        const req = new Request('http://localhost/chat', { method: 'OPTIONS' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 204);
        assertExists(response.headers.get('Access-Control-Allow-Origin'));
    });

    await t.step("GET request should return 405 Method Not Allowed", async () => {
        // No adapter mock needed
        const deps = createTestDeps();
        const req = new Request('http://localhost/chat', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 405);
    });

    await t.step("POST request missing Auth header should return 401", async () => {
        // No adapter mock needed, need env for Supa init check
        const deps = createTestDeps({}, undefined, mockEnvVars); 
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "test", providerId: "p", promptId: "pr" }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 401);
        // Check the error string directly
        assertEquals((await response.json()).error, 'Authentication required');
    });

    await t.step("POST request with valid Auth (New Chat) should succeed", async () => {
        console.log("--- Running Valid Auth POST test (New Chat) ---");
        // Need supa, adapter success, env
        const deps = createTestDeps(mockSupaConfig, mockAdapterSuccessResponse, mockEnvVars);

        const requestBody = {
            message: "Hello there AI!",
            providerId: testProviderId,
            promptId: testPromptId,
        };
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify(requestBody),
        });

        const clientFactorySpy = deps.createSupabaseClient as Spy<any>; // Use Spy<any>
        const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof actualGetAiProviderAdapter>;

        const response = await mainHandler(req, deps);
        
        assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
        const responseJson = await response.json() as ChatMessageRow;
        
        // Assert response body matches the SAVED assistant message from DB mock
        assertObjectMatch(responseJson as unknown as Record<PropertyKey, unknown>, mockDbInsertResult as unknown as Record<PropertyKey, unknown>);
        assertEquals(responseJson.id, testAsstMsgId); // Check specific ID

        // Verify Adapter Factory Call
        assertSpyCalls(adapterFactorySpy, 1);
        assertEquals(adapterFactorySpy.calls[0].args[0], testProviderString); // Called with 'openai'

        // Verify Adapter sendMessage Call
        const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
        // Check if adapter instance exists before accessing sendMessage
        assertExists(mockAdapterInstance, "Mock adapter instance should exist"); 
        const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>; // Cast spy
        assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
        assertSpyCalls(sendMessageSpy, 1);
        
        // Assert arguments passed to adapter.sendMessage
        const adapterArgs = sendMessageSpy.calls[0].args;
        assertEquals(adapterArgs.length, 3);
        const adapterRequestArg = adapterArgs[0] as AdapterChatRequest;
        const apiIdentifierArg = adapterArgs[1] as string;
        const apiKeyArg = adapterArgs[2] as string;

        // Check adapter request details
        assertEquals(adapterRequestArg.message, requestBody.message);
        assertEquals(adapterRequestArg.providerId, testProviderId);
        assertEquals(adapterRequestArg.promptId, testPromptId);
        assertEquals(adapterRequestArg.chatId, undefined); // New chat
        assertEquals(adapterRequestArg.messages.length, 1); // System prompt only (History is empty)
        assertEquals(adapterRequestArg.messages[0].role, 'system');
        assertEquals(adapterRequestArg.messages[0].content, mockSupaConfig.selectPromptResult?.data?.prompt_text);
        
        // Check apiIdentifier and apiKey
        assertEquals(apiIdentifierArg, testApiIdentifier);
        assertEquals(apiKeyArg, mockOpenAiKey);

        // Verify Supabase interactions (getUser, prompt, provider, chat insert, message insert)
        const mockClientInstance = clientFactorySpy.calls[0].returned as SupabaseClient;
        const fromSpy = mockClientInstance.from as Spy<any>;
        const fromCalls = fromSpy.calls.map(call => call.args[0]);
        // Expect 5 calls: system_prompts, ai_providers, chats, chat_messages (user), chat_messages (assistant)
        assertEquals(fromCalls.length, 5, `Expected 5 'from' calls, got ${fromCalls.length}`);
        assert(fromCalls.includes('system_prompts'));
        assert(fromCalls.includes('ai_providers'));
        assert(fromCalls.includes('chats')); // For new chat insert
        assert(fromCalls.includes('chat_messages')); // For message insert

        console.log("--- Valid Auth POST test (New Chat) passed ---");
    });

    await t.step("POST request with invalid JWT returns 401", async () => {
         // Need specific supa config, no adapter needed, env needed
         const deps = createTestDeps(
             { getUserResult: { data: { user: null }, error: new Error("Simulated invalid JWT") } },
             undefined, 
             mockEnvVars
         );
         const req = new Request('http://localhost/chat', {
             method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid-token' },
             body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
         });
         const response = await mainHandler(req, deps);
         assertEquals(response.status, 401);
         // Check the message property of the error object
         assertEquals((await response.json()).error.message, 'Invalid authentication credentials');
    });

    await t.step("POST request with missing API key env var returns 500", async () => {
         const missingKeyEnv = { ...mockEnvVars, OPENAI_API_KEY: undefined };
         // Need supa config, no adapter needed, specific env
         const deps = createTestDeps(mockSupaConfig, undefined, missingKeyEnv);
         const req = new Request('http://localhost/chat', {
             method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
             body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
         });
         const response = await mainHandler(req, deps);
         assertEquals(response.status, 500);
         // Check the message property of the error object
         assertEquals((await response.json()).error.message, 'AI provider configuration error on server [key missing].');
    });

    await t.step("POST request with existing chat history includes history in adapter call", async () => {
         const history: Pick<ChatMessageRow, 'role' | 'content'>[] = [
             { role: 'user', content: 'Previous user message' },
             { role: 'assistant', content: 'Previous assistant response' }
         ];
         const historySupaConfig = { ...mockSupaConfig, selectChatHistoryResult: { data: history, error: null } };
         // Need history supa config, adapter success, env
         const deps = createTestDeps(historySupaConfig, mockAdapterSuccessResponse, mockEnvVars);
         const requestBody = { message: "Follow up question", providerId: testProviderId, promptId: testPromptId, chatId: testChatId }; 
         const req = new Request('http://localhost/chat', { 
             method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
             body: JSON.stringify(requestBody), 
         });
         
         const response = await mainHandler(req, deps);
         assertEquals(response.status, 200);
         assertObjectMatch(await response.json() as unknown as Record<PropertyKey, unknown>, mockDbInsertResult as unknown as Record<PropertyKey, unknown>);

         // Verify history was included in adapter sendMessage payload
         const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof actualGetAiProviderAdapter>;
         const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
         assertExists(mockAdapterInstance, "Mock adapter instance should exist");
         const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>;
         assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
         assertSpyCalls(sendMessageSpy, 1);
         const adapterRequestArg = sendMessageSpy.calls[0].args[0] as AdapterChatRequest;
         
         // Expect System + History User + History Asst
         assertEquals(adapterRequestArg.messages.length, 3, "Adapter payload should include system and history messages");
         assertEquals(adapterRequestArg.messages[0].role, 'system');
         assertEquals(adapterRequestArg.messages[1].role, 'user');
         assertEquals(adapterRequestArg.messages[1].content, history[0].content);
         assertEquals(adapterRequestArg.messages[2].role, 'assistant');
         assertEquals(adapterRequestArg.messages[2].content, history[1].content);
         assertEquals(adapterRequestArg.chatId, testChatId); // Verify chatId passed correctly
    });

     await t.step("POST request with invalid providerId (DB lookup fails) returns 400", async () => {
        const invalidProviderSupaConfig = { ...mockSupaConfig, selectProviderResult: { data: null, error: new Error("Test: Provider not found") } };
        // Need specific supa config, no adapter, env needed
        const deps = createTestDeps(invalidProviderSupaConfig, undefined, mockEnvVars);
        const req = new Request('http://localhost/chat', { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        // Check the message property of the error object (error comes from mock DB)
        assertEquals((await response.json()).error.message, "Test: Provider not found");
    });

    await t.step("POST request with inactive provider returns 400", async () => {
        const inactiveProviderSupaConfig = { ...mockSupaConfig, selectProviderResult: { data: null, error: null } }; 
        // Need specific supa config, no adapter, env needed
        const deps = createTestDeps(inactiveProviderSupaConfig, undefined, mockEnvVars); 
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, "AI provider not found or inactive."); 
    });


    await t.step("POST request with invalid promptId (DB lookup fails) returns 400", async () => {
        const invalidPromptSupaConfig = { ...mockSupaConfig, selectPromptResult: { data: null, error: new Error("Test: Prompt not found") } };
        // Need specific supa config, no adapter, env needed
        const deps = createTestDeps(invalidPromptSupaConfig, undefined, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        // Check the message property of the error object (error comes from mock DB)
        assertEquals((await response.json()).error.message, "Test: Prompt not found");
    });

    await t.step("POST request with inactive prompt returns 400", async () => {
        const inactivePromptSupaConfig = { ...mockSupaConfig, selectPromptResult: { data: null, error: null } };
        // Need specific supa config, no adapter, env needed
        const deps = createTestDeps(inactivePromptSupaConfig, undefined, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, "System prompt not found or inactive.");
    });

    await t.step("POST request with promptId __none__ succeeds and sends no system message", async () => {
        // Need base supa config, adapter success, env
        const deps = createTestDeps(mockSupaConfig, mockAdapterSuccessResponse, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test no prompt", providerId: testProviderId, promptId: '__none__' }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);

        // Verify adapter sendMessage payload had no system message
        const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof actualGetAiProviderAdapter>;
        const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
        assertExists(mockAdapterInstance, "Mock adapter instance should exist");
        const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>;
        assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
        assertSpyCalls(sendMessageSpy, 1);
        const adapterRequestArg = sendMessageSpy.calls[0].args[0] as AdapterChatRequest;
        
        assertEquals(adapterRequestArg.messages.length, 0); 
    });

    await t.step("POST request with DB error creating chat returns 500", async () => {
        const dbErrorSupaConfig = { ...mockSupaConfig, insertChatResult: { data: null, error: new Error("Test: Chat Insert Failed") } };
        // Need specific supa config, adapter success (won't be called), env
        const deps = createTestDeps(dbErrorSupaConfig, mockAdapterSuccessResponse, mockEnvVars);
        const req = new Request('http://localhost/chat', { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger db error", providerId: testProviderId, promptId: testPromptId }) 
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, "Failed to create new chat session.");
    });

    await t.step("POST request with adapter sendMessage error returns 500", async () => {
        const adapterError = new Error("Adapter Failed: Simulated API Error");
        // Need base supa config, adapter error config, env
        const deps = createTestDeps(mockSupaConfig, adapterError, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger adapter error", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        // Check the message property of the error object (error comes from adapter)
        assertEquals((await response.json()).error.message, adapterError.message); 
    });
    
    // Test Cases: Input Validation Errors 
    await t.step("POST request with missing message returns 400", async () => {
        // No adapter needed, env needed
        const deps = createTestDeps(undefined, undefined, mockEnvVars);
        const req = new Request('http://localhost/chat', { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ providerId: testProviderId, promptId: testPromptId }) 
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, 'Missing or invalid "message" in request body');
    });

    // ... other input validation tests ...

    await t.step("POST request with history fetch error proceeds as new chat", async () => {
        const historyErrorSupaConfig = { ...mockSupaConfig, selectChatHistoryResult: { data: null, error: new Error("Test: History fetch failed") } };
        // Need specific supa config, adapter success, env
        const deps = createTestDeps(historyErrorSupaConfig, mockAdapterSuccessResponse, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "initiate with bad history chatid", providerId: testProviderId, promptId: testPromptId, chatId: 'some-id-that-will-fail-lookup' })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200); 
        const responseJson = await response.json() as ChatMessageRow;
        assertEquals(responseJson.chat_id, testChatId); 

        // Verify adapter sendMessage payload had no history messages
        const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof actualGetAiProviderAdapter>;
        const mockAdapterInstance = adapterFactorySpy.calls[0].returned as AiProviderAdapter;
        assertExists(mockAdapterInstance, "Mock adapter instance should exist");
        const sendMessageSpy = mockAdapterInstance.sendMessage as Spy<any>;
        assertExists(sendMessageSpy, "sendMessage spy should exist on mock adapter");
        assertSpyCalls(sendMessageSpy, 1);
        const adapterRequestArg = sendMessageSpy.calls[0].args[0] as AdapterChatRequest;
        assertEquals(adapterRequestArg.messages.length, 1); // System prompt only
        assertEquals(adapterRequestArg.chatId, undefined); // Treated as new chat
    });

    await t.step("POST request with message insert error returns 500", async () => {
        const messageInsertErrorSupaConfig = { ...mockSupaConfig, insertAssistantMessageResult: { data: null, error: new Error("Test: Message insert failed") } };
        // Need specific supa config, adapter success, env
        const deps = createTestDeps(messageInsertErrorSupaConfig, mockAdapterSuccessResponse, mockEnvVars); 
        const req = new Request('http://localhost/chat', { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger message insert error", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, "Failed to save assistant response."); 
    });

    await t.step("POST request with missing provider string in DB returns 500", async () => {
        const missingProviderStringSupaConfig = {
            ...mockSupaConfig,
            // Simulate provider lookup returning data but missing the crucial 'provider' string
            selectProviderResult: { 
                data: { id: testProviderId, api_identifier: testApiIdentifier, provider: null } as any, 
                error: null 
            } 
        };
        // Need specific supa config, no adapter needed, env needed
        const deps = createTestDeps(missingProviderStringSupaConfig, undefined, mockEnvVars); 
        const req = new Request('http://localhost/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test missing provider string", providerId: testProviderId, promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, "AI provider configuration error on server [missing provider string]."); 
    });

    await t.step("POST request with unsupported provider returns 400", async () => {
        const unsupportedProviderSupaConfig = { 
            ...mockSupaConfig, 
            // Cast to any to bypass strict type check for 'provider' until test-utils.ts is updated
            selectProviderResult: { data: { id: 'provider-unsupported-id', api_identifier: 'unsupported-model', provider: 'unsupported-provider' } as any, error: null } 
        };
        // Need specific supa config, no adapter, env, override factory
        const mockGetAiProviderAdapter = spy((_provider: string) => null); // Factory returns null
        const deps = createTestDeps(
            unsupportedProviderSupaConfig, 
            undefined, 
            mockEnvVars, 
            { getAiProviderAdapter: mockGetAiProviderAdapter } 
        );
        const req = new Request('http://localhost/chat', { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test unsupported", providerId: 'provider-unsupported-id', promptId: testPromptId })
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, "Unsupported AI provider: unsupported-provider");
    });

    await t.step("POST request succeeds with a different provider (Anthropic)", async () => {
        console.log("--- Running Anthropic Provider POST test ---");
        const testAnthropicProviderId = 'provider-anthropic-456';
        const testAnthropicApiIdentifier = 'claude-3-opus-20240229'; // Example identifier
        const testAnthropicProviderString = 'anthropic';
        const testAnthropicAsstMsgId = 'msg-anthropic-ccc';

        // Mock Env Var for Anthropic
        const anthropicEnvVars = { ...mockEnvVars, ANTHROPIC_API_KEY: mockAnthropicKey };

        // Mock Supabase config for Anthropic provider
        const anthropicSupaConfig = {
            ...mockSupaConfig,
            selectProviderResult: { 
                data: { 
                    id: testAnthropicProviderId, 
                    api_identifier: testAnthropicApiIdentifier, 
                    provider: testAnthropicProviderString 
                } as any, 
                error: null 
            },
            // Ensure the DB insert mock reflects the Anthropic provider ID
            insertAssistantMessageResult: { 
                data: {
                    ...mockDbInsertResult, // Base structure
                    id: testAnthropicAsstMsgId,
                    ai_provider_id: testAnthropicProviderId, 
                    // Potentially different token usage structure for Anthropic?
                    token_usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } 
                }, 
                error: null 
            }
        };

        // Mock Adapter response for Anthropic (content might be same, adjust tokens)
        const anthropicAdapterResponse: ChatMessageRow = {
            ...mockAdapterSuccessResponse,
            ai_provider_id: testAnthropicProviderId,
            token_usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } 
        };

        // Need anthropic supa config, anthropic adapter success, anthropic env
        const deps = createTestDeps(anthropicSupaConfig, anthropicAdapterResponse, anthropicEnvVars);

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

        const adapterFactorySpy = deps.getAiProviderAdapter as Spy<typeof actualGetAiProviderAdapter>;
        const response = await mainHandler(req, deps);
        
        assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
        const responseJson = await response.json() as ChatMessageRow;
        
        // Assert response matches DB insert mock for Anthropic
        assertEquals(responseJson.id, testAnthropicAsstMsgId);
        assertEquals(responseJson.ai_provider_id, testAnthropicProviderId);
        assertObjectMatch(responseJson.token_usage as unknown as Record<PropertyKey, unknown> ?? {}, { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 });

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
        assertEquals(adapterArgs[2], mockAnthropicKey);         // API Key

        console.log("--- Anthropic Provider POST test passed ---");
    });

}); // End Test Suite