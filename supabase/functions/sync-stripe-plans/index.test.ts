import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleSyncPlansRequest, type SyncPlansHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type Stripe from "stripe";
import type { SupabaseClient, PostgrestResponse } from "@supabase/supabase-js";

// --- Mock Data ---
const mockStripePrice1 = { 
    id: "price_1", active: true, currency: 'usd', unit_amount: 1000, recurring: { interval: 'month', interval_count: 1 }, 
    product: { id: "prod_A", name: "Basic Plan", active: true }, metadata: { subtitle: 'Basic Sub' }
} as any;
const mockStripePrice2 = { 
    id: "price_2", active: true, currency: 'usd', unit_amount: 2500, recurring: { interval: 'month', interval_count: 1 },
    product: { id: "prod_B", name: "Pro Plan", active: true }, metadata: {}
} as any;
const mockStripePriceNonRecurring = { 
    id: "price_3", active: true, currency: 'usd', unit_amount: 500, recurring: null, // Non-recurring
    product: { id: "prod_C", name: "One Time", active: true }, metadata: {}
} as any;

const mockExistingPlanInDbActive = { id: 1, stripe_price_id: 'price_1', name: 'Basic Plan', active: true };
const mockExistingPlanInDbInactive = { id: 2, stripe_price_id: 'price_old', name: 'Old Plan', active: false }; // Already inactive
const mockExistingPlanInDbNeedsDeactivation = { id: 3, stripe_price_id: 'price_stale', name: 'Stale Plan', active: true }; // Should be deactivated
const mockExistingPlanFree = { id: 4, stripe_price_id: 'price_FREE', name: 'Free Plan', active: true }; // Should be ignored for deactivation

// --- Test Cases ---
Deno.test("Sync Stripe Plans Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<SyncPlansHandlerDeps> = {}): SyncPlansHandlerDeps & { mockUpdateSpy: any } => {
        // Default mocks for client methods
        const mockPricesList = spy(async (_params?): Promise<Stripe.ApiList<Stripe.Price>> => ({ data: [mockStripePrice1, mockStripePrice2, mockStripePriceNonRecurring], has_more: false, object: 'list', url: '' }));
        const mockStripeClient = { prices: { list: mockPricesList } };
        
        const mockSupabaseUpsertResponse: PostgrestResponse<any> = { data: [{}, {}], error: null, status: 200, count: 2, statusText: 'OK' };
        const mockSupabaseFetchResponse: PostgrestResponse<any> = { data: [mockExistingPlanInDbActive, mockExistingPlanInDbInactive, mockExistingPlanInDbNeedsDeactivation, mockExistingPlanFree], error: null, status: 200, count: 4, statusText: 'OK' };
        const mockSupabaseUpdateResponse: PostgrestResponse<any> = { data: [{}], error: null, status: 200, count: 1, statusText: 'OK' };
        
        const mockUpsert = spy(() => Promise.resolve(mockSupabaseUpsertResponse));
        const mockSelect = spy(() => Promise.resolve(mockSupabaseFetchResponse));
        const mockUpdate = spy(() => Promise.resolve(mockSupabaseUpdateResponse));
        const mockEqUpdate = spy(() => mockUpdate()); 
        const mockUpdateChain = spy(() => ({ eq: mockEqUpdate })); 

        const mockFrom = spy((_table: string) => ({ 
            upsert: mockUpsert,
            select: mockSelect,
            update: mockUpdateChain, 
        }));
        const mockSupabaseAdminClient = { from: mockFrom };
        
        return {
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            stripeConstructor: spy((key, config) => mockStripeClient as any), 
            createSupabaseClient: spy(() => mockSupabaseAdminClient as any), 
            ...overrides,
            mockUpdateSpy: mockUpdate 
        };
    };
    
    // Stub Deno.env.get for all tests
    let envStub: any = null; // Initialize to null
    const setupEnvStub = (envVars: Record<string, string | undefined>) => {
        // Restore the previous stub if it exists before creating a new one
        if (envStub) {
            envStub.restore();
            envStub = null; // Clear the reference
        }
        envStub = stub(Deno.env, "get", (key: string): string | undefined => envVars[key]);
    };
    const defaultEnv = {
        "STRIPE_TEST_MODE": "true",
        "STRIPE_SECRET_TEST_KEY": "sk_test_123",
        "SUPABASE_URL": "http://localhost:54321",
        "SUPABASE_SERVICE_ROLE_KEY": "service_role_abc"
    };

    // --- Actual Tests --- 
    try {
        await t.step("OPTIONS request should return OK with CORS headers", async () => {
            setupEnvStub({}); // No env vars needed for OPTIONS
            const req = new Request('http://example.com/sync-plans', { method: 'OPTIONS' });
            const res = await handleSyncPlansRequest(req, createMockDeps()); // Pass dummy deps
            assertEquals(res.status, 200);
            assertEquals(res.headers.get('access-control-allow-origin'), '*'); // Check a CORS header
            assertEquals(await res.text(), 'ok');
        });

        await t.step("Mode determination: uses request body when present (true)", async () => {
            setupEnvStub({...defaultEnv, "STRIPE_TEST_MODE": "false"}); // Env says false
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/sync-plans', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ isTestMode: true }) // Body says true
            });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertSpyCall(mockDeps.stripeConstructor, 0); // Check it was called
            const constructorArgs = mockDeps.stripeConstructor.calls[0].args;
            assertEquals(constructorArgs[0], defaultEnv.STRIPE_SECRET_TEST_KEY);
            assertEquals(constructorArgs[1]?.apiVersion, "2024-04-10");
        });

        await t.step("Mode determination: uses request body when present (false)", async () => {
            setupEnvStub({...defaultEnv, "STRIPE_TEST_MODE": "true"}); // Env says true
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/sync-plans', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ isTestMode: false }) // Body says false
            });
            setupEnvStub({...defaultEnv, "STRIPE_SECRET_LIVE_KEY": "sk_live_456", "STRIPE_TEST_MODE": "true" }); 
            const res = await handleSyncPlansRequest(req, mockDeps); 
            
            assertSpyCall(mockDeps.stripeConstructor, 0); 
            const constructorArgs = mockDeps.stripeConstructor.calls[0].args;
            assertEquals(constructorArgs[0], "sk_live_456");
            assertEquals(constructorArgs[1]?.apiVersion, "2024-04-10");
        });
        
        await t.step("Mode determination: uses env var (false) when body missing/invalid", async () => {
             setupEnvStub({...defaultEnv, "STRIPE_TEST_MODE": "false", "STRIPE_SECRET_LIVE_KEY": "sk_live_456" }); // Env says false
             const mockDeps = createMockDeps();
             // Test with no body
             const req1 = new Request('http://example.com/sync-plans', { method: 'POST' });
             const res1 = await handleSyncPlansRequest(req1, mockDeps);
             assertSpyCall(mockDeps.stripeConstructor, 0); 
             let constructorArgs = mockDeps.stripeConstructor.calls[0].args;
             assertEquals(constructorArgs[0], "sk_live_456");
             assertEquals(constructorArgs[1]?.apiVersion, "2024-04-10");
             // Test with invalid body
              const req2 = new Request('http://example.com/sync-plans', { method: 'POST', headers:{ 'Content-Type': 'application/json' }, body: '{'});
             const res2 = await handleSyncPlansRequest(req2, mockDeps);
             assertSpyCall(mockDeps.stripeConstructor, 1);
             constructorArgs = mockDeps.stripeConstructor.calls[1].args;
             assertEquals(constructorArgs[0], "sk_live_456");
             assertEquals(constructorArgs[1]?.apiVersion, "2024-04-10");
        });

         await t.step("Mode determination: defaults to test mode if env var not 'false'", async () => {
             const mockDeps = createMockDeps();
             // Test with env=true
             setupEnvStub({...defaultEnv, "STRIPE_TEST_MODE": "true" });
             const req1 = new Request('http://example.com/sync-plans', { method: 'POST' });
             const res1 = await handleSyncPlansRequest(req1, mockDeps);
             assertSpyCall(mockDeps.stripeConstructor, 0);
             let constructorArgs = mockDeps.stripeConstructor.calls[0].args;
             assertEquals(constructorArgs[0], defaultEnv.STRIPE_SECRET_TEST_KEY);
             assertEquals(constructorArgs[1]?.apiVersion, "2024-04-10");
             // Test with env=undefined
              setupEnvStub({...defaultEnv, "STRIPE_TEST_MODE": undefined });
              const req2 = new Request('http://example.com/sync-plans', { method: 'POST' });
             const res2 = await handleSyncPlansRequest(req2, mockDeps);
             assertSpyCall(mockDeps.stripeConstructor, 1);
             constructorArgs = mockDeps.stripeConstructor.calls[1].args;
             assertEquals(constructorArgs[0], defaultEnv.STRIPE_SECRET_TEST_KEY);
             assertEquals(constructorArgs[1]?.apiVersion, "2024-04-10");
        });

        await t.step("Missing Stripe test key should return 500", async () => {
            setupEnvStub({...defaultEnv, "STRIPE_SECRET_TEST_KEY": undefined, "STRIPE_TEST_MODE": "true" });
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Stripe test secret key is not configured.", 500] });
        });
        
         await t.step("Missing Stripe live key should return 500", async () => {
            setupEnvStub({...defaultEnv, "STRIPE_SECRET_LIVE_KEY": undefined, "STRIPE_TEST_MODE": "false" });
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Stripe live secret key is not configured.", 500] });
        });

        await t.step("Missing Supabase service key should return 500", async () => {
            setupEnvStub({...defaultEnv, "SUPABASE_SERVICE_ROLE_KEY": undefined });
            const mockDeps = createMockDeps();
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Supabase connection details missing.", 500] });
        });

        // --- Full Success Path --- 
        await t.step("Successful sync: fetches, upserts, deactivates", async () => {
            setupEnvStub(defaultEnv); 
            const mockDeps = createMockDeps(); 
            const { mockUpdateSpy } = mockDeps;
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.message, "Stripe plans synced successfully.");
            assertEquals(body.syncedCount, 2); // Only recurring prices (price_1, price_2)

            const stripeClient = mockDeps.stripeConstructor();
            const sbClient = mockDeps.createSupabaseClient();

            // 1. Stripe Fetch
            assertSpyCall(stripeClient.prices.list, 0);
            // 2. Supabase Upsert
            assertSpyCall(sbClient.from, 0, { args: ['subscription_plans'] });
            assertSpyCall(sbClient.from().upsert, 0);
            const upsertArgs = sbClient.from().upsert.calls[0].args[0];
            assertEquals(upsertArgs.length, 2); // Check only recurring plans were mapped
            assertEquals(upsertArgs[0].stripe_price_id, 'price_1');
            assertEquals(upsertArgs[1].stripe_price_id, 'price_2');
            assertEquals(upsertArgs[0].description.subtitle, 'Basic Sub'); // Check metadata subtitle
            assertEquals(upsertArgs[1].description.subtitle, 'Pro Plan'); // Check default subtitle
            
            // 3. Supabase Fetch Existing
            assertSpyCall(sbClient.from, 1, { args: ['subscription_plans'] }); 
            assertSpyCall(sbClient.from().select, 0); 
            
            // 4. Supabase Deactivate Update (Loop)
            const updateChainSpy = sbClient.from().update;
            const eqSpy = updateChainSpy().eq;
            
            assertSpyCall(sbClient.from, 2, { args: ['subscription_plans'] }); 
            assertSpyCall(updateChainSpy, 0); 
            assertSpyCall(eqSpy, 0, { args: ['stripe_price_id', 'price_stale'] }); 
            assertSpyCall(mockUpdateSpy, 0); 
            
            assertSpyCall(mockDeps.createSuccessResponse, 0);
        });

        // --- Failure Cases ---
        await t.step("Stripe prices.list fails", async () => {
            setupEnvStub(defaultEnv);
            const listError = new Error("Stripe API error");
            const mockPricesListError = spy(() => Promise.reject(listError));
            const mockStripeClient = { prices: { list: mockPricesListError } };
            const mockDeps = createMockDeps({ stripeConstructor: spy((key, config) => mockStripeClient as any) });
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [listError.message, 500] });
        });

        await t.step("Supabase upsert fails", async () => {
            setupEnvStub(defaultEnv);
            const upsertError = { message: 'DB constraint failed', code: '23505' };
            const mockUpsertError = spy(() => Promise.resolve({ error: upsertError, data: null, status: 409, count: 0, statusText: 'Conflict' }));
            const mockFrom = spy(() => ({ upsert: mockUpsertError }));
            const mockSupabaseClient = { from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockSupabaseClient as any) });
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [`Supabase upsert failed: ${upsertError.message}`, 500] });
        });

        await t.step("Deactivation: Fetch existing fails (should log warn, return success)", async () => {
            setupEnvStub(defaultEnv);
            const fetchError = { message: 'Permission denied', code: '42501' };
            const mockSelectError = spy(() => Promise.resolve({ error: fetchError, data: null, status: 401, count: 0, statusText: 'Unauthorized' }));
            const mockFrom = spy((table: string) => table === 'subscription_plans' ? ({ upsert: spy(()=> Promise.resolve({data:[{},{}], error:null, count:2})), select: mockSelectError }) : ({}));
            const mockSupabaseClient = { from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockSupabaseClient as any) });
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 200); // Still succeeds overall
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCall(mockSelectError, 0); // Verify fetch was attempted
            // Could also check console.warn was called if mockable
        });

        await t.step("Deactivation: Update fails (should log error, return success)", async () => {
            setupEnvStub(defaultEnv);
            const updateError = { message: 'Update failed', code: 'xxxxx' };
            const mockUpdateError = spy(() => Promise.resolve({ error: updateError, data: null, status: 500, count: 0, statusText: 'Error' }));
            const mockEqUpdateError = spy(() => mockUpdateError());
            const mockUpdateChainError = spy(() => ({ eq: mockEqUpdateError }));

            const mockFrom = spy((table: string) => table === 'subscription_plans' ? ({
                 upsert: spy(()=> Promise.resolve({data:[{},{}], error:null, count:2})), 
                 select: spy(() => Promise.resolve( { data: [mockExistingPlanInDbActive, mockExistingPlanInDbNeedsDeactivation], error: null, count: 2})), 
                 update: mockUpdateChainError, 
            }) : ({}));
             const mockSupabaseClient = { from: mockFrom };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockSupabaseClient as any) });
            const req = new Request('http://example.com/sync-plans', { method: 'POST' });
            const res = await handleSyncPlansRequest(req, mockDeps);
            assertEquals(res.status, 200); // Still succeeds overall
            assertSpyCall(mockDeps.createSuccessResponse, 0);
            assertSpyCall(mockUpdateError, 0); 
        });
        
        await t.step("No recurring plans from Stripe: should succeed early", async () => {
             setupEnvStub(defaultEnv); 
             const mockPricesListEmpty = spy(async (): Promise<Stripe.ApiList<Stripe.Price>> => ({ data: [mockStripePriceNonRecurring], has_more: false, object: 'list', url: '' })); // Only non-recurring
             const mockStripeClient = { prices: { list: mockPricesListEmpty } };
             const mockDeps = createMockDeps({ stripeConstructor: spy((key, config) => mockStripeClient as any) });
             const req = new Request('http://example.com/sync-plans', { method: 'POST' });
             const res = await handleSyncPlansRequest(req, mockDeps);

             assertEquals(res.status, 200);
             const body = await res.json();
             assertEquals(body.message, "No recurring plans found.");
             assertEquals(body.syncedCount, 0);
             assertSpyCall(mockPricesListEmpty, 0); 
             // Ensure Supabase upsert/select/update were NOT called
             const sbClient = mockDeps.createSupabaseClient();
             assertSpyCalls(sbClient.from().upsert, 0);
             assertSpyCalls(sbClient.from().select, 0);
             assertSpyCalls(sbClient.from().update, 0);
        });

    } finally {
        // Ensure the very last stub is also restored
        if (envStub) envStub.restore(); 
    }
}); 