import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { getSubscriptionPlans } from "./plans.ts";
import { HandlerError } from "./current.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/supabase.mock.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;

// --- Mock Setup Helpers ---

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
        // Use shared Supabase mock setup 
        // Configure it to return *all* active plans; filtering happens in handler
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                subscription_plans: {
                    select: () => Promise.resolve({ data: activeMockDbPlans, error: null })
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);
        mockSupabaseClient = client;
    });

    it("should successfully fetch and return applicable plans when isTestMode=true", async () => {
        // Arrange - Uses mock client from beforeEach (returns ALL active plans)
        const isTestMode = true;
        
        // Act: Call handler directly
        const result = await getSubscriptionPlans(mockSupabaseClient, isTestMode);

        // Assert: Check filtered results
        assertExists(result);
        // Only plans without test_mode or with test_mode=true (plan_1, plan_2, plan_4)
        assertEquals(result.length, 3); 
        const planIds = result.map(p => p.id);
        assertEquals(planIds.includes('plan_1'), true);
        assertEquals(planIds.includes('plan_2'), true); 
        assertEquals(planIds.includes('plan_4'), true);
        assertEquals(planIds.includes('plan_3'), false); // Live only should be filtered out
        // Check specific plan data transformation (if any - now returns raw DB data)
        const plan1 = result.find(p => p.id === 'plan_1');
        assertEquals(plan1?.name, 'Basic'); 
        assertEquals(plan1?.stripe_price_id, 'price_basic');
    });

    it("should successfully fetch and return applicable plans when isTestMode=false", async () => {
        // Arrange - Uses mock client from beforeEach
        const isTestMode = false;
        
        // Act: Call handler directly
        const result = await getSubscriptionPlans(mockSupabaseClient, isTestMode);

        // Assert: Check filtered results
        assertExists(result);
        // Only plans without test_mode or with test_mode=false (plan_1, plan_3, plan_4)
        assertEquals(result.length, 3);
        const planIds = result.map(p => p.id);
        assertEquals(planIds.includes('plan_1'), true);
        assertEquals(planIds.includes('plan_3'), true); // Live only should be included
        assertEquals(planIds.includes('plan_4'), true);
        assertEquals(planIds.includes('plan_2'), false); // Test only should be filtered out
    });

    it("should throw HandlerError(500) if database query fails", async () => {
        // Arrange: Configure mock for DB error
        const dbError = new Error("Database connection lost");
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                subscription_plans: {
                    select: () => Promise.resolve({ data: null, error: dbError })
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);
        
        // Act & Assert: Use assertRejects
        await assertRejects(
            async () => await getSubscriptionPlans(client, true),
            HandlerError,
            "Failed to retrieve subscription plans" // Expected message
        );
    });

    it("should return empty array if database returns null data", async () => {
        // Arrange: Configure mock for null data
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                subscription_plans: {
                    select: () => Promise.resolve({ data: null, error: null }) // No error, but null data
                }
            }
        };
        const { client } = createMockSupabaseClient(mockSupabaseConfig);
        
        // Act: Call handler directly
        const result = await getSubscriptionPlans(client, true);

        // Assert: Should return empty array
        assertEquals(result, []); 
    });

    // Optional: Test transformation logic if it were more complex

}); 