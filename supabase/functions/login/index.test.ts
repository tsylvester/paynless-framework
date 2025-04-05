import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleLoginRequest, type LoginHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type { 
    SupabaseClientOptions, 
    SupabaseClient, 
    SignInWithPasswordCredentials, 
    AuthResponse, 
    Session, 
    User, 
    AuthError,
    PostgrestSingleResponse // Added for profile fetch mock
} from "@supabase/supabase-js";

// --- Test Cases ---
Deno.test("Login Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<LoginHandlerDeps> = {}): LoginHandlerDeps => {
        // Default mock client setup
        const mockSignIn = spy(async (_creds: SignInWithPasswordCredentials): Promise<AuthResponse> => {
            const user: User = { id: 'def-user', email: 'test@example.com', /* other props */ } as any;
            const session: Session = { access_token: 'def-token', /* other props */ } as any;
            return { data: { user, session }, error: null };
        });
        const mockProfileFetchResult: PostgrestSingleResponse<any> = { data: { id: 'def-user', name: 'Test User' }, error: null, status: 200, statusText: 'OK', count: 1 };
        const mockFrom = spy(() => ({
            select: spy(() => ({
                eq: spy(() => ({
                    single: spy(() => Promise.resolve(mockProfileFetchResult)) // Default: profile found
                }))
            }))
        }));
        const mockClient = {
            auth: { signInWithPassword: mockSignIn },
            from: mockFrom
        };
        
        return {
            handleCorsPreflightRequest: spy((_req: Request) => null), 
            verifyApiKey: spy((_req: Request) => true), 
            createUnauthorizedResponse: spy((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 401 })),
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy(() => mockClient as any), 
            // Allow overriding default spies
            ...overrides,
        };
    };
    
    // Mock Deno.env.get once
    const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
        if (key === 'SUPABASE_URL') return 'http://localhost:54321';
        if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
        return undefined;
    });

    // --- Actual Tests --- 
    try {

        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
            const mockDeps = createMockDeps({ 
                handleCorsPreflightRequest: spy(() => mockResponse) 
            });
            const req = new Request('http://example.com/login', { method: 'OPTIONS' });
            const res = await handleLoginRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
            assertSpyCalls(mockDeps.verifyApiKey, 0);
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
            const mockError = new Error("Invalid login credentials") as AuthError;
            mockError.name = 'AuthApiError'; mockError.status = 400;
            const mockSignInError = spy(async (): Promise<AuthResponse> => ({ data: { user: null, session: null }, error: mockError }));
            const mockClientError = { auth: { signInWithPassword: mockSignInError } };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientError as any) });
            
            const req = new Request('http://example.com/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'wrong' })
            });
            const res = await handleLoginRequest(req, mockDeps);
            
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockSignInError, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockError.message, mockError.status] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("POST with sign-in success but missing session data should return 500", async () => {
            const mockUser: User = { id: '123' } as any;
            const mockResponse: AuthResponse = { data: { user: mockUser, session: null }, error: null }; 
            const mockSignInSuccess = spy(async () => mockResponse);
            const mockClientSuccess = { auth: { signInWithPassword: mockSignInSuccess } };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientSuccess as any) });

            const req = new Request('http://example.com/login', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleLoginRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockSignInSuccess, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Login completed but failed to retrieve session.", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("POST successful login, profile fetch error (non-critical)", async () => {
            const mockUser: User = { id: '123' } as any;
            const mockSession: Session = { access_token: 'abc', /* other props */ } as any;
            const mockAuthResponse: AuthResponse = { data: { user: mockUser, session: mockSession }, error: null }; 
            const mockSignInSuccess = spy(async () => mockAuthResponse);
            
            // Mock profile fetch to return an error
            const mockProfileErrorResponse: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB error' }, status: 500, statusText: 'Error', count: 0 };
            const mockSingleError = spy(() => Promise.resolve(mockProfileErrorResponse));
            const mockFromError = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingleError })) })) }));
            const mockClientSuccess = { auth: { signInWithPassword: mockSignInSuccess }, from: mockFromError };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientSuccess as any) });

            const req = new Request('http://example.com/login', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleLoginRequest(req, mockDeps);

            assertEquals(res.status, 200); // Should still succeed
            const body = await res.json();
            assertEquals(body.user, mockUser);
            assertEquals(body.session, mockSession);
            assertEquals(body.profile, null); // Profile should be null
            assertSpyCall(mockSignInSuccess, 0);
            assertSpyCall(mockFromError, 0); // Verify profile fetch was attempted
            assertSpyCall(mockSingleError, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0); 
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });
        
        await t.step("POST successful login, profile found", async () => {
            const mockUser: User = { id: '123' } as any;
            const mockSession: Session = { access_token: 'abc', /* other props */ } as any;
            const mockProfile = { id: '123', name: 'Test User' };
            const mockAuthResponse: AuthResponse = { data: { user: mockUser, session: mockSession }, error: null }; 
            const mockSignInSuccess = spy(async () => mockAuthResponse);
            
            // Mock profile fetch to succeed
            const mockProfileSuccessResponse: PostgrestSingleResponse<any> = { data: mockProfile, error: null, status: 200, statusText: 'OK', count: 1 };
            const mockSingleSuccess = spy(() => Promise.resolve(mockProfileSuccessResponse));
            const mockFromSuccess = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingleSuccess })) })) }));
            const mockClientSuccess = { auth: { signInWithPassword: mockSignInSuccess }, from: mockFromSuccess };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientSuccess as any) });

            const req = new Request('http://example.com/login', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleLoginRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.user, mockUser);
            assertEquals(body.session, mockSession);
            assertEquals(body.profile, mockProfile); // Profile should be present
            assertSpyCall(mockSignInSuccess, 0);
            assertSpyCall(mockFromSuccess, 0); 
            assertSpyCall(mockSingleSuccess, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0); 
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

    } finally {
        envGetStub.restore(); 
    }
}); 