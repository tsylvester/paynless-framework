import ActualStripe from "npm:stripe@14.11.0";
import type Stripe from "npm:stripe@14.11.0";

// --- LOCAL DEV WORKAROUND START ---
// Hardcode test keys here ONLY as a fallback for local dev where env vars might not inject correctly.
// The deployed function MUST rely on environment variables set in the Supabase Dashboard.
const LOCAL_FALLBACK_STRIPE_SECRET_TEST_KEY = "sk_test_51R7jhzIskUlhzlIxOWY9S9knK6Rl1FsyjwmtSguZPkTtI8M0tCUDYMHdiqEiGj40RYiF9imkjd8W4uGzlNx5I4v000zkHnudDm";
const LOCAL_FALLBACK_STRIPE_TEST_WEBHOOK_SECRET = "whsec_xY3Tj8ufDEyXMaacTFb9NWq6Bkm20ByQ";
// --- LOCAL DEV WORKAROUND END ---

// Define dependency type
type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;

/**
 * Initialize Stripe client based on test mode flag
 * @param isTestMode - Whether to use test keys (true) or live keys (false)
 * @param stripeConstructor - Injected Stripe constructor
 */
export const getStripeClient = (
    isTestMode: boolean, 
    stripeConstructor: StripeConstructor = ActualStripe // Default to actual constructor
): Stripe => {
  let secretKey: string | undefined;
  const keyEnvVarName = isTestMode ? "STRIPE_SECRET_TEST_KEY" : "STRIPE_SECRET_LIVE_KEY";
  
  secretKey = Deno.env.get(keyEnvVarName);

  // --- LOCAL DEV WORKAROUND START ---
  if (!secretKey && isTestMode) {
      console.warn(`[stripe-client] WARNING: Environment variable ${keyEnvVarName} not found. Using hardcoded local fallback test key. Ensure this is set in your deployed environment!`);
      secretKey = LOCAL_FALLBACK_STRIPE_SECRET_TEST_KEY;
  }
  // --- LOCAL DEV WORKAROUND END ---
  
  if (!secretKey) {
    // This error should now primarily occur if LIVE keys are missing in deployed env
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} secret key (${keyEnvVarName}) is not defined`);
  }
  
  // Use the injected constructor
  return new stripeConstructor(secretKey, {
    apiVersion: "2023-10-16", // Use the latest stable API version
    // Pass other Stripe options if needed, e.g., telemetry: false
  });
};

/**
 * Verify the Stripe webhook signature (Asynchronously)
 * Used for webhook validation
 */
export const verifyWebhookSignature = async (
  stripe: Stripe,
  body: string,
  signature: string,
  // Webhook secret is now determined based on mode inside the function
): Promise<Stripe.Event> => {
  const isTestMode = getStripeMode(); // Determine mode
  let endpointSecret = isTestMode 
      ? Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET") 
      : Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET");

  // --- LOCAL DEV WORKAROUND START ---
  if (!endpointSecret && isTestMode) {
      console.warn(`[stripe-client] WARNING: Environment variable STRIPE_TEST_WEBHOOK_SECRET not found. Using hardcoded local fallback test webhook secret. Ensure this is set in your deployed environment!`);
      endpointSecret = LOCAL_FALLBACK_STRIPE_TEST_WEBHOOK_SECRET;
  }
  // --- LOCAL DEV WORKAROUND END ---

  if (!endpointSecret) {
      throw new Error(`Stripe ${isTestMode ? "test" : "live"} webhook secret is not defined`);
  }

  try {
    // Use the async version for environments requiring it (like Deno/Edge)
    return await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
  } catch (err) {
    // Log the specific error for better debugging
    console.error("Error during constructEventAsync:", err);
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }
};

/**
 * Get the test mode from request data or environment
 * Utility function to determine test vs live mode
 */
export const getStripeMode = (
  requestData: Record<string, any> = {}
): boolean => {
  // First check if the request explicitly specifies mode
  if (requestData.isTestMode !== undefined) {
    return Boolean(requestData.isTestMode);
  }
  
  // Fall back to environment variable. Default to TRUE (test mode) if not 'false'.
  // Allow fallback check if STRIPE_TEST_MODE env var is missing in local dev
  const testModeEnv = Deno.env.get("STRIPE_TEST_MODE");
  return testModeEnv === undefined || testModeEnv !== "false"; 
};