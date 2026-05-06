import { handleCustomerSubscriptionDeleted } from './stripe.subscriptionDeleted.ts';
import { Database } from '../../../../types_db.ts';
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
  createMockCustomerSubscriptionDeletedEvent,
} from '../../../stripe.mock.ts';
import { createMockSupabaseClient, MockSupabaseClientSetup, MockSupabaseDataConfig } from '../../../supabase.mock.ts';
import { createMockAdminTokenWalletService, MockAdminTokenWalletService } from '../../../services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { MockLogger } from '../../../logger.mock.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER';

const SAMPLE_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

Deno.test('[stripe.subscriptionDeleted.ts] Tests - handleCustomerSubscriptionDeleted', async (t) => {
  let mockSupabaseClient: SupabaseClient<Database>;
  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockTokenWalletService: MockAdminTokenWalletService;
  let mockLogger: MockLogger;
  let mockStripeInstance: MockStripe['instance'];
  let handlerContext: HandlerContext;
  let infoSpy: Spy<MockLogger, Parameters<MockLogger['info']>, ReturnType<MockLogger['info']>>;
  let warnSpy: Spy<MockLogger, Parameters<MockLogger['warn']>, ReturnType<MockLogger['warn']>>;
  let errorSpy: Spy<MockLogger, Parameters<MockLogger['error']>, ReturnType<MockLogger['error']>>;

  const setup = (dbQueryResults?: {
    subscriptionPlans?: { id: string; item_id_internal?: string }[] | null;
    subscriptionPlansSelectError?: Error;
    rpcResults?: MockSupabaseDataConfig['rpcResults'];
  }) => {
    mockLogger = new MockLogger();
    infoSpy = spy(mockLogger, 'info');
    warnSpy = spy(mockLogger, 'warn');
    errorSpy = spy(mockLogger, 'error');
    mockTokenWalletService = createMockAdminTokenWalletService();
    mockStripeInstance = createMockStripe().instance;

    const genericMockResults: MockSupabaseDataConfig['genericMockResults'] = {};

    if (dbQueryResults?.subscriptionPlans !== undefined || dbQueryResults?.subscriptionPlansSelectError) {
      genericMockResults['subscription_plans'] = {
        select: async (state) => {
          if (dbQueryResults?.subscriptionPlansSelectError) {
            return { data: null, error: dbQueryResults.subscriptionPlansSelectError, count: 0, status: 500, statusText: 'Error' };
          }
          const itemIdInternalFilter = state.filters.find((f) => f.column === 'item_id_internal');
          if (dbQueryResults?.subscriptionPlans && itemIdInternalFilter) {
            const foundPlan = dbQueryResults.subscriptionPlans.find((p) => p.item_id_internal === itemIdInternalFilter.value);
            if (foundPlan !== undefined) {
              return { data: [foundPlan], error: null, count: 1, status: 200, statusText: 'OK' };
            }
            return { data: null, error: null, count: 0, status: 200, statusText: 'OK' };
          }
          return { data: [], error: new Error('Mock for subscription_plans select not adequately configured for this call'), count: 0, status: 400, statusText: 'Bad Request' };
        },
      };
    }

    let rpcResultsForClient: MockSupabaseDataConfig['rpcResults'];
    if (dbQueryResults !== undefined && dbQueryResults.rpcResults !== undefined) {
      rpcResultsForClient = dbQueryResults.rpcResults;
    } else {
      rpcResultsForClient = {
        update_subscription_with_tier: {
          data: [
            {
              user_id: SAMPLE_USER_ID,
              tier_level: 1,
              rows_updated: 1,
            },
          ],
          error: null,
        },
      };
    }

    mockSupabaseSetup = createMockSupabaseClient(undefined, {
      genericMockResults,
      rpcResults: rpcResultsForClient,
    });
    mockSupabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;

    handlerContext = {
      supabaseClient: mockSupabaseClient,
      logger: mockLogger,
      tokenWalletService: mockTokenWalletService.instance,
      stripe: mockStripeInstance,
      updatePaymentTransaction: spy(),
      featureFlags: {},
      functionsUrl: 'http://localhost:54321/functions/v1',
      stripeWebhookSecret: 'whsec_test_secret_subscription_deleted',
    };
  };

  await t.step("subscription deleted → RPC update_subscription_with_tier with canceled, free plan id, p_set_ratchet false", async () => {
    const stripeSubscriptionId = 'sub_deleted_rpc_contract';
    const eventId = 'evt_deleted_rpc_contract';
    const freePlanId = 'plan_free_tier_uuid';

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
    });

    const event = createMockCustomerSubscriptionDeletedEvent(
      {
        id: stripeSubscriptionId,
        cancel_at_period_end: false,
      },
      { id: eventId },
    );

    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    const subPlansBuilder = mockSupabaseSetup.client.getLatestBuilder('subscription_plans');
    assert(subPlansBuilder, 'subscription_plans query builder not used for free plan lookup.');
    assertSpyCalls(subPlansBuilder.methodSpies.select, 1);
    assertSpyCalls(subPlansBuilder.methodSpies.eq, 1);
    assertEquals(subPlansBuilder.methodSpies.eq.calls[0].args, ['item_id_internal', FREE_TIER_ITEM_ID_INTERNAL]);
    assertSpyCalls(subPlansBuilder.methodSpies.single, 1);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[0], 'update_subscription_with_tier');
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: 'canceled',
      p_plan_id: freePlanId,
      p_cancel_at_period_end: false,
      p_set_ratchet: false,
    });
  });

  await t.step('RPC returns tier_level 10 — handler succeeds (ratchet narrative via RPC result)', async () => {
    const stripeSubscriptionId = 'sub_deleted_tier_basic';
    const eventId = 'evt_deleted_tier_basic';
    const freePlanId = 'plan_free_for_tier_basic';

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
      rpcResults: {
        update_subscription_with_tier: {
          data: [
            {
              user_id: SAMPLE_USER_ID,
              tier_level: 10,
              rows_updated: 1,
            },
          ],
          error: null,
        },
      },
    });

    const event = createMockCustomerSubscriptionDeletedEvent(
      {
        id: stripeSubscriptionId,
        cancel_at_period_end: false,
      },
      { id: eventId },
    );

    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, `Expected success, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);

    let sawTierTen = false;
    for (const call of infoSpy.calls) {
      let msg: string = '';
      const firstLogArg = call.args[0];
      if (typeof firstLogArg === 'string') {
        msg = firstLogArg;
      }
      if (msg.includes('tier_level: 10') || msg.includes('tier_level:10')) {
        sawTierTen = true;
        break;
      }
    }
    assert(sawTierTen, 'Expected an info log line containing tier_level 10 from RPC result');
  });

  await t.step('RPC returns error → handler returns { success: false }', async () => {
    const stripeSubscriptionId = 'sub_deleted_rpc_error';
    const eventId = 'evt_deleted_rpc_error';
    const freePlanId = 'plan_free_rpc_error';
    const rpcErr: Error = new Error('update_subscription_with_tier failed');

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
      rpcResults: {
        update_subscription_with_tier: { data: null, error: rpcErr },
      },
    });

    const event = createMockCustomerSubscriptionDeletedEvent(
      {
        id: stripeSubscriptionId,
        cancel_at_period_end: false,
      },
      { id: eventId },
    );

    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assertEquals(result.success, false);
    assertEquals(result.transactionId, eventId);
    assert(result.error !== undefined && result.error !== '', 'Expected error message on RPC failure');

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertSpyCalls(errorSpy, 1);
  });

  await t.step('Free plan lookup - DB error — RPC still invoked with null plan id', async () => {
    const stripeSubscriptionId = 'sub_deleted_free_plan_db_error';
    const eventId = 'evt_deleted_free_plan_db_error_1';
    const dbErrorMessage = 'Mock Supabase: Network error during free plan lookup';

    setup({
      subscriptionPlansSelectError: new Error(dbErrorMessage),
    });

    const event = createMockCustomerSubscriptionDeletedEvent({ id: stripeSubscriptionId }, { id: eventId });
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, 'Expected success path once RPC succeeds for subscription row');
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(errorSpy, 1);
    assert(String(errorSpy.calls[0].args[0]).includes(`DB error looking up free plan for ${stripeSubscriptionId}`), 'Error log for free plan lookup DB error incorrect or missing');

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: 'canceled',
      p_plan_id: null,
      p_cancel_at_period_end: false,
      p_set_ratchet: false,
    });
  });

  await t.step('Free plan lookup - plan not found — RPC invoked with null plan id', async () => {
    const stripeSubscriptionId = 'sub_deleted_free_plan_not_found';
    const eventId = 'evt_deleted_free_plan_not_found_1';

    setup({
      subscriptionPlans: [],
    });

    const event = createMockCustomerSubscriptionDeletedEvent({ id: stripeSubscriptionId }, { id: eventId });
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, 'Expected success path once RPC succeeds for subscription row');
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(warnSpy, 1);
    assert(String(warnSpy.calls[0].args[0]).includes(`Internal free plan with item_id_internal ${FREE_TIER_ITEM_ID_INTERNAL} not found`), 'Warning for free plan not found incorrect or missing');

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertEquals(mockSupabaseSetup.spies.rpcSpy.calls[0].args[1], {
      p_stripe_subscription_id: stripeSubscriptionId,
      p_status: 'canceled',
      p_plan_id: null,
      p_cancel_at_period_end: false,
      p_set_ratchet: false,
    });
  });

  await t.step('RPC returns rows_updated 0 — warn when no subscription row matched', async () => {
    const stripeSubscriptionId = 'sub_deleted_no_user_sub_record';
    const eventId = 'evt_deleted_no_user_sub_record_1';
    const freePlanId = 'plan_free_tier_uuid_for_no_us_record';

    setup({
      subscriptionPlans: [{ id: freePlanId, item_id_internal: FREE_TIER_ITEM_ID_INTERNAL }],
      rpcResults: {
        update_subscription_with_tier: {
          data: [
            {
              user_id: null,
              tier_level: null,
              rows_updated: 0,
            },
          ],
          error: null,
        },
      },
    });

    const event = createMockCustomerSubscriptionDeletedEvent({ id: stripeSubscriptionId }, { id: eventId });
    const result = await handleCustomerSubscriptionDeleted(handlerContext, event);

    assert(result.success, `Expected success with warn when rows_updated is 0, got error: ${result.error}`);
    assertEquals(result.transactionId, eventId);

    assertSpyCalls(mockSupabaseSetup.spies.rpcSpy, 1);
    assertSpyCalls(warnSpy, 1);
    assert(
      String(warnSpy.calls[0].args[0]).includes(`No user_subscription found with stripe_subscription_id ${stripeSubscriptionId}`),
      'Warning for no user_subscription record incorrect or missing',
    );
  });
});
