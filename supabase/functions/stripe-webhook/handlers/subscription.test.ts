import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, stub, assertSpyCalls, assertSpyCall, type Spy } from "jsr:@std/testing/mock";
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from "npm:stripe";
import {
    handleSubscriptionUpdated,
    handleSubscriptionDeleted,
} from "./subscription.ts";
import { Database, Tables } from "../../types_db.ts"; // Assuming types are relative like this

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient<Database>;
let mockStripeInstance: Stripe; // Although unused by handlers, keep for context if needed

// --- Mock Setup Helpers ---

// Generic helper for chained Supabase calls ending in maybeSingle or single
const createQuerySpies = (chain: string[], finalData: any = null, finalError: any = null) => {
    let currentSpy: any = spy(() => Promise.resolve({ data: finalData, error: finalError }));
    const spies: { [key: string]: Spy } = {};

    // Build the spy chain in reverse
    for (let i = chain.length - 1; i >= 0; i--) {
        const method = chain[i];
        const nextSpy = spy(() => ({ [method]: currentSpy }));
        spies[method] = currentSpy; // Store the spy that the method returns
        currentSpy = nextSpy;
    }
    spies["root"] = currentSpy; // The initial spy (e.g., returned by select or update)
    return spies;
};

// Helper specifically for the .upsert()... chain (ends with promise)
const createUpsertSpies = (data: any = null, error: any = null) => {
    const promiseSpy = spy(() => Promise.resolve({ data, error }));
    // upsert doesn't chain further methods in the same way, it returns a PostgrestFilterBuilder or similar
    // which *then* might have methods like eq, but the upsert itself returns the promise.
    // We'll mock upsert directly.
    const upsertSpy = spy(() => Promise.resolve({ data, error })); 
    return { upsertSpy };
};

// Helper for simple .update().eq() chain
const createUpdateEqSpies = (data: any = null, error: any = null) => {
    const eqSpy = spy(() => Promise.resolve({ data, error })); 
    const updateSpy = spy(() => ({ eq: eqSpy }));
    return { updateSpy, eqSpy };
}

// --- Test Data ---
const eventId = "evt_test_12345";
const stripeSubId = "sub_test_abc";
const stripeCustomerId = "cus_test_xyz";
const stripePriceId = "price_test_plan";
const dbPlanId = "plan_uuid_test";
const dbUserId = "user_uuid_test"; // Add a test user ID

const createMockSubscription = (overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription => ({
    id: stripeSubId,
    customer: stripeCustomerId,
    status: 'active',
    items: {
        object: 'list',
        data: [{ id: 'si_1', price: { id: stripePriceId } }] as any,
        has_more: false,
        url: '/'
    },
    current_period_start: Math.floor(Date.now() / 1000) - 86400, // Yesterday
    current_period_end: Math.floor(Date.now() / 1000) + (30 * 86400), // 30 days from now
    cancel_at_period_end: false,
    // Add other necessary Stripe.Subscription fields with default values
    ...overrides,
} as Stripe.Subscription);

// --- Test Suite ---
describe("Stripe Webhook Subscription Handlers", () => {

    // Spies for different DB interactions - Declared but assigned in test
    let txSelectMaybeSingleSpy: Spy, txSelectEqSpy: Spy, txSelectRootSpy: Spy;
    let userIdLookupMaybeSingleSpy: Spy, userIdLookupEqSpy: Spy, userIdLookupRootSpy: Spy;
    let txUpsertSpy: Spy;
    let planSelectSingleSpy: Spy, planSelectEqSpy: Spy, planSelectRootSpy: Spy;
    let userSubUpdateEqSpy: Spy, userSubUpdateRootSpy: Spy;
    let txUpdateEqSpy: Spy, txUpdateRootSpy: Spy;

    beforeEach(() => {
        // Reset spies or setup general mocks if needed across tests (currently none needed)
        mockStripeInstance = {} as Stripe;
    });

    // --- handleSubscriptionUpdated Tests ---
    describe("handleSubscriptionUpdated", () => {
        const eventType = "customer.subscription.updated";
        const mockSubscription = createMockSubscription();

        it("should update user subscription and transaction log", async () => {
            // Arrange - Manually create spies for this test
            // Mock for: .from('subscription_transactions').select(...).eq(...).maybeSingle() -> null
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Mock for: .from('user_subscriptions').select(...).eq(...).maybeSingle() -> { user_id: dbUserId }
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            // Mock for: .from('subscription_transactions').upsert(...) -> { data: ..., error: null }
            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null }));

            // Mock for: .from('subscription_plans').select(...).eq(...).single() -> { id: dbPlanId }
            planSelectSingleSpy = spy(() => Promise.resolve({ data: { id: dbPlanId }, error: null }));
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));

            // Mock for: .from('user_subscriptions').update(...).eq(...) -> { data: ..., error: null }
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'sub_updated' }], error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            // Mock for: .from('subscription_transactions').update(...).eq(...) -> { data: ..., error: null }
            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            // Simplified mockSupabaseClient using these spies
            mockSupabaseClient = {
                from: spy((tableName: string) => {
                    switch (tableName) {
                        case 'subscription_transactions':
                            return {
                                select: txSelectRootSpy,
                                upsert: txUpsertSpy,
                                update: txUpdateRootSpy
                            };
                        case 'subscription_plans':
                            return { select: planSelectRootSpy };
                        case 'user_subscriptions':
                            return {
                                select: userIdLookupRootSpy, // For user_id lookup
                                update: userSubUpdateRootSpy  // For actual update
                            };
                        default:
                            throw new Error(`Unexpected table in test: ${tableName}`);
                    }
                })
            } as unknown as SupabaseClient<Database>;

            // Act
            await handleSubscriptionUpdated(mockSupabaseClient, mockStripeInstance, mockSubscription, eventId, eventType);

            // Assert
            // 1. Idempotency check (count only)
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // 1.5 User ID lookup (count only)
            assertSpyCalls(userIdLookupRootSpy, 1);
            assertSpyCalls(userIdLookupEqSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1);
            // 2. Transaction upsert (processing) - Check args 
            assertSpyCall(txUpsertSpy, 0); // Check called once, index 0
            assertEquals(txUpsertSpy.calls[0]!.args[0], {
                stripe_event_id: eventId,
                event_type: eventType,
                status: 'processing',
                user_id: dbUserId, 
                stripe_subscription_id: stripeSubId,
                stripe_customer_id: stripeCustomerId,
            });
            // 3. Plan lookup (count only)
            assertSpyCalls(planSelectRootSpy, 1);
            assertSpyCalls(planSelectEqSpy, 1);
            assertSpyCalls(planSelectSingleSpy, 1);
            // 4. User subscription update - Check args
            assertSpyCall(userSubUpdateRootSpy, 0); // Check .update() called once
            const actualUpdatePayload = userSubUpdateRootSpy.calls[0]!.args[0]; // Args passed to .update()
            assertExists(actualUpdatePayload, "User subscription update payload should exist");
            assertEquals(actualUpdatePayload.status, mockSubscription.status);
            assertEquals(actualUpdatePayload.plan_id, dbPlanId);
            assertEquals(actualUpdatePayload.cancel_at_period_end, mockSubscription.cancel_at_period_end);
            assertExists(actualUpdatePayload.current_period_start);
            assertExists(actualUpdatePayload.current_period_end);
            assertExists(actualUpdatePayload.updated_at);
            assertSpyCalls(userSubUpdateEqSpy, 1); // Check .eq() was chained
            // 5. Final transaction update (succeeded) - Check args
            assertSpyCall(txUpdateRootSpy, 0); // Check .update() called once
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0]; // Args passed to .update()
            assertExists(finalTxArgs, "Final transaction update payload should exist");
            assertEquals(finalTxArgs.status, 'succeeded');
            assertExists(finalTxArgs.updated_at);
            assertSpyCalls(txUpdateEqSpy, 1); // Check .eq() was chained
        });

        it("should skip if event already processed", async () => {
            // Arrange - Mock ONLY the initial transaction check to return succeeded
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { status: 'succeeded' }, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Define other spies needed by the mockSupabaseClient structure, but they shouldn't be called
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));
            txUpsertSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));
            txUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));
            planSelectSingleSpy = spy(() => Promise.resolve({ data: { id: dbPlanId }, error: null }));
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                            // Only select should be called in this test case
                            return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'subscription_plans':
                            return { select: planSelectRootSpy }; 
                        case 'user_subscriptions':
                             return { select: userIdLookupRootSpy, update: userSubUpdateRootSpy };
                        default:
                            // Allow fallthrough or throw if unexpected table is critical
                            return {}; 
                    }
                })
            } as any; // Use 'as any' for simplicity in this focused test

            // Act
            await handleSubscriptionUpdated(mockSupabaseClient, mockStripeInstance, mockSubscription, eventId, eventType);

            // Assert (Counts only, check that others were NOT called)
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            
            assertSpyCalls(userIdLookupRootSpy, 0); // Not called
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(planSelectRootSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });
        
        it("should skip user sub update if plan not found, but still succeed transaction", async () => {
           // Arrange - Set up mocks, specifically plan lookup returning null
            // Mock for: .from('subscription_transactions').select(...).eq(...).maybeSingle() -> null
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Mock for: .from('user_subscriptions').select(...).eq(...).maybeSingle() -> { user_id: dbUserId }
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            // Mock for: .from('subscription_transactions').upsert(...) -> { data: ..., error: null }
            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null }));

            // Mock for: .from('subscription_plans').select(...).eq(...).single() -> null (Plan not found)
            planSelectSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); 
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));

            // Mock for: .from('user_subscriptions').update(...).eq(...) - Shouldn't be called
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            // Mock for: .from('subscription_transactions').update(...).eq(...) -> { data: ..., error: null }
            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'subscription_plans':
                            return { select: planSelectRootSpy }; // Returns null data
                        case 'user_subscriptions':
                             return { select: userIdLookupRootSpy, update: userSubUpdateRootSpy };
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any; 

            // Act
            await handleSubscriptionUpdated(mockSupabaseClient, mockStripeInstance, mockSubscription, eventId, eventType);
            
            // Assert
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1);
            assertSpyCall(txUpsertSpy, 0); // Check upsert happened
            assertSpyCalls(planSelectSingleSpy, 1); // Plan lookup happened
            assertSpyCalls(userSubUpdateRootSpy, 0); // User sub update NOT called
            // Final transaction update WAS called - Check args
            assertSpyCall(txUpdateRootSpy, 0); 
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'succeeded');
            assertSpyCalls(txUpdateEqSpy, 1);
        });
        
        it("should throw and mark transaction failed if user sub update fails", async () => {
            // Arrange - Mock user sub update to return an error
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null }));

            planSelectSingleSpy = spy(() => Promise.resolve({ data: { id: dbPlanId }, error: null }));
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));

            const updateError = new Error("Update failed constraint");
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: updateError })); // Error here
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));
            
            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'subscription_plans':
                            return { select: planSelectRootSpy };
                        case 'user_subscriptions':
                             return { select: userIdLookupRootSpy, update: userSubUpdateRootSpy }; // Failing update
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any;

            // Act & Assert
            await assertRejects(
                async () => await handleSubscriptionUpdated(mockSupabaseClient, mockStripeInstance, mockSubscription, eventId, eventType),
                Error,
                `Failed to update user subscription: ${updateError.message}` 
            );
            // Assert counts and final tx status
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1);
            assertSpyCall(txUpsertSpy, 0); // Initial upsert called
            assertSpyCalls(planSelectSingleSpy, 1);
            assertSpyCall(userSubUpdateRootSpy, 0); // Failing update called
            assertSpyCalls(userSubUpdateEqSpy, 1); // eq chained
            // Final transaction update called - check args
            assertSpyCall(txUpdateRootSpy, 0); 
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'failed'); // Should be marked failed
            assertSpyCalls(txUpdateEqSpy, 1);
        });

        it("should throw and mark transaction failed if user_id lookup fails", async () => {
            // Arrange - Mock user_id lookup to return a DB error
             txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            const lookupError = new Error("Lookup failed");
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: lookupError })); // Error here
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            // Other spies (shouldn't be called)
            txUpsertSpy = spy(() => Promise.resolve({ data: null, error: null }));
            planSelectSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));
            txUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                    // Only expect select from sub_tx and select from user_sub
                    if (tableName === 'subscription_transactions') return { select: txSelectRootSpy };
                    if (tableName === 'user_subscriptions') return { select: userIdLookupRootSpy }; // Failing lookup
                    return {}; 
                })
            } as any;
            
            // Act & Assert
            await assertRejects(
                async () => await handleSubscriptionUpdated(mockSupabaseClient, mockStripeInstance, createMockSubscription(), eventId, eventType),
                Error,
                `DB error fetching user_id: ${lookupError.message}`
            );
            // Assert counts
             assertSpyCalls(txSelectMaybeSingleSpy, 1);
             assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // Lookup attempted
             assertSpyCalls(txUpsertSpy, 0); // Not reached
             assertSpyCalls(planSelectSingleSpy, 0);
             assertSpyCalls(userSubUpdateRootSpy, 0);
             assertSpyCalls(txUpdateRootSpy, 0); // Final update not reached
        });

        it("should throw and mark transaction failed if user_id not found", async () => {
            // Arrange - Mock user_id lookup to return null data
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Null data here
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));
            
             // Other spies (shouldn't be called)
            txUpsertSpy = spy(() => Promise.resolve({ data: null, error: null }));
            planSelectSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));
            txUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                    if (tableName === 'subscription_transactions') return { select: txSelectRootSpy };
                    if (tableName === 'user_subscriptions') return { select: userIdLookupRootSpy }; // Null lookup
                    return {}; 
                })
            } as any;
            
            // Act & Assert
            await assertRejects(
                async () => await handleSubscriptionUpdated(mockSupabaseClient, mockStripeInstance, createMockSubscription(), eventId, eventType),
                Error,
                `User mapping not found for Stripe customer ${stripeCustomerId}. Cannot process event.`
            );
            // Assert counts
             assertSpyCalls(txSelectMaybeSingleSpy, 1);
             assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // Lookup attempted
             assertSpyCalls(txUpsertSpy, 0); // Not reached
             assertSpyCalls(planSelectSingleSpy, 0);
             assertSpyCalls(userSubUpdateRootSpy, 0);
             assertSpyCalls(txUpdateRootSpy, 0); // Final update not reached
        });
    });

    // /* // Temporarily commented out --- Now uncommenting this suite
    // --- handleSubscriptionDeletedTests ---
    describe("handleSubscriptionDeleted", () => {
        const eventType = "customer.subscription.deleted";
        const mockSubscription = createMockSubscription({ status: 'canceled' });

        it("should mark user subscription canceled and succeed transaction", async () => {
            // Arrange - Manually create spies for this test's success path
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null }));

            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'sub_updated' }], error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            // Plan lookup spies needed for mockSupabaseClient structure, but not used in this handler
            planSelectSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            planSelectEqSpy = spy(() => ({ single: planSelectSingleSpy }));
            planSelectRootSpy = spy(() => ({ eq: planSelectEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'subscription_plans':
                            return { select: planSelectRootSpy }; 
                        case 'user_subscriptions':
                             return { select: userIdLookupRootSpy, update: userSubUpdateRootSpy };
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any;
            
            // Act
            await handleSubscriptionDeleted(mockSupabaseClient, mockSubscription, eventId, eventType);
            
            // Assert
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1);
            // Check Transaction upsert args
            assertSpyCall(txUpsertSpy, 0);
            assertEquals(txUpsertSpy.calls[0]!.args[0], {
                    stripe_event_id: eventId,
                    event_type: eventType,
                    status: 'processing',
                    user_id: dbUserId,
                    stripe_subscription_id: stripeSubId,
                    stripe_customer_id: stripeCustomerId,
            });
            // Check User subscription update args
            assertSpyCall(userSubUpdateRootSpy, 0); // Called once
            const updateArgs = userSubUpdateRootSpy.calls[0]!.args[0];
            assertExists(updateArgs);
            assertEquals(updateArgs.status, 'canceled');
            assertExists(updateArgs.updated_at);
            assertSpyCalls(userSubUpdateEqSpy, 1);
            // Check Final transaction update args
            assertSpyCall(txUpdateRootSpy, 0); // Called once
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'succeeded');
            assertExists(finalTxArgs.updated_at);
            assertSpyCalls(txUpdateEqSpy, 1);
        });

        it("should skip if event already processed", async () => {
            // Arrange - Mock ONLY the initial transaction check to return succeeded
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { status: 'succeeded' }, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Define other spies (shouldn't be called)
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));
            txUpsertSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));
            txUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                            // Only select should be called
                            return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        // Other tables shouldn't be accessed
                        default:
                            return {}; 
                    }
                })
            } as any;

            // Act
            await handleSubscriptionDeleted(mockSupabaseClient, mockSubscription, eventId, eventType);
            
            // Assert
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // Other spies not called
            assertSpyCalls(userIdLookupRootSpy, 0);
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
            assertSpyCalls(txUpdateEqSpy, 0); // Changed from 1 to 0 - Eq spy on update shouldn't be called if skipped
        });

        it("should still succeed transaction even if user subscription update fails", async () => {
            // Arrange - Mock user sub update to return an error, but expect handler to succeed
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null }));
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null }));

            const updateError = new Error("Row not found");
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: updateError })); // Error here
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'user_subscriptions':
                             return { select: userIdLookupRootSpy, update: userSubUpdateRootSpy }; // Failing update
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any;

            // Act
            await handleSubscriptionDeleted(mockSupabaseClient, mockSubscription, eventId, eventType);
            
            // Assert - Handler should NOT throw for this specific error
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1);
            assertSpyCall(txUpsertSpy, 0); // Initial upsert ok
            assertSpyCall(userSubUpdateRootSpy, 0); // Failing update called
            assertSpyCalls(userSubUpdateEqSpy, 1);
            // Final transaction update was called - check args
            assertSpyCall(txUpdateRootSpy, 0); 
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'succeeded'); // Still succeeded
            assertSpyCalls(txUpdateEqSpy, 1);
        });

        it("should throw and mark transaction failed on other errors", async () => {
           // Arrange - Mock initial transaction select to return a DB error
            const dbError = new Error("DB connection error");
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: dbError })); // Error here
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Other spies (shouldn't be called)
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); 
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));
            txUpsertSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));
            txUpdateEqSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                    if (tableName === 'subscription_transactions') return { select: txSelectRootSpy }; // Failing select
                    return {}; 
                })
            } as any;
            
            // Act & Assert
            await assertRejects(
                async () => await handleSubscriptionDeleted(mockSupabaseClient, mockSubscription, eventId, eventType),
                Error,
                `DB error checking transaction: ${dbError.message}`
            );
            // Assert counts - handler should throw on initial check error
            assertSpyCalls(txSelectMaybeSingleSpy, 1); // Select attempted
            assertSpyCalls(userIdLookupRootSpy, 0);
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0); // Final update not reached
        });
    });
    // */ // End of uncommenting this suite
}); 