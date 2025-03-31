import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.11.0";

/**
 * Handle customer.subscription.updated event
 */
export const handleSubscriptionUpdated = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<void> => {
  const customerId = subscription.customer as string;
  
  // Find user by Stripe customer ID
  const { data: userData, error: userError } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  
  if (userError || !userData) {
    throw new Error("User not found");
  }
  
  const userId = userData.id;
  const priceId = subscription.items.data[0]?.price.id;
  
  if (!priceId) {
    throw new Error("Missing price ID in subscription");
  }
  
  // Get plan from Supabase
  const { data: planData, error: planError } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("stripe_price_id", priceId)
    .single();
  
  if (planError || !planData) {
    throw new Error("Plan not found");
  }
  
  // Update subscription
  await supabase
    .from("user_subscriptions")
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      plan_id: planData.id,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
};

/**
 * Handle customer.subscription.deleted event
 */
export const handleSubscriptionDeleted = async (
  supabase: SupabaseClient,
  subscription: Stripe.Subscription
): Promise<void> => {
  // Update subscription status to canceled
  await supabase
    .from("user_subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
};