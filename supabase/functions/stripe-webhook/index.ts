// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Stripe webhook handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
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
import { handleProductCreated as defaultHandleProductCreated, handleProductUpdated as defaultHandleProductUpdated } from "./handlers/product.ts";
import { handlePriceChange as defaultHandlePriceChange } from "./handlers/price.ts";
import { 
    ISupabaseProductWebhookService, 
    SupabaseProductWebhookService 
} from "./services/product_webhook_service.ts";
import { 
    ISupabasePriceWebhookService, 
    SupabasePriceWebhookService 
} from "./services/price_webhook_service.ts";
import Stripe from "npm:stripe";

// --- Dependency Injection ---

interface WebhookDependencies {
  envGet: (key: string) => string | undefined;
  createStripeClient: (isTestMode: boolean, stripeConstructor?: any) => Stripe;
  verifyWebhookSignature: (
    stripe: Stripe,
    payload: string,
    signature: string
  ) => Promise<Stripe.Event>;
  createSupabaseAdminClient: () => SupabaseClient;
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (message: string, status: number, request: Request, error?: unknown) => Response;
  createSuccessResponse: (body: Record<string, unknown>, status: number, request: Request) => Response;
  // Event Handlers
  handleCheckoutSessionCompleted: typeof defaultHandleCheckoutSessionCompleted;
  handleSubscriptionUpdated: typeof defaultHandleSubscriptionUpdated;
  handleSubscriptionDeleted: typeof defaultHandleSubscriptionDeleted;
  handleInvoicePaymentSucceeded: typeof defaultHandleInvoicePaymentSucceeded;
  handleInvoicePaymentFailed: typeof defaultHandleInvoicePaymentFailed;
  handleProductCreated: (supabaseService: ISupabaseProductWebhookService, stripe: Stripe, product: Stripe.Product, eventId: string, eventType: string, isTestMode: boolean) => Promise<void>;
  handleProductUpdated: (supabaseService: ISupabaseProductWebhookService, stripe: Stripe, product: Stripe.Product, eventId: string, eventType: string) => Promise<void>;
  handlePriceChange: (supabaseService: ISupabasePriceWebhookService, stripe: Stripe, price: Stripe.Price, eventId: string, eventType: string, isTestMode: boolean) => Promise<void>;
}

// --- Default Dependencies ---

const defaultDependencies: WebhookDependencies = {
  envGet: Deno.env.get,
  createStripeClient: defaultCreateStripeClient,
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
  handleProductCreated: defaultHandleProductCreated,
  handleProductUpdated: defaultHandleProductUpdated,
  handlePriceChange: defaultHandlePriceChange,
};

// --- Core Logic ---

export async function handleWebhookRequest(req: Request, deps: WebhookDependencies = defaultDependencies): Promise<Response> {
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
      handleInvoicePaymentFailed,
      // Add new handlers
      handleProductCreated,
      handleProductUpdated,
      handlePriceChange
  } = deps;

  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse("Method not allowed", 405, req);
  }

  let stripeClient: Stripe | undefined;
  let event: Stripe.Event | undefined;
  let isTestMode: boolean;

  try {
    console.log("[stripe-webhook] Attempting to read request body...");
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    console.log("[stripe-webhook] Body read. Signature header present:", !!signature);

    if (!signature) {
      return createErrorResponse("Missing Stripe signature", 400, req);
    }

    // Use getStripeMode for initial key guess, but actual mode comes from verified event
    const isTestModeCheck = getStripeMode(); // Use shared helper

    try {
        stripeClient = createStripeClient(isTestModeCheck);
    } catch(stripeInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Stripe client:", stripeInitError);
       const message = stripeInitError instanceof Error ? stripeInitError.message : String(stripeInitError);
       return createErrorResponse(message || "Stripe client initialization failed.", 500, req, stripeInitError);
    }

    console.log("[stripe-webhook] Verifying signature...");
    try {
        event = await verifyWebhookSignature(stripeClient, body, signature);

        console.log(`[stripe-webhook] Webhook signature verified. Event ID: ${event.id}, Livemode: ${event.livemode}`);
        const actualIsTestMode = event.livemode === false; // Determine actual mode from verified event

        let supabaseAdmin: SupabaseClient;
        try {
            supabaseAdmin = createSupabaseAdminClient();
        } catch (supabaseInitError) {
           console.error("[stripe-webhook] CRITICAL: Failed to initialize Supabase admin client:", supabaseInitError);
           const message = supabaseInitError instanceof Error ? supabaseInitError.message : String(supabaseInitError);
           return createErrorResponse(message || "Supabase admin client initialization failed.", 500, req, supabaseInitError);
        }
        
        // Instantiate services using the admin client
        const productWebhookService = new SupabaseProductWebhookService(supabaseAdmin);
        const priceWebhookService = new SupabasePriceWebhookService(supabaseAdmin);

        // Route event using handlers from deps
        console.log(`[stripe-webhook] Handling event type: ${event.type}`);
        switch (event.type) {
          case "checkout.session.completed": {
            await handleCheckoutSessionCompleted(
              supabaseAdmin, 
              stripeClient!, // Add non-null assertion if needed, though stripeClient should be defined here
              event.data.object as Stripe.Checkout.Session,
              event.id,
              event.type
            );
            break;
          }
          case "customer.subscription.updated": {
            await handleSubscriptionUpdated(
              supabaseAdmin, 
              stripeClient!, 
              event.data.object as Stripe.Subscription,
              event.id,
              event.type
            );
            break;
          }
          case "customer.subscription.deleted": {
            await handleSubscriptionDeleted(
              supabaseAdmin, 
              event.data.object as Stripe.Subscription,
              event.id,
              event.type
            );
            break;
          }
          case "invoice.payment_succeeded": {
            await handleInvoicePaymentSucceeded(
              supabaseAdmin, 
              event.data.object as Stripe.Invoice,
              event.id,
              event.type
            );
            break;
          }
          case "invoice.payment_failed": {
            await handleInvoicePaymentFailed(
              supabaseAdmin, 
              event.data.object as Stripe.Invoice,
              event.id,
              event.type
            );
            break;
          }
          case "product.created": {
              await handleProductCreated(
                  productWebhookService, 
                  stripeClient!, 
                  event.data.object as Stripe.Product,
                  event.id,
                  event.type,
                  actualIsTestMode
              );
              break;
          }
          case "product.updated": {
              await handleProductUpdated(
                  productWebhookService, 
                  stripeClient!, 
                  event.data.object as Stripe.Product,
                  event.id,
                  event.type
              );
              break;
          }
          case "price.created":
          case "price.updated":
          case "price.deleted": {
              await handlePriceChange(
                  priceWebhookService, 
                  stripeClient!,
                  event.data.object as Stripe.Price,
                  event.id,
                  event.type, 
                  actualIsTestMode 
              );
              break;
          }
          default: {
            console.warn(`[stripe-webhook] Unhandled event type: ${event.type}`);
          }
        }
        
        console.log(`[stripe-webhook] Event ${event.id} processed (or ignored). Returning 200 OK.`);
        return createSuccessResponse({}, 200, req);

    } catch (err) {
       // Catch errors from verifyWebhookSignature OR the event handling logic above
       console.error("[stripe-webhook] Error during signature verification or event handling:", err);
       const message = err instanceof Error ? err.message : "Webhook processing error";
       // Determine status code based on error type if possible (e.g., signature error vs handler error)
       const status = message.includes("verification failed") ? 400 : 500;
       return createErrorResponse(message, status, req, err);
    }

  } catch (error) {
    // Catch only unexpected top-level errors (e.g., reading body text)
    console.error("[stripe-webhook] CRITICAL top-level error (outside main processing try/catch):", error);
    // Ensure we don't accidentally expose sensitive details
    const message = error instanceof Error ? error.message : "Internal server error.";
    // Avoid returning specific internal errors unless intended (like signature verification)
    // Check if it's a signature error we already handled and returned from within verifyWebhookSignature try/catch
    if (message.includes("verification failed") || message.includes("Missing Stripe signature")) {
         // If somehow signature error bubbled up, return 400
         // This shouldn't happen due to earlier returns, but as a safeguard
         return createErrorResponse(message, 400, req, error);
    }
    // For other unexpected errors, return 500
    return createErrorResponse(message, 500, req, error);
  }
}

// --- Server Entry Point ---

// Only run the server when the script is executed directly
if (import.meta.main) {
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
          // Revert the error object passing for the simpler signature
          // Add type check before constructing error message
          const errorMessage = e instanceof Error ? e.message : "Internal Server Error";
          return createErrResp(errorMessage, 500, req, e);
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
}

// Export types for testing if needed
export type { WebhookDependencies };