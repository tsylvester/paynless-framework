import { assertEquals, assertExists, assertInstanceOf, assertNotEquals } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub, type Spy } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleMeRequest, type MeHandlerDeps } from "./index.ts";

// Import types needed for mocks and deps signature
import type { 
    SupabaseClient, 
    AuthError, 
    User,
    PostgrestSingleResponse,
    SignUpWithPasswordCredentials // For CreateClientFn type if needed
} from "@supabase/supabase-js";
import type { 
  handleCorsPreflightRequest as HandleCorsPreflightRequestType,
  createErrorResponse as CreateErrorResponseType,
  createSuccessResponse as CreateSuccessResponseType
} from '../_shared/cors-headers.ts';
import type { 
  createSupabaseClient as CreateSupabaseClientType,
  verifyApiKey as VerifyApiKeyType,
  createUnauthorizedResponse as CreateUnauthorizedResponseType
} from '../_shared/auth.ts';
// Import the shared mock utility
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig
} from '../_shared/test-utils.ts';

// --- Test Cases ---
Deno.test("Me Function (/me) Tests", async (t) => {

    // --- Mock Data ---
    const mockUser: User = { id: 'user-me-123', email: 'me@example.com' } as any;
    const mockProfile = { id: 'user-me-123', username: 'testuser', avatar_url: 'url' };
    const mockUpdateData = { username: 'updateduser' };
    const mockUpdatedProfile = { ...mockProfile, ...mockUpdateData };

    // --- Helper to create Mock Dependencies ---
    // Keep track of the latest spies from the mock client
    let latestMockGetUserSpy: Spy<any>;
    let latestMockFromSpy: Spy<any>;

    const createMockDeps = (overrides: Partial<MeHandlerDeps> = {}): MeHandlerDeps => {
        
        // Default Config for Mock Supabase Client (Success cases)
        const defaultMockConfig: MockSupabaseDataConfig = {
            mockUser: mockUser, // For getUser success
            genericMockResults: {
                'user_profiles': { // Table name
                    select: { data: [mockProfile], error: null, status: 200, count: 1 }, // Default GET success
                    update: { data: [mockUpdatedProfile], error: null, status: 200, count: 1 }, // Default PUT success
                    // Add insert/delete mocks if needed by other tests
                }
            }
        };

        // Create the mock client using the shared utility
        const { client: mockClient, spies } = createMockSupabaseClient(defaultMockConfig);
        // Store the spies for assertion access outside this function
        latestMockGetUserSpy = spies.getUserSpy;
        latestMockFromSpy = spies.fromSpy;

        // Explicitly type the direct dependency spies
        const handleCorsPreflightRequestSpy: Spy<unknown, [Request], Response | null> = spy((_req) => null);
        const verifyApiKeySpy: Spy<unknown, [Request], boolean> = spy((_req) => true);
        const createUnauthorizedResponseSpy: Spy<unknown, [string], Response> = spy((msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }));
        // Default error spy is now simple, non-capturing
        const createErrorResponseSpy: Spy<unknown, [string, number | undefined, Request, unknown?], Response> = spy((msg, status, _req, _err) => { 
            // No longer captures error here
            return new Response(JSON.stringify({ error: msg }), { status: status || 500 });
        });
        const createSuccessResponseSpy: Spy<unknown, [unknown, number | undefined, Request], Response> = spy((data, status, _req) => new Response(JSON.stringify(data), { status: status ?? 200 }));
        const createSupabaseClientSpy: Spy<unknown, [Request], SupabaseClient> = spy((_req) => mockClient);
        
        // Default Mocks for Deps
        const defaultSpies: MeHandlerDeps = {
            handleCorsPreflightRequest: handleCorsPreflightRequestSpy,
            verifyApiKey: verifyApiKeySpy,
            createUnauthorizedResponse: createUnauthorizedResponseSpy,
            createErrorResponse: createErrorResponseSpy,
            createSuccessResponse: createSuccessResponseSpy,
            createSupabaseClient: createSupabaseClientSpy, // Use the spy returning the mock instance
        };

        // Important: If createSupabaseClient is overridden, we need to handle it
        // This basic structure assumes the default mock is used unless the whole function is overridden.
        // More complex scenarios might need to merge configs or recreate the mock client in overrides.
        return { ...defaultSpies, ...overrides }; 
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
            // Assert against the spy provided in the override
            assertSpyCall(mockDeps.handleCorsPreflightRequest as Spy, 0); 
            // Assert against the base spy (verifyApiKeySpy is implicitly used via defaultSpies)
            assertSpyCalls(mockDeps.verifyApiKey as Spy, 0); // Assert not called
        });

        await t.step("Request without API key should return 401", async () => {
            const mockVerify = spy(() => false);
            const mockDeps = createMockDeps({ verifyApiKey: mockVerify });
            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'Authorization': 'Bearer token' } });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockVerify, 0); // Assert the overridden spy
            assertSpyCall(mockDeps.createUnauthorizedResponse as Spy, 0, { args: ["Invalid or missing apikey"] });
            // Assert createSupabaseClient was not called
            assertSpyCalls(mockDeps.createSupabaseClient as Spy, 0);
        });

        await t.step("Request without Authorization header should cause getUser failure -> 401", async () => {
            // Configure the mock client for this specific test: getUser fails
            const configError: MockSupabaseDataConfig = {
                simulateAuthError: new Error("Not authenticated")
            };
            const { client: mockClientError, spies: spiesError } = createMockSupabaseClient(configError);
            const mockCreateClientError = spy(() => mockClientError); // Spy returning this specific client
            
            // Override createSupabaseClient in deps
            const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientError });

            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'apikey': 'test-anon-key' } }); // Valid API key, no Auth
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey as Spy, 0); // Base spy was called
            assertSpyCall(mockCreateClientError, 0); // The overridden factory spy was called
            assertSpyCall(spiesError.getUserSpy, 0); // The getUserSpy *from this specific client* was called
            assertSpyCall(mockDeps.createUnauthorizedResponse as Spy, 0, { args: ["Not authenticated"] });
            assertSpyCalls(spiesError.fromSpy, 0); // from should not be called
        });

        // --- GET Tests ---
        await t.step("GET: successful profile fetch should return profile", async () => {
            // Use default mocks from createMockDeps (which uses defaultMockConfig)
            const mockDeps = createMockDeps(); 
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

            // Assert against the base spies
            assertSpyCall(mockDeps.verifyApiKey as Spy, 0);
            assertSpyCall(mockDeps.createSupabaseClient as Spy, 0); // The factory spy
            // Assert against spies captured from the *last* createMockDeps call (default case)
            assertSpyCall(latestMockGetUserSpy, 0); 
            assertSpyCall(latestMockFromSpy, 0, { args: ['user_profiles'] }); // Assert from('user_profiles')
            // We can't easily assert .select().eq().single() directly with this mock
            // Instead, we rely on the fact that the mock was configured to return mockProfile
            assertSpyCall(mockDeps.createSuccessResponse as Spy, 0); 
            assertSpyCalls(mockDeps.createErrorResponse as Spy, 0); // Assert not called
        });

        await t.step("GET: profile fetch DB error should return 500", async () => {
            const dbError = { message: 'DB down', details: 'Connection timeout', hint: 'Check network', code: '50000' };
            const configError: MockSupabaseDataConfig = {
                mockUser: mockUser,
                genericMockResults: { 'user_profiles': { select: { data: null, error: dbError, status: 500 } } }
            };
            const { client: mockClientError, spies: spiesError } = createMockSupabaseClient(configError);
            const mockCreateClientError = spy(() => mockClientError);
            
            // Create deps, overriding only the client factory
            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClientError
            });

            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(spiesError.getUserSpy, 0);
            assertSpyCall(spiesError.fromSpy, 0, { args: ['user_profiles'] });
            // Assert call to the default error response spy
            // NOTE: Handler doesn't pass the dbError object here, only msg/status/req
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Error fetching profile data", 500, req] }); 
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
        });

        await t.step("GET: profile fetch exception should return 500", async () => {
            const exception = new Error("Unexpected Store Exception");
            const configError: MockSupabaseDataConfig = {
                mockUser: mockUser,
                genericMockResults: { 'user_profiles': { select: () => Promise.reject(exception) } }
            };
            const { client: mockClientError, spies: spiesError } = createMockSupabaseClient(configError);
            const mockCreateClientError = spy(() => mockClientError);
            
            // Create deps, overriding only the client factory
            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClientError
            });

            const req = new Request('http://example.com/me', { method: 'GET', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(spiesError.getUserSpy, 0);
            assertSpyCall(spiesError.fromSpy, 0, { args: ['user_profiles'] });
             // Assert call to the default error response spy
             // NOTE: Handler doesn't pass the exception object here, only msg/status/req
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Error fetching profile data", 500, req] });
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
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

            // Assert against the base spies
            assertSpyCall(mockDeps.verifyApiKey as Spy, 0);
            assertSpyCall(mockDeps.createSupabaseClient as Spy, 0); // Factory spy
            // Assert against spies captured from the last createMockDeps call
            assertSpyCall(latestMockGetUserSpy, 0); 
            assertSpyCall(latestMockFromSpy, 0, { args: ['user_profiles'] }); // Assert from('user_profiles')
            // Rely on mock config for update -> select chain result
            // We could enhance the mock to expose spies for eq, update, select if needed
            assertSpyCall(mockDeps.createSuccessResponse as Spy, 0, { args: [mockUpdatedProfile, 200, req] });
            assertSpyCalls(mockDeps.createErrorResponse as Spy, 0); // Assert not called
        });

        await t.step("PUT: invalid JSON body should return 400", async () => {
             // Create deps with default spies
            const mockDeps = createMockDeps(); 
            
            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: '{"invalid json'
            });
            
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 400);
            // Assert the response body directly, as spy call assertion was unreliable here
            const body = await res.json();
            assertEquals(body.error, "Invalid JSON body for update", "Response error message mismatch");
            
            assertSpyCall(mockDeps.verifyApiKey as Spy, 0);
            assertSpyCall(mockDeps.createSupabaseClient as Spy, 0); // Factory is called
            assertSpyCall(latestMockGetUserSpy, 0); // Auth check happens
            assertSpyCalls(latestMockFromSpy, 0); // DB not touched
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
        });

        await t.step("PUT: profile update DB error should return 500", async () => {
            const dbError = { message: 'DB conflict', details: 'Duplicate key', hint: 'Check unique constraints', code: '23505' };
            const configError: MockSupabaseDataConfig = {
                mockUser: mockUser,
                genericMockResults: { 'user_profiles': { update: { data: null, error: dbError, status: 409 } } }
            };
            const { client: mockClientError, spies: spiesError } = createMockSupabaseClient(configError);
            const mockCreateClientError = spy(() => mockClientError);
            
            // Create deps, overriding only the client factory
            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClientError
            });

            const req = new Request('http://example.com/me', { 
                method: 'PUT', 
                headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(spiesError.getUserSpy, 0);
            assertSpyCall(spiesError.fromSpy, 0, { args: ['user_profiles'] });
            // Assert call to the default error response spy
             // NOTE: Handler doesn't pass the dbError object here, only msg/status/req
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Error updating profile data", 500, req] }); 
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
        });

        await t.step("PUT: profile update exception should return 500", async () => {
            const exception = new Error("Unexpected DB Connection Pool Exhausted");
            const configError: MockSupabaseDataConfig = {
                mockUser: mockUser, 
                genericMockResults: { 'user_profiles': { update: () => Promise.reject(exception) } }
            };
            const { client: mockClientError, spies: spiesError } = createMockSupabaseClient(configError);
            const mockCreateClientError = spy(() => mockClientError);
            
            // Create deps, overriding only the client factory
            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClientError
            });

            const req = new Request('http://example.com/me', { 
                 method: 'PUT', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token', 'Content-Type': 'application/json' },
                body: JSON.stringify(mockUpdateData)
            });
            const res = await handleMeRequest(req, mockDeps);

            assertEquals(res.status, 500);
            assertSpyCall(spiesError.getUserSpy, 0);
            assertSpyCall(spiesError.fromSpy, 0, { args: ['user_profiles'] });
             // Assert call to the default error response spy
             // NOTE: Handler doesn't pass the exception object here, only msg/status/req
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Error updating profile data", 500, req] });
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); 
        });

        // --- Other Methods ---
        await t.step("POST request should return 405 Method Not Allowed", async () => {
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/me', { method: 'POST', headers: { 'apikey': 'test-anon-key', 'Authorization': 'Bearer good-token' } });
            const res = await handleMeRequest(req, mockDeps);
            assertEquals(res.status, 405);
            assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Method not allowed", 405, req] });
            assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0); // Assert not called
        });

    } finally {
        envGetStub.restore(); 
    }
}); 