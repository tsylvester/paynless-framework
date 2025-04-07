import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Revert to explicit npm/jsr specifiers
import ActualStripe from "npm:stripe@14.11.0"; // Assuming version from previous files
import type Stripe from "npm:stripe@14.11.0";
import { createClient as actualCreateClient } from "jsr:@supabase/supabase-js@2"; // Assuming version from previous files
import type { SupabaseClient, SupabaseClientOptions, PostgrestResponse } from "npm:@supabase/supabase-js@2"; // USE NPM SPECIFIER
import { 
    // corsHeaders, // Keep separate if only used for OPTIONS
    createErrorResponse as actualCreateErrorResponse, 
    createSuccessResponse as actualCreateSuccessResponse, 
    corsHeaders // Import directly for simple OPTIONS response
} from "../_shared/cors-headers.ts";
// Import the new service
import { ISyncPlansService, SyncPlansService } from "./services/sync_plans_service.ts";

// Define dependency types
type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;
// Keep client type for service creation
type CreateClientFn = (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>; 

// Define dependencies interface
export interface SyncPlansHandlerDeps {
    createErrorResponse: typeof actualCreateErrorResponse;
    createSuccessResponse: typeof actualCreateSuccessResponse;
    stripeConstructor: StripeConstructor;
    // Remove createSupabaseClient, add service instance
    // createSupabaseClient: CreateClientFn; 
    syncPlansService: ISyncPlansService; 
}

// Default dependencies
// Create the real client and service here
const createDefaultSupabaseClient = (): SupabaseClient<any> => { // Add return type
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase URL or Service Role Key for default client creation.");
    }
    return actualCreateClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
};
const defaultSupabaseClient = createDefaultSupabaseClient();
const defaultSyncPlansService = new SyncPlansService(defaultSupabaseClient);

const defaultDeps: SyncPlansHandlerDeps = {
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    stripeConstructor: ActualStripe,
    // Provide the instantiated service
    syncPlansService: defaultSyncPlansService,
};

// Export the handler function
export async function handleSyncPlansRequest(
    req: Request,
    deps: SyncPlansHandlerDeps = defaultDeps
): Promise<Response> {
  // Handle CORS preflight request if needed (using direct header import)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let isTestMode: boolean;
  let requestBody: { isTestMode?: boolean } = {};

  try {
    // Attempt to parse request body to get mode
    if (req.body && req.headers.get('content-type')?.includes('application/json')) { // Check content-type
      try {
        requestBody = await req.json();
      } catch (e) {
        console.warn("Could not parse request body for mode setting:", e.message);
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
      return deps.createErrorResponse(`Stripe ${keyType} secret key is not configured.`, 500);
    }
    
    // Initialize Stripe using injected constructor
    const stripe = new deps.stripeConstructor(stripeKey, {
      apiVersion: "2024-04-10", 
      httpClient: ActualStripe.createFetchHttpClient(), // Use static method from actual import
    });
    console.log(`Stripe client initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode.`);

    // 2. Initialize Supabase Admin Client
    // const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // if (!supabaseUrl || !supabaseServiceRoleKey) {
    //   console.error("Supabase URL or Service Role Key is not configured.");
    //   return deps.createErrorResponse("Supabase connection details missing.", 500);
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
    const plansToUpsert = prices.data
      .filter(price => price.product && typeof price.product === 'object' && price.recurring?.interval) // Ensure product is expanded and price is recurring
      .map((price) => {
        const product = price.product as Stripe.Product; // Type assertion after filter
        
        let subtitle = product.name;
        try {
          if (price.metadata?.subtitle && typeof price.metadata.subtitle === 'string') {
            subtitle = price.metadata.subtitle;
          }
        } catch (metaError) {
           console.error('[sync-stripe-plans] Error accessing price metadata:', { priceId: price.id, metaError });
        }

        const descriptionJson = { subtitle, features: [] }; // Always empty features

        return {
          stripe_price_id: price.id,
          stripe_product_id: product.id,
          name: product.name,
          description: descriptionJson,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
          interval_count: price.recurring?.interval_count,
          metadata: price.metadata,
          active: true 
        };
      });

    console.log(`Formatted ${plansToUpsert.length} recurring plans for upsert.`);

    if (plansToUpsert.length === 0) {
      console.log("No recurring plans found to upsert.");
      return deps.createSuccessResponse({ message: "No recurring plans found.", syncedCount: 0 });
    }

    // **** Upsert data via the Service ****
    console.log("Upserting plans via service...");
    const upsertResult = await deps.syncPlansService.upsertPlans(plansToUpsert);
    if (upsertResult.error) {
      return deps.createErrorResponse(`Supabase upsert failed via service: ${upsertResult.error.message}`, 500);
    }

    // --- BEGIN DEACTIVATION LOGIC ---
    try {
        const activePriceIdsFromStripe = new Set(plansToUpsert.map(p => p.stripe_price_id));
        console.log("[sync-stripe-plans] Fetching existing plans via service...");
        // **** Fetch existing plans via the Service ****
        const { data: existingPlans, error: fetchError } = await deps.syncPlansService.getExistingPlans();

        if (fetchError) {
          console.warn("Service could not fetch existing plans:", fetchError.message);
        } else if (existingPlans) {
          const plansToDeactivate = existingPlans
            .filter(p => p.stripe_price_id && p.stripe_price_id !== 'price_FREE') 
            .filter(p => p.active === true && !activePriceIdsFromStripe.has(p.stripe_price_id))

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
    }
    // --- END DEACTIVATION LOGIC ---

    return deps.createSuccessResponse({ message: "Stripe plans synced successfully via service.", syncedCount: plansToUpsert.length });

  } catch (error) {
    console.error("Error in sync-stripe-plans function:", error);
    return deps.createErrorResponse(error.message || "Internal server error", 500);
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve((req) => handleSyncPlansRequest(req, defaultDeps));
}