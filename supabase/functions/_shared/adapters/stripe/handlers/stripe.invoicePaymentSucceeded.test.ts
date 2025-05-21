import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { TokenWalletTransaction } from '../../../types/tokenWallet.types.ts';
import { MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import type { PurchaseRequest, PaymentOrchestrationContext } from '../../../types/payment.types.ts';
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
  type SpyCall,
  type Spy
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseClientSetup, MockSupabaseDataConfig, MockQueryBuilderState } from '../../../supabase.mock.ts';
import { createMockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';
import { Database } from '../../../../types_db.ts';
import { ILogger, LogMetadata } from '../../../types.ts';
import { handleInvoicePaymentSucceeded } from './stripe.invoicePaymentSucceeded.ts';
import { HandlerContext } from '../../../stripe.mock.ts';

Deno.test('StripePaymentAdapter: initiatePayment', async (t) => {
  
  let mockStripe: MockStripe;
  let mockSupabaseSetup: MockSupabaseClientSetup;
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
      mockTokenWalletService.instance,
      MOCK_WEBHOOK_SECRET
    );
  };

  const teardownMocks = () => {
    Deno.env.delete('SITE_URL');
    if (mockStripe && typeof mockStripe.clearStubs === 'function') {
        mockStripe.clearStubs();
    }
    if (mockTokenWalletService && typeof mockTokenWalletService.clearStubs === 'function') {
        mockTokenWalletService.clearStubs();
    }
  };

  await t.step('initiatePayment - happy path: one-time purchase successfully initiates payment', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-happy-path-otp',
      itemId: 'item-otp-standard-plan',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
      metadata: { test_run: 'happy-otp'}
    };

    const context: PaymentOrchestrationContext = {
      ...basePurchaseRequest,
      internalPaymentId: 'ptxn_happy_otp_123',
      targetWalletId: 'wallet_user_happy_otp',
      tokensToAward: 1000,
      amountForGateway: 10.00, // Assuming item-otp-standard-plan costs 10.00 for quantity 1
      currencyForGateway: 'USD',
    };

    const planData = { 
      stripe_price_id: 'price_otp_standard', 
      plan_type: 'one_time_purchase', // For one-time purchase
      // tokens_awarded and amount are used by orchestrator, not directly by adapter from here
    };

    const stripeSessionData = { 
      id: 'cs_test_happy_otp_456', 
      url: 'https://stripe.com/pay/happy_otp', 
      payment_intent: 'pi_happy_otp_123', // Added for client_secret extraction simulation
      // client_secret should be part of the payment_intent object if it's expanded
      object: 'checkout.session',
      status: 'open',
      livemode: false,
      lastResponse: {
        headers: {},
        requestId: 'req_test_happy_otp',
        statusCode: 200,
        apiVersion: undefined,
        idempotencyKey: undefined,
        stripeAccount: undefined,
      }
    } as Stripe.Response<Stripe.Checkout.Session>; // Cast for type safety

    // Mock for payment_intent retrieval for client_secret - Temporarily commented out pending stripe.mock.ts update
    /*
    const mockPaymentIntent = {
      id: 'pi_happy_otp_123',
      client_secret: 'pi_happy_otp_123_secret_test'
      // ... other necessary PI fields
    } as Stripe.PaymentIntent;
    */

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === context.itemId)) {
              return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            const mockError = new Error('Mock: item_id_internal not found or select query incorrect');
            // mockError.code = '404'; // If you need to simulate a Postgrest-like error code property
            return { data: [], error: mockError, count: 0, status: 404, statusText: 'Not Found' };
          }
        },
        // No 'payment_transactions' mock needed here for initiatePayment adapter unit test
      }
    };
    
    setupMocksAndAdapter(supabaseConfig);

    // mockTokenWalletService.getWalletForContext is not called by adapter
    // So, no need to stub it here for this particular test path.

    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.resolve(stripeSessionData));
    
    // Add stub for payment_intent retrieval for client_secret
    const mockPaymentIntentData = {
      id: stripeSessionData.payment_intent as string, 
      client_secret: `${stripeSessionData.payment_intent}_secret_test`
      // Add other PaymentIntent fields if needed by the adapter logic being tested, though client_secret is primary here
    };
    const mockPaymentIntentResponse = {
      ...mockPaymentIntentData,
      lastResponse: { headers: {}, requestId: 'req_test_otp', statusCode: 200 }
    } as Stripe.Response<Stripe.PaymentIntent>; // This is the full response object

    if (mockStripe.stubs.paymentIntentsRetrieve?.restore) mockStripe.stubs.paymentIntentsRetrieve.restore();
    mockStripe.stubs.paymentIntentsRetrieve = stub(mockStripe.instance.paymentIntents, "retrieve", 
      () => Promise.resolve(mockPaymentIntentResponse)
    );

    const result = await adapter.initiatePayment(context);

    assert(result.success, `Payment initiation should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, context.internalPaymentId, 'Incorrect transactionId');
    assertEquals(result.paymentGatewayTransactionId, stripeSessionData.id, 'Incorrect paymentGatewayTransactionId');
    assertEquals(result.redirectUrl, stripeSessionData.url ?? undefined, 'Incorrect redirectUrl');
    assertEquals(result.clientSecret, mockPaymentIntentData.client_secret, 'Incorrect clientSecret');
    
    // Verify that stripe.checkout.sessions.create was called with the correct mode
    const createCallArgs = mockStripe.stubs.checkoutSessionsCreate.calls[0]?.args[0] as Stripe.Checkout.SessionCreateParams;
    assert(createCallArgs, "Stripe session create was not called or args not captured");
    assertEquals(createCallArgs.mode, 'payment', "Stripe session mode should be 'payment' for one_time_purchase");
    assertEquals(createCallArgs.line_items?.[0].price, planData.stripe_price_id, "Stripe session price_id is incorrect");
    assertEquals(createCallArgs.line_items?.[0].quantity, context.quantity, "Stripe session quantity is incorrect");
    assertEquals(createCallArgs.metadata?.internal_payment_id, context.internalPaymentId, "Stripe metadata.internal_payment_id is incorrect");

    // mockTokenWalletService.getWalletForContext should not have been called by the adapter
    assertEquals(mockTokenWalletService.stubs.getWalletForContext.calls.length, 0, "getWalletForContext should not be called by adapter");
    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0, "createWallet should not be called by adapter");

    // Assert that subscription_plans was queried correctly
    assert(mockSupabaseSetup.spies.fromSpy.calls.some((call: SpyCall) => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called.");
    
    const subPlansSelectArgs = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'select');
    assert(subPlansSelectArgs, "Historic select spies info for subscription_plans should exist (OTP)");
    assertEquals(subPlansSelectArgs.callCount, 1, "select on subscription_plans should have been called once (OTP)");
    // Example: Check the selected columns if your mock setup allows for it (may require adjustment based on spy capabilities)
    // assertEquals(subPlansSelectArgs.callsArgs[0][0], 'stripe_price_id, plan_type', "Incorrect columns selected from subscription_plans (OTP)");

    const subPlansEqArgs = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'eq');
    assert(subPlansEqArgs, "Historic eq spies info for subscription_plans should exist (OTP)");
    assertEquals(subPlansEqArgs.callCount, 1, "eq on subscription_plans should have been called once (OTP)");
    assertEquals(subPlansEqArgs.callsArgs[0], ['item_id_internal', context.itemId], "eq on subscription_plans called with wrong arguments (OTP)");

    const subPlansSingleArgs = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'single');
    assert(subPlansSingleArgs, "Historic single spies info for subscription_plans should exist (OTP)");
    assertEquals(subPlansSingleArgs.callCount, 1, "single on subscription_plans should have been called once (OTP)");

    teardownMocks();
  });

  await t.step('initiatePayment - error: item details (e.g., stripe_price_id) not found for itemId', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-no-item-details',
      itemId: 'item-non-existent',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const context: PaymentOrchestrationContext = {
        ...basePurchaseRequest,
        internalPaymentId: 'ptxn_no_item_789',
        targetWalletId: 'wallet_irrelevant_for_this_test',
        tokensToAward: 100,
        amountForGateway: 5.00,
        currencyForGateway: 'USD',
    };

    // Simulate subscription_plans returning no data for the itemId
    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === context.itemId)) {
                // Simulate item not found
                return { data: [], error: { name: 'PostgrestError', message: 'Item not found', code: 'PGRST116' } as any, count: 0, status: 404, statusText: 'Not Found' };
            }
            const mockError = new Error('Mock: Unexpected item_id_internal query');
            return { data: [], error: mockError, count: 0, status: 500, statusText: 'Internal Server Error' };
          }
        }
      }
    };
    setupMocksAndAdapter(supabaseConfig);

    if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
    }
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => {
        throw new Error("Stripe checkout.sessions.create was called unexpectedly.");
    });

    // Define the expected error message from the mock
    const expectedErrorMessage = 'Item not found'; // This is the actual message from the mocked PostgrestError

    const result = await adapter.initiatePayment(context);

    assert(!result.success, "Payment initiation should fail when item details are not found.");
    // assertEquals(result.error, `Failed to retrieve valid plan details for item ID: ${context.itemId}. Reason: Item not found or missing key fields.`);
    assertEquals(result.error, expectedErrorMessage, "Error message should be 'Item not found' from the mock.");
    assertEquals(result.transactionId, context.internalPaymentId, "transactionId should still be present on failure.");
    assertEquals(result.paymentGatewayTransactionId, undefined, "paymentGatewayTransactionId should be undefined on failure.");
    assertEquals(result.redirectUrl, undefined, "redirectUrl should be undefined on failure.");
    assertEquals(result.clientSecret, undefined, "clientSecret should be undefined on failure.");

    assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 0);
    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0);

    teardownMocks();
  });

  await t.step('initiatePayment - error: Stripe checkout session creation fails', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-stripe-error',
      itemId: 'item-causes-stripe-error-final', // Unique item ID for clarity
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const context: PaymentOrchestrationContext = {
        ...basePurchaseRequest,
        internalPaymentId: 'ptxn_stripe_checkout_final_fail_789',
        targetWalletId: 'wallet_irrelevant_for_this_stripe_error_final',
        tokensToAward: 300,
        amountForGateway: 25.00, // Example amount
        currencyForGateway: 'USD',
    };

    const planData = { 
        stripe_price_id: 'price_stripe_error_final', 
        plan_type: 'one_time_purchase',
    }; 
    const stripeError = new Error('Mock Stripe API error during session creation final test');

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === context.itemId)) {
                return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Plan not found in Stripe error final test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      }
    };
    setupMocksAndAdapter(supabaseConfig);
    
    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.reject(stripeError));

    const result = await adapter.initiatePayment(context);

    assert(!result.success, 'Payment initiation should fail when Stripe API errors (final test)');
    assert(result.error?.includes(stripeError.message), 'Error message should indicate Stripe API error (final test)');
    
    assertEquals(mockStripe.stubs.checkoutSessionsCreate.calls.length, 1, "Stripe checkout session creation should have been attempted once (final test)");

    teardownMocks();
  });

  await t.step('initiatePayment - error: Stripe API call fails', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-stripe-api-error',
      itemId: 'item-causes-stripe-error',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const context: PaymentOrchestrationContext = {
        ...basePurchaseRequest,
        internalPaymentId: 'ptxn_stripe_fail_001',
        targetWalletId: 'wallet_irrelevant_for_this_error',
        tokensToAward: 500,
        amountForGateway: 20.00,
        currencyForGateway: 'USD',
    };

    const planData = { 
        stripe_price_id: 'price_causes_error', 
        plan_type: 'one_time_purchase', 
        // tokens_awarded and amount used by orchestrator
    };
    // const walletData = { walletId: 'wallet-for-user-stripe-error', balance: '0', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: basePurchaseRequest.userId } as TokenWallet;

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => { 
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === context.itemId)) {
                return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            const mockError = new Error('Mock: unexpected item_id in Stripe API error test');
            return { data: [], error: mockError, count: 0, status: 500, statusText: 'Server Error' };
          }
        }
      }
    };
    setupMocksAndAdapter(supabaseConfig);

    // mockTokenWalletService.getWalletForContext is not called by adapter
    // if (mockTokenWalletService.stubs.getWalletForContext?.restore) mockTokenWalletService.stubs.getWalletForContext.restore();
    // mockTokenWalletService.stubs.getWalletForContext = stub(mockTokenWalletService, "getWalletForContext", () => Promise.resolve(walletData)) as any;

    const stripeError = new Stripe.errors.StripeAPIError({ message: 'Simulated Stripe API Error', type: 'api_error' });
    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.reject(stripeError));

    const result = await adapter.initiatePayment(context); // Pass context

    assert(!result.success, 'Payment initiation should fail when Stripe API call fails');
    // assertEquals(result.error, 'Stripe API Error: Simulated Stripe API Error');
    assertEquals(result.error, stripeError.message, "Error message should match the rejected Stripe error message");
    
    assertEquals(mockStripe.stubs.checkoutSessionsCreate.calls.length, 1, "Stripe checkout.sessions.create should have been called once");

    teardownMocks();
  });

  await t.step('initiatePayment - error: Stripe paymentIntents.retrieve fails', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-pi-retrieve-error',
      itemId: 'item-causes-pi-retrieve-error',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const context: PaymentOrchestrationContext = {
        ...basePurchaseRequest,
        internalPaymentId: 'ptxn_pi_retrieve_fail_002',
        targetWalletId: 'wallet_irrelevant_for_pi_error',
        tokensToAward: 600,
        amountForGateway: 30.00,
        currencyForGateway: 'USD',
    };

    const planData = { 
        stripe_price_id: 'price_causes_pi_error', 
        plan_type: 'one_time_purchase', 
    };
    const stripeSessionData = { 
      id: 'cs_test_pi_retrieve_error', 
      url: 'https://stripe.com/pay/pi_retrieve_error', 
      payment_intent: 'pi_to_fail_retrieve',
      object: 'checkout.session',
      status: 'open',
      livemode: false,
      lastResponse: { headers: {}, requestId: 'req_pi_retrieve_error', statusCode: 200 }
    } as Stripe.Response<Stripe.Checkout.Session>;

    const retrieveError = new Stripe.errors.StripeAPIError({ message: 'Simulated Stripe PaymentIntent retrieve error', type: 'api_error' });

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === context.itemId)) {
                return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Plan not found in PI retrieve error test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      }
    };
    setupMocksAndAdapter(supabaseConfig);

    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.resolve(stripeSessionData));

    if (mockStripe.stubs.paymentIntentsRetrieve?.restore) mockStripe.stubs.paymentIntentsRetrieve.restore();
    mockStripe.stubs.paymentIntentsRetrieve = stub(mockStripe.instance.paymentIntents, "retrieve", () => Promise.reject(retrieveError));

    const result = await adapter.initiatePayment(context);

    assert(!result.success, 'Payment initiation should fail when PaymentIntent retrieve fails');
    assertEquals(result.error, retrieveError.message, "Error message should match the rejected PaymentIntent retrieve error");
    
    assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
    assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1);

    teardownMocks();
  });

  await t.step('initiatePayment - happy path: subscription successfully initiates payment', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-happy-path-sub',
      itemId: 'item-sub-premium-plan',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
      metadata: { test_run: 'happy-sub'}
    };

    const context: PaymentOrchestrationContext = {
      ...basePurchaseRequest,
      internalPaymentId: 'ptxn_happy_sub_789',
      targetWalletId: 'wallet_user_happy_sub',
      tokensToAward: 5000, // Example for a subscription
      amountForGateway: 25.00, // Example cost
      currencyForGateway: 'USD',
    };

    const planData = { 
      stripe_price_id: 'price_sub_premium', 
      plan_type: 'subscription', // Key for this test
    };

    const stripeSessionData = { 
      id: 'cs_test_happy_sub_123', 
      url: 'https://stripe.com/pay/happy_sub', 
      payment_intent: 'pi_happy_sub_789', 
      object: 'checkout.session',
      status: 'open',
      livemode: false,
      lastResponse: {
        headers: {},
        requestId: 'req_test_happy_sub',
        statusCode: 200,
        apiVersion: undefined,
        idempotencyKey: undefined,
        stripeAccount: undefined,
      }
    } as Stripe.Response<Stripe.Checkout.Session>; 

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'item_id_internal' && f.value === context.itemId)) {
              return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            const mockError = new Error('Mock: item_id_internal not found for subscription plan query');
            return { data: [], error: mockError, count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      }
    };
    
    setupMocksAndAdapter(supabaseConfig);

    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.resolve(stripeSessionData));
    
    // Add stub for payment_intent retrieval for client_secret for subscription test
    const mockPaymentIntentSubData = {
      id: stripeSessionData.payment_intent as string, 
      client_secret: `${stripeSessionData.payment_intent}_secret_test_sub`
    };
    const mockPaymentIntentSubResponse = {
      ...mockPaymentIntentSubData,
      lastResponse: { headers: {}, requestId: 'req_test_sub', statusCode: 200 }
    } as Stripe.Response<Stripe.PaymentIntent>;

    if (mockStripe.stubs.paymentIntentsRetrieve?.restore) mockStripe.stubs.paymentIntentsRetrieve.restore();
    mockStripe.stubs.paymentIntentsRetrieve = stub(mockStripe.instance.paymentIntents, "retrieve", 
      () => Promise.resolve(mockPaymentIntentSubResponse)
    );
    
    const result = await adapter.initiatePayment(context);

    assert(result.success, `Subscription payment initiation should be successful. Error: ${result.error}`);
    assertEquals(result.transactionId, context.internalPaymentId);
    assertEquals(result.paymentGatewayTransactionId, stripeSessionData.id);
    assertEquals(result.redirectUrl, stripeSessionData.url ?? undefined);
    assertEquals(result.clientSecret, mockPaymentIntentSubData.client_secret, 'Incorrect clientSecret for subscription');
    
    const createCallArgs = mockStripe.stubs.checkoutSessionsCreate.calls[0]?.args[0] as Stripe.Checkout.SessionCreateParams;
    assert(createCallArgs, "Stripe session create was not called or args not captured");
    assertEquals(createCallArgs.mode, 'subscription', "Stripe session mode should be 'subscription'");
    assertEquals(createCallArgs.line_items?.[0].price, planData.stripe_price_id);
    assertEquals(createCallArgs.line_items?.[0].quantity, context.quantity);
    assertEquals(createCallArgs.metadata?.internal_payment_id, context.internalPaymentId);

    assertEquals(mockTokenWalletService.stubs.getWalletForContext.calls.length, 0);
    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0);

    // Assert that subscription_plans was queried correctly for subscription test
    assert(mockSupabaseSetup.spies.fromSpy.calls.some((call: SpyCall) => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called (Sub).");

    const subPlansSelectArgsSub = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'select');
    assert(subPlansSelectArgsSub, "Historic select spies info for subscription_plans should exist (Sub)");
    assertEquals(subPlansSelectArgsSub.callCount, 1, "select on subscription_plans should have been called once (Sub)");
    // Example: assertEquals(subPlansSelectArgsSub.callsArgs[0][0], 'stripe_price_id, plan_type', "Incorrect columns selected from subscription_plans (Sub)");
    
    const subPlansEqArgsSub = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'eq');
    assert(subPlansEqArgsSub, "Historic eq spies info for subscription_plans should exist (Sub)");
    assertEquals(subPlansEqArgsSub.callCount, 1, "eq on subscription_plans should have been called once (Sub)");
    assertEquals(subPlansEqArgsSub.callsArgs[0], ['item_id_internal', context.itemId], "eq on subscription_plans called with wrong arguments (Sub)");

    const subPlansSingleArgsSub = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('subscription_plans', 'single');
    assert(subPlansSingleArgsSub, "Historic single spies info for subscription_plans should exist (Sub)");
    assertEquals(subPlansSingleArgsSub.callCount, 1, "single on subscription_plans should have been called once (Sub)");

    teardownMocks();
  });

  await t.step('initiatePayment - error: invalid or missing plan_type in fetched item details', async () => {
    const basePurchaseRequest: PurchaseRequest = {
      userId: 'user-invalid-plan-type',
      itemId: 'item-with-invalid-plan-type',
      quantity: 1,
      currency: 'USD',
      paymentGatewayId: 'stripe',
    };
    const context: PaymentOrchestrationContext = {
        ...basePurchaseRequest,
        internalPaymentId: 'ptxn_invalid_plan_type_456',
        targetWalletId: 'wallet_irrelevant_for_this_error',
        tokensToAward: 250,
        amountForGateway: 12.00,
        currencyForGateway: 'USD',
    };

    // Simulate planData with a missing plan_type
    const planDataMissingType = { 
        stripe_price_id: 'price_for_missing_type',
        // plan_type is deliberately missing
    }; 

    // Simulate planData with an invalid plan_type
    const planDataInvalidType = { 
        stripe_price_id: 'price_for_invalid_type',
        plan_type: 'some_unsupported_type',
    }; 

    const testScenarios = [
      { name: "missing plan_type", data: planDataMissingType, itemIdSuffix: "-missing"},
      { name: "invalid plan_type", data: planDataInvalidType, itemIdSuffix: "-invalid"},
    ];

    for (const scenario of testScenarios) {
      const currentItemId = `${context.itemId}${scenario.itemIdSuffix}`;
      const currentContext = { ...context, itemId: currentItemId, internalPaymentId: `${context.internalPaymentId}${scenario.itemIdSuffix}` };

      const supabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          'subscription_plans': {
            select: async (state: MockQueryBuilderState) => {
              if (state.filters.some(f => f.column === 'item_id_internal' && f.value === currentItemId)) {
                  return { data: [scenario.data], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: new Error('Mock: Plan not found in invalid plan_type test'), count: 0, status: 404, statusText: 'Not Found' };
            }
          },
        }
      };
      setupMocksAndAdapter(supabaseConfig);

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      // Spy on Stripe session creation to ensure it's not called.
      const checkoutCreateStub = stub(mockStripe.instance.checkout.sessions, "create", () => {
          throw new Error('Stripe checkout.sessions.create should not have been called!');
      });
      mockStripe.stubs.checkoutSessionsCreate = checkoutCreateStub;

      const result = await adapter.initiatePayment(currentContext);

      assert(!result.success, `Payment initiation should fail for scenario: ${scenario.name}`);
      
      // Determine the plan_type as the adapter would see it.
      // For the 'missing' scenario, scenario.data.plan_type would be undefined.
      // For the 'invalid' scenario, it would be the invalid string.
      const effectivePlanType = (scenario.data as any).plan_type; // Cast to any to access potentially missing property

      const expectedErrorMessage = `Invalid or missing plan_type: '${effectivePlanType}' received for item ID: ${currentItemId}. Cannot determine Stripe session mode.`;
      assertEquals(result.error, expectedErrorMessage, `Error message not as expected for ${scenario.name}`);
      assertEquals(result.transactionId, currentContext.internalPaymentId);
      assertSpyCalls(checkoutCreateStub, 0);

      teardownMocks(); // Teardown after each scenario to reset stubs
    }
  });

});

// #############################################################################
// Test suite for handleInvoicePaymentSucceeded
// #############################################################################

const FREE_TIER_ITEM_ID_INTERNAL_INVOICE_TESTS = 'SYS_FREE_TIER'; // If needed for any logic here

// Helper to create a mock Stripe.InvoicePaymentSucceededEvent
const createMockInvoicePaymentSucceededEvent = (
  invoiceData: Partial<Stripe.Invoice>,
  lineItemPriceId?: string | null, // explicitly pass null if no price for line item
  id = `evt_inv_paysucceeded_${Date.now()}`
): Stripe.InvoicePaymentSucceededEvent => {
  const now = Math.floor(Date.now() / 1000);
  const subscriptionId = invoiceData.subscription || `sub_default_${Date.now()}`;

  const lineItems: Stripe.InvoiceLineItem[] = [];
  if (lineItemPriceId !== null) { // Only add line item if priceId is not explicitly null
    lineItems.push({
      id: `il_default_${Date.now()}`,
      object: 'line_item',
      price: lineItemPriceId ? { 
        id: lineItemPriceId, 
        object: 'price', 
        active: true, 
        currency: invoiceData.currency || 'usd',
        product: `prod_default_${Date.now()}`,
        // Add other Stripe.Price fields if necessary for tests
      } as Stripe.Price : undefined,
      quantity: 1,
      amount: invoiceData.amount_paid || 1000, // Default to 1000 cents
      currency: invoiceData.currency || 'usd',
      description: 'Default line item',
      // Add other Stripe.InvoiceLineItem fields if necessary for tests
      period: { start: now - 3600, end: now + 3600 },
      proration: false,
      subscription: typeof subscriptionId === 'string' ? subscriptionId : subscriptionId?.id,
      type: 'subscription', // or 'invoiceitem' depending on test case
    } as Stripe.InvoiceLineItem);
  }
  
  return {
    id,
    object: "event",
    api_version: "2020-08-27",
    created: now,
    data: {
      object: {
        id: `in_default_${Date.now()}`,
        object: "invoice",
        status: "paid",
        customer: `cus_default_${Date.now()}`,
        subscription: subscriptionId,
        currency: 'usd',
        amount_paid: 1000,
        lines: {
          object: 'list',
          data: lineItems,
          has_more: false,
          url: `/v1/invoices/in_default_${Date.now()}/lines`,
        },
        ...invoiceData,
      } as Stripe.Invoice,
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: `req_default_${Date.now()}`, idempotency_key: null },
    type: "invoice.payment_succeeded",
  } as Stripe.InvoicePaymentSucceededEvent;
};

// Mock Logger for this suite
const createMockInvoiceLogger = (): ILogger => {
    return {
        debug: spy((_message: string, _metadata?: LogMetadata) => {}),
        info: spy((_message: string, _metadata?: LogMetadata) => {}),
        warn: spy((_message: string, _metadata?: LogMetadata) => {}),
        error: spy((_message: string | Error, _metadata?: LogMetadata) => {}),
    };
};

Deno.test('[stripe.invoicePaymentSucceeded.ts] Tests - handleInvoicePaymentSucceeded', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockTokenWalletService;
  let mockInvoiceLogger: ILogger;
  let mockStripe: MockStripe;
  let handlerContext: HandlerContext;

  const setupInvoiceMocks = (dbConfig: MockSupabaseDataConfig = {}) => {
    mockInvoiceLogger = createMockInvoiceLogger();
    mockTokenWalletService = createMockTokenWalletService();
    mockStripe = createMockStripe();
    mockSupabaseSetup = createMockSupabaseClient(dbConfig);
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    
    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockInvoiceLogger,
      tokenWalletService: mockTokenWalletService.instance,
      stripe: mockStripe.instance,
      updatePaymentTransaction: spy() as any,
      featureFlags: {},
      functionsUrl: "http://localhost:54321/functions/v1",
      stripeWebhookSecret: "whsec_test_secret_invoice_succeeded",
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

  await t.step("Placeholder test - to be implemented", async () => {
    setupInvoiceMocks();
    assert(true, "Placeholder test passed by default");
    teardownInvoiceMocks();
  });

  await t.step('Subscription Renewal - successfully processes, creates payment transaction, and awards tokens', async () => {
    const mockUserId = 'user_renewal_happy_path';
    const mockStripeCustomerId = 'cus_renewal_happy';
    const mockWalletId = 'wallet_renewal_happy';
    const mockSubscriptionId = 'sub_renewal_happy';
    const mockInvoiceId = 'in_renewal_happy';
    const mockStripePriceId = 'price_renewal_tokens_plan';
    const mockPlanItemIdInternal = 'item_renewal_tokens';
    const tokensToAwardForPlan = 1000;
    const mockPaymentTxId = 'ptxn_renewal_happy_123';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 2000, // e.g., $20.00
        currency: 'usd',
      },
      mockStripePriceId
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { // Idempotency check
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' }; // No existing payment
            }
            return { data: null, error: new Error('Unexpected payment_transactions select query'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async (state: MockQueryBuilderState) => {
            if (state.insertData && (state.insertData as any).gateway_transaction_id === mockInvoiceId) {
              return { data: [{ id: mockPaymentTxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions insert query'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { // For final 'COMPLETED' status update
            if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && (state.updateData as any).status === 'COMPLETED') {
                return { data: [{id: mockPaymentTxId, status: 'COMPLETED'}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions update query for COMPLETED'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'user_subscriptions': {
          select: async (state: MockQueryBuilderState) => { // For user_id lookup
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions select query'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { // For subscription status update
            if (state.filters.some((f:any) => f.column === 'stripe_subscription_id' && f.value === mockSubscriptionId)) {
                return { data: [{stripe_subscription_id: mockSubscriptionId}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions update query'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'token_wallets': {
          select: async (state: MockQueryBuilderState) => { // For wallet_id lookup
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected token_wallets select query'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => { // For plan info and tokens_awarded
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select query'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    const minimalMockSubscription: Partial<Stripe.Subscription> = { 
        id: mockSubscriptionId, 
        status: 'active', 
        current_period_start: Math.floor(Date.now() / 1000) - 3600, 
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600),
    };
    const mockStripeSubResponse: Stripe.Response<Stripe.Subscription> = {
        ...(minimalMockSubscription as Stripe.Subscription),
        lastResponse: {
            headers: { 'request-id': 'req_mock_happy_renewal' },
            requestId: 'req_mock_happy_renewal',
            statusCode: 200,
        }
    };
    
    // Configure the global mock's stub for subscriptions.retrieve
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => Promise.resolve(mockStripeSubResponse));

    // Use the pre-existing stub which is already a spy
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed. Error: ${result.error}`);
    assertEquals(result.transactionId, mockPaymentTxId, 'Transaction ID should be the new payment_transactions ID');
    assertEquals(result.tokensAwarded, tokensToAwardForPlan, 'Tokens awarded should match plan');

    const paymentInsertSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'insert');
    assertEquals(paymentInsertSpy.callCount, 1, 'payment_transactions.insert should be called once');
    const insertedData = paymentInsertSpy.callsArgs[0][0] as Database['public']['Tables']['payment_transactions']['Insert'];
    assertEquals(insertedData.gateway_transaction_id, mockInvoiceId);
    assertEquals(insertedData.user_id, mockUserId);
    assertEquals(insertedData.target_wallet_id, mockWalletId);
    assertEquals(insertedData.tokens_to_award, tokensToAwardForPlan);
    assertEquals(insertedData.status, 'PROCESSING_RENEWAL');

    const userSubUpdateSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('user_subscriptions', 'update');
    assertEquals(userSubUpdateSpy.callCount, 1, 'user_subscriptions.update should be called once');

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1);
    assertSpyCalls(recordTxSpy, 1);
    assertEquals(recordTxSpy.calls[0].args[0], {
      walletId: mockWalletId,
      type: 'CREDIT_PURCHASE',
      amount: String(tokensToAwardForPlan),
      recordedByUserId: mockUserId,
      relatedEntityId: mockPaymentTxId,
      relatedEntityType: 'payment_transactions',
      notes: JSON.stringify({ // New assertion: metadata object stringified into notes
            reason: 'Subscription Renewal',
            invoice_id: mockInvoiceId,
            payment_transaction_id: mockPaymentTxId,
            stripe_event_id: mockEvent.id, // Assuming event ID is used in metadata
            item_id_internal: mockPlanItemIdInternal,
      }),
    });

    const paymentUpdateSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(paymentUpdateSpy.callCount, 1, 'payment_transactions.update for COMPLETED should be called once');
    const updatedData = paymentUpdateSpy.callsArgs[0][0] as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
    assertEquals(updatedData.status, 'COMPLETED');

    assert((mockInvoiceLogger.info as Spy<any, any[], any>).calls.some((call: SpyCall) => call.args[0].includes(`Token award successful for invoice ${mockInvoiceId}`)), 'Expected log for successful token award not found.');
    
    // recordTxSpy.restore(); // Not needed as teardownInvoiceMocks will clear/reset stubs
    teardownInvoiceMocks();
  });

  await t.step('Idempotency - Invoice already processed (COMPLETED)', async () => {
    const mockUserId = 'user_idempotent_completed';
    const mockStripeCustomerId = 'cus_idempotent_completed';
    const mockSubscriptionId = 'sub_idempotent_completed';
    const mockInvoiceId = 'in_idempotent_completed';
    const existingPaymentTxId = 'ptxn_existing_completed_456';
    const existingTokensAwarded = 750;

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 1500,
        currency: 'usd',
      },
      'price_some_plan_irrelevant_for_idempotency' 
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId && f.type === 'eq') &&
                state.filters.some((f: any) => f.column === 'payment_gateway_id' && f.value === 'stripe' && f.type === 'eq')) {
              return { 
                data: [{ 
                  id: existingPaymentTxId, 
                  status: 'COMPLETED', 
                  tokens_to_award: existingTokensAwarded, 
                  user_id: mockUserId 
                }], 
                error: null, 
                count: 1, 
                status: 200, 
                statusText: 'OK' 
              };
            }
            return { data: null, error: new Error('Unexpected payment_transactions select for idempotency test'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async () => { throw new Error('payment_transactions.insert should not be called in idempotency (COMPLETED) test'); },
          update: async () => { throw new Error('payment_transactions.update should not be called in idempotency (COMPLETED) test'); },
        },
        'user_subscriptions': {
          select: async () => { throw new Error('user_subscriptions.select should not be called'); },
          update: async () => { throw new Error('user_subscriptions.update should not be called'); },
        },
        'token_wallets': {
          select: async () => { throw new Error('token_wallets.select should not be called'); },
        },
        'subscription_plans': {
          select: async () => { throw new Error('subscription_plans.select should not be called'); },
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    // Configure the global mock's stub for subscriptions.retrieve to throw if called
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore(); // Ensure clean state
    }
    // Re-initialize the stub for this test case using the mockStripe's provided stub
    // And make it throw an error if called, as it shouldn't be in this specific test.
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => { 
        throw new Error('stripe.subscriptions.retrieve should not be called in idempotency (COMPLETED) test'); 
    });

    // Use the pre-existing stub which is already a spy
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed for already completed invoice. Error: ${result.error}`);
    assertEquals(result.transactionId, existingPaymentTxId, 'Transaction ID should be the existing one');
    assertEquals(result.tokensAwarded, existingTokensAwarded, 'Tokens awarded should be from the existing transaction');
    assertEquals(result.message, `Invoice ${mockInvoiceId} already processed and completed.`, 'Incorrect idempotency message');

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 0); // Check the global stub
    assertSpyCalls(recordTxSpy, 0);

    const infoLogSpy = mockInvoiceLogger.info as Spy<any, any[], any>; 
    assert(
      infoLogSpy.calls.some((call: SpyCall) => 
        call.args[0].includes(`Invoice ${mockInvoiceId} already processed with status COMPLETED.`)
      ),
      'Expected log message for already completed invoice not found.'
    );

    // No local retrieveStub.restore() needed as we are managing the global one
    // recordTxSpy.restore(); // Not needed
    teardownInvoiceMocks(); // This will call mockStripe.clearStubs()
  });

  await t.step('Idempotency - Invoice already processed (FAILED)', async () => {
    const mockUserId = 'user_idempotent_failed';
    const mockStripeCustomerId = 'cus_idempotent_failed';
    const mockSubscriptionId = 'sub_idempotent_failed';
    const mockInvoiceId = 'in_idempotent_failed';
    const existingPaymentTxId = 'ptxn_existing_failed_123';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 1200, // This event is 'succeeded', but we're testing prior 'FAILED' state
        currency: 'usd',
      },
      'price_some_plan_irrelevant_for_idempotency_failed' 
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId && f.type === 'eq') &&
                state.filters.some((f: any) => f.column === 'payment_gateway_id' && f.value === 'stripe' && f.type === 'eq')) {
              return { 
                data: [{ 
                  id: existingPaymentTxId, 
                  status: 'FAILED', // Key for this test
                  tokens_to_award: 0, // Should be 0 for failed
                  user_id: mockUserId 
                }], 
                error: null, 
                count: 1, 
                status: 200, 
                statusText: 'OK' 
              };
            }
            return { data: null, error: new Error('Unexpected payment_transactions select for idempotency (FAILED) test'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async () => { throw new Error('payment_transactions.insert should not be called in idempotency (FAILED) test'); },
          update: async () => { throw new Error('payment_transactions.update should not be called in idempotency (FAILED) test'); },
        },
        'user_subscriptions': { select: async () => { throw new Error('user_subscriptions.select should not be called'); } },
        'token_wallets': { select: async () => { throw new Error('token_wallets.select should not be called'); } },
        'subscription_plans': { select: async () => { throw new Error('subscription_plans.select should not be called'); } }
      }
    };

    setupInvoiceMocks(dbConfig);

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    // mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => { 
    //     throw new Error('stripe.subscriptions.retrieve should not be called in idempotency (FAILED) test'); 
    // });
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => { 
        throw new Error('stripe.subscriptions.retrieve should not be called in idempotency (FAILED) test'); 
    });

    // Use the pre-existing stub which is already a spy
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, `Handler should succeed for already failed invoice. Error: ${result.error}`);
    assertEquals(result.transactionId, existingPaymentTxId, 'Transaction ID should be the existing one');
    assertEquals(result.tokensAwarded, 0, 'Tokens awarded should be 0 for a failed transaction');
    assertEquals(result.message, `Invoice ${mockInvoiceId} already processed and failed.`, 'Incorrect idempotency message for FAILED state');

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 0);
    assertSpyCalls(recordTxSpy, 0);

    const infoLogSpy = mockInvoiceLogger.info as Spy<any, any[], any>; 
    assert(
      infoLogSpy.calls.some((call: SpyCall) => 
        call.args[0].includes(`Invoice ${mockInvoiceId} already processed with status FAILED.`)
      ),
      'Expected log message for already failed invoice not found.'
    );
    
    // recordTxSpy.restore(); // Not needed
    teardownInvoiceMocks();
  });

  await t.step('Error - Stripe subscriptions.retrieve fails (CRITICAL - Handler Fails)', async () => {
    const mockUserId = 'user_stripe_sub_retrieve_fails';
    const mockStripeCustomerId = 'cus_stripe_sub_retrieve_fails';
    const mockWalletId = 'wallet_stripe_sub_retrieve_fails';
    const mockSubscriptionId = 'sub_causes_retrieve_error';
    const mockInvoiceId = 'in_stripe_sub_retrieve_fails';
    const mockStripePriceId = 'price_for_sub_retrieve_fail';
    const mockPlanItemIdInternal = 'item_sub_retrieve_fail';
    const tokensToAwardForPlan = 300; // This will NOT be awarded
    const mockPaymentTxId = 'ptxn_sub_retrieve_fail_789';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 1500,
      },
      mockStripePriceId
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async (state: MockQueryBuilderState) => { 
            if (state.insertData && (state.insertData as any).gateway_transaction_id === mockInvoiceId) {
              return { data: [{ id: mockPaymentTxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions insert'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && 
                (state.updateData as any).status === 'FAILED_SUBSCRIPTION_SYNC') {
                return { data: [{id: mockPaymentTxId, status: 'FAILED_SUBSCRIPTION_SYNC'}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions update, expected FAILED_SUBSCRIPTION_SYNC'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'user_subscriptions': {
          select: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions select'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async () => { 
            throw new Error('user_subscriptions.update should not be called if subscriptions.retrieve fails');
          }
        },
        'token_wallets': {
          select: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected token_wallets select'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    const stripeApiError = new Stripe.errors.StripeAPIError({ message: 'Simulated Stripe API error on subscription retrieve', type: 'api_error' });
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => Promise.reject(stripeApiError));
    
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);
    console.log('[Test: Stripe subscriptions.retrieve fails (CRITICAL)] Actual result.error:', result.error);

    assert(!result.success, 'Handler should fail due to the cascade of Stripe retrieve and PT update failures');
    assertEquals(result.transactionId, mockPaymentTxId, 'Transaction ID should be the created PT ID in this path');
    assertEquals(result.tokensAwarded, 0, 'Tokens should be 0 due to Stripe retrieve failure forcing no award');
    assertEquals(result.status, 500, "Status should be 500");
    assert(result.error === `User subscription update failed for invoice ${mockInvoiceId}. Payment transaction ${mockPaymentTxId} status reflects no tokens awarded, but subscription data may be stale or Stripe API failed. Final PT status update also failed.`, 
      'Error message mismatch. Actual: ' + result.error);

    // Check that the initial Stripe retrieve (which we now understand is not the one causing the primary error return)
    // was still called as per the direct mock for this test.
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1); 
    assertSpyCalls(recordTxSpy, 0); // Token awarding should NOT be attempted if tokensToAward became 0

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>; 
    // Check for the CRITICAL log from the handler when stripe.subscriptions.retrieve fails (lines 236-244 in handler)
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] CRITICAL: Failed to retrieve Stripe subscription ${mockSubscriptionId} for invoice ${mockInvoiceId} to update user_subscription. PT ID: ${mockPaymentTxId}. Error: ${stripeApiError.message}`)
      ),
      'Expected CRITICAL error log for Stripe subscription retrieve failure not found.'
    );
    
    const expectedPtUpdateErrorMessage = 'Mocked PT update failure for sub retrieve test'; 
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] Failed to update payment_transactions status to COMPLETED for PT ID ${mockPaymentTxId} (no tokens to award scenario). Invoice ${mockInvoiceId}. Error: ${expectedPtUpdateErrorMessage}`)
      ),
      `Expected error log for final PT update failure not found. Expected error: ${expectedPtUpdateErrorMessage}`
    );

    teardownInvoiceMocks();
  });

  await t.step('Error - payment_transactions Insert Fails (DB Error)', async () => {
    const mockUserId = 'user_ptx_insert_fails';
    const mockStripeCustomerId = 'cus_ptx_insert_fails';
    const mockWalletId = 'wallet_ptx_insert_fails';
    const mockSubscriptionId = 'sub_ptx_insert_fails';
    const mockInvoiceId = 'in_ptx_insert_fails';
    const mockStripePriceId = 'price_for_ptx_insert_fail';
    const mockPlanItemIdInternal = 'item_ptx_insert_fail';
    const tokensToAwardForPlan = 400;

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 1800,
      },
      mockStripePriceId
    );

    const dbInsertError = { name: 'PostgrestError', message: 'Mock DB error on payment_transactions insert', code: 'XXYYZ', details: 'Mock details', hint: 'Mock hint' };

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { // Idempotency check
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' }; // No existing payment
            }
            return { data: null, error: new Error('Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async () => { // Simulate insert failure
            return { data: null, error: dbInsertError as any, count: 0, status: 500, statusText: 'Internal Server Error' };
          },
          update: async () => { 
            // This might be called to set status to FAILED if the handler attempts it after insert fails catastrophically.
            // For this test, we'll assume the handler exits before trying to update if insert fails directly and is caught.
            // If the handler does attempt an update, this mock will need adjustment.
            throw new Error('payment_transactions.update should ideally not be called if insert fails directly and is caught'); 
          }
        },
        'user_subscriptions': { // User lookup proceeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions select'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'token_wallets': { // Wallet lookup proceeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected token_wallets select'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': { // Plan lookup proceeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    // subscriptions.retrieve should not be called if payment_transactions insert fails early
    // mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => { 
    //     throw new Error('stripe.subscriptions.retrieve should not be called if payment_transactions insert fails'); 
    // });
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => { 
        throw new Error('stripe.subscriptions.retrieve should not be called if payment_transactions insert fails'); 
    });
    
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(!result.success, 'Handler should fail due to payment_transactions insert DB error');
    // The handler returns the stripeEventId as transactionId if payment_transactions.id was never created
    assertEquals(result.transactionId, mockEvent.id, 'Transaction ID should be the Stripe Event ID'); 
    assertEquals(result.error, `DB error creating payment record: ${dbInsertError.message}`, 'Incorrect error message');
    assertEquals(result.tokensAwarded, 0, 'Tokens awarded should be 0 on this failure path'); // New: tokensAwarded is 0
    assertEquals(result.status, 500, 'Status should be 500 for PT insert failure'); // New: check status

    const paymentInsertSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'insert');
    assertEquals(paymentInsertSpy.callCount, 1, 'payment_transactions.insert should have been attempted once');

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 0); 
    assertSpyCalls(recordTxSpy, 0); // Token awarding should NOT proceed

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`Failed to create payment_transactions record for invoice ${mockInvoiceId}`) &&
        (call.args[1] as any)?.error?.message === dbInsertError.message && // Compare message
        (call.args[1] as any)?.error?.code === dbInsertError.code        // Compare code
      ),
      'Expected error log for payment_transactions insert failure not found, or error properties do not match.'
    );
    
    // recordTxSpy.restore(); // Not needed
    teardownInvoiceMocks();
  });

  await t.step('Error - TokenWalletService.recordTransaction Fails', async () => {
    const mockUserId = 'user_token_award_fails';
    const mockStripeCustomerId = 'cus_token_award_fails';
    const mockWalletId = 'wallet_token_award_fails';
    const mockSubscriptionId = 'sub_token_award_fails';
    const mockInvoiceId = 'in_token_award_fails';
    const mockStripePriceId = 'price_for_token_award_fail';
    const mockPlanItemIdInternal = 'item_token_award_fail';
    const tokensToAwardForPlan = 500;
    const mockPaymentTxId = 'ptxn_token_award_fail_001';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 2200,
      },
      mockStripePriceId
    );

    const tokenServiceError = new Error('Mock TokenWalletService.recordTransaction error');

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { // Idempotency check
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async (state: MockQueryBuilderState) => { // Initial insert succeeds
            if (state.insertData && (state.insertData as any).gateway_transaction_id === mockInvoiceId) {
              return { data: [{ id: mockPaymentTxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions insert'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { // Expect update to TOKEN_AWARD_FAILED
            if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && 
                (state.updateData as any).status === 'TOKEN_AWARD_FAILED') {
                return { data: [{id: mockPaymentTxId, status: 'TOKEN_AWARD_FAILED'}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            // It might also try to update to COMPLETED before the error, then to FAILED. This mock handles the TOKEN_AWARD_FAILED directly.
            return { data: null, error: new Error('Unexpected payment_transactions update, expected TOKEN_AWARD_FAILED'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'user_subscriptions': { // User and subscription sync succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions select'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f:any) => f.column === 'stripe_subscription_id' && f.value === mockSubscriptionId)) {
                return { data: [{stripe_subscription_id: mockSubscriptionId}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions update'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'token_wallets': { // Wallet lookup succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected token_wallets select'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': { // Plan lookup succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    const minimalMockSubscription: Partial<Stripe.Subscription> = { 
        id: mockSubscriptionId, status: 'active', 
        current_period_start: Math.floor(Date.now() / 1000) - 3600, 
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600),
    };
    const mockStripeSubResponse: Stripe.Response<Stripe.Subscription> = {
        ...(minimalMockSubscription as Stripe.Subscription),
        lastResponse: { headers: { 'request-id': 'req_mock_token_fail' }, requestId: 'req_mock_token_fail', statusCode: 200 }
    };
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => Promise.resolve(mockStripeSubResponse));
    
    // Mock TokenWalletService.recordTransaction to throw an error
    if (mockTokenWalletService.stubs.recordTransaction && !mockTokenWalletService.stubs.recordTransaction.restored) {
        mockTokenWalletService.stubs.recordTransaction.restore();
    }
    mockTokenWalletService.stubs.recordTransaction = stub(mockTokenWalletService.instance, 'recordTransaction', () => Promise.reject(tokenServiceError));
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(!result.success, 'Handler should fail due to TokenWalletService.recordTransaction error');
    assertEquals(result.transactionId, mockPaymentTxId, 'Transaction ID should be the payment_transactions ID');
    assertEquals(result.error, `Token award failed for invoice ${mockInvoiceId}: ${tokenServiceError.message}`, 'Incorrect error message');
    assertEquals(result.tokensAwarded, 0, 'Tokens awarded should be 0');
    assertEquals(result.status, 500, 'Status should be 500 for token award failure'); // New: check status

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1);
    assertSpyCalls(recordTxSpy, 1); // recordTransaction was called once and failed
    const recordTxCallArgs = recordTxSpy.calls[0].args[0];
    assertEquals(recordTxCallArgs.walletId, mockWalletId);
    assertEquals(recordTxCallArgs.type, 'CREDIT_PURCHASE');
    assertEquals(recordTxCallArgs.amount, String(tokensToAwardForPlan));
    assertEquals(recordTxCallArgs.recordedByUserId, mockUserId);
    assertEquals(recordTxCallArgs.relatedEntityId, mockPaymentTxId);
    assertEquals(recordTxCallArgs.relatedEntityType, 'payment_transactions');
    assertEquals(JSON.parse(recordTxCallArgs.notes as string), { // New: check stringified metadata
            reason: 'Subscription Renewal',
            invoice_id: mockInvoiceId,
            payment_transaction_id: mockPaymentTxId,
            stripe_event_id: mockEvent.id,
            item_id_internal: mockPlanItemIdInternal,
    });

    const paymentUpdateSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(paymentUpdateSpy.callCount, 1, 'payment_transactions.update for TOKEN_AWARD_FAILED should be called once');
    const updatedData = paymentUpdateSpy.callsArgs[0][0] as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
    assertEquals(updatedData.status, 'TOKEN_AWARD_FAILED');

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] TokenWalletService.recordTransaction FAILED for invoice ${mockInvoiceId}. PT ID: ${mockPaymentTxId}. Error: `) &&
        (call.args[1] as any)?.error === tokenServiceError
      ),
      'Expected error log for token awarding failure not found or message/error mismatch.'
    );
    
    // recordTxSpy.restore(); // Not needed as the stub is part of mockTokenWalletService.stubs
    teardownInvoiceMocks();
  });

  await t.step('Error - user_subscriptions Update Fails (DB Error)', async () => {
    const mockUserId = 'user_sub_update_fails';
    const mockStripeCustomerId = 'cus_sub_update_fails';
    const mockWalletId = 'wallet_sub_update_fails';
    const mockSubscriptionId = 'sub_causes_sub_update_error';
    const mockInvoiceId = 'in_sub_update_fails';
    const mockStripePriceId = 'price_for_sub_update_fail';
    const mockPlanItemIdInternal = 'item_sub_update_fail';
    const tokensToAwardForPlan = 600; // This will not be awarded if sub update fails before token award step
    const mockPaymentTxId = 'ptxn_sub_update_fail_123';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId, 
        amount_paid: 2500,
      },
      mockStripePriceId
    );

    const userSubUpdateDbError = { name: 'PostgrestError', message: 'Mock DB error on user_subscriptions update', code: 'XXYY1', details: 'Mock details', hint: 'Mock hint' };

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { // Idempotency
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async (state: MockQueryBuilderState) => { // Initial insert succeeds
            if (state.insertData && (state.insertData as any).gateway_transaction_id === mockInvoiceId) {
              return { data: [{ id: mockPaymentTxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions insert'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { // Expect update to COMPLETED (after token award)
            if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && 
                (state.updateData as any).status === 'COMPLETED') {
                return { data: [{id: mockPaymentTxId, status: 'COMPLETED'}], error: null, count: 1, status: 200, statusText: 'OK' };
            } else if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && 
                       (state.updateData as any).status === 'FAILED_SUBSCRIPTION_SYNC') {
                // This case might be hit if the handler logic changes, but for now COMPLETED is expected first.
                return { data: [{id: mockPaymentTxId, status: 'FAILED_SUBSCRIPTION_SYNC'}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions update, expected COMPLETED for this test flow after token award'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'user_subscriptions': {
          select: async (state: MockQueryBuilderState) => { // User lookup succeeds
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions select'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { // Simulate user_subscriptions update failure
            if (state.filters.some((f:any) => f.column === 'stripe_subscription_id' && f.value === mockSubscriptionId)) {
                return { data: null, error: userSubUpdateDbError as any, count: 0, status: 500, statusText: 'Internal Server Error' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions update query'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'token_wallets': { // Wallet lookup succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected token_wallets select'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': { // Plan lookup succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    // Stripe subscriptions.retrieve SUCCEEDS for this test
    const minimalMockSubscription: Partial<Stripe.Subscription> = { 
        id: mockSubscriptionId, status: 'active', 
        current_period_start: Math.floor(Date.now() / 1000) - 3600, 
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600),
    };
    const mockStripeSubResponse: Stripe.Response<Stripe.Subscription> = {
        ...(minimalMockSubscription as Stripe.Subscription),
        lastResponse: { headers: { 'request-id': 'req_mock_sub_update_fail' }, requestId: 'req_mock_sub_update_fail', statusCode: 200 }
    };
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => Promise.resolve(mockStripeSubResponse));
    
    if (mockTokenWalletService.stubs.recordTransaction && !mockTokenWalletService.stubs.recordTransaction.restored) {
        mockTokenWalletService.stubs.recordTransaction.restore();
    }
    mockTokenWalletService.stubs.recordTransaction = stub(mockTokenWalletService.instance, 'recordTransaction', () => Promise.resolve({ transactionId: 'txn_success_sub_fail', amount:String(tokensToAwardForPlan) } as any));
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(!result.success, 'Handler should fail due to user_subscriptions update DB error');
    assertEquals(result.transactionId, mockPaymentTxId, 'Transaction ID should be the payment_transactions ID');
    assert(result.error?.trim() === `User subscription update failed for invoice ${mockInvoiceId}. Payment transaction ${mockPaymentTxId} status reflects token award outcome, but subscription data may be stale or Stripe API failed. Final PT status update also failed.`.trim(), 'Error message mismatch for Stripe retrieve fail AFTER tokens. Actual: ' + result.error);    assertEquals(result.tokensAwarded, tokensToAwardForPlan, 'Tokens should have been awarded as user_subscriptions update fails AFTER token award succeeded');

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1); // Stripe retrieve was called and succeeded
    
    const userSubUpdateSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('user_subscriptions', 'update');
    assertEquals(userSubUpdateSpy.callCount, 1, 'user_subscriptions.update should have been attempted once and failed');
    
    assertSpyCalls(recordTxSpy, 1); // Token awarding SHOULD have been attempted and succeeded before the final return

    const historicPtxBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    const lastPtxBuilder = historicPtxBuilders?.[historicPtxBuilders.length - 1];
    const paymentUpdateSpy = lastPtxBuilder?.methodSpies.update;

    assert(paymentUpdateSpy, "Payment transaction update spy should exist");
    assert(paymentUpdateSpy.calls.some((c: SpyCall) => (c.args[0] as any).status === 'COMPLETED'), "PT should have been updated to COMPLETED despite earlier user_sub update failure");
    
    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] CRITICAL: Failed to update user_subscription ${mockSubscriptionId} for invoice ${mockInvoiceId}. PT ID: ${mockPaymentTxId}. Error: ${userSubUpdateDbError.message}`) &&
        (call.args[1] as any)?.error?.message === userSubUpdateDbError.message &&
        (call.args[1] as any)?.error?.code === userSubUpdateDbError.code &&
        (call.args[1] as any)?.paymentTransactionId === mockPaymentTxId && // Check for paymentTransactionId in metadata
        (call.args[1] as any)?.stripeSubscriptionId === mockSubscriptionId // Check for stripeSubscriptionId
      ),
      'Expected error log for user_subscriptions update failure not found, or error properties do not match.'
    );
    
    // recordTxSpy.restore(); // Not needed
    teardownInvoiceMocks();
  });

  await t.step('Error - Final payment_transactions Update to COMPLETED Fails', async () => {
    const mockUserId = 'user_final_update_fails';
    const mockStripeCustomerId = 'cus_final_update_fails';
    const mockWalletId = 'wallet_final_update_fails';
    const mockSubscriptionId = 'sub_final_update_fails';
    const mockInvoiceId = 'in_final_update_fails';
    const mockStripePriceId = 'price_for_final_update_fail';
    const mockPlanItemIdInternal = 'item_final_update_fail';
    const tokensToAwardForPlan = 700;
    const mockPaymentTxId = 'ptxn_final_update_fail_789';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        subscription: mockSubscriptionId,
        amount_paid: 3000,
      },
      mockStripePriceId
    );

    const finalUpdateDbError = { name: 'PostgrestError', message: 'Mock DB error on final COMPLETED update', code: 'XXYYZ', details: 'Mock details', hint: 'Mock hint' };

    let tempPaymentStatus = 'PROCESSING_RENEWAL'; // Initial status after insert

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { // Idempotency
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId)) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions select'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async (state: MockQueryBuilderState) => { // Initial insert succeeds
            if (state.insertData && (state.insertData as any).gateway_transaction_id === mockInvoiceId) {
              tempPaymentStatus = (state.insertData as any).status; // Capture status set by handler
              return { data: [{ id: mockPaymentTxId }], error: null, count: 1, status: 201, statusText: 'Created' };
            }
            return { data: null, error: new Error('Unexpected payment_transactions insert'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { 
            // This is the crucial part: simulate failure ONLY for the 'COMPLETED' status update
            if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && 
                (state.updateData as any).status === 'COMPLETED') {
                return { data: null, error: finalUpdateDbError as any, count: 0, status: 500, statusText: 'Internal Server Error' };
            }
            // Allow other updates (like to TOKEN_AWARD_FAILED if that were part of a different test path)
            if (state.filters.some((f: any) => f.column === 'id' && f.value === mockPaymentTxId) && 
                (state.updateData as any).status === 'TOKEN_AWARD_FAILED') {
                tempPaymentStatus = 'TOKEN_AWARD_FAILED';
                return { data: [{id: mockPaymentTxId, status: 'TOKEN_AWARD_FAILED'}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error(`Unexpected payment_transactions update: status ${(state.updateData as any).status}`), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'user_subscriptions': { // User and subscription sync succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions select'), count: 0, status: 500, statusText: 'Error' };
          },
          update: async (state: MockQueryBuilderState) => { 
            if (state.filters.some((f:any) => f.column === 'stripe_subscription_id' && f.value === mockSubscriptionId)) {
                return { data: [{stripe_subscription_id: mockSubscriptionId}], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected user_subscriptions update'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'token_wallets': { // Wallet lookup succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected token_wallets select'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'subscription_plans': { // Plan lookup succeeds
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    const minimalMockSubscription: Partial<Stripe.Subscription> = { 
        id: mockSubscriptionId, status: 'active', 
        current_period_start: Math.floor(Date.now() / 1000) - 3600, 
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600),
    };
    const mockStripeSubResponse: Stripe.Response<Stripe.Subscription> = {
        ...(minimalMockSubscription as Stripe.Subscription),
        lastResponse: { headers: { 'request-id': 'req_mock_final_update_fail' }, requestId: 'req_mock_final_update_fail', statusCode: 200 }
    };
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => Promise.resolve(mockStripeSubResponse));
    
    // Mock TokenWalletService.recordTransaction to SUCCEED
    if (mockTokenWalletService.stubs.recordTransaction && !mockTokenWalletService.stubs.recordTransaction.restored) {
        mockTokenWalletService.stubs.recordTransaction.restore();
    }
    mockTokenWalletService.stubs.recordTransaction = stub(mockTokenWalletService.instance, 'recordTransaction', () => Promise.resolve({
        transactionId: 'tktx_mock_final_update_fail',
        walletId: mockWalletId,
        type: 'CREDIT_PURCHASE',
        amount: String(tokensToAwardForPlan),
        balanceAfterTxn: String(tokensToAwardForPlan + 100), // Example balance
        recordedByUserId: mockUserId,
        timestamp: new Date(),
    } as TokenWalletTransaction));
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);

    assert(result.success, 'Handler should still return success:true even if final PT update fails, as tokens were awarded.');
    assertEquals(result.status, 200, 'Status should be 200');
    assertEquals(result.transactionId, mockPaymentTxId);
    assertEquals(result.tokensAwarded, tokensToAwardForPlan);
    assert(result.message?.includes('Payment processed and tokens awarded, but failed to update final payment status. Needs review.'), 'Incorrect success message when final PT update fails');
    assert(result.error === undefined, 'Error field should be undefined for this success case with a warning message');

    assertSpyCalls(recordTxSpy, 1);
    
    const paymentUpdateSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assertEquals(paymentUpdateSpy.callCount, 1, 'payment_transactions.update for COMPLETED should have been attempted once and failed');
    const attemptedUpdateData = paymentUpdateSpy.callsArgs[0][0] as Partial<Database['public']['Tables']['payment_transactions']['Row']>;
    assertEquals(attemptedUpdateData.status, 'COMPLETED');

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] Failed to update payment_transactions status to COMPLETED for PT ID ${mockPaymentTxId} after successful token award. Invoice ${mockInvoiceId}. Error: ${finalUpdateDbError.message}`) &&
        (call.args[1] as any)?.invoiceId === mockInvoiceId &&
        (call.args[1] as any)?.paymentTransactionId === mockPaymentTxId &&
        (call.args[1] as any)?.error?.message === finalUpdateDbError.message
      ),
      'Expected error log for final PT update failure not found, or properties do not match.'
    );
    // Verify status was left as PROCESSING_RENEWAL (or whatever it was before attempting COMPLETED)
    // This might require inspecting the database mock state if the handler doesn't explicitly set it back.
    // For this test, we primarily care that the final COMPLETED update was attempted and the log reflects the issue.
    // The actual status in the DB would be `tempPaymentStatus` which was captured if it was `PROCESSING_RENEWAL` or `TOKEN_AWARD_FAILED`.
    // If token award failed first, then the final update wouldn't even be an issue.
    // We are testing the scenario where token award succeeded. So, the status before this final failed update should be PROCESSING_RENEWAL.
    
    // recordTxSpy.restore(); // Not needed
    teardownInvoiceMocks();
  });

  // +++ NEW TESTS START HERE +++

  await t.step('Error - Idempotency check DB error', async () => {
    const mockInvoiceId = 'in_idempotency_db_error';
    const mockEvent = createMockInvoicePaymentSucceededEvent({ id: mockInvoiceId }, 'price_irrelevant');
    const dbError = { name: 'PostgrestError', message: 'Mock DB error during idempotency check', code: 'XXYYZ' };

    setupInvoiceMocks({
      genericMockResults: {
        'payment_transactions': {
          select: async () => ({ data: null, error: dbError as any, count: 0, status: 500, statusText: 'Error' }),
        },
      },
    });

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);
    assert(!result.success, 'Handler should fail');
    assertEquals(result.status, 500, 'Status should be 500');
    assertEquals(result.error, `DB error during idempotency check: ${dbError.message}`);
    assertEquals(result.transactionId, mockEvent.id); // Event ID used as fallback
    
    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(errorLogSpy.calls.some(call => (call.args[0] as string).includes(dbError.message)));
    teardownInvoiceMocks();
  });

  await t.step('Error - User not found (404)', async () => {
    const mockStripeCustomerId = 'cus_user_not_found';
    const mockInvoiceId = 'in_user_not_found';
    const mockEvent = createMockInvoicePaymentSucceededEvent({ customer: mockStripeCustomerId, id: mockInvoiceId }, 'price_irrelevant');
    const dbError = { name: 'PostgrestError', message: 'User not found', code: 'PGRST116' }; // Simulate PostgREST "no rows"

    setupInvoiceMocks({
      genericMockResults: {
        'payment_transactions': { // Idempotency check passes
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }),
        },
        'user_subscriptions': { // User lookup fails
          select: async () => ({ data: null, error: dbError as any, count: 0, status: 404, statusText: 'Not Found' }),
        },
      },
    });

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);
    assert(!result.success, 'Handler should fail');
    assertEquals(result.status, 404, 'Status should be 404');
    assertEquals(result.error, `User not found for customer ${mockStripeCustomerId}`);
    assertEquals(result.transactionId, mockEvent.id);

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(errorLogSpy.calls.some(call => (call.args[0] as string).includes(`Could not find user/user_id for Stripe customer ${mockStripeCustomerId}`)));
    teardownInvoiceMocks();
  });

  await t.step('Error - Token Wallet not found (404)', async () => {
    const mockUserId = 'user_wallet_not_found';
    const mockStripeCustomerId = 'cus_wallet_not_found';
    const mockInvoiceId = 'in_wallet_not_found';
    const mockEvent = createMockInvoicePaymentSucceededEvent({ customer: mockStripeCustomerId, id: mockInvoiceId }, 'price_irrelevant');
    const dbError = { name: 'PostgrestError', message: 'Wallet not found', code: 'PGRST116' };

    setupInvoiceMocks({
      genericMockResults: {
        'payment_transactions': {
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }),
        },
        'user_subscriptions': {
          select: async () => ({ data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        },
        'token_wallets': { // Wallet lookup fails
          select: async () => ({ data: null, error: dbError as any, count: 0, status: 404, statusText: 'Not Found' }),
        },
      },
    });
    
    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);
    assert(!result.success, 'Handler should fail');
    assertEquals(result.status, 404, 'Status should be 404');
    assertEquals(result.error, `Wallet not found for user ${mockUserId}`);
    assertEquals(result.transactionId, mockEvent.id);

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(errorLogSpy.calls.some(call => (call.args[0] as string).includes(`Token wallet not found for user ${mockUserId}`)));
    teardownInvoiceMocks();
  });

  await t.step('Error - Subscription Plan not found (422), FAILED PT created', async () => {
    const mockUserId = 'user_plan_not_found';
    const mockStripeCustomerId = 'cus_plan_not_found';
    const mockWalletId = 'wallet_plan_not_found';
    const mockInvoiceId = 'in_plan_not_found';
    const mockStripePriceId = 'price_plan_is_missing';
    const mockEvent = createMockInvoicePaymentSucceededEvent(
        { customer: mockStripeCustomerId, id: mockInvoiceId, amount_paid: 1000, currency: 'usd' }, 
        mockStripePriceId
    );
    const dbError = { name: 'PostgrestError', message: 'Plan not found', code: 'PGRST116' };

    let failedPtInserted = false;

    setupInvoiceMocks({
      genericMockResults: {
        'payment_transactions': {
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }), // Idempotency
          insert: async (state: MockQueryBuilderState) => { // For the FAILED PT record
            if ((state.insertData as any)?.status === 'FAILED' && 
                (state.insertData as any)?.gateway_transaction_id === mockInvoiceId &&
                (state.insertData as any)?.metadata_json?.type === 'RENEWAL_PLAN_NOT_FOUND'
            ) {
              failedPtInserted = true;
              return { data: [{id: 'pt_failed_plan_lookup'}], error: null, count: 1, status: 201, statusText: 'Created' };
            }
            return { data: null, error: new Error('Unexpected PT insert for plan not found test'), count: 0, status: 500, statusText: 'Error' };
          }
        },
        'user_subscriptions': {
          select: async () => ({ data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        },
        'token_wallets': {
          select: async () => ({ data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        },
        'subscription_plans': { // Plan lookup fails
          select: async () => ({ data: null, error: dbError as any, count: 0, status: 404, statusText: 'Not Found' }),
        },
      },
    });
    
    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);
    assert(!result.success, 'Handler should fail');
    assertEquals(result.status, 422, 'Status should be 422');
    assertEquals(result.error, `Subscription plan details not found for price ID ${mockStripePriceId}.`);
    assertEquals(result.transactionId, mockEvent.id); // Event ID, as main PT not created
    assert(failedPtInserted, "A FAILED payment transaction should have been inserted due to plan not found");

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(errorLogSpy.calls.some(call => (call.args[0] as string).includes(`CRITICAL: Could not find plan info for Stripe Price ID ${mockStripePriceId}`)));
    teardownInvoiceMocks();
  });


  // --- Tests for scenarios where UserSubscription update fails AFTER successful token award ---
  await t.step('Error - User Subscription update fails (DB) AFTER successful token award -> 500', async () => {
    const mockUserId = 'user_sub_update_fail_after_tokens';
    const mockStripeCustomerId = 'cus_sub_update_fail_after_tokens';
    const mockWalletId = 'wallet_sub_update_fail_after_tokens';
    const mockSubscriptionId = 'sub_final_sub_update_fail_db';
    const mockInvoiceId = 'in_final_sub_update_fail_db';
    const mockStripePriceId = 'price_final_sub_update_fail_db';
    const mockPlanItemIdInternal = 'item_final_sub_update_fail_db';
    const tokensToAwardForPlan = 800;
    const mockPaymentTxId = 'ptxn_final_sub_update_fail_db';

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      { id: mockInvoiceId, customer: mockStripeCustomerId, subscription: mockSubscriptionId, amount_paid: 3000 },
      mockStripePriceId
    );

    const userSubUpdateDbError = { name: 'PostgrestError', message: 'Mock DB error on user_subscriptions update AFTER tokens', code: 'XXYYZ' };

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' }), // Idempotency check
          insert: async () => ({ data: [{ id: mockPaymentTxId }], error: null, count: 1, status: 201, statusText: 'Created' }), // PT Insert SUCCEEDS
          update: async (state: MockQueryBuilderState) => {
            if ((state.updateData as any)?.status === 'COMPLETED' && state.filters.some(f => f.column === 'id' && f.value === mockPaymentTxId)) {
              // This is the final PT update to COMPLETED. It needs to fail.
              const finalPtUpdateError = new Error('Mocked final PT update failure for Stripe SubRtrvAftrTkn test');
              return { data: null, error: finalPtUpdateError, count: 0, status: 500, statusText: 'Error' };
            }
            // Fallback for any other unexpected PT update
            return { data: null, error: new Error('Unexpected PT update state (non-COMPLETED) in Stripe SubRtrvAftrTkn test'), count: 0, status: 500, statusText: 'Error' };
          },
        },
        'user_subscriptions': {
          select: async () => ({ data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' }),
          // .update() for user_subscriptions should NOT be called if stripe.retrieve fails first.
          // The mock for user_subscriptions.update can be set to throw to catch if it's unexpectedly called.
          update: async () => { throw new Error("user_subscriptions.update should not be called if stripe.retrieve fails before it"); }
        },
        'token_wallets': {
          select: async () => ({ data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' }),
        },
        'subscription_plans': {
          select: async () => ({ data: [{ item_id_internal: mockPlanItemIdInternal, tokens_awarded: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' }),
        }
      }
    };
    setupInvoiceMocks(dbConfig);

    // Stripe subscriptions.retrieve: first call SUCCEEDS, second call FAILS
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
        mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    const goodSubResponse = { 
      id: mockSubscriptionId, 
      status: 'active', 
      current_period_start: Math.floor((Date.now() / 1000) - 3600),
      current_period_end: Math.floor((Date.now() / 1000) + (3600 * 24 * 30)),
      // metadata: { internal_plan_id: mockPlanItemIdInternal }, // Not strictly needed for retrieve if plan already fetched
      lastResponse: { statusCode: 200 } 
    } as Stripe.Response<Stripe.Subscription>;

    let retrieveCallCount = 0;
    const stripeRetrieveError = new Error('Mocked Stripe subscription retrieval failure for Stripe SubRtrvAftrTkn test');
    mockStripe.stubs.subscriptionsRetrieve = stub(mockStripe.instance.subscriptions, "retrieve", () => {
      retrieveCallCount++;
      if (retrieveCallCount === 1) { // Call from ensureValidSubscriptionAndGetPlanData
        return Promise.resolve(goodSubResponse);
      }
      // Second call from updateUserSubscriptionAndStripeData
      return Promise.reject(stripeRetrieveError); 
    });
    
    // TokenWalletService.recordTransaction SUCCEEDS
    if (mockTokenWalletService.stubs.recordTransaction && !mockTokenWalletService.stubs.recordTransaction.restored) {
        mockTokenWalletService.stubs.recordTransaction.restore();
    }
    mockTokenWalletService.stubs.recordTransaction = stub(mockTokenWalletService.instance, 'recordTransaction', () => Promise.resolve({ transactionId: 'txn_success_retrieve_fail', amount: String(tokensToAwardForPlan) } as any));
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    const result = await handleInvoicePaymentSucceeded(handlerContext, mockEvent);
    console.log('[Test: Stripe Subscription retrieve fails AFTER token award] Actual result.error:', result.error);

    assert(!result.success, 'Handler should fail because Stripe subscription retrieve failed after token award');
    assertEquals(result.status, 500, 'Status should be 500');
    assertEquals(result.transactionId, mockPaymentTxId, 'Transaction ID should be the payment_transactions ID');
    assertEquals(result.tokensAwarded, 0, 'Tokens awarded should be 0 as Stripe retrieve failed after token award, triggering specific error path. Actual: ' + result.tokensAwarded); // Added actual to message
    assert(result.error?.trim() === `User subscription update failed for invoice ${mockInvoiceId}. Payment transaction ${mockPaymentTxId} status reflects token award outcome, but subscription data may be stale or Stripe API failed. Final PT status update also failed.`.trim(), 'Error message mismatch for user sub update fail AFTER tokens. Actual: ' + result.error);
    assertSpyCalls(recordTxSpy, 1); 
    assertEquals(retrieveCallCount, 2, "Stripe subscriptions.retrieve should have been called twice");

    // Check that payment_transactions.update to COMPLETED was ATTEMPTED and SUCCEEDED (as per this test's dbConfig)
    const paymentUpdateToCompletedSpy = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assert(paymentUpdateToCompletedSpy.callCount > 0, 'payment_transactions.update should have been attempted at least once.');
    
    const attemptedCompletedUpdate = paymentUpdateToCompletedSpy.calls.find((call: SpyCall) => 
      (call.args[0] as Partial<Database['public']['Tables']['payment_transactions']['Row']>)?.status === 'COMPLETED' &&
      (call.args[1] as any)?.eq?.some((eqArgs: any[]) => eqArgs[0] === 'id' && eqArgs[1] === mockPaymentTxId)
    );
    assert(attemptedCompletedUpdate, 'An attempt to update PT to COMPLETED for the correct ID was not found or its mock did not resolve as success.');

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    // This log for PT update failure should NOT be present because the mock for PT update makes it succeed.
    const ptUpdateFailureLog = errorLogSpy.calls.find((call: SpyCall) => 
      (call.args[0] as string).includes(`Failed to update payment_transactions for ID ${mockPaymentTxId} to status COMPLETED`)
    );
    assert(!ptUpdateFailureLog, 'Log for PT update failure to COMPLETED should not be present as the mock makes it succeed in this test.');
    
    // Check for the critical error log from Stripe subscription retrieval failure (the second call)
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] CRITICAL: Failed to retrieve Stripe subscription ${mockSubscriptionId} for invoice ${mockInvoiceId} to update user_subscription. PT ID: ${mockPaymentTxId}. Error: ${stripeRetrieveError.message}`) &&
        (call.args[1] as any)?.stripeSubscriptionId === mockSubscriptionId &&
        (call.args[1] as any)?.invoiceId === mockInvoiceId &&
        (call.args[1] as any)?.paymentTransactionId === mockPaymentTxId &&
        (call.args[1] as any)?.error?.message === stripeRetrieveError.message
      ),
      `Expected CRITICAL error log for Stripe subscription retrieval failure (after token award) not found or properties mismatch. Found logs: ${errorLogSpy.calls.map(c => c.args[0]).join(', ')}`
    );

    const warnLogSpy = mockInvoiceLogger.warn as Spy<any, any[], any>;
    assert(warnLogSpy.calls.some(call => (call.args[0] as string).includes(`User subscription update failed earlier for invoice ${mockInvoiceId}. Tokens awarded, PT COMPLETED, but returning 500`)));


    teardownInvoiceMocks();
  });

  // +++ NEW TESTS END HERE +++

  // More tests for handleInvoicePaymentSucceeded will go here
});