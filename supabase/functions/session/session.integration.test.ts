import { assertEquals, assertExists, assert } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/supabase.mock.ts";

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: ANON_KEY not found. Login step will fail.");
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const SESSION_URL = "http://localhost:54321/functions/v1/session";

Deno.test("/session Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    const testEmail = `test-session-${Date.now()}@example.com`;
    const testPassword = "password123";
    let userId = ""; 
    let initialAccessToken = "";
    let initialRefreshToken = "";

    // Setup: Create user and log them in
    await t.step("Setup: Create and login user", async () => {
        const { user, error: createError } = await createUser(testEmail, testPassword);
        assertEquals(createError, null, `Failed to create user: ${createError?.message}`);
        assertExists(user?.id);
        userId = user.id;

        // Login to get initial tokens
        const loginResponse = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        assertEquals(loginResponse.status, 200, "Login request failed");
        const loginBody = await loginResponse.json();
        assertExists(loginBody.session?.access_token, "Access token missing");
        assertExists(loginBody.session?.refresh_token, "Refresh token missing");
        initialAccessToken = loginBody.session.access_token;
        initialRefreshToken = loginBody.session.refresh_token;
    });

    await t.step("Success: Call /session with valid tokens", async () => {
        const response = await fetch(SESSION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" }, // No API key needed
            body: JSON.stringify({ 
                access_token: initialAccessToken, 
                refresh_token: initialRefreshToken 
            }),
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.user, "Response should contain user");
        assertEquals(body.user.id, userId);
        // Profile might be null initially, which is okay. Just check key exists.
        assert("profile" in body, "Response should have a profile key (even if null)"); 
        assertEquals(body.session, undefined, "Session object should be undefined when access token is valid"); 
    });

    // Note: Reliably testing the token refresh flow is tricky locally 
    // without actually waiting for the initialAccessToken to expire.
    // We will test the *path* by providing only the refresh token, 
    // simulating an expired access token.
    await t.step("Success: Call /session with refresh token (simulating expired access token)", async () => {
        const response = await fetch(SESSION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Send invalid access token but valid refresh token
            body: JSON.stringify({ 
                access_token: "invalid-or-expired-token", 
                refresh_token: initialRefreshToken 
            }), 
        });
        
        assertEquals(response.status, 200, `Expected 200 OK after refresh, got ${response.status}`);
        const body = await response.json();
        assertExists(body.user, "Response should contain user after refresh");
        // Profile might be null, check key exists
        assert("profile" in body, "Response should have a profile key after refresh (even if null)");
        assertExists(body.session, "Session object should exist after refresh"); 
        assertExists(body.session.access_token, "New access token expected");
        assertExists(body.session.refresh_token, "New refresh token expected");
    });

     await t.step("Failure: Missing access_token", async () => {
        const response = await fetch(SESSION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: initialRefreshToken }), // Missing access_token
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request");
        const body = await response.json();
        assertEquals(body.error?.message, "Access token and refresh token are required");
    });

    await t.step("Failure: Missing refresh_token", async () => {
        const response = await fetch(SESSION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: initialAccessToken }), // Missing refresh_token
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request");
        const body = await response.json();
        assertEquals(body.error?.message, "Access token and refresh token are required");
    });

    await t.step("Failure: Invalid refresh_token", async () => {
        const response = await fetch(SESSION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                access_token: "invalid-or-expired-token", 
                refresh_token: "invalid-refresh-token"
            }),
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for invalid refresh token");
        const body = await response.json();
        // Error message might vary slightly depending on Supabase version
        assertExists(body.error?.message, "Error message expected"); 
        // assertStringIncludes(body.error.message, "Invalid refresh token"); 
    });

    // Cleanup
    await t.step("Cleanup: Delete test user", async () => {
        if (userId) { 
             await adminClient.from('user_profiles').delete().eq('id', userId);
             await cleanupUser(testEmail, adminClient); 
        }
    });

    await stopSupabase();
}); 