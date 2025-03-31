import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.11.0";

/**
 * Handle checkout.session.completed event
 */
export const handleCheckoutSessionCompleted = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<void> => {
  // Extract customer and subscription details
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const userId = session.metadata?.userId;
  
  if (!customerId || !subscriptionId || !userId) {
    throw new Error("Missing required metadata");
  }
  
  // Get subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
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
  
  // Check if user subscription already exists
  const { data: existingSubscription } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  
  if (existingSubscription) {
    // Update existing subscription
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
      .eq("id", existingSubscription.id);
  } else {
    // Create new subscription
    await supabase
      .from("user_subscriptions")
      .insert([
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          plan_id: planData.id,
        },
      ]);
  }
  
  // Record transaction
  await supabase
    .from("subscription_transactions")
    .insert([
      {
        user_id: userId,
        subscription_id: existingSubscription?.id,
        stripe_invoice_id: session.invoice,
        stripe_payment_intent_id: session.payment_intent,
        amount: session.amount_total,
        currency: session.currency,
        status: "succeeded",
      },
    ]);
};