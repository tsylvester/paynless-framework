import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleRefreshRequest, type RefreshHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type { 
    SupabaseClient, 
    AuthResponse, 
    AuthError, 
    User, 
    Session,
    PostgrestSingleResponse
} from "@supabase/supabase-js";

// --- Test Cases ---
Deno.test("Refresh Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<RefreshHandlerDeps> = {}): RefreshHandlerDeps => {
        // Default mocks
        const mockUser: User = { id: 'user-789', email: 'refresh@example.com' } as any;
        const mockSession: Session = { 
            access_token: 'new-valid-access', 
            refresh_token: 'new-valid-refresh', 
            user: mockUser, 
            expires_in: 3600, 
            expires_at: Date.now() + 3600 * 1000,
            token_type: 'bearer'
        } as any;
        const mockRefreshSession = spy(async (_args?: { refresh_token: string }): Promise<AuthResponse> => {
            // --> Add logging <--
            console.log("[Mock refreshSession] Called. Returning mock data.");
            // --> End logging <--
            return { 
                data: { user: mockUser, session: mockSession }, 
                error: null 
            }
        });
        const mockProfileFetchResult: PostgrestSingleResponse<any> = { data: { id: 'user-789', name: 'Refresh User' }, error: null, status: 200, statusText: 'OK', count: 1 };
        const mockMaybeSingle = spy(() => Promise.resolve(mockProfileFetchResult));
        const mockFrom = spy(() => ({ 
            select: spy(() => ({ 
                eq: spy(() => ({ 
                    maybeSingle: mockMaybeSingle
                })) 
            })) 
        }));

        const mockClient = {
            auth: { refreshSession: mockRefreshSession },
            from: mockFrom
        };
        
        return {
            handleCorsPreflightRequest: spy((_req: Request) => null), 
            verifyApiKey: spy((_req: Request) => true), // Default: valid API key
            createUnauthorizedResponse: spy((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 401 })),
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy(() => mockClient as any), 
            ...overrides,
        };
    };
    
    const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
        if (key === 'SUPABASE_URL') return 'http://localhost:54321';
        if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
        return undefined;
    });

    // --- Actual Tests --- 
    try {
        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204 });
            const mockDeps = createMockDeps({ handleCorsPreflightRequest: spy(() => mockResponse) });
            const req = new Request('http://example.com/refresh', { method: 'OPTIONS' });
            const res = await handleRefreshRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
            assertSpyCalls(mockDeps.verifyApiKey, 0); // Should not verify API key for OPTIONS
        });

        await t.step("Request without API key should return 401", async () => {
            const mockDeps = createMockDeps({ verifyApiKey: spy(() => false) }); // Invalid API key
            const req = new Request('http://example.com/refresh', { 
                method: 'POST', headers: { 'Authorization': 'Bearer old-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("Request without Authorization header should return 400", async () => {
            const mockDeps = createMockDeps(); 
            const req = new Request('http://example.com/refresh', { 
                method: 'POST', headers: { 'apikey': 'test-anon-key' } // Valid API key, but no Auth
            });
            const res = await handleRefreshRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.verifyApiKey, 0); // API key is checked first
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Refresh token is required in Authorization header", 400] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0); // Client not created yet
        });

        await t.step("Successful refresh, profile found", async () => {
            const mockDeps = createMockDeps(); // Uses default successful mocks
            const req = new Request('http://example.com/refresh', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();

            // Get the spies that were called
            const actualClientInstanceUsedByHandler = mockDeps.createSupabaseClient.calls[0]?.returned;
            assertExists(actualClientInstanceUsedByHandler, "createSupabaseClient spy should have been called and returned a value.");
            const refreshSessionSpyUsedByHandler = actualClientInstanceUsedByHandler.auth.refreshSession;
            const profileFetchSpyUsedByHandler = actualClientInstanceUsedByHandler.from('user_profiles').select().eq().maybeSingle;
            
            // Assert calls happened
            assertSpyCall(refreshSessionSpyUsedByHandler, 0, { args: [{ refresh_token: 'good-refresh' }] });
            assertSpyCall(profileFetchSpyUsedByHandler, 0);

            // Directly assert the body content based on mock definitions
            assertExists(body.user, "Response body should contain user");
            assertExists(body.session, "Response body should contain session");
            assertExists(body.profile, "Response body should contain profile");

            // Compare body content to the data defined in the mock setup
            const expectedMockProfile = { data: { id: 'user-789', name: 'Refresh User' }, error: null, status: 200, statusText: 'OK', count: 1 }; // from mockProfileFetchResult definition
            const expectedMockUser = { id: 'user-789', email: 'refresh@example.com' }; // from mockUser definition
            const expectedMockSession = { access_token: 'new-valid-access', refresh_token: 'new-valid-refresh' }; // Key parts from mockSession definition
            
            assertEquals(body.user.id, expectedMockUser.id);
            assertEquals(body.profile.id, expectedMockProfile.data.id);
            assertEquals(body.profile.name, expectedMockProfile.data.name);
            assertEquals(body.session.access_token, expectedMockSession.access_token);
            assertEquals(body.session.refresh_token, expectedMockSession.refresh_token);

            // Check other spies
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("Successful refresh, profile fetch error", async () => {
            // Get standard mock user/session for the refresh success part
            const tempDeps = createMockDeps();
            const mockUser = tempDeps.createSupabaseClient().auth.refreshSession.calls[0]?.returned?.data?.user || { id: 'temp-user' };
            const mockSession = tempDeps.createSupabaseClient().auth.refreshSession.calls[0]?.returned?.data?.session || { access_token: 'temp-token' };
            
            const mockProfileError: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB error' } as any, status: 500, count: 0, statusText: "Error" };
            const mockMaybeSingleError = spy(() => Promise.resolve(mockProfileError));
            const mockFromError = spy(() => ({ 
                select: spy(() => ({ 
                    eq: spy(() => ({ 
                        maybeSingle: mockMaybeSingleError
                    })) 
                })) 
            }));
            // Mock refresh to succeed with valid user/session structure
            const mockRefreshSuccess = spy(async () => ({ data: { user: mockUser, session: mockSession }, error: null })); 
            
            const mockClient = {
                auth: { refreshSession: mockRefreshSuccess }, // Simulate successful refresh
                from: mockFromError // Simulate profile fetch failure
            };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/refresh', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);
            
            assertEquals(res.status, 200); // Still succeeds
            const body = await res.json();
            assertEquals(body.profile, null); // Profile is null
            // Check the correct spies were called
            assertSpyCall(mockRefreshSuccess, 0);
            assertSpyCall(mockMaybeSingleError, 0); // Now this should be called
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("Failed refresh should return 401", async () => {
            const mockAuthError = new Error("Invalid refresh token") as AuthError; mockAuthError.status = 401;
            const mockRefreshSessionError = spy(async () => ({ data: { user: null, session: null }, error: mockAuthError }));
            const mockClient = { auth: { refreshSession: mockRefreshSessionError }, from: spy() }; // from shouldn't be called
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/refresh', { 
                method: 'POST', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer bad-refresh' }
            });
            const res = await handleRefreshRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockRefreshSessionError, 0, { args: [{ refresh_token: 'bad-refresh' }] });
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockAuthError.message, 401] });
            assertSpyCalls(mockClient.from, 0); // Profile fetch not attempted
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("Successful refresh but missing user data should return 500", async () => {
            // Mock refreshSession to return success but no user
            const mockRefreshSessionNoUser = spy(async () => ({ 
                data: { session: { access_token: 'abc' } as Session, user: null }, // Missing user
                error: null 
            }));
            const mockClient = { auth: { refreshSession: mockRefreshSessionNoUser }, from: spy() }; 
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });
            
            const req = new Request('http://example.com/refresh', { 
                 method: 'POST', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh-no-user' }
            });
            const res = await handleRefreshRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockRefreshSessionNoUser, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to refresh session: Incomplete data", 500] });
            assertSpyCalls(mockClient.from, 0);
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("Successful refresh but missing session data should return 500", async () => {
            // Mock refreshSession to return success but no session
            const mockRefreshSessionNoSession = spy(async () => ({ 
                data: { user: { id: 'abc' } as User, session: null }, // Missing session
                error: null 
            }));
            const mockClient = { auth: { refreshSession: mockRefreshSessionNoSession }, from: spy() }; 
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });
            
            const req = new Request('http://example.com/refresh', { 
                 method: 'POST', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-refresh-no-session' }
            });
            const res = await handleRefreshRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockRefreshSessionNoSession, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to refresh session: Incomplete data", 500] });
            assertSpyCalls(mockClient.from, 0);
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

    } finally {
        envGetStub.restore(); 
    }
}); 