import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleProfileRequest, type ProfileHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type { 
    SupabaseClient, 
    AuthError, 
    User,
    PostgrestSingleResponse
} from "@supabase/supabase-js";

// --- Test Cases ---
Deno.test("Profile Function (/profile) Tests", async (t) => {

    // --- Mock Data ---
    const mockUser: User = { id: 'user-profile-456', email: 'profile@example.com' } as any;
    const mockExistingProfile = { id: 'user-profile-456', first_name: 'Test', last_name: 'User' };
    const mockPutData = { first_name: 'Updated' };
    const mockUpsertedProfile = { ...mockExistingProfile, ...mockPutData, updated_at: "some-iso-string" }; // Simulate DB result

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<ProfileHandlerDeps> = {}): ProfileHandlerDeps => {
        // Default mocks for client methods
        const mockGetUser = spy(async (): Promise<{ data: { user: User | null }, error: AuthError | null }> => ({ data: { user: mockUser }, error: null })); // Default: success
        const mockProfileGetResponse: PostgrestSingleResponse<any> = { data: mockExistingProfile, error: null, status: 200, count: 1, statusText: 'OK' };
        const mockProfileUpsertResponse: PostgrestSingleResponse<any> = { data: mockUpsertedProfile, error: null, status: 200, count: 1, statusText: 'OK' };
        const mockMaybeSingleGet = spy(() => Promise.resolve(mockProfileGetResponse)); // Default GET: profile exists
        const mockSingleUpsert = spy(() => Promise.resolve(mockProfileUpsertResponse)); // Default PUT: upsert success
        const mockSelect = spy(() => ({ eq: spy(() => ({ maybeSingle: mockMaybeSingleGet })) })); // GET uses maybeSingle
        const mockUpsert = spy(() => ({ select: spy(() => ({ single: mockSingleUpsert })) })); // PUT uses upsert()...single()
        const mockFrom = spy((_table: string) => ({ 
            select: mockSelect, 
            upsert: mockUpsert 
        }));

        const mockClient = {
            auth: { getUser: mockGetUser },
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
        // --- Auth/Setup Tests (similar to /me) ---
        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204 });
            const mockDeps = createMockDeps({ handleCorsPreflightRequest: spy(() => mockResponse) });
            const req = new Request('http://example.com/profile', { method: 'OPTIONS' });
            const res = await handleProfileRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
            assertSpyCalls(mockDeps.verifyApiKey, 0);
        });

        await t.step("Request without API key should return 401", async () => {
            const mockDeps = createMockDeps({ verifyApiKey: spy(() => false) });
            const req = new Request('http://example.com/profile', { method: 'GET', headers: { 'Authorization': 'Bearer token' } });
            const res = await handleProfileRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("Request without Authorization header should cause getUser failure -> 401", async () => {
            const mockGetUserError = spy(async () => ({ data: { user: null }, error: new Error("Not authenticated") as AuthError }));
            const mockClientError = { auth: { getUser: mockGetUserError }, from: spy() };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientError as any) });
            const req = new Request('http://example.com/profile', { method: 'GET', headers: { 'apikey': 'test-anon-key' } });
            const res = await handleProfileRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockGetUserError, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Not authenticated"] });
            assertSpyCalls(mockClientError.from, 0);
        });

        // --- GET Tests ---
        await t.step("GET: successful fetch should return user and profile", async () => {
            const mockDeps = createMockDeps(); // Uses default: getUser success, fetch profile success
            const req = new Request('http://example.com/profile', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleProfileRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { user: mockUser, profile: mockExistingProfile });

            const client = mockDeps.createSupabaseClient();
            assertSpyCall(client.auth.getUser, 0);
            assertSpyCall(client.from().select().eq().maybeSingle, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
        });

        await t.step("GET: successful fetch (no profile exists) should return user and null profile", async () => {
            const mockNoProfileResponse: PostgrestSingleResponse<any> = { data: null, error: null, status: 200, count: 0, statusText: 'OK' };
            const mockMaybeSingleNoData = spy(() => Promise.resolve(mockNoProfileResponse));
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ maybeSingle: mockMaybeSingleNoData })) })) }));
            const mockClient = { auth: { getUser: spy(async()=>({data:{user:mockUser}, error:null})) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });
            
            const req = new Request('http://example.com/profile', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleProfileRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { user: mockUser, profile: null });
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockMaybeSingleNoData, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
        });

         await t.step("GET: profile fetch DB error should return 500", async () => {
            const mockErrorResponse: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB down' } as any, status: 500, count: 0, statusText: 'Error' };
            const mockMaybeSingleError = spy(() => Promise.resolve(mockErrorResponse));
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ maybeSingle: mockMaybeSingleError })) })) }));
            const mockClient = { auth: { getUser: spy(async() => ({ data: { user: mockUser }, error: null })) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/profile', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleProfileRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockMaybeSingleError, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0);
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("GET: profile fetch exception should return 500", async () => {
            const mockMaybeSingleThrows = spy(() => Promise.reject(new Error("Network fail")));
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ maybeSingle: mockMaybeSingleThrows })) })) }));
            const mockClient = { auth: { getUser: spy(async()=>({data:{user:mockUser}, error:null})) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/profile', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleProfileRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockMaybeSingleThrows, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Error fetching profile data", 500] });
        });

        // --- PUT Tests ---
         await t.step("PUT: successful profile upsert should return updated profile", async () => {
            const mockDeps = createMockDeps(); // Uses default success mocks
            const req = new Request('http://example.com/profile', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockPutData) 
            });
            const res = await handleProfileRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, mockUpsertedProfile);

            const client = mockDeps.createSupabaseClient();
            assertSpyCall(client.auth.getUser, 0);
            assertSpyCall(client.from, 0, { args: ['user_profiles'] });
            // Check that upsert was called with id and updated_at, plus the payload data
            assertSpyCall(client.from().upsert, 0);
            const upsertArg = client.from().upsert.calls[0].args[0];
            assertEquals(upsertArg.id, mockUser.id);
            assertExists(upsertArg.updated_at);
            assertEquals(upsertArg.first_name, mockPutData.first_name);
            
            assertSpyCall(client.from().upsert().select().single, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
        });

        await t.step("PUT: invalid JSON body should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/profile', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: '{\"invalid json'
            });
            const res = await handleProfileRequest(req, mockDeps);
            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Invalid request body", 400] });
            assertSpyCall(mockDeps.createSupabaseClient().auth.getUser, 0); // Auth check still happens
            assertSpyCalls(mockDeps.createSupabaseClient().from, 0); // DB not touched
        });

        await t.step("PUT: profile upsert DB error should return 500", async () => {
            const mockErrorResponse: PostgrestSingleResponse<any> = { data: null, error: { message: 'Constraint violation' } as any, status: 409, count: 0, statusText: 'Conflict' };
            const mockSingleError = spy(() => Promise.resolve(mockErrorResponse));
            const mockUpsert = spy(() => ({ select: spy(() => ({ single: mockSingleError })) }));
            const mockFrom = spy(() => ({ upsert: mockUpsert }));
            const mockClient = { auth: { getUser: spy(async()=>({data:{user:mockUser}, error:null})) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/profile', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockPutData)
            });
            const res = await handleProfileRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockSingleError, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0);
        });

        await t.step("PUT: profile upsert exception should return 500", async () => {
            const mockSingleThrows = spy(() => Promise.reject(new Error("DB connection failed")));
            const mockUpsert = spy(() => ({ select: spy(() => ({ single: mockSingleThrows })) }));
            const mockFrom = spy(() => ({ upsert: mockUpsert }));
            const mockClient = { auth: { getUser: spy(async()=>({data:{user:mockUser}, error:null})) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/profile', { 
                 method: 'PUT', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockPutData)
            });
            const res = await handleProfileRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockSingleThrows, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Error saving profile data", 500] });
        });

        // --- Other Methods ---
        await t.step("DELETE request should return 405 Method Not Allowed", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/profile', { method: 'DELETE', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleProfileRequest(req, mockDeps);
            assertEquals(res.status, 405);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method not allowed", 405] });
        });

    } finally {
        envGetStub.restore(); 
    }
}); 