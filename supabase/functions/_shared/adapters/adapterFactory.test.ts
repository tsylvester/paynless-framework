import {
  describe,
  it,
  beforeEach,
  afterEach,
} from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStrictEquals,
  assertThrows,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy, stub, type Spy, type Stub } from 'jsr:@std/testing@0.225.1/mock';

import { getPaymentAdapter } from './adapterFactory.ts';
import type { ITokenWalletService } from '../types/tokenWallet.types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../../types_db.ts';

// Note: Since DummyStripeAdapter is an internal class in adapterFactory.ts,
// we can't directly import and mock its constructor easily from here without refactoring adapterFactory.ts.
// Tests will verify the properties of the returned instance.

describe('adapterFactory.getPaymentAdapter', () => {
  let mockAdminClient: SupabaseClient<Database>;
  let mockTokenWalletService: ITokenWalletService;
  let denoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined>;

  const mockTestStripeKey = 'sk_test_mock_stripe_key';
  const mockTestStripeWebhookSecret = 'whsec_test_mock_stripe_webhook_secret';
  const mockLiveStripeKey = 'sk_live_mock_stripe_key';
  const mockLiveStripeWebhookSecret = 'whsec_live_mock_stripe_webhook_secret';

  beforeEach(() => {
    mockAdminClient = {} as SupabaseClient<Database>;
    mockTokenWalletService = {} as ITokenWalletService;
    // Default stub, individual tests will often re-stub or add behavior
    denoEnvGetStub = stub(Deno.env, 'get', (key: string) => undefined);
  });

  afterEach(() => {
    if (denoEnvGetStub && !denoEnvGetStub.restored) {
      denoEnvGetStub.restore();
    }
  });

  it('should return null for an unknown source and not call Deno.env.get', () => {
    const adapter = getPaymentAdapter('unknown-source', mockAdminClient, mockTokenWalletService);
    assertEquals(adapter, null);
    assertEquals(denoEnvGetStub.calls.length, 0);
  });

  describe('when source is "stripe"', () => {
    it('should use TEST keys when VITE_STRIPE_TEST_MODE is "true"', () => {
      denoEnvGetStub.restore(); // Clear beforeEach stub
      denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
        if (key === 'VITE_STRIPE_TEST_MODE') return 'true';
        if (key === 'STRIPE_SECRET_TEST_KEY') return mockTestStripeKey;
        if (key === 'STRIPE_TEST_WEBHOOK_SECRET') return mockTestStripeWebhookSecret;
        return undefined;
      });

      const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
      assertExists(adapter);
      assertEquals(adapter?.gatewayId, 'stripe');
      assertEquals(denoEnvGetStub.calls.length, 5, 'Should check mode, keys, and URLs');
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_TEST_KEY'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_TEST_WEBHOOK_SECRET'));
    });

    it('should use LIVE keys when VITE_STRIPE_TEST_MODE is "false"', () => {
      denoEnvGetStub.restore();
      denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
        if (key === 'VITE_STRIPE_TEST_MODE') return 'false';
        if (key === 'STRIPE_SECRET_LIVE_KEY') return mockLiveStripeKey;
        if (key === 'STRIPE_LIVE_WEBHOOK_SECRET') return mockLiveStripeWebhookSecret;
        return undefined;
      });

      const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
      assertExists(adapter);
      assertEquals(adapter?.gatewayId, 'stripe');
      assertEquals(denoEnvGetStub.calls.length, 5);
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_LIVE_KEY'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_LIVE_WEBHOOK_SECRET'));
    });

    it('should use LIVE keys when VITE_STRIPE_TEST_MODE is not set (undefined)', () => {
        denoEnvGetStub.restore();
        denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
          // VITE_STRIPE_TEST_MODE will return undefined from the default stub behavior set up here
          if (key === 'STRIPE_SECRET_LIVE_KEY') return mockLiveStripeKey;
          if (key === 'STRIPE_LIVE_WEBHOOK_SECRET') return mockLiveStripeWebhookSecret;
          return undefined;
        });
  
        const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
        assertExists(adapter);
        assertEquals(adapter?.gatewayId, 'stripe');
        assertEquals(denoEnvGetStub.calls.length, 5); // Mode, Live Key, Live Webhook, and 2 for URLs in constructor
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_LIVE_KEY'));
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_LIVE_WEBHOOK_SECRET'));
      });

    it('should return null if VITE_STRIPE_TEST_MODE is "true" and STRIPE_SECRET_TEST_KEY is missing', () => {
      denoEnvGetStub.restore();
      denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
        if (key === 'VITE_STRIPE_TEST_MODE') return 'true';
        // STRIPE_SECRET_TEST_KEY is missing
        if (key === 'STRIPE_TEST_WEBHOOK_SECRET') return mockTestStripeWebhookSecret;
        return undefined;
      });
      const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
      assertEquals(adapter, null);
      // It should check mode, then test secret key, then fail
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_TEST_KEY'));
      assertEquals(denoEnvGetStub.calls.length, 2);
    });

    it('should return null if VITE_STRIPE_TEST_MODE is "true" and STRIPE_TEST_WEBHOOK_SECRET is missing', () => {
      denoEnvGetStub.restore();
      denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
        if (key === 'VITE_STRIPE_TEST_MODE') return 'true';
        if (key === 'STRIPE_SECRET_TEST_KEY') return mockTestStripeKey;
        // STRIPE_TEST_WEBHOOK_SECRET is missing
        return undefined;
      });
      const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
      assertEquals(adapter, null);
      // Mode, Test Key, Test Webhook
      assertEquals(denoEnvGetStub.calls.length, 3);
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_TEST_KEY'));
      assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_TEST_WEBHOOK_SECRET'));
    });

    // Similar tests for LIVE keys missing when VITE_STRIPE_TEST_MODE is "false" or undefined
    it('should return null if VITE_STRIPE_TEST_MODE is "false" and STRIPE_SECRET_LIVE_KEY is missing', () => {
        denoEnvGetStub.restore();
        denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
          if (key === 'VITE_STRIPE_TEST_MODE') return 'false';
          if (key === 'STRIPE_LIVE_WEBHOOK_SECRET') return mockLiveStripeWebhookSecret;
          return undefined;
        });
        const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
        assertEquals(adapter, null);
        assertEquals(denoEnvGetStub.calls.length, 2);
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_LIVE_KEY'));
      });

    it('should return null if VITE_STRIPE_TEST_MODE is "false" and STRIPE_LIVE_WEBHOOK_SECRET is missing', () => {
        denoEnvGetStub.restore();
        denoEnvGetStub = stub(Deno.env, 'get', (key: string) => {
          if (key === 'VITE_STRIPE_TEST_MODE') return 'false';
          if (key === 'STRIPE_SECRET_LIVE_KEY') return mockLiveStripeKey;
          return undefined;
        });
        const adapter = getPaymentAdapter('stripe', mockAdminClient, mockTokenWalletService);
        assertEquals(adapter, null);
        assertEquals(denoEnvGetStub.calls.length, 3);
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'VITE_STRIPE_TEST_MODE'));
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_SECRET_LIVE_KEY'));
        assert(denoEnvGetStub.calls.some(call => call.args[0] === 'STRIPE_LIVE_WEBHOOK_SECRET'));
      });

  });
}); 