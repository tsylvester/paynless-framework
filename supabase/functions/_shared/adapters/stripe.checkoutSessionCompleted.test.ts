import { StripePaymentAdapter } from './stripePaymentAdapter.ts';
import type { ITokenWalletService, TokenWallet, TokenWalletTransaction } from '../types/tokenWallet.types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import type { PurchaseRequest, PaymentConfirmation, PaymentOrchestrationContext } from '../types/payment.types.ts';
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
import { createMockStripe, MockStripe } from '../stripe.mock.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig } from '../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../services/tokenWalletService.mock.ts';

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
      status: 'complete', // Important for this event type
      payment_status: 'paid', // For checkout.session.completed
      client_reference_id: userId,
      metadata: {
        internal_payment_id: internalPaymentId,
        user_id: userId,
        // item_id: 'item-otp-webhook' // Optional, if needed by token service notes
      },
      // other fields as necessary for your logic, e.g., amount_total, currency
    };

    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_otp_completed_789',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27', // Example API version
      created: Math.floor(Date.now() / 1000),
      data: {
        object: mockStripeSession as Stripe.Checkout.Session, // Cast here
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_otp', idempotency_key: null },
    };

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
          select: async (state) => {
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentId)) {
              return { data: [initialPaymentTxnData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Payment txn not found'), count: 0, status: 404, statusText: 'Not Found' };
          },
          update: async (state) => { // Should be called to update status to COMPLETED
            const updateData = state.updateData as { status?: string, gateway_transaction_id?: string }; // Type assertion for updateData
            if (state.filters.some(f => f.column === 'id' && f.value === internalPaymentId) && updateData?.status === 'COMPLETED') {
              return { data: [{ ...initialPaymentTxnData, status: 'COMPLETED', gateway_transaction_id: stripeSessionId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Payment txn update failed'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    // Mock stripe.webhooks.constructEvent
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload: any, _sig: any, _secret: any): Stripe.Event => {
      // Simulate payload verification and return the event object
      // In a real scenario, Stripe SDK would parse rawBodyString and verify signature
      return mockStripeEvent;
    });

    // Mock tokenWalletService.recordTransaction
    const mockTokenTxResult: TokenWalletTransaction = { 
        transactionId: 'tokentx_webhook_otp_123',
        walletId: walletId,
        type: 'CREDIT_PURCHASE',
        amount: tokensToAward.toString(),
        balanceAfterTxn: (parseInt(initialPaymentTxnData.status === 'PENDING' ? '0' : '0') + tokensToAward).toString(),
        recordedByUserId: userId,
        relatedEntityId: internalPaymentId,
        relatedEntityType: 'payment_transaction',
        timestamp: new Date(),
        notes: 'Tokens awarded from Stripe payment'
    };
    if (mockTokenWalletService.stubs.recordTransaction?.restore) mockTokenWalletService.stubs.recordTransaction.restore();
    // Attempt to remove 'as any' by ensuring the mock function signature matches
    mockTokenWalletService.stubs.recordTransaction = stub(
        mockTokenWalletService as ITokenWalletService, 
        "recordTransaction", 
        (params): Promise<TokenWalletTransaction> => {
            assertEquals(params.walletId, walletId);
            assertEquals(params.amount, tokensToAward.toString());
            assertEquals(params.type, 'CREDIT_PURCHASE');
            assertEquals(params.relatedEntityId, internalPaymentId);
            return Promise.resolve(mockTokenTxResult);
        }
    );

    // 4. Call handleWebhook
    const rawBodyString = JSON.stringify(mockStripeEvent); // Corrected: use the full event for rawBody
    const dummySignature = 'whsec_test_signature'; // Dummy signature, verification is mocked

    const result = await adapter.handleWebhook(rawBodyString, dummySignature);

    // 5. Assertions
    assert(result.success, `Webhook handling should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, internalPaymentId, 'Incorrect internal transactionId in result');
    assertEquals(result.tokensAwarded, tokensToAward, 'Incorrect tokensAwarded in result');

    // Check that constructEvent was called
    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);
    
    // Assert that from('payment_transactions') was called (at least for select and update)
    // Depending on the execution path, it might be called once (if update is skipped) or twice.
    assert(mockSupabaseSetup.spies.fromSpy.calls.some(call => call.args[0] === 'payment_transactions'), "from('payment_transactions') should have been called at least once.");
    const paymentTransactionsFromCalls = mockSupabaseSetup.spies.fromSpy.calls.filter(call => call.args[0] === 'payment_transactions').length;
    console.log(`DEBUG: from('payment_transactions') called ${paymentTransactionsFromCalls} times (OTP).`);

    // Check DB calls using getHistoricQueryBuilderSpies
    const selectSpiesInfo = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assert(selectSpiesInfo, "Historic select spies info should exist for payment_transactions (OTP)");
    assertEquals(selectSpiesInfo.callCount, 1, "select should have been called once on payment_transactions (OTP)");

    const updateSpiesInfo = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assert(updateSpiesInfo, "Historic update spies info should exist for payment_transactions (OTP)");
    assertEquals(updateSpiesInfo.callCount, 1, "update should have been called once on payment_transactions (OTP)");

    // Check token wallet service call
    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 1);
    const recordTxArgs = mockTokenWalletService.stubs.recordTransaction.calls[0].args[0];
    assertEquals(recordTxArgs.walletId, walletId, "recordTransaction called with incorrect walletId");
    assertEquals(recordTxArgs.amount, tokensToAward.toString(), "recordTransaction called with incorrect amount");
    assertEquals(recordTxArgs.type, 'CREDIT_PURCHASE', "recordTransaction called with incorrect type");

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
      current_period_start: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600) - 3600, // Approx 30 days from now
      cancel_at_period_end: false,
      // items: { data: [{ plan: { id: 'stripe_plan_id_mock' }, price: { id: 'stripe_price_id_mock' } }] } // if needed
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
          select: async (state: any) => {
            if (state.filters.some((f: any) => f.column === 'id' && f.value === internalPaymentId)) {
              return { data: [initialPaymentTxnData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Payment txn not found for subscription test'), count: 0, status: 404, statusText: 'Not Found' };
          },
          update: async (state: any) => { 
            const updateData = state.updateData as { status?: string, gateway_transaction_id?: string }; 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === internalPaymentId) && updateData?.status === 'COMPLETED') {
              return { data: [{ ...initialPaymentTxnData, status: 'COMPLETED', gateway_transaction_id: stripeSessionId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Payment txn update failed for subscription test'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': { // Mock for fetching internal plan_id
          select: async (state: any) => {
            if (state.filters.some((f: any) => f.column === 'item_id_internal' && f.value === itemIdInternal)) {
              return { data: [{ id: internalPlanId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error(`Mock: Subscription plan not found for item_id_internal ${itemIdInternal}`), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
        'user_subscriptions': { // Mock for upserting user subscription
          upsert: async (state: any) => {
            const upsertDataList = state.upsertData as any[]; // Assuming upsertData is an array
            if (upsertDataList && upsertDataList.length > 0) {
              const upsertData = upsertDataList[0]; // Taking the first item for validation
              if (upsertData.stripe_subscription_id === stripeSubscriptionId) {
                // Basic validation of upsert data
                assertEquals(upsertData.user_id, userId);
                assertEquals(upsertData.plan_id, internalPlanId);
                assertEquals(upsertData.status, mockStripeSubscriptionObject.status);
                return { data: [upsertData], error: null, count: 1, status: 200, statusText: 'OK' };
              }
            }
            return { data: null, error: new Error('Mock: User subscription upsert failed condition check'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };
    setupMocksAndAdapterForWebhook(supabaseConfig);

    // Mock stripe.webhooks.constructEvent
    if (mockStripe.stubs.webhooksConstructEvent?.restore) mockStripe.stubs.webhooksConstructEvent.restore();
    mockStripe.stubs.webhooksConstructEvent = stub(mockStripe.instance.webhooks, "constructEvent", (_payload: any, _sig: any, _secret: any): Stripe.Event => {
      return mockStripeEvent;
    });

    // Ensure subscriptionsRetrieve stub is available on mockStripe.stubs
    // This might require adjustment in your createMockStripe or how stubs are added.
    // For this example, assuming it can be added directly if not present or restored if it exists.
    if (mockStripe.stubs.subscriptionsRetrieve && typeof mockStripe.stubs.subscriptionsRetrieve.restore === 'function') {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", 
      async (id: string): Promise<Stripe.Response<Stripe.Subscription>> => {
        assertEquals(id, stripeSubscriptionId, "Stripe subscriptions.retrieve called with wrong ID");
        return Promise.resolve({
          ...mockStripeSubscriptionObject,
          lastResponse: { headers: {}, requestId: 'req_mock_sub_retrieve', statusCode: 200, apiVersion: undefined, idempotencyKey: undefined, stripeAccount: undefined } 
        } as Stripe.Response<Stripe.Subscription>);
      }
    );


    // Mock tokenWalletService.recordTransaction
    const mockTokenTxResultSub: TokenWalletTransaction = { 
        transactionId: 'tokentx_webhook_sub_xyz789', // New ID
        walletId: walletId,
        type: 'CREDIT_PURCHASE',
        amount: tokensToAward.toString(),
        balanceAfterTxn: (parseInt(initialPaymentTxnData.status === 'PENDING' ? '0' : '0') + tokensToAward).toString(), 
        recordedByUserId: userId,
        relatedEntityId: internalPaymentId,
        relatedEntityType: 'payment_transactions',
        timestamp: new Date(),
        notes: `Tokens for Stripe Checkout Session ${stripeSessionId} (mode: subscription)` // Note updated
    };
    if (mockTokenWalletService.stubs.recordTransaction?.restore) mockTokenWalletService.stubs.recordTransaction.restore();
    mockTokenWalletService.stubs.recordTransaction = stub(
        mockTokenWalletService as ITokenWalletService, 
        "recordTransaction", 
        (params): Promise<TokenWalletTransaction> => {
            assertEquals(params.walletId, walletId);
            assertEquals(params.amount, tokensToAward.toString());
            assertEquals(params.type, 'CREDIT_PURCHASE');
            assertEquals(params.relatedEntityId, internalPaymentId);
            assertEquals(params.notes, `Tokens for Stripe Checkout Session ${stripeSessionId} (mode: subscription)`);
            return Promise.resolve(mockTokenTxResultSub);
        }
    );

    // 4. Call handleWebhook
    const rawBodyString = JSON.stringify(mockStripeEvent); 
    const dummySignature = 'whsec_test_subscription_signature'; 

    const result: PaymentConfirmation = await adapter.handleWebhook(rawBodyString, dummySignature);

    // 5. Assertions
    assert(result.success, `Subscription Webhook handling should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, internalPaymentId, 'Incorrect internal transactionId in subscription result');
    assertEquals(result.tokensAwarded, tokensToAward, 'Incorrect tokensAwarded in subscription result');

    // Check that constructEvent was called
    assertSpyCalls(mockStripe.stubs.webhooksConstructEvent, 1);
    
    // Check Stripe SDK calls
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1);
    
    // Check DB calls using getHistoricQueryBuilderSpies
    const paymentTxSelectSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assert(paymentTxSelectSpies, "Historic select spies info should exist for payment_transactions (Sub)");
    assertEquals(paymentTxSelectSpies.callCount, 1, "select should have been called once on payment_transactions (Sub)");

    const paymentTxUpdateSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assert(paymentTxUpdateSpies, "Historic update spies info should exist for payment_transactions (Sub)");
    assertEquals(paymentTxUpdateSpies.callCount, 1, "update should have been called once on payment_transactions (Sub)");
    
    // Accessing arguments of the update call
    const updateCall = paymentTxUpdateSpies.calls[0]; // Get the first call
    assert(updateCall && updateCall.args.length > 0, "Update call arguments not found");
    const updateObject = updateCall.args[0] as { status?: string; gateway_transaction_id?: string }; // The actual object passed to .update()

    assertEquals(updateObject.status, 'COMPLETED');
    assertEquals(updateObject.gateway_transaction_id, stripeSessionId);


    const subPlansSelectSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'select');
    assert(subPlansSelectSpies, "Historic select spies info should exist for subscription_plans (Sub)");
    assertEquals(subPlansSelectSpies.callCount, 1, "select on subscription_plans should have been called once (Sub)");
    const subPlansEqArgs = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'eq');
    assertEquals(subPlansEqArgs.callsArgs[0], ['item_id_internal', itemIdInternal], "eq on subscription_plans called with wrong item_id_internal");


    const userSubUpsertSpies = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('user_subscriptions', 'upsert');
    assert(userSubUpsertSpies, "Historic upsert spies info should exist for user_subscriptions (Sub)");
    assertEquals(userSubUpsertSpies.callCount, 1, "upsert on user_subscriptions should have been called once (Sub)");
    
    const upsertDataArray = userSubUpsertSpies.callsArgs[0][0]; // Accessing the array of data objects from the call
    assert(Array.isArray(upsertDataArray) && upsertDataArray.length > 0, "Upsert data not found or not an array");
    const upsertData = upsertDataArray[0];
    assertEquals(upsertData.user_id, userId, "user_subscriptions upserted with wrong user_id");
    assertEquals(upsertData.plan_id, internalPlanId, "user_subscriptions upserted with wrong plan_id");
    assertEquals(upsertData.stripe_subscription_id, stripeSubscriptionId, "user_subscriptions upserted with wrong stripe_subscription_id");
    assertEquals(upsertData.status, mockStripeSubscriptionObject.status, "user_subscriptions upserted with wrong status");


    // Check token wallet service call
    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 1);
    const recordTxArgsSub = mockTokenWalletService.stubs.recordTransaction.calls[0].args[0];
    assertEquals(recordTxArgsSub.walletId, walletId, "recordTransaction called with incorrect walletId for sub");
    assertEquals(recordTxArgsSub.amount, tokensToAward.toString(), "recordTransaction called with incorrect amount for sub");
    assertEquals(recordTxArgsSub.type, 'CREDIT_PURCHASE', "recordTransaction called with incorrect type for sub");

    teardownWebhookMocks();
  });

});