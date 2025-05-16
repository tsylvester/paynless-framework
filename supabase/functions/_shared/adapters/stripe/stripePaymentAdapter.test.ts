import { StripePaymentAdapter } from './stripePaymentAdapter.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe } from '../../stripe.mock.ts';
import { createMockSupabaseClient } from '../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../services/tokenWalletService.mock.ts';
import { MockSupabaseDataConfig } from '../../types.ts';

// Helper to create a mock Stripe.CustomerSubscriptionUpdatedEvent (copied from stripe.subscriptionUpdated.test.ts)
const createMockSubscriptionUpdatedEvent = (
  subscriptionData: Partial<Stripe.Subscription>,
  previousAttributes?: Partial<Stripe.Subscription>,
  id = `evt_sub_updated_${Date.now()}`
): Stripe.CustomerSubscriptionUpdatedEvent => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    object: "event",
    api_version: "2020-08-27",
    created: now,
    data: {
      object: {
        id: `sub_test_${Date.now()}`,
        object: "subscription",
        status: "active",
        customer: `cus_test_${Date.now()}`,
        current_period_start: now - (30 * 24 * 60 * 60), // 30 days ago
        current_period_end: now + (30 * 24 * 60 * 60),   // 30 days from now
        cancel_at_period_end: false,
        items: {
          object: 'list',
          data: [{
            id: `si_test_${Date.now()}`,
            object: 'subscription_item',
            price: { id: `price_test_${Date.now()}`, object: 'price', active: true, currency: 'usd', product: `prod_test_${Date.now()}` } as Stripe.Price,
            quantity: 1,
          } as Stripe.SubscriptionItem],
          has_more: false,
          url: `/v1/subscription_items?subscription=sub_test_${Date.now()}`,
        },
        ...subscriptionData,
      } as Stripe.Subscription,
      previous_attributes: previousAttributes,
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: `req_test_${Date.now()}`, idempotency_key: null },
    type: "customer.subscription.updated",
  } as Stripe.CustomerSubscriptionUpdatedEvent;
};

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

  await t.step('handleWebhook - customer.subscription.updated - successful update', async () => {
    const stripeSubscriptionId = "sub_adapter_updated_success";
    const stripeCustomerId = "cus_adapter_updated_success";
    const stripePriceId = "price_adapter_for_plan_link";
    const internalPlanId = "plan_adapter_linked_123";
    const newStatus = "past_due";
    const eventId = "evt_adapter_sub_updated_1";

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: any) => {
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === stripePriceId)) {
              return { data: [{ id: internalPlanId, stripe_price_id: stripePriceId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Plan not found for sub update test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
        'user_subscriptions': {
          update: async (state: any) => {
            const updateData = state.updateData as any;
            if (state.filters.some((f: any) => f.column === 'stripe_subscription_id' && f.value === stripeSubscriptionId) && updateData.status === newStatus) {
              return { data: [{ id: 'user_sub_mock_id', ...updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: user_subscriptions update failed condition check'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    const mockStripeEvent = createMockSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: stripePriceId } }] } as any,
      },
      { status: "active" }, // Previous attributes
      eventId
    );

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", () => mockStripeEvent);

    const rawBodyString = JSON.stringify(mockStripeEvent);
    const dummySignature = 'whsec_test_sub_updated_signature';

    const result = await adapter.handleWebhook(rawBodyString, dummySignature);

    assert(result.success, `Webhook handling for subscription.updated should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);

    // Check DB calls
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['stripe_price_id', stripePriceId]);

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    assertSpyCalls(userSubsBuilder.methodSpies.eq, 1);
    assertEquals(userSubsBuilder.methodSpies.eq.calls[0].args, ['stripe_subscription_id', stripeSubscriptionId]);
    
    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0] as any;
    assertEquals(updateCallArgs.status, newStatus);
    assertEquals(updateCallArgs.plan_id, internalPlanId);

    teardownWebhookMocks();
  });

});