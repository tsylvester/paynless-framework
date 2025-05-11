import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy, assertSpyCall } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import {
    cancelSubscription,
    resumeSubscription,
} from "./subscription.ts";
import { HandlerError } from "./current.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/supabase.mock.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;

// --- Mock Setup Helpers ---

// For initial .select("*").eq().eq().single()
const createSelectSpies = (data: any = null, error: any = null) => {
    const singleSpy = spy(() => Promise.resolve({ data, error }));
    const eqUserSpy = spy(() => ({ single: singleSpy }));
    const eqSubIdSpy = spy(() => ({ eq: eqUserSpy }));
    const selectSpy = spy(() => ({ eq: eqSubIdSpy }));
    return { selectSpy, eqSubIdSpy, eqUserSpy, singleSpy };
};

// For .update().eq().select("*").single()
const createUpdateSpies = (data: any = null, error: any = null) => {
    const singleSpy = spy(() => Promise.resolve({ data, error }));
    const selectSpy = spy(() => ({ single: singleSpy }));
    const eqSpy = spy(() => ({ select: selectSpy }));
    const updateSpy = spy(() => ({ eq: eqSpy }));
    return { updateSpy, eqSpy, selectSpy, singleSpy };
};

// For stripe.subscriptions.update
const createStripeUpdateSpy = (data: any = null, error: any = null) => {
    return spy(() => error ? Promise.reject(error) : Promise.resolve(data));
};

// --- Test Suite ---
describe("Subscription Handlers", () => {
    const userId = "test-user-id";
    const subscriptionId = "test-sub-record-id";
    const stripeSubId = "sub_stripe_123";
    const mockSubData = {
        id: subscriptionId,
        user_id: userId,
        stripe_subscription_id: stripeSubId,
        status: 'active',
        cancel_at_period_end: false,
        // Include nested plan data if needed for return value checks
        plans: { id: 'plan_123', name: 'Test Plan'}
    };

    // No beforeEach needed here, setup will be in nested describes

    // --- cancelSubscription Tests ---
    describe("cancelSubscription", () => {
        let stripeUpdateSpy: Spy;

        beforeEach(() => {
            // Configure mocks for cancelSubscription tests
            // Basic success config for Supabase (select finds data, update succeeds)
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    user_subscriptions: {
                        select: () => Promise.resolve({ data: [mockSubData], error: null }),
                        // Mock update to return updated data
                        update: () => Promise.resolve({ data: [{ ...mockSubData, cancel_at_period_end: true }], error: null })
                    }
                }
            };
            const { client } = createMockSupabaseClient(mockSupabaseConfig);
            mockSupabaseClient = client;

            // Basic success config for Stripe update
            stripeUpdateSpy = createStripeUpdateSpy({ id: stripeSubId, cancel_at_period_end: true, status: 'active' });
            mockStripeInstance = { subscriptions: { update: stripeUpdateSpy } } as any;
            
            // Remove response helper spy init
        });

        it("should successfully cancel a subscription", async () => {
            const result = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, stripeSubId);
            
            assertEquals(result.id, subscriptionId);
            assertEquals(result.cancel_at_period_end, true);
            assertEquals(result.status, 'active');
            assertSpyCalls(stripeUpdateSpy, 1);
            assertEquals(stripeUpdateSpy.calls[0]!.args[0], stripeSubId);
            assertEquals(stripeUpdateSpy.calls[0]!.args[1], { cancel_at_period_end: true });
        });

        it("should throw HandlerError(404) if initial subscription query fails", async () => {
            const dbError = new Error("DB read failed");
            const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: null, error: dbError }) } }
            };
            const { client } = createMockSupabaseClient(mockConfig);
            
            await assertRejects(
                async () => await cancelSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Subscription not found or access denied"
            );
            assertSpyCalls(stripeUpdateSpy, 0);
        });

        it("should throw HandlerError(404) if subscription not found or user mismatch", async () => {
            const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: null, error: null }) } }
            };
            const { client } = createMockSupabaseClient(mockConfig);

            await assertRejects(
                async () => await cancelSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Subscription not found or access denied"
            );
            assertSpyCalls(stripeUpdateSpy, 0); 
        });

        it("should throw HandlerError(400) if subscription has no stripe_subscription_id", async () => {
            const subWithoutStripeId = { ...mockSubData, stripe_subscription_id: null };
             const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: [subWithoutStripeId], error: null }) } }
            };
            const { client } = createMockSupabaseClient(mockConfig);

            await assertRejects(
                async () => await cancelSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Subscription data inconsistent"
            );
            assertSpyCalls(stripeUpdateSpy, 0);
        });

        it("should throw HandlerError if Stripe update fails", async () => {
            const stripeError = new Error("Stripe API error");
            stripeUpdateSpy = createStripeUpdateSpy(null, stripeError);
            mockStripeInstance.subscriptions.update = stripeUpdateSpy;
            
            await assertRejects(
                async () => await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                stripeError.message
            );
            assertSpyCalls(stripeUpdateSpy, 1);
        });

        it("should throw HandlerError(500) if local DB update fails after Stripe success", async () => {
            const updateError = new Error("Local DB update failed");
            const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    user_subscriptions: {
                        select: () => Promise.resolve({ data: [mockSubData], error: null }),
                        update: () => Promise.resolve({ data: null, error: updateError })
                    }
                }
            };
            const { client } = createMockSupabaseClient(mockConfig);
            
            await assertRejects(
                async () => await cancelSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Failed to update local subscription status after cancellation"
            );
            assertSpyCalls(stripeUpdateSpy, 1);
        });
    });

    // --- resumeSubscription Tests ---
    describe("resumeSubscription", () => {
        let stripeUpdateSpy: Spy;

        beforeEach(() => {
             // Configure mocks for resumeSubscription tests
            // Basic success config for Supabase (select finds data, update succeeds)
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    user_subscriptions: {
                        select: () => Promise.resolve({ data: [{...mockSubData, cancel_at_period_end: true}], error: null }),
                        // Mock update to return resumed data
                        update: () => Promise.resolve({ data: [{ ...mockSubData, cancel_at_period_end: false }], error: null })
                    }
                }
            };
            const { client } = createMockSupabaseClient(mockSupabaseConfig);
            mockSupabaseClient = client;

            // Basic success config for Stripe update (resume)
            stripeUpdateSpy = createStripeUpdateSpy({ id: stripeSubId, cancel_at_period_end: false, status: 'active' });
            mockStripeInstance = { subscriptions: { update: stripeUpdateSpy } } as any;

             // Remove response helper spy init
        });

        it("should successfully resume a subscription", async () => {
            const result = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, stripeSubId);
            
            assertEquals(result.id, subscriptionId);
            assertEquals(result.cancel_at_period_end, false);
            assertEquals(result.status, 'active');
            assertSpyCalls(stripeUpdateSpy, 1);
            assertEquals(stripeUpdateSpy.calls[0]!.args[0], stripeSubId);
            assertEquals(stripeUpdateSpy.calls[0]!.args[1], { cancel_at_period_end: false });
        });

        it("should throw HandlerError(404) if initial subscription query fails", async () => {
            const dbError = new Error("DB read failed");
            const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: null, error: dbError }) } }
            };
            const { client } = createMockSupabaseClient(mockConfig);

            await assertRejects(
                async () => await resumeSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Subscription not found or access denied"
            );
            assertSpyCalls(stripeUpdateSpy, 0);
        });
        
        it("should throw HandlerError(404) if subscription not found or user mismatch", async () => {
            const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: null, error: null }) } }
            };
            const { client } = createMockSupabaseClient(mockConfig);
            
            await assertRejects(
                async () => await resumeSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Subscription not found or access denied"
            );
            assertSpyCalls(stripeUpdateSpy, 0);
        });
        
        it("should throw HandlerError(400) if subscription has no stripe_subscription_id", async () => {
            const subWithoutStripeId = { ...mockSubData, stripe_subscription_id: null };
             const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: [subWithoutStripeId], error: null }) } }
            };
            const { client } = createMockSupabaseClient(mockConfig);

            await assertRejects(
                async () => await resumeSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Subscription data inconsistent"
            );
            assertSpyCalls(stripeUpdateSpy, 0);
        });
        
        it("should throw HandlerError if Stripe update fails", async () => {
            const stripeError = new Error("Stripe API error resume");
            stripeUpdateSpy = createStripeUpdateSpy(null, stripeError);
            mockStripeInstance.subscriptions.update = stripeUpdateSpy;
            
            await assertRejects(
                async () => await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                stripeError.message
            );
            assertSpyCalls(stripeUpdateSpy, 1);
        });
        
        it("should throw HandlerError(500) if local DB update fails after Stripe success", async () => {
            const updateError = new Error("Local DB update failed resume");
            const mockConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    user_subscriptions: {
                        select: () => Promise.resolve({ data: [{...mockSubData, cancel_at_period_end: true}], error: null }),
                        update: () => Promise.resolve({ data: null, error: updateError })
                    }
                }
            };
            const { client } = createMockSupabaseClient(mockConfig);
            
            await assertRejects(
                async () => await resumeSubscription(client, mockStripeInstance, userId, stripeSubId),
                HandlerError,
                "Failed to update local subscription status after resumption"
            );
            assertSpyCalls(stripeUpdateSpy, 1);
        });
    });
}); 