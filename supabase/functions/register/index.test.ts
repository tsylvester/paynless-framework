import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock";

// Import the handler function and the dependency interface
import { handleRegisterRequest, type RegisterHandlerDeps } from "./index.ts";

// Mock shared functions
import * as cors from "../_shared/cors-headers.ts";
import * as auth from "../_shared/auth.ts";

// Mock Supabase client and import necessary types
import * as supabaseJs from "@supabase/supabase-js";
// Import Session type
import type { SupabaseClientOptions, SupabaseClient, SignUpWithPasswordCredentials, AuthResponse, Session, User, AuthError } from "@supabase/supabase-js";

// Define a more specific return type for signUp mock
// AuthResponse already covers { data: { user, session }, error }

// --- Test Cases ---

Deno.test("Register Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    // This function creates spies for each dependency
    const createMockDeps = (overrides: Partial<RegisterHandlerDeps> = {}): RegisterHandlerDeps => {
        const mockSignUp = spy(async (_creds: SignUpWithPasswordCredentials): Promise<AuthResponse> => {
            // Default mock signUp implementation (e.g., success)
            return { data: { user: { id: 'def-user' }, session: { access_token: 'def-token' } }, error: null } as any;
        });
        const mockClient = {
            auth: { signUp: mockSignUp }
        };
        
        return {
            handleCorsPreflightRequest: spy((_req: Request) => null), // Default: not a preflight
            verifyApiKey: spy((_req: Request) => true), // Default: valid API key
            createUnauthorizedResponse: spy((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 401 })),
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy(() => mockClient as any), // Return the mock client
            // Allow overriding default spies
            ...overrides,
        };
    };
    
    // Mock Deno.env.get once if still needed (if createSupabaseClient needs it)
    // Alternatively, inject env vars via deps if preferred.
    // Keep it for now.
    const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
        if (key === 'SUPABASE_URL') return 'http://localhost:54321';
        if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
        return undefined;
    });

    // --- Actual Tests --- 
    // No more top-level try...finally needed for envGetStub if it's only restored once at the end
    try {

        await t.step("OPTIONS request should handle CORS preflight", async () => {
            // Create deps, overriding the relevant spy
            const mockResponse = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
            const mockDeps = createMockDeps({ 
                handleCorsPreflightRequest: spy((_req: Request) => mockResponse) 
            });

            const req = new Request('http://example.com/register', { method: 'OPTIONS' });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res, mockResponse); // Should return the exact mock response
            assertEquals(res.status, 204);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0); // Called once
            assertSpyCalls(mockDeps.verifyApiKey, 0); // Not called
        });

         await t.step("GET request should return 405 Method Not Allowed", async () => {
            const mockDeps = createMockDeps(); // Use default valid API key
            const req = new Request('http://example.com/register', { method: 'GET' });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res.status, 405);
            const body = await res.json();
            assertEquals(body.error, "Method Not Allowed");
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method Not Allowed", 405] });
            assertSpyCall(mockDeps.verifyApiKey, 0); // Called once
        });

        await t.step("POST request without API key should return 401 Unauthorized", async () => {
            const mockDeps = createMockDeps({ verifyApiKey: spy(() => false) }); // Override verifyApiKey
            const req = new Request('http://example.com/register', { method: 'POST' });
            const res = await handleRegisterRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            assertSpyCall(mockDeps.verifyApiKey, 0);
        });

         await t.step("POST request with valid API key but missing email should return 400", async () => {
            const mockDeps = createMockDeps(); // Use defaults
            const req = new Request('http://example.com/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }, // API key check mocked via deps
                body: JSON.stringify({ password: 'password123' }) 
            });
            const res = await handleRegisterRequest(req, mockDeps);

            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Email and password are required", 400] });
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCalls(mockDeps.createSupabaseClient, 0); // Client not created
        });

         await t.step("POST request with valid API key but missing password should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' }) 
            });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Email and password are required", 400] });
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("POST with Supabase signUp error should return error response", async () => {
            // Construct a mock AuthError
            const mockError = new Error("User already registered") as AuthError;
            mockError.name = 'AuthApiError';
            mockError.status = 400;
            (mockError as any).__isAuthError = true; 
            (mockError as any).code = 'supabase_auth_error'; 
            
            // Create spy that RESOLVES with an error object
            const mockSignUpResolvesWithError = spy(async (): Promise<AuthResponse> => Promise.resolve({ 
                data: { user: null, session: null }, 
                error: mockError 
            }));
            const mockClientWithError = { auth: { signUp: mockSignUpResolvesWithError } };
            // Inject the mock client via createSupabaseClient spy
            const mockDeps = createMockDeps({ 
                createSupabaseClient: spy(() => mockClientWithError as any) 
            });

            // No local stubs needed for cors/auth

            try {
                const req = new Request('http://example.com/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
                });
                const res = await handleRegisterRequest(req, mockDeps);
                
                assertEquals(res.status, 400); // Should now be 400 based on error.status
                
                // Assert on the spies provided in mockDeps
                assertSpyCall(mockDeps.createSupabaseClient, 0); // Client created
                assertSpyCall(mockSignUpResolvesWithError, 0); // Assert signUp was called
                assertSpyCall(mockDeps.createErrorResponse, 0, { args: [`Auth Error: ${mockError.message}`, mockError.status] });
                assertSpyCalls(mockDeps.createSuccessResponse, 0);
            } finally {
                 // No stubs created *in this scope* need restoring.
                 // The spies within mockDeps are managed automatically.
            }
        });

        await t.step("POST with signUp success but missing user data should return 500", async () => {
            // Define a complete mock session object
            const mockUserPlaceholder: User = { id: 'session-user', email: 'session@example.com', app_metadata: {}, user_metadata: {}, aud: 'test', created_at: new Date().toISOString() }; 
            const mockSession: Session = { 
                access_token: 'abc', 
                refresh_token: 'def', 
                expires_in: 3600, 
                expires_at: Date.now() / 1000 + 3600,
                token_type: 'bearer', 
                user: mockUserPlaceholder 
            }; 
            const mockResponse: AuthResponse = { data: { user: null, session: mockSession }, error: null }; 
            const mockSignUpSuccess = spy(async () => Promise.resolve(mockResponse));
            const mockClientSuccess = { auth: { signUp: mockSignUpSuccess } };
            const mockDeps = createMockDeps({ 
                createSupabaseClient: spy(() => mockClientSuccess as any) 
            });
            
            const req = new Request('http://example.com/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res.status, 500);
            assertSpyCall(mockSignUpSuccess, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Registration completed but failed to retrieve session.", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

         await t.step("POST with signUp success but missing session data should return 500", async () => {
            const mockUser: User = { id: '123', email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'test', created_at: new Date().toISOString() }; 
            const mockResponse: AuthResponse = { data: { user: mockUser, session: null }, error: null }; 
            const mockSignUpSuccess = spy(async () => Promise.resolve(mockResponse));
            const mockClientSuccess = { auth: { signUp: mockSignUpSuccess } };
            const mockDeps = createMockDeps({ 
                createSupabaseClient: spy(() => mockClientSuccess as any) 
            });
            
            const req = new Request('http://example.com/register', {
                 method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res.status, 500);
            assertSpyCall(mockSignUpSuccess, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Registration completed but failed to retrieve session.", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("POST with successful registration should return 200 with user/session", async () => {
            const mockUser: User = { id: '123', email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'test', created_at: new Date().toISOString() }; 
            // Define a complete mock session object
            const mockSession: Session = { 
                access_token: 'abc', 
                refresh_token: 'def', 
                expires_in: 3600, 
                expires_at: Date.now() / 1000 + 3600,
                token_type: 'bearer', 
                user: mockUser 
            }; 
            const mockResponse: AuthResponse = { data: { user: mockUser, session: mockSession }, error: null }; 
            const mockSignUpSuccess = spy(async () => Promise.resolve(mockResponse));
            const mockClientSuccess = { auth: { signUp: mockSignUpSuccess } };
            const mockDeps = createMockDeps({ 
                createSupabaseClient: spy(() => mockClientSuccess as any) 
            });
            
            const req = new Request('http://example.com/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            // Use assertEquals for deep comparison of objects
            assertEquals(body.user, mockUser);
            assertEquals(body.session, mockSession);
            assertSpyCall(mockSignUpSuccess, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [{ user: mockUser, session: mockSession }] });
            assertSpyCalls(mockDeps.createErrorResponse, 0); 
        });

    } finally {
        envGetStub.restore(); // Restore the single global Deno.env stub
    }
});

// Note: This basic structure highlights a potential issue:
// Testing code that directly uses Deno.serve at the top level is tricky for unit tests.
// Ideally, the request handling logic inside Deno.serve should be extracted
// into an exportable function (e.g., `export async function handleRequest(req)`).
// Then, index.ts would import and use this handler in Deno.serve,
// and the test file could import and test `handleRequest` directly
// by passing mock Request objects.

// If refactoring index.ts is not desired, tests might need to actually
// start the server on a random port, send fetch requests, and then stop it,
// which makes them more like integration tests. 