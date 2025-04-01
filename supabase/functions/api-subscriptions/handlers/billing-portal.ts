import { SupabaseClient } from "../../_shared/auth.ts";
import Stripe from "npm:stripe@14.11.0";
import { 
  createErrorResponse,
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";
import { BillingPortalRequest, SessionResponse } from "../types.ts";

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
      return createErrorResponse("Missing return URL", 400);
    }
    
    // Get user profile to check for Stripe customer ID
    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();
    
    if (userError || !userData.stripe_customer_id) {
      return createErrorResponse("No Stripe customer found", 400);
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
    
    return createSuccessResponse(response);
  } catch (err) {
    return createErrorResponse(err.message);
  }
};