import Stripe from "npm:stripe@14.11.0";

/**
 * Initialize Stripe client based on test mode flag
 * @param isTestMode - Whether to use test keys (true) or live keys (false)
 */
export const getStripeClient = (isTestMode: boolean): Stripe => {
  const secretKey = isTestMode 
    ? Deno.env.get("STRIPE_SECRET_KEY_TEST") 
    : Deno.env.get("STRIPE_SECRET_KEY_LIVE");
  
  if (!secretKey) {
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} secret key is not defined`);
  }
  
  return new Stripe(secretKey, {
    apiVersion: "2023-10-16", // Use the latest stable API version
  });
};

/**
 * Verify the Stripe webhook signature
 * Used for webhook validation
 */
export const verifyWebhookSignature = (
  stripe: Stripe,
  body: string,
  signature: string,
  endpointSecret: string
): Stripe.Event => {
  try {
    return stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
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
  
  // Fall back to environment variable
  return Deno.env.get("STRIPE_TEST_MODE") === "true";
};