// Subscription API endpoints
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  createSupabaseClient, 
  getUserId 
} from "../_shared/supabase-client.ts";
import { 
  getStripeClient, 
  getStripeMode 
} from "../_shared/stripe-client.ts";
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../_shared/cors-headers.ts";
import { getCurrentSubscription } from "./handlers/current.ts";
import { getSubscriptionPlans } from "./handlers/plans.ts";
import { createCheckoutSession } from "./handlers/checkout.ts";
import { cancelSubscription, resumeSubscription } from "./handlers/subscription.ts";
import { createBillingPortalSession } from "./handlers/billing-portal.ts";
import { getUsageMetrics } from "./handlers/usage.ts";

// Handle API routes
serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api-subscriptions/, "");
    const supabase = createSupabaseClient(req);
    
    // Parse request body if it exists
    let requestData = {};
    if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
      requestData = await req.json();
    }
    
    // Determine test/prod mode from request or environment
    const isTestMode = getStripeMode(requestData as Record<string, any>);
    
    // Initialize Stripe with the appropriate API key
    const stripe = getStripeClient(isTestMode);
    
    // Route handling
    try {
      // GET /current - Get current user subscription
      if (path === "/current" && req.method === "GET") {
        const userId = await getUserId(req);
        return await getCurrentSubscription(supabase, userId, isTestMode);
      }
      
      // GET /plans - List available plans
      else if (path === "/plans" && req.method === "GET") {
        return await getSubscriptionPlans(supabase, isTestMode);
      }
      
      // POST /checkout - Create checkout session
      else if (path === "/checkout" && req.method === "POST") {
        const userId = await getUserId(req);
        return await createCheckoutSession(supabase, stripe, userId, requestData as any, isTestMode);
      }
      
      // POST /:id/cancel - Cancel subscription
      else if (path.match(/^\/[^/]+\/cancel$/) && req.method === "POST") {
        const userId = await getUserId(req);
        const subscriptionId = path.split("/")[1];
        return await cancelSubscription(supabase, stripe, userId, subscriptionId);
      }
      
      // POST /:id/resume - Resume subscription
      else if (path.match(/^\/[^/]+\/resume$/) && req.method === "POST") {
        const userId = await getUserId(req);
        const subscriptionId = path.split("/")[1];
        return await resumeSubscription(supabase, stripe, userId, subscriptionId);
      }
      
      // POST /billing-portal - Create billing portal session
      else if (path === "/billing-portal" && req.method === "POST") {
        const userId = await getUserId(req);
        return await createBillingPortalSession(supabase, stripe, userId, requestData as any);
      }
      
      // GET /usage/:metric - Get usage metrics
      else if (path.match(/^\/usage\/[^/]+$/) && req.method === "GET") {
        const userId = await getUserId(req);
        const metric = path.split("/")[2];
        return await getUsageMetrics(supabase, userId, metric);
      }
      
      // Route not found
      else {
        return createErrorResponse("Not found", 404);
      }
    } catch (routeError) {
      // Specific handling for authentication errors
      if (routeError.message === "Unauthorized") {
        return createErrorResponse("Unauthorized", 401);
      }
      throw routeError; // Let the outer catch handle other errors
    }
  } catch (error) {
    console.error("Error handling request:", error);
    return createErrorResponse(error.message);
  }
});