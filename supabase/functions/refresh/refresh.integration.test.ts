import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/test-utils.ts";

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: ANON_KEY not found. Login step will fail.");
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const REFRESH_URL = "http://localhost:54321/functions/v1/refresh";

Deno.test("/refresh Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    const testEmail = `test-refresh-${Date.now()}@example.com`;
    const testPassword = "password123";
    let userId = ""; 
    let refreshToken = "";

    // Setup: Create user and log them in to get refresh token
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
        assertExists(loginBody.session?.refresh_token, "Refresh token missing");
        refreshToken = loginBody.session.refresh_token;
    });

    await t.step("Success: Call /refresh with valid refresh token", async () => {
        const response = await fetch(REFRESH_URL, {
            // Method should probably be POST, but function doesn't check
            method: "POST", 
            headers: {
                // Pass refresh token in Authorization header
                "Authorization": `Bearer ${refreshToken}`,
                // API key is also required by the function
                "apikey": ANON_KEY 
            },
            // No body expected
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.user, "Response should contain user");
        assertExists(body.profile, "Response should contain profile"); // Profile might be null
        assertExists(body.session, "Response should contain session");
        assertEquals(body.user.id, userId);
        assertExists(body.session.access_token, "New access token expected");
        assertExists(body.session.refresh_token, "New refresh token expected");
    });

    await t.step("Failure: Missing API Key", async () => {
        const response = await fetch(REFRESH_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${refreshToken}`,
                // Missing apikey
            },
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized");
        const body = await response.json();
        assertEquals(body.error?.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Missing Refresh Token (Authorization header)", async () => {
        const response = await fetch(REFRESH_URL, {
            method: "POST",
            headers: {
                "apikey": ANON_KEY,
                // Missing Authorization header
            },
        });
        assertEquals(response.status, 400, "Expected 400 Bad Request");
        const body = await response.json();
        assertEquals(body.error?.message, "Refresh token is required in Authorization header");
    });

     await t.step("Failure: Invalid Refresh Token", async () => {
        const response = await fetch(REFRESH_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer invalid-refresh-token`,
                "apikey": ANON_KEY 
            },
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized");
        const body = await response.json();
        // Exact message might vary
        assertExists(body.error?.message, "Error message expected");
        // assertStringIncludes(body.error.message, "Invalid Refresh Token"); 
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