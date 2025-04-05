import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/test-utils.ts";

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: ANON_KEY not found. Login step will fail.");
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const LOGOUT_URL = "http://localhost:54321/functions/v1/logout";
const ME_URL = "http://localhost:54321/functions/v1/me"; // To verify logout

Deno.test("/logout Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    const testEmail = `test-logout-${Date.now()}@example.com`;
    const testPassword = "password123";
    let userId = ""; 
    let accessToken = "";

    // Setup: Create user and log them in to get token
    await t.step("Setup: Create and login user", async () => {
        const { user, error: createError } = await createUser(testEmail, testPassword);
        assertEquals(createError, null, `Failed to create user: ${createError?.message}`);
        assertExists(user?.id);
        userId = user.id;

        const loginResponse = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        assertEquals(loginResponse.status, 200, "Login request failed");
        const loginBody = await loginResponse.json();
        assertExists(loginBody.session?.access_token, "Access token missing");
        accessToken = loginBody.session.access_token;
    });

    await t.step("Success: Call /logout with valid token", async () => {
        const response = await fetch(LOGOUT_URL, {
            method: "POST", // Use POST as per convention/refactor
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                // No API key needed now
            },
        });
        
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body.message, "Response should contain message");
        assertEquals(body.message, "Successfully signed out");
    });

    await t.step("Failure: Call /logout without Authorization header", async () => {
        const response = await fetch(LOGOUT_URL, {
            method: "POST",
            headers: {},
        });
        // Expect 401 because createSupabaseClient requires the header
        assertEquals(response.status, 401, "Expected 401 Unauthorized"); 
        // Body might be HTML or JSON depending on where error originates
        await response.body?.cancel(); 
    });

     await t.step("Failure: Call /logout with invalid token", async () => {
        const response = await fetch(LOGOUT_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer invalid-token`,
            },
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized for invalid token");
        await response.body?.cancel(); 
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