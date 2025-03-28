import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4?target=denonext";

// Initialize environment variables
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const liveWebhookSecret = Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET") || "";
const testWebhookSecret = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET") || "";

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Initialize Stripe
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16'
});

// This is needed in order to use the Web Crypto API in Deno.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

console.log('Starting Stripe Webhook handler...');

Deno.serve(async (request) => {
  // Log incoming request for debugging
  console.log(`Webhook received: ${request.method} ${request.url}`);
  
  // Handle OPTIONS for CORS if needed
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
      },
    });
  }

  const signature = request.headers.get('Stripe-Signature');
  if (!signature) {
    console.error("Missing Stripe-Signature header");
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }
  
  // First step is to verify the event. The .text() method must be used as the
  // verification relies on the raw request body rather than the parsed JSON.
  const body = await request.text();
  
  // Parse the raw body to determine if this is a live or test event
  let rawEvent;
  try {
    rawEvent = JSON.parse(body);
    console.log(`Event type: ${rawEvent.type}, id: ${rawEvent.id}, livemode: ${rawEvent.livemode}`);
  } catch (err) {
    console.error(`Error parsing webhook body: ${err.message}`);
    return new Response("Invalid JSON payload", { status: 400 });
  }
  
  // Select the appropriate webhook secret based on livemode
  const isLiveMode = rawEvent.livemode === true;
  const webhookSecret = isLiveMode ? liveWebhookSecret : testWebhookSecret;
  
  if (!webhookSecret) {
    console.error(`Missing webhook secret for ${isLiveMode ? 'live' : 'test'} mode`);
    return new Response(
      `Missing webhook secret for ${isLiveMode ? 'live' : 'test'} mode`,
      { status: 500 }
    );
  }
  
  let receivedEvent;
  try {
    receivedEvent = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(err.message, { status: 400 });
  }
  
  console.log(`🔔 Event received and verified: ${receivedEvent.id}`);
  
  // Process the event
  try {
    switch (receivedEvent.type) {
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(receivedEvent);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(receivedEvent);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(receivedEvent);
        break;
      default:
        console.log(`Unhandled event type: ${receivedEvent.type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`);
    // We still return 200 to acknowledge receipt to Stripe
  }
  
  return new Response(JSON.stringify({ received: true }), { 
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});

async function handleInvoicePaymentSucceeded(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    console.log('No subscription ID found in invoice');
    return;
  }
  
  try {
    // Find user by subscription ID
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("user_id, subscription_id, subscription_status")
      .eq("stripe_subscription_id", subscriptionId)
      .single();
    
    if (subError) {
      console.log(`Error finding subscription: ${subError.message}`);
      
      // Try by customer ID
      const { data: custData, error: custError } = await supabase
        .from("subscriptions")
        .select("user_id, subscription_id, subscription_status")
        .eq("stripe_customer_id", invoice.customer)
        .single();
      
      if (custError) {
        console.log(`Error finding customer: ${custError.message}`);
        return;
      }
      
      // Record invoice payment event
      await recordInvoiceEvent(custData, subscriptionId, invoice);
      return;
    }
    
    // Record invoice payment event
    await recordInvoiceEvent(subData, subscriptionId, invoice);
  } catch (error) {
    console.error(`Error in handleInvoicePaymentSucceeded: ${error.message}`);
  }
}

async function recordInvoiceEvent(userData, subscriptionId, invoice) {
  try {
    const { error } = await supabase
      .from("subscription_events")
      .insert({
        user_id: userData.user_id,
        subscription_id: userData.subscription_id,
        stripe_subscription_id: subscriptionId,
        subscription_event_type: "invoice.payment_succeeded",
        subscription_status: userData.subscription_status,
        event_data: {
          invoice_id: invoice.id,
          amount_paid: invoice.amount_paid / 100,
          invoice_status: invoice.status,
          invoice_created: new Date(invoice.created * 1000).toISOString(),
          payment_intent: invoice.payment_intent
        }
      });
    
    if (error) {
      console.error(`Error recording invoice event: ${error.message}`);
    } else {
      console.log('Invoice event recorded successfully');
    }
  } catch (error) {
    console.error(`Error in recordInvoiceEvent: ${error.message}`);
  }
}

async function handleSubscriptionUpdated(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  
  try {
    // Get price ID
    let priceId;
    if (subscription.items?.data?.[0]?.price?.id) {
      priceId = subscription.items.data[0].price.id;
    } else if (subscription.plan?.id) {
      priceId = subscription.plan.id;
    } else {
      console.log('No price ID found in subscription');
      return;
    }
    
    // Find the plan
    const { data: planData, error: planError } = await supabase
      .from("subscription_plans")
      .select("subscription_plan_id")
      .eq("stripe_price_id", priceId)
      .single();
    
    if (planError) {
      console.error(`Error finding plan: ${planError.message}`);
      return;
    }
    
    const planId = planData.subscription_plan_id;
    
    // Find the user
    const { data: userData, error: userError } = await supabase
      .from("subscriptions")
      .select("user_id, subscription_id")
      .eq("stripe_customer_id", customerId)
      .single();
    
    if (userError) {
      console.error(`Error finding user: ${userError.message}`);
      return;
    }
    
    // Update subscription
    const { error: updateError } = await supabase
      .from("subscriptions")
      .upsert({
        user_id: userData.user_id,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        subscription_status: subscription.status,
        subscription_plan_id: planId,
        subscription_price: (subscription.items?.data?.[0]?.price?.unit_amount || subscription.plan?.amount || 0) / 100,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        ended_at: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
        metadata: subscription.metadata || {}
      }, { onConflict: "user_id" });
    
    if (updateError) {
      console.error(`Error updating subscription: ${updateError.message}`);
      return;
    }
    
    // Record event
    const { error: eventError } = await supabase
      .from("subscription_events")
      .insert({
        user_id: userData.user_id,
        subscription_id: userData.subscription_id,
        stripe_subscription_id: subscription.id,
        subscription_event_type: event.type,
        subscription_status: subscription.status,
        event_data: {
          current_plan_id: planId,
          stripe_event_id: event.id
        }
      });
    
    if (eventError) {
      console.error(`Error recording subscription event: ${eventError.message}`);
    } else {
      console.log('Subscription updated successfully');
    }
  } catch (error) {
    console.error(`Error in handleSubscriptionUpdated: ${error.message}`);
  }
}

async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;
  
  try {
    // Find the user
    const { data: userData, error: userError } = await supabase
      .from("subscriptions")
      .select("user_id, subscription_id, subscription_status, subscription_plan_id")
      .eq("stripe_subscription_id", subscription.id)
      .single();
    
    if (userError) {
      console.error(`Error finding user: ${userError.message}`);
      
      // Try by customer ID
      const { data: custData, error: custError } = await supabase
        .from("subscriptions")
        .select("user_id, subscription_id, subscription_status, subscription_plan_id")
        .eq("stripe_customer_id", subscription.customer)
        .single();
      
      if (custError) {
        console.error(`Error finding user by customer: ${custError.message}`);
        return;
      }
      
      // Revert to free plan
      await revertToFreePlan(custData, subscription);
      return;
    }
    
    // Revert to free plan
    await revertToFreePlan(userData, subscription);
  } catch (error) {
    console.error(`Error in handleSubscriptionDeleted: ${error.message}`);
  }
}

async function revertToFreePlan(userData, subscription) {
  try {
    // Update to free plan
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
      .eq("user_id", userData.user_id);
    
    if (updateError) {
      console.error(`Error reverting to free plan: ${updateError.message}`);
      return;
    }
    
    // Record event
    const { error: eventError } = await supabase
      .from("subscription_events")
      .insert({
        user_id: userData.user_id,
        subscription_id: userData.subscription_id,
        stripe_subscription_id: subscription.id,
        subscription_event_type: "subscription_canceled",
        subscription_previous_state: userData.subscription_status,
        subscription_status: "canceled",
        event_data: {
          previous_plan_id: userData.subscription_plan_id,
          current_plan_id: "free"
        }
      });
    
    if (eventError) {
      console.error(`Error recording cancellation event: ${eventError.message}`);
    } else {
      console.log('Subscription canceled successfully');
    }
  } catch (error) {
    console.error(`Error in revertToFreePlan: ${error.message}`);
  }
}