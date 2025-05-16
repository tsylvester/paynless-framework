import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  // stub, // Keep for potential future use if direct Stripe SDK calls were made
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockSupabaseClient, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { handleProductDeleted } from './stripe.productDeleted.ts';
import { logger } from '../../../logger.ts';
import { createMockStripe, ProductPriceHandlerContext } from '../../../stripe.mock.ts'; // Added for dummy stripe instance

// Helper to create a mock Stripe.Product object (focused on what product.deleted provides)
const createMockStripeDeletedProduct = (overrides: Partial<Stripe.Product> = {}): Stripe.Product => {
  return {
    id: overrides.id || 'prod_defaultDeletedProd123',
    object: 'product',
    // For a deleted event, many fields might be irrelevant or just the ID and object type might be present
    // However, the handler currently casts event.data.object as Stripe.Product, so we provide a somewhat full one.
    active: false, // A deleted product is implicitly inactive
    created: Math.floor(Date.now() / 1000) - 10000, // Some time ago
    default_price: null,
    description: 'This product has been deleted.',
    images: [],
    livemode: false,
    metadata: overrides.metadata || {},
    name: overrides.name || 'Deleted Test Product',
    package_dimensions: null,
    shippable: null,
    statement_descriptor: null,
    tax_code: null,
    type: 'service',
    unit_label: null,
    updated: Math.floor(Date.now() / 1000),
    url: null,
    ...overrides, // Ensure overrides can set things like id specifically
  } as Stripe.Product;
};

// Helper to create a mock Stripe.Event for product.deleted
const createMockProductDeletedEvent = (productOverrides: Partial<Stripe.Product> = {}): Stripe.Event => {
  const mockProduct = createMockStripeDeletedProduct(productOverrides);
  return {
    id: `evt_prod_deleted_${mockProduct.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: mockProduct as any, 
    },
    livemode: mockProduct.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'product.deleted',
  } as Stripe.Event;
};

Deno.test('handleProductDeleted specific tests', async (t) => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;
  
  const initializeTestContext = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    mockSupabase = createMockSupabaseClient(supabaseConfig);
    const mockStripeInternal = createMockStripe(); // For dummy instance
    
    const stepInfoSpy = spy(logger, 'info');
    const stepWarnSpy = spy(logger, 'warn');
    const stepErrorSpy = spy(logger, 'error');

    handlerContext = {
      stripe: mockStripeInternal.instance, // Provide dummy instance
      supabaseClient: mockSupabase.client as any,
      logger: logger, 
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_dummy_secret_for_type', // Provide dummy secret
    } as ProductPriceHandlerContext;
    return { stepInfoSpy, stepWarnSpy, stepErrorSpy };
  };

  const teardownTestContext = (
    stepSpies: { stepInfoSpy?: any, stepWarnSpy?: any, stepErrorSpy?: any } | null
  ) => {
    stepSpies?.stepInfoSpy?.restore();
    stepSpies?.stepWarnSpy?.restore();
    stepSpies?.stepErrorSpy?.restore();
  };

  // Test cases will be added here
  await t.step('Successfully deactivates subscription plans associated with the deleted product', async () => {
    let stepSpies = null;
    const DELETED_PRODUCT_ID = 'prod_to_be_deleted_abc123';
    try {
      // Simulate that the update operation finds and "updates" two plans
      const mockUpdatedPlans = [
        { stripe_product_id: DELETED_PRODUCT_ID, name: 'Plan A', active: false },
        { stripe_product_id: DELETED_PRODUCT_ID, name: 'Plan B', active: false },
      ];
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ 
              data: mockUpdatedPlans, // Simulate two plans were returned by .select() after update
              error: null,
              count: mockUpdatedPlans.length, 
              status: 200, 
              statusText: 'OK' 
            })
          }
        }
      });
      const mockEvent = createMockProductDeletedEvent({ id: DELETED_PRODUCT_ID });

      mockSupabase.client.from('subscription_plans'); // Prime builder access

      const result = await handleProductDeleted(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined, "Error should be undefined on success");
      assertEquals(result.transactionId, mockEvent.id);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder, "subscription_plans builder should exist");
      
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy, "update spy should exist");
      assertSpyCalls(updateSpy, 1);
      assertEquals(updateSpy.calls[0].args[0].active, false);
      assertExists(updateSpy.calls[0].args[0].updated_at, "updated_at should be set");

      const eqSpy = plansBuilder.methodSpies['eq'];
      assertExists(eqSpy, "eq spy should exist");
      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'stripe_product_id');
      assertEquals(eqSpy.calls[0].args[1], DELETED_PRODUCT_ID);

      const neqSpy = plansBuilder.methodSpies['neq'];
      assertExists(neqSpy, "neq spy should exist");
      assertSpyCalls(neqSpy, 1);
      assertEquals(neqSpy.calls[0].args[0], 'stripe_price_id');
      assertEquals(neqSpy.calls[0].args[1], 'price_FREE');
      
      const selectSpy = plansBuilder.methodSpies['select'];
      assertExists(selectSpy, "select spy should exist");
      assertSpyCalls(selectSpy, 1);
      
      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial log + success log
      const successLogCall = stepSpies.stepInfoSpy.calls.find(call => (call.args[0] as string).includes('Successfully deactivated'));
      assertExists(successLogCall, "Success log message not found");
      assert((successLogCall.args[0] as string).includes('2 subscription plan(s)'), 'Success log should mention 2 plans');
      assertEquals(successLogCall.args[1]?.deactivatedCount, 2);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Ensures price_FREE plan is not affected by product deletion', async () => {
    let stepSpies = null;
    const DELETED_PRODUCT_ID_WITH_FREE = 'prod_del_with_free_456';
    try {
      const mockPotentiallyAffectedPlans = [
        { stripe_product_id: DELETED_PRODUCT_ID_WITH_FREE, name: 'Paid Plan on Deleted Product', active: false },
      ];
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ 
              data: mockPotentiallyAffectedPlans, 
              error: null,
              count: mockPotentiallyAffectedPlans.length, 
              status: 200, 
              statusText: 'OK' 
            })
          }
        }
      });
      const mockEvent = createMockProductDeletedEvent({ id: DELETED_PRODUCT_ID_WITH_FREE });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductDeleted(handlerContext, mockEvent);

      assertEquals(result.success, true);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const neqSpy = plansBuilder.methodSpies['neq'];
      assertExists(neqSpy, "neq spy should exist to exclude price_FREE");
      assertSpyCalls(neqSpy, 1);
      assertEquals(neqSpy.calls[0].args[0], 'stripe_price_id');
      assertEquals(neqSpy.calls[0].args[1], 'price_FREE');

      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial + success
      const successLogCall = stepSpies.stepInfoSpy.calls.find(call => (call.args[0] as string).includes('Successfully deactivated'));
      assertExists(successLogCall);
      assert((successLogCall.args[0] as string).includes('1 subscription plan(s)'));
      assertEquals(successLogCall.args[1]?.deactivatedCount, 1);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles scenario where no plans are found for the product ID', async () => {
    let stepSpies = null;
    const UNKNOWN_PRODUCT_ID = 'prod_unknown_no_plans_789';
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ 
              data: [], // Simulate no plans were found/updated
              error: null,
              count: 0, 
              status: 200, 
              statusText: 'OK' 
            })
          }
        }
      });
      const mockEvent = createMockProductDeletedEvent({ id: UNKNOWN_PRODUCT_ID });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductDeleted(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      
      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial + success
      const successLogCall = stepSpies.stepInfoSpy.calls.find(call => (call.args[0]as string).includes('Successfully deactivated'));
      assertExists(successLogCall);
      assert((successLogCall.args[0] as string).includes('0 subscription plan(s)'));
      assertEquals(successLogCall.args[1]?.deactivatedCount, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles Supabase error during plan deactivation', async () => {
    let stepSpies = null;
    const PRODUCT_ID_DB_ERROR = 'prod_db_error_xyz789';
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ 
              data: null, 
              error: new Error('Supabase DB update error'), // Simulate DB error
              count: 0, 
              status: 500, 
              statusText: 'Internal Server Error' 
            })
          }
        }
      });
      const mockEvent = createMockProductDeletedEvent({ id: PRODUCT_ID_DB_ERROR });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductDeleted(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error, "Error message should exist");
      assert(result.error!.includes(`Failed to deactivate plans for product ${PRODUCT_ID_DB_ERROR}: Supabase DB update error`));
      assertEquals(result.transactionId, mockEvent.id);
      
      assertSpyCalls(stepSpies.stepInfoSpy, 1); // Only initial log
      assertSpyCalls(stepSpies.stepErrorSpy, 1); // Error log
      const errorLogCall = stepSpies.stepErrorSpy.calls[0];
      assert((errorLogCall.args[0] as string).includes(`Error deactivating subscription plans for product ID: ${PRODUCT_ID_DB_ERROR}`));
      assertEquals((errorLogCall.args[1] as any).error.message, 'Supabase DB update error');

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles unexpected errors gracefully', async () => {
    let stepSpies: { stepInfoSpy: any, stepWarnSpy: any, stepErrorSpy: any } | null = null;
    const PRODUCT_ID_UNEXPECTED_ERROR = 'prod_unexpected_err_111';
    const originalLoggerInfo = logger.info; // 1. Store original logger.info
    
    try {
      // 2. Temporarily replace logger.info with our throwing stub BEFORE initializing spies
      let callCount = 0;
      const throwingInfoStub = (message: string, metadata?: any) => {
        callCount++;
        if (callCount > 1) { // Error on second call to info, which is after the initial handler log
          throw new Error('Unexpected logger malfunction');
        }
        // Call original with proper arguments for the first call
        if (metadata) {
          originalLoggerInfo.apply(logger, [message, metadata]); 
        } else {
          originalLoggerInfo.apply(logger, [message]);
        }
      };
      (logger as any).info = throwingInfoStub;

      // 3. Initialize spies (this will spy on our throwingInfoStub for logger.info)
      stepSpies = initializeTestContext({}); 

      const mockEvent = createMockProductDeletedEvent({ id: PRODUCT_ID_UNEXPECTED_ERROR });
      
      const result = await handleProductDeleted(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error, "Error message should exist");
      assert(result.error!.includes(`Unexpected error handling product.deleted for ${PRODUCT_ID_UNEXPECTED_ERROR}: Unexpected logger malfunction`));
      assertEquals(result.transactionId, mockEvent.id);
      
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogCall = stepSpies.stepErrorSpy.calls[0];
      assert((errorLogCall.args[0] as string).includes(`Unexpected error handling product.deleted for product ID: ${PRODUCT_ID_UNEXPECTED_ERROR}`));
      assertEquals((errorLogCall.args[1] as any).error.message, 'Unexpected logger malfunction');

      // The stepInfoSpy (which spied on throwingInfoStub) should have been called for the initial log,
      // and then for the attempted second log which causes the throw.
      assertSpyCalls(stepSpies.stepInfoSpy, 2);

    } finally {
      // 4. First, restore the original logger.info that we manually overwrote
      (logger as any).info = originalLoggerInfo;
      // Then, teardownTestContext will restore the spies it set up (including the one on throwingInfoStub)
      if (stepSpies) {
        teardownTestContext(stepSpies);
      }
    }
  });

});