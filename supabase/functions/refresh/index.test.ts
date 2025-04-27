import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, type Spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and dependency interface
import { handleRefreshRequest, type RefreshHandlerDeps, type RefreshService } from "./index.ts";

// Import types needed for mocks
import type { 
    SupabaseClient, 
    AuthResponse, 
    AuthError, 
    User, 
    Session,
    PostgrestSingleResponse,
    PostgrestError
} from "@supabase/supabase-js";

// --- Helper Type for Spied Dependencies ---
// Maps each function property in T to its corresponding Spy type
// Update to handle potential non-function properties if RefreshHandlerDeps changes
// Explicitly type known function properties as Spies
interface SpiedRefreshHandlerDeps extends Omit<RefreshHandlerDeps, 'refreshService'> {
    handleCorsPreflightRequest: Spy<RefreshHandlerDeps['handleCorsPreflightRequest']>;
    verifyApiKey: Spy<RefreshHandlerDeps['verifyApiKey']>;
    createUnauthorizedResponse: Spy<RefreshHandlerDeps['createUnauthorizedResponse']>;
    createErrorResponse: Spy<RefreshHandlerDeps['createErrorResponse']>;
    createSuccessResponse: Spy<RefreshHandlerDeps['createSuccessResponse']>;
    refreshService: {
        refreshSession: Spy<RefreshService['refreshSession']>;
        fetchProfile: Spy<RefreshService['fetchProfile']>;
    };
}

// --- Test Cases ---
Deno.test("Refresh Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<RefreshHandlerDeps> = {}): SpiedRefreshHandlerDeps => {
        // Default mock implementations for non-service dependencies
        const defaultHandleCors = (_req: Request): Response | null => null;
        const defaultVerifyApiKey = (_req: Request): boolean => true;
        const defaultCreateUnauthorized = (msg: string): Response => new Response(JSON.stringify({ error: msg }), { status: 401 });
        const defaultCreateError = (msg: string, status?: number, _req?: Request, _err?: unknown): Response => new Response(JSON.stringify({ error: msg }), { status: status || 500 });
        const defaultCreateSuccess = (data: unknown, status = 200, _req?: Request): Response => new Response(JSON.stringify(data), { status });
        
        // Default mock implementation for RefreshService methods
        // Use plain Error + status, assert as AuthError for response type
        const defaultRefreshError = new Error("Default mock: refreshSession not overridden");
        (defaultRefreshError as any).status = 400; // Add status
        const defaultRefreshSession = spy(async (_token: string): Promise<AuthResponse> => ({ 
            data: { user: null, session: null }, 
            error: defaultRefreshError as AuthError // Assert type
        }));
        
        // Add missing PostgrestError properties
        const defaultProfileError: PostgrestError = { 
            name: 'DefaultPostgrestError', 
            message: "Default mock: fetchProfile not overridden", 
            details: '', 
            hint: '', 
            code: 'MOCK' 
        };
        // Set count to null for error response
        const defaultFetchProfile = spy(async (_userId: string): Promise<PostgrestSingleResponse<any>> => ({ data: null, error: defaultProfileError, status: 500, statusText: 'Error', count: null }));

        // Assemble the spied dependencies object
        const deps: SpiedRefreshHandlerDeps = {
            handleCorsPreflightRequest: spy(overrides.handleCorsPreflightRequest ?? defaultHandleCors),
            verifyApiKey: spy(overrides.verifyApiKey ?? defaultVerifyApiKey),
            createUnauthorizedResponse: spy(overrides.createUnauthorizedResponse ?? defaultCreateUnauthorized),
            createErrorResponse: spy(overrides.createErrorResponse ?? defaultCreateError),
            createSuccessResponse: spy(overrides.createSuccessResponse ?? defaultCreateSuccess),
            // Provide spied methods for refreshService, allowing overrides
            refreshService: { 
                refreshSession: spy(overrides.refreshService?.refreshSession ?? defaultRefreshSession),
                fetchProfile: spy(overrides.refreshService?.fetchProfile ?? defaultFetchProfile)
            }
        };

        return deps;
    };
    
    // Keep env stub as it's needed for the default createDefaultDeps in index.ts (if ever called indirectly)
    const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
        if (key === 'SUPABASE_URL') return 'http://localhost:54321';
        if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
        return undefined;
    });

    // --- Actual Tests --- 
    try {
        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204 });
            // Provide a spied function directly for the override
            const mockHandleCorsSpy = spy(() => mockResponse);
            const mockDeps = createMockDeps({ handleCorsPreflightRequest: mockHandleCorsSpy });
            const req = new Request('http://example.com/refresh', { method: 'OPTIONS' });
            const res = await handleRefreshRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockHandleCorsSpy, 0); // Assert against the specific spy passed in
            assertSpyCalls(mockDeps.verifyApiKey, 0); // verifyApiKey spy shouldn't be called
        });

        await t.step("Request without API key should return 401", async () => {
            const mockVerifyApiKeySpy = spy(() => false);
            const mockDeps = createMockDeps({ verifyApiKey: mockVerifyApiKeySpy }); 
            const req = new Request('http://example.com/refresh', { 
                method: 'POST', headers: { 'Authorization': 'Bearer old-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockVerifyApiKeySpy, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            // Assert refreshService methods were NOT called
            assertSpyCalls(mockDeps.refreshService.refreshSession, 0); 
            assertSpyCalls(mockDeps.refreshService.fetchProfile, 0); 
        });

        await t.step("Request without Authorization header should return 400", async () => {
            const mockDeps = createMockDeps(); // Use default mocks
            const req = new Request('http://example.com/refresh', { 
                method: 'POST', headers: { 'apikey': 'test-anon-key' } // Valid API key, but no Auth
            });
            const res = await handleRefreshRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.verifyApiKey, 0); // API key is checked first
            // Assert createErrorResponse was called with correct details, including the request object
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Refresh token is required in Authorization header", 400, req] }); 
            // Assert refreshService methods were NOT called
            assertSpyCalls(mockDeps.refreshService.refreshSession, 0);
            assertSpyCalls(mockDeps.refreshService.fetchProfile, 0);
        });

        await t.step("Successful refresh, profile found", async () => {
            // Define mock data for this specific scenario
            const mockUser: User = { id: 'user-123', email: 'good@example.com' } as any;
            // Ensure mockSession includes all properties copied by the handler
            const mockSession: Session = { 
                access_token: 'new-access', 
                refresh_token: 'new-refresh', 
                expires_in: 3600, 
                expires_at: Date.now() + 3600 * 1000,
                token_type: 'bearer',
                user: mockUser // Include user as Session type expects it
            };
            const mockProfileData = { id: 'user-123', name: 'Good User' };
            const mockRefreshResponse: AuthResponse = { data: { user: mockUser, session: mockSession }, error: null };
            const mockProfileResponse: PostgrestSingleResponse<any> = { data: mockProfileData, error: null, status: 200, statusText: 'OK', count: 1 };

            // Create spied mock implementations for the service methods
            const mockRefreshSessionSpy = spy(async (_token: string) => mockRefreshResponse);
            const mockFetchProfileSpy = spy(async (_userId: string) => mockProfileResponse);

            const mockDeps = createMockDeps({
                refreshService: { // Override the entire service mock
                    refreshSession: mockRefreshSessionSpy,
                    fetchProfile: mockFetchProfileSpy
                }
            }); 
            
            const req = new Request('http://example.com/refresh', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();

            // Assert calls to the service methods
            assertSpyCall(mockRefreshSessionSpy, 0, { args: ['good-refresh'] });
            assertSpyCall(mockFetchProfileSpy, 0, { args: [mockUser.id] });

            // Assert the structure and content of the response body
            assertExists(body.user);
            assertExists(body.session);
            assertExists(body.profile);
            assertEquals(body.user.id, mockUser.id);
            // Check the specific session properties returned by the handler
            assertEquals(body.session.access_token, mockSession.access_token);
            assertEquals(body.session.refresh_token, mockSession.refresh_token);
            assertEquals(body.session.expiresIn, mockSession.expires_in);
            assertEquals(body.session.expiresAt, mockSession.expires_at);
            assertEquals(body.session.token_type, mockSession.token_type);
            assertEquals(body.profile.name, mockProfileData.name);

            // Check other spies
            assertSpyCall(mockDeps.verifyApiKey, 0);
            // Assert createSuccessResponse was called with correct details, including request
            // IMPORTANT: Compare against the REFORMATTED session object the handler creates
            const expectedSuccessPayload = {
                user: mockUser,
                session: {
                    access_token: mockSession.access_token,
                    refresh_token: mockSession.refresh_token,
                    expiresIn: mockSession.expires_in,
                    expiresAt: mockSession.expires_at,
                    token_type: mockSession.token_type
                },
                profile: mockProfileData
            };
            assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [expectedSuccessPayload, 200, req] }); 
            assertSpyCalls(mockDeps.createErrorResponse, 0); // Ensure error response was not called
        });

        await t.step("Successful refresh, profile fetch error", async () => {
             // Define mock data for this specific scenario
            const mockUser: User = { id: 'user-456' } as any;
            // Ensure mockSession includes all properties copied by the handler
            const mockSession: Session = { 
                access_token: 'another-access', 
                refresh_token: 'another-refresh', // Add missing property
                expires_in: 7200, // Add missing property
                expires_at: Date.now() + 7200 * 1000, // Add missing property
                token_type: 'bearer', // Add missing property
                user: mockUser // Include user
            }; 
            const mockRefreshResponse: AuthResponse = { data: { user: mockUser, session: mockSession }, error: null };
            // Add missing PostgrestError properties
            const mockProfileError: PostgrestError = { 
                name: 'MockDBError', 
                message: "DB error fetching profile", 
                details: "Mock details", 
                hint: "Mock hint", 
                code: "DB500" 
            }; 
            // Set count to null for error response
            const mockProfileResponseError: PostgrestSingleResponse<any> = { data: null, error: mockProfileError, status: 500, count: null, statusText: "Error" };

            // Create spied mock implementations for the service methods
            const mockRefreshSessionSpy = spy(async (_token: string) => mockRefreshResponse);
            const mockFetchProfileSpy = spy(async (_userId: string) => mockProfileResponseError);

            const mockDeps = createMockDeps({
                refreshService: { // Override the entire service mock
                    refreshSession: mockRefreshSessionSpy,
                    fetchProfile: mockFetchProfileSpy
                }
            });

            const req = new Request('http://example.com/refresh', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh-profile-fail' }
            });
            const res = await handleRefreshRequest(req, mockDeps);
            
            assertEquals(res.status, 200); // Still succeeds overall
            const body = await res.json();
            assertEquals(body.profile, null); // Profile should be null
            assertExists(body.user); // User should still be present
            assertExists(body.session); // Session should still be present

            // Check the correct service spies were called
            assertSpyCall(mockRefreshSessionSpy, 0);
            assertSpyCall(mockFetchProfileSpy, 0);
            // Assert createSuccessResponse was called (even with null profile)
            // IMPORTANT: Compare against the REFORMATTED session object the handler creates
            const expectedSuccessPayload = {
                user: mockUser,
                session: {
                    access_token: mockSession.access_token,
                    refresh_token: mockSession.refresh_token,
                    expiresIn: mockSession.expires_in,
                    expiresAt: mockSession.expires_at,
                    token_type: mockSession.token_type
                },
                profile: null // Profile is null in this case
            };
            assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [expectedSuccessPayload, 200, req] });
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("Failed refresh should return 401", async () => {
            // Use plain Error + status, assert as AuthError for response type
            const mockAuthError = new Error("Invalid refresh token");
            (mockAuthError as any).status = 401; // Add status
            const mockRefreshResponseError: AuthResponse = { 
                data: { user: null, session: null }, 
                error: mockAuthError as AuthError // Assert type
            }; 
            
            const mockRefreshSessionSpy = spy(async (_token: string) => mockRefreshResponseError);
            // fetchProfile spy shouldn't be called, but needs compatible return type
            const mockFetchProfileSpy = spy(async (_userId: string): Promise<PostgrestSingleResponse<any>> => ({ data: null, error: null, status: 200, statusText: 'OK', count: null })); // count is null for single/maybeSingle success too

            const mockDeps = createMockDeps({
                refreshService: { 
                    refreshSession: mockRefreshSessionSpy,
                    fetchProfile: mockFetchProfileSpy
                }
            });

            const req = new Request('http://example.com/refresh', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer bad-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockRefreshSessionSpy, 0, { args: ['bad-refresh'] });
            // Assert createErrorResponse was called with correct details, using the plain mockAuthError
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockAuthError.message, 401, req, mockAuthError] }); 
            assertSpyCalls(mockFetchProfileSpy, 0); 
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("Successful refresh but missing user data should return 500", async () => {
            const mockSession: Session = { access_token: 'abc' } as any;
            const mockRefreshResponseNoUser: AuthResponse = { data: { session: mockSession, user: null }, error: null }; 
            const mockRefreshSessionSpy = spy(async (_token: string) => mockRefreshResponseNoUser);
            // fetchProfile spy shouldn't be called, needs compatible return type
            const mockFetchProfileSpy = spy(async (_userId: string): Promise<PostgrestSingleResponse<any>> => ({ data: null, error: null, status: 200, statusText: 'OK', count: 0 }));

            const mockDeps = createMockDeps({
                refreshService: { 
                    refreshSession: mockRefreshSessionSpy,
                    fetchProfile: mockFetchProfileSpy // Assign the correctly typed spy
                }
            });
            
            const req = new Request('http://example.com/refresh', { 
                 method: 'POST', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh-no-user' }
            });
            const res = await handleRefreshRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockRefreshSessionSpy, 0);
            // Assert createErrorResponse was called with correct details, including request
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to refresh session: Incomplete data", 500, req] });
            assertSpyCalls(mockFetchProfileSpy, 0);
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("Successful refresh but missing session data should return 500", async () => {
            const mockUser: User = { id: 'user-xyz' } as any;
            const mockRefreshResponseNoSession: AuthResponse = { data: { user: mockUser, session: null }, error: null }; 
            const mockRefreshSessionSpy = spy(async (_token: string) => mockRefreshResponseNoSession);
            // fetchProfile spy shouldn't be called, needs compatible return type
            const mockFetchProfileSpy = spy(async (_userId: string): Promise<PostgrestSingleResponse<any>> => ({ data: null, error: null, status: 200, statusText: 'OK', count: 0 }));

            const mockDeps = createMockDeps({
                refreshService: { 
                    refreshSession: mockRefreshSessionSpy,
                    fetchProfile: mockFetchProfileSpy // Assign the correctly typed spy
                }
            });
            
            const req = new Request('http://example.com/refresh', { 
                 method: 'POST', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh-no-session' }
            });
            const res = await handleRefreshRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockRefreshSessionSpy, 0);
            // Assert createErrorResponse was called with correct details, including request
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to refresh session: Incomplete data", 500, req] });
            assertSpyCalls(mockFetchProfileSpy, 0);
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

    } finally {
        // Restore stubs
        envGetStub.restore(); 
    }
}); 