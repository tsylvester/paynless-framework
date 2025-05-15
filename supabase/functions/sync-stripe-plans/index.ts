// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Revert to explicit npm/jsr specifiers
import Stripe from "npm:stripe@14.11.0";
import { createClient } from "jsr:@supabase/supabase-js@2"; // Assuming version from previous files
// Use JSR import for SupabaseClient types as well
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"; 
import { 
    handleCorsPreflightRequest, // Import the handler
    createErrorResponse, 
    createSuccessResponse, 
} from "../_shared/cors-headers.ts";
// Import the new service
import { SyncPlansService, PlanUpsertData, ExistingPlanData } from "./services/sync_plans_service.ts"; // Assuming PlanUpsertData is exported now
import { Database } from "../types_db.ts"; // Import the Database type

// Define dependency types
// Export StripeConstructor
export type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;

// Define dependencies interface
export interface SyncPlansHandlerDeps {
    handleCorsPreflightRequest: typeof handleCorsPreflightRequest; // Add to deps
    createErrorResponse: typeof createErrorResponse;
    createSuccessResponse: typeof createSuccessResponse;
    stripeConstructor: StripeConstructor;
    syncPlansService: SyncPlansService; // Use concrete class if interface import is troublesome
}

// Default dependencies
// Create the real client and service here
const createDefaultSupabaseClient = (): SupabaseClient<Database> => { // Use Database type
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase URL or Service Role Key for default client creation.");
    }
    return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
};
const defaultSupabaseClient = createDefaultSupabaseClient();
const defaultSyncPlansService = new SyncPlansService(defaultSupabaseClient);

const defaultDeps: SyncPlansHandlerDeps = {
    handleCorsPreflightRequest, // Add default
    createErrorResponse,
    createSuccessResponse,
    stripeConstructor: Stripe,
    syncPlansService: defaultSyncPlansService,
};

// Export the handler function
export async function handleSyncPlansRequest(
    req: Request,
    deps: SyncPlansHandlerDeps = defaultDeps
): Promise<Response> {
  // Handle CORS preflight request using the injected handler
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) {
    return corsResponse;
  }

  // Only allow POST method after CORS check (or specific methods you want)
  if (req.method !== 'POST') {
      // Pass request object to error response for CORS
      return deps.createErrorResponse('Method Not Allowed', 405, req);
  }

  let isTestMode: boolean;
  let requestBody: { isTestMode?: boolean } = {};

  try {
    // Attempt to parse request body to get mode
    if (req.body && req.headers.get('content-type')?.includes('application/json')) { // Check content-type
      try {
        requestBody = await req.json();
      } catch (e) {
        // Explicitly cast caught error to Error
        const error = e as Error;
        console.warn("Could not parse request body for mode setting:", error.message);
        // Don't fail, just fallback to env var
      }
    }

    // 1. Determine Mode
    if (typeof requestBody.isTestMode === 'boolean') {
      isTestMode = requestBody.isTestMode;
      console.log("Mode determined from request body.");
    } else {
      // Default to true (test mode) if env var is not exactly "false"
      isTestMode = Deno.env.get("STRIPE_TEST_MODE") !== "false"; 
      console.log(`Mode determined from STRIPE_TEST_MODE env var (Value: ${Deno.env.get("STRIPE_TEST_MODE")}, IsTest: ${isTestMode}).`);
    }

    // Get Stripe Keys
    const stripeKey = isTestMode 
        ? Deno.env.get("STRIPE_SECRET_TEST_KEY") 
        : Deno.env.get("STRIPE_SECRET_LIVE_KEY");

    if (!stripeKey) {
      const keyType = isTestMode ? "test" : "live";
      console.error(`STRIPE_SECRET_${keyType.toUpperCase()}_KEY is not configured.`);
      return deps.createErrorResponse(`Stripe ${keyType} secret key is not configured.`, 500, req);
    }
    
    // Initialize Stripe using injected constructor
    const stripe = new deps.stripeConstructor(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2023-10-16",
    });
    console.log(`Stripe client initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode.`);

    // 2. Initialize Supabase Admin Client
    // const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // if (!supabaseUrl || !supabaseServiceRoleKey) {
    //   console.error("Supabase URL or Service Role Key is not configured.");
    //   return deps.createErrorResponse("Supabase connection details missing.", 500, req);
    // }

    // const supabaseAdmin = deps.createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    //     auth: { persistSession: false } // Ensure no session persistence for admin client
    // });
    // console.log("Supabase admin client initialized.");

    // **** Instantiate the Sync Plans Service ****
    // const syncService: ISyncPlansService = new SyncPlansService(supabaseAdmin);

    // 3. Fetch Active Products and Prices from Stripe
    console.log("Fetching active products and prices from Stripe...");
    const prices = await stripe.prices.list({
      active: true,
      expand: ["data.product"],
      limit: 100, 
    });
    console.log(`Fetched ${prices.data.length} active prices.`);

    // 4. Format data for Supabase upsert
    const plansToUpsert: PlanUpsertData[] = prices.data
      .filter((price: Stripe.Price) => price.product && typeof price.product === 'object') // Ensure product is expanded
      .map((price: Stripe.Price) => {
        const product = price.product as Stripe.Product;
        
        let subtitle = product.name;
        try {
          if (price.metadata?.subtitle && typeof price.metadata.subtitle === 'string') {
            subtitle = price.metadata.subtitle;
          } else if (product.metadata?.subtitle && typeof product.metadata.subtitle === 'string') {
            subtitle = product.metadata.subtitle;
          }
        } catch (metaError) {
           console.error('[sync-stripe-plans] Error accessing metadata subtitle:', { priceId: price.id, productId: product.id, metaError });
        }

        const features: string[] = [];
        try {
            const featuresString = price.metadata?.features || product.metadata?.features;
            if (featuresString && typeof featuresString === 'string') {
                features.push(...featuresString.split(',').map(f => f.trim()).filter(f => f));
            }
        } catch (metaError) {
            console.error('[sync-stripe-plans] Error accessing metadata features:', { priceId: price.id, productId: product.id, metaError });
        }
        
        const planType = price.type === 'one_time' ? 'one_time_purchase' : 'subscription';

        const tokensAwardedString = product.metadata?.tokens_awarded || price.metadata?.tokens_awarded;
        let tokensAwarded: number | undefined = undefined; // Initialize as undefined
        if (tokensAwardedString) {
            const parsedTokens = parseInt(tokensAwardedString, 10);
            if (!isNaN(parsedTokens)) {
                tokensAwarded = parsedTokens;
            } else {
                console.warn(`[sync-stripe-plans] Invalid non-numeric value for tokens_awarded metadata: "${tokensAwardedString}". Product ID: ${product.id}, Price ID: ${price.id}. Setting tokens_awarded to undefined.`);
            }
        }

        const itemIdInternal = product.metadata?.item_id_internal || price.metadata?.item_id_internal || undefined; // Default to undefined

        if ((product.metadata?.is_token_package === 'true' || price.metadata?.is_token_package === 'true') && (!tokensAwarded || tokensAwarded <= 0)) {
          console.warn(`[sync-stripe-plans] Product/Price marked as token package but has invalid/missing or non-positive tokens_awarded metadata. Product ID: ${product.id}, Price ID: ${price.id}. tokens_awarded evaluated to: ${tokensAwarded}`);
        }
        
        const planData: PlanUpsertData = {
          stripe_price_id: price.id,
          stripe_product_id: product.id,
          name: product.name,
          description: { subtitle, features }, 
          amount: typeof price.unit_amount === 'number' ? price.unit_amount : null, // Store raw cents from Stripe
          currency: price.currency,
          interval: price.recurring?.interval || undefined,
          interval_count: price.recurring?.interval_count || undefined,
          active: price.active,
          metadata: { ...product.metadata, ...price.metadata }, // Price metadata takes precedence
          item_id_internal: itemIdInternal,
          tokens_awarded: tokensAwarded,
          plan_type: planType,
        };
        return planData;
      });

    console.log(`[sync-stripe-plans] Formatted ${plansToUpsert.length} plans (including one-time purchases and subscriptions) for upsert.`);

    // Detailed log of the data to be upserted
    console.log('[sync-stripe-plans] Attempting to upsert the following plans:', JSON.stringify(plansToUpsert, null, 2));

    if (plansToUpsert.length === 0) {
      console.log("No recurring plans found to upsert.");
      return deps.createSuccessResponse({ message: "No recurring plans found.", syncedCount: 0 }, 200, req);
    }

    // **** Upsert data via the Service ****
    console.log("Upserting plans via service...");
    const upsertResult = await deps.syncPlansService.upsertPlans(plansToUpsert as Database['public']['Tables']['subscription_plans']['Insert'][]);
    if (upsertResult.error) {
      // Pass req to error response
      return deps.createErrorResponse(`Supabase upsert failed via service: ${upsertResult.error.message} - Details: ${upsertResult.error.details}`, 500, req, upsertResult.error);
    }

    // --- BEGIN DEACTIVATION LOGIC ---
    try {
        const activePriceIdsFromStripe = new Set(plansToUpsert.map((p: PlanUpsertData) => p.stripe_price_id));
        console.log("[sync-stripe-plans] Fetching existing plans via service...");
        // **** Fetch existing plans via the Service ****
        const { data: existingPlans, error: fetchError } = await deps.syncPlansService.getExistingPlans();

        if (fetchError) {
          console.warn("Service could not fetch existing plans:", fetchError.message);
          // Potentially return an error response here if critical, passing req
        } else if (existingPlans) {
          const plansToDeactivate = existingPlans
            .filter((p: ExistingPlanData) => p.stripe_price_id && p.stripe_price_id !== 'price_FREE') 
            .filter((p: ExistingPlanData) => p.active === true && !activePriceIdsFromStripe.has(p.stripe_price_id))

          if (plansToDeactivate.length > 0) {
            console.log(`[sync-stripe-plans] Attempting to deactivate ${plansToDeactivate.length} plans via service.`);
            for (const plan of plansToDeactivate) {
                console.log(`[sync-stripe-plans] Deactivating plan: ID=${plan.id}, StripePriceID=${plan.stripe_price_id}`);
                 // **** Deactivate plan via the Service ****
                 const { error: updateError } = await deps.syncPlansService.deactivatePlan(plan.stripe_price_id);
                if (updateError) {
                    console.error(`[sync-stripe-plans] Service reported error deactivating plan ${plan.stripe_price_id}:`, updateError.message);
                }
            }
          } else {
            console.log("[sync-stripe-plans] No plans found needing deactivation.");
          }
        } else {
             console.log("[sync-stripe-plans] No existing plans found in DB (via service).");
        }
    } catch (deactivationError) {
        console.error("[sync-stripe-plans] Error during service-based deactivation logic:", deactivationError);
        // Potentially return an error response here, passing req
    }
    // --- END DEACTIVATION LOGIC ---

    // Pass req to success response
    return deps.createSuccessResponse({ message: "Stripe plans synced successfully via service.", syncedCount: plansToUpsert.length }, 200, req);

  } catch (error) {
    console.error("Error in sync-stripe-plans function:", error);
    // Pass req and original error to error response
    return deps.createErrorResponse(
        error instanceof Error ? error.message : "Internal server error", 
        500, 
        req, 
        error
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve((req) => handleSyncPlansRequest(req, defaultDeps));
}