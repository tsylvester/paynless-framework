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

  try {
    // 1. Initialize Stripe (using secret key from environment variables)
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeTestSecretKey = Deno.env.get("STRIPE_TEST_SECRET_KEY"); // Optional: For test mode sync

    // Determine mode - you might pass a query param or rely on env
    // For simplicity, let's assume STRIPE_SECRET_KEY determines live/test for sync
    const isTestMode = stripeSecretKey?.startsWith('sk_test_') || !stripeSecretKey;
    const effectiveStripeKey = isTestMode ? stripeTestSecretKey : stripeSecretKey;

    if (!effectiveStripeKey) {
       console.error("Stripe secret key is not configured.");
       return createErrorResponse("Stripe secret key is not configured.", 500);
    }

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
    const plansToUpsert = prices.data.map((price) => {
      const product = price.product as Stripe.Product; // Type cast needed after expand
      return {
        // Map Stripe fields to your 'subscription_plans' table columns
        // Adjust column names as needed!
        stripe_price_id: price.id, // Primary key for upsert
        name: product.name,
        description: product.description,
        amount: price.unit_amount, // Amount in smallest currency unit (e.g., cents)
        currency: price.currency,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        metadata: product.metadata, // Or price.metadata if you store it there
        // Add any other columns from your table
      };
    }).filter(plan => plan.interval); // Only include recurring prices (subscriptions)

    console.log(`Formatted ${plansToUpsert.length} plans for upsert.`);

    if (plansToUpsert.length === 0) {
      console.log("No recurring plans found to upsert.");
      return createSuccessResponse({ message: "No recurring plans found.", syncedCount: 0 });
    }

    // 5. Upsert data into Supabase
    console.log("Upserting plans into Supabase...");
    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .upsert(plansToUpsert, { onConflict: 'stripe_price_id' }); // Specify conflict column

    if (error) {
      console.error("Supabase upsert error:", error);
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    console.log("Upsert successful:", data);

    return createSuccessResponse({ message: "Stripe plans synced successfully.", syncedCount: plansToUpsert.length });

  } catch (error) {
    console.error("Error in sync-stripe-plans function:", error);
    return createErrorResponse(error.message || "Internal server error", 500);
  }
});