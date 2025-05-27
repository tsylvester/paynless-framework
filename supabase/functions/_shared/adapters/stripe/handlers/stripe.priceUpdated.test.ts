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
  stub,
  type Spy,
  type Stub,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { createMockSupabaseClient } from '../../../supabase.mock.ts';
import { handlePriceUpdated } from './stripe.priceUpdated.ts';
import { logger, type Logger } from '../../../logger.ts';

// Helper to create a mock Stripe.Price object (similar to priceCreated)
const createMockStripePrice = (overrides: Partial<Stripe.Price> = {}): Stripe.Price => {
  return {
    id: overrides.id || 'price_updated_test123',
    object: 'price',
    active: overrides.active !== undefined ? overrides.active : true,
    billing_scheme: 'per_unit',
    created: Math.floor(Date.now() / 1000) - 10000, // Ensure created is in the past
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: overrides.metadata || {},
    nickname: overrides.nickname || null,
    product: overrides.product || 'prod_associated_testProduct123',
    recurring: overrides.recurring === undefined ? null : overrides.recurring,
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: overrides.type || (overrides.recurring ? 'recurring' : 'one_time'),
    unit_amount: typeof overrides.unit_amount === 'number' ? overrides.unit_amount : 1200,
    unit_amount_decimal: typeof overrides.unit_amount === 'number' ? String(overrides.unit_amount) : '1200',
    ...overrides,
  } as Stripe.Price;
};

// Helper to create a mock Stripe.Event for price.updated
const createMockPriceUpdatedEvent = (
  priceOverrides: Partial<Stripe.Price> = {},
  previousAttributes?: Partial<Stripe.Price> // For event.data.previous_attributes
): Stripe.Event => {
  const mockPrice = createMockStripePrice(priceOverrides);
  return {
    id: `evt_price_updated_${mockPrice.id}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: mockPrice as any,
      previous_attributes: previousAttributes as any,
    },
    livemode: mockPrice.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'price.updated',
  } as Stripe.Event;
};

Deno.test('handlePriceUpdated specific tests', async (t) => {
  let mockStripeSdk: MockStripe;
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;

  const PRODUCT_ID_DEFAULT = 'prod_default_for_update_test';
  const PRICE_ID_DEFAULT = 'price_default_for_update_test';

  // Spy variables, to be initialized per step
  let stepInfoSpy: Spy<Logger, [message: string, metadata?: any], void> | undefined;
  let stepWarnSpy: Spy<Logger, [message: string, metadata?: any], void> | undefined;
  let stepErrorSpy: Spy<Logger, [message: string | Error, metadata?: any], void> | undefined;

  const initializeTestContext = (supabaseConfig: any = {}) => {
    mockStripeSdk = createMockStripe();
    mockSupabase = createMockSupabaseClient(undefined, supabaseConfig);
    
    // Create fresh spies for logger methods for this step
    stepInfoSpy = spy(logger, 'info');
    stepWarnSpy = spy(logger, 'warn');
    stepErrorSpy = spy(logger, 'error');

    handlerContext = {
      stripe: mockStripeSdk.instance,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient,
      logger: logger, 
      functionsUrl: 'http://localhost:54321/functions/v1', // Mock URL
      stripeWebhookSecret: 'whsec_test_secret_updated', // Mock secret
    };
    return { stepInfoSpy, stepWarnSpy, stepErrorSpy };
  };

  const teardownTestContext = (
    spiesToRestore: {
      stepInfoSpy?: Spy<Logger, [message: string, metadata?: any], void>;
      stepWarnSpy?: Spy<Logger, [message: string, metadata?: any], void>;
      stepErrorSpy?: Spy<Logger, [message: string | Error, metadata?: any], void>;
    } | null
  ) => {
    if (mockStripeSdk) {
      mockStripeSdk.clearStubs();
    }

    spiesToRestore?.stepInfoSpy?.restore();
    spiesToRestore?.stepWarnSpy?.restore();
    spiesToRestore?.stepErrorSpy?.restore();
    stepInfoSpy = undefined;
    stepWarnSpy = undefined;
    stepErrorSpy = undefined;
  };

  await t.step('Empty test step to ensure setup and teardown work', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      assertExists(handlerContext.supabaseClient);
      assertExists(handlerContext.logger);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates plan to active: true', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceUpdatedEvent(
        { id: PRICE_ID_DEFAULT, active: true, product: PRODUCT_ID_DEFAULT },
        { active: false } // previous_attributes
      );

      mockSupabase.client.from('subscription_plans'); // Prime the builder

      const result = await handlePriceUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals(updateSpy.calls[0].args[0].active, true);
      assertExists(updateSpy.calls[0].args[0].updated_at, 'updated_at should be set');

      const eqSpy = plansBuilder.methodSpies['eq'];
      assertExists(eqSpy);
      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'stripe_price_id');
      assertEquals(eqSpy.calls[0].args[1], PRICE_ID_DEFAULT);

      assertSpyCalls(stepSpies.stepInfoSpy!, 2); // Initial handling log + success log
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates plan to active: false', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceUpdatedEvent(
        { id: PRICE_ID_DEFAULT, active: false, product: PRODUCT_ID_DEFAULT },
        { active: true } // previous_attributes
      );
      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals(updateSpy.calls[0].args[0].active, false);
      assertExists(updateSpy.calls[0].args[0].updated_at);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Ignores price_FREE updates', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventFree = createMockPriceUpdatedEvent({ id: 'price_FREE', active: true });
      const result = await handlePriceUpdated(handlerContext, mockEventFree);

      assertEquals(result.success, true);
      assert(result.error === "Price 'price_FREE' update event ignored.");
      
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      const updateSpy = plansBuilder?.methodSpies['update'];
      if (updateSpy) { // updateSpy might not exist if .from was never called
        assertSpyCalls(updateSpy, 0);
      }
      assertSpyCalls(stepSpies.stepInfoSpy!, 2); // Initial handling + specific ignore log
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles Supabase update error', async () => {
    let stepSpies = null;
    try {
      const dbError = new Error('DB update failed');
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ data: null, error: dbError, count: 0, status: 500, statusText: 'DB Error' })
          }
        }
      });
      const mockEvent = createMockPriceUpdatedEvent({ id: PRICE_ID_DEFAULT, active: true });
      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.includes('Failed to update plan status for price price_default_for_update_test: DB update failed'));
      assertSpyCalls(stepSpies.stepErrorSpy!, 1);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles non-existent stripe_price_id (no update occurs)', async () => {
    let stepSpies = null;
    try {
      // Mock Supabase to return empty array, simulating no rows matched the .eq filter
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
          }
        }
      });
      const mockEvent = createMockPriceUpdatedEvent({ id: 'price_does_not_exist', active: true });
      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true); // Handler considers this a success as DB operation itself didn't fail
      assert(result.error === undefined);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1); // Update is still attempted

      assertSpyCalls(stepSpies.stepInfoSpy!, 2); 
      // Check the log message for 0 updated plans
      const successLogCall = stepSpies.stepInfoSpy!.calls.find(call => call.args[0].includes('Successfully updated 0 subscription plan(s)'));
      assertExists(successLogCall, "Expected log message for 0 updated plans wasn't found.");
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates plan metadata', async () => {
    let stepSpies = null;
    try {
      const oldMetadata = { old_key: 'old_value' };
      const newMetadata = { new_key: 'new_value', existing_key: 'updated_value' };
      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceUpdatedEvent(
        { 
          id: PRICE_ID_DEFAULT, 
          active: true, 
          product: PRODUCT_ID_DEFAULT,
          metadata: newMetadata 
        },
        { metadata: oldMetadata } // previous_attributes
      );

      mockSupabase.client.from('subscription_plans'); // Prime the builder

      const result = await handlePriceUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals(updateSpy.calls[0].args[0].active, true); // Ensure active is still handled
      assertEquals(updateSpy.calls[0].args[0].metadata, newMetadata); // Check new metadata
      assertExists(updateSpy.calls[0].args[0].updated_at, 'updated_at should be set');

      const eqSpy = plansBuilder.methodSpies['eq'];
      assertExists(eqSpy);
      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'stripe_price_id');
      assertEquals(eqSpy.calls[0].args[1], PRICE_ID_DEFAULT);

      assertSpyCalls(stepSpies.stepInfoSpy!, 2); // Initial handling log + success log
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates multiple plan fields (nickname, currency, amount, tokens_to_award)', async () => {
    let stepSpies = null;
    try {
      const newNickname = 'pro-plan-monthly-v2';
      const newCurrency = 'eur';
      const newUnitAmount = 2500; // Represents 25.00 EUR
      const newTokensAwarded = 10000;

      stepSpies = initializeTestContext({});
      const mockEvent = createMockPriceUpdatedEvent(
        {
          id: PRICE_ID_DEFAULT,
          active: true,
          product: PRODUCT_ID_DEFAULT,
          nickname: newNickname,
          currency: newCurrency,
          unit_amount: newUnitAmount,
          metadata: { tokens_to_award: String(newTokensAwarded), other_meta: 'data' }
        },
        { 
          nickname: 'old-nickname',
          currency: 'usd',
          unit_amount: 1000,
          metadata: { tokens_to_award: '5000' }
        } // previous_attributes
      );

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEvent);

      assertEquals(result.success, true);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      
      const expectedUpdatePayload = {
        active: true,
        item_id_internal: newNickname,
        currency: newCurrency,
        amount: newUnitAmount, // 25.00
        tokens_to_award: newTokensAwarded,
        metadata: { tokens_to_award: String(newTokensAwarded), other_meta: 'data' }, // Ensure original metadata is preserved
        // updated_at will also be there, but its exact value is hard to assert, so we check its existence
      };
      assertExists(updateSpy.calls[0].args[0].updated_at);
      // Compare each key except updated_at
      for (const key in expectedUpdatePayload) {
        assertEquals((updateSpy.calls[0].args[0] as any)[key], (expectedUpdatePayload as any)[key], `Mismatch for key: ${key}`);
      }

      assertSpyCalls(stepSpies.stepInfoSpy!, 2); // Handler start + success log
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles invalid tokens_to_award metadata (non-numeric)', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventInvalidTokens = createMockPriceUpdatedEvent(
        {
          id: PRICE_ID_DEFAULT + '_invalid_tokens',
          active: true,
          product: PRODUCT_ID_DEFAULT,
          metadata: { tokens_to_award: 'not-a-number' }
        },
        { metadata: { tokens_to_award: '123' } } // Previous valid value
      );
      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEventInvalidTokens);

      assertEquals(result.success, true); // Handler succeeds, but logs a warning
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals(updateSpy.calls[0].args[0].tokens_to_award, null, 'tokens_to_award should be set to null due to invalid input');
      assertSpyCalls(stepSpies.stepWarnSpy!, 1); // Warning for invalid metadata
      assert(stepSpies.stepWarnSpy!.calls[0].args[0].includes('Invalid non-numeric value for tokens_to_award metadata'));
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles missing tokens_to_award metadata (should not clear existing)', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({}); // No specific DB mock for this, we check no tokens_to_award in payload
      const mockEventNoTokensMeta = createMockPriceUpdatedEvent(
        {
          id: PRICE_ID_DEFAULT + '_no_tokens_meta',
          active: true,
          product: PRODUCT_ID_DEFAULT,
          metadata: { other_data: 'some_value' } // No tokens_to_award here
        },
        { metadata: { tokens_to_award: '123' } } // Previous value was present
      );
      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEventNoTokensMeta);

      assertEquals(result.success, true);
      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      assertEquals(updateSpy.calls[0].args[0].tokens_to_award, undefined, 'tokens_to_award should be undefined in update payload');
      assertSpyCalls(stepSpies.stepWarnSpy!, 0); // No warning, as it's not invalid, just absent
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates plan_type to recurring and sets interval details', async () => {
    let stepSpies = null;
    try {
      const newInterval = 'year';
      const newIntervalCount = 1;
      const newPlanTypeStripe = 'recurring'; // price.type
      const expectedDbPlanType = 'subscription'; // subscription_plans.plan_type

      stepSpies = initializeTestContext({});
      const mockEventRecurring = createMockPriceUpdatedEvent(
        {
          id: PRICE_ID_DEFAULT + '_recurring_to',
          active: true,
          product: PRODUCT_ID_DEFAULT,
          type: newPlanTypeStripe,
          recurring: {
            interval: newInterval,
            interval_count: newIntervalCount,
            aggregate_usage: null,
            usage_type: 'licensed',
            trial_period_days: null,
            meter: null, 
          }
        },
        { 
          type: 'one_time',
          recurring: null 
        } // previous_attributes
      );

      mockSupabase.client.from('subscription_plans');
      const result = await handlePriceUpdated(handlerContext, mockEventRecurring);
      assertEquals(result.success, true);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1);
      
      const payload = updateSpy.calls[0].args[0];
      assertEquals(payload.plan_type, expectedDbPlanType);
      assertEquals(payload.interval, newInterval);
      assertEquals(payload.interval_count, newIntervalCount);
      assertExists(payload.updated_at);
      assertSpyCalls(stepSpies.stepInfoSpy!, 2); // Handler start + success log

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Updates plan_type from recurring to one-time and clears interval details', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventOneTime = createMockPriceUpdatedEvent(
        {
          id: PRICE_ID_DEFAULT + '_recurring_from',
          active: true,
          product: PRODUCT_ID_DEFAULT,
          type: 'one_time',
          recurring: null
        },
        { 
          type: 'recurring',
          recurring: { 
            interval: 'month', 
            interval_count: 1, 
            aggregate_usage: null, 
            usage_type: 'licensed', 
            trial_period_days: null,
            meter: null, 
          } 
        }
      );

      mockSupabase.client.from('subscription_plans'); // Ensure builder is primed for this step
      const resultOneTime = await handlePriceUpdated(handlerContext, mockEventOneTime);
      assertEquals(resultOneTime.success, true);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      assertExists(updateSpy);
      assertSpyCalls(updateSpy, 1); // Should be 1 for this step

      const payloadOneTime = updateSpy.calls[0].args[0];
      assertEquals(payloadOneTime.plan_type, 'one_time_purchase');
      assertEquals(payloadOneTime.interval, undefined); 
      assertEquals(payloadOneTime.interval_count, undefined);
      assertSpyCalls(stepSpies.stepInfoSpy!, 2); // Handler start + success log for this step

    } finally {
      teardownTestContext(stepSpies);
    }
  });

});