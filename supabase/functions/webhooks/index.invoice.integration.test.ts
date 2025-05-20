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
  
  import * as corsHeaders from '../_shared/cors-headers.ts';
  import * as adapterFactory from '../_shared/adapters/adapterFactory.ts';
  import { IPaymentGatewayAdapter, PaymentConfirmation, PaymentInitiationResult } from '../_shared/types/payment.types.ts';
  // TWS import is not used directly in these tests, can be removed if not needed for type inference elsewhere
  // import * as TWS from '../_shared/services/tokenWalletService.ts';
  import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  import { IMockSupabaseClient } from '../_shared/types.ts'; // Corrected import path and type
  import { createMockTokenWalletService, MockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
  import Stripe from 'npm:stripe';
  import { Buffer } from 'node:buffer';
  import { ParsedProductDescription } from '../_shared/utils/productDescriptionParser.ts';
  
  import { webhookRouterHandler, handleWebhookRequestLogic, WebhookHandlerDependencies, WebhookRouterDependencies } from './index.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js';
  import type { ITokenWalletService, TokenWalletTransaction } from '../_shared/types/tokenWallet.types.ts';
  import type { Database, Tables, TablesInsert } from '../types_db.ts'; // Corrected path to types_db.ts, added TablesInsert
  import type { PaymentAdapterFactoryFn } from './index.ts'; // Import the type
  
  // --- Single File-Scope Stub for Deno.env.get ---
  const originalDenoEnvGet = Deno.env.get;
  let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
  let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
  // --- End File-Scope Stub ---
  
  // Variables for shared state between beforeEach of the describe block and the tests
  const dbCounters = {
    // Counters and capturers for payment_transactions
    capturedPaymentTransactionsInsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsInsertCallCount: 0,
    capturedPaymentTransactionsUpdate: null as Partial<Tables<'payment_transactions'>> | null,
    paymentTransactionsUpdateCallCount: 0,
    paymentTransactionsEqCallCount: 0, // For specific updates
    // Counters and capturers for user_subscriptions
    capturedUserSubscriptionsUpdate: null as Partial<Tables<'user_subscriptions'>> | null,
    userSubscriptionsUpdateCallCount: 0,
    userSubscriptionsEqCallCount: 0, // For specific updates
    paymentTransactionsUpsertCallCount: 0,
    capturedPaymentTransactionsUpsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsSelectData: null as Partial<Tables<'payment_transactions'>>[] | null, // Corrected type
    userSubscriptionsSelectData: null as Partial<Tables<'user_subscriptions'>>[] | null, // ENSURE THIS IS Partial<Tables<'user_subscriptions'>>[]
    subscriptionPlansSelectData: null as Partial<Tables<'subscription_plans'>>[] | null, // Added for lookup
  };
  
  // Constants like MOCK_STRIPE_WEBHOOK_SECRET remain the same
  const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret';
  
  beforeAll(() => {
    // Ensure any stray stub from a previous run or bad state is cleared (defensive)
    if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
      try { fileScopeDenoEnvGetStub.restore(); } catch (e) { console.warn("Stray fileScopeDenoEnvGetStub restore failed in beforeAll:", e);}
    }
    fileScopeDenoEnvGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
      // console.log(`DEBUG: fileScopeDenoEnvGetStub: called with key = ${key}`);
      // console.log(`DEBUG: fileScopeDenoEnvGetStub: mockEnvVarsForFileScope content = ${JSON.stringify(mockEnvVarsForFileScope)}`);
      if (key === 'STRIPE_WEBHOOK_SECRET') {
        const val = mockEnvVarsForFileScope[key];
        // console.log(`DEBUG: fileScopeDenoEnvGetStub: For STRIPE_WEBHOOK_SECRET, found value = ${val}`);
        return val; 
      }
      // For other keys, behave as before (fallback to original if not in mockEnvVarsForFileScope)
      return mockEnvVarsForFileScope[key] === undefined ? originalDenoEnvGet(key) : mockEnvVarsForFileScope[key];
    });
  });
  
  afterAll(() => {
    if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
      fileScopeDenoEnvGetStub.restore();
    }
    fileScopeDenoEnvGetStub = null;
    mockEnvVarsForFileScope = {}; // Reset for safety, though stub is gone
  });
  
  describe('Stripe Invoice Event Processing with Real StripePaymentAdapter', () => {
    let mockAdminClient: SupabaseClient<Database>;
    let mockTokenWalletService: ITokenWalletService;
    let paymentAdapterFactorySpy: Spy<typeof adapterFactory, Parameters<typeof adapterFactory.getPaymentAdapter>, ReturnType<typeof adapterFactory.getPaymentAdapter>>;
    let dependencies: WebhookHandlerDependencies;
    let currentMockAdapter: IPaymentGatewayAdapter | null = null;
    let configuredSourceForAdapterStub: string | null = null;
    
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSupabaseInstance: IMockSupabaseClient;
    let mockTokenWalletServiceInstance: MockTokenWalletService;
    let stripeInstance: Stripe;
    let constructEventStub: Stub<Stripe.Webhooks>;
  
    beforeEach(() => {
      // Setup from the OLD OUTER beforeEach (lines 117-152 of original full file)
      mockAdminClient = {} as SupabaseClient<Database>; 
      mockTokenWalletService = {} as ITokenWalletService;
      mockEnvVarsForFileScope = {}; // Reset for each test in this suite

      const fakePaymentAdapterFactory = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: ITokenWalletService): IPaymentGatewayAdapter | null => {
        if (configuredSourceForAdapterStub === source) {
          if (currentMockAdapter) return currentMockAdapter;
          if (source === 'stripe' && realStripePaymentAdapter) return realStripePaymentAdapter;
        }
        return null;
      };
      paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);

      dependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockTokenWalletService,
        paymentAdapterFactory: paymentAdapterFactorySpy as unknown as PaymentAdapterFactoryFn,
        getEnv: (key: string) => Deno.env.get(key),
      };
      currentMockAdapter = null;
      configuredSourceForAdapterStub = null;

      // Reset captured data and counts for each test in this suite (from OLD INNER beforeEach)
      // Reset new counters
      dbCounters.capturedPaymentTransactionsInsert = null;
      dbCounters.paymentTransactionsInsertCallCount = 0;
      dbCounters.capturedPaymentTransactionsUpdate = null;
      dbCounters.paymentTransactionsUpdateCallCount = 0;
      dbCounters.paymentTransactionsEqCallCount = 0;

      dbCounters.capturedUserSubscriptionsUpdate = null;
      dbCounters.userSubscriptionsUpdateCallCount = 0;
      dbCounters.userSubscriptionsEqCallCount = 0;
      dbCounters.paymentTransactionsUpsertCallCount = 0;
      dbCounters.capturedPaymentTransactionsUpsert = null;
      dbCounters.paymentTransactionsSelectData = null; // Reset for this suite
      dbCounters.userSubscriptionsSelectData = [{
        user_id: 'user_invoice_ps_test_int', // Matches userId in test
        stripe_customer_id: 'cus_invoice_ps_test_int' // Added for lookup
      }] as Partial<Tables<'user_subscriptions'>>[];
      dbCounters.subscriptionPlansSelectData = [{ 
          stripe_price_id: 'price_for_invoice_ps', // Added for lookup
          item_id_internal: 'item_id_for_invoice_ps', 
          tokens_awarded: 7500 
      }];
      // recordTransactionSpy.resetHistory(); // Spy is re-created
  
  
      mockSupabaseInstance = createMockSupabaseClient({
        genericMockResults: {
          subscription_plans: {
            select: (state) => { // KEEP simplified select mock
              // Logic to return data from dbCounters.subscriptionPlansSelectData based on state.filters
              // This should be robust enough for how invoice handlers query plan details.
              // Example: might filter by stripe_price_id or item_id_internal
              if (dbCounters.subscriptionPlansSelectData && state.filters) {
                const priceIdFilter = state.filters.find(f => f.column === 'stripe_price_id' && f.type === 'eq');
                const itemIdFilter = state.filters.find(f => f.column === 'item_id_internal' && f.type === 'eq');

                const result = dbCounters.subscriptionPlansSelectData.filter(plan => {
                  let match = true;
                  if (priceIdFilter && plan.stripe_price_id !== priceIdFilter.value) {
                    match = false;
                  }
                  if (itemIdFilter && plan.item_id_internal !== itemIdFilter.value) {
                    match = false;
                  }
                  return match;
                });

                if (result.length > 0) {
                   // If the handler implies .single() by its logic, the test data should reflect that.
                   // For now, assume if there's a unique identifier like price_id, it might be a single select.
                  if (state.filters.some(f => (f.column === 'stripe_price_id' || f.column === 'item_id_internal') && f.type === 'eq') && result.length === 1) {
                      return Promise.resolve({ data: result[0] as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single Plan)' });
                  }
                  return Promise.resolve({ data: result as any[], error: null, count: result.length, status: 200, statusText: 'OK (Mock Select Plans)' });
                }
              }
              if (state.filters?.some(f => f.column === 'item_id_internal' && f.value === 'test_subscription_item_id' && f.type === 'eq')) {
                return Promise.resolve({ data: [{ id: 'plan_sub_test_integration' }], error: null, count: 1, status: 200, statusText: 'OK (Found Plan by item_id_internal)' });
              }
              return Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Empty Select Plan)'});
            },
          },
          payment_transactions: {
            insert: (state) => {
              dbCounters.paymentTransactionsInsertCallCount++;
              const insertDataArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData].filter(d => d !== null && d !== undefined);
              
              // Simulate ID generation and add to captured data if ID is selected
              dbCounters.capturedPaymentTransactionsInsert = insertDataArray.map((item, index) => {
                const newItem = { ...(item as object) } as TablesInsert<'payment_transactions'>;
                if (!newItem.id) { // If ID isn't pre-set by the test/handler
                  newItem.id = `mock_ptx_id_inserted_${dbCounters.paymentTransactionsInsertCallCount}_${index}`;
                }
                return newItem;
              });
  
              // If select('id').single() is used, the data returned should reflect that.
              // The QueryBuilder's _resolveQuery handles .single(), so we need to provide data that .single() can work with.
              // If 'id' or '*' is selected, ensure the 'id' is in the returned objects.
              let returnData: any[] = dbCounters.capturedPaymentTransactionsInsert;
              if (state.selectColumns && (state.selectColumns === '*' || state.selectColumns.includes('id'))) {
                returnData = dbCounters.capturedPaymentTransactionsInsert.map(item => ({ id: item.id, ...(state.selectColumns === '*' ? item : {}) }));
              } else if (state.selectColumns) { // Specific columns selected, may not include id
                returnData = dbCounters.capturedPaymentTransactionsInsert.map(item => {
                  const selectedItem: Partial<Tables<'payment_transactions'>> = {};
                  for (const col of state.selectColumns!.split(',')) {
                    (selectedItem as any)[col.trim()] = (item as any)[col.trim()];
                  }
                  return selectedItem;
                });
              }
              
              return Promise.resolve({ data: returnData, error: null, count: returnData.length, status: 201, statusText: 'Created' });
            },
            select: (state) => {
              // Simplified: just return the pre-set data for now if it exists
              if (dbCounters.paymentTransactionsSelectData) {
                // If the handler implies .single() by its logic, the test data should reflect that.
                // For generic mock, return array or single based on typical Supabase client behavior if easily determined.
                // However, for now, we'll keep it simple and return array for multi-row, or specific object if count = 1 in selectData.
                if (dbCounters.paymentTransactionsSelectData.length === 1 && state.filters?.length > 0) { // Heuristic for single record fetch by ID etc.
                     return Promise.resolve({ data: dbCounters.paymentTransactionsSelectData[0] as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single PTX by heuristic)'});
                }
                 return Promise.resolve({ data: dbCounters.paymentTransactionsSelectData as any[], error: null, count: dbCounters.paymentTransactionsSelectData.length, status: 200, statusText: 'OK (Mock Select PTX)' });
              }
              return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK (Empty Select PTX)' });
            },
            update: (state) => {
              dbCounters.paymentTransactionsUpdateCallCount++;
              const idFilter = state.filters?.find(f => f.column === 'id' && f.type === 'eq');
              const ptxIdBeingUpdated = idFilter?.value as string | undefined;
  
              dbCounters.capturedPaymentTransactionsUpdate = { 
                ...(ptxIdBeingUpdated && { id: ptxIdBeingUpdated }), // Ensure ID is part of the captured data
                ...(state.updateData as object), 
                updated_at: new Date().toISOString() 
              } as Partial<Tables<'payment_transactions'>>;
              
              // If select('id').single() is used, data should be the object with id.
              // The QueryBuilder's _resolveQuery handles .single(), so ensure the object has the id.
              let returnObject = dbCounters.capturedPaymentTransactionsUpdate;
              if (state.selectColumns && state.selectColumns !== '*' && !state.selectColumns.includes('id') && ptxIdBeingUpdated) {
                 // If specific columns are selected and 'id' is NOT one of them, remove it for accurate mock
                 const { id, ...rest } = returnObject;
                 returnObject = rest;
              } else if (state.selectColumns && state.selectColumns !== '*' && ptxIdBeingUpdated) {
                // Specific columns selected, construct the object with only those
                const selectedReturn: Partial<Tables<'payment_transactions'>> = {id: ptxIdBeingUpdated};
                 for (const col of state.selectColumns!.split(',')) {
                    if (col.trim() !== 'id') {
                        (selectedReturn as any)[col.trim()] = (dbCounters.capturedPaymentTransactionsUpdate as any)[col.trim()];
                    }
                 }
                 returnObject = selectedReturn;
              }
  
  
              return Promise.resolve({ 
                data: returnObject ? [returnObject] : [], // Mock QB expects array, .single() will pick first
                error: null, 
                count: returnObject ? 1 : 0, 
                status: 200, 
                statusText: 'OK (Updated)' 
              });
            },
            upsert: (state) => {
              dbCounters.paymentTransactionsUpsertCallCount++;
              const upsertValues = Array.isArray(state.upsertData) 
                ? state.upsertData 
                : [state.upsertData].filter(d => d !== null && d !== undefined);
              
              const now = new Date().toISOString();
              dbCounters.capturedPaymentTransactionsUpsert = upsertValues.map((item, index) => ({
                ...(item as object), 
                created_at: now, 
                updated_at: now,
                // Ensure 'id' is present if not provided by test, as .select('id') will need it
                id: (item as any)?.id || `mock_ptx_id_${dbCounters.paymentTransactionsUpsertCallCount}_${index}` 
              })) as TablesInsert<'payment_transactions'>[];
  
              // Upsert (when .select() is chained) should return an array of the upserted items
              return Promise.resolve({ 
                data: dbCounters.capturedPaymentTransactionsUpsert, // Must be an array for .select() to work on
                error: null, 
                count: dbCounters.capturedPaymentTransactionsUpsert.length, 
                status: 200, 
                statusText: 'OK (Upserted PaymentTransaction)' 
              });
            },
          },
          user_subscriptions: {
            update: (state) => {
              dbCounters.userSubscriptionsUpdateCallCount++;
               if (state.filters?.some(f => f.column === 'stripe_subscription_id' && f.type === 'eq')) {
                   dbCounters.userSubscriptionsEqCallCount++;
              }
              dbCounters.capturedUserSubscriptionsUpdate = state.updateData as Partial<Tables<'user_subscriptions'>>;
              return Promise.resolve({ data: [dbCounters.capturedUserSubscriptionsUpdate as any], error: null, count: 1, status: 200, statusText: 'OK (Updated)' });
            },
            select: (state) => { // Modified for invoice.payment_succeeded
                const customerIdFilter = state.filters?.find(f => f.column === 'stripe_customer_id' && f.type === 'eq');
                if (customerIdFilter && dbCounters.userSubscriptionsSelectData) {
                  const matchingUserSub = dbCounters.userSubscriptionsSelectData.find(
                    (sub) => sub.stripe_customer_id === customerIdFilter.value
                  );
                  if (matchingUserSub) {
                    // .single() is often used by the handler, but mock client expects array for select data.
                    // The mock client's .single() logic will pick the first element if called.
                    return Promise.resolve({ data: [matchingUserSub], error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single User Sub by Customer ID)' });
                  } else {
                    return Promise.resolve({ data: null, error: { name: 'PGRST116', message: 'Query returned no rows (mock customerId filter)', code: 'PGRST116'}, count: 0, status: 406, statusText: 'Not Acceptable (Mock)'});
                  }
                }
                const dataToReturn = dbCounters.userSubscriptionsSelectData || [];
                return Promise.resolve({ data: dataToReturn, error: null, count: dataToReturn.length, status: 200, statusText: 'OK (Mock Select User Subs Default)' });
             },
          },
          token_wallets: {
            select: (state: any) => {
              if (state.filters?.some((f: any) => f.column === 'user_id' && f.value === 'user_invoice_ps_test_int' && f.type === 'eq')) {
                return Promise.resolve({ data: [{ wallet_id: 'wallet_for_user_invoice_ps_test_int' }], error: null, count: 1, status: 200, statusText: 'OK (Found Wallet)' });
              }
              return Promise.resolve({ data: null, error: { name: 'PGRST116', message: 'Mock: Wallet not found by default mock', code: 'PGRST116' }, count: 0, status: 406, statusText: 'Not Found' });
            }
          }
        }
      }).client;
      
      mockTokenWalletServiceInstance = createMockTokenWalletService();
      stripeInstance = new Stripe('sk_test_DUMMYKEYFORTESTING', { apiVersion: '2023-10-16' });
  
      // IMPORTANT: Stub Stripe.webhooks.constructEventAsync
      // This is crucial because the adapter calls it. We'll control the event object it returns.
      // Default stub for this describe block
      constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync',
        async (payload: string | Buffer, sig: string | string[] | Buffer, secret: string): Promise<Stripe.Event> => {
          console.log(`Default constructEventAsyncStub called with payload: ${payload}, sig: ${sig}, secret: ${secret}`);
          return Promise.resolve({
            id: 'evt_default_constructed_async',
            object: 'event' as const,
            api_version: '2020-08-27',
            created: Math.floor(Date.now() / 1000),
            data: { object: { id: 'default_data_obj_async'} },
            livemode: false,
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null },
            type: 'test.event.default.async' as Stripe.Event.Type,
          } as Stripe.Event);
        }
      );
      
      // Set Deno.env.get('STRIPE_WEBHOOK_SECRET') for the adapter's constructor
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      // Set other env vars if the adapter constructor or its dependencies use them.
      // For example, if SUPABASE_INTERNAL_FUNCTIONS_URL is used by the HandlerContext in StripePaymentAdapter:
      mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';
  
  
      realStripePaymentAdapter = new StripePaymentAdapter(
        stripeInstance,
        mockSupabaseInstance as any as SupabaseClient<Database>,
        mockTokenWalletServiceInstance.instance,
        MOCK_STRIPE_WEBHOOK_SECRET
      );
      
      configuredSourceForAdapterStub = 'stripe'; // Ensure factory returns our real adapter for 'stripe'
      currentMockAdapter = null; // Explicitly nullify to ensure fakePaymentAdapterFactory uses realStripePaymentAdapter
    });
  
    afterEach(() => {
      // Combined cleanup: Original inner afterEach + relevant parts of outer afterEach
      mockTokenWalletServiceInstance.clearStubs();
      // mockSupabaseInstance doesn't have a clearStubs, re-created in beforeEach.
      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
      // No need to restore fileScopeDenoEnvGetStub here, managed by afterAll
      // paymentAdapterFactorySpy is re-initialized in beforeEach, so no explicit restore here.
    });
  
    // --- invoice.payment_succeeded Event Tests ---
    describe('invoice.payment_succeeded event', () => {
      let recordTransactionSpy: Spy<ITokenWalletService, Parameters<ITokenWalletService['recordTransaction']>, Promise<TokenWalletTransaction>>;
      let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource> | null = null;
  
      beforeEach(() => {
        if (mockTokenWalletServiceInstance && mockTokenWalletServiceInstance.stubs.recordTransaction) {
            recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        }
        dbCounters.paymentTransactionsUpsertCallCount = 0;
        dbCounters.capturedPaymentTransactionsUpsert = null;
        dbCounters.paymentTransactionsSelectData = null; 
        dbCounters.userSubscriptionsSelectData = [{ 
          user_id: 'user_invoice_ps_test_int',
          stripe_customer_id: 'cus_invoice_ps_test_int' 
        }];
        // Corrected mock data for subscription_plans
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: 'price_id_for_sub_invoice_ps_test_int', // Use the literal string value
          item_id_internal: 'item_id_for_invoice_ps_renewal', 
          tokens_awarded: 3000, 
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for Renewal"
        }];
        // recordTransactionSpy.resetHistory(); // Spy is re-created
  
        // The mockSupabaseInstance from the top-level beforeEach will be used.
        // Ensure token_wallets select mock is correctly configured if needed for these specific tests,
        // potentially by adding it to the main mockSupabaseInstance or managing it via dbCounters if simple enough.
        // For now, assuming the global mockSupabaseInstance is sufficient.
        // The specific token_wallets.select mock from original lines 910-916 might need to be moved
        // to the main mockSupabaseInstance setup or handled differently.

        // The specific mock for token_wallets.select (previously part of the deleted block)
        // might be needed. If so, it should be added to the main createMockSupabaseClient call
        // in the top-level beforeEach if it's generally applicable to all invoice tests,
        // or its logic managed via dbCounters if it's very specific to payment_succeeded tests.
        // For now, we are just deleting the redundant mockSupabaseInstance creation here.
        // If tests fail due to missing token_wallets mock, we will address it then.

        const stripeSubscriptionId = 'sub_invoice_ps_test_int';
        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore(); // Should be safe here as it's in the same scope
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
          if (id === stripeSubscriptionId) {
            const now = Math.floor(Date.now() / 1000);
            return Promise.resolve({
              // Core Subscription fields (mandatory or used by handler)
              object: 'subscription' as const,
              id: stripeSubscriptionId,
              customer: 'cus_invoice_ps_test_int',
              status: 'active' as Stripe.Subscription.Status,
              items: {
                object: 'list' as const,
                data: [
                  {
                    object: 'subscription_item' as const,
                    id: 'si_mock_item_for_invoice_ps', // Subscription Item ID
                    price: {
                      object: 'price' as const,
                      id: 'price_for_invoice_ps',        // Used by handler
                      product: 'prod_for_invoice_ps',    // Used by handler (can be string or Stripe.Product)
                      active: true,                      // Mandatory for Price
                      currency: 'usd',                   // Mandatory for Price
                      // unit_amount: 7500,              // Example, if needed
                      // type: 'recurring',              // Example, if needed
                    } as Stripe.Price,
                    quantity: 1,                         // Good default for SubscriptionItem
                    created: now - 5000,                 // Mandatory for SubscriptionItem (timestamp)
                    subscription: stripeSubscriptionId,  // Link to parent subscription
                    // plan field is also often part of SubscriptionItem, but we'll keep it minimal if not strictly causing type errors
                    // plan: { object: 'plan' as const, id: 'plan_mock_for_si', active: true, amount: 7500, currency: 'usd', interval: 'month' as Stripe.Plan.Interval, product: 'prod_for_invoice_ps' } as Stripe.Plan,
                  } as Stripe.SubscriptionItem,
                ],
                has_more: false,
                url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`, // Example URL
              },
              cancel_at_period_end: false, // Mandatory for Subscription
              created: now - 20000,       // Mandatory for Subscription (timestamp)
              current_period_end: now + 10000,   // Mandatory for Subscription (timestamp) - Used by handler
              current_period_start: now - 10000, // Mandatory for Subscription (timestamp) - Used by handler
              livemode: false,            // Mandatory for Subscription
              start_date: now - 20000,    // Mandatory for Subscription (timestamp)
              metadata: { plan_id: 'plan_id_from_sub_meta_if_needed_by_handler' }, // Used by handler
              
              // Other non-null, simple defaults often present on Stripe.Subscription
              // collection_method: 'charge_automatically' as Stripe.Subscription.CollectionMethod, // Common default
              // default_tax_rates: [], // Common default
  
              // lastResponse is part of Stripe.Response<T>
              lastResponse: {
                headers: {},
                requestId: 'req_mock_retrieve_ips',
                statusCode: 200,
              },
            } as unknown as Stripe.Response<Stripe.Subscription>); // Cast to unknown first
          }
          throw new Error(`Mock subscriptions.retrieve called with unexpected ID: ${id}`);
        });
      });
  
      afterEach(() => { // This afterEach is now correctly scoped for retrieveSubscriptionStub
        if (recordTransactionSpy && !recordTransactionSpy.restored) {
            recordTransactionSpy.restore();
        }
        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
            retrieveSubscriptionStub.restore();
        }
      });
  
      it('should update payment_transactions, award tokens for renewal, and return 200', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_test_int';
        const stripeCustomerId = 'cus_invoice_ps_test_int';
        const userId = 'user_invoice_ps_test_int'; // Corrected to match userSubscriptionsSelectData
        const tokensToAward = 3000; // From the subscription plan associated with the invoice
        const internalPaymentIdForRenewal = 'pt_renewal_' + Date.now(); // Simulate new PT record for renewal
        const invoiceId = 'in_test_invoice_ps';
  
        // Mock a pre-existing payment_transaction (PENDING) if the handler tries to update one based on invoice metadata.
        // Or, if it creates a NEW one, test that. Assume for now it might create one if not found.
        // Adapter logic: checks for existing payment_transaction by gateway_transaction_id (invoice.id).
        // If not found, it creates one. If found and PENDING, it updates.
        // For this test, assume it's a new renewal, so no pre-existing PT with this invoice.id.
        dbCounters.capturedPaymentTransactionsInsert = []; // Clear any previous for this test
  
        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId,
          status: 'paid',
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
          customer_email: 'user@example.com', // For fetching user_id if needed
          lines: { // ADDED: invoice lines for plan lookup
            object: 'list' as const,
            data: [
              {
                id: 'il_mock_line_item_1',
                object: 'line_item' as const,
                price: {
                  id: 'price_id_for_sub_invoice_ps_test_int', // Matches dbCounters setup
                  object: 'price' as const,
                  active: true,
                  currency: 'usd',
                  // other necessary Price fields if handler uses them
                } as Stripe.Price,
                // other necessary LineItem fields if handler uses them
                quantity: 1,
              } as Stripe.InvoiceLineItem
            ],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
          metadata: { user_id: userId }, // Removed tokens_awarded_override as handler doesn't use it
          // If the adapter uses subscription object from invoice:
          // subscription_details: { metadata: { plan_id: 'our_internal_plan_id_for_tokens' } }
        };
        const mockEvent = {
          id: `evt_invoice_ps_${invoiceId}`,
          type: 'invoice.payment_succeeded' as Stripe.Event.Type,
          data: { object: mockInvoiceSucceeded as Stripe.Invoice },
        } as Stripe.Event;
  
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));
  
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, "mock_ptx_id_inserted_1_0");
  
        // Check if a new payment_transaction was inserted OR an existing one updated
        // Based on current adapter: it tries to find by gateway_transaction_id, then updates or inserts.
        // Since we didn't mock a find, it should insert.
        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "payment_transactions insert expected");
        const insertedPT = dbCounters.capturedPaymentTransactionsInsert?.[0];
        assertExists(insertedPT);
        // assertEquals(insertedPT.status, 'COMPLETED'); // Old assertion based on initial insert
        assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'COMPLETED', "PT status after update should be COMPLETED"); // New assertion
        assertEquals(insertedPT.gateway_transaction_id, invoiceId);
        assertEquals(insertedPT.tokens_to_award, tokensToAward);
        assertEquals(insertedPT.user_id, userId);
        
        assertEquals(recordTransactionSpy.calls.length, 1);
        const txArgs = recordTransactionSpy.calls[0].args[0];
        // Assuming walletId is derived from userId
        assert(txArgs.walletId.includes(userId), "Wallet ID for token award seems incorrect");
        assertEquals(txArgs.type, 'CREDIT_PURCHASE'); // Or 'CREDIT_RENEWAL'
        assertEquals(txArgs.amount, tokensToAward.toString());
        assertEquals(txArgs.relatedEntityId, "mock_ptx_id_inserted_1_0");
      });
    });
  
    // --- invoice.payment_failed Event Tests ---
    describe('invoice.payment_failed event', () => {
      let retrieveSubscriptionStubPf: Stub<Stripe.SubscriptionsResource> | null = null;
  
      // Constants for the "main/original" test in this block
      const stripeSubscriptionIdPF_Main = 'sub_invoice_pf_test_int_MAIN';
      const stripeCustomerIdPF_Main = 'cus_invoice_pf_test_int_MAIN';
      const userIdPF_Main = 'user_invoice_pf_test_MAIN';
      const invoiceIdPF_Main = 'in_test_invoice_pf_MAIN';
  
      // Constants for the "MOVED FROM PS BLOCK" test
      const stripeSubscriptionIdPF_Moved = 'sub_invoice_pf_test_int_MOVED';
      const stripeCustomerIdPF_Moved = 'cus_invoice_pf_test_int_MOVED';
      const userIdPF_Moved = 'user_invoice_pf_test_MOVED';
      const invoiceIdPF_Moved = 'in_test_invoice_pf_MOVED';
  
      // Constants for "Scenario A"
      const stripeSubscriptionIdPF_A = 'sub_invoice_pf_test_int_A';
      const stripeCustomerIdPF_A = 'cus_invoice_pf_test_int_A';
      const userIdPF_A = 'user_invoice_pf_test_A';
      const invoiceIdPF_A = 'in_test_invoice_pf_A';
  
      // Constants for "Scenario B"
      const stripeSubscriptionIdPF_B = 'sub_invoice_pf_test_int_B';
      const stripeCustomerIdPF_B = 'cus_invoice_pf_test_int_B';
      const userIdPF_B = 'user_invoice_pf_test_B';
      const invoiceIdPF_B = 'in_test_invoice_pf_B';
  
      let subscriptionDetailsMain: Partial<Stripe.Subscription>;
      let subscriptionDetailsMoved: Partial<Stripe.Subscription>;
      let subscriptionDetailsA: Partial<Stripe.Subscription>;
      let subscriptionDetailsB: Partial<Stripe.Subscription>;
  
  
      beforeEach(() => {
        dbCounters.paymentTransactionsUpsertCallCount = 0;
        dbCounters.capturedPaymentTransactionsUpsert = null;
        dbCounters.paymentTransactionsUpdateCallCount = 0;
        dbCounters.paymentTransactionsEqCallCount = 0;
        dbCounters.userSubscriptionsUpdateCallCount = 0;
        dbCounters.userSubscriptionsEqCallCount = 0;
        dbCounters.paymentTransactionsSelectData = null; // Clear before each test
        dbCounters.userSubscriptionsSelectData = null;   // Clear before each test
  
        const now = Math.floor(Date.now() / 1000);
  
        subscriptionDetailsMain = {
          object: 'subscription' as const,
          id: stripeSubscriptionIdPF_Main, customer: stripeCustomerIdPF_Main, status: 'past_due' as Stripe.Subscription.Status,
          items: { object: 'list' as const, data: [{ id: 'si_main', price: { id: 'price_main', product: 'prod_main' } } as Stripe.SubscriptionItem], url: '/v1/items', has_more: false },
          current_period_start: now - 10000, current_period_end: now + 10000, cancel_at_period_end: false,
        };
        subscriptionDetailsMoved = {
          object: 'subscription' as const,
          id: stripeSubscriptionIdPF_Moved, customer: stripeCustomerIdPF_Moved, status: 'active' as Stripe.Subscription.Status, // was active before failure
          items: { object: 'list' as const, data: [{ id: 'si_moved', price: { id: 'price_moved', product: 'prod_moved' } } as Stripe.SubscriptionItem], url: '/v1/items', has_more: false },
          current_period_start: now - 10000, current_period_end: now + 10000, cancel_at_period_end: false,
        };
        subscriptionDetailsA = {
          object: 'subscription' as const,
          id: stripeSubscriptionIdPF_A, customer: stripeCustomerIdPF_A, status: 'past_due' as Stripe.Subscription.Status,
          items: { object: 'list' as const, data: [{ id: 'si_A', price: { id: 'price_A', product: 'prod_A' } } as Stripe.SubscriptionItem], url: '/v1/items', has_more: false },
          current_period_start: now - 10000, current_period_end: now + 10000, cancel_at_period_end: false,
        };
        subscriptionDetailsB = {
          object: 'subscription' as const,
          id: stripeSubscriptionIdPF_B, customer: stripeCustomerIdPF_B, status: 'unpaid' as Stripe.Subscription.Status,
          items: { object: 'list' as const, data: [{ id: 'si_B', price: { id: 'price_B', product: 'prod_B' } } as Stripe.SubscriptionItem], url: '/v1/items', has_more: false },
          current_period_start: now - 10000, current_period_end: now + 10000, cancel_at_period_end: false,
        };
  
        if (retrieveSubscriptionStubPf && !retrieveSubscriptionStubPf.restored) retrieveSubscriptionStubPf.restore();
        retrieveSubscriptionStubPf = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
          console.log(`[DEBUG retrieveStubPF] Attempting to retrieve subscription with id: "${id}" (type: ${typeof id})`);
          console.log(`[DEBUG retrieveStubPF] Comparing with Main: "${stripeSubscriptionIdPF_Main}"`);
          console.log(`[DEBUG retrieveStubPF] Comparing with MOVED: "${stripeSubscriptionIdPF_Moved}"`);
          console.log(`[DEBUG retrieveStubPF] Comparing with PF_A: "${stripeSubscriptionIdPF_A}"`);
          console.log(`[DEBUG retrieveStubPF] Comparing with PF_B: "${stripeSubscriptionIdPF_B}"`);
  
          if (id === stripeSubscriptionIdPF_Main) {
            console.log('[DEBUG retrieveStubPF] Matched stripeSubscriptionIdPF_Main');
            return Promise.resolve(subscriptionDetailsMain as unknown as Stripe.Response<Stripe.Subscription>);
          } else if (id === stripeSubscriptionIdPF_Moved) {
            console.log('[DEBUG retrieveStubPF] Matched stripeSubscriptionIdPF_Moved');
            return Promise.resolve(subscriptionDetailsMoved as unknown as Stripe.Response<Stripe.Subscription>);
          } else if (id === stripeSubscriptionIdPF_A) {
            console.log('[DEBUG retrieveStubPF] Matched stripeSubscriptionIdPF_A');
            return Promise.resolve(subscriptionDetailsA as unknown as Stripe.Response<Stripe.Subscription>);
          } else if (id === stripeSubscriptionIdPF_B) {
            console.log('[DEBUG retrieveStubPF] Matched stripeSubscriptionIdPF_B');
            return Promise.resolve(subscriptionDetailsB as unknown as Stripe.Response<Stripe.Subscription>);
          }
          console.error(`[DEBUG retrieveStubPF] Mock subscriptions.retrieve (PF) called with UNEXPECTED ID: "${id}". NO MATCH!`);
          throw new Error(`Mock subscriptions.retrieve (PF) called with unexpected ID: \${id}. NO MATCH!`);
        });
      });
  
      afterEach(() => {
        if (retrieveSubscriptionStubPf && !retrieveSubscriptionStubPf.restored) {
          retrieveSubscriptionStubPf.restore();
        }
      });
  
      it('should update payment_transactions and user_subscriptions statuses, and return 200', async () => {
        // Uses PF_Main constants
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userIdPF_Main, stripe_customer_id: stripeCustomerIdPF_Main,
        } as Partial<Tables<'user_subscriptions'>>];
        dbCounters.paymentTransactionsSelectData = [{
          id: 'pt_for_failed_invoice_MAIN', user_id: userIdPF_Main, target_wallet_id: 'wallet_for_' + userIdPF_Main,
          payment_gateway_id: 'stripe', gateway_transaction_id: invoiceIdPF_Main, status: 'PENDING', tokens_to_award: 100,
        } as Partial<Tables<'payment_transactions'>>];
  
        const mockInvoiceFailed: Partial<Stripe.Invoice> = {
          id: invoiceIdPF_Main, status: 'open', subscription: stripeSubscriptionIdPF_Main,
          customer: stripeCustomerIdPF_Main, metadata: { user_id: userIdPF_Main },
        };
        const mockEvent = {
          id: `evt_invoice_pf_${invoiceIdPF_Main}`, type: 'invoice.payment_failed' as Stripe.Event.Type,
          data: { object: mockInvoiceFailed as Stripe.Invoice },
        } as Stripe.Event;
  
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));
  
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-pf-main' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        const processedPaymentTransactionId = dbCounters.capturedPaymentTransactionsUpsert?.[0]?.id || dbCounters.capturedPaymentTransactionsUpdate?.id || 'pt_for_failed_invoice_MAIN';
        assertEquals(responseBody.transactionId, processedPaymentTransactionId);
  
        assert(dbCounters.paymentTransactionsUpdateCallCount > 0 || dbCounters.paymentTransactionsUpsertCallCount > 0, "PT Update or Upsert should be called");
        const finalPTState = dbCounters.capturedPaymentTransactionsUpdate || dbCounters.capturedPaymentTransactionsUpsert?.[0];
        assertExists(finalPTState, "Final PT state not captured");
        assertEquals(finalPTState.status, 'FAILED');
  
  
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "user_subscriptions update count for MAIN scenario");
        assertExists(dbCounters.capturedUserSubscriptionsUpdate, "Captured US update for MAIN scenario");
        assert(['past_due', 'unpaid'].includes(dbCounters.capturedUserSubscriptionsUpdate.status ?? ""), "US status for MAIN scenario");
      });
  
      it('should handle invoice.payment_failed (MOVED FROM PS BLOCK), update PT and US, and return 200', async () => {
        // Uses PF_Moved constants
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userIdPF_Moved, stripe_customer_id: stripeCustomerIdPF_Moved,
        } as Partial<Tables<'user_subscriptions'>>];
        dbCounters.paymentTransactionsSelectData = [{
          id: 'pt_for_failed_invoice_MOVED', user_id: userIdPF_Moved, target_wallet_id: 'wallet_for_' + userIdPF_Moved,
          payment_gateway_id: 'stripe', gateway_transaction_id: invoiceIdPF_Moved, status: 'PENDING', tokens_to_award: 150,
        } as Partial<Tables<'payment_transactions'>>];
  
        const mockInvoiceFailed: Partial<Stripe.Invoice> = {
          id: invoiceIdPF_Moved, status: 'open', subscription: stripeSubscriptionIdPF_Moved,
          customer: stripeCustomerIdPF_Moved, metadata: { user_id: userIdPF_Moved },
        };
        const mockEvent = {
          id: `evt_invoice_pf_${invoiceIdPF_Moved}`, type: 'invoice.payment_failed' as Stripe.Event.Type,
          data: { object: mockInvoiceFailed as Stripe.Invoice },
        } as Stripe.Event;
  
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));
  
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-pf-moved' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        const processedPaymentTransactionId = dbCounters.capturedPaymentTransactionsUpsert?.[0]?.id || dbCounters.capturedPaymentTransactionsUpdate?.id || 'pt_for_failed_invoice_MOVED';
        assertEquals(responseBody.transactionId, processedPaymentTransactionId);
        
        assert(dbCounters.paymentTransactionsUpdateCallCount > 0 || dbCounters.paymentTransactionsUpsertCallCount > 0, "PT Update or Upsert should be called (MOVED)");
        const finalPTState = dbCounters.capturedPaymentTransactionsUpdate || dbCounters.capturedPaymentTransactionsUpsert?.[0];
        assertExists(finalPTState, "Final PT state not captured (MOVED)");
        assertEquals(finalPTState.status, 'FAILED');
  
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "user_subscriptions update count for MOVED scenario");
        assertExists(dbCounters.capturedUserSubscriptionsUpdate, "Captured US update for MOVED scenario");
        assertEquals(dbCounters.capturedUserSubscriptionsUpdate.status, 'active', "US status for MOVED scenario should reflect Stripe API mock (active)");
      });
  
      it('should update payment_transactions and user_subscriptions statuses, and return 200 (Scenario A)', async () => {
        // Uses PF_A constants
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userIdPF_A, stripe_customer_id: stripeCustomerIdPF_A,
        } as Partial<Tables<'user_subscriptions'>>];
        dbCounters.paymentTransactionsSelectData = [{
          id: 'pt_for_failed_invoice_A', user_id: userIdPF_A, target_wallet_id: 'wallet_for_' + userIdPF_A,
          payment_gateway_id: 'stripe', gateway_transaction_id: invoiceIdPF_A, status: 'PENDING', tokens_to_award: 100,
        } as Partial<Tables<'payment_transactions'>>];
        
        const mockInvoiceFailed: Partial<Stripe.Invoice> = {
          id: invoiceIdPF_A, status: 'open', subscription: stripeSubscriptionIdPF_A,
          customer: stripeCustomerIdPF_A, metadata: { user_id: userIdPF_A },
        };
        const mockEvent = {
          id: `evt_invoice_pf_${invoiceIdPF_A}`, type: 'invoice.payment_failed' as Stripe.Event.Type,
          data: { object: mockInvoiceFailed as Stripe.Invoice },
        } as Stripe.Event;
  
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));
  
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-pf-A' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        const processedPaymentTransactionId = dbCounters.capturedPaymentTransactionsUpsert?.[0]?.id || dbCounters.capturedPaymentTransactionsUpdate?.id || 'pt_for_failed_invoice_A';
        assertEquals(responseBody.transactionId, processedPaymentTransactionId);
  
        assert(dbCounters.paymentTransactionsUpdateCallCount > 0 || dbCounters.paymentTransactionsUpsertCallCount > 0, "PT Update or Upsert should be called (Scenario A)");
        const finalPTState = dbCounters.capturedPaymentTransactionsUpdate || dbCounters.capturedPaymentTransactionsUpsert?.[0];
        assertExists(finalPTState, "Final PT state not captured (Scenario A)");
        assertEquals(finalPTState.status, 'FAILED');
  
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "user_subscriptions update count for Scenario A");
        assertExists(dbCounters.capturedUserSubscriptionsUpdate, "Captured US update for Scenario A");
        assert(['past_due', 'unpaid'].includes(dbCounters.capturedUserSubscriptionsUpdate.status ?? ""), "US status for Scenario A");
      });
  
  
      it('should update payment_transactions and user_subscriptions statuses, and return 200 (second failure scenario)', async () => {
        // Uses PF_B constants
        const stripeSubscriptionId = stripeSubscriptionIdPF_B; // Local const for clarity within test
        const stripeCustomerId = stripeCustomerIdPF_B;
        const userId = userIdPF_B;
        const invoiceId = invoiceIdPF_B;
        // ... existing code ...
      });
    });
  
  });