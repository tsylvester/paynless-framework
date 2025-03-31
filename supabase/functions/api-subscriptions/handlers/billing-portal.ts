import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.11.0";
import { corsHeaders, BillingPortalRequest, SessionResponse } from "../types.ts";

/**
 * Create a billing portal session
 */
export const createBillingPortalSession = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  request: BillingPortalRequest
): Promise<Response> => {
  try {
    const { returnUrl } = request;
    
    if (!returnUrl) {
      return new Response(JSON.stringify({ error: "Missing return URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Get user profile to check for Stripe customer ID
    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();
    
    if (userError || !userData.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No Stripe customer found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: returnUrl,
    });
    
    const response: SessionResponse = {
      sessionId: session.id,
      url: session.url,
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