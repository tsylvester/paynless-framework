// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { type UserSubscription } from "../../_shared/types.ts";
import { corsHeaders } from "../../_shared/cors-headers.ts";
import { 
  createErrorResponse as CreateErrorResponseType, 
  createSuccessResponse as CreateSuccessResponseType 
} from "../../_shared/responses.ts";
import { SubscriptionCancelResumeRequest } from "../types.ts";

// Define Dependencies Type
interface SubscriptionActionDeps {
  createErrorResponse: typeof CreateErrorResponseType;
  createSuccessResponse: typeof CreateSuccessResponseType;
}

/**
 * Cancel a subscription at period end
 */
export const cancelSubscription = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  subscriptionId: string,
  deps: SubscriptionActionDeps
): Promise<Response> => {
  const { createErrorResponse, createSuccessResponse } = deps;
  try {
    // Get subscription to verify ownership
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("*, plans:subscription_plans(*)")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .single();
    
    if (subscriptionError) {
      console.error("Error fetching subscription for cancel:", subscriptionError);
      return createErrorResponse("Subscription not found or access denied", 404, subscriptionError);
    }
    if (!subscription) {
        return createErrorResponse("Subscription not found or access denied", 404);
    }
    
    if (!subscription.stripe_subscription_id) {
      return createErrorResponse("No active Stripe subscription found", 400);
    }
    
    // Stripe: Cancel the subscription at period end
    const updatedStripeSub = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    
    // Local DB: Update record
    const { data: updatedLocalSub, error: updateError } = await supabase
      .from("user_subscriptions")
      .update({ 
          cancel_at_period_end: updatedStripeSub.cancel_at_period_end,
          status: updatedStripeSub.status
       })
      .eq("id", subscriptionId)
      .select("*, plans:subscription_plans(*)")
      .single();
      
    if (updateError) {
        console.error("Error updating local subscription after cancel:", updateError);
    }
    
    return createSuccessResponse(updatedLocalSub ?? { success: true }); 
  } catch (err) {
    console.error("Error cancelling subscription:", err);
    return createErrorResponse(err.message, 500, err);
  }
};

/**
 * Resume a subscription that was set to cancel
 */
export const resumeSubscription = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  subscriptionId: string,
  deps: SubscriptionActionDeps
): Promise<Response> => {
  const { createErrorResponse, createSuccessResponse } = deps;
  try {
    // Get subscription to verify ownership
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("*, plans:subscription_plans(*)")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .single();
    
    if (subscriptionError) {
       console.error("Error fetching subscription for resume:", subscriptionError);
       return createErrorResponse("Subscription not found or access denied", 404, subscriptionError);
    }
    if (!subscription) {
       return createErrorResponse("Subscription not found or access denied", 404);
    }
    
    if (!subscription.stripe_subscription_id) {
      return createErrorResponse("No active Stripe subscription found", 400);
    }
    
    // Stripe: Resume the subscription
    const updatedStripeSub = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    
    // Local DB: Update record
    const { data: updatedLocalSub, error: updateError } = await supabase
      .from("user_subscriptions")
      .update({ 
          cancel_at_period_end: updatedStripeSub.cancel_at_period_end,
          status: updatedStripeSub.status
      })
      .eq("id", subscriptionId)
      .select("*, plans:subscription_plans(*)")
      .single();
      
    if (updateError) {
        console.error("Error updating local subscription after resume:", updateError);
    }
    
    return createSuccessResponse(updatedLocalSub ?? { success: true });
  } catch (err) {
    console.error("Error resuming subscription:", err);
    return createErrorResponse(err.message, 500, err);
  }
};