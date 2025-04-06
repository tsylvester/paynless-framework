// Add this line to provide Deno/Edge runtime types
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Stripe webhook handler
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js";
import {
  createSupabaseAdminClient as defaultCreateSupabaseAdminClient
} from "../_shared/auth.ts";
import {
  verifyWebhookSignature as defaultVerifyWebhookSignature,
  getStripeMode,
  getStripeClient as defaultCreateStripeClient
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
    signature: string
  ) => Promise<Stripe.Event>;
  createSupabaseAdminClient: () => SupabaseClient;
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (message: string, status: number) => Response;
  createSuccessResponse: (body?: Record<string, unknown>) => Response;
  // Event Handlers
  handleCheckoutSessionCompleted: (supabase: SupabaseClient, stripe: Stripe, session: Stripe.Checkout.Session, eventId: string, eventType: string) => Promise<void>;
  handleSubscriptionUpdated: (supabase: SupabaseClient, stripe: Stripe, subscription: Stripe.Subscription, eventId: string, eventType: string) => Promise<void>;
  handleSubscriptionDeleted: (supabase: SupabaseClient, stripe: Stripe, subscription: Stripe.Subscription, eventId: string, eventType: string) => Promise<void>;
  handleInvoicePaymentSucceeded: (supabase: SupabaseClient, stripe: Stripe, invoice: Stripe.Invoice, eventId: string, eventType: string) => Promise<void>;
  handleInvoicePaymentFailed: (supabase: SupabaseClient, stripe: Stripe, invoice: Stripe.Invoice, eventId: string, eventType: string) => Promise<void>;
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

    // Restore logic for getting preliminary key using envGet and getStripeMode
    const isTestModeCheck = getStripeMode(); // Use shared helper
    const preliminaryStripeKey = isTestModeCheck 
        ? envGet("STRIPE_SECRET_TEST_KEY") 
        : envGet("STRIPE_SECRET_LIVE_KEY");

    if (!preliminaryStripeKey) {
      console.error("[stripe-webhook] Missing Stripe Secret Key env var. Cannot initialize client.");
      return createErrorResponse("Stripe key configuration error.", 500);
    }

    // Initialize Stripe client using dependency (with key)
    try {
        stripeClient = createStripeClient(preliminaryStripeKey);
    } catch(stripeInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Stripe client:", stripeInitError);
       // Use instanceof Error check (already added)
       const message = stripeInitError instanceof Error ? stripeInitError.message : String(stripeInitError);
       return createErrorResponse(message || "Stripe client initialization failed.", 500);
    }

    // Verify signature - verifyWebhookSignature handles secret lookup internally
    console.log("[stripe-webhook] Verifying signature...");
    let event: Stripe.Event | undefined;
    
    try {
        // Call with 3 arguments - stripe-client handles internal secret lookup/error
        event = await verifyWebhookSignature(stripeClient, body, signature); 
    } catch (err) {
       // Signature verification failed (or secret was missing)
       console.error("[stripe-webhook] Webhook signature verification failed:", err.message);
       return createErrorResponse(err.message || "Signature verification failed", 400); 
    }

    // Event is now verified and available
    console.log(`[stripe-webhook] Webhook signature verified. Event ID: ${event.id}, Livemode: ${event.livemode}`);

    // Get Supabase Admin Client
    try {
        supabase = createSupabaseAdminClient();
    } catch (supabaseInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Supabase admin client:", supabaseInitError);
       return createErrorResponse("Supabase admin client initialization failed.", 500);
    }

    // Route event (ensure stripeClient is passed to handlers)
    console.log(`[stripe-webhook] Handling event type: ${event.type}`);
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(
          supabase,
          stripeClient,
          event.data.object as Stripe.Checkout.Session,
          event.id,
          event.type
        );
        break;
      }

      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(
          supabase,
          stripeClient,
          event.data.object as Stripe.Subscription,
          event.id,
          event.type
        );
        break;
      }

      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(
          supabase,
          stripeClient,
          event.data.object as Stripe.Subscription,
          event.id,
          event.type
        );
        break;
      }

      case "invoice.payment_succeeded": {
        await handleInvoicePaymentSucceeded(
          supabase,
          stripeClient,
          event.data.object as Stripe.Invoice,
          event.id,
          event.type
        );
        break;
      }

      case "invoice.payment_failed": {
        await handleInvoicePaymentFailed(
          supabase,
          stripeClient,
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
           // Restore usage of isTestModeCheck
           console.log(`[stripe-webhook] Attempting to invoke sync-stripe-plans with mode: ${isTestModeCheck ? 'test' : 'live'}`);
           const { data: invokeData, error: invokeError } = await supabase.functions.invoke('sync-stripe-plans', {
             body: JSON.stringify({ isTestMode: isTestModeCheck })
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

console.log("[stripe-webhook] Setting up server...");
serve(async (req) => {
  console.log("[stripe-webhook] Incoming request...");
  try {
      return await handleWebhookRequest(req, defaultDependencies);
  } catch (e) {
      console.error("[stripe-webhook] UNHANDLED EXCEPTION:", e);
      // Use default dependency for error response if available, otherwise basic response
      const createErrResp = defaultDependencies.createErrorResponse || 
                            ((msg, status) => new Response(JSON.stringify({ error: msg }), { status: status, headers: { "Content-Type": "application/json" } }));
      return createErrResp("Internal Server Error", 500);
  }
}, {
  onListen({ port, hostname }) {
      console.log(`[stripe-webhook] Server listening on http://${hostname}:${port}`);
  },
  onError(error) {
    console.error("[stripe-webhook] Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

console.log("[stripe-webhook] Server setup complete.");

// Export types for testing if needed
export type { WebhookDependencies };
// Ensure the core handler is exported for testing