import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { getUsageMetrics } from "./usage.ts";
import { 
    createErrorResponse, 
    createSuccessResponse, 
    type createErrorResponse as CreateErrorResponseType, 
    type createSuccessResponse as CreateSuccessResponseType 
} from "../../_shared/responses.ts";

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
const userId = "user_usage_test";
const mockPlanData = {
    id: 'plan_usage', 
    metadata: { api_limit: 10000, storage_limit: 500 } // Example limits
};
const mockSubDataWithPlan = {
    id: 'sub_rec_usage', 
    user_id: userId,
    current_period_end: '2023-12-31T23:59:59Z',
    subscription_plans: mockPlanData
};
const mockSubDataWithoutPlan = {
    id: 'sub_rec_free', 
    user_id: userId,
    current_period_end: null,
    subscription_plans: null
};
const mockSubDataWithPlanNoLimits = {
    id: 'sub_rec_nolimits', 
    user_id: userId,
    current_period_end: '2023-11-30T23:59:59Z',
    subscription_plans: { id: 'plan_nolimits', metadata: {} } // Plan exists, metadata empty
};

// --- Test Suite ---
describe("getUsageMetrics Handler", () => {

    beforeEach(() => {
        // Reset spies
        mockCreateErrorResponse = spy(createErrorResponse);
        mockCreateSuccessResponse = spy(createSuccessResponse);

        // Default successful mock setup (with plan & limits)
        const spies = createSelectSpies(mockSubDataWithPlan);
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        maybeSingleSpy = spies.maybeSingleSpy;
        
        mockSupabaseClient = {
            from: spy((tableName: string) => {
                if (tableName === "user_subscriptions") {
                    return { select: selectSpy }; 
                }
                throw new Error(`Unexpected table: ${tableName}`);
            })
        } as unknown as SupabaseClient;
    });

    it("should return correct usage for 'api-calls'", async () => {
        // Arrange
        const deps = mockDeps();
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, "api-calls", deps);
        const body = await response.json();

        // Assert
        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1, { args: ["user_id", userId] });
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Body
        assertEquals(body.current, 0);
        assertEquals(body.limit, mockPlanData.metadata.api_limit);
        assertEquals(body.reset_date, mockSubDataWithPlan.current_period_end);
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should return correct usage for 'storage'", async () => {
        // Arrange
        const deps = mockDeps();
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, "storage", deps);
        const body = await response.json();

        // Assert
        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1, { args: ["user_id", userId] });
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Body
        assertEquals(body.current, 0);
        assertEquals(body.limit, mockPlanData.metadata.storage_limit);
        assertEquals(body.reset_date, undefined); // Reset date not applicable for storage in this example
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should return 400 for unknown metric", async () => {
        // Arrange
        const deps = mockDeps();
        const unknownMetric = "invalid-metric";
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, unknownMetric, deps);

        // Assert
        assertEquals(response.status, 400);
        assertSpyCalls(mockCreateErrorResponse, 1);
        // Assert DB Query was still called
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1);
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Error Message
        assertEquals(mockCreateErrorResponse.calls[0].args[0], `Unknown usage metric requested: ${unknownMetric}`);
        assertSpyCalls(mockCreateSuccessResponse, 0);
    });

    it("should return 500 if database query fails", async () => {
        // Arrange
        const dbError = new Error("DB error");
        const spies = createSelectSpies(null, dbError);
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        maybeSingleSpy = spies.maybeSingleSpy;
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, "api-calls", deps);

        // Assert
        assertEquals(response.status, 500);
        assertSpyCalls(mockCreateErrorResponse, 1);
        // Assert DB Query Chain
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1);
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Error Args
        assertEquals(mockCreateErrorResponse.calls[0].args, ["Failed to retrieve subscription data", 500, dbError]);
        assertSpyCalls(mockCreateSuccessResponse, 0);
    });

    it("should return 404 if subscription record not found", async () => {
        // Arrange
        const spies = createSelectSpies(null, null); // No data, no error
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        maybeSingleSpy = spies.maybeSingleSpy;
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, "api-calls", deps);

        // Assert
        assertEquals(response.status, 404);
        assertSpyCalls(mockCreateErrorResponse, 1);
        // Assert DB Query Chain
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1);
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Error Args
        assertEquals(mockCreateErrorResponse.calls[0].args, ["Subscription not found", 404]);
        assertSpyCalls(mockCreateSuccessResponse, 0);
    });

    it("should return default limits if subscription has no plan", async () => {
        // Arrange
        const spies = createSelectSpies(mockSubDataWithoutPlan);
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        maybeSingleSpy = spies.maybeSingleSpy;
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, "api-calls", deps);
        const body = await response.json();

        // Assert
        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1);
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Body - Limit should be default (0), reset date null
        assertEquals(body.current, 0);
        assertEquals(body.limit, 0);
        assertEquals(body.reset_date, null);
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

    it("should return default limits if plan has no limits in metadata", async () => {
        // Arrange
        const spies = createSelectSpies(mockSubDataWithPlanNoLimits);
        selectSpy = spies.selectSpy;
        eqSpy = spies.eqSpy;
        maybeSingleSpy = spies.maybeSingleSpy;
        mockSupabaseClient.from = spy(() => ({ select: selectSpy })) as any;
        const deps = mockDeps();
        
        // Act
        const response = await getUsageMetrics(mockSupabaseClient, userId, "storage", deps);
        const body = await response.json();

        // Assert
        assertEquals(response.status, 200);
        assertSpyCalls(mockCreateSuccessResponse, 1);
        // Assert DB Query
        assertSpyCalls(selectSpy, 1);
        assertSpyCalls(eqSpy, 1);
        assertSpyCalls(maybeSingleSpy, 1);
        // Assert Body - Limit should be default (0)
        assertEquals(body.current, 0);
        assertEquals(body.limit, 0);
        assertEquals(body.reset_date, undefined);
        assertSpyCalls(mockCreateErrorResponse, 0);
    });

}); 