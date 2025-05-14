import { StripePaymentAdapter } from './stripePaymentAdapter.ts';
import type { ITokenWalletService, TokenWallet, TokenWalletTransaction } from '../../_shared/types/tokenWallet.types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type Stripe from 'npm:stripe';
import type { PurchaseRequest, PaymentConfirmation } from '../types/payment.types.ts';
import {
  assert,
  assertEquals,
} from 'jsr:@std/assert';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { createMockStripe, MockStripe } from '../stripe.mock.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig /*, type IMockSupabaseClient */ } from '../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../services/tokenWalletService.mock.ts';

Deno.test('StripePaymentAdapter: initiatePayment', async (t) => {
  
  let mockStripe: MockStripe;
  let mockSupabaseSetup: ReturnType<typeof createMockSupabaseClient>;
  let mockTokenWalletService: MockTokenWalletService;
  let adapter: StripePaymentAdapter;

  const MOCK_SITE_URL = 'http://localhost:3000';
  const MOCK_WEBHOOK_SECRET = 'whsec_test_dummy';

  const setupMocksAndAdapter = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    Deno.env.set('SITE_URL', MOCK_SITE_URL);
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

  const teardownMocks = () => {
    Deno.env.delete('SITE_URL');
    mockStripe.clearStubs();
    mockTokenWalletService.clearStubs();
  };

  await t.step('initiatePayment - happy path: successfully initiates payment', async () => {
    const purchaseRequest: PurchaseRequest = {
      userId: 'user-happy-path',
      itemId: 'item-standard-plan',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const planData = { stripe_price_id: 'price_standard', tokens_awarded: 1000, item_id: purchaseRequest.itemId };
    const walletData = { walletId: 'wallet-for-user-happy-path', balance: '500', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: purchaseRequest.userId } as TokenWallet;
    const paymentTxnData = { id: 'ptxn_happy_path_123', user_id: purchaseRequest.userId, item_id: purchaseRequest.itemId };
    const stripeSessionData = { 
      id: 'cs_test_happy_path_456', 
      url: 'https://stripe.com/pay/happy_path', 
      client_secret: null,
      object: 'checkout.session',
      status: 'open',
      livemode: false,
      lastResponse: {
        headers: {},
        requestId: 'req_test_happy_path',
        statusCode: 200,
        apiVersion: undefined,
        idempotencyKey: undefined,
        stripeAccount: undefined,
      }
    } as Stripe.Response<Stripe.Checkout.Session>;

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === purchaseRequest.itemId)) {
              return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
          }
        },
        'payment_transactions': {
          upsert: async (_state) => {
            return { data: [paymentTxnData], error: null, count: 1, status: 201, statusText: 'Created' };
          },
          select: async (state) => {
            if (state.selectColumns === 'id' && state.filters.length === 0 && state.upsertData) {
              return { data: [{ id: paymentTxnData.id }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
          }
        }
      }
    };
    
    setupMocksAndAdapter(supabaseConfig);

    if (mockTokenWalletService.stubs.getWalletForContext?.restore) mockTokenWalletService.stubs.getWalletForContext.restore();
    mockTokenWalletService.stubs.getWalletForContext = stub(mockTokenWalletService, "getWalletForContext", () => Promise.resolve(walletData)) as any;
    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.resolve(stripeSessionData)) as any;

    const result = await adapter.initiatePayment(purchaseRequest);

    assert(result.success, 'Payment initiation should be successful');
    assertEquals(result.transactionId, paymentTxnData.id, 'Incorrect transactionId');
    assertEquals(result.paymentGatewayTransactionId, stripeSessionData.id, 'Incorrect paymentGatewayTransactionId');
    assertEquals(result.redirectUrl, stripeSessionData.url ?? undefined, 'Incorrect redirectUrl');
    assertEquals(result.clientSecret, stripeSessionData.client_secret ?? undefined, 'Incorrect clientSecret');
    
    assertEquals(mockTokenWalletService.stubs.getWalletForContext.calls.length, 1);
    assertEquals(mockTokenWalletService.stubs.getWalletForContext.calls[0].args[0], purchaseRequest.userId);
    assertEquals(mockTokenWalletService.stubs.getWalletForContext.calls[0].args[1], undefined);

    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0);

    teardownMocks();
  });

  await t.step('initiatePayment - error: wallet not found for context', async () => {
    const purchaseRequest: PurchaseRequest = {
      userId: 'user-no-wallet',
      itemId: 'item-basic',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const planData = { stripe_price_id: 'price_basic', tokens_awarded: 100, item_id: purchaseRequest.itemId };
    
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async () => ({ data: [planData], error: null, count: 1, status: 200, statusText: 'OK' })
        }
      }
    };
    setupMocksAndAdapter(supabaseConfig);
        
    if (mockTokenWalletService.stubs.getWalletForContext?.restore) mockTokenWalletService.stubs.getWalletForContext.restore();
    mockTokenWalletService.stubs.getWalletForContext = stub(mockTokenWalletService, "getWalletForContext", () => Promise.resolve(null)) as any;
    
    const result = await adapter.initiatePayment(purchaseRequest);

    assert(!result.success, 'Payment initiation should fail');
    assertEquals(result.error, 'User/Organization wallet not found. Please ensure a wallet is provisioned before payment.');
    
    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0);

    teardownMocks();
  });

  await t.step('initiatePayment - error: item ID not found (stripe_plans select returns empty)', async () => {
    const purchaseRequest: PurchaseRequest = {
      userId: 'user-item-not-found',
      itemId: 'item-nonexistent',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const walletData = { walletId: 'wallet-for-user-item-not-found', balance: '100', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: purchaseRequest.userId } as TokenWallet;

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async () => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }) // No plan found
        }
      }
    };
    setupMocksAndAdapter(supabaseConfig);

    if (mockTokenWalletService.stubs.getWalletForContext?.restore) mockTokenWalletService.stubs.getWalletForContext.restore();
    mockTokenWalletService.stubs.getWalletForContext = stub(mockTokenWalletService, "getWalletForContext", () => Promise.resolve(walletData)) as any;

    const result = await adapter.initiatePayment(purchaseRequest);

    assert(!result.success, 'Payment initiation should fail when item ID is not found');
    assertEquals(result.error, `Item ID ${purchaseRequest.itemId} not found or invalid.`);
    
    // Ensure Stripe was not called by checking the default spy on the instance.
    assert((mockStripe.instance.checkout.sessions.create as any).calls.length === 0, "Stripe checkout session creation should not be attempted");

    teardownMocks();
  });

  await t.step('initiatePayment - error: Supabase error during payment_transactions upsert', async () => {
    const purchaseRequest: PurchaseRequest = {
      userId: 'user-db-error',
      itemId: 'item-causes-db-error',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const planData = { stripe_price_id: 'price_db_error', tokens_awarded: 200, item_id: purchaseRequest.itemId };
    const walletData = { walletId: 'wallet-for-user-db-error', balance: '0', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: purchaseRequest.userId } as TokenWallet;
    const dbError = { message: 'Database upsert failed', code: 'PGRST_ERROR_CODE', details: 'Mock DB error details', hint: 'Mock hint', name: 'DbError' };

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async () => ({ data: [planData], error: null, count: 1, status: 200, statusText: 'OK' })
        },
        'payment_transactions': {
          upsert: async () => ({ data: null, error: dbError as Error, count: 0, status: 500, statusText: 'Internal Server Error' }), // DB error
          select: async (state) => {
            if (state.selectColumns === 'id' && state.upsertData) {
              return { data: null, error: dbError as Error, count: 0, status: 500, statusText: 'Internal Server Error' };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
          }
        }
      }
    };
    setupMocksAndAdapter(supabaseConfig);

    if (mockTokenWalletService.stubs.getWalletForContext?.restore) mockTokenWalletService.stubs.getWalletForContext.restore();
    mockTokenWalletService.stubs.getWalletForContext = stub(mockTokenWalletService, "getWalletForContext", () => Promise.resolve(walletData)) as any;

    const result = await adapter.initiatePayment(purchaseRequest);

    assert(!result.success, 'Payment initiation should fail on DB error during upsert');
    assertEquals(result.error, 'Failed to initialize payment record.');
    
    // Ensure Stripe was not called by checking the default spy on the instance.
    assert((mockStripe.instance.checkout.sessions.create as any).calls.length === 0, "Stripe checkout session creation should not be attempted on DB error");

    teardownMocks();
  });

  await t.step('initiatePayment - error: Stripe checkout session creation fails', async () => {
    const purchaseRequest: PurchaseRequest = {
      userId: 'user-stripe-error',
      itemId: 'item-causes-stripe-error',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const planData = { stripe_price_id: 'price_stripe_error', tokens_awarded: 300, item_id: purchaseRequest.itemId };
    const walletData = { walletId: 'wallet-for-user-stripe-error', createdAt: new Date(), updatedAt: new Date(), userId: purchaseRequest.userId, balance: '0', currency: 'AI_TOKEN' } as TokenWallet;
    const paymentTxnData = { id: 'ptxn_stripe_error_789' };
    const stripeError = new Error('Mock Stripe API error');

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async () => ({ data: [planData], error: null, count: 1, status: 200, statusText: 'OK' })
        },
        'payment_transactions': {
          upsert: async () => ({ data: [paymentTxnData], error: null, count: 1, status: 201, statusText: 'Created' }),
          select: async (state) => {
            if (state.selectColumns === 'id' && state.upsertData) {
              return { data: [{ id: paymentTxnData.id }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
          }
        }
      }
    };
    setupMocksAndAdapter(supabaseConfig);

    if (mockTokenWalletService.stubs.getWalletForContext?.restore) mockTokenWalletService.stubs.getWalletForContext.restore();
    mockTokenWalletService.stubs.getWalletForContext = stub(mockTokenWalletService, "getWalletForContext", () => Promise.resolve(walletData)) as any;
    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.reject(stripeError)) as any; // Stripe error

    const result = await adapter.initiatePayment(purchaseRequest);

    assert(!result.success, 'Payment initiation should fail when Stripe API errors');
    assert(result.error?.includes(stripeError.message), 'Error message should indicate Stripe API error');
    
    assert(mockStripe.stubs.checkoutSessionsCreate.calls.length === 1, "Stripe checkout session creation should have been attempted once");

    teardownMocks();
  });

});

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

  await t.step('handleWebhook - checkout.session.completed: success path', async () => {
    const mockStripeEventDataObject: Partial<Stripe.Checkout.Session> = {
      id: MOCK_STRIPE_CHECKOUT_SESSION_ID,
      object: 'checkout.session', // Essential for type discrimination
      payment_intent: MOCK_STRIPE_PAYMENT_INTENT_ID,
      status: 'complete',
      // IMPORTANT: StripePaymentAdapter uses 'client_reference_id' or 'metadata.internal_payment_id'
      // Ensure one of these is correctly populated based on adapter logic.
      // Let's assume client_reference_id is preferred if available from Stripe.
      client_reference_id: MOCK_PAYMENT_TRANSACTION_ID, 
      metadata: { 
        // metadata can still exist, but client_reference_id is often cleaner if Stripe populates it from your initial request
        internal_payment_id: MOCK_PAYMENT_TRANSACTION_ID, 
        user_id: MOCK_USER_ID, 
      },
      amount_total: 2000, 
      currency: 'usd',
      // Add any other fields from Stripe.Checkout.Session that your adapter code might access.
      // e.g., livemode, customer_details, etc. if they influence logic.
    };

    const mockStripeEvent: Stripe.Event = {
      id: 'evt_test_webhook_event',
      object: 'event',
      api_version: '2020-08-27', // Or your target API version
      created: Math.floor(Date.now() / 1000),
      data: {
        object: mockStripeEventDataObject as Stripe.Checkout.Session, 
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_webhook', idempotency_key: null },
      type: 'checkout.session.completed',
    };
    const mockPendingPaymentTransaction = {
      id: MOCK_PAYMENT_TRANSACTION_ID,
      user_id: MOCK_USER_ID,
      target_wallet_id: MOCK_WALLET_ID,
      status: 'PENDING',
      tokens_to_award: TOKENS_TO_AWARD,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: MOCK_STRIPE_CHECKOUT_SESSION_ID,
    };
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === MOCK_PAYMENT_TRANSACTION_ID)) {
              return { data: [mockPendingPaymentTransaction], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: null, count: 0, status: 404, statusText: 'Not Found' };
          },
          update: async (state) => {
            const updateData = state.updateData as { status?: string; gateway_transaction_id?: string; [key:string]: unknown };
            if (
              state.filters.some(f => f.column === 'id' && f.value === MOCK_PAYMENT_TRANSACTION_ID) &&
              updateData?.status === 'COMPLETED' &&
              updateData?.gateway_transaction_id === MOCK_STRIPE_CHECKOUT_SESSION_ID
            ) {
              return { data: [{ ...mockPendingPaymentTransaction, status: 'COMPLETED', gateway_transaction_id: MOCK_STRIPE_CHECKOUT_SESSION_ID }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock DB update failed condition check'), count: 0, status: 500, statusText: 'Mock Error' };
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEvent) as any;

    if (mockTokenWalletService.stubs.recordTransaction?.restore) mockTokenWalletService.stubs.recordTransaction.restore();
    mockTokenWalletService.stubs.recordTransaction = stub(mockTokenWalletService, "recordTransaction", async (params: Parameters<ITokenWalletService['recordTransaction']>[0]) => {
      assertEquals(params.walletId, MOCK_WALLET_ID);
      assertEquals(params.type, 'CREDIT_PURCHASE');
      assertEquals(params.amount, String(TOKENS_TO_AWARD));
      assertEquals(params.relatedEntityId, MOCK_PAYMENT_TRANSACTION_ID);
      assertEquals(params.recordedByUserId, MOCK_USER_ID);
      return {
        transactionId: 'txn_new_credit_123',
        walletId: params.walletId,
        type: params.type,
        amount: params.amount,
        balanceAfterTxn: String(TOKENS_TO_AWARD),
        recordedByUserId: params.recordedByUserId,
        relatedEntityId: params.relatedEntityId,
        timestamp: new Date(),
      } as TokenWalletTransaction;
    }) as any;

    const rawBody = JSON.stringify(mockStripeEvent); 
    const signature = 'mock_stripe_signature';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(result.success, `Webhook handling should be successful: ${result.error}`);
    assertEquals(result.transactionId, MOCK_PAYMENT_TRANSACTION_ID, 'Incorrect transactionId returned');
    assertEquals(result.tokensAwarded, TOKENS_TO_AWARD, 'Tokens awarded should match');
    if (result.error) { console.warn("Success path had an error message:", result.error); }

    assertEquals(mockStripe.stubs.webhooksConstructEvent.calls.length, 1);
    assertEquals(mockStripe.stubs.webhooksConstructEvent.calls[0].args[0], rawBody);
    assertEquals(mockStripe.stubs.webhooksConstructEvent.calls[0].args[1], signature);
    assertEquals(mockStripe.stubs.webhooksConstructEvent.calls[0].args[2], MOCK_WEBHOOK_SECRET);

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 1, 'TokenWalletService.recordTransaction was not called exactly once');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - error: webhook signature failure', async () => {
    setupMocksAndAdapterForWebhook(); 

    const mockErrorMessage = 'Webhook signature verification failed.';
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => {
      throw new Error(mockErrorMessage);
    }) as any;

    const rawBody = JSON.stringify({ id: 'evt_test_bad_sig', type: 'checkout.session.completed' });
    const signature = 'invalid_stripe_signature';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(!result.success, 'Webhook handling should fail on signature verification error');
    assertEquals(result.error, mockErrorMessage, 'Error message should indicate signature failure');
    assertEquals(result.transactionId, '', 'Transaction ID should be empty on signature failure');

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should not be called on signature failure');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - info: event type not handled', async () => {
    setupMocksAndAdapterForWebhook();

    const mockUnhandledStripeEvent: Stripe.Event = {
      id: 'evt_test_unhandled_type',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'sub_some_subscription_id' } as any },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_unhandled', idempotency_key: null },
      type: 'customer.subscription.created', 
    };

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockUnhandledStripeEvent) as any;

    const rawBody = JSON.stringify(mockUnhandledStripeEvent);
    const signature = 'mock_stripe_signature_valid_for_unhandled';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(result.success, 'Webhook handling should be reported as successful for unhandled event types to prevent Stripe retries');
    assertEquals(result.transactionId, '', 'Transaction ID should be empty for unhandled event types');
    assertEquals(result.error, 'Webhook event type not explicitly handled but acknowledged.', 'Error message should confirm event type not handled');

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should not be called for unhandled event types');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - error: transaction not found in DB', async () => {
    const mockStripeEventNotFound: Stripe.Event = {
      id: 'evt_test_txn_not_found',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { 
          id: 'cs_test_some_other_session',
          object: 'checkout.session',
          payment_intent: 'pi_test_some_other_pi',
          status: 'complete',
          metadata: {
            internal_payment_id: 'ptxn_id_that_does_not_exist_in_db',
            user_id: MOCK_USER_ID,
          },
          client_reference_id: null,
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_txn_not_found', idempotency_key: null },
      type: 'checkout.session.completed',
    };
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => { 
            if (state.filters.some(f => f.column === 'id' && f.value === 'ptxn_id_that_does_not_exist_in_db')) {
                return { data: [], error: null, count: 0, status: 200, statusText: 'OK' }; 
            }
            return { data: [], error: new Error('Unexpected select query in txn_not_found test'), count: 0, status: 500, statusText: 'Error' }; 
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEventNotFound) as any;

    const rawBody = JSON.stringify(mockStripeEventNotFound);
    const signature = 'mock_stripe_signature_valid_for_not_found';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(!result.success, 'Webhook handling should fail if original transaction not found');
    assertEquals(result.error, 'Payment record not found.', 'Error message should confirm transaction not found');
    assertEquals(result.transactionId, 'ptxn_id_that_does_not_exist_in_db');

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should not be called');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - info: transaction already processed (COMPLETED)', async () => {
    const MOCK_ALREADY_COMPLETED_PAYMENT_TX_ID = 'ptxn_already_completed_789';
    const mockStripeEventAlreadyProcessed: Stripe.Event = {
      id: 'evt_test_txn_already_done',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { 
          id: 'cs_test_already_done_session',
          object: 'checkout.session',
          payment_intent: 'pi_test_already_done_pi',
          status: 'complete', 
          metadata: {
            internal_payment_id: MOCK_ALREADY_COMPLETED_PAYMENT_TX_ID,
            user_id: MOCK_USER_ID,
          },
          client_reference_id: null,
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_txn_already_done', idempotency_key: null },
      type: 'checkout.session.completed',
    };
    const mockAlreadyCompletedTransaction = {
      id: MOCK_ALREADY_COMPLETED_PAYMENT_TX_ID,
      user_id: MOCK_USER_ID,
      target_wallet_id: MOCK_WALLET_ID,
      status: 'COMPLETED', 
      tokens_to_award: TOKENS_TO_AWARD,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: 'pi_test_already_done_pi',
    };
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === MOCK_ALREADY_COMPLETED_PAYMENT_TX_ID)) {
              return { data: [mockAlreadyCompletedTransaction], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Unexpected select in already_processed test'), count: 0, status: 500, statusText: 'Error' };
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEventAlreadyProcessed) as any;

    const rawBody = JSON.stringify(mockStripeEventAlreadyProcessed);
    const signature = 'mock_stripe_signature_valid_for_already_done';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(result.success, 'Webhook handling should be successful for already processed transaction to prevent retries');
    assertEquals(result.transactionId, MOCK_ALREADY_COMPLETED_PAYMENT_TX_ID);
    assertEquals(result.error, undefined);

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should NOT be called for an already processed transaction');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - error: Supabase error during payment_transactions update', async () => {
    const MOCK_DB_ERROR_PAYMENT_TX_ID = 'ptxn_db_update_fails_123';
    const mockStripeEventForDbError: Stripe.Event = {
      id: 'evt_test_db_update_fail',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { 
          id: 'cs_test_db_update_fail_session',
          object: 'checkout.session',
          payment_intent: 'pi_test_db_update_fail_pi',
          status: 'complete',
          metadata: {
            internal_payment_id: MOCK_DB_ERROR_PAYMENT_TX_ID,
            user_id: MOCK_USER_ID,
          },
          client_reference_id: null,
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_db_update_fail', idempotency_key: null },
      type: 'checkout.session.completed',
    };
    const mockPendingTransactionForDbError = {
      id: MOCK_DB_ERROR_PAYMENT_TX_ID,
      user_id: MOCK_USER_ID,
      target_wallet_id: MOCK_WALLET_ID,
      status: 'PENDING', 
      tokens_to_award: TOKENS_TO_AWARD,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: 'cs_test_db_update_fail_session',
    };
    const mockDbUpdateErrorMessage = 'Mock Supabase DB update error';
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === MOCK_DB_ERROR_PAYMENT_TX_ID)) {
              return { data: [mockPendingTransactionForDbError], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Unexpected select in db_update_error test'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state) => { 
             if (state.filters.some(f => f.column === 'id' && f.value === MOCK_DB_ERROR_PAYMENT_TX_ID)) {
                return { data: null, error: new Error(mockDbUpdateErrorMessage), count: 0, status: 500, statusText: 'Internal Server Error' };
            }
            return { data:null, error: new Error('Unexpected update in db_update_error test'), count: 0, status: 500, statusText: 'Error' };
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEventForDbError) as any;

    const rawBody = JSON.stringify(mockStripeEventForDbError);
    const signature = 'mock_stripe_signature_valid_for_db_error';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(!result.success, 'Webhook handling should fail if Supabase update fails');
    assertEquals(result.error, 'Failed to update payment status.', 'Error message should confirm DB update failure');
    assertEquals(result.transactionId, MOCK_DB_ERROR_PAYMENT_TX_ID);

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should NOT be called if DB update fails');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - error: TokenWalletService error during recordTransaction', async () => {
    const MOCK_TOKEN_SERVICE_ERROR_TX_ID = 'ptxn_token_svc_err_456';
    const mockStripeEventForTokenServiceError: Stripe.Event = {
      id: 'evt_test_token_svc_fail',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { 
          id: 'cs_test_token_svc_fail_session',
          object: 'checkout.session',
          payment_intent: 'pi_test_token_svc_fail_pi',
          status: 'complete',
          metadata: {
            internal_payment_id: MOCK_TOKEN_SERVICE_ERROR_TX_ID,
            user_id: MOCK_USER_ID,
          },
          client_reference_id: null,
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_token_svc_fail', idempotency_key: null },
      type: 'checkout.session.completed',
    };
    const mockPendingTransactionForTokenError = {
      id: MOCK_TOKEN_SERVICE_ERROR_TX_ID,
      user_id: MOCK_USER_ID,
      target_wallet_id: MOCK_WALLET_ID,
      status: 'PENDING', 
      tokens_to_award: TOKENS_TO_AWARD,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: 'cs_test_token_svc_fail_session',
    };
    const mockTokenServiceErrorMessage = 'Mock TokenWalletService recordTransaction error';
    
    const actualUpdateArgs: any[] = []; // Array to store arguments of update calls

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === MOCK_TOKEN_SERVICE_ERROR_TX_ID)) {
              return { data: [mockPendingTransactionForTokenError], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Unexpected select in token_service_error test'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: { tableName: string; operation: string; updateData?: any; filters?: any[] }) => {
            if (state.updateData) {
              actualUpdateArgs.push(state.updateData);
            }
            // Return a generic success, as the adapter doesn't critically check the update result beyond it not failing.
            return { data: [state.updateData || {}], error: null, count: 1, status: 200, statusText: 'OK' };
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEventForTokenServiceError) as any;

    if (mockTokenWalletService.stubs.recordTransaction?.restore) mockTokenWalletService.stubs.recordTransaction.restore();
    mockTokenWalletService.stubs.recordTransaction = stub(mockTokenWalletService, "recordTransaction", async () => {
      throw new Error(mockTokenServiceErrorMessage);
    }) as any;

    const rawBody = JSON.stringify(mockStripeEventForTokenServiceError);
    const signature = 'mock_stripe_signature_valid_for_token_svc_error';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(!result.success, 'Webhook handling should fail if TokenWalletService recordTransaction fails');
    assertEquals(result.error, 'Token award failed after payment.');
    assertEquals(result.transactionId, MOCK_TOKEN_SERVICE_ERROR_TX_ID);

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 1, 'TokenWalletService.recordTransaction should have been called once');

    assertEquals(actualUpdateArgs.length, 2, 'Supabase payment_transactions.update should be called twice');
    
    // First call: update to COMPLETED
    const firstUpdateArg = actualUpdateArgs.find(arg => arg.status === 'COMPLETED');
    assert(firstUpdateArg, 'Expected an update call to set status to COMPLETED');
    assert(firstUpdateArg.gateway_transaction_id === mockStripeEventForTokenServiceError.data.object.id, 'First update call should set gateway_transaction_id');
    
    // Second call: update to TOKEN_AWARD_FAILED
    const secondUpdateArg = actualUpdateArgs.find(arg => arg.status === 'TOKEN_AWARD_FAILED');
    assert(secondUpdateArg, 'Expected an update call to set status to TOKEN_AWARD_FAILED');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - checkout.session.async_payment_failed: updates transaction to FAILED', async () => {
    const MOCK_FAILED_PAYMENT_TX_ID = 'ptxn_async_fail_789';
    const mockStripeEventAsyncFail: Stripe.Event = {
      id: 'evt_test_async_fail',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { 
          id: 'cs_test_async_fail_session',
          object: 'checkout.session',
          metadata: {
            internal_payment_id: MOCK_FAILED_PAYMENT_TX_ID,
            user_id: MOCK_USER_ID,
          },
          status: 'open', 
          payment_intent: null,
          client_reference_id: null,
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_async_fail', idempotency_key: null },
      type: 'checkout.session.async_payment_failed',
    };
    const mockPendingTransactionForAsyncFail = {
      id: MOCK_FAILED_PAYMENT_TX_ID,
      user_id: MOCK_USER_ID,
      target_wallet_id: MOCK_WALLET_ID, 
      status: 'PENDING', 
      tokens_to_award: TOKENS_TO_AWARD, 
      payment_gateway_id: 'stripe',
      gateway_transaction_id: 'cs_test_async_fail_session',
    };
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === MOCK_FAILED_PAYMENT_TX_ID)) {
              return { data: [mockPendingTransactionForAsyncFail], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Unexpected select in async_payment_failed test'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state) => {
            const updateData = state.updateData as { status?: string; [key:string]: unknown };
            if (
              state.filters.some(f => f.column === 'id' && f.value === MOCK_FAILED_PAYMENT_TX_ID) &&
              updateData?.status === 'FAILED'
            ) {
              return { data: [{ ...mockPendingTransactionForAsyncFail, status: 'FAILED' }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock DB update to FAILED failed condition check'), count: 0, status: 500, statusText: 'Mock Error' };
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEventAsyncFail) as any;

    const rawBody = JSON.stringify(mockStripeEventAsyncFail);
    const signature = 'mock_stripe_signature_valid_for_async_fail';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(!result.success, 'Webhook handling for a failed payment should indicate overall failure');
    assertEquals(result.transactionId, MOCK_FAILED_PAYMENT_TX_ID);
    assertEquals(result.error, 'Payment failed as per Stripe.', 'Error message should indicate payment failure');

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should NOT be called for a failed payment');

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - checkout.session.expired: updates transaction to EXPIRED', async () => {
    const MOCK_EXPIRED_PAYMENT_TX_ID = 'ptxn_expired_session_000';
    const mockStripeEventExpired: Stripe.Event = {
      id: 'evt_test_session_expired',
      object: 'event',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { 
          id: 'cs_test_expired_session',
          object: 'checkout.session',
          metadata: {
            internal_payment_id: MOCK_EXPIRED_PAYMENT_TX_ID,
            user_id: MOCK_USER_ID, 
          },
          status: 'expired', 
          payment_intent: null,
          client_reference_id: null,
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_test_session_expired', idempotency_key: null },
      type: 'checkout.session.expired',
    };
    const mockPendingTransactionForExpired = {
      id: MOCK_EXPIRED_PAYMENT_TX_ID,
      user_id: MOCK_USER_ID,
      target_wallet_id: MOCK_WALLET_ID,
      status: 'PENDING',
      tokens_to_award: TOKENS_TO_AWARD,
      payment_gateway_id: 'stripe',
      gateway_transaction_id: 'cs_test_expired_session',
    };
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        payment_transactions: {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === MOCK_EXPIRED_PAYMENT_TX_ID)) {
              return { data: [mockPendingTransactionForExpired], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Unexpected select in session.expired test'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state) => {
            const updateData = state.updateData as { status?: string; [key:string]: unknown };
            if (
              state.filters.some(f => f.column === 'id' && f.value === MOCK_EXPIRED_PAYMENT_TX_ID) &&
              updateData?.status === 'EXPIRED' 
            ) {
              return { data: [{ ...mockPendingTransactionForExpired, status: 'EXPIRED' }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock DB update to EXPIRED failed condition check'), count: 0, status: 500, statusText: 'Mock Error' };
          },
        },
      },
    };

    setupMocksAndAdapterForWebhook(supabaseConfig);
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload, _sig, _secret) => mockStripeEventExpired) as any;

    const rawBody = JSON.stringify(mockStripeEventExpired);
    const signature = 'mock_stripe_signature_valid_for_expired';

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBody, signature);

    assert(result.success, 'Webhook handling should be successful for session.expired to prevent retries');
    assertEquals(result.transactionId, MOCK_EXPIRED_PAYMENT_TX_ID);
    assertEquals(result.error, `Payment transaction ${MOCK_EXPIRED_PAYMENT_TX_ID} marked as EXPIRED.`);

    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, 'TokenWalletService.recordTransaction should NOT be called for an expired session');

    teardownWebhookMocks();
  });

}); 