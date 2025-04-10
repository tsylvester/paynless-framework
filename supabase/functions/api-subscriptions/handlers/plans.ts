// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "../../_shared/auth.ts";
import { 
  createErrorResponse as CreateErrorResponseType, 
  createSuccessResponse as CreateSuccessResponseType 
} from "../../_shared/responses.ts";
import { SubscriptionPlan } from "../types.ts";

// Define Dependencies Type
interface GetPlansDeps {
  createErrorResponse: typeof CreateErrorResponseType;
  createSuccessResponse: typeof CreateSuccessResponseType;
}

/**
 * Get available subscription plans
 */
export const getSubscriptionPlans = async (
  supabase: SupabaseClient,
  isTestMode: boolean,
  deps: GetPlansDeps // Add deps parameter
): Promise<Response> => {
  const { createErrorResponse, createSuccessResponse } = deps; // Destructure deps
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("amount", { ascending: true });
    
    if (error) {
      console.error("Error fetching subscription plans:", error);
      // Return 500 for internal DB error
      return createErrorResponse("Failed to retrieve subscription plans", 500, error);
    }
    
    // Handle case where data is null/undefined (shouldn't happen with select * unless error, but good practice)
    if (!data) {
        console.warn("No subscription plan data returned, even without error.");
        return createSuccessResponse({ plans: [] }); // Return empty array
    }

    // Filter plans based on the test_mode field in metadata
    const filteredPlans = data.filter(plan => {
      const metadata = plan.metadata || {};
      // If no test_mode specified in metadata, include the plan in both modes
      if (metadata.test_mode === undefined) return true;
      // Otherwise, only include if the test_mode matches the current mode
      return metadata.test_mode === isTestMode;
    });
    
    // Transform the response to match client-side types
    const subscriptionPlans: SubscriptionPlan[] = filteredPlans.map(plan => ({
      id: plan.id,
      stripePriceId: plan.stripe_price_id,
      name: plan.name,
      description: plan.description,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      intervalCount: plan.interval_count,
      metadata: plan.metadata,
    }));
    
    // ---> Add Logging <---
    const responsePayload = { plans: subscriptionPlans };
    console.log('[plans.ts] Handler returning success payload:', JSON.stringify(responsePayload));
    // ---> End Logging <---

    // Return the plans wrapped in an object with a 'plans' key
    return createSuccessResponse(responsePayload);
  } catch (err) {
    console.error("Error getting subscription plans:", err);
    // Use deps function and pass error
    return createErrorResponse(err.message, 500, err);
  }
};