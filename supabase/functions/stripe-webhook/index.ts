// Stripe webhook handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"; // Ensure SupabaseClient is imported
import {
  createSupabaseAdminClient as defaultCreateSupabaseAdminClient
} from "../_shared/auth.ts";
import {
  // getStripeClient, // Not directly used here anymore, verification uses its own
  verifyWebhookSignature as defaultVerifyWebhookSignature
} from "../_shared/stripe-client.ts";
import {
  handleCorsPreflightRequest as defaultHandleCorsPreflightRequest,
  createErrorResponse as defaultCreateErrorResponse,
  createSuccessResponse as defaultCreateSuccessResponse
} from "../_shared/cors-headers.ts";
import { handleCheckoutSessionCompleted as defaultHandleCheckoutSessionCompleted } from "./handlers/checkout-session.ts";
import { handleSubscriptionUpdated as defaultHandleSubscriptionUpdated, handleSubscriptionDeleted as defaultHandleSubscriptionDeleted } from "./handlers/subscription.ts";
import { handleInvoicePaymentSucceeded as defaultHandleInvoicePaymentSucceeded, handleInvoicePaymentFailed as defaultHandleInvoicePaymentFailed } from "./handlers/invoice.ts";
import Stripe from "npm:stripe";

// --- Dependency Injection ---

interface WebhookDependencies {
  envGet: (key: string) => string | undefined;
  createStripeClient: (key: string, options?: Stripe.StripeConfig) => Stripe;
  verifyWebhookSignature: (
    stripe: Stripe,
    payload: string,
    signature: string,
    secret: string
  ) => Promise<Stripe.Event>;
  createSupabaseAdminClient: () => SupabaseClient;
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (message: string, status: number) => Response;
  createSuccessResponse: (body?: Record<string, unknown>) => Response;
  // Event Handlers
  handleCheckoutSessionCompleted: (supabase: SupabaseClient, session: Stripe.Checkout.Session, eventId: string, eventType: string) => Promise<void>;
  handleSubscriptionUpdated: (supabase: SupabaseClient, subscription: Stripe.Subscription, eventId: string, eventType: string) => Promise<void>;
  handleSubscriptionDeleted: (supabase: SupabaseClient, subscription: Stripe.Subscription, eventId: string, eventType: string) => Promise<void>;
  handleInvoicePaymentSucceeded: (supabase: SupabaseClient, invoice: Stripe.Invoice, eventId: string, eventType: string) => Promise<void>;
  handleInvoicePaymentFailed: (supabase: SupabaseClient, invoice: Stripe.Invoice, eventId: string, eventType: string) => Promise<void>;
}

// --- Default Dependencies ---

const defaultDependencies: WebhookDependencies = {
  envGet: Deno.env.get,
  createStripeClient: (key, options = { apiVersion: "2024-04-10", httpClient: Stripe.createFetchHttpClient() }) => new Stripe(key, options),
  verifyWebhookSignature: defaultVerifyWebhookSignature,
  createSupabaseAdminClient: defaultCreateSupabaseAdminClient,
  handleCorsPreflightRequest: defaultHandleCorsPreflightRequest,
  createErrorResponse: defaultCreateErrorResponse,
  createSuccessResponse: defaultCreateSuccessResponse,
  // Default Event Handlers
  handleCheckoutSessionCompleted: defaultHandleCheckoutSessionCompleted,
  handleSubscriptionUpdated: defaultHandleSubscriptionUpdated,
  handleSubscriptionDeleted: defaultHandleSubscriptionDeleted,
  handleInvoicePaymentSucceeded: defaultHandleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed: defaultHandleInvoicePaymentFailed,
};

// --- Core Logic ---

export async function handleWebhookRequest(req: Request, deps: WebhookDependencies): Promise<Response> {
  console.log("[stripe-webhook] Received request"); // Log start
  const {
      envGet,
      createStripeClient,
      verifyWebhookSignature,
      createSupabaseAdminClient,
      handleCorsPreflightRequest,
      createErrorResponse,
      createSuccessResponse,
      // Event handlers destructured
      handleCheckoutSessionCompleted,
      handleSubscriptionUpdated,
      handleSubscriptionDeleted,
      handleInvoicePaymentSucceeded,
      handleInvoicePaymentFailed
  } = deps;

  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse("Method not allowed", 405);
  }

  let isTestMode: boolean;
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
    const testWebhookSecret = envGet("STRIPE_TEST_WEBHOOK_SECRET");
    const liveWebhookSecret = envGet("STRIPE_LIVE_WEBHOOK_SECRET");
    console.log("[stripe-webhook] Test secret found:", !!testWebhookSecret, "Live secret found:", !!liveWebhookSecret);

    if (!testWebhookSecret && !liveWebhookSecret) {
        console.error("[stripe-webhook] Missing both Stripe webhook secrets.");
        return createErrorResponse("Webhook secrets not configured.", 500);
    }

    console.log("[stripe-webhook] Getting preliminary Stripe API key...");
    // Prioritize TEST key if available, otherwise use LIVE key
    preliminaryStripeKey = envGet("STRIPE_SECRET_TEST_KEY") ?? envGet("STRIPE_SECRET_LIVE_KEY");

    console.log("[stripe-webhook] Preliminary Stripe API key found:", !!preliminaryStripeKey);
    if (!preliminaryStripeKey) {
      console.error("[stripe-webhook] Missing Stripe Secret Key (TEST or LIVE) for preliminary client.");
      return createErrorResponse("Stripe key configuration error.", 500);
    }

    try {
      console.log("[stripe-webhook] Initializing preliminary Stripe client...");
      stripeClient = createStripeClient(preliminaryStripeKey);
      console.log("[stripe-webhook] Preliminary Stripe client initialized.");
    } catch(stripeInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize preliminary Stripe client:", stripeInitError);
       return createErrorResponse("Stripe client initialization failed.", 500);
    }

    // 2. Verify signature - try test secret first, then live
    console.log("[stripe-webhook] Verifying signature...");
    let event: Stripe.Event | undefined; // Initialize as undefined
    let eventError: Error | null = null;
    let usedLiveSecret = false;

    if (testWebhookSecret) {
      try {
        console.log("[stripe-webhook] Attempting verification with TEST secret.");
        event = await verifyWebhookSignature(stripeClient, body, signature, testWebhookSecret);
      } catch (err) {
        console.warn("[stripe-webhook] Verification with TEST secret failed:", err.message);
        eventError = err;
      }
    }

    // If test secret failed or wasn't available, try live secret
    if (!event && liveWebhookSecret) {
      eventError = null; // Reset error before trying live
      usedLiveSecret = true;
      try {
        console.log("[stripe-webhook] Attempting verification with LIVE secret.");
        event = await verifyWebhookSignature(stripeClient, body, signature, liveWebhookSecret);
      } catch (err) {
        console.warn("[stripe-webhook] Verification with LIVE secret failed:", err.message);
        eventError = err;
      }
    }

    // If event is still undefined after trying both (or applicable ones), verification failed
    if (!event) {
      console.error("[stripe-webhook] Webhook signature verification failed after trying available secrets:", eventError?.message);
      return createErrorResponse(eventError?.message || "Signature verification failed", 400);
    }

    console.log(`[stripe-webhook] Webhook signature verified. Event ID: ${event.id}, Livemode: ${event.livemode}, UsedLiveSecret: ${usedLiveSecret}`);

    // 3. Determine actual mode from verified event
    isTestMode = event.livemode === false;

    // 4. Get Supabase Admin Client
    try {
      console.log("[stripe-webhook] Initializing Supabase admin client...");
      supabase = createSupabaseAdminClient();
      console.log("[stripe-webhook] Supabase admin client initialized.");
    } catch (supabaseInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Supabase admin client:", supabaseInitError);
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
        const targetActiveStatus = product.active;

        // Find plans in DB by product ID and update their status
        const { error: updateError } = await supabase
          .from('subscription_plans')
          .update({ active: targetActiveStatus, updated_at: new Date().toISOString() })
          .eq('stripe_product_id', product.id)
          .neq('stripe_price_id', 'price_FREE'); // Ensure we don't touch the Free plan row

         if (updateError) {
            console.error(`[stripe-webhook] Error updating plan status for product ${product.id}:`, updateError);
            // Potentially return 500 to Stripe if this failure is critical
            // For now, we log and continue, returning 200 later
         } else {
            console.log(`[stripe-webhook] Successfully updated active status to ${targetActiveStatus} for plans linked to product ${product.id}`);
         }
         break;
      }

      case "price.updated":
      case "price.deleted": { // price.deleted implies inactive
        const price = event.data.object as Stripe.Price;
        const targetActiveStatus = event.type === 'price.deleted' ? false : price.active;
        console.log(`[stripe-webhook] Received ${event.type} for ${price.id}. Setting active: ${targetActiveStatus}`);

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
            // Potentially return 500
         } else {
            console.log(`[stripe-webhook] Successfully updated active status to ${targetActiveStatus} for plan with price ${price.id}`);
         }
        break;
      }

      case "product.created":
      case "price.created":
         console.log(`[stripe-webhook] Received ${event.type} event. Triggering full plan sync for reconciliation.`);
         try {
           console.log(`[stripe-webhook] Attempting to invoke sync-stripe-plans with mode: ${isTestMode ? 'test' : 'live'}`);
           const { data: invokeData, error: invokeError } = await supabase.functions.invoke('sync-stripe-plans', {
             body: JSON.stringify({ isTestMode: isTestMode })
           });
           if (invokeError) {
             console.error(`[stripe-webhook] Error invoking sync-stripe-plans function:`, JSON.stringify(invokeError, null, 2));
              // Potentially return 500
           } else {
             console.log("[stripe-webhook] Successfully invoked sync-stripe-plans. Result:", invokeData);
           }
         } catch (invokeCatchError) {
            console.error(`[stripe-webhook] CRITICAL: Caught exception during function invocation:`, invokeCatchError instanceof Error ? invokeCatchError.message : String(invokeCatchError));
             // Potentially return 500
         }
         break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    console.log(`[stripe-webhook] Event ${event.id} handled successfully.`);
    return createSuccessResponse({ received: true });

  } catch (error) {
    console.error("[stripe-webhook] Uncaught error in handler:", error);
    return createErrorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

// --- Server Entry Point ---

// Only run the server if this script is the main program
if (import.meta.main) {
  serve((req) => handleWebhookRequest(req, defaultDependencies));
}

// Export types for testing if needed
export type { WebhookDependencies };
// Ensure the core handler is exported for testing