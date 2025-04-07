import { assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { spy, stub, assertSpyCalls, assertSpyCall, type Spy, type Stub } from "jsr:@std/testing/mock";
import type Stripe from "npm:stripe@14.11.0"; // Use specific version if known
import type { SupabaseClient, PostgrestResponse } from "npm:@supabase/supabase-js@2"; // Use specific version
import { 
    handleSyncPlansRequest, 
    type SyncPlansHandlerDeps 
} from "./index.ts";
import { Database } from "../types_db.ts"; // Adjust path as needed

// --- Mocks & Spies ---
let mockStripeClient: { prices: { list: Spy } };
let mockSupabaseClient: SupabaseClient<Database>; // Use the pattern that worked for invoice/subscription
let mockDeps: SyncPlansHandlerDeps;

// Supabase Client Spies (declare here, assign in tests)
let fromSpy: Spy;
let upsertSpy: Spy;
let selectSpy: Spy;
let updateSpy: Spy;
let eqSpy: Spy; // For update().eq()

// Deno.env stub
let denoEnvStub: Stub;

// --- Test Data ---
const mockStripePrice = (id: string, active: boolean, productId: string, recurring: boolean = true, meta: any = {}) => ({
    id,
    active,
    product: { id: productId, name: `Product ${productId}` }, // Mock expanded product
    recurring: recurring ? { interval: 'month', interval_count: 1 } : null,
    unit_amount: 1500,
    currency: 'usd',
    metadata: meta,
    // other necessary fields...
} as unknown as Stripe.Price);

const mockDbPlan = (priceId: string, productId: string, active: boolean, name: string = `Product ${productId}`) => ({
    id: `db_${priceId}`,
    stripe_price_id: priceId,
    stripe_product_id: productId,
    active: active,
    name: name
    // other fields...
});

// --- Test Suite Setup ---
beforeEach(() => {
    // Mock Stripe Client 
    mockStripeClient = {
        prices: {
            list: spy(() => Promise.resolve({ data: [], has_more: false })) // Default: empty list
        }
    };

    // Mock Supabase Client Spies (assign default implementations)
    upsertSpy = spy(() => Promise.resolve({ data: [{ id: 'upserted' }], error: null, count: 1 } as PostgrestResponse<any>));
    selectSpy = spy(() => Promise.resolve({ data: [], error: null } as PostgrestResponse<any>)); // Default: empty select
    eqSpy = spy(() => Promise.resolve({ data: [{ id: 'updated' }], error: null } as PostgrestResponse<any>)); 
    updateSpy = spy(() => ({ eq: eqSpy }));
    fromSpy = spy((tableName: string) => {
        if (tableName === 'subscription_plans') {
            return { upsert: upsertSpy, select: selectSpy, update: updateSpy };
        }
        throw new Error(`Unexpected table: ${tableName}`);
    });

    // Assign mock Supabase client using the successful pattern
    mockSupabaseClient = { from: fromSpy } as unknown as SupabaseClient<Database>;

    // Mock Deno.env.get
    const envMap = new Map<string, string>();
    envMap.set("STRIPE_SECRET_TEST_KEY", "sk_test_123");
    envMap.set("SUPABASE_URL", "http://supabase-url.com");
    envMap.set("SUPABASE_SERVICE_ROLE_KEY", "service_role_key");
    // STRIPE_TEST_MODE defaults to true if not set or not "false"
    denoEnvStub = stub(Deno.env, "get", (key) => envMap.get(key));

    // Mock Dependencies
    mockDeps = {
        createErrorResponse: spy((msg, status) => new Response(JSON.stringify({ error: msg, status }), { status, headers: { 'Content-Type': 'application/json' } })),
        createSuccessResponse: spy((body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })),
        stripeConstructor: spy(() => mockStripeClient), // Return our mock Stripe client
        createSupabaseClient: spy(() => mockSupabaseClient), // Return our mock Supabase client
    };
});

afterEach(() => {
    denoEnvStub.restore();
});

// --- Test Cases ---
describe("Sync Stripe Plans Handler", () => {

    it("should handle OPTIONS request", async () => {
        const req = new Request("http://localhost/sync-stripe-plans", { method: "OPTIONS" });
        const res = await handleSyncPlansRequest(req, mockDeps);
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("access-control-allow-methods"), "POST, OPTIONS");
        assertEquals(await res.text(), "ok");
    });

    it("should fetch prices, format, upsert, and deactivate correctly (Test Mode)", async () => {
        // Arrange
        const stripePrices = [
            mockStripePrice('price_active1', true, 'prod_A'),
            mockStripePrice('price_active2', true, 'prod_B', true, { subtitle: 'Custom Sub' }),
            mockStripePrice('price_inactive_ignored', false, 'prod_C'), // Inactive price ignored by fetch
            mockStripePrice('price_no_recur_ignored', true, 'prod_D', false), // Non-recurring ignored
        ];
        const dbPlans = [
            mockDbPlan('price_active1', 'prod_A', true), // Stays active
            mockDbPlan('price_to_deactivate', 'prod_X', true), // Should be deactivated
            mockDbPlan('price_already_inactive', 'prod_Y', false), // Already inactive, ignored
            mockDbPlan('price_FREE', 'prod_FREE', true), // Free plan, ignored
        ];
        mockStripeClient.prices.list = spy(() => Promise.resolve({ data: stripePrices, has_more: false }));
        selectSpy = spy(() => Promise.resolve({ data: dbPlans, error: null })); // Mock select for deactivation
        // Re-assign client with updated select spy
        fromSpy = spy((tableName: string) => {
            if (tableName === 'subscription_plans') return { upsert: upsertSpy, select: selectSpy, update: updateSpy };
            throw new Error('Unexpected table');
        });
        mockSupabaseClient = { from: fromSpy } as unknown as SupabaseClient<Database>;
        mockDeps.createSupabaseClient = spy(() => mockSupabaseClient); // Ensure deps return the latest mock

        const req = new Request("http://localhost/sync-stripe-plans", { method: "POST", body: JSON.stringify({ isTestMode: true }), headers: { 'Content-Type': 'application/json' } });

        // Act
        const res = await handleSyncPlansRequest(req, mockDeps);
        const body = await res.json();

        // Assert
        assertEquals(res.status, 200);
        assertEquals(body.message, "Stripe plans synced successfully.");
        assertEquals(body.syncedCount, 2); // price_active1, price_active2
        
        // Stripe fetch assertion
        assertSpyCalls(mockStripeClient.prices.list, 1);
        assertObjectMatch(mockStripeClient.prices.list.calls[0]!.args[0]!, { active: true, expand: ["data.product"], limit: 100 });

        // Supabase upsert assertion
        assertSpyCalls(upsertSpy, 1);
        const upsertArgs = upsertSpy.calls[0]!.args[0]! as any[];
        assertEquals(upsertArgs.length, 2);
        assertObjectMatch(upsertArgs[0], { stripe_price_id: 'price_active1', active: true, name: 'Product prod_A' });
        assertObjectMatch(upsertArgs[1], { stripe_price_id: 'price_active2', active: true, name: 'Product prod_B', description: { subtitle: 'Custom Sub', features: [] } });
        
        // Supabase select assertion (for deactivation)
        assertSpyCalls(selectSpy, 1);

        // Supabase update assertion (for deactivation)
        assertSpyCalls(updateSpy, 1); // Only called once for price_to_deactivate
        assertSpyCalls(eqSpy, 1);
        assertEquals(updateSpy.calls[0]!.args[0], { active: false }); // Correct payload
        assertEquals(eqSpy.calls[0]!.args, ['stripe_price_id', 'price_to_deactivate']); // Correct filter
    });

    // TODO: Add more tests:
    // - Live mode (using env var fallback)
    // - No prices returned from Stripe
    // - Error fetching from Stripe
    // - Error during upsert
    // - Error during select (for deactivation)
    // - Error during update (for deactivation)
    // - Case where no plans need deactivation
}); 