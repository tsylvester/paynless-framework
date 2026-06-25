import { StripePaymentAdapter } from './stripePaymentAdapter.ts';
import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  stub,
} from 'jsr:@std/testing@0.225.1/mock';
import {
  createMockCustomerSubscriptionUpdatedEvent,
  createMockPrice,
  createMockSubscriptionItem,
  type MockStripe,
} from '../../stripe.mock.ts';
import type { MockAdminTokenWalletService } from '../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import type {
  MockQueryBuilderState,
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
} from '../../supabase.mock.ts';
import {
  MOCK_WEBHOOK_SECRET,
  setupMocksAndAdapter,
  teardownMocks,
} from './stripePaymentAdapter.mock.ts';
import type { Database } from '../../../types_db.ts';

type UpdateSubscriptionWithTierArgs = Database['public']['Functions']['update_subscription_with_tier']['Args'];

function assertIso8601Timestamp(value: string): void {
  const parsedMilliseconds: number = Date.parse(value);
  assert(!Number.isNaN(parsedMilliseconds), `Expected ISO 8601 timestamp, got: ${value}`);
}

Deno.test('StripePaymentAdapter: handleWebhook', async (t) => {
  let mockStripe: MockStripe;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let adapter: StripePaymentAdapter;

  const teardownWebhookMocks = (): void => {
    teardownMocks(mockStripe, mockTokenWalletService);
    Deno.env.delete('STRIPE_WEBHOOK_SECRET');
  };

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
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_price_id' && f.value === stripePriceId)) {
              return { data: [{ id: internalPlanId, stripe_price_id: stripePriceId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Plan not found for sub update test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      },
      rpcResults: {
        update_subscription_with_tier: {
          data: [
            {
              user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
              tier_level: 1,
              rows_updated: 1,
            },
          ],
          error: null,
        },
      },
    };

    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));
    Deno.env.set('STRIPE_WEBHOOK_SECRET', MOCK_WEBHOOK_SECRET);

    const mockStripeEvent: Stripe.CustomerSubscriptionUpdatedEvent =
      createMockCustomerSubscriptionUpdatedEvent(
        {
          id: stripeSubscriptionId,
          customer: stripeCustomerId,
          status: newStatus,
          items: {
            object: 'list',
            data: [createMockSubscriptionItem({
              subscription: stripeSubscriptionId,
              price: createMockPrice({ id: stripePriceId }),
            })],
            has_more: false,
            url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
          },
        },
        { status: "active" },
        { id: eventId },
      );

    if (mockStripe.stubs.webhooksConstructEvent?.restore) {
      mockStripe.stubs.webhooksConstructEvent.restore();
    }
    mockStripe.instance.webhooks = mockStripe.instance.webhooks || {};
    mockStripe.stubs.webhooksConstructEvent = stub(
      mockStripe.instance.webhooks,
      "constructEventAsync",
      async () => mockStripeEvent,
    );

    const rawBodyJsonString: string = JSON.stringify(mockStripeEvent);
    const rawBody: ArrayBuffer = new TextEncoder().encode(rawBodyJsonString).slice().buffer;
    const dummySignature = 'whsec_test_sub_updated_signature';

    const result = await adapter.handleWebhook(rawBody, dummySignature);

    assert(result.success, `Webhook handling for subscription.updated should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);

    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['stripe_price_id', stripePriceId]);
    assertSpyCalls(subPlansBuilder.methodSpies.single, 1);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    const rpcPayload: UpdateSubscriptionWithTierArgs = mockSupabaseSetup.spies.rpcSpy.calls[0].args[1];
    assertEquals(rpcPayload.p_stripe_subscription_id, stripeSubscriptionId);
    assertEquals(rpcPayload.p_status, newStatus);
    assertEquals(rpcPayload.p_plan_id, internalPlanId);
    assertEquals(rpcPayload.p_cancel_at_period_end, false);
    assertEquals(rpcPayload.p_stripe_customer_id, stripeCustomerId);
    assertEquals(rpcPayload.p_set_ratchet, false);
    assert(typeof rpcPayload.p_period_start === 'string', 'p_period_start must be a non-null ISO string');
    assert(typeof rpcPayload.p_period_end === 'string', 'p_period_end must be a non-null ISO string');
    assertIso8601Timestamp(rpcPayload.p_period_start);
    assertIso8601Timestamp(rpcPayload.p_period_end);

    teardownWebhookMocks();
  });

});
