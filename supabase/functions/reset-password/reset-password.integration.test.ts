import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/supabase.mock.ts";

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: SUPABASE_ANON_KEY not found in env. Tests cannot run.");
}

const RESET_PASSWORD_URL = "http://localhost:54321/functions/v1/reset-password";

Deno.test("/reset-password Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    const existingUserEmail = `test-reset-${Date.now()}@example.com`;
    const nonExistentEmail = `no-such-user-${Date.now()}@example.com`;
    const testPassword = "password123";
    let userId = ""; 

    // Setup: Create a user to test against
    await t.step("Setup: Create existing user", async () => {
        const { user, error } = await createUser(existingUserEmail, testPassword);
        assertEquals(error, null, `Failed to create user: ${error?.message}`);
        assertExists(user?.id);
        userId = user.id;
    });

    await t.step("Success: Request reset for existing user", async () => {
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY,
                "Origin": "http://localhost:3000" // Need Origin for redirectTo
            },
            body: JSON.stringify({ email: existingUserEmail }),
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.message, "Response body should contain message");
        assertEquals(body.message, "Password reset email sent successfully");
        // Note: We can't easily test the email content locally without MailHog/Inbucket integration in the test
    });

    await t.step("Success: Request reset for non-existent user", async () => {
         // Supabase returns success even if email doesn't exist for security
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY,
                 "Origin": "http://localhost:3000"
            },
            body: JSON.stringify({ email: nonExistentEmail }),
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.message);
        assertEquals(body.message, "Password reset email sent successfully");
    });

    await t.step("Failure: Missing Email", async () => {
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY,
                 "Origin": "http://localhost:3000"
            },
            body: JSON.stringify({ }), // Empty body
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for missing email");
        const body = await response.json();
        assertExists(body.error?.message);
        assertEquals(body.error.message, "Email is required");
    });

    await t.step("Failure: Invalid Email Format", async () => {
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY,
                 "Origin": "http://localhost:3000"
            },
            body: JSON.stringify({ email: 12345 }), // Invalid format
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for invalid email format");
        const body = await response.json();
        assertExists(body.error?.message);
        assertEquals(body.error.message, "Invalid email format");
    });

     await t.step("Failure: Missing API Key", async () => {
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                 "Origin": "http://localhost:3000"
                 // Missing apikey
            },
            body: JSON.stringify({ email: existingUserEmail }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for missing API key");
        const body = await response.json();
        assertExists(body.error?.message);
        assertEquals(body.error.message, "Invalid or missing apikey");
    });

     await t.step("Failure: Invalid API Key", async () => {
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": "invalid-key",
                 "Origin": "http://localhost:3000"
            },
            body: JSON.stringify({ email: existingUserEmail }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for invalid API key");
        const body = await response.json();
        assertExists(body.error?.message);
        assertEquals(body.error.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Method Not Allowed (GET)", async () => {
        const response = await fetch(RESET_PASSWORD_URL, {
            method: "GET", // Incorrect method
            headers: { "apikey": ANON_KEY },
        });
        assertEquals(response.status, 405, "Expected 405 Method Not Allowed for GET request");
        await response.body?.cancel(); // Prevent leak
    });

    // Cleanup the user created in the setup step
    await t.step("Cleanup: Delete test user", async () => {
        if (userId) { 
             await adminClient.from('user_profiles').delete().eq('id', userId);
             await cleanupUser(existingUserEmail, adminClient); 
        }
    });

    await stopSupabase();
}); 