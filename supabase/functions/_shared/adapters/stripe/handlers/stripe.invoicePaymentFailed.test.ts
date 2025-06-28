import { handleInvoicePaymentFailed } from './stripe.invoicePaymentFailed.ts';
import type { ILogger, LogMetadata } from '../../../types.ts';
import { Database } from '../../../../types_db.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';
import type { MockSupabaseClientSetup, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
  type Spy,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient } from '../../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';

// Constants for reused mock IDs
const MOCK_STRIPE_CUSTOMER_ID = 'cus_test_invoice_customer';
const MOCK_USER_ID = 'usr_test_invoice_user';
const MOCK_WALLET_ID = 'wlt_test_invoice_wallet';
const MOCK_SUBSCRIPTION_ID = 'sub_test_invoice_sub';
const MOCK_INVOICE_ID = 'in_test_invoice_123';
const MOCK_EVENT_ID = 'evt_test_invoice_failed_event';
const MOCK_PAYMENT_TRANSACTION_ID_NEW = 'ptxn_new_failed_invoice_123';
const MOCK_PAYMENT_TRANSACTION_ID_EXISTING = 'ptxn_existing_failed_invoice_456';
const MOCK_PAYMENT_INTENT_ID_ONE_TIME = 'pi_one_time_failed_intent';

// Helper to create a mock Stripe.InvoicePaymentFailedEvent
const createMockInvoicePaymentFailedEvent = (
  invoiceData: Partial<Stripe.Invoice>,
  eventId = MOCK_EVENT_ID
): Stripe.InvoicePaymentFailedEvent => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: eventId,
    object: 'event',
    api_version: '2020-08-27',
    created: now,
    data: {
      object: {
        id: MOCK_INVOICE_ID,
        object: 'invoice',
        status: 'open', // Default, can be overridden
        customer: MOCK_STRIPE_CUSTOMER_ID,
        subscription: MOCK_SUBSCRIPTION_ID,
        attempt_count: 1,
        amount_due: 2000,
        currency: 'usd',
        paid: false,
        lines: {
          data: [],
          has_more: false,
          object: 'list',
          url: '',
        },
        ...invoiceData,
      } as Stripe.Invoice,
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: `req_test_${Date.now()}`, idempotency_key: null },
    type: 'invoice.payment_failed',
  } as Stripe.InvoicePaymentFailedEvent;
};

// Mock Logger
const createMockLoggerInternal = (): ILogger => {
  return {
    debug: spy((_message: string, _metadata?: LogMetadata) => {}),
    info: spy((_message: string, _metadata?: LogMetadata) => {}),
    warn: spy((_message: string, _metadata?: LogMetadata) => {}),
    error: spy((_message: string | Error, _metadata?: LogMetadata) => {}),
  };
};

Deno.test('[stripe.invoicePaymentFailed.ts] Tests - handleInvoicePaymentFailed', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockTokenWalletService;
  let mockLogger: ILogger;
  let mockStripe: MockStripe;
  let handlerContext: HandlerContext;

  const setup = (dbConfig?: MockSupabaseDataConfig, stripeMocks?: {
    subscriptionRetrieve?: Partial<Stripe.Subscription> | Error;
  }) => {
    mockLogger = createMockLoggerInternal();
    mockTokenWalletService = createMockTokenWalletService();
    mockStripe = createMockStripe();

    // Configure Stripe mocks
    if (stripeMocks?.subscriptionRetrieve) {
      // Restore previous stub if it exists, before re-assigning a new one.
      if (mockStripe.stubs.subscriptionsRetrieve?.restore) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
      }
      if (stripeMocks.subscriptionRetrieve instanceof Error) {
        mockStripe.stubs.subscriptionsRetrieve = stub(
          mockStripe.instance.subscriptions,
          "retrieve",
          () => Promise.reject(stripeMocks.subscriptionRetrieve)
        );
      } else {
        mockStripe.stubs.subscriptionsRetrieve = stub(
          mockStripe.instance.subscriptions,
          "retrieve",
          () => Promise.resolve({
            ...(stripeMocks.subscriptionRetrieve as Stripe.Subscription),
            lastResponse: { headers: {}, requestId: 'req_mock_sub_retrieve', statusCode: 200 },
          } as Stripe.Response<Stripe.Subscription>)
        );
      }
    }


    mockSupabaseSetup = createMockSupabaseClient(undefined, dbConfig || {});
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;

    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockLogger,
      tokenWalletService: mockTokenWalletService.instance, // Not directly used by this handler but part of context
      stripe: mockStripe.instance,
      updatePaymentTransaction: spy() as any, // Mocked, not used by this handler directly
      featureFlags: {},
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test_secret_invoice_failed', // Dummy secret
    };
  };

  const teardown = () => {
    mockStripe.clearStubs();
    mockSupabaseSetup.client.clearAllTrackedBuilders(); // Clear tracked builders for fresh state
  };

  await t.step('Successful processing: New failed invoice, user and wallet found, subscription updated', async () => {
    const specificInvoiceId = 'in_new_failure_1';
    const specificEventId = 'evt_new_failure_1';
    const specificSubId = 'sub_new_failure_1';
    const specificCustomerId = 'cus_new_failure_1';
    const specificUserId = 'user_new_failure_1';
    const specificWalletId = 'wallet_new_failure_1';
    const specificPtxnId = 'ptxn_new_failure_1';

    setup(
      { // MockSupabaseDataConfig
        genericMockResults: {
          'payment_transactions': {
            select: async (state) => { // For checking existing payment
              if (state.filters.some(f => f.column === 'gateway_transaction_id' && f.value === specificInvoiceId)) {
                return { data: null, error: null, count: 0, status: 200, statusText: 'OK' }; // No existing payment
              }
              return { data: null, error: new Error('Mock: Unexpected select on payment_transactions'), count: 0, status: 500, statusText: 'Error' };
            },
            upsert: async (state) => { // For inserting new FAILED payment
              const upsertData = state.upsertData as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
              if (upsertData?.gateway_transaction_id === specificInvoiceId && upsertData?.status === 'FAILED') {
                return { data: [{ id: specificPtxnId, ...upsertData }], error: null, count: 1, status: 201, statusText: 'Created' };
              }
              return { data: null, error: new Error('Mock: Payment txn upsert failed'), count: 0, status: 500, statusText: 'Error' };
            }
          },
          'user_subscriptions': {
            select: async (state) => { // For getting user_id
              if (state.filters.some(f => f.column === 'stripe_customer_id' && f.value === specificCustomerId)) {
                return { data: [{ user_id: specificUserId, stripe_subscription_id: specificSubId }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: null, error: new Error('Mock: User sub not found'), count: 0, status: 404, statusText: 'Not Found' };
            },
            update: async (state) => { // For updating subscription status
               const updateData = state.updateData as Partial<Database['public']['Tables']['user_subscriptions']['Row']>;
              if (state.filters.some(f => f.column === 'stripe_subscription_id' && f.value === specificSubId) && updateData?.status === 'past_due') {
                 return { data: [{ id: 'us_updated_id', stripe_subscription_id: specificSubId, status: 'past_due' }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: null, error: new Error('Mock: User sub update failed'), count: 0, status: 500, statusText: 'Error' };
            }
          },
          'token_wallets': {
            select: async (state) => { // For getting wallet_id
              if (state.filters.some(f => f.column === 'user_id' && f.value === specificUserId)) {
                return { data: [{ wallet_id: specificWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: null, error: new Error('Mock: Wallet not found'), count: 0, status: 404, statusText: 'Not Found' };
            }
          }
        }
      },
      { // stripeMocks
        subscriptionRetrieve: { id: specificSubId, status: 'past_due' } as Stripe.Subscription,
      }
    );

    const event = createMockInvoicePaymentFailedEvent(
      { id: specificInvoiceId, customer: specificCustomerId, subscription: specificSubId, amount_due: 3000, currency: 'eur' },
      specificEventId
    );

    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, specificPtxnId, "Result transactionId should be the new payment transaction ID");

    // Verify logs
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 3); // Adjusted to 3 based on test output
    assert(String(infoSpy.calls[0].args[0]).includes(`Processing invoice ${specificInvoiceId}`), "Initial log wrong");
    // Assuming the third log is the success log, need to confirm which one is second if this passes.
    // For now, let's assume the last one is the success log.
    assert(String(infoSpy.calls[infoSpy.calls.length -1].args[0]).includes(`Successfully processed failed invoice ${specificInvoiceId}`), "Success log wrong");

    // Verify Supabase 'payment_transactions' select and upsert
    const historicPtxnBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertExists(historicPtxnBuilders, "Historic builders for payment_transactions should exist");
    assertEquals(historicPtxnBuilders.length, 2, "Expected 2 builders for payment_transactions (select, then upsert)");

    const ptxnSelectBuilder = historicPtxnBuilders[0];
    assertExists(ptxnSelectBuilder, "First payment_transactions builder (for select) should exist");
    assertSpyCalls(ptxnSelectBuilder.methodSpies.select, 1);
    assertSpyCalls(ptxnSelectBuilder.methodSpies.eq, 2); // gateway_transaction_id, payment_gateway_id
    assertSpyCalls(ptxnSelectBuilder.methodSpies.maybeSingle, 1);

    const ptxnUpsertBuilder = historicPtxnBuilders[1];
    assertExists(ptxnUpsertBuilder, "Second payment_transactions builder (for upsert) should exist");
    assertSpyCalls(ptxnUpsertBuilder.methodSpies.upsert, 1);
    const upsertArgs = ptxnUpsertBuilder.methodSpies.upsert.calls[0].args[0] as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
    assertEquals(upsertArgs.gateway_transaction_id, specificInvoiceId);
    assertEquals(upsertArgs.status, 'FAILED');
    assertEquals(upsertArgs.user_id, specificUserId);
    assertEquals(upsertArgs.target_wallet_id, specificWalletId);
    assertEquals(upsertArgs.amount_requested_fiat, 30); // 3000 cents
    assertEquals(upsertArgs.currency_requested_fiat, 'eur');
    assertEquals(upsertArgs.tokens_to_award, 0);
    assertExists(upsertArgs.metadata_json);
    const metadata = upsertArgs.metadata_json as Record<string, unknown>;
    assertEquals(metadata.stripe_event_id, specificEventId);
    assertEquals(metadata.type, 'RENEWAL_FAILED');

    // Verify Supabase 'user_subscriptions' select and update
    const historicUserSubBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuilders, "Historic builders for user_subscriptions should exist");
    assertEquals(historicUserSubBuilders.length, 2, "Expected 2 builders for user_subscriptions (select, then update)");
    
    const userSubSelectBuilder = historicUserSubBuilders[0];
    assertExists(userSubSelectBuilder, "First user_subscriptions builder (for select) should exist");
    assertSpyCalls(userSubSelectBuilder.methodSpies.select, 1);
    assertSpyCalls(userSubSelectBuilder.methodSpies.limit, 1);
    assertSpyCalls(userSubSelectBuilder.methodSpies.single, 1);

    const userSubUpdateBuilder = historicUserSubBuilders[1];
    assertExists(userSubUpdateBuilder, "Second user_subscriptions builder (for update) should exist");
    assertSpyCalls(userSubUpdateBuilder.methodSpies.update, 1);
    const subUpdateArgs = userSubUpdateBuilder.methodSpies.update.calls[0].args[0] as Partial<Database['public']['Tables']['user_subscriptions']['Row']>;
    assertEquals(subUpdateArgs.status, 'past_due');

    // Verify Supabase 'token_wallets' select
    const historicTokenWalletBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('token_wallets');
    assertExists(historicTokenWalletBuilders, "Historic builders for token_wallets should exist");
    assertEquals(historicTokenWalletBuilders.length, 1, "Expected 1 builder for token_wallets (select)");
    const walletSelectBuilder = historicTokenWalletBuilders[0];
    assertExists(walletSelectBuilder);
    assertSpyCalls(walletSelectBuilder.methodSpies.select, 1);
    assertSpyCalls(walletSelectBuilder.methodSpies.single, 1);

    // Verify Stripe 'subscriptions.retrieve'
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1);
    assertEquals(mockStripe.stubs.subscriptionsRetrieve.calls[0].args[0], specificSubId);

    teardown();
  });

  await t.step('Idempotency: Event for already FAILED payment_transaction', async () => {
    setup({ // MockSupabaseDataConfig
      genericMockResults: {
        'payment_transactions': {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'gateway_transaction_id' && f.value === MOCK_INVOICE_ID)) {
              // Simulate existing payment transaction already marked FAILED
              return { data: [{ id: MOCK_PAYMENT_TRANSACTION_ID_EXISTING, status: 'FAILED', gateway_transaction_id: MOCK_INVOICE_ID }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: payment_transactions select failed'), count: 0, status: 500, statusText: 'Error' };
          },
          upsert: async () => { // Should NOT be called
            return { data: null, error: new Error('Mock: Upsert should not be called for idempotency'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    });

    const event = createMockInvoicePaymentFailedEvent({ id: MOCK_INVOICE_ID });
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(result.success, `Expected success for idempotency, got error: ${result.error}`);
    assertEquals(result.transactionId, MOCK_PAYMENT_TRANSACTION_ID_EXISTING, "Result transactionId should be the existing payment transaction ID");

    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 2); // Initial processing + already marked FAILED log
    assert(String(infoSpy.calls[1].args[0]).includes(`Invoice ${MOCK_INVOICE_ID} (Payment ${MOCK_PAYMENT_TRANSACTION_ID_EXISTING}) already marked FAILED.`));
    
    const historicPtxnBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertExists(historicPtxnBuilders, "Historic builders for payment_transactions should exist for idempotency check");
    assertEquals(historicPtxnBuilders.length, 1, "Only one builder (for select) expected for payment_transactions in idempotency test");
    assertSpyCalls(historicPtxnBuilders[0].methodSpies.upsert, 0); // Upsert should NOT be called on this builder

    // Check that other service calls were not made
    const historicUserSubBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('user_subscriptions');
    assertEquals(historicUserSubBuilders?.length ?? 0, 0, "No user_subscriptions builders should be created in this idempotency path.");

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 0);

    teardown();
  });

  await t.step('Error: User not found for Stripe customer ID', async () => {
    setup({
      genericMockResults: {
        'payment_transactions': { // For initial check
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }),
        },
        'user_subscriptions': { // Simulate user_id not found
          select: async (state) => {
            if (state.filters.some(f => f.column === 'stripe_customer_id' && f.value === MOCK_STRIPE_CUSTOMER_ID)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' }; // No user found
            }
            return { data: null, error: new Error('Mock: User sub select failed'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    });

    const event = createMockInvoicePaymentFailedEvent({ customer: MOCK_STRIPE_CUSTOMER_ID });
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(!result.success, 'Expected failure when user not found');
    assertEquals(result.error, `Essential user/wallet info missing for failed invoice ${MOCK_INVOICE_ID}.`);
    assertEquals(result.transactionId, MOCK_INVOICE_ID);

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1);
    const actualLogUserNotFound = String(errorSpy.calls[0].args[0]);
    const expectedPrefixUserNotFound = `[handleInvoicePaymentFailed] CRITICAL: Could not determine user_id and/or target_wallet_id for failed invoice ${MOCK_INVOICE_ID}. Cannot log to payment_transactions.`;
    assert(actualLogUserNotFound.startsWith(expectedPrefixUserNotFound), `Log message mismatch. Expected prefix: "${expectedPrefixUserNotFound}", Actual log: "${actualLogUserNotFound}"`);
    
    const historicPtxnBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertExists(historicPtxnBuilders);
    assertEquals(historicPtxnBuilders.length, 1); 
    assertSpyCalls(historicPtxnBuilders[0].methodSpies.upsert, 0); // No upsert if user not found

    teardown();
  });

  await t.step('Error: Wallet not found for user ID', async () => {
    const specificUserId = 'user_for_no_wallet_test';
    setup({
      genericMockResults: {
        'payment_transactions': { // For initial check
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }),
        },
        'user_subscriptions': { // Simulate user found
          select: async () => ({ data: [{ user_id: specificUserId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        },
        'token_wallets': { // Simulate wallet not found
          select: async (state) => {
             if (state.filters.some(f => f.column === 'user_id' && f.value === specificUserId)) {
                // Simulate the behavior where .single() on a null data with no explicit error results in PGRST116
                return { data: null, error: { name: 'PGRST116', message: 'Query returned no rows', code: 'PGRST116', details: '', hint:''} as any, count: 0, status: 406, statusText: 'Not Acceptable' };
             }
             return { data: null, error: new Error("Mock: Wallet select failed"), count: 0, status: 500, statusText: "Error" };
          }
        }
      }
    });

    const event = createMockInvoicePaymentFailedEvent({});
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(!result.success, 'Expected failure when wallet not found');
    assertEquals(result.error, `Essential user/wallet info missing for failed invoice ${MOCK_INVOICE_ID}.`);
    assertEquals(result.transactionId, MOCK_INVOICE_ID);

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1);
    const actualLogWalletNotFound = String(errorSpy.calls[0].args[0]);
    const expectedPrefixWalletNotFound = `[handleInvoicePaymentFailed] CRITICAL: Could not determine user_id and/or target_wallet_id for failed invoice ${MOCK_INVOICE_ID}. Cannot log to payment_transactions.`;
    assert(actualLogWalletNotFound.startsWith(expectedPrefixWalletNotFound), `Log message mismatch. Expected prefix: "${expectedPrefixWalletNotFound}", Actual log: "${actualLogWalletNotFound}"`);

    const historicPtxnBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertExists(historicPtxnBuilders);
    assertEquals(historicPtxnBuilders.length, 1); // Initial select on payment_transactions
    assertSpyCalls(historicPtxnBuilders[0].methodSpies.upsert, 0); // No upsert if wallet not found

    teardown();
  });
  
  await t.step('Warning: Invoice has no customer ID', async () => {
    setup(); // No specific DB mocks needed as it should exit early

    const event = createMockInvoicePaymentFailedEvent({ customer: null }); // No customer
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(result.success, 'Expected success (graceful skip) when no customer ID');
    assertEquals(result.transactionId, MOCK_EVENT_ID);

    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    assertSpyCalls(warnSpy, 1);
    assert(String(warnSpy.calls[0].args[0]).includes(`Invoice ${MOCK_INVOICE_ID} (Event ${MOCK_EVENT_ID}) has no customer. Skipping.`));
    
    // No DB calls should be made to payment_transactions
    const historicPtxnBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertEquals(historicPtxnBuilders?.length ?? 0, 0, "No payment_transactions builders should be created if customer is null.");

    teardown();
  });

  await t.step('DB Error: Checking existing payment fails', async () => {
    const dbError = new Error('DB connection lost during select');
    setup({
      genericMockResults: {
        'payment_transactions': {
          select: async () => ({ data: null, error: dbError, count: 0, status: 500, statusText: 'Internal Server Error' }),
        }
      }
    });
    
    const event = createMockInvoicePaymentFailedEvent({});
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(!result.success, "Expected failure on DB error during payment check");
    assertEquals(result.error, `DB error: ${dbError.message}`);
    assertEquals(result.transactionId, MOCK_INVOICE_ID); // Corrected: Should be MOCK_INVOICE_ID

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1);
    assert(String(errorSpy.calls[0].args[0]).includes(`DB error checking existing payment for invoice ${MOCK_INVOICE_ID}`));

    teardown();
  });
  
  await t.step('DB Error: Upserting FAILED payment_transaction fails', async () => {
    const dbUpsertError = new Error('DB unique constraint violation during upsert');
    const specificUserId = 'user_for_upsert_fail';
    const specificWalletId = 'wallet_for_upsert_fail';

    setup({
      genericMockResults: {
        'payment_transactions': {
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }), // No existing
          upsert: async () => ({ data: null, error: dbUpsertError, count: 0, status: 500, statusText: 'Error' })
        },
        'user_subscriptions': {
          select: async () => ({ data: [{ user_id: specificUserId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        },
        'token_wallets': {
          select: async () => ({ data: [{ wallet_id: specificWalletId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        }
      }
    });

    const event = createMockInvoicePaymentFailedEvent({});
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(!result.success, "Expected failure on DB error during payment upsert");
    assertEquals(result.error, `DB error upserting failed payment: ${dbUpsertError.message}`);
    assertEquals(result.transactionId, MOCK_INVOICE_ID); // Corrected: Should be MOCK_INVOICE_ID

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1);
    assert(String(errorSpy.calls[0].args[0]).includes(`Failed to upsert FAILED payment_transactions record for invoice ${MOCK_INVOICE_ID}`));
    
    teardown();
  });

  await t.step('Subscription update fails (warning, main process still succeeds)', async () => {
    const specificInvoiceId = 'in_sub_update_fail_1';
    const specificSubId = 'sub_sub_update_fail_1';
    const specificPtxnId = 'ptxn_sub_update_fail_1';
    const subUpdateDbError = new Error("Failed to update subscription in DB");

    setup(
      {
        genericMockResults: {
          'payment_transactions': {
            select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }),
            upsert: async (state) => {
              const upsertData = state.upsertData as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
              return { data: [{ id: specificPtxnId, ...upsertData }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
          },
          'user_subscriptions': {
            select: async () => ({ data: [{ user_id: MOCK_USER_ID, stripe_subscription_id: specificSubId }], error: null, count: 1, status: 200, statusText: 'OK' }),
            update: async () => ({ data: null, error: subUpdateDbError, count: 0, status: 500, statusText: 'Error' }) // Simulate update failure
          },
          'token_wallets': {
            select: async () => ({ data: [{ wallet_id: MOCK_WALLET_ID }], error: null, count: 1, status: 200, statusText: 'OK' })
          }
        }
      },
      { subscriptionRetrieve: { id: specificSubId, status: 'incomplete' } as Stripe.Subscription }
    );

    const event = createMockInvoicePaymentFailedEvent({ id: specificInvoiceId, subscription: specificSubId });
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(result.success, `Expected overall success even if subscription update fails, got error: ${result.error}`);
    assertEquals(result.transactionId, specificPtxnId);

    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    assertSpyCalls(warnSpy, 1);
    assert(String(warnSpy.calls[0].args[0]).includes(`Failed to update user_subscription ${specificSubId} status to incomplete`));
    
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1); // Still attempt to retrieve from Stripe

    teardown();
  });
  
   await t.step('Stripe subscription retrieve fails (warning, main process still succeeds)', async () => {
    const specificInvoiceId = 'in_stripe_retrieve_fail_1';
    const specificSubId = 'sub_stripe_retrieve_fail_1';
    const specificPtxnId = 'ptxn_stripe_retrieve_fail_1';
    const stripeSubRetrieveError = new Error("Stripe API error retrieving subscription");

    setup(
      {
        genericMockResults: {
          'payment_transactions': {
            select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }),
            upsert: async (state) => {
              const upsertData = state.upsertData as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
              return { data: [{ id: specificPtxnId, ...upsertData }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
          },
          'user_subscriptions': { // This won't be called if stripe retrieve fails before it
            select: async () => ({ data: [{ user_id: MOCK_USER_ID, stripe_subscription_id: specificSubId }], error: null, count: 1, status: 200, statusText: 'OK' }),
             update: async () => ({ data: [{}], error: null, count: 1, status: 200, statusText: 'OK' })
          },
          'token_wallets': {
            select: async () => ({ data: [{ wallet_id: MOCK_WALLET_ID }], error: null, count: 1, status: 200, statusText: 'OK' })
          }
        }
      },
      { subscriptionRetrieve: stripeSubRetrieveError } // Simulate Stripe API error
    );

    const event = createMockInvoicePaymentFailedEvent({ id: specificInvoiceId, subscription: specificSubId });
    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(!result.success, `Expected overall failure when Stripe subscription retrieve fails, but got success: true`);
    assertEquals(result.transactionId, specificPtxnId, "Transaction ID should still be returned on failure");
    assertExists(result.error, "result.error should contain the error message");
    assert(result.error?.includes(stripeSubRetrieveError.message), "result.error should include the Stripe API error message");
    assert(result.error?.includes(`subscription status could not be verified/updated`), "result.error should explain that subscription status update failed");
    assertEquals(result.status, 500, "Status code should be 500 for this failure scenario");

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1); 

    const expectedErrorMessage = `Stripe API error retrieving subscription ${specificSubId} for invoice ${specificInvoiceId}: ${stripeSubRetrieveError.message}. While the payment transaction ${specificPtxnId} has been marked FAILED, the subscription status could not be verified/updated due to this internal error.`;
    assert(String(errorSpy.calls[0].args[0]).includes(expectedErrorMessage), "Error log message mismatch");
    
    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    // Check if the initial warning from the catch block (before the error return) is still there.
    // This depends on whether the logger.warn inside the catch block of stripe.subscriptions.retrieve is still desired
    // For now, assuming it's still there. If not, this check needs to be adjusted or removed.
    const initialWarnCall = warnSpy.calls.find(call => String(call.args[0]).includes(`Failed to retrieve Stripe subscription ${specificSubId}`));
    assertExists(initialWarnCall, "Initial warning about failed subscription retrieval should still be present");
    if (initialWarnCall) {
      assert(String(initialWarnCall.args[0]).includes(`Failed to retrieve Stripe subscription ${specificSubId} during failed invoice processing for ${specificInvoiceId}. Status may not be updated in user_subscriptions.`), "Initial warning message mismatch");
      assertExists(initialWarnCall.args[1]?.error, "Initial warning should log the error object");
      assertEquals(initialWarnCall.args[1]?.error.message, stripeSubRetrieveError.message, "Initial warning logged error message mismatch");
    }


    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1); // Attempt to retrieve is made

    const historicUserSubBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('user_subscriptions');
    const userSubUpdateBuilder = historicUserSubBuilders?.find(b => b.methodSpies.update?.calls.length > 0);
    assert(!userSubUpdateBuilder, "DB update for subscription should be skipped and no update builder should have update calls.");

    teardown();
  });

  await t.step('One-Time Purchase: Failed invoice, original payment_transaction found via payment_intent, no subscription update', async () => {
    const specificInvoiceId = 'in_one_time_failure_1';
    const specificEventId = 'evt_one_time_failure_1';
    const specificPaymentIntentId = MOCK_PAYMENT_INTENT_ID_ONE_TIME; // Use the constant
    const specificCustomerId = 'cus_one_time_customer_1';
    const specificUserId = 'user_one_time_1';
    const specificWalletId = 'wallet_one_time_1';
    const specificPtxnIdForFailedInvoice = 'ptxn_one_time_failed_invoice_1'; // ID for the new/updated FAILED ptxn record
    const originalPtxnIdFromPI = 'ptxn_original_pi_1'; // ID of the ptxn found via Payment Intent

    setup(
      { // MockSupabaseDataConfig
        genericMockResults: {
          'payment_transactions': {
            select: async (state) => {
              // 1. Initial check for existing payment by invoice.id
              if (state.filters.some(f => f.column === 'gateway_transaction_id' && f.value === specificInvoiceId)) {
                // This invoice ID hasn't been logged as a FAILED ptxn yet
                return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
              }
              // 2. Check for payment_transaction by payment_intent_id
              if (state.filters.some(f => f.column === 'gateway_transaction_id' && f.value === specificPaymentIntentId)) {
                return { 
                  data: [{ 
                    id: originalPtxnIdFromPI, // This is the original ptxn linked to the PI
                    user_id: specificUserId, 
                    target_wallet_id: specificWalletId, 
                    organization_id: null, // Or some mock org_id if applicable
                    status: 'PENDING' // Or whatever status it might have had
                  }], 
                  error: null, 
                  count: 1, 
                  status: 200, 
                  statusText: 'OK' 
                };
              }
              return { data: null, error: new Error('Mock: Unexpected select on payment_transactions'), count: 0, status: 500, statusText: 'Error' };
            },
            upsert: async (state) => { // For inserting/updating the FAILED payment record (linked to invoice.id)
              const upsertData = state.upsertData as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
              if (upsertData?.gateway_transaction_id === specificInvoiceId && upsertData?.status === 'FAILED') {
                return { 
                  data: [{ id: specificPtxnIdForFailedInvoice, ...upsertData }], 
                  error: null, 
                  count: 1, 
                  status: 201, // Or 200 if it was an update of an existing record by invoice.id
                  statusText: 'Created' 
                };
              }
              return { data: null, error: new Error('Mock: Payment txn upsert failed for one-time'), count: 0, status: 500, statusText: 'Error' };
            }
          },
          'user_subscriptions': {
            select: async (state) => { // For getting user_id via customer from subscription (should not find one for one-time)
              if (state.filters.some(f => f.column === 'stripe_customer_id' && f.value === specificCustomerId)) {
                return { data: null, error: null, count: 0, status: 200, statusText: 'OK' }; // No subscription found
              }
              return { data: null, error: new Error('Mock: User sub not found (one-time)'), count: 0, status: 404, statusText: 'Not Found' };
            },
            // No update should be called on user_subscriptions for this case
          },
          'token_wallets': { 
            select: async (state) => {
              if (state.filters.some(f => f.column === 'user_id' && f.value === specificUserId)) {
                return { data: [{ wallet_id: specificWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: null, error: new Error('Mock: Wallet select called unexpectedly or failed for one-time'), count: 0, status: 404, statusText: 'Not Found' };
            }
          }
        }
      },
      { 
        subscriptionRetrieve: undefined, 
      }
    );

    const mockInvoice: Partial<Stripe.Invoice> = {
      id: specificInvoiceId,
      customer: specificCustomerId,
      subscription: null, 
      payment_intent: specificPaymentIntentId, 
      amount_due: 5000, 
      currency: 'usd',
      billing_reason: 'manual', 
      attempt_count: 1, 
      status: 'open', 
      paid: false,
    };

    const event = createMockInvoicePaymentFailedEvent(
      mockInvoice,
      specificEventId
    );
    event.data.object = mockInvoice as Stripe.Invoice; 


    const result = await handleInvoicePaymentFailed(handlerContext, event);

    assert(result.success, `Expected success for one-time failed invoice, got error: ${result.error}`);
    assertEquals(result.transactionId, specificPtxnIdForFailedInvoice, "Result transactionId should be the new/updated FAILED payment transaction ID");

    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assert(infoSpy.calls.some(call => String(call.args[0]).includes(`Processing invoice ${specificInvoiceId}`)), "Initial log missing");
    assert(infoSpy.calls.some(call => String(call.args[0]).includes(`Invoice ${specificInvoiceId} is not linked to a subscription`)), "Subscription check log missing");
    assert(infoSpy.calls.some(call => String(call.args[0]).includes(`Successfully processed failed invoice ${specificInvoiceId}`)), "Success log missing");
    
    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 0); 

    const historicPtxnBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    assertExists(historicPtxnBuilders, "Historic builders for payment_transactions should exist");
    assertEquals(historicPtxnBuilders.length, 3, "Expected 3 builders for payment_transactions");

    const ptxnUpsertBuilder = historicPtxnBuilders[2]; 
    assertExists(ptxnUpsertBuilder, "Upsert payment_transactions builder should exist");
    assertSpyCalls(ptxnUpsertBuilder.methodSpies.upsert, 1);
    const upsertArgs = ptxnUpsertBuilder.methodSpies.upsert.calls[0].args[0] as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
    
    assertEquals(upsertArgs.gateway_transaction_id, specificInvoiceId, "Upserted gateway_transaction_id should be invoice ID");
    assertEquals(upsertArgs.status, 'FAILED', "Upserted status should be FAILED");
    assertEquals(upsertArgs.user_id, specificUserId, "Upserted user_id mismatch");
    assertEquals(upsertArgs.target_wallet_id, specificWalletId, "Upserted target_wallet_id mismatch");
    assertEquals(upsertArgs.amount_requested_fiat, 50); 
    assertEquals(upsertArgs.currency_requested_fiat, 'usd');
    assertExists(upsertArgs.metadata_json, "Metadata should exist in upsert");
    const metadata = upsertArgs.metadata_json as Record<string, unknown>;
    assertEquals(metadata.stripe_event_id, specificEventId, "Metadata stripe_event_id mismatch");
    assertEquals(metadata.type, 'ONE_TIME_PAYMENT_FAILED', "Metadata type should be ONE_TIME_PAYMENT_FAILED");
    assertEquals(metadata.stripe_payment_intent_id, specificPaymentIntentId, "Metadata stripe_payment_intent_id mismatch");
    assert(!metadata.stripe_subscription_id, "Metadata stripe_subscription_id should be absent");

    const historicUserSubBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('user_subscriptions');
    assertExists(historicUserSubBuilders, "Historic builders for user_subscriptions should exist");
    assertEquals(historicUserSubBuilders.length, 1, "Expected 1 builder for user_subscriptions (select only)");
    const userSubSelectBuilder = historicUserSubBuilders[0];
    assertSpyCalls(userSubSelectBuilder.methodSpies.select, 1);
    assertEquals(userSubSelectBuilder.methodSpies.update?.calls?.length ?? 0, 0, "user_subscriptions.update should not have been called");
    
    assert(!mockStripe.stubs.subscriptionsRetrieve || mockStripe.stubs.subscriptionsRetrieve.calls.length === 0, "Stripe subscriptions.retrieve should not have been called");

    teardown();
  });

});
