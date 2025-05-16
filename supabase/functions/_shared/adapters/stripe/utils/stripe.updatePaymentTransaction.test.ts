import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import { createMockStripe, MockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient } from '../../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';
import { MockSupabaseDataConfig } from '../../../types.ts';


Deno.test('StripePaymentAdapter: handleWebhook', async (t) => {
  let mockStripe: MockStripe;
  let mockSupabaseSetup: ReturnType<typeof createMockSupabaseClient>;
  let mockTokenWalletService: MockTokenWalletService;
  let adapter: StripePaymentAdapter;

  const MOCK_SITE_URL = 'http://localhost:3000';
  const MOCK_WEBHOOK_SECRET = 'whsec_test_valid_secret';
  const MOCK_USER_ID = 'usr_webhook_test_user';
  const MOCK_WALLET_ID = 'wlt_webhook_test_wallet';
  const MOCK_PAYMENT_TRANSACTION_ID = 'ptxn_webhook_test_123';
  const MOCK_STRIPE_CHECKOUT_SESSION_ID = 'cs_test_webhook_session_abc123';
  const MOCK_STRIPE_PAYMENT_INTENT_ID = 'pi_test_webhook_payment_intent_def456';
  const TOKENS_TO_AWARD = 500;

  const setupMocksAndAdapterForWebhook = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    Deno.env.set('SITE_URL', MOCK_SITE_URL);
    Deno.env.set('STRIPE_WEBHOOK_SECRET', MOCK_WEBHOOK_SECRET);
    mockStripe = createMockStripe();
    mockSupabaseSetup = createMockSupabaseClient(supabaseConfig);
    mockTokenWalletService = createMockTokenWalletService();

    adapter = new StripePaymentAdapter(
      mockStripe.instance,
      mockSupabaseSetup.client as unknown as SupabaseClient,
      mockTokenWalletService,
      MOCK_WEBHOOK_SECRET
    );
  };

  const teardownWebhookMocks = () => {
    Deno.env.delete('SITE_URL');
    Deno.env.delete('STRIPE_WEBHOOK_SECRET');
    mockStripe.clearStubs();
    mockTokenWalletService.clearStubs();
  };

  await t.step('Empty test', () => {
    teardownWebhookMocks();
  });

});