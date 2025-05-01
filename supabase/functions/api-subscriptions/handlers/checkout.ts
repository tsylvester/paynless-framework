// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
// Fix: Import SupabaseClient with Database type
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from '../../types_db.ts';
import Stripe from "npm:stripe";
// Fix: Import API types and HandlerError
import { CheckoutSessionRequest, SessionResponse } from "../../_shared/types.ts";
import { HandlerError } from "./current.ts"; // Reuse HandlerError

// Remove old imports and Deps interface
// import type { createErrorResponse as CreateErrorResponseType, createSuccessResponse as CreateSuccessResponseType } from "../../_shared/responses.ts"; // Removed
// 
// interface CheckoutDeps {
//   createErrorResponse: typeof CreateErrorResponseType;
//   createSuccessResponse: typeof CreateSuccessResponseType;
// } // Removed

/**
 * Create a checkout session for subscription.
 * Returns SessionResponse data on success, throws HandlerError on failure.
 */
export const createCheckoutSession = async (
  supabase: SupabaseClient<Database>, // Use Database type
  stripe: Stripe,
  userId: string,
  requestData: CheckoutSessionRequest, // Rename request
  isTestMode: boolean
  // Remove deps parameter
): Promise<SessionResponse> => {
  // Remove destructuring of removed deps
  // const { createErrorResponse, createSuccessResponse } = deps;
  console.log(`[checkout.handler] START - User: ${userId}, Price: ${requestData?.priceId}`); // Use renamed requestData

  try {
    // 1. Get parameters directly from the request body
    const { priceId, successUrl, cancelUrl } = requestData; // Use renamed requestData
    console.log("[checkout.handler] Parsed request body params"); 
    
    // 2. Validate required parameters from request
    if (!priceId || !successUrl || !cancelUrl) {
      const missingParams = { priceId: !!priceId, successUrl: !!successUrl, cancelUrl: !!cancelUrl };
      console.error("Missing required parameters in request body for checkout", missingParams);
      // Fix: Throw HandlerError
      throw new HandlerError("Missing required parameters for checkout", 400, { missingParams });
    }
    console.log("[checkout.handler] Params validated"); 
    
    // Get user details
    console.log("[checkout.handler] Fetching user profile..."); 
    // Fix: Define return type for profile query
    type UserProfile = Pick<Database['public']['Tables']['user_profiles']['Row'], 'first_name' | 'last_name'> | null;
    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .returns<UserProfile[]>() // Use array type
      .maybeSingle();
    
    if (userError) {
      console.error("Error fetching user profile:", userError);
      // Fix: Throw HandlerError
      throw new HandlerError(userError.message || "Failed to fetch user profile", 500, userError);
    }
    if (!userData) {
        console.error("User profile not found for ID:", userId);
        throw new HandlerError("User profile not found", 404);
    }
    console.log("[checkout.handler] User profile fetched"); 
    
    // Get user subscription to check for existing Stripe customer ID
    console.log("[checkout.handler] Fetching user subscription..."); 
    // Fix: Define return type for subscription query
    type UserSubscriptionCustomerID = Pick<Database['public']['Tables']['user_subscriptions']['Row'], 'stripe_customer_id'> | null;
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .returns<UserSubscriptionCustomerID[]>()
      .maybeSingle();
    
    if (subscriptionError) {
      console.error("Error fetching user subscription:", subscriptionError);
      // Fix: Throw HandlerError
      throw new HandlerError(subscriptionError.message || "Failed to fetch user subscription", 500, subscriptionError);
    }
    // Note: subscription can be null if it doesn't exist yet, which is handled below
    console.log(`[checkout.handler] User subscription fetched. Existing customer ID: ${subscription?.stripe_customer_id}`); 
    
    // Get or create Stripe customer
    let customerId = subscription?.stripe_customer_id;
    
    if (!customerId) {
      console.log("[checkout.handler] No existing customer ID found. Creating Stripe customer..."); 
      // Fix: Get user email from auth - handle potential null user
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
           console.error("Failed to get authenticated user for Stripe customer creation:", authError);
           throw new HandlerError(authError?.message || "Authentication error", 500, authError);
      }
      
      const customer = await stripe.customers.create({
        email: authData.user.email,
        name: [userData.first_name, userData.last_name].filter(Boolean).join(" ") || undefined,
        metadata: {
          isTestMode: isTestMode.toString(),
          supabaseUserId: userId, // Store Supabase User ID
        },
      });
      console.log(`[checkout.handler] Stripe customer created: ${customer.id}`); 
      
      customerId = customer.id;
      
      // Upsert user subscription with Stripe customer ID
      console.log(`[checkout.handler] Upserting subscription with customer ID ${customerId}...`); 
      const { error: upsertError } = await supabase
        .from("user_subscriptions")
        .upsert({ 
            user_id: userId, 
            stripe_customer_id: customerId, 
            status: "incomplete" 
        }, { onConflict: 'user_id' });

      if (upsertError) {
          console.error(`Failed to upsert stripe_customer_id for user ${userId}:`, upsertError);
          // Fix: Throw HandlerError
          throw new HandlerError("Failed to save Stripe customer ID to user subscription.", 500, upsertError);
      }
      console.log("[checkout.handler] Subscription upserted successfully."); 
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
    console.log("[checkout.handler] Preparing to create Stripe session with payload:", JSON.stringify(sessionPayload)); 
    
    const session = await stripe.checkout.sessions.create(sessionPayload);
    console.log(`[checkout.handler] Stripe session created successfully. ID: ${session.id}, URL: ${session.url}`); 
    
    // 3. Return the session response data
    // Fix: Adapt return type (SessionResponse expects url, optional sessionId)
    const response: SessionResponse = {
      sessionId: session.id, // Include session ID if available
      url: session.url ?? '', // Ensure URL is not null
    };
    
    console.log("[checkout.handler] Returning success response data.");
    return response; // Return data directly

  } catch (err) {
    // Fix: Handle/re-throw HandlerError or wrap other errors
    if (err instanceof HandlerError) {
      throw err;
    }
    console.error("[checkout.handler] Error caught:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = (err instanceof Stripe.errors.StripeError) ? (err.statusCode ?? 500) : 500;
    throw new HandlerError(message, status, err);
  }
};