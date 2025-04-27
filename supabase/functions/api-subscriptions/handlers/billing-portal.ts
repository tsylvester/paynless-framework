// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import type { Database } from '../../types_db.ts';
import { type BillingPortalRequest, type SessionResponse } from "../../_shared/types.ts";
import { HandlerError } from "./current.ts";

/**
 * Create a billing portal session.
 * Returns SessionResponse data on success, throws HandlerError on failure.
 */
export const createBillingPortalSession = async (
  supabase: SupabaseClient<Database>,
  stripe: Stripe,
  userId: string,
  requestData: BillingPortalRequest
): Promise<SessionResponse> => {
  try {
    const { returnUrl } = requestData;
    
    if (!returnUrl) {
      throw new HandlerError("Missing return URL", 400);
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
        throw new HandlerError("Failed to retrieve subscription data", 500, subscriptionError);
    }
    if (!subscriptionData?.stripe_customer_id) {
        console.warn(`No Stripe customer ID found for user ${userId} in user_subscriptions.`);
        throw new HandlerError("No Stripe customer found for this user", 400);
    }
    
    const stripeCustomerId = subscriptionData.stripe_customer_id;

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    
    // Construct and return the response data
    const response: SessionResponse = {
      sessionId: session.id,
      url: session.url,
    };
    
    return response;

  } catch (err) {
    if (err instanceof HandlerError) {
      throw err;
    }
    console.error("Error creating billing portal session:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = (err instanceof Stripe.errors.StripeError) ? (err.statusCode ?? 500) : 500;
    throw new HandlerError(message, status, err); 
  }
};