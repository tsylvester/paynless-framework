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
    profile_privacy_setting: 'public' as const,
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

// Simpler createMockDeps - relies on caller to spy overrides if needed
function createMockDeps(overrides: Partial<ProfileHandlerDeps> = {}): ProfileHandlerDeps {
  // Create default spied mocks
  const defaultSupabaseClient = createMockSupabaseClient();
  const defaultJsonResponse = (body: any, status: number, headers?: HeadersInit) => 
      new Response(JSON.stringify(body), { status, headers: headers ?? { 'Content-Type': 'application/json' } });

  // Keep defaults explicitly spied
  const defaultMocks = {
    handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response("ok", { status: 200 }) : null),
    verifyApiKey: spy((req: Request) => req.headers.get('apikey') === defaultEnv.API_KEY),
    createUnauthorizedResponse: spy((message: string) => defaultJsonResponse({ error: message }, 401)),
    createErrorResponse: spy((message: string, status?: number, _req?: Request, _err?: unknown) => defaultJsonResponse({ error: message }, status ?? 500)), 
    createSuccessResponse: spy((body: any) => defaultJsonResponse(body, 200)),
    createSupabaseClient: spy(() => defaultSupabaseClient as any),
    getPathname: spy((req: Request) => new URL(req.url).pathname),
  };

  // Start with spied defaults
  const finalMocks = {
    ...defaultMocks,
  };

  // Apply overrides directly - caller must ensure overrides are spied if needed for assertions
  for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          (finalMocks as any)[key] = overrides[key as keyof ProfileHandlerDeps];
      }
  }

  // Cast the final result back to ProfileHandlerDeps.
  // Assertions in tests might need casting like (mockDeps.verifyApiKey as Spy)
  return finalMocks as ProfileHandlerDeps;
}

// --- Tests ---

describe("Profile Handler (GET /profile/:userId)", () => {

  // Define default client accessible to tests and createMockDeps
  let defaultSupabaseClient: any; 

  beforeEach(() => {
    // Initialize default client before each test
    defaultSupabaseClient = createMockSupabaseClient();
  });

  afterEach(() => {
    if (envStub) envStub.restore();
    envStub = undefined;
    defaultSupabaseClient = undefined; // Clean up
  });

  // --- Mock Dependencies (Uses the default client from outer scope) ---
  function createMockDeps(overrides: Partial<ProfileHandlerDeps> = {}): ProfileHandlerDeps {
    // Default client is now defined in the outer scope
    const defaultJsonResponse = (body: any, status: number, headers?: HeadersInit) => 
        new Response(JSON.stringify(body), { status, headers: headers ?? { 'Content-Type': 'application/json' } });

    const defaultMocks = {
      handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response("ok", { status: 200 }) : null),
      verifyApiKey: spy((req: Request) => req.headers.get('apikey') === defaultEnv.API_KEY),
      createUnauthorizedResponse: spy((message: string) => defaultJsonResponse({ error: message }, 401)),
      createErrorResponse: spy((message: string, status?: number, _req?: Request, _err?: unknown) => defaultJsonResponse({ error: message }, status ?? 500)), 
      createSuccessResponse: spy((body: any) => defaultJsonResponse(body, 200)),
      // Use the shared defaultSupabaseClient instance
      createSupabaseClient: spy(() => defaultSupabaseClient as any),
      getPathname: spy((req: Request) => new URL(req.url).pathname),
    };
    // ... (rest of createMockDeps remains the same: apply overrides, return) ...
      // Start with spied defaults
    const finalMocks = {
      ...defaultMocks,
    };

    // Apply overrides directly - caller must ensure overrides are spied if needed for assertions
    for (const key in overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
            (finalMocks as any)[key] = overrides[key as keyof ProfileHandlerDeps];
        }
    }

    return finalMocks as ProfileHandlerDeps;
  }

  // --- Basic Setup & Auth Tests ---

  it("should handle CORS preflight requests", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile/123", { method: "OPTIONS" });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 200);
    // Cast to Spy for assertion if needed, though assertSpyCall might infer
    assertSpyCall(mockDeps.handleCorsPreflightRequest as Spy, 0);
    assertSpyCalls(mockDeps.verifyApiKey as Spy, 0); 
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
    assertSpyCall(mockDeps.verifyApiKey as Spy, 0);
    assertSpyCall(mockDeps.createUnauthorizedResponse as Spy, 0, { args: ["Invalid or missing apikey", req] });
  });

  it("should return 401 if user is not authenticated", async () => {
    setupEnvStub(defaultEnv);
    const authError = new AuthError("Invalid JWT");
    const mockGetUser = spy(() => Promise.resolve({ data: { user: null }, error: authError }));
    const mockSupabaseClient = { auth: { getUser: mockGetUser }, from: spy() }; 
    const mockCreateSupabaseClientOverride = spy(() => mockSupabaseClient as any);
    const mockDeps = createMockDeps({ 
        createSupabaseClient: mockCreateSupabaseClientOverride
    });

    const req = new Request("http://example.com/profile/123", { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);

    assertEquals(res.status, 401);
    assertSpyCall(mockCreateSupabaseClientOverride, 0); 
    assertSpyCall(mockGetUser, 0);
    assertSpyCall(mockDeps.createUnauthorizedResponse as Spy, 0, { args: ["Not authenticated", req] });
  });

  // --- Path and Method Tests ---

  it("should return 404 for invalid path (e.g., /profile/)", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile/", { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 404);
    assertSpyCall(mockDeps.getPathname as Spy, 0); 
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Not Found", 404, req] });
  });
  
   it("should return 404 for invalid path (e.g., /profile)", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/profile", { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 404);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Not Found", 404, req] });
  });

  it("should return 405 for disallowed methods (e.g., PUT, POST)", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const defaultClientUsed = (mockDeps.createSupabaseClient as Spy).calls[0]?.returned ?? defaultSupabaseClient; 
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
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method POST not allowed", 405, reqPost] });

    const resPut = await handleProfileRequest(reqPut, mockDeps);
    assertEquals(resPut.status, 405);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 1, { args: ["Method PUT not allowed", 405, reqPut] });
    
    assertSpyCalls(defaultClientUsed._spies.mockFrom, 0);
  });

  // --- GET /profile/:userId Logic Tests ---

  it("should successfully fetch profile with GET /profile/:userId", async () => {
    setupEnvStub(defaultEnv);
    // Provide a specific mock client for this test to access its spies
    const mockClient = createMockSupabaseClient(
        Promise.resolve({ data: { ...mockTargetProfileData }, error: null }) // Ensure mock returns the new field
    ); 
    const mockCreateClientSpy = spy(() => mockClient);
    const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientSpy }); 
    const targetUserId = "user-target-456";

    const req = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    
    assertEquals(res.status, 200);
    // Check the override spy was called
    assertSpyCall(mockCreateClientSpy, 0);
    // Check Supabase call chain using the spies from the specific mockClient
    assertSpyCall(mockClient._spies.mockFrom as Spy, 0, { args: ['user_profiles'] });
    // Expect 'profile_privacy_setting' to be selected
    assertSpyCall(mockClient._spies.mockSelect as Spy, 0, { args: ['id, first_name, last_name, created_at, profile_privacy_setting'] });
    assertSpyCall(mockClient._spies.mockEq as Spy, 0, { args: ['id', targetUserId] });
    assertSpyCall(mockClient._spies.mockMaybeSingle as Spy, 0); 
    // Check success response spy (cast needed)
    assertSpyCall(mockDeps.createSuccessResponse as Spy, 0);
    const body = await res.json();
    assertEquals(body, mockTargetProfileData); 
  });

  it("should return 404 if profile for targetUserId is not found", async () => {
    setupEnvStub(defaultEnv);
    const mockSupabaseNotFound = createMockSupabaseClient(
        Promise.resolve({ data: null, error: null }) 
    );
    const mockDeps = createMockDeps({ 
        createSupabaseClient: spy(() => mockSupabaseNotFound as any)
    }); 
    const targetUserId = "nonexistent-user";
    const req = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 404);
    assertSpyCall(mockSupabaseNotFound._spies.mockFrom as Spy, 0);
    assertSpyCall(mockSupabaseNotFound._spies.mockSelect as Spy, 0);
    assertSpyCall(mockSupabaseNotFound._spies.mockEq as Spy, 0, { args: ['id', targetUserId] });
    assertSpyCall(mockSupabaseNotFound._spies.mockMaybeSingle as Spy, 0);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Profile not found", 404, req] });
    assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
  });

  it("should return 500 if Supabase throws an error during fetch", async () => {
    setupEnvStub(defaultEnv);
    const dbError: PostgrestError = { message: "DB connection error", code: "50000", details: "", hint: "", name: "PostgrestError" }; 
    const mockSupabaseDbError = createMockSupabaseClient(
        Promise.resolve({ data: null, error: dbError })
    );
    const mockDeps = createMockDeps({ 
        createSupabaseClient: spy(() => mockSupabaseDbError as any)
    });
    const targetUserId = "user-causes-error";
    const req = new Request(`http://example.com/profile/${targetUserId}`, { 
        method: "GET", 
        headers: { 'apikey': defaultEnv.API_KEY } 
    });
    const res = await handleProfileRequest(req, mockDeps);
    assertEquals(res.status, 500);
    assertSpyCall(mockSupabaseDbError._spies.mockMaybeSingle as Spy, 0);
    assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to fetch profile", 500, req] }); 
  });

}); 