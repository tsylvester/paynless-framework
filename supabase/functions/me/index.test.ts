import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleMeRequest, type MeHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type { 
    SupabaseClient, 
    AuthError, 
    User,
    PostgrestSingleResponse
} from "@supabase/supabase-js";

// --- Test Cases ---
Deno.test("Me Function (/me) Tests", async (t) => {

    // --- Mock Data ---
    const mockUser: User = { id: 'user-me-123', email: 'me@example.com' } as any;
    const mockProfile = { id: 'user-me-123', username: 'testuser', avatar_url: 'url' };
    const mockUpdateData = { username: 'updateduser' };
    const mockUpdatedProfile = { ...mockProfile, ...mockUpdateData };

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<MeHandlerDeps> = {}): MeHandlerDeps => {
        // Default mocks for client methods (can be overridden)
        const mockGetUser = spy(async (): Promise<{ data: { user: User | null }, error: AuthError | null }> => ({ data: { user: mockUser }, error: null })); // Default: success
        const mockProfileFetchResponse: PostgrestSingleResponse<any> = { data: mockProfile, error: null, status: 200, count: 1, statusText: 'OK' };
        const mockProfileUpdateResponse: PostgrestSingleResponse<any> = { data: mockUpdatedProfile, error: null, status: 200, count: 1, statusText: 'OK' };
        const mockSingleProfile = spy(() => Promise.resolve(mockProfileFetchResponse));
        const mockSingleUpdate = spy(() => Promise.resolve(mockProfileUpdateResponse));
        const mockSelect = spy(() => ({ eq: spy(() => ({ single: mockSingleProfile })) }));
        const mockUpdate = spy(() => ({ eq: spy(() => ({ select: spy(() => ({ single: mockSingleUpdate })) })) }));
        const mockFrom = spy((_table: string) => ({ 
            select: mockSelect, 
            update: mockUpdate
        }));

        const mockClient = {
            auth: { getUser: mockGetUser },
            from: mockFrom
        };
        
        // Default Mocks for Deps
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
            const req = new Request('http://example.com/me', { method: 'OPTIONS' });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
            assertSpyCalls(mockDeps.verifyApiKey, 0);
        });

        await t.step("Request without API key should return 401", async () => {
            const mockDeps = createMockDeps({ verifyApiKey: spy(() => false) });
            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'Authorization': 'Bearer token' } });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
        });

        await t.step("Request without Authorization header should cause getUser failure -> 401", async () => {
            // Simulate getUser failing when no token is implicitly passed via createSupabaseClient(req)
            const mockGetUserError = spy(async () => ({ data: { user: null }, error: new Error("Not authenticated") as AuthError }));
            const mockClientError = { auth: { getUser: mockGetUserError }, from: spy() }; // from shouldn't be called
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientError as any) });

            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'apikey': 'test-anon-key' } }); // Valid API key, no Auth
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createSupabaseClient, 0); // Client is created
            assertSpyCall(mockGetUserError, 0); // getUser is called and fails
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Not authenticated"] });
            assertSpyCalls(mockClientError.from, 0);
        });

        // --- GET Tests ---
        await t.step("GET: successful profile fetch should return profile", async () => {
            const mockDeps = createMockDeps(); // Uses default success mocks
            const req = new Request('http://example.com/me', { 
                method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' }
            });
            const res = await handleMeRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertExists(body.user, "Response should contain user object");
            assertExists(body.profile, "Response should contain profile object");
            assertEquals(body.user.id, mockUser.id, "User ID mismatch");
            assertEquals(body.profile.id, mockProfile.id, "Profile ID mismatch");
            assertEquals(body.profile.username, mockProfile.username, "Profile username mismatch");

            const client = mockDeps.createSupabaseClient();
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(client.auth.getUser, 0);
            assertSpyCall(client.from, 0, { args: ['user_profiles'] });
            assertSpyCall(client.from().select, 0);
            assertSpyCall(client.from().select().eq().single, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("GET: profile fetch DB error should return 500", async () => {
            const mockErrorResponse: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB down' } as any, status: 500, count: 0, statusText: 'Error' };
            const mockSingleError = spy(() => Promise.resolve(mockErrorResponse));
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingleError })) })) }));
            const mockClient = { auth: { getUser: spy(async() => ({ data: { user: mockUser }, error: null })) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockSingleError, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to fetch profile", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("GET: profile fetch exception should return 500", async () => {
            const mockSingleThrows = spy(() => Promise.reject(new Error("Unexpected exception")));
            const mockFrom = spy(() => ({ select: spy(() => ({ eq: spy(() => ({ single: mockSingleThrows })) })) }));
            const mockClient = { auth: { getUser: spy(async() => ({ data: { user: mockUser }, error: null })) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockSingleThrows, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Error fetching profile data", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        // --- PUT Tests ---
         await t.step("PUT: successful profile update should return updated profile", async () => {
            const mockDeps = createMockDeps(); // Uses default success mocks
            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, mockUpdatedProfile);

            const client = mockDeps.createSupabaseClient();
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(client.auth.getUser, 0);
            assertSpyCall(client.from, 0, { args: ['user_profiles'] });
            assertSpyCall(client.from().update, 0, { args: [mockUpdateData] }); // Check update payload
            assertSpyCall(client.from().update().eq().select().single, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

        await t.step("PUT: invalid JSON body should return 400", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: '{\"invalid json'
            });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 400);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Invalid JSON body for update", 400] });
            const client = mockDeps.createSupabaseClient();
            assertSpyCall(client.auth.getUser, 0); // Auth check happens before body parse
            assertSpyCalls(client.from, 0); // DB not touched
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("PUT: profile update DB error should return 500", async () => {
            const mockErrorResponse: PostgrestSingleResponse<any> = { data: null, error: { message: 'DB conflict' } as any, status: 409, count: 0, statusText: 'Conflict' };
            const mockSingleError = spy(() => Promise.resolve(mockErrorResponse));
            const mockUpdate = spy(() => ({ eq: spy(() => ({ select: spy(() => ({ single: mockSingleError })) })) }));
            const mockFrom = spy(() => ({ update: mockUpdate }));
            const mockClient = { auth: { getUser: spy(async() => ({ data: { user: mockUser }, error: null })) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockSingleError, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Failed to update profile", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        await t.step("PUT: profile update exception should return 500", async () => {
            const mockSingleThrows = spy(() => Promise.reject(new Error("Unexpected DB exception")));
            const mockUpdate = spy(() => ({ eq: spy(() => ({ select: spy(() => ({ single: mockSingleThrows })) })) }));
            const mockFrom = spy(() => ({ update: mockUpdate }));
            const mockClient = { auth: { getUser: spy(async() => ({ data: { user: mockUser }, error: null })) }, from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClient as any) });

            const req = new Request('http://example.com/me', { 
                 method: 'PUT', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(mockClient.auth.getUser, 0);
            assertSpyCall(mockSingleThrows, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Error updating profile data", 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });

        // --- Other Methods ---
        await t.step("POST request should return 405 Method Not Allowed", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/me', { method: 'POST', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res.status, 405);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method not allowed", 405] });
        });

    } finally {
        envGetStub.restore(); 
    }
}); 