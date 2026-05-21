import { StripePaymentAdapter } from './stripePaymentAdapter.ts';
import type { MockAdminTokenWalletService } from '../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import Stripe from 'npm:stripe';
import type {
  OrchestrationLineItemMetadata,
  PurchaseRequest,
  PaymentOrchestrationContext,
} from '../../types/payment.types.ts';
import {
  MOCK_MULTI_OTP_ITEM,
  MOCK_MULTI_OTP_ITEM_2,
  MOCK_MULTI_SUB_ITEM,
  MOCK_PLAN_TS,
  mockPaymentIntentRetrieveNoData,
  mockPaymentOrchestrationContext,
  mockStripeCheckoutSessionResponse,
  mockStripeCheckoutSessionWithExpandedPaymentIntent,
  mockStripePaymentIntentResponse,
  setupMocksAndAdapter,
  teardownMocks,
} from './stripePaymentAdapter.mock.ts';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  stub,
  type SpyCall,
} from 'jsr:@std/testing@0.225.1/mock';
import type { MockStripe } from '../../stripe.mock.ts';
import type {
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
  MockQueryBuilderState,
} from '../../supabase.mock.ts';
import { Database } from '../../../types_db.ts';

type SubscriptionPlansRow =
  Database['public']['Tables']['subscription_plans']['Row'];

Deno.test('StripePaymentAdapter: initiatePayment', async (t) => {
  
  let mockStripe: MockStripe;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let adapter: StripePaymentAdapter;

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

    const planData: SubscriptionPlansRow = {
      id: 'sp_row_otp_happy',
      active: true,
      amount: 10,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_otp_standard_id',
      metadata: null,
      name: 'Mock OTP Plan',
      plan_type: 'one_time_purchase',
      stripe_price_id: context.itemId,
      stripe_product_id: null,
      tokens_to_award: 1000,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
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
            // The adapter queries by 'stripe_price_id' using context.itemId as the value
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === context.itemId)) {
              return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            const mockError = new Error(`Mock: Plan not found for stripe_price_id ${context.itemId}`);
            return { data: [], error: mockError, count: 0, status: 404, statusText: 'Not Found' };
          }
        },
        // No 'payment_transactions' mock needed here for initiatePayment adapter unit test
      }
    };
    
    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));

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
    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0, "createWallet should not be called by adapter");

    // Assert that subscription_plans was queried correctly
    assert(mockSupabaseSetup.spies.fromSpy.calls.some((call: SpyCall) => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called.");
    
    const selectSpy = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'select');
    assertExists(selectSpy, "Select spy for subscription_plans should exist (OTP)");
    assertSpyCalls(selectSpy, 1);

    const eqSpy = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'eq');
    assertExists(eqSpy, "eq spy for subscription_plans should exist (OTP)");
    assertSpyCalls(eqSpy, 1);
    assertEquals(eqSpy.calls[0].args, ['stripe_price_id', context.itemId], "eq on subscription_plans called with wrong arguments (OTP)");

    const singleSpy = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'single');
    assertExists(singleSpy, "single spy for subscription_plans should exist (OTP)");
    assertSpyCalls(singleSpy, 1);

    teardownMocks(mockStripe, mockTokenWalletService);
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
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === context.itemId)) {
                // Simulate item not found
                return { data: [], error: { name: 'PostgrestError', message: 'Item not found', code: 'PGRST116' } as any, count: 0, status: 404, statusText: 'Not Found' };
            }
            const mockError = new Error('Mock: Unexpected item_id_internal query');
            return { data: [], error: mockError, count: 0, status: 500, statusText: 'Internal Server Error' };
          }
        }
      }
    };
    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));

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

    // Assert that subscription_plans was queried correctly even in failure case
    assert(mockSupabaseSetup.spies.fromSpy.calls.some((call: SpyCall) => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called (item not found case).");

    const selectSpyNotFound = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'select');
    assertExists(selectSpyNotFound, "Select spy for subscription_plans should exist (item not found case)");
    assertSpyCalls(selectSpyNotFound, 1);

    const eqSpyNotFound = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'eq');
    assertExists(eqSpyNotFound, "eq spy for subscription_plans should exist (item not found case)");
    assertSpyCalls(eqSpyNotFound, 1);
    assertEquals(eqSpyNotFound.calls[0].args, ['stripe_price_id', context.itemId], "eq on subscription_plans called with wrong arguments (item not found case)");
    
    const singleSpyNotFound = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'single');
    assertExists(singleSpyNotFound, "single spy for subscription_plans should exist (item not found case)");
    assertSpyCalls(singleSpyNotFound, 1);

    teardownMocks(mockStripe, mockTokenWalletService);
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

    const planData: SubscriptionPlansRow = {
      id: 'sp_row_stripe_error_final',
      active: true,
      amount: 25,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_stripe_error_final',
      metadata: null,
      name: 'Mock Plan Stripe Error Final',
      plan_type: 'one_time_purchase',
      stripe_price_id: 'price_stripe_error_final',
      stripe_product_id: null,
      tokens_to_award: 300,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
    }; 
    const stripeError = new Error('Mock Stripe API error during session creation final test');

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === context.itemId)) {
                return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Plan not found in Stripe error final test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      }
    };
    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));
    
    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.reject(stripeError));

    const result = await adapter.initiatePayment(context);

    assert(!result.success, 'Payment initiation should fail when Stripe API errors (final test)');
    assert(result.error?.includes(stripeError.message), 'Error message should indicate Stripe API error (final test)');
    
    assertEquals(mockStripe.stubs.checkoutSessionsCreate.calls.length, 1, "Stripe checkout session creation should have been attempted once (final test)");

    // Assert that subscription_plans was queried correctly before Stripe call
    assert(mockSupabaseSetup.spies.fromSpy.calls.some((call: SpyCall) => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called (Stripe checkout fail case).");

    const selectSpyStripeFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'select');
    assertExists(selectSpyStripeFail, "Select spy for subscription_plans should exist (Stripe checkout fail case)");
    assertSpyCalls(selectSpyStripeFail, 1);

    const eqSpyStripeFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'eq');
    assertExists(eqSpyStripeFail, "eq spy for subscription_plans should exist (Stripe checkout fail case)");
    assertSpyCalls(eqSpyStripeFail, 1);
    assertEquals(eqSpyStripeFail.calls[0].args, ['stripe_price_id', context.itemId], "eq on subscription_plans called with wrong arguments (Stripe checkout fail case)");

    const singleSpyStripeFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'single');
    assertExists(singleSpyStripeFail, "single spy for subscription_plans should exist (Stripe checkout fail case)");
    assertSpyCalls(singleSpyStripeFail, 1);
    
    assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1); // Ensure Stripe's create was indeed called

    teardownMocks(mockStripe, mockTokenWalletService);
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

    const planData: SubscriptionPlansRow = {
      id: 'sp_row_api_error',
      active: true,
      amount: 20,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_causes_error',
      metadata: null,
      name: 'Mock Plan API Error',
      plan_type: 'one_time_purchase',
      stripe_price_id: 'price_causes_error',
      stripe_product_id: null,
      tokens_to_award: 500,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
    };
    // const walletData = { walletId: 'wallet-for-user-stripe-error', balance: '0', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: basePurchaseRequest.userId } as TokenWallet;

    const supabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => { 
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === context.itemId)) {
                return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            const mockError = new Error('Mock: unexpected item_id in Stripe API error test');
            return { data: [], error: mockError, count: 0, status: 500, statusText: 'Server Error' };
          }
        }
      }
    };
    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));

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

    // Check DB calls
    const selectSpyApiFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'select');
    assertExists(selectSpyApiFail, "Select spy for subscription_plans should exist (Stripe API fail case)");
    assertSpyCalls(selectSpyApiFail, 1);

    const eqSpyApiFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'eq');
    assertExists(eqSpyApiFail, "eq spy for subscription_plans should exist (Stripe API fail case)");
    assertSpyCalls(eqSpyApiFail, 1);

    const singleSpyApiFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'single');
    assertExists(singleSpyApiFail, "single spy for subscription_plans should exist (Stripe API fail case)");
    assertSpyCalls(singleSpyApiFail, 1);

    // Check Stripe calls
    assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1); // Session creation should still be called and succeed here
    assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 0); // This is where the error is thrown, so it won't complete successfully.
                                                              // If the mock is set to throw, callCount might be 1 or 0 depending on when it throws.
                                                              // The critical part is that the overall initiatePayment fails as expected.

    teardownMocks(mockStripe, mockTokenWalletService);
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

    const planData: SubscriptionPlansRow = {
      id: 'sp_row_pi_error',
      active: true,
      amount: 30,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_causes_pi_error',
      metadata: null,
      name: 'Mock Plan PI Error',
      plan_type: 'one_time_purchase',
      stripe_price_id: 'price_causes_pi_error',
      stripe_product_id: null,
      tokens_to_award: 600,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
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
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === context.itemId)) {
                return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: [], error: new Error('Mock: Plan not found in PI retrieve error test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      }
    };
    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));

    if (mockStripe.stubs.checkoutSessionsCreate?.restore) mockStripe.stubs.checkoutSessionsCreate.restore();
    mockStripe.stubs.checkoutSessionsCreate = stub(mockStripe.instance.checkout.sessions, "create", () => Promise.resolve(stripeSessionData));

    if (mockStripe.stubs.paymentIntentsRetrieve?.restore) mockStripe.stubs.paymentIntentsRetrieve.restore();
    mockStripe.stubs.paymentIntentsRetrieve = stub(mockStripe.instance.paymentIntents, "retrieve", () => Promise.reject(retrieveError));

    const result = await adapter.initiatePayment(context);

    assert(!result.success, 'Payment initiation should fail when PaymentIntent retrieve fails');
    assertEquals(result.error, retrieveError.message, "Error message should match the rejected PaymentIntent retrieve error");
    
    assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
    assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1);

    // Check DB calls
    const selectSpyPiFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'select');
    assertExists(selectSpyPiFail, "Select spy for subscription_plans should exist (PI retrieve fail case)");
    assertSpyCalls(selectSpyPiFail, 1);

    const eqSpyPiFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'eq');
    assertExists(eqSpyPiFail, "eq spy for subscription_plans should exist (PI retrieve fail case)");
    assertSpyCalls(eqSpyPiFail, 1);

    const singleSpyPiFail = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'single');
    assertExists(singleSpyPiFail, "single spy for subscription_plans should exist (PI retrieve fail case)");
    assertSpyCalls(singleSpyPiFail, 1);

    // Check Stripe calls
    assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
    assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1); // This is called, but the mock makes it throw an error

    teardownMocks(mockStripe, mockTokenWalletService);
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

    const planData: SubscriptionPlansRow = {
      id: 'sp_row_sub_premium',
      active: true,
      amount: 25,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_sub_premium',
      metadata: null,
      name: 'Mock Sub Premium Plan',
      plan_type: 'subscription',
      stripe_price_id: 'price_sub_premium',
      stripe_product_id: null,
      tokens_to_award: 5000,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
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
            if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === context.itemId)) {
              return { data: [planData], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            const mockError = new Error('Mock: item_id_internal not found for subscription plan query');
            return { data: [], error: mockError, count: 0, status: 404, statusText: 'Not Found' };
          }
        },
      }
    };
    
    ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));

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

    // mockTokenWalletService.getWalletForContext should not have been called by the adapter
    assertEquals(mockTokenWalletService.stubs.createWallet.calls.length, 0, "createWallet should not be called by adapter (sub)");

    // Assert that subscription_plans was queried correctly
    assert(mockSupabaseSetup.spies.fromSpy.calls.some((call: SpyCall) => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called (Sub).");
    
    const selectSpySub = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'select');
    assertExists(selectSpySub, "Select spy for subscription_plans should exist (Sub)");
    assertSpyCalls(selectSpySub, 1);

    const eqSpySub = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'eq');
    assertExists(eqSpySub, "eq spy for subscription_plans should exist (Sub)");
    assertSpyCalls(eqSpySub, 1);
    assertEquals(eqSpySub.calls[0].args, ['stripe_price_id', context.itemId], "eq on subscription_plans called with wrong arguments (Sub)");

    const singleSpySub = mockSupabaseSetup.client.getSpiesForTableQueryMethod('subscription_plans', 'single');
    assertExists(singleSpySub, "single spy for subscription_plans should exist (Sub)");
    assertSpyCalls(singleSpySub, 1);

    teardownMocks(mockStripe, mockTokenWalletService);
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

    const planDataMissingType: SubscriptionPlansRow = {
      id: 'sp_row_missing_plan_type',
      active: true,
      amount: 12,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_missing_type',
      metadata: null,
      name: 'Mock Plan Missing Plan Type',
      plan_type: '',
      stripe_price_id: 'price_for_missing_type',
      stripe_product_id: null,
      tokens_to_award: 250,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
    };

    const planDataInvalidType: SubscriptionPlansRow = {
      id: 'sp_row_invalid_plan_type',
      active: true,
      amount: 12,
      created_at: MOCK_PLAN_TS,
      currency: 'USD',
      description: null,
      interval: null,
      interval_count: null,
      item_id_internal: 'internal_invalid_type',
      metadata: null,
      name: 'Mock Plan Invalid Plan Type',
      plan_type: 'some_unsupported_type',
      stripe_price_id: 'price_for_invalid_type',
      stripe_product_id: null,
      tokens_to_award: 250,
      updated_at: MOCK_PLAN_TS,
      tier_level: 0,
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
              if (state.filters.some(f => f.column === 'stripe_price_id' && f.value === currentItemId)) {
                  return { data: [scenario.data], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: new Error('Mock: Plan not found in invalid plan_type test'), count: 0, status: 404, statusText: 'Not Found' };
            }
          },
        }
      };
      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
      setupMocksAndAdapter(supabaseConfig));

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
      
      const effectivePlanType: string = scenario.data.plan_type;

      const expectedErrorMessage = `Invalid or missing plan_type: '${effectivePlanType}' received for item ID: ${currentItemId}. Cannot determine Stripe session mode.`;
      assertEquals(result.error, expectedErrorMessage, `Error message not as expected for ${scenario.name}`);
      assertEquals(result.transactionId, currentContext.internalPaymentId);
      assertSpyCalls(checkoutCreateStub, 0);

      teardownMocks(mockStripe, mockTokenWalletService);
    }
  });

  await t.step(
    'initiatePayment - multi-item: subscription + OTP builds correct line_items and uses subscription mode',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM, MOCK_MULTI_OTP_ITEM],
        checkoutMode: 'subscription',
        tokensToAward: 7000,
        internalPaymentId: 'ptxn_multi_sub_otp_001',
        userId: 'user-multi-sub-otp',
        targetWalletId: 'wallet_multi_sub_otp',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionResponse({
          id: 'cs_test_multi_sub_otp',
          url: 'https://stripe.com/pay/multi_sub_otp',
          payment_intent: 'pi_multi_sub_otp',
          status: 'open',
        });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      const mockPaymentIntentResponse: Stripe.Response<Stripe.PaymentIntent> =
        mockStripePaymentIntentResponse({
          id: 'pi_multi_sub_otp',
          client_secret: 'pi_multi_sub_otp_secret',
        });

      if (mockStripe.stubs.paymentIntentsRetrieve?.restore) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        'retrieve',
        () => Promise.resolve(mockPaymentIntentResponse),
      );

      const result = await adapter.initiatePayment(context);

      assert(result.success, `Multi-item payment should succeed. Error: ${result.error}`);
      const createCallArgs = mockStripe.stubs.checkoutSessionsCreate.calls[0]?.args[0] as Stripe.Checkout.SessionCreateParams;
      assert(createCallArgs, 'Stripe session create was not called or args not captured');
      assertEquals(createCallArgs.mode, 'subscription');
      assertEquals(createCallArgs.line_items?.length, 2);
      assertEquals(createCallArgs.line_items?.[0].price, MOCK_MULTI_SUB_ITEM.stripePriceId);
      assertEquals(createCallArgs.line_items?.[0].quantity, 1);
      assertEquals(createCallArgs.line_items?.[1].price, MOCK_MULTI_OTP_ITEM.stripePriceId);
      assertEquals(createCallArgs.line_items?.[1].quantity, 2);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item: metadata encodes per-item array and uses subscription item for item_id',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM, MOCK_MULTI_OTP_ITEM],
        checkoutMode: 'subscription',
        tokensToAward: 7000,
        internalPaymentId: 'ptxn_multi_metadata_001',
        userId: 'user-multi-metadata',
        targetWalletId: 'wallet_multi_metadata',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionResponse({
          id: 'cs_test_multi_metadata',
          url: 'https://stripe.com/pay/multi_metadata',
          payment_intent: 'pi_multi_metadata',
          status: 'open',
        });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      const mockPaymentIntentMetadataResponse: Stripe.Response<Stripe.PaymentIntent> =
        mockStripePaymentIntentResponse({
          id: 'pi_multi_metadata',
          client_secret: 'pi_multi_metadata_secret',
        });

      if (mockStripe.stubs.paymentIntentsRetrieve?.restore) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        'retrieve',
        () => Promise.resolve(mockPaymentIntentMetadataResponse),
      );

      const result = await adapter.initiatePayment(context);

      assert(result.success, `Multi-item metadata test should succeed. Error: ${result.error}`);
      assertEquals(result.clientSecret, 'pi_multi_metadata_secret');
      const createCallArgs = mockStripe.stubs.checkoutSessionsCreate.calls[0]?.args[0] as Stripe.Checkout.SessionCreateParams;
      assert(createCallArgs, 'Stripe session create was not called or args not captured');
      assertEquals(createCallArgs.metadata?.item_id, MOCK_MULTI_SUB_ITEM.itemId);
      assertEquals(createCallArgs.metadata?.tokens_to_award, '7000');
      const itemsField: string | number | null | undefined = createCallArgs.metadata?.items;
      assert(typeof itemsField === 'string', 'metadata.items must be a JSON string for multi-item checkout');
      const parsedItems: OrchestrationLineItemMetadata[] = JSON.parse(itemsField);
      assertEquals(parsedItems.length, 2);
      assertEquals(parsedItems[0].itemId, MOCK_MULTI_SUB_ITEM.itemId);
      assertEquals(parsedItems[0].quantity, MOCK_MULTI_SUB_ITEM.quantity);
      assertEquals(parsedItems[0].tokensToAward, MOCK_MULTI_SUB_ITEM.tokensToAward);
      assertEquals(parsedItems[1].itemId, MOCK_MULTI_OTP_ITEM.itemId);
      assertEquals(parsedItems[1].quantity, MOCK_MULTI_OTP_ITEM.quantity);
      assertEquals(parsedItems[1].tokensToAward, MOCK_MULTI_OTP_ITEM.tokensToAward);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item: OTP-only uses payment mode and first item for item_id',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_OTP_ITEM, MOCK_MULTI_OTP_ITEM_2],
        checkoutMode: 'payment',
        tokensToAward: 11000,
        internalPaymentId: 'ptxn_multi_otp_only_001',
        userId: 'user-multi-otp-only',
        targetWalletId: 'wallet_multi_otp_only',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData = {
        id: 'cs_test_multi_otp_only',
        url: 'https://stripe.com/pay/multi_otp_only',
        object: 'checkout.session',
        status: 'open',
        livemode: false,
        lastResponse: {
          headers: {},
          requestId: 'req_test_multi_otp_only',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.Checkout.Session>;

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      const result = await adapter.initiatePayment(context);

      assert(result.success, `OTP-only multi-item should succeed. Error: ${result.error}`);
      const createCallArgs = mockStripe.stubs.checkoutSessionsCreate.calls[0]?.args[0] as Stripe.Checkout.SessionCreateParams;
      assert(createCallArgs, 'Stripe session create was not called or args not captured');
      assertEquals(createCallArgs.mode, 'payment');
      assertEquals(createCallArgs.metadata?.item_id, MOCK_MULTI_OTP_ITEM.itemId);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item: skips subscription_plans query when lineItems present',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM, MOCK_MULTI_OTP_ITEM],
        checkoutMode: 'subscription',
        tokensToAward: 7000,
        internalPaymentId: 'ptxn_multi_no_db_001',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData = {
        id: 'cs_test_multi_no_db',
        url: 'https://stripe.com/pay/multi_no_db',
        object: 'checkout.session',
        status: 'open',
        livemode: false,
        lastResponse: {
          headers: {},
          requestId: 'req_test_multi_no_db',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.Checkout.Session>;

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      const result = await adapter.initiatePayment(context);

      assert(result.success, `Multi-item should succeed without DB plan query. Error: ${result.error}`);
      assert(
        !mockSupabaseSetup.spies.fromSpy.calls.some(
          (call: SpyCall) => call.args[0] === 'subscription_plans',
        ),
        "subscription_plans must not be queried when lineItems are pre-resolved",
      );

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item error: checkoutMode missing returns failure without calling Stripe',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM],
        checkoutMode: undefined,
        internalPaymentId: 'ptxn_multi_no_mode_001',
      });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => {
          throw new Error('Stripe checkout.sessions.create must not be called when checkoutMode is missing');
        },
      );

      const result = await adapter.initiatePayment(context);

      assertEquals(result.success, false);
      assertEquals(
        result.error,
        'checkoutMode is required when lineItems are provided',
      );
      assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 0);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item: string payment_intent requires retrieve to return PaymentIntent with client_secret',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM],
        checkoutMode: 'subscription',
        internalPaymentId: 'ptxn_multi_pi_valid_001',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionResponse({
          id: 'cs_test_multi_pi_valid',
          url: 'https://stripe.com/pay/multi_pi_valid',
          payment_intent: 'pi_multi_valid',
          status: 'open',
        });

      const mockPaymentIntentValidResponse: Stripe.Response<Stripe.PaymentIntent> =
        mockStripePaymentIntentResponse({
          id: 'pi_multi_valid',
          client_secret: 'pi_multi_valid_secret',
        });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      if (mockStripe.stubs.paymentIntentsRetrieve?.restore) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        'retrieve',
        () => Promise.resolve(mockPaymentIntentValidResponse),
      );

      const result = await adapter.initiatePayment(context);

      assert(result.success, `Multi-item with valid PaymentIntent must succeed. Error: ${result.error}`);
      assertEquals(result.clientSecret, 'pi_multi_valid_secret');
      assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item error: string payment_intent fails when retrieve returns no PaymentIntent',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM],
        checkoutMode: 'subscription',
        internalPaymentId: 'ptxn_multi_pi_empty_001',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionResponse({
          id: 'cs_test_multi_pi_empty',
          url: 'https://stripe.com/pay/multi_pi_empty',
          payment_intent: 'pi_multi_empty',
          status: 'open',
        });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      if (mockStripe.stubs.paymentIntentsRetrieve?.restore) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        'retrieve',
        mockPaymentIntentRetrieveNoData,
      );

      const result = await adapter.initiatePayment(context);

      assertEquals(result.success, false);
      assertEquals(
        result.error,
        'PaymentIntent retrieve returned no data for checkout session payment_intent',
      );
      assertEquals(result.transactionId, context.internalPaymentId);
      assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
      assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item error: string payment_intent fails when retrieved PaymentIntent has no client_secret',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_SUB_ITEM],
        checkoutMode: 'subscription',
        internalPaymentId: 'ptxn_multi_pi_no_secret_001',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionResponse({
          id: 'cs_test_multi_pi_no_secret',
          url: 'https://stripe.com/pay/multi_pi_no_secret',
          payment_intent: 'pi_multi_no_secret',
          status: 'open',
        });

      const mockPaymentIntentNoSecretResponse: Stripe.Response<Stripe.PaymentIntent> =
        mockStripePaymentIntentResponse({
          id: 'pi_multi_no_secret',
          client_secret: null,
        });

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      if (mockStripe.stubs.paymentIntentsRetrieve?.restore) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        'retrieve',
        () => Promise.resolve(mockPaymentIntentNoSecretResponse),
      );

      const result = await adapter.initiatePayment(context);

      assertEquals(result.success, false);
      assertEquals(
        result.error,
        'PaymentIntent client_secret is missing after retrieve',
      );
      assertEquals(result.transactionId, context.internalPaymentId);
      assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
      assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 1);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

  await t.step(
    'initiatePayment - multi-item error: expanded payment_intent on session fails when client_secret is missing',
    async () => {
      const context: PaymentOrchestrationContext = mockPaymentOrchestrationContext({
        lineItems: [MOCK_MULTI_OTP_ITEM],
        checkoutMode: 'payment',
        internalPaymentId: 'ptxn_multi_expanded_pi_001',
        metadata: { request_origin: 'http://localhost:3000' },
      });

      const stripeSessionData: Stripe.Response<Stripe.Checkout.Session> =
        mockStripeCheckoutSessionWithExpandedPaymentIntent(
          {
            id: 'cs_test_multi_expanded_pi',
            url: 'https://stripe.com/pay/multi_expanded_pi',
            status: 'open',
          },
          {
            id: 'pi_multi_expanded_no_secret',
            client_secret: null,
          },
        );

      ({ mockStripe, mockSupabaseSetup, mockTokenWalletService, adapter } =
        setupMocksAndAdapter({}));

      if (mockStripe.stubs.checkoutSessionsCreate?.restore) {
        mockStripe.stubs.checkoutSessionsCreate.restore();
      }
      mockStripe.stubs.checkoutSessionsCreate = stub(
        mockStripe.instance.checkout.sessions,
        'create',
        () => Promise.resolve(stripeSessionData),
      );

      if (mockStripe.stubs.paymentIntentsRetrieve?.restore) {
        mockStripe.stubs.paymentIntentsRetrieve.restore();
      }
      mockStripe.stubs.paymentIntentsRetrieve = stub(
        mockStripe.instance.paymentIntents,
        'retrieve',
        () => {
          throw new Error('paymentIntents.retrieve must not be called for expanded payment_intent on session');
        },
      );

      const result = await adapter.initiatePayment(context);

      assertEquals(result.success, false);
      assertEquals(
        result.error,
        'PaymentIntent client_secret is missing on checkout session payment_intent',
      );
      assertEquals(result.transactionId, context.internalPaymentId);
      assertSpyCalls(mockStripe.stubs.checkoutSessionsCreate, 1);
      assertSpyCalls(mockStripe.stubs.paymentIntentsRetrieve, 0);

      teardownMocks(mockStripe, mockTokenWalletService);
    },
  );

});