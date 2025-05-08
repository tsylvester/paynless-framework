// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
// Fix: Import DB types and HandlerError
import type { Database } from '../../types_db.ts';
import { HandlerError } from "./current.ts"; // Reuse HandlerError

// Fix: Define return type based on DB schema (same as current.ts)
type UserSubscriptionData = Database['public']['Tables']['user_subscriptions']['Row'] & {
  subscription_plans: Database['public']['Tables']['subscription_plans']['Row'] | null;
};

/**
 * Cancel a subscription at period end.
 * Returns updated subscription data on success, throws HandlerError on failure.
 */
export const cancelSubscription = async (
  supabase: SupabaseClient<Database>,
  stripe: Stripe,
  userId: string,
  subscriptionId: string
  // Remove deps parameter
): Promise<UserSubscriptionData> => {
  // Remove destructuring of removed deps
  // const { createErrorResponse, createSuccessResponse } = deps;
  try {
    // Get subscription to verify ownership
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("*, subscription_plans:plan_id(*)") // Fetch nested plan data
      .eq("stripe_subscription_id", subscriptionId)
      .eq("user_id", userId)
      .returns<UserSubscriptionData[]>() // Specify return type array
      .single(); // Expect single result
    
    if (subscriptionError) {
      console.error("Error fetching subscription for cancel:", subscriptionError);
      // Fix: Throw HandlerError (404 for not found/access denied)
      throw new HandlerError("Subscription not found or access denied", 404, subscriptionError);
    }
    // No need for !subscription check as .single() throws if not found
    
    if (!subscription.stripe_subscription_id) {
      // This case might be redundant if the query finds the record based on stripe_subscription_id
      console.warn(`Subscription record ${subscription.id} found but missing stripe_subscription_id during cancel.`);
      // Fix: Throw HandlerError for inconsistent data
      throw new HandlerError("Subscription data inconsistent", 400);
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
      .eq("id", subscription.id)
      .select("*, subscription_plans:plan_id(*)") // Fetch updated data with plan
      .returns<UserSubscriptionData[]>()
      .single();
      
    if (updateError) {
        console.error("Error updating local subscription after cancel:", updateError);
        // Fix: Throw HandlerError - critical failure if DB update fails
        throw new HandlerError("Failed to update local subscription status after cancellation", 500, updateError);
    }
    
    // Return updated local subscription data
    return updatedLocalSub;

  } catch (err) {
    // If we caught a specific PGRST116 error from .single(), treat it as 404
    if (err instanceof Error && 'code' in err && (err as any).code === 'PGRST116') {
      console.error("Caught PGRST116 from .single(), throwing 404 HandlerError:", err);
      throw new HandlerError("Subscription not found or access denied", 404, err);
    }
    // If it's already a HandlerError, re-throw it
    if (err instanceof HandlerError) {
      throw err;
    }
    // Otherwise, wrap other errors
    console.error("Error cancelling subscription:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = (err instanceof Stripe.errors.StripeError) ? (err.statusCode ?? 500) : 500;
    throw new HandlerError(message, status, err instanceof Error ? err : undefined);
  }
};

/**
 * Resume a subscription that was set to cancel.
 * Returns updated subscription data on success, throws HandlerError on failure.
 */
export const resumeSubscription = async (
  supabase: SupabaseClient<Database>,
  stripe: Stripe,
  userId: string,
  subscriptionId: string
  // Remove deps parameter
): Promise<UserSubscriptionData> => {
  // Remove destructuring of removed deps
  // const { createErrorResponse, createSuccessResponse } = deps;
  try {
    // Get subscription to verify ownership
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("*, subscription_plans:plan_id(*)") // Fetch nested plan data
      .eq("stripe_subscription_id", subscriptionId)
      .eq("user_id", userId)
      .returns<UserSubscriptionData[]>()
      .single();
    
    if (subscriptionError) {
       console.error("Error fetching subscription for resume:", subscriptionError);
       // Fix: Throw HandlerError
       throw new HandlerError("Subscription not found or access denied", 404, subscriptionError);
    }
    // No need for !subscription check
    
    if (!subscription.stripe_subscription_id) {
      // Fix: Throw HandlerError
      console.warn(`Subscription record ${subscription.id} found but missing stripe_subscription_id during resume.`);
      throw new HandlerError("Subscription data inconsistent", 400);
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
      .eq("id", subscription.id)
      .select("*, subscription_plans:plan_id(*)") // Fetch updated data
      .returns<UserSubscriptionData[]>()
      .single();
      
    if (updateError) {
        console.error("Error updating local subscription after resume:", updateError);
        // Fix: Throw HandlerError
        throw new HandlerError("Failed to update local subscription status after resumption", 500, updateError);
    }
    
    // Return updated local subscription data
    return updatedLocalSub;

  } catch (err) {
    // If we caught a specific PGRST116 error from .single(), treat it as 404
    if (err instanceof Error && 'code' in err && (err as any).code === 'PGRST116') {
      console.error("Caught PGRST116 from .single(), throwing 404 HandlerError:", err);
      throw new HandlerError("Subscription not found or access denied", 404, err);
    }
    // If it's already a HandlerError, re-throw it
    if (err instanceof HandlerError) {
      throw err;
    }
    // Otherwise, wrap other errors
    console.error("Error resuming subscription:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = (err instanceof Stripe.errors.StripeError) ? (err.statusCode ?? 500) : 500;
    throw new HandlerError(message, status, err instanceof Error ? err : undefined);
  }
};