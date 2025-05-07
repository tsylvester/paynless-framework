import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
// Remove old Deno mock import if only used for local spies
// import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock"; 
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { getUsageMetrics } from "./usage.ts";
import { HandlerError } from "./current.ts";
// Import shared mock utilities
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/supabase.mock.ts"; 

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
// Remove locally declared spies
// let selectSpy: Spy;
// let eqSpy: Spy;
// let maybeSingleSpy: Spy;

// --- Mock Setup Helpers ---
// Remove local createSelectSpies helper
/*
const createSelectSpies = (data: any = null, error: any = null) => {
    const maybeSingleSpy = spy(() => Promise.resolve({ data, error }));
    const returnsSpy = spy(() => ({ maybeSingle: maybeSingleSpy })); // Add returns spy
    const eqSpy = spy(() => ({ returns: returnsSpy })); // eq should return object with returns
    const selectSpy = spy(() => ({ eq: eqSpy }));
    return { selectSpy, eqSpy, maybeSingleSpy, returnsSpy }; // Return returnsSpy too
};
*/

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
        // Configure the mock Supabase client
        const mockConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: async (state) => { // Use async function for potential complexity
                        // Basic check: is this the query we expect?
                        // We could make this more robust by checking state.filters more deeply
                        if (state.filters.some(f => f.column === 'user_id' && f.value === userId)) {
                            return { data: [mockSubDataWithPlan], error: null }; // Return data as array
                        } else {
                            // Default or unexpected query
                            return { data: null, error: new Error("Mock not configured for this specific query") };
                        }
                    }
                }
            }
        };
        
        const { client } = createMockSupabaseClient(mockConfig);
        mockSupabaseClient = client; 
        // We no longer set global spies like selectSpy, eqSpy, etc.
    });

    it("should return correct usage for 'api-calls'", async () => {
        // Arrange (no deps needed)
        
        // Act
        const body = await getUsageMetrics(mockSupabaseClient, userId, "api-calls");

        // Assert
        // Assert DB Query - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1); 
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
        
        // Assert Body
        assertEquals(body.current, 0);
        assertEquals(body.limit, mockPlanData.metadata.api_limit);
        assertEquals(body.reset_date, mockSubDataWithPlan.current_period_end);
    });

    it("should return correct usage for 'storage'", async () => {
        // Arrange (no deps needed)
        
        // Act
        const body = await getUsageMetrics(mockSupabaseClient, userId, "storage");

        // Assert
        // Assert DB Query - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1);
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
        
        // Assert Body
        assertEquals(body.current, 0);
        assertEquals(body.limit, mockPlanData.metadata.storage_limit);
        assertEquals(body.reset_date, undefined);
    });

    it("should throw HandlerError(400) for unknown metric", async () => {
        // Arrange
        const unknownMetric = "invalid-metric";
        
        // Act & Assert
        await assertRejects(
            async () => await getUsageMetrics(mockSupabaseClient, userId, unknownMetric),
            HandlerError,
            `Unknown usage metric requested: ${unknownMetric}`
        );
        // Assert DB Query was still called - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1);
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
    });

    it("should throw HandlerError(500) if database query fails", async () => {
        // Arrange
        const dbError = new Error("DB error");
        // Reconfigure the client for this specific test case
        const mockConfigError: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: null, error: dbError })
                }
            }
        };
        const { client: errorClient } = createMockSupabaseClient(mockConfigError);
        // Removed old spy setup and client.from override
        
        // Act & Assert
        await assertRejects(
            async () => await getUsageMetrics(errorClient, userId, "api-calls"), // Use errorClient
            HandlerError,
            "Failed to retrieve subscription data"
        );
        // Assert DB Query Chain - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1);
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
    });

    it("should throw HandlerError(404) if subscription record not found", async () => {
        // Arrange
        // Reconfigure the client for this specific test case
        const mockConfigNotFound: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: null, error: null }) // No data, no error
                }
            }
        };
        const { client: notFoundClient } = createMockSupabaseClient(mockConfigNotFound);
        // Removed old spy setup and client.from override
        
        // Act & Assert
        await assertRejects(
             async () => await getUsageMetrics(notFoundClient, userId, "api-calls"), // Use notFoundClient
             HandlerError,
             "Subscription not found"
        );
        // Assert DB Query Chain - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1);
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
    });

    it("should return default limits if subscription has no plan", async () => {
        // Arrange
        // Reconfigure the client for this specific test case
        const mockConfigNoPlan: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                     select: () => Promise.resolve({ data: [mockSubDataWithoutPlan], error: null })
                }
            }
        };
        const { client: noPlanClient } = createMockSupabaseClient(mockConfigNoPlan);
        // Removed old spy setup and client.from override
        
        // Act
        const body = await getUsageMetrics(noPlanClient, userId, "api-calls"); // Use noPlanClient

        // Assert
        // Assert DB Query - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1);
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
        
        // Assert Body - Limit should be default (0), reset date null
        assertEquals(body.current, 0);
        assertEquals(body.limit, 0);
        assertEquals(body.reset_date, null);
    });

    it("should return default limits if plan has no limits in metadata", async () => {
        // Arrange
        // Reconfigure the client for this specific test case
        const mockConfigNoLimits: MockSupabaseDataConfig = {
            genericMockResults: {
                user_subscriptions: {
                    select: () => Promise.resolve({ data: [mockSubDataWithPlanNoLimits], error: null })
                }
            }
        };
        const { client: noLimitsClient } = createMockSupabaseClient(mockConfigNoLimits);
        // Removed old spy setup and client.from override
        
        // Act
        const body = await getUsageMetrics(noLimitsClient, userId, "storage"); // Use noLimitsClient

        // Assert
        // Assert DB Query - Removed old spy assertions
        // assertSpyCalls(selectSpy, 1);
        // assertSpyCalls(eqSpy, 1);
        // assertEquals(eqSpy.calls[0].args, ["user_id", userId]);
        // assertSpyCalls(maybeSingleSpy, 1);
        
        // Assert Body - Limit should be default (0)
        assertEquals(body.current, 0);
        assertEquals(body.limit, 0);
        assertEquals(body.reset_date, undefined);
    });

}); 