import { assertEquals, assertExists, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts";
// Use Deno standard library spy/stub if needed, but rely primarily on the utility
import { assertSpyCalls, spy, stub, restore } from "https://deno.land/std@0.177.0/testing/mock.ts";
// Import Supabase types directly from npm specifier (User only)
import { SupabaseClient, User } from "npm:@supabase/supabase-js@^2.43.4"; 
// Import Notification type from shared types
import { Notification } from "../_shared/types.ts";

// Import the shared test utility
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/test-utils.ts";

// Import the handler function and dependency types
import { handler, NotificationsDeps } from "./index.ts";
import { corsHeaders } from "../_shared/cors-headers.ts";

// --- Mock Data ---
// Ensure mock data conforms to the imported types
const mockUser: User = {
    id: "test-user-id",
    app_metadata: { provider: 'email', providers: [ 'email' ] },
    user_metadata: {}, 
    aud: "authenticated",
    created_at: new Date().toISOString(),
};

const mockNotifications: Notification[] = [
    {
        id: "noti-1",
        user_id: mockUser.id,
        type: "test",
        data: { message: "Test notification 1" },
        read: false,
        created_at: new Date(Date.now() - 10000).toISOString(),
    },
    {
        id: "noti-2",
        user_id: mockUser.id,
        type: "test",
        data: { message: "Test notification 2", target_path: "/dashboard" },
        read: true,
        created_at: new Date(Date.now() - 20000).toISOString(),
    },
];

// --- Helper to create deps for handler ---
// The handler expects { supabaseClient: SupabaseClient }
function createDeps(mockClient: SupabaseClient): NotificationsDeps {
    return { supabaseClient: mockClient };
}

// --- Test Suite ---
Deno.test("/notifications GET endpoint tests", async (t) => {

    // No longer need env var mocking as handler uses injected client

    // **Important Note on Testability:**
    // With the handler refactored to use the injected deps.supabaseClient,
    // these tests now accurately reflect the handler's isolated logic.

    await t.step("should handle OPTIONS preflight request", async () => {
        const { client } = createMockSupabaseClient(); 
        const req = new Request("http://localhost/notifications", { method: "OPTIONS" });
        const res = await handler(req, createDeps(client)); 
        await res.body?.cancel(); 

        assertEquals(res.status, 200);
        assertEquals(res.headers.get("access-control-allow-origin"), "*");
        assertEquals(res.headers.get("access-control-allow-headers"), "authorization, x-client-info, apikey, content-type, x-paynless-anon-secret"); 
    });

    await t.step("should reject non-GET requests", async () => {
        const { client } = createMockSupabaseClient();
        const req = new Request("http://localhost/notifications", { method: "POST" });
        const res = await handler(req, createDeps(client));
        const body = await res.json(); 
        assertEquals(res.status, 405);
        assertEquals(body.error, "Method Not Allowed");
        assertEquals(res.headers.get("content-type"), "application/json");
    });

    await t.step("should reject request without Authorization header", async () => {
        // NOTE: The refactored handler relies on the *client itself* being authenticated.
        // It doesn't check the header directly anymore, it calls deps.supabaseClient.auth.getUser().
        // So this test case needs to simulate getUser failing when no token context exists.
        const { client, spies } = createMockSupabaseClient({
            // Simulate getUser failing as if no valid session/token was used to create the client
            simulateAuthError: new Error("No session") 
        });

        const req = new Request("http://localhost/notifications", { method: "GET" }); // No Auth header
        const res = await handler(req, createDeps(client));
        const body = await res.json();
        assertEquals(res.status, 401);
        // Error message will come from the mocked getUser failure
        assert(body.error?.includes("Unauthorized: No session")); 
        assertSpyCalls(spies.getUserSpy, 1); // Verify getUser was called
    });

    await t.step("should reject request with invalid client context (invalid token)", async () => {
        // Simulate getUser failing because the client was created with a bad token
        const mockError = new Error("Invalid token used for client");
        const { client, spies } = createMockSupabaseClient({
            simulateAuthError: mockError, 
        });

        // Request header doesn't matter as much now, the injected client carries the context
        const req = new Request("http://localhost/notifications", { 
            method: "GET",
            headers: { Authorization: "Bearer irrelevant-for-mock" } // Header is informational now
        });

        const res = await handler(req, createDeps(client));
        const body = await res.json();

        assertEquals(res.status, 401); 
        assertExists(body.error);
        assert(body.error.includes("Unauthorized: Invalid token used for client"));
        assertSpyCalls(spies.getUserSpy, 1); // Verify getUser was called
    });

    await t.step("should return notifications on successful GET with valid client context", async () => {
        const { client, spies } = createMockSupabaseClient({
            // Simulate getUser succeeding
            getUserResult: { data: { user: mockUser }, error: null },
            // Simulate DB query succeeding
            genericMockResults: {
                notifications: { 
                    select: { data: mockNotifications, error: null } 
                }
            }
        });

        const req = new Request("http://localhost/notifications", { 
            method: "GET",
            headers: { Authorization: "Bearer irrelevant-for-mock" } 
        });

        const res = await handler(req, createDeps(client));
        const body = await res.json(); 
        
        // Assertions for success case
        assertEquals(res.status, 200); 
        assertEquals(body, mockNotifications); 
        assertEquals(res.headers.get("content-type"), "application/json");

        // Verify mock calls
        assertSpyCalls(spies.getUserSpy, 1);
        // Need spies for from, select, eq, order from test-utils if we want to assert these
        // Assuming test-utils provides them: 
        // assertSpyCalls(spies.fromSpy, 1);
        // assertSpyCalls(spies.selectSpy, 1);
        // assertSpyCalls(spies.eqSpy, 1);
        // assertSpyCalls(spies.orderSpy, 1);
    });

    await t.step("should handle database errors during fetch with valid client context", async () => {
        const mockDbError = new Error("DB error from mock");
        const { client, spies } = createMockSupabaseClient({
            // Simulate getUser succeeding
            getUserResult: { data: { user: mockUser }, error: null },
            // Simulate DB query failing
            genericMockResults: {
                notifications: {
                    select: { data: null, error: mockDbError } 
                }
            }
        });

        const req = new Request("http://localhost/notifications", { 
            method: "GET",
            headers: { Authorization: "Bearer irrelevant-for-mock" }
        });

        const res = await handler(req, createDeps(client));
        const body = await res.json();

        // Assertions for DB error case
        assertEquals(res.status, 500);
        assertExists(body.error);
        assert(body.error.includes("Database error: DB error from mock")); 

        // Verify mock calls
        assertSpyCalls(spies.getUserSpy, 1);
        // assertSpyCalls(spies.fromSpy, 1);
        // ... other DB spies
    });

    // --- NEW TEST CASE --- 
    await t.step("should return 401 if auth succeeds but no user data is returned", async () => {
        const { client, spies } = createMockSupabaseClient({
            // Simulate getUser succeeding but returning no user object
            getUserResult: { data: { user: null }, error: null },
            // DB mock is irrelevant here, but set default
            genericMockResults: {
                notifications: { 
                    select: { data: [], error: null } 
                }
            }
        });

        const req = new Request("http://localhost/notifications", { 
            method: "GET",
            headers: { Authorization: "Bearer irrelevant-for-mock" } 
        });

        const res = await handler(req, createDeps(client));
        const body = await res.json();

        assertEquals(res.status, 401);
        assertExists(body.error);
        assert(body.error.includes("Unauthorized: Invalid client context")); // Or specific message if handler changes
        assertSpyCalls(spies.getUserSpy, 1); // Verify getUser was called
    });

    // --- NEW TEST CASE --- 
    await t.step("should return empty array for successful GET when no notifications exist", async () => {
        const { client, spies } = createMockSupabaseClient({
            // Simulate getUser succeeding
            getUserResult: { data: { user: mockUser }, error: null },
            // Simulate DB query succeeding but returning empty array
            genericMockResults: {
                notifications: { 
                    select: { data: [], error: null } // Empty data array
                }
            }
        });

        const req = new Request("http://localhost/notifications", { 
            method: "GET",
            headers: { Authorization: "Bearer irrelevant-for-mock" } 
        });

        const res = await handler(req, createDeps(client));
        const body = await res.json(); 
        
        assertEquals(res.status, 200); 
        assertEquals(body, []); // Expect an empty array
        assertEquals(res.headers.get("content-type"), "application/json");

        // Verify mock calls
        assertSpyCalls(spies.getUserSpy, 1);
        // assertSpyCalls(spies.fromSpy, 1);
        // ... other DB spies
    });

}); 