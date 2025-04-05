import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/test-utils.ts";

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: SUPABASE_ANON_KEY not found in env. Tests cannot run.");
    // Deno.exit(1); 
}

const REGISTER_URL = "http://localhost:54321/functions/v1/register";

Deno.test("/register Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    let testEmail = `test-register-${Date.now()}@example.com`;
    const testPassword = "password123"; // Valid length
    const shortPassword = "12345"; // Invalid length
    let userId = ""; // To store created user ID for cleanup

    await t.step("Success: Register new user with valid credentials", async () => {
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY,
                "Authorization": "Bearer dummy-token" 
            },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.user, "Response body should contain user object");
        assertExists(body.session, "Response body should contain session object");
        assertEquals(body.user.email, testEmail.toLowerCase(), "User email should match");
        assertExists(body.user.id, "User ID should exist");
        userId = body.user.id; // Save for cleanup
        assertExists(body.session.access_token, "Session should contain access_token");
        
        // Verify profile was auto-created (assuming this behavior)
        const { data: profile, error: profileError } = await adminClient
            .from('user_profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        assertEquals(profileError, null, "Error checking for auto-created profile");
        assertExists(profile, "Profile should have been automatically created");
        assertEquals(profile.id, userId, "Auto-created profile ID should match user ID");
    });

    await t.step("Failure: Register user with existing email", async () => {
        // Uses the email from the successful test above
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: testEmail, password: "anotherPassword" }),
        });
        // Supabase typically returns 400 or 422 for existing user
        assertEquals([400, 422].includes(response.status), true, `Expected 400 or 422, got ${response.status}`);
        const body = await response.json();
        assertExists(body.error?.message, "Error message expected");
        assertStringIncludes(body.error.message, "User already registered"); 
    });

    await t.step("Failure: Register with short password", async () => {
        const shortPasswordEmail = `shortpass-${Date.now()}@example.com`;
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: shortPasswordEmail, password: shortPassword }),
        });
         // Supabase typically returns 400 or 422 for weak password
        assertEquals([400, 422].includes(response.status), true, `Expected 400 or 422, got ${response.status}`);
        const body = await response.json();
        assertExists(body.error?.message, "Error message expected");
        assertStringIncludes(body.error.message, "Password should be at least 6 characters");
        // Cleanup potentially created user if needed (though shouldn't be created)
        await cleanupUser(shortPasswordEmail, adminClient);
    });

    await t.step("Failure: Missing Password", async () => {
        const noPassEmail = `nopass-${Date.now()}@example.com`;
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: noPassEmail }), // Missing password
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for missing password");
        const body = await response.json();
        assertExists(body.error?.message);
        assertEquals(body.error.message, "Email and password are required");
    });

    await t.step("Failure: Missing Email", async () => {
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ password: testPassword }), // Missing email
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for missing email");
        const body = await response.json();
        assertExists(body.error?.message);
        assertEquals(body.error.message, "Email and password are required");
    });

    await t.step("Failure: Missing API Key", async () => {
        const noApiKeyEmail = `noapikey-${Date.now()}@example.com`;
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" }, // Missing apikey header
            body: JSON.stringify({ email: noApiKeyEmail, password: testPassword }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for missing API key");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object"); 
        assertEquals(body.error.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Invalid API Key", async () => {
        const invalidApiKeyEmail = `invalidkey-${Date.now()}@example.com`;
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": "invalid-key" 
            },
            body: JSON.stringify({ email: invalidApiKeyEmail, password: testPassword }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for invalid API key");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Method Not Allowed (GET)", async () => {
        const response = await fetch(REGISTER_URL, {
            method: "GET", // Incorrect method
            headers: { "apikey": ANON_KEY },
        });
        assertEquals(response.status, 405, "Expected 405 Method Not Allowed for GET request");
        // Consume the response body to prevent resource leak error
        await response.body?.cancel(); 
    });

    // Cleanup the user created in the first successful test step
    await t.step("Cleanup: Delete successfully registered user", async () => {
        if (userId) { // Only cleanup if user was actually created
             await adminClient.from('user_profiles').delete().eq('id', userId);
             await cleanupUser(testEmail, adminClient); 
        }
    });

    await stopSupabase();
}); 