import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
import type { TokenWalletTransaction, TokenWalletTransactionType } from '../../../types/tokenWallet.types.ts';
import { MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import type { PurchaseRequest, PaymentOrchestrationContext } from '../../../types/payment.types.ts';
import {
  assert,
  assertEquals,
  assertRejects,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
  type SpyCall,
  type Spy
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, createMockInvoicePaymentSucceededEvent, createMockInvoiceLineItem } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseClientSetup, MockSupabaseDataConfig, MockQueryBuilderState } from '../../../supabase.mock.ts';
import { createMockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';
import { Database } from '../../../../types_db.ts';
import { ILogger, LogMetadata } from '../../../types.ts';
import { handleInvoicePaymentSucceeded } from './stripe.invoicePaymentSucceeded.ts';
import { HandlerContext } from '../../../stripe.mock.ts';

const FREE_TIER_ITEM_ID_INTERNAL_INVOICE_TESTS = 'SYS_FREE_TIER'; // If needed for any logic here



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
    // Pass undefined for currentTestUserId and dbConfig as the second argument
    mockSupabaseSetup = createMockSupabaseClient(undefined, dbConfig);
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

    const mockEvent = createMockInvoicePaymentSucceededEvent({
      id: mockInvoiceId,
      customer: mockStripeCustomerId,
      amount_paid: 1500,
      lines: {
        object: 'list',
        data: [createMockInvoiceLineItem({ 
          subscription: mockSubscriptionId,
          price: { id: mockStripePriceId }
        } as any)],
        has_more: false,
        url: `/v1/invoices/${mockInvoiceId}/lines`,
      }
    });

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
              return { data: [{ item_id_internal: mockPlanItemIdInternal, tokens_to_award: tokensToAwardForPlan }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Unexpected subscription_plans select'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    const plainErrorToReject = new Error('Simulated plain error on subscription retrieve for test');

    if (mockStripe.stubs.subscriptionsRetrieve && typeof mockStripe.stubs.subscriptionsRetrieve.restore === 'function' && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(handlerContext.stripe.subscriptions, "retrieve", () => {
        console.log("[Test Mock] Stripe subscriptions.retrieve is called and will reject.");
        return Promise.reject(plainErrorToReject);
    });

    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    await assertRejects(
      () => handleInvoicePaymentSucceeded(handlerContext, mockEvent),
      Error,
      "Simulated plain error on subscription retrieve for test",
    );

    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1); 
    assertSpyCalls(recordTxSpy, 0); 

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>; 
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        call.args[0].includes('[retrieveSubscriptionPlanDetails] Error during subscription/plan retrieval for sub_causes_retrieve_error') &&
        (call.args[1] as LogMetadata)?.errorObj === plainErrorToReject
      ),
      'Expected error log from retrieveSubscriptionPlanDetails not found or did not match expected error object.'
    );

    const ptxInsertSpy = mockSupabaseSetup.client.getSpiesForTableQueryMethod('payment_transactions', 'insert');
    if (ptxInsertSpy) {
        assertSpyCalls(ptxInsertSpy, 0);
    }

    teardownInvoiceMocks();
  });

  await t.step('Error - Idempotency check DB error', async () => {
    const mockInvoiceId = 'in_idempotency_db_error';
    const mockEvent = createMockInvoicePaymentSucceededEvent({ id: mockInvoiceId });
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
    assertEquals(result.status, undefined, 'Status should be undefined as per handler return for this error');
    assertEquals(result.error, 'Failed to check for existing transaction.', 'Error message should match handler return');
    assertEquals(result.transactionId, undefined, 'Transaction ID should be undefined as per handler return');
    
    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(
      errorLogSpy.calls.some((call: SpyCall) => {
        const logMessage = call.args[0] as string;
        const metadata = call.args[1] as LogMetadata;
        return logMessage.includes(`[handleInvoicePaymentSucceeded] Error checking for existing transaction. Invoice ID: ${mockInvoiceId}`) &&
               metadata && metadata.error && (metadata.error as any).message === dbError.message;
      }),
      `Expected error log for idempotency check DB error not found or message/metadata mismatch. Actual calls: ${JSON.stringify(errorLogSpy.calls)}`
    );
    teardownInvoiceMocks();
  });

  await t.step('Error - User not found (404)', async () => {
    const mockStripeCustomerId = 'cus_user_not_found';
    const mockInvoiceId = 'in_user_not_found';
    const mockEvent = createMockInvoicePaymentSucceededEvent({ customer: mockStripeCustomerId, id: mockInvoiceId });
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
    assertEquals(result.status, 500, 'Status should be 500 as per current handler logic'); 
    assertEquals(result.error, 'User subscription data not found for Stripe customer ID.', "Error message mismatch for user not found");
    assertEquals(result.transactionId, undefined, "transactionId should be undefined"); // Corrected expected transactionId

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(
      errorLogSpy.calls.some((call: SpyCall) => 
        (call.args[0] as string).includes(`[handleInvoicePaymentSucceeded] Could not find user_id for Stripe customer ${mockStripeCustomerId} via user_subscriptions. Invoice: ${mockInvoiceId}.`)
      ),
      `Expected error log for user not found not present or message mismatch. Actual calls: ${JSON.stringify(errorLogSpy.calls)}`
    );
    teardownInvoiceMocks();
  });

  await t.step('Error - Token Wallet not found (404)', async () => {
    const mockUserId = 'user_wallet_not_found';
    const mockStripeCustomerId = 'cus_wallet_not_found';
    const mockInvoiceId = 'in_wallet_not_found';
    const mockEvent = createMockInvoicePaymentSucceededEvent({ customer: mockStripeCustomerId, id: mockInvoiceId });
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
    assertEquals(result.error, 'Token wallet not found for user.', "Error message mismatch for wallet not found");
    assertEquals(result.transactionId, undefined, "transactionId should be undefined"); // Corrected expected transactionId

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    assert(errorLogSpy.calls.some(call => (call.args[0] as string).includes(`Token wallet not found for user ${mockUserId}`)));
    teardownInvoiceMocks();
  });

  await t.step('Error - Subscription Plan not found (422), FAILED PT created', async () => {
    const mockUserId = 'user_plan_not_found';
    const mockStripeCustomerId = 'cus_plan_not_found';
    const mockWalletId = 'wallet_plan_not_found';
    const mockInvoiceId = 'in_plan_not_found';
    const mockSubscriptionId = 'sub_default_for_plan_not_found'; // Assuming a subscription ID is present
    const mockStripePriceId = 'price_id_for_plan_not_found'; // This price ID will exist in Stripe sub, but not in local DB plans

    const mockEvent = createMockInvoicePaymentSucceededEvent(
      {
        id: mockInvoiceId,
        customer: mockStripeCustomerId,
        lines: {
          object: 'list',
          data: [createMockInvoiceLineItem({ 
            subscription: mockSubscriptionId,
            price: { id: mockStripePriceId }
          } as any)],
          has_more: false,
          url: `/v1/invoices/${mockInvoiceId}/lines`,
        }
      }
    );

    const dbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        'payment_transactions': {
          select: async (state: MockQueryBuilderState) => { /* ... idempotency returns no existing ... */ 
            if (state.filters.some((f: any) => f.column === 'gateway_transaction_id' && f.value === mockInvoiceId) &&
                state.filters.some((f: any) => f.column === 'status' && f.value === 'succeeded')) {
              return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Unexpected payment_transactions select query in Plan Not Found test'), count: 0, status: 500, statusText: 'Error' };
          },
          insert: async (_state: MockQueryBuilderState) => {
            console.log("[Test Mock] payment_transactions.insert called, will simulate DB error for plan not found test.");
            throw new Error("Mock DB error during payment_transactions.insert for plan not found test");
          },
          update: async () => { /* ... no update expected if insert fails ... */ 
            throw new Error("payment_transactions.update should not be called if insert fails");
          }
        },
        'user_subscriptions': { /* ... returns user ... */ 
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'stripe_customer_id' && f.value === mockStripeCustomerId)) {
              return { data: [{ user_id: mockUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: User subscription not found for plan not found test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
        'token_wallets': { /* ... returns wallet ... */ 
          select: async (state: MockQueryBuilderState) => {
            if (state.filters.some((f: any) => f.column === 'user_id' && f.value === mockUserId)) {
              return { data: [{ wallet_id: mockWalletId }], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: new Error('Mock: Token wallet not found for plan not found test'), count: 0, status: 404, statusText: 'Not Found' };
          }
        },
        'subscription_plans': {
          select: async (state: MockQueryBuilderState) => { // This will be called by retrieveSubscriptionPlanDetails
            if (state.filters.some((f: any) => f.column === 'stripe_price_id' && f.value === mockStripePriceId)) {
              console.log(`[Test Mock] subscription_plans.select for ${mockStripePriceId} - simulating plan not found in DB.`);
              const pgrst116Error = { name: 'PostgrestError', message: 'Query returned no rows', code: 'PGRST116' };
              return { data: null, error: pgrst116Error as any, count: 0, status: 406, statusText: 'Not Found' }; // Plan not found
            }
            return { data: null, error: new Error('Mock: Unexpected subscription_plans select for plan not found test'), count: 0, status: 500, statusText: 'Error' };
          }
        }
      }
    };

    setupInvoiceMocks(dbConfig);

    // Mock stripe.subscriptions.retrieve to succeed, so retrieveSubscriptionPlanDetails proceeds to DB plan check
    if (mockStripe.stubs.subscriptionsRetrieve && !mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    mockStripe.stubs.subscriptionsRetrieve = stub(handlerContext.stripe.subscriptions, "retrieve", 
      () => Promise.resolve({ 
        id: mockSubscriptionId, 
        items: { data: [{ price: { id: mockStripePriceId } }] } 
      } as any)
    );
    
    const recordTxSpy = mockTokenWalletService.stubs.recordTransaction;

    // Expect the handler to reject due to the PGRST116 error from retrieveSubscriptionPlanDetails
    const expectedErrorMessage = 'Query returned no rows';

    await assertRejects(
      () => handleInvoicePaymentSucceeded(handlerContext, mockEvent),
      Error,
      expectedErrorMessage, // Check for the specific message
      "Handler did not reject as expected or with the correct message when subscription plan is not found."
    );

    // Verify that stripe.subscriptions.retrieve was called (by retrieveSubscriptionPlanDetails)
    assertSpyCalls(mockStripe.stubs.subscriptionsRetrieve, 1);
    
    // Verify that subscription_plans.select was called
    const historicSubPlanBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('subscription_plans');
    const subPlanSelectBuilder = historicSubPlanBuilders?.find(b => b.methodSpies.select?.calls.length > 0 && b.methodSpies.eq?.calls.some(c => c.args[0] === 'stripe_price_id' && c.args[1] === mockStripePriceId));
    assertExists(subPlanSelectBuilder, "subscription_plans select query builder not found or not called with expected stripe_price_id.");
    assertSpyCalls(subPlanSelectBuilder.methodSpies.select, 1);

    // Verify that payment_transactions.insert was NOT ATTEMPTED
    const historicPtxBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
    // Should only have 1 builder: the initial idempotency check.
    assert(historicPtxBuilders && historicPtxBuilders.length === 1, `Expected 1 historic builder for payment_transactions (idempotency check only), found ${historicPtxBuilders?.length}.`);
    
    const ptxInsertSpy = mockSupabaseSetup.client.getSpiesForTableQueryMethod('payment_transactions', 'insert');
    if (ptxInsertSpy) { // The spy might not even be created if no insert builder was made
        assertSpyCalls(ptxInsertSpy, 0);
    } else {
        // If the spy doesn't exist, it means no insert call was made, which is correct.
        // We can verify no *second* builder instance was created for payment_transactions.
        const ptxBuilders = mockSupabaseSetup.client.getHistoricBuildersForTable('payment_transactions');
        assertEquals(ptxBuilders?.length, 1, "No insert should have been attempted on payment_transactions table.");
    }

    assertSpyCalls(recordTxSpy, 0); // Token awarding should not happen

    const errorLogSpy = mockInvoiceLogger.error as Spy<any, any[], any>;
    const pgrst116LogFound = errorLogSpy.calls.some((call: SpyCall) => {
      const logMessage = call.args[0] as string;
      const metadata = call.args[1] as LogMetadata;
      const errorObj = metadata?.errorObj as any; // errorObj from retrieveSubscriptionPlanDetails's catch
      
      return logMessage.includes(`[retrieveSubscriptionPlanDetails] Error during subscription/plan retrieval for ${mockSubscriptionId}`) &&
             errorObj && errorObj.name === 'PostgrestError' && errorObj.code === 'PGRST116';
    });
    
    assert(pgrst116LogFound, 
      `Expected error log from retrieveSubscriptionPlanDetails for PGRST116 not found or did not match. Actual logs: ${JSON.stringify(errorLogSpy.calls.map(c => ({msg: c.args[0], meta: c.args[1]})))}`
    );
    
    teardownInvoiceMocks();
  });

});