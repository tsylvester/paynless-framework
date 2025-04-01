import { SupabaseClient } from "../../_shared/auth.ts";
import { 
  createErrorResponse, 
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";
import { UserSubscription } from "../types.ts";

/**
 * Get current user subscription
 */
export const getCurrentSubscription = async (
  supabase: SupabaseClient,
  userId: string
): Promise<Response> => {
  try {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        subscription_plans:plan_id (*)
      `)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error) {
      return createErrorResponse(error.message, 400);
    }
    
    // User should always have a subscription record thanks to the database trigger
    // But handle the rare case where they might not
    if (!data) {
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
    console.error("Error getting subscription:", err);
    return createErrorResponse(err.message);
  }
};