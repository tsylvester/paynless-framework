import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { assertSpyCalls, spy, Spy, assertSpyCall } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from "npm:stripe";
import { handleCheckoutSessionCompleted } from "./checkout-session.ts";
import { TablesInsert, TablesUpdate } from "../../types_db.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;
let mockFromSpy: Spy;

// Stripe Spies
let stripeRetrieveSubSpy: Spy;

// Transaction Spies
let txMaybeSingleSpy: Spy;
let txUpsertSpy: Spy;
let txUpdatePromiseSpy: Spy; // The final promise after update().eq()

// User Subscription Spies
let subMaybeSingleSpy: Spy;
let subSelectSpy: Spy;
let subUpdateSpy: Spy;
let subEqSpy: Spy;

// Transaction Chain Parts (defined inside beforeEach)
let txEqForSelect: Spy;
let txSelect: Spy;
let txEqForUpdate: Spy;
let txUpdate: Spy;

// Subscription Plans Chain Parts (defined inside beforeEach)
let planEqForSelect: Spy;
let planSelect: Spy;
let planMaybeSingleSpy: Spy;

// New dedicated spy for the upsert call itself
let mockUpsertSpy: Spy;

const MOCK_EVENT_ID = "evt_mock_checkout_completed";
const MOCK_EVENT_TYPE = "checkout.session.completed";
const MOCK_USER_ID = "user_mock_123";
const MOCK_STRIPE_CUSTOMER_ID = "cus_mock_abc";
const MOCK_STRIPE_SUBSCRIPTION_ID = "sub_mock_xyz";
const MOCK_STRIPE_PRICE_ID = "price_mock_12345";
const MOCK_DB_PLAN_ID = "plan_uuid_67890";
const MOCK_UPSERTED_SUB_ID = "upserted-sub-uuid-abcd";

const createMockSession = (overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session => ({
  id: "cs_mock_test",
  object: "checkout.session",
  client_reference_id: MOCK_USER_ID,
  customer: MOCK_STRIPE_CUSTOMER_ID,
  subscription: MOCK_STRIPE_SUBSCRIPTION_ID,
  mode: "subscription",
  status: "complete",
  // Add other necessary fields as needed, mocking them as required by the handler
  livemode: false,
  payment_status: "paid",
  currency: "usd",
  amount_total: 1000,
  created: Math.floor(Date.now() / 1000),
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  // ... other fields can be added as needed, ensure type compatibility 
  ...overrides,
} as Stripe.Checkout.Session); 

// Helper to create a mock Supabase client
const createMockSupabaseClient = (): SupabaseClient => {
  return {
    from: spy(() => ({
      select: spy(() => ({
        eq: spy(() => Promise.resolve({ data: null, error: null })), // Default no existing transaction
      })),
      upsert: spy(() => Promise.resolve({ error: null })), // Default successful upsert
      update: spy(() => Promise.resolve({ data: { id: 'sub-id' }, error: null })), // Default successful update
    })),
  } as unknown as SupabaseClient; // Cast to the imported type
};

// --- Test Suite ---
describe("handleCheckoutSessionCompleted Handler", () => {

  // Spies for FINAL results (can be overridden in tests)
  let txMaybeSingleSpy: Spy;
  let txUpsertSpy: Spy;
  let txUpdatePromiseSpy: Spy;
  let subMaybeSingleSpy: Spy;
  let subUpsertSelectMaybeSingleSpy: Spy;

  // Other mocks needed across tests
  let mockSupabaseClient: SupabaseClient;
  let mockStripeInstance: Stripe;
  let mockFromSpy: Spy; // The main from spy

  beforeEach(() => {
    // --- Reset FINAL result spies (Promises/leaf nodes) ---
    txMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // No existing tx
    txUpsertSpy = spy(() => Promise.resolve({ error: null })); // Tx processing upsert succeeds
    txUpdatePromiseSpy = spy(() => Promise.resolve({ error: null })); // Tx final update succeeds
    subUpsertSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { id: MOCK_UPSERTED_SUB_ID }, error: null })); // Sub upsert succeeds and returns ID
    planMaybeSingleSpy = spy(() => Promise.resolve({ data: { id: MOCK_DB_PLAN_ID }, error: null })); // Plan lookup succeeds
    stripeRetrieveSubSpy = spy(() => Promise.resolve({ // Stripe retrieve succeeds
      id: MOCK_STRIPE_SUBSCRIPTION_ID,
      items: { data: [{ price: { id: MOCK_STRIPE_PRICE_ID } }] },
      status: "active",
      current_period_start: 1678886400, // Example timestamp (seconds)
      current_period_end: 1681564800,   // Example timestamp (seconds)
      cancel_at_period_end: false,
    } as unknown as Stripe.Subscription));

    // --- Define ALL chain structure spies INSIDE beforeEach ---
    // Transaction Chain
    txEqForSelect = spy(() => ({ maybeSingle: txMaybeSingleSpy }));
    txSelect = spy(() => ({ eq: txEqForSelect }));
    txEqForUpdate = spy(() => txUpdatePromiseSpy()); // Returns promise
    txUpdate = spy(() => ({ eq: txEqForUpdate }));

    // Subscription Plans Chain
    planEqForSelect = spy(() => ({ maybeSingle: planMaybeSingleSpy }));
    planSelect = spy(() => ({ eq: planEqForSelect }));

    // User Subscriptions Chain (Upsert part)
    // The upsert spy itself returns the object that has .select().maybeSingle()
    mockUpsertSpy = spy(() => ({
        select: () => ({ maybeSingle: subUpsertSelectMaybeSingleSpy })
    }));

    // --- Define main 'from' spy ---
    mockFromSpy = spy((tableName: string) => {
      if (tableName === "subscription_transactions") {
        return { select: txSelect, upsert: txUpsertSpy, update: txUpdate };
      }
      if (tableName === "subscription_plans") {
        return { select: planSelect }; // Only select needed for plans
      }
      if (tableName === "user_subscriptions") {
         // The actual handler only uses UPSERT for checkout.session.completed
         // No need for the old `update` path mock here anymore.
         return {
             upsert: mockUpsertSpy // Assign the dedicated spy for upsert path
         };
      }
      throw new Error(`Unexpected table access in mock: ${tableName}`);
    });

    // Setup clients
    mockSupabaseClient = { from: mockFromSpy } as unknown as SupabaseClient;
    // Setup Stripe client with the retrieve subscription spy
    mockStripeInstance = { subscriptions: { retrieve: stripeRetrieveSubSpy } } as unknown as Stripe;
  });

  // --- Test Cases ---
  // Tests remain the same - they only override the final result spies
  // (txMaybeSingleSpy, subMaybeSingleSpy, txUpdatePromiseSpy)

  it("should throw error if client_reference_id (userId) is missing", async () => {
    const session = createMockSession({ client_reference_id: null });
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        "Missing client_reference_id (userId)"
    );
    assertSpyCalls(mockFromSpy, 0);
  });

  it("should throw error if subscription ID is missing for subscription mode", async () => {
    const session = createMockSession({ subscription: null, mode: "subscription" });
     await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        "Missing subscription ID"
    );
    assertSpyCalls(mockFromSpy, 0);
  });
  
  it("should complete transaction log successfully if subscription ID is missing for non-subscription mode", async () => {
    // Uses default mocks from beforeEach
    const session = createMockSession({ subscription: null, mode: "payment" }); 
    let error: Error | null = null;

    try {
      await handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }

    assertEquals(error, null);
    // Verify transaction log flow: Select -> Upsert -> Final Update (Success)
    assertSpyCalls(mockFromSpy, 3); 
    assertSpyCalls(txMaybeSingleSpy, 1); // Initial check
    assertSpyCalls(txUpsertSpy, 1); // Processing upsert
    assertSpyCalls(txUpdatePromiseSpy, 1); // Final update
    assertSpyCalls(subMaybeSingleSpy!, 0); 
  });

  it("should throw error if customer ID is missing when subscription ID is present", async () => {
    const session = createMockSession({ customer: null });
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        "Missing customer ID"
    );
    assertSpyCalls(mockFromSpy, 0);
  });

  it("should return early if event already succeeded", async () => {
    // Override ONLY the leaf spy for the initial transaction check
    txMaybeSingleSpy = spy(() => Promise.resolve({ data: { status: 'succeeded' }, error: null }));
    
    const session = createMockSession();
    let error: Error | null = null;
    try {
        await handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE);
    } catch(e) { error = e instanceof Error ? e : new Error(String(e)); }

    assertEquals(error, null); 
    // Verify initial check + final update (because finally always runs)
    assertSpyCalls(mockFromSpy, 2); // Once for initial check, once for final update
    assertSpyCalls(txMaybeSingleSpy, 1); // Initial check called
    assertSpyCalls(txUpsertSpy, 0); // Upsert skipped
    assertSpyCalls(subMaybeSingleSpy!, 0); // Sub update skipped
    // CORRECTED Assertion: Final update IS called in finally block
    assertSpyCalls(txUpdatePromiseSpy, 1); 
  });

  it("should upsert transaction, retrieve stripe sub, find plan, upsert subscription, and mark transaction succeeded on full success", async () => {
    // Uses default mocks from beforeEach
    const session = createMockSession();
    const expectedPeriodStartISO = new Date(1678886400 * 1000).toISOString();
    const expectedPeriodEndISO = new Date(1681564800 * 1000).toISOString();
    
    let error: Error | null = null;
    try {
        await handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE);
    } catch(e) { error = e instanceof Error ? e : new Error(String(e)); }

    assertEquals(error, null);

    // Verify Full Flow Calls
    assertSpyCalls(stripeRetrieveSubSpy, 1); // Stripe retrieve called
    assertSpyCall(stripeRetrieveSubSpy, 0, { args: [MOCK_STRIPE_SUBSCRIPTION_ID, { expand: ['items.data.price.product'] }] });

    assertSpyCalls(mockFromSpy, 5); // tx.select, tx.upsert, plan.select, sub.upsert, tx.update
    assertSpyCalls(txMaybeSingleSpy, 1); // Initial tx check
    assertSpyCalls(txUpsertSpy, 1); // Tx processing upsert
    assertSpyCalls(planMaybeSingleSpy, 1); // Plan lookup
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 1); // Subscription upsert
    assertSpyCalls(txUpdatePromiseSpy, 1); // Final tx update

    // --- Verify Plan Lookup Args ---
    assertSpyCall(planSelect, 0, { args: ['id'] });
    assertSpyCall(planEqForSelect, 0, { args: ['stripe_price_id', MOCK_STRIPE_PRICE_ID] });

    // --- Verify User Subscription Upsert Args ---
    assertSpyCall(mockUpsertSpy, 0); // Verify upsert was called
    const upsertArgs = mockUpsertSpy.calls[0].args;
    const upsertData = upsertArgs[0] as TablesUpdate<"user_subscriptions">;
    const upsertOptions = upsertArgs[1];

    assertEquals(upsertData.user_id, MOCK_USER_ID, "Upsert: user_id");
    assertEquals(upsertData.status, "active", "Upsert: status from Stripe");
    assertEquals(upsertData.stripe_customer_id, MOCK_STRIPE_CUSTOMER_ID, "Upsert: customerId");
    assertEquals(upsertData.stripe_subscription_id, MOCK_STRIPE_SUBSCRIPTION_ID, "Upsert: subscriptionId");
    assertEquals(upsertData.plan_id, MOCK_DB_PLAN_ID, "Upsert: plan_id");
    assertEquals(upsertData.current_period_start, expectedPeriodStartISO, "Upsert: period start");
    assertEquals(upsertData.current_period_end, expectedPeriodEndISO, "Upsert: period end");
    assertEquals(upsertData.cancel_at_period_end, false, "Upsert: cancel_at_period_end");
    assertEquals(upsertOptions?.onConflict, 'user_id', "Upsert: onConflict option");

    // --- Verify Final Transaction Update Args ---
    assertSpyCall(txUpdate, 0); 
    const finalUpdateArgs = txUpdate.calls[0].args[0] as TablesUpdate<"subscription_transactions">;
    assertEquals(finalUpdateArgs.status, 'succeeded', "Final Tx Update: status");
    assertEquals(finalUpdateArgs.user_subscription_id, MOCK_UPSERTED_SUB_ID, "Final Tx Update: user_subscription_id link");
    assertSpyCall(txEqForUpdate, 0, { args: ['stripe_event_id', MOCK_EVENT_ID] });
  });

  // --- Failure Path Tests ---

  it("should mark transaction as failed if Stripe subscription retrieve fails", async () => {
    const retrieveError = new Error("Stripe API Error");
    stripeRetrieveSubSpy = spy(() => Promise.reject(retrieveError)); // Override Stripe mock
    mockStripeInstance = { subscriptions: { retrieve: stripeRetrieveSubSpy } } as unknown as Stripe;

    const session = createMockSession();
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        retrieveError.message // Check the original error is thrown
    );

    // Verify Tx Flow: Select -> Upsert Processing -> (Stripe Fails) -> Final Update (Failed)
    assertSpyCalls(mockFromSpy, 3); // tx.select, tx.upsert, tx.update
    assertSpyCalls(txMaybeSingleSpy, 1);
    assertSpyCalls(txUpsertSpy, 1);
    assertSpyCalls(stripeRetrieveSubSpy, 1); // Stripe retrieve was called
    assertSpyCalls(planMaybeSingleSpy, 0); // Plan lookup skipped
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 0); // Sub upsert skipped
    assertSpyCalls(txUpdatePromiseSpy, 1); // Final tx update called

    // Verify Final Transaction Update Args
    assertSpyCall(txUpdate, 0);
    const finalUpdateArgs = txUpdate.calls[0].args[0] as TablesUpdate<"subscription_transactions">;
    assertEquals(finalUpdateArgs.status, 'failed', "Final Tx Update should be 'failed' on Stripe error");
    assertEquals(finalUpdateArgs.user_subscription_id, null, "Final Tx Update should have null user_subscription_id on Stripe error");
    assertSpyCall(txEqForUpdate, 0, { args: ['stripe_event_id', MOCK_EVENT_ID] });
  });

  it("should mark transaction as failed if plan lookup throws DB error", async () => {
    const dbError = { message: "DB connection failed", code: "500" };
    planMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: dbError })); // Override Plan mock

    const session = createMockSession();
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        `Database error fetching plan ID for stripe_price_id ${MOCK_STRIPE_PRICE_ID}: ${dbError.message}`
    );

    // Verify Tx Flow: Select -> Upsert Proc -> Stripe OK -> Plan Lookup Fails -> Final Update (Failed)
    assertSpyCalls(mockFromSpy, 4); // tx.select, tx.upsert, plan.select, tx.update
    assertSpyCalls(stripeRetrieveSubSpy, 1);
    assertSpyCalls(planMaybeSingleSpy, 1);
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 0);
    assertSpyCalls(txUpdatePromiseSpy, 1); 

    // Verify Final Transaction Update Args
    assertSpyCall(txUpdate, 0);
    const finalUpdateArgs = txUpdate.calls[0].args[0] as TablesUpdate<"subscription_transactions">;
    assertEquals(finalUpdateArgs.status, 'failed', "Final Tx Update should be 'failed' on plan DB error");
    assertEquals(finalUpdateArgs.user_subscription_id, null, "Final Tx Update should have null user_subscription_id on plan DB error");
    assertSpyCall(txEqForUpdate, 0, { args: ['stripe_event_id', MOCK_EVENT_ID] });
  });

  it("should mark transaction as failed if plan lookup finds no plan", async () => {
    planMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Override Plan mock - not found

    const session = createMockSession();
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        `Subscription plan with stripe_price_id ${MOCK_STRIPE_PRICE_ID} not found.`
    );

    // Verify Tx Flow: Select -> Upsert Proc -> Stripe OK -> Plan Lookup Not Found -> Final Update (Failed)
    assertSpyCalls(mockFromSpy, 4); // tx.select, tx.upsert, plan.select, tx.update
    assertSpyCalls(stripeRetrieveSubSpy, 1);
    assertSpyCalls(planMaybeSingleSpy, 1);
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 0);
    assertSpyCalls(txUpdatePromiseSpy, 1); 

    // Verify Final Transaction Update Args
    assertSpyCall(txUpdate, 0);
    const finalUpdateArgs = txUpdate.calls[0].args[0] as TablesUpdate<"subscription_transactions">;
    assertEquals(finalUpdateArgs.status, 'failed', "Final Tx Update should be 'failed' on plan not found");
    assertEquals(finalUpdateArgs.user_subscription_id, null, "Final Tx Update should have null user_subscription_id on plan not found");
    assertSpyCall(txEqForUpdate, 0, { args: ['stripe_event_id', MOCK_EVENT_ID] });
  });

  it("should mark transaction as failed if subscription upsert fails", async () => {
    const subUpsertError = { message: "Constraint violation", code: "23505" };
    // Override the leaf spy for the sub upsert
    subUpsertSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: subUpsertError }));

    const session = createMockSession();
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        `Failed to upsert subscription status: ${subUpsertError.message}`
    );

    // Verify Tx Flow: Select -> Upsert Proc -> Stripe OK -> Plan OK -> Sub Upsert Fails -> Final Update (Failed)
    assertSpyCalls(mockFromSpy, 5); // tx.select, tx.upsert, plan.select, sub.upsert, tx.update
    assertSpyCalls(stripeRetrieveSubSpy, 1);
    assertSpyCalls(planMaybeSingleSpy, 1);
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 1);
    assertSpyCalls(txUpdatePromiseSpy, 1); 

    // Verify Final Transaction Update Args
    assertSpyCall(txUpdate, 0);
    const finalUpdateArgs = txUpdate.calls[0].args[0] as TablesUpdate<"subscription_transactions">;
    assertEquals(finalUpdateArgs.status, 'failed', "Final Tx Update should be 'failed' on sub upsert error");
    assertEquals(finalUpdateArgs.user_subscription_id, null, "Final Tx Update should have null user_subscription_id on sub upsert error");
    assertSpyCall(txEqForUpdate, 0, { args: ['stripe_event_id', MOCK_EVENT_ID] });
  });

  it("should mark transaction as failed if subscription upsert returns no ID", async () => {
    // Override the leaf spy for the sub upsert to return data without an id
    subUpsertSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: {}, error: null }));

    const session = createMockSession();
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        `Failed to retrieve ID after upserting user subscription for user ${MOCK_USER_ID}.`
    );

    // Verify Tx Flow: Select -> Upsert Proc -> Stripe OK -> Plan OK -> Sub Upsert No ID -> Final Update (Failed)
    assertSpyCalls(mockFromSpy, 5); // tx.select, tx.upsert, plan.select, sub.upsert, tx.update
    assertSpyCalls(stripeRetrieveSubSpy, 1);
    assertSpyCalls(planMaybeSingleSpy, 1);
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 1);
    assertSpyCalls(txUpdatePromiseSpy, 1);

    // Verify Final Transaction Update Args
    assertSpyCall(txUpdate, 0);
    const finalUpdateArgs = txUpdate.calls[0].args[0] as TablesUpdate<"subscription_transactions">;
    assertEquals(finalUpdateArgs.status, 'failed', "Final Tx Update should be 'failed' when sub upsert returns no ID");
    assertEquals(finalUpdateArgs.user_subscription_id, null, "Final Tx Update should have null user_subscription_id when sub upsert returns no ID");
    assertSpyCall(txEqForUpdate, 0, { args: ['stripe_event_id', MOCK_EVENT_ID] });
  });

  it("should throw original error and log CRITICAL if final transaction update fails", async () => {
    const subUpsertError = new Error("Original Sub Upsert Failed");
    subUpsertSelectMaybeSingleSpy = spy(() => Promise.reject(subUpsertError));

    const finalUpdateError = new Error("Failed to update tx log");
    txUpdatePromiseSpy = spy(() => Promise.reject(finalUpdateError));

    const session = createMockSession();
    await assertRejects(
        () => handleCheckoutSessionCompleted(mockSupabaseClient, mockStripeInstance, session, MOCK_EVENT_ID, MOCK_EVENT_TYPE),
        Error,
        subUpsertError.message // Should throw the *original* error
    );

    // Verify Full Flow until final update
    assertSpyCalls(mockFromSpy, 5);
    assertSpyCalls(stripeRetrieveSubSpy, 1);
    assertSpyCalls(planMaybeSingleSpy, 1);
    assertSpyCalls(subUpsertSelectMaybeSingleSpy, 1); 
    assertSpyCalls(txUpdatePromiseSpy, 1); // Final update was attempted
  });

}); 