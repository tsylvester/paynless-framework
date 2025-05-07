import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/supabase.mock.ts";

// Load env vars necessary for test utils
// (Assuming supabase.mock handles loading from the correct .env.local)

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: SUPABASE_ANON_KEY not found in env. Cannot run /login step.");
    // Deno.exit(1); // Optional: Exit if critical key is missing
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const ME_URL = "http://localhost:54321/functions/v1/me";

Deno.test("/me Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    const testEmail = `test-me-${Date.now()}@example.com`;
    const testPassword = "password123";
    let userId = "";
    let accessToken = "";

    await t.step("Setup: Create test user", async () => {
        const { user, error } = await createUser(testEmail, testPassword);
        assertEquals(error, null, `Failed to create user: ${error?.message}`);
        assertExists(user);
        assertExists(user.id);
        userId = user.id;
    });

    await t.step("Setup: Login user to get access token", async () => {
        const response = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "apikey": ANON_KEY // Use the correct local anon key as API key
            },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        assertEquals(response.status, 200, "Login request failed");
        const body = await response.json();
        assertExists(body.session?.access_token, "Access token not found in login response");
        accessToken = body.session.access_token;
    });

    await t.step("Success: Call /me with valid token", async () => {
        const response = await fetch(ME_URL, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "apikey": ANON_KEY // Still needed for edge function routing/auth?
            },
        });
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.user, "Response should contain user object");
        assertEquals(body.user.id, userId, "User ID in response should match");
        assertEquals(body.user.email, testEmail.toLowerCase(), "User email in response should match");
        // TODO: Add assertions for other expected user fields if necessary
    });

    await t.step("Failure: Call /me without token", async () => {
        const response = await fetch(ME_URL, {
            method: "GET",
            headers: {
                "apikey": ANON_KEY 
            },
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized without token");
        const responseText = await response.text();
        const expectedText = "Missing authorization header"; 
        assertStringIncludes(responseText, expectedText, `Response text should indicate missing auth header`);
    });

    await t.step("Failure: Call /me with invalid token", async () => {
        const invalidToken = accessToken + "invalid";
        const response = await fetch(ME_URL, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${invalidToken}`,
                "apikey": ANON_KEY 
            },
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized with invalid token");
        const responseText = await response.text();
        const expectedText = "Invalid JWT";
        assertStringIncludes(responseText, expectedText, `Response text should indicate invalid token`);
    });

    // TODO: Add test for calling /me with non-GET method (e.g., POST) -> Expect 405?

    // Cleanup
    await t.step("Cleanup: Delete test user and profile", async () => {
        // Profile might have been auto-created, delete it first
        await adminClient.from('user_profiles').delete().eq('id', userId);
        await cleanupUser(testEmail, adminClient);
    });

    await stopSupabase();
}); 