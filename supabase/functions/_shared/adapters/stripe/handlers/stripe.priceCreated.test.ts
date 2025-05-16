import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  type Spy,
  stub,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { handlePriceCreated } from './stripe.priceCreated.ts';
import { logger } from '../../../logger.ts';

// Helper to create a mock Stripe.Price object
const createMockStripePrice = (overrides: Partial<Stripe.Price> = {}): Stripe.Price => {
  return {
    id: overrides.id || 'price_test123',
    object: 'price',
    active: overrides.active !== undefined ? overrides.active : true,
    billing_scheme: 'per_unit',
    created: Math.floor(Date.now() / 1000),
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: overrides.metadata || {},
    nickname: null,
    product: overrides.product || 'prod_testProduct123', // Product ID string
    recurring: overrides.recurring === undefined ? null : overrides.recurring, // Allow full override or default to null (one-time)
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: overrides.type || (overrides.recurring ? 'recurring' : 'one_time'),
    unit_amount: typeof overrides.unit_amount === 'number' ? overrides.unit_amount : 1000, // Default to 1000 ($10.00)
    unit_amount_decimal: typeof overrides.unit_amount === 'number' ? String(overrides.unit_amount) : '1000',
    ...overrides, // Apply all overrides, ensures nested like recurring are fully taken if provided
  } as Stripe.Price;
};

// Helper to create a mock Stripe.Product object
const createMockStripeProduct = (overrides: Partial<Stripe.Product> = {}): Stripe.Product => {
  return {
    id: overrides.id || 'prod_testProduct123',
    object: 'product',
    active: true,
    created: Math.floor(Date.now() / 1000),
    default_price: null,
    description: 'Test Product Description',
    images: [],
    livemode: false,
    metadata: overrides.metadata || {},
    name: overrides.name || 'Test Product',
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

// Helper to create a mock Stripe.Event for price.created
const createMockPriceCreatedEvent = (priceOverrides: Partial<Stripe.Price> = {}): Stripe.Event => {
  const mockPrice = createMockStripePrice(priceOverrides);
  return {
    id: `evt_price_created_${mockPrice.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: mockPrice as any, // Cast to any because Stripe.EventData.object is a broad union
    },
    livemode: mockPrice.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'price.created',
  } as Stripe.Event;
};

Deno.test('handlePriceCreated specific tests', async (t) => {
  let mockStripeSdk: MockStripe;
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;

  const PRODUCT_ID_DEFAULT = 'prod_default123';
  const PRICE_ID_DEFAULT = 'price_default123';

  // No global spy variables here anymore

  const initializeTestContext = (supabaseConfig: MockSupabaseDataConfig = {}) => {
    mockStripeSdk = createMockStripe();
    mockSupabase = createMockSupabaseClient(supabaseConfig);
    
    // Create fresh spies for logger methods for this step and return them
    const stepInfoSpy = spy(logger, 'info');
    const stepWarnSpy = spy(logger, 'warn');
    const stepErrorSpy = spy(logger, 'error');

    handlerContext = {
      stripe: mockStripeSdk.instance,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient,
      logger: logger, 
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test_secret',
    };
    return { stepInfoSpy, stepWarnSpy, stepErrorSpy };
  };

  const teardownTestContext = (
    stepSpies: { stepInfoSpy?: Spy, stepWarnSpy?: Spy, stepErrorSpy?: Spy } | null
  ) => {
    console.log('[TEST LOG] Entering teardownTestContext. mockStripeSdk:', typeof mockStripeSdk, mockStripeSdk === undefined);
    if (mockStripeSdk) {
      console.log('[TEST LOG] mockStripeSdk is defined. Type of clearStubs:', typeof mockStripeSdk.clearStubs);
      mockStripeSdk.clearStubs();
      console.log('[TEST LOG] mockStripeSdk.clearStubs() called.');
    } else {
      console.log('[TEST LOG] mockStripeSdk is undefined or null.');
    }

    // Restore logger methods spied for this specific step
    if (stepSpies?.stepInfoSpy) stepSpies.stepInfoSpy.restore();
    if (stepSpies?.stepWarnSpy) stepSpies.stepWarnSpy.restore();
    if (stepSpies?.stepErrorSpy) stepSpies.stepErrorSpy.restore();
  };

  await t.step('Successful price.created event - new price for existing product', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockProduct = createMockStripeProduct({ id: PRODUCT_ID_DEFAULT, name: 'Test Product for Success' }); 
      const mockEvent = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT,
        product: PRODUCT_ID_DEFAULT,
        unit_amount: 1500,
        currency: 'usd',
        type: 'one_time',
        active: true,
        metadata: { 'price_specific_meta': 'value1' }
      });
      
      // Create the mock function implementation
      const mockRetrieveImplementation = async (
        id: string,
        paramsOrOptions?: Stripe.ProductRetrieveParams | Stripe.RequestOptions,
        optionsOnly?: Stripe.RequestOptions
      ): Promise<Stripe.Response<Stripe.Product>> => {
        const responseProduct: Stripe.Response<Stripe.Product> = {
          ...mockProduct, 
          marketing_features: mockProduct.marketing_features || [],
          features: mockProduct.features || [],
          images: mockProduct.images || [],
          package_dimensions: mockProduct.package_dimensions === undefined ? null : mockProduct.package_dimensions,
          shippable: mockProduct.shippable === undefined ? null : mockProduct.shippable,
          statement_descriptor: mockProduct.statement_descriptor === undefined ? null : mockProduct.statement_descriptor,
          tax_code: mockProduct.tax_code === undefined ? null : mockProduct.tax_code,
          unit_label: mockProduct.unit_label === undefined ? null : mockProduct.unit_label,
          url: mockProduct.url === undefined ? null : mockProduct.url,
          lastResponse: { 
            headers: {},
            requestId: 'req_mock_test_product_retrieve',
            statusCode: 200,
          }
        };
        if (id === mockProduct.id) {
            return Promise.resolve(responseProduct);
        }
        return Promise.reject(new Error(`Mock product retrieve called with unexpected ID: ${id}`));
      };

      // Spy on our implementation and assign it
      const spiedRetrieve = spy(mockRetrieveImplementation);
      mockStripeSdk.instance.products.retrieve = spiedRetrieve;
      
      // Ensure the from method is called to set up the builder if it wasn't already
      // The actual spy will be retrieved after the handler runs.
      mockSupabase.client.from('subscription_plans'); 

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assertEquals(result.transactionId, mockEvent.id);
      assert(result.error === undefined, "Error should be undefined on success");

      assertSpyCalls(spiedRetrieve, 1);
      assertEquals(spiedRetrieve.calls[0].args[0], PRODUCT_ID_DEFAULT);

      // Retrieve the spy for upsert after the handler has run
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder, "subscription_plans builder should exist");
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy, "upsert spy should exist on plansBuilder");

      assertSpyCalls(upsertSpy, 1);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price is for a recurring subscription', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockProductRecurring = createMockStripeProduct({ 
        id: PRODUCT_ID_DEFAULT + '_recurring',
        name: 'Recurring Test Product'
      });

      const mockRecurringEvent = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_recurring',
        product: mockProductRecurring.id,
        unit_amount: 2500,
        currency: 'usd',
        type: 'recurring',
        active: true,
        recurring: {
          interval: 'month',
          interval_count: 1,
          usage_type: 'licensed',
          aggregate_usage: null,
          trial_period_days: null,
          meter: null,
        },
        metadata: { 'recurring_meta': 'yes' }
      });

      const mockRetrieveImplRecurring = async (
        id: string,
        paramsOrOptions?: Stripe.ProductRetrieveParams | Stripe.RequestOptions,
        optionsOnly?: Stripe.RequestOptions
      ): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductRecurring.id) {
          return Promise.resolve({
            ...mockProductRecurring,
            lastResponse: { headers: {}, requestId: 'req_mock_recurring', statusCode: 200 }
          } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Mock product retrieve called with unexpected ID: ${id} for recurring test`));
      };

      const spiedRetrieveRecurring = spy(mockRetrieveImplRecurring);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveRecurring;

      mockSupabase.client.from('subscription_plans'); // Prime the builder access

      const result = await handlePriceCreated(handlerContext, mockRecurringEvent);

      assertEquals(result.success, true, 'Handler should succeed for recurring price');
      assertEquals(result.transactionId, mockRecurringEvent.id);
      assert(result.error === undefined, "Error should be undefined on success for recurring price");

      assertSpyCalls(spiedRetrieveRecurring, 1);
      assertEquals(spiedRetrieveRecurring.calls[0].args[0], mockProductRecurring.id);

      const plansBuilderRecurring = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilderRecurring, "subscription_plans builder should exist for recurring");
      const upsertSpyRecurring = plansBuilderRecurring.methodSpies['upsert'];
      assertExists(upsertSpyRecurring, "upsert spy should exist on plansBuilder for recurring");

      assertSpyCalls(upsertSpyRecurring, 1);
      const upsertArgRecurring = upsertSpyRecurring.calls[0].args[0] as any;
      
      assertEquals(upsertArgRecurring.stripe_price_id, (mockRecurringEvent.data.object as Stripe.Price).id);
      assertEquals(upsertArgRecurring.stripe_product_id, mockProductRecurring.id);
      assertEquals(upsertArgRecurring.name, 'Recurring Test Product');
      assertEquals(upsertArgRecurring.plan_type, 'subscription');
      assertEquals(upsertArgRecurring.interval, 'month');
      assertEquals(upsertArgRecurring.interval_count, 1);
      assertEquals(upsertArgRecurring.active, true);
      assertExists(upsertArgRecurring.metadata);
      assertEquals(upsertArgRecurring.metadata.recurring_meta, 'yes');
      assertEquals(upsertArgRecurring.item_id_internal, (mockRecurringEvent.data.object as Stripe.Price).id);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price is inactive', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockProductInactive = createMockStripeProduct({ id: PRODUCT_ID_DEFAULT + '_inactive' });
      const mockInactiveEvent = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_inactive',
        product: mockProductInactive.id,
        active: false,
      });

      const mockRetrieveImplInactive = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductInactive.id) {
          return Promise.resolve({ ...mockProductInactive, lastResponse: { headers: {}, requestId: 'req_inactive', statusCode: 200 } } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Unexpected product ID for inactive test: ${id}`));
      };
      const spiedRetrieveInactive = spy(mockRetrieveImplInactive);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveInactive;

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceCreated(handlerContext, mockInactiveEvent);

      assertEquals(result.success, true, 'Handler should succeed for inactive price');
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      assertEquals((upsertSpy.calls[0].args[0] as any).active, false);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product has minimal details (e.g., missing description)', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockProductMinimal = createMockStripeProduct({
        id: PRODUCT_ID_DEFAULT + '_minimal',
        description: null, // Explicitly null description
        name: 'Minimal Product'
      });
      const mockMinimalEvent = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_minimal',
        product: mockProductMinimal.id,
      });

      const mockRetrieveImplMinimal = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductMinimal.id) {
          return Promise.resolve({ ...mockProductMinimal, lastResponse: { headers: {}, requestId: 'req_minimal', statusCode: 200 } } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Unexpected product ID for minimal test: ${id}`));
      };
      const spiedRetrieveMinimal = spy(mockRetrieveImplMinimal);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveMinimal;
      
      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceCreated(handlerContext, mockMinimalEvent);

      assertEquals(result.success, true, 'Handler should succeed for product with minimal details');
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertArg = upsertSpy.calls[0].args[0] as any;
      assertEquals(upsertArg.name, 'Minimal Product');
      // Check how your code specifically handles null product.description for plan description
      // Assuming it might become an empty object or have a default subtitle
      assertExists(upsertArg.description, "Plan description should exist");
      assertEquals(upsertArg.description.subtitle, 'Minimal Product', "Subtitle should default to product name if product description is null");
      assertEquals(upsertArg.description.features.length, 0, "Features should be empty if product description is null");
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price has no metadata', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockProductNoMeta = createMockStripeProduct({ id: PRODUCT_ID_DEFAULT + '_nometa' });
      const mockNoMetaEvent = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_nometa',
        product: mockProductNoMeta.id,
        metadata: {}, // Changed from null to empty object
      });

      const mockRetrieveImplNoMeta = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductNoMeta.id) {
          return Promise.resolve({ ...mockProductNoMeta, lastResponse: { headers: {}, requestId: 'req_nometa', statusCode: 200 } } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Unexpected product ID for no metadata test: ${id}`));
      };
      const spiedRetrieveNoMeta = spy(mockRetrieveImplNoMeta);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveNoMeta;

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceCreated(handlerContext, mockNoMetaEvent);
      
      assertEquals(result.success, true, 'Handler should succeed for price with no metadata');
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      assertEquals((upsertSpy.calls[0].args[0] as any).metadata, {}, "Metadata should default to empty object if price metadata is null"); // Or null, depending on implementation
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product retrieval from Stripe fails', async () => {
    let stepSpies = null;
    const originalRetrieve = mockStripeSdk.instance.products.retrieve; // Save original
    try {
      stepSpies = initializeTestContext({});
      const mockEventFailRetrieve = createMockPriceCreatedEvent({ product: 'prod_fail_retrieve' });

      const mockRetrieveImplFail = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        return Promise.reject(new Error('Stripe API Error: Product not found'));
      };
      const spiedRetrieveFail = spy(mockRetrieveImplFail);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveFail;
      
      mockSupabase.client.from('subscription_plans'); // So getLatestBuilder doesn't fail
      const result = await handlePriceCreated(handlerContext, mockEventFailRetrieve);

      assertEquals(result.success, false, 'Handler should fail if product retrieval fails');
      assertExists(result.error, 'Error message should exist for product retrieval failure');
      assert(result.error.includes('Failed to retrieve product prod_fail_retrieve from Stripe'));
      
      assertSpyCalls(spiedRetrieveFail, 1);
      assertSpyCalls(stepSpies.stepErrorSpy, 1); // Use the global errorSpy
      const loggedErrorArgRetrieveFail = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageRetrieveFail: string | undefined;
      if (typeof loggedErrorArgRetrieveFail === 'string') {
        loggedMessageRetrieveFail = loggedErrorArgRetrieveFail;
      } else if (loggedErrorArgRetrieveFail instanceof Error) {
        loggedMessageRetrieveFail = loggedErrorArgRetrieveFail.message;
      }
      assert(loggedMessageRetrieveFail && loggedMessageRetrieveFail.includes('Error retrieving product prod_fail_retrieve from Stripe'));

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      const upsertSpy = plansBuilder?.methodSpies['upsert'];
      if (upsertSpy) { 
          assertSpyCalls(upsertSpy, 0); 
      }
    } finally {
      mockStripeSdk.instance.products.retrieve = originalRetrieve; // Restore original
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price object is missing product ID', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventNoProdId = createMockPriceCreatedEvent({ id: 'price_no_prod_id_v2' });
      (mockEventNoProdId.data.object as Stripe.Price).product = ""; 

      const result = await handlePriceCreated(handlerContext, mockEventNoProdId);

      assertEquals(result.success, false, 'Handler should fail if price has no product ID');
      assertExists(result.error, 'Error message should exist for missing product ID');
      assert(result.error.includes('Product ID missing or invalid on price object'));
      
      assertSpyCalls(stepSpies.stepErrorSpy, 1); 
      const loggedErrorArgNoProdId = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageNoProdId: string | undefined;
      if (typeof loggedErrorArgNoProdId === 'string') {
        loggedMessageNoProdId = loggedErrorArgNoProdId;
      } else if (loggedErrorArgNoProdId instanceof Error) {
        loggedMessageNoProdId = loggedErrorArgNoProdId.message;
      }
      assert(loggedMessageNoProdId && loggedMessageNoProdId.includes('Product ID is missing or not a string on price object'));
      
      assertSpyCalls(mockStripeSdk.stubs.productsRetrieve, 0); // Assert on the mock's own stub

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      const upsertSpy = plansBuilder?.methodSpies['upsert'];
      if (upsertSpy) {
          assertSpyCalls(upsertSpy, 0);
      }
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Upsert to subscription_plans fails', async () => {
    let stepSpies = null;
    const originalRetrieve = mockStripeSdk.instance.products.retrieve; // Save original
    try {
      stepSpies = initializeTestContext({
          genericMockResults: {
              subscription_plans: {
                  upsert: () => Promise.resolve({ 
                      data: null, 
                      error: new Error('Supabase upsert error'),
                      count: 0, 
                      status: 500, 
                      statusText: 'Internal Server Error' 
                  })
              }
          }
      });
      const mockProductUpsertFail = createMockStripeProduct({ id: PRODUCT_ID_DEFAULT + '_upsertfail' });
      const mockEventUpsertFail = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_upsertfail',
        product: mockProductUpsertFail.id,
      });

      const mockRetrieveImplUpsertFail = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductUpsertFail.id) {
          return Promise.resolve({ ...mockProductUpsertFail, lastResponse: { headers: {}, requestId: 'req_upsertfail', statusCode: 200 } } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Unexpected product ID for upsert fail test: ${id}`));
      };
      const spiedRetrieveUpsertFail = spy(mockRetrieveImplUpsertFail);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveUpsertFail;

      mockSupabase.client.from('subscription_plans'); 

      const result = await handlePriceCreated(handlerContext, mockEventUpsertFail);

      assertEquals(result.success, false, 'Handler should fail if Supabase upsert fails');
      assertExists(result.error, 'Error message should exist for Supabase failure');
      assert(
          result.error.includes('Failed to upsert plan for price'),
          'Error message should indicate upsert failure part 1'
      );
      assert(
          result.error.includes(': Supabase upsert error'), // Corrected to match actual error string format
          'Error message should include DB error part 2 (with colon)'
      );

      assertSpyCalls(spiedRetrieveUpsertFail, 1);
      
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1); 
      assertSpyCalls(stepSpies.stepErrorSpy, 1); 
      const loggedErrorArgUpsertFail = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageUpsertFail: string | undefined;
      if (typeof loggedErrorArgUpsertFail === 'string') {
        loggedMessageUpsertFail = loggedErrorArgUpsertFail;
      } else if (loggedErrorArgUpsertFail instanceof Error) {
        loggedMessageUpsertFail = loggedErrorArgUpsertFail.message;
      }
      assert(loggedMessageUpsertFail && loggedMessageUpsertFail.includes('Error upserting subscription_plan for price'));
    } finally {
      mockStripeSdk.instance.products.retrieve = originalRetrieve; // Restore original
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Event data object is not a valid Price object (e.g., missing type)', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockMalformedEvent = createMockPriceCreatedEvent({ 
        id: 'price_malformed_unit_amount', 
        unit_amount: null as any // Force invalid unit_amount to hit early validation
      });
      // (mockMalformedEvent.data.object as any).type = undefined; // This path is harder to hit before product checks

      // No need to mock product retrieval if unit_amount check fails first
      // const spiedRetrieveMalformed = spy(async () => Promise.resolve({} as Stripe.Response<Stripe.Product>));
      // mockStripeSdk.instance.products.retrieve = spiedRetrieveMalformed;

      const result = await handlePriceCreated(handlerContext, mockMalformedEvent);

      assertEquals(result.success, false, 'Handler should fail for malformed price event data (invalid unit_amount)');
      assertExists(result.error, 'Error message should exist for malformed data (invalid unit_amount)');
      const expectedErrorMsg = `Price price_malformed_unit_amount has invalid unit_amount. Cannot sync.`;
      assert(
          result.error.includes(expectedErrorMsg),
          `Error message should be '${expectedErrorMsg}' but was '${result.error}'`
      );

      assertSpyCalls(stepSpies.stepErrorSpy, 1); 
      const loggedErrorArgMalformed = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageMalformed: string | undefined;
      if (typeof loggedErrorArgMalformed === 'string') {
        loggedMessageMalformed = loggedErrorArgMalformed;
      } else if (loggedErrorArgMalformed instanceof Error) {
        loggedMessageMalformed = loggedErrorArgMalformed.message;
      }
      assert(loggedMessageMalformed && loggedMessageMalformed.includes('has null or undefined unit_amount'));
      
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product retrieved from Stripe is a DeletedProduct', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockDeletedProductEvent = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_deleted_prod',
        product: PRODUCT_ID_DEFAULT + '_deleted_prod'
      });
      const mockDeletedProduct: Stripe.DeletedProduct = {
        id: PRODUCT_ID_DEFAULT + '_deleted_prod',
        object: 'product',
        deleted: true,
      };

      const mockRetrieveImplDeleted = async (id: string): Promise<Stripe.Response<Stripe.Product | Stripe.DeletedProduct>> => {
        if (id === PRODUCT_ID_DEFAULT + '_deleted_prod') {
          return Promise.resolve({ 
            ...mockDeletedProduct,
            lastResponse: { headers: {}, requestId: 'req_deleted_prod', statusCode: 200 }
           } as Stripe.Response<Stripe.DeletedProduct>);
        }
        return Promise.reject(new Error(`Unexpected product ID for deleted product test: ${id}`));
      };
      const spiedRetrieveDeleted = spy(mockRetrieveImplDeleted);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveDeleted as any; // Cast to any to satisfy StripeSDK types

      mockSupabase.client.from('subscription_plans'); // Prime the builder

      const result = await handlePriceCreated(handlerContext, mockDeletedProductEvent);

      assertEquals(result.success, false, 'Handler should fail if product is deleted');
      assertExists(result.error, 'Error message should exist for deleted product');
      assert(result.error.includes(`Product ${PRODUCT_ID_DEFAULT + '_deleted_prod'} is deleted and cannot be synced.`));
      
      assertSpyCalls(spiedRetrieveDeleted, 1);
      assertSpyCalls(stepSpies.stepErrorSpy, 0); // Should be logger.warn now
      assertSpyCalls(stepSpies.stepWarnSpy, 1); // Check for logger.warn
      const loggedWarning = stepSpies.stepWarnSpy.calls[0].args[0];
      assert(typeof loggedWarning === 'string' && loggedWarning.includes(`Product ${PRODUCT_ID_DEFAULT + '_deleted_prod'} is marked as deleted by Stripe. Skipping upsert for price ${PRICE_ID_DEFAULT + '_deleted_prod'}.`));

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      const upsertSpy = plansBuilder?.methodSpies['upsert'];
      if (upsertSpy) {
        assertSpyCalls(upsertSpy, 0); // No upsert should be attempted
      }
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product description is a JSON array (for features)', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const productName = 'Product With Features';
      const productDescriptionJson = '["Feature Alpha", "Feature Beta"]'
      const mockProductWithFeatures = createMockStripeProduct({
        id: PRODUCT_ID_DEFAULT + '_features',
        name: productName,
        description: productDescriptionJson,
      });
      const mockEventWithFeatures = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_features',
        product: mockProductWithFeatures.id,
      });

      const mockRetrieveImplFeatures = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductWithFeatures.id) {
          return Promise.resolve({ 
            ...mockProductWithFeatures, 
            lastResponse: { headers: {}, requestId: 'req_features', statusCode: 200 }
          } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Unexpected product ID for features test: ${id}`));
      };
      const spiedRetrieveFeatures = spy(mockRetrieveImplFeatures);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveFeatures;

      mockSupabase.client.from('subscription_plans'); // Prime the builder
      const result = await handlePriceCreated(handlerContext, mockEventWithFeatures);

      assertEquals(result.success, true, 'Handler should succeed for product with JSON features in description');
      
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertArg = upsertSpy.calls[0].args[0] as any;
      assertEquals(upsertArg.name, productName);
      assertExists(upsertArg.description, 'Plan description object should exist');
      assertEquals(upsertArg.description.subtitle, productName, 'Subtitle should be product name when description is JSON features');
      assertEquals(upsertArg.description.features, ["Feature Alpha", "Feature Beta"], 'Features should be parsed from JSON');
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product description is a plain string (for subtitle)', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const productNamePlain = 'Product Plain Description';
      const productDescriptionPlain = 'This is a simple product subtitle.';
      const mockProductPlainDesc = createMockStripeProduct({
        id: PRODUCT_ID_DEFAULT + '_plain_desc',
        name: productNamePlain,
        description: productDescriptionPlain,
      });
      const mockEventPlainDesc = createMockPriceCreatedEvent({
        id: PRICE_ID_DEFAULT + '_plain_desc',
        product: mockProductPlainDesc.id,
      });

      const mockRetrieveImplPlainDesc = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id === mockProductPlainDesc.id) {
          return Promise.resolve({ 
            ...mockProductPlainDesc, 
            lastResponse: { headers: {}, requestId: 'req_plain_desc', statusCode: 200 }
           } as Stripe.Response<Stripe.Product>);
        }
        return Promise.reject(new Error(`Unexpected product ID for plain description test: ${id}`));
      };
      const spiedRetrievePlainDesc = spy(mockRetrieveImplPlainDesc);
      mockStripeSdk.instance.products.retrieve = spiedRetrievePlainDesc;

      mockSupabase.client.from('subscription_plans'); // Prime the builder
      const result = await handlePriceCreated(handlerContext, mockEventPlainDesc);

      assertEquals(result.success, true, 'Handler should succeed for product with plain string description');
      
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertArg = upsertSpy.calls[0].args[0] as any;
      assertEquals(upsertArg.name, productNamePlain);
      assertExists(upsertArg.description, 'Plan description object should exist');
      assertEquals(upsertArg.description.subtitle, productDescriptionPlain, 'Subtitle should be the plain string description');
      assertEquals(upsertArg.description.features, [], 'Features should be empty when description is plain string');
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Ignores price_FREE event', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceCreatedEvent({ id: 'price_FREE' });

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assertEquals(result.transactionId, mockEvent.id);
      assertEquals(result.error, "Price 'price_FREE' event ignored as per specific rule.");

      assertSpyCalls(stepSpies.stepInfoSpy, 2); 
      assert(stepSpies.stepInfoSpy.calls[1].args[0].includes("Ignoring price.created event for 'price_FREE'"));
      
      assertSpyCalls(mockStripeSdk.stubs.productsRetrieve, 0); // Assert on the mock's own stub

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy!, 0); 
      } 

      assertSpyCalls(stepSpies.stepWarnSpy, 0);
      assertSpyCalls(stepSpies.stepErrorSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles missing product ID on price object', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceCreatedEvent({ 
        id: 'price_no_prod_id', 
        product: null as any, 
      });

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertEquals(result.transactionId, mockEvent.id);
      assertEquals(result.error, "Product ID missing or invalid on price object.");

      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogMessage = stepSpies.stepErrorSpy.calls[0].args[0] as string;
      assert(errorLogMessage.includes("Product ID is missing or not a string"));
      
      assertSpyCalls(mockStripeSdk.stubs.productsRetrieve, 0); // Assert on the mock's own stub

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy!, 0);
      }

      assertSpyCalls(stepSpies.stepInfoSpy, 1); 
      assertSpyCalls(stepSpies.stepWarnSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles invalid unit_amount on price object', async () => {
    let stepSpies = null;
    const priceIdWithInvalidAmount = 'price_invalid_amount';
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceCreatedEvent({ 
        id: priceIdWithInvalidAmount,
        product: 'prod_for_invalid_amount',
        unit_amount: null as any, 
      });

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertEquals(result.transactionId, mockEvent.id);
      assertEquals(result.error, `Price ${priceIdWithInvalidAmount} has invalid unit_amount. Cannot sync.`);

      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogMessage = stepSpies.stepErrorSpy.calls[0].args[0] as string;
      assert(errorLogMessage.includes(`Price ${priceIdWithInvalidAmount} has null or undefined unit_amount`));
      
      assertSpyCalls(mockStripeSdk.stubs.productsRetrieve, 0); // Assert on the mock's own stub

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy!, 0);
      }

      assertSpyCalls(stepSpies.stepInfoSpy, 1); 
      assertSpyCalls(stepSpies.stepWarnSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles non-numeric tokens_awarded metadata', async () => {
    let stepSpies = null;
    const productIdWithInvalidTokenMeta = 'prod_invalid_token_meta';
    const priceIdForInvalidTokenMeta = 'price_invalid_token_meta';
    let spiedCustomRetrieve: Spy | null = null; // For our local spied function

    try {
      stepSpies = initializeTestContext({});
      const mockProduct = createMockStripeProduct({
        id: productIdWithInvalidTokenMeta,
        name: 'Product with Invalid Token Meta',
        metadata: { tokens_awarded: 'not-a-number' },
      });
      const mockEvent = createMockPriceCreatedEvent({
        id: priceIdForInvalidTokenMeta,
        product: productIdWithInvalidTokenMeta,
        unit_amount: 2000,
      });

      // Define a local custom implementation for product retrieval
      const customRetrieveLogic = async (...args: any[]): Promise<Stripe.Response<Stripe.Product>> => {
        const id = args[0] as string;
        if (id === productIdWithInvalidTokenMeta) {
          return { ...mockProduct, lastResponse: {headers: {}, requestId: 'req_mock_custom', statusCode: 200} } as Stripe.Response<Stripe.Product>;
        }
        throw new Error(`Custom mock retrieve logic called with unexpected ID: ${id}`);
      };
      spiedCustomRetrieve = spy(customRetrieveLogic);
      mockStripeSdk.instance.products.retrieve = spiedCustomRetrieve; // Assign our spied local function
      
      mockSupabase.client.from('subscription_plans'); 

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined);

      assertSpyCalls(stepSpies.stepWarnSpy, 1);
      const warnLogMessage = stepSpies.stepWarnSpy.calls[0].args[0] as string;
      assert(warnLogMessage.includes('Invalid non-numeric value for tokens_awarded metadata: "not-a-number"'));

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertData = upsertSpy.calls[0].args[0] as any; 
      assertEquals(upsertData.tokens_awarded, undefined);

      assertExists(spiedCustomRetrieve); 
      assertSpyCalls(spiedCustomRetrieve!, 1); 
      assertSpyCalls(stepSpies.stepInfoSpy, 4); 
      assertSpyCalls(stepSpies.stepErrorSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });
});
