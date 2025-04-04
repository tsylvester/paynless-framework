// Stripe webhook handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  createSupabaseAdminClient 
} from "../_shared/auth.ts";
import { 
  getStripeClient, 
  verifyWebhookSignature 
} from "../_shared/stripe-client.ts";
import { 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../_shared/cors-headers.ts";
import { handleCheckoutSessionCompleted } from "./handlers/checkout-session.ts";
import { handleSubscriptionUpdated, handleSubscriptionDeleted } from "./handlers/subscription.ts";
import { handleInvoicePaymentSucceeded, handleInvoicePaymentFailed } from "./handlers/invoice.ts";
import Stripe from "npm:stripe";
import { createClient } from "jsr:@supabase/supabase-js@2";

serve(async (req: Request) => {
  console.log("[stripe-webhook] Received request"); // Log start
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;
  
  if (req.method !== "POST") {
    return createErrorResponse("Method not allowed", 405);
  }
  
  let isTestMode: boolean;
  let requestBody: { isTestMode?: boolean } = {};
  let preliminaryStripeKey: string | undefined;
  let stripeClient: Stripe | undefined;
  let supabase: SupabaseClient | undefined;

  try {
    console.log("[stripe-webhook] Attempting to read request body...");
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    console.log("[stripe-webhook] Body read. Signature header present:", !!signature);
    
    if (!signature) {
      return createErrorResponse("Missing Stripe signature", 400);
    }
    
    console.log("[stripe-webhook] Getting webhook secrets...");
    const testWebhookSecret = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");
    const liveWebhookSecret = Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET");
    console.log("[stripe-webhook] Test secret found:", !!testWebhookSecret, "Live secret found:", !!liveWebhookSecret);

    if (!testWebhookSecret && !liveWebhookSecret) {
        console.error("[stripe-webhook] Missing both Stripe webhook secrets.");
        return createErrorResponse("Webhook secrets not configured.", 500);
    }

    console.log("[stripe-webhook] Getting preliminary Stripe API key...");
    preliminaryStripeKey = Deno.env.get("STRIPE_SECRET_TEST_KEY") || Deno.env.get("STRIPE_SECRET_LIVE_KEY");
    console.log("[stripe-webhook] Preliminary Stripe API key found:", !!preliminaryStripeKey);
    if (!preliminaryStripeKey) {
      console.error("[stripe-webhook] Missing Stripe Secret Key (TEST or LIVE) for preliminary client.");
      return createErrorResponse("Stripe key configuration error.", 500);
    }

    try {
      console.log("[stripe-webhook] Initializing preliminary Stripe client...");
      stripeClient = new Stripe(preliminaryStripeKey, { apiVersion: "2024-04-10", httpClient: Stripe.createFetchHttpClient() });
      console.log("[stripe-webhook] Preliminary Stripe client initialized.");
    } catch(stripeInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize preliminary Stripe client:", stripeInitError);
       // Return 500 immediately if Stripe client fails
       return createErrorResponse("Stripe client initialization failed.", 500);
    }
    
    // 2. Verify signature - try test secret first, then live
    console.log("[stripe-webhook] Verifying signature...");
    let event: Stripe.Event;
    let eventError: Error | null = null;
    let usedLiveSecret = false;

    if (testWebhookSecret) {
      try {
        // Await the async verification function
        event = await verifyWebhookSignature(stripeClient, body, signature, testWebhookSecret);
      } catch (err) {
        eventError = err;
      }
    }

    // If test secret failed or wasn't available, try live secret
    if (!event! && liveWebhookSecret) {
      eventError = null; // Reset error before trying live
      usedLiveSecret = true;
      try {
        // Await the async verification function
        event = await verifyWebhookSignature(stripeClient, body, signature, liveWebhookSecret);
      } catch (err) {
        eventError = err;
      }
    }

    // If event is still null after trying both (or applicable ones), verification failed
    if (!event!) {
      console.error("Webhook signature verification failed:", eventError?.message);
      return createErrorResponse(eventError?.message || "Signature verification failed", 400);
    }

    console.log(`[stripe-webhook] Webhook signature verified. Event ID: ${event.id}, Livemode: ${event.livemode}`);

    // 3. Determine actual mode from verified event
    isTestMode = event.livemode === false;

    // 4. Get Supabase Admin Client
    try {
      console.log("[stripe-webhook] Initializing Supabase admin client...");
      supabase = createSupabaseAdminClient(); 
      console.log("[stripe-webhook] Supabase admin client initialized.");
    } catch (supabaseInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Supabase admin client:", supabaseInitError);
       // Return 500 immediately if Supabase client fails 
       return createErrorResponse("Supabase admin client initialization failed.", 500);
    }
    
    // Handle various webhook events
    console.log(`[stripe-webhook] Handling event type: ${event.type}`);
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(
          supabase, 
          event.data.object as Stripe.Checkout.Session,
          event.id, 
          event.type
        );
        break;
      }
      
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(
          supabase, 
          event.data.object as Stripe.Subscription, 
          event.id, 
          event.type
        );
        break;
      }
      
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(
          supabase, 
          event.data.object as Stripe.Subscription, 
          event.id, 
          event.type
        );
        break;
      }
      
      case "invoice.payment_succeeded": {
        await handleInvoicePaymentSucceeded(
          supabase, 
          event.data.object as Stripe.Invoice,
          event.id,
          event.type
        );
        break;
      }
      
      case "invoice.payment_failed": {
        await handleInvoicePaymentFailed(
          supabase, 
          event.data.object as Stripe.Invoice,
          event.id,
          event.type
        );
        break;
      }
      
      case "product.updated": {
        const product = event.data.object as Stripe.Product;
        console.log(`[stripe-webhook] Received product.updated for ${product.id}. Active: ${product.active}`);
        const targetActiveStatus = product.active; // Use the status from the event
        
        // Find plans in DB by product ID and update their status
        // (Excluding the Free plan identified by a specific price ID)
        const { error: updateError } = await supabase
          .from('subscription_plans')
          .update({ active: targetActiveStatus, updated_at: new Date().toISOString() })
          .eq('stripe_product_id', product.id)
          .neq('stripe_price_id', 'price_FREE'); // Ensure we don't touch the Free plan row
          
         if (updateError) {
            console.error(`[stripe-webhook] Error updating plan status for product ${product.id}:`, updateError);
            // Decide if this should return 500 to Stripe
         } else {
            console.log(`[stripe-webhook] Successfully updated active status to ${targetActiveStatus} for plans linked to product ${product.id}`);
         }
         // Note: We are NOT invoking sync-stripe-plans here anymore for this event
         break;
      }

      case "price.updated":
      case "price.deleted": { // price.deleted implies inactive
        const price = event.data.object as Stripe.Price;
        const targetActiveStatus = event.type === 'price.deleted' ? false : price.active; // deleted means inactive
        console.log(`[stripe-webhook] Received ${event.type} for ${price.id}. Setting active: ${targetActiveStatus}`);

        // Find the specific plan in DB by price ID and update its status
        // (Excluding the Free plan identified by a specific price ID)
        if (price.id === 'price_FREE') {
           console.log("[stripe-webhook] Ignoring price event for Free plan ID.");
           break; // Do nothing for the free plan price ID
        }
        
        const { error: updateError } = await supabase
          .from('subscription_plans')
          .update({ active: targetActiveStatus, updated_at: new Date().toISOString() })
          .eq('stripe_price_id', price.id);
          
         if (updateError) {
            console.error(`[stripe-webhook] Error updating plan status for price ${price.id}:`, updateError);
            // Decide if this should return 500 to Stripe
         } else {
            console.log(`[stripe-webhook] Successfully updated active status to ${targetActiveStatus} for plan with price ${price.id}`);
         }
        // Note: We are NOT invoking sync-stripe-plans here anymore for these events
        break;
      }

      case "product.created":
      case "price.created":
         // For new products/prices, a full sync might still be easiest
         // OR you could attempt a direct insert here if you have all needed data.
         // Invoking sync ensures reconciliation.
         console.log(`[stripe-webhook] Received ${event.type} event. Triggering full plan sync for reconciliation.`);
         try {
           console.log(`[stripe-webhook] Attempting to invoke sync-stripe-plans with mode: ${isTestMode}`);
           const { data: invokeData, error: invokeError } = await supabase.functions.invoke('sync-stripe-plans', {
             body: JSON.stringify({ isTestMode: isTestMode }) 
           });
           if (invokeError) {
             console.error(`[stripe-webhook] Error invoking sync-stripe-plans function:`, JSON.stringify(invokeError, null, 2)); 
           } else {
             console.log("[stripe-webhook] Successfully invoked sync-stripe-plans. Result:", invokeData);
           }
         } catch (invokeCatchError) {
            console.error(`[stripe-webhook] CRITICAL: Caught exception during function invocation:`, invokeCatchError instanceof Error ? invokeCatchError.message : String(invokeCatchError));
         }
         break;
      
      default: 
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
    
    return createSuccessResponse({ received: true });
  } catch (error) {
    // This is the main catch block
    console.error("[stripe-webhook] Error processing webhook (main catch block):", error);
    return createErrorResponse(error.message || "Internal server error", 500);
  }
});