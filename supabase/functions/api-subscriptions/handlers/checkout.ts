import { SupabaseClient } from "@shared/auth.ts";
import Stripe from "npm:stripe";
import type { createErrorResponse as CreateErrorResponseType, createSuccessResponse as CreateSuccessResponseType } from "@shared/responses.ts";
import { CheckoutSessionRequest, SessionResponse } from "../types.ts";

// Define a dependencies interface
interface CheckoutDeps {
  createErrorResponse: typeof CreateErrorResponseType;
  createSuccessResponse: typeof CreateSuccessResponseType;
}

/**
 * Create a checkout session for subscription
 */
export const createCheckoutSession = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  request: CheckoutSessionRequest,
  isTestMode: boolean,
  deps: CheckoutDeps // Add dependencies argument
): Promise<Response> => {
  // Destructure dependencies for easier use
  const { createErrorResponse, createSuccessResponse } = deps;

  try {
    // 1. Get parameters directly from the request body
    const { priceId, successUrl, cancelUrl } = request;
    
    // 2. Validate required parameters from request
    if (!priceId || !successUrl || !cancelUrl) {
      console.error("Missing required parameters in request body for checkout", { 
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
      
      // Upsert user subscription with Stripe customer ID
      // Use upsert to handle cases where the user row might not exist yet
      // Provide a default status, as it's required by the table schema
      const { error: upsertError } = await supabase
        .from("user_subscriptions")
        .upsert({ 
            user_id: userId, 
            stripe_customer_id: customerId, 
            status: "incomplete" // Add required status field 
        }, { onConflict: 'user_id' });

      if (upsertError) {
          console.error(`Failed to upsert stripe_customer_id for user ${userId}:`, upsertError);
          // Decide if this should be a blocking error or just a warning
          // For now, let's throw to make it clear if saving fails
          throw new Error("Failed to save Stripe customer ID to user subscription.");
      }
    }
    
    // Create checkout session using URLs from request
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
    
    // 3. Return the full session URL provided by Stripe
    const response: { sessionUrl: string | null } = {
      sessionUrl: session.url, // Use the URL from the Stripe session object
    };
    
    return createSuccessResponse(response);
  } catch (err) {
    console.error("Error creating checkout session:", err);
    // Pass the original error object as the third argument
    return createErrorResponse(err.message, 500, err); 
  }
};