import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  // type Spy,
  // stub,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe } from '../../../stripe.mock.ts';
// import { MockStripe } from '../../../types/payment.types.ts'; // Not directly used now
import { createMockSupabaseClient } from '../../../supabase.mock.ts';
import { MockSupabaseDataConfig, ProductPriceHandlerContext } from '../../../types.ts';
import { handleProductCreated } from './stripe.productCreated.ts';
import { logger } from '../../../logger.ts';
import { ParsedProductDescription } from '../../../utils/productDescriptionParser.ts';

// Helper to create a mock Stripe.Product object
const createMockStripeProduct = (overrides: Partial<Stripe.Product> = {}): Stripe.Product => {
  return {
    id: overrides.id || 'prod_defaultProductTest123',
    object: 'product',
    active: overrides.active !== undefined ? overrides.active : true,
    created: Math.floor(Date.now() / 1000),
    default_price: null,
    description: overrides.description !== undefined ? overrides.description : 'Default Product Description',
    images: [],
    livemode: false,
    metadata: overrides.metadata || {},
    name: overrides.name || 'Default Test Product',
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

// Helper to create a mock Stripe.Event for product.created
const createMockProductCreatedEvent = (productOverrides: Partial<Stripe.Product> = {}): Stripe.Event => {
  const mockProduct = createMockStripeProduct(productOverrides);
  return {
    id: `evt_prod_created_${mockProduct.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: mockProduct as any, 
    },
    livemode: mockProduct.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'product.created',
  } as Stripe.Event;
};

Deno.test('handleProductCreated specific tests', async (t) => {
  // let mockStripeSdk: MockStripe; // Not directly manipulating its methods here
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;

  const PRODUCT_ID_DEFAULT = 'prod_testProductDefault';

  const initializeTestContext = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    const mockStripeInternal = createMockStripe(); // Create it but we mainly use its instance type
    mockSupabase = createMockSupabaseClient(supabaseConfig);
    
    const stepInfoSpy = spy(logger, 'info');
    const stepWarnSpy = spy(logger, 'warn');
    const stepErrorSpy = spy(logger, 'error');

    handlerContext = {
      stripe: mockStripeInternal.instance, // Provide the instance
      supabaseClient: mockSupabase.client as any, // Cast as any to satisfy SupabaseClient type
      logger: logger, 
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test_secret_product_created', // Though not used directly by this handler
    };
    return { stepInfoSpy, stepWarnSpy, stepErrorSpy };
  };

  const teardownTestContext = (
    stepSpies: { stepInfoSpy?: any, stepWarnSpy?: any, stepErrorSpy?: any } | null
  ) => {
    stepSpies?.stepInfoSpy?.restore();
    stepSpies?.stepWarnSpy?.restore();
    stepSpies?.stepErrorSpy?.restore();
  };

  await t.step('Successfully creates a new product entry in subscription_plans', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockProductCreatedEvent({
        id: PRODUCT_ID_DEFAULT,
        name: 'Awesome New Product',
        description: 'Its features are amazing!',
        active: true,
        metadata: { 'product_meta_key': 'value123' },
      });

      mockSupabase.client.from('subscription_plans'); // Prime builder access

      const result = await handleProductCreated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assertEquals(result.transactionId, mockEvent.id);
      assert(result.error === undefined, "Error should be undefined on success");

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder, "subscription_plans builder should exist");
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy, "upsert spy should exist on plansBuilder");
      assertSpyCalls(upsertSpy, 1);

      const upsertArg = upsertSpy.calls[0].args[0] as any;
      assertEquals(upsertArg.stripe_product_id, PRODUCT_ID_DEFAULT);
      assertEquals(upsertArg.name, 'Awesome New Product');
      assertEquals(upsertArg.description.subtitle, 'Its features are amazing!');
      assertEquals(upsertArg.description.features, []);
      assertEquals(upsertArg.active, true);
      assertEquals(upsertArg.metadata.product_meta_key, 'value123');

      assertSpyCalls(stepSpies.stepInfoSpy, 3); // Initial handling + prepared data + success
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product is created with active: false', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockProductCreatedEvent({
        id: 'prod_inactive_test',
        name: 'Inactive Product',
        active: false,
      });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductCreated(handlerContext, mockEvent);
      assertEquals(result.success, true);
      const upsertSpy = mockSupabase.client.getLatestBuilder('subscription_plans')?.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      assertEquals((upsertSpy.calls[0].args[0] as any).active, false);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product description is a JSON array for features', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const features = ['Feature X', 'Feature Y'];
      const mockEvent = createMockProductCreatedEvent({
        id: 'prod_json_features',
        name: 'Product With JSON Features',
        description: JSON.stringify(features),
      });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductCreated(handlerContext, mockEvent);
      assertEquals(result.success, true);
      const upsertSpy = mockSupabase.client.getLatestBuilder('subscription_plans')?.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertedDesc = (upsertSpy.calls[0].args[0] as any).description as ParsedProductDescription;
      assertEquals(upsertedDesc.subtitle, 'Product With JSON Features');
      assertEquals(upsertedDesc.features, features);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product description is null', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockProductCreatedEvent({
        id: 'prod_null_desc',
        name: 'Product With Null Description',
        description: null,
      });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductCreated(handlerContext, mockEvent);
      assertEquals(result.success, true);
      const upsertSpy = mockSupabase.client.getLatestBuilder('subscription_plans')?.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertedDesc = (upsertSpy.calls[0].args[0] as any).description as ParsedProductDescription;
      assertEquals(upsertedDesc.subtitle, 'Product With Null Description');
      assertEquals(upsertedDesc.features, []);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Error during Supabase upsert', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            upsert: () => Promise.resolve({ 
              data: null, 
              error: new Error('Supabase DB error'),
              count: 0, 
              status: 500, 
              statusText: 'Internal Server Error' 
            })
          }
        }
      });
      const mockEvent = createMockProductCreatedEvent({ id: 'prod_db_error' });
      mockSupabase.client.from('subscription_plans');
      const result = await handleProductCreated(handlerContext, mockEvent);
      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.includes('Failed to upsert plan for product prod_db_error: Supabase DB error'));
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates an existing product entry if product.created is re-received with changes', async () => {
    let stepSpies = null;
    const PRODUCT_ID_FOR_UPDATE = 'prod_for_update_test_123';
    try {
      stepSpies = initializeTestContext({});

      // First event: Create the product
      const initialEvent = createMockProductCreatedEvent({
        id: PRODUCT_ID_FOR_UPDATE,
        name: 'Product Alpha v1',
        description: 'Original description',
        active: true,
        metadata: { version: '1', author: 'TestUser' },
      });

      mockSupabase.client.from('subscription_plans'); // Prime builder for the first call
      const result1 = await handleProductCreated(handlerContext, initialEvent);

      assertEquals(result1.success, true, 'First upsert should succeed');
      const firstUpsertSpy = mockSupabase.client.getLatestBuilder('subscription_plans')?.methodSpies['upsert'];
      assertExists(firstUpsertSpy, 'Upsert spy for first call should exist');
      assertSpyCalls(firstUpsertSpy, 1);
      const firstUpsertArg = firstUpsertSpy.calls[0].args[0] as any;
      assertEquals(firstUpsertArg.stripe_product_id, PRODUCT_ID_FOR_UPDATE);
      assertEquals(firstUpsertArg.name, 'Product Alpha v1');
      assertEquals(firstUpsertArg.description.subtitle, 'Original description');
      assertEquals(firstUpsertArg.active, true);
      assertEquals(firstUpsertArg.metadata.version, '1');

      // Second event: Update the product
      const updatedEvent = createMockProductCreatedEvent({
        id: PRODUCT_ID_FOR_UPDATE, // Same product ID
        name: 'Product Alpha v2 Updated',
        description: 'This is the updated description.',
        active: false,
        metadata: { version: '2', status: 'deprecated' },
      });

      mockSupabase.client.from('subscription_plans'); // Prime builder for the second call
      const result2 = await handleProductCreated(handlerContext, updatedEvent);
      
      assertEquals(result2.success, true, 'Second upsert (update) should succeed');
      const secondUpsertSpy = mockSupabase.client.getLatestBuilder('subscription_plans')?.methodSpies['upsert'];
      assertExists(secondUpsertSpy, 'Upsert spy for second call should exist');
      assertSpyCalls(secondUpsertSpy, 1); // Called once on this new builder instance
      
      const secondUpsertArg = secondUpsertSpy.calls[0].args[0] as any;
      assertEquals(secondUpsertArg.stripe_product_id, PRODUCT_ID_FOR_UPDATE);
      assertEquals(secondUpsertArg.name, 'Product Alpha v2 Updated');
      assertEquals(secondUpsertArg.description.subtitle, 'This is the updated description.');
      assertEquals(secondUpsertArg.active, false);
      assertEquals(secondUpsertArg.metadata.version, '2');
      assertEquals(secondUpsertArg.metadata.status, 'deprecated');
      assert(secondUpsertArg.metadata.author === undefined, "Original metadata 'author' should be overwritten/not present if not in update");

    } finally {
      teardownTestContext(stepSpies);
    }
  });
});