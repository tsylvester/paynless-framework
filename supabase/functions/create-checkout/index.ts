// Create Stripe checkout session for subscription
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "npm:stripe@12.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.38.4";

// Initialize Stripe
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
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
    // Get the JWT token from the request header and validate it
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { planId, successUrl, cancelUrl } = await req.json();

    if (!planId || !successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the plan details from Supabase
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("subscription_plan_id", planId)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!plan.stripe_price_id) {
      return new Response(JSON.stringify({ error: "This plan cannot be purchased" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has a Stripe customer ID
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, subscription_id")
      .eq("user_id", user.id)
      .single();

    let customerId = subscription?.stripe_customer_id;

    // If the user doesn't have a customer ID, create one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });
      
      customerId = customer.id;
      
      // Check if subscription record exists before updating
      if (subscription) {
        // Update existing record with customer ID
        await supabase
          .from("subscriptions")
          .update({ 
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.id);
      } else {
        // Create new subscription record with customer ID
        await supabase
          .from("subscriptions")
          .insert({
            user_id: user.id,
            stripe_customer_id: customerId,
            subscription_status: 'active',
            subscription_plan_id: 'free',
            subscription_price: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    }
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
        plan_id: planId,
      },
    });

    // Record the checkout attempt
    await supabase
      .from("subscription_events")
      .insert({
        user_id: user.id,
        subscription_id: subscription?.subscription_id,
        subscription_event_type: "checkout_started",
        event_data: {
          session_id: session.id,
          plan_id: planId,
          checkout_url: session.url,
          customer_id: customerId
        },
      });

    return new Response(JSON.stringify({ session_id: session.id, url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(`Error creating checkout session: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});