// Stripe webhook handler for subscription events
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "npm:stripe@12.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.38.4";

// Initialize Stripe
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
});

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    // Get the stripe signature from the request headers
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the raw body for signature verification
    const body = await req.text();
    
    // Verify the webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Handling Stripe event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event);
        break;
      case "invoice.payment_succeeded":
        await handleInvoiceEvent(event);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailedEvent(event);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Handle subscription events (created, updated, deleted)
async function handleSubscriptionEvent(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const priceId = subscription.items.data[0].price.id;

  console.log(`Processing subscription event: ${event.type} for subscription ${subscriptionId}`);

  try {
    // Get the subscription plan ID from the price ID
    const { data: plans, error: planError } = await supabase
      .from("subscription_plans")
      .select("subscription_plan_id")
      .eq("stripe_price_id", priceId)
      .single();

    if (planError || !plans) {
      console.error(`Error finding subscription plan for price ${priceId}: ${planError?.message}`);
      return;
    }

    const planId = plans.subscription_plan_id;

    // Get the Supabase user ID from the Stripe customer ID
    const { data: userData, error: userError } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (userError && userError.code !== "PGRST116") { // PGRST116 is "no rows returned"
      console.error(`Error finding user for Stripe customer ${customerId}: ${userError.message}`);
      return;
    }

    // If no subscription record exists with this customer ID, we can't proceed
    if (!userData) {
      console.error(`No subscription record found for Stripe customer ${customerId}`);
      return;
    }

    const userId = userData.user_id;

    // Get the current subscription data to record previous state
    const { data: currentSub, error: currentSubError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();

    const previousState = currentSub ? currentSub.subscription_status : null;
    const previousPlanId = currentSub ? currentSub.subscription_plan_id : null;

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      // Get price information from Stripe
      const priceResponse = await stripe.prices.retrieve(priceId);
      const price = priceResponse.unit_amount / 100; // Convert from cents to dollars
      
      // Handle subscription creation or update
      const { error: updateError } = await supabase
        .from("subscriptions")
        .upsert({
          user_id: userId,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          subscription_status: status,
          subscription_plan_id: planId,
          subscription_price: price,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
          ended_at: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
          metadata: subscription.metadata || {}
        }, { onConflict: "user_id" });

      if (updateError) {
        console.error(`Error updating subscription record: ${updateError.message}`);
        return;
      }

    } else if (event.type === "customer.subscription.deleted") {
      // If subscription is deleted, update to free plan
      const { data: freePlan, error: freePlanError } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("subscription_plan_id", "free")
        .single();

      if (freePlanError) {
        console.error(`Error getting free plan: ${freePlanError.message}`);
        return;
      }

      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({
          subscription_status: "canceled",
          subscription_plan_id: "free",
          subscription_price: 0,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          canceled_at: new Date().toISOString(),
          stripe_subscription_id: null
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error(`Error updating subscription to free plan: ${updateError.message}`);
        return;
      }
    }

    // Record the subscription event
    const { error: eventError } = await supabase
      .from("subscription_events")
      .insert({
        user_id: userId,
        subscription_id: currentSub?.subscription_id,
        stripe_subscription_id: subscriptionId,
        subscription_event_type: event.type,
        subscription_previous_state: previousState,
        subscription_status: status,
        event_data: {
          current_plan_id: planId,
          previous_plan_id: previousPlanId,
          stripe_event: event.type,
          stripe_event_id: event.id
        }
      });

    if (eventError) {
      console.error(`Error recording subscription event: ${eventError.message}`);
    }

  } catch (error) {
    console.error(`Error in handleSubscriptionEvent: ${error.message}`);
  }
}

// Handle successful invoice payment
async function handleInvoiceEvent(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  
  // Only process subscription invoices
  if (!subscriptionId) return;

  try {
    // Get the Supabase subscription record using the Stripe subscription ID
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (subError) {
      console.error(`Error finding subscription for Stripe subscription ${subscriptionId}: ${subError.message}`);
      return;
    }

    // Record the payment event
    await supabase
      .from("subscription_events")
      .insert({
        user_id: subData.user_id,
        subscription_id: subData.subscription_id,
        stripe_subscription_id: subscriptionId,
        subscription_event_type: "invoice.payment_succeeded",
        subscription_status: subData.subscription_status,
        event_data: {
          invoice_id: invoice.id,
          amount_paid: invoice.amount_paid / 100,
          invoice_status: invoice.status,
          invoice_created: new Date(invoice.created * 1000).toISOString(),
          payment_intent: invoice.payment_intent
        }
      });

  } catch (error) {
    console.error(`Error in handleInvoiceEvent: ${error.message}`);
  }
}

// Handle failed invoice payment
async function handlePaymentFailedEvent(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) return;

  try {
    // Get the Supabase subscription record using the Stripe subscription ID
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (subError) {
      console.error(`Error finding subscription for Stripe subscription ${subscriptionId}: ${subError.message}`);
      return;
    }

    // Update subscription status to reflect payment failure
    await supabase
      .from("subscriptions")
      .update({
        subscription_status: "past_due",
        updated_at: new Date().toISOString()
      })
      .eq("stripe_subscription_id", subscriptionId);

    // Record the payment failure event
    await supabase
      .from("subscription_events")
      .insert({
        user_id: subData.user_id,
        subscription_id: subData.subscription_id,
        stripe_subscription_id: subscriptionId,
        subscription_event_type: "invoice.payment_failed",
        subscription_previous_state: subData.subscription_status,
        subscription_status: "past_due",
        event_data: {
          invoice_id: invoice.id,
          amount_due: invoice.amount_due / 100,
          invoice_status: invoice.status,
          invoice_created: new Date(invoice.created * 1000).toISOString(),
          payment_intent: invoice.payment_intent,
          next_payment_attempt: invoice.next_payment_attempt 
            ? new Date(invoice.next_payment_attempt * 1000).toISOString()
            : null
        }
      });

  } catch (error) {
    console.error(`Error in handlePaymentFailedEvent: ${error.message}`);
  }
}