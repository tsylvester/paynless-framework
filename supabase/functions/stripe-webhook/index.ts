// Add this line to provide Deno/Edge runtime types
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Stripe webhook handler
import { serve } from "std/http/server.ts";
import { SupabaseClient, createClient as createSupabaseClientReal } from "jsr:@supabase/supabase-js@2";
import {
  createSupabaseAdminClient as defaultCreateSupabaseAdminClient
} from "@shared/auth.ts";
import {
  verifyWebhookSignature as defaultVerifyWebhookSignature,
  getStripeMode,
  getStripeClient as defaultCreateStripeClient
} from "@shared/stripe-client.ts";
import {
  handleCorsPreflightRequest as defaultHandleCorsPreflightRequest,
  createErrorResponse as defaultCreateErrorResponse,
  createSuccessResponse as defaultCreateSuccessResponse
} from "@shared/cors-headers.ts";
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
  handleProductCreated: (supabaseService: ISupabaseProductWebhookService, stripe: Stripe, product: Stripe.Product, eventId: string, eventType: string, isTestMode: boolean) => Promise<void>;
  handleProductUpdated: (supabaseService: ISupabaseProductWebhookService, stripe: Stripe, product: Stripe.Product, eventId: string, eventType: string) => Promise<void>;
  handlePriceChange: (supabaseService: ISupabasePriceWebhookService, stripe: Stripe, price: Stripe.Price, eventId: string, eventType: string, isTestMode: boolean) => Promise<void>;
}

// --- Default Dependencies ---

// Helper function to create the service and wrap the original handlers
const createProductHandlersWithService = (supabaseClient: SupabaseClient) => {
  const service = new SupabaseProductWebhookService(supabaseClient);
  return {
    // Wrap the original handler, passing the service instead of the client
    handleProductCreated: (
        _service: ISupabaseProductWebhookService, // We pass the created service below
        stripe: Stripe, 
        product: Stripe.Product, 
        eventId: string, 
        eventType: string, 
        isTestMode: boolean
    ) => defaultHandleProductCreated(service, stripe, product, eventId, eventType, isTestMode),
    // Wrap the original handler
    handleProductUpdated: (
        _service: ISupabaseProductWebhookService, // We pass the created service below
        stripe: Stripe, 
        product: Stripe.Product, 
        eventId: string, 
        eventType: string
    ) => defaultHandleProductUpdated(service, stripe, product, eventId, eventType),
  };
};

// Helper function to create the service and wrap the original price handler
const createPriceHandlerWithService = (supabaseClient: SupabaseClient) => {
  const service = new SupabasePriceWebhookService(supabaseClient);
  return {
    handlePriceChange: (
        _service: ISupabasePriceWebhookService,
        stripe: Stripe, 
        price: Stripe.Price, 
        eventId: string, 
        eventType: string, 
        isTestMode: boolean
    ) => defaultHandlePriceChange(service, stripe, price, eventId, eventType, isTestMode),
  };
};

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
  // --- Use the wrapped product handlers ---
  ...createProductHandlersWithService(defaultCreateSupabaseAdminClient()),
  // --- Use the wrapped price handler ---
  ...createPriceHandlerWithService(defaultCreateSupabaseAdminClient()),
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
    return createErrorResponse("Method not allowed", 405);
  }

  let stripeClient: Stripe | undefined;
  let supabase: SupabaseClient | undefined;
  let event: Stripe.Event | undefined;
  let isTestMode: boolean;

  try {
    console.log("[stripe-webhook] Attempting to read request body...");
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    console.log("[stripe-webhook] Body read. Signature header present:", !!signature);

    if (!signature) {
      return createErrorResponse("Missing Stripe signature", 400);
    }

    // Use getStripeMode for initial key guess, but actual mode comes from verified event
    const isTestModeCheck = getStripeMode(); // Use shared helper
    const preliminaryStripeKey = isTestModeCheck 
        ? envGet("STRIPE_SECRET_TEST_KEY") 
        : envGet("STRIPE_SECRET_LIVE_KEY");

    if (!preliminaryStripeKey) {
      console.error("[stripe-webhook] Missing Stripe Secret Key env var. Cannot initialize client.");
      return createErrorResponse("Stripe key configuration error.", 500);
    }

    try {
        stripeClient = createStripeClient(preliminaryStripeKey);
    } catch(stripeInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Stripe client:", stripeInitError);
       const message = stripeInitError instanceof Error ? stripeInitError.message : String(stripeInitError);
       return createErrorResponse(message || "Stripe client initialization failed.", 500);
    }

    console.log("[stripe-webhook] Verifying signature...");
    try {
        event = await verifyWebhookSignature(stripeClient, body, signature); 
    } catch (err) {
       console.error("[stripe-webhook] Webhook signature verification failed:", err.message);
       return createErrorResponse(err.message || "Signature verification failed", 400); 
    }

    console.log(`[stripe-webhook] Webhook signature verified. Event ID: ${event.id}, Livemode: ${event.livemode}`);
    isTestMode = event.livemode === false; // Determine actual mode from verified event

    try {
        supabase = createSupabaseAdminClient();
    } catch (supabaseInitError) {
       console.error("[stripe-webhook] CRITICAL: Failed to initialize Supabase admin client:", supabaseInitError);
       return createErrorResponse("Supabase admin client initialization failed.", 500);
    }

    // Route event
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
      // --- Refactored Cases Using Service --- 
      case "product.created": {
         await handleProductCreated(
            null as any, // Pass null for the service arg
            stripeClient!, 
            event.data.object as Stripe.Product, 
            event.id, 
            event.type, 
            isTestMode 
         );
         break;
      }
      case "product.updated": {
         await handleProductUpdated(
            null as any, // Pass null for the service arg
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
        // Call handler from deps. Pass null for the service arg to match signature.
         await handlePriceChange(
            null as any, // Pass null for the ISupabasePriceWebhookService argument
            stripeClient!,
            event.data.object as Stripe.Price,
            event.id,
            event.type, // Pass event type
            isTestMode // Pass mode for sync trigger
         );
         break;
      }
      // --- End Refactored Cases ---
      default: {
        console.warn(`[stripe-webhook] Unhandled event type: ${event.type}`);
      }
    }
    
    console.log(`[stripe-webhook] Event ${event.id} processed (or ignored). Returning 200 OK.`);
    return createSuccessResponse();

  } catch (error) {
    // Catch top-level errors (e.g., body parsing, critical init failures before routing)
    console.error("[stripe-webhook] CRITICAL top-level error:", error);
    // Ensure we don't accidentally expose sensitive details
    const message = error instanceof Error ? error.message : "Internal server error.";
    // Avoid returning specific internal errors unless intended (like signature verification)
    // Check if it's a signature error we already handled and returned from within verifyWebhookSignature try/catch
    if (error.message?.includes("verification failed") || error.message?.includes("Missing Stripe signature")) {
         // If somehow signature error bubbled up, return 400
         // This shouldn't happen due to earlier returns, but as a safeguard
         return createErrorResponse(error.message, 400); 
    } 
    // For other unexpected errors, return 500
    return createErrorResponse(message, 500);
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
      // Revert the error object passing for the simpler signature
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