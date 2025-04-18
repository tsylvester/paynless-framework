import { assert, assertEquals, assertExists, assertInstanceOf } from "jsr:@std/assert";
import { spy, type Spy } from "jsr:@std/testing/mock"; // Keep spy for verifying calls
import { type EmailMarketingService, type UserData } from "../_shared/types.ts";
import { type User } from "npm:@supabase/supabase-js";
import { NoOpEmailService } from "../_shared/email_service/no_op_service.ts";
// We don't need KitService or the Factory here anymore for mocking

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
Deno.test("on-user-created Edge Function Tests (Direct Dependency Injection)", async (t) => {

    const testUserRecord: Partial<User> = {
        id: "test-uuid-di-redux-789",
        email: "hooktest-di-redux@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        user_metadata: { firstName: "HookDI", lastName: "Redux" }, 
    };

    const testUserRecordWithoutMetadata: Partial<User> = {
        id: "test-uuid-no-meta-redux-123",
        email: "hooktest-no-meta-redux@example.com",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
    };

    // --- Mock Services and Spies ---
    let kitAddUserSpy = spy(async (_userData: UserData) => {}); 
    const mockKitService: EmailMarketingService = {
        addUserToList: kitAddUserSpy,
        updateUserAttributes: spy(async () => {}), // Include for type completeness
        removeUser: spy(async () => {}),           // Include for type completeness
    };

    const noOpServiceInstance = new NoOpEmailService(); // Real instance for instanceof check
    let noOpInstanceAddUserSpy = spy(noOpServiceInstance, "addUserToList"); // Spy on the real instance

    let erroringAddUserSpy = spy(async (_userData: UserData) => { 
        throw new Error("Internal service error"); 
    });
    const erroringKitService: EmailMarketingService = {
        addUserToList: erroringAddUserSpy,
        updateUserAttributes: spy(async () => {}),
        removeUser: spy(async () => {}),
    };

    // --- Test Steps using Direct Injection ---

    // Helper to reset spies before each test
    const resetSpies = () => {
        kitAddUserSpy = spy(async (_userData: UserData) => {}); 
        mockKitService.addUserToList = kitAddUserSpy; // Re-assign spy to mock
        
        noOpInstanceAddUserSpy.restore(); // Restore previous spy
        noOpInstanceAddUserSpy = spy(noOpServiceInstance, "addUserToList"); // Create new spy on real instance
        
        erroringAddUserSpy = spy(async (_userData: UserData) => { 
            throw new Error("Internal service error"); 
        });
        erroringKitService.addUserToList = erroringAddUserSpy; // Re-assign spy to erroring mock
    };

    await t.step("should call injected KitService.addUserToList with correct data", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        // Call handler with the mock KitService dependency
        const response = await handler(request, { emailService: mockKitService }); 

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed for email marketing." });
        // Assert the spy on the injected mock service was called
        assertEquals(kitAddUserSpy.calls.length, 1);
        const calledWith = kitAddUserSpy.calls[0].args[0];
        assertExists(calledWith);
        assertEquals(calledWith.id, testUserRecord.id);
        assertEquals(calledWith.email, testUserRecord.email);
        assertEquals(calledWith.firstName, testUserRecord.user_metadata?.firstName);
        assertEquals(calledWith.lastName, testUserRecord.user_metadata?.lastName);
    });

    await t.step("should handle missing user_metadata correctly when calling service", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecordWithoutMetadata);
        // Inject the mock KitService to see what data it receives
        const response = await handler(request, { emailService: mockKitService });

        assertEquals(response.status, 200);
        assertEquals(await response.json(), { message: "User processed for email marketing." });
        assertEquals(kitAddUserSpy.calls.length, 1);
        const calledWith = kitAddUserSpy.calls[0].args[0];
        assertExists(calledWith);
        assertEquals(calledWith.id, testUserRecordWithoutMetadata.id);
        assertEquals(calledWith.email, testUserRecordWithoutMetadata.email);
        assertEquals(calledWith.firstName, undefined, "firstName should be undefined");
        assertEquals(calledWith.lastName, undefined, "lastName should be undefined");
    });

    // Invalid body/record tests remain the same
    await t.step("should return 400 for invalid request body", async () => {
        const request = new Request("http://localhost/on-user-created", { method: "POST", body: "invalid json" });
        // Pass NoOp instance directly, as handler logic branches before using the service method
        const response = await handler(request, { emailService: noOpServiceInstance }); 
        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "Failed to parse request." });
    });

    await t.step("should return 400 for missing user record data", async () => {
        const invalidRecord = { id: "only-id" }; 
        const request = createMockRequest(invalidRecord as Partial<User>); 
        const response = await handler(request, { emailService: noOpServiceInstance }); 
        assertEquals(response.status, 400);
        assertEquals(await response.json(), { error: "Invalid user record received." });
    });
    // End invalid body/record tests

    await t.step("should return 200 OK even if injected service.addUserToList fails", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        // Call handler with the erroring service dependency
        const response = await handler(request, { emailService: erroringKitService });

        assertEquals(response.status, 200, "Handler should return 200 OK despite internal error");
        assertEquals(await response.json(), { message: "Webhook received, but failed to process user for email marketing." });
        // Check the spy on the erroring mock was called
        assertEquals(erroringAddUserSpy.calls.length, 1);
    });

    await t.step("should return 200 and 'skipped (NoOp)' if real NoOpEmailService injected", async () => {
        resetSpies();
        const request = createMockRequest(testUserRecord);
        // Call handler passing the REAL NoOp service instance
        const response = await handler(request, { emailService: noOpServiceInstance }); 

        assertEquals(response.status, 200);
        // Update expected message slightly based on latest index.ts version
        assertEquals(await response.json(), { message: "User processed, email sync skipped (service is NoOpEmailService (not configured or fallback))." });
        // Verify the REAL NoOp service's addUserToList was NOT called (due to instanceof check)
        assertEquals(noOpInstanceAddUserSpy.calls.length, 0); 
    });

    // Test with null service removed as factory prevents this

    // Cleanup spies on the real NoOp instance
    noOpInstanceAddUserSpy.restore();

}); 