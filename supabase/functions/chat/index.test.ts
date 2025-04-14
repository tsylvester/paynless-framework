import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
// Correctly import spy, Spy type, AND assertSpyCalls from testing/mock
import { spy, type Spy, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
// Import real createClient
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
// NOTE: ServeHandlerInfo is part of the Deno namespace, no import needed for the type
// Use ConnInfo from std/http/server.ts as expected by mainHandler
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";

// Import main handler and deps type
import { mainHandler, type ChatHandlerDeps, defaultDeps as realDefaultDeps } from './index.ts';
// Import the Supabase mock utility and its config type
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  withMockEnv // Import withMockEnv
} from "../_shared/test-utils.ts";
// Import ChatMessage type (adjust path if necessary)
import type { ChatMessage } from '../../../packages/types/src/ai.types.ts';

// --- Mock Data ---
const mockSupabaseUrl = 'http://localhost:54321';
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const mockAnonSecret = 'test-secret-123';
const mockIpAddress = "127.0.0.1"; // Define IP for ConnInfo

// Define mockConnInfo using ConnInfo type from std/http/server.ts
const mockConnInfo: ConnInfo = {
  // Provide required fields for ConnInfo
  localAddr: { transport: "tcp", hostname: "localhost", port: 8000 },
  remoteAddr: { transport: "tcp", hostname: mockIpAddress, port: 12345 },
  // completed: Promise.resolve(), // Removed - Not part of ConnInfo
};

// Define mockEnvVars BEFORE createTestDeps with explicit type
const mockEnvVars: Record<string, string> = {
    SUPABASE_URL: mockSupabaseUrl,
    SUPABASE_ANON_KEY: mockAnonKey,
    OPENAI_API_KEY: mockOpenAiKey,
};

// --- Mock Implementations (Local to test file) ---

// Define a simple type for fetch config
interface MockFetchConfig {
    responseData: any; 
    status?: number; 
    // Add optional flag to simulate network error
    shouldThrow?: Error; 
}

// Mock fetch function (Define locally)
const createMockFetch = (config: MockFetchConfig) => {
  return spy(async (_url: string | URL | Request, _options?: RequestInit): Promise<Response> => {
    // Check if we should simulate a network error
    if (config.shouldThrow) {
        console.log(`[Mock Fetch] Simulating network error:`, config.shouldThrow);
        throw config.shouldThrow;
    }
    
    // Original logic: return a successful response
    const mockResponse = new Response(JSON.stringify(config.responseData), {
      status: config.status ?? 200, // Use status from config or default to 200
      headers: { 'Content-Type': 'application/json' },
    });
    // Add a simple mock .json() method directly
    (mockResponse as any).json = async () => config.responseData;
    console.log(`[Mock Fetch] Returning mocked response (Status: ${config.status ?? 200}).`);
    return mockResponse;
  });
};

// --- Helper to create COMPLETE Test Dependencies ---
const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  fetchConfig: MockFetchConfig = { responseData: {} },
  // Add envVars parameter back for scoped environment mocking
  envVars: Record<string, string | undefined> = {},
  depOverrides: Partial<ChatHandlerDeps> = {}
): ChatHandlerDeps => {

  const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
  const mockFetch = createMockFetch(fetchConfig);

  // Create a mock getEnv that ONLY uses the passed envVars
  const mockGetEnv = spy((key: string): string | undefined => {
    // Return value from the scoped envVars if present, otherwise undefined
    // No fallback to global mockEnvVars or Deno.env.get here!
    return envVars[key]; 
  });

  // Use a real response creation function but log errors
  const createErrorResponse = (message: string, status = 500, headers = {}) => {
      console.error(`API Error (${status}): ${message}`); // Log errors during tests
      // Ensure we use realDefaultDeps.corsHeaders here for consistency
      const actualHeaders = { ...realDefaultDeps.corsHeaders, 'Content-Type': 'application/json', ...headers };
      return new Response(JSON.stringify({ error: message }), {
          headers: actualHeaders,
          status: status,
      });
  };

   // Use a real response creation function
  const createJsonResponse = (data: unknown, status = 200, headers = {}) => {
      const actualHeaders = { ...realDefaultDeps.corsHeaders, 'Content-Type': 'application/json', ...headers };
      return new Response(JSON.stringify(data), {
        headers: actualHeaders,
        status: status,
      });
  };


  const deps: ChatHandlerDeps = {
    // Start with real defaults (which should now be imported)
    ...realDefaultDeps,
    createSupabaseClient: spy(() => mockSupabaseClient), // Use the mock client
    getEnv: mockGetEnv, // Use the new scoped mock getEnv
    fetch: mockFetch,
    // Use the locally defined error/json response creators that use real corsHeaders
    createErrorResponse: createErrorResponse,
    createJsonResponse: createJsonResponse,
    ...depOverrides, // Apply any specific overrides for a test
  };
  return deps;
};


// --- Test Suite ---
// Note: Removed sanitizeOps/Resources as they can sometimes interfere with async mocks
Deno.test("Chat Function Tests", async (t) => {
    // --- Shared Mock Configurations ---
    // Use specific IDs for clarity in tests
    const testProviderId = 'provider-id-123';
    const testPromptId = 'prompt-id-abc';
    const testUserId = 'user-auth-xyz';
    const testChatId = 'chat-new-789';
    const testUserMsgId = 'msg-user-aaa';
    const testAsstMsgId = 'msg-asst-bbb';
    const testAiContent = 'Mock AI response content';
    const now = new Date().toISOString(); // Consistent timestamp for mocks

    const mockSupaConfig: MockSupabaseDataConfig = {
        getUserResult: { data: { user: { id: testUserId } }, error: null }, // Needed for auth check
        selectPromptResult: { data: { id: testPromptId, prompt_text: 'Test system prompt' }, error: null },
        selectProviderResult: { data: { id: testProviderId, api_identifier: 'openai-gpt-4o' }, error: null },
        insertChatResult: { data: { id: testChatId }, error: null },
        // Provide full valid ChatMessage structure for the *assistant* message insert result
        // This is what mainHandler returns in the response body via createJsonResponse
        // The select('*') in index.ts returns the inserted assistant message
        insertAssistantMessageResult: { data: { id: testAsstMsgId, chat_id: testChatId, role: 'assistant', content: testAiContent, created_at: now, user_id: null, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, updated_at: now } as ChatMessage, error: null },
        // We don't mock the user message insert result directly anymore, as it's not returned.
        // The mock client just needs to handle the insert call without error.
        // Assume createMockSupabaseClient handles generic inserts if not specified.
        selectChatHistoryResult: { data: [], error: null },
        // Only mockUser is needed if getUserResult is provided
        mockUser: { id: testUserId } // Keep this for direct client calls if needed, but getUserResult is primary
    };

    const mockFetchConfig: MockFetchConfig = {
        responseData: {
            choices: [{ message: { content: testAiContent } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        },
        status: 200,
    };

    // --- Individual Tests ---

    await t.step("OPTIONS request should return CORS headers", async () => {
        // No specific env needed
        // Pass mockFetchConfig as 2nd arg, empty {} as 3rd (envVars)
        const deps = createTestDeps({}, mockFetchConfig, {}); 
        const req = new Request('http://localhost/chat', { method: 'OPTIONS' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 204);
        assertExists(response.headers.get('Access-Control-Allow-Origin'));
        assertExists(response.headers.get('Access-Control-Allow-Headers'));
    });

    await t.step("GET request should return 405 Method Not Allowed", async () => {
        // No specific env needed
        // Pass mockFetchConfig as 2nd arg, empty {} as 3rd (envVars)
        const deps = createTestDeps({}, mockFetchConfig, {}); 
        const req = new Request('http://localhost/chat', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 405);
        const json = await response.json();
        assertEquals(json.error, 'Method Not Allowed');
    });

    await t.step("POST request missing Auth header should return 401", async () => {
        // Needs Supabase URL/Key for initial check
        const deps = createTestDeps({}, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Missing Auth
            body: JSON.stringify({ message: "test", providerId: "p", promptId: "pr" }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 401);
        const json = await response.json();
        assertObjectMatch(json, { error: "Authentication required", code: "AUTH_REQUIRED" });
    });

    await t.step("POST request with valid Auth header should succeed", async () => {
        console.log("--- Running Auth POST test --- ");
        // Needs full env vars
        const deps = createTestDeps(mockSupaConfig, mockFetchConfig, mockEnvVars);

        const requestBody = {
            // Match the structure expected by ChatRequest interface
            message: "Hello there AI!",
            providerId: testProviderId,
            promptId: testPromptId,
            // chatId: undefined // Test starting a new chat
        };
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-jwt-token', // Mock token
            },
            body: JSON.stringify(requestBody),
        });

        // Get the spied-on factory BEFORE calling mainHandler
        const clientFactorySpy = deps.createSupabaseClient as Spy<typeof createClient>;

        // Pass only req and deps to mainHandler
        const response = await mainHandler(req, deps);
        console.log("Auth POST test mainHandler completed.");

        assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
        const json = await response.json() as ChatMessage; // Assert response body is the assistant message

        // Assert AI response content (adjust based on actual payload structure)
        // The response body IS the assistant ChatMessage object
        assertEquals(json.content, testAiContent);
        assertEquals(json.role, 'assistant');
        assertEquals(json.id, testAsstMsgId);
        assertEquals(json.chat_id, testChatId); // Assert chatId is part of the message object
        // Check token usage if necessary
        assertObjectMatch(json.token_usage ?? {}, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });


        // Verify Supabase client factory was called (implicitly checks getEnv was used for keys)
        assertSpyCalls(clientFactorySpy, 1);

        // Verify fetch was called once with expected parameters
        const fetchSpy = deps.fetch as Spy<typeof fetch>;
        assertSpyCalls(fetchSpy, 1);
        const fetchArgUrl = fetchSpy.calls[0].args[0] as string;
        const fetchArgOptions = fetchSpy.calls[0].args[1] as RequestInit;
        assertEquals(fetchArgUrl, 'https://api.openai.com/v1/chat/completions');
        assertObjectMatch(JSON.parse(fetchArgOptions.body as string), {
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: mockSupaConfig.selectPromptResult?.data?.prompt_text },
                { role: 'user', content: requestBody.message }
                // History is empty in this specific mock config
            ]
        });

        // Verify Supabase interactions
        // Get the *mocked* client instance returned by the factory spy
        const mockClientInstance = clientFactorySpy.calls[0].returned as SupabaseClient;
         // Get the 'from' spy attached to the *mocked* client instance
        const fromSpy = mockClientInstance.from as Spy<any>;

        // Check specific table interactions
        // Auth: getUser (implicit, check client factory call)
        // Prompt: from('system_prompts').select().eq().eq().single() -> 1 call
        // Provider: from('ai_providers').select().eq().eq().single() -> 1 call
        // New Chat ID: from('chats').insert().select().single() -> 1 call
        // Insert User+Asst Msg: from('chat_messages').insert().select() -> 1 call (inserting array)
        // History: Not called in this specific test case (no initial chatId)
        // Expected 'from' calls = 4
        const fromCalls = fromSpy.calls.map(call => call.args[0]); // Get table names called with 'from'
        console.log("Supabase 'from' calls:", fromCalls);
        assertEquals(fromCalls.length, 4, `Expected 4 'from' calls, got ${fromCalls.length}`);
        assert(fromCalls.includes('system_prompts'), "Expected call to 'system_prompts'");
        assert(fromCalls.includes('ai_providers'), "Expected call to 'ai_providers'");
        assert(fromCalls.includes('chats'), "Expected call to 'chats' (for insert)");
        assert(fromCalls.includes('chat_messages'), "Expected call to 'chat_messages' (for insert)");

        // You could add more detailed checks on the .select(), .insert() spies if needed,
        // assuming createMockSupabaseClient provides access to those deeper spies.

        console.log("Auth POST test passed assertions.");
    }); // End Auth POST test step


    // Removed Anonymous POST test step

    // Implement the previously commented-out tests one by one
    // Test Case: Invalid JWT
    await t.step("POST request with invalid JWT returns 401", async () => {
         console.log("--- Running Invalid JWT POST test ---");
         // Needs Supabase URL/Key for initial check
         const deps = createTestDeps({
             getUserResult: { data: { user: null }, error: new Error("Simulated invalid JWT") }
         }, 
         mockFetchConfig, // Pass default fetch config
         mockEnvVars // Pass full env vars
         );
         const req = new Request('http://localhost/chat', {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 'Authorization': 'Bearer invalid-token'
             },
             body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
         });
         const response = await mainHandler(req, deps);
         assertEquals(response.status, 401);
         const json = await response.json();
         assertEquals(json.error, 'Invalid authentication credentials');
         console.log("--- Invalid JWT POST test passed ---");
    });

    // Test Case: Missing API Key for a SUPPORTED provider
    await t.step("POST request with missing API key env var returns 500", async () => {
         console.log("--- Running Missing API Key POST test ---");
         // Use the standard supaConfig (which uses openai-gpt-4o)
         const missingKeyEnv = { ...mockEnvVars, OPENAI_API_KEY: undefined };
         // Pass the modified env vars
         const deps = createTestDeps(mockSupaConfig, mockFetchConfig, missingKeyEnv);
         const req = new Request('http://localhost/chat', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
             // Body uses the standard testProviderId which maps to openai-gpt-4o in mockSupaConfig
             body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
         });
         const response = await mainHandler(req, deps);
         assertEquals(response.status, 500);
         const json = await response.json();
         assertEquals(json.error, 'AI provider configuration error on server.');
         console.log("--- Missing API Key POST test passed ---");
    });

    // Activate the next test: Existing Chat History
    await t.step("POST request with existing chat history", async () => {
         console.log("--- Running Existing History POST test ---");
         const history: Pick<ChatMessage, 'role' | 'content'>[] = [
             // Only need role and content for the history array sent to AI
             // and returned by the mock DB select
             { role: 'user', content: 'Previous user message' },
             { role: 'assistant', content: 'Previous assistant response' }
         ];
         const historySupaConfig = {
             ...mockSupaConfig,
             // Mock the DB response for history lookup
             selectChatHistoryResult: { data: history, error: null }
         };
         // Needs full env vars
         const deps = createTestDeps(historySupaConfig, mockFetchConfig, mockEnvVars);
         const requestBody = { message: "Follow up question", providerId: testProviderId, promptId: testPromptId, chatId: testChatId }; // Provide chatId
         const req = new Request('http://localhost/chat', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
             body: JSON.stringify(requestBody),
         });
         const response = await mainHandler(req, deps);
         assertEquals(response.status, 200);
         const json = await response.json() as ChatMessage;
         assertEquals(json.content, testAiContent);
         assertEquals(json.chat_id, testChatId);

         // Verify history was included in fetch payload
         const fetchSpy = deps.fetch as Spy<typeof fetch>;
         assertSpyCalls(fetchSpy, 1);
         const fetchPayload = JSON.parse(fetchSpy.calls[0].args[1]?.body as string);
         // Expect System + History User + History Asst + New User
         assertEquals(fetchPayload.messages.length, 4, "Payload should include system, history, and new user messages");
         assertEquals(fetchPayload.messages[1].content, history[0].content);
         assertEquals(fetchPayload.messages[2].content, history[1].content);
         assertEquals(fetchPayload.messages[3].content, requestBody.message);
         console.log("--- Existing History POST test passed ---");
    });

    // Test Case: Invalid providerId
    await t.step("POST request with invalid providerId returns 400", async () => {
        console.log("--- Running Invalid providerId POST test ---");
        const invalidProviderSupaConfig = {
            ...mockSupaConfig,
            // Simulate provider lookup failure
            selectProviderResult: { data: null, error: new Error("Test: Provider not found") }
        };
        const deps = createTestDeps(invalidProviderSupaConfig, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            // Use a providerId that will trigger the mocked error
            body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, "Test: Provider not found");
        console.log("--- Invalid providerId POST test passed ---");
    });

    // Test Case: Invalid promptId
    await t.step("POST request with invalid promptId returns 400", async () => {
        console.log("--- Running Invalid promptId POST test ---");
        const invalidPromptSupaConfig = {
            ...mockSupaConfig,
            // Simulate prompt lookup failure
            selectPromptResult: { data: null, error: new Error("Test: Prompt not found") }
        };
        const deps = createTestDeps(invalidPromptSupaConfig, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            // Use a promptId that will trigger the mocked error
            body: JSON.stringify({ message: "test", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, "Test: Prompt not found");
        console.log("--- Invalid promptId POST test passed ---");
    });

    // Test Case: promptId = '__none__'
    await t.step("POST request with promptId __none__ succeeds", async () => {
        console.log("--- Running promptId __none__ POST test ---");
        // Use standard successful config
        const deps = createTestDeps(mockSupaConfig, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test no prompt", providerId: testProviderId, promptId: '__none__' }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        // Verify the fetch call payload had no system message
        const fetchSpy = deps.fetch as Spy<typeof fetch>;
        assertSpyCalls(fetchSpy, 1);
        const fetchPayload = JSON.parse(fetchSpy.calls[0].args[1]?.body as string);
        // Should only contain the user message
        assertEquals(fetchPayload.messages.length, 1);
        assertEquals(fetchPayload.messages[0].role, 'user');
        assertEquals(fetchPayload.messages[0].content, 'test no prompt');
        console.log("--- promptId __none__ POST test passed ---");
    });

    // Test Case: Database error during insert
    await t.step("POST request with DB insert error returns 500", async () => {
        console.log("--- Running DB Insert Error POST test ---");
        const dbErrorSupaConfig: MockSupabaseDataConfig = {
            ...mockSupaConfig,
            // Simulate the error specifically on the chat insertion result
            // Remove the global simulateDbError flag
            // simulateDbError: new Error("Test: DB Insert Failed") 
            insertChatResult: { data: null, error: new Error("Test: Chat Insert Failed") } 
        };
        const deps = createTestDeps(dbErrorSupaConfig, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            // Send request without chatId to trigger the 'chats' insert path
            body: JSON.stringify({ message: "trigger db error", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        const json = await response.json();
        // Check error message based on where the error occurs (chats insert first)
        assertEquals(json.error, "Failed to initiate new chat session."); 
        console.log("--- DB Insert Error POST test passed ---");
    });

    // Test Case: Fetch error calling AI Provider
    await t.step("POST request with AI provider fetch error returns 502", async () => {
        console.log("--- Running AI Fetch Error POST test ---");
        // Create a fetch config that simulates an error response from the AI API
        const fetchErrorConfig: MockFetchConfig = {
            responseData: { error: { message: "AI provider unavailable" } }, // Example error payload
            status: 503 // Simulate a server error from the AI provider
        };
        // Use standard supa config, but override fetch config
        const deps = createTestDeps(mockSupaConfig, fetchErrorConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger fetch error", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 502); // Expect Bad Gateway from our function
        const json = await response.json();
        // Trim both strings to avoid hidden whitespace issues
        assertEquals(json.error?.trim(), "Failed to get response from AI provider: AI API request failed:".trim());
        console.log("--- AI Fetch Error POST test passed ---");
    });

    // Test Cases: Input Validation Errors
    await t.step("POST request with missing message returns 400", async () => {
        console.log("--- Running Missing Message POST test ---");
        const deps = createTestDeps({}, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ providerId: testProviderId, promptId: testPromptId }), // Missing message
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, 'Missing or invalid "message" in request body');
        console.log("--- Missing Message POST test passed ---");
    });

    await t.step("POST request with missing providerId returns 400", async () => {
        console.log("--- Running Missing providerId POST test ---");
        const deps = createTestDeps({}, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test", promptId: testPromptId }), // Missing providerId
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, 'Missing or invalid "providerId" in request body');
        console.log("--- Missing providerId POST test passed ---");
    });

    await t.step("POST request with missing promptId returns 400", async () => {
        console.log("--- Running Missing promptId POST test ---");
        const deps = createTestDeps({}, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "test", providerId: testProviderId }), // Missing promptId
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, 'Missing or invalid "promptId" in request body');
        console.log("--- Missing promptId POST test passed ---");
    });

    // Test Case: Error fetching chat history
    await t.step("POST request with history fetch error proceeds as new chat", async () => {
        console.log("--- Running History Fetch Error POST test ---");
        const historyErrorSupaConfig = {
            ...mockSupaConfig,
            // Simulate history lookup failure
            selectChatHistoryResult: { data: null, error: new Error("Test: History fetch failed") }
        };
        const deps = createTestDeps(historyErrorSupaConfig, mockFetchConfig, mockEnvVars);
        // Send request *with* a chatId that will fail during lookup
        const requestBody = { message: "initiate with bad history chatid", providerId: testProviderId, promptId: testPromptId, chatId: 'some-id-that-will-fail-lookup' }; 
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify(requestBody),
        });
        const response = await mainHandler(req, deps);
        // Should recover and succeed by creating a new chat
        assertEquals(response.status, 200);
        const json = await response.json() as ChatMessage;
        // Assert the chatId in the response is the NEW id from insertChatResult, not the failed one
        assertEquals(json.chat_id, testChatId); 

        // Verify the fetch call payload had no history messages
        const fetchSpy = deps.fetch as Spy<typeof fetch>;
        assertSpyCalls(fetchSpy, 1);
        const fetchPayload = JSON.parse(fetchSpy.calls[0].args[1]?.body as string);
        // Should include system + user message only
        assertEquals(fetchPayload.messages.length, 2); 
        assertEquals(fetchPayload.messages[0].role, 'system');
        assertEquals(fetchPayload.messages[1].role, 'user');
        console.log("--- History Fetch Error POST test passed ---");
    });

    // Test Case: Error inserting chat_messages
    await t.step("POST request with message insert error returns 500", async () => {
        console.log("--- Running Message Insert Error POST test ---");
        const messageInsertErrorSupaConfig = {
            ...mockSupaConfig,
            // Simulate message insert failure
            // Keep insertChatResult successful
            insertUserMessageResult: { data: { id: testUserMsgId } as any, error: null }, // Assume user msg insert okay
            insertAssistantMessageResult: { data: null, error: new Error("Test: Message insert failed") }
        };
        const deps = createTestDeps(messageInsertErrorSupaConfig, mockFetchConfig, mockEnvVars);
        // Send request without chatId to trigger full insert flow
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger message insert error", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        const json = await response.json();
        assertEquals(json.error, "Failed to save chat messages.");
        console.log("--- Message Insert Error POST test passed ---");
    });

    // Test Case: Whitespace-only message
    await t.step("POST request with whitespace-only message returns 400", async () => {
        console.log("--- Running Whitespace Message POST test ---");
        const deps = createTestDeps({}, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "   ", providerId: testProviderId, promptId: testPromptId }), // Whitespace message
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, 'Missing or invalid "message" in request body');
        console.log("--- Whitespace Message POST test passed ---");
    });

    // Test Case: Inactive Prompt
    await t.step("POST request with inactive prompt returns 400", async () => {
        console.log("--- Running Inactive Prompt POST test ---");
        const inactivePromptSupaConfig = {
            ...mockSupaConfig,
            // Simulate prompt lookup returning null (as if is_active=false filter excluded it)
            selectPromptResult: { data: null, error: null } 
        };
        const deps = createTestDeps(inactivePromptSupaConfig, mockFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            // Use a promptId that will trigger the mocked null result
            body: JSON.stringify({ message: "test inactive prompt", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 400);
        const json = await response.json();
        assertEquals(json.error, "System prompt not found or inactive.");
        console.log("--- Inactive Prompt POST test passed ---");
    });

    // Test Case: Malformed AI Response (200 OK, but bad body)
    await t.step("POST request with malformed AI response returns 500", async () => {
        console.log("--- Running Malformed AI Response POST test ---");
        const malformedFetchConfig: MockFetchConfig = {
            responseData: { wrong_key: "no choices here" }, // Payload missing choices[0].message.content
            status: 200 // Status is OK, but body is wrong
        };
        const deps = createTestDeps(mockSupaConfig, malformedFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger malformed response", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        const json = await response.json();
        assertEquals(json.error, "Error processing AI response: Invalid response structure from AI provider.");
        console.log("--- Malformed AI Response POST test passed ---");
    });

    // Test Case: Network error during fetch
    await t.step("POST request with fetch network error returns 502", async () => {
        console.log("--- Running Fetch Network Error POST test ---");
        const networkErrorFetchConfig: MockFetchConfig = {
            responseData: null, // Not relevant as it will throw
            shouldThrow: new Error("Simulated ECONNREFUSED") // Simulate a network error
        };
        const deps = createTestDeps(mockSupaConfig, networkErrorFetchConfig, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt-token' },
            body: JSON.stringify({ message: "trigger network error", providerId: testProviderId, promptId: testPromptId }),
        });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 502); // Expect Bad Gateway
        const json = await response.json();
        assertEquals(json.error, "Failed to get response from AI provider: Simulated ECONNREFUSED");
        console.log("--- Fetch Network Error POST test passed ---");
    });

    /* TODO: Consider other edge cases? 
       - Add is_active check for providers in index.ts?
       - Specific provider failures (e.g., Anthropic if added)?
    */

}); // End Test Suite