import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Revert to explicit npm/jsr specifiers
import ActualStripe from "npm:stripe@14.11.0"; // Assuming version from previous files
import type Stripe from "npm:stripe@14.11.0";
import { createClient as actualCreateClient } from "jsr:@supabase/supabase-js@2"; // Assuming version from previous files
import type { SupabaseClient, SupabaseClientOptions, PostgrestResponse } from "@supabase/supabase-js"; // Added PostgrestResponse
import { 
    // corsHeaders, // Keep separate if only used for OPTIONS
    createErrorResponse as actualCreateErrorResponse, 
    createSuccessResponse as actualCreateSuccessResponse, 
    corsHeaders // Import directly for simple OPTIONS response
} from "../_shared/cors-headers.ts";

// Define dependency types
type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;
type CreateClientFn = (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;

// Define dependencies interface
export interface SyncPlansHandlerDeps {
    createErrorResponse: typeof actualCreateErrorResponse;
    createSuccessResponse: typeof actualCreateSuccessResponse;
    stripeConstructor: StripeConstructor;
    createSupabaseClient: CreateClientFn;
    // Deno.env.get will be stubbed in tests
}

// Default dependencies
const defaultDeps: SyncPlansHandlerDeps = {
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    stripeConstructor: ActualStripe,
    createSupabaseClient: actualCreateClient,
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Supabase URL or Service Role Key is not configured.");
      return deps.createErrorResponse("Supabase connection details missing.", 500);
    }

    const supabaseAdmin = deps.createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false } // Ensure no session persistence for admin client
    });
    console.log("Supabase admin client initialized.");

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

    // 5. Upsert data into Supabase
    console.log("Upserting plans into Supabase...");
    // Specify return type for clarity
    const upsertResult: PostgrestResponse<any> = await supabaseAdmin
      .from('subscription_plans')
      .upsert(plansToUpsert, { onConflict: 'stripe_price_id' }); 

    if (upsertResult.error) {
      console.error("Supabase upsert error:", upsertResult.error);
      // Use injected error response
      return deps.createErrorResponse(`Supabase upsert failed: ${upsertResult.error.message}`, 500); 
    }
    console.log(`Upsert successful. ${upsertResult.count ?? 0} rows affected.`); // Use count from result

    // --- BEGIN DEACTIVATION LOGIC ---
    let activePriceIdsFromStripe = new Set<string>();
    try {
        activePriceIdsFromStripe = new Set(plansToUpsert.map(p => p.stripe_price_id));
        console.log("[sync-stripe-plans] Active Price IDs from Stripe for deactivation check:", Array.from(activePriceIdsFromStripe));

        console.log("[sync-stripe-plans] Fetching existing plan IDs from database...");
        const { data: existingPlans, error: fetchError } = await supabaseAdmin
          .from('subscription_plans')
          .select('id, stripe_price_id, name, active'); 

        if (fetchError) {
          console.warn("Could not fetch existing plans to check for deactivation:", fetchError.message);
        } else if (existingPlans) { // Check if existingPlans is not null
          console.log(`[sync-stripe-plans] Found ${existingPlans.length} plans in DB.`);
          
          const plansToDeactivate = existingPlans
            .filter(p => p.stripe_price_id && p.stripe_price_id !== 'price_FREE') // Ensure ID exists
            .filter(p => p.active === true && !activePriceIdsFromStripe.has(p.stripe_price_id))
            // No map needed now, just filter

          if (plansToDeactivate.length > 0) {
            console.log(`[sync-stripe-plans] Attempting to deactivate ${plansToDeactivate.length} plans.`);
            // FIX: Loop and use update().eq()
            for (const plan of plansToDeactivate) {
                console.log(`[sync-stripe-plans] Deactivating plan: ID=${plan.id}, Name=${plan.name}, StripePriceID=${plan.stripe_price_id}`);
                const { error: updateError } = await supabaseAdmin
                    .from('subscription_plans')
                    .update({ active: false })
                    .eq('stripe_price_id', plan.stripe_price_id); // Use eq() filter

                if (updateError) {
                    console.error(`[sync-stripe-plans] Error deactivating plan ${plan.stripe_price_id}:`, updateError.message);
                    // Decide if we should continue or stop on error
                }
            }
          } else {
            console.log("[sync-stripe-plans] No plans found in DB needing deactivation.");
          }
        } else {
             console.log("[sync-stripe-plans] No existing plans found in DB.");
        }
    } catch (deactivationError) {
        console.error("[sync-stripe-plans] Error during deactivation logic:", deactivationError);
    }
    // --- END DEACTIVATION LOGIC ---

    // Use injected success response
    return deps.createSuccessResponse({ message: "Stripe plans synced successfully.", syncedCount: plansToUpsert.length });

  } catch (error) {
    console.error("Error in sync-stripe-plans function:", error);
    // Use injected error response
    return deps.createErrorResponse(error.message || "Internal server error", 500);
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve(handleSyncPlansRequest);
}