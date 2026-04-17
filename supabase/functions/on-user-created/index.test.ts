import { assertEquals } from "jsr:@std/assert";
import { type User, type SupabaseClient } from "npm:@supabase/supabase-js";
import { type EmailMarketingService } from "../_shared/types.ts";

// Import the real handler
import { handler } from "./index.ts";

// --- Test Setup ---
function createMockRequest(record: Partial<User> | null, method = "POST"): Request {
    const body = record ? JSON.stringify({ type: "INSERT", table: "users", schema: "auth", record }) : "{}";
    return new Request("http://localhost/on-user-created", {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: body,
    });
}

// --- Test Suite ---
Deno.test("on-user-created Edge Function Tests", async (t) => {

    const testUserRecord: Partial<User> = {
        id: "test-uuid-di-redux-789",
        email: "hooktest-di-redux@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        user_metadata: { firstName: "HookDI", lastName: "Redux", ref: "vibecoder" }, 
    };

    const testUserRecordWithoutMetadata: Partial<User> = {
        id: "test-uuid-no-meta-redux-123",
        email: "hooktest-no-meta-redux@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
    };

    const optedOutUserRecord: Partial<User> = {
        id: "test-uuid-opted-out",
        email: "opted-out@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        user_metadata: { newsletter: false },
    };

    await t.step("should return 200 and add user to Kit for valid user record", async () => {
        let addUserCalled = false;
        let addTagCalled = false;
        
        const mockEmailService: Partial<EmailMarketingService> = {
            addUserToList: async (userData) => {
                assertEquals(userData.email, "hooktest-di-redux@example.com");
                assertEquals(userData.firstName, "HookDI");
                assertEquals(userData.lastName, "Redux");
                addUserCalled = true;
            },
            addTagToSubscriber: async (email, tagId) => {
                assertEquals(email, "hooktest-di-redux@example.com");
                addTagCalled = true;
            },
        };

        const mockSupabaseClient: Partial<SupabaseClient> = {
            from: () => ({
                insert: () => Promise.resolve({ error: null }),
            }),
        } as any;

        const deps = { 
            supabaseClient: mockSupabaseClient as SupabaseClient,
            emailService: mockEmailService as EmailMarketingService
        };

        const request = createMockRequest(testUserRecord);
        const response = await handler(request, deps);

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User created event processed." });
        assertEquals(addUserCalled, true);
    });

    await t.step("should return 200 for valid user record without metadata", async () => {
        let addUserCalled = false;
        
        const mockEmailService: Partial<EmailMarketingService> = {
            addUserToList: async (userData) => {
                assertEquals(userData.email, "hooktest-no-meta-redux@example.com");
                addUserCalled = true;
            },
            addTagToSubscriber: async () => {},
        };

        const mockSupabaseClient: Partial<SupabaseClient> = {
            from: () => ({
                insert: () => Promise.resolve({ error: null }),
            }),
        } as any;

        const deps = { 
            supabaseClient: mockSupabaseClient as SupabaseClient,
            emailService: mockEmailService as EmailMarketingService
        };

        const request = createMockRequest(testUserRecordWithoutMetadata);
        const response = await handler(request, deps);

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User created event processed." });
        assertEquals(addUserCalled, true);
    });

    await t.step("should not add user to Kit when opted out", async () => {
        let addUserCalled = false;
        
        const mockEmailService: Partial<EmailMarketingService> = {
            addUserToList: async () => {
                addUserCalled = true;
            },
        };

        const mockSupabaseClient: Partial<SupabaseClient> = {
            from: () => ({
                insert: () => Promise.resolve({ error: null }),
            }),
        } as any;

        const deps = { 
            supabaseClient: mockSupabaseClient as SupabaseClient,
            emailService: mockEmailService as EmailMarketingService
        };

        const request = createMockRequest(optedOutUserRecord);
        const response = await handler(request, deps);

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User created event processed." });
        assertEquals(addUserCalled, false); // Should NOT call addUserToList when opted out
    });

    await t.step("should return 400 for invalid request body", async () => {
        const deps = { 
            supabaseClient: {} as SupabaseClient,
            emailService: {} as EmailMarketingService
        };
        
        const request = new Request("http://localhost/on-user-created", { method: "POST", body: "invalid json" });
        const response = await handler(request, deps);
        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "Failed to parse request." });
    });

    await t.step("should return 400 for missing user record data", async () => {
        const deps = { 
            supabaseClient: {} as SupabaseClient,
            emailService: {} as EmailMarketingService
        };
        
        const invalidRecord = { id: "only-id" }; 
        const request = createMockRequest(invalidRecord as Partial<User>); 
        const response = await handler(request, deps);
        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "Invalid user record received." });
    });

    await t.step("should handle Kit API failure gracefully", async () => {
        const mockEmailService: Partial<EmailMarketingService> = {
            addUserToList: async () => {
                throw new Error("Kit API error");
            },
        };

        const mockSupabaseClient: Partial<SupabaseClient> = {
            from: () => ({
                insert: () => Promise.resolve({ error: null }),
            }),
        } as any;

        const deps = { 
            supabaseClient: mockSupabaseClient as SupabaseClient,
            emailService: mockEmailService as EmailMarketingService
        };

        const request = createMockRequest(testUserRecord);
        const response = await handler(request, deps);

        // Should still return 200 even if Kit fails (don't block user creation)
        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User created event processed." });
    });
});