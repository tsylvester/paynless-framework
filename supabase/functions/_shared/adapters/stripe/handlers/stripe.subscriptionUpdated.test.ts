import { handleCustomerSubscriptionUpdated } from './stripe.subscriptionUpdated.ts';
import type { HandlerContext, PaymentTransaction } from "../types.ts"; // Assuming PaymentTransaction might not be directly used, but HandlerContext is.
import type { ILogger, LogMetadata, MockSupabaseClientSetup } from "../../../types.ts";
import { Database } from "../../../../types_db.ts";
import type { ITokenWalletService } from '../../../types/tokenWallet.types.ts'; // Not directly used by this handler but part of context
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import type { PaymentConfirmation } from '../../../types/payment.types.ts';
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSpyCalls,
  spy,
  stub,
  type Stub,
  type Spy,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER'; // Define constant for free tier

// Helper to create a mock Stripe.CustomerSubscriptionUpdatedEvent
const createMockSubscriptionUpdatedEvent = (
  subscriptionData: Partial<Stripe.Subscription>,
  previousAttributes?: Partial<Stripe.Subscription>,
  id = `evt_sub_updated_${Date.now()}`
): Stripe.CustomerSubscriptionUpdatedEvent => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    object: "event",
    api_version: "2020-08-27",
    created: now,
    data: {
      object: {
        id: `sub_test_${Date.now()}`,
        object: "subscription",
        status: "active",
        customer: `cus_test_${Date.now()}`,
        current_period_start: now - (30 * 24 * 60 * 60), // 30 days ago
        current_period_end: now + (30 * 24 * 60 * 60),   // 30 days from now
        cancel_at_period_end: false,
        items: {
          object: 'list',
          data: [{
            id: `si_test_${Date.now()}`,
            object: 'subscription_item',
            price: { id: `price_test_${Date.now()}`, object: 'price', active: true, currency: 'usd', product: `prod_test_${Date.now()}` } as Stripe.Price,
            quantity: 1,
          } as Stripe.SubscriptionItem],
          has_more: false,
          url: `/v1/subscription_items?subscription=sub_test_${Date.now()}`,
        },
        ...subscriptionData,
      } as Stripe.Subscription,
      previous_attributes: previousAttributes,
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: `req_test_${Date.now()}`, idempotency_key: null },
    type: "customer.subscription.updated",
  } as Stripe.CustomerSubscriptionUpdatedEvent;
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

Deno.test('[stripe.subscriptionUpdated.ts] Tests - handleCustomerSubscriptionUpdated', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockTokenWalletService; // Though not directly used by handler, it's part of context
  let mockLogger: ILogger;
  let mockStripeInstance: MockStripe['instance']; // Keep stripe instance for context if needed by other parts
  let handlerContext: HandlerContext;

  const setup = (dbQueryResults?: { 
    subscriptionPlans?: { id: string; stripe_price_id?: string, item_id_internal?: string }[] | null;
    subscriptionPlansSelectError?: Error;
    userSubscriptionsUpdateCount?: number;
    userSubscriptionsUpdateError?: Error | null;
  }) => {
    mockLogger = createMockLoggerInternal();
    mockTokenWalletService = createMockTokenWalletService(); // For HandlerContext
    mockStripeInstance = createMockStripe().instance; // For HandlerContext

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

    genericMockResults['user_subscriptions'] = {
      update: async (_state) => {
        if (dbQueryResults?.userSubscriptionsUpdateError) {
          return { data: null, error: dbQueryResults.userSubscriptionsUpdateError, count: 0, status: 500, statusText: 'Error' };
        }
        return { data: [{}], error: null, count: dbQueryResults?.userSubscriptionsUpdateCount ?? 1, status: 200, statusText: 'OK' };
      }
    };

    mockSupabaseSetup = createMockSupabaseClient({ genericMockResults });
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    
    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockLogger,
      tokenWalletService: mockTokenWalletService,
      stripe: mockStripeInstance, // Pass the actual Stripe SDK instance
      updatePaymentTransaction: spy() as any, // Mocked as it's not used by this handler directly
      featureFlags: {},
      functionsUrl: "http://localhost:54321/functions/v1",
      stripeWebhookSecret: "whsec_test_secret_subscription_updated", // Can be specific if needed
    };
  };

  await t.step("Successful update - status change and plan linked", async () => {
    const stripeSubscriptionId = "sub_status_change_plan_linked";
    const stripeCustomerId = "cus_status_change_plan_linked";
    const stripePriceId = "price_for_plan_link";
    const internalPlanId = "plan_linked_123";
    const newStatus = "past_due";
    const eventId = "evt_successful_update_1";

    setup({
      subscriptionPlans: [{ id: internalPlanId, stripe_price_id: stripePriceId }],
      userSubscriptionsUpdateCount: 1,
    });

    const event = createMockSubscriptionUpdatedEvent(
      { // Current subscription data in the event
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: stripePriceId } }] } as any, // Ensure items.data[0].price.id is set
      },
      { // Previous attributes
        status: "active", 
      },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId); // Handler uses event.id as transactionId in this context

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 2); // Initial processing + successful processing
    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}`), "Success log wrong");


    // Verify Supabase calls
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['stripe_price_id', stripePriceId]);
    assertSpyCalls(subPlansBuilder.methodSpies.single, 1);
    
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    assertSpyCalls(userSubsBuilder.methodSpies.eq, 1); // For the .eq('stripe_subscription_id', ...)
    assertEquals(userSubsBuilder.methodSpies.eq.calls[0].args, ['stripe_subscription_id', stripeSubscriptionId]);

    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, newStatus, "Status not updated correctly");
    assertEquals(updateCallArgs.plan_id, internalPlanId, "plan_id not linked correctly");
    assertEquals(updateCallArgs.stripe_customer_id, stripeCustomerId, "Stripe customer ID not updated");
    assert(updateCallArgs.updated_at, "updated_at should be set");
  });

  await t.step("Successful update - plan not linked if Stripe Price ID not found", async () => {
    const stripeSubscriptionId = "sub_plan_not_found";
    const stripeCustomerId = "cus_plan_not_found";
    const nonExistentStripePriceId = "price_does_not_exist_in_plans_table";
    const newStatus = "active"; // Status can be anything for this test
    const eventId = "evt_plan_not_found_1";

    setup({
      subscriptionPlans: [], // No plans will match
      userSubscriptionsUpdateCount: 1,
    });

    const event = createMockSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: nonExistentStripePriceId } }] } as any,
      },
      { status: "trialing" }, // Previous attributes
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success even if plan not found, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
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
    
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    assertSpyCalls(userSubsBuilder.methodSpies.eq, 1);
    assertEquals(userSubsBuilder.methodSpies.eq.calls[0].args, ['stripe_subscription_id', stripeSubscriptionId]);

    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, newStatus, "Status not updated correctly");
    assertEquals(updateCallArgs.plan_id, undefined, "plan_id should be undefined as it was not found");
    assertEquals(updateCallArgs.stripe_customer_id, stripeCustomerId, "Stripe customer ID not updated");
    assert(updateCallArgs.updated_at, "updated_at should be set");
  });

  await t.step("No valid customer ID on subscription", async () => {
    const stripeSubscriptionId = "sub_no_customer_id";
    const eventId = "evt_no_customer_id_1";

    setup({}); // No specific DB results needed as it should exit early

    const event = createMockSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: undefined, // Invalid customer ID - use undefined
      },
      { status: "active" },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, "Expected success even with no customer ID");
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 1); // Only initial processing log
    assertSpyCalls(warnSpy, 1); // For the missing customer ID

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(warnSpy.calls[0].args[0]).includes(`Subscription ${stripeSubscriptionId} has no valid customer ID. Skipping.`), "Warning for no customer ID incorrect or missing");

    // Verify no DB calls were made
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(!subPlansBuilder?.methodSpies.select || subPlansBuilder.methodSpies.select.calls.length === 0, "subscription_plans.select should not have been called");
    
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(!userSubsBuilder?.methodSpies.update || userSubsBuilder.methodSpies.update.calls.length === 0, "user_subscriptions.update should not have been called");
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
      userSubscriptionsUpdateCount: 0, // Simulate no rows affected by update
    });

    const event = createMockSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: stripePriceId } }] } as any,
      },
      { status: "trialing" },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, "Expected success even if no DB record found to update");
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    const warnSpy = mockLogger.warn as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 2); // Initial processing + successful processing log (even if count is 0)
    assertSpyCalls(warnSpy, 1); // For no user_subscription found

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(warnSpy.calls[0].args[0]).includes(`No user_subscription found with stripe_subscription_id ${stripeSubscriptionId} to update`), "Warning for no record found incorrect or missing");
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}. Updated records: 0`), "Success log with count 0 incorrect or missing");

    // Verify Supabase calls (update is still attempted)
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    assertEquals(userSubsBuilder.methodSpies.update.calls[0].args[0].status, newStatus);
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
      userSubscriptionsUpdateError: new Error(dbErrorMessage),
    });

    const event = createMockSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: stripePriceId } }] } as any,
      },
      { status: "trialing" },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(!result.success, "Expected failure on DB update error");
    assertEquals(result.transactionId, eventId);
    assert(result.error?.includes(`DB error updating subscription: ${dbErrorMessage}`), `Unexpected error message: ${result.error}`);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 1); // Initial processing log
    assertSpyCalls(errorSpy, 1); // For the DB update error

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(errorSpy.calls[0].args[0]).includes(`Error updating user_subscription ${stripeSubscriptionId}`), "Error log for DB update incorrect or missing");
    assertEquals((errorSpy.calls[0].args[1] as any)?.error?.message, dbErrorMessage, "Error details in log incorrect");

    // Verify Supabase update was attempted
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
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

    const event = createMockSubscriptionUpdatedEvent(
      {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: stripePriceId } }] } as any,
      },
      { status: "trialing" },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(!result.success, "Expected failure on plan lookup DB error");
    assertEquals(result.transactionId, eventId);
    assert(result.error?.includes(`DB error looking up plan: ${dbErrorMessage}`), `Unexpected error message: ${result.error}`);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    const errorSpy = mockLogger.error as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 1); // Initial processing log
    assertSpyCalls(errorSpy, 1); // For the plan lookup DB error

    assert(String(infoSpy.calls[0].args[0]).includes(`Processing subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(errorSpy.calls[0].args[0]).includes(`DB error looking up plan for Stripe Price ID ${stripePriceId}`), "Error log for plan lookup DB error incorrect or missing");
    assertEquals((errorSpy.calls[0].args[1] as any)?.error?.message, dbErrorMessage, "Error details in log incorrect");

    // Verify Supabase select on subscription_plans was attempted
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder should have been called.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1); 
    // assertSpyCalls(selectStub, 1); // Verify our specific stub was called. No longer needed.

    // Verify user_subscriptions update was NOT attempted
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(!userSubsBuilder?.methodSpies.update || userSubsBuilder.methodSpies.update.calls.length === 0, "user_subscriptions.update should not have been called");
    
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
      userSubscriptionsUpdateCount: 1,
    });

    const event = createMockSubscriptionUpdatedEvent(
      { // Current subscription data reflecting the NEW plan
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: newStatus,
        items: { data: [{ price: { id: newStripePriceId } }] } as any, 
        current_period_start: Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60), // e.g., 15 days into new period
        current_period_end: Math.floor(Date.now() / 1000) + (15 * 24 * 60 * 60),   // e.g., 15 days left
      },
      { // Previous attributes indicating the OLD plan (for conceptual clarity in test naming)
        items: { data: [{ price: { id: oldStripePriceId } }] } as any,
        // other attributes like status might also be here if they changed too
      },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success for plan change, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 2);
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed event for subscription ${stripeSubscriptionId}`), "Success log wrong");

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    
    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, newStatus, "Status not updated correctly");
    assertEquals(updateCallArgs.plan_id, newInternalPlanId, "plan_id not updated to new plan");
    assertEquals(updateCallArgs.stripe_customer_id, stripeCustomerId, "Stripe customer ID not updated");
    assert(updateCallArgs.updated_at, "updated_at should be set");
    assert(updateCallArgs.current_period_start, "current_period_start should be set");
    assert(updateCallArgs.current_period_end, "current_period_end should be set");
  });

  await t.step("Update with cancel_at_period_end true - plan_id remains active plan", async () => {
    const stripeSubscriptionId = "sub_cancel_at_period_end";
    const stripeCustomerId = "cus_cancel_at_period_end";
    const currentStripePriceId = "price_active_ending_plan";
    const currentInternalPlanId = "plan_active_ending_789";
    const eventId = "evt_cancel_at_period_end_true";

    setup({
      subscriptionPlans: [{ id: currentInternalPlanId, stripe_price_id: currentStripePriceId }],
      userSubscriptionsUpdateCount: 1,
    });

    const event = createMockSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: 'active', // Status is still active
        cancel_at_period_end: true, // This is the key change
        items: { data: [{ price: { id: currentStripePriceId } }] } as any,
      },
      { // Previous attributes
        cancel_at_period_end: false, // Was false before
      },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 2); // Initial processing + successful processing

    // Verify Supabase calls
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['stripe_price_id', currentStripePriceId]);
    
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);

    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, 'active', "Status should remain active");
    assertEquals(updateCallArgs.plan_id, currentInternalPlanId, "plan_id should be the active (but ending) plan");
    assertEquals(updateCallArgs.cancel_at_period_end, true, "cancel_at_period_end should be true");
    assert(updateCallArgs.updated_at, "updated_at should be set");
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
      userSubscriptionsUpdateCount: 1,
    });

    const event = createMockSubscriptionUpdatedEvent(
      { // Current subscription data
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: 'canceled', // Key: status is now canceled
        items: { data: [{ price: { id: oldStripePriceId } }] } as any, // Event might still contain old price
      },
      { // Previous attributes
        status: "active",
      },
      eventId
    );

    const result = await handleCustomerSubscriptionUpdated(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    // Verify logger calls
    const infoSpy = mockLogger.info as Spy<any, any[], any>;
    assertSpyCalls(infoSpy, 3); // Initial processing + "switching to free plan" + successful processing
    assert(String(infoSpy.calls[1].args[0]).includes(`Subscription ${stripeSubscriptionId} canceled, setting plan to default free plan ID ${freePlanInternalId}`), "Free plan switch log missing or incorrect");


    // Verify Supabase calls
    // 1. Attempt to lookup free plan by item_id_internal
    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, "subscription_plans query builder not used.");
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1); // For free plan lookup
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['item_id_internal', FREE_TIER_ITEM_ID_INTERNAL]);
    
    // 2. Update user_subscriptions
    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);

    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, 'canceled', "Status should be canceled");
    assertEquals(updateCallArgs.plan_id, freePlanInternalId, "plan_id should be the internal free plan ID");
    assert(updateCallArgs.updated_at, "updated_at should be set");
  });

  // More tests will go here

});