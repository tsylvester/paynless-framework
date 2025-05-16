import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import { createMockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient } from '../../../supabase.mock.ts';
import { MockSupabaseDataConfig } from '../../../types.ts';
import { MockStripe } from '../../../types/payment.types.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';

Deno.test('StripePaymentAdapter: handleWebhook', async (t) => {
  let mockStripe: MockStripe;
  let mockSupabaseSetup: ReturnType<typeof createMockSupabaseClient>;
  let mockTokenWalletService: MockTokenWalletService;
  let adapter: StripePaymentAdapter;

  const MOCK_SITE_URL = 'http://localhost:3000';
  const MOCK_WEBHOOK_SECRET = 'whsec_test_valid_secret';

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