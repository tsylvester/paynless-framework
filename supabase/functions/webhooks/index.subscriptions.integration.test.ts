import {
  describe,
  it,
  afterEach,
  beforeEach,
  beforeAll,
  afterAll,
} from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Stub, stub } from 'jsr:@std/testing@0.225.1/mock';
import type Stripe from 'npm:stripe';

import { IPaymentGatewayAdapter } from '../_shared/types/payment.types.ts';
import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
  MockQueryBuilderState,
} from '../_shared/supabase.mock.ts';
import {
  createMockAdminTokenWalletService,
  MockAdminTokenWalletService,
  asSupabaseAdminClientForTests,
} from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import {
  createMockStripe,
  MockStripe,
  createMockSubscription,
  createMockSubscriptionItem,
  createMockPrice,
} from '../_shared/stripe.mock.ts';

import { handleWebhookRequestLogic, WebhookHandlerDependencies, PaymentAdapterFactoryFn } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import type { Database, Tables } from '../types_db.ts';

// --- Single File-Scope Stub for Deno.env.get ---
const originalDenoEnvGet = Deno.env.get;
let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
// --- End File-Scope Stub ---

const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret_subscriptions';

beforeAll(() => {
  if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
    try { fileScopeDenoEnvGetStub.restore(); } catch (_e) { /* ignore */ }
  }
  fileScopeDenoEnvGetStub = stub(Deno.env, 'get', (key: string): string | undefined => {
    if (key === 'STRIPE_WEBHOOK_SECRET') return mockEnvVarsForFileScope[key];
    return mockEnvVarsForFileScope[key] === undefined ? originalDenoEnvGet(key) : mockEnvVarsForFileScope[key];
  });
});

afterAll(() => {
  if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) fileScopeDenoEnvGetStub.restore();
  fileScopeDenoEnvGetStub = null;
  mockEnvVarsForFileScope = {};
});

describe('Stripe Subscription Event Processing (Integration)', () => {
  let mockAdminClient: SupabaseClient<Database>;
  let mockTokenWalletService: IAdminTokenWalletService;
  let mockTokenWalletServiceInstance: MockAdminTokenWalletService;
  let mockStripe: MockStripe;
  let mockSetup: MockSupabaseClientSetup;
  let dependencies: WebhookHandlerDependencies;
  let constructEventStub: Stub<Stripe.Webhooks> | null = null;

  // Per-test configurable mock DB data — set in each it() block before calling the handler
  let subscriptionPlansSelectData: Partial<Tables<'subscription_plans'>>[] = [];

  beforeEach(() => {
    subscriptionPlansSelectData = [];

    mockEnvVarsForFileScope = {
      STRIPE_WEBHOOK_SECRET: MOCK_STRIPE_WEBHOOK_SECRET,
      SUPABASE_INTERNAL_FUNCTIONS_URL: 'http://localhost:54321',
    };

    mockSetup = createMockSupabaseClient(undefined, {
      genericMockResults: {
        subscription_plans: {
          select: (state: MockQueryBuilderState) => {
            const priceIdFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.type === 'eq');
            if (priceIdFilter) {
              const found = subscriptionPlansSelectData.filter(p => p.stripe_price_id === priceIdFilter.value);
              return Promise.resolve({ data: found, error: null, count: found.length, status: 200, statusText: 'OK' });
            }
            const itemIdFilter = state.filters.find(f => f.column === 'item_id_internal' && f.type === 'eq');
            if (itemIdFilter) {
              const found = subscriptionPlansSelectData.filter(p => p.item_id_internal === itemIdFilter.value);
              return Promise.resolve({ data: found, error: null, count: found.length, status: 200, statusText: 'OK' });
            }
            return Promise.resolve({ data: subscriptionPlansSelectData, error: null, count: subscriptionPlansSelectData.length, status: 200, statusText: 'OK' });
          },
        },
        user_subscriptions: {
          update: { data: [{}], error: null, count: 1, status: 200, statusText: 'OK' },
        },
      },
    });

    mockAdminClient = asSupabaseAdminClientForTests(mockSetup.client);

    mockTokenWalletServiceInstance = createMockAdminTokenWalletService();
    mockTokenWalletService = mockTokenWalletServiceInstance.instance;

    mockStripe = createMockStripe();
    // Restore the default stub so each test can configure its own event response
    mockStripe.stubs.webhooksConstructEvent.restore();

    const paymentAdapterFactory: PaymentAdapterFactoryFn = (
      _source: string,
      _adminClient: SupabaseClient<Database>,
      _tokenWalletService: IAdminTokenWalletService,
    ): IPaymentGatewayAdapter | null => new StripePaymentAdapter(
      mockStripe.instance,
      mockAdminClient,
      mockTokenWalletServiceInstance.instance,
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET']!,
    );

    dependencies = {
      adminClient: mockAdminClient,
      tokenWalletService: mockTokenWalletService,
      paymentAdapterFactory,
      getEnv: (key: string) => Deno.env.get(key),
    };
  });

  afterEach(() => {
    mockTokenWalletServiceInstance.clearStubs();
    mockSetup.clearAllStubs?.();
    if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
    constructEventStub = null;
    // Restore remaining mockStripe stubs (webhooksConstructEvent was restored in beforeEach)
    const { stubs } = mockStripe;
    if (!stubs.checkoutSessionsCreate.restored) stubs.checkoutSessionsCreate.restore();
    if (!stubs.paymentIntentsRetrieve.restored) stubs.paymentIntentsRetrieve.restore();
    if (!stubs.subscriptionsRetrieve.restored) stubs.subscriptionsRetrieve.restore();
    if (!stubs.productsRetrieve.restored) stubs.productsRetrieve.restore();
    if (!stubs.pricesRetrieve.restored) stubs.pricesRetrieve.restore();
    if (!stubs.pricesList.restored) stubs.pricesList.restore();
  });

  describe('customer.subscription.updated event', () => {
    it('should update user_subscriptions record and return 200', async () => {
      const stripeSubscriptionId = 'sub_updated_test_int';
      const userId = 'user_sub_updated_test';
      const mockPlanId = 'plan_for_updated_sub';
      const mockStripePriceId = 'price_mock_updated_plan';
      const expectedPeriodEnd = Math.floor(Date.now() / 1000) + (15 * 24 * 60 * 60);

      subscriptionPlansSelectData = [{
        id: mockPlanId,
        stripe_price_id: mockStripePriceId,
        item_id_internal: 'item_id_for_updated_plan',
        name: 'Mock Plan for Update',
        active: true,
        plan_type: 'subscription',
        tokens_to_award: 100,
      }];

      const mockPrice: Stripe.Price = createMockPrice({ id: mockStripePriceId });
      const mockSubscription: Stripe.Subscription = createMockSubscription({
        id: stripeSubscriptionId,
        status: 'past_due',
        customer: 'cus_test_sub_updated',
        cancel_at_period_end: false,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            id: 'si_mockitem_updated',
            price: mockPrice,
            subscription: stripeSubscriptionId,
            current_period_end: expectedPeriodEnd,
            current_period_start: Math.floor(Date.now() / 1000) - (5 * 24 * 60 * 60),
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
        metadata: { user_id: userId },
      });

      const mockEvent: Stripe.Event = {
        id: `evt_sub_updated_${stripeSubscriptionId}`,
        type: 'customer.subscription.updated',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: { object: mockSubscription },
      };

      constructEventStub = stub(
        mockStripe.instance.webhooks,
        'constructEventAsync',
        () => Promise.resolve(mockEvent),
      );

      const request = new Request('http://localhost/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-sub-updated' },
      });

      const response = await handleWebhookRequestLogic(request, dependencies);
      const responseBody = await response.json();

      assertEquals(response.status, 200);
      assertEquals(responseBody.transactionId, mockEvent.id);

      const updateCallInfo = mockSetup.spies.getHistoricQueryBuilderSpies('user_subscriptions', 'update');
      assertEquals(updateCallInfo?.callCount, 1);

      const usBuilders = mockSetup.client.getHistoricBuildersForTable('user_subscriptions') ?? [];
      const updateBuilder = usBuilders.find(b => b.getQueryBuilderState().operation === 'update');
      assertExists(updateBuilder, 'expected an update call on user_subscriptions');

      const updateState = updateBuilder.getQueryBuilderState();
      assertEquals(
        updateState.filters.some(f => f.column === 'stripe_subscription_id' && f.type === 'eq'),
        true,
        'expected eq filter on stripe_subscription_id',
      );

      assertExists(updateState.updateData, 'expected updateData to be captured');
      const captured: Record<string, unknown> = Object.fromEntries(Object.entries(updateState.updateData));
      assertEquals(captured['status'], 'past_due');
      assertEquals(captured['current_period_end'], new Date(expectedPeriodEnd * 1000).toISOString());
      assertEquals(captured['plan_id'], mockPlanId);
    });
  });

  describe('customer.subscription.deleted event', () => {
    it('should update user_subscriptions status to canceled and return 200', async () => {
      const stripeSubscriptionId = 'sub_deleted_test_int';
      const mockFreePlanId = 'plan_sys_free_tier_id';

      subscriptionPlansSelectData = [{
        id: mockFreePlanId,
        item_id_internal: 'SYS_FREE_TIER',
        stripe_price_id: 'price_sys_free_tier',
        name: 'System Free Tier',
        active: true,
        plan_type: 'subscription',
        tokens_to_award: 0,
      }];

      const mockSubscription: Stripe.Subscription = createMockSubscription({
        id: stripeSubscriptionId,
        status: 'canceled',
      });

      const mockEvent: Stripe.Event = {
        id: `evt_sub_deleted_${stripeSubscriptionId}`,
        type: 'customer.subscription.deleted',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: { object: mockSubscription },
      };

      constructEventStub = stub(
        mockStripe.instance.webhooks,
        'constructEventAsync',
        () => Promise.resolve(mockEvent),
      );

      const request = new Request('http://localhost/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-sub-deleted' },
      });

      const response = await handleWebhookRequestLogic(request, dependencies);
      const responseBody = await response.json();

      assertEquals(response.status, 200);
      assertEquals(responseBody.transactionId, mockEvent.id);

      const updateCallInfo = mockSetup.spies.getHistoricQueryBuilderSpies('user_subscriptions', 'update');
      assertEquals(updateCallInfo?.callCount, 1);

      const usBuilders = mockSetup.client.getHistoricBuildersForTable('user_subscriptions') ?? [];
      const updateBuilder = usBuilders.find(b => b.getQueryBuilderState().operation === 'update');
      assertExists(updateBuilder, 'expected an update call on user_subscriptions');

      const updateState = updateBuilder.getQueryBuilderState();
      assertEquals(
        updateState.filters.some(f => f.column === 'stripe_subscription_id' && f.type === 'eq'),
        true,
        'expected eq filter on stripe_subscription_id',
      );

      assertExists(updateState.updateData, 'expected updateData to be captured');
      const captured: Record<string, unknown> = Object.fromEntries(Object.entries(updateState.updateData));
      assertEquals(captured['status'], 'canceled');
    });
  });
});
