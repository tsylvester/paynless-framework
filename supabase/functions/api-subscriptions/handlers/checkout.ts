// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
// Import SupabaseClient directly from the source package
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";
import type { createErrorResponse as CreateErrorResponseType, createSuccessResponse as CreateSuccessResponseType } from "../../_shared/responses.ts";
import { CheckoutSessionRequest, SessionResponse } from "../../_shared/types.ts";

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
  console.log(`[checkout.handler] START - User: ${userId}, Price: ${request?.priceId}`); // Log entry

  try {
    // 1. Get parameters directly from the request body
    const { priceId, successUrl, cancelUrl } = request;
    console.log("[checkout.handler] Parsed request body params"); // Log step
    
    // 2. Validate required parameters from request
    if (!priceId || !successUrl || !cancelUrl) {
      console.error("Missing required parameters in request body for checkout", { 
          priceId: !!priceId, 
          successUrl: !!successUrl, 
          cancelUrl: !!cancelUrl 
      });
      return createErrorResponse("Missing required parameters or server config for checkout URLs", 400);
    }
    console.log("[checkout.handler] Params validated"); // Log step
    
    // Get user details
    console.log("[checkout.handler] Fetching user profile..."); // Log step
    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();
    
    if (userError) {
      return createErrorResponse(userError.message, 400);
    }
    console.log("[checkout.handler] User profile fetched"); // Log step
    
    // Get user subscription to check for existing Stripe customer ID
    console.log("[checkout.handler] Fetching user subscription..."); // Log step
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();
    
    if (subscriptionError) {
      return createErrorResponse(subscriptionError.message, 400);
    }
    console.log(`[checkout.handler] User subscription fetched. Existing customer ID: ${subscription?.stripe_customer_id}`); // Log step
    
    // Get or create Stripe customer
    let customerId = subscription?.stripe_customer_id;
    
    if (!customerId) {
      console.log("[checkout.handler] No existing customer ID found. Creating Stripe customer..."); // Log step
      const { data: authData } = await supabase.auth.getUser();
      
      const customer = await stripe.customers.create({
        email: authData.user?.email,
        name: [userData.first_name, userData.last_name].filter(Boolean).join(" ") || undefined,
        metadata: {
          isTestMode: isTestMode.toString(),
        },
      });
      console.log(`[checkout.handler] Stripe customer created: ${customer.id}`); // Log step
      
      customerId = customer.id;
      
      // Upsert user subscription with Stripe customer ID
      console.log(`[checkout.handler] Upserting subscription with customer ID ${customerId}...`); // Log step
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
      console.log("[checkout.handler] Subscription upserted successfully."); // Log step
    }
    
    // Create checkout session using URLs from request
    const sessionPayload = {
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription" as Stripe.Checkout.SessionCreateParams.Mode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        metadata: { isTestMode: isTestMode.toString() },
    };
    console.log("[checkout.handler] Preparing to create Stripe session with payload:", JSON.stringify(sessionPayload)); // Log payload
    
    const session = await stripe.checkout.sessions.create(sessionPayload);
    console.log(`[checkout.handler] Stripe session created successfully. ID: ${session.id}, URL: ${session.url}`); // Log success + details
    
    // 3. Return the full session URL provided by Stripe
    const response: { sessionUrl: string | null } = {
      sessionUrl: session.url, // Use the URL from the Stripe session object
    };
    
    console.log("[checkout.handler] Returning success response to client."); // Log before return
    return createSuccessResponse(response);
  } catch (err) {
    console.error("[checkout.handler] Error caught:", err); // Enhance catch log
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return createErrorResponse(message, 500, err); 
  }
};