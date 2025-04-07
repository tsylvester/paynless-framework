import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, assertSpyCall, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { 
    handleInvoicePaymentSucceeded, 
    handleInvoicePaymentFailed 
} from "./invoice.ts";
import { Database, Tables } from "../../types_db.ts";

// --- Mocks & Spies (Will be assigned in tests) ---
let mockSupabaseClient: SupabaseClient<Database>;
let mockStripeInstance: Stripe; // Usually not needed by handlers directly

let txSelectMaybeSingleSpy: Spy, txSelectEqSpy: Spy, txSelectRootSpy: Spy;
let userIdLookupMaybeSingleSpy: Spy, userIdLookupEqSpy: Spy, userIdLookupRootSpy: Spy;
let txUpsertSpy: Spy;
let txUpdateEqSpy: Spy, txUpdateRootSpy: Spy;
let userSubSelectMaybeSingleSpy: Spy, userSubSelectEqSpy: Spy, userSubSelectRootSpy: Spy;
let userSubUpdateEqSpy: Spy, userSubUpdateRootSpy: Spy;

// --- Test Data ---
const eventId = "evt_invoice_test_123";
const stripeInvoiceId = "in_test_abc";
const stripeSubId = "sub_invoice_xyz";
const stripeCustomerId = "cus_invoice_xyz";
const stripePaymentIntentId = "pi_test_xyz";
const dbUserId = "user_invoice_test";
const dbUserSubId = "usersub_invoice_test"; // ID from user_subscriptions table

const createMockInvoice = (overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice => ({
    id: stripeInvoiceId,
    object: 'invoice',
    customer: stripeCustomerId,
    subscription: stripeSubId,
    payment_intent: stripePaymentIntentId,
    status: 'paid', // Default to paid for success handler
    amount_paid: 5000,
    amount_due: 0,
    currency: 'usd',
    // Add other necessary Stripe.Invoice fields with default values
    ...overrides,
} as Stripe.Invoice);

// --- Test Suite ---
describe("Stripe Webhook Invoice Handlers", () => {
    beforeEach(() => {
        mockStripeInstance = {} as Stripe;
    });

    // --- handleInvoicePaymentSucceeded Tests ---
    describe("handleInvoicePaymentSucceeded", () => {
        const eventType = "invoice.payment_succeeded";
        const mockInvoice = createMockInvoice({ status: 'paid' });

        it("should log transaction and mark succeeded", async () => {
            // Arrange - Manual spies for success path (Strict Pattern)
            // --- Spies for subscription_transactions ---
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Idempotency check: No existing transaction
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));
            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null })); // Initial upsert (processing)
            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null })); // Final update (succeeded)
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));
            
            // --- Spies for user_subscriptions ---
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null })); // User ID lookup SUCCESS
            userSubSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { id: dbUserSubId }, error: null })); // Subscription lookup SUCCESS
            const userSubEqSpy = spy((columnName: string, _value: string) => { // Differentiates based on column
                if (columnName === 'stripe_customer_id') {
                    return { maybeSingle: userIdLookupMaybeSingleSpy };
                } else if (columnName === 'stripe_subscription_id') {
                    return { maybeSingle: userSubSelectMaybeSingleSpy };
                } else {
                    throw new Error(`Unexpected column in userSubEqSpy mock: ${columnName}`);
                }
            });
            const userSubSelectSpy = spy((_columns: string) => ({ eq: userSubEqSpy }));
            // Note: Update on user_subscriptions not needed for success path, but define spies for consistency
            const userSubUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: dbUserSubId }], error: null }));
            const userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            // --- Mock Client ---
            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                            return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'user_subscriptions':
                            return { select: userSubSelectSpy, update: userSubUpdateRootSpy }; // update not called here
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any;

            // Act
            await handleInvoicePaymentSucceeded(mockSupabaseClient, mockInvoice, eventId, eventType);

            // Assert
            // 1. Idempotency check (subscription_transactions select)
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // 2. User ID & Sub ID lookups (user_subscriptions select)
            assertSpyCalls(userSubSelectSpy, 2); // Called twice
            assertSpyCalls(userSubEqSpy, 2);     // Called twice
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // First .eq() call
            assertSpyCalls(userSubSelectMaybeSingleSpy, 1); // Second .eq() call
            // 3. Transaction upsert (processing)
            assertSpyCall(txUpsertSpy, 0); // Assert call count 0
            assertEquals(txUpsertSpy.calls[0]!.args[0], {
                stripe_event_id: eventId,
                event_type: eventType,
                status: 'processing',
                user_id: dbUserId,
                stripe_invoice_id: stripeInvoiceId,
                stripe_subscription_id: stripeSubId,
                stripe_customer_id: stripeCustomerId,
                stripe_payment_intent_id: stripePaymentIntentId,
                amount: mockInvoice.amount_paid,
                currency: mockInvoice.currency,
            });
            // 4. User Subscription Update check (NOT CALLED in success)
            assertSpyCalls(userSubUpdateRootSpy, 0);
            // 5. Final Transaction Update (succeeded)
            assertSpyCall(txUpdateRootSpy, 0); // Assert call count 0
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'succeeded');
            assertEquals(finalTxArgs.user_subscription_id, dbUserSubId);
            assertExists(finalTxArgs.updated_at);
            assertSpyCalls(txUpdateEqSpy, 1);
        });

        it("should skip if event already processed", async () => {
            // Arrange - Mock initial transaction check to return succeeded
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { status: 'succeeded' }, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Define other spies (shouldn't be called)
            userIdLookupRootSpy = spy(() => ({})); 
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        default:
                            return {}; // Other tables not expected
                    }
                })
            } as any;

            // Act
            await handleInvoicePaymentSucceeded(mockSupabaseClient, mockInvoice, eventId, eventType);

            // Assert
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // Others not called
            assertSpyCalls(userIdLookupRootSpy, 0);
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });

        it("should throw if user_id lookup fails (DB error)", async () => {
            // Arrange - Mock user_id lookup to fail
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            const lookupError = new Error("User lookup failed");
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: lookupError })); // Error here
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

             // Spies not expected to be called beyond lookup
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy }; // Only initial select expected
                        case 'user_subscriptions': 
                             return { select: userIdLookupRootSpy }; // Failing lookup
                        default:
                            return {};
                    }
                })
            } as any;

            // Act & Assert
            await assertRejects(
                async () => await handleInvoicePaymentSucceeded(mockSupabaseClient, mockInvoice, eventId, eventType),
                Error,
                `DB error fetching user_id for customer ${stripeCustomerId}: ${lookupError.message}`
            );
            // Assert counts
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // Lookup attempted
            assertSpyCalls(txUpsertSpy, 0); // Not reached
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });
        
        it("should throw if user_id lookup not found", async () => {
            // Arrange - Mock user_id lookup to return null
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Null data
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

             // Spies not expected to be called
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy };
                        case 'user_subscriptions': 
                             return { select: userIdLookupRootSpy }; // Null lookup
                        default:
                            return {};
                    }
                })
            } as any;

            // Act & Assert
            await assertRejects(
                async () => await handleInvoicePaymentSucceeded(mockSupabaseClient, mockInvoice, eventId, eventType),
                Error,
                `User mapping not found for Stripe customer ${stripeCustomerId}. Cannot process invoice event ${eventId}.`
            );
            // Assert counts
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // Lookup attempted
            assertSpyCalls(txUpsertSpy, 0); 
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });
        
        // Note: Test for final transaction update error could be added if needed

    });

    // --- handleInvoicePaymentFailed Tests ---
    describe("handleInvoicePaymentFailed", () => {
         const eventType = "invoice.payment_failed";
         const mockInvoice = createMockInvoice({ status: 'open', amount_due: 5000, amount_paid: 0 }); // Example failed state

        it("should log transaction, update sub status, and mark transaction failed", async () => {
            // Arrange - Manual spies for failure path (Strict Pattern)
            // --- Spies for subscription_transactions ---
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Idempotency check: No existing transaction
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));
            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null })); // Initial upsert (processing)
            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null })); // Final update (failed)
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            // --- Spies for user_subscriptions ---
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null })); // User ID lookup SUCCESS
            userSubSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { id: dbUserSubId, status: 'active' }, error: null })); // Subscription lookup SUCCESS (returns active sub)
            const userSubEqSpy = spy((columnName: string, _value: string) => { // Differentiates based on column
                if (columnName === 'stripe_customer_id') {
                    return { maybeSingle: userIdLookupMaybeSingleSpy };
                } else if (columnName === 'stripe_subscription_id') {
                    return { maybeSingle: userSubSelectMaybeSingleSpy };
                } else {
                    throw new Error(`Unexpected column in userSubEqSpy mock: ${columnName}`);
                }
            });
            const userSubSelectSpy = spy((_columns: string) => ({ eq: userSubEqSpy }));
            userSubUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: dbUserSubId }], error: null })); // Mock update to past_due SUCCESS
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            // --- Mock Client ---
            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'user_subscriptions':
                             return { select: userSubSelectSpy, update: userSubUpdateRootSpy }; // Select & Update are used
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any;
            
            // Act
            await handleInvoicePaymentFailed(mockSupabaseClient, mockInvoice, eventId, eventType);

            // Assert
            // 1. Idempotency check (subscription_transactions select)
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // 2. User ID & Sub ID lookups (user_subscriptions select)
            assertSpyCalls(userSubSelectSpy, 2); // Called twice
            assertSpyCalls(userSubEqSpy, 2);     // Called twice
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // First .eq()
            assertSpyCalls(userSubSelectMaybeSingleSpy, 1); // Second .eq()
            // 3. Transaction upsert (processing)
            assertSpyCall(txUpsertSpy, 0); // Assert call count 0
            assertEquals(txUpsertSpy.calls[0]!.args[0], {
                stripe_event_id: eventId,
                event_type: eventType,
                status: 'processing',
                user_id: dbUserId,
                stripe_invoice_id: stripeInvoiceId,
                stripe_subscription_id: stripeSubId,
                stripe_customer_id: stripeCustomerId,
                stripe_payment_intent_id: stripePaymentIntentId,
                amount: mockInvoice.amount_due,
                currency: mockInvoice.currency,
            });
            // 4. User Subscription Update (to past_due)
            assertSpyCall(userSubUpdateRootSpy, 0); // Assert call count 0
            const subUpdateArgs = userSubUpdateRootSpy.calls[0]!.args[0];
            assertExists(subUpdateArgs);
            assertEquals(subUpdateArgs.status, 'past_due');
            assertExists(subUpdateArgs.updated_at);
            assertSpyCalls(userSubUpdateEqSpy, 1); 
            // 5. Final Transaction Update (failed)
            assertSpyCall(txUpdateRootSpy, 0); // Assert call count 0
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'failed');
            assertEquals(finalTxArgs.user_subscription_id, dbUserSubId);
            assertExists(finalTxArgs.updated_at);
            assertSpyCalls(txUpdateEqSpy, 1);
        });

        it("should skip if event already processed (succeeded)", async () => {
            // Arrange - Mock initial transaction check to return succeeded
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { status: 'succeeded' }, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Define other spies (shouldn't be called)
            userIdLookupRootSpy = spy(() => ({})); 
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            userSubUpdateRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

             mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        default:
                            return {};
                    }
                })
            } as any;

            // Act
            await handleInvoicePaymentFailed(mockSupabaseClient, mockInvoice, eventId, eventType);

            // Assert
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // Others not called
            assertSpyCalls(userIdLookupRootSpy, 0);
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });
        
         it("should skip if event already processed (failed)", async () => {
            // Arrange - Mock initial transaction check to return failed
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { status: 'failed' }, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            // Define other spies (shouldn't be called)
            userIdLookupRootSpy = spy(() => ({})); 
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            userSubUpdateRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

             mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        default:
                            return {};
                    }
                })
            } as any;

            // Act
            await handleInvoicePaymentFailed(mockSupabaseClient, mockInvoice, eventId, eventType);

            // Assert
            assertSpyCalls(txSelectRootSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1);
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            // Others not called
            assertSpyCalls(userIdLookupRootSpy, 0);
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });

        it("should throw if user_id lookup fails (DB error)", async () => {
             // Arrange - Mock user_id lookup to fail
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            const lookupError = new Error("User lookup failed");
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: lookupError })); // Error here
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

             // Other spies not expected to be called
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            userSubUpdateRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy };
                        case 'user_subscriptions': 
                             return { select: userIdLookupRootSpy }; // Failing lookup
                        default:
                            return {};
                    }
                })
            } as any;

            // Act & Assert
            await assertRejects(
                async () => await handleInvoicePaymentFailed(mockSupabaseClient, mockInvoice, eventId, eventType),
                Error,
                `DB error fetching user_id for customer ${stripeCustomerId}: ${lookupError.message}`
            );
            // Assert counts
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // Lookup attempted
            assertSpyCalls(txUpsertSpy, 0);
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });
        
        it("should throw if user_id lookup not found", async () => {
             // Arrange - Mock user_id lookup to return null
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null }));
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));

            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Null data
            userIdLookupEqSpy = spy(() => ({ maybeSingle: userIdLookupMaybeSingleSpy }));
            userIdLookupRootSpy = spy(() => ({ eq: userIdLookupEqSpy }));

            // Other spies not expected to be called
            txUpsertSpy = spy(() => ({}));
            userSubSelectRootSpy = spy(() => ({}));
            userSubUpdateRootSpy = spy(() => ({}));
            txUpdateRootSpy = spy(() => ({}));

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy };
                        case 'user_subscriptions': 
                             return { select: userIdLookupRootSpy }; // Null lookup
                        default:
                            return {};
                    }
                })
            } as any;

            // Act & Assert
            await assertRejects(
                async () => await handleInvoicePaymentFailed(mockSupabaseClient, mockInvoice, eventId, eventType),
                Error,
                `User mapping not found for Stripe customer ${stripeCustomerId}. Cannot process invoice event ${eventId}.`
            );
            // Assert counts
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1); // Lookup attempted
            assertSpyCalls(txUpsertSpy, 0); 
            assertSpyCalls(userSubSelectRootSpy, 0);
            assertSpyCalls(userSubUpdateRootSpy, 0);
            assertSpyCalls(txUpdateRootSpy, 0);
        });
        
        it("should log failed transaction if user sub update fails (but not throw)", async () => {
            // Arrange - Mock user subscription update to fail (Strict Pattern)
            // --- Spies for subscription_transactions ---
            txSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: null, error: null })); // Idempotency check: No existing transaction
            txSelectEqSpy = spy(() => ({ maybeSingle: txSelectMaybeSingleSpy }));
            txSelectRootSpy = spy(() => ({ eq: txSelectEqSpy }));
            txUpsertSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_new' }], error: null })); // Initial upsert (processing)
            txUpdateEqSpy = spy(() => Promise.resolve({ data: [{ id: 'tx_final' }], error: null })); // Final update (failed)
            txUpdateRootSpy = spy(() => ({ eq: txUpdateEqSpy }));

            // --- Spies for user_subscriptions ---
            userIdLookupMaybeSingleSpy = spy(() => Promise.resolve({ data: { user_id: dbUserId }, error: null })); // User ID lookup SUCCESS
            userSubSelectMaybeSingleSpy = spy(() => Promise.resolve({ data: { id: dbUserSubId, status: 'active' }, error: null })); // Subscription lookup SUCCESS
            const userSubEqSpy = spy((columnName: string, _value: string) => { // Differentiates based on column
                if (columnName === 'stripe_customer_id') {
                    return { maybeSingle: userIdLookupMaybeSingleSpy };
                } else if (columnName === 'stripe_subscription_id') {
                    return { maybeSingle: userSubSelectMaybeSingleSpy };
                } else {
                    throw new Error(`Unexpected column in userSubEqSpy mock: ${columnName}`);
                }
            });
            const userSubSelectSpy = spy((_columns: string) => ({ eq: userSubEqSpy }));
            const subUpdateError = new Error("Sub update failed");
            userSubUpdateEqSpy = spy(() => Promise.resolve({data: null, error: subUpdateError })); // Update user sub FAILS
            userSubUpdateRootSpy = spy(() => ({ eq: userSubUpdateEqSpy }));

            // --- Mock Client ---
            mockSupabaseClient = {
                from: spy((tableName: string) => {
                     switch (tableName) {
                        case 'subscription_transactions':
                             return { select: txSelectRootSpy, upsert: txUpsertSpy, update: txUpdateRootSpy };
                        case 'user_subscriptions':
                             return { select: userSubSelectSpy, update: userSubUpdateRootSpy }; // Select & Update are used
                        default:
                            throw new Error(`Unexpected table: ${tableName}`);
                    }
                })
            } as any;
            
            // Act
            await handleInvoicePaymentFailed(mockSupabaseClient, mockInvoice, eventId, eventType);

            // Assert - No error thrown, but final tx marked failed
            // 1. Idempotency check
            assertSpyCalls(txSelectMaybeSingleSpy, 1);
            assertSpyCalls(txSelectEqSpy, 1); // Added assert
            assertSpyCalls(txSelectRootSpy, 1); // Added assert
            // 2. User ID & Sub ID lookups
            assertSpyCalls(userSubSelectSpy, 2);
            assertSpyCalls(userSubEqSpy, 2);
            assertSpyCalls(userIdLookupMaybeSingleSpy, 1);
            assertSpyCalls(userSubSelectMaybeSingleSpy, 1);
            // 3. Transaction upsert (processing)
            assertSpyCall(txUpsertSpy, 0); // Assert call count 0
            // 4. User Subscription Update (Attempted, Failed)
            assertSpyCall(userSubUpdateRootSpy, 0); // Assert call count 0
            assertSpyCalls(userSubUpdateEqSpy, 1); 
            // 5. Final Transaction Update (failed)
            assertSpyCall(txUpdateRootSpy, 0); // Assert call count 0
            const finalTxArgs = txUpdateRootSpy.calls[0]!.args[0];
            assertExists(finalTxArgs);
            assertEquals(finalTxArgs.status, 'failed');
            // user_subscription_id should likely be null here as the linking sub update failed before the final tx update
            // assertEquals(finalTxArgs.user_subscription_id, null);
            assertExists(finalTxArgs.updated_at);
            assertSpyCalls(txUpdateEqSpy, 1);
        });
    });
}); 