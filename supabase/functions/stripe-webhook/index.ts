import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "npm:stripe@12.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.38.4";

// Environment variables
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
const liveWebhookSecret = Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET") || "";
const testWebhookSecret = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET") || "";

// Enable debug logging for development
const DEBUG = true;
const logDebug = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
};

// Initialize Stripe
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
});

// Initialize Supabase client with improved configuration
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      'Authorization': `Bearer ${supabaseServiceRoleKey}`
    }
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Log incoming request
  logDebug('Webhook request received', { 
    method: req.method,
    url: req.url,
    hasAuth: !!req.headers.get("Authorization"),
    hasSignature: !!req.headers.get("stripe-signature")
  });

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
    logDebug('Request body received', { length: body.length });
    
    // Parse the raw body to determine if this is a live or test event
    let rawEvent;
    try {
      rawEvent = JSON.parse(body);
      logDebug('Event parsed successfully', { 
        type: rawEvent.type,
        id: rawEvent.id,
        livemode: rawEvent.livemode
      });
    } catch (err) {
      console.error(`Error parsing webhook body: ${err.message}`);
      return new Response(JSON.stringify({ error: "Invalid JSON in webhook body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Determine which secret to use based on livemode flag
    const isLiveMode = rawEvent.livemode === true;
    const webhookSecret = isLiveMode ? liveWebhookSecret : testWebhookSecret;
    
    logDebug('Selected webhook environment', { 
      mode: isLiveMode ? 'live' : 'test',
      secretPresent: !!webhookSecret
    });
    
    // Fail early if the appropriate webhook secret is not available
    if (!webhookSecret) {
      console.error(`Missing webhook secret for ${isLiveMode ? 'live' : 'test'} mode`);
      return new Response(JSON.stringify({ 
        error: `Missing webhook secret for ${isLiveMode ? 'live' : 'test'} mode`
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Verify the webhook signature with the appropriate secret
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logDebug('Signature verification successful', { 
        eventType: event.type,
        eventId: event.id
      });
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(JSON.stringify({ 
        error: `Webhook signature verification failed: ${err.message}`,
        details: {
          mode: isLiveMode ? 'live' : 'test',
          secretLength: webhookSecret.length,
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Handling Stripe event: ${event.type} in ${isLiveMode ? 'live' : 'test'} mode`);

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

    return new Response(JSON.stringify({ 
      received: true,
      eventId: event.id,
      eventType: event.type,
      mode: isLiveMode ? 'live' : 'test'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      message: error.message
    }), {
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

  logDebug(`Processing subscription event`, {
    type: event.type,
    subscriptionId,
    customerId,
    status,
    priceId
  });

  try {
    // Get the subscription plan ID from the price ID
    const { data: plans, error: planError } = await supabase
      .from("subscription_plans")
      .select("subscription_plan_id")
      .eq("stripe_price_id", priceId)
      .single();

    if (planError) {
      console.error(`Error finding subscription plan for price ${priceId}: ${planError.message}`);
      logDebug('Plan query error', { error: planError });
      return;
    }

    const planId = plans.subscription_plan_id;
    logDebug('Found matching plan', { planId });

    // Get the Supabase user ID from the Stripe customer ID
    const { data: userData, error: userError } = await supabase
      .from("subscriptions")
      .select("user_id, subscription_id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (userError) {
      console.error(`Error finding user for Stripe customer ${customerId}: ${userError.message}`);
      logDebug('User query error', { error: userError });
      
      // If we can't find the user by customer ID, check if there's metadata on the subscription
      if (subscription.metadata && subscription.metadata.user_id) {
        const userId = subscription.metadata.user_id;
        logDebug('Using user_id from subscription metadata', { userId });
        
        // Look up the subscription record by user_id instead
        const { data: altUserData, error: altUserError } = await supabase
          .from("subscriptions")
          .select("user_id, subscription_id")
          .eq("user_id", userId)
          .single();
          
        if (altUserError) {
          console.error(`Error finding subscription for user ${userId}: ${altUserError.message}`);
          return;
        }
        
        if (altUserData) {
          logDebug('Found subscription by user_id', { altUserData });
          // Continue processing with the user ID from metadata
          await processSubscriptionUpdate(
            event,
            subscription,
            altUserData.user_id,
            altUserData.subscription_id,
            planId,
            status
          );
          return;
        }
      }
      
      return;
    }

    // Process the subscription with retrieved user data
    await processSubscriptionUpdate(
      event,
      subscription,
      userData.user_id,
      userData.subscription_id,
      planId,
      status
    );

  } catch (error) {
    console.error(`Error in handleSubscriptionEvent: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
  }
}

// Helper function to process subscription updates
async function processSubscriptionUpdate(event, subscription, userId, subscriptionId, planId, status) {
  logDebug('Processing subscription update', { 
    userId,
    subscriptionId,
    planId,
    status
  });

  const previousState = await getCurrentSubscriptionState(userId);
  
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    // Get price information from Stripe
    const priceResponse = await stripe.prices.retrieve(subscription.items.data[0].price.id);
    const price = priceResponse.unit_amount / 100; // Convert from cents to dollars
    
    logDebug('Updating subscription record', {
      userId,
      subscriptionId,
      price,
      planId
    });
    
    // Handle subscription creation or update
    const { error: updateError } = await supabase
      .from("subscriptions")
      .upsert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
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
      logDebug('Subscription update error', { error: updateError });
      return;
    }
    
    logDebug('Subscription record updated successfully');

  } else if (event.type === "customer.subscription.deleted") {
    // If subscription is deleted, update to free plan
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
      logDebug('Free plan update error', { error: updateError });
      return;
    }
    
    logDebug('Subscription canceled successfully');
  }

  // Record the subscription event
  const { error: eventError } = await supabase
    .from("subscription_events")
    .insert({
      user_id: userId,
      subscription_id: subscriptionId,
      stripe_subscription_id: subscription.id,
      subscription_event_type: event.type,
      subscription_previous_state: previousState?.subscription_status || null,
      subscription_status: status,
      event_data: {
        current_plan_id: planId,
        previous_plan_id: previousState?.subscription_plan_id || null,
        stripe_event: event.type,
        stripe_event_id: event.id
      }
    });

  if (eventError) {
    console.error(`Error recording subscription event: ${eventError.message}`);
    logDebug('Event record error', { error: eventError });
  } else {
    logDebug('Subscription event recorded successfully');
  }
}

// Helper function to get current subscription state
async function getCurrentSubscriptionState(userId) {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("subscription_status, subscription_plan_id")
      .eq("user_id", userId)
      .single();
      
    if (error) {
      console.error(`Error getting current subscription state: ${error.message}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Unexpected error getting subscription state: ${error.message}`);
    return null;
  }
}

// Handle successful invoice payment
async function handleInvoiceEvent(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  
  // Only process subscription invoices
  if (!subscriptionId) {
    logDebug('Ignoring non-subscription invoice', { invoiceId: invoice.id });
    return;
  }

  logDebug('Processing invoice payment success', { 
    invoiceId: invoice.id,
    subscriptionId,
    amount: invoice.amount_paid / 100
  });

  try {
    // Get the Supabase subscription record using the Stripe subscription ID
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("user_id, subscription_id, subscription_status")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (subError) {
      console.error(`Error finding subscription for Stripe subscription ${subscriptionId}: ${subError.message}`);
      logDebug('Subscription query error', { error: subError });
      return;
    }

    // Record the payment event
    const { error: eventError } = await supabase
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

    if (eventError) {
      console.error(`Error recording payment event: ${eventError.message}`);
      logDebug('Payment event record error', { error: eventError });
    } else {
      logDebug('Payment event recorded successfully');
    }

  } catch (error) {
    console.error(`Error in handleInvoiceEvent: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
  }
}

// Handle failed invoice payment
async function handlePaymentFailedEvent(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) {
    logDebug('Ignoring non-subscription invoice', { invoiceId: invoice.id });
    return;
  }

  logDebug('Processing invoice payment failure', { 
    invoiceId: invoice.id,
    subscriptionId,
    amount: invoice.amount_due / 100
  });

  try {
    // Get the Supabase subscription record using the Stripe subscription ID
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", subscriptionId)
      .single();

    if (subError) {
      console.error(`Error finding subscription for Stripe subscription ${subscriptionId}: ${subError.message}`);
      logDebug('Subscription query error', { error: subError });
      return;
    }

    // Update subscription status to reflect payment failure
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        subscription_status: "past_due",
        updated_at: new Date().toISOString()
      })
      .eq("stripe_subscription_id", subscriptionId);

    if (updateError) {
      console.error(`Error updating subscription status: ${updateError.message}`);
      logDebug('Status update error', { error: updateError });
    } else {
      logDebug('Subscription status updated to past_due');
    }

    // Record the payment failure event
    const { error: eventError } = await supabase
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

    if (eventError) {
      console.error(`Error recording payment failure event: ${eventError.message}`);
      logDebug('Payment failure event record error', { error: eventError });
    } else {
      logDebug('Payment failure event recorded successfully');
    }

  } catch (error) {
    console.error(`Error in handlePaymentFailedEvent: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
  }
}