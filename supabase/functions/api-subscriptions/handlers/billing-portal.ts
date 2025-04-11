// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { type BillingPortalRequest, type SessionResponse } from "../../_shared/types.ts";
import type { createErrorResponse as CreateErrorResponseType, createSuccessResponse as CreateSuccessResponseType } from "../../_shared/responses.ts";
import { corsHeaders } from "../../_shared/cors-headers.ts";

interface BillingPortalDeps {
  createErrorResponse: typeof CreateErrorResponseType;
  createSuccessResponse: typeof CreateSuccessResponseType;
}

/**
 * Create a billing portal session
 */
export const createBillingPortalSession = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  request: BillingPortalRequest,
  deps: BillingPortalDeps
): Promise<Response> => {
  const { createErrorResponse, createSuccessResponse } = deps;

  try {
    const { returnUrl } = request;
    
    if (!returnUrl) {
      return createErrorResponse("Missing return URL", 400);
    }
    
    // Get user subscription data to find the Stripe customer ID
    const { data: subscriptionData, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    
    // Check for errors or if the customer ID is missing
    if (subscriptionError) {
        console.error("Error fetching user subscription for portal:", subscriptionError);
        return createErrorResponse("Failed to retrieve subscription data", 500, subscriptionError);
    }
    if (!subscriptionData?.stripe_customer_id) {
        console.warn(`No Stripe customer ID found for user ${userId} in user_subscriptions.`);
        return createErrorResponse("No Stripe customer found for this user", 400);
    }
    
    const stripeCustomerId = subscriptionData.stripe_customer_id;

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    
    const response: SessionResponse = {
      sessionId: session.id,
      url: session.url,
    };
    
    return createSuccessResponse(response);
  } catch (err) {
    console.error("Error creating billing portal session:", err);
    return createErrorResponse(err.message, 500, err);
  }
};