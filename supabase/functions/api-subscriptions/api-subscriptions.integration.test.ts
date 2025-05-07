import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/supabase.mock.ts";

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

    await t.step("Success: GET /current initially returns no subscription", async () => {
        const targetUrl = `${API_SUBSCRIPTIONS_BASE_URL}/current`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": ANON_KEY ?? ""
            },
        });
        assertEquals(response.status, 200, `GET /current failed: ${response.statusText}`);
        const body = await response.json();
        
        // Expecting null or an empty object/array depending on how the handler returns 'not found'
        // Let's assert the primary 'subscription' key is null or not present
        assertEquals(body.subscription === null || body.subscription === undefined, true, "Expected no active subscription initially");
    });

    await t.step("Success: POST /checkout creates a session URL", async () => {
        const targetUrl = `${API_SUBSCRIPTIONS_BASE_URL}/checkout`;
        const testPriceId = "price_1RABirIskUlhzlIxSaAQpFe2"; // Price ID from user
        const requestBody = {
            priceId: testPriceId,
            successUrl: "http://localhost:8000/payment/success?session_id={CHECKOUT_SESSION_ID}", // Placeholder URL
            cancelUrl: "http://localhost:8000/payment/cancel" // Placeholder URL
        };

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": ANON_KEY ?? "",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        assertEquals(response.status, 200, `POST /checkout failed: ${response.status} ${response.statusText}`);
        const body = await response.json();

        assertExists(body.sessionUrl, "Response should contain a sessionUrl");
        assertEquals(typeof body.sessionUrl, "string", "sessionUrl should be a string");
        assertEquals(body.sessionUrl.startsWith("https://checkout.stripe.com/"), true, "sessionUrl should be a Stripe checkout URL");
    });

    await t.step("Success: POST /billing-portal creates a portal session URL", async () => {
        const targetUrl = `${API_SUBSCRIPTIONS_BASE_URL}/billing-portal`;
        const requestBody = {
            // The return URL is where Stripe redirects the user after they finish in the portal
            returnUrl: "http://localhost:8000/account/billing" // Placeholder URL
        };

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": ANON_KEY ?? "",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        assertEquals(response.status, 200, `POST /billing-portal failed: ${response.status} ${response.statusText}`);
        const body = await response.json();

        assertExists(body.url, "Response should contain a url"); 
        assertEquals(typeof body.url, "string", "url should be a string");
        assertEquals(body.url.startsWith("https://billing.stripe.com/"), true, "url should be a Stripe billing portal session URL"); 
    });

    await t.step("Failure: Test Authentication", async (testCtx) => {
        const endpointsToTest = [
            { method: "GET", path: `${API_SUBSCRIPTIONS_BASE_URL}/plans` },
            { method: "POST", path: `${API_SUBSCRIPTIONS_BASE_URL}/checkout`, body: JSON.stringify({ priceId: "price_1RABirIskUlhzlIxSaAQpFe2", successUrl: "...".repeat(10), cancelUrl: "...".repeat(10) }) }, // Use dummy body for POST
            // Add other endpoints like /current, /billing-portal if desired
        ];

        for (const endpoint of endpointsToTest) {
            await testCtx.step(`Auth Fail ${endpoint.method} ${endpoint.path.split('/').pop()}: No JWT`, async () => {
                const response = await fetch(endpoint.path, {
                    method: endpoint.method,
                    headers: {
                        "apikey": ANON_KEY ?? "",
                        ...(endpoint.body && { "Content-Type": "application/json" })
                    },
                    ...(endpoint.body && { body: endpoint.body })
                });
                assertEquals(response.status, 401, `Expected 401 Unauthorized without JWT for ${endpoint.method} ${endpoint.path}`);
                await response.body?.cancel(); // Consume body to prevent resource leaks
            });

            await testCtx.step(`Auth Fail ${endpoint.method} ${endpoint.path.split('/').pop()}: Invalid JWT`, async () => {
                const response = await fetch(endpoint.path, {
                    method: endpoint.method,
                    headers: {
                        "Authorization": "Bearer invalid-token",
                        "apikey": ANON_KEY ?? "",
                        ...(endpoint.body && { "Content-Type": "application/json" })
                    },
                    ...(endpoint.body && { body: endpoint.body })
                });
                assertEquals(response.status, 401, `Expected 401 Unauthorized with invalid JWT for ${endpoint.method} ${endpoint.path}`);
                await response.body?.cancel();
            });

            // NOTE: The shared auth.ts currently doesn't check API key for functions, only for direct DB access.
            // If API key validation *was* implemented in the function entry (index.ts) like in /profile,
            // we would add a test case here. For now, it's skipped.
            // await testCtx.step(`Auth Fail ${endpoint.method} ${endpoint.path.split('/').pop()}: No API Key`, async () => {
            //     const response = await fetch(endpoint.path, {
            //         method: endpoint.method,
            //         headers: {
            //             "Authorization": `Bearer ${userToken}`,
            //             ...(endpoint.body && { "Content-Type": "application/json" })
            //         },
            //         ...(endpoint.body && { body: endpoint.body })
            //     });
            //     assertEquals(response.status, 401, `Expected 401 Unauthorized without API Key for ${endpoint.method} ${endpoint.path}`);
            //     await response.body?.cancel();
            // });
        }
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