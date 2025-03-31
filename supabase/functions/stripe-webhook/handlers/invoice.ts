import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

/**
 * Handle invoice.payment_succeeded event
 */
export const handleInvoicePaymentSucceeded = async (
  supabase: SupabaseClient,
  invoice: any
): Promise<void> => {
  if (!invoice.subscription) {
    return; // Skip non-subscription invoices
  }
  
  // Find subscription
  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from("user_subscriptions")
    .select("id, user_id")
    .eq("stripe_subscription_id", invoice.subscription)
    .single();
  
  if (subscriptionError || !subscriptionData) {
    throw new Error("Subscription not found");
  }
  
  // Record transaction
  await supabase
    .from("subscription_transactions")
    .insert([
      {
        user_id: subscriptionData.user_id,
        subscription_id: subscriptionData.id,
        stripe_invoice_id: invoice.id,
        stripe_payment_intent_id: invoice.payment_intent,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: "succeeded",
      },
    ]);
};

/**
 * Handle invoice.payment_failed event
 */
export const handleInvoicePaymentFailed = async (
  supabase: SupabaseClient,
  invoice: any
): Promise<void> => {
  if (!invoice.subscription) {
    return; // Skip non-subscription invoices
  }
  
  // Find subscription
  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from("user_subscriptions")
    .select("id, user_id")
    .eq("stripe_subscription_id", invoice.subscription)
    .single();
  
  if (subscriptionError || !subscriptionData) {
    throw new Error("Subscription not found");
  }
  
  // Record failed transaction
  await supabase
    .from("subscription_transactions")
    .insert([
      {
        user_id: subscriptionData.user_id,
        subscription_id: subscriptionData.id,
        stripe_invoice_id: invoice.id,
        stripe_payment_intent_id: invoice.payment_intent,
        amount: invoice.amount_due,
        currency: invoice.currency,
        status: "failed",
      },
    ]);
  
  // Update subscription status
  await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionData.id);
};