import {
    assert,
    assertEquals,
    assertExists,
    assertInstanceOf,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
    describe,
    it,
    beforeEach,
    afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
    spy,
    stub,
    Spy,
    Stub,
    assertSpyCall,
    assertSpyCalls,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
import {
    SupabaseClient,
    User,
    Session,
    AuthError,
    AuthResponse,
    PostgrestSingleResponse,
} from "@supabase/supabase-js";

import { handleSessionRequest, SessionHandlerDeps } from "./index.ts";

// --- Test Cases ---
Deno.test("Session Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies --- (Applying Fix Pattern)
    const createMockDeps = (overrides: Partial<SessionHandlerDeps> = {}): SessionHandlerDeps => {
        // Default mocks 
        const mockUser: User = { id: 'user-123', email: 'test@example.com' } as any;
        const mockSession: Session = { access_token: 'valid-access', refresh_token: 'valid-refresh', user: mockUser } as any;
        const mockGetUser = spy(async (_token?: string): Promise<{ data: { user: User | null }, error: AuthError | null }> => { 
            return { data: { user: mockUser }, error: null }; 
        });
        const mockRefreshSession = spy(async (_args?: { refresh_token: string }): Promise<AuthResponse> => ({ 
            data: { user: mockUser, session: mockSession }, 
            error: null 
        }));
        const mockProfileFetchResult: PostgrestSingleResponse<any> = { data: { id: 'user-123', name: 'Test User' }, error: null, status: 200, statusText: 'OK', count: 1 };
        const mockMaybeSingle = spy(() => Promise.resolve(mockProfileFetchResult));
        const mockEq = spy(() => ({ maybeSingle: mockMaybeSingle }));
        const mockSelect = spy(() => ({ eq: mockEq }));
        const mockFrom = spy(() => ({ select: mockSelect }));

        const mockClient = {
            auth: { 
                getUser: mockGetUser, 
                refreshSession: mockRefreshSession 
            },
            from: mockFrom
        };
        
        // Keep defaults explicitly spied
        const defaultMocks = {
            handleCorsPreflightRequest: spy((_req: Request) => null), 
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy<
                (data: unknown, status?: number | undefined) => Response,
                [data: unknown, status?: number | undefined],
                Response
            >((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy(() => mockClient as any), 
        };

        // Start with spied defaults
        const finalMocks = { ...defaultMocks };

        // Apply overrides directly (caller must spy overrides if needed)
        for (const key in overrides) {
            if (Object.prototype.hasOwnProperty.call(overrides, key)) {
                (finalMocks as any)[key] = overrides[key as keyof SessionHandlerDeps];
            }
        }
        // Return base type
        return finalMocks as SessionHandlerDeps;
    };

    // Mock Deno.env.get once
    let envStub: Stub;
    beforeEach(() => {
        envStub = stub(Deno.env, "get", (key: string): string | undefined => {
            if (key === 'SUPABASE_URL') return 'http://localhost:54321';
            if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
            return undefined;
        });
    });
    afterEach(() => {
        envStub.restore(); 
    });

    // Test CORS
    await t.step("should handle CORS preflight requests", async () => {
        const mockDeps = createMockDeps();
        const req = new Request("http://example.com/session", { method: "OPTIONS" });
        await handleSessionRequest(req, mockDeps);
        // Cast needed for assertion
        assertSpyCall(mockDeps.handleCorsPreflightRequest as Spy, 0);
    });

    // Test Method Not Allowed
    await t.step("should return 405 for non-POST requests", async () => {
        const mockDeps = createMockDeps();
        const req = new Request("http://example.com/session", { method: "GET" });
        const res = await handleSessionRequest(req, mockDeps);
        assertEquals(res.status, 405);
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method Not Allowed", 405] });
    });

    // Test Missing Tokens
    await t.step("should return 400 if access_token is missing", async () => {
        const mockDeps = createMockDeps();
        const req = new Request("http://example.com/session", { 
            method: "POST", 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: "refresh" })
        });
        const res = await handleSessionRequest(req, mockDeps);
        assertEquals(res.status, 400);
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Access token and refresh token are required", 400] });
        assertSpyCalls(mockDeps.createSupabaseClient as Spy, 0);
    });
    
    await t.step("should return 400 if refresh_token is missing", async () => {
        const mockDeps = createMockDeps();
        const req = new Request("http://example.com/session", { 
            method: "POST", 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: "access" })
        });
        const res = await handleSessionRequest(req, mockDeps);
        assertEquals(res.status, 400);
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Access token and refresh token are required", 400] });
        assertSpyCalls(mockDeps.createSupabaseClient as Spy, 0);
    });

    // Test Invalid JSON
    await t.step("should return 400 for invalid JSON body", async () => {
        const mockDeps = createMockDeps();
        const req = new Request("http://example.com/session", { 
            method: "POST", 
            headers: { 'Content-Type': 'application/json' },
            body: "{ invalid json " 
        });
        const res = await handleSessionRequest(req, mockDeps);
        assertEquals(res.status, 400);
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Invalid JSON body", 400] });
        assertSpyCalls(mockDeps.createSupabaseClient as Spy, 0);
    });

    // Test Successful Session Refresh
    await t.step("should refresh session and fetch profile on valid POST", async () => {
        const mockDeps = createMockDeps(); // Use default mocks which simulate success
        const tokens = { access_token: "valid-access", refresh_token: "valid-refresh" };
        const req = new Request("http://example.com/session", { 
            method: "POST", 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokens)
        });
        const res = await handleSessionRequest(req, mockDeps);
        assertEquals(res.status, 200);
        
        // Get the mock client instance used (cast needed)
        const mockClientUsed = (mockDeps.createSupabaseClient as Spy).calls[0].returned;

        // Assert spies within the mock client
        assertSpyCall(mockClientUsed.auth.refreshSession, 0, { args: [{ refresh_token: tokens.refresh_token }] });
        assertSpyCall(mockClientUsed.auth.getUser, 0, { args: [tokens.access_token] });
        assertSpyCall(mockClientUsed.from, 0, { args: ['user_profiles'] });

        // Cast needed for assertion
        assertSpyCall(mockDeps.createSuccessResponse as Spy, 0);
        const body = await res.json();
        assertEquals(body.id, 'user-123'); 
        assertEquals(body.name, 'Test User');
    });
    
    // Test getUser Error
    await t.step("should return 401 if getUser fails", async () => {
        const authError = new AuthError("Invalid access token");
        const mockGetUser = spy(() => Promise.resolve({ data: { user: null }, error: authError }));
        const mockClientError = { 
            auth: { 
                getUser: mockGetUser, 
                refreshSession: spy(() => Promise.resolve({data: {user: {id:'test'} as any, session:{}} as any, error: null})) 
            }, 
            from: spy(() => ({ select: spy(() => ({ eq: spy(() => ({ maybeSingle: spy(()=>Promise.resolve({data:{}, error:null})) })) })) }))
        };
        const mockCreateClientOverride = spy(() => mockClientError as any);
        const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientOverride });
        
        const tokens = { access_token: "invalid-access", refresh_token: "valid-refresh" };
        const req = new Request("http://example.com/session", { method: "POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify(tokens) });
        const res = await handleSessionRequest(req, mockDeps);
        
        assertEquals(res.status, 401);
        assertSpyCall(mockCreateClientOverride, 0); 
        assertSpyCall(mockGetUser, 0); 
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: [authError.message, 401] });
    });

    // Test refreshSession Error
    await t.step("should return 401 if refreshSession fails", async () => {
        const authError = new AuthError("Invalid refresh token");
        const mockRefreshSession = spy(() => Promise.resolve({ data: { user: null, session: null }, error: authError }));
        const mockClientError = { 
            auth: { 
                getUser: spy(() => Promise.resolve({data: {user:{id: 'test'} as any}, error: null})), 
                refreshSession: mockRefreshSession 
            }, 
            from: spy(() => ({ select: spy(() => ({ eq: spy(() => ({ maybeSingle: spy(()=>Promise.resolve({data:{}, error:null})) })) })) }))
        };
        const mockCreateClientOverride = spy(() => mockClientError as any);
        const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientOverride });
        
        const tokens = { access_token: "valid-access", refresh_token: "invalid-refresh" };
        const req = new Request("http://example.com/session", { method: "POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify(tokens) });
        const res = await handleSessionRequest(req, mockDeps);
        
        assertEquals(res.status, 401);
        assertSpyCall(mockCreateClientOverride, 0); 
        assertSpyCall(mockRefreshSession, 0); 
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: [authError.message, 401] });
    });

    // Test Profile Fetch Error
    await t.step("should return 500 if profile fetch fails", async () => {
        const dbError = { message: "DB error", code: "500", details: "", hint: "", name: "PostgrestError" };
        const mockMaybeSingleError = spy(() => Promise.resolve({ data: null, error: dbError }));
        const mockClientError = { 
            auth: { 
                getUser: spy(() => Promise.resolve({data: {user:{id: 'test'} as any}, error: null})), 
                refreshSession: spy(() => Promise.resolve({data: {user: {id:'test'} as any, session:{}} as any, error: null})) 
            },
            from: spy(() => ({ select: spy(() => ({ eq: spy(() => ({ maybeSingle: mockMaybeSingleError })) })) }))
        };
        const mockCreateClientOverride = spy(() => mockClientError as any);
        const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientOverride });
        
        const tokens = { access_token: "valid-access", refresh_token: "valid-refresh" };
        const req = new Request("http://example.com/session", { method: "POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify(tokens) });
        const res = await handleSessionRequest(req, mockDeps);
        
        assertEquals(res.status, 500);
        assertSpyCall(mockCreateClientOverride, 0); 
        assertSpyCall(mockMaybeSingleError, 0); 
        // Cast needed for assertion
        assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: [`Database error: ${dbError.message}`, 500] });
    });

}); 