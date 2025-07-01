import { assertEquals, assertExists, assertRejects, assertThrows } from "jsr:@std/assert@0.225.3";
import { spy, stub, assertSpyCall, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock"; 

// Import functions to test
import {
    createSupabaseClient,
    createSupabaseAdminClient,
    getUserIdFromClient,
    verifyApiKey,
    isAuthenticatedWithClient,
    createUnauthorizedResponse
} from "./auth.ts";

// Import types needed for mocks
import type { SupabaseClient, AuthError, User } from "npm:@supabase/supabase-js@2";

// --- Test Cases ---
Deno.test("Auth Utilities", async (t) => {

    // --- Test verifyApiKey ---
    await t.step("verifyApiKey: should return true for valid apikey header", () => {
        const envStub = stub(Deno.env, "get", (key) => key === 'SUPABASE_ANON_KEY' ? 'test-anon-key' : undefined);
        const req = new Request("http://example.com", { headers: { 'apikey': 'test-anon-key' } });
        try {
            assertEquals(verifyApiKey(req), true);
        } finally {
            envStub.restore();
        }
    });

    await t.step("verifyApiKey: should return false for invalid apikey header", () => {
        const envStub = stub(Deno.env, "get", (key) => key === 'SUPABASE_ANON_KEY' ? 'test-anon-key' : undefined);
        const req = new Request("http://example.com", { headers: { 'apikey': 'wrong-key' } });
        try {
            assertEquals(verifyApiKey(req), false);
        } finally {
            envStub.restore();
        }
    });

    await t.step("verifyApiKey: should return false for only Authorization Bearer header", () => {
        const envStub = stub(Deno.env, "get", () => undefined);
        const req = new Request("http://example.com", { headers: { 'Authorization': 'Bearer some-jwt' } });
        try {
            assertEquals(verifyApiKey(req), false);
        } finally {
            envStub.restore();
        }
    });
    
    await t.step("verifyApiKey: should return false if apikey missing, even with Authorization", () => {
        const envStub = stub(Deno.env, "get", (key) => key === 'SUPABASE_ANON_KEY' ? 'test-anon-key' : undefined);
        const req = new Request("http://example.com", { headers: { 'Authorization': 'Bearer some-jwt' } });
        try {
            assertEquals(verifyApiKey(req), false);
        } finally {
            envStub.restore();
        }
    });

    await t.step("verifyApiKey: should return false for no relevant headers", () => {
        const envStub = stub(Deno.env, "get", () => 'test-anon-key');
        const req = new Request("http://example.com", { headers: { 'Content-Type': 'application/json' } });
        try {
            assertEquals(verifyApiKey(req), false);
        } finally {
            envStub.restore();
        }
    });
    
    await t.step("verifyApiKey: should return false if ANON_KEY is missing", () => {
        const envStub = stub(Deno.env, "get", () => undefined);
        const req = new Request("http://example.com", { headers: { 'apikey': 'test-anon-key' } });
        try {
            assertEquals(verifyApiKey(req), false);
        } finally {
            envStub.restore();
        }
    });

    await t.step("verifyApiKey: should return true for valid apikey header even with Authorization", () => {
        const envStub = stub(Deno.env, "get", (key) => key === 'SUPABASE_ANON_KEY' ? 'test-anon-key' : undefined);
        const req = new Request("http://example.com", { 
            headers: { 
                'apikey': 'test-anon-key', 
                'Authorization': 'Bearer some-jwt' 
            }
        });
        try {
            assertEquals(verifyApiKey(req), true);
        } finally {
            envStub.restore();
        }
    });

    // --- Test createUnauthorizedResponse ---
    await t.step("createUnauthorizedResponse: should create 401 response", async () => {
        const message = "Invalid token";
        const req = new Request("http://localhost:5173", { headers: { 'Origin': 'http://localhost:5173' }});
        const res = createUnauthorizedResponse(message, req);
        assertEquals(res.status, 401);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertExists(res.headers.get("Access-Control-Allow-Origin")); // Check CORS header exists
        const body = await res.json();
        assertEquals(body, { error: message });
    });

    // --- Test createSupabaseClient ---
    await t.step("createSupabaseClient: should call injected createClient with correct args", () => {
        // Define mockCreateClient locally for this step
        const localMockCreateClient = spy((_url, _key, _options) => ({ auth: {} } as any)); 
        
        const envStub = stub(Deno.env, "get", (key) => {
           if (key === 'SUPABASE_URL') return 'test-url';
           if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
           return undefined;
        });
        const req = new Request("http://example.com", { headers: { 'Authorization': 'Bearer test-token' } });
        
        try {
            createSupabaseClient(req, localMockCreateClient);
            assertSpyCall(localMockCreateClient, 0, { // Assert on local spy
                args: [
                    'test-url', 
                    'test-anon-key', 
                    { 
                        global: { headers: { Authorization: 'Bearer test-token' } },
                        auth: { 
                            persistSession: false,
                            autoRefreshToken: false,
                            detectSessionInUrl: false
                        },
                    }
                ]
            });
        } finally {
            envStub.restore();
            // No need to reset localMockCreateClient.calls
        }
    });

    // --- Test createSupabaseAdminClient ---
     await t.step("createSupabaseAdminClient: should call injected createClient with correct args", () => {
        // Define mockCreateClient locally for this step
        const localMockCreateClient = spy((_url, _key, _options) => ({ auth: {} } as any));
        
        const envStub = stub(Deno.env, "get", (key) => {
           if (key === 'SUPABASE_URL') return 'test-url';
           if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-key';
           return undefined;
        });
        
        try {
            createSupabaseAdminClient(localMockCreateClient);
            assertSpyCall(localMockCreateClient, 0, { // Assert on local spy
                args: [
                    'test-url', 
                    'test-service-key', 
                    { 
                        auth: { 
                            persistSession: false,
                            autoRefreshToken: false,
                            detectSessionInUrl: false
                        } 
                    }
                ]
            });
        } finally {
            envStub.restore();
        }
    });

    await t.step("createSupabaseAdminClient: should throw if env vars missing", () => {
        const localMockCreateClient = spy(() => ({ auth: {} } as any)); // Needed as arg
        const envStub = stub(Deno.env, "get", () => undefined); // Missing keys
        try {
            // Use assertThrows for synchronous errors
            assertThrows( 
                () => createSupabaseAdminClient(localMockCreateClient),
                Error, 
                "Missing Supabase URL or service role key"
            );
        } finally {
            envStub.restore();
        }
    });

    // --- Test getUserIdFromClient ---
    await t.step("getUserIdFromClient: should return user ID on success", async () => {
        const mockUser = { id: 'user-123' };
        const getUserSpy = spy(async () => ({ data: { user: mockUser }, error: null }));
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        
        const userId = await getUserIdFromClient(mockClient);
        assertEquals(userId, 'user-123');
        assertSpyCall(getUserSpy, 0);
    });

    await t.step("getUserIdFromClient: should throw on getUser error", async () => {
        const mockError = new Error("Auth boom") as AuthError;
        const getUserSpy = spy(async () => ({ data: { user: null }, error: mockError }));
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        
        await assertRejects(
            () => getUserIdFromClient(mockClient),
            Error, 
            "Unauthorized - Exception" // Expect the re-thrown message
        );
        assertSpyCall(getUserSpy, 0);
    });

    await t.step("getUserIdFromClient: should throw if no user data returned", async () => {
        const getUserSpy = spy(async () => ({ data: { user: null }, error: null }));
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        
        await assertRejects(
            () => getUserIdFromClient(mockClient),
            Error,
            "Unauthorized - Exception" // Expect the re-thrown message
        );
        assertSpyCall(getUserSpy, 0);
    });

    // --- Test isAuthenticatedWithClient ---
    await t.step("isAuthenticatedWithClient: should return valid with userId for good token", async () => {
        const mockUser = { id: 'user-xyz' };
        const getUserSpy = spy(async (token?: string) => {
            if (token === 'good-token') return { data: { user: mockUser }, error: null };
            return { data: { user: null }, error: new Error('Invalid token') as AuthError };
        });
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        const req = new Request("http://example.com", { headers: { 'Authorization': 'Bearer good-token' } });
        
        const result = await isAuthenticatedWithClient(req, mockClient);
        assertEquals(result, { isValid: true, userId: 'user-xyz' });
        assertSpyCall(getUserSpy, 0, { args: ['good-token'] });
    });

    await t.step("isAuthenticatedWithClient: should return invalid for bad token", async () => {
        const mockError = new Error("Token verification failed") as AuthError;
        const getUserSpy = spy(async () => ({ data: { user: null }, error: mockError }));
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        const req = new Request("http://example.com", { headers: { 'Authorization': 'Bearer bad-token' } });
        
        const result = await isAuthenticatedWithClient(req, mockClient);
        assertEquals(result, { isValid: false, error: mockError.message });
        assertSpyCall(getUserSpy, 0, { args: ['bad-token'] });
    });

    await t.step("isAuthenticatedWithClient: should return invalid for missing Bearer", async () => {
        const getUserSpy = spy(async () => ({ data: { user: null }, error: null })); // Shouldn't be called
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        const req = new Request("http://example.com", { headers: { 'Authorization': 'Basic abc' } });
        
        const result = await isAuthenticatedWithClient(req, mockClient);
        assertEquals(result, { isValid: false, error: 'Missing or invalid Authorization header' });
        assertSpyCalls(getUserSpy, 0);
    });

    await t.step("isAuthenticatedWithClient: should return invalid for missing Auth header", async () => {
        const getUserSpy = spy(async () => ({ data: { user: null }, error: null })); 
        const mockClient = { auth: { getUser: getUserSpy } } as any;
        const req = new Request("http://example.com"); // No auth header
        
        const result = await isAuthenticatedWithClient(req, mockClient);
        assertEquals(result, { isValid: false, error: 'Missing or invalid Authorization header' });
        assertSpyCalls(getUserSpy, 0);
    });

    // TODO: Add test for isAuthenticatedWithClient catching exceptions during getUser?

}); 