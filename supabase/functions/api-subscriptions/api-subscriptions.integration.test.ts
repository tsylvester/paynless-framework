import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/test-utils.ts";

// Ensure required environment variables are available
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
// Read the TEST keys, as defined in .env.local and expected by stripe-client.ts in test mode
const STRIPE_SECRET_TEST_KEY = Deno.env.get('STRIPE_SECRET_TEST_KEY');
const STRIPE_TEST_WEBHOOK_SECRET = Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET');

if (!ANON_KEY || !STRIPE_SECRET_TEST_KEY || !STRIPE_TEST_WEBHOOK_SECRET) {
    console.error("CRITICAL: Required environment variables (Supabase ANON_KEY, Stripe TEST keys) not found.");
    // Optionally list which ones are missing
    if (!ANON_KEY) console.error("- SUPABASE_ANON_KEY missing");
    if (!STRIPE_SECRET_TEST_KEY) console.error("- STRIPE_SECRET_TEST_KEY missing");
    if (!STRIPE_TEST_WEBHOOK_SECRET) console.error("- STRIPE_TEST_WEBHOOK_SECRET missing");
    Deno.exit(1);
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const API_SUBSCRIPTIONS_BASE_URL = "http://localhost:54321/functions/v1/api-subscriptions";

Deno.test("/api-subscriptions Integration Tests", async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    const userEmail = `test-subs-${Date.now()}@example.com`;
    const userPassword = "passwordSubs123";
    let userId = ""; 
    let userToken = "";

    // Setup: Create a test user and log them in
    await t.step("Setup: Create and login test user", async () => {
        // Create User
        const { user, error: createError } = await createUser(userEmail, userPassword);
        assertEquals(createError, null, "Failed to create test user");
        assertExists(user?.id); userId = user.id;

        // Login User
        const loginResponse = await fetch(LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
            body: JSON.stringify({ email: userEmail, password: userPassword }),
        });
        assertEquals(loginResponse.status, 200, "User Login failed");
        const loginBody = await loginResponse.json();
        assertExists(loginBody.session?.access_token, "Access token missing");
        userToken = loginBody.session.access_token;
    });

    // --- Test Cases --- 

    await t.step("Success: GET /plans returns active plans", async () => {
        const targetUrl = `${API_SUBSCRIPTIONS_BASE_URL}/plans`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": ANON_KEY ?? "" 
            },
        });
        assertEquals(response.status, 200, `GET /plans failed: ${response.statusText}`);
        const body = await response.json();

        // Basic checks - Adjust assertions based on your actual plan data
        assertExists(body.plans, "Response should have a 'plans' array");
        assertEquals(Array.isArray(body.plans), true, "'plans' should be an array");
        
        // Example: Check if at least one active plan is returned (assuming you have one)
        // You might need more specific checks based on your seed data or Stripe setup
        assertEquals(body.plans.length > 0, true, "Expected at least one active plan"); 
        
        // Example: Check structure of the first plan 
        if (body.plans.length > 0) {
            const plan = body.plans[0];
            assertExists(plan.id, "Plan should have an id");
            assertExists(plan.name, "Plan should have a name");
            assertExists(plan.description, "Plan should have a description");
            assertExists(plan.amount, "Plan should have an amount");
            assertExists(plan.currency, "Plan should have a currency");
            assertExists(plan.interval, "Plan should have an interval");
            assertExists(plan.stripePriceId, "Plan should have a stripePriceId");
        }
    });

    await t.step("Placeholder: Test GET /current", async () => {
        // TODO: Implement test for fetching the current subscription (should be null/empty initially)
        assertEquals(true, true); // Placeholder assertion
    });

    await t.step("Placeholder: Test POST /checkout", async () => {
        // TODO: Implement test for creating a checkout session
        // Requires a Price ID from Stripe Test Dashboard
        assertEquals(true, true); // Placeholder assertion
    });

    await t.step("Placeholder: Test POST /portal", async () => {
        // TODO: Implement test for creating a billing portal session
        assertEquals(true, true); // Placeholder assertion
    });

     await t.step("Placeholder: Test Authentication Failures", async () => {
        // TODO: Test endpoints without token, with invalid token etc.
        assertEquals(true, true); // Placeholder assertion
    });

    // Cleanup
    await t.step("Cleanup: Delete test user", async () => {
         if (userId) { 
             // Ensure profile is deleted first due to potential foreign key constraints
             await adminClient.from('user_profiles').delete().eq('id', userId);
             await adminClient.from('user_subscriptions').delete().eq('user_id', userId);
             await cleanupUser(userEmail, adminClient); 
        }
    });

    await stopSupabase();
}); 