import { SupabaseClient } from "@shared/auth.ts";
import { 
  createErrorResponse as CreateErrorResponseType, 
  createSuccessResponse as CreateSuccessResponseType 
} from "@shared/responses.ts";
import { SubscriptionUsageMetrics } from "../types.ts";

// Define Dependencies Type
interface GetUsageDeps {
  createErrorResponse: typeof CreateErrorResponseType;
  createSuccessResponse: typeof CreateSuccessResponseType;
}

/**
 * Get usage metrics for a specific metric type
 */
export const getUsageMetrics = async (
  supabase: SupabaseClient,
  userId: string,
  metric: string,
  deps: GetUsageDeps // Add deps parameter
): Promise<Response> => {
  const { createErrorResponse, createSuccessResponse } = deps; // Destructure deps
  try {
    // Get current subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        subscription_plans:plan_id (*)
      `)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (subscriptionError) {
      console.error(`Error fetching subscription for usage metrics (user: ${userId}):`, subscriptionError);
      // Return 500 for internal DB error
      return createErrorResponse("Failed to retrieve subscription data", 500, subscriptionError);
    }
    
    // Handle case where subscription record might be missing (though unlikely with trigger)
    if (!subscription) {
       console.warn(`Subscription record not found for user ${userId} when fetching usage.`);
       return createErrorResponse("Subscription not found", 404);
    }

    // Handle different metrics
    let usageData: SubscriptionUsageMetrics;
    const planMetadata = subscription?.subscription_plans?.metadata || {};
    
    switch (metric) {
      case "api-calls":
        // TODO: Implement actual usage tracking lookup
        usageData = {
          current: 0, // Placeholder
          limit: planMetadata?.api_limit ?? 0, // Use plan metadata, default 0
          reset_date: subscription?.current_period_end || null,
        };
        break;
        
      case "storage":
        // TODO: Implement actual usage tracking lookup
        usageData = {
          current: 0, // Placeholder (MB used)
          limit: planMetadata?.storage_limit ?? 0, // Placeholder (MB allowed)
        };
        break;
        
      default:
        return createErrorResponse(`Unknown usage metric requested: ${metric}`, 400);
    }
    
    return createSuccessResponse(usageData);
  } catch (err) {
    console.error(`Error getting usage metric '${metric}' for user ${userId}:`, err);
    // Use deps function and pass error
    return createErrorResponse(err.message, 500, err);
  }
};