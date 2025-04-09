import {
  assertSpyCall,
  spy,
  stub,
  type Spy,
  type Stub,
} from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

// Import the handler and dependency interface
import { type ChatDetailsHandlerDeps } from "./index.ts";
// Import the type for the expected response structure (adjust path if needed)
import type { ChatMessage } from '../../../packages/types/dist/ai.types.d.ts';

// --- Test Setup ---
let mainHandler: (req: Request, deps?: Partial<ChatDetailsHandlerDeps>) => Promise<Response>;
let envStub: Stub | undefined;

const mockSupabaseUrl = "http://mock-supabase.co";
const mockAnonKey = "mock-anon-key";
// Define mock IDs at a higher scope to be accessible by tests
const mockUserId = 'user-details-123';
const mockChatId = 'chat-details-abc';

const setup = async () => {
  console.log("[Test Setup] Stubbing Deno.env.get for chat-details/index.ts module load");
  envStub = stub(Deno.env, "get", (key) => {
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    return undefined;
  });

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
Deno.test("Chat Details Function Tests", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  await setup();

  // --- Mock Dependencies Helper ---
  const createMockDeps = (overrides: Partial<ChatDetailsHandlerDeps> = {}): ChatDetailsHandlerDeps => {
    // Use the mock IDs defined in the outer scope
    // const mockUserId = 'user-details-123'; // Remove definition from here
    // const mockChatId = 'chat-details-abc'; // Remove definition from here
    const mockMessages: ChatMessage[] = [
      { id: 'msg-1', chat_id: mockChatId, user_id: mockUserId, role: 'user', content: 'First message', ai_provider_id: null, system_prompt_id: null, token_usage: null, created_at: new Date(Date.now() - 10000).toISOString() },
      { id: 'msg-2', chat_id: mockChatId, user_id: null, role: 'assistant', content: 'First response', ai_provider_id: 'p1', system_prompt_id: 's1', token_usage: {}, created_at: new Date().toISOString() },
    ];

    // Mock the query builder chain specifically for the messages query
    const createMockQueryBuilder = (tableName: string) => {
      let eqChatId: string | null = null;
      const builder = {
        select: spy((query: string = '*') => {
          console.log(`[Mock QB ${tableName}] .select(${query}) called`);
          return builder;
        }),
        eq: spy((column: string, value: any) => {
          console.log(`[Mock QB ${tableName}] .eq(${column}, ${value}) called`);
          if (column === 'chat_id') eqChatId = value;
          return builder;
        }),
        order: spy((column: string, options?: any) => {
          console.log(`[Mock QB ${tableName}] .order(${column}, ${JSON.stringify(options)}) called`);
          return builder;
        }),
        maybeSingle: spy(async () => {
             console.log(`[Mock QB ${tableName}] .maybeSingle() called`);
             // Simulate chat check within error handling / empty message case
            if (tableName === 'chats' && eqChatId === mockChatId) {
                return { data: { id: mockChatId }, error: null }; // Simulate chat exists
            } else if (tableName === 'chats') {
                 return { data: null, error: null }; // Simulate chat does not exist
            }
             return { data: null, error: null }; // Default
        }),
        // Add `then` handler for the final promise resolution of the select chain
        then: async (onfulfilled: (value: { data: any; error: any; }) => any) => {
          console.log(`[Mock QB ${tableName}] .then() called (resolving select promise)`);
          if (tableName === 'chat_messages' && eqChatId === mockChatId) {
            console.log(`[Mock QB ${tableName}] .then() resolving with mock messages for chat ${eqChatId}`);
            // Simulate successful fetch returning the mock messages
            return onfulfilled({ data: mockMessages, error: null });
          }
          // Simulate empty result for other chat IDs or tables
          console.log(`[Mock QB ${tableName}] .then() resolving with default (empty array)`);
          return onfulfilled({ data: [], error: null });
        }
      } as any;
      return builder;
    };

    // Base Mocks
    const baseDeps: ChatDetailsHandlerDeps = {
      getEnv: spy((key: string) => {
        if (key === 'SUPABASE_URL') return mockSupabaseUrl;
        if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
        return undefined;
      }),
      createJsonResponse: spy((data: unknown, status: number = 200, headers = {}) => new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json', ...baseDeps.corsHeaders, ...headers } })),
      createErrorResponse: spy((message: string, status: number = 500, headers = {}) => new Response(JSON.stringify({ error: message }), { status: status, headers: { 'Content-Type': 'application/json', ...baseDeps.corsHeaders, ...headers } })),
      corsHeaders: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
      createSupabaseClient: spy((_url, _key, _options) => {
        const mockAuth = {
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
      ...overrides,
    };
    return baseDeps;
  };

  // --- Test Cases ---
  // Test cases can now access mockChatId directly
  await t.step("OPTIONS request should return CORS headers", async () => {
    const mockDeps = createMockDeps();
    // Need to include a mock chatId in the URL for OPTIONS to be handled correctly by routing if applicable
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { method: "OPTIONS" });
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 204);
    assert(res.headers.has('access-control-allow-origin'));
  });

  await t.step("POST request should return 405 Method Not Allowed", async () => {
    const mockDeps = createMockDeps();
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { method: 'POST' });
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 405);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method Not Allowed", 405] });
  });

  await t.step("GET request missing Auth header should return 401", async () => {
    const mockDeps = createMockDeps();
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, { method: 'GET' }); // No Auth header
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Missing Authorization header", 401] });
  });

   await t.step("GET request missing chatId in URL should return 400", async () => {
      const mockDeps = createMockDeps();
      // Simulate URL without the ID part
      const req = new Request(`http://localhost/chat-details`, { 
          method: 'GET',
          headers: { 'Authorization': `Bearer fake-jwt-token` }
      }); 
      const res = await mainHandler(req, mockDeps);
      assertEquals(res.status, 400);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Missing or invalid chatId in URL path.", 400] });
    });

  await t.step("GET request with valid Auth & chatId should return messages array", async () => {
    const mockDeps = createMockDeps();
    const req = new Request(`http://localhost/chat-details/${mockChatId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer fake-jwt-token` }
    });

    const response = await mainHandler(req, mockDeps);
    console.log('[Test] Handler returned response status:', response?.status);

    assertEquals(response.status, 200);
    assertExists(response.body);
    const contentType = response.headers.get('content-type');
    assertEquals(contentType?.includes('application/json'), true);

    const result = await response.json() as ChatMessage[]; // Expecting an array of ChatMessage objects
    console.log('[Test] Parsed response body:', result);

    assertEquals(Array.isArray(result), true, "Response should be an array");
    assertEquals(result.length, 2, "Expected 2 chat messages");
    assertEquals(result[0].id, 'msg-1');
    assertEquals(result[1].role, 'assistant');

    // Verify mocks
    assertSpyCall(mockDeps.createSupabaseClient as Spy, 0);
    const clientSpy = mockDeps.createSupabaseClient as any;
    const mockClientInstance = clientSpy.calls[0]?.returned;
    assertExists(mockClientInstance);
    assertSpyCall(mockClientInstance.auth.getUser as Spy, 0);
    assertSpyCall(mockClientInstance.from as Spy, 0, { args: ['chat_messages'] });
    // Optionally check .select().eq().order().then() calls on the builder if needed
    assertSpyCall(mockDeps.createJsonResponse as Spy, 0);
  });

  await t.step("GET request for non-existent/inaccessible chat should return 404", async () => {
      const nonExistentChatId = 'chat-does-not-exist';
      const mockDeps = createMockDeps(); // Default mocks will simulate chat not found
      const req = new Request(`http://localhost/chat-details/${nonExistentChatId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer fake-jwt-token` }
      }); 
      const response = await mainHandler(req, mockDeps);
      assertEquals(response.status, 404);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Chat not found or access denied.", 404] });
  });

  // Add test for database fetch error if needed

  // --- Teardown after all tests ---
  teardown();
}); 