import { handleCustomerSubscriptionDeleted } from './stripe.subscriptionDeleted.ts';
import type { MockSupabaseClientSetup, MockSupabaseDataConfig } from "../../../supabase.mock.ts";
import { Database } from "../../../../types_db.ts";
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  type Spy,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe, HandlerContext } from '../../../stripe.mock.ts';
import { createMockSupabaseClient } from '../../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';
import type { ILogger, LogMetadata } from '../../../types.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER'; // Define constant for free tier

// Helper to create a mock Stripe.CustomerSubscriptionDeletedEvent
const createMockSubscriptionDeletedEvent = (
  subscriptionData: Partial<Stripe.Subscription>,
  id = `evt_sub_deleted_${Date.now()}`
): Stripe.CustomerSubscriptionDeletedEvent => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    object: "event",
    api_version: "2020-08-27",
    created: now,
    data: {
      object: {
        id: `sub_test_deleted_${Date.now()}`,
        object: "subscription",
        status: "active", // This status is prior to deletion; the event signifies it's now deleted/canceled.
        customer: `cus_test_deleted_${Date.now()}`,
        current_period_start: now - (30 * 24 * 60 * 60),
        current_period_end: now + (30 * 24 * 60 * 60),
        cancel_at_period_end: false,
        items: { data: [] } as any, // Items not strictly necessary for delete logic
        ...subscriptionData,
      } as Stripe.Subscription,
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: `req_test_deleted_${Date.now()}`, idempotency_key: null },
    type: "customer.subscription.deleted",
  } as Stripe.CustomerSubscriptionDeletedEvent;
};

// Mock Logger
const createMockLoggerInternal = (): ILogger => {
    return {
        debug: spy((_message: string, _metadata?: LogMetadata) => {}),
        info: spy((_message: string, _metadata?: LogMetadata) => {}),
        warn: spy((_message: string, _metadata?: LogMetadata) => {}),
        error: spy((_message: string | Error, _metadata?: LogMetadata) => {}),
    };
};

Deno.test('[stripe.subscriptionDeleted.ts] Tests - handleCustomerSubscriptionDeleted', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockTokenWalletService;
  let mockLogger: ILogger;
  let mockStripeInstance: MockStripe['instance'];
  let handlerContext: HandlerContext;

  const setup = (dbQueryResults?: { 
    subscriptionPlans?: { id: string; item_id_internal?: string }[] | null; // For free plan lookup
    subscriptionPlansSelectError?: Error | null;
    userSubscriptionsUpdateCount?: number;
    userSubscriptionsUpdateError?: Error | null;
  }) => {
    mockLogger = createMockLoggerInternal();
    mockTokenWalletService = createMockTokenWalletService();
    mockStripeInstance = createMockStripe().instance;

    const genericMockResults: MockSupabaseDataConfig['genericMockResults'] = {};

    if (dbQueryResults?.subscriptionPlans !== undefined || dbQueryResults?.subscriptionPlansSelectError) {
      genericMockResults['subscription_plans'] = {
        select: async (state) => {
          if (dbQueryResults?.subscriptionPlansSelectError) {
            return { data: null, error: dbQueryResults.subscriptionPlansSelectError, count: 0, status: 500, statusText: 'Error' };
          }
          const itemIdInternalFilter = state.filters.find(f => f.column === 'item_id_internal');
          if (dbQueryResults?.subscriptionPlans && itemIdInternalFilter) {
            const foundPlan = dbQueryResults.subscriptionPlans.find(p => p.item_id_internal === itemIdInternalFilter.value);
            //.single() will add PGRST116 if not found, so mimic that by returning null data if !foundPlan
            return { data: foundPlan ? [foundPlan] : null, error: null, count: foundPlan ? 1 : 0, status: 200, statusText: 'OK' }; 
          }
          // Fallback if filters don't match expected pattern or no specific data for subscription_plans provided
          return { data: [], error: new Error('Mock for subscription_plans select not adequately configured for this call'), count: 0, status: 400, statusText: 'Bad Request' };
        }
      };
    }

    genericMockResults['user_subscriptions'] = {
      update: async (_state: any) => {
        if (dbQueryResults?.userSubscriptionsUpdateError) {
          return { data: null, error: dbQueryResults.userSubscriptionsUpdateError, count: 0, status: 500, statusText: 'Error' };
        }
        return { data: [{}], error: null, count: dbQueryResults?.userSubscriptionsUpdateCount ?? 1, status: 200, statusText: 'OK' };
      }
    };

    mockSupabaseSetup = createMockSupabaseClient(undefined, { genericMockResults });
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    
    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockLogger,
      tokenWalletService: mockTokenWalletService.instance,
      stripe: mockStripeInstance,
      updatePaymentTransaction: spy() as any,
      featureFlags: {},
      functionsUrl: "http://localhost:54321/functions/v1",
      stripeWebhookSecret: "whsec_test_secret_subscription_deleted",
    };
  };

  await t.step("Successful update - status becomes 'DELETED' and plan set to free tier", async () => {
    const stripeSubscriptionId = "sub_deleted_successfully";
    const eventId = "evt_deleted_successfully_1";
    const expectedStatus = "canceled";
    const freePlanId = "plan_free_tier_uuid";

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
      userSubscriptionsUpdateCount: 1
    });

    const event = createMockSubscriptionDeletedEvent(
      { // Data for the subscription object within the event
        id: stripeSubscriptionId,
        status: "active", // The status on the subscription object in a .deleted event is usually the one *before* deletion.
        cancel_at_period_end: false,
      },
      eventId
    );

    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 3); // Initial processing + Found free plan ID + Successfully processed
    assert(String(infoSpy.calls[0].args[0]).includes(`Processing deleted subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(infoSpy.calls[1].args[0]).includes(`Found free plan ID ${freePlanId} for subscription ${stripeSubscriptionId}`), "Found free plan log wrong");
    assert(String(infoSpy.calls[2].args[0]).includes(`Successfully processed delete event for subscription ${stripeSubscriptionId}. Marked as ${expectedStatus}. Updated records: 1`), "Success log wrong");

    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used for free plan lookup.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['item_id_internal', FREE_TIER_ITEM_ID_INTERNAL]);
    assertSpyCalls(subPlansBuilder.methodSpies.single, 1);

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    assertSpyCalls(userSubsBuilder.methodSpies.eq, 1);
    assertEquals(userSubsBuilder.methodSpies.eq.calls[0].args, ['stripe_subscription_id', stripeSubscriptionId]);

    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, expectedStatus, "Status not updated to DELETED");
    assertEquals(updateCallArgs.cancel_at_period_end, false, "cancel_at_period_end not updated correctly");
    assertEquals(updateCallArgs.plan_id, freePlanId, "plan_id not set to free tier ID");
    assert(updateCallArgs.updated_at, "updated_at should be set");
  });

  await t.step("Free plan lookup - DB error", async () => {
    const stripeSubscriptionId = "sub_deleted_free_plan_db_error";
    const eventId = "evt_deleted_free_plan_db_error_1";
    const dbErrorMessage = "Mock Supabase: Network error during free plan lookup";

    setup({
      subscriptionPlansSelectError: new Error(dbErrorMessage),
      userSubscriptionsUpdateCount: 1, // Still expect user_sub update attempt
    });

    const event = createMockSubscriptionDeletedEvent({ id: stripeSubscriptionId }, eventId);
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, "Expected success even if free plan lookup errors, as main update should still proceed.");
    assertEquals(result.transactionId, eventId);

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1);
    assert(String(errorSpy.calls[0].args[0]).includes(`DB error looking up free plan for ${stripeSubscriptionId}`), "Error log for free plan lookup DB error incorrect or missing");
    assertEquals((errorSpy.calls[0].args[1] as any)?.error?.message, dbErrorMessage);

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder should still be used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.plan_id, undefined, "plan_id should be undefined as free plan lookup failed");
    assertEquals(updateCallArgs.status, "canceled");
  });

  await t.step("Free plan lookup - plan not found", async () => {
    const stripeSubscriptionId = "sub_deleted_free_plan_not_found";
    const eventId = "evt_deleted_free_plan_not_found_1";

    setup({
      subscriptionPlans: [], // No free plan configured in mock DB
      userSubscriptionsUpdateCount: 1, // Still expect user_sub update attempt
    });

    const event = createMockSubscriptionDeletedEvent({ id: stripeSubscriptionId }, eventId);
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, "Expected success even if free plan not found, as main update should still proceed.");
    assertEquals(result.transactionId, eventId);

    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    assertSpyCalls(warnSpy, 1);
    assert(String(warnSpy.calls[0].args[0]).includes(`Internal free plan with item_id_internal ${FREE_TIER_ITEM_ID_INTERNAL} not found`), "Warning for free plan not found incorrect or missing");

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder should still be used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.plan_id, undefined, "plan_id should be undefined as free plan was not found");
    assertEquals(updateCallArgs.status, "canceled");
  });

  await t.step("user_subscriptions update - DB error", async () => {
    const stripeSubscriptionId = "sub_deleted_user_sub_update_error";
    const eventId = "evt_deleted_user_sub_update_error_1";
    const dbErrorMessage = "Mock Supabase: Unique constraint violation on user_subscriptions update";
    const freePlanId = "plan_free_tier_uuid_for_us_error";

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
      userSubscriptionsUpdateError: new Error(dbErrorMessage),
    });

    const event = createMockSubscriptionDeletedEvent({ id: stripeSubscriptionId }, eventId);
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(!result.success, "Expected failure on user_subscriptions update DB error");
    assertEquals(result.transactionId, eventId);
    assert(result.error?.includes(`DB error updating subscription: ${dbErrorMessage}`), `Unexpected error message: ${result.error}`);

    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(errorSpy, 1);
    assert(String(errorSpy.calls[0].args[0]).includes(`Error updating user_subscription ${stripeSubscriptionId} to status canceled`), "Error log for user_subscriptions update incorrect or missing");
    assertEquals((errorSpy.calls[0].args[1] as any)?.error?.message, dbErrorMessage);
  });

  await t.step("user_subscriptions update - no record found to update", async () => {
    const stripeSubscriptionId = "sub_deleted_no_user_sub_record";
    const eventId = "evt_deleted_no_user_sub_record_1";
    const freePlanId = "plan_free_tier_uuid_for_no_us_record";

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
      userSubscriptionsUpdateCount: 0, // Simulate no rows affected
    });

    const event = createMockSubscriptionDeletedEvent({ id: stripeSubscriptionId }, eventId);
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, "Expected success even if no user_subscription record was found to update");
    assertEquals(result.transactionId, eventId);

    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    assertSpyCalls(warnSpy, 1);
    assert(String(warnSpy.calls[0].args[0]).includes(`No user_subscription found with stripe_subscription_id ${stripeSubscriptionId} to mark as canceled`), "Warning for no user_subscription record incorrect or missing");

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder should still be used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
  });

  // More tests here
});