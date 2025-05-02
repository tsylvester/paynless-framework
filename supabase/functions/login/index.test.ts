import { assertSpyCall, assertSpyCalls, spy, stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";

// Import the *inner* handler and its types, and HandlerError
import { mainHandler, type LoginCredentials, type LoginSuccessResponse } from "./index.ts";
import { HandlerError } from '../api-subscriptions/handlers/current.ts';
import { createMockSupabaseClient } from "../_shared/test-utils.ts";
import type { Database } from "../types_db.ts";

// Import Supabase types needed for mocks
import type { User, Session, AuthError, AuthTokenResponsePassword } from "npm:@supabase/supabase-js@2";

// --- Test Setup ---

// Variable to hold the dynamically imported handler
/*
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
*/

Deno.test("Login Function - mainHandler Tests", {
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  // DELETE THIS LINE (approx line 45)
  // await setup();

  // --- Remove Default Mocks Helper ---
  /*
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
  */

  // --- Test Cases for mainHandler --- 

  // Remove tests for OPTIONS, GET, API key (handled by serve wrapper)
  /*
  await t.step("OPTIONS request should handle CORS preflight", ...);
  await t.step("GET request should return 405 Method Not Allowed", ...);
  await t.step("POST request without API key should return 401 Unauthorized", ...);
  */

  // Tests for missing credentials are now handled by the serve wrapper validation
  /*
  await t.step("POST request missing email should return 400", ...);
  await t.step("POST request missing password should return 400", ...);
  */

  await t.step("Incorrect credentials should throw HandlerError (400)", async () => {
    const mockCreds: LoginCredentials = { email: "wrong@example.com", password: "wrongpassword" };
    const mockAuthError = {
      name: 'AuthApiError',
      message: 'Invalid login credentials',
      status: 400,
      code: 'invalid_grant',
    } as AuthError;
    
    const { client: mockClient, spies } = createMockSupabaseClient({});
    const signInStub = stub(mockClient.auth, 'signInWithPassword', () => Promise.resolve({ data: { user: null, session: null }, error: mockAuthError }));

    try {
        await assertRejects(
            () => mainHandler(mockClient as any, mockCreds),
            HandlerError,
            mockAuthError.message
        );
        assertSpyCalls(signInStub, 1);
        assertSpyCalls(spies.fromSpy, 0);
    } finally {
        signInStub.restore();
    }
  });

  await t.step("Sign-in success but missing session data should throw HandlerError (500)", async () => {
    const mockCreds: LoginCredentials = { email: "no-session@example.com", password: "password123" };
    const mockUser: User = {
      id: 'user-nosession',
      email: mockCreds.email,
      app_metadata: {}, 
      user_metadata: {}, 
      aud: 'authenticated',
      created_at: new Date().toISOString()
    };
    const expectedErrorMessage = "Login completed but failed to retrieve session.";
    
    const { client: mockClient } = createMockSupabaseClient({});
    const signInStub = stub(mockClient.auth, 'signInWithPassword', 
      () => Promise.resolve({ data: { user: mockUser, session: null }, error: null } as unknown as AuthTokenResponsePassword)
    );

    try {
        await assertRejects(
            () => mainHandler(mockClient as any, mockCreds),
            HandlerError,
            expectedErrorMessage
        );
        assertSpyCalls(signInStub, 1);
    } finally {
        signInStub.restore();
    }
  });

  await t.step("Successful login, profile fetch error (non-critical), returns null profile", async () => {
    const mockCreds: LoginCredentials = { email: "success@example.com", password: "password123" };
    const mockUser: User = { 
      id: 'user-123', 
      email: mockCreds.email,
      app_metadata: { provider: 'email' }, 
      user_metadata: { name: 'Test User' }, 
      aud: 'authenticated', 
      created_at: new Date(Date.now() - 20000).toISOString()
    };
    const mockSession: Session = { 
      access_token: 'abc', 
      refresh_token: 'def', 
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mockUser 
    }; 
    const profileError = { message: 'Profile DB error', code: 'PGRSTXXX' }; 

    const { client: mockClient, spies } = createMockSupabaseClient({
      genericMockResults: {
        user_profiles: {
          select: { data: null, error: profileError } 
        }
      }
    });

    const signInStub = stub(mockClient.auth, 'signInWithPassword', () => Promise.resolve({ data: { user: mockUser, session: mockSession }, error: null }));
    
    try {
        const result = await mainHandler(mockClient as any, mockCreds);

        assertEquals(result.user?.id, mockUser.id);
        assertEquals(result.session?.access_token, mockSession.access_token);
        assertEquals(result.profile, null);

        assertSpyCalls(signInStub, 1);
        assertSpyCalls(spies.fromSpy, 1);
        const queryBuilder = spies.fromSpy.calls[0].returned;
        assertSpyCalls(queryBuilder.select, 1);
        assertSpyCalls(queryBuilder.eq, 1);
        assertSpyCall(queryBuilder.eq, 0, { args: ['id', mockUser.id] });
        assertSpyCalls(queryBuilder.maybeSingle, 1);
    } finally {
        signInStub.restore();
    }
  });

  await t.step("Successful login, profile found", async () => {
    const mockCreds: LoginCredentials = { email: "success@example.com", password: "password123" };
    const mockUser: User = { 
      id: 'user-123', 
      email: mockCreds.email,
      app_metadata: { provider: 'email' }, 
      user_metadata: { name: 'Test User' }, 
      aud: 'authenticated', 
      created_at: new Date(Date.now() - 20000).toISOString()
    };
    const mockSession: Session = { 
      access_token: 'abc', 
      refresh_token: 'def', 
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mockUser 
    }; 
    
    const mockProfile: Database['public']['Tables']['user_profiles']['Row'] = { 
        id: mockUser.id, 
        created_at: new Date(Date.now() - 10000).toISOString(),
        first_name: "Test", 
        last_name: "User", 
        role: "user", 
        updated_at: new Date().toISOString(),
        last_selected_org_id: null
    };

    const { client: mockClient, spies } = createMockSupabaseClient({
      genericMockResults: {
        user_profiles: {
          select: { data: [mockProfile], error: null } 
        }
      }
    });

    const signInStub = stub(mockClient.auth, 'signInWithPassword', () => Promise.resolve({ data: { user: mockUser, session: mockSession }, error: null }));

    try {
        const result = await mainHandler(mockClient as any, mockCreds);

        assertEquals(result.user?.id, mockUser.id);
        assertEquals(result.session?.access_token, mockSession.access_token);
        assertEquals(result.profile, mockProfile);

        assertSpyCalls(signInStub, 1);
        assertSpyCalls(spies.fromSpy, 1);
        const queryBuilder = spies.fromSpy.calls[0].returned;
        assertSpyCalls(queryBuilder.select, 1);
        assertSpyCalls(queryBuilder.eq, 1);
        assertSpyCall(queryBuilder.eq, 0, { args: ['id', mockUser.id] });
        assertSpyCalls(queryBuilder.maybeSingle, 1);
    } finally {
        signInStub.restore();
    }
  });

  // DELETE THIS LINE (approx line 224)
  // teardown();
}); 