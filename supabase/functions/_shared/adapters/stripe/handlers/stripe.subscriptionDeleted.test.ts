import { handleCustomerSubscriptionDeleted } from './stripe.subscriptionDeleted.ts';
import type { HandlerContext } from "../types.ts";
import type { ILogger, LogMetadata, MockSupabaseClientSetup } from "../../../types.ts";
import { Database } from "../../../../types_db.ts";
import type { ITokenWalletService } from '../../../types/tokenWallet.types.ts';
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
  type Spy,
} from 'jsr:@std/testing@0.225.1/mock';
import { createMockStripe, MockStripe } from '../../../stripe.mock.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { createMockTokenWalletService, MockTokenWalletService } from '../../../services/tokenWalletService.mock.ts';

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
    userSubscriptionsUpdateCount?: number;
    userSubscriptionsUpdateError?: Error | null;
  }) => {
    mockLogger = createMockLoggerInternal();
    mockTokenWalletService = createMockTokenWalletService();
    mockStripeInstance = createMockStripe().instance;

    const genericMockResults: MockSupabaseDataConfig['genericMockResults'] = {};
    genericMockResults['user_subscriptions'] = {
      update: async (_state: any) => {
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
      stripe: mockStripeInstance,
      updatePaymentTransaction: spy() as any,
      featureFlags: {},
      functionsUrl: "http://localhost:54321/functions/v1",
      stripeWebhookSecret: "whsec_test_secret_subscription_deleted",
    };
  };

  await t.step("Successful update - status becomes 'deleted'", async () => {
    const stripeSubscriptionId = "sub_deleted_successfully";
    const eventId = "evt_deleted_successfully_1";
    const expectedStatus = "deleted";

    setup({ userSubscriptionsUpdateCount: 1 });

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
    assertSpyCalls(infoSpy, 2);
    assert(String(infoSpy.calls[0].args[0]).includes(`Processing deleted subscription ${stripeSubscriptionId}`), "Initial log wrong");
    assert(String(infoSpy.calls[1].args[0]).includes(`Successfully processed delete event for subscription ${stripeSubscriptionId}. Marked as ${expectedStatus}`), "Success log wrong");

    const userSubsBuilder = mockSupabaseSetup.client.getLatestBuilder('user_subscriptions');
    assert(userSubsBuilder, "user_subscriptions query builder not used.");
    assertSpyCalls(userSubsBuilder.methodSpies.update, 1);
    assertSpyCalls(userSubsBuilder.methodSpies.eq, 1);
    assertEquals(userSubsBuilder.methodSpies.eq.calls[0].args, ['stripe_subscription_id', stripeSubscriptionId]);

    const updateCallArgs = userSubsBuilder.methodSpies.update.calls[0].args[0];
    assertEquals(updateCallArgs.status, expectedStatus, "Status not updated to deleted");
    assertEquals(updateCallArgs.cancel_at_period_end, false, "cancel_at_period_end not updated correctly");
    assert(updateCallArgs.updated_at, "updated_at should be set");
  });

  // More tests here
});