import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import {
    cancelSubscription,
    resumeSubscription,
} from "./subscription.ts";
import { 
    createErrorResponse, 
    createSuccessResponse, 
    type createErrorResponse as CreateErrorResponseType, 
    type createSuccessResponse as CreateSuccessResponseType 
} from "@shared/responses.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;
let mockCreateErrorResponse: Spy<CreateErrorResponseType>;
let mockCreateSuccessResponse: Spy<CreateSuccessResponseType>;

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

// Mock dependencies object
const mockDeps = () => ({
  createErrorResponse: mockCreateErrorResponse,
  createSuccessResponse: mockCreateSuccessResponse,
});

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

    beforeEach(() => {
        // Reset spies before each test
        mockCreateErrorResponse = spy(createErrorResponse);
        mockCreateSuccessResponse = spy(createSuccessResponse);

        // Default successful mock setup
        const { selectSpy, eqSubIdSpy, eqUserSpy, singleSpy } = createSelectSpies(mockSubData);
        const { updateSpy, eqSpy, selectSpy: updateSelectSpy, singleSpy: updateSingleSpy } = createUpdateSpies(mockSubData); // Assume update returns similar data
        
        mockSupabaseClient = {
            from: spy((tableName: string) => {
                if (tableName === "user_subscriptions") {
                    // Route based on whether update or select is called next (simplistic check)
                    return {
                        select: selectSpy, 
                        update: updateSpy,
                    };
                }
                throw new Error(`Unexpected table: ${tableName}`);
            })
        } as unknown as SupabaseClient;

        mockStripeInstance = {
            subscriptions: {
                update: createStripeUpdateSpy({ id: stripeSubId, cancel_at_period_end: true, status: 'active' }) // Default success for cancel
            }
        } as unknown as Stripe;
    });

    // --- cancelSubscription Tests ---
    describe("cancelSubscription", () => {
        // Pre-define spies for assertions across tests
        let selectSpies: ReturnType<typeof createSelectSpies>;
        let updateSpies: ReturnType<typeof createUpdateSpies>;
        let stripeUpdateSpy: Spy;

        beforeEach(() => {
            // Re-initialize spies for each cancel test
            selectSpies = createSelectSpies(mockSubData);
            updateSpies = createUpdateSpies({ ...mockSubData, cancel_at_period_end: true }); // Mock updated data
            stripeUpdateSpy = createStripeUpdateSpy({ id: stripeSubId, cancel_at_period_end: true, status: 'active' });

            mockSupabaseClient = {
                from: spy((tableName: string) => {
                    if (tableName === "user_subscriptions") {
                        return { select: selectSpies.selectSpy, update: updateSpies.updateSpy };
                    }
                    throw new Error(`Unexpected table: ${tableName}`);
                })
            } as any;
            mockStripeInstance.subscriptions.update = stripeUpdateSpy;
        });

        it("should successfully cancel a subscription", async () => {
            const deps = mockDeps();
            const response = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);
            const body = await response.json();

            assertEquals(response.status, 200);
            assertSpyCalls(mockCreateSuccessResponse, 1);
            // Initial select
            assertSpyCalls(selectSpies.selectSpy, 1);
            assertSpyCalls(selectSpies.eqSubIdSpy, 1, { args: ["id", subscriptionId] });
            assertSpyCalls(selectSpies.eqUserSpy, 1, { args: ["user_id", userId] });
            assertSpyCalls(selectSpies.singleSpy, 1);
            // Stripe update
            assertSpyCalls(stripeUpdateSpy, 1);
            assertEquals(stripeUpdateSpy.calls[0].args[0], stripeSubId);
            assertEquals(stripeUpdateSpy.calls[0].args[1], { cancel_at_period_end: true });
            // Local DB update
            assertSpyCalls(updateSpies.updateSpy, 1);
            assertEquals(updateSpies.updateSpy.calls[0].args[0], { cancel_at_period_end: true, status: 'active' });
            assertSpyCalls(updateSpies.eqSpy, 1, { args: ["id", subscriptionId] });
            assertSpyCalls(updateSpies.selectSpy, 1);
            assertSpyCalls(updateSpies.singleSpy, 1);
            // Response body
            assertEquals(body.id, subscriptionId);
            assertEquals(body.cancel_at_period_end, true);
            assertSpyCalls(mockCreateErrorResponse, 0);
        });

        it("should return 404 if initial subscription query fails", async () => {
            const dbError = new Error("DB read failed");
            selectSpies = createSelectSpies(null, dbError); // Re-assign error spies
            mockSupabaseClient.from = spy(() => ({ select: selectSpies.selectSpy })) as any;
            const deps = mockDeps();
            const response = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);
            
            assertEquals(response.status, 404);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, ["Subscription not found or access denied", 404, dbError]);
            assertSpyCalls(stripeUpdateSpy, 0);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });

        it("should return 404 if subscription not found or user mismatch", async () => {
            selectSpies = createSelectSpies(null, null); // Simulate no data found
            mockSupabaseClient.from = spy(() => ({ select: selectSpies.selectSpy })) as any;
            const deps = mockDeps();
            const response = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);

            assertEquals(response.status, 404);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, ["Subscription not found or access denied", 404]);
            assertSpyCalls(stripeUpdateSpy, 0);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });

        it("should return 400 if subscription has no stripe_subscription_id", async () => {
            const subWithoutStripeId = { ...mockSubData, stripe_subscription_id: null };
            selectSpies = createSelectSpies(subWithoutStripeId);
            mockSupabaseClient.from = spy(() => ({ select: selectSpies.selectSpy })) as any;
            const deps = mockDeps();
            const response = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);

            assertEquals(response.status, 400);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, ["No active Stripe subscription found", 400]);
            assertSpyCalls(stripeUpdateSpy, 0);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });

        it("should return 500 if Stripe update fails", async () => {
            const stripeError = new Error("Stripe API error");
            stripeUpdateSpy = createStripeUpdateSpy(null, stripeError); // Re-assign error spy
            mockStripeInstance.subscriptions.update = stripeUpdateSpy;
            const deps = mockDeps();
            const response = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);

            assertEquals(response.status, 500);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, [stripeError.message, 500, stripeError]);
            // Initial select should have happened
            assertSpyCalls(selectSpies.singleSpy, 1);
            // Stripe update was called
            assertSpyCalls(stripeUpdateSpy, 1);
            // Local update should NOT have happened
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });

        it("should still return success if local DB update fails after Stripe success", async () => {
            const updateError = new Error("Local DB update failed");
            updateSpies = createUpdateSpies(null, updateError); // Re-assign error spies
            // Adjust from mock to use the failing update spy
            mockSupabaseClient.from = spy((tableName: string) => {
                if (tableName === "user_subscriptions") {
                    return { select: selectSpies.selectSpy, update: updateSpies.updateSpy };
                }
                throw new Error(`Unexpected table: ${tableName}`);
            }) as any;
            const deps = mockDeps();
            const response = await cancelSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);
            const body = await response.json();

            assertEquals(response.status, 200); 
            assertSpyCalls(mockCreateSuccessResponse, 1);
            // Initial select happened
            assertSpyCalls(selectSpies.singleSpy, 1);
            // Stripe update happened
            assertSpyCalls(stripeUpdateSpy, 1);
            // Local update was called
            assertSpyCalls(updateSpies.updateSpy, 1);
            assertSpyCalls(updateSpies.singleSpy, 1); // The final .single() in the update chain
            // Response body should be the fallback { success: true }
            assertEquals(body, { success: true });
            assertSpyCalls(mockCreateErrorResponse, 0);
        });
    });

    // --- resumeSubscription Tests ---
    describe("resumeSubscription", () => {
        // Pre-define spies for this suite
        let selectSpies: ReturnType<typeof createSelectSpies>;
        let updateSpies: ReturnType<typeof createUpdateSpies>;
        let stripeUpdateSpy: Spy;
        
        beforeEach(() => {
            // Set up mocks assuming the subscription was previously set to cancel
            const initialSubData = { ...mockSubData, cancel_at_period_end: true };
            selectSpies = createSelectSpies(initialSubData);
            // Mock the update returning the resumed state
            updateSpies = createUpdateSpies({ ...mockSubData, cancel_at_period_end: false });
            // Mock stripe returning the resumed state
            stripeUpdateSpy = createStripeUpdateSpy({ id: stripeSubId, cancel_at_period_end: false, status: 'active' });
            
            mockSupabaseClient = {
                from: spy((tableName: string) => {
                    if (tableName === "user_subscriptions") {
                        return { select: selectSpies.selectSpy, update: updateSpies.updateSpy };
                    }
                    throw new Error(`Unexpected table: ${tableName}`);
                })
            } as any;
            mockStripeInstance.subscriptions.update = stripeUpdateSpy;
        });

        it("should successfully resume a subscription", async () => {
            const deps = mockDeps();
            const response = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);
            const body = await response.json();

            assertEquals(response.status, 200);
            assertSpyCalls(mockCreateSuccessResponse, 1);
            // Initial select
            assertSpyCalls(selectSpies.selectSpy, 1);
            assertSpyCalls(selectSpies.eqSubIdSpy, 1, { args: ["id", subscriptionId] });
            assertSpyCalls(selectSpies.eqUserSpy, 1, { args: ["user_id", userId] });
            assertSpyCalls(selectSpies.singleSpy, 1);
            // Stripe update
            assertSpyCalls(stripeUpdateSpy, 1);
            assertEquals(stripeUpdateSpy.calls[0].args[0], stripeSubId);
            assertEquals(stripeUpdateSpy.calls[0].args[1], { cancel_at_period_end: false });
            // Local DB update
            assertSpyCalls(updateSpies.updateSpy, 1);
            assertEquals(updateSpies.updateSpy.calls[0].args[0], { cancel_at_period_end: false, status: 'active' });
            assertSpyCalls(updateSpies.eqSpy, 1, { args: ["id", subscriptionId] });
            assertSpyCalls(updateSpies.selectSpy, 1);
            assertSpyCalls(updateSpies.singleSpy, 1);
            // Response body
            assertEquals(body.id, subscriptionId);
            assertEquals(body.cancel_at_period_end, false);
            assertSpyCalls(mockCreateErrorResponse, 0);
        });

        it("should return 404 if initial subscription query fails", async () => {
            const dbError = new Error("DB read failed");
            selectSpies = createSelectSpies(null, dbError); 
            mockSupabaseClient.from = spy(() => ({ select: selectSpies.selectSpy })) as any;
            const deps = mockDeps();
            const response = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);
            
            assertEquals(response.status, 404);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, ["Subscription not found or access denied", 404, dbError]);
            assertSpyCalls(stripeUpdateSpy, 0);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });
        
        it("should return 404 if subscription not found or user mismatch", async () => {
            selectSpies = createSelectSpies(null, null); 
            mockSupabaseClient.from = spy(() => ({ select: selectSpies.selectSpy })) as any;
            const deps = mockDeps();
            const response = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);

            assertEquals(response.status, 404);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, ["Subscription not found or access denied", 404]);
            assertSpyCalls(stripeUpdateSpy, 0);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });
        
        it("should return 400 if subscription has no stripe_subscription_id", async () => {
             const subWithoutStripeId = { ...mockSubData, stripe_subscription_id: null, cancel_at_period_end: true };
            selectSpies = createSelectSpies(subWithoutStripeId);
            mockSupabaseClient.from = spy(() => ({ select: selectSpies.selectSpy })) as any;
            const deps = mockDeps();
            const response = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);

            assertEquals(response.status, 400);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, ["No active Stripe subscription found", 400]);
            assertSpyCalls(stripeUpdateSpy, 0);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });
        
        it("should return 500 if Stripe update fails", async () => {
            const stripeError = new Error("Stripe API error resume");
            stripeUpdateSpy = createStripeUpdateSpy(null, stripeError); 
            mockStripeInstance.subscriptions.update = stripeUpdateSpy;
            const deps = mockDeps();
            const response = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);

            assertEquals(response.status, 500);
            assertSpyCalls(mockCreateErrorResponse, 1);
            assertEquals(mockCreateErrorResponse.calls[0].args, [stripeError.message, 500, stripeError]);
            assertSpyCalls(selectSpies.singleSpy, 1);
            assertSpyCalls(stripeUpdateSpy, 1);
            assertSpyCalls(updateSpies.updateSpy, 0);
            assertSpyCalls(mockCreateSuccessResponse, 0);
        });
        
        it("should still return success if local DB update fails after Stripe success", async () => {
            const updateError = new Error("Local DB update failed resume");
            updateSpies = createUpdateSpies(null, updateError); 
            mockSupabaseClient.from = spy((tableName: string) => {
                if (tableName === "user_subscriptions") {
                    return { select: selectSpies.selectSpy, update: updateSpies.updateSpy };
                }
                throw new Error(`Unexpected table: ${tableName}`);
            }) as any;
            const deps = mockDeps();
            const response = await resumeSubscription(mockSupabaseClient, mockStripeInstance, userId, subscriptionId, deps);
            const body = await response.json();

            assertEquals(response.status, 200); 
            assertSpyCalls(mockCreateSuccessResponse, 1);
            assertSpyCalls(selectSpies.singleSpy, 1);
            assertSpyCalls(stripeUpdateSpy, 1);
            assertSpyCalls(updateSpies.updateSpy, 1);
            assertSpyCalls(updateSpies.singleSpy, 1); 
            assertEquals(body, { success: true }); // Fallback response
            assertSpyCalls(mockCreateErrorResponse, 0);
        });
    });
}); 