import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, createErrorResponse, createSuccessResponse } from "../_shared/cors-headers.ts";

// WARNING: This function uses the Stripe SECRET KEY and Supabase SERVICE ROLE KEY.
// It should ONLY be called securely (e.g., manually via Supabase dashboard/CLI, or secured webhook).
// DO NOT expose this function publicly without strong authentication/authorization.

console.log("Initializing sync-stripe-plans function");

serve(async (req) => {
  // Handle CORS preflight request if needed (though likely called server-side)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let isTestMode: boolean;
  let requestBody: { isTestMode?: boolean } = {};

  try {
    // Attempt to parse request body to get mode, if provided
    if (req.body) {
      try {
        requestBody = await req.json();
      } catch (e) {
        console.warn("Could not parse request body for mode setting:", e.message);
      }
    }

    // 1. Determine Mode: Prioritize request body, fallback to env var
    if (typeof requestBody.isTestMode === 'boolean') {
      isTestMode = requestBody.isTestMode;
      console.log("Mode determined from request body.");
    } else {
      isTestMode = Deno.env.get("STRIPE_TEST_MODE") === "true"; 
      console.log("Mode determined from STRIPE_TEST_MODE env var.");
    }

    // Get Stripe Keys
    const stripeLiveKey = Deno.env.get("STRIPE_SECRET_LIVE_KEY");
    const stripeTestKey = Deno.env.get("STRIPE_SECRET_TEST_KEY");

    let effectiveStripeKey: string | undefined;
    if (isTestMode) {
      effectiveStripeKey = stripeTestKey;
      if (!effectiveStripeKey) {
        console.error("STRIPE_TEST_MODE is true, but STRIPE_SECRET_TEST_KEY is not configured.");
        return createErrorResponse("Stripe test secret key is not configured for test mode.", 500);
      }
    } else {
      effectiveStripeKey = stripeLiveKey;
      if (!effectiveStripeKey) {
        console.error("STRIPE_TEST_MODE is false/unset, but STRIPE_SECRET_LIVE_KEY is not configured.");
        return createErrorResponse("Stripe live secret key is not configured for live mode.", 500);
      }
    }
    
    // Initialize Stripe
    const stripe = new Stripe(effectiveStripeKey, {
      apiVersion: "2024-04-10", // Use a fixed API version
      httpClient: Stripe.createFetchHttpClient(),
    });

    console.log(`Stripe client initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode for sync.`);

    // 2. Initialize Supabase Admin Client (using service role key)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Supabase URL or Service Role Key is not configured.");
      return createErrorResponse("Supabase connection details missing.", 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log("Supabase admin client initialized.");

    // 3. Fetch Active Products and Prices from Stripe
    console.log("Fetching active products and prices from Stripe...");
    const prices = await stripe.prices.list({
      active: true,
      expand: ["data.product"], // Expand product details
      limit: 100, // Adjust limit as needed
    });
    console.log(`Fetched ${prices.data.length} active prices.`);

    // 4. Format data for Supabase upsert
    const plansToUpsert = prices.data
      .filter(price => price.recurring?.interval) // Only include recurring prices
      .map((price) => {
        const product = price.product as Stripe.Product;
        
        // Extract description details from Price metadata - IGNORE FEATURES FOR NOW
        let subtitle = product.name; // Default subtitle to product name
        const features: string[] = []; // Always use empty array for now

        try {
          if (price.metadata) {
            // Only try to get subtitle
            if (typeof price.metadata.subtitle === 'string' && price.metadata.subtitle) {
              subtitle = price.metadata.subtitle;
            }
            // REMOVED: Attempt to parse price.metadata.features
          }
        } catch (metaError) {
           console.error('[sync-stripe-plans] Error accessing price metadata:', { priceId: price.id, metaError });
           // Keep default subtitle and empty features
        }

        const descriptionJson = { subtitle, features }; // Features will always be []

        return {
          // Map Stripe fields to your 'subscription_plans' table columns
          stripe_price_id: price.id, // Primary key for upsert
          stripe_product_id: product.id, // ADDED: Populate product ID
          name: product.name,
          description: descriptionJson,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
          interval_count: price.recurring?.interval_count,
          metadata: price.metadata, // Keep full price metadata too, if desired
          active: true // Set newly synced plans from active Stripe prices to active
        };
      });

    console.log(`Formatted ${plansToUpsert.length} recurring plans for upsert.`);

    if (plansToUpsert.length === 0) {
      console.log("No recurring plans found to upsert.");
      return createSuccessResponse({ message: "No recurring plans found.", syncedCount: 0 });
    }

    // 5. Upsert data into Supabase
    console.log("Upserting plans into Supabase...");
    const { data: upsertData, error: upsertError } = await supabaseAdmin
      .from('subscription_plans')
      .upsert(plansToUpsert, { onConflict: 'stripe_price_id' });

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError);
      throw new Error(`Supabase upsert failed: ${upsertError.message}`);
    }
    console.log(`Upsert successful. ${upsertData?.length || 0} rows affected.`);

    // --- BEGIN DEACTIVATION LOGIC ---
    // 6. Get all stripe_price_ids currently in the database
    console.log("[sync-stripe-plans] Fetching existing plan IDs from database...");
    const { data: existingPlans, error: fetchError } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, stripe_price_id, name, active'); // Select name for logging

    if (fetchError) {
      console.error("Error fetching existing plan IDs:", fetchError);
      // Decide if this is critical - maybe just log and continue?
      // throw new Error(`Failed to fetch existing plans: ${fetchError.message}`);
      console.warn("Could not fetch existing plans to check for deactivation.");
    } else {
      console.log(`[sync-stripe-plans] Found ${existingPlans?.length || 0} plans in DB.`);
      // 7. Determine which plans to deactivate
      const activePriceIdsFromStripe = new Set(plansToUpsert.map(p => p.stripe_price_id));
      console.log("[sync-stripe-plans] Active Price IDs fetched from Stripe:", Array.from(activePriceIdsFromStripe));
      
      const plansToDeactivate = existingPlans
        .filter(p => p.stripe_price_id !== 'price_FREE') // Exclude if identified by specific ID
        .filter(p => {
           const shouldDeactivate = p.active === true && !activePriceIdsFromStripe.has(p.stripe_price_id);
           if (shouldDeactivate) {
             console.log(`[sync-stripe-plans] Plan identified for deactivation: ID=${p.id}, Name=${p.name}, StripePriceID=${p.stripe_price_id}`);
           }
           return shouldDeactivate;
        })
        .map(p => p.stripe_price_id);

      if (plansToDeactivate.length > 0) {
        console.log(`[sync-stripe-plans] Attempting to deactivate ${plansToDeactivate.length} plans with Stripe Price IDs:`, plansToDeactivate);
        // 8. Update plans in Supabase to set active = false
        const { error: updateError } = await supabaseAdmin
          .from('subscription_plans')
          .update({ active: false })
          .in('stripe_price_id', plansToDeactivate);

        if (updateError) {
          console.error("[sync-stripe-plans] Error deactivating plans:", updateError);
        } else {
          console.log("[sync-stripe-plans] Successfully ran deactivation update query.");
        }
      } else {
        console.log("[sync-stripe-plans] No plans found in DB needing deactivation.");
      }
    }
    // --- END DEACTIVATION LOGIC ---

    return createSuccessResponse({ message: "Stripe plans synced successfully.", syncedCount: plansToUpsert.length });

  } catch (error) {
    console.error("Error in sync-stripe-plans function:", error);
    return createErrorResponse(error.message || "Internal server error", 500);
  }
});