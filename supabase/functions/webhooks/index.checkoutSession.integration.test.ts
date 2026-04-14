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
import {
  Spy, spy, Stub, stub,
} from 'jsr:@std/testing@0.225.1/mock';

import { IPaymentGatewayAdapter, PaymentConfirmation } from '../_shared/types/payment.types.ts';
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
  createMockCheckoutSessionCompletedEvent,
  createMockSubscription,
} from '../_shared/stripe.mock.ts';
import { createMockAdminTokenWalletService, MockAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import Stripe from 'npm:stripe';

import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../types_db.ts';
import type { PaymentAdapterFactoryFn } from './index.ts';

const MOCK_STRIPE_WEBHOOK_SECRET = 'whsec_test_checkout_session_integration';

const originalDenoEnvGet = Deno.env.get;
let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
let mockEnvVarsForFileScope: Record<string, string | undefined> = {};

beforeAll(() => {
  if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
    try { fileScopeDenoEnvGetStub.restore(); } catch (e) { console.warn('Stray fileScopeDenoEnvGetStub restore failed in beforeAll:', e); }
  }
  fileScopeDenoEnvGetStub = stub(Deno.env, 'get', (key: string): string | undefined => {
    if (key === 'STRIPE_WEBHOOK_SECRET') {
      return mockEnvVarsForFileScope[key];
    }
    return mockEnvVarsForFileScope[key] === undefined ? originalDenoEnvGet(key) : mockEnvVarsForFileScope[key];
  });
});

afterAll(() => {
  if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
    fileScopeDenoEnvGetStub.restore();
  }
  fileScopeDenoEnvGetStub = null;
  mockEnvVarsForFileScope = {};
});

function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'string' ? field : undefined;
}

function makeWebhookRequest(sig = 'sig-test'): Request {
  return new Request('http://localhost/webhooks/stripe', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
  });
}

describe('Webhook Router (handleWebhookRequestLogic)', () => {
  let paymentAdapterFactorySpy: Spy<PaymentAdapterFactoryFn>;
  let dependencies: WebhookHandlerDependencies;
  let currentMockAdapter: IPaymentGatewayAdapter | null = null;
  let configuredSourceForAdapterStub: string | null = null;
  let realStripePaymentAdapter: StripePaymentAdapter;
  let mockTokenWalletServiceInstance: MockAdminTokenWalletService;
  let mockStripe: MockStripe;

  beforeEach(() => {
    mockEnvVarsForFileScope = {};
    const fakePaymentAdapterFactory: PaymentAdapterFactoryFn = (source, _adminClient, _tokenWalletService) => {
      if (configuredSourceForAdapterStub === source) {
        if (currentMockAdapter) return currentMockAdapter;
        if (source === 'stripe' && realStripePaymentAdapter) return realStripePaymentAdapter;
      }
      return null;
    };
    paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);
    mockTokenWalletServiceInstance = createMockAdminTokenWalletService(); 
    dependencies = {
      adminClient: {} as SupabaseClient<Database>,
      tokenWalletService: mockTokenWalletServiceInstance.instance,
      paymentAdapterFactory: paymentAdapterFactorySpy,
      getEnv: (key: string) => Deno.env.get(key),
    };
    currentMockAdapter = null;
    configuredSourceForAdapterStub = null;
  });

  describe('Stripe Event Processing with Real StripePaymentAdapter', () => {

    beforeEach(() => {
      mockTokenWalletServiceInstance = createMockAdminTokenWalletService();
      mockStripe = createMockStripe();
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';
      configuredSourceForAdapterStub = 'stripe';
      currentMockAdapter = null;
    });

    afterEach(() => {
      mockTokenWalletServiceInstance.clearStubs();
      mockStripe.clearStubs();
    });

    function setupAdapterWithConfig(dbConfig: MockSupabaseDataConfig): MockSupabaseClientSetup {
      const setup = createMockSupabaseClient(undefined, dbConfig);
      realStripePaymentAdapter = new StripePaymentAdapter(
        mockStripe.instance,
        setup.client as unknown as SupabaseClient<Database>,
        mockTokenWalletServiceInstance.instance,
        MOCK_STRIPE_WEBHOOK_SECRET,
      );
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

    function stubSubscriptionRetrieve(
      impl: (id: string) => Promise<Stripe.Response<Stripe.Subscription>>,
    ): void {
      if (!mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
      }
      mockStripe.stubs.subscriptionsRetrieve = stub(
        mockStripe.instance.subscriptions,
        'retrieve',
        impl,
      );
    }

    describe('checkout.session.completed event', () => {

      it('mode: payment - should update payment_transactions, award tokens, and return 200', async () => {
        const internalPaymentId = 'pt_test_checkout_payment_int';
        const userId = 'user_checkout_payment_test';
        const tokensToAward = 1000;
        const sessionId = 'cs_test_payment_int';

        let capturedPtxUpdate: unknown = null;
        let ptxUpdateCount = 0;

        setupAdapterWithConfig({
          genericMockResults: {
            payment_transactions: {
              select: async (state: MockQueryBuilderState) => {
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
                if (idFilter) {
                  return { data: [{ id: internalPaymentId, user_id: userId, target_wallet_id: `wallet_for_${userId}`, payment_gateway_id: 'stripe', status: 'PENDING', tokens_to_award: tokensToAward }], error: null, count: 1, status: 200, statusText: 'OK' };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              },
              update: async (state: MockQueryBuilderState) => {
                ptxUpdateCount++;
                capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
                return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
          },
        });

        const mockEvent = createMockCheckoutSessionCompletedEvent({
          id: sessionId,
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId },
          payment_intent: 'pi_test_payment_intent_int',
        });
        stubConstructEventAsync(mockEvent);

        const response = await handleWebhookRequestLogic(makeWebhookRequest('sig-cs-payment'), dependencies);
        const responseBody: PaymentConfirmation = await response.json();

        assertEquals(response.status, 200);
        assertEquals(responseBody.transactionId, internalPaymentId);
        assertEquals(ptxUpdateCount, 1);
        assertEquals(readStringField(capturedPtxUpdate, 'status'), 'COMPLETED');
        assertEquals(readStringField(capturedPtxUpdate, 'id'), internalPaymentId);
        assertEquals(readStringField(capturedPtxUpdate, 'gateway_transaction_id'), sessionId);

        const recordTxSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        assertEquals(recordTxSpy.calls.length, 1);
        const txArgs = recordTxSpy.calls[0].args[0];
        assertEquals(txArgs.walletId, `wallet_for_${userId}`);
        assertEquals(txArgs.type, 'CREDIT_PURCHASE');
        assertEquals(txArgs.amount, tokensToAward.toString());
        assertEquals(txArgs.relatedEntityId, internalPaymentId);
        assertEquals(txArgs.recordedByUserId, userId);
      });

      it('mode: subscription - should upsert user_subscriptions, update payment_transactions, award tokens, and return 200', async () => {
        const internalPaymentId = 'pt_test_checkout_sub_int';
        const userId = 'user_checkout_sub_test';
        const tokensToAward = 5000;
        const stripeSubscriptionId = 'sub_test_integration';
        const stripeCustomerId = 'cus_test_integration';
        const planId = 'plan_sub_test_integration';
        const internalItemId = 'test_subscription_item_id';
        const sessionId = 'cs_test_sub_int';
        const priceId = 'price_sub_test_integration';

        let capturedPtxUpdate: unknown = null;
        let ptxUpdateCount = 0;
        let capturedUserSubUpsert: unknown = null;
        let userSubUpsertCount = 0;

        setupAdapterWithConfig({
          genericMockResults: {
            payment_transactions: {
              select: async (state: MockQueryBuilderState) => {
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
                if (idFilter) {
                  return { data: [{ id: internalPaymentId, user_id: userId, target_wallet_id: `wallet_for_${userId}`, payment_gateway_id: 'stripe', status: 'PENDING', tokens_to_award: tokensToAward }], error: null, count: 1, status: 200, statusText: 'OK' };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              },
              update: async (state: MockQueryBuilderState) => {
                ptxUpdateCount++;
                capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
                return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
            user_subscriptions: {
              upsert: async (state: MockQueryBuilderState) => {
                userSubUpsertCount++;
                capturedUserSubUpsert = Array.isArray(state.upsertData) ? state.upsertData[0] : state.upsertData;
                return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
            subscription_plans: {
              select: async (state: MockQueryBuilderState) => {
                const itemFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.value === internalItemId);
                if (itemFilter) {
                  return { data: [{ id: planId, item_id_internal: internalItemId, stripe_price_id: priceId, tokens_to_award: tokensToAward }], error: null, count: 1, status: 200, statusText: 'OK' };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              },
            },
          },
        });

        stubSubscriptionRetrieve(async (id: string) => {
          if (id === stripeSubscriptionId) {
            const sub = createMockSubscription({
              id: stripeSubscriptionId,
              customer: stripeCustomerId,
              metadata: { plan_id: planId },
              items: { data: [{ price: { id: priceId } } as Stripe.SubscriptionItem] } as Stripe.Subscription['items'],
            });
            return { ...sub, lastResponse: { headers: {}, requestId: `req_mock_${id}`, statusCode: 200 } } as unknown as Stripe.Response<Stripe.Subscription>;
          }
          throw new Error(`Mock subscriptions.retrieve: unexpected id ${id}`);
        });

        const mockEvent = createMockCheckoutSessionCompletedEvent({
          id: sessionId,
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, plan_id: planId, item_id: internalItemId, tokens_to_award: tokensToAward.toString() },
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
        });
        stubConstructEventAsync(mockEvent);

        const response = await handleWebhookRequestLogic(makeWebhookRequest('sig-cs-sub'), dependencies);
        const responseBody: PaymentConfirmation = await response.json();

        assertEquals(response.status, 200);
        assertEquals(responseBody.transactionId, internalPaymentId);
        assertEquals(mockStripe.stubs.subscriptionsRetrieve.calls.length, 1);
        assertEquals(mockStripe.stubs.subscriptionsRetrieve.calls[0].args[0], stripeSubscriptionId);
        assertEquals(userSubUpsertCount, 1);
        assertEquals(readStringField(capturedUserSubUpsert, 'user_id'), userId);
        assertEquals(readStringField(capturedUserSubUpsert, 'stripe_subscription_id'), stripeSubscriptionId);
        assertEquals(readStringField(capturedUserSubUpsert, 'stripe_customer_id'), stripeCustomerId);
        assertEquals(readStringField(capturedUserSubUpsert, 'status'), 'active');
        assertEquals(readStringField(capturedUserSubUpsert, 'plan_id'), planId);
        assertEquals(ptxUpdateCount, 1);
        assertEquals(readStringField(capturedPtxUpdate, 'status'), 'COMPLETED');

        const recordTxSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        assertEquals(recordTxSpy.calls.length, 1);
        const txArgs = recordTxSpy.calls[0].args[0];
        assertEquals(txArgs.walletId, `wallet_for_${userId}`);
        assertEquals(txArgs.type, 'CREDIT_PURCHASE');
        assertEquals(txArgs.amount, tokensToAward.toString());
        assertEquals(txArgs.relatedEntityId, internalPaymentId);
      });

      it('mode: subscription - idempotency: processing same event twice only awards tokens once', async () => {
        const internalPaymentId = 'pt_idem_checkout_sub_int';
        const userId = 'user_idem_checkout_sub_test';
        const tokensToAward = 5000;
        const stripeSubscriptionId = 'sub_idem_test_integration';
        const stripeCustomerId = 'cus_idem_test_integration';
        const planId = 'plan_sub_test_integration';
        const internalItemId = 'test_subscription_item_id';
        const sessionId = 'cs_idem_test_sub_int';
        const priceId = 'price_idem_sub';

        let ptxSelectData: Record<string, unknown>[] = [{
          id: internalPaymentId,
          user_id: userId,
          target_wallet_id: `wallet_for_${userId}`,
          payment_gateway_id: 'stripe',
          status: 'PENDING',
          tokens_to_award: tokensToAward,
        }];
        let capturedPtxUpdate: unknown = null;
        let ptxUpdateCount = 0;
        let userSubUpsertCount = 0;

        setupAdapterWithConfig({
          genericMockResults: {
            payment_transactions: {
              select: async (_state: MockQueryBuilderState) => {
                return { data: ptxSelectData.slice(), error: null, count: ptxSelectData.length, status: 200, statusText: 'OK' };
              },
              update: async (state: MockQueryBuilderState) => {
                ptxUpdateCount++;
                capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
                return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
            user_subscriptions: {
              upsert: async (_state: MockQueryBuilderState) => {
                userSubUpsertCount++;
                return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
            subscription_plans: {
              select: async (state: MockQueryBuilderState) => {
                const itemFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.value === internalItemId);
                if (itemFilter) {
                  return { data: [{ id: planId, item_id_internal: internalItemId, stripe_price_id: priceId, tokens_to_award: tokensToAward }], error: null, count: 1, status: 200, statusText: 'OK' };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              },
            },
          },
        });

        stubSubscriptionRetrieve(async (id: string) => {
          if (id === stripeSubscriptionId) {
            const sub = createMockSubscription({
              id: stripeSubscriptionId,
              customer: stripeCustomerId,
              metadata: { plan_id: planId },
              items: { data: [{ price: { id: priceId } } as Stripe.SubscriptionItem] } as Stripe.Subscription['items'],
            });
            return { ...sub, lastResponse: { headers: {}, requestId: `req_mock_${id}`, statusCode: 200 } } as unknown as Stripe.Response<Stripe.Subscription>;
          }
          throw new Error(`Mock subscriptions.retrieve (idempotency): unexpected id ${id}`);
        });

        const mockEvent = createMockCheckoutSessionCompletedEvent({
          id: sessionId,
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, plan_id: planId, item_id: internalItemId, tokens_to_award: tokensToAward.toString() },
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
        });
        stubConstructEventAsync(mockEvent);

        const requestDetails = {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-cs-sub-idem' },
        };

        const response1 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody1: PaymentConfirmation = await response1.json();

        assertEquals(response1.status, 200, 'First call should succeed');
        assertEquals(responseBody1.transactionId, internalPaymentId, 'First call transactionId mismatch');

        const userSubUpsertAfterFirst = userSubUpsertCount;
        const ptxUpdateAfterFirst = ptxUpdateCount;
        const recordTxSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        const recordTxCallsAfterFirst = recordTxSpy.calls.length;

        ptxSelectData = [{ ...ptxSelectData[0], status: 'COMPLETED', gateway_transaction_id: sessionId }];

        const response2 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody2: PaymentConfirmation = await response2.json();

        assertEquals(response2.status, 200, 'Second call should succeed (idempotency)');
        assertEquals(responseBody2.transactionId, internalPaymentId, 'Second call transactionId should match');
        assertEquals(mockStripe.stubs.subscriptionsRetrieve.calls.length, 1, 'Stripe subscription retrieve should be called only once');
        assert(userSubUpsertCount >= userSubUpsertAfterFirst, 'Upsert call count should not decrease');
        assert(ptxUpdateCount >= ptxUpdateAfterFirst, 'Update call count should not decrease');
        assertExists(capturedPtxUpdate, 'No data captured for payment_transactions update after second call');
        assertEquals(readStringField(capturedPtxUpdate, 'status'), 'COMPLETED', 'Payment transaction status should remain COMPLETED');
        assertEquals(recordTxSpy.calls.length, recordTxCallsAfterFirst, 'recordTransaction should only be called once');
        assertEquals(recordTxSpy.calls.length, 1, 'recordTransaction should be called exactly once in total');
        const txArgs = recordTxSpy.calls[0].args[0];
        assertEquals(txArgs.walletId, `wallet_for_${userId}`);
        assertEquals(txArgs.type, 'CREDIT_PURCHASE');
        assertEquals(txArgs.amount, tokensToAward.toString());
        assertEquals(txArgs.relatedEntityId, internalPaymentId);
      });

      it('mode: subscription - error: stripe.subscriptions.retrieve fails', async () => {
        const internalPaymentId = 'pt_err_sub_retrieve_int';
        const userId = 'user_err_sub_retrieve_test';
        const tokensToAward = 5000;
        const stripeSubscriptionId = 'sub_err_retrieve_integration';
        const stripeCustomerId = 'cus_err_retrieve_integration';
        const planId = 'plan_err_retrieve_integration';
        const internalItemId = 'item_id_err_retrieve';
        const sessionId = 'cs_err_sub_retrieve_int';

        let capturedPtxUpdate: unknown = null;
        let userSubUpsertCount = 0;

        setupAdapterWithConfig({
          genericMockResults: {
            payment_transactions: {
              select: async (state: MockQueryBuilderState) => {
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
                if (idFilter) {
                  return { data: [{ id: internalPaymentId, user_id: userId, target_wallet_id: `wallet_for_${userId}`, payment_gateway_id: 'stripe', status: 'PENDING', tokens_to_award: tokensToAward }], error: null, count: 1, status: 200, statusText: 'OK' };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              },
              update: async (state: MockQueryBuilderState) => {
                capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
                return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
            user_subscriptions: {
              upsert: async (_state: MockQueryBuilderState) => {
                userSubUpsertCount++;
                return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
          },
        });

        const retrieveError = new Stripe.errors.StripeAPIError({ message: 'Failed to retrieve subscription (test error)', type: 'api_error' });
        stubSubscriptionRetrieve(async () => { return Promise.reject(retrieveError); });

        const mockEvent = createMockCheckoutSessionCompletedEvent({
          id: sessionId,
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, plan_id: planId, item_id: internalItemId, tokens_to_award: tokensToAward.toString() },
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
        });
        stubConstructEventAsync(mockEvent);

        const response = await handleWebhookRequestLogic(makeWebhookRequest('sig-cs-sub-err-retrieve'), dependencies);
        const responseBody: PaymentConfirmation = await response.json();

        assertEquals(response.status, 500, 'Webhook should return 500 on subscription retrieve failure');
        assertEquals(responseBody.error, 'Stripe API Error: Failed to retrieve subscription (test error)');
        assertEquals(mockStripe.stubs.subscriptionsRetrieve.calls.length, 1, 'stripe.subscriptions.retrieve should have been called once');
        assertExists(capturedPtxUpdate, 'No data captured for payment_transactions update');
        assertEquals(readStringField(capturedPtxUpdate, 'id'), internalPaymentId);
        const status = readStringField(capturedPtxUpdate, 'status') ?? '';
        assert(status.toUpperCase().includes('FAIL') || status.toUpperCase().includes('ERROR'), `Expected failure status, got: ${status}`);
        assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0, 'recordTransaction should NOT have been called');
        assertEquals(userSubUpsertCount, 0, 'user_subscriptions upsert should NOT have been called');
      });

    }); // end checkout.session.completed event

    describe('checkout.session.completed (mode: payment) idempotency', () => {

      it('should process the same event twice, award tokens once, update PT once', async () => {
        const internalPaymentId = 'ptx_idem_cs_payment_1';
        const userId = 'user_idem_cs_payment_1';
        const tokensToAward = 1000;
        const sessionId = 'cs_idem_payment_1';
        const paymentIntentId = 'pi_idem_cs_payment_1';

        let ptxSelectData: Record<string, unknown>[] = [{
          id: internalPaymentId,
          status: 'PENDING',
          tokens_to_award: tokensToAward,
          target_wallet_id: `wallet_for_${userId}`,
          user_id: userId,
          metadata_json: { item_id: 'item_checkout_payment_idem' },
        }];
        let capturedPtxUpdate: unknown = null;
        let ptxUpdateCount = 0;

        setupAdapterWithConfig({
          genericMockResults: {
            payment_transactions: {
              select: async (_state: MockQueryBuilderState) => {
                return { data: ptxSelectData.slice(), error: null, count: ptxSelectData.length, status: 200, statusText: 'OK' };
              },
              update: async (state: MockQueryBuilderState) => {
                ptxUpdateCount++;
                capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
                return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
          },
        });

        const mockEvent = createMockCheckoutSessionCompletedEvent({
          id: sessionId,
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          payment_intent: paymentIntentId,
          metadata: { internal_payment_id: internalPaymentId },
        });
        stubConstructEventAsync(mockEvent);

        const requestDetails = {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_idem_cs_payment_1' },
        };

        const response1 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody1: PaymentConfirmation = await response1.json();

        assertEquals(response1.status, 200, 'First call: status should be 200');
        assertExists(responseBody1.transactionId, 'First call: transactionId should exist');
        assertEquals(responseBody1.transactionId, internalPaymentId, 'First call: transactionId should be internalPaymentId');
        assertEquals(ptxUpdateCount, 1, 'First call: PT update count');
        assertEquals(readStringField(capturedPtxUpdate, 'status'), 'COMPLETED', 'First call: PT status should be COMPLETED');
        assertEquals(readStringField(capturedPtxUpdate, 'gateway_transaction_id'), sessionId, 'First call: gateway_transaction_id should be session ID');

        const recordTxSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        assertEquals(recordTxSpy.calls.length, 1, 'First call: recordTransaction call count');
        const txArgs1 = recordTxSpy.calls[0].args[0];
        assertEquals(txArgs1.walletId, `wallet_for_${userId}`, 'First call: walletId');
        assertEquals(txArgs1.type, 'CREDIT_PURCHASE', 'First call: type');
        assertEquals(txArgs1.amount, tokensToAward.toString(), 'First call: amount');
        assertEquals(txArgs1.relatedEntityId, internalPaymentId, 'First call: relatedEntityId');

        ptxSelectData = [{
          id: internalPaymentId,
          status: 'COMPLETED',
          tokens_to_award: tokensToAward,
          user_id: userId,
          target_wallet_id: `wallet_for_${userId}`,
          gateway_transaction_id: sessionId,
          payment_gateway_id: 'stripe',
        }];
        ptxUpdateCount = 0;

        const response2 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody2: PaymentConfirmation = await response2.json();

        assertEquals(response2.status, 200, 'Second call: status should be 200');
        assertEquals(responseBody2.transactionId, internalPaymentId, 'Second call: transactionId should match');
        assertEquals(responseBody2.message, 'Webhook processed', 'Second call: message for already processed event');
        assertEquals(ptxUpdateCount, 0, 'Second call: PT update count should be 0');
        assertEquals(recordTxSpy.calls.length, 1, 'Second call: recordTransaction should remain at 1');
      });

      it('should handle Token Award Failure for checkout.session.completed (mode: payment) and return 400/500', async () => {
        const internalPaymentId = 'ptx_token_fail_payment';
        const userIdForWallet = 'user_checkout_payment_token_fail';
        const mockGatewayTxId = 'cs_test_checkout_payment_token_fail';

        let ptxUpdateCount = 0;
        let capturedPtxUpdate: unknown = null;

        setupAdapterWithConfig({
          genericMockResults: {
            payment_transactions: {
              select: async (state: MockQueryBuilderState) => {
                const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
                if (idFilter) {
                  return { data: [{ id: internalPaymentId, status: 'PENDING', tokens_to_award: 100, target_wallet_id: 'wallet_for_checkout_payment_token_fail', user_id: userIdForWallet, metadata_json: { item_id: 'item_checkout_payment_token_fail' } }], error: null, count: 1, status: 200, statusText: 'OK' };
                }
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
              },
              update: async (state: MockQueryBuilderState) => {
                ptxUpdateCount++;
                capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
                return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
              },
            },
          },
        });

        const tokenAwardError = new Error('Simulated Token Award Failure');
        if (mockTokenWalletServiceInstance.stubs.recordTransaction && !mockTokenWalletServiceInstance.stubs.recordTransaction.restored) {
          mockTokenWalletServiceInstance.stubs.recordTransaction.restore();
        }
        const tempRecordTxStub = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async () => {
          throw tokenAwardError;
        });

        const mockEvent = createMockCheckoutSessionCompletedEvent({
          id: mockGatewayTxId,
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          metadata: { internal_payment_id: internalPaymentId },
        });
        stubConstructEventAsync(mockEvent);

        try {
          const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_payment_token_fail'), dependencies);
          const responseBody: PaymentConfirmation = await response.json();

          assertEquals(response.status, 400);
          assertExists(responseBody.error);
          assertEquals(responseBody.error, `Failed to award tokens for payment transaction ${internalPaymentId}: ${tokenAwardError.message}`);
          assertEquals(tempRecordTxStub.calls.length, 1);
          assertEquals(ptxUpdateCount, 2, 'PT should be updated twice: COMPLETED then TOKEN_AWARD_FAILED');
          assertEquals(readStringField(capturedPtxUpdate, 'status'), 'TOKEN_AWARD_FAILED');
        } finally {
          if (tempRecordTxStub && !tempRecordTxStub.restored) tempRecordTxStub.restore();
        }
      });

    }); // end mode: payment idempotency

    it('should return 500 if DB update to COMPLETED fails for checkout.session.completed (mode: payment)', async () => {
      const internalPaymentId = 'ptx_db_update_fail_cs_payment';
      const userId = 'user_db_update_fail_cs_payment';
      const sessionId = 'cs_db_update_fail_payment';
      const tokensToAward = 100;
      const dbUpdateError = new Error('Simulated DB update failure for payment_transactions to COMPLETED');

      let ptxUpdateCount = 0;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
              if (idFilter) {
                return { data: [{ id: internalPaymentId, status: 'PENDING', tokens_to_award: tokensToAward, target_wallet_id: `wallet_for_${userId}`, user_id: userId, metadata_json: { item_id: 'item_db_update_fail' } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async (_state: MockQueryBuilderState) => {
              ptxUpdateCount++;
              return { data: null, error: dbUpdateError, count: 0, status: 500, statusText: 'Internal Server Error' };
            },
          },
        },
      });

      const mockEvent = createMockCheckoutSessionCompletedEvent({
        id: sessionId,
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: userId,
        metadata: { internal_payment_id: internalPaymentId },
      });
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_db_update_fail_cs_payment'), dependencies);
      const responseBody: PaymentConfirmation = await response.json();

      assertEquals(response.status, 500, 'Response status should be 500 for DB update failure');
      assertExists(responseBody.error, 'Response body should contain an error');
      assertEquals(responseBody.error, `Critical: Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`);
      assertEquals(responseBody.transactionId, internalPaymentId);
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0, 'recordTransaction should not have been called');
      assert(ptxUpdateCount >= 1, 'Payment transaction update to COMPLETED should have been attempted');
    });

    it('should return 404 if initial PENDING payment_transaction is not found for checkout.session.completed (mode: payment)', async () => {
      const internalPaymentId = 'ptx_missing_initial_cs_payment';
      const userId = 'user_missing_initial_cs_payment';
      const sessionId = 'cs_missing_initial_payment';

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (_state: MockQueryBuilderState) => {
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      const mockEvent = createMockCheckoutSessionCompletedEvent({
        id: sessionId,
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: userId,
        metadata: { internal_payment_id: internalPaymentId },
      });
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_missing_ptx_cs_payment'), dependencies);
      const responseBody: PaymentConfirmation = await response.json();

      assertEquals(response.status, 404, 'Response status should be 404 for missing initial payment transaction');
      assertExists(responseBody.error, 'Response body should contain an error');
      assertEquals(responseBody.error, `Payment transaction not found: ${internalPaymentId}`);
      assertEquals(responseBody.transactionId, internalPaymentId);
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0, 'recordTransaction should not have been called');
    });

    it('mode: subscription - should handle Token Award Failure (Initial Payment) and update PT status', async () => {
      const internalPaymentId = 'ptx_sub_token_fail_init';
      const userId = 'user_sub_token_fail_init';
      const stripeSubscriptionId = 'sub_token_fail_init_integ';
      const stripeCustomerId = 'cus_token_fail_init_integ';
      const planId = 'plan_sub_token_f_init_int';
      const internalItemId = 'item_id_sub_token_f_init';
      const tokensToAward = 777;
      const sessionId = 'cs_sub_token_fail_init';
      const priceId = 'price_for_sub_token_fail';

      let ptxUpdateCount = 0;
      let capturedPtxUpdate: unknown = null;
      let userSubUpsertCount = 0;
      let capturedUserSubUpsert: unknown = null;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
              if (idFilter) {
                return { data: [{ id: internalPaymentId, user_id: userId, target_wallet_id: `wallet_for_${userId}`, status: 'PENDING', tokens_to_award: tokensToAward, metadata_json: { item_id: internalItemId, plan_id: planId } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async (state: MockQueryBuilderState) => {
              ptxUpdateCount++;
              capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
              return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            upsert: async (state: MockQueryBuilderState) => {
              userSubUpsertCount++;
              capturedUserSubUpsert = Array.isArray(state.upsertData) ? state.upsertData[0] : state.upsertData;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          subscription_plans: {
            select: async (state: MockQueryBuilderState) => {
              const itemFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.value === internalItemId);
              if (itemFilter) {
                return { data: [{ id: planId, item_id_internal: internalItemId, tokens_to_award: tokensToAward, stripe_price_id: priceId }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      if (mockTokenWalletServiceInstance.stubs.recordTransaction && !mockTokenWalletServiceInstance.stubs.recordTransaction.restored) {
        mockTokenWalletServiceInstance.stubs.recordTransaction.restore();
      }
      const tempRecordTxStub = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async () => {
        throw new Error('Simulated Subscription Token Award Failure (Initial)');
      });

      stubSubscriptionRetrieve(async () => {
        const sub = createMockSubscription({
          id: stripeSubscriptionId,
          customer: stripeCustomerId,
          metadata: { plan_id: planId },
          items: { data: [{ price: { id: priceId } } as Stripe.SubscriptionItem] } as Stripe.Subscription['items'],
        });
        return { ...sub, lastResponse: { headers: {}, requestId: 'req_mock_sub_tf_init', statusCode: 200 } } as unknown as Stripe.Response<Stripe.Subscription>;
      });

      const mockEvent = createMockCheckoutSessionCompletedEvent({
        id: sessionId,
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: userId,
        metadata: { internal_payment_id: internalPaymentId, plan_id: planId, item_id: internalItemId },
        subscription: stripeSubscriptionId,
        customer: stripeCustomerId,
      });
      stubConstructEventAsync(mockEvent);

      try {
        const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_sub_token_fail_init'), dependencies);
        const responseBody: PaymentConfirmation = await response.json();

        assertEquals(response.status, 400, 'Response status should be 400 for token award failure');
        assertExists(responseBody.error);
        assertEquals(responseBody.error, `Failed to award tokens for payment transaction ${internalPaymentId}: Simulated Subscription Token Award Failure (Initial)`);
        assertEquals(responseBody.transactionId, internalPaymentId);
        assertEquals(tempRecordTxStub.calls.length, 1, 'recordTransaction should have been called once');
        assertEquals(userSubUpsertCount, 1, 'user_subscriptions should have been upserted once');
        assertExists(capturedUserSubUpsert);
        assertEquals(readStringField(capturedUserSubUpsert, 'stripe_subscription_id'), stripeSubscriptionId);
        assertEquals(ptxUpdateCount, 2, 'Payment transactions should be updated twice (COMPLETED, then TOKEN_AWARD_FAILED)');
        assertEquals(readStringField(capturedPtxUpdate, 'status'), 'TOKEN_AWARD_FAILED', 'Final PT status should be TOKEN_AWARD_FAILED');
      } finally {
        if (tempRecordTxStub && !tempRecordTxStub.restored) tempRecordTxStub.restore();
      }
    });

    it('mode: subscription - should handle DB Upsert Failure (UserSubscriptions) and return 400', async () => {
      const internalPaymentId = 'ptx_sub_us_upsert_fail';
      const userId = 'user_sub_us_upsert_fail';
      const stripeSubscriptionId = 'sub_us_upsert_fail_integ';
      const stripeCustomerId = 'cus_us_upsert_fail_integ';
      const planId = 'plan_sub_us_upsert_f_int';
      const internalItemId = 'item_id_sub_us_upsert_f';
      const tokensToAward = 888;
      const sessionId = 'cs_sub_us_upsert_fail';
      const priceId = 'price_for_sub_us_upsert_fail';
      const userSubUpsertError = new Error('Simulated DB upsert failure for user_subscriptions');

      let ptxUpdateCount = 0;
      let capturedPtxUpdate: unknown = null;
      let userSubUpsertCount = 0;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
              if (idFilter) {
                return { data: [{ id: internalPaymentId, user_id: userId, target_wallet_id: `wallet_for_${userId}`, status: 'PENDING', tokens_to_award: tokensToAward, metadata_json: { item_id: internalItemId, plan_id: planId } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async (state: MockQueryBuilderState) => {
              ptxUpdateCount++;
              capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
              return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            upsert: async (_state: MockQueryBuilderState) => {
              userSubUpsertCount++;
              return { data: null, error: userSubUpsertError, count: 0, status: 500, statusText: 'Internal Server Error' };
            },
          },
          subscription_plans: {
            select: async (state: MockQueryBuilderState) => {
              const itemFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.value === internalItemId);
              if (itemFilter) {
                return { data: [{ id: planId, item_id_internal: internalItemId, tokens_to_award: tokensToAward, stripe_price_id: priceId }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubSubscriptionRetrieve(async () => {
        const sub = createMockSubscription({
          id: stripeSubscriptionId,
          customer: stripeCustomerId,
          metadata: { plan_id: planId },
          items: { data: [{ price: { id: priceId } } as Stripe.SubscriptionItem] } as Stripe.Subscription['items'],
        });
        return { ...sub, lastResponse: { headers: {}, requestId: 'req_mock_sub_us_upsert_f', statusCode: 200 } } as unknown as Stripe.Response<Stripe.Subscription>;
      });

      const mockEvent = createMockCheckoutSessionCompletedEvent({
        id: sessionId,
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: userId,
        metadata: { internal_payment_id: internalPaymentId, plan_id: planId, item_id: internalItemId },
        subscription: stripeSubscriptionId,
        customer: stripeCustomerId,
      });
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_sub_us_upsert_fail'), dependencies);
      const responseBody: PaymentConfirmation = await response.json();

      assertEquals(response.status, 400, 'Response status should be 400 for user_subscriptions upsert failure');
      assertExists(responseBody.error);
      assertEquals(responseBody.error, `Failed to upsert user_subscription for ${stripeSubscriptionId}: Simulated DB upsert failure for user_subscriptions`);
      assertEquals(userSubUpsertCount, 1, 'user_subscriptions upsert should have been attempted once');
      assertExists(capturedPtxUpdate);
      assertEquals(readStringField(capturedPtxUpdate, 'status'), 'COMPLETED', 'PT status should be COMPLETED');
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0, 'Tokens should NOT be awarded');
    });

    it('mode: subscription - should handle DB Update Failure (PaymentTransaction - Initial to COMPLETED) and return 500', async () => {
      const internalPaymentId = 'ptx_sub_pt_upd_fail_init';
      const userId = 'user_sub_pt_upd_fail_init';
      const stripeSubscriptionId = 'sub_pt_upd_fail_init_integ';
      const stripeCustomerId = 'cus_pt_upd_fail_init_integ';
      const planId = 'plan_sub_pt_upd_f_init_int';
      const internalItemId = 'item_id_sub_pt_upd_f_init';
      const tokensToAward = 999;
      const sessionId = 'cs_sub_pt_upd_fail_init';
      const priceId = 'price_sub_pt_upd_f_init';
      const ptUpdateError = new Error('Simulated DB update failure for PT to COMPLETED (subscription)');

      let ptxUpdateCount = 0;
      let userSubUpsertCount = 0;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
              if (idFilter) {
                return { data: [{ id: internalPaymentId, user_id: userId, target_wallet_id: `wallet_for_${userId}`, status: 'PENDING', tokens_to_award: tokensToAward, metadata_json: { item_id: internalItemId, plan_id: planId } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async (_state: MockQueryBuilderState) => {
              ptxUpdateCount++;
              return { data: null, error: ptUpdateError, count: 0, status: 500, statusText: 'Internal Server Error' };
            },
          },
          user_subscriptions: {
            upsert: async (_state: MockQueryBuilderState) => {
              userSubUpsertCount++;
              return { data: [], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          subscription_plans: {
            select: async (state: MockQueryBuilderState) => {
              const itemFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.value === internalItemId);
              if (itemFilter) {
                return { data: [{ id: planId, item_id_internal: internalItemId, tokens_to_award: tokensToAward, stripe_price_id: priceId }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubSubscriptionRetrieve(async () => {
        const sub = createMockSubscription({
          id: stripeSubscriptionId,
          customer: stripeCustomerId,
          metadata: { plan_id: planId },
          items: { data: [{ price: { id: priceId } } as Stripe.SubscriptionItem] } as Stripe.Subscription['items'],
        });
        return { ...sub, lastResponse: { headers: {}, requestId: 'req_mock_sub_pt_upd_f', statusCode: 200 } } as unknown as Stripe.Response<Stripe.Subscription>;
      });

      const mockEvent = createMockCheckoutSessionCompletedEvent({
        id: sessionId,
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: userId,
        metadata: { internal_payment_id: internalPaymentId, plan_id: planId, item_id: internalItemId },
        subscription: stripeSubscriptionId,
        customer: stripeCustomerId,
      });
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_sub_pt_upd_fail_init'), dependencies);
      const responseBody: PaymentConfirmation = await response.json();

      assertEquals(response.status, 500, 'Response status should be 500 for PT update to COMPLETED failure');
      assertExists(responseBody.error);
      assertEquals(responseBody.error, `Critical: Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`);
      assertEquals(responseBody.transactionId, internalPaymentId);
      assertEquals(userSubUpsertCount, 1, 'user_subscriptions upsert should have occurred');
      assert(ptxUpdateCount >= 1, 'PT update to COMPLETED should be attempted');
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0, 'Tokens should NOT be awarded');
    });

    it('mode: subscription - should handle Missing Subscription Plan and return 400', async () => {
      const internalPaymentId = 'ptx_sub_missing_plan';
      const userId = 'user_sub_missing_plan';
      const stripeSubscriptionId = 'sub_missing_plan_integ';
      const internalItemId = 'item_id_sub_missing_plan_NONEXISTENT';
      const tokensToAward = 123;
      const sessionId = 'cs_sub_missing_plan';

      let ptxUpdateCount = 0;
      let capturedPtxUpdate: unknown = null;
      let userSubUpsertCount = 0;

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const idFilter = state.filters.find(f => f.column === 'id' && f.value === internalPaymentId);
              if (idFilter) {
                return { data: [{ id: internalPaymentId, user_id: userId, status: 'PENDING', tokens_to_award: tokensToAward, target_wallet_id: `wallet_for_${userId}`, metadata_json: { item_id: internalItemId } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async (state: MockQueryBuilderState) => {
              ptxUpdateCount++;
              capturedPtxUpdate = { ...state.updateData, id: state.filters.find(f => f.column === 'id')?.value };
              return { data: [{ id: internalPaymentId, ...state.updateData }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            upsert: async (_state: MockQueryBuilderState) => {
              userSubUpsertCount++;
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
          subscription_plans: {
            select: async (_state: MockQueryBuilderState) => {
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      stubSubscriptionRetrieve(async () => {
        const sub = createMockSubscription({
          id: stripeSubscriptionId,
          customer: 'cus_sub_missing_plan_integ',
          metadata: {},
          items: { data: [{ price: { id: 'price_sub_missing_plan' } } as Stripe.SubscriptionItem] } as Stripe.Subscription['items'],
        });
        return { ...sub, lastResponse: { headers: {}, requestId: 'req_mock_sub_missing_plan', statusCode: 200 } } as unknown as Stripe.Response<Stripe.Subscription>;
      });

      const mockEvent = createMockCheckoutSessionCompletedEvent({
        id: sessionId,
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: userId,
        metadata: { internal_payment_id: internalPaymentId, item_id: internalItemId },
        subscription: stripeSubscriptionId,
        customer: 'cus_sub_missing_plan_integ',
      });
      stubConstructEventAsync(mockEvent);

      const response = await handleWebhookRequestLogic(makeWebhookRequest('sig_sub_missing_plan'), dependencies);
      const responseBody: PaymentConfirmation = await response.json();

      assertEquals(response.status, 400, 'Response status should be 400 for missing subscription plan');
      assertExists(responseBody.error);
      assertEquals(responseBody.error, `Could not find internal subscription plan ID for item_id: ${internalItemId}.`);
      assertEquals(responseBody.transactionId, internalPaymentId);
      assertExists(capturedPtxUpdate);
      assertEquals(readStringField(capturedPtxUpdate, 'status'), 'FAILED', 'PT status should be FAILED');
      assertEquals(userSubUpsertCount, 0, 'user_subscriptions upsert should NOT have occurred');
      assertEquals(mockTokenWalletServiceInstance.stubs.recordTransaction.calls.length, 0, 'Tokens should NOT be awarded');
    });

  }); // end Stripe Event Processing with Real StripePaymentAdapter

}); // end Webhook Router
