import { MockAdminTokenWalletService } from '../../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
  type SpyCall,
} from 'jsr:@std/testing@0.225.1/mock';
import {
  createMockStripe,
  MockStripe,
  createMockInvoicePaymentSucceededEvent,
  createMockInvoiceLineItem,
  createMockSubscriptionResponse,
  createMockSubscriptionItem,
  createMockPrice,
} from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseClientSetup, MockSupabaseDataConfig, MockQueryBuilderState } from '../../../supabase.mock.ts';
import { createMockAdminTokenWalletService } from '../../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { Database, type Json } from '../../../../types_db.ts';
import type { UpdatePaymentTransactionFn } from '../../../types.ts';
import { handleInvoicePaymentSucceeded } from './stripe.invoicePaymentSucceeded.ts';
import { HandlerContext } from '../../../stripe.mock.ts';
import { MockLogger } from '../../../logger.mock.ts';

const noopUpdatePaymentTransaction: UpdatePaymentTransactionFn = async () => null;

Deno.test('[stripe.invoicePaymentSucceeded.ts] Tests - handleInvoicePaymentSucceeded', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let mockInvoiceLogger: MockLogger;
  let mockStripe: MockStripe;
  let handlerContext: HandlerContext;

  const setupInvoiceMocks = (dbConfig: MockSupabaseDataConfig = {}) => {
    mockInvoiceLogger = new MockLogger();
    mockTokenWalletService = createMockAdminTokenWalletService();
    mockStripe = createMockStripe();
    mockSupabaseSetup = createMockSupabaseClient(undefined, dbConfig);
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;

    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockInvoiceLogger,
      tokenWalletService: mockTokenWalletService.instance,
      stripe: mockStripe.instance,
      updatePaymentTransaction: noopUpdatePaymentTransaction,
      featureFlags: {},
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test_secret_invoice_succeeded',
    };
  };

  const teardownInvoiceMocks = () => {
    if (mockStripe && typeof mockStripe.clearStubs === 'function') {
      mockStripe.clearStubs();
    }
    if (mockTokenWalletService && typeof mockTokenWalletService.clearStubs === 'function') {
      mockTokenWalletService.clearStubs();
    }
  };

  await t.step('Subscription Renewal — complete_invoice_payment RPC with renewal payload', async () => {
    const invoiceId = 'in_renewal_happy';
    const customerId = 'cus_renewal_happy';
    const subscriptionId = 'sub_renewal_happy';
    const userId = 'user_renewal_happy_path';
    const walletId = 'wallet_renewal_happy';
    const paymentTxnId = 'ptxn_renewal_happy_123';
    const tokensToAward = 1000;
    const planStripeId = 'price_renewal_plan_stripe_id';
    const stripeEventId = 'evt_renewal_happy';
    const paymentIntentIdValue = 'pi_renewal_happy';
    const periodStartSec = 1700000000;
    const periodEndSec = 1702592000;

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: invoiceId,
        customer: customerId,
        total: 1000,
        currency: 'usd',
        billing_reason: 'subscription_cycle',
        confirmation_secret: {
          client_secret: `${paymentIntentIdValue}_secret_mock`,
          type: 'payment_intent',
        },
        lines: {
          object: 'list',
          data: [
            createMockInvoiceLineItem({
              subscription: subscriptionId,
              period: { start: periodStartSec, end: periodEndSec },
            }),
          ],
          has_more: false,
          url: `/v1/invoices/${invoiceId}/lines`,
        },
      },
      { id: stripeEventId },
    );

    const periodStartIso = new Date(periodStartSec * 1000).toISOString();
    const periodEndIso = new Date(periodEndSec * 1000).toISOString();

    const expectedMetadata: Json = {
      stripe_event_id: stripeEventId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      checkout_session_id: "",
      billing_reason: 'subscription_cycle',
      payment_intent_id: paymentIntentIdValue,
    };

    const expectedNotes = JSON.stringify({
      reason: expectedMetadata.billing_reason,
      invoice_id: invoiceId,
      stripe_event_id: stripeEventId,
      item_id_internal: 'item_renewal_happy',
    });

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state: MockQueryBuilderState) => {
            if (
              state.filters.some((f) => f.column === 'gateway_transaction_id' && f.value === invoiceId) &&
              state.filters.some((f) => f.column === 'status' && f.value === 'COMPLETED')
            ) {
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
        },
        user_subscriptions: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_customer_id' && f.value === customerId)) {
              return { data: [{ user_id: userId, stripe_subscription_id: subscriptionId, status: 'active' }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: User subscription not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        token_wallets: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'user_id' && f.value === userId)) {
              return { data: [{ wallet_id: walletId, user_id: userId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Token wallet not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        subscription_plans: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_price_id' && f.value === planStripeId)) {
              return {
                data: [{
                  stripe_price_id: planStripeId,
                  tokens_to_award: tokensToAward,
                  plan_type: 'subscription',
                  item_id_internal: 'item_renewal_happy',
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
              };
            }
            return { data: [], error: new Error(`Mock: Plan not found for stripe_price_id ${planStripeId}`), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
      },
      rpcResults: {
        complete_invoice_payment: {
          data: [{
            payment_transaction_id: paymentTxnId,
            tier_level: 2,
            token_transaction_id: 'tok_txn_renewal_happy_789',
          }],
          error: null,
        },
      },
    };

    setupInvoiceMocks(dbConfig);

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(
      mockStripe.instance.subscriptions,
      'retrieve',
      () =>
        Promise.resolve(
          createMockSubscriptionResponse({
            id: subscriptionId,
            customer: customerId,
            items: {
              object: 'list',
              data: [
                createMockSubscriptionItem({
                  subscription: subscriptionId,
                  price: createMockPrice({ id: planStripeId, product: 'prod_renewal_plan' }),
                }),
              ],
              has_more: false,
              url: `/v1/subscription_items?subscription=${subscriptionId}`,
            },
          }),
        ),
    );

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed. Error: ${result.error}`);
    assertEquals(result.transactionId, paymentTxnId);
    assertEquals(result.tokensAwarded, tokensToAward);

    assertExists(mockSupabaseSetup.spies.rpcSpy);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'complete_invoice_payment');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_user_id: userId,
      p_target_wallet_id: walletId,
      p_gateway_transaction_id: invoiceId,
      p_tokens_to_award: tokensToAward,
      p_amount_fiat: 1000,
      p_currency: 'usd',
      p_metadata: expectedMetadata,
      p_token_idempotency_key: stripeEventId,
      p_token_notes: expectedNotes,
      p_stripe_subscription_id: subscriptionId,
      p_period_start: periodStartIso,
      p_period_end: periodEndIso,
    });

    teardownInvoiceMocks();
  });

  await t.step('Idempotency — COMPLETED transaction already recorded; complete_invoice_payment RPC not called', async () => {
    const mockUserId = 'user_idempotent_completed';
    const mockStripeCustomerId = 'cus_idempotent_completed';
    const mockSubscriptionId = 'sub_idempotent_completed';
    const mockInvoiceId = 'in_idempotent_completed';
    const existingPaymentTxId = 'ptxn_existing_completed_456';
    const existingTokensAwarded = 750;

    const mockEvent = createMockInvoicePaymentSucceededEvent({
      id: mockInvoiceId,
      customer: mockStripeCustomerId,
      amount_paid: 1500,
      currency: 'usd',
      lines: {
        object: 'list',
        data: [createMockInvoiceLineItem({
          subscription: mockSubscriptionId,
        })],
        has_more: false,
        url: `/v1/invoices/${mockInvoiceId}/lines`,
      },
    });

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state: MockQueryBuilderState) => {
            if (
              state.filters.some((f) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId) &&
              state.filters.some((f) => f.column === 'status' && f.value === 'COMPLETED')
            ) {
              return {
                data: [{
                  id: existingPaymentTxId,
                  status: 'COMPLETED',
                  tokens_to_award: existingTokensAwarded,
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
              };
            }
            return { data: null, error: new Error('Mock: Unexpected payment_transactions select query in Idempotency (COMPLETED) test'), count: 0, status: 500, statusText: 'Error' };
          },
        },
        user_subscriptions: {
          select: async () => {
            throw new Error('user_subscriptions.select should not be called');
          },
        },
        token_wallets: {
          select: async () => {
            throw new Error('token_wallets.select should not be called');
          },
        },
        subscription_plans: {
          select: async () => {
            throw new Error('subscription_plans.select should not be called');
          },
        },
      },
      rpcResults: {
        complete_invoice_payment: {
          data: null,
          error: new Error('complete_invoice_payment should not run when COMPLETED row exists'),
        },
      },
    };

    setupInvoiceMocks(dbConfig);
    const infoLogSpy = spy(mockInvoiceLogger, 'info');

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, 'retrieve', () => {
      throw new Error('stripe.subscriptions.retrieve should not be called in idempotency (COMPLETED) test');
    });

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed for already completed invoice. Error: ${result.error}`);
    assertEquals(result.transactionId, existingPaymentTxId);
    assertEquals(result.tokensAwarded, existingTokensAwarded);
    assertEquals(result.message, 'Invoice already processed.');

    assertExists(mockSupabaseSetup.spies.rpcSpy);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 0);
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 0);
    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 0);

    assert(
      infoLogSpy.calls.some((call: SpyCall) => {
        const first = call.args[0];
        if (typeof first !== 'string') {
          return false;
        }
        return first.includes(`[handleInvoicePaymentSucceeded] Invoice ${mockInvoiceId} already successfully processed with transaction ID ${existingPaymentTxId}. Skipping.`);
      }),
      'Expected log message for already completed invoice not found.',
    );

    teardownInvoiceMocks();
  });

  await t.step('Idempotency — no COMPLETED row yet; complete_invoice_payment RPC processes renewal', async () => {
    const mockUserId = 'user_idempotent_failed';
    const mockStripeCustomerId = 'cus_idempotent_failed';
    const mockSubscriptionId = 'sub_idempotent_failed';
    const mockInvoiceId = 'in_idempotent_failed';
    const rpcPaymentTxnId = 'ptxn_rpc_after_prior_failed_999';
    const tokensResolved = 0;
    const mockSubItemPriceId = 'price_some_plan_irrelevant_for_idempotency_failed';

    const mockEvent = createMockInvoicePaymentSucceededEvent({
      id: mockInvoiceId,
      customer: mockStripeCustomerId,
      amount_paid: 1200,
      currency: 'usd',
      lines: {
        object: 'list',
        data: [createMockInvoiceLineItem({
          subscription: mockSubscriptionId,
        })],
        has_more: false,
        url: `/v1/invoices/${mockInvoiceId}/lines`,
      },
    });

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state: MockQueryBuilderState) => {
            if (
              state.filters.some((f) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId) &&
              state.filters.some((f) => f.column === 'status' && f.value === 'COMPLETED')
            ) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Unexpected payment_transactions select query in Idempotency (FAILED) test'), count: 0, status: 500, statusText: 'Error' };
          },
        },
        user_subscriptions: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Unexpected user_subscriptions select in Idempotency (FAILED) test'), count: 0, status: 500 };
          },
        },
        token_wallets: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: `wallet_${mockUserId}` }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Unexpected token_wallets select in Idempotency (FAILED) test'), count: 0, status: 500 };
          },
        },
        subscription_plans: {
          select: async (state: MockQueryBuilderState) => {
            const priceFilter = state.filters.find((f) => f.column === 'stripe_price_id');
            if (priceFilter && priceFilter.value === mockSubItemPriceId) {
              return {
                data: [{
                  stripe_price_id: mockSubItemPriceId,
                  item_id_internal: 'item_for_failed_idem',
                  tokens_to_award: tokensResolved,
                  plan_type: 'subscription',
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
              };
            }
            return { data: null, error: new Error('Mock: Unexpected subscription_plans select in Idempotency (FAILED) test'), count: 0, status: 500 };
          },
        },
      },
      rpcResults: {
        complete_invoice_payment: {
          data: [{
            payment_transaction_id: rpcPaymentTxnId,
            tier_level: 1,
            token_transaction_id: null,
          }],
          error: null,
        },
      },
    };

    setupInvoiceMocks(dbConfig);

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }

    mockStripe.stubs.subscriptionsRetrieve = stub(
      mockStripe.instance.subscriptions,
      'retrieve',
      () =>
        Promise.resolve(
          createMockSubscriptionResponse({
            id: mockSubscriptionId,
            customer: mockStripeCustomerId,
            items: {
              object: 'list',
              data: [
                createMockSubscriptionItem({
                  subscription: mockSubscriptionId,
                  price: createMockPrice({ id: mockSubItemPriceId }),
                }),
              ],
              has_more: false,
              url: `/v1/subscription_items?subscription=${mockSubscriptionId}`,
            },
          }),
        ),
    );

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed after RPC. Error: ${result.error}`);
    assertEquals(result.transactionId, rpcPaymentTxnId);
    assertEquals(result.tokensAwarded, tokensResolved);

    assertExists(mockSupabaseSetup.spies.rpcSpy);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'complete_invoice_payment');
    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 0);

    teardownInvoiceMocks();
  });

  await t.step('subscription_create billing_reason — skipped entirely; complete_invoice_payment RPC not called', async () => {
    setupInvoiceMocks({});

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(
      mockStripe.instance.subscriptions,
      'retrieve',
      () => {
        throw new Error('subscriptions.retrieve must not run during subscription_create early return');
      },
    );

    const mockEvent = createMockInvoicePaymentSucceededEvent({
      id: 'in_sub_create_routing',
      customer: 'cus_sub_create_routing',
      billing_reason: 'subscription_create',
      lines: {
        object: 'list',
        data: [createMockInvoiceLineItem({ subscription: 'sub_sub_create_routing' })],
        has_more: false,
        url: '/v1/invoices/in_sub_create_routing/lines',
      },
    });

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assertEquals(result.success, true);
    assertEquals(result.transactionId, undefined);
    assertEquals(result.tokensAwarded, 0);
    assertEquals(result.message, 'subscription_create invoice skipped; handled by checkout.session.completed');

    let ptxHistoric = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    if (ptxHistoric === undefined) {
      ptxHistoric = [];
    }
    let userSubHistoricForRouting = mockSupabaseSetup.client.getHistoricBuildersForTable('user_subscriptions');
    if (userSubHistoricForRouting === undefined) {
      userSubHistoricForRouting = [];
    }
    let walletHistoricForRouting = mockSupabaseSetup.client.getHistoricBuildersForTable('token_wallets');
    if (walletHistoricForRouting === undefined) {
      walletHistoricForRouting = [];
    }
    let plansHistoricForRouting = mockSupabaseSetup.client.getHistoricBuildersForTable('subscription_plans');
    if (plansHistoricForRouting === undefined) {
      plansHistoricForRouting = [];
    }
    assertEquals(ptxHistoric.length, 0);
    assertEquals(userSubHistoricForRouting.length, 0);
    assertEquals(walletHistoricForRouting.length, 0);
    assertEquals(plansHistoricForRouting.length, 0);

    assertExists(mockSupabaseSetup.spies.rpcSpy);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 0);
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 0);
    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 0);

    teardownInvoiceMocks();
  });

  await t.step('Zero tokens_to_award — complete_invoice_payment RPC still invoked with p_tokens_to_award = 0', async () => {
    const invoiceId = 'in_zero_tokens';
    const customerId = 'cus_zero_tokens';
    const subscriptionId = 'sub_zero_tokens';
    const userId = 'user_zero_tokens';
    const walletId = 'wallet_zero_tokens';
    const paymentTxnId = 'ptxn_zero_tokens';
    const planStripeId = 'price_zero_tokens';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: invoiceId,
        customer: customerId,
        total: 500,
        currency: 'usd',
        lines: {
          object: 'list',
          data: [createMockInvoiceLineItem({ subscription: subscriptionId })],
          has_more: false,
          url: `/v1/invoices/${invoiceId}/lines`,
        },
      },
      { id: 'evt_zero_tokens' },
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state: MockQueryBuilderState) => {
            if (
              state.filters.some((f) => f.column === 'gateway_transaction_id' && f.value === invoiceId) &&
              state.filters.some((f) => f.column === 'status' && f.value === 'COMPLETED')
            ) {
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
        },
        user_subscriptions: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_customer_id' && f.value === customerId)) {
              return { data: [{ user_id: userId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: User subscription not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        token_wallets: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'user_id' && f.value === userId)) {
              return { data: [{ wallet_id: walletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Token wallet not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        subscription_plans: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_price_id' && f.value === planStripeId)) {
              return {
                data: [{
                  stripe_price_id: planStripeId,
                  tokens_to_award: 0,
                  plan_type: 'subscription',
                  item_id_internal: 'item_zero',
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
              };
            }
            return { data: [], error: new Error('Mock: Plan not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
      },
      rpcResults: {
        complete_invoice_payment: {
          data: [{
            payment_transaction_id: paymentTxnId,
            tier_level: 0,
            token_transaction_id: null,
          }],
          error: null,
        },
      },
    };

    setupInvoiceMocks(dbConfig);

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(
      mockStripe.instance.subscriptions,
      'retrieve',
      () =>
        Promise.resolve(
          createMockSubscriptionResponse({
            id: subscriptionId,
            customer: customerId,
            items: {
              object: 'list',
              data: [
                createMockSubscriptionItem({
                  subscription: subscriptionId,
                  price: createMockPrice({ id: planStripeId, product: 'prod_zero' }),
                }),
              ],
              has_more: false,
              url: `/v1/subscription_items?subscription=${subscriptionId}`,
            },
          }),
        ),
    );

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed. Error: ${result.error}`);
    assertEquals(result.tokensAwarded, 0);
    assertEquals(result.transactionId, paymentTxnId);

    assertExists(mockSupabaseSetup.spies.rpcSpy);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'complete_invoice_payment');
    const rpcParamsZero: object | null = mockSupabaseSetup.spies.rpcSpy.calls[0].args[1];
    assert(rpcParamsZero !== null && typeof rpcParamsZero === 'object' && 'p_tokens_to_award' in rpcParamsZero);
    assertEquals(
      Reflect.get(rpcParamsZero, 'p_tokens_to_award'),
      0,
    );

    teardownInvoiceMocks();
  });

  await t.step('OTP invoice — no subscription line item; period and subscription RPC fields null', async () => {
    const invoiceId = 'in_otp_no_sub_line';
    const customerId = 'cus_otp_no_sub_line';
    const userId = 'user_otp_no_sub_line';
    const walletId = 'wallet_otp_no_sub_line';
    const paymentTxnId = 'ptxn_otp_no_sub_line';

    const lineWithoutSubscription = createMockInvoiceLineItem({
      subscription: null,
      id: 'il_otp_only',
    });

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: invoiceId,
        customer: customerId,
        total: 2500,
        currency: 'usd',
        lines: {
          object: 'list',
          data: [lineWithoutSubscription],
          has_more: false,
          url: `/v1/invoices/${invoiceId}/lines`,
        },
      },
      { id: 'evt_otp_no_sub' },
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state: MockQueryBuilderState) => {
            if (
              state.filters.some((f) => f.column === 'gateway_transaction_id' && f.value === invoiceId) &&
              state.filters.some((f) => f.column === 'status' && f.value === 'COMPLETED')
            ) {
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
        },
        user_subscriptions: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'stripe_customer_id' && f.value === customerId)) {
              return { data: [{ user_id: userId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: User subscription not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
        token_wallets: {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'user_id' && f.value === userId)) {
              return { data: [{ wallet_id: walletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Token wallet not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
        },
      },
      rpcResults: {
        complete_invoice_payment: {
          data: [{
            payment_transaction_id: paymentTxnId,
            tier_level: 1,
            token_transaction_id: null,
          }],
          error: null,
        },
      },
    };

    setupInvoiceMocks(dbConfig);

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, 'retrieve', () => {
      throw new Error('stripe.subscriptions.retrieve should not run when invoice has no subscription line');
    });

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed. Error: ${result.error}`);
    assertEquals(result.transactionId, paymentTxnId);
    assertEquals(result.tokensAwarded, 0);

    assertExists(mockSupabaseSetup.spies.rpcSpy);
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'complete_invoice_payment');
    const otpExpectedMetadata: Json = {
      stripe_event_id: 'evt_otp_no_sub',
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      checkout_session_id: "",
      billing_reason: 'manual',
      payment_intent_id: null,
    };

    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_user_id: userId,
      p_target_wallet_id: walletId,
      p_gateway_transaction_id: invoiceId,
      p_tokens_to_award: 0,
      p_amount_fiat: 2500,
      p_currency: 'usd',
      p_metadata: otpExpectedMetadata,
      p_token_idempotency_key: 'evt_otp_no_sub',
      p_token_notes: JSON.stringify({
        reason: mockEvent?.data.object.billing_reason,
        invoice_id: invoiceId,
        stripe_event_id: 'evt_otp_no_sub',
        item_id_internal: "",
      }),
      p_stripe_subscription_id: null,
      p_period_start: null,
      p_period_end: null,
    });

    teardownInvoiceMocks();
  });
});
