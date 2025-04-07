import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { getSubscriptionPlans } from "./plans.ts";
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
// Define spies in outer scope to be shared
let selectSpy: Spy;
let eqSpy: Spy;
let orderSpy: Spy;

// --- Mock Setup Helpers ---

// For .select("*").eq("active", true).order()
const createSelectSpies = (data: any[] | null = null, error: any = null) => {
    const orderSpy = spy(() => Promise.resolve({ data, error }));
    const eqSpy = spy(() => ({ order: orderSpy }));
    const selectSpy = spy(() => ({ eq: eqSpy }));
    return { selectSpy, eqSpy, orderSpy };
};

// Mock dependencies object
const mockDeps = () => ({
  createErrorResponse: mockCreateErrorResponse,
  createSuccessResponse: mockCreateSuccessResponse,
});

// --- Test Data ---
const mockDbPlans = [
    { id: 'plan_1', active: true, amount: 1000, metadata: {}, name: 'Basic', stripe_price_id: 'price_basic', currency: 'usd', interval: 'month', interval_count: 1, description: 'Basic Plan' },
    { id: 'plan_2', active: true, amount: 2000, metadata: { test_mode: true }, name: 'Test Only', stripe_price_id: 'price_test', currency: 'usd', interval: 'month', interval_count: 1, description: 'Test Plan' },
    { id: 'plan_3', active: true, amount: 3000, metadata: { test_mode: false }, name: 'Live Only', stripe_price_id: 'price_live', currency: 'usd', interval: 'month', interval_count: 1, description: 'Live Plan' },
    { id: 'plan_4', active: true, amount: 500, metadata: {}, name: 'Cheap', stripe_price_id: 'price_cheap', currency: 'usd', interval: 'month', interval_count: 1, description: 'Cheap Plan' },
    { id: 'plan_5', active: false, amount: 4000, metadata: {}, name: 'Inactive', stripe_price_id: 'price_inactive', currency: 'usd', interval: 'month', interval_count: 1, description: 'Inactive Plan' }, // Should be filtered by query
];
// Filtered data to simulate DB query result
const activeMockDbPlans = mockDbPlans.filter(p => p.active);

// --- Test Suite ---
describe("getSubscriptionPlans Handler", () => {

    beforeEach(() => {
        // Reset spies
        mockCreateErrorResponse = spy(createErrorResponse);
        mockCreateSuccessResponse = spy(createSuccessResponse);

        // Create and assign spies using ACTIVE plans
        const spies = createSelectSpies(activeMockDbPlans);
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        orderSpy = spies.orderSpy;
        
        mockSupabaseClient = {
            from: spy((tableName: string) => {
                if (tableName === "subscription_plans") {
                    // Return the chain with spies created in this scope
                    return { select: selectSpy };
                }
                throw new Error(`Unexpected table: ${tableName}`);
            })
        } as unknown as SupabaseClient;
    });

    it("should successfully fetch and return all applicable plans when isTestMode=true", async () => {
        // Arrange - Use mocks from beforeEach
        const deps = mockDeps();
        
        // Act
        const response = await getSubscriptionPlans(mockSupabaseClient, true, deps);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query Chain (using spies from beforeEach)
        assertSpyCalls(selectSpy, 1, { args: ["*"] });
        assertSpyCalls(eqSpy, 1, { args: ["active", true] });
        assertSpyCalls(orderSpy, 1, { args: ["amount", { ascending: true }] });
        // Assert Response Body
        assertExists(body.plans);
        assertEquals(body.plans.length, 3); // plan_1, plan_2, plan_4 (active plans only)
        const planIds = body.plans.map((p: any) => p.id);
        assertEquals(planIds.includes('plan_1'), true);
        assertEquals(planIds.includes('plan_2'), true); 
        assertEquals(planIds.includes('plan_4'), true);
        assertEquals(planIds.includes('plan_3'), false); 
        const plan1 = body.plans.find((p: any) => p.id === 'plan_1');
        assertEquals(plan1.name, 'Basic');
        assertEquals(plan1.stripePriceId, 'price_basic');
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should successfully fetch and return all applicable plans when isTestMode=false", async () => {
        // Arrange - Use mocks from beforeEach
        const deps = mockDeps();
        
        // Act
        const response = await getSubscriptionPlans(mockSupabaseClient, false, deps);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query Chain (using spies from beforeEach)
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1);
        assertSpyCalls(orderSpy, 1);
        // Assert Response Body
        assertExists(body.plans);
        assertEquals(body.plans.length, 3); // plan_1, plan_3, plan_4 (active plans only)
        const planIds = body.plans.map((p: any) => p.id);
        assertEquals(planIds.includes('plan_1'), true);
        assertEquals(planIds.includes('plan_3'), true); 
        assertEquals(planIds.includes('plan_4'), true);
        assertEquals(planIds.includes('plan_2'), false); 
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should return 500 if database query fails", async () => {
        // Arrange - Override mock for this specific test
        const dbError = new Error("Database connection lost");
        const spiesWithError = createSelectSpies(null, dbError);
        mockSupabaseClient.from = spy(() => ({ select: spiesWithError.selectSpy })) as any;
        const deps = mockDeps();
        
        // Act
        const response = await getSubscriptionPlans(mockSupabaseClient, true, deps);

        assertEquals(response.status, 500);
        assertSpyCalls(mockCreateErrorResponse, 1);
        // Assert DB Query Chain was called (using the error spies)
        assertSpyCalls(spiesWithError.selectSpy, 1);
        assertSpyCalls(spiesWithError.eqSpy, 1);
        assertSpyCalls(spiesWithError.orderSpy, 1);
        // Assert error response args
        assertEquals(mockCreateErrorResponse.calls[0].args, ["Failed to retrieve subscription plans", 500, dbError]);
        assertSpyCalls(mockCreateSuccessResponse, 0);
    });

    it("should return success with empty array if database returns null data", async () => {
        // Arrange - Override mock for this specific test
        const spiesWithNull = createSelectSpies(null, null); 
        mockSupabaseClient.from = spy(() => ({ select: spiesWithNull.selectSpy })) as any;
        const deps = mockDeps();
        
        // Act
        const response = await getSubscriptionPlans(mockSupabaseClient, true, deps);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query Chain was called (using the null spies)
        assertSpyCalls(spiesWithNull.selectSpy, 1);
        assertSpyCalls(spiesWithNull.eqSpy, 1);
        assertSpyCalls(spiesWithNull.orderSpy, 1);
        // Assert specific success response
        assertEquals(mockCreateSuccessResponse.calls[0].args[0], { plans: [] });
        assertEquals(body, { plans: [] });
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    // Optional: Test transformation logic if it were more complex

}); 