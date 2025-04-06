// Subscription API endpoints
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { SupabaseClient, User, AuthError } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
// Shared utilities
import {
  createSupabaseClient as defaultCreateSupabaseClient,
  createUnauthorizedResponse as defaultCreateUnauthorizedResponse
} from "../_shared/auth.ts";
import {
  getStripeClient as defaultGetStripeClient,
  getStripeMode as defaultGetStripeMode
} from "../_shared/stripe-client.ts";
import {
  handleCorsPreflightRequest as defaultHandleCorsPreflightRequest,
  createErrorResponse as defaultCreateErrorResponse,
  createSuccessResponse as defaultCreateSuccessResponse
} from "../_shared/cors-headers.ts";
// Route handlers
import { getCurrentSubscription as defaultGetCurrentSubscription } from "./handlers/current.ts";
import { getSubscriptionPlans as defaultGetSubscriptionPlans } from "./handlers/plans.ts";
import { createCheckoutSession as defaultCreateCheckoutSession } from "./handlers/checkout.ts";
import { cancelSubscription as defaultCancelSubscription, resumeSubscription as defaultResumeSubscription } from "./handlers/subscription.ts";
import { createBillingPortalSession as defaultCreateBillingPortalSession } from "./handlers/billing-portal.ts";
import { getUsageMetrics as defaultGetUsageMetrics } from "./handlers/usage.ts";

// --- Dependency Injection ---

interface ApiSubscriptionsDependencies {
  handleCorsPreflightRequest: typeof defaultHandleCorsPreflightRequest;
  createUnauthorizedResponse: typeof defaultCreateUnauthorizedResponse;
  createErrorResponse: typeof defaultCreateErrorResponse;
  createSuccessResponse: typeof defaultCreateSuccessResponse;
  createSupabaseClient: (req: Request) => SupabaseClient;
  getUser: (client: SupabaseClient) => Promise<{ data: { user: User | null }, error: AuthError | null }>;
  getStripeMode: typeof defaultGetStripeMode;
  getStripeClient: typeof defaultGetStripeClient;
  getPathname: (req: Request) => string;
  parseJsonBody: (req: Request) => Promise<any>;
  // Route Handlers
  getCurrentSubscription: typeof defaultGetCurrentSubscription;
  getSubscriptionPlans: typeof defaultGetSubscriptionPlans;
  createCheckoutSession: typeof defaultCreateCheckoutSession;
  cancelSubscription: typeof defaultCancelSubscription;
  resumeSubscription: typeof defaultResumeSubscription;
  createBillingPortalSession: typeof defaultCreateBillingPortalSession;
  getUsageMetrics: typeof defaultGetUsageMetrics;
}

// --- Default Dependencies ---

const defaultDependencies: ApiSubscriptionsDependencies = {
  handleCorsPreflightRequest: defaultHandleCorsPreflightRequest,
  createUnauthorizedResponse: defaultCreateUnauthorizedResponse,
  createErrorResponse: defaultCreateErrorResponse,
  createSuccessResponse: defaultCreateSuccessResponse,
  createSupabaseClient: defaultCreateSupabaseClient,
  getUser: (client) => client.auth.getUser(),
  getStripeMode: defaultGetStripeMode,
  getStripeClient: defaultGetStripeClient,
  getPathname: (req) => new URL(req.url).pathname.replace(/^\/api-subscriptions/, ""), // Remove base path
  parseJsonBody: (req) => req.json(),
  // Default Handlers
  getCurrentSubscription: defaultGetCurrentSubscription,
  getSubscriptionPlans: defaultGetSubscriptionPlans,
  createCheckoutSession: defaultCreateCheckoutSession,
  cancelSubscription: defaultCancelSubscription,
  resumeSubscription: defaultResumeSubscription,
  createBillingPortalSession: defaultCreateBillingPortalSession,
  getUsageMetrics: defaultGetUsageMetrics,
};

// --- Core Logic ---

export async function handleApiSubscriptionsRequest(req: Request, deps: ApiSubscriptionsDependencies): Promise<Response> {
  // ---> Add EARLY logging <---
  console.log(`[api-subscriptions] START Request: ${req.method} ${req.url}`);
  try {
      // Log environment variables specifically needed for Stripe
      const testModeEnv = Deno.env.get('STRIPE_TEST_MODE');
      const secretTestKeyEnv = Deno.env.get('STRIPE_SECRET_TEST_KEY');
      console.log(`[api-subscriptions] Env Vars Check: STRIPE_TEST_MODE=${testModeEnv}, STRIPE_SECRET_TEST_KEY=${secretTestKeyEnv ? 'Loaded' : 'MISSING!'}`);
  } catch (envError) {
      console.error("[api-subscriptions] Error accessing Deno.env at start:", envError);
  }
  // ---> End EARLY logging <---

  const {
      handleCorsPreflightRequest,
      createUnauthorizedResponse,
      createErrorResponse,
      createSuccessResponse,
      createSupabaseClient,
      getUser,
      getStripeMode,
      getStripeClient,
      getPathname,
      parseJsonBody,
      // Handlers
      getCurrentSubscription,
      getSubscriptionPlans,
      createCheckoutSession,
      cancelSubscription,
      resumeSubscription,
      createBillingPortalSession,
      getUsageMetrics
  } = deps;

  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    // Create Supabase client first for non-OPTIONS requests
    let supabase: SupabaseClient | null = null;
    let userId: string | undefined;
    
    if (req.method !== "OPTIONS") {
        try {
            supabase = createSupabaseClient(req);
            const { data: { user }, error: authError } = await getUser(supabase);
            
            if (authError || !user) {
                console.warn("[api-subscriptions] Authentication failed:", authError?.message || 'No user');
                return createUnauthorizedResponse(authError?.message || "Authentication failed");
            }
            userId = user.id;
        } catch (clientError) {
             console.error("[api-subscriptions] Failed to create or use Supabase client:", clientError);
             return createErrorResponse("Internal configuration error", 500);
        }
    }
    
    // Path calculation now relies on the dependency
    const path = getPathname(req);
    // console.log(`[api-subscriptions] User ${userId || 'N/A'} requesting path: ${req.method} ${path}`);

    // Check if Supabase client is available for routes that require it (most of them)
    // If method is OPTIONS, supabase will be null, but that's handled by the CORS return
    if (req.method !== "OPTIONS" && !supabase) {
         console.error("[api-subscriptions] Supabase client unexpectedly null after initial check.");
         return createErrorResponse("Internal server error", 500);
    }

    // Parse request body if needed
    let requestData = {};
    let parseError = null;
    if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
      try {
        requestData = await parseJsonBody(req);
      } catch (err) {
        if (err instanceof SyntaxError) {
           parseError = err;
        } else {
           throw err; // Re-throw unexpected parsing errors
        }
      }
    }
    if (parseError) {
         console.warn(`[api-subscriptions] Invalid JSON body for ${req.method} ${path}`);
         return createErrorResponse("Invalid JSON body", 400);
    }

    // Determine test/prod mode and initialize Stripe (might be needed by various handlers)
    const isTestMode = getStripeMode(requestData as Record<string, any>);
    let stripe: Stripe | null = null;
    try {
        // ---> Add logging around Stripe init <---
        console.log(`[api-subscriptions] Attempting to initialize Stripe client. TestMode=${isTestMode}`);
        stripe = getStripeClient(isTestMode);
        console.log("[api-subscriptions] Stripe client initialized successfully.");
        // ---> End logging <---
    } catch (stripeError) {
        // Existing error log is here
        console.error("[api-subscriptions] Failed to initialize Stripe client:", stripeError);
        return createErrorResponse("Stripe configuration error", 500);
    }

    // Route handling - Pass necessary clients/data to handlers
    try {
       // Routes now assume supabase and userId are valid if we reach here for non-OPTIONS requests
       if (req.method === "OPTIONS") { 
           // Should have been handled by CORS check, but as a safeguard:
           return createErrorResponse("Method Not Allowed", 405);
       }
       if (!userId || !supabase) { // Double-check for safety
           console.error("[api-subscriptions] Programming error: userId or supabase null in routing block.");
           return createErrorResponse("Internal Server Error", 500);
       }

      // GET /current - Get current user subscription
      if (path === "/current" && req.method === "GET") {
        return await getCurrentSubscription(supabase, userId);
      }

      // GET /plans - List available plans (might not strictly need userId, but needs Supabase)
      else if (path === "/plans" && req.method === "GET") {
        return await getSubscriptionPlans(supabase, isTestMode);
      }

      // POST /checkout - Create checkout session
      else if (path === "/checkout" && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        // Pass the required dependencies (response creators) to the handler
        const handlerDeps = { 
          createErrorResponse: deps.createErrorResponse,
          createSuccessResponse: deps.createSuccessResponse
        };
        return await createCheckoutSession(supabase, stripe, userId, requestData as any, isTestMode, handlerDeps);
      }

      // POST /:id/cancel - Cancel subscription
      else if (path.match(/^\/[^/]+\/cancel$/) && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        const subscriptionId = path.split("/")[1];
        return await cancelSubscription(supabase, stripe, userId, subscriptionId);
      }

      // POST /:id/resume - Resume subscription
      else if (path.match(/^\/[^/]+\/resume$/) && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        const subscriptionId = path.split("/")[1];
        return await resumeSubscription(supabase, stripe, userId, subscriptionId);
      }

      // POST /billing-portal - Create billing portal session
      else if (path === "/billing-portal" && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        return await createBillingPortalSession(supabase, stripe, userId, requestData as any);
      }

      // GET /usage/:metric - Get usage metrics
      else if (path.match(/^\/usage\/[^/]+$/) && req.method === "GET") {
        const metric = path.split("/")[2];
        return await getUsageMetrics(supabase, userId, metric);
      }

      // Route not found
      else {
        return createErrorResponse("Not found", 404);
      }
    } catch (routeError) {
      // Catch errors thrown *within* the route handlers
      console.error(`[api-subscriptions] Error in route handler for ${req.method} ${path}:`, routeError);
      return createErrorResponse(routeError.message || "Handler error", 500);
    }
  } catch (error) {
    // Catch errors during setup (auth, client creation, parsing etc.)
    console.error("[api-subscriptions] Unexpected setup error:", error);
    return createErrorResponse(error.message || "Internal server error", 500);
  }
}

// --- Server Entry Point ---
if (import.meta.main) {
   serve((req) => handleApiSubscriptionsRequest(req, defaultDependencies));
}

// --- Exports for Testing ---
export type { ApiSubscriptionsDependencies };