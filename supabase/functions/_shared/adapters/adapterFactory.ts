import { IPaymentGatewayAdapter } from '../types/payment.types.ts';
import { ITokenWalletService } from '../types/tokenWallet.types.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../../types_db.ts';
import Stripe from 'npm:stripe'; // Import the Stripe SDK
import { StripePaymentAdapter } from './stripe/stripePaymentAdapter.ts'; // Import the real StripePaymentAdapter

// The DummyStripeAdapter class is no longer needed here and will be removed.

export function getPaymentAdapter(
  source: string,
  adminClient: SupabaseClient<Database>,
  tokenWalletService: ITokenWalletService,
): IPaymentGatewayAdapter | null {
  if (source === 'stripe') {
    // Align with getStripeMode() in stripe-client.ts
    const isTestMode = Deno.env.get('VITE_STRIPE_TEST_MODE') === 'true';
    // console.log(`[adapterFactory] stripeTestModeEnv: ${stripeTestModeEnv}, isTestMode: ${isTestMode}`);

    let stripeSecretKey: string | undefined;
    let stripeWebhookSecret: string | undefined;

    if (isTestMode) {
      stripeSecretKey = Deno.env.get('STRIPE_SECRET_TEST_KEY');
      if (!stripeSecretKey) {
        console.error('[adapterFactory] Test mode: STRIPE_SECRET_TEST_KEY is not set. Cannot create Stripe adapter.');
        return null;
      }
      // Only get webhook secret if secret key was found
      stripeWebhookSecret = Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET');
      if (!stripeWebhookSecret) {
        console.error('[adapterFactory] Test mode: STRIPE_TEST_WEBHOOK_SECRET is not set. Cannot create Stripe adapter.');
        return null;
      }
    } else {
      // Default to LIVE keys if VITE_STRIPE_TEST_MODE is not 'true' (i.e., 'false', undefined, or any other value)
      stripeSecretKey = Deno.env.get('STRIPE_SECRET_LIVE_KEY');
      if (!stripeSecretKey) {
        console.error('[adapterFactory] Live mode: STRIPE_SECRET_LIVE_KEY is not set. Cannot create Stripe adapter.');
        return null;
      }
      // Only get webhook secret if secret key was found
      stripeWebhookSecret = Deno.env.get('STRIPE_LIVE_WEBHOOK_SECRET');
      if (!stripeWebhookSecret) {
        console.error('[adapterFactory] Live mode: STRIPE_LIVE_WEBHOOK_SECRET is not set. Cannot create Stripe adapter.');
        return null;
      }
    }

    // The following existing logic for initializing Stripe and returning the adapter remains largely the same,
    // but it will now use the conditionally determined stripeSecretKey and stripeWebhookSecret.
    // We ensure stripeSecretKey and stripeWebhookSecret are checked again, though the paths above should return null if they are missing.
    // This is more of a defensive check. The primary checks and error messages are now mode-specific.

    if (!stripeSecretKey) {
      // This case should theoretically be caught by the mode-specific checks above,
      // but kept as a final safeguard or if logic changes.
      console.error('[adapterFactory] Stripe secret key is ultimately undefined. Cannot create Stripe adapter.');
      return null;
    }
    if (!stripeWebhookSecret) {
      // Similar safeguard for webhook secret.
      console.error('[adapterFactory] Stripe webhook secret is ultimately undefined. Cannot create Stripe adapter.');
      return null;
    }

    // Log the retrieved webhook secret (partially)
    const partialWebhookSecret = stripeWebhookSecret.length > 15 
      ? `${stripeWebhookSecret.substring(0, 10)}...${stripeWebhookSecret.substring(stripeWebhookSecret.length - 5)}`
      : stripeWebhookSecret;
    console.log(`[adapterFactory] Using Stripe Webhook Secret (partial): ${partialWebhookSecret}`);

    try {
      const stripeInstance = new Stripe(stripeSecretKey, {
        apiVersion: '2025-03-31.basil', // Specify a fixed API version
        // httpClient: Stripe.createFetchHttpClient(), // Optional: Explicitly use Deno's fetch if needed
      });
      return new StripePaymentAdapter(stripeInstance, adminClient, tokenWalletService, stripeWebhookSecret);
    } catch (error) {
      console.error('[adapterFactory] Error initializing Stripe SDK:', error);
      return null;
    }
  }
  
  console.warn(`[adapterFactory] No adapter found for source: ${source}`);
  return null;
}

// Placeholder for other potential exports or types if needed 