import { StripePaymentAdapter } from './stripePaymentAdapter.ts';
import type { ITokenWalletService, TokenWallet, TokenWalletTransaction } from '../../_shared/types/tokenWallet.types.ts';
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
          select: async (state) => {
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

    // mockTokenWalletService.getWalletForContext is not called by adapter.initiatePayment anymore
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
    assert(mockSupabaseSetup.spies.fromSpy.calls.some(call => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called.");
    
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
          select: async (state) => {
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
          select: async (state) => {
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
          select: async (state) => { 
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
          select: async (state) => {
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
    assert(mockSupabaseSetup.spies.fromSpy.calls.some(call => call.args[0] === 'subscription_plans'), "from('subscription_plans') should have been called (Sub).");

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
            select: async (state) => {
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
    const internalPaymentId = 'ptxn_webhook_sub_completed_123';
    const stripeSessionId = 'cs_webhook_sub_completed_456';
    const userId = 'user-webhook-sub';
    const walletId = 'wallet-for-user-webhook-sub';
    const tokensToAward = 1000;

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
        // item_id: 'item-sub-webhook' // Optional, if needed by token service notes
      },
      // other fields as necessary for your logic, e.g., amount_total, currency
    };

    const mockStripeEvent: Stripe.Event = {
      id: 'evt_webhook_sub_completed_789',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2020-08-27', // Example API version
      created: Math.floor(Date.now() / 1000),
      data: {
        object: mockStripeSession as Stripe.Checkout.Session, // Cast here
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: 'req_webhook_sub', idempotency_key: null },
    };

    // 2. Mock payment_transactions table data (initial state)
    const initialPaymentTxnData = {
      id: internalPaymentId,
      user_id: userId,
      target_wallet_id: walletId,
      tokens_to_award: tokensToAward,
      status: 'PENDING', // Initial status
      gateway_transaction_id: null, // Not yet set
      item_id: 'item-sub-webhook',
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
            const updateData = state.updateData as { status?: string, gateway_transaction_id?: string }; // Type assertion
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
    const mockTokenTxResultSub: TokenWalletTransaction = { // Ensure full type
        transactionId: 'tokentx_webhook_sub_123',
        walletId: walletId,
        type: 'CREDIT_PURCHASE',
        amount: tokensToAward.toString(),
        balanceAfterTxn: (parseInt(initialPaymentTxnData.status === 'PENDING' ? '0' : '0') + tokensToAward).toString(), // Simplified
        recordedByUserId: userId,
        relatedEntityId: internalPaymentId,
        relatedEntityType: 'payment_transaction',
        timestamp: new Date(),
        notes: 'Tokens awarded from Stripe subscription payment'
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
            return Promise.resolve(mockTokenTxResultSub);
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
    
    // Assert that from('payment_transactions') was called (at least for select and update) - Subscription Test
    assert(mockSupabaseSetup.spies.fromSpy.calls.some(call => call.args[0] === 'payment_transactions'), "from('payment_transactions') should have been called at least once (Sub).");
    const paymentTransactionsFromCallsSub = mockSupabaseSetup.spies.fromSpy.calls.filter(call => call.args[0] === 'payment_transactions').length;
    console.log(`DEBUG: from('payment_transactions') called ${paymentTransactionsFromCallsSub} times (Sub).`);

    // Check DB calls using getHistoricQueryBuilderSpies - Subscription Test
    const selectSpiesInfoSub = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'select');
    assert(selectSpiesInfoSub, "Historic select spies info should exist for payment_transactions (Sub)");
    assertEquals(selectSpiesInfoSub.callCount, 1, "select should have been called once on payment_transactions (Sub)");

    const updateSpiesInfoSub = (mockSupabaseSetup.spies as any).getHistoricQueryBuilderSpies('payment_transactions', 'update');
    assert(updateSpiesInfoSub, "Historic update spies info should exist for payment_transactions (Sub)");
    assertEquals(updateSpiesInfoSub.callCount, 1, "update should have been called once on payment_transactions (Sub)");

    // Check token wallet service call
    assertSpyCalls(mockTokenWalletService.stubs.recordTransaction, 1);
    const recordTxArgsSub = mockTokenWalletService.stubs.recordTransaction.calls[0].args[0];
    assertEquals(recordTxArgsSub.walletId, walletId, "recordTransaction called with incorrect walletId for sub");
    assertEquals(recordTxArgsSub.amount, tokensToAward.toString(), "recordTransaction called with incorrect amount for sub");
    assertEquals(recordTxArgsSub.type, 'CREDIT_PURCHASE', "recordTransaction called with incorrect type for sub");

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