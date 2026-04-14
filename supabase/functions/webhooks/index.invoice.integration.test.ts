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
  assert,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Spy, spy, Stub, stub } from 'jsr:@std/testing@0.225.1/mock';
import { IPaymentGatewayAdapter } from '../_shared/types/payment.types.ts';
import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
  MockQueryBuilderState,
} from '../_shared/supabase.mock.ts';
import {
  createMockStripe,
  MockStripe,
  createMockInvoice,
  createMockInvoiceLineItem,
  createMockSubscription,
  createMockSubscriptionItem,
  createMockInvoicePaymentSucceededEvent,
  createMockPrice,
} from '../_shared/stripe.mock.ts';
import {
  createMockAdminTokenWalletService,
  MockAdminTokenWalletService,
} from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import Stripe from 'npm:stripe';
import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../types_db.ts';
import type { PaymentAdapterFactoryFn } from './index.ts';

const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret';

const originalDenoEnvGet = Deno.env.get;
let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
let mockEnvVarsForFileScope: Record<string, string | undefined> = {};

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

function readField(obj: object | unknown[] | null, key: string): unknown {
  if (obj === null) return undefined;
  return Reflect.get(obj, key);
}

describe('Stripe Invoice Event Processing with Real StripePaymentAdapter', () => {
  let paymentAdapterFactorySpy: Spy<PaymentAdapterFactoryFn>;
  let dependencies: WebhookHandlerDependencies;
  let realStripePaymentAdapter: StripePaymentAdapter;
  let mockTokenWalletServiceInstance: MockAdminTokenWalletService;
  let mockStripe: MockStripe;

  beforeEach(() => {
    mockEnvVarsForFileScope = {};
    mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
    mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';

    mockTokenWalletServiceInstance = createMockAdminTokenWalletService();
    mockStripe = createMockStripe();

    const fakePaymentAdapterFactory: PaymentAdapterFactoryFn = (source, _adminClient, _tokenWalletService) => {
      if (source === 'stripe') return realStripePaymentAdapter ?? null;
      return null;
    };
    paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);

    dependencies = {
      adminClient: {} as SupabaseClient<Database>,
      tokenWalletService: mockTokenWalletServiceInstance.instance,
      paymentAdapterFactory: paymentAdapterFactorySpy,
      getEnv: (key: string) => Deno.env.get(key),
    };
  });

  afterEach(() => {
    mockTokenWalletServiceInstance.clearStubs();
    mockStripe.clearStubs();
  });

  function setupAdapterWithConfig(
    dbConfig: MockSupabaseDataConfig,
    twsInstance?: IAdminTokenWalletService,
  ): MockSupabaseClientSetup {
    const setup = createMockSupabaseClient(undefined, dbConfig);
    const tws = twsInstance ?? mockTokenWalletServiceInstance.instance;
    realStripePaymentAdapter = new StripePaymentAdapter(
      mockStripe.instance,
      setup.client as unknown as SupabaseClient<Database>,
      tws,
      MOCK_STRIPE_WEBHOOK_SECRET,
    );
    if (twsInstance) {
      dependencies = {
        ...dependencies,
        tokenWalletService: twsInstance,
      };
    }
    return setup;
  }

  function stubConstructEventAsync(event: Stripe.Event): void {
    if (!mockStripe.stubs.webhooksConstructEvent.restored) {
      mockStripe.stubs.webhooksConstructEvent.restore();
    }
    mockStripe.stubs.webhooksConstructEvent = stub(
      mockStripe.instance.webhooks,
      'constructEventAsync',
      async () => event,
    );
  }

  function makeRequest(sig = 'sig-test'): Request {
    return new Request('http://localhost/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    });
  }

  // ---------------------------------------------------------------------------
  // invoice.payment_succeeded
  // ---------------------------------------------------------------------------
  describe('invoice.payment_succeeded event', () => {

    it('should insert PT, award tokens, update PT to COMPLETED, update user_subscription, return 200', async () => {
      const subId = 'sub_ips_success';
      const cusId = 'cus_ips_success';
      const userId = 'user_ips_success';
      const invoiceId = 'in_ips_success';
      const walletId = `wallet_${userId}`;
      const ptxId = 'ptx_ips_success';
      const tokensToAward = 7500;

      let capturedInsert: object | unknown[] | null = null;
      let capturedUpdate: object | null = null;
      let usUpdateCalled = false;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
            insert: async (state: MockQueryBuilderState) => {
              capturedInsert = state.insertData;
              return { data: [{ id: ptxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            },
            update: async (state: MockQueryBuilderState) => {
              capturedUpdate = state.updateData;
              return { data: [{ id: ptxId, status: 'COMPLETED' }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            update: async (_state: MockQueryBuilderState) => {
              usUpdateCalled = true;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ wallet_id: walletId, user_id: userId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
        },
      });

      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          metadata: { tokens_to_award: String(tokensToAward) },
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_success_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest(), dependencies);
      const responseBody: { transactionId?: string; success?: boolean } = await response.json();

      assertEquals(response.status, 200);
      assertExists(responseBody.transactionId);
      assertEquals(responseBody.transactionId, ptxId);

      assertExists(capturedInsert);
      assertEquals(readField(capturedInsert, 'gateway_transaction_id'), invoiceId);
      assertEquals(readField(capturedInsert, 'user_id'), userId);
      assertEquals(readField(capturedInsert, 'tokens_to_award'), tokensToAward);
      assertEquals(readField(capturedInsert, 'status'), 'PROCESSING_RENEWAL');

      assertExists(capturedUpdate);
      assertEquals(readField(capturedUpdate, 'status'), 'COMPLETED');

      const recordTxSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
      assertEquals(recordTxSpy.calls.length, 1);
      const txArgs = recordTxSpy.calls[0].args[0];
      assertEquals(txArgs.walletId, walletId);
      assertEquals(txArgs.type, 'CREDIT_PURCHASE');
      assertEquals(txArgs.amount, String(tokensToAward));
      assertEquals(txArgs.relatedEntityId, ptxId);

      assertEquals(usUpdateCalled, true);
    });

    it('should mark PT as TOKEN_AWARD_FAILED and return 500 when recordTransaction throws', async () => {
      const subId = 'sub_ips_token_fail';
      const cusId = 'cus_ips_token_fail';
      const userId = 'user_ips_token_fail';
      const invoiceId = 'in_ips_token_fail';
      const walletId = `wallet_${userId}`;
      const ptxId = 'ptx_ips_token_fail';
      const tokensToAward = 5000;

      let capturedFailUpdate: object | null = null;

      const failingTws = createMockAdminTokenWalletService({
        recordTransaction: () => Promise.reject(new Error('Simulated Token Award Failure')),
      });

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
            insert: async (_state: MockQueryBuilderState) => ({
              data: [{ id: ptxId }], error: null, count: 1, status: 201, statusText: 'Created',
            }),
            update: async (state: MockQueryBuilderState) => {
              capturedFailUpdate = state.updateData;
              return { data: [{ id: ptxId }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ wallet_id: walletId, user_id: userId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
        },
      }, failingTws.instance);

      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          metadata: { tokens_to_award: String(tokensToAward) },
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_tf_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-ips-tf'), dependencies);
      const responseBody: { success?: boolean; error?: string; transactionId?: string } = await response.json();

      assertEquals(response.status, 500);
      assertEquals(responseBody.success, false);
      assert(responseBody.error?.includes('Simulated Token Award Failure') ?? false);

      assertExists(capturedFailUpdate);
      assertEquals(readField(capturedFailUpdate, 'status'), 'TOKEN_AWARD_FAILED');
    });

    it('should still return 200 when user_subscriptions update fails (error is swallowed)', async () => {
      const subId = 'sub_ips_us_fail';
      const cusId = 'cus_ips_us_fail';
      const userId = 'user_ips_us_fail';
      const invoiceId = 'in_ips_us_fail';
      const walletId = `wallet_${userId}`;
      const ptxId = 'ptx_ips_us_fail';
      const tokensToAward = 6000;

      let usUpdateAttempted = false;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
            insert: async (_state: MockQueryBuilderState) => ({
              data: [{ id: ptxId }], error: null, count: 1, status: 201, statusText: 'Created',
            }),
            update: async (_state: MockQueryBuilderState) => ({
              data: [{ id: ptxId, status: 'COMPLETED' }], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            update: async (_state: MockQueryBuilderState) => {
              usUpdateAttempted = true;
              return {
                data: null,
                error: { name: 'MockedDataError', message: 'Simulated DB error updating user_subscriptions', code: 'MOCK50000' },
                count: 0, status: 500, statusText: 'Internal Server Error',
              };
            },
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ wallet_id: walletId, user_id: userId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
        },
      });

      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          metadata: { tokens_to_award: String(tokensToAward) },
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_usf_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-ips-usf'), dependencies);
      const responseBody: { transactionId?: string; success?: boolean } = await response.json();

      assertEquals(response.status, 200);
      assertExists(responseBody.transactionId);
      assertEquals(responseBody.transactionId, ptxId);
      assertEquals(usUpdateAttempted, true);
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 1);
    });

    it('should return 500 when payment_transactions insert fails', async () => {
      const subId = 'sub_ips_ptx_fail';
      const cusId = 'cus_ips_ptx_fail';
      const userId = 'user_ips_ptx_fail';
      const invoiceId = 'in_ips_ptx_fail';
      const walletId = `wallet_${userId}`;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
            insert: async (_state: MockQueryBuilderState) => ({
              data: null,
              error: { name: 'MockedDataError', message: 'Simulated DB error inserting payment_transaction', code: 'MOCK50001' },
              count: 0, status: 500, statusText: 'Internal Server Error',
            }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ wallet_id: walletId, user_id: userId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
        },
      });

      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          metadata: { tokens_to_award: '7000' },
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_ptxf_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-ips-ptxf'), dependencies);
      const responseBody: { success?: boolean; error?: string } = await response.json();

      assertEquals(response.status, 500);
      assertEquals(responseBody.success, false);
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0);
    });

    it('should return 500 when user_subscription is not found', async () => {
      const cusId = 'cus_ips_no_sub';
      const invoiceId = 'in_ips_no_sub';

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: null,
              error: { name: 'PGRST116', message: 'Query returned no rows', code: 'PGRST116' },
              count: 0, status: 406, statusText: 'Not Acceptable',
            }),
          },
        },
      });

      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: 'sub_ips_no_sub' })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_nosub_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-ips-nosub'), dependencies);
      const responseBody: { success?: boolean; error?: string } = await response.json();

      assertEquals(response.status, 500);
      assertEquals(responseBody.success, false);
      assertEquals(responseBody.error, 'User subscription data not found for Stripe customer ID.');
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0);
    });

    it('should return 404 when token wallet is not found for user', async () => {
      const subId = 'sub_ips_no_wallet';
      const cusId = 'cus_ips_no_wallet';
      const userId = 'user_ips_no_wallet';
      const invoiceId = 'in_ips_no_wallet';

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => ({
              data: null,
              error: { name: 'PGRST116', message: 'Query returned no rows', code: 'PGRST116' },
              count: 0, status: 406, statusText: 'Not Acceptable',
            }),
          },
        },
      });

      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_nw_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-ips-nw'), dependencies);
      const responseBody: { success?: boolean; error?: string } = await response.json();

      assertEquals(response.status, 404);
      assertEquals(responseBody.success, false);
      assertEquals(responseBody.error, 'Token wallet not found for user.');
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0);
    });

    it('should insert PT with tokens_to_award=0 and skip token award when plan is not found', async () => {
      const subId = 'sub_ips_no_plan';
      const cusId = 'cus_ips_no_plan';
      const userId = 'user_ips_no_plan';
      const invoiceId = 'in_ips_no_plan';
      const walletId = `wallet_${userId}`;
      const ptxId = 'ptx_ips_no_plan';
      const priceIdNotInDb = 'price_not_in_subscription_plans';

      let capturedInsert: object | unknown[] | null = null;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
            insert: async (state: MockQueryBuilderState) => {
              capturedInsert = state.insertData;
              return { data: [{ id: ptxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            },
            update: async (_state: MockQueryBuilderState) => ({
              data: [{ id: ptxId, status: 'COMPLETED' }], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            update: async (_state: MockQueryBuilderState) => ({
              data: [], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ wallet_id: walletId, user_id: userId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          subscription_plans: {
            select: async (_state: MockQueryBuilderState) => ({
              data: null,
              error: null,
              count: 0, status: 200, statusText: 'OK',
            }),
          },
        },
      });

      // Stub subscriptions.retrieve so the handler can look up the plan via the subscription
      mockStripe.stubs.subscriptionsRetrieve.restore();
      mockStripe.stubs.subscriptionsRetrieve = stub(
        mockStripe.instance.subscriptions,
        'retrieve',
        async (_id: string): Promise<Stripe.Response<Stripe.Subscription>> => {
          const sub: Stripe.Subscription = createMockSubscription({
            id: subId,
            customer: cusId,
            items: {
              object: 'list',
              data: [createMockSubscriptionItem({ subscription: subId, price: createMockPrice({ id: priceIdNotInDb }) })],
              has_more: false,
              url: `/v1/subscription_items?subscription=${subId}`,
            },
          });
          return { ...sub, lastResponse: { headers: {}, requestId: 'req_no_plan', statusCode: 200 } };
        },
      );

      // Invoice has NO metadata.tokens_to_award so the plan lookup path is triggered
      const mockEvent = createMockInvoicePaymentSucceededEvent(
        {
          id: invoiceId,
          customer: cusId,
          metadata: {},
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        { id: `evt_ips_np_${invoiceId}` },
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-ips-np'), dependencies);
      const responseBody: { transactionId?: string; success?: boolean } = await response.json();

      assertEquals(response.status, 200);
      assertExists(responseBody.transactionId);

      assertExists(capturedInsert);
      assertEquals(readField(capturedInsert, 'tokens_to_award'), 0);
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0);
    });

  });

  // ---------------------------------------------------------------------------
  // invoice.payment_failed
  // ---------------------------------------------------------------------------
  describe('invoice.payment_failed event', () => {

    function buildInvoicePaymentFailedEvent(
      invoiceOverrides: Partial<Stripe.Invoice>,
      eventId: string,
    ): Stripe.Event {
      const invoice: Stripe.Invoice = createMockInvoice(invoiceOverrides);
      const mockEvent: Stripe.Event = {
        id: eventId,
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'invoice.payment_failed',
        data: { object: invoice },
      };
      return mockEvent;
    }

    function stubRetrieveWithStatus(subId: string, status: Stripe.Subscription.Status, cusId: string): void {
      if (!mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
      }
      mockStripe.stubs.subscriptionsRetrieve = stub(
        mockStripe.instance.subscriptions,
        'retrieve',
        async (id: string): Promise<Stripe.Response<Stripe.Subscription>> => {
          if (id === subId) {
            const sub: Stripe.Subscription = createMockSubscription({ id: subId, customer: cusId, status });
            return { ...sub, lastResponse: { headers: {}, requestId: `req_pf_${subId}`, statusCode: 200 } };
          }
          throw new Error(`Mock subscriptions.retrieve: unexpected id ${id}`);
        },
      );
    }

    it('should upsert PT as FAILED and update user_subscription status, return 200 (existing PT with user_id)', async () => {
      const subId = 'sub_pf_main';
      const cusId = 'cus_pf_main';
      const userId = 'user_pf_main';
      const invoiceId = 'in_pf_main';
      const existingPtxId = 'ptx_pf_main_existing';
      const walletId = `wallet_${userId}`;

      let capturedUpsert: object | unknown[] | null = null;
      let capturedUsUpdate: object | null = null;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId, user_id: userId, organization_id: null, target_wallet_id: walletId, payment_gateway_id: 'stripe', gateway_transaction_id: invoiceId, status: 'PENDING' }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            upsert: async (state: MockQueryBuilderState) => {
              capturedUpsert = state.upsertData;
              return { data: [{ id: existingPtxId }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            update: async (state: MockQueryBuilderState) => {
              capturedUsUpdate = state.updateData;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubRetrieveWithStatus(subId, 'past_due', cusId);

      const mockEvent = buildInvoicePaymentFailedEvent(
        {
          id: invoiceId,
          status: 'open',
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        `evt_pf_main_${invoiceId}`,
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-pf-main'), dependencies);
      const responseBody: { transactionId?: string; success?: boolean } = await response.json();

      assertEquals(response.status, 200);
      assertEquals(responseBody.transactionId, existingPtxId);

      assertExists(capturedUpsert);
      assertEquals(readField(capturedUpsert, 'status'), 'FAILED');

      assertExists(capturedUsUpdate);
      assertEquals(readField(capturedUsUpdate, 'status'), 'past_due');
    });

    it('should look up user from user_subscriptions when existing PT has no user_id, then upsert FAILED PT', async () => {
      const subId = 'sub_pf_no_userid';
      const cusId = 'cus_pf_no_userid';
      const userId = 'user_pf_no_userid';
      const invoiceId = 'in_pf_no_userid';
      const existingPtxId = 'ptx_pf_no_userid';
      const walletId = `wallet_${userId}`;

      let capturedUsUpdate: object | null = null;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const gwFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.column === 'gateway_transaction_id');
              if (gwFilter?.value === invoiceId) {
                return { data: [{ id: existingPtxId, user_id: undefined, organization_id: null, target_wallet_id: walletId, payment_gateway_id: 'stripe', status: 'PENDING' }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            upsert: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId }], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ user_id: userId, stripe_customer_id: cusId }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            update: async (state: MockQueryBuilderState) => {
              capturedUsUpdate = state.updateData;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubRetrieveWithStatus(subId, 'active', cusId);

      const mockEvent = buildInvoicePaymentFailedEvent(
        {
          id: invoiceId,
          status: 'open',
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        `evt_pf_nuid_${invoiceId}`,
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-pf-nuid'), dependencies);
      const responseBody: { success?: boolean; transactionId?: string } = await response.json();

      assertEquals(response.status, 200);
      assertExists(capturedUsUpdate);
      assertEquals(readField(capturedUsUpdate, 'status'), 'active');
    });

    it('should upsert FAILED PT and update user_subscription to past_due (Scenario A)', async () => {
      const subId = 'sub_pf_a';
      const cusId = 'cus_pf_a';
      const userId = 'user_pf_a';
      const invoiceId = 'in_pf_a';
      const existingPtxId = 'ptx_pf_a';
      const walletId = `wallet_${userId}`;

      let capturedUsUpdate: object | null = null;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId, user_id: userId, organization_id: null, target_wallet_id: walletId, payment_gateway_id: 'stripe', status: 'PENDING' }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            upsert: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId }], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          user_subscriptions: {
            update: async (state: MockQueryBuilderState) => {
              capturedUsUpdate = state.updateData;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubRetrieveWithStatus(subId, 'past_due', cusId);

      const mockEvent = buildInvoicePaymentFailedEvent(
        {
          id: invoiceId,
          status: 'open',
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        `evt_pf_a_${invoiceId}`,
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-pf-a'), dependencies);
      assertEquals(response.status, 200);
      assertExists(capturedUsUpdate);
      assertEquals(readField(capturedUsUpdate, 'status'), 'past_due');
    });

    it('should return 500 when stripe.subscriptions.retrieve throws (PT upserted, US not updated)', async () => {
      const subId = 'sub_pf_stripe_err';
      const cusId = 'cus_pf_stripe_err';
      const userId = 'user_pf_stripe_err';
      const invoiceId = 'in_pf_stripe_err';
      const existingPtxId = 'ptx_pf_stripe_err';
      const walletId = `wallet_${userId}`;

      let usUpdateCalled = false;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId, user_id: userId, organization_id: null, target_wallet_id: walletId, payment_gateway_id: 'stripe', status: 'PENDING' }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            upsert: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId }], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          user_subscriptions: {
            update: async (_state: MockQueryBuilderState) => {
              usUpdateCalled = true;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      if (!mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
      }
      mockStripe.stubs.subscriptionsRetrieve = stub(
        mockStripe.instance.subscriptions,
        'retrieve',
        async (_id: string): Promise<Stripe.Response<Stripe.Subscription>> => {
          throw new Stripe.errors.StripeAPIError({ message: 'Simulated Stripe API Error', type: 'api_error' });
        },
      );

      const mockEvent = buildInvoicePaymentFailedEvent(
        {
          id: invoiceId,
          status: 'open',
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        `evt_pf_sae_${invoiceId}`,
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-pf-sae'), dependencies);
      const responseBody: { success?: boolean; error?: string; transactionId?: string } = await response.json();

      assertEquals(response.status, 500);
      assertEquals(responseBody.success, false);
      assert(responseBody.error?.includes('Simulated Stripe API Error') ?? false);
      assertEquals(usUpdateCalled, false);
    });

    it('should return 500 when user_subscription is not found for failed invoice', async () => {
      const subId = 'sub_pf_no_sub';
      const cusId = 'cus_pf_no_sub';
      const invoiceId = 'in_pf_no_sub';

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: null,
              error: { name: 'PGRST116', message: 'Query returned no rows', code: 'PGRST116' },
              count: 0, status: 406, statusText: 'Not Acceptable',
            }),
          },
        },
      });

      const mockEvent = buildInvoicePaymentFailedEvent(
        {
          id: invoiceId,
          status: 'open',
          customer: cusId,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        `evt_pf_nosub_${invoiceId}`,
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-pf-nosub'), dependencies);
      const responseBody: { success?: boolean; error?: string } = await response.json();

      assertEquals(response.status, 500);
      assertEquals(responseBody.success, false);
      assert(responseBody.error?.includes('Essential user/wallet info missing') ?? false);
    });

    it('should upsert FAILED PT and update user_subscription to unpaid (Scenario B - second failure)', async () => {
      const subId = 'sub_pf_b';
      const cusId = 'cus_pf_b';
      const userId = 'user_pf_b';
      const invoiceId = 'in_pf_b';
      const existingPtxId = 'ptx_pf_b';
      const walletId = `wallet_${userId}`;

      let capturedUsUpdate: object | null = null;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId, user_id: userId, organization_id: null, target_wallet_id: walletId, payment_gateway_id: 'stripe', status: 'PENDING' }],
              error: null, count: 1, status: 200, statusText: 'OK',
            }),
            upsert: async (_state: MockQueryBuilderState) => ({
              data: [{ id: existingPtxId }], error: null, count: 1, status: 200, statusText: 'OK',
            }),
          },
          user_subscriptions: {
            update: async (state: MockQueryBuilderState) => {
              capturedUsUpdate = state.updateData;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubRetrieveWithStatus(subId, 'unpaid', cusId);

      const mockEvent = buildInvoicePaymentFailedEvent(
        {
          id: invoiceId,
          status: 'open',
          customer: cusId,
          attempt_count: 2,
          lines: {
            object: 'list',
            data: [createMockInvoiceLineItem({ subscription: subId })],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
        },
        `evt_pf_b_${invoiceId}`,
      );
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeRequest('sig-pf-b'), dependencies);
      assertEquals(response.status, 200);
      assertExists(capturedUsUpdate);
      assertEquals(readField(capturedUsUpdate, 'status'), 'unpaid');
    });

  });
});
