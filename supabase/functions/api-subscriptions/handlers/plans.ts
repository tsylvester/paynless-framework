import { SupabaseClient } from "../../_shared/auth.ts";
import { 
  createErrorResponse, 
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";
import { SubscriptionPlan } from "../types.ts";

/**
 * Get available subscription plans
 */
export const getSubscriptionPlans = async (
  supabase: SupabaseClient,
  isTestMode: boolean
): Promise<Response> => {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("amount", { ascending: true });
    
    if (error) {
      return createErrorResponse(error.message, 400);
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
    
    return createSuccessResponse(subscriptionPlans);
  } catch (err) {
    console.error("Error getting subscription plans:", err);
    return createErrorResponse(err.message);
  }
};