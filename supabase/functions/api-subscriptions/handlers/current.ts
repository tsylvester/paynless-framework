// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
import { type UserSubscription, type SubscriptionPlan } from "../../_shared/types.ts";
import { 
  createErrorResponse as CreateErrorResponseType, 
  createSuccessResponse as CreateSuccessResponseType 
} from "../../_shared/responses.ts";
import { corsHeaders } from "../../_shared/cors-headers.ts";

// Define Dependencies Type
interface GetCurrentDeps {
  createErrorResponse: typeof CreateErrorResponseType;
  createSuccessResponse: typeof CreateSuccessResponseType;
}

/**
 * Get current user subscription
 */
export const getCurrentSubscription = async (
  supabase: SupabaseClient,
  userId: string,
  deps: GetCurrentDeps // Add deps parameter
): Promise<Response> => {
  const { createErrorResponse, createSuccessResponse } = deps; // Destructure deps
  try {
    // Define the select query string
    const selectQuery = `
      *,
      subscription_plans:plan_id (*)
    `;

    const { data, error } = await supabase
      .from("user_subscriptions")
      .select(selectQuery)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error) {
      console.error(`Error fetching user subscription for ${userId}:`, error);
      // Return 500 for internal DB error
      return createErrorResponse("Failed to retrieve subscription data", 500, error);
    }
    
    // User should always have a subscription record thanks to the database trigger
    // But handle the rare case where they might not
    if (!data) {
      console.warn(`Subscription record not found for user ${userId}. This might indicate an issue with the profile creation trigger.`);
      return createErrorResponse("Subscription not found", 404);
    }
    
    // Transform the response to match client-side types
    const userSubscription: UserSubscription = {
      id: data.id,
      userId: data.user_id,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      status: data.status,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      plan: data.subscription_plans ? {
        id: data.subscription_plans.id,
        stripePriceId: data.subscription_plans.stripe_price_id,
        name: data.subscription_plans.name,
        description: data.subscription_plans.description,
        amount: data.subscription_plans.amount,
        currency: data.subscription_plans.currency,
        interval: data.subscription_plans.interval,
        intervalCount: data.subscription_plans.interval_count,
        metadata: data.subscription_plans.metadata,
      } : null,
    };
    
    return createSuccessResponse(userSubscription);
  } catch (err) {
    console.error(`Error getting subscription for user ${userId}:`, err);
    // Use deps function and pass error
    return createErrorResponse(err.message, 500, err);
  }
};