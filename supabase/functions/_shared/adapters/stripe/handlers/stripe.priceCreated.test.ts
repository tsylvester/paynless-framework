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
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import type { Json, TablesInsert } from '../../../../types_db.ts';
import type { ParsedProductDescription } from '../../../utils/productDescriptionParser.ts';
import { handlePriceCreated } from './stripe.priceCreated.ts';
import { logger } from '../../../logger.ts';

/** Event shape for price.created: object is Stripe.Price. */
type PriceCreatedEvent = Stripe.Event & { type: 'price.created'; data: { object: Stripe.Price } };

/** lastResponse for Stripe.Response<Product> mocks. Type from Stripe SDK. */
const mockLastResponseObject: Stripe.Response<Stripe.Product>['lastResponse'] = {
  headers: {},
  requestId: 'req_mock_test_product_retrieve',
  statusCode: 200,
};

/** Validates and returns subscription_plans.description as ParsedProductDescription. Throws if invalid. Single place for description shape. */
function parseDescriptionFromUpsert(desc: TablesInsert<'subscription_plans'>['description']): ParsedProductDescription {
  if (desc === null || typeof desc !== 'object') {
    throw new Error('description is null or not an object');
  }
  const o: Record<string, unknown> = { ...desc };
  if (typeof o.subtitle !== 'string') {
    throw new Error('description.subtitle is not a string');
  }
  if (!Array.isArray(o.features)) {
    throw new Error('description.features is not an array');
  }
  const features: string[] = o.features.filter((f: unknown): f is string => typeof f === 'string');
  return { subtitle: o.subtitle, features };
}

/** Shape of lastResponse on Stripe.Response. */
const mockLastResponse: Stripe.Response<Stripe.Product> = {
  id: 'req_mock_test_product_retrieve',
  object: 'product',
  active: true,
  created: Math.floor(Date.now() / 1000),
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Test Product for Success',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: Math.floor(Date.now() / 1000),
  url: null,
  marketing_features: [],
  lastResponse: mockLastResponseObject,
};

/** Narrows plan metadata (Json) to record of strings for assertion. Uses built-in Record type. */
function isPlanMetadataRecord(v: Json | null | undefined): v is Record<string, string> {
  return v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v).every((x): x is string => typeof x === 'string');
}

/** Build event from a full price. */
function buildPriceCreatedEvent(price: Stripe.Price): PriceCreatedEvent {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `evt_price_created_${price.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created,
    data: { object: price },
    livemode: price.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'price.created',
  };
}

const PRODUCT_ID_DEFAULT = 'prod_default123';
const PRICE_ID_DEFAULT = 'price_default123';

/** Explicit full Stripe.Price for one-time, success case. No default/fallback. */
const FULL_ONE_TIME_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT,
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: Math.floor(Date.now() / 1000),
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: { price_specific_meta: 'value1' },
  nickname: null,
  product: PRODUCT_ID_DEFAULT,
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1500,
  unit_amount_decimal: '1500',
};

/** Explicit full Stripe.Product for success case. No default/fallback. */
const FULL_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT,
  object: 'product',
  active: true,
  created: Math.floor(Date.now() / 1000),
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Test Product for Success',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: Math.floor(Date.now() / 1000),
  url: null,
  marketing_features: [],
};

/** Explicit full recurring Stripe.Price. No default/fallback. */
const FULL_RECURRING_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_recurring',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: Math.floor(Date.now() / 1000),
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: { recurring_meta: 'yes' },
  nickname: null,
  product: PRODUCT_ID_DEFAULT + '_recurring',
  recurring: {
    interval: 'month',
    interval_count: 1,
    usage_type: 'licensed',
    trial_period_days: null,
    meter: null,
  },
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'recurring',
  unit_amount: 2500,
  unit_amount_decimal: '2500',
};

/** Explicit full Stripe.Product for recurring test. No default/fallback. */
const FULL_RECURRING_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_recurring',
  object: 'product',
  active: true,
  created: Math.floor(Date.now() / 1000),
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Recurring Test Product',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: Math.floor(Date.now() / 1000),
  url: null,
  marketing_features: [],
};

/** Explicit full Stripe.Price (inactive). No default/fallback. */
const INACTIVE_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_inactive',
  object: 'price',
  active: false,
  billing_scheme: 'per_unit',
  created: Math.floor(Date.now() / 1000),
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: PRODUCT_ID_DEFAULT + '_inactive',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

/** Explicit full Stripe.Product for inactive test. No default/fallback. */
const INACTIVE_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_inactive',
  object: 'product',
  active: true,
  created: Math.floor(Date.now() / 1000),
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Test Product',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: Math.floor(Date.now() / 1000),
  url: null,
  marketing_features: [],
};

const ts = Math.floor(Date.now() / 1000);

/** Full price for minimal-description test. */
const MINIMAL_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_minimal',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: PRODUCT_ID_DEFAULT + '_minimal',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

/** Full product with null description. */
const MINIMAL_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_minimal',
  object: 'product',
  active: true,
  created: ts,
  default_price: null,
  description: null,
  images: [],
  livemode: false,
  metadata: {},
  name: 'Minimal Product',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: ts,
  url: null,
  marketing_features: [],
};

/** Full price with empty metadata. */
const NOMETA_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_nometa',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: PRODUCT_ID_DEFAULT + '_nometa',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

const NOMETA_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_nometa',
  object: 'product',
  active: true,
  created: ts,
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Test Product',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: ts,
  url: null,
  marketing_features: [],
};

/** Price for product-not-found test. */
const FAIL_RETRIEVE_PRICE: Stripe.Price = {
  id: 'price_test123',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: 'prod_fail_retrieve',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

/** Price with empty product ID (invalid). */
const EMPTY_PRODUCT_ID_PRICE: Stripe.Price = {
  id: 'price_no_prod_id_empty_str',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: '',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

const UPSERTFAIL_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_upsertfail',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: PRODUCT_ID_DEFAULT + '_upsertfail',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

const UPSERTFAIL_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_upsertfail',
  object: 'product',
  active: true,
  created: ts,
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Test Product',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: ts,
  url: null,
  marketing_features: [],
};

/** Price with null unit_amount for validation error test. */
const NULL_UNIT_AMOUNT_PRICE: Stripe.Price = {
  id: 'price_malformed_unit_amount',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: 'prod_any',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: null,
  unit_amount_decimal: '0',
};

/** Price with null unit_amount for "Handles invalid unit_amount" step (id and product match assertion messages). */
const PRICE_INVALID_AMOUNT: Stripe.Price = {
  id: 'price_invalid_amount',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: 'prod_for_invalid_amount',
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: null,
  unit_amount_decimal: '0',
};

const PRICE_FREE: Stripe.Price = {
  id: 'price_FREE',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: PRODUCT_ID_DEFAULT,
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 0,
  unit_amount_decimal: '0',
};

/** Intentionally malformed for validation test: product null. Built in one place; Instructions allow dedicated helpers for error-handling tests. */
function buildPriceWithNullProduct(): Stripe.Price {
  const p: Stripe.Price = {
    id: 'price_no_prod_id',
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: ts,
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {},
    nickname: null,
    product: 'prod_placeholder',
    recurring: null,
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: 'one_time',
    unit_amount: 1000,
    unit_amount_decimal: '1000',
  };
  (p as { product: string | null }).product = null;
  return p;
}

/** Intentionally malformed for validation test: unit_amount null. Built in one place; Instructions allow dedicated helpers for error-handling tests. */
function buildMalformedUnitAmountPrice(): Stripe.Price {
  const p: Stripe.Price = {
    id: 'price_malformed_unit_amount',
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: ts,
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {},
    nickname: null,
    product: 'prod_for_invalid_amount',
    recurring: null,
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: 'one_time',
    unit_amount: 1000,
    unit_amount_decimal: '1000',
  };
  (p as { unit_amount: number | null }).unit_amount = null;
  return p;
}

const FEATURES_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_features',
  object: 'product',
  active: true,
  created: ts,
  default_price: null,
  description: '["Feature Alpha", "Feature Beta"]',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Product With Features',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: ts,
  url: null,
  marketing_features: [],
  };

const FEATURES_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_features',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: FEATURES_PRODUCT.id,
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

const PLAIN_DESC_PRODUCT: Stripe.Product = {
  id: PRODUCT_ID_DEFAULT + '_plain_desc',
  object: 'product',
  active: true,
  created: ts,
  default_price: null,
  description: 'This is a simple product subtitle.',
  images: [],
  livemode: false,
  metadata: {},
  name: 'Product Plain Description',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: ts,
  url: null,
  marketing_features: [],
};

const PLAIN_DESC_PRICE: Stripe.Price = {
  id: PRICE_ID_DEFAULT + '_plain_desc',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: PLAIN_DESC_PRODUCT.id,
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000,
  unit_amount_decimal: '1000',
};

const INVALID_TOKENS_PRODUCT: Stripe.Product = {
  id: 'prod_invalid_token_meta',
  object: 'product',
  active: true,
  created: ts,
  default_price: null,
  description: 'Test Product Description',
  images: [],
  livemode: false,
  metadata: { tokens_to_award: 'not-a-number' },
  name: 'Product with Invalid Token Meta',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: ts,
  url: null,
  marketing_features: [],
};

const INVALID_TOKENS_PRICE: Stripe.Price = {
  id: 'price_invalid_token_meta',
  object: 'price',
  active: true,
  billing_scheme: 'per_unit',
  created: ts,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: INVALID_TOKENS_PRODUCT.id,
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 2000,
  unit_amount_decimal: '2000',
};

Deno.test('handlePriceCreated specific tests', async (t) => {
  let mockStripeSdk: MockStripe;
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;

  const initializeTestContext = (supabaseConfig: MockSupabaseDataConfig) => {
    mockStripeSdk = createMockStripe();
    mockSupabase = createMockSupabaseClient(undefined, supabaseConfig);
    
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
    stepSpies: { stepInfoSpy?: Spy; stepWarnSpy?: Spy; stepErrorSpy?: Spy } | null
  ) => {
    if (mockStripeSdk) {
      mockStripeSdk.clearStubs();
    }
    if (stepSpies?.stepInfoSpy) stepSpies.stepInfoSpy.restore();
    if (stepSpies?.stepWarnSpy) stepSpies.stepWarnSpy.restore();
    if (stepSpies?.stepErrorSpy) stepSpies.stepErrorSpy.restore();
  };

  await t.step('Successful price.created event - new price for existing product', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = buildPriceCreatedEvent(FULL_ONE_TIME_PRICE);

      const mockRetrieveImplementation = async (
        id: string,
        _paramsOrOptions?: Stripe.ProductRetrieveParams | Stripe.RequestOptions,
        _optionsOnly?: Stripe.RequestOptions
      ): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== FULL_PRODUCT.id) {
          return Promise.reject(new Error(`Mock product retrieve called with unexpected ID: ${id}`));
        }
        const responseProduct: Stripe.Response<Stripe.Product> = { ...FULL_PRODUCT, lastResponse: mockLastResponseObject };
        return Promise.resolve(responseProduct);
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
      assertEquals(spiedRetrieve.calls[0].args[0], FULL_PRODUCT.id);

      // Retrieve the spy for upsert after the handler has run
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder, "subscription_plans builder should exist");
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy, "upsert spy should exist on plansBuilder");

      assertSpyCalls(upsertSpy, 1);
      const upsertArg: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertArg.interval, null, "One-time price must upsert interval: null");
      assertEquals(upsertArg.interval_count, null, "One-time price must upsert interval_count: null");
      assertEquals(upsertArg.plan_type, 'one_time_purchase', "One-time price must set plan_type: one_time_purchase");
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price is for a recurring subscription', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockRecurringEvent = buildPriceCreatedEvent(FULL_RECURRING_PRICE);
      const mockRetrieveImplRecurring = async (
        id: string,
        _paramsOrOptions?: Stripe.ProductRetrieveParams | Stripe.RequestOptions,
        _optionsOnly?: Stripe.RequestOptions
      ): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== FULL_RECURRING_PRODUCT.id) {
          return Promise.reject(new Error(`Mock product retrieve called with unexpected ID: ${id} for recurring test`));
        }
        return Promise.resolve({ ...FULL_RECURRING_PRODUCT, lastResponse: mockLastResponseObject });
      };

      const spiedRetrieveRecurring = spy(mockRetrieveImplRecurring);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveRecurring;

      mockSupabase.client.from('subscription_plans');

      const result = await handlePriceCreated(handlerContext, mockRecurringEvent);

      assertEquals(result.success, true, 'Handler should succeed for recurring price');
      assertEquals(result.transactionId, mockRecurringEvent.id);
      assert(result.error === undefined, "Error should be undefined on success for recurring price");

      assertSpyCalls(spiedRetrieveRecurring, 1);
      assertEquals(spiedRetrieveRecurring.calls[0].args[0], FULL_RECURRING_PRODUCT.id);

      const plansBuilderRecurring = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilderRecurring, "subscription_plans builder should exist for recurring");
      const upsertSpyRecurring = plansBuilderRecurring.methodSpies['upsert'];
      assertExists(upsertSpyRecurring, "upsert spy should exist on plansBuilder for recurring");

      assertSpyCalls(upsertSpyRecurring, 1);
      const upsertArgRecurring: TablesInsert<'subscription_plans'> = upsertSpyRecurring.calls[0].args[0];
      const priceObject: Stripe.Price = mockRecurringEvent.data.object;
      assertEquals(upsertArgRecurring.stripe_price_id, priceObject.id);
      assertEquals(upsertArgRecurring.stripe_product_id, FULL_RECURRING_PRODUCT.id);
      assertEquals(upsertArgRecurring.name, 'Recurring Test Product');
      assertEquals(upsertArgRecurring.plan_type, 'subscription');
      assertEquals(upsertArgRecurring.interval, 'month');
      assertEquals(upsertArgRecurring.interval_count, 1);
      assertEquals(upsertArgRecurring.active, true);
      assertExists(upsertArgRecurring.metadata);
      assert(isPlanMetadataRecord(upsertArgRecurring.metadata), 'expected metadata to be record of strings');
      assertEquals(upsertArgRecurring.metadata.recurring_meta, 'yes');
      assertEquals(upsertArgRecurring.item_id_internal, priceObject.id);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price is inactive', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockInactiveEvent = buildPriceCreatedEvent(INACTIVE_PRICE);
      const mockRetrieveImplInactive = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== INACTIVE_PRODUCT.id) {
          return Promise.reject(new Error(`Unexpected product ID for inactive test: ${id}`));
        }
        return Promise.resolve({ ...INACTIVE_PRODUCT, lastResponse: mockLastResponseObject });
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
      const upsertArg: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertArg.active, false);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product has minimal details (e.g., missing description)', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockMinimalEvent = buildPriceCreatedEvent(MINIMAL_PRICE);
      const mockRetrieveImplMinimal = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== MINIMAL_PRODUCT.id) {
          return Promise.reject(new Error(`Unexpected product ID for minimal test: ${id}`));
        }
        return Promise.resolve({ ...MINIMAL_PRODUCT, lastResponse: mockLastResponseObject });
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
      const upsertArg: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertArg.name, 'Minimal Product');
      assertExists(upsertArg.description, "Plan description should exist");
      const desc = parseDescriptionFromUpsert(upsertArg.description);
      assertEquals(desc.subtitle, 'Minimal Product', "Subtitle should be product name when product description is null");
      assertEquals(desc.features.length, 0, "Features should be empty if product description is null");
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price has no metadata', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockNoMetaEvent = buildPriceCreatedEvent(NOMETA_PRICE);
      const mockRetrieveImplNoMeta = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== NOMETA_PRODUCT.id) {
          return Promise.reject(new Error(`Unexpected product ID for no metadata test: ${id}`));
        }
        return Promise.resolve({ ...NOMETA_PRODUCT, lastResponse: mockLastResponseObject });
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
      const upsertArg: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertArg.metadata, {}, "Metadata should be empty object when price metadata is empty");
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product retrieval from Stripe fails', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    const originalRetrieve = mockStripeSdk.instance.products.retrieve;
    try {
      stepSpies = initializeTestContext({});
      const mockEventFailRetrieve = buildPriceCreatedEvent(FAIL_RETRIEVE_PRICE);

      const mockRetrieveImplFail = async (_id: string): Promise<Stripe.Response<Stripe.Product>> => {
        return Promise.reject(new Error('Stripe API Error: Product not found'));
      };
      const spiedRetrieveFail = spy(mockRetrieveImplFail);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveFail;

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceCreated(handlerContext, mockEventFailRetrieve);

      assertEquals(result.success, false);
      assertExists(result.transactionId);
      assertExists(result.error);
      assertEquals(result.error, "Unexpected error processing price.created for price price_test123: Stripe API Error: Product not found");
      assertEquals(result.status, 500, "Status should be 500 for product retrieval failure");

      assertSpyCalls(spiedRetrieveFail, 1);
      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const loggedErrorArgRetrieveFail = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageRetrieveFail: string | undefined;
      if (typeof loggedErrorArgRetrieveFail === 'string') {
        loggedMessageRetrieveFail = loggedErrorArgRetrieveFail;
      } else if (loggedErrorArgRetrieveFail instanceof Error) {
        loggedMessageRetrieveFail = loggedErrorArgRetrieveFail.message;
      } else {
        loggedMessageRetrieveFail = undefined;
      }
      assert(loggedMessageRetrieveFail && loggedMessageRetrieveFail.includes('Unexpected error processing price.created for price price_test123: Stripe API Error: Product not found'),
        `Logged error message mismatch. Got: ${loggedMessageRetrieveFail}`);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      const upsertSpy = plansBuilder?.methodSpies['upsert'];
      if (upsertSpy) {
        assertSpyCalls(upsertSpy, 0);
      }
    } finally {
      mockStripeSdk.instance.products.retrieve = originalRetrieve;
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Price object is missing product ID', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventEmptyProdId = buildPriceCreatedEvent(EMPTY_PRODUCT_ID_PRICE);

      const result = await handlePriceCreated(handlerContext, mockEventEmptyProdId);

      assertEquals(result.success, false, "Handler should fail when product ID is an empty string.");
      assertEquals(result.error, "Product ID missing or invalid on price object.");

      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogCallArgs = stepSpies.stepErrorSpy.calls[0].args;
      assert(errorLogCallArgs.length > 0, "Error spy was called without arguments");
      const firstArg: unknown = errorLogCallArgs[0];
      assert(typeof firstArg === 'string', "Error spy first arg must be string");
      assert(firstArg.includes('Product ID is missing, not a string, or empty on price object. Found: ""'),
        `Expected log to include 'Found: ""'. Got: ${firstArg}`);

      const retrieveSpy = mockStripeSdk.stubs.productsRetrieve;
      if (retrieveSpy) {
        assertSpyCalls(retrieveSpy, 0);
      }

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy, 0);
      }

      assertSpyCalls(stepSpies.stepInfoSpy, 1);
      assertSpyCalls(stepSpies.stepWarnSpy, 0);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Upsert to subscription_plans fails', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    const originalRetrieve = mockStripeSdk.instance.products.retrieve;
    try {
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            upsert: () => Promise.resolve({
              data: null,
              error: new Error('Supabase upsert error'),
              count: 0,
              status: 500,
              statusText: 'Internal Server Error',
            }),
          },
        },
      });
      const mockEventUpsertFail = buildPriceCreatedEvent(UPSERTFAIL_PRICE);
      const mockRetrieveImplUpsertFail = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== UPSERTFAIL_PRODUCT.id) {
          return Promise.reject(new Error(`Unexpected product ID for upsert fail test: ${id}`));
        }
        return Promise.resolve({ ...UPSERTFAIL_PRODUCT, lastResponse: mockLastResponseObject });
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
      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const loggedErrorArgUpsertFail = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageUpsertFail: string | undefined;
      if (typeof loggedErrorArgUpsertFail === 'string') {
        loggedMessageUpsertFail = loggedErrorArgUpsertFail;
      } else if (loggedErrorArgUpsertFail instanceof Error) {
        loggedMessageUpsertFail = loggedErrorArgUpsertFail.message;
      } else {
        loggedMessageUpsertFail = undefined;
      }
      assert(loggedMessageUpsertFail && loggedMessageUpsertFail.includes('Error upserting subscription_plan for price'));
    } finally {
      mockStripeSdk.instance.products.retrieve = originalRetrieve;
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Event data object is not a valid Price object (e.g., missing type)', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockMalformedEvent = buildPriceCreatedEvent(buildMalformedUnitAmountPrice());

      const result = await handlePriceCreated(handlerContext, mockMalformedEvent);

      assertEquals(result.success, false, 'Handler should fail for malformed price event data (invalid unit_amount)');
      assertExists(result.error, 'Error message should exist for malformed data (invalid unit_amount)');
      const expectedErrorMsg = `Price price_malformed_unit_amount has invalid unit_amount. Cannot sync.`;
      assert(
        result.error.includes(expectedErrorMsg),
        `Error message should be '${expectedErrorMsg}' but was '${result.error}'`
      );

      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const loggedErrorArgMalformed = stepSpies.stepErrorSpy.calls[0].args[0];
      let loggedMessageMalformed: string | undefined;
      if (typeof loggedErrorArgMalformed === 'string') {
        loggedMessageMalformed = loggedErrorArgMalformed;
      } else if (loggedErrorArgMalformed instanceof Error) {
        loggedMessageMalformed = loggedErrorArgMalformed.message;
      } else {
        loggedMessageMalformed = undefined;
      }
      assert(loggedMessageMalformed && loggedMessageMalformed.includes('has null or undefined unit_amount'));
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product retrieved from Stripe is a DeletedProduct', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    const deletedProdId = PRODUCT_ID_DEFAULT + '_deleted_prod';
    const deletedPriceId = PRICE_ID_DEFAULT + '_deleted_prod';
    const deletedPrice: Stripe.Price = {
      id: deletedPriceId,
      object: 'price',
      active: true,
      billing_scheme: 'per_unit',
      created: ts,
      currency: 'usd',
      custom_unit_amount: null,
      livemode: false,
      lookup_key: null,
      metadata: {},
      nickname: null,
      product: deletedProdId,
      recurring: null,
      tax_behavior: 'unspecified',
      tiers_mode: null,
      transform_quantity: null,
      type: 'one_time',
      unit_amount: 1000,
      unit_amount_decimal: '1000',
    };
    try {
      stepSpies = initializeTestContext({});
      const mockDeletedProductEvent = buildPriceCreatedEvent(deletedPrice);
      const mockDeletedProduct: Stripe.DeletedProduct = {
        id: deletedProdId,
        object: 'product',
        deleted: true,
      };

      const deletedResponse: Stripe.Response<Stripe.DeletedProduct> = {
        ...mockDeletedProduct,
        lastResponse: { headers: {}, requestId: 'req_deleted_prod', statusCode: 200 },
      };
      const mockRetrieveImplDeleted = async (id: string): Promise<Stripe.Response<Stripe.Product | Stripe.DeletedProduct>> => {
        if (id !== deletedProdId) {
          return Promise.reject(new Error(`Unexpected product ID for deleted product test: ${id}`));
        }
        return Promise.resolve(deletedResponse);
      };
      const spiedRetrieveDeleted = spy(mockRetrieveImplDeleted);
      const productsRef: { retrieve: (id: string) => Promise<Stripe.Response<Stripe.Product | Stripe.DeletedProduct>> } = mockStripeSdk.instance.products;
      productsRef.retrieve = spiedRetrieveDeleted;

      mockSupabase.client.from('subscription_plans');

      const result = await handlePriceCreated(handlerContext, mockDeletedProductEvent);

      assert(result.success, "Handler should return success:true for a deleted product as it's a handled case.");
      assertEquals(result.error, `Product ${deletedProdId} is deleted and cannot be synced.`, "Error message for deleted product mismatch.");
      assertExists(stepSpies);
      const warnArg0 = stepSpies.stepWarnSpy.calls[0].args[0];
      assert(typeof warnArg0 === 'string' && warnArg0.includes(`Product ${deletedProdId} is marked as deleted by Stripe. Skipping upsert for price ${deletedPriceId}.`));

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      const upsertSpy = plansBuilder?.methodSpies['upsert'];
      if (upsertSpy) {
        assertSpyCalls(upsertSpy, 0);
      }
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product description is a JSON array (for features)', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventWithFeatures = buildPriceCreatedEvent(FEATURES_PRICE);
      const mockRetrieveImplFeatures = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== FEATURES_PRODUCT.id) {
          return Promise.reject(new Error(`Unexpected product ID for features test: ${id}`));
        }
        return Promise.resolve({ ...FEATURES_PRODUCT, lastResponse: mockLastResponseObject });
      };
      const spiedRetrieveFeatures = spy(mockRetrieveImplFeatures);
      mockStripeSdk.instance.products.retrieve = spiedRetrieveFeatures;

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceCreated(handlerContext, mockEventWithFeatures);

      assertEquals(result.success, true, 'Handler should succeed for product with JSON features in description');

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertArg: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertArg.name, 'Product With Features');
      assertExists(upsertArg.description, 'Plan description object should exist');
      const descFeatures = parseDescriptionFromUpsert(upsertArg.description);
      assertEquals(descFeatures.subtitle, 'Product With Features', 'Subtitle should be product name when description is JSON features');
      assertEquals(descFeatures.features, ["Feature Alpha", "Feature Beta"], 'Features should be parsed from JSON');
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Product description is a plain string (for subtitle)', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventPlainDesc = buildPriceCreatedEvent(PLAIN_DESC_PRICE);
      const mockRetrieveImplPlainDesc = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== PLAIN_DESC_PRODUCT.id) {
          return Promise.reject(new Error(`Unexpected product ID for plain description test: ${id}`));
        }
        return Promise.resolve({ ...PLAIN_DESC_PRODUCT, lastResponse: mockLastResponseObject });
      };
      const spiedRetrievePlainDesc = spy(mockRetrieveImplPlainDesc);
      mockStripeSdk.instance.products.retrieve = spiedRetrievePlainDesc;

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceCreated(handlerContext, mockEventPlainDesc);

      assertEquals(result.success, true, 'Handler should succeed for product with plain string description');

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertArg: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertArg.name, 'Product Plain Description');
      assertExists(upsertArg.description, 'Plan description object should exist');
      const descPlain = parseDescriptionFromUpsert(upsertArg.description);
      assertEquals(descPlain.subtitle, 'This is a simple product subtitle.', 'Subtitle should be the plain string description');
      assertEquals(descPlain.features, [], 'Features should be empty when description is plain string');
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Ignores price_FREE event', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = buildPriceCreatedEvent(PRICE_FREE);

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assertEquals(result.transactionId, mockEvent.id);
      assertEquals(result.error, "Price 'price_FREE' event ignored as per specific rule.");

      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepInfoSpy, 2);
      const infoArg = stepSpies.stepInfoSpy.calls[1].args[0];
      assert(typeof infoArg === 'string' && infoArg.includes("Ignoring price.created event for 'price_FREE'"));

      assertSpyCalls(mockStripeSdk.stubs.productsRetrieve, 0);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy, 0);
      }

      assertSpyCalls(stepSpies.stepWarnSpy, 0);
      assertSpyCalls(stepSpies.stepErrorSpy, 0);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles missing product ID on price object', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = buildPriceCreatedEvent(buildPriceWithNullProduct());

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, false, "Handler should fail when product ID is an empty string.");
      assertEquals(result.error, "Product ID missing or invalid on price object.");

      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogCallArgsNullProd = stepSpies.stepErrorSpy.calls[0].args;
      assert(errorLogCallArgsNullProd.length > 0, "Error spy was called without arguments");
      const firstArgNullProd: unknown = errorLogCallArgsNullProd[0];
      assert(typeof firstArgNullProd === 'string', "Error spy first arg must be string");
      assert(firstArgNullProd.includes("Product ID is missing, not a string, or empty on price object. Found: null"),
        `Expected log to include specific message about empty product ID. Got: ${firstArgNullProd}`);

      const retrieveSpy = mockStripeSdk.stubs.productsRetrieve;
      if (retrieveSpy) {
        assertSpyCalls(retrieveSpy, 0);
      }

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy, 0);
      }

      assertSpyCalls(stepSpies.stepInfoSpy, 1); 
      assertSpyCalls(stepSpies.stepWarnSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles invalid unit_amount on price object', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = buildPriceCreatedEvent(PRICE_INVALID_AMOUNT);

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertEquals(result.transactionId, mockEvent.id);
      assertEquals(result.error, `Price ${PRICE_INVALID_AMOUNT.id} has invalid unit_amount. Cannot sync.`);

      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogCallArgs = stepSpies.stepErrorSpy.calls[0].args;
      assert(errorLogCallArgs.length > 0, "Error spy was called without arguments");
      const firstArgAmt: unknown = errorLogCallArgs[0];
      assert(typeof firstArgAmt === 'string', "Error spy first arg must be string");
      assert(firstArgAmt.includes(`Price ${PRICE_INVALID_AMOUNT.id} has null or undefined unit_amount`),
        `Expected log to include specific message about invalid unit_amount. Got: ${firstArgAmt}`);

      assertSpyCalls(mockStripeSdk.stubs.productsRetrieve, 0);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      if (plansBuilder) {
        const upsertSpy = plansBuilder.methodSpies['upsert'];
        assertSpyCalls(upsertSpy, 0);
      }

      assertSpyCalls(stepSpies.stepInfoSpy, 1);
      assertSpyCalls(stepSpies.stepWarnSpy, 0);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles non-numeric tokens_to_award metadata', async () => {
    let stepSpies: { stepInfoSpy: Spy; stepWarnSpy: Spy; stepErrorSpy: Spy } | null = null;
    let spiedCustomRetrieve: Spy<(...args: unknown[]) => Promise<Stripe.Response<Stripe.Product>>> | null = null;

    try {
      stepSpies = initializeTestContext({});
      const mockEvent = buildPriceCreatedEvent(INVALID_TOKENS_PRICE);
      const customRetrieveLogic = async (id: string): Promise<Stripe.Response<Stripe.Product>> => {
        if (id !== INVALID_TOKENS_PRODUCT.id) {
          throw new Error(`Custom mock retrieve logic called with unexpected ID: ${id}`);
        }
        return { ...INVALID_TOKENS_PRODUCT, lastResponse: mockLastResponseObject };
      };
      spiedCustomRetrieve = spy(customRetrieveLogic);
      mockStripeSdk.instance.products.retrieve = spiedCustomRetrieve; // Assign our spied local function
      
      mockSupabase.client.from('subscription_plans'); 

      const result = await handlePriceCreated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined);

      assertExists(stepSpies);
      assertSpyCalls(stepSpies.stepWarnSpy, 1);
      const warnArg: unknown = stepSpies.stepWarnSpy.calls[0].args[0];
      assert(typeof warnArg === 'string', "Warn spy first arg must be string");
      assert(warnArg.includes('Invalid non-numeric value for tokens_to_award metadata: "not-a-number"'));

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const upsertSpy = plansBuilder.methodSpies['upsert'];
      assertExists(upsertSpy);
      assertSpyCalls(upsertSpy, 1);
      const upsertData: TablesInsert<'subscription_plans'> = upsertSpy.calls[0].args[0];
      assertEquals(upsertData.tokens_to_award, undefined);

      assertExists(spiedCustomRetrieve);
      assertSpyCalls(spiedCustomRetrieve, 1); 
      assertSpyCalls(stepSpies.stepInfoSpy, 4); 
      assertSpyCalls(stepSpies.stepErrorSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });
});
