import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/test-utils.ts";

// Assuming SUPABASE_ANON_KEY is available in the test environment
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.warn("WARN: SUPABASE_ANON_KEY not found in env, API key tests might fail or be inaccurate.");
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";

Deno.test("Login Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient(); // For direct db operations like profile creation/cleanup
    
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = "password123";
    let userId = "";

    await t.step("Setup: Create test user", async () => {
        const { user } = await createUser(testEmail, testPassword);
        assertExists(user);
        assertExists(user.id);
        userId = user.id;
    });

    await t.step("Success: Valid credentials and API key", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY 
            },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.user, "Response body should contain user object");
        assertExists(body.session, "Response body should contain session object");
        assertEquals(body.user.id, userId, "User ID in response should match created user");
        assertEquals(body.user.email, testEmail.toLowerCase(), "User email in response should match"); // Emails are often stored lowercase
        assertExists(body.session.access_token, "Session should contain access_token");
        assertExists(body.session.refresh_token, "Session should contain refresh_token");
        assertExists(body.profile, "Profile object should exist in the response, even if default/empty");
    });

    await t.step("Success: Valid credentials for user WITH profile", async () => {
        // Update the existing profile for the user, using the correct schema
        const updatedFirstName = `TesterUpdated-${Date.now()}`;
        const profileUpdateData = { 
            first_name: updatedFirstName // Update first_name
        }; 
        // Use UPDATE instead of INSERT
        const { error: updateError } = await adminClient
            .from('user_profiles')
            .update(profileUpdateData)
            .eq('id', userId); // Target the specific user profile

        assertEquals(updateError, null, `Failed to UPDATE profile for test: ${updateError?.message}`);

        // Now log in again to see if the updated profile is returned
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });

        assertEquals(response.status, 200);
        const body = await response.json();
        assertExists(body.profile, "Profile should exist in response");
        assertEquals(body.profile.id, userId, "Profile ID should match user ID");
        // Assert the updated column name reflects the change
        if (!updateError) { 
            assertEquals(body.profile.first_name, updatedFirstName, "Profile first_name should match updated value");
        }
    });


    await t.step("Failure: Invalid Password", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: testEmail, password: "wrongpassword" }),
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for invalid password");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Invalid login credentials"); 
    });

    await t.step("Failure: Non-existent Email", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: "nosuchuser@example.com", password: "password123" }),
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for non-existent email");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Invalid login credentials");
    });
    
    await t.step("Failure: Missing Password", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: testEmail }), // Missing password
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for missing password");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Email and password are required");
    });

    await t.step("Failure: Missing Email", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ password: testPassword }), // Missing email
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for missing email");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Email and password are required");
    });

    await t.step("Failure: Empty JSON Body", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({}), // Empty body
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for empty body");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Email and password are required");
    });

     await t.step("Failure: Invalid JSON Body", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: "{invalid json", 
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request for invalid JSON");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Invalid JSON body"); 
    });

    await t.step("Failure: Missing API Key", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" }, // Missing apikey header
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for missing API key");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Invalid API Key", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": "invalid-key" 
            },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for invalid API key");
        const body = await response.json();
        assertExists(body.error, "Response body should contain error object");
        assertEquals(body.error.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Method Not Allowed (GET)", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "GET", // Incorrect method
            headers: { "apikey": ANON_KEY },
        });
        // Note: Deno std serve usually returns 405 automatically for OPTIONS if not handled, 
        // but our function explicitly checks POST *after* CORS/API key.
        // The function itself returns 405 if method isn't POST.
        assertEquals(response.status, 405, "Expected 405 Method Not Allowed for GET request");
        // We might get HTML back from the dev server for 405, or JSON from our handler
        // Let's check the text content for safety
        const text = await response.text();
        assertNotEquals(text.indexOf("Method Not Allowed"), -1, "Response should contain 'Method Not Allowed'");
    });

    // Cleanup
    await t.step("Cleanup: Delete test user and profile", async () => {
        // Profile deletion needed because we added one manually
        await adminClient.from('user_profiles').delete().eq('id', userId);
        await cleanupUser(testEmail, adminClient); // Use admin client for user cleanup
    });

    await stopSupabase();
}); 