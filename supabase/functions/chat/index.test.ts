import {
  assertSpyCall,
  assertSpyCalls,
  spy,
  stub,
  type Spy,
  type Stub,
} from "jsr:@std/testing@0.225.1/mock"; // Use same version as login test
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

// Import the handler and dependency interface
import { mainHandler as dynamicallyImportedHandler, type ChatHandlerDeps } from "./index.ts";
// Import from the compiled definition file in dist
import type { ChatMessage } from '../../../packages/types/dist/ai.types.d.ts';

// --- Test Setup ---
let mainHandler: (req: Request, deps?: Partial<ChatHandlerDeps>) => Promise<Response>;
let envStub: Stub | undefined;

const mockSupabaseUrl = "http://mock-supabase.co";
const mockAnonKey = "mock-anon-key";
const mockOpenAiKey = "sk-mock-openai-key";

const setup = async () => {
  console.log("[Test Setup] Stubbing Deno.env.get for chat/index.ts module load");
  envStub = stub(Deno.env, "get", (key) => {
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
    // Add other env vars if needed by the handler (e.g., ANTHROPIC_API_KEY)
    return undefined;
  });

  // Dynamically import the handler *after* stubbing env vars
  // Add random query string to bust Deno's module cache
  const module = await import(`./index.ts?id=${Math.random()}`);
  mainHandler = module.mainHandler;
  console.log("[Test Setup] mainHandler imported dynamically.");
};

const teardown = () => {
  if (envStub) {
    envStub.restore();
    console.log("[Test Teardown] Restored Deno.env.get");
  }
};

// --- Test Suite ---
Deno.test("Chat Function Tests", {
  sanitizeOps: false, // Prevent errors related to fetch/async ops in tests
  sanitizeResources: false,
}, async (t) => {
  await setup();

  // --- Mock Dependencies Helper ---
  const createMockDeps = (overrides: Partial<ChatHandlerDeps> = {}): ChatHandlerDeps => {
    // Mock Data specific to this test suite
    const mockUserId = 'user-123';
    const mockChatId = 'chat-abc';
    const mockProviderId = 'provider-openai-xyz'; // Make distinct
    const mockPromptId = 'prompt-def';
    const mockAiResponseContent = 'Hello from mock AI!';
    const mockAssistantMessageId = 'msg-assistant-789';

    // Define the shape of the message to be returned by insert().select()
    const assistantMessageResult = {
      id: mockAssistantMessageId,
      chat_id: mockChatId,
      user_id: null,
      role: 'assistant',
      content: mockAiResponseContent,
      ai_provider_id: mockProviderId,
      system_prompt_id: mockPromptId,
      token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      created_at: new Date().toISOString(),
    } as unknown as ChatMessage; // Use type assertion

    const userMessageResult = {
        id: 'msg-user-temp', // temp id
        chat_id: mockChatId,
        user_id: mockUserId,
        role: 'user',
        content: 'User message content', // Note: Actual content comes from request
        ai_provider_id: mockProviderId,
        system_prompt_id: mockPromptId,
        token_usage: null,
        created_at: new Date().toISOString(),
    } as unknown as ChatMessage;

    // Mock the query builder chain
    // Use a factory to create a fresh builder mock for each `from` call
    const createMockQueryBuilder = (tableName: string) => {
        let insertCalled = false;
        let selectAfterInsertShouldReturn = false;
        let insertedData: any[] | null = null; // Store data passed to insert

        const builder = {
            select: spy((query: string = '*') => {
                console.log(`[Mock QB ${tableName}] .select(${query}) called`);
                // If select follows an insert on chat_messages, prepare to return mock data
                if (tableName === 'chat_messages' && insertCalled) {
                    console.log(`[Mock QB ${tableName}] .select() will return inserted data`);
                    selectAfterInsertShouldReturn = true;
                    insertCalled = false; // Reset flag
                }
                // For chats insert, make select return the ID
                if (tableName === 'chats' && insertCalled) {
                    console.log(`[Mock QB ${tableName}] .select() will return new chat ID`);
                    selectAfterInsertShouldReturn = true; // Need single() to resolve it
                    insertCalled = false;
                }
                return builder;
            }),
            insert: spy((values: any[]) => {
                console.log(`[Mock QB ${tableName}] .insert() called with:`, values);
                insertedData = values; // Capture the inserted data
                insertCalled = true; // Set flag for subsequent select
                return builder;
            }),
            eq: spy((column: string, value: any) => {
                console.log(`[Mock QB ${tableName}] .eq(${column}, ${value}) called`);
                return builder;
            }),
            order: spy((column: string, options?: any) => {
                console.log(`[Mock QB ${tableName}] .order(${column}, ${JSON.stringify(options)}) called`);
                return builder;
            }),
            single: spy(async () => {
                console.log(`[Mock QB ${tableName}] .single() called`);
                if (tableName === 'system_prompts') {
                    return { data: { id: mockPromptId, prompt_text: 'Mock system prompt' }, error: null };
                }
                if (tableName === 'ai_providers') {
                    return { data: { id: mockProviderId, api_identifier: 'openai-gpt-4o' }, error: null };
                }
                if (tableName === 'chats' && selectAfterInsertShouldReturn) {
                    selectAfterInsertShouldReturn = false; // Reset flag
                    return { data: { id: mockChatId }, error: null }; // Return newly created chat ID
                }
                // Default case for single()
                return { data: null, error: null };
            }),
            // Add `then` handler for promises originating from `select` without `single`
            then: async (onfulfilled: (value: { data: any; error: any; }) => any) => {
                console.log(`[Mock QB ${tableName}] .then() called (resolving select promise)`);
                if (tableName === 'chat_messages' && selectAfterInsertShouldReturn) {
                    selectAfterInsertShouldReturn = false; // Reset flag
                    console.log(`[Mock QB ${tableName}] .then() resolving insert().select() with captured data`);
                    // Construct result based on the *captured* insertedData
                    const resolvedData = insertedData ? insertedData.map(item => ({
                        ...item,
                        id: item.role === 'assistant' ? mockAssistantMessageId : `mock-user-id-${Date.now()}`,
                        created_at: new Date().toISOString(),
                        // Add other DB defaults if needed
                    })) : [];
                    insertedData = null; // Clear captured data
                    return onfulfilled({ data: resolvedData, error: null });
                }
                if (tableName === 'chat_messages') { // History fetch
                    console.log(`[Mock QB ${tableName}] .then() resolving history select`);
                    return onfulfilled({ data: [], error: null }); // Return empty history
                }
                // Default resolution for other selects
                 console.log(`[Mock QB ${tableName}] .then() resolving with default`);
                return onfulfilled({ data: null, error: null });
            }
        } as any; // Use `any` to simplify complex builder type
        return builder;
    };

    // Base Mocks
    const baseDeps: ChatHandlerDeps = {
      // Mock fetch for AI API calls
      fetch: spy(async (url: string | URL | Request, _options?: RequestInit) => {
        const urlString = url.toString();
        if (urlString.includes('api.openai.com')) {
          console.log('[Mock Fetch] Intercepted OpenAI call');
          return Promise.resolve(
            new Response(JSON.stringify({
              choices: [{ message: { role: 'assistant', content: mockAiResponseContent } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          );
        }
        // Add mock for Anthropic if needed, or default to error/passthrough
        console.warn(`[Mock Fetch] Unhandled fetch call to: ${urlString}`);
        return Promise.resolve(new Response('Mock fetch error: Unhandled URL', { status: 500 }));
      }),
      // Mock environment variable access
      getEnv: spy((key: string) => {
        if (key === 'SUPABASE_URL') return mockSupabaseUrl;
        if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
        if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
        // Add others as needed
        return undefined;
      }),
      // Mock Response creators
      createJsonResponse: spy((data: unknown, status: number = 200, headers = {}) => new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json', ...baseDeps.corsHeaders, ...headers } })),
      createErrorResponse: spy((message: string, status: number = 500, headers = {}) => new Response(JSON.stringify({ error: message }), { status: status, headers: { 'Content-Type': 'application/json', ...baseDeps.corsHeaders, ...headers } })),
      corsHeaders: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
      // Mock Supabase client creation and its methods
      createSupabaseClient: spy((_url, _key, _options) => {
        const mockAuth = {
          // Return a mock user successfully
          getUser: spy(() => Promise.resolve({ data: { user: { id: mockUserId } }, error: null }))
        };

        const mockClient = {
          auth: mockAuth,
          from: spy((tableName: string) => {
            console.log(`[Mock Supa Client] .from(${tableName}) called`);
            return createMockQueryBuilder(tableName);
          }),
        } as unknown as SupabaseClient;

        return mockClient;
      }),
      // Allow overrides
      ...overrides,
    };
    return baseDeps;
  };

  // --- Test Cases ---

  await t.step("OPTIONS request should return CORS headers", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://localhost/chat", { method: "OPTIONS" });
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 204);
    // CORS headers are added directly in the handler for OPTIONS
    assert(res.headers.has('access-control-allow-origin'));
  });

   await t.step("GET request should return 405 Method Not Allowed", async () => {
      const mockDeps = createMockDeps();
      const req = new Request('http://localhost/chat', { method: 'GET' });
      const res = await mainHandler(req, mockDeps);
      assertEquals(res.status, 405);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method Not Allowed", 405] });
    });

   await t.step("POST request missing Auth header should return 401", async () => {
      const mockDeps = createMockDeps();
      const req = new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'test', providerId: 'p', promptId: 'pr' })
      });
      const res = await mainHandler(req, mockDeps);
      assertEquals(res.status, 401);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Missing Authorization header", 401] });
    });

  await t.step("POST request with valid data should return assistant message with ID", async () => {
    const mockDeps = createMockDeps();

    // Mock Data for this specific test
    const mockUserMessage = 'Hello, test assistant!';
    const mockProviderId = 'provider-openai-xyz'; // Use ID that matches mock setup
    const mockPromptId = 'prompt-def';
    const mockChatId = 'chat-abc';
    const mockAssistantMessageId = 'msg-assistant-789'; // Expected ID

    // Request
    const requestBody = {
      message: mockUserMessage,
      providerId: mockProviderId,
      promptId: mockPromptId,
      chatId: mockChatId, // Assume existing chat
    };
    const request = new Request('http://localhost/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer fake-jwt-token`,
      },
      body: JSON.stringify(requestBody),
    });

    // Execute
    const response = await mainHandler(request, mockDeps);
    console.log('[Test] Handler returned response status:', response?.status);

    // Assertions
    assertEquals(response.status, 200, `Expected status 200, got ${response.status}`);
    assertExists(response.body, 'Response body should exist');

    const contentType = response.headers.get('content-type');
    assertEquals(contentType?.includes('application/json'), true, `Expected JSON response, got ${contentType}`);

    const result = await response.json() as ChatMessage;
    console.log('[Test] Parsed response body:', result);

    assertEquals(result.role, 'assistant', `Expected role 'assistant', got ${result.role}`);
    assertExists(result.id, 'Assistant message ID should exist');
    assertEquals(result.id, mockAssistantMessageId, `Expected ID ${mockAssistantMessageId}, got ${result.id}`);
    assertEquals(result.chat_id, mockChatId, `Expected chat_id ${mockChatId}, got ${result.chat_id}`);
    assertEquals(result.content, 'Hello from mock AI!', `Expected content didn't match`);

    // Verify mocks were called
    assertSpyCall(mockDeps.getEnv as Spy, 0, { args: ['SUPABASE_URL'] });
    assertSpyCall(mockDeps.createSupabaseClient as Spy, 0);
    // Spy calls on the client returned by createSupabaseClient
    // This requires accessing the *instance* returned by the spy
    const clientSpy = mockDeps.createSupabaseClient as any;
    const mockClientInstance = clientSpy.calls[0]?.returned;
    assertExists(mockClientInstance, "Mock client instance should have been created");
    assertSpyCall(mockClientInstance.auth.getUser as Spy, 0);
    // More detailed spy call checks on .from(), .select(), .insert() if needed
    assertSpyCall(mockDeps.fetch as Spy, 0); // Check AI API call
    assertSpyCall(mockDeps.createJsonResponse as Spy, 0); // Check success response

  });

    await t.step("POST request with __none__ prompt should succeed", async () => {
      const mockDeps = createMockDeps();
      const requestBody = {
        message: "No prompt test",
        providerId: 'provider-openai-xyz',
        promptId: '__none__',
        chatId: 'chat-none-prompt',
      };
      const request = new Request('http://localhost/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake-jwt-token`,
        },
        body: JSON.stringify(requestBody),
      });
      const response = await mainHandler(request, mockDeps);
      assertEquals(response.status, 200);
      const result = await response.json() as ChatMessage;
      assertEquals(result.role, 'assistant');
      assertEquals(result.system_prompt_id, null); // Check null prompt ID
      assertSpyCall(mockDeps.createJsonResponse as Spy, 0);
      // Verify system_prompts table was NOT queried
      const clientSpy = mockDeps.createSupabaseClient as any;
      const mockClientInstance = clientSpy.calls[0]?.returned;
      const fromSpy = mockClientInstance.from as any;
      // Check that from('system_prompts') was never called
      const systemPromptCall = fromSpy.calls.some((call: any) => call.args[0] === 'system_prompts');
      assertEquals(systemPromptCall, false, "Should not have called from('system_prompts')");
    });

    // Add more test cases: Invalid providerId, promptId not found, AI API error, DB insert error, etc.

  // --- Teardown after all tests ---
  teardown();
});

// Remove the old test code that used prototype stubbing
/*
// --- Old Test Case (using prototype stubbing - remove) ---
Deno.test('OLD Chat handler should return assistant message with an ID', async (t) => {
  // ... keep mock data ...
  // --- Mock Implementations (Old Style) ---
  // ... remove Deno.env stub ...
  // ... remove global fetch stub ...
  // ... remove SupabaseClient prototype stub ...
  // ... remove getUser stub ...
  // --- Request (same) ---
  // --- Execute (call handler directly) ---
  // let response = await OldHandler(request); // Assume OldHandler is the original export
  // --- Assertions (same) ---
  // --- Cleanup (remove stub.restore()) ---
});
*/ 