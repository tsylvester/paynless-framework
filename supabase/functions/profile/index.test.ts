import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertExists,
  assertMatch,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  spy,
  stub,
  Spy,
  Stub,
  assertSpyCall,
  assertSpyCalls,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
// Ensure necessary types are imported
import { SupabaseClient, User, AuthError, PostgrestError } from "npm:@supabase/supabase-js";

import { handleProfileRequest, ProfileHandlerDeps } from "./index.ts";

// --- Test Setup ---

const defaultEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "test-anon-key",
  API_KEY: "test-api-key",
};

let envStub: Stub | undefined;

function setupEnvStub(envVars: Record<string, string | undefined>) {
  if (envStub) envStub.restore();
  envStub = stub(Deno.env, "get", (key: string) => envVars[key]);
}

const mockRequestingUser: User = {
  id: "user-requester-123",
  app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString(),
};

const mockTargetProfileData = {
    id: "user-target-456",
    first_name: "Target",
    last_name: "User",
    created_at: new Date().toISOString(),
};

// --- Mock Dependencies --- 

// Helper function to create a default Supabase client mock
// Allows overriding the maybeSingle result for specific tests
function createMockSupabaseClient(maybeSingleResult: Promise<{ data: any | null; error: PostgrestError | null }> = 
    Promise.resolve({ data: mockTargetProfileData, error: null })) 
{
    const mockMaybeSingle = spy(() => maybeSingleResult);
    const mockEq = spy(() => ({ maybeSingle: mockMaybeSingle }));
    const mockSelect = spy(() => ({ eq: mockEq }));
    const mockFrom = spy(() => ({ select: mockSelect }));
    return {
        auth: {
            getUser: spy(() => Promise.resolve({ data: { user: mockRequestingUser }, error: null }))
        },
        from: mockFrom,
        // Expose spies for assertion
        _spies: { mockFrom, mockSelect, mockEq, mockMaybeSingle }
    } as any;
}

function createMockDeps(overrides: Partial<ProfileHandlerDeps> = {}): ProfileHandlerDeps & { [K in keyof ProfileHandlerDeps]: Spy } & { supabaseSpies?: any } {
  const defaultSupabaseClient = createMockSupabaseClient(); // Default success mock

  const defaultJsonResponse = (body: any, status: number, headers?: HeadersInit) => 
      new Response(JSON.stringify(body), { status, headers: headers ?? { 'Content-Type': 'application/json' } });

  const mocks = {
    handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response("ok", { status: 200 }) : null),
    verifyApiKey: spy((req: Request) => req.headers.get('apikey') === defaultEnv.API_KEY),
    createUnauthorizedResponse: spy((message: string) => defaultJsonResponse({ error: message }, 401)),
    createErrorResponse: spy(defaultJsonResponse), // Use default for errors too
    createSuccessResponse: spy((body: any) => defaultJsonResponse(body, 200)),
    // Use the helper for the default client, store spies
    createSupabaseClient: spy(() => defaultSupabaseClient),
    getPathname: spy((req: Request) => new URL(req.url).pathname),
  };

  // Store supabase spies for easy access in tests
  const finalMocks = { ...mocks, supabaseSpies: defaultSupabaseClient._spies };

  // Apply overrides - careful not to overwrite spies unintentionally
  for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          const overrideValue = overrides[key as keyof ProfileHandlerDeps];
          if (key === 'createSupabaseClient') {
              // If overriding Supabase client creation, update the stored spies
              const client = overrideValue(null as any); // Call override fn to get client
              (finalMocks as any)[key] = spy(() => client); // Spy on the override function itself
              finalMocks.supabaseSpies = client._spies; // Store spies from the new client
          } else if (typeof overrideValue === 'function' && !(overrideValue as any).isSpy) {
              (finalMocks as any)[key] = spy(overrideValue); // Wrap other functions in spy
          } else {
              (finalMocks as any)[key] = overrideValue; // Assign non-functions directly
          }
      }
  }

  return finalMocks as any; // Cast needed due to complex type with spies
}

// --- Tests ---

describe("Profile Handler (GET /profile/:userId)", () => {

  afterEach(() => {
    if (envStub) envStub.restore();
    envStub = undefined;
  });

  // --- Basic Setup & Auth Tests ---

  it("should handle CORS preflight requests", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile/123", { method: "OPTIONS" });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "ok");
    assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
    assertSpyCalls(mockDeps.verifyApiKey, 0); // Skip API key check
  });

  it("should return 401 for invalid API key", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile/123", { 
        method: "GET", 
        headers: { 'apikey': 'invalid' }
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.verifyApiKey, 0);
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
  });

  it("should return 401 if user is not authenticated", async () => {
    setupEnvStub(defaultEnv);
    const authError = new AuthError("Invalid JWT");
    const mockGetUser = spy(() => Promise.resolve({ data: { user: null }, error: authError }));
    const mockSupabaseClient = { auth: { getUser: mockGetUser }, from: spy() }; // Basic mock for this test
    const mockDeps = createMockDeps({ 
        createSupabaseClient: spy(() => mockSupabaseClient as any)
    });

    const req = new Request("http://example.com/profile/123", { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);

    assertEquals(res.status, 401);
    assertSpyCall(mockGetUser, 0); // Check getUser was called
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Not authenticated"] });
  });

  // --- Path and Method Tests ---

  it("should return 404 for invalid path (e.g., /profile/)", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile/", { // Trailing slash
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 404);
    assertSpyCall(mockDeps.getPathname, 0); // Path was checked
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Not Found", 404] });
  });
  
   it("should return 404 for invalid path (e.g., /profile)", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile", { // No user ID
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 404);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Not Found", 404] });
  });

  it("should return 405 for disallowed methods (e.g., PUT, POST)", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const targetUserId = "user-target-456";
    const reqPost = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "POST", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const reqPut = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "PUT", 
        headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    const resPost = await handleProfileRequest(reqPost, mockDeps);
    assertEquals(resPost.status, 405);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method POST not allowed", 405] });

    const resPut = await handleProfileRequest(reqPut, mockDeps);
    assertEquals(resPut.status, 405);
    assertSpyCall(mockDeps.createErrorResponse, 1, { args: ["Method PUT not allowed", 405] });
    
    // Ensure DB select wasn't called for these methods
     assertSpyCalls(mockDeps.supabaseSpies.mockFrom, 0);
  });

  // --- GET /profile/:userId Logic Tests ---

  it("should successfully fetch profile with GET /profile/:userId", async () => {
    setupEnvStub(defaultEnv);
    // Use default mock client which simulates success
    const mockDeps = createMockDeps(); 
    const targetUserId = "user-target-456";

    const req = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    
    assertEquals(res.status, 200);
    // Check Supabase call chain
    assertSpyCall(mockDeps.supabaseSpies.mockFrom, 0, { args: ['user_profiles'] });
    assertSpyCall(mockDeps.supabaseSpies.mockSelect, 0, { args: ['id, first_name, last_name, created_at'] });
    assertSpyCall(mockDeps.supabaseSpies.mockEq, 0, { args: ['id', targetUserId] });
    assertSpyCall(mockDeps.supabaseSpies.mockMaybeSingle, 0); 
    // Check success response
    assertSpyCall(mockDeps.createSuccessResponse, 0);
    const body = await res.json();
    assertEquals(body, mockTargetProfileData); // Check returned data matches mock
  });

  it("should return 404 if profile for targetUserId is not found", async () => {
    setupEnvStub(defaultEnv);
    // Create a mock client that simulates profile not found
    const mockSupabaseNotFound = createMockSupabaseClient(
        Promise.resolve({ data: null, error: null }) // maybeSingle returns null data
    );
    const mockDeps = createMockDeps({ 
        createSupabaseClient: spy(() => mockSupabaseNotFound as any)
    }); 
    const targetUserId = "non-existent-user";

    const req = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    
    assertEquals(res.status, 404);
    // Check Supabase call chain was still executed
    assertSpyCall(mockDeps.supabaseSpies.mockFrom, 0, { args: ['user_profiles'] });
    assertSpyCall(mockDeps.supabaseSpies.mockEq, 0, { args: ['id', targetUserId] });
    assertSpyCall(mockDeps.supabaseSpies.mockMaybeSingle, 0); 
    // Check error response
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Profile not found", 404] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });

  it("should return 500 if Supabase fetch fails", async () => {
    setupEnvStub(defaultEnv);
    const dbError: PostgrestError = { message: "DB connection error", code: "50000", details: "", hint: "" };
    // Create a mock client that simulates a DB error
    const mockSupabaseError = createMockSupabaseClient(
        Promise.resolve({ data: null, error: dbError }) 
    );
    const mockDeps = createMockDeps({ 
        createSupabaseClient: spy(() => mockSupabaseError as any)
    }); 
    const targetUserId = "user-target-456";

    const req = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    
    assertEquals(res.status, 500);
    // Check Supabase call chain was still executed
    assertSpyCall(mockDeps.supabaseSpies.mockFrom, 0, { args: ['user_profiles'] });
    assertSpyCall(mockDeps.supabaseSpies.mockEq, 0, { args: ['id', targetUserId] });
    assertSpyCall(mockDeps.supabaseSpies.mockMaybeSingle, 0); 
    // Check error response
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to fetch profile", 500] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });

}); 