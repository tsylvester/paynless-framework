import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { TokenWalletTransaction } from '../../../types/tokenWallet.types.ts';
import type { IAdminTokenWalletService } from '../../../services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import { MockAdminTokenWalletService, createMockAdminTokenWalletService } from '../../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import { Database } from "../../../../types_db.ts";
import Stripe from 'npm:stripe';
import type { PaymentConfirmation } from '../../../types/payment.types.ts';
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
  type Stub,
  type Spy,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, HandlerContext, createMockCheckoutSessionCompletedEvent } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseClientSetup, MockSupabaseDataConfig, MockQueryBuilderState } from '../../../supabase.mock.ts';
import { handleCheckoutSessionCompleted } from "./stripe.checkoutSessionCompleted.ts";
import type { PaymentTransaction, UpdatePaymentTransactionFn } from "../../../types.ts";
import { MockLogger } from '../../../logger.mock.ts';

const mockLogger = new MockLogger();

Deno.test('StripePaymentAdapter: handleWebhook', async (t) => {
  let mockStripe: MockStripe;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let adapter: StripePaymentAdapter;

  const MOCK_SITE_URL = 'http://localhost:3000';
  const MOCK_WEBHOOK_SECRET = 'whsec_test_valid_secret';
  const MOCK_USER_ID = 'usr_webhook_test_user';
  const MOCK_WALLET_ID = 'wlt_webhook_test_wallet';
  const MOCK_PAYMENT_TRANSACTION_ID = 'ptxn_webhook_test_123';
  const MOCK_STRIPE_CHECKOUT_SESSION_ID = 'cs_test_webhook_session_abc123';
  const MOCK_STRIPE_PAYMENT_INTENT_ID = 'pi_test_webhook_payment_intent_def456';
  const tokens_to_award = 500;

  const setupMocksAndAdapterForWebhook = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    Deno.env.set('SITE_URL', MOCK_SITE_URL);
    Deno.env.set('STRIPE_WEBHOOK_SECRET', MOCK_WEBHOOK_SECRET);
    mockStripe = createMockStripe();
    mockSupabaseSetup = createMockSupabaseClient(undefined, supabaseConfig);
    mockTokenWalletService = createMockAdminTokenWalletService();

    adapter = new StripePaymentAdapter(
      mockStripe.instance,
      mockSupabaseSetup.client as unknown as SupabaseClient,
      mockTokenWalletService.instance,
      MOCK_WEBHOOK_SECRET
    );
  };

  const teardownWebhookMocks = () => {
    Deno.env.delete('SITE_URL');
    Deno.env.delete('STRIPE_WEBHOOK_SECRET');
    mockStripe.clearStubs();
    mockTokenWalletService.clearStubs();
  };

  await t.step('handleWebhook - checkout.session.completed - one-time purchase', async () => {
    const internalPaymentId = 'ptxn_webhook_otp_completed_123';
    const stripeSessionId = 'cs_webhook_otp_completed_456';
    const userId = 'user-webhook-otp';
    const walletId = 'wallet-for-user-webhook-otp';
    const tokensToAward = 100;

    // 1. Mock Stripe Event Data
    const mockStripeSession: Partial<Stripe.Checkout.Session> = {
      id: stripeSessionId,
      object: 'checkout.session',
      status: 'complete', 
      payment_status: 'paid', 
      client_reference_id: userId,
      mode: 'payment',
      metadata: {
        internal_payment_id: internalPaymentId,
        user_id: userId,
      },
    };

    const mockStripeEvent = createMockCheckoutSessionCompletedEvent(mockStripeSession, { id: 'evt_webhook_otp_completed_789' });

    // 2. Mock payment_transactions table data (initial state)
    const initialPaymentTxnData = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: 'PENDING', // Initial status
      gateway_transaction_id: null, // Not yet set
      item_id: 'item-otp-webhook',
      // ... other fields
    };

    // 3. Setup Mocks
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentId)) {
              return { data: [initialPaymentTxnData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Payment txn not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        'token_wallets': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'wallet_id' && f.value === walletId)) {
              return { data: [{ user_id: userId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' }, count: 0, status: 406, statusText: 'OK' };
          },
        },
      },
      rpcResults: {
        complete_checkout_payment: {
          data: [{ status: 'COMPLETED_WITH_TOKEN_AWARD', tier_level: 1, token_transaction_id: 'ttx_webhook_otp' }],
          error: null,
        },
        create_notification_for_user: {
          data: null,
          error: null,
        },
      },
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    // Mock stripe.webhooks.constructEventAsync
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEventAsync", () => Promise.resolve(mockStripeEvent));

    // 4. Call handleWebhook
    const rawBodyString = JSON.stringify(mockStripeEvent);
    const dummySignature = 'whsec_test_signature';
    const encoded = new TextEncoder().encode(rawBodyString);
    const rawBodyArrayBuffer = new ArrayBuffer(encoded.length);
    new Uint8Array(rawBodyArrayBuffer).set(encoded);

    const result = await adapter.handleWebhook(rawBodyArrayBuffer, dummySignature);

    // 5. Assertions
    assert(result.success, `Webhook handling should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, internalPaymentId, 'Incorrect internal transactionId in result');
    assertEquals(result.tokensAwarded, tokensToAward, 'Incorrect tokensAwarded in result');

    // Check that constructEvent was called
    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);

    assert(mockSupabaseSetup.spies.fromSpy.calls.some(call => call.args[0] === 'payment_transactions'), "from('payment_transactions') should have been called.");

    const historicPaymentTxBuildersOtp = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assert(historicPaymentTxBuildersOtp && historicPaymentTxBuildersOtp.length > 0, "No historic query builders found for payment_transactions (OTP)");

    const totalSelectCallsOtp = historicPaymentTxBuildersOtp.reduce((sum, builder) => {
      return sum + (builder.methodSpies.select?.calls?.length || 0);
    }, 0);
    assertEquals(totalSelectCallsOtp, 1, "select should have been called once on payment_transactions (OTP)");

    const totalUpdateCallsOtp = historicPaymentTxBuildersOtp.reduce((sum, builder) => {
      return sum + (builder.methodSpies.update?.calls?.length || 0);
    }, 0);
    assertEquals(totalUpdateCallsOtp, 0, "update should not be called on payment_transactions (OTP)");

    assert(mockSupabaseSetup.spies.rpcSpy.calls.some((c) => c.args[0] === 'complete_checkout_payment'), 'complete_checkout_payment RPC should have been called');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - checkout.session.completed - subscription', async () => {
    // Similar structure to the OTP test, but with subscription-specific data if necessary
    const internalPaymentId = 'ptxn_webhook_sub_completed_789'; // New ID for clarity
    const stripeSessionId = 'cs_webhook_sub_completed_session_abc';
    const userId = 'user_webhook_sub_test';
    const walletId = 'wlt_webhook_sub_test_wallet';
    const tokensToAward = 1500;
    const itemIdInternal = 'item_sub_premium_webhook'; // Will be in session metadata
    const stripeSubscriptionId = 'sub_webhook_test_premium_123';
    const stripeCustomerId = 'cus_webhook_test_customer_456';
    const internalPlanId = 'plan_internal_premium_789'; // From subscription_plans table

    const mockStripeSubscriptionObject: Partial<Stripe.Subscription> = {
      id: stripeSubscriptionId,
      status: 'active',
      customer: stripeCustomerId,
      items: {
        object: 'list',
        data: [
          {
            id: 'si_mock_item',
            object: 'subscription_item',
            billing_thresholds: null,
            created: Math.floor(Date.now() / 1000),
            metadata: {},
            plan: { id: 'plan_mock' } as Stripe.Plan,
            price: { id: 'price_mock' } as Stripe.Price,
            quantity: 1,
            subscription: stripeSubscriptionId,
            tax_rates: [],
            discounts: [],
            current_period_start: Math.floor(Date.now() / 1000) - 3600,
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
          } as unknown as Stripe.SubscriptionItem,
        ],
        has_more: false,
        url: `/v1/subscriptions/${stripeSubscriptionId}/items`,
      },
      cancel_at_period_end: false,
    };

    // 1. Mock Stripe Event Data
    const mockStripeSession: Partial<Stripe.Checkout.Session> = {
      id: stripeSessionId,
      object: 'checkout.session',
      status: 'complete', 
      payment_status: 'paid', 
      client_reference_id: userId,
      mode: 'subscription', // Key for this test
      subscription: stripeSubscriptionId, // Stripe Subscription ID
      customer: stripeCustomerId,       // Stripe Customer ID
      metadata: {
        internal_payment_id: internalPaymentId,
        user_id: userId,
        item_id: itemIdInternal, // Used to lookup internal plan_id
      },
    };

    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_sub_completed_xyz', // New event ID
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27', 
      created: Math.floor(Date.now() / 1000),
      data: {
        object: mockStripeSession as Stripe.Checkout.Session, 
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_sub_test', idempotency_key: null },
    };

    // 2. Mock payment_transactions table data (initial state)
    const initialPaymentTxnData = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: 'PENDING', 
      gateway_transaction_id: null,
      // metadata_json: { itemId: itemIdInternal }, // Alternative to session.metadata.item_id
      // item_id is not a direct column on payment_transactions, usually in metadata if stored there
    };

    // 3. Setup Mocks
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentId)) {
              return { data: [initialPaymentTxnData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Payment txn not found for subscription test'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === itemIdInternal)) {
              return { data: [{ id: internalPlanId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error(`Mock: Subscription plan not found for stripe_price_id ${itemIdInternal}`), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        'token_wallets': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'wallet_id' && f.value === walletId)) {
              return { data: [{ user_id: userId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' }, count: 0, status: 406, statusText: 'OK' };
          },
        },
      },
      rpcResults: {
        complete_checkout_payment: {
          data: [{ status: 'COMPLETED_WITH_TOKEN_AWARD', tier_level: 2, token_transaction_id: 'ttx_webhook_sub' }],
          error: null,
        },
        create_notification_for_user: {
          data: null,
          error: null,
        },
      },
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    // Mock stripe.webhooks.constructEventAsync
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEventAsync", () => Promise.resolve(mockStripeEvent));

    // Ensure subscriptionsRetrieve stub is available on mockStripe.stubs
    if (mockStripe.stubs.subscriptionsRetrieve && typeof mockStripe.stubs.subscriptionsRetrieve.restore === 'function') {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", 
      async (id: string): Promise<Stripe.Response<Stripe.Subscription>> => { // Original simpler signature for this specific test case's needs
        assertEquals(id, stripeSubscriptionId, "Stripe subscriptions.retrieve called with wrong ID");
        return Promise.resolve({
          ...mockStripeSubscriptionObject, 
          lastResponse: { headers: {}, requestId: 'req_mock_sub_retrieve', statusCode: 200, apiVersion: undefined, idempotencyKey: undefined, stripeAccount: undefined } 
        } as Stripe.Response<Stripe.Subscription>);
      }
    );

    // 4. Call handleWebhook
    const rawBodyString = JSON.stringify(mockStripeEvent);
    const dummySignature = 'whsec_test_subscription_signature';
    const encodedSub = new TextEncoder().encode(rawBodyString);
    const rawBodyArrayBuffer = new ArrayBuffer(encodedSub.length);
    new Uint8Array(rawBodyArrayBuffer).set(encodedSub);

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBodyArrayBuffer, dummySignature);

    // 5. Assertions
    assert(result.success, `Subscription Webhook handling should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, internalPaymentId, 'Incorrect internal transactionId in subscription result');
    assertEquals(result.tokensAwarded, tokensToAward, 'Incorrect tokensAwarded in subscription result');

    // Check that constructEvent was called
    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);
    
    // Check Stripe SDK calls
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1);
    
    // Check DB calls by iterating over historic builders
    const historicPaymentTxBuildersSub = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assert(historicPaymentTxBuildersSub && historicPaymentTxBuildersSub.length > 0, "No historic query builders found for payment_transactions (Sub)");

    const totalSelectCallsSub = historicPaymentTxBuildersSub.reduce((sum, builder) => {
      return sum + (builder.methodSpies.select?.calls?.length || 0);
    }, 0);
    assertEquals(totalSelectCallsSub, 1, "select should have been called once on payment_transactions (Sub)");

    const totalUpdateCallsSub = historicPaymentTxBuildersSub.reduce((sum, builder) => {
      return sum + (builder.methodSpies.update?.calls?.length || 0);
    }, 0);
    assertEquals(totalUpdateCallsSub, 0, "update should not be called on payment_transactions (Sub)");

    assert(mockSupabaseSetup.spies.rpcSpy.calls.some((c) => c.args[0] === 'complete_checkout_payment'), 'complete_checkout_payment RPC should have been called (Sub)');

    const subPlansSelectSpies = mockSupabaseSetup.client.getHistoricBuildersForTable('subscription_plans');
    assert(subPlansSelectSpies && subPlansSelectSpies.length > 0, "Historic select spies info should exist for subscription_plans (Sub)");
    const totalSubPlansSelectCalls = subPlansSelectSpies.reduce((sum, builder) => {
      return sum + (builder.methodSpies.select?.calls?.length || 0);
    }, 0);
    assertEquals(totalSubPlansSelectCalls, 1, "select on subscription_plans should have been called once (Sub)");

    const subPlansBuilderInstance = subPlansSelectSpies[0];
    assert(subPlansBuilderInstance?.methodSpies.eq?.calls?.length, "Eq spy not found or not called on subscription_plans builder");
    assertEquals(subPlansBuilderInstance.methodSpies.eq.calls[0].args, ['stripe_price_id', itemIdInternal], "eq on subscription_plans called with wrong stripe_price_id");

    teardownWebhookMocks();
  });

});

Deno.test("[stripe.checkoutSessionCompleted.ts] Tests", async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let mockUpdatePaymentTransaction = spy(
    (_id: string, _updates: Parameters<UpdatePaymentTransactionFn>[1], _eventId?: string): ReturnType<UpdatePaymentTransactionFn> =>
      Promise.resolve(null)
  );
  let mockStripe: MockStripe;
  let handlerContext: HandlerContext;

  let subscriptionsRetrieveStub: Stub<Stripe.SubscriptionsResource, [id: string, options?: Stripe.RequestOptions], Promise<Stripe.Response<Stripe.Subscription>>>;
  let recordTokenTransactionStub: Stub<IAdminTokenWalletService, Parameters<IAdminTokenWalletService['recordTransaction']>, ReturnType<IAdminTokenWalletService['recordTransaction']>>;

  const setup = (dbQueryResults?: { 
    paymentTransaction?: Partial<PaymentTransaction> | null;
    subscriptionPlans?: { id: string; item_id_internal?: string; }[] | null;
    userSubscriptionUpsertError?: Error | null;
    stripeSubscriptionRetrieveResult?: Partial<Stripe.Subscription> | Error | null;
    tokenWalletRecordTransactionResult?: TokenWalletTransaction | Error;
    rpcResults?: MockSupabaseDataConfig['rpcResults'];
    notifyTokenWallet?: { walletId: string; userId: string };
  }) => {
    mockTokenWalletService = createMockAdminTokenWalletService();
    mockUpdatePaymentTransaction = spy(
      (_id: string, _updates: Parameters<UpdatePaymentTransactionFn>[1], _eventId?: string): ReturnType<UpdatePaymentTransactionFn> => {
        const base = dbQueryResults?.paymentTransaction;
        const result: PaymentTransaction = {
          id: base?.id ?? _id,
          amount_requested_crypto: base?.amount_requested_crypto ?? null,
          amount_requested_fiat: base?.amount_requested_fiat ?? null,
          created_at: base?.created_at ?? new Date().toISOString(),
          currency_requested_crypto: base?.currency_requested_crypto ?? null,
          currency_requested_fiat: base?.currency_requested_fiat ?? null,
          gateway_transaction_id: base?.gateway_transaction_id ?? null,
          metadata_json: base?.metadata_json ?? null,
          organization_id: base?.organization_id ?? null,
          payment_gateway_id: base?.payment_gateway_id ?? 'stripe',
          status: 'COMPLETED',
          target_wallet_id: base?.target_wallet_id ?? '',
          tokens_to_award: base?.tokens_to_award ?? 0,
          updated_at: new Date().toISOString(),
          user_id: base?.user_id ?? null,
        };
        return Promise.resolve(result);
      }
    );
    mockStripe = createMockStripe();
    
    const genericMockResults: MockSupabaseDataConfig['genericMockResults'] = {};
    if (dbQueryResults?.paymentTransaction !== undefined) {
      genericMockResults['payment_transactions'] = {
        select: async (state) => {
          if (dbQueryResults.paymentTransaction && state.filters.some(f => f.column === 'id' && f.value === dbQueryResults.paymentTransaction?.id)) {
            return { data: [dbQueryResults.paymentTransaction], error: null, count: 1, status: 200, statusText: 'OK' };
          } else if (dbQueryResults.paymentTransaction === null) {
            return { data: null, error: new Error('Mock Not found'), count: 0, status: 404, statusText: 'Not Found' };
          }
          return { data: [], error: new Error('Mock: Payment txn not found by general query'), count: 0, status: 404, statusText: 'Not Found' };
        }
      };
    }
    if (dbQueryResults?.subscriptionPlans !== undefined) {
      genericMockResults['subscription_plans'] = {
        select: async (state: MockQueryBuilderState) => {
          const stripePriceIdFilter = state.filters.find(f => f.column === 'stripe_price_id');
          if (dbQueryResults.subscriptionPlans && stripePriceIdFilter) {
            const filteredPlans = dbQueryResults.subscriptionPlans.filter(p => p.item_id_internal === stripePriceIdFilter.value);
            return { data: filteredPlans.length > 0 ? [filteredPlans[0]] : [], error: null, count: filteredPlans.length > 0 ? 1 : 0, status: 200, statusText: 'OK' };
          } else if (dbQueryResults.subscriptionPlans === null) {
             return { data: null, error: new Error('Mock Not found'), count: 0, status: 404, statusText: 'Not Found' };
          }
          return { data: [], error: new Error('Mock: Subscription plan not found (no matching stripe_price_id filter or no plans in mockData)'), count: 0, status: 404, statusText: 'Not Found' };
        }
      };
    }
    if (dbQueryResults?.userSubscriptionUpsertError !== undefined || dbQueryResults?.userSubscriptionUpsertError === null) {
        genericMockResults['user_subscriptions'] = {
            upsert: async (_state: MockQueryBuilderState) => {
                return { data: dbQueryResults.userSubscriptionUpsertError ? null : [{}], error: dbQueryResults.userSubscriptionUpsertError, count: dbQueryResults.userSubscriptionUpsertError ? 0 : 1, status: 200, statusText: 'OK' };
            }
        };
    }
    if (dbQueryResults?.notifyTokenWallet !== undefined) {
      const nw: { walletId: string; userId: string } = dbQueryResults.notifyTokenWallet;
      genericMockResults['token_wallets'] = {
        select: async (state: MockQueryBuilderState) => {
          if (state.filters.some(f => f.column === 'wallet_id' && f.value === nw.walletId)) {
            return { data: [{ user_id: nw.userId }], error: null, count: 1, status: 200, statusText: 'OK' };
          }
          return { data: null, error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' }, count: 0, status: 406, statusText: 'OK' };
        },
      };
    }

    mockSupabaseSetup = createMockSupabaseClient(undefined, {
      genericMockResults,
      rpcResults: dbQueryResults?.rpcResults,
    });
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    
    // Restore the default stub for subscriptions.retrieve created by createMockStripe()
    if (mockStripe.stubs.subscriptionsRetrieve?.restore) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
    }

    subscriptionsRetrieveStub = stub(
      mockStripe.instance.subscriptions,
      "retrieve",
      (id: string) => {
        const res = dbQueryResults?.stripeSubscriptionRetrieveResult;
        if (res instanceof Error) return Promise.reject(res);
        const partialSub = res || {};
        return Promise.resolve({
          ...partialSub,
          id,
          object: 'subscription',
          lastResponse: {
            headers: {},
            requestId: `req_mock_standalone_retrieve_${id}`,
            statusCode: 200,
            apiVersion: undefined,
            idempotencyKey: undefined,
            stripeAccount: undefined,
          },
        } as Stripe.Response<Stripe.Subscription>);
      }
    );

    // Restore the default stub for recordTransaction from mockTokenWalletService if it pre-stubs it.
    // Assuming createMockTokenWalletService() might also pre-stub its methods and store them in `stubs`.
    if (mockTokenWalletService.stubs?.recordTransaction?.restore) {
        mockTokenWalletService.stubs.recordTransaction.restore();
    }

    recordTokenTransactionStub = stub(mockTokenWalletService.instance, "recordTransaction",
      (params) => {
        const res = dbQueryResults?.tokenWalletRecordTransactionResult;
        if (res instanceof Error) return Promise.reject(res);
        const defaultTx: TokenWalletTransaction = {
          transactionId: 'mock_ttx_default',
          walletId: params.walletId,
          type: params.type,
          amount: params.amount,
          balanceAfterTxn: params.amount,
          recordedByUserId: params.recordedByUserId,
          idempotencyKey: params.idempotencyKey,
          timestamp: new Date(),
        };
        return Promise.resolve(res ?? defaultTx);
      }
    );
    
    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockLogger,
      tokenWalletService: mockTokenWalletService.instance,
      updatePaymentTransaction: mockUpdatePaymentTransaction,
      stripe: mockStripe.instance, 
      featureFlags: {},
      functionsUrl: "http://localhost:54321/functions/v1",
      stripeWebhookSecret: "whsec_test_secret",
    };
  };


  await t.step("handleCheckoutSessionCompleted - payment mode uses complete_checkout_payment RPC with null subscription fields", async () => {
    const internalPaymentId = "ptxn_rpc_payment_mode";
    const gatewayTxId = "cs_rpc_payment_mode";
    const userId = "user_rpc_payment_mode";
    const walletId = "wallet_rpc_payment_mode";
    const tokensToAward = 250;

    const mockPaymentTxData: Partial<PaymentTransaction> = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: "PENDING",
      payment_gateway_id: "stripe",
      metadata_json: { itemId: "item_rpc_payment_mode" },
    };

    setup({
      paymentTransaction: mockPaymentTxData,
      rpcResults: {
        complete_checkout_payment: {
          data: [{ status: "COMPLETED_WITH_TOKEN_AWARD", tier_level: 3, token_transaction_id: "ttx_rpc_payment_mode" }],
          error: null,
        },
      },
    });

    const event = createMockCheckoutSessionCompletedEvent({
      id: gatewayTxId,
      mode: "payment",
      metadata: { internal_payment_id: internalPaymentId },
      client_reference_id: userId,
    });

    await handleCheckoutSessionCompleted(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "complete_checkout_payment");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_user_id: userId,
      p_is_subscription_mode: false,
      p_payment_transaction_id: internalPaymentId,
      p_gateway_transaction_id: gatewayTxId,
      p_plan_id: null,
      p_subscription_status: null,
      p_stripe_customer_id: null,
      p_stripe_subscription_id: null,
      p_period_start: null,
      p_period_end: null,
      p_cancel_at_period_end: null,
      p_target_wallet_id: walletId,
      p_tokens_to_award: tokensToAward,
      p_token_idempotency_key: event.id,
      p_token_notes: `Tokens for Stripe Checkout Session ${gatewayTxId} (mode: payment)`,
    });
  });

  await t.step("handleCheckoutSessionCompleted - subscription mode uses complete_checkout_payment RPC with subscription fields", async () => {
    const internalPaymentId = "ptxn_rpc_subscription_mode";
    const gatewayTxId = "cs_rpc_subscription_mode";
    const userId = "user_rpc_subscription_mode";
    const walletId = "wallet_rpc_subscription_mode";
    const tokensToAward = 1200;
    const itemId = "item_rpc_subscription_mode";
    const internalPlanId = "plan_rpc_subscription_mode";
    const stripeSubscriptionId = "sub_rpc_subscription_mode";
    const stripeCustomerId = "cus_rpc_subscription_mode";
    const periodStart = Math.floor(Date.now() / 1000) - 1800;
    const periodEnd = Math.floor(Date.now() / 1000) + 2592000;

    const mockPaymentTxData: Partial<PaymentTransaction> = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: "PENDING",
      payment_gateway_id: "stripe",
      metadata_json: { itemId },
    };

    const mockStripeSub: Partial<Stripe.Subscription> = {
      id: stripeSubscriptionId,
      status: "active",
      customer: stripeCustomerId,
      cancel_at_period_end: false,
      items: {
        object: "list",
        data: [{
          id: "si_rpc_subscription_mode",
          object: "subscription_item",
          billing_thresholds: null,
          created: Math.floor(Date.now() / 1000),
          metadata: {},
          plan: { id: "plan_rpc_subscription_mode" } as Stripe.Plan,
          price: { id: "price_rpc_subscription_mode" } as Stripe.Price,
          quantity: 1,
          subscription: stripeSubscriptionId,
          tax_rates: [],
          discounts: [],
          current_period_start: periodStart,
          current_period_end: periodEnd,
        } as Stripe.SubscriptionItem],
        has_more: false,
        url: `/v1/subscriptions/${stripeSubscriptionId}/items`,
      },
    };

    setup({
      paymentTransaction: mockPaymentTxData,
      stripeSubscriptionRetrieveResult: mockStripeSub,
      subscriptionPlans: [{ id: internalPlanId, item_id_internal: itemId }],
      rpcResults: {
        complete_checkout_payment: {
          data: [{ status: "COMPLETED_WITH_TOKEN_AWARD", tier_level: 4, token_transaction_id: "ttx_rpc_subscription_mode" }],
          error: null,
        },
      },
    });

    const event = createMockCheckoutSessionCompletedEvent({
      id: gatewayTxId,
      mode: "subscription",
      subscription: stripeSubscriptionId,
      customer: stripeCustomerId,
      metadata: { internal_payment_id: internalPaymentId, item_id: itemId },
      client_reference_id: userId,
    });

    await handleCheckoutSessionCompleted(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "complete_checkout_payment");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_user_id: userId,
      p_is_subscription_mode: true,
      p_payment_transaction_id: internalPaymentId,
      p_gateway_transaction_id: gatewayTxId,
      p_plan_id: internalPlanId,
      p_subscription_status: "active",
      p_stripe_customer_id: stripeCustomerId,
      p_stripe_subscription_id: stripeSubscriptionId,
      p_period_start: new Date(periodStart * 1000).toISOString(),
      p_period_end: new Date(periodEnd * 1000).toISOString(),
      p_cancel_at_period_end: false,
      p_target_wallet_id: walletId,
      p_tokens_to_award: tokensToAward,
      p_token_idempotency_key: event.id,
      p_token_notes: `Tokens for Stripe Checkout Session ${gatewayTxId} (mode: subscription)`,
    });
  });

  await t.step("handleCheckoutSessionCompleted - early validation failure does not call complete_checkout_payment RPC", async () => {
    setup();

    const event = createMockCheckoutSessionCompletedEvent({
      id: "cs_rpc_validation_fail",
      mode: "payment",
      metadata: {},
    });

    const result = await handleCheckoutSessionCompleted(handlerContext, event);

    assert(!result.success, "Expected failure when internal_payment_id is missing");
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 0);
  });

  await t.step("handleCheckoutSessionCompleted - RPC error returns failure with RPC error message", async () => {
    const internalPaymentId = "ptxn_rpc_error";
    const gatewayTxId = "cs_rpc_error";
    const userId = "user_rpc_error";

    const mockPaymentTxData: Partial<PaymentTransaction> = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: "wallet_rpc_error",
      tokens_to_award: 100,
      status: "PENDING",
      payment_gateway_id: "stripe",
      metadata_json: { itemId: "item_rpc_error" },
    };

    setup({
      paymentTransaction: mockPaymentTxData,
      rpcResults: {
        complete_checkout_payment: {
          data: null,
          error: new Error("RPC complete_checkout_payment failed"),
        },
      },
    });

    const event = createMockCheckoutSessionCompletedEvent({
      id: gatewayTxId,
      mode: "payment",
      metadata: { internal_payment_id: internalPaymentId },
      client_reference_id: userId,
    });

    const result = await handleCheckoutSessionCompleted(handlerContext, event);

    assert(!result.success, "Expected failure when complete_checkout_payment RPC returns error");
    assert(result.error?.includes("RPC complete_checkout_payment failed"), `Expected RPC error message, got: ${result.error}`);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "complete_checkout_payment");
  });

  await t.step("handleCheckoutSessionCompleted - RPC success triggers wallet notification and returns tier_level and tokens_awarded", async () => {
    const internalPaymentId = "ptxn_rpc_notify";
    const gatewayTxId = "cs_rpc_notify";
    const userId = "user_rpc_notify";
    const walletId = "wallet_rpc_notify";
    const tokensToAward = 500;

    const mockPaymentTxData: Partial<PaymentTransaction> = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: "PENDING",
      payment_gateway_id: "stripe",
      metadata_json: { itemId: "item_rpc_notify" },
    };

    setup({
      paymentTransaction: mockPaymentTxData,
      notifyTokenWallet: { walletId, userId },
      rpcResults: {
        complete_checkout_payment: {
          data: [{ status: "COMPLETED_WITH_TOKEN_AWARD", tier_level: 5, token_transaction_id: "ttx_rpc_notify" }],
          error: null,
        },
        create_notification_for_user: {
          data: null,
          error: null,
        },
      },
    });

    const event = createMockCheckoutSessionCompletedEvent({
      id: gatewayTxId,
      mode: "payment",
      metadata: { internal_payment_id: internalPaymentId },
      client_reference_id: userId,
    });

    const result = await handleCheckoutSessionCompleted(handlerContext, event);

    assert(result.success, `Expected success from RPC completion, got error: ${result.error}`);
    assertEquals(result.tokensAwarded, tokensToAward);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls.some((call) => call.args[0] === "create_notification_for_user"), true);
  });

  await t.step("handleCheckoutSessionCompleted - zero tokens_to_award still calls complete_checkout_payment RPC", async () => {
    const internalPaymentId = "ptxn_rpc_zero_tokens";
    const gatewayTxId = "cs_rpc_zero_tokens";
    const userId = "user_rpc_zero_tokens";
    const walletId = "wallet_rpc_zero_tokens";

    const mockPaymentTxData: Partial<PaymentTransaction> = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: 0,
      status: "PENDING",
      payment_gateway_id: "stripe",
      metadata_json: { itemId: "item_rpc_zero_tokens" },
    };

    setup({
      paymentTransaction: mockPaymentTxData,
      rpcResults: {
        complete_checkout_payment: {
          data: [{ status: "COMPLETED_NO_TOKEN_AWARD", tier_level: 2, token_transaction_id: null }],
          error: null,
        },
      },
    });

    const event = createMockCheckoutSessionCompletedEvent({
      id: gatewayTxId,
      mode: "payment",
      metadata: { internal_payment_id: internalPaymentId },
      client_reference_id: userId,
    });

    await handleCheckoutSessionCompleted(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "complete_checkout_payment");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_user_id: userId,
      p_is_subscription_mode: false,
      p_payment_transaction_id: internalPaymentId,
      p_gateway_transaction_id: gatewayTxId,
      p_plan_id: null,
      p_subscription_status: null,
      p_stripe_customer_id: null,
      p_stripe_subscription_id: null,
      p_period_start: null,
      p_period_end: null,
      p_cancel_at_period_end: null,
      p_target_wallet_id: walletId,
      p_tokens_to_award: 0,
      p_token_idempotency_key: event.id,
      p_token_notes: `Tokens for Stripe Checkout Session ${gatewayTxId} (mode: payment)`,
    });
  });
});