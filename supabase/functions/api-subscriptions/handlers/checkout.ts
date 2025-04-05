import { SupabaseClient } from "../../_shared/auth.ts";
import Stripe from "npm:stripe@14.11.0";
import { 
  createErrorResponse, 
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";
import { CheckoutSessionRequest, SessionResponse } from "../types.ts";

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
    const { priceId } = request;
    
    // 1. Get Redirect URLs from Environment Variables
    const successUrlBase = Deno.env.get("STRIPE_CHECKOUT_SUCCESS_URL");
    const cancelUrl = Deno.env.get("STRIPE_CHECKOUT_CANCEL_URL");

    // Append the required Stripe placeholder to the success URL
    const successUrl = successUrlBase ? `${successUrlBase}?session_id={CHECKOUT_SESSION_ID}` : null;

    // 2. Validate required parameters (including fetched env vars)
    if (!priceId || !successUrl || !cancelUrl) {
      console.error("Missing required parameters for checkout", { 
          priceId: !!priceId, 
          successUrl: !!successUrl, 
          cancelUrl: !!cancelUrl 
      });
      return createErrorResponse("Missing required parameters or server config for checkout URLs", 400);
    }
    
    // Get user details
    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();
    
    if (userError) {
      return createErrorResponse(userError.message, 400);
    }
    
    // Get user subscription to check for existing Stripe customer ID
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();
    
    if (subscriptionError) {
      return createErrorResponse(subscriptionError.message, 400);
    }
    
    // Get or create Stripe customer
    let customerId = subscription?.stripe_customer_id;
    
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
      
      // Update user subscription with Stripe customer ID
      await supabase
        .from("user_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
    }
    
    // Create checkout session using URLs from env vars
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
    
    // 3. Return only the session ID
    const response: { sessionId: string } = {
      sessionId: session.id,
    };
    
    return createSuccessResponse(response);
  } catch (err) {
    console.error("Error creating checkout session:", err);
    return createErrorResponse(err.message);
  }
};