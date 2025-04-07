import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { getCurrentSubscription } from "./current.ts";
import { 
    createErrorResponse, 
    createSuccessResponse, 
    type createErrorResponse as CreateErrorResponseType, 
    type createSuccessResponse as CreateSuccessResponseType 
} from "@shared/responses.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
let mockCreateErrorResponse: Spy<CreateErrorResponseType>;
let mockCreateSuccessResponse: Spy<CreateSuccessResponseType>;
// Declare spies in describe scope
let selectSpy: Spy;
let eqSpy: Spy;
let maybeSingleSpy: Spy;

// --- Mock Setup Helpers ---

// For .select(...).eq("user_id", userId).maybeSingle()
const createSelectSpies = (data: any = null, error: any = null) => {
    const maybeSingleSpy = spy(() => Promise.resolve({ data, error }));
    const eqSpy = spy(() => ({ maybeSingle: maybeSingleSpy }));
    const selectSpy = spy(() => ({ eq: eqSpy }));
    return { selectSpy, eqSpy, maybeSingleSpy };
};

// Mock dependencies object
const mockDeps = () => ({
  createErrorResponse: mockCreateErrorResponse,
  createSuccessResponse: mockCreateSuccessResponse,
});

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
        // Reset spies
        mockCreateErrorResponse = spy(createErrorResponse);
        mockCreateSuccessResponse = spy(createSuccessResponse);

        // Default successful mock setup (with plan) - Assign to describe-scoped vars
        const spies = createSelectSpies(mockSubDataWithPlan);
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        maybeSingleSpy = spies.maybeSingleSpy;
        
        mockSupabaseClient = {
            from: spy((tableName: string) => {
                if (tableName === "user_subscriptions") {
                    // Use the describe-scoped selectSpy directly
                    return { select: selectSpy }; 
                }
                throw new Error(`Unexpected table: ${tableName}`);
            })
        } as unknown as SupabaseClient;
    });

    it("should successfully fetch and return subscription with plan details", async () => {
        // Arrange - Uses spies set in beforeEach
        const deps = mockDeps();
        const response = await getCurrentSubscription(mockSupabaseClient, userId, deps);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query Chain using describe-scoped spies
        assertSpyCalls(selectSpy, 1); 
        assertSpyCalls(eqSpy, 1, { args: ["user_id", userId] });
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Response Body Structure
        assertEquals(body.id, mockSubDataWithPlan.id);
        assertEquals(body.userId, userId);
        assertEquals(body.status, 'active');
        assertExists(body.plan);
        assertEquals(body.plan.id, mockSubDataWithPlan.plan_id);
        assertEquals(body.plan.name, 'Pro Plan');
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should successfully fetch and return subscription without plan details if plan_id is null", async () => {
        // Arrange - Override spies for this test
        const spiesWithoutPlan = createSelectSpies(mockSubDataWithoutPlan);
        selectSpy = spiesWithoutPlan.selectSpy;
        eqSpy = spiesWithoutPlan.eqSpy;
        maybeSingleSpy = spiesWithoutPlan.maybeSingleSpy;
        // Re-assign from mock to use the new selectSpy
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        const response = await getCurrentSubscription(mockSupabaseClient, userId, deps);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query Chain
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1, { args: ["user_id", userId] });
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Response Body Structure
        assertEquals(body.id, mockSubDataWithoutPlan.id);
        assertEquals(body.userId, userId);
        assertEquals(body.status, 'free');
        assertEquals(body.plan, null); // Assert plan is null
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should return 500 if database query fails", async () => {
        // Arrange - Override spies for error
        const dbError = new Error("Connection failed");
        const spiesWithError = createSelectSpies(null, dbError);
        selectSpy = spiesWithError.selectSpy;
        eqSpy = spiesWithError.eqSpy;
        maybeSingleSpy = spiesWithError.maybeSingleSpy;
        // Re-assign from mock
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        const response = await getCurrentSubscription(mockSupabaseClient, userId, deps);

        assertEquals(response.status, 500);
        assertSpyCalls(mockCreateErrorResponse, 1);
        // Assert DB Query Chain was called
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1, { args: ["user_id", userId] });
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert error response args
        assertEquals(mockCreateErrorResponse.calls[0].args, ["Failed to retrieve subscription data", 500, dbError]);
        assertSpyCalls(mockCreateSuccessResponse, 0);
    });

    it("should return 404 if no subscription record is found for the user", async () => {
        // Arrange - Override spies for null data
        const spiesWithNull = createSelectSpies(null, null);
        selectSpy = spiesWithNull.selectSpy;
        eqSpy = spiesWithNull.eqSpy;
        maybeSingleSpy = spiesWithNull.maybeSingleSpy;
        // Re-assign from mock
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        const response = await getCurrentSubscription(mockSupabaseClient, userId, deps);

        assertEquals(response.status, 404);
        assertSpyCalls(mockCreateErrorResponse, 1);
        // Assert DB Query Chain was called
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1, { args: ["user_id", userId] });
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert error response args
        assertEquals(mockCreateErrorResponse.calls[0].args, ["Subscription not found", 404]);
        assertSpyCalls(mockCreateSuccessResponse, 0);
    });

}); 