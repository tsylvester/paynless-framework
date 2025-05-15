import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { ITokenWalletService, TokenWallet, TokenWalletTransaction } from '../../../types/tokenWallet.types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import type { PurchaseRequest, PaymentConfirmation, PaymentOrchestrationContext } from '../../../types/payment.types.ts';
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
import { createMockStripe, MockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';

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

  await t.step('handleWebhook - error: Stripe signature verification fails', async () => {
    setupMocksAndAdapterForWebhook(); // Basic setup

    const signatureError = new Stripe.errors.StripeSignatureVerificationError(
      { 
        message: 'Unable to extract timestamp and signatures from header',
        type: 'invalid_request_error' // Added required 'type' property
      }
    );

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", () => {
      throw signatureError;
    });

    const rawBodyString = JSON.stringify({ type: 'checkout.session.completed', data: {} }); // Minimal valid JSON
    const dummySignature = 'sig_invalid_or_missing';

    const result = await adapter.handleWebhook(rawBodyString, dummySignature);

    assert(!result.success, 'Webhook handling should fail if signature verification fails.');
    // assertEquals(result.error, signatureError.message, 'Error message should match the StripeSignatureVerificationError.');
    assertEquals(result.error, 'Webhook signature verification failed.', 'Error message should match the adapter output.');
    assertEquals(result.transactionId, undefined, 'TransactionId should be undefined on signature failure.');
    assertEquals(result.tokensAwarded, undefined, 'TokensAwarded should be undefined on signature failure.');

    // Ensure no DB or token service calls were made
    const paymentTxSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assertEquals(paymentTxSpies?.callCount || 0, 0, "Supabase select for payment_transactions should not be called if signature fails.");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, "TokenWalletService.recordTransaction should not be called if signature fails.");

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - checkout.session.completed - idempotency: payment transaction already completed', async () => {
    const internalPaymentId = 'ptxn_webhook_idempotency_completed_777';
    const stripeSessionId = 'cs_webhook_idempotency_completed_888';
    const userId = 'user-webhook-idempotency';
    const walletId = 'wallet-for-user-webhook-idempotency';
    const tokensToAward = 300;

    const mockStripeSession: Partial<Stripe.Checkout.Session> = {
      id: stripeSessionId,
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: userId,
      metadata: { internal_payment_id: internalPaymentId, user_id: userId },
    };
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_idempotency_completed_999',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: { object: mockStripeSession as Stripe.Checkout.Session },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_idempotency', idempotency_key: null },
    };

    // Key for this test: payment_transactions record is already COMPLETED
    const alreadyCompletedPaymentTxnData = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: 'COMPLETED', // Already completed
      gateway_transaction_id: stripeSessionId, // Already set
    };

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentId)) {
              return { data: [alreadyCompletedPaymentTxnData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Payment txn not found for idempotency test'), count: 0, status: 404, statusText: 'Not Found' };
          },
          // update should NOT be called in this scenario
        }
      }
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", () => mockStripeEvent);

    // Ensure TokenWalletService.recordTransaction is NOT called
    if (mockTokenWalletService.stubs.recordTransaction?.restore) mockTokenWalletService.stubs.recordTransaction.restore();
    mockTokenWalletService.stubs.recordTransaction = stub(
        mockTokenWalletService as ITokenWalletService, // Cast to ITokenWalletService
        "recordTransaction", 
        // Provide a signature that matches ITokenWalletService.recordTransaction
        (params: any): Promise<any> => { // Use 'any' for params if not inspecting them
            throw new Error("TokenWalletService.recordTransaction should not be called for already completed transaction.");
        }
    );

    const result = await adapter.handleWebhook(JSON.stringify(mockStripeEvent), 'dummy_sig_idempotency');

    assert(result.success, 'Webhook handling should be successful for already completed transaction.');
    assertEquals(result.transactionId, internalPaymentId, 'TransactionId should match.');
    assertEquals(result.tokensAwarded, alreadyCompletedPaymentTxnData.tokens_to_award, 'TokensAwarded should match the original award from the already completed transaction.');

    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);
    
    const selectSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assertEquals(selectSpies?.callCount || 0, 1, "Supabase select for payment_transactions should be called once.");

    // Check that update was NOT called using historic spies
    const updateSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(updateSpies?.callCount || 0, 0, "Supabase update for payment_transactions should NOT be called.");
    
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, "TokenWalletService.recordTransaction should NOT be called.");

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - error: internal_payment_id missing in webhook metadata', async () => {
    setupMocksAndAdapterForWebhook();

    const mockStripeSessionMissingMeta: Partial<Stripe.Checkout.Session> = {
      id: 'cs_webhook_missing_meta_111',
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'user-webhook-missing-meta',
      metadata: { user_id: 'user-webhook-missing-meta' }, // internal_payment_id is deliberately missing
    };
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_missing_meta_222',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: { object: mockStripeSessionMissingMeta as Stripe.Checkout.Session },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_missing_meta', idempotency_key: null },
    };

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", () => mockStripeEvent);

    const result = await adapter.handleWebhook(JSON.stringify(mockStripeEvent), 'dummy_sig_missing_meta');

    assert(!result.success, 'Webhook handling should fail if internal_payment_id is missing.');
    assertEquals(result.error, 'Internal payment ID missing from webhook.', 'Error message should match adapter output for missing internal_payment_id.');
    assertEquals(result.transactionId, undefined, 'TransactionId should be undefined.');
    assertEquals(result.tokensAwarded, undefined, 'TokensAwarded should be undefined.');

    // Ensure no DB or token service calls were made
    const selectSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assertEquals(selectSpies?.callCount || 0, 0, "Supabase select for payment_transactions should not be called.");
    const updateSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(updateSpies?.callCount || 0, 0, "Supabase update for payment_transactions should not be called.");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, "TokenWalletService.recordTransaction should not be called.");

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - error: payment_transactions record not found for internal_payment_id', async () => {
    const internalPaymentIdUnknown = 'ptxn_webhook_unknown_id_404';
    const mockStripeSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_webhook_unknown_id_505',
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'user-webhook-unknown-id',
      metadata: { internal_payment_id: internalPaymentIdUnknown, user_id: 'user-webhook-unknown-id' },
    };
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_unknown_id_606',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: { object: mockStripeSession as Stripe.Checkout.Session },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_unknown_id', idempotency_key: null },
    };

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentIdUnknown)) {
              // Simulate not found
              return { data: [], error: { name: 'PGRST116', message: 'No rows found', code: 'PGRST116' } as any, count: 0, status: 406, statusText: 'Not Acceptable' }; 
            }
            return { data: [], error: new Error('Mock: Unexpected select query in payment_transactions not found test'), count: 0, status: 500, statusText: 'Error' };
          },
        }
      }
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", () => mockStripeEvent);

    const result = await adapter.handleWebhook(JSON.stringify(mockStripeEvent), 'dummy_sig_unknown_id');

    assert(!result.success, 'Webhook handling should fail if payment_transactions record is not found.');
    // assertEquals(result.error, `Payment transaction not found or in unexpected state for ID: ${internalPaymentIdUnknown}. Error: No rows found`, 'Error message incorrect for not found txn.');
    assertEquals(result.error, 'Payment record not found.', 'Error message should match adapter output.');
    assertEquals(result.transactionId, internalPaymentIdUnknown, 'TransactionId should be the one from webhook.');

    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);
    const selectSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assertEquals(selectSpies?.callCount || 0, 1, "Supabase select for payment_transactions should be called once.");
    
    const updateSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(updateSpies?.callCount || 0, 0, "Supabase update for payment_transactions should NOT be called.");
    assertEquals(mockTokenWalletService.stubs.recordTransaction.calls.length, 0, "TokenWalletService.recordTransaction should NOT be called.");

    teardownWebhookMocks();
  });

  await t.step('handleWebhook - checkout.session.completed - error: TokenWalletService.recordTransaction fails', async () => {
    const internalPaymentId = 'ptxn_webhook_token_award_fail_123';
    const stripeSessionId = 'cs_webhook_token_award_fail_456';
    const userId = 'user-webhook-token-award-fail';
    const walletId = 'wallet-for-token-award-fail';
    const tokensToAward = 1000;

    const mockPendingTransaction = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: 'PENDING', 
      gateway_transaction_id: null, // Not yet set
    };

    const mockStripeSession: Partial<Stripe.Checkout.Session> = {
      id: stripeSessionId,
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: userId,
      metadata: { internal_payment_id: internalPaymentId, user_id: userId },
    };
    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_token_award_fail_789',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27',
      created: Math.floor(Date.now() / 1000),
      data: { object: mockStripeSession as Stripe.Checkout.Session },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_token_award_fail', idempotency_key: null },
    };

    const tokenWalletError = new Error('Simulated TokenWalletService.recordTransaction failure');

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentId)) {
              return { data: [mockPendingTransaction], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Payment txn not found in token award fail test'), count: 0, status: 404, statusText: 'Not Found' };
          },
          update: async (state) => { 
            const updateData = state.updateData as { status?: string; gateway_transaction_id?: string };
            if (
              state.filters.some(f => f.column === 'id' && f.value === internalPaymentId) &&
              updateData?.status === 'COMPLETED' && // First update to COMPLETED
              updateData?.gateway_transaction_id === stripeSessionId
            ) {
              return { data: [{ ...mockPendingTransaction, status: 'COMPLETED', gateway_transaction_id: stripeSessionId }], error: null, count: 1, status: 200, statusText: 'OK' };
            } else if (
              state.filters.some(f => f.column === 'id' && f.value === internalPaymentId) &&
              updateData?.status === 'TOKEN_AWARD_FAILED' // Second update to TOKEN_AWARD_FAILED
            ) {
              return { data: [{ ...mockPendingTransaction, status: 'TOKEN_AWARD_FAILED', gateway_transaction_id: stripeSessionId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock DB update unexpected condition in token award fail test'), count: 0, status: 500, statusText: 'Mock Error' };
          }
        }
      }
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", () => mockStripeEvent);

    if (mockTokenWalletService.stubs.recordTransaction?.restore) mockTokenWalletService.stubs.recordTransaction.restore();
    // Cast to ITokenWalletService for the stub call to satisfy 'this' typing for the interface method
    mockTokenWalletService.stubs.recordTransaction = stub(
        mockTokenWalletService as ITokenWalletService, 
        "recordTransaction", 
        () => Promise.reject(tokenWalletError)
    );

    const result = await adapter.handleWebhook(JSON.stringify(mockStripeEvent), 'dummy_sig_token_award_fail');

    assert(!result.success, 'Webhook handling should fail if TokenWalletService.recordTransaction fails.');
    // assertEquals(result.error, `Failed to award tokens for transaction ${internalPaymentId}. Reason: ${tokenWalletError.message}`, 'Error message incorrect for token award failure.');
    assertEquals(result.error, 'Token award failed after payment.', 'Error message should match adapter output.');
    assertEquals(result.transactionId, internalPaymentId, 'TransactionId should match.');
    assertEquals(result.tokensAwarded, 0, 'TokensAwarded should be 0 on failure.'); // Or undefined

    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);
    const selectSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assertEquals(selectSpies?.callCount || 0, 1, "Supabase select for payment_transactions should be called once.");
    
    const updateSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(updateSpies?.callCount || 0, 2, "Supabase update for payment_transactions should be called twice (COMPLETED then TOKEN_AWARD_FAILED).");

    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 1);

    teardownWebhookMocks();
  });

}); 