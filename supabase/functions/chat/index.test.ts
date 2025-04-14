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
  type MockSupabaseDataConfig
} from "../_shared/test-utils.ts";
// Import ChatMessage type (adjust path if necessary)
import type { ChatMessage } from '../../../packages/types/src/ai.types.ts';

// --- Mock Data ---
const mockSupabaseUrl = 'http://localhost:54321';
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const mockAnonSecret = 'test-secret-123';
const mockIpAddress = "127.0.0.1"; // Define IP for ConnInfo

// Define mock ConnInfo using ConnInfo type from std/http/server.ts
const mockConnInfo: ConnInfo = {
  // Provide required fields for ConnInfo
  localAddr: { transport: "tcp", hostname: "localhost", port: 8000 },
  remoteAddr: { transport: "tcp", hostname: mockIpAddress, port: 12345 },
  // completed: Promise.resolve(), // Removed - Not part of ConnInfo
};


// --- Mock Implementations (Local to test file) ---

// Define a simple type for fetch config
interface MockFetchConfig { responseData: any, status?: number }

// Mock fetch function (Define locally)
const createMockFetch = (responseData: any, status = 200) => {
  return spy(async (_url: string | URL | Request, _options?: RequestInit): Promise<Response> => {
    const mockResponse = new Response(JSON.stringify(responseData), {
      status: status, // Use the status passed in fetchConfig
      headers: { 'Content-Type': 'application/json' },
    });
    // Add a simple mock .json() method directly
    (mockResponse as any).json = async () => responseData;
    console.log(`[Mock Fetch] Returning mocked response (Status: ${status}).`);
    return mockResponse;
  });
};

// Mock KV Store (Use Deno's in-memory implementation)
const createRateLimitKvMock = async () => {
    // Using :memory: ensures tests don't interfere via shared file state
    return await Deno.openKv(':memory:');
};

// --- Helper to create COMPLETE Test Dependencies ---
const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  // Default fetchConfig requires responseData
  fetchConfig: MockFetchConfig = { responseData: {} },
  envVars: Record<string, string> = {},
  depOverrides: Partial<ChatHandlerDeps> = {}
): ChatHandlerDeps => {

  const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
  // Pass status from fetchConfig to createMockFetch
  const mockFetch = createMockFetch(fetchConfig.responseData, fetchConfig.status);

  const mockGetEnv = spy((key: string): string | undefined => {
    if (key in envVars) return envVars[key];
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
    if (key === 'ANON_FUNCTION_SECRET') return mockAnonSecret;
    return Deno.env.get(key);
  });

  // Use a real response creation function but log errors
  const createErrorResponse = (message: string, status = 500, headers = {}) => {
      console.error(`API Error (${status}): ${message}`); // Log errors during tests
      return new Response(JSON.stringify({ error: message }), {
          headers: { ...realDefaultDeps.corsHeaders, 'Content-Type': 'application/json', ...headers },
          status: status,
      });
  };

  const deps: ChatHandlerDeps = {
    ...realDefaultDeps, // Start with real defaults
    createSupabaseClient: spy(() => mockSupabaseClient), // Use the mock client
    getEnv: mockGetEnv,
    fetch: mockFetch,
    openKv: createRateLimitKvMock, // Use simple KV mock
    createErrorResponse: createErrorResponse,
    // Use default createJsonResponse from realDefaultDeps unless overridden
    createJsonResponse: realDefaultDeps.createJsonResponse,
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
        // Removed fields not present in MockSupabaseDataConfig interface in test-utils.ts
        // TODO: Consider expanding the interface in test-utils.ts if these fields are needed by tests
        selectPromptResult: { data: { id: testPromptId, prompt_text: 'Test system prompt' }, error: null },
        selectProviderResult: { data: { id: testProviderId, api_identifier: 'openai-gpt-4o' }, error: null },
        insertChatResult: { data: { id: testChatId }, error: null },
        // Provide full valid ChatMessage structure
        insertUserMessageResult: { data: { id: testUserMsgId, chat_id: testChatId, role: 'user', content: 'Hello AI', created_at: now, user_id: testUserId, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: null, updated_at: now } as ChatMessage, error: null },
        insertAssistantMessageResult: { data: { id: testAsstMsgId, chat_id: testChatId, role: 'assistant', content: testAiContent, created_at: now, user_id: null, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, updated_at: now } as ChatMessage, error: null }, // Added token usage example
        selectChatHistoryResult: { data: [], error: null },
        // Match the interface { id: string } for mockUser
        mockUser: { id: testUserId }
    };
    // Corrected fetch config key name
    const mockFetchConfig: MockFetchConfig = {
        responseData: {
            choices: [{ message: { content: testAiContent } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } // Add usage to match insertAssistantMessageResult
        },
        status: 200, // Use 'status', not 'responseStatus'
    };
    const mockEnvVars = {
        SUPABASE_URL: mockSupabaseUrl,
        SUPABASE_ANON_KEY: mockAnonKey,
        OPENAI_API_KEY: mockOpenAiKey,
        ANON_FUNCTION_SECRET: mockAnonSecret,
    };

    // --- Individual Tests ---

    await t.step("OPTIONS request should return CORS headers", async () => {
        // Pass valid default fetchConfig
        const deps = createTestDeps({}, { responseData: {} });
        const req = new Request('http://localhost/chat', { method: 'OPTIONS' });
        // Use the corrected mockConnInfo (Deno.ServeHandlerInfo)
        const response = await mainHandler(req, mockConnInfo, deps);
        assertEquals(response.status, 204);
        assertExists(response.headers.get('Access-Control-Allow-Origin'));
        assertExists(response.headers.get('Access-Control-Allow-Headers'));
    });

    await t.step("GET request should return 405 Method Not Allowed", async () => {
        // Pass valid default fetchConfig
        const deps = createTestDeps({}, { responseData: {} });
        const req = new Request('http://localhost/chat', { method: 'GET' });
        // Use the corrected mockConnInfo (Deno.ServeHandlerInfo)
        const response = await mainHandler(req, mockConnInfo, deps);
        assertEquals(response.status, 405);
        const json = await response.json();
        assertEquals(json.error, 'Method Not Allowed');
    });

    await t.step("POST request missing Auth and Anon Secret headers should return 401", async () => {
        // Pass valid default fetchConfig
        const deps = createTestDeps({}, { responseData: {} }, mockEnvVars);
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "test", providerId: "p", promptId: "pr" }),
        });
        // Use the corrected mockConnInfo (Deno.ServeHandlerInfo)
        const response = await mainHandler(req, mockConnInfo, deps);
        assertEquals(response.status, 401);
        const json = await response.json();
        assertEquals(json.error, 'Unauthorized');
    });

    // ***** ISOLATED TEST CASE *****
    await t.step("Mock Supabase Client .single() for 'chats' insert should resolve", async () => {
        console.log("--- Running isolated mock single() test --- ");
        // Pass valid default fetchConfig
        const testDeps = createTestDeps(mockSupaConfig, { responseData: {} }, {});
        // Get the client instance from the factory function within deps
        const mockClient = testDeps.createSupabaseClient('', '');
        assertExists(mockClient, "Mock client should be created");

        try {
            console.log("Calling mock insert/select/single for 'chats'...");
            const result = await mockClient
                .from('chats')
                .insert({ user_id: testUserId, title: 'test-title' }) // Use defined ID
                .select('id')
                .single();
            console.log("Mock 'chats' insert/select/single call completed.");

            assertEquals(result.error, null);
            // Check against the defined testChatId
            assertEquals(result.data?.id, testChatId);
            console.log("Assertions passed for isolated mock single() test.");
        } catch (err) {
            console.error("Error in isolated mock single() test:", err);
            // Assert err as Error before accessing message
            assert(false, `Isolated test failed: ${(err as Error).message || err}`);
        }
        console.log("--- Finished isolated mock single() test --- ");
    });
    // ***** END ISOLATED TEST CASE *****

    await t.step("POST request with valid Auth header should succeed", async () => {
        console.log("--- Running Auth POST test --- ");
        // Pass all relevant configs
        // Ensure mockUser IS set in mockSupaConfig for this test
        const authSupaConfig = { ...mockSupaConfig, mockUser: { id: testUserId } }; // Use correct mockUser structure
        const deps = createTestDeps(authSupaConfig, mockFetchConfig, mockEnvVars);

        const requestBody = {
            // Ensure message content matches mock data if needed for assertions later
            message: mockSupaConfig.insertUserMessageResult?.data?.content || "Fallback message",
            providerId: testProviderId, // Use defined ID from mockSupaConfig
            promptId: testPromptId, // Use defined ID from mockSupaConfig
        };
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-jwt-token', // Mock token
            },
            body: JSON.stringify(requestBody),
        });

        try {
            // Ensure createSupabaseClient is spied on
            const clientFactorySpy = deps.createSupabaseClient as Spy<typeof createClient>;

             // Use the corrected mockConnInfo (Deno.ServeHandlerInfo)
            const response = await mainHandler(req, mockConnInfo, deps);
            console.log("Auth POST test mainHandler completed.");

            assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
            const json = await response.json();

            // Assertions:
            // Use assertSpyCalls (now imported)
            assertSpyCalls(clientFactorySpy, 1); // Ensure Supabase client was created

            // Check the response structure matches the full mock data
            assertEquals(json.chatId, testChatId);
            // Use assertObjectMatch for messages as timestamps might differ slightly
            assertObjectMatch(json.userMessage, {
                id: testUserMsgId,
                chat_id: testChatId,
                role: 'user',
                content: requestBody.message, // Check against the sent message
                user_id: testUserId,
                ai_provider_id: testProviderId,
                system_prompt_id: testPromptId,
                token_usage: null // Expect null based on mock data
            });
             assertObjectMatch(json.assistantMessage, {
                id: testAsstMsgId,
                chat_id: testChatId,
                role: 'assistant',
                content: testAiContent, // Ensure this matches fetch mock
                user_id: null,
                ai_provider_id: testProviderId,
                system_prompt_id: testPromptId,
                token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } // Expect usage based on mock data
            });
            assertEquals(json.assistantMessage?.content, testAiContent); // Verify content explicitly

            console.log("Assertions passed for Auth POST test.");
        } catch (err) {
            console.error("Error in Auth POST test:", err);
            // Assert err as Error before accessing message
            assert(false, `Auth POST test failed: ${(err as Error).message || err}`);
        }
        console.log("--- Finished Auth POST test --- ");
    });

    // --- TODO: Add tests for --- //
    // - POST request with valid Anon Secret (below rate limit)
    await t.step("POST request with valid Anon Secret header should succeed (below rate limit)", async () => {
        console.log("--- Running Anon Secret POST test (below limit) --- ");
        // Ensure mockUser is NOT set for anonymous tests
        const anonSupaConfig = { ...mockSupaConfig, mockUser: undefined }; 
        // Ensure Rate Limit KV is fresh for this test
        const kv = await createRateLimitKvMock(); 
        // Optionally clear specific keys if needed, but :memory: handles isolation
        // await kv.delete(["ip_rate_limit", mockIpAddress]);

        const deps = createTestDeps(anonSupaConfig, mockFetchConfig, mockEnvVars, {
            openKv: () => Promise.resolve(kv) // Ensure this specific KV instance is used
        });
        const requestBody = {
            message: "Hello Anon AI",
            providerId: testProviderId, // Use defined ID
            promptId: testPromptId,     // Use defined ID (or __none__ if applicable)
        };
        const req = new Request('http://localhost/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // NO Authorization header
                'X-Paynless-Anon-Secret': mockAnonSecret, // Use the mock secret
            },
            body: JSON.stringify(requestBody),
        });

        try {
            // Spy on openKv if needed for call count assertions
            const openKvSpy = deps.openKv as Spy<typeof createRateLimitKvMock>; 

            const response = await mainHandler(req, mockConnInfo, deps);
            console.log("Anon Secret POST test mainHandler completed.");

            assertEquals(response.status, 200, `Expected status 200 but got ${response.status}`);
            const json = await response.json();

            // Assertions for successful anonymous chat:
            assertSpyCalls(openKvSpy, 1); // Check rate limiter was invoked

            assertEquals(json.chatId, null, "chatId should be null for anonymous requests");
            // Check message structure (content might come from fetch mock)
            assertObjectMatch(json.userMessage, {
                role: 'user',
                content: requestBody.message,
                chat_id: '__anonymous__', // Expect specific anonymous marker
            });
            assertObjectMatch(json.assistantMessage, {
                role: 'assistant',
                content: testAiContent, // Matches fetch mock
                chat_id: '__anonymous__',
                token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } // Check token usage if returned
            });
            assertEquals(json.assistantMessage?.content, testAiContent);

            console.log("Assertions passed for Anon Secret POST test.");
        } catch (err) {
            console.error("Error in Anon Secret POST test:", err);
            assert(false, `Anon Secret POST test failed: ${(err as Error).message || err}`);
        } finally {
             kv.close(); // Close the in-memory KV store
        }
        console.log("--- Finished Anon Secret POST test --- ");
    });

    // - POST request with valid Anon Secret (above rate limit)
    // - POST request with invalid Anon Secret
    // - POST request with invalid JWT
    // - POST request with missing/invalid body fields (e.g., no message)
    // - POST request where provider/prompt lookup fails (simulate error in mockSupaConfig)
    // - POST request where AI API call fails (error status in mockFetchConfig)
    // - POST request where DB insert fails (simulateDbError in mockSupaConfig)

});