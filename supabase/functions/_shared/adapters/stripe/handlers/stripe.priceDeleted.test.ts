import { StripePaymentAdapter } from '../stripePaymentAdapter.ts';
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
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, ProductPriceHandlerContext } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { handlePriceDeleted } from './stripe.priceDeleted.ts';
import { logger, type Logger } from '../../../logger.ts';
import { ILogger, LogMetadata } from '../../../types.ts';

// Helper to create a more complete Stripe.Price object for the event payload
const createFullMockStripePrice = (priceId: string, isActive = false): Stripe.Price => ({
  id: priceId,
  object: 'price',
  active: isActive,
  billing_scheme: 'per_unit',
  created: Math.floor(Date.now() / 1000) - 3600,
  currency: 'usd',
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: `Mock Price ${priceId}`,
  product: `prod_mock_for_${priceId}`,
  recurring: null,
  tax_behavior: 'unspecified',
  tiers_mode: null,
  transform_quantity: null,
  type: 'one_time',
  unit_amount: 1000, // Default amount, e.g., $10.00
  unit_amount_decimal: '1000',
  // `deleted` is not a property of the Stripe.Price object itself in the event.data.object
  // The event type `price.deleted` signifies deletion.
});

// Helper to create a mock Stripe.Event for price.deleted
const createMockPriceDeletedEvent = (priceId: string): Stripe.Event => {
  const mockPricePayload = createFullMockStripePrice(priceId, false); // Price is typically inactive when deleted event is sent
  return {
    id: `evt_price_deleted_${priceId}`,
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: mockPricePayload, // The handler casts this to Stripe.Price
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'price.deleted',
  } as Stripe.Event;
};

Deno.test('handlePriceDeleted specific tests', async (t) => {
  let mockStripeSdk: MockStripe; 
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let handlerContext: ProductPriceHandlerContext;

  const PRICE_ID_DEFAULT = 'price_del_123';

  // Explicitly typed spy variables
  let stepInfoSpy: Spy<Logger, [message: string, metadata?: any], void>;
  let stepWarnSpy: Spy<Logger, [message: string, metadata?: any], void>;
  let stepErrorSpy: Spy<Logger, [message: string | Error, metadata?: any], void>;

  const initializeTestContext = (
    supabaseConfig: MockSupabaseDataConfig = {},
    options?: { skipInfoSpy?: boolean } // Option to skip spying on logger.info
  ) => {
    mockStripeSdk = createMockStripe(); 
    mockSupabase = createMockSupabaseClient(supabaseConfig);
    
    if (!options?.skipInfoSpy) {
      stepInfoSpy = spy(logger, 'info') as Spy<Logger, [message: string, metadata?: any], void>;
    } else {
      // Assign a spy to a dummy no-op function if we skip spying on the actual logger.info
      // This ensures stepInfoSpy is always a Spy object.
      const dummyObject = { noOp: () => {} };
      stepInfoSpy = spy(dummyObject, 'noOp') as unknown as Spy<Logger, [message: string, metadata?: any], void>;
    }
    stepWarnSpy = spy(logger, 'warn') as Spy<Logger, [message: string, metadata?: any], void>;
    stepErrorSpy = spy(logger, 'error') as Spy<Logger, [message: string | Error, metadata?: any], void>;

    handlerContext = {
      stripe: mockStripeSdk.instance,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient,
      logger: logger,
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test_secret_deleted_price_handler',
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
    if (mockStripeSdk && typeof mockStripeSdk.clearStubs === 'function') {
        mockStripeSdk.clearStubs();
    }
    spiesToRestore?.stepInfoSpy?.restore();
    spiesToRestore?.stepWarnSpy?.restore();
    spiesToRestore?.stepErrorSpy?.restore();
  };

  await t.step('Empty test step to ensure setup and teardown work', async () => {
    let stepSpiesObj = null;
    try {
      stepSpiesObj = initializeTestContext({});
      assertExists(handlerContext.supabaseClient);
      assertExists(handlerContext.logger);
      assertExists(stepSpiesObj.stepInfoSpy);
      assertExists(stepSpiesObj.stepWarnSpy);
      assertExists(stepSpiesObj.stepErrorSpy);
    } finally {
      teardownTestContext(stepSpiesObj);
    }
  });

  await t.step('Successfully deactivates a plan when a price is deleted', async () => {
    let stepSpies = null;
    try {
      const mockUpdatedPlan = { // Define what an updated plan might look like
        id: 'plan_id_123',
        stripe_price_id: PRICE_ID_DEFAULT,
        active: false,
        // ... other relevant fields
      };
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: { data: [mockUpdatedPlan], error: null, count: 1 }, // Simulate one record updated
          },
        },
      });
      const mockEvent = createMockPriceDeletedEvent(PRICE_ID_DEFAULT);

      // Prime the mock Supabase client for a successful update
      // This is now handled by the genericMockResults in initializeTestContext

      const result = await handlePriceDeleted(handlerContext, mockEvent);

      assertEquals(result.success, true);
      assert(result.error === undefined, `Expected no error, but got: ${result.error}`);

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      assertExists(plansBuilder);
      const updateSpy = plansBuilder.methodSpies['update'];
      const eqSpy = plansBuilder.methodSpies['eq'];
      
      assertSpyCalls(updateSpy, 1);
      const updateArg = updateSpy.calls[0].args[0] as { active: boolean; updated_at: string };
      assertEquals(updateArg.active, false);
      assertExists(updateArg.updated_at);

      assertSpyCalls(eqSpy, 1);
      assertEquals(eqSpy.calls[0].args[0], 'stripe_price_id');
      assertEquals(eqSpy.calls[0].args[1], PRICE_ID_DEFAULT);

      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial handling log + success log
      assert(stepSpies.stepInfoSpy.calls[1].args[0].includes('Successfully deactivated 1 subscription plan(s)')); // Check for 1
      const logMeta = stepSpies.stepInfoSpy.calls[1].args[1] as { deactivatedCount: number };
      assertEquals(logMeta.deactivatedCount, 1); // Explicitly check the count in metadata

      assertSpyCalls(stepSpies.stepWarnSpy, 0);
      assertSpyCalls(stepSpies.stepErrorSpy, 0);

    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Ignores price_FREE deletion event', async () => {
    let stepSpies = null;
    try {
      stepSpies = initializeTestContext({});
      const mockEventFree = createMockPriceDeletedEvent('price_FREE');

      const result = await handlePriceDeleted(handlerContext, mockEventFree);

      assertEquals(result.success, true);
      assert(result.error === "Price 'price_FREE' deletion event ignored.");

      const plansBuilder = mockSupabase.client.getLatestBuilder('subscription_plans');
      // Check that no builder was even created for 'subscription_plans' or if it was, no update/eq was called
      if (plansBuilder) {
        const updateSpy = plansBuilder.methodSpies['update'];
        const eqSpy = plansBuilder.methodSpies['eq'];
        assertSpyCalls(updateSpy, 0);
        assertSpyCalls(eqSpy, 0);
      }

      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial log + ignoring log
      assert(stepSpies.stepInfoSpy.calls[1].args[0].includes("Ignoring price.deleted event for 'price_FREE'"));
      assertSpyCalls(stepSpies.stepWarnSpy, 0);
      assertSpyCalls(stepSpies.stepErrorSpy, 0);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles Supabase update error gracefully', async () => {
    let stepSpies = null;
    try {
      const supabaseError = new Error('Supabase Test Error: Failed to update');
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: { data: null, error: supabaseError },
          },
        },
      });
      const mockEvent = createMockPriceDeletedEvent(PRICE_ID_DEFAULT);

      const result = await handlePriceDeleted(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error);
      assert(result.error.includes('Failed to deactivate plan for deleted price'));
      assert(result.error.includes(supabaseError.message));

      assertSpyCalls(stepSpies.stepInfoSpy, 1); // Initial handling log
      assertSpyCalls(stepSpies.stepErrorSpy, 1); // Supabase error log
      const errorLogArg = stepSpies.stepErrorSpy.calls[0].args[0];
      assert(typeof errorLogArg === 'string' && errorLogArg.includes('Error deactivating subscription_plan'));
      assertSpyCalls(stepSpies.stepWarnSpy, 0);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles non-existent stripe_price_id (plan not found) correctly', async () => {
    let stepSpies = null;
    try {
      // Configure Supabase mock to return empty array for the update, simulating no rows found
      stepSpies = initializeTestContext({
        genericMockResults: {
          subscription_plans: {
            update: { data: [], error: null, count: 0 }, // No matching record
          },
        },
      });
      const mockEventNonExistent = createMockPriceDeletedEvent('price_non_existent_123');

      const result = await handlePriceDeleted(handlerContext, mockEventNonExistent);

      assertEquals(result.success, true);
      assert(result.error === undefined, `Expected no error, but got: ${result.error}`);

      assertSpyCalls(stepSpies.stepInfoSpy, 2); // Initial log + success log (with 0 deactivated)
      assert(stepSpies.stepInfoSpy.calls[1].args[0].includes('Successfully deactivated 0 subscription plan(s)'));
      assertSpyCalls(stepSpies.stepWarnSpy, 0);
      assertSpyCalls(stepSpies.stepErrorSpy, 0);
    } finally {
      teardownTestContext(stepSpies);
    }
  });

  await t.step('Handles unexpected errors gracefully', async () => {
    let stepSpies = null;
    let infoStub: Spy<ILogger, [message: string, metadata?: LogMetadata | undefined], void> | null = null;
    const unexpectedErrorMessage = 'Unexpected logger error';

    try {
      stepSpies = initializeTestContext({}, { skipInfoSpy: true });
      const mockEvent = createMockPriceDeletedEvent(PRICE_ID_DEFAULT);

      infoStub = stub(handlerContext.logger, 'info', (
        _message: string, 
        _metadata?: LogMetadata | undefined
      ): void => {
        throw new Error(unexpectedErrorMessage);
      }) as Spy<ILogger, [message: string, metadata?: LogMetadata | undefined], void>;

      const result = await handlePriceDeleted(handlerContext, mockEvent);

      assertEquals(result.success, false);
      assertExists(result.error);
      assertEquals(result.error, `Unexpected error processing price.deleted: ${unexpectedErrorMessage}`);

      assertSpyCalls(stepSpies.stepErrorSpy, 1);
      const errorLogArg = stepSpies.stepErrorSpy.calls[0].args[0];
      const errorLogMeta = stepSpies.stepErrorSpy.calls[0].args[1] as { eventId: string, error: Error };
      assert(typeof errorLogArg === 'string' && errorLogArg.includes('Unexpected error:'));
      assertExists(errorLogMeta.error);
      assert(errorLogMeta.error.message.includes(unexpectedErrorMessage));
      assertEquals(errorLogMeta.eventId, mockEvent.id);

      // stepInfoSpy is now a spy on a no-op function, so it should have 0 calls.
      assertSpyCalls(stepSpies.stepInfoSpy, 0); 
      assertSpyCalls(stepSpies.stepWarnSpy, 0);

    } finally {
      infoStub?.restore();
      teardownTestContext(stepSpies);
    }
  });

});