import {
    describe,
    it,
    afterEach,
    beforeEach,
    beforeAll,
    afterAll,
  } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
  import {
    assertEquals,
    assert,
    assertExists,
  } from 'https://deno.land/std@0.224.0/assert/mod.ts';
  import {
    Spy, spy, Stub, stub, 
  } from 'jsr:@std/testing@0.225.1/mock';
  
  import { IPaymentGatewayAdapter, PaymentConfirmation } from '../_shared/types/payment.types.ts';
  import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  import { IMockSupabaseClient } from '../_shared/types.ts';
  import { createMockTokenWalletService, MockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
  import Stripe from 'npm:stripe';
  import { Buffer } from 'node:buffer';
  
  import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js';
  import type { ITokenWalletService, TokenWalletTransaction } from '../_shared/types/tokenWallet.types.ts';
  import type { Database, Tables, TablesInsert } from '../types_db.ts';
  import type { PaymentAdapterFactoryFn } from './index.ts'; 
  
  // --- Single File-Scope Stub for Deno.env.get ---
  const originalDenoEnvGet = Deno.env.get;
  let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
  let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
  // --- End File-Scope Stub ---
  
  // Variables for shared state
  const dbCounters = {
    capturedUserSubscriptionsInsert: null as TablesInsert<'user_subscriptions'>[] | null,
    userSubscriptionsInsertCallCount: 0,
    capturedUserSubscriptionsUpsert: null as TablesInsert<'user_subscriptions'>[] | null,
    userSubscriptionsUpsertCallCount: 0,
    capturedUserSubscriptionsUpdate: null as Partial<Tables<'user_subscriptions'>> | null,
    userSubscriptionsUpdateCallCount: 0,
    userSubscriptionsEqCallCount: 0, 
    // Add other counters from the original file if they are relevant to subscription tests
    // For example, for payment_transactions if subscription events also create/update them.
    capturedPaymentTransactionsInsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsInsertCallCount: 0,
    capturedPaymentTransactionsUpdate: null as Partial<Tables<'payment_transactions'>> | null,
    paymentTransactionsUpdateCallCount: 0,
    capturedPaymentTransactionsUpsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsUpsertCallCount: 0,
    paymentTransactionsSelectData: null as Partial<Tables<'payment_transactions'>>[] | null,
    userSubscriptionsSelectData: null as Partial<Tables<'user_subscriptions'>>[] | null,
    subscriptionPlansSelectData: null as Partial<Tables<'subscription_plans'>>[] | null,
  };
  
  const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret_subscriptions';
  
  beforeAll(() => {
    if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
      try { fileScopeDenoEnvGetStub.restore(); } catch (e) { console.warn("Stray fileScopeDenoEnvGetStub restore failed in beforeAll (subscriptions):", e);}
    }
    fileScopeDenoEnvGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
      if (key === 'STRIPE_WEBHOOK_SECRET') {
        return mockEnvVarsForFileScope[key]; 
      }
      return mockEnvVarsForFileScope[key] === undefined ? originalDenoEnvGet(key) : mockEnvVarsForFileScope[key];
    });
  });
  
  afterAll(() => {
    if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
      fileScopeDenoEnvGetStub.restore();
    }
    fileScopeDenoEnvGetStub = null;
    mockEnvVarsForFileScope = {};
  });
  
  describe('Stripe Subscription Event Processing (Integration)', () => {
    let mockAdminClient: SupabaseClient<Database>; // This will be the mockSupabaseInstance.client
    let mockTokenWalletService: ITokenWalletService;
    let paymentAdapterFactorySpy: Spy<any, any[], IPaymentGatewayAdapter | null>; // Simplified for brevity
    let dependencies: WebhookHandlerDependencies;
  
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSupabaseInstance: IMockSupabaseClient;
    let mockTokenWalletServiceInstance: MockTokenWalletService;
    let stripeInstance: Stripe;
    let constructEventStub: Stub<Stripe.Webhooks> | null = null;
    // Add stubs for specific Stripe resources if needed, e.g., retrieveSubscriptionStub
    let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource> | null = null;
  
    beforeEach(async () => { // Made async if any setup becomes async
      // Reset all dbCounters
      for (const key in dbCounters) {
        if (Object.prototype.hasOwnProperty.call(dbCounters, key)) {
          if (key.toLowerCase().includes('count')) {
            (dbCounters as any)[key] = 0;
          } else {
            (dbCounters as any)[key] = null;
          }
        }
      }
      // Set default select data if needed by multiple tests, or set in specific test's beforeEach/it block
      dbCounters.userSubscriptionsSelectData = []; 
      dbCounters.paymentTransactionsSelectData = [];
      dbCounters.subscriptionPlansSelectData = [];

      mockEnvVarsForFileScope = {}; // Reset for each test
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';
  
      mockSupabaseInstance = createMockSupabaseClient({
        genericMockResults: {
            subscription_plans: {
                select: (state) => {
                    if (dbCounters.subscriptionPlansSelectData && dbCounters.subscriptionPlansSelectData.length > 0) {
                        // Example: basic filter by stripe_price_id for simplicity
                        const priceIdFilter = state.filters?.find(f => f.column === 'stripe_price_id' && f.type === 'eq');
                        if (priceIdFilter) {
                            const found = dbCounters.subscriptionPlansSelectData.filter(p => (p as any).stripe_price_id === priceIdFilter.value);
                            return Promise.resolve({ data: found, error: null, count: found.length, status: 200, statusText: 'OK (Mock Select Plan by Price ID)' });
                        }
                        return Promise.resolve({ data: dbCounters.subscriptionPlansSelectData, error: null, count: dbCounters.subscriptionPlansSelectData.length, status: 200, statusText: 'OK (Mock Select Plan)' });
                    }
                    return Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Empty Select Plan)'});
                },
                // Add insert/update/upsert mocks for subscription_plans if subscription events modify them
            },
            payment_transactions: {
                insert: (state) => {
                  dbCounters.paymentTransactionsInsertCallCount++;
                  const insertDataArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData].filter(d => d != null);
                  dbCounters.capturedPaymentTransactionsInsert = insertDataArray.map((item, index) => ({
                    ...(item as object),
                    id: (item as any)?.id || `mock_ptx_sub_inserted_${dbCounters.paymentTransactionsInsertCallCount}_${index}`,
                    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                  })) as TablesInsert<'payment_transactions'>[];
                  return Promise.resolve({ data: dbCounters.capturedPaymentTransactionsInsert, error: null, count: dbCounters.capturedPaymentTransactionsInsert.length, status: 201, statusText: 'Created' });
                },
                select: (state) => {
                  if (dbCounters.paymentTransactionsSelectData) {
                    const gatewayTxIdFilter = state.filters?.find(f => f.column === 'gateway_transaction_id' && f.type === 'eq');
                    if (gatewayTxIdFilter) {
                        const found = dbCounters.paymentTransactionsSelectData.find(ptx => (ptx as any).gateway_transaction_id === gatewayTxIdFilter.value);
                        if (found) return Promise.resolve({ data: found as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select PTX by Gateway ID)'});
                    }
                    // Simple return for now, can be made more sophisticated
                    if (dbCounters.paymentTransactionsSelectData.length === 1 && state.filters?.length > 0) {
                         return Promise.resolve({ data: dbCounters.paymentTransactionsSelectData[0] as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single PTX by heuristic)'});
                    }
                     return Promise.resolve({ data: dbCounters.paymentTransactionsSelectData as any[], error: null, count: dbCounters.paymentTransactionsSelectData.length, status: 200, statusText: 'OK (Mock Select PTX)' });
                  }
                  return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK (Empty Select PTX)' });
                },
                update: (state) => {
                  dbCounters.paymentTransactionsUpdateCallCount++;
                  dbCounters.capturedPaymentTransactionsUpdate = { ...(state.updateData as object), updated_at: new Date().toISOString() } as Partial<Tables<'payment_transactions'>>;
                  // Assume update affects 1 row for simplicity if filters are present
                  const count = state.filters && state.filters.length > 0 ? 1 : 0; 
                  return Promise.resolve({ data: count > 0 ? [dbCounters.capturedPaymentTransactionsUpdate as any] : [], error: null, count, status: 200, statusText: 'OK (Updated PTX)' });
                },
                upsert: (state) => {
                    dbCounters.paymentTransactionsUpsertCallCount++;
                    const upsertValues = Array.isArray(state.upsertData) ? state.upsertData : [state.upsertData].filter(d => d != null);
                    const now = new Date().toISOString();
                    dbCounters.capturedPaymentTransactionsUpsert = upsertValues.map((item, index) => ({
                      ...(item as object),
                      id: (item as any)?.id || `mock_ptx_sub_upserted_${dbCounters.paymentTransactionsUpsertCallCount}_${index}`,
                      created_at: now, updated_at: now,
                    })) as TablesInsert<'payment_transactions'>[];
                    return Promise.resolve({ data: dbCounters.capturedPaymentTransactionsUpsert, error: null, count: dbCounters.capturedPaymentTransactionsUpsert.length, status: 200, statusText: 'OK (Upserted PTX)' });
                },
            },
            user_subscriptions: {
                insert: (state) => {
                  dbCounters.userSubscriptionsInsertCallCount++;
                  dbCounters.capturedUserSubscriptionsInsert = state.insertData as TablesInsert<'user_subscriptions'>[];
                  return Promise.resolve({ data: dbCounters.capturedUserSubscriptionsInsert, error: null, count: dbCounters.capturedUserSubscriptionsInsert?.length || 0, status: 201, statusText: 'Created US' });
                },
                upsert: (state) => {
                  dbCounters.userSubscriptionsUpsertCallCount++;
                  const upsertDataArray = Array.isArray(state.upsertData) ? state.upsertData : [state.upsertData].filter(d => d != null);
                  dbCounters.capturedUserSubscriptionsUpsert = upsertDataArray.map(item => ({
                    ...(item as object), created_at: new Date().toISOString(), updated_at: new Date().toISOString()
                  })) as TablesInsert<'user_subscriptions'>[];
                  return Promise.resolve({ data: dbCounters.capturedUserSubscriptionsUpsert, error: null, count: dbCounters.capturedUserSubscriptionsUpsert.length, status: 200, statusText: 'OK (Upserted US)' });
                },
                update: (state) => {
                  dbCounters.userSubscriptionsUpdateCallCount++;
                  if (state.filters?.some(f => f.column === 'stripe_subscription_id' && f.type === 'eq')) {
                      dbCounters.userSubscriptionsEqCallCount++;
                  }
                  dbCounters.capturedUserSubscriptionsUpdate = { ...(state.updateData as object), updated_at: new Date().toISOString() } as Partial<Tables<'user_subscriptions'>>;
                  const count = state.filters && state.filters.length > 0 ? 1 : 0;
                  return Promise.resolve({ data: count > 0 ? [dbCounters.capturedUserSubscriptionsUpdate as any] : [], error: null, count, status: 200, statusText: 'OK (Updated US)' });
                },
                select: (state) => {
                    const customerIdFilter = state.filters?.find(f => f.column === 'stripe_customer_id' && f.type === 'eq');
                    if (customerIdFilter && dbCounters.userSubscriptionsSelectData) {
                      const matchingUserSub = dbCounters.userSubscriptionsSelectData.find(sub => (sub as any).stripe_customer_id === customerIdFilter.value);
                      if (matchingUserSub) {
                        return Promise.resolve({ data: matchingUserSub as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single US by Customer ID)' });
                      }
                    }
                    const subIdFilter = state.filters?.find(f => f.column === 'stripe_subscription_id' && f.type === 'eq');
                    if (subIdFilter && dbCounters.userSubscriptionsSelectData) {
                        const matchingUserSub = dbCounters.userSubscriptionsSelectData.find(sub => (sub as any).stripe_subscription_id === subIdFilter.value);
                        if (matchingUserSub) {
                          return Promise.resolve({ data: matchingUserSub as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single US by Subscription ID)' });
                        }
                      }
                    if (dbCounters.userSubscriptionsSelectData && dbCounters.userSubscriptionsSelectData.length > 0) {
                        return Promise.resolve({ data: dbCounters.userSubscriptionsSelectData, error: null, count: dbCounters.userSubscriptionsSelectData.length, status: 200, statusText: 'OK (Mock Select US Default)' });
                    }
                    return Promise.resolve({ data: null, error: { name: 'PGRST116', message: 'Query returned no rows (mock user_subscriptions filter)', code: 'PGRST116'}, count: 0, status: 406, statusText: 'Not Acceptable (Mock)'});
                 },
            }
          }
      }).client;
      mockAdminClient = mockSupabaseInstance as any as SupabaseClient<Database>; // Assign to the scoped variable
  
      mockTokenWalletServiceInstance = createMockTokenWalletService();
      mockTokenWalletService = mockTokenWalletServiceInstance as unknown as ITokenWalletService; // Assign to the scoped variable, cast to satisfy type
      
      stripeInstance = new Stripe('sk_test_DUMMYKEYFORSUBSTESTING', { apiVersion: '2023-10-16' });
  
      // Adapter factory spy - a simple one for now
      const fakePaymentAdapterFactory = (_source: string): IPaymentGatewayAdapter | null => {
        // This factory will be called by handleWebhookRequestLogic.
        // We want it to return our specifically instantiated realStripePaymentAdapter for 'stripe' source.
        realStripePaymentAdapter = new StripePaymentAdapter(
            stripeInstance,
            mockAdminClient, 
            mockTokenWalletService,
            mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET']! // Ensure it's non-null
          );
        return realStripePaymentAdapter;
      };
      paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);
  
      dependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockTokenWalletService,
        paymentAdapterFactory: paymentAdapterFactorySpy as unknown as PaymentAdapterFactoryFn,
        getEnv: (key: string) => Deno.env.get(key),
      };
    });
  
    afterEach(() => {
      mockTokenWalletServiceInstance.clearStubs();
      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
      if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
        retrieveSubscriptionStub.restore();
      }
      constructEventStub = null;
      retrieveSubscriptionStub = null;
    });
  
    // --- Subscription Event Test Suites will be inserted here ---

    // --- customer.subscription.updated Event Tests ---
    describe('customer.subscription.updated event', () => {
        // let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource>; // Removed as likely not needed here

        // beforeEach(() => { // Removed
        //     if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
        //         retrieveSubscriptionStub.restore();
        //     }
        // });
        // afterEach(() => { // Removed
        //     if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
        //         retrieveSubscriptionStub.restore();
        //     }
        // });

      it('should update user_subscriptions record and return 200', async () => {
        const stripeSubscriptionId = 'sub_updated_test_int';
        const userId = 'user_sub_updated_test'; // Assuming client_reference_id or metadata links this
        const mockPlanIdForUpdate = 'plan_for_updated_sub';
        const mockStripePriceIdForUpdate = 'price_mock_updated_plan';

        // Setup mock plan data for this test
        dbCounters.subscriptionPlansSelectData = [{
          id: mockPlanIdForUpdate,
          stripe_price_id: mockStripePriceIdForUpdate,
          item_id_internal: 'item_id_for_updated_plan', // Some item_id
          // Add other necessary fields for a minimal subscription_plans record if handler uses them
          name: 'Mock Plan for Update',
          active: true,
          plan_type: 'subscription',
          tokens_awarded: 100, // Example
        }];

        const mockUpdatedSubscription: Partial<Stripe.Subscription> = {
          id: stripeSubscriptionId,
          status: 'past_due', // Example: subscription status changes
          customer: 'cus_test_customer_id_for_sub_update', // Stripe Customer ID
          current_period_start: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // e.g., 30 days ago
          current_period_end: Math.floor(Date.now() / 1000) + (15 * 24 * 60 * 60), // Example new period end
          cancel_at_period_end: false,
          items: {
            object: 'list',
            data: [
              {
                price: { id: mockStripePriceIdForUpdate } as Stripe.Price,
                id: 'si_mockitem',
                object: 'subscription_item',
                billing_thresholds: null,
                created: Math.floor(Date.now() / 1000),
                metadata: {},
                plan: {
                  id: mockPlanIdForUpdate,
                  object: 'plan',
                  active: true,
                  aggregate_usage: null,
                  amount: 1000,
                  amount_decimal: '1000',
                  billing_scheme: 'per_unit',
                  created: Math.floor(Date.now() / 1000),
                  currency: 'usd',
                  interval: 'month',
                  interval_count: 1,
                  livemode: false,
                  metadata: {},
                  nickname: null,
                  product: 'prod_mock_for_plan_item',
                  tiers_mode: null,
                  transform_usage: null,
                  trial_period_days: null,
                  usage_type: 'licensed',
                } as Stripe.Plan,
                current_period_start: Math.floor(Date.now() / 1000) - (5 * 24 * 60 * 60),
                current_period_end: Math.floor(Date.now() / 1000) + (25 * 24 * 60 * 60),
                discounts: [],
                quantity: 1,
                subscription: stripeSubscriptionId,
                tax_rates: [],
              },
            ],
            has_more: false,
            url: '/v1/subscription_items?subscription=' + stripeSubscriptionId,
          },
          metadata: { user_id: userId },
        };
        
        const mockEvent = {
          id: `evt_sub_updated_${stripeSubscriptionId}`,
          type: 'customer.subscription.updated' as Stripe.Event.Type,
          data: { object: mockUpdatedSubscription as Stripe.Subscription },
        } as Stripe.Event;

        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));
        
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-sub-updated' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        assertEquals(response.status, 200);
        assertEquals(responseBody.transactionId, mockEvent.id);
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1);
        assertEquals(dbCounters.userSubscriptionsEqCallCount, 1);
        const updatedSubData = dbCounters.capturedUserSubscriptionsUpdate;
        assertExists(updatedSubData);
        assertEquals(updatedSubData.status, 'past_due');
        assertEquals(updatedSubData.current_period_end, new Date(mockUpdatedSubscription.current_period_end! * 1000).toISOString());
        assertEquals(updatedSubData.plan_id, mockPlanIdForUpdate);
      });
    });

    // --- customer.subscription.deleted Event Tests ---
    describe('customer.subscription.deleted event', () => {
      it('should update user_subscriptions status to canceled and return 200', async () => {
        const stripeSubscriptionId = 'sub_deleted_test_int';
        const mockFreePlanId = 'plan_sys_free_tier_id';

        // Setup mock free plan data for this test
        dbCounters.subscriptionPlansSelectData = [{
          id: mockFreePlanId,
          item_id_internal: 'SYS_FREE_TIER',
          stripe_price_id: 'price_sys_free_tier', // Needs a stripe_price_id
          // Add other necessary fields for a minimal subscription_plans record
          name: 'System Free Tier',
          active: true,
          plan_type: 'subscription',
          tokens_awarded: 0, 
        }];

        const mockDeletedSubscription: Partial<Stripe.Subscription> = {
          id: stripeSubscriptionId,
          status: 'canceled', 
        };
        const mockEvent = {
          id: `evt_sub_deleted_${stripeSubscriptionId}`,
          type: 'customer.subscription.deleted' as Stripe.Event.Type,
          data: { object: mockDeletedSubscription as Stripe.Subscription },
        } as Stripe.Event;

        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-sub-deleted' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        assertEquals(response.status, 200);
        assertEquals(responseBody.transactionId, mockEvent.id);
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1);
        assertEquals(dbCounters.userSubscriptionsEqCallCount, 1);
        const updatedSubData = dbCounters.capturedUserSubscriptionsUpdate;
        assertExists(updatedSubData);
        assertEquals(updatedSubData.status, 'canceled');
      });
    });
  
  });
  