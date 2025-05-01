// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
// Fix: Import DB types, API types, and HandlerError
import type { Database } from '../../types_db.ts';
import { type SubscriptionUsageMetrics } from "../../_shared/types.ts";
import { HandlerError } from "./current.ts"; // Reuse HandlerError

// Remove old imports and Deps interface
// import { corsHeaders } from "../../_shared/cors-headers.ts"; // Removed
// import { 
//   createErrorResponse as CreateErrorResponseType, 
//   createSuccessResponse as CreateSuccessResponseType 
// } from "../../_shared/responses.ts"; // Removed
// 
// interface GetUsageDeps {
//   createErrorResponse: typeof CreateErrorResponseType;
//   createSuccessResponse: typeof CreateSuccessResponseType;
// } // Removed

// Fix: Define return type based on DB schema for subscription
type UserSubscriptionWithPlan = Database['public']['Tables']['user_subscriptions']['Row'] & {
  subscription_plans: Database['public']['Tables']['subscription_plans']['Row'] | null;
};

/**
 * Get usage metrics for a specific metric type.
 * Returns SubscriptionUsageMetrics data on success, throws HandlerError on failure.
 */
export const getUsageMetrics = async (
  supabase: SupabaseClient<Database>,
  userId: string,
  metric: string
  // Remove deps parameter
): Promise<SubscriptionUsageMetrics> => {
  // Remove destructuring of removed deps
  // const { createErrorResponse, createSuccessResponse } = deps;
  try {
    // Get current subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        subscription_plans:plan_id (*)
      `)
      .eq("user_id", userId)
      .returns<UserSubscriptionWithPlan[]>()
      .maybeSingle();
    
    if (subscriptionError) {
      console.error(`Error fetching subscription for usage metrics (user: ${userId}):`, subscriptionError);
      // Fix: Throw HandlerError
      throw new HandlerError("Failed to retrieve subscription data", 500, subscriptionError);
    }
    
    // Handle case where subscription record might be missing (though unlikely with trigger)
    if (!subscription) {
       console.warn(`Subscription record not found for user ${userId} when fetching usage.`);
       // Fix: Throw HandlerError
       throw new HandlerError("Subscription not found", 404);
    }

    // Handle different metrics
    let usageData: SubscriptionUsageMetrics;
    // Fix: Use type assertion for metadata after checking plan exists
    const planMetadata = subscription.subscription_plans?.metadata;
    let metadataObject: { [key: string]: any } | null = null;
    if (typeof planMetadata === 'object' && planMetadata !== null && !Array.isArray(planMetadata)) {
        metadataObject = planMetadata as { [key: string]: any };
    }
    
    switch (metric) {
      case "api-calls":
        // TODO: Implement actual usage tracking lookup
        usageData = {
          current: 0, // Placeholder
          limit: metadataObject?.api_limit ?? 0, // Use plan metadata, default 0
          reset_date: subscription?.current_period_end || null,
        };
        break;
        
      case "storage":
        // TODO: Implement actual usage tracking lookup
        usageData = {
          current: 0, // Placeholder (MB used)
          limit: metadataObject?.storage_limit ?? 0, // Placeholder (MB allowed)
        };
        break;
        
      default:
        // Fix: Throw HandlerError for unknown metric
        throw new HandlerError(`Unknown usage metric requested: ${metric}`, 400);
    }
    
    // Return usage data
    return usageData;

  } catch (err) {
    // Fix: Handle/re-throw HandlerError or wrap other errors
    if (err instanceof HandlerError) {
      throw err;
    }
    console.error(`Unexpected error getting usage metric '${metric}' for user ${userId}:`, err);
    const message = err instanceof Error ? err.message : String(err);
    throw new HandlerError(message, 500, err);
  }
};