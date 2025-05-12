import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { getCurrentSubscription, HandlerError } from "./current.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/supabase.mock.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;

// --- Mock Setup Helpers ---

// --- Test Data ---
const userId = "user_current_test";
const mockSubDataWithPlan = {
    id: 'sub_rec_1', 
    user_id: userId, 
    stripe_customer_id: 'cus_1', 
    stripe_subscription_id: 'sub_1', 
    status: 'active', 
    current_period_start: '2023-01-01T00:00:00Z', 
    current_period_end: '2023-02-01T00:00:00Z', 
    cancel_at_period_end: false, 
    plan_id: 'plan_abc', 
    subscription_plans: { // Nested plan data
        id: 'plan_abc', 
        stripe_price_id: 'price_abc', 
        name: 'Pro Plan', 
        description: 'The pro plan', 
        amount: 5000, 
        currency: 'usd', 
        interval: 'month', 
        interval_count: 1, 
        metadata: {}
    }
};

const mockSubDataWithoutPlan = {
    id: 'sub_rec_2', 
    user_id: userId, 
    stripe_customer_id: null, 
    stripe_subscription_id: null, 
    status: 'free', // e.g., free tier or initial state
    current_period_start: null, 
    current_period_end: null, 
    cancel_at_period_end: null, 
    plan_id: null, 
    subscription_plans: null // No nested plan data
};

// --- Test Suite ---
describe("getCurrentSubscription Handler", () => {

    beforeEach(() => {
        // Use shared Supabase mock setup (basic config, will be overridden)
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: [mockSubDataWithPlan], error: null })
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);
        mockSupabaseClient = client;
    });

    it("should successfully fetch and return subscription with plan details", async () => {
        // Arrange - mock client configured in beforeEach
        // Act: Call handler directly
        const result = await getCurrentSubscription(mockSupabaseClient, userId);
        
        // Assert: Check returned data directly
        assertEquals(result.id, mockSubDataWithPlan.id);
        assertEquals(result.user_id, userId);
        assertEquals(result.status, 'active');
        assertExists(result.subscription_plans); // Check the nested plan object exists
        assertEquals(result.subscription_plans?.id, mockSubDataWithPlan.plan_id);
        assertEquals(result.subscription_plans?.name, 'Pro Plan');
        // Removed old response/spy assertions
    });

    it("should successfully fetch and return subscription without plan details if plan_id is null", async () => {
        // Arrange: Configure mock for this specific case
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: [mockSubDataWithoutPlan], error: null })
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);
        // Use the client configured for this test
        const result = await getCurrentSubscription(client, userId);

        // Assert: Check returned data directly
        assertEquals(result.id, mockSubDataWithoutPlan.id);
        assertEquals(result.user_id, userId);
        assertEquals(result.status, 'free');
        assertEquals(result.subscription_plans, null); // Assert plan is null
        // Removed old response/spy assertions
    });

    it("should throw HandlerError(500) if database query fails", async () => {
        // Arrange: Configure mock for DB error
        const dbError = new Error("Connection failed");
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: null, error: dbError })
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);

        // Act & Assert: Use assertRejects
        await assertRejects(
            async () => await getCurrentSubscription(client, userId),
            HandlerError, // Expect HandlerError
            "Failed to retrieve subscription data" // Expected message
            // We could also check e.status === 500 and e.cause === dbError inside assertRejects if needed
        );
        // Removed old response/spy assertions
    });

    it("should throw HandlerError(404) if no subscription record is found for the user", async () => {
        // Arrange: Configure mock for no data found
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: null, error: null }) // No data, no error
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);
        
        // Act & Assert: Use assertRejects
        await assertRejects(
            async () => await getCurrentSubscription(client, userId),
            HandlerError,
            "Subscription not found" // Expected message
            // We could also check e.status === 404 inside assertRejects
        );
        // Removed old response/spy assertions
    });

}); 