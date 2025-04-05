import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleSessionRequest, type SessionHandlerDeps } from "./index.ts";

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
Deno.test("Session Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<SessionHandlerDeps> = {}): SessionHandlerDeps => {
        // Default mocks (can be overridden)
        const mockUser: User = { id: 'user-123', email: 'test@example.com' } as any;
        const mockSession: Session = { access_token: 'valid-access', refresh_token: 'valid-refresh', user: mockUser } as any;
        const mockGetUser = spy(async (_token?: string): Promise<{ data: { user: User | null }, error: AuthError | null }> => { 
            // Default: assume valid token passed if not overridden
            return { data: { user: mockUser }, error: null }; 
        });
        const mockRefreshSession = spy(async (_args?: { refresh_token: string }): Promise<AuthResponse> => ({ 
            data: { user: mockUser, session: mockSession }, 
            error: null 
        }));
        const mockProfileFetchResult: PostgrestSingleResponse<any> = { data: { id: 'user-123', name: 'Test User' }, error: null, status: 200, statusText: 'OK', count: 1 };
        const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve(mockProfileFetchResult)) })) })) }));

        const mockClient = {
            auth: { 
                getUser: mockGetUser, 
                refreshSession: mockRefreshSession 
            },
            from: mockFrom
        };
        
        return {
            handleCorsPreflightRequest: spy((_req: Request) => null), 
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy(() => mockClient as any), 
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
            const mockResponse = new Response(null, { status: 204 });
            const mockDeps = createMockDeps({ handleCorsPreflightRequest: spy(() => mockResponse) });
            const req = new Request('http://example.com/session', { method: 'OPTIONS' });
            const res = await handleSessionRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
        });

        await t.step("POST missing access_token should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/session', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: 'abc' }) 
            });
            const res = await handleSessionRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Access token and refresh token are required", 400] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("POST missing refresh_token should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/session', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: 'abc' }) 
            });
            const res = await handleSessionRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Access token and refresh token are required", 400] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("POST invalid JSON body should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/session', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: '{\"invalid json' 
            });
            const res = await handleSessionRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Invalid JSON body", 400] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("POST valid access token, profile found", async () => {
            const mockUser: User = { id: 'user-123' } as any;
            const mockProfile = { id: 'user-123', name: 'Test User' };
            const mockProfileRes: PostgrestSingleResponse<any> = { data: mockProfile, error: null, status: 200, count: 1, statusText: "OK" };
            const mockGetUser = spy(async (token?: string) => token === 'valid-access' ? { data: { user: mockUser }, error: null } : { data: { user: null }, error: new Error("Invalid") as AuthError});
            const mockSingle = spy(() => Promise.resolve(mockProfileRes));
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingle })) })) }));
            const mockClient = { auth: { getUser: mockGetUser }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/session', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: 'valid-access', refresh_token: 'any-refresh' })
            });
            const res = await handleSessionRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { user: mockUser, profile: mockProfile });
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockGetUser, 0, { args: ['valid-access'] });
            assertSpyCall(mockFrom, 0);
            assertSpyCall(mockSingle, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
        });
        
        await t.step("POST valid access token, profile fetch error (non-critical)", async () => {
            const mockUser: User = { id: 'user-123' } as any;
            const mockProfileError: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB error' } as any, status: 500, count: 0, statusText: "Error" };
            const mockGetUser = spy(async () => ({ data: { user: mockUser }, error: null }));
            const mockSingleError = spy(() => Promise.resolve(mockProfileError));
            const mockFromError = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingleError })) })) }));
            const mockClient = { auth: { getUser: mockGetUser }, from: mockFromError };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/session', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: 'valid-access', refresh_token: 'any-refresh' })
            });
            const res = await handleSessionRequest(req, mockDeps);

            assertEquals(res.status, 200); // Still succeeds
            const body = await res.json();
            assertEquals(body, { user: mockUser, profile: null }); // Profile is null
            assertSpyCall(mockGetUser, 0);
            assertSpyCall(mockSingleError, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
        });

        await t.step("POST invalid token -> refresh success -> profile found", async () => {
            const mockUser: User = { id: 'user-456' } as any;
            const mockNewSession: Session = { access_token: 'new-access', refresh_token: 'new-refresh', user: mockUser } as any;
            const mockProfile = { id: 'user-456', name: 'Refreshed User' };
            const mockProfileRes: PostgrestSingleResponse<any> = { data: mockProfile, error: null, status: 200, count: 1, statusText: "OK" };
            const mockGetUser = spy(async () => ({ data: { user: null }, error: new Error("Invalid token") as AuthError })); // getUser fails
            const mockRefreshSession = spy(async () => ({ data: { user: mockUser, session: mockNewSession }, error: null })); // refresh succeeds
            const mockSingle = spy(() => Promise.resolve(mockProfileRes)); // profile fetch succeeds
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingle })) })) }));
            const mockClient = { auth: { getUser: mockGetUser, refreshSession: mockRefreshSession }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });
            
            const req = new Request('http://example.com/session', { 
                 method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: 'invalid-access', refresh_token: 'good-refresh' })
            });
            const res = await handleSessionRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { user: mockUser, session: mockNewSession, profile: mockProfile });
            assertSpyCall(mockGetUser, 0, { args: ['invalid-access'] });
            assertSpyCall(mockRefreshSession, 0, { args: [{ refresh_token: 'good-refresh' }] });
            assertSpyCall(mockSingle, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("POST invalid token -> refresh success -> profile fetch error", async () => {
            const mockUser: User = { id: 'user-456' } as any;
            const mockNewSession: Session = { access_token: 'new-access', refresh_token: 'new-refresh', user: mockUser } as any;
            const mockProfileError: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB error' } as any, status: 500, count: 0, statusText: "Error" };
            const mockGetUser = spy(async () => ({ data: { user: null }, error: new Error("Invalid token") as AuthError })); 
            const mockRefreshSession = spy(async () => ({ data: { user: mockUser, session: mockNewSession }, error: null })); 
            const mockSingleError = spy(() => Promise.resolve(mockProfileError)); // profile fetch fails
            const mockFromError = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingleError })) })) }));
            const mockClient = { auth: { getUser: mockGetUser, refreshSession: mockRefreshSession }, from: mockFromError };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/session', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: 'invalid-access', refresh_token: 'good-refresh' })
            });
            const res = await handleSessionRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { user: mockUser, session: mockNewSession, profile: null }); // Profile is null
            assertSpyCall(mockGetUser, 0);
            assertSpyCall(mockRefreshSession, 0);
            assertSpyCall(mockSingleError, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0); 
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("POST invalid token -> refresh fails", async () => {
            const mockAuthError = new Error("Invalid refresh token") as AuthError; mockAuthError.status = 401;
            const mockGetUser = spy(async () => ({ data: { user: null }, error: new Error("Invalid token") as AuthError })); // getUser fails
            const mockRefreshSession = spy(async () => ({ data: { user: null, session: null }, error: mockAuthError })); // refresh fails
            const mockClient = { auth: { getUser: mockGetUser, refreshSession: mockRefreshSession }, from: spy() }; // from shouldn't be called
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/session', { 
                 method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: 'invalid-access', refresh_token: 'bad-refresh' })
            });
            const res = await handleSessionRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockGetUser, 0);
            assertSpyCall(mockRefreshSession, 0, { args: [{ refresh_token: 'bad-refresh' }] });
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockAuthError.message, 401] });
            assertSpyCalls(mockClient.from, 0); // Profile fetch not attempted
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

    } finally {
        envGetStub.restore(); 
    }
}); 