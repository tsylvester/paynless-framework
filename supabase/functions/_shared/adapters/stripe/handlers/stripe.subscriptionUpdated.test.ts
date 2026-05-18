import { handleCustomerSubscriptionUpdated } from './stripe.subscriptionUpdated.ts';
import { Database } from "../../../../types_db.ts";
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  type Spy,
} from 'jsr:@std/testing@0.225.1/mock';
import {
  createMockStripe,
  MockStripe,
  HandlerContext,
  createMockCustomerSubscriptionUpdatedEvent,
  createMockPrice,
  createMockSubscriptionItem,
} from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseClientSetup, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { createMockAdminTokenWalletService, MockAdminTokenWalletService } from '../../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { MockLogger } from '../../../logger.mock.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER'; // Define constant for free tier

Deno.test('[stripe.subscriptionUpdated.ts] Tests - handleCustomerSubscriptionUpdated', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let mockLogger: MockLogger;
  let mockStripe: MockStripe;
  let handlerContext: HandlerContext;
  let debugSpy: Spy<MockLogger, Parameters<MockLogger['debug']>, ReturnType<MockLogger['debug']>>;
  let infoSpy: Spy<MockLogger, Parameters<MockLogger['info']>, ReturnType<MockLogger['info']>>;
  let warnSpy: Spy<MockLogger, Parameters<MockLogger['warn']>, ReturnType<MockLogger['warn']>>;
  let errorSpy: Spy<MockLogger, Parameters<MockLogger['error']>, ReturnType<MockLogger['error']>>;

  const PLAN_PERIOD_START_SEC = 1000000000;
  const PLAN_PERIOD_END_SEC = 1000086400;
  const PLAN_PERIOD_START_ISO: string = new Date(PLAN_PERIOD_START_SEC * 1000).toISOString();
  const PLAN_PERIOD_END_ISO: string = new Date(PLAN_PERIOD_END_SEC * 1000).toISOString();

  const setup = (dbQueryResults?: {
    subscriptionPlans?: { id: string; stripe_price_id?: string, item_id_internal?: string }[] | null;
    subscriptionPlansSelectError?: Error;
    rpcResults?: MockSupabaseDataConfig['rpcResults'];
  }) => {
    mockLogger = new MockLogger();
    debugSpy = spy(mockLogger, 'debug');
    infoSpy = spy(mockLogger, 'info');
    warnSpy = spy(mockLogger, 'warn');
    errorSpy = spy(mockLogger, 'error');
    mockStripe = createMockStripe();
    mockTokenWalletService = createMockAdminTokenWalletService();

    const genericMockResults: MockSupabaseDataConfig['genericMockResults'] = {};
    
    if (dbQueryResults?.subscriptionPlans !== undefined || dbQueryResults?.subscriptionPlansSelectError) {
      genericMockResults['subscription_plans'] = {
        select: async (state) => {
          if (dbQueryResults?.subscriptionPlansSelectError) {
            return { data: null, error: dbQueryResults.subscriptionPlansSelectError, count: 0, status: 500, statusText: 'Error' };
          }
          const priceIdFilter = state.filters.find(f => f.column === 'stripe_price_id');
          const itemIdInternalFilter = state.filters.find(f => f.column === 'item_id_internal');

          if (dbQueryResults?.subscriptionPlans && priceIdFilter) {
            const foundPlan = dbQueryResults.subscriptionPlans.find(p => p.stripe_price_id === priceIdFilter.value);
            return { data: foundPlan ? [foundPlan] : [], error: null, count: foundPlan ? 1 : 0, status: 200, statusText: 'OK' };
          } else if (dbQueryResults?.subscriptionPlans && itemIdInternalFilter) {
            const foundPlan = dbQueryResults.subscriptionPlans.find(p => p.item_id_internal === itemIdInternalFilter.value);
            return { data: foundPlan ? [foundPlan] : [], error: null, count: foundPlan ? 1 : 0, status: 200, statusText: 'OK' };
          } else if (dbQueryResults.subscriptionPlans === null) {
             return { data: null, error: new Error('Mock Not found for subscription_plans'), count: 0, status: 404, statusText: 'Not Found' };
          }
          return { data: [], error: new Error('Mock: Subscription plan not found by general query'), count: 0, status: 404, statusText: 'Not Found' };
        }
      };
    }

    mockSupabaseSetup = createMockSupabaseClient(undefined, {
      genericMockResults,
      rpcResults: dbQueryResults?.rpcResults ?? {
        update_subscription_with_tier: {
          data: [
            {
              user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
              tier_level: 1,
              rows_updated: 1,
            },
          ],
          error: null,
        },
      },
    });
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    
    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockLogger,
      tokenWalletService: mockTokenWalletService.instance,
      stripe: mockStripe.instance,
      updatePaymentTransaction: spy(), // Mocked, not used by this handler directly
      featureFlags: {},
      functionsUrl: "http://localhost:54321/functions/v1",
      stripeWebhookSecret: "whsec_test_secret_subscription_updated", // Can be specific if needed
    };
  };

  await t.step("Successful update - status change to canceled and free plan linked", async () => {
    const stripeSubscriptionId = "sub_status_change_plan_linked";
    const stripeCustomerId = "cus_status_change_plan_linked";
    const stripePriceId = "price_for_plan_link";
    const freePlanInternalId = "plan_linked_123";
    const newStatus = "canceled";
    const eventId = "evt_successful_update_1";

    setup({
      subscriptionPlans: [{ id: freePlanInternalId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL, stripe_price_id: undefined }],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      { // Current subscription data in the event
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { // Previous attributes
        status: "active", 
      },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId); // Handler uses event.id as transactionId in this context

    // Verify logger calls
    assertSpyCalls(infoSpy, 3); // Initial processing + free plan switch + successful processing
    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(infoSpy.calls[1].args[0]).includes(`Subscription ${stripeSubscriptionId} canceled, setting plan to default free plan ID ${freePlanInternalId}`), "Free plan switch log missing or incorrect");
    assert(String(infoSpy.calls[2].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}`), "Success log wrong");

    // Verify Supabase calls
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['item_id_internal', FREE_TIER_ITEM_ID_INTERNAL]);
    assertSpyCalls(subPlansBuilder.methodSpies.single, 1);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: newStatus,
      p_plan_id: freePlanInternalId,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: false,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: false,
    });
  });

  await t.step("Successful update - plan not linked if Stripe Price ID not found", async () => {
    const stripeSubscriptionId = "sub_plan_not_found";
    const stripeCustomerId = "cus_plan_not_found";
    const nonExistentStripePriceId = "price_does_not_exist_in_plans_table";
    const newStatus = "active"; // Status can be anything for this test
    const eventId = "evt_plan_not_found_1";

    setup({
      subscriptionPlans: [], // No plans will match
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: nonExistentStripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" }, // Previous attributes
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success even if plan not found, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    assertSpyCalls(infoSpy, 2); // Initial processing + successful processing
    assertSpyCalls(warnSpy, 1); // For plan not found
    
    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(warnSpy.calls[0].args[0]).includes(`Plan not found for Stripe Price ID ${nonExistentStripePriceId}`), "Warning for plan not found is incorrect or missing");
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}`), "Success log wrong");

    // Verify Supabase calls
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['stripe_price_id', nonExistentStripePriceId]);
    assertSpyCalls(subPlansBuilder.methodSpies.single, 1);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: newStatus,
      p_plan_id: null,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: false,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: true,
    });
  });

  await t.step("No valid customer ID on subscription", async () => {
    const stripeSubscriptionId = "sub_no_customer_id";
    const eventId = "evt_no_customer_id_1";

    setup({}); // No specific DB results needed as it should exit early

    const event = createMockCustomerSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: undefined, // Invalid customer ID - use undefined
      },
      { status: "active" },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, "Expected success even with no customer ID");
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    assertSpyCalls(infoSpy, 1); // Only initial processing log
    assertSpyCalls(warnSpy, 1); // For the missing customer ID

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(warnSpy.calls[0].args[0]).includes(`Subscription ${stripeSubscriptionId} has no valid customer ID. Skipping.`), "Warning for no customer ID incorrect or missing");

    // Verify no DB calls were made
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(!subPlansBuilder?.methodSpies.select || subPlansBuilder.methodSpies.select.calls.length === 0, "subscription_plans.select should not have been called");
    
    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 0);
  });

  await t.step("No user_subscriptions record found to update", async () => {
    const stripeSubscriptionId = "sub_no_db_record_to_update";
    const stripeCustomerId = "cus_no_db_record";
    const stripePriceId = "price_for_no_db_record";
    const internalPlanId = "plan_no_db_record_123";
    const newStatus = "active";
    const eventId = "evt_no_db_record_1";

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
      rpcResults: {
        update_subscription_with_tier: {
          data: [{ user_id: null, tier_level: null, rows_updated: 0 }],
          error: null,
        },
      },
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, "Expected success even if no DB record found to update");
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    assertSpyCalls(infoSpy, 2); // Initial processing + successful processing log (even if count is 0)
    assertSpyCalls(warnSpy, 1); // For no user_subscription found

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(warnSpy.calls[0].args[0]).includes(`No user_subscription found with stripe_subscription_id ${stripeSubscriptionId} to update`), "Warning for no record found incorrect or missing");
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}. Updated records: 0`), "Success log with count 0 incorrect or missing");

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
  });

  await t.step("DB error during user_subscriptions update", async () => {
    const stripeSubscriptionId = "sub_db_error_update";
    const stripeCustomerId = "cus_db_error_update";
    const stripePriceId = "price_for_db_error";
    const internalPlanId = "plan_db_error_123";
    const newStatus = "active";
    const eventId = "evt_db_error_update_1";
    const dbErrorMessage = "Mock Supabase: Unique constraint violation";

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
      rpcResults: {
        update_subscription_with_tier: {
          data: null,
          error: new Error(dbErrorMessage),
        },
      },
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(!result.success, "Expected failure on DB update error");
    assertEquals(result.transactionId, eventId);
    assert(result.error !== undefined && result.error !== "", `Unexpected error message: ${result.error}`);

    // Verify logger calls
    assertSpyCalls(infoSpy, 1); // Initial processing log
    assertSpyCalls(errorSpy, 1); // For the RPC error

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
  });

  await t.step("DB error during subscription_plans lookup", async () => {
    const stripeSubscriptionId = "sub_plan_lookup_db_error";
    const stripeCustomerId = "cus_plan_lookup_db_error";
    const stripePriceId = "price_for_plan_db_error";
    const newStatus = "active";
    const eventId = "evt_plan_lookup_db_error_1";
    const dbErrorMessage = "Mock Supabase: Network error during plan lookup";

    setup({
      subscriptionPlansSelectError: new Error(dbErrorMessage), // Pass the error here
    });

    // Modify the specific mock behavior for this test case
    // This is a bit of a workaround due to the generic setup. Ideally, the setup would allow passing errors for each table.
    // const subPlansTableMock = handlerContext.supabaseClient.from('subscription_plans');
    // const selectStub = stub(subPlansTableMock, "select", async () => { // Stub the select method
    //     return { data: null, error: new Error(dbErrorMessage), count: 0, status: 500, statusText: 'Error' } as any;
    // });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(!result.success, "Expected failure on plan lookup DB error");
    assertEquals(result.transactionId, eventId);
    assert(result.error?.includes(`DB error looking up plan: ${dbErrorMessage}`), `Unexpected error message: ${result.error}`);

    // Verify logger calls
    assertSpyCalls(infoSpy, 1); // Initial processing log
    assertSpyCalls(errorSpy, 1); // For the plan lookup DB error

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(errorSpy.calls[0].args[0]).includes(`DB error looking up plan for Stripe Price ID ${stripePriceId}`), "Error log for plan lookup DB error incorrect or missing");
    assert(errorSpy.calls[0].args[1] !== undefined, "Error metadata missing");

    // Verify Supabase select on subscription_plans was attempted
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder should have been called.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1); 
    // assertSpyCalls(selectStub, 1); // Verify our specific stub was called. No longer needed.

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 0);
    
    // selectStub.restore(); // No longer needed
  });

  await t.step("Plan change - successfully updates to new known plan", async () => {
    const stripeSubscriptionId = "sub_plan_changed_known";
    const stripeCustomerId = "cus_plan_changed_known";
    const oldStripePriceId = "price_old_plan";
    const newStripePriceId = "price_new_plan_premium";
    const newInternalPlanId = "plan_premium_789";
    const newStatus = "active"; // e.g., status remains active through plan change
    const eventId = "evt_plan_change_known_1";

    setup({
      subscriptionPlans: [{ id: newInternalPlanId, stripe_price_id: newStripePriceId }],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      { // Current subscription data reflecting the NEW plan
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: newStripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { // Previous attributes indicating the OLD plan (for conceptual clarity in test naming)
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: oldStripePriceId }),
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success for plan change, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(infoSpy, 2);
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}`), "Success log wrong");

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: newStatus,
      p_plan_id: newInternalPlanId,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: false,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: true,
    });
  });

  await t.step("Update with cancel_at_period_end true - plan_id remains active plan", async () => {
    const stripeSubscriptionId = "sub_cancel_at_period_end";
    const stripeCustomerId = "cus_cancel_at_period_end";
    const currentStripePriceId = "price_active_ending_plan";
    const currentInternalPlanId = "plan_active_ending_789";
    const eventId = "evt_cancel_at_period_end_true";

    setup({
      subscriptionPlans: [{ id: currentInternalPlanId, stripe_price_id: currentStripePriceId }],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: 'active', // Status is still active
        cancel_at_period_end: true, // This is the key change
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: currentStripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { // Previous attributes
        cancel_at_period_end: false, // Was false before
      },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    assertSpyCalls(infoSpy, 2); // Initial processing + successful processing

    // Verify Supabase calls
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['stripe_price_id', currentStripePriceId]);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: 'active',
      p_plan_id: currentInternalPlanId,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: true,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: true,
    });
  });

  await t.step("Subscription status becomes 'canceled' - switches to internal free plan", async () => {
    const stripeSubscriptionId = "sub_status_canceled_free_plan";
    const stripeCustomerId = "cus_status_canceled_free_plan";
    const oldStripePriceId = "price_paid_plan_that_was_canceled"; // The plan that was active
    const freePlanInternalId = "free_plan_uuid_123";
    const eventId = "evt_status_canceled_1";

    setup({
      subscriptionPlans: [
        { id: freePlanInternalId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL, stripe_price_id: undefined }, // The free plan
        // We don't strictly need the oldStripePriceId mapped here as the logic should bypass it for 'canceled' status.
      ],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: 'canceled', // Key: status is now canceled
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: oldStripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { // Previous attributes
        status: "active",
      },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    assertSpyCalls(infoSpy, 3); // Initial processing + "switching to free plan" + successful processing
    assert(String(infoSpy.calls[1].args[0]).includes(`Subscription ${stripeSubscriptionId} canceled, setting plan to default free plan ID ${freePlanInternalId}`), "Free plan switch log missing or incorrect");


    // Verify Supabase calls
    // 1. Attempt to lookup free plan by item_id_internal
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1); // For free plan lookup
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['item_id_internal', FREE_TIER_ITEM_ID_INTERNAL]);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: 'canceled',
      p_plan_id: freePlanInternalId,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: false,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: false,
    });
  });

  await t.step("subscription status changes to active → RPC update_subscription_with_tier with p_set_ratchet true", async () => {
    const stripeSubscriptionId = "sub_rpc_contract_active";
    const stripeCustomerId = "cus_rpc_contract_active";
    const stripePriceId = "price_rpc_contract_active";
    const internalPlanId = "plan_rpc_contract_active";
    const eventId = "evt_rpc_contract_active";

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "active",
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    await handleCustomerSubscriptionUpdated(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "update_subscription_with_tier");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: "active",
      p_plan_id: internalPlanId,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: false,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: true,
    });
  });

  await t.step("subscription status changes to canceled → RPC with free plan and p_set_ratchet false", async () => {
    const stripeSubscriptionId = "sub_rpc_contract_canceled";
    const stripeCustomerId = "cus_rpc_contract_canceled";
    const oldStripePriceId = "price_rpc_contract_canceled_old";
    const freePlanInternalId = "free_plan_rpc_contract_canceled";
    const eventId = "evt_rpc_contract_canceled";

    setup({
      subscriptionPlans: [
        { id: freePlanInternalId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL, stripe_price_id: undefined },
      ],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "canceled",
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: oldStripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    await handleCustomerSubscriptionUpdated(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "update_subscription_with_tier");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: "canceled",
      p_plan_id: freePlanInternalId,
      p_period_start: PLAN_PERIOD_START_ISO,
      p_period_end: PLAN_PERIOD_END_ISO,
      p_cancel_at_period_end: false,
      p_stripe_customer_id: stripeCustomerId,
      p_set_ratchet: false,
    });
  });

  await t.step("p_set_ratchet derivation: status active → RPC p_set_ratchet true", async () => {
    const stripeSubscriptionId = "sub_p_set_ratchet_active";
    const stripeCustomerId = "cus_p_set_ratchet_active";
    const stripePriceId = "price_p_set_ratchet_active";
    const internalPlanId = "plan_p_set_ratchet_active";
    const eventId = "evt_p_set_ratchet_active";

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "active",
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    await handleCustomerSubscriptionUpdated(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "update_subscription_with_tier");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1].p_set_ratchet, true);
  });

  await t.step("p_set_ratchet derivation: status canceled → RPC p_set_ratchet false", async () => {
    const stripeSubscriptionId = "sub_p_set_ratchet_canceled";
    const stripeCustomerId = "cus_p_set_ratchet_canceled";
    const oldStripePriceId = "price_p_set_ratchet_canceled_old";
    const freePlanInternalId = "free_plan_p_set_ratchet_canceled";
    const eventId = "evt_p_set_ratchet_canceled";

    setup({
      subscriptionPlans: [
        { id: freePlanInternalId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL, stripe_price_id: undefined },
      ],
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "canceled",
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: oldStripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    await handleCustomerSubscriptionUpdated(handlerContext, event);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], "update_subscription_with_tier");
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1].p_set_ratchet, false);
  });

  await t.step("RPC returns error → handler returns { success: false }", async () => {
    const stripeSubscriptionId = "sub_rpc_returns_error";
    const stripeCustomerId = "cus_rpc_returns_error";
    const stripePriceId = "price_rpc_returns_error";
    const internalPlanId = "plan_rpc_returns_error";
    const eventId = "evt_rpc_returns_error";
    const rpcErr: Error = new Error("update_subscription_with_tier failed");

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
      rpcResults: {
        update_subscription_with_tier: { data: null, error: rpcErr },
      },
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "active",
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "active" },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assertEquals(result.success, false);
  });

  await t.step("RPC returns tier_level and rows_updated → handler logs and returns success", async () => {
    const stripeSubscriptionId = "sub_rpc_tier_rows_success";
    const stripeCustomerId = "cus_rpc_tier_rows_success";
    const stripePriceId = "price_rpc_tier_rows_success";
    const internalPlanId = "plan_rpc_tier_rows_success";
    const eventId = "evt_rpc_tier_rows_success";
    const tierLevelReturned = 918273645;
    const rowsUpdatedReturned = 1;

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
      rpcResults: {
        update_subscription_with_tier: {
          data: [
            {
              user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              tier_level: tierLevelReturned,
              rows_updated: rowsUpdatedReturned,
            },
          ],
          error: null,
        },
      },
    });

    const event = createMockCustomerSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "active",
        items: {
          object: 'list',
          data: [createMockSubscriptionItem({
            subscription: stripeSubscriptionId,
            price: createMockPrice({ id: stripePriceId }),
            current_period_start: PLAN_PERIOD_START_SEC,
            current_period_end: PLAN_PERIOD_END_SEC,
          })],
          has_more: false,
          url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
        },
      },
      { status: "canceled" },
      { id: eventId }
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assertEquals(result.success, true);
    assert(
      infoSpy.calls.some((c) => String(c.args[0]).includes(String(tierLevelReturned))),
      "expected info log to include tier_level from RPC result",
    );
  });

});