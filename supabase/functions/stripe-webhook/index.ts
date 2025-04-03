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

serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;
  
  if (req.method !== "POST") {
    return createErrorResponse("Method not allowed", 405);
  }
  
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    
    if (!signature) {
      return createErrorResponse("Missing Stripe signature", 400);
    }
    
    // Get proper webhook secret based on header
    const isTestMode = req.headers.get("stripe-test-header") === "true";
    const endpointSecret = isTestMode
      ? Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST")
      : Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE");
    
    if (!endpointSecret) {
      return createErrorResponse("Missing Stripe webhook secret", 500);
    }
    
    const stripe = getStripeClient(isTestMode);
    
    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = verifyWebhookSignature(stripe, body, signature, endpointSecret);
    } catch (err) {
      return createErrorResponse(err.message, 400);
    }
    
    const supabase = createSupabaseAdminClient();
    
    // Handle various webhook events
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(
          supabase, 
          stripe, 
          event.data.object as Stripe.Checkout.Session,
          event.id, 
          event.type
        );
        break;
      }
      
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(
          supabase, 
          stripe, 
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
      
      default: 
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return createSuccessResponse({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return createErrorResponse(error.message);
  }
});