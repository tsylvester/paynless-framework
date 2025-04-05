import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/test-utils.ts";

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ""; 
if (!ANON_KEY) {
    console.error("CRITICAL: ANON_KEY not found. Login step will fail.");
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const PROFILE_BASE_URL = "http://localhost:54321/functions/v1/profile";

Deno.test("/profile/<userId> Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    // User A (requester)
    const userAEmail = `test-profA-${Date.now()}@example.com`;
    const userAPassword = "passwordA123";
    let userA_Id = ""; 
    let userA_Token = "";

    // User B (target)
    const userBEmail = `test-profB-${Date.now()}@example.com`;
    const userBPassword = "passwordB123";
    let userB_Id = ""; 
    const userB_FirstName = `UserB-${Date.now()}`;

    // Setup: Create users and log in User A
    await t.step("Setup: Create users and login User A", async () => {
        // Create User A
        const { user: userA, error: createAError } = await createUser(userAEmail, userAPassword);
        assertEquals(createAError, null, "Failed to create User A");
        assertExists(userA?.id); userA_Id = userA.id;

        // Create User B and update their profile with a first name
        const { user: userB, error: createBError } = await createUser(userBEmail, userBPassword);
        assertEquals(createBError, null, "Failed to create User B");
        assertExists(userB?.id); userB_Id = userB.id;
        // Use upsert to ensure the profile exists and is updated
        const { error: upsertBError } = await adminClient.from('user_profiles')
                                            .upsert({ id: userB_Id, first_name: userB_FirstName })
                                            .eq('id', userB_Id); // eq is still needed for upsert condition if desired, but redundant here
        assertEquals(upsertBError, null, "Failed to upsert User B profile");

        // Login User A
        const loginResponse = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: userAEmail, password: userAPassword }),
        });
        assertEquals(loginResponse.status, 200, "User A Login failed");
        const loginBody = await loginResponse.json();
        assertExists(loginBody.session?.access_token, "User A Access token missing");
        userA_Token = loginBody.session.access_token;
    });

    await t.step("Success: User A gets User B profile", async () => {
        const targetUrl = `${PROFILE_BASE_URL}/${userB_Id}`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${userA_Token}`,
                "apikey": ANON_KEY 
            },
        });
        assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
        const body = await response.json();
        assertExists(body, "Response body is missing");
        assertEquals(body.id, userB_Id, "Profile ID should match User B");
        assertEquals(body.first_name, userB_FirstName, "Profile first_name should match");
        assertExists(body.last_name !== undefined, "last_name key should exist (even if null)");
        assertExists(body.created_at, "created_at key should exist");
    });

    await t.step("Failure: User A gets non-existent profile", async () => {
        const nonExistentId = crypto.randomUUID(); // Generate random UUID
        const targetUrl = `${PROFILE_BASE_URL}/${nonExistentId}`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${userA_Token}`,
                "apikey": ANON_KEY 
            },
        });
        assertEquals(response.status, 404, "Expected 404 Not Found");
        const body = await response.json();
        assertEquals(body.error?.message, "Profile not found");
    });

    await t.step("Failure: Request without JWT", async () => {
        const targetUrl = `${PROFILE_BASE_URL}/${userB_Id}`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: { "apikey": ANON_KEY }, // Missing Authorization
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized");
        await response.body?.cancel();
    });

    await t.step("Failure: Request with invalid JWT", async () => {
        const targetUrl = `${PROFILE_BASE_URL}/${userB_Id}`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer invalid-token`,
                "apikey": ANON_KEY 
            },
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized");
        await response.body?.cancel();
    });

    await t.step("Failure: Request without API Key", async () => {
        const targetUrl = `${PROFILE_BASE_URL}/${userB_Id}`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: { "Authorization": `Bearer ${userA_Token}` }, // Missing apikey
        });
        assertEquals(response.status, 401, "Expected 401 Unauthorized");
        const body = await response.json();
        assertEquals(body.error?.message, "Invalid or missing apikey");
    });

    await t.step("Failure: Method Not Allowed (POST)", async () => {
        const targetUrl = `${PROFILE_BASE_URL}/${userB_Id}`;
        const response = await fetch(targetUrl, {
            method: "POST", // Incorrect method
            headers: {
                "Authorization": `Bearer ${userA_Token}`,
                "apikey": ANON_KEY 
            },
            body: JSON.stringify({}), // Add dummy body for POST
        });
        assertEquals(response.status, 405, "Expected 405 Method Not Allowed");
        await response.body?.cancel();
    });

    // Cleanup
    await t.step("Cleanup: Delete test users", async () => {
        if (userA_Id) { 
             await adminClient.from('user_profiles').delete().eq('id', userA_Id);
             await cleanupUser(userAEmail, adminClient); 
        }
         if (userB_Id) { 
             await adminClient.from('user_profiles').delete().eq('id', userB_Id);
             await cleanupUser(userBEmail, adminClient); 
        }
    });

    await stopSupabase();
}); 