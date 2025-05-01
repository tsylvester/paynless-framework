// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
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
import { getCurrentSubscription as defaultGetCurrentSubscription, HandlerError } from "./handlers/current.ts";
import { getSubscriptionPlans as defaultGetSubscriptionPlans } from "./handlers/plans.ts";
import { createCheckoutSession as defaultCreateCheckoutSession } from "./handlers/checkout.ts";
import { cancelSubscription as defaultCancelSubscription, resumeSubscription as defaultResumeSubscription } from "./handlers/subscription.ts";
import { createBillingPortalSession as defaultCreateBillingPortalSession } from "./handlers/billing-portal.ts";
import { getUsageMetrics as defaultGetUsageMetrics } from "./handlers/usage.ts";
import { logger } from "../_shared/logger.ts";
// Fix: Import BillingPortalRequest type
import type { BillingPortalRequest, CheckoutSessionRequest } from "../_shared/types.ts";

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
  logger.info('api-subscriptions function starting up.');

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
             return createErrorResponse("Internal configuration error", 500, req);
        }
    }
    
    // Path calculation now relies on the dependency
    const path = getPathname(req);
    // console.log(`[api-subscriptions] User ${userId || 'N/A'} requesting path: ${req.method} ${path}`);

    // Check if Supabase client is available for routes that require it (most of them)
    // If method is OPTIONS, supabase will be null, but that's handled by the CORS return
    if (req.method !== "OPTIONS" && !supabase) {
         console.error("[api-subscriptions] Supabase client unexpectedly null after initial check.");
         return createErrorResponse("Internal server error", 500, req);
    }

    // Parse request body if needed
    let requestData = {};
    let parseError: Error | null = null;
    if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
      try {
        requestData = await parseJsonBody(req);
      } catch (err) {
        if (err instanceof SyntaxError || err instanceof Error) {
           parseError = err;
        } else {
           throw err; // Re-throw unexpected parsing errors
        }
      }
    }
    if (parseError) {
         console.warn(`[api-subscriptions] Invalid JSON body for ${req.method} ${path}`);
         return createErrorResponse("Invalid JSON body", 400, req);
    }

    // Determine test/prod mode and initialize Stripe (might be needed by various handlers)
    const isTestMode = getStripeMode();
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
        return createErrorResponse("Stripe configuration error", 500, req);
    }

    // Route handling - Pass necessary clients/data to handlers
    try {
       // Routes now assume supabase and userId are valid if we reach here for non-OPTIONS requests
       if (req.method === "OPTIONS") { 
           // Should have been handled by CORS check, but as a safeguard:
           return createErrorResponse("Method Not Allowed", 405, req);
       }
       if (!userId || !supabase) { // Double-check for safety
           console.error("[api-subscriptions] Programming error: userId or supabase null in routing block.");
           return createErrorResponse("Internal Server Error", 500, req);
       }

      // GET /current - Get current user subscription
      if (path === "/current" && req.method === "GET") {
        // Fix: Call refactored handler and handle response/error
        try {
          const subscriptionData = await getCurrentSubscription(supabase, userId);
          // Now we need to transform the DB data into the API response shape if needed
          // For now, assuming the DB shape is acceptable or transformation happens client-side
          // If transformation is needed, do it here before calling createSuccessResponse
          return createSuccessResponse(subscriptionData, 200, req); 
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // GET /plans - List available plans (might not strictly need userId, but needs Supabase)
      else if (path === "/plans" && req.method === "GET") {
        // Fix: Call refactored handler and handle response/error
        try {
          const plansData = await getSubscriptionPlans(supabase, isTestMode);
          // Plans data is already filtered, return directly
          return createSuccessResponse(plansData, 200, req);
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // POST /checkout - Create checkout session
      else if (path === "/checkout" && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        // Fix: Call refactored handler and handle response/error
        try {
          const sessionData = await createCheckoutSession(supabase, stripe, userId, requestData as CheckoutSessionRequest, isTestMode);
          return createSuccessResponse(sessionData, 200, req);
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // POST /:id/cancel - Cancel subscription
      else if (path.match(/^\/[^/]+\/cancel$/) && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        const subscriptionId = path.split("/")[1];
        // Fix: Call refactored handler and handle response/error
        try {
          const updatedSubData = await cancelSubscription(supabase, stripe, userId, subscriptionId);
          return createSuccessResponse(updatedSubData, 200, req);
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // POST /:id/resume - Resume subscription
      else if (path.match(/^\/[^/]+\/resume$/) && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        const subscriptionId = path.split("/")[1];
        // Fix: Call refactored handler and handle response/error
        try {
          const updatedSubData = await resumeSubscription(supabase, stripe, userId, subscriptionId);
          return createSuccessResponse(updatedSubData, 200, req);
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // POST /billing-portal - Create billing portal session
      else if (path === "/billing-portal" && req.method === "POST") {
        if (!stripe) throw new Error("Stripe client not available");
        // Fix: Call refactored handler and handle response/error
        try {
          const sessionData = await createBillingPortalSession(supabase, stripe, userId, requestData as BillingPortalRequest);
          return createSuccessResponse(sessionData, 200, req);
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // GET /usage/:metric - Get usage metrics
      else if (path.match(/^\/usage\/[^/]+$/) && req.method === "GET") {
        const metric = path.split("/")[2];
        // Fix: Call refactored handler and handle response/error
        try {
          const usageData = await getUsageMetrics(supabase, userId, metric);
          return createSuccessResponse(usageData, 200, req);
        } catch (handlerError) {
          if (handlerError instanceof HandlerError) {
            return createErrorResponse(handlerError.message, handlerError.status, req, handlerError.cause);
          } else {
            // Handle unexpected errors from the handler itself
            const message = handlerError instanceof Error ? handlerError.message : String(handlerError);
            return createErrorResponse(message, 500, req, handlerError);
          }
        }
      }

      // Route not found
      else {
        return createErrorResponse("Not found", 404, req);
      }
    } catch (routeError) {
      // Catch errors thrown *within* the route handlers
      console.error(`[api-subscriptions] Error in route handler for ${req.method} ${path}:`, routeError);
      const errorMessage = routeError instanceof Error ? routeError.message : String(routeError);
      return createErrorResponse(errorMessage || "Handler error", 500, req, routeError);
    }
  } catch (error) {
    // Catch errors during setup (auth, client creation, parsing etc.)
    console.error("[api-subscriptions] Unexpected setup error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage || "Internal server error", 500, req, error);
  }
}

// --- Exports for Testing ---
export type { ApiSubscriptionsDependencies };

// --- Server Entry Point ---
serve((req) => handleApiSubscriptionsRequest(req, defaultDependencies));