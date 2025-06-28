import { assertEquals, assertExists, assertInstanceOf, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub, type Spy } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleMeRequest, type MeHandlerDeps } from "./index.ts";

// Import types needed for mocks and deps signature
import type { 
    SupabaseClient, 
    User,
} from "@supabase/supabase-js";
// Import the shared mock utility
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type MockSupabaseClientSetup,
    type IMockClientSpies
} from '../_shared/supabase.mock.ts';

// --- Test Cases ---
Deno.test("Me Function (/me) Tests", async (t) => {

    // --- Mock Data ---
    const mockUserId = 'user-me-123';
    const mockUser: User = { id: mockUserId, email: 'me@example.com' } as any;
    const mockProfile = { id: mockUserId, username: 'testuser', avatar_url: 'url' };
    const mockUpdateData = { username: 'updateduser' };
    const mockUpdatedProfile = { ...mockProfile, ...mockUpdateData };

    // --- Helper to create Mock Dependencies ---
    let latestSpies: IMockClientSpies;

    const createMockDeps = (config: MockSupabaseDataConfig = {}, overrides: Partial<MeHandlerDeps> = {}): MeHandlerDeps => {
        
        // Default Config for Mock Supabase Client (Success cases)
        const defaultConfig: MockSupabaseDataConfig = {
            mockUser: mockUser,
            genericMockResults: {
                'user_profiles': { 
                    select: { data: [mockProfile], error: null, status: 200 }, 
                    update: { data: [mockUpdatedProfile], error: null, status: 200 },
                }
            },
            ...config, // Merge with test-specific config
        };

        const { client: mockClient, spies }: MockSupabaseClientSetup = createMockSupabaseClient(mockUserId, defaultConfig);
        latestSpies = spies;

        const defaultSpies: MeHandlerDeps = {
            handleCorsPreflightRequest: spy(() => null),
            createUnauthorizedResponse: spy((msg: string, _req: Request) => new Response(JSON.stringify({ error: msg }), { status: 401 })),
            createErrorResponse: spy((message: string, status = 500, _request: Request, _error?: Error | unknown, _additionalHeaders?: Record<string, string>) => new Response(JSON.stringify({ error: message }), { status })),
            createSuccessResponse: spy((data: unknown, status = 200, _request: Request, _additionalHeaders?: Record<string, string>) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy((_req: Request): SupabaseClient => mockClient as unknown as SupabaseClient),
        };

        return { ...defaultSpies, ...overrides }; 
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
            const mockDeps = createMockDeps({}, { handleCorsPreflightRequest: spy(() => mockResponse) });
            const req = new Request('http://example.com/me', { method: 'OPTIONS' });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest as Spy, 0); 
        });

        await t.step("Request without auth token should cause getUser failure -> 401", async () => {
            const authError = new Error("Test auth error");
            const mockDeps = createMockDeps({ simulateAuthError: authError });

            const req = new Request('http://example.com/me', { method: 'GET' });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.createSupabaseClient as Spy, 0);
            assertSpyCall(latestSpies.auth.getUserSpy, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse as Spy, 0, { args: ["Not authenticated", req] });
            const querySpies = latestSpies.getLatestQueryBuilderSpies('user_profiles');
            assertEquals(querySpies, undefined);
        });

        // --- GET Tests ---
        await t.step("GET: successful profile fetch should return profile", async () => {
            const mockDeps = createMockDeps(); 
            const req = new Request('http://example.com/me', { method: 'GET' });
            const res = await handleMeRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.user.id, mockUser.id);
            assertEquals(body.profile.id, mockProfile.id);

            assertSpyCall(latestSpies.auth.getUserSpy, 0); 
            const querySpies = latestSpies.getLatestQueryBuilderSpies('user_profiles');
            assertExists(querySpies);
            assertSpyCall(querySpies.select as Spy, 0);
            assertSpyCall(querySpies.eq as Spy, 0, { args: ['id', mockUserId] });
            assertSpyCall(querySpies.single as Spy, 0);
            assertSpyCall(mockDeps.createSuccessResponse as Spy, 0); 
            assertSpyCalls(mockDeps.createErrorResponse as Spy, 0);
        });

        await t.step("GET: profile fetch DB error should return 500", async () => {
            const dbError = new Error("Database is down");
            const mockDeps = createMockDeps({
                genericMockResults: { 
                    'user_profiles': { select: { data: null, error: dbError, status: 500 } }
                }
            });

            const req = new Request('http://example.com/me', { method: 'GET' });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(latestSpies.auth.getUserSpy, 0);
            const querySpies = latestSpies.getLatestQueryBuilderSpies('user_profiles');
            assertExists(querySpies);
            assertSpyCall(querySpies.select as Spy, 0);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to fetch profile", 500, req] }); 
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
        });

        await t.step("GET: profile fetch exception should return 500", async () => {
            const exception = new Error("Unexpected Store Exception");
            const mockDeps = createMockDeps({
                genericMockResults: { 
                    'user_profiles': { 
                        select: () => Promise.reject(exception) 
                    } 
                }
            });

            const req = new Request('http://example.com/me', { method: 'GET' });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(latestSpies.auth.getUserSpy, 0);
            const querySpies = latestSpies.getLatestQueryBuilderSpies('user_profiles');
            assertExists(querySpies);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to fetch profile", 500, req] });
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
        });

        // --- PUT Tests ---
         await t.step("PUT: successful profile update should return updated profile", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, mockUpdatedProfile);

            assertSpyCall(latestSpies.auth.getUserSpy, 0);
            const querySpies = latestSpies.getLatestQueryBuilderSpies('user_profiles');
            assertExists(querySpies);
            assertSpyCall(querySpies.update as Spy, 0, { args: [mockUpdateData] });
            assertSpyCall(querySpies.eq as Spy, 0, { args: ['id', mockUserId] });
            assertSpyCall(querySpies.select as Spy, 0);
            assertSpyCall(querySpies.single as Spy, 0);
            assertSpyCall(mockDeps.createSuccessResponse as Spy, 0);
            assertSpyCalls(mockDeps.createErrorResponse as Spy, 0);
        });

        await t.step("PUT: invalid JSON body should return 400", async () => {
            const mockDeps = createMockDeps(); 
            const req = new Request('http://example.com/me', { 
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: '{ not json '
            });
            
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Invalid JSON body for update", 400, req] });
            assertSpyCall(latestSpies.auth.getUserSpy, 0);
        });

        await t.step("PUT: update DB error should return 500", async () => {
            const dbError = new Error("Conflict on update");
            const mockDeps = createMockDeps({
                genericMockResults: { 
                    'user_profiles': { update: { data: null, error: dbError, status: 500 } }
                }
            });
            
            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });

            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(latestSpies.auth.getUserSpy, 0);
            const querySpies = latestSpies.getLatestQueryBuilderSpies('user_profiles');
            assertExists(querySpies);
            assertSpyCall(querySpies.update as Spy, 0);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to update profile", 500, req] });
        });

        await t.step("PUT: update exception should return 500", async () => {
            const exception = new Error("Transaction failed");
            const mockDeps = createMockDeps({
                genericMockResults: { 
                    'user_profiles': { update: () => Promise.reject(exception) } 
                }
            });

            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(latestSpies.auth.getUserSpy, 0);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to update profile", 500, req] });
        });

        // --- Other Method Tests ---
        await t.step("POST request should return 405 Method Not Allowed", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/me', { method: 'POST' });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res.status, 405);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method not allowed", 405, req] });
        });

    } finally {
        // Restore stubs
        envGetStub.restore();
    }
});