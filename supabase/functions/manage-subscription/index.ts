// Manage existing subscriptions (cancel, resume, change plans)
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
    const { action, planId } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the user's current subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (subscriptionError) {
      return new Response(JSON.stringify({ error: "Subscription not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Different actions to perform
    let result;
    switch (action) {
      case "cancel":
        result = await cancelSubscription(subscription, user.id);
        break;
      case "resume":
        result = await resumeSubscription(subscription, user.id);
        break;
      case "change_plan":
        if (!planId) {
          return new Response(JSON.stringify({ error: "Missing planId parameter for change_plan action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await changePlan(subscription, planId, user.id);
        break;
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(`Error managing subscription: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Cancel a subscription
async function cancelSubscription(subscription, userId) {
  if (!subscription.stripe_subscription_id) {
    // If no Stripe subscription (free plan), nothing to cancel
    return { message: "No active subscription to cancel" };
  }

  try {
    // Cancel the subscription at period end in Stripe
    const stripeSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    // Update the subscription status in the database
    await supabase
      .from("subscriptions")
      .update({
        subscription_status: "canceled_at_period_end",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    // Record the cancellation event
    await supabase
      .from("subscription_events")
      .insert({
        user_id: userId,
        subscription_id: subscription.subscription_id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        subscription_event_type: "subscription_canceled",
        subscription_previous_state: subscription.subscription_status,
        subscription_status: "canceled_at_period_end",
        event_data: {
          cancellation_effective_date: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          plan_id: subscription.subscription_plan_id
        }
      });

    return {
      message: "Subscription has been canceled and will end at the current billing period",
      effective_date: new Date(stripeSubscription.current_period_end * 1000).toISOString()
    };
  } catch (error) {
    console.error(`Error canceling subscription: ${error.message}`);
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
}

// Resume a subscription that was canceled but hasn't ended yet
async function resumeSubscription(subscription, userId) {
  if (!subscription.stripe_subscription_id) {
    throw new Error("No active subscription to resume");
  }

  if (subscription.subscription_status !== "canceled_at_period_end") {
    return { message: "Subscription is not scheduled for cancellation" };
  }

  try {
    // Resume the subscription in Stripe
    const stripeSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: false }
    );

    // Update the subscription status in the database
    await supabase
      .from("subscriptions")
      .update({
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    // Record the resumption event
    await supabase
      .from("subscription_events")
      .insert({
        user_id: userId,
        subscription_id: subscription.subscription_id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        subscription_event_type: "subscription_resumed",
        subscription_previous_state: subscription.subscription_status,
        subscription_status: "active",
        event_data: {
          plan_id: subscription.subscription_plan_id
        }
      });

    return {
      message: "Subscription has been resumed successfully",
      status: "active"
    };
  } catch (error) {
    console.error(`Error resuming subscription: ${error.message}`);
    throw new Error(`Failed to resume subscription: ${error.message}`);
  }
}

// Change subscription plan
async function changePlan(subscription, newPlanId, userId) {
  // Get the new plan details
  const { data: newPlan, error: planError } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("subscription_plan_id", newPlanId)
    .eq("is_active", true)
    .single();

  if (planError || !newPlan) {
    throw new Error("New plan not found or is inactive");
  }

  // If changing to free plan, cancel the subscription
  if (newPlanId === "free") {
    if (!subscription.stripe_subscription_id) {
      return { message: "Already on the free plan" };
    }

    // Cancel immediately in Stripe
    await stripe.subscriptions.cancel(subscription.stripe_subscription_id);

    // Update the subscription to free plan
    await supabase
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

    // Record the downgrade event
    await supabase
      .from("subscription_events")
      .insert({
        user_id: userId,
        subscription_id: subscription.subscription_id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        subscription_event_type: "plan_downgraded",
        subscription_previous_state: subscription.subscription_status,
        subscription_status: "canceled",
        event_data: {
          previous_plan_id: subscription.subscription_plan_id,
          new_plan_id: "free"
        }
      });

    return {
      message: "Successfully downgraded to free plan",
      effective_date: new Date().toISOString()
    };
  }

  // If current plan is free, need to create a new subscription
  if (subscription.subscription_plan_id === "free" || !subscription.stripe_subscription_id) {
    // For free to paid upgrades, client should use the checkout session
    return {
      message: "Use checkout to upgrade from free plan",
      require_checkout: true
    };
  }

  // If it's an existing paid plan being changed to another paid plan
  try {
    // Get the stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    // Update to the new price
    await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPlan.stripe_price_id,
          },
        ],
        proration_behavior: "create_prorations",
      }
    );

    // Record the plan change event 
    await supabase
      .from("subscription_events")
      .insert({
        user_id: userId,
        subscription_id: subscription.subscription_id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        subscription_event_type: "plan_changed",
        subscription_previous_state: subscription.subscription_status,
        subscription_status: "active",
        event_data: {
          previous_plan_id: subscription.subscription_plan_id,
          new_plan_id: newPlanId
        }
      });

    return {
      message: "Subscription plan has been updated successfully",
      plan_id: newPlanId
    };
  } catch (error) {
    console.error(`Error changing subscription plan: ${error.message}`);
    throw new Error(`Failed to change subscription plan: ${error.message}`);
  }
}