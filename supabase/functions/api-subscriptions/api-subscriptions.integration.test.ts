import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
    initializeTestDeps,
    coreInitializeTestStep,
    coreCleanupTestResources,
} from "../_shared/_integration.test.utils.ts";

const supabaseProjectUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const STRIPE_SECRET_TEST_KEY = Deno.env.get("STRIPE_SECRET_TEST_KEY");
const STRIPE_TEST_WEBHOOK_SECRET = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");

if (
    !supabaseProjectUrl ||
    !supabaseAnonKey ||
    !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    !Deno.env.get("SUPABASE_JWT_SECRET") ||
    !STRIPE_SECRET_TEST_KEY ||
    !STRIPE_TEST_WEBHOOK_SECRET
) {
    console.error("CRITICAL: Required environment variables not found for api-subscriptions integration tests.");

    if (!supabaseProjectUrl) console.error("- SUPABASE_URL missing");
    if (!supabaseAnonKey) console.error("- SUPABASE_ANON_KEY missing");
    if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) console.error("- SUPABASE_SERVICE_ROLE_KEY missing");
    if (!Deno.env.get("SUPABASE_JWT_SECRET")) console.error("- SUPABASE_JWT_SECRET missing");
    if (!STRIPE_SECRET_TEST_KEY) console.error("- STRIPE_SECRET_TEST_KEY missing");
    if (!STRIPE_TEST_WEBHOOK_SECRET) console.error("- STRIPE_TEST_WEBHOOK_SECRET missing");
    Deno.exit(1);

}

const API_SUBSCRIPTIONS_BASE_URL = `${supabaseProjectUrl.replace(/\/$/, "")}/functions/v1/api-subscriptions`;

Deno.test("/api-subscriptions Integration Tests", async (t) => {
    initializeTestDeps();
    let userToken = "";

    await t.step("Setup: integration harness user and JWT", async () => {
        const { primaryUserJwt } = await coreInitializeTestStep({}, "local");
        userToken = primaryUserJwt;
    });

    await t.step("Success: GET /plans returns active plans", async () => {
        const targetUrl = `${API_SUBSCRIPTIONS_BASE_URL}/plans`;
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": supabaseAnonKey,
            },
        });
        assertEquals(response.status, 200, `GET /plans failed: ${response.statusText}`);

        const body = await response.json();

        assertExists(body.plans, "Response should have a 'plans' array");
        assertEquals(Array.isArray(body.plans), true, "'plans' should be an array");
        assertEquals(body.plans.length > 0, true, "Expected at least one active plan");

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
                "apikey": supabaseAnonKey,
            },
        });
        assertEquals(response.status, 200, `GET /current failed: ${response.statusText}`);
        const body = await response.json();
        assertEquals(body.subscription === null || body.subscription === undefined, true, "Expected no active subscription initially");
    });

    await t.step("Success: POST /checkout creates a session URL", async () => {
        const targetUrl = `${API_SUBSCRIPTIONS_BASE_URL}/checkout`;
        const testPriceId = "price_1RABirIskUlhzlIxSaAQpFe2";
        const requestBody = {
            priceId: testPriceId,
            successUrl: "http://localhost:8000/payment/success?session_id={CHECKOUT_SESSION_ID}",
            cancelUrl: "http://localhost:8000/payment/cancel",
        };

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": supabaseAnonKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
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
            returnUrl: "http://localhost:8000/account/billing",
        };

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "apikey": supabaseAnonKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
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
            {
                method: "POST",
                path: `${API_SUBSCRIPTIONS_BASE_URL}/checkout`,
                body: JSON.stringify({
                    priceId: "price_1RABirIskUlhzlIxSaAQpFe2",
                    successUrl: "...".repeat(10),
                    cancelUrl: "...".repeat(10),
                }),
            },
        ];

        for (const endpoint of endpointsToTest) {
            await testCtx.step(`Auth Fail ${endpoint.method} ${endpoint.path.split("/").pop()}: No JWT`, async () => {
                const response = await fetch(endpoint.path, {
                    method: endpoint.method,
                    headers: {
                        "apikey": supabaseAnonKey,
                        ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
                    },
                    ...(endpoint.body ? { body: endpoint.body } : {}),
                });
                assertEquals(response.status, 401, `Expected 401 Unauthorized without JWT for ${endpoint.method} ${endpoint.path}`);
                await response.body?.cancel();
            });

            await testCtx.step(`Auth Fail ${endpoint.method} ${endpoint.path.split("/").pop()}: Invalid JWT`, async () => {
                const response = await fetch(endpoint.path, {
                    method: endpoint.method,
                    headers: {
                        "Authorization": "Bearer invalid-token",
                        "apikey": supabaseAnonKey,
                        ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
                    },
                    ...(endpoint.body ? { body: endpoint.body } : {}),
                });
                assertEquals(response.status, 401, `Expected 401 Unauthorized with invalid JWT for ${endpoint.method} ${endpoint.path}`);
                await response.body?.cancel();
            });
        }
    });

    await t.step("Cleanup: harness teardown", async () => {
        await coreCleanupTestResources("local");
    });
});
