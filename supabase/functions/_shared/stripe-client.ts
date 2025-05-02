// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import ActualStripe from "npm:stripe@18.0.0";
import type Stripe from "npm:stripe@18.0.0";

// --- START: Local .env.local loading workaround ---
// Supabase CLI `start` does not reliably inject .env vars into the function runtime (v2.20.5).
// This manually loads `../../.env.local` ONLY when ENV=local is set in the runtime environment.
// This ensures local integration tests work without affecting deployed functions.
// REMOVE this workaround if Supabase CLI improves env var handling for `start`.
if (Deno.env.get("ENV") === "local") {
  console.log("[stripe-client] Detected ENV=local, attempting to load ../../.env.local");
  try {
    const envPath = "../../.env.local"; // Relative path from _shared/ back to supabase/
    const fileContent = await Deno.readTextFile(envPath);
    const lines = fileContent.split('\n');
    let loadedCount = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#') || trimmedLine.length === 0) continue;
      const equalsIndex = trimmedLine.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmedLine.substring(0, equalsIndex).trim();
      let value = trimmedLine.substring(equalsIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
        
      // Set ONLY if not already present in the environment
      if (key && value && !Deno.env.get(key)) {
         Deno.env.set(key, value);
         loadedCount++;
         // console.log(`  Loaded ${key} from .env.local`); // Keep commented unless debugging
      }
    }
    console.log(`[stripe-client] Successfully loaded ${loadedCount} vars from .env.local`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.warn(`[stripe-client] WARN: ENV=local but .env.local not found at ../../.env.local.`);
    } else {
      console.error(`[stripe-client] Error loading .env.local:`, error);
    }
  }
} else {
    console.log("[stripe-client] ENV is not 'local', skipping manual .env.local loading.");
}
// --- END: Local .env.local loading workaround ---

// IMPORTANT: Supabase CLI does NOT automatically load .env files into the function runtime.
// When testing functions locally using `supabase start`, you MUST pass the environment file:
// `supabase start --env-file supabase/.env.local`
// Ensure SUPABASE_ANON_KEY, SUPABASE_URL, STRIPE_SECRET_TEST_KEY, STRIPE_TEST_WEBHOOK_SECRET, etc.
// are defined in `supabase/.env.local` for local development and testing.

// Define dependency type
export type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;

/**
 * Get the test mode from environment
 * NOTE: This relies on Deno.env, requiring --env-file for local testing.
 */
export const getStripeMode = (): boolean => {
  // Rely ONLY on environment variables, default to TRUE (test mode) if var is missing or not 'false'.
  const testModeEnv = Deno.env.get("STRIPE_TEST_MODE");
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
  const keyEnvVarName = isTestMode ? "STRIPE_SECRET_TEST_KEY" : "STRIPE_SECRET_LIVE_KEY";
  // Rely ONLY on environment variables
  const secretKey = Deno.env.get(keyEnvVarName);
  console.log(`[stripe-client] Attempting to get env var: ${keyEnvVarName}. Found: ${secretKey ? '*********' : 'MISSING!'}`);

  // Throw error if the required key is missing from the environment
  if (!secretKey) {
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} secret key environment variable (${keyEnvVarName}) is not defined. Check .env.local or deployment secrets.`);
  }
  
  // Only configure the API version explicitly, let Stripe handle the rest.
  const config: Stripe.StripeConfig = {
    apiVersion: "2025-03-31.basil", // Use the version expected by v18.0.0
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
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} webhook secret environment variable (${secretEnvVarName}) is not defined. Check .env.local or deployment secrets.`);
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