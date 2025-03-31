import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.11.0";
import { corsHeaders, CheckoutSessionRequest, SessionResponse } from "../types.ts";

/**
 * Create a checkout session for subscription
 */
export const createCheckoutSession = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  request: CheckoutSessionRequest,
  isTestMode: boolean
): Promise<Response> => {
  try {
    const { priceId, successUrl, cancelUrl } = request;
    
    if (!priceId || !successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Get user details for the customer
    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();
    
    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Get or create Stripe customer
    let customerId = userData.stripe_customer_id;
    
    if (!customerId) {
      const { data: authData } = await supabase.auth.getUser();
      
      const customer = await stripe.customers.create({
        email: authData.user?.email,
        name: [userData.first_name, userData.last_name].filter(Boolean).join(" ") || undefined,
        metadata: {
          userId,
          isTestMode: isTestMode.toString(),
        },
      });
      
      customerId = customer.id;
      
      // Update user profile with Stripe customer ID
      await supabase
        .from("user_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        isTestMode: isTestMode.toString(),
      },
    });
    
    const response: SessionResponse = {
      sessionId: session.id,
      url: session.url || '',
    };
    
    return new Response(JSON.stringify(response), {
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