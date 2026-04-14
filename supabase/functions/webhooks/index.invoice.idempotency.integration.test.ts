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
  createMockInvoicePaymentSucceededEvent,
  createMockInvoiceLineItem,
} from '../_shared/stripe.mock.ts';
import { createMockAdminTokenWalletService, MockAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import Stripe from 'npm:stripe';

import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { Database } from '../types_db.ts';
import type { PaymentAdapterFactoryFn } from './index.ts';

const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret_idem';

const originalDenoEnvGet = Deno.env.get;
let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
let mockEnvVarsForFileScope: Record<string, string | undefined> = {};

beforeAll(() => {
  if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
    try { fileScopeDenoEnvGetStub.restore(); } catch (e) { console.warn('Stray fileScopeDenoEnvGetStub restore failed in beforeAll:', e); }
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

function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'string' ? field : undefined;
}

describe('Stripe Invoice Event Idempotency with Real StripePaymentAdapter', () => {
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
      if (source === 'stripe') return realStripePaymentAdapter;
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

  describe('invoice.payment_succeeded idempotency', () => {
    it('should process the same event twice, award tokens once, update PT and US once', async () => {
      const stripeSubscriptionId = 'sub_idem_inv_ps_1';
      const stripeCustomerId = 'cus_idem_inv_ps_1';
      const userId = 'user_idem_inv_ps_1';
      const tokensToAward = 4242;
      const invoiceId = 'in_idem_inv_ps_1';
      const idemWalletId = `wallet_for_${userId}`;
      const paymentTxnId = 'ptxn_idem_inv_ps_1';

      let insertCount = 0;
      let capturedInsert: object | null = null;
      let updateCount = 0;
      let capturedUpdate: object | null = null;
      let completedPtData: Record<string, unknown>[] = [];

      setupAdapterWithConfig({
        genericMockResults: {
          payment_transactions: {
            select: async (state: MockQueryBuilderState) => {
              const gwFilter = state.filters.find(f => f.column === 'gateway_transaction_id' && f.value === invoiceId);
              const statusFilter = state.filters.find(f => f.column === 'status' && f.value === 'COMPLETED');
              if (gwFilter && statusFilter) {
                return { data: completedPtData.slice(), error: null, count: completedPtData.length, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            insert: async (state: MockQueryBuilderState) => {
              insertCount++;
              const rawInsert = state.insertData;
              if (rawInsert === null || Array.isArray(rawInsert)) {
                return { data: [], error: new Error('Mock: unexpected insertData shape'), count: 0, status: 500, statusText: 'Error' };
              }
              capturedInsert = rawInsert;
              return { data: [{ id: paymentTxnId }], error: null, count: 1, status: 201, statusText: 'Created' };
            },
            update: async (state: MockQueryBuilderState) => {
              updateCount++;
              capturedUpdate = state.updateData;
              return { data: [{ id: paymentTxnId }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          user_subscriptions: {
            select: async (_state: MockQueryBuilderState) => {
              return { data: [{ user_id: userId, stripe_subscription_id: stripeSubscriptionId, status: 'active' }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
            update: async (_state: MockQueryBuilderState) => {
              return { data: [{ stripe_subscription_id: stripeSubscriptionId }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          token_wallets: {
            select: async (_state: MockQueryBuilderState) => {
              return { data: [{ wallet_id: idemWalletId, user_id: userId }], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
        },
      });

      const mockEvent = createMockInvoicePaymentSucceededEvent({
        id: invoiceId,
        customer: stripeCustomerId,
        metadata: { tokens_to_award: tokensToAward.toString() },
        lines: {
          object: 'list',
          data: [createMockInvoiceLineItem({ subscription: stripeSubscriptionId })],
          has_more: false,
          url: `/v1/invoices/${invoiceId}/lines`,
        },
      }, { id: `evt_idem_inv_ps_${invoiceId}` });
      stubConstructEventAsync(mockEvent);

      const requestDetails = {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_idem_inv_ps_1' },
      };

      // --- First Call ---
      const response1 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
      const responseBody1: PaymentConfirmation = await response1.json();

      assertEquals(response1.status, 200, 'First call: status should be 200');
      assertExists(responseBody1.transactionId, 'First call: transactionId should exist');
      assertEquals(responseBody1.transactionId, paymentTxnId, 'First call: transactionId should match inserted PT id');
      assertEquals(insertCount, 1, 'First call: PT insert count');
      assertExists(capturedInsert, 'First call: capturedInsert should exist');
      assertEquals(readStringField(capturedInsert, 'gateway_transaction_id'), invoiceId, 'First call: gateway_transaction_id');
      assertEquals(readStringField(capturedInsert, 'user_id'), userId, 'First call: user_id');
      assertEquals(readStringField(capturedInsert, 'status'), 'PROCESSING_RENEWAL', 'First call: initial PT status');
      assertEquals(updateCount, 1, 'First call: PT update count');
      assertEquals(readStringField(capturedUpdate, 'status'), 'COMPLETED', 'First call: PT final status');

      const recordTxSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
      assertEquals(recordTxSpy.calls.length, 1, 'First call: recordTransaction call count');
      const txArgs = recordTxSpy.calls[0].args[0];
      assertEquals(txArgs.walletId, idemWalletId, 'First call: walletId');
      assertEquals(txArgs.type, 'CREDIT_PURCHASE', 'First call: type');
      assertEquals(txArgs.amount, tokensToAward.toString(), 'First call: amount');
      assertEquals(txArgs.relatedEntityId, paymentTxnId, 'First call: relatedEntityId');

      // --- Setup for Second Call ---
      completedPtData = [{ id: paymentTxnId, status: 'COMPLETED', tokens_to_award: tokensToAward }];
      const insertCountBeforeSecond = insertCount;
      const updateCountBeforeSecond = updateCount;

      // --- Second Call (Same Event) ---
      const response2 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
      const responseBody2: PaymentConfirmation = await response2.json();

      assertEquals(response2.status, 200, 'Second call: status should be 200 (idempotency)');
      assertEquals(responseBody2.transactionId, paymentTxnId, 'Second call: transactionId should match first call');
      assertEquals(responseBody2.message, 'Webhook processed', 'Second call: message for already processed event');
      assertEquals(insertCount, insertCountBeforeSecond, 'Second call: PT insert should not increase');
      assertEquals(updateCount, updateCountBeforeSecond, 'Second call: PT update should not increase');
      assertEquals(recordTxSpy.calls.length, 1, 'Second call: recordTransaction should not be called again');
    });
  });
});
