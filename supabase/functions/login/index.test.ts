import { assertSpyCall, assertSpyCalls, spy, stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

// Import the dependencies interface
import type { LoginHandlerDeps } from "./index.ts";

// --- Test Setup ---

// Variable to hold the dynamically imported handler
let handleLoginRequest: (req: Request, deps?: Partial<LoginHandlerDeps>) => Promise<Response>;
let envStub: Stub | undefined;

const mockSupabaseUrl = "http://mock-supabase.co";
const mockAnonKey = "mock-anon-key";

// Use beforeAll to stub environment variables before the module under test is imported
const setup = async () => {
  console.log("[Test Setup] Stubbing Deno.env.get for login/index.ts module load");
  envStub = stub(Deno.env, "get", (key) => {
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key'; // Needed by auth.ts potentially
    return undefined;
  });

  // Dynamically import the handler *after* stubbing env vars
  const module = await import(`./index.ts?id=${Math.random()}`);
  handleLoginRequest = module.handleLoginRequest;
  console.log("[Test Setup] handleLoginRequest imported dynamically.");
};

const teardown = () => {
  if (envStub) {
    envStub.restore();
    console.log("[Test Teardown] Restored Deno.env.get");
  }
};

Deno.test("Login Function Tests", {
  sanitizeOps: false, // Prevent errors related to fetch/async ops in tests
  sanitizeResources: false,
}, async (t) => {
  // Setup before running tests
  await setup();

  // Default Mocks (can be overridden per test)
  const createMockDeps = (overrides: Partial<LoginHandlerDeps> = {}): LoginHandlerDeps => {
    // Base mocks
    const baseDeps: LoginHandlerDeps = {
      handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response(null, { status: 204 }) : null),
      verifyApiKey: spy(() => true), // Assume valid API key by default
      createUnauthorizedResponse: spy((message: string) => new Response(JSON.stringify({ error: message }), { status: 401 })),
      createErrorResponse: spy((message: string, status: number = 500) => new Response(JSON.stringify({ error: message }), { status: status })),
      createSuccessResponse: spy((data: unknown, status: number = 200) => new Response(JSON.stringify(data), { status: status })),
      supabaseUrl: mockSupabaseUrl, // Use values from stub
      supabaseAnonKey: mockAnonKey, // Use values from stub
      // Mock Supabase client and its methods
      createSupabaseClient: spy((url, key, options) => {
        const mockAuth = {
          signInWithPassword: spy(async (creds) => {
            if (creds.email === 'success@example.com' && creds.password === 'password123') {
              return { data: { user: { id: 'user-123', email: creds.email }, session: { access_token: 'abc', refresh_token: 'def' } }, error: null };
            } else if (creds.email === 'no-session@example.com') {
               return { data: { user: { id: 'user-nosession', email: creds.email }, session: null }, error: null }; 
            }
            return { data: null, error: { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 } };
          })
        };
        const mockQueryBuilder = {
            select: spy(() => mockQueryBuilder),
            eq: spy(() => mockQueryBuilder),
            maybeSingle: spy(async () => {
                // Simulate profile fetch based ONLY on the override flag
                if (overrides.fetchProfileError) {
                    // Test wants a profile fetch error
                    console.log("[Mock maybeSingle] Simulating profile fetch error due to override flag.");
                    return { data: null, error: { message: 'Profile DB error' } };
                } else {
                    // Assume success if no error override
                    console.log("[Mock maybeSingle] Simulating successful profile fetch.");
                    // Return default profile data (assuming user ID is implicitly correct)
                    return { data: { id: 'user-123', username: 'testuser', avatar_url: 'url' }, error: null };
                }
            }),
        };
        const mockClient = {
          auth: mockAuth,
          from: spy(() => mockQueryBuilder),
        } as unknown as SupabaseClient;
        return mockClient;
      }),
      // Add overrides here so they are part of the final deps object
      ...overrides,
    };
    return baseDeps;
  };

  await t.step("OPTIONS request should handle CORS preflight", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/login", { method: "OPTIONS" });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 204);
    assertSpyCall(mockDeps.handleCorsPreflightRequest, 0, { args: [req] });
  });

  await t.step("GET request should return 405 Method Not Allowed", async () => {
    const mockDeps = createMockDeps();
    const req = new Request('http://example.com/login', { method: 'GET' });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 405);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method Not Allowed", 405] });
    assertSpyCall(mockDeps.verifyApiKey, 0);
  });

  await t.step("POST request without API key should return 401 Unauthorized", async () => {
    const mockDeps = createMockDeps({ verifyApiKey: spy(() => false) });
    const req = new Request('http://example.com/login', { method: 'POST' });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
    assertSpyCall(mockDeps.verifyApiKey, 0);
  });

  await t.step("POST request missing email should return 400", async () => {
    const mockDeps = createMockDeps();
    const req = new Request('http://example.com/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }) 
    });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 400);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Email and password are required", 400] });
    assertSpyCall(mockDeps.verifyApiKey, 0);
    assertSpyCalls(mockDeps.createSupabaseClient, 0);
  });

  await t.step("POST request missing password should return 400", async () => {
    const mockDeps = createMockDeps();
    const req = new Request('http://example.com/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }) 
    });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 400);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Email and password are required", 400] });
    assertSpyCall(mockDeps.verifyApiKey, 0);
    assertSpyCalls(mockDeps.createSupabaseClient, 0);
  });

  await t.step("POST with incorrect credentials should return auth error", async () => {
    const mockDeps = createMockDeps({
        // Override verifyApiKey if needed, but default is true
    });
    const req = new Request("http://example.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // Need content type
      body: JSON.stringify({ email: "wrong@example.com", password: "wrongpassword" }),
    });
    const res = await handleLoginRequest(req, mockDeps);
    // Now expects 400 based on the mocked signInWithPassword error status
    assertEquals(res.status, 400);
    assertSpyCall(mockDeps.createErrorResponse, 0); 
  });

  await t.step("POST with sign-in success but missing session data should return 500", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/login", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "no-session@example.com", password: "password123" }) 
    });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 500);
    assertSpyCall(mockDeps.createErrorResponse, 0, {
        args: ["Login completed but failed to retrieve session.", 500]
    });
  });

  await t.step("POST successful login, profile fetch error (non-critical)", async () => {
    // Mock specifically for this test to trigger profile fetch error
    const mockDeps = createMockDeps({
        fetchProfileError: true // Custom flag to make the mock throw profile error
    }); 
    const req = new Request("http://example.com/login", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "success@example.com", password: "password123" })
    });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 200); // Should still succeed
    const body = await res.json();
    assertExists(body.user);
    assertExists(body.session);
    assertEquals(body.profile, null); // Profile is null due to fetch error
    assertSpyCall(mockDeps.createSuccessResponse, 0);
  });

  await t.step("POST successful login, profile found", async () => {
    const mockDeps = createMockDeps(); // No profile error override
    console.log("[Test] Mock dependencies for 'profile found' test:", {
        createSuccessResponseCalls: mockDeps.createSuccessResponse.calls.length,
        createErrorResponseCalls: mockDeps.createErrorResponse.calls.length,
        // Maybe log the mock implementation of maybeSingle to confirm it's the simplified one
    });
    const req = new Request("http://example.com/login", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "success@example.com", password: "password123" })
    });
    const res = await handleLoginRequest(req, mockDeps);
    assertEquals(res.status, 200);
    const body = await res.json();
    console.log("[Test] Response body received in 'profile found' test:", body);
    assertExists(body.user);
    assertExists(body.session);
    assertExists(body.profile);
    assertEquals(body.profile.id, body.user.id);
    assertEquals(body.profile.username, "testuser");
    assertSpyCall(mockDeps.createSuccessResponse, 0);
  });

  // Teardown after all tests in this suite
  await teardown();
}); 