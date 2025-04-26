import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, type Spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock";

// Import the handler function and dependency interfaces
import { handleRegisterRequest, type RegisterHandlerDeps, type RegisterService } from "./index.ts";

// Import types needed for mocks
import type { 
    SupabaseClient, 
    AuthResponse, 
    AuthError, 
    User, 
    Session 
} from "@supabase/supabase-js";

// --- Helper Type for Spied Dependencies ---
// Explicitly type known function properties as Spies
interface SpiedRegisterHandlerDeps extends Omit<RegisterHandlerDeps, 'registerService'> {
    handleCorsPreflightRequest: Spy<RegisterHandlerDeps['handleCorsPreflightRequest']>;
    verifyApiKey: Spy<RegisterHandlerDeps['verifyApiKey']>;
    createUnauthorizedResponse: Spy<RegisterHandlerDeps['createUnauthorizedResponse']>;
    createErrorResponse: Spy<RegisterHandlerDeps['createErrorResponse']>;
    createSuccessResponse: Spy<RegisterHandlerDeps['createSuccessResponse']>;
    registerService: {
        signUp: Spy<RegisterService['signUp']>;
    };
}

// --- Test Cases ---
Deno.test("Register Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    // Refactored to mock RegisterService
    const createMockDeps = (overrides: Partial<RegisterHandlerDeps> = {}): SpiedRegisterHandlerDeps => {
        // Default mocks for non-service dependencies
        const defaultHandleCors = (_req: Request): Response | null => null;
        const defaultVerifyApiKey = (_req: Request): boolean => true;
        const defaultCreateUnauthorized = (msg: string): Response => new Response(JSON.stringify({ error: msg }), { status: 401 });
        const defaultCreateError = (msg: string, status?: number, _req?: Request, _err?: unknown): Response => new Response(JSON.stringify({ error: msg }), { status: status || 500 });
        const defaultCreateSuccess = (data: unknown, status = 200, _req?: Request): Response => new Response(JSON.stringify(data), { status });
        
        // Default mock for RegisterService signUp - No need for explicit AuthError type here
        const defaultSignUpError = { 
            name: 'DefaultAuthError', 
            message: "Default mock: signUp not overridden", 
            status: 400, 
            // code: 'mock_code' // Also likely unnecessary unless used
            // __isAuthError removed
        }; 
        // The spy resolves with an object that *contains* the error, matching AuthResponse structure
        const defaultSignUp = spy(async (_creds: any): Promise<AuthResponse> => ({ data: { user: null, session: null }, error: defaultSignUpError as AuthError }));

        // Assemble spied dependencies
        const deps: SpiedRegisterHandlerDeps = {
            handleCorsPreflightRequest: spy(overrides.handleCorsPreflightRequest ?? defaultHandleCors),
            verifyApiKey: spy(overrides.verifyApiKey ?? defaultVerifyApiKey),
            createUnauthorizedResponse: spy(overrides.createUnauthorizedResponse ?? defaultCreateUnauthorized),
            createErrorResponse: spy(overrides.createErrorResponse ?? defaultCreateError),
            createSuccessResponse: spy(overrides.createSuccessResponse ?? defaultCreateSuccess),
            registerService: { 
                signUp: spy(overrides.registerService?.signUp ?? defaultSignUp)
            }
        };

        return deps;
    };
    
    // Stub Deno.env.get
    const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
        if (key === 'SUPABASE_URL') return 'http://localhost:54321';
        if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
        return undefined;
    });

    // --- Actual Tests --- 
    try {
        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204 });
            const mockHandleCorsSpy = spy(() => mockResponse);
            const mockDeps = createMockDeps({ handleCorsPreflightRequest: mockHandleCorsSpy });
            const req = new Request('http://example.com/register', { method: 'OPTIONS' });
            const res = await handleRegisterRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockHandleCorsSpy, 0);
            assertSpyCalls(mockDeps.verifyApiKey, 0); // Should not verify API key
            assertSpyCalls(mockDeps.registerService.signUp, 0); // Should not call signUp
        });

        await t.step("GET request should return 405 Method Not Allowed", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/register', { method: 'GET' });
            const res = await handleRegisterRequest(req, mockDeps);
            assertEquals(res.status, 405);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method Not Allowed", 405, req] });
            assertSpyCall(mockDeps.verifyApiKey, 0); // API key IS checked before method
            assertSpyCalls(mockDeps.registerService.signUp, 0); // signUp not called
        });

        await t.step("POST request without API key should return 401 Unauthorized", async () => {
            const mockVerifyApiKeySpy = spy(() => false);
            const mockDeps = createMockDeps({ verifyApiKey: mockVerifyApiKeySpy });
            const req = new Request('http://example.com/register', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
            });
            const res = await handleRegisterRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockVerifyApiKeySpy, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            assertSpyCalls(mockDeps.registerService.signUp, 0); // signUp not called
        });

         await t.step("POST request missing email should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/register', { 
                method: 'POST',
                headers: { 'apikey': 'test-anon-key', 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'password123' })
            });
            const res = await handleRegisterRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Email and password are required", 400, req] });
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCalls(mockDeps.registerService.signUp, 0);
        });

        await t.step("POST request missing password should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/register', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' })
            });
            const res = await handleRegisterRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Email and password are required", 400, req] });
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCalls(mockDeps.registerService.signUp, 0);
        });

        await t.step("Registration service error should return error response", async () => {
            // Use plain Error + status for mock, assert as AuthError for type safety
            const mockError = new Error("User already registered");
            (mockError as any).status = 422; // Example status
            // Cast here when creating the mock response structure
            const mockSignUpResponse: AuthResponse = { 
                data: { user: null, session: null }, 
                error: mockError as AuthError 
            };
            const mockSignUpSpy = spy(async (_creds: any) => mockSignUpResponse);
            
            const mockDeps = createMockDeps({
                registerService: { signUp: mockSignUpSpy }
            });
            
            const credentials = { email: 'exists@example.com', password: 'password123' };
            const req = new Request('http://example.com/register', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const res = await handleRegisterRequest(req, mockDeps);
            
            assertEquals(res.status, 422); // Use status from mock error
            assertSpyCall(mockSignUpSpy, 0, { args: [credentials] });
            // Cast here for the spy assertion argument check
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [`Auth Error: ${mockError.message}`, 422, req, mockError as AuthError] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("Registration success but missing session should return 500", async () => {
            const mockUser: User = { id: 'user-nosession', email: 'no-session@example.com' } as any;
            const mockSignUpResponse: AuthResponse = { data: { user: mockUser, session: null }, error: null }; // Session is null
            const mockSignUpSpy = spy(async (_creds: any) => mockSignUpResponse);
            
            const mockDeps = createMockDeps({
                registerService: { signUp: mockSignUpSpy }
            });

            const credentials = { email: 'no-session@example.com', password: 'password123' };
            const req = new Request('http://example.com/register', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const res = await handleRegisterRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockSignUpSpy, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Registration completed but failed to retrieve session.", 500, req] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });
        
        await t.step("Registration success but missing user should return 500", async () => {
            const mockSession: Session = { access_token: 'abc', refresh_token: 'def' } as any;
            const mockSignUpResponse: AuthResponse = { data: { user: null, session: mockSession }, error: null }; // User is null
            const mockSignUpSpy = spy(async (_creds: any) => mockSignUpResponse);
            
            const mockDeps = createMockDeps({
                registerService: { signUp: mockSignUpSpy }
            });

            const credentials = { email: 'no-user@example.com', password: 'password123' };
            const req = new Request('http://example.com/register', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const res = await handleRegisterRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockSignUpSpy, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Registration completed but failed to retrieve session.", 500, req] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("Successful registration should return user and session", async () => {
            const mockUser: User = { id: 'user-123', email: 'success@example.com' } as any;
            const mockSession: Session = { access_token: 'abc', refresh_token: 'def' } as any;
            const mockSignUpResponse: AuthResponse = { data: { user: mockUser, session: mockSession }, error: null };
            const mockSignUpSpy = spy(async (_creds: any) => mockSignUpResponse);
            
            const mockDeps = createMockDeps({
                registerService: { signUp: mockSignUpSpy }
            });
            
            const credentials = { email: 'success@example.com', password: 'password123' };
            const req = new Request('http://example.com/register', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const res = await handleRegisterRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.user.id, mockUser.id);
            assertEquals(body.session.access_token, mockSession.access_token);
            
            assertSpyCall(mockSignUpSpy, 0, { args: [credentials] });
            assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [{ user: mockUser, session: mockSession }, 200, req] });
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

    } finally {
        envGetStub.restore();
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