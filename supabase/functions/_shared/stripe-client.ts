import Stripe from "npm:stripe@14.11.0";

/**
 * Initialize Stripe client based on test mode flag
 * @param isTestMode - Whether to use test keys (true) or live keys (false)
 */
export const getStripeClient = (isTestMode: boolean): Stripe => {
  const secretKey = isTestMode 
    ? Deno.env.get("STRIPE_SECRET_TEST_KEY")
    : Deno.env.get("STRIPE_SECRET_LIVE_KEY");
  
  if (!secretKey) {
    throw new Error(`Stripe ${isTestMode ? "test" : "live"} secret key is not defined`);
  }
  
  return new Stripe(secretKey, {
    apiVersion: "2023-10-16", // Use the latest stable API version
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
  endpointSecret: string
): Promise<Stripe.Event> => {
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
  return Deno.env.get("STRIPE_TEST_MODE") !== "false";
};