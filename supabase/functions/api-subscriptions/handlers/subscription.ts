import { SupabaseClient } from "../../_shared/auth.ts";
import Stripe from "npm:stripe@14.11.0";
import { 
  createErrorResponse, 
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";

/**
 * Cancel a subscription at period end
 */
export const cancelSubscription = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  subscriptionId: string
): Promise<Response> => {
  try {
    // Get subscription to verify ownership
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .single();
    
    if (subscriptionError || !subscription) {
      return createErrorResponse("Subscription not found or access denied", 404);
    }
    
    if (!subscription.stripe_subscription_id) {
      return createErrorResponse("No active Stripe subscription found", 400);
    }
    
    // Cancel the subscription at period end
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    
    // Update local record
    await supabase
      .from("user_subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("id", subscriptionId);
    
    return createSuccessResponse({ success: true });
  } catch (err) {
    console.error("Error cancelling subscription:", err);
    return createErrorResponse(err.message);
  }
};

/**
 * Resume a subscription that was set to cancel
 */
export const resumeSubscription = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  subscriptionId: string
): Promise<Response> => {
  try {
    // Get subscription to verify ownership
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .single();
    
    if (subscriptionError || !subscription) {
      return createErrorResponse("Subscription not found or access denied", 404);
    }
    
    if (!subscription.stripe_subscription_id) {
      return createErrorResponse("No active Stripe subscription found", 400);
    }
    
    // Resume the subscription
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    
    // Update local record
    await supabase
      .from("user_subscriptions")
      .update({ cancel_at_period_end: false })
      .eq("id", subscriptionId);
    
    return createSuccessResponse({ success: true });
  } catch (err) {
    console.error("Error resuming subscription:", err);
    return createErrorResponse(err.message);
  }
};