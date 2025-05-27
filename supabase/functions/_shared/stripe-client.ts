// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import ActualStripe from "npm:stripe@^18";
import type Stripe from "npm:stripe@^18";

// IMPORTANT: Supabase CLI does NOT automatically load .env files into the function runtime.
// When testing functions locally using `supabase start`, you MUST pass the environment file:
// `supabase start --env-file supabase/.env` 
// Ensure SUPABASE_ANON_KEY, SUPABASE_URL, STRIPE_SECRET_TEST_KEY, STRIPE_TEST_WEBHOOK_SECRET, etc.
// are defined in `supabase/.env` for local development and testing.

// Define dependency type
export type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;

/**
 * Get the test mode from environment
 * NOTE: This relies on Deno.env, requiring --env-file for local testing.
 */
export const getStripeMode = (): boolean => {
  // Rely ONLY on environment variables, default to TRUE (test mode) if var is missing or not 'false'.
  const testModeEnv = Deno.env.get("STRIPE_TEST_MODE");
  console.log(`[stripe-client] getStripeMode check: STRIPE_TEST_MODE = ${testModeEnv}`); // Log the value it found
  return testModeEnv !== "false"; 
};

/**
 * Initialize Stripe client based on test mode flag from environment
 * NOTE: This relies on Deno.env, requiring --env-file for local testing.
 */
export const getStripeClient = (
    isTestMode: boolean, // Re-added parameter
    stripeConstructor: StripeConstructor = ActualStripe
): Stripe => {
  // ---> Log ALL available Env Vars seen by Deno <--- 
  console.log("[stripe-client] Deno Environment Variables:", JSON.stringify(Deno.env.toObject()));
  // ---> End Log <--- 

  const keyEnvVarName = isTestMode ? "STRIPE_SECRET_TEST_KEY" : "STRIPE_SECRET_LIVE_KEY";
  // Rely ONLY on environment variables
  const secretKey = Deno.env.get(keyEnvVarName);
  console.log(`[stripe-client] Attempting to get env var: ${keyEnvVarName}. Found: ${secretKey ? '*********' : 'MISSING!'}`);

  // Throw error if the required key is missing from the environment
  if (!secretKey) {
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} secret key environment variable (${keyEnvVarName}) is not defined. Check .env or deployment secrets.`); // Updated error message slightly
  }
  
  // Only configure the API version explicitly, let Stripe handle the rest.
  const config: Stripe.StripeConfig = {
    apiVersion: "2023-10-16", // Use the version expected by v18.0.0
  };

  return new stripeConstructor(secretKey, config);
};

/**
 * Verify the Stripe webhook signature (Asynchronously)
 * NOTE: This relies on Deno.env, requiring --env-file for local testing.
 */
export const verifyWebhookSignature = async (
  stripe: Stripe,
  body: string,
  signature: string
  // Secret lookup happens internally using Deno.env.get
): Promise<Stripe.Event> => {
  const isTestMode = getStripeMode(); // Use helper
  const secretEnvVarName = isTestMode ? "STRIPE_TEST_WEBHOOK_SECRET" : "STRIPE_LIVE_WEBHOOK_SECRET";
  // Rely ONLY on environment variables
  const endpointSecret = Deno.env.get(secretEnvVarName);

  // Throw error if the required secret is missing from the environment
  if (!endpointSecret) {
    // Reverted error message
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} webhook secret environment variable (${secretEnvVarName}) is not defined. Check .env or deployment secrets.`); // Updated error message slightly
  }

  try {
    return await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
  } catch (err) {
    console.error("Error during constructEventAsync:", err);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Webhook signature verification failed: ${message}`);
  }
};

// getStripeMode function restored above