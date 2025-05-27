import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockSupabaseClient, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { handleProductUpdated } from './stripe.productUpdated.ts';
import { logger } from '../../../logger.ts';
import { createMockStripe, ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { ParsedProductDescription } from '../../../utils/productDescriptionParser.ts';

// Helper to create a mock Stripe.Product object for updates
const createMockStripeUpdatedProduct = (overrides: Partial<Stripe.Product> = {}): Stripe.Product => {
  return {
    id: overrides.id || 'prod_defaultUpdatedProd123',
    object: 'product',
    active: overrides.active !== undefined ? overrides.active : true,
    name: overrides.name || 'Updated Test Product',
    description: overrides.description !== undefined ? overrides.description : 'Updated product description.',
    metadata: overrides.metadata || { updated_key: 'updated_value' },
    created: Math.floor(Date.now() / 1000) - 20000,
    default_price: null,
    images: [],
    livemode: false,
    package_dimensions: null,
    shippable: null,
    statement_descriptor: null,
    tax_code: null,
    type: 'service',
    unit_label: null,
    updated: Math.floor(Date.now() / 1000),
    url: null,
    ...overrides,
  } as Stripe.Product;
};

// Helper to create a mock Stripe.Event for product.updated
const createMockProductUpdatedEvent = (productOverrides: Partial<Stripe.Product> = {}): Stripe.Event => {
  const mockProduct = createMockStripeUpdatedProduct(productOverrides);
  return {
    id: `evt_prod_updated_${mockProduct.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: mockProduct as any, 
    },
    livemode: mockProduct.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'product.updated',
  } as Stripe.Event;
};

Deno.test('handleProductUpdated specific tests', async (t) => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;
  
  const initializeTestContext = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    mockSupabase = createMockSupabaseClient(undefined, supabaseConfig);
    const mockStripeInternal = createMockStripe(); 
    
    const stepInfoSpy = spy(logger, 'info');
    const stepWarnSpy = spy(logger, 'warn');
    const stepErrorSpy = spy(logger, 'error');

    handlerContext = {
      stripe: mockStripeInternal.instance, 
      supabaseClient: mockSupabase.client as any,
      logger: logger, 
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_dummy_secret_for_type', 
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
  await t.step('Successfully updates product details for associated plans', async () => {
    let stepSpies = null;
    const PRODUCT_ID_TO_UPDATE = 'prod_test_update_123';
    const initialProductName = 'Old Product Name';
    const updatedProductName = 'New Shiny Product Name';
    const updatedProductDescription = 'This is the new and improved description.';
    const updatedMetadata = { version: '2.0', feature_flag: 'on' };

    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ 
              data: null, // Actual data not strictly needed for this assertion, count is key
              error: null,
              count: 2, // Simulate 2 plans were updated
              status: 200, 
              statusText: 'OK' 
            })
          }
        }
      });

      const mockEvent = createMockProductUpdatedEvent({
        id: PRODUCT_ID_TO_UPDATE,
        name: updatedProductName,
        description: updatedProductDescription,
        active: true,
        metadata: updatedMetadata,
        // Ensure some old values are different to confirm update happens
        // (though the mock product helper already sets distinct defaults)
      });

      mockSupabase.client.from('subscription_plans'); // Prime builder access

      const result = await handleProductUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined, "Error should be undefined on success");
      assertEquals(result.transactionId, mockEvent.id);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder, "subscription_plans builder should exist");
      
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy, "update spy should exist");
      assertSpyCalls(updateSpy, 1);
      
      const updatedFields = updateSpy.calls[0].args[0] as any;
      assertEquals(updatedFields.name, updatedProductName);
      assertEquals((updatedFields.description as ParsedProductDescription).subtitle, updatedProductDescription);
      assertEquals((updatedFields.description as ParsedProductDescription).features, []);
      assertEquals(updatedFields.active, true);
      assertEquals(updatedFields.metadata, updatedMetadata);
      assertExists(updatedFields.updated_at, "updated_at should be set");

      const eqSpy = plansBuilder.methodSpies['eq'];
      assertExists(eqSpy, "eq spy should exist");
      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'stripe_product_id');
      assertEquals(eqSpy.calls[0].args[1], PRODUCT_ID_TO_UPDATE);

      const neqSpy = plansBuilder.methodSpies['neq'];
      assertExists(neqSpy, "neq spy should exist");
      assertSpyCalls(neqSpy, 1);
      assertEquals(neqSpy.calls[0].args[0], 'stripe_price_id');
      assertEquals(neqSpy.calls[0].args[1], 'price_FREE');
      
      assertSpyCalls(stepSpies.stepInfoSpy, 3); // Initial log, prepared data log, success log
      const successLogCall = stepSpies.stepInfoSpy.calls.find(call => (call.args[0] as string).includes('Successfully updated plans'));
      assertExists(successLogCall, "Success log message not found");
      assert((successLogCall.args[0] as string).includes('Records affected: 2'), 'Success log should mention 2 records affected');

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Correctly deactivates plans when product becomes inactive', async () => {
    let stepSpies = null;
    const PRODUCT_ID_TO_DEACTIVATE = 'prod_test_deactivate_456';
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ count: 1, error: null, data: null, status: 200, statusText: 'OK' })
          }
        }
      });
      const mockEvent = createMockProductUpdatedEvent({ id: PRODUCT_ID_TO_DEACTIVATE, active: false });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals((updateSpy.calls[0].args[0] as any).active, false);
      assertSpyCalls(stepSpies.stepInfoSpy, 3);
      const successLog = stepSpies.stepInfoSpy.calls.find(call => call.args[0].includes('Successfully updated plans'));
      assertExists(successLog);
      assert(successLog.args[0].includes('Active: false'));
      assert(successLog.args[0].includes('Records affected: 1'));
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Correctly reactivates plans when product becomes active', async () => {
    let stepSpies = null;
    const PRODUCT_ID_TO_REACTIVATE = 'prod_test_reactivate_789';
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ count: 1, error: null, data: null, status: 200, statusText: 'OK' })
          }
        }
      });
      const mockEvent = createMockProductUpdatedEvent({ id: PRODUCT_ID_TO_REACTIVATE, active: true });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals((updateSpy.calls[0].args[0] as any).active, true);
      assertSpyCalls(stepSpies.stepInfoSpy, 3);
      const successLog = stepSpies.stepInfoSpy.calls.find(call => call.args[0].includes('Successfully updated plans'));
      assertExists(successLog);
      assert(successLog.args[0].includes('Active: true'));
      assert(successLog.args[0].includes('Records affected: 1'));
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles scenario where no plans are found for the product ID', async () => {
    let stepSpies = null;
    const UNKNOWN_PRODUCT_ID = 'prod_unknown_no_plans_xyz';
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            // Simulate update affecting 0 rows
            update: () => Promise.resolve({ count: 0, error: null, data: null, status: 200, statusText: 'OK' })
          }
        }
      });
      const mockEvent = createMockProductUpdatedEvent({ id: UNKNOWN_PRODUCT_ID });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      
      assertSpyCalls(stepSpies.stepInfoSpy, 3);
      const successLogCall = stepSpies.stepInfoSpy.calls.find(call => (call.args[0] as string).includes('Successfully updated plans'));
      assertExists(successLogCall);
      assert((successLogCall.args[0] as string).includes('Records affected: 0'));
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles Supabase error during plan update', async () => {
    let stepSpies = null;
    const PRODUCT_ID_DB_ERROR_UPDATE = 'prod_db_error_update_abc';
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ 
              data: null, 
              error: new Error('Supabase DB update failed miserably'),
              count: 0, 
              status: 500, 
              statusText: 'Internal Server Error' 
            })
          }
        }
      });
      const mockEvent = createMockProductUpdatedEvent({ id: PRODUCT_ID_DB_ERROR_UPDATE });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductUpdated(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error!.includes(`Failed to update plans for product ${PRODUCT_ID_DB_ERROR_UPDATE}: Supabase DB update failed miserably`));
      assertEquals(result.transactionId, mockEvent.id);
      
      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial log, prepared data log
      assertSpyCalls(stepSpies.stepErrorSpy, 1); // Error log
      const errorLogCall = stepSpies.stepErrorSpy.calls[0];
      assert((errorLogCall.args[0] as string).includes(`Error updating subscription_plans for product ${PRODUCT_ID_DB_ERROR_UPDATE}`));
      assertEquals((errorLogCall.args[1] as any).error.message, 'Supabase DB update failed miserably');
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles unexpected errors gracefully during product update', async () => {
    let stepSpies: { stepInfoSpy: any, stepWarnSpy: any, stepErrorSpy: any } | null = null;
    const PRODUCT_ID_UNEXPECTED_ERROR_UPDATE = 'prod_unexpected_update_err_777';
    const originalLoggerInfo = logger.info;
    try {
      let callCount = 0;
      const throwingInfoStub = (message: string, metadata?: any) => {
        callCount++;
        // Let the first log (handling event) pass, throw on the second (prepared data)
        if (callCount > 1) { 
          throw new Error('Unexpected logger malfunction during product update');
        }
        if (metadata) { originalLoggerInfo.apply(logger, [message, metadata]); }
        else { originalLoggerInfo.apply(logger, [message]); }
      };
      (logger as any).info = throwingInfoStub;

      stepSpies = initializeTestContext({}); 

      const mockEvent = createMockProductUpdatedEvent({ id: PRODUCT_ID_UNEXPECTED_ERROR_UPDATE });
      const result = await handleProductUpdated(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error!.includes(`Unexpected error processing product.updated for product ${PRODUCT_ID_UNEXPECTED_ERROR_UPDATE}: Unexpected logger malfunction during product update`));
      assertEquals(result.transactionId, mockEvent.id);
      
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogCall = stepSpies.stepErrorSpy.calls[0];
      assert((errorLogCall.args[0] as string).includes(`Unexpected error processing product.updated for product ${PRODUCT_ID_UNEXPECTED_ERROR_UPDATE}`));
      assertEquals((errorLogCall.args[1] as any).error.message, 'Unexpected logger malfunction during product update');
      
      // logger.info (via throwingInfoStub) should be called once successfully before throwing
      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Call 1 (OK), Call 2 (throws but still spied)

    } finally {
      (logger as any).info = originalLoggerInfo;
      if (stepSpies) {
        teardownTestContext(stepSpies);
      }
    }
  });

});