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
    capturedInsertData: null as TablesInsert<'subscription_plans'>[] | null,
    insertCallCount: 0,
    capturedUpdateDataManual: null as Partial<Tables<'subscription_plans'>> | null,
    updateCallCount: 0,
    eqCallCount: 0,
    neqCallCount: 0,
    // Counters and capturers for payment_transactions
    capturedPaymentTransactionsInsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsInsertCallCount: 0,
    capturedPaymentTransactionsUpdate: null as Partial<Tables<'payment_transactions'>> | null,
    paymentTransactionsUpdateCallCount: 0,
    paymentTransactionsEqCallCount: 0, // For specific updates
    // Counters and capturers for user_subscriptions
    capturedUserSubscriptionsInsert: null as TablesInsert<'user_subscriptions'>[] | null,
    userSubscriptionsInsertCallCount: 0,
    capturedUserSubscriptionsUpsert: null as TablesInsert<'user_subscriptions'>[] | null,
    userSubscriptionsUpsertCallCount: 0,
    capturedUserSubscriptionsUpdate: null as Partial<Tables<'user_subscriptions'>> | null,
    userSubscriptionsUpdateCallCount: 0,
    userSubscriptionsEqCallCount: 0, // For specific updates
    paymentTransactionsUpsertCallCount: 0,
    capturedPaymentTransactionsUpsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsSelectData: null as Partial<Tables<'payment_transactions'>>[] | null, // Corrected type
    userSubscriptionsSelectData: null as Partial<Tables<'user_subscriptions'>>[] | null, // Corrected type
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
  
  describe('Webhook Router (handleWebhookRequestLogic)', () => {
    let mockAdminClient: SupabaseClient<Database>;
    let mockTokenWalletService: ITokenWalletService;
    
    // This will be a spy acting as the factory
    let paymentAdapterFactorySpy: Spy<typeof adapterFactory, Parameters<typeof adapterFactory.getPaymentAdapter>, ReturnType<typeof adapterFactory.getPaymentAdapter>>;
    // denoEnvGetStub is removed, will use fileScopeDenoEnvGetStub via Deno.env.get
  
    let dependencies: WebhookHandlerDependencies;
    // mockEnvVars is removed, will use mockEnvVarsForFileScope
  
    // Test-scoped variables to control behavior of the single getPaymentAdapterStub
    let currentMockAdapter: IPaymentGatewayAdapter | null = null;
    let configuredSourceForAdapterStub: string | null = null;
  
    // Variables for real StripePaymentAdapter testing
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSupabaseInstance: IMockSupabaseClient;
    let mockTokenWalletServiceInstance: MockTokenWalletService;
    let stripeInstance: Stripe;
    let constructEventStub: Stub<Stripe.Webhooks>;
  
    beforeEach(() => {
      mockAdminClient = {} as SupabaseClient<Database>; 
      mockTokenWalletService = {} as ITokenWalletService;
  
      mockEnvVarsForFileScope = {}; // Reset for each test in this suite
      // No need to create/restore fileScopeDenoEnvGetStub here, managed by beforeAll/afterAll
  
      const fakePaymentAdapterFactory = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: ITokenWalletService): IPaymentGatewayAdapter | null => {
        if (configuredSourceForAdapterStub === source) {
          // If currentMockAdapter is explicitly set (for generic adapter tests), use it.
          // Otherwise, if we are testing 'stripe' and realStripePaymentAdapter is initialized, use that.
          if (currentMockAdapter) return currentMockAdapter;
          if (source === 'stripe' && realStripePaymentAdapter) return realStripePaymentAdapter;
        }
        // console.warn(`paymentAdapterFactorySpy called with unconfigured source: ${source}. Configured for: ${configuredSourceForAdapterStub}`);
        return null; // Default to null if not specifically configured for the source
      };
      paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);
  
      dependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockTokenWalletService,
        paymentAdapterFactory: paymentAdapterFactorySpy as unknown as PaymentAdapterFactoryFn,
        getEnv: (key: string) => Deno.env.get(key), // This will now use the fileScopeDenoEnvGetStub
      };
  
      // Reset controllers for paymentAdapterFactorySpy behavior
      currentMockAdapter = null;
      configuredSourceForAdapterStub = null;
      // realStripePaymentAdapter will be setup in specific describe blocks if needed
    });
  
    afterEach(() => {
      // No need to restore fileScopeDenoEnvGetStub here, managed by afterAll
      // paymentAdapterFactorySpy restoration (if it were a method spy) would go here or be handled by its re-creation.
      // For current paymentAdapterFactorySpy (spy on anonymous fn), re-init in beforeEach is fine.
      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
    });

    // New describe block for testing with the real StripePaymentAdapter
    describe('Stripe Event Processing with Real StripePaymentAdapter', () => {
      beforeEach(() => {
        // Reset captured data and counts for each test in this suite
        dbCounters.capturedInsertData = null;
        dbCounters.insertCallCount = 0;
        dbCounters.capturedUpdateDataManual = null;
        dbCounters.updateCallCount = 0;
        dbCounters.eqCallCount = 0;
        dbCounters.neqCallCount = 0;
        // Reset new counters
        dbCounters.capturedPaymentTransactionsInsert = null;
        dbCounters.paymentTransactionsInsertCallCount = 0;
        dbCounters.capturedPaymentTransactionsUpdate = null;
        dbCounters.paymentTransactionsUpdateCallCount = 0;
        dbCounters.paymentTransactionsEqCallCount = 0;
        dbCounters.capturedUserSubscriptionsInsert = null;
        dbCounters.userSubscriptionsInsertCallCount = 0;
        dbCounters.capturedUserSubscriptionsUpsert = null;
        dbCounters.userSubscriptionsUpsertCallCount = 0;
        dbCounters.capturedUserSubscriptionsUpdate = null;
        dbCounters.userSubscriptionsUpdateCallCount = 0;
        dbCounters.userSubscriptionsEqCallCount = 0;
        dbCounters.paymentTransactionsUpsertCallCount = 0;
        dbCounters.capturedPaymentTransactionsUpsert = null;
        dbCounters.paymentTransactionsSelectData = null; // Reset for this suite
        dbCounters.userSubscriptionsSelectData = [{ 
          user_id: 'user_invoice_ps_test_int', // Matches userId in test
          stripe_customer_id: 'cus_invoice_ps_test_int' // Added for lookup
        }];
        dbCounters.subscriptionPlansSelectData = [{ 
            stripe_price_id: 'price_for_invoice_ps', // Added for lookup
            item_id_internal: 'item_id_for_invoice_ps', 
            tokens_awarded: 7500 
        }];
        // recordTransactionSpy.resetHistory(); // Spy is re-created
  
  
        mockSupabaseInstance = createMockSupabaseClient({
          genericMockResults: {
            subscription_plans: {
              insert: (state) => { 
                dbCounters.insertCallCount++;
                dbCounters.capturedInsertData = state.insertData as TablesInsert<'subscription_plans'>[];
                return Promise.resolve({ data: dbCounters.capturedInsertData, error: null, count: dbCounters.capturedInsertData?.length || 0, status: 201, statusText: 'Created' });
              },
              upsert: (state) => { 
                dbCounters.insertCallCount++; 
                const upsertValues = Array.isArray(state.upsertData) 
                  ? state.upsertData 
                  : [state.upsertData].filter(d => d !== null && d !== undefined); 
                
                const now = new Date().toISOString();
                const dataWithTimestamps = upsertValues.map(item => ({
                  ...(item as object), 
                  created_at: now,
                  updated_at: now,
                }));
                
                dbCounters.capturedInsertData = dataWithTimestamps as TablesInsert<'subscription_plans'>[];
                return Promise.resolve({ data: dbCounters.capturedInsertData, error: null, count: dbCounters.capturedInsertData.length, status: 200, statusText: 'OK (Upserted)' });
              },
              update: (state) => { 
                dbCounters.updateCallCount++;
  
                let testCondition = "unknown_update_condition";
                let eqFilterMatchedThisCall = false;
                let neqFilterMatchedThisCall = false; 
  
                const productUpdatedId = 'prod_test_product_updated_int';
                const productDeletedId = 'prod_test_product_deleted_int';
                const priceUpdatedId = 'price_test_price_updated_int';
                const priceDeletedId = 'price_test_price_deleted_int';
                const freePriceId = 'price_FREE';
  
                const hasEqProductUpdated = state.filters?.some(f => f.column === 'stripe_product_id' && f.value === productUpdatedId && f.type === 'eq');
                const hasEqProductDeleted = state.filters?.some(f => f.column === 'stripe_product_id' && f.value === productDeletedId && f.type === 'eq');
                const hasNeqPriceFree = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === freePriceId && f.type === 'neq');
                const hasEqPriceUpdated = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === priceUpdatedId && f.type === 'eq');
                const hasEqPriceDeleted = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === priceDeletedId && f.type === 'eq');
  
                if (hasEqProductUpdated && hasNeqPriceFree) {
                  testCondition = "product.updated";
                  eqFilterMatchedThisCall = true;
                  neqFilterMatchedThisCall = true;
                } else if (hasEqProductDeleted && hasNeqPriceFree) {
                  testCondition = "product.deleted";
                  eqFilterMatchedThisCall = true;
                  neqFilterMatchedThisCall = true;
                } else if (hasEqPriceUpdated) {
                  testCondition = "price.updated";
                  eqFilterMatchedThisCall = true;
                } else if (hasEqPriceDeleted) {
                  testCondition = "price.deleted_price_event";
                  eqFilterMatchedThisCall = true;
                }
                
                if (eqFilterMatchedThisCall) {
                  dbCounters.eqCallCount++;
                  if (neqFilterMatchedThisCall) {
                    dbCounters.neqCallCount++;
                  }
                  dbCounters.capturedUpdateDataManual = state.updateData as Partial<Tables<'subscription_plans'>>;
                  
                  let returnCount = 0;
                  if ((testCondition === "product.updated" || testCondition === "product.deleted") && eqFilterMatchedThisCall && neqFilterMatchedThisCall) {
                    returnCount = 1; 
                  } else if ((testCondition === "price.updated" || testCondition === "price.deleted_price_event") && eqFilterMatchedThisCall) {
                    returnCount = 1;
                  }
                  if (returnCount === 0 && eqFilterMatchedThisCall) {
                      returnCount = 1;
                  }
                  return Promise.resolve({ 
                    data: returnCount > 0 ? [state.updateData as any] : null, 
                    error: null, 
                    count: returnCount, 
                    status: 200, 
                    statusText: 'OK (Mock Update)' 
                  });
                }
                
                return Promise.resolve({ data: null, error: null, count: 0, status: 200, statusText: 'OK (Mock Update - No Filter Match)' });
              },
              select: (state) => { // Modified to handle item_id_internal lookup
                if (state.filters?.some(f => f.column === 'item_id_internal' && f.value === 'test_subscription_item_id' && f.type === 'eq')) {
                  // Ensure data is an array, even for a single result, to match Supabase types
                  return Promise.resolve({ data: [{ id: 'plan_sub_test_integration' }], error: null, count: 1, status: 200, statusText: 'OK (Found Plan by item_id_internal)' });
                }
                return Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Empty Select)'});
              },
              delete: () => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK'}),
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
              delete: () => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK'}),
            },
            user_subscriptions: {
              insert: (state) => {
                dbCounters.userSubscriptionsInsertCallCount++;
                dbCounters.capturedUserSubscriptionsInsert = state.insertData as TablesInsert<'user_subscriptions'>[];
                return Promise.resolve({ data: dbCounters.capturedUserSubscriptionsInsert, error: null, count: dbCounters.capturedUserSubscriptionsInsert?.length || 0, status: 201, statusText: 'Created' });
              },
              upsert: (state) => {
                dbCounters.userSubscriptionsUpsertCallCount++;
                const upsertDataArray = Array.isArray(state.upsertData) ? state.upsertData : [state.upsertData];
                dbCounters.capturedUserSubscriptionsUpsert = upsertDataArray as TablesInsert<'user_subscriptions'>[];
                return Promise.resolve({ data: dbCounters.capturedUserSubscriptionsUpsert, error: null, count: dbCounters.capturedUserSubscriptionsUpsert.length, status: 200, statusText: 'OK (Upserted)' });
              },
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
                      (sub) => (sub as any).stripe_customer_id === customerIdFilter.value
                    );
                    if (matchingUserSub) {
                      // .single() is likely used by the handler, so return a single object
                      return Promise.resolve({ data: matchingUserSub as any, error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single User Sub by Customer ID)' });
                    } else {
                      // If filtered by customerId but no match, and .single() is implied, return PGRST116
                      return Promise.resolve({ data: null, error: { name: 'PGRST116', message: 'Query returned no rows (mock customerId filter)', code: 'PGRST116'}, count: 0, status: 406, statusText: 'Not Acceptable (Mock)'});
                    }
                  }
                  // Generic fallback if no specific customerId filter for this mock logic
                  return Promise.resolve({ data: dbCounters.userSubscriptionsSelectData || [], error: null, count: (dbCounters.userSubscriptionsSelectData || []).length, status: 200, statusText: 'OK (Mock Select User Subs Default)' });
               },
              delete: () => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK'}),
            }
          }
        }).client;
        
        mockTokenWalletServiceInstance = createMockTokenWalletService();
        stripeInstance = new Stripe('sk_test_DUMMYKEYFORTESTING', { apiVersion: '2023-10-16' });
  
        // IMPORTANT: Stub Stripe.webhooks.constructEvent
        // This is crucial because the adapter calls it. We'll control the event object it returns.
        // Default stub for this describe block
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', // Changed to constructEventAsync
          async (payload: string | Buffer, sig: string | string[] | Buffer, secret: string): Promise<Stripe.Event> => { // Made async, returns Promise
            console.log(`Default constructEventAsyncStub called with payload: ${payload}, sig: ${sig}, secret: ${secret}`);
            return Promise.resolve({ // Wrapped in Promise.resolve
              id: 'evt_default_constructed',
              object: 'event' as const,
              api_version: '2020-08-27',
              created: Math.floor(Date.now() / 1000),
              data: { object: { id: 'default_data_obj'} }, 
              livemode: false,
              pending_webhooks: 0,
              request: { id: null, idempotency_key: null },
              type: 'test.event.default' as Stripe.Event.Type,
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
          mockSupabaseInstance as any as SupabaseClient<Database>, // Cast to satisfy constructor type
          mockTokenWalletServiceInstance.instance, // Corrected: Pass the instance
          MOCK_STRIPE_WEBHOOK_SECRET // The adapter's constructor expects the secret
        );
        
        configuredSourceForAdapterStub = 'stripe'; // Ensure factory returns our real adapter for 'stripe'
        currentMockAdapter = null; // Explicitly nullify to ensure fakePaymentAdapterFactory uses realStripePaymentAdapter
      });
  
      afterEach(() => {
        mockTokenWalletServiceInstance.clearStubs();
        // mockSupabaseInstance doesn't have a clearStubs, re-created in beforeEach.
        if (constructEventStub && !constructEventStub.restored) {
          constructEventStub.restore();
        }
      });
     
      // --- checkout.session.completed Event Tests ---
      describe('checkout.session.completed event', () => {
        let recordTransactionSpy: Spy<ITokenWalletService, Parameters<ITokenWalletService['recordTransaction']>, Promise<TokenWalletTransaction>>;
        let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource> | null = null; // Initialize to null
  
        beforeEach(() => {
          if (mockTokenWalletServiceInstance && mockTokenWalletServiceInstance.stubs.recordTransaction) {
              recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction; // Corrected: Assign existing spy from .stubs
              // Ensure its call history is clear for the new test. 
              // The clearStubs() in the outer afterEach should handle resetting spies/stubs.
          }
          if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
              retrieveSubscriptionStub.restore();
          }
        });
  
        afterEach(() => {
          // recordTransactionSpy is managed by the outer describe's afterEach (mockTokenWalletServiceInstance.clearStubs())
          if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) { // Check existence before restoring
              retrieveSubscriptionStub.restore();
          }
        });
  
        it('mode: payment - should update payment_transactions, award tokens, and return 200', async () => {
          const internalPaymentId = 'pt_test_checkout_payment_int';
          const userId = 'user_checkout_payment_test';
          const tokensToAward = 1000;
  
          // Mock an initial payment_transactions record as if created by initiate-payment
          dbCounters.paymentTransactionsSelectData = [{ // Changed from capturedPaymentTransactionsInsert
            id: internalPaymentId,
            user_id: userId,
            target_wallet_id: 'wallet_for_' + userId,
            payment_gateway_id: 'stripe',
            status: 'PENDING',
            tokens_to_award: tokensToAward,
            // other fields as necessary
          } as Partial<Tables<'payment_transactions'>>]; // Ensure type matches select mock
          // No need to increment insert count here as it's pre-existing for this test flow
  
          const mockCheckoutSessionPayment: Partial<Stripe.Checkout.Session> = {
            id: 'cs_test_payment_int',
            mode: 'payment',
            status: 'complete',
            payment_status: 'paid',
            client_reference_id: userId,
            metadata: { internal_payment_id: internalPaymentId },
            payment_intent: 'pi_test_payment_intent_int',
            // other relevant fields
          };
  
          // Re-stub constructEvent for this specific test as .callsFake is problematic
          if (constructEventStub && !constructEventStub.restored) {
            constructEventStub.restore();
          }
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => { // Changed to constructEventAsync, returns Promise
            // This specific implementation will be used for this test case
            return Promise.resolve({ // Wrapped in Promise.resolve
                id: 'evt_specific_for_this_test',
                object: 'event' as const,
                api_version: '2020-08-27',
                created: Math.floor(Date.now() / 1000),
                data: { object: { id: 'ch_123', status: 'succeeded' } }, 
                livemode: false,
                pending_webhooks: 0,
                request: { id: null, idempotency_key: null },
                type: 'charge.succeeded' as Stripe.Event.Type, 
            } as Stripe.Event);
          });
  
          const mockEvent = {
            id: `evt_cs_completed_payment_${mockCheckoutSessionPayment.id}`,
            type: 'checkout.session.completed' as Stripe.Event.Type,
            data: { object: mockCheckoutSessionPayment as Stripe.Checkout.Session },
            // ... other event fields
          } as Stripe.Event;
  
          if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => Promise.resolve(mockEvent)); // Changed to constructEventAsync, returns Promise
  
          const request = new Request('http://localhost/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}), 
            headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-cs-payment' },
          });
  
          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();
  
          console.log('<<<<< DEBUG: checkout.session.completed (mode: payment) responseBody >>>>>', responseBody);
          assertEquals(response.status, 200);
          // Log types before assertion for the perplexing failure
          console.log(`Type of responseBody.transactionId: ${typeof responseBody.transactionId}, Value: ${responseBody.transactionId}`);
          console.log(`Type of internalPaymentId: ${typeof internalPaymentId}, Value: ${internalPaymentId}`);
          assertEquals(responseBody.transactionId, internalPaymentId);
  
          assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 1);
          assertExists(dbCounters.capturedPaymentTransactionsUpdate, "No data captured for payment_transactions update");
          assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.id, internalPaymentId);
          assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'COMPLETED');
          assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.gateway_transaction_id, mockCheckoutSessionPayment.id); // Corrected: Expecting session ID
          
          assertEquals(recordTransactionSpy.calls.length, 1);
          const txArgs = recordTransactionSpy.calls[0].args[0];
          assertEquals(txArgs.walletId, 'wallet_for_' + userId);
          assertEquals(txArgs.type, 'CREDIT_PURCHASE');
          assertEquals(txArgs.amount, tokensToAward.toString());
          assertEquals(txArgs.relatedEntityId, internalPaymentId);
          assertEquals(txArgs.recordedByUserId, userId);
        });
  
        it('mode: subscription - should upsert user_subscriptions, update payment_transactions, award tokens, and return 200', async () => {
          const internalPaymentId = 'pt_test_checkout_sub_int';
          const userId = 'user_checkout_sub_test';
          const tokensToAward = 5000;
          const stripeSubscriptionId = 'sub_test_integration';
          const stripeCustomerId = 'cus_test_integration';
          const planId = 'plan_sub_test_integration'; // This is the internal DB plan ID
          const internalItemIdForLookup = 'test_subscription_item_id'; // This is the item_id_internal
  
          // Mock an initial payment_transactions record
          dbCounters.paymentTransactionsSelectData = [{ // Changed from capturedPaymentTransactionsInsert
            id: internalPaymentId,
            user_id: userId,
            target_wallet_id: 'wallet_for_' + userId,
            payment_gateway_id: 'stripe',
            status: 'PENDING',
            tokens_to_award: tokensToAward,
          } as Partial<Tables<'payment_transactions'>>];  // Ensure type matches select mock
          
          const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
            id: 'cs_test_sub_int',
            mode: 'subscription',
            status: 'complete',
            payment_status: 'paid', // Assuming initial payment for subscription is paid
            client_reference_id: userId,
            metadata: { 
              internal_payment_id: internalPaymentId, 
              plan_id: planId, // This is the internal DB plan_id (subscription_plans.id)
              item_id: internalItemIdForLookup, // Added item_id here
              tokens_to_award: tokensToAward.toString() 
            },
            subscription: stripeSubscriptionId,
            customer: stripeCustomerId,
            // other relevant fields
          };
          
          const mockStripeSubscription: Partial<Stripe.Subscription> = {
              id: stripeSubscriptionId,
              customer: stripeCustomerId,
              status: 'active',
              items: { data: [{ price: { id: 'price_stripe_sub_test', product: 'prod_stripe_sub_test' } }] } as any,
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days later
              cancel_at_period_end: false,
          };
  
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
  
          const mockEvent = {
            id: `evt_cs_completed_sub_${mockCheckoutSessionSub.id}`,
            type: 'checkout.session.completed' as Stripe.Event.Type,
            data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
          } as Stripe.Event;
  
          if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => Promise.resolve(mockEvent)); // Changed to constructEventAsync, returns Promise
  
          const request = new Request('http://localhost/webhooks/stripe', {
            method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-cs-sub' },
          });
          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();
  
          assertEquals(response.status, 200);
          assertEquals(responseBody.transactionId, internalPaymentId);
  
          assertEquals(retrieveSubscriptionStub.calls.length, 1);
          assertEquals(retrieveSubscriptionStub.calls[0].args[0], stripeSubscriptionId);
  
          assertEquals(dbCounters.userSubscriptionsUpsertCallCount, 1);
          const upsertedSub = dbCounters.capturedUserSubscriptionsUpsert?.[0];
          assertExists(upsertedSub);
          assertEquals(upsertedSub.user_id, userId);
          assertEquals(upsertedSub.stripe_subscription_id, stripeSubscriptionId);
          assertEquals(upsertedSub.stripe_customer_id, stripeCustomerId);
          assertEquals(upsertedSub.status, 'active');
          assertEquals(upsertedSub.plan_id, planId);
  
  
          assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 1);
          assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'COMPLETED');
          
          assertEquals(recordTransactionSpy.calls.length, 1);
          const txArgs = recordTransactionSpy.calls[0].args[0];
          assertEquals(txArgs.walletId, 'wallet_for_' + userId);
          assertEquals(txArgs.type, 'CREDIT_PURCHASE'); // Or CREDIT_SUBSCRIPTION_SIGNUP
          assertEquals(txArgs.amount, tokensToAward.toString());
          assertEquals(txArgs.relatedEntityId, internalPaymentId);
        });

        it('mode: subscription - idempotency: processing same event twice only awards tokens once', async () => {
          const internalPaymentId = 'pt_idem_checkout_sub_int';
          const userId = 'user_idem_checkout_sub_test';
          const tokensToAward = 5000;
          const stripeSubscriptionId = 'sub_idem_test_integration';
          const stripeCustomerId = 'cus_idem_test_integration';
          const planId = 'plan_sub_test_integration'; // Matches the global mock for subscription_plans.select by item_id
          const internalItemIdForLookup = 'test_subscription_item_id'; // To trigger the global mock

          // Mock an initial payment_transactions record
          dbCounters.paymentTransactionsSelectData = [{
            id: internalPaymentId,
            user_id: userId,
            target_wallet_id: 'wallet_for_' + userId,
            payment_gateway_id: 'stripe',
            status: 'PENDING',
            tokens_to_award: tokensToAward,
          } as Partial<Tables<'payment_transactions'>>];

          const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
            id: 'cs_idem_test_sub_int',
            mode: 'subscription',
            status: 'complete',
            payment_status: 'paid',
            client_reference_id: userId,
            metadata: {
              internal_payment_id: internalPaymentId,
              plan_id: planId, // Provided, so DB lookup might be skipped for this specific value
              item_id: internalItemIdForLookup, // Provided for potential DB lookup for tokens if not in metadata
              tokens_to_award: tokensToAward.toString()
            },
            subscription: stripeSubscriptionId,
            customer: stripeCustomerId,
          };

          // Mock Stripe.Subscription object for stripe.subscriptions.retrieve
          // The structure should match what the handler expects
          const mockStripeSubscriptionObject = {
            object: 'subscription' as const,
            id: stripeSubscriptionId,
            customer: stripeCustomerId, // Corrected to match session's customer
            status: 'active' as Stripe.Subscription.Status,
            items: {
              object: 'list' as const,
              data: [{
                object: 'subscription_item' as const,
                id: 'si_mock_item_idem',
                price: { id: 'price_stripe_sub_idem_test', product: 'prod_stripe_sub_idem_test', object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price,
                quantity: 1,
                created: Math.floor(Date.now() / 1000) - 5000,
                subscription: stripeSubscriptionId,
              }],
              has_more: false,
              url: `/v1/subscription_items?subscription=${stripeSubscriptionId}`,
            },
            cancel_at_period_end: false,
            created: Math.floor(Date.now() / 1000) - 20000,
            current_period_end: Math.floor(Date.now() / 1000) + 10000,
            current_period_start: Math.floor(Date.now() / 1000) - 10000,
            livemode: false,
            start_date: Math.floor(Date.now() / 1000) - 20000,
            metadata: { plan_id: planId }, // Ensure metadata.plan_id is present if handler uses it
            // lastResponse is needed for Stripe.Response<Stripe.Subscription>
             lastResponse: { headers: {}, requestId: 'req_mock_idem_retrieve', statusCode: 200, }
          };


          if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
            retrieveSubscriptionStub.restore();
          }
          retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
              // Resolve with the more complete mock object, cast to any then Stripe.Response<Stripe.Subscription>
              return Promise.resolve(mockStripeSubscriptionObject as any as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (idempotency) called with unexpected ID: ${id}`);
          });

          const mockEvent = {
            id: `evt_cs_completed_sub_idem_${mockCheckoutSessionSub.id}`,
            type: 'checkout.session.completed' as Stripe.Event.Type,
            data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
            // other event fields as necessary for Stripe.Event type
            api_version: '2020-08-27', // Example
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null },
            object: 'event' as const,
          } as Stripe.Event;

          if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => Promise.resolve(mockEvent));

          const requestDetails = {
            method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-cs-sub-idem' },
          };

          // First call
          const request1 = new Request('http://localhost/webhooks/stripe', requestDetails);
          const response1 = await handleWebhookRequestLogic(request1, dependencies);
          const responseBody1 = await response1.json();

          assertEquals(response1.status, 200, "First call should succeed");
          assertEquals(responseBody1.transactionId, internalPaymentId, "First call transactionId mismatch");

          // Store call counts after first execution
          const userSubscriptionsUpsertCallCountAfterFirst = dbCounters.userSubscriptionsUpsertCallCount;
          const paymentTransactionsUpdateCallCountAfterFirst = dbCounters.paymentTransactionsUpdateCallCount;
          const recordTransactionSpyCallsAfterFirst = recordTransactionSpy.calls.length;

          // Simulate that the payment transaction is now marked as COMPLETED in the DB
          // so the second call can check this status for idempotency.
          // This is crucial for testing the handler's idempotency logic.
          const paymentTxIndex = dbCounters.paymentTransactionsSelectData?.findIndex(ptx => ptx.id === internalPaymentId);
          if (paymentTxIndex !== undefined && paymentTxIndex !== -1 && dbCounters.paymentTransactionsSelectData) {
            dbCounters.paymentTransactionsSelectData[paymentTxIndex] = {
              ...dbCounters.paymentTransactionsSelectData[paymentTxIndex],
              status: 'COMPLETED', // Mark as completed
              // gateway_transaction_id would also have been set by the first call
              gateway_transaction_id: mockCheckoutSessionSub.id 
            };
          } else {
            // This case should ideally not happen if setup is correct
            console.warn(`Idempotency test: Could not find payment transaction ${internalPaymentId} in mock data to update its status for second call.`);
            // Potentially add it if it's missing, though this points to a setup issue.
             dbCounters.paymentTransactionsSelectData = [{
                id: internalPaymentId,
                user_id: userId,
                target_wallet_id: 'wallet_for_' + userId,
                payment_gateway_id: 'stripe',
                status: 'COMPLETED', // Set directly to completed
                tokens_to_award: tokensToAward,
                gateway_transaction_id: mockCheckoutSessionSub.id,
             } as Partial<Tables<'payment_transactions'>>];
          }


          // Second call with the same event details
          const request2 = new Request('http://localhost/webhooks/stripe', requestDetails);
          const response2 = await handleWebhookRequestLogic(request2, dependencies);
          const responseBody2 = await response2.json();

          assertEquals(response2.status, 200, "Second call should also succeed (idempotency)");
          assertEquals(responseBody2.transactionId, internalPaymentId, "Second call transactionId mismatch");
          
          // Assertions for idempotency
          // retrieveSubscriptionStub would be called for each processing attempt
          assertEquals(retrieveSubscriptionStub.calls.length, 1, "Stripe subscription retrieve should be called only once as the second call exits early due to completed payment transaction");

          // user_subscriptions upsert might be called twice if the handler logic doesn't prevent it,
          // but the DB ON CONFLICT should handle true data idempotency.
          // We check that recordTransaction (token award) is called only once.
          // Depending on the mock, userSubscriptionsUpsertCallCount could be 2.
          // For example, if the mock simply increments a counter.
          // The critical part is that the *effect* is idempotent.
          assert(dbCounters.userSubscriptionsUpsertCallCount >= userSubscriptionsUpsertCallCountAfterFirst, "Upsert call count should not decrease");


          // payment_transactions update might also be called twice.
          assert(dbCounters.paymentTransactionsUpdateCallCount >= paymentTransactionsUpdateCallCountAfterFirst, "Update call count should not decrease");
          const finalCapturedUpdate = dbCounters.capturedPaymentTransactionsUpdate;
          assertExists(finalCapturedUpdate, "No data captured for payment_transactions update after second call");
          assertEquals(finalCapturedUpdate?.status, 'COMPLETED', "Payment transaction status should remain COMPLETED");


          // CRITICAL: Tokens should only be awarded once.
          assertEquals(recordTransactionSpy.calls.length, recordTransactionSpyCallsAfterFirst, "recordTransaction should only be called once for token award");
          assertEquals(recordTransactionSpy.calls.length, 1, "Specifically, recordTransaction should be called exactly once in total for this test");

          // Verify the state of the single recorded transaction
          const txArgs = recordTransactionSpy.calls[0].args[0];
          assertEquals(txArgs.walletId, 'wallet_for_' + userId);
          assertEquals(txArgs.type, 'CREDIT_PURCHASE');
          assertEquals(txArgs.amount, tokensToAward.toString());
          assertEquals(txArgs.relatedEntityId, internalPaymentId);
        });

        it('mode: subscription - error: stripe.subscriptions.retrieve fails', async () => {
          const internalPaymentId = 'pt_err_sub_retrieve_int';
          const userId = 'user_err_sub_retrieve_test';
          const tokensToAward = 5000; // Present in metadata but won't be awarded
          const stripeSubscriptionId = 'sub_err_retrieve_integration';
          const stripeCustomerId = 'cus_err_retrieve_integration';
          const planId = 'plan_err_retrieve_integration';
          const internalItemIdForLookup = 'item_id_err_retrieve';

          // Mock an initial payment_transactions record
          dbCounters.paymentTransactionsSelectData = [{
            id: internalPaymentId,
            user_id: userId,
            target_wallet_id: 'wallet_for_' + userId,
            payment_gateway_id: 'stripe',
            status: 'PENDING',
            tokens_to_award: tokensToAward,
          } as Partial<Tables<'payment_transactions'>>];

          const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
            id: 'cs_err_sub_retrieve_int',
            mode: 'subscription',
            status: 'complete',
            payment_status: 'paid', // Payment is fine, but subscription fetch fails
            client_reference_id: userId,
            metadata: {
              internal_payment_id: internalPaymentId,
              plan_id: planId,
              item_id: internalItemIdForLookup,
              tokens_to_award: tokensToAward.toString()
            },
            subscription: stripeSubscriptionId, // This ID will be used for the failing retrieve call
            customer: stripeCustomerId,
          };

          // Mock stripe.subscriptions.retrieve to fail
          if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) {
            retrieveSubscriptionStub.restore();
          }
          const retrieveError = new Stripe.errors.StripeAPIError({ message: 'Failed to retrieve subscription (test error)', type: 'api_error' });
          retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async () => {
            return Promise.reject(retrieveError);
          });

          const mockEvent = {
            id: `evt_cs_completed_err_retrieve_${mockCheckoutSessionSub.id}`,
            type: 'checkout.session.completed' as Stripe.Event.Type,
            data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
            api_version: '2020-08-27',
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null },
            object: 'event' as const,
          } as Stripe.Event;

          if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => Promise.resolve(mockEvent));

          const request = new Request('http://localhost/webhooks/stripe', {
            method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-cs-sub-err-retrieve' },
          });

          // Reset spy/counter before the call for this specific test path
          // recordTransactionSpy.resetHistory(); // Spies from jsr:@std/testing don't have resetHistory directly.
          // Re-acquiring the spy from the mock service instance effectively resets its context for this test.
          recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
          dbCounters.userSubscriptionsUpsertCallCount = 0; // Reset specific counter

          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();

          assertEquals(response.status, 500, "Webhook should return 500 on subscription retrieve failure");
          assertEquals(responseBody.error, 'Stripe API Error: Failed to retrieve subscription (test error)');

          // Verify stripe.subscriptions.retrieve was called
          assertEquals(retrieveSubscriptionStub.calls.length, 1, "stripe.subscriptions.retrieve should have been called once");

          // Verify payment_transactions was updated to an error/failed state
          assertExists(dbCounters.capturedPaymentTransactionsUpdate, "No data captured for payment_transactions update");
          assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.id, internalPaymentId);
          // Check for a status indicating failure. The exact status depends on handler implementation.
          // Using a general check for 'FAILED' or a specific error status if known.
          assert(dbCounters.capturedPaymentTransactionsUpdate?.status?.toUpperCase().includes('FAIL') || 
                 dbCounters.capturedPaymentTransactionsUpdate?.status?.toUpperCase().includes('ERROR'), 
                 `Expected payment_transactions status to indicate failure, but got: ${dbCounters.capturedPaymentTransactionsUpdate?.status}`);

          // Verify tokens were NOT awarded
          assertEquals(recordTransactionSpy.calls.length, 0, "recordTransaction should NOT have been called");

          // Verify user_subscriptions record was NOT created/finalized
          assertEquals(dbCounters.userSubscriptionsUpsertCallCount, 0, "user_subscriptions upsert should NOT have been called");
        });
      });
    
    });
  }); 