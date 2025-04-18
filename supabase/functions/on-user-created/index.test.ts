import { assert, assertEquals, assertExists, assertInstanceOf, assertNotStrictEquals } from "jsr:@std/assert";
import { spy, type Spy } from "jsr:@std/testing/mock";
import { type EmailMarketingService, type UserData } from "../_shared/types.ts";
import { type User } from "npm:@supabase/supabase-js";
import { NoOpEmailService } from "../_shared/email_service/no_op_service.ts";

// We need to simulate the `serve` function or how the handler is invoked.
// For simplicity, we can extract the core handler logic into a separate function
// if it's not already, or directly invoke the callback passed to `serve`.
// Assuming the current structure where serve takes the main async (req) => {...} callback:
// We need to import the function itself to get access to this callback.
// This might require a slight refactor of index.ts if the callback isn't exported.

// --- Test Setup ---

// Simulate a Supabase Auth Hook request for user creation
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

    // Import the handler dynamically within the test suite
    // NOTE: We import the specific exported handler function, not the whole module for serve
    const { handler } = await import("./index.ts"); 
    if (!handler) { 
        console.error("ERROR: Handler function not found in index.ts"); 
        assert(false, "Handler function not found"); 
        return; 
    }

    const testUserRecord: Partial<User> = {
        id: "test-uuid-di-789",
        email: "hooktest-di@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        user_metadata: { firstName: "HookDI", lastName: "TestDI" }, 
    };

    // New test record without user_metadata
    const testUserRecordWithoutMetadata: Partial<User> = {
        id: "test-uuid-no-meta-123",
        email: "hooktest-no-meta@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        // No user_metadata field here
    };

    // --- Define Mock Services with Spies ---
    let kitAddUserSpy = spy(async (_userData: UserData) => {});
    const mockKitService: EmailMarketingService = {
        addUserToList: kitAddUserSpy,
        updateUserAttributes: spy(async () => {}),
        removeUser: spy(async () => {}),
    };

    let mockNoOpServiceAddUserSpy = spy(async (_userData: UserData) => {});
    const mockNoOpService: EmailMarketingService = {
        addUserToList: mockNoOpServiceAddUserSpy,
        updateUserAttributes: spy(async () => {}),
        removeUser: spy(async () => {}),
    };
    
    let erroringAddUserSpy = spy(async (_userData: UserData) => { throw new Error("Internal service error"); });
    const erroringKitService: EmailMarketingService = {
        addUserToList: erroringAddUserSpy,
        updateUserAttributes: spy(async () => {}),
        removeUser: spy(async () => {}),
    };

    const noOpServiceInstance = new NoOpEmailService();
    let noOpInstanceAddUserSpy = spy(noOpServiceInstance, "addUserToList");

    // --- Test Steps using Dependency Injection ---

    // Reset spies before each relevant test step
    const resetSpies = () => {
        kitAddUserSpy = spy(async (_userData: UserData) => {});
        mockKitService.addUserToList = kitAddUserSpy;
        mockNoOpServiceAddUserSpy = spy(async (_userData: UserData) => {});
        mockNoOpService.addUserToList = mockNoOpServiceAddUserSpy;
        erroringAddUserSpy = spy(async (_userData: UserData) => { throw new Error("Internal service error"); });
        erroringKitService.addUserToList = erroringAddUserSpy;
        noOpInstanceAddUserSpy.restore();
        noOpInstanceAddUserSpy = spy(noOpServiceInstance, "addUserToList");
    };

    await t.step("should call injected KitService.addUserToList", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        const response = await handler(request, { emailService: mockKitService }); 

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed for email marketing." });
        assertEquals(kitAddUserSpy.calls.length, 1);
        const calledWith = kitAddUserSpy.calls[0].args[0];
        assertExists(calledWith);
        assertEquals(calledWith.id, testUserRecord.id);
        assertEquals(calledWith.email, testUserRecord.email);
        assertEquals(calledWith.firstName, testUserRecord.user_metadata?.firstName);
    });

    await t.step("should call injected NoOpService mock's addUserToList", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        const response = await handler(request, { emailService: mockNoOpService }); 

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed for email marketing." }); 
        assertEquals(mockNoOpServiceAddUserSpy.calls.length, 1);
    });

    // New test step for missing metadata
    await t.step("should handle missing user_metadata correctly", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecordWithoutMetadata);
        // Inject the mock KitService to see what data it receives
        const response = await handler(request, { emailService: mockKitService });

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed for email marketing." });
        // Assert the spy was called
        assertEquals(kitAddUserSpy.calls.length, 1);
        const calledWith = kitAddUserSpy.calls[0].args[0];
        assertExists(calledWith);
        // Verify essential fields are present
        assertEquals(calledWith.id, testUserRecordWithoutMetadata.id);
        assertEquals(calledWith.email, testUserRecordWithoutMetadata.email);
        // Crucially, verify optional fields are undefined
        assertEquals(calledWith.firstName, undefined, "firstName should be undefined");
        assertEquals(calledWith.lastName, undefined, "lastName should be undefined");
    });

    // Invalid body/record tests remain the same - they don't need deps
    await t.step("should return 400 for invalid request body", async () => {
        // No deps needed as handler errors before using them
        const request = new Request("http://localhost/on-user-created", { method: "POST", body: "invalid json" });
        const response = await handler(request, { emailService: null }); // Pass dummy deps
        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "Failed to parse request." });
    });

    await t.step("should return 400 for missing user record data", async () => {
        // No deps needed as handler errors before using them
        const invalidRecord = { id: "only-id" }; 
        const request = createMockRequest(invalidRecord as Partial<User>); 
        const response = await handler(request, { emailService: null }); // Pass dummy deps
        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "Invalid user record received." });
    });

    await t.step("should return 200 even if injected service.addUserToList fails", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        const response = await handler(request, { emailService: erroringKitService });

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "Webhook received, but failed to process user for email marketing." });
        assertEquals(erroringAddUserSpy.calls.length, 1);
    });

    await t.step("should return 200 and 'skipped (not configured)' if null service injected", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        const response = await handler(request, { emailService: null });

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed, email sync skipped (service not configured)." }); 
    });

    await t.step("should return 200 and 'skipped (NoOp)' if NoOpEmailService injected", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        const response = await handler(request, { emailService: noOpServiceInstance }); 

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed, email sync skipped (service is NoOpEmailService)." });
        assertEquals(noOpInstanceAddUserSpy.calls.length, 0);
    });

    // Cleanup spies on the real NoOp instance
    noOpInstanceAddUserSpy.restore();

});

// **Important Note:**
// This test structure assumes you can import and invoke the core request handling logic
// from `./index.ts`. If the logic is tightly coupled within the `serve` call without
// an export, you might need to refactor `index.ts` to export the handler function, e.g.:
// 
// // --- Example index.ts refactor ---
// import { serve } from "std/http/server.ts";
// // ... other imports ...
// 
// export async function handler(req: Request): Promise<Response> {
//   // ... existing logic currently inside serve() callback ...
// }
// 
// if (import.meta.main) { // Ensure serve only runs when script is executed directly
//     serve(handler);
// }
// // --- End Example --- 