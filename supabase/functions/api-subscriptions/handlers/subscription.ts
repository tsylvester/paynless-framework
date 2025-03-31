import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.11.0";
import { corsHeaders } from "../types.ts";

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
      return new Response(JSON.stringify({ error: "Subscription not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!subscription.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "No active Stripe subscription found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      return new Response(JSON.stringify({ error: "Subscription not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!subscription.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "No active Stripe subscription found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};