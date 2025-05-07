import { assert, assertEquals, assertExists, fail } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase, createUser, createAdminClient, cleanupUser } from "../_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

// Ensure required environment variables are available for test setup
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const STRIPE_SECRET_TEST_KEY = Deno.env.get('STRIPE_SECRET_TEST_KEY');
const STRIPE_TEST_WEBHOOK_SECRET = Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET'); // Expecting whsec_loc_... from stripe listen

if (!ANON_KEY || !STRIPE_SECRET_TEST_KEY || !STRIPE_TEST_WEBHOOK_SECRET) {
    console.error("CRITICAL: Required environment variables (Supabase ANON_KEY, Stripe TEST keys, Stripe LOCAL Webhook Secret) not found.");
    // Optionally list which ones are missing
    Deno.exit(1);
}
if (!STRIPE_TEST_WEBHOOK_SECRET.startsWith("whsec_loc_")) {
    console.warn("WARNING: STRIPE_TEST_WEBHOOK_SECRET does not look like a local secret from 'stripe listen' (whsec_loc_...). Ensure stripe listen is running and .env.local is updated.")
}

const LOGIN_URL = "http://localhost:54321/functions/v1/login";
const CHECKOUT_URL = "http://localhost:54321/functions/v1/api-subscriptions/checkout";
const TEST_PRICE_ID = "price_1RABirIskUlhzlIxSaAQpFe2"; // Match price used in api-subscriptions tests

// --- Helper Functions ---

// Helper to trigger a Stripe event using the CLI
async function triggerStripeEvent(eventName: string, params: string[] = []): Promise<void> {
    console.log(`Triggering Stripe event: ${eventName} with params: ${params.join(' ')}`);
    // Correctly format --override flags as separate arguments
    const formattedArgs: string[] = ["trigger", eventName];
    params.forEach(p => {
        formattedArgs.push("--override");
        formattedArgs.push(p); // e.g., "checkout_session:id=cs_test_..."
    });

    const command = new Deno.Command("stripe", {
        args: formattedArgs,
        stdout: "piped",
        stderr: "piped",
    });
    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);
    
    console.log(`Stripe CLI trigger output for ${eventName}:
${output}`);
    if (code !== 0) {
        console.error(`Stripe CLI trigger failed for ${eventName}:
${errorOutput}`);
        throw new Error(`Failed to trigger Stripe event ${eventName}. Code: ${code}\nError: ${errorOutput}`);
    }
    console.log(`Stripe event ${eventName} triggered successfully.`);
}

// Helper to poll the database until a condition is met or timeout
async function pollDatabase<T>(
    adminClient: SupabaseClient,
    query: () => Promise<{ data: T | T[] | null; error: any }>,
    condition: (data: T | T[] | null) => boolean,
    timeoutMs = 15000, // 15 seconds timeout
    intervalMs = 500    // Check every 0.5 seconds
): Promise<T | T[] | null> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const { data, error } = await query();
        if (error) {
            console.error("Polling query failed:", error);
            // Decide if query error should stop polling or just retry
            await new Promise(resolve => setTimeout(resolve, intervalMs));
            continue; 
        }
        if (condition(data)) {
            return data;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Polling timed out after ${timeoutMs}ms.`);
}

// --- Test Suite ---

Deno.test("Stripe Webhook Integration Tests", { sanitizeResources: false, sanitizeOps: false }, async (t) => {
    await startSupabase();
    const adminClient = createAdminClient();
    
    let userEmail = `test-wh-${Date.now()}@example.com`;
    let userPassword = "passwordWh123";
    let userId = ""; 
    let userToken = "";
    let stripeCustomerId = "";
    let checkoutSessionId = "";

    // Setup: Create user, Login, Initiate Checkout to get Stripe Customer ID and Session ID
    await t.step("Setup: Create User, Login, and Initiate Checkout", async () => {
        // Create User
        const { user, error: createError } = await createUser(userEmail, userPassword);
        assertEquals(createError, null); assertExists(user); userId = user.id;

        // Login User
        const loginResponse = await fetch(LOGIN_URL, { method: "POST", headers: { "Content-Type": "application/json", "apikey": ANON_KEY ?? "" }, body: JSON.stringify({ email: userEmail, password: userPassword }) });
        assertEquals(loginResponse.status, 200);
        const loginBody = await loginResponse.json(); assertExists(loginBody.session?.access_token); userToken = loginBody.session.access_token;

        // Initiate Checkout to create Stripe Customer and initial DB record
        const checkoutResponse = await fetch(CHECKOUT_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${userToken}`, "apikey": ANON_KEY ?? "", "Content-Type": "application/json" },
            body: JSON.stringify({ priceId: TEST_PRICE_ID, successUrl: "http://localhost/success?id={CHECKOUT_SESSION_ID}", cancelUrl: "http://localhost/cancel" })
        });
        
        // Read body ONLY ONCE
        let checkoutBody: any = null;
        let errorBodyText: string | null = null;
        try {
            if (checkoutResponse.ok) {
                checkoutBody = await checkoutResponse.json();
            } else {
                errorBodyText = await checkoutResponse.text(); // Read as text on error
            }
        } catch (e) {
             // Type check before accessing .message
             if (e instanceof Error) {
                 errorBodyText = `Failed to parse response body: ${e.message}`;
             } else {
                 errorBodyText = `Failed to parse response body: Unknown error type`;
             }
             if (!checkoutResponse.ok && !errorBodyText) { // If reading text also failed
                try { errorBodyText = await checkoutResponse.text(); } catch { /* ignore nested error */ }
             }
        }

        assertEquals(checkoutResponse.status, 200, `Checkout failed: ${errorBodyText ?? "Unknown error"}`);
        assertExists(checkoutBody, "Checkout response body is null or failed to parse."); // Ensure body was parsed if status was 200
        
        // Expect sessionUrl and extract ID from it
        assertExists(checkoutBody.sessionUrl, "Checkout response missing sessionUrl"); 
        const url = new URL(checkoutBody.sessionUrl);
        const pathParts = url.pathname.split('/');
        const potentialSessionId = pathParts.pop(); // Get last part of path
        assertExists(potentialSessionId, "Failed to extract potential Session ID from URL path");
        assert(potentialSessionId.startsWith("cs_test_"), "Extracted ID does not look like a Stripe Checkout Session ID");
        checkoutSessionId = potentialSessionId; // Assign the extracted ID (now known to be string)
        
        // Verify customer ID was saved
        const subData = await pollDatabase(
            adminClient,
            async () => await adminClient.from('user_subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle(),
            (data: any) => !!data?.stripe_customer_id,
            5000 // Shorter timeout for setup check
        ) as { stripe_customer_id: string | null } | null;

        assertExists(subData?.stripe_customer_id, "stripe_customer_id not found in DB after checkout");
        stripeCustomerId = subData.stripe_customer_id;
        console.log(`Setup complete: User ${userId}, Stripe Customer ${stripeCustomerId}, Checkout Session ${checkoutSessionId}`);
    });

    // --- Test Cases --- 

    await t.step("Event: checkout.session.completed", async () => {
        // 1. Trigger the event using Stripe CLI
        // Override userId in metadata ONLY to link event to test user
        try {
            console.log(`Triggering Stripe event: checkout.session.completed`);
            const command = new Deno.Command("stripe", {
                args: ["trigger", "checkout.session.completed", "--override", `checkout_session:metadata.userId=${userId}`],
                stdout: "piped",
                stderr: "piped",
            });
            const { code, stdout, stderr } = await command.output();
            const output = new TextDecoder().decode(stdout);
            const errorOutput = new TextDecoder().decode(stderr);
            console.log(`Stripe CLI trigger output:\n${output}`);

            if (code !== 0) {
                console.error(`Stripe CLI trigger failed:\n${errorOutput}`);
                throw new Error(`Failed to trigger Stripe event. Code: ${code}\nError: ${errorOutput}`);
            }
            console.log(`Stripe event checkout.session.completed triggered successfully.`);
        } catch (error) {
            // Add type check for error
            if (error instanceof Error) {
                fail(`Stripe trigger command failed: ${error.message}`);
            } else {
                fail(`Stripe trigger command failed with unknown error type.`);
            }
        }

        // 2. Poll subscription_transactions table for the relevant transaction
        //    Poll based on user_id and event_type, assuming it appears shortly after trigger.
        console.log(`Polling for transaction log entry for user ${userId}, type checkout.session.completed`);
        const completedTransaction = await pollDatabase(
            adminClient,
            // Query for the specific event type for this user, order by creation descending
            async () => await adminClient.from('subscription_transactions')
                              .select('*')
                              .eq('user_id', userId)
                              .eq('event_type', 'checkout.session.completed')
                              .order('created_at', { ascending: false })
                              .limit(1)
                              .maybeSingle(),
            // Check if a recent record exists and has succeeded
            (data: any) => data?.status === 'succeeded' 
        ) as any;

        assertExists(completedTransaction, `Transaction record for checkout.session.completed for user ${userId} not found or not marked as succeeded.`);
        assertEquals(completedTransaction.status, "succeeded", "Transaction status should be succeeded");
        assertEquals(completedTransaction.user_id, userId, "Transaction user_id should match");
        assertEquals(completedTransaction.event_type, "checkout.session.completed", "Transaction event_type should match");
        console.log("checkout.session.completed processed successfully and transaction logged.");
    });

    // Placeholder for the next step (testing subscription creation/update event)
    await t.step("Event: customer.subscription.created/updated (TODO)", async () => {
        // 1. Trigger customer.subscription.created or customer.subscription.updated
        //    - Need to override customer ID
        //    - Need the actual Stripe Subscription ID (sub_...) created by the previous checkout.
        //      This might require querying the subscription_transactions table for the ID logged 
        //      by the checkout.session.completed handler, or making assumptions based on fixtures.
        //    - Need the plan/price ID.
        // Example trigger (needs refinement based on how to get sub ID):
        // await triggerStripeEvent("customer.subscription.created", [
        //     `customer.subscription:customer=${stripeCustomerId}`,
        //     `customer.subscription:id=sub_...`, // <--- How to get this ID reliably?
        //     `customer.subscription:plan.id=price_...` // or similar override path
        // ]);

        // 2. Poll user_subscriptions table
        // const updatedSub = await pollDatabase(...);
        // Assert status = 'active', stripe_subscription_id, plan_id etc. are correct.
        assertEquals(true, true); // Placeholder
    });

    // TODO: Add tests for other events like:
    // - customer.subscription.updated (e.g., plan change, cancellation)
    // - customer.subscription.deleted (e.g., subscription ended)
    // - invoice.payment_succeeded
    // - invoice.payment_failed
    // - product/price updates 

    // --- Cleanup --- 
    await t.step("Cleanup: Delete test user", async () => {
         if (userId) { 
             await adminClient.from('user_subscriptions').delete().eq('user_id', userId);
             // Cascading delete should handle profile, but explicit delete is safer
             await adminClient.from('user_profiles').delete().eq('id', userId);
             await cleanupUser(userEmail, adminClient); 
             userId = ""; // Reset ID after cleanup
        }
    });

    await stopSupabase();
}); 