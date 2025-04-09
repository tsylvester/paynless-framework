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
import { type ChatHistoryHandlerDeps } from "./index.ts";
// Import the type for the expected response structure (adjust path if needed)
import type { Chat } from '../../../packages/types/dist/ai.types.d.ts';

// --- Test Setup ---
let mainHandler: (req: Request, deps?: Partial<ChatHistoryHandlerDeps>) => Promise<Response>;
let envStub: Stub | undefined;

const mockSupabaseUrl = "http://mock-supabase.co";
const mockAnonKey = "mock-anon-key";

const setup = async () => {
  console.log("[Test Setup] Stubbing Deno.env.get for chat-history/index.ts module load");
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
Deno.test("Chat History Function Tests", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  await setup();

  // --- Mock Dependencies Helper ---
  const createMockDeps = (overrides: Partial<ChatHistoryHandlerDeps> = {}): ChatHistoryHandlerDeps => {
    const mockUserId = 'user-history-123';
    const mockChats: Chat[] = [
      { id: 'chat-hist-1', user_id: mockUserId, title: 'History Chat 1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'chat-hist-2', user_id: mockUserId, title: 'History Chat 2', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];

    // Mock the query builder chain specifically for the history query
    const createMockQueryBuilder = (tableName: string) => {
      const builder = {
        select: spy((query: string = '*') => {
          console.log(`[Mock QB ${tableName}] .select(${query}) called`);
          return builder;
        }),
        eq: spy((column: string, value: any) => {
          console.log(`[Mock QB ${tableName}] .eq(${column}, ${value}) called`);
          // We could assert here that column is 'user_id' and value is mockUserId if needed
          return builder;
        }),
        order: spy((column: string, options?: any) => {
          console.log(`[Mock QB ${tableName}] .order(${column}, ${JSON.stringify(options)}) called`);
          return builder;
        }),
        // Add `then` handler for the final promise resolution of the select chain
        then: async (onfulfilled: (value: { data: any; error: any; }) => any) => {
          console.log(`[Mock QB ${tableName}] .then() called (resolving select promise)`);
          if (tableName === 'chats') {
            console.log(`[Mock QB ${tableName}] .then() resolving with mock chat history`);
            // Simulate successful fetch returning the mock chats
            return onfulfilled({ data: mockChats, error: null });
          }
          // Default resolution for unexpected selects
          console.log(`[Mock QB ${tableName}] .then() resolving with default (null)`);
          return onfulfilled({ data: null, error: null });
        }
      } as any;
      return builder;
    };

    // Base Mocks
    const baseDeps: ChatHistoryHandlerDeps = {
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

  await t.step("OPTIONS request should return CORS headers", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://localhost/chat-history", { method: "OPTIONS" });
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 204);
    assert(res.headers.has('access-control-allow-origin'));
  });

  await t.step("POST request should return 405 Method Not Allowed", async () => {
    const mockDeps = createMockDeps();
    const req = new Request('http://localhost/chat-history', { method: 'POST' });
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 405);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method Not Allowed", 405] });
  });

  await t.step("GET request missing Auth header should return 401", async () => {
    const mockDeps = createMockDeps();
    const req = new Request('http://localhost/chat-history', { method: 'GET' }); // No Auth header
    const res = await mainHandler(req, mockDeps);
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Missing Authorization header", 401] });
  });

  await t.step("GET request with valid Auth should return chat history array", async () => {
    const mockDeps = createMockDeps();
    const req = new Request('http://localhost/chat-history', {
      method: 'GET',
      headers: { 'Authorization': `Bearer fake-jwt-token` }
    });

    const response = await mainHandler(req, mockDeps);
    console.log('[Test] Handler returned response status:', response?.status);

    assertEquals(response.status, 200);
    assertExists(response.body);
    const contentType = response.headers.get('content-type');
    assertEquals(contentType?.includes('application/json'), true);

    const result = await response.json() as Chat[]; // Expecting an array of Chat objects
    console.log('[Test] Parsed response body:', result);

    assertEquals(Array.isArray(result), true, "Response should be an array");
    assertEquals(result.length, 2, "Expected 2 chat history items");
    assertEquals(result[0].id, 'chat-hist-1');
    assertEquals(result[1].title, 'History Chat 2');

    // Verify mocks
    assertSpyCall(mockDeps.createSupabaseClient as Spy, 0);
    const clientSpy = mockDeps.createSupabaseClient as any;
    const mockClientInstance = clientSpy.calls[0]?.returned;
    assertExists(mockClientInstance);
    assertSpyCall(mockClientInstance.auth.getUser as Spy, 0);
    assertSpyCall(mockClientInstance.from as Spy, 0, { args: ['chats'] });
    // Optionally check .select().order().then() calls on the builder if needed
    assertSpyCall(mockDeps.createJsonResponse as Spy, 0);
  });

  await t.step("GET request when database returns empty array", async () => {
    // Override the mock client to return empty array for chats
    const mockDeps = createMockDeps({
      createSupabaseClient: spy((_url, _key, _options) => {
          const mockAuth = { getUser: spy(() => Promise.resolve({ data: { user: { id: 'user-empty-hist' } }, error: null })) };
          const mockQueryBuilder = {
              select: spy(() => mockQueryBuilder),
              eq: spy(() => mockQueryBuilder),
              order: spy(() => mockQueryBuilder),
              then: async (cb: any) => cb({ data: [], error: null }) // Resolve with empty array
          } as any;
          return { auth: mockAuth, from: spy(() => mockQueryBuilder) } as unknown as SupabaseClient;
      })
    });
    const req = new Request('http://localhost/chat-history', {
      method: 'GET',
      headers: { 'Authorization': `Bearer fake-jwt-token` }
    });
    const response = await mainHandler(req, mockDeps);
    assertEquals(response.status, 200);
    const result = await response.json() as Chat[];
    assertEquals(result, [], "Expected response to be an empty array");
    assertSpyCall(mockDeps.createJsonResponse as Spy, 0);
  });

   // Add test case for database fetch error
   await t.step("GET request when database fetch fails", async () => {
    const mockError = { message: 'DB Connection Failed', code: '50000' };
    const mockDeps = createMockDeps({
      createSupabaseClient: spy((_url, _key, _options) => {
          const mockAuth = { getUser: spy(() => Promise.resolve({ data: { user: { id: 'user-db-error' } }, error: null })) };
          const mockQueryBuilder = {
              select: spy(() => mockQueryBuilder),
              eq: spy(() => mockQueryBuilder),
              order: spy(() => mockQueryBuilder),
              then: async (cb: any) => cb({ data: null, error: mockError }) // Resolve with an error
          } as any;
          return { auth: mockAuth, from: spy(() => mockQueryBuilder) } as unknown as SupabaseClient;
      })
    });
    const req = new Request('http://localhost/chat-history', {
      method: 'GET',
      headers: { 'Authorization': `Bearer fake-jwt-token` }
    });
    const response = await mainHandler(req, mockDeps);
    assertEquals(response.status, 500);
    const result = await response.json();
    assertEquals(result.error, mockError.message);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0);
  });

  // --- Teardown after all tests ---
  teardown();
}); 