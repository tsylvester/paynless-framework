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
    paymentTransactionsInsertShouldFail: false, 
    paymentTransactionsInsertError: { name: 'MockedDataError', message: 'Simulated DB error inserting payment_transaction', code: 'MOCK50001', details: 'Configured to fail by test' },

    capturedPaymentTransactionsUpdate: null as Partial<Tables<'payment_transactions'>> | null,
    paymentTransactionsUpdateCallCount: 0,
    paymentTransactionsEqCallCount: 0, 
    
    capturedUserSubscriptionsUpdate: null as Partial<Tables<'user_subscriptions'>> | null,
    userSubscriptionsUpdateCallCount: 0,
    userSubscriptionsUpdateShouldFail: false, 
    userSubscriptionsUpdateError: { name: 'MockedDataError', message: 'Simulated DB error updating user_subscriptions', code: 'MOCK50000', details: 'Configured to fail by test' },

    userSubscriptionsEqCallCount: 0, 
    paymentTransactionsUpsertCallCount: 0,
    capturedPaymentTransactionsUpsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsSelectData: null as Partial<Tables<'payment_transactions'>>[] | null, 
    userSubscriptionsSelectData: null as Partial<Tables<'user_subscriptions'>>[] | null, 
    
    subscriptionPlansSelectData: null as Partial<Tables<'subscription_plans'>>[] | null, 
    subscriptionPlansSelectShouldReturnEmpty: false,
    subscriptionPlansSelectError: { name: 'MockedDataError', message: 'Simulated DB error selecting subscription_plan', code: 'MOCK40401', details: 'Configured to fail/return empty by test' },

    tokenWalletsSelectData: null as Partial<Tables<'token_wallets'>>[] | null, 
    tokenWalletsSelectShouldReturnEmpty: false, 
    tokenWalletsSelectError: { name: 'MockedDataError', message: 'Simulated DB error selecting token_wallet', code: 'MOCK40402', details: 'Configured to fail/return empty by test' }
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
      dbCounters.paymentTransactionsInsertShouldFail = false; 

      dbCounters.capturedPaymentTransactionsUpdate = null;
      dbCounters.paymentTransactionsUpdateCallCount = 0;
      dbCounters.paymentTransactionsEqCallCount = 0;

      dbCounters.capturedUserSubscriptionsUpdate = null;
      dbCounters.userSubscriptionsUpdateCallCount = 0;
      dbCounters.userSubscriptionsUpdateShouldFail = false; 
      dbCounters.userSubscriptionsEqCallCount = 0;

      dbCounters.paymentTransactionsUpsertCallCount = 0;
      dbCounters.capturedPaymentTransactionsUpsert = null;
      dbCounters.paymentTransactionsSelectData = null; 
      dbCounters.userSubscriptionsSelectData = [{ 
        user_id: 'user_invoice_ps_test_int', 
        stripe_customer_id: 'cus_invoice_ps_test_int' 
      }] as Partial<Tables<'user_subscriptions'>>[];
      dbCounters.subscriptionPlansSelectData = [{ 
          stripe_price_id: 'price_for_invoice_ps', 
          item_id_internal: 'item_id_for_invoice_ps', 
          tokens_to_award: 7500 
      }];
      dbCounters.subscriptionPlansSelectShouldReturnEmpty = false; 
      dbCounters.tokenWalletsSelectData = null; 
      dbCounters.tokenWalletsSelectShouldReturnEmpty = false; 
      // recordTransactionSpy.resetHistory(); 
  
  
      mockSupabaseInstance = createMockSupabaseClient({
        genericMockResults: {
          subscription_plans: {
            select: (state) => { 
              if (dbCounters.subscriptionPlansSelectShouldReturnEmpty) {
                return Promise.resolve({ data: null, error: dbCounters.subscriptionPlansSelectError, count: 0, status: 404, statusText: 'Not Found (Mock Plan Empty/Error)' });
              }
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
              if (dbCounters.paymentTransactionsInsertShouldFail) {
                return Promise.resolve({ data: null, error: dbCounters.paymentTransactionsInsertError, count: 0, status: 500, statusText: 'Internal Server Error (Mock Insert Failure)' });
              }
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
              // Existing select mock for payment_transactions
              if (dbCounters.paymentTransactionsSelectData && state.filters) {
                const gatewayTxIdFilter = state.filters.find(f => f.column === 'gateway_transaction_id' && f.type === 'eq');
                const ptxIdFilter = state.filters.find(f => f.column === 'id' && f.type === 'eq');
                const paymentGatewayIdFilterValue = state.filters.find(f => f.column === 'payment_gateway_id' && f.type === 'eq')?.value;


                let result: Partial<Tables<'payment_transactions'>>[] = [];

                if (gatewayTxIdFilter) {
                  result = dbCounters.paymentTransactionsSelectData.filter(ptx => {
                    let match = ptx.gateway_transaction_id === gatewayTxIdFilter.value;
                    if (paymentGatewayIdFilterValue) { // Check if payment_gateway_id filter is present
                      match = match && ptx.payment_gateway_id === paymentGatewayIdFilterValue;
                    }
                    return match;
                  });
                } else if (ptxIdFilter) {
                  result = dbCounters.paymentTransactionsSelectData.filter(ptx => ptx.id === ptxIdFilter.value);
                } else if (dbCounters.paymentTransactionsSelectData) {
                  // Fallback to returning all if no specific ID/gateway_transaction_id filter, but other filters might apply
                  result = dbCounters.paymentTransactionsSelectData.filter(ptx => {
                      if (!state.filters || state.filters.length === 0) return true; // No filters, return all
                      return state.filters.every(f => {
                          if (!f.column) return true; 
                          return (ptx as any)[f.column!] === f.value; 
                      });
                  });
                }
                
                if (result.length > 0) {
                   if (((gatewayTxIdFilter && result.length === 1) || (ptxIdFilter && result.length === 1))) {
                       // If .single() is expected by the caller, the mock client's _resolveQuery will handle it from an array of one.
                       // So, we can consistently return an array here, or a single object if that's what the type demands for single record cases.
                       // The type for genericMockResults.TABLE.OPERATION allows for Promise<{ data: object[] | null; ... }>
                       // So returning result[0] directly for single match is also an option if the types align better in specific mock client versions.
                       // For now, let's ensure data is `object[] | null` as per the broader type.
                       return Promise.resolve({ data: result as any[], error: null, count: result.length, status: 200, statusText: 'OK (Mock Select PTX)' });
                   }
                  return Promise.resolve({ data: result as any[], error: null, count: result.length, status: 200, statusText: 'OK (Mock Select PTX)' });
                }
              }
              // Consistent with PGRST, empty select (no rows found) is an empty array, not null, with status 200.
              // .maybeSingle() in client code would then turn this into null data.
              return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK (Empty Select PTX)' });
            },
            update: (state) => {
              dbCounters.paymentTransactionsUpdateCallCount++;
              const ptxIdBeingUpdated = state.filters?.find(f => f.column === 'id')?.value as string | undefined;
              
              let originalData: Partial<Tables<'payment_transactions'>> | undefined;
              if (ptxIdBeingUpdated && dbCounters.paymentTransactionsSelectData) {
                originalData = dbCounters.paymentTransactionsSelectData.find(ptx => ptx.id === ptxIdBeingUpdated);
              }

              const updatedFields = state.updateData as Partial<Tables<'payment_transactions'>>;
              
              const dataToReturn = {
                  ...originalData, 
                  ...updatedFields, 
                  id: ptxIdBeingUpdated, 
                  updated_at: new Date().toISOString(), 
              };
              
              dbCounters.capturedPaymentTransactionsUpdate = dataToReturn as Partial<Tables<'payment_transactions'>>;
              
              // Supabase client expects an array of objects for .update() results before .single() etc.
              return Promise.resolve({ data: [dataToReturn] as any[], error: null, count: 1, status: 200, statusText: 'OK (Updated)' });
            },
            upsert: async (state: import('../_shared/supabase.mock.ts').MockQueryBuilderState): Promise<{ data: object[] | null; error: Error | null; count: number; status: number; statusText: string; }> => {
              dbCounters.paymentTransactionsUpsertCallCount++;
              const upsertDataArray = Array.isArray(state.upsertData)
                  ? state.upsertData as Partial<TablesInsert<'payment_transactions'>>[]
                  : (state.upsertData ? [state.upsertData as Partial<TablesInsert<'payment_transactions'>>] : []);

              const results: Tables<'payment_transactions'>[] = [];
              let overallStatus = 200; // Default to OK for no-op or mixed operations
              let statusTextToReturn: string;
              let anyUpdateOccurred = false;
              let anyInsertOccurred = false;

              if (upsertDataArray.length === 0) {
                statusTextToReturn = 'OK (Upserted - Empty Input)';
                // No data change, count is 0, data is empty array
              } else {
                for (const ptxData of upsertDataArray) {
                    let existingRecord: Partial<Tables<'payment_transactions'>> | undefined = undefined;

                    // Simulate conflict check based on 'gateway_transaction_id' and 'payment_gateway_id'
                    if (state.upsertOptions?.onConflict?.includes('gateway_transaction_id') && ptxData.gateway_transaction_id && ptxData.payment_gateway_id) {
                        existingRecord = (dbCounters.paymentTransactionsSelectData || []).find(
                            r => r.gateway_transaction_id === ptxData.gateway_transaction_id &&
                                 r.payment_gateway_id === ptxData.payment_gateway_id
                        );
                    }

                    const newMockId = `mock_ptx_upserted_${Date.now()}_${results.length}`;
                    const returnedId = existingRecord?.id || ptxData.id || newMockId;

                    const recordToReturn: Tables<'payment_transactions'> = {
                        ...(existingRecord || {}), // Start with existing data if an update
                        ...(ptxData as Omit<TablesInsert<'payment_transactions'>, 'id' | 'created_at' | 'updated_at'>), // Overlay with new data
                        id: returnedId,
                        created_at: existingRecord?.created_at || new Date().toISOString(), // Preserve original created_at on update
                        updated_at: new Date().toISOString(), // Always set new updated_at
                    } as Tables<'payment_transactions'>; // Cast because of partial spreading

                     results.push(recordToReturn);
                     if (existingRecord) {
                       anyUpdateOccurred = true;
                     } else {
                       anyInsertOccurred = true;
                     }
                }

                // Determine overall status and status text based on what happened
                if (anyUpdateOccurred && anyInsertOccurred) {
                  overallStatus = 200; // Typically, Supabase returns 200 for mixed results or if onConflict update occurs.
                  statusTextToReturn = 'OK (Upserted - Update/Mixed)';
                } else if (anyUpdateOccurred) {
                  overallStatus = 200;
                  statusTextToReturn = 'OK (Upserted - Update)';
                } else if (anyInsertOccurred) {
                  overallStatus = 201; // Pure insert
                  statusTextToReturn = 'Created (Upserted - Insert)';
                } else {
                  overallStatus = 200; 
                  statusTextToReturn = 'OK (Upserted - No Change Detected)'; 
                }
              }

              dbCounters.capturedPaymentTransactionsUpsert = results;

              const finalData: object[] | null = results.length > 0 ? results : [];

              return {
                  data: finalData,
                  error: null, // Explicitly null
                  count: results.length,
                  status: overallStatus,
                  statusText: statusTextToReturn,
              };
            },
          },
          user_subscriptions: {
            update: (state) => {
              dbCounters.userSubscriptionsUpdateCallCount++;
              if (dbCounters.userSubscriptionsUpdateShouldFail) {
                return Promise.resolve({ data: null, error: dbCounters.userSubscriptionsUpdateError, count: 0, status: 500, statusText: 'Internal Server Error (Mock Update Failure)' });
              }
               if (state.filters?.some(f => f.column === 'stripe_subscription_id' && f.type === 'eq')) {
                   dbCounters.userSubscriptionsEqCallCount++;
              }
              // Capture a clone of the updateData to avoid reference issues
              dbCounters.capturedUserSubscriptionsUpdate = { ...(state.updateData as object) } as Partial<Tables<'user_subscriptions'>>;
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
              if (dbCounters.tokenWalletsSelectShouldReturnEmpty) {
                return Promise.resolve({ data: null, error: dbCounters.tokenWalletsSelectError, count: 0, status: 406, statusText: 'Not Acceptable (Mock Wallet Empty/Error)' });
              }
              const userIdFilter = state.filters?.find((f: any) => f.column === 'user_id' && f.type === 'eq');
              if (userIdFilter && dbCounters.tokenWalletsSelectData) {
                const matchingWallet = dbCounters.tokenWalletsSelectData.find(
                  (wallet) => wallet.user_id === userIdFilter.value
                );
                if (matchingWallet) {
                  // .single() is often used by the handler, mock client expects array.
                  return Promise.resolve({ data: [matchingWallet], error: null, count: 1, status: 200, statusText: 'OK (Mock Select Single Token Wallet by User ID)' });
                }
              }
              // Default if no specific data found or no userIdFilter (though wallet lookups are usually by user_id)
              return Promise.resolve({ data: null, error: { name: 'PGRST116', message: 'Mock: Wallet not found by user_id in tokenWalletsSelectData or no filter provided', code: 'PGRST116' }, count: 0, status: 406, statusText: 'Not Acceptable (Mock)' });
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
        // Reset all failure flags for this describe block to ensure clean state for each test
        dbCounters.paymentTransactionsInsertShouldFail = false;
        dbCounters.userSubscriptionsUpdateShouldFail = false;
        dbCounters.subscriptionPlansSelectShouldReturnEmpty = false;
        dbCounters.tokenWalletsSelectShouldReturnEmpty = false;

        if (mockTokenWalletServiceInstance && mockTokenWalletServiceInstance.stubs.recordTransaction) {
            recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        }
        dbCounters.paymentTransactionsUpsertCallCount = 0;
        dbCounters.capturedPaymentTransactionsUpsert = null;
        dbCounters.paymentTransactionsSelectData = null; 
        dbCounters.userSubscriptionsSelectData = [{ 
          user_id: 'user_invoice_ps_test_int',
          stripe_customer_id: 'cus_invoice_ps_test_int' 
        }] as Partial<Tables<'user_subscriptions'>>[];
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: 'price_id_for_sub_invoice_ps_test_int', // Use the literal string value
          item_id_internal: 'item_id_for_invoice_ps_renewal', 
          tokens_to_award: 7500, // Changed from 3000 to 7500
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for Renewal"
        }];
        dbCounters.tokenWalletsSelectData = null; // ADDED INITIALIZATION for this describe block
  
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
        const invoiceId = 'in_test_invoice_ps';
        const tokensExpectedToAward = 7500; // From the subscription plan associated with the invoice

        // --- Added for this specific test to ensure wallet is found --- 
        dbCounters.tokenWalletsSelectData = [{
          wallet_id: `wallet_for_${userId}`,
          user_id: userId,
          balance: 0, 
          currency: 'USD',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }];
        dbCounters.tokenWalletsSelectShouldReturnEmpty = false;
        // --- End addition ---

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
          metadata: { user_id: userId, tokens_to_award: tokensExpectedToAward.toString() }, 
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
        assertEquals(insertedPT.status, 'COMPLETED', "PT status after insert should be COMPLETED");
        assertEquals(insertedPT.gateway_transaction_id, invoiceId);
        assertEquals(insertedPT.tokens_to_award, tokensExpectedToAward);
        assertEquals(insertedPT.user_id, userId);
        
        assertEquals(recordTransactionSpy.calls.length, 1);
        const txArgs = recordTransactionSpy.calls[0].args[0];
        // Assuming walletId is derived from userId
        assert(txArgs.walletId.includes(userId), "Wallet ID for token award seems incorrect");
        assertEquals(txArgs.type, 'CREDIT_PURCHASE'); // Or 'CREDIT_RENEWAL'
        assertEquals(txArgs.amount, tokensExpectedToAward.toString()); // Corrected variable name
        assertEquals(txArgs.relatedEntityId, "mock_ptx_id_inserted_1_0");
      });

      // Placeholder for invoice.payment_succeeded - Idempotency (already in separate file)

      it('invoice.payment_succeeded: should handle Token Award Failure', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_token_fail';
        const stripeCustomerId = 'cus_invoice_ps_token_fail';
        const userId = 'user_invoice_ps_token_fail';
        const invoiceId = 'in_test_invoice_ps_token_fail';
        const priceIdForPlan = 'price_id_for_sub_invoice_ps_token_fail'; // Ensure this matches a plan
        const tokensExpectedToAward = 5000; // Example

        // Setup: Mock Deno.env.get for STRIPE_WEBHOOK_SECRET - (handled by top-level beforeEach)

        // Setup: Mock successful Supabase client responses for initial data lookups
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          // other necessary fields for the handler to proceed
        }];
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: priceIdForPlan,
          item_id_internal: 'item_id_for_invoice_ps_token_fail',
          tokens_to_award: tokensExpectedToAward,
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for Token Award Failure"
        }];
        // Ensure a token wallet exists for this specific user for this test and is mutable
        dbCounters.tokenWalletsSelectData = [
          {
            wallet_id: `wallet_for_${userId}`,
            user_id: userId,
            balance: 0, 
            currency: 'USD', // As per types_db.ts
            created_at: new Date().toISOString(), // As per types_db.ts (string)
            updated_at: new Date().toISOString(), // As per types_db.ts (string)
            // organization_id: null, // Optional
            // wallet_type: 'primary', // Not in types_db.ts for token_wallets table
          } as Partial<Tables<'token_wallets'>> // Cast to allow partial for testing, ensure core fields are present
        ];
        // Ensure token_wallets select mock from outer beforeEach is sufficient or add specific one if needed.
        // The existing mock from line 275 should find a wallet if user_id matches 'user_invoice_ps_test_int'.
        // For this test, we might want a different user_id to ensure a wallet is found for *this* user.
        // Let's assume the generic mock finds a wallet for `userId` or update the mock if needed.
        // For now, we are proceeding with the current setup for token_wallets.

        // Setup: Mock TokenWalletService.recordTransaction to throw an error
        if (recordTransactionSpy && !recordTransactionSpy.restored) recordTransactionSpy.restore(); // Clear previous spy if any
        recordTransactionSpy = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', () => {
          return Promise.reject(new Error('Simulated Token Award Failure'));
        });

        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId,
          status: 'paid',
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
          customer_email: 'user-token-fail@example.com',
          lines: {
            object: 'list' as const,
            data: [
              {
                id: 'il_mock_line_item_token_fail',
                object: 'line_item' as const,
                price: { id: priceIdForPlan, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price,
                quantity: 1,
              } as Stripe.InvoiceLineItem
            ],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
          },
          metadata: { user_id: userId, tokens_to_award: tokensExpectedToAward.toString() }, // Ensure tokens_to_award is in metadata
        };
        const mockEvent = {
          id: `evt_invoice_ps_tf_${invoiceId}`,
          type: 'invoice.payment_succeeded' as Stripe.Event.Type,
          data: { object: mockInvoiceSucceeded as Stripe.Invoice },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        // Mock retrieveSubscription to return valid data for this subscriptionId
        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                const now = Math.floor(Date.now() / 1000);
                return Promise.resolve({
                    object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active' as Stripe.Subscription.Status,
                    items: { object: 'list' as const, data: [{ object: 'subscription_item' as const, id: 'si_mock_tf', price: { object: 'price' as const, id: priceIdForPlan, product: 'prod_mock_tf'} as Stripe.Price, quantity: 1, created: now - 100, subscription: stripeSubscriptionId } as Stripe.SubscriptionItem], has_more: false, url: '/'},
                    current_period_end: now + 1000, current_period_start: now - 1000, livemode: false, cancel_at_period_end: false, created: now - 2000, start_date: now - 2000, metadata: { plan_id: 'plan_mock_tf' },
                    lastResponse: { headers: {}, requestId: 'req_mock_tf', statusCode: 200 },
                } as unknown as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (token_fail) called with unexpected ID: ${id}`);
        });

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps-tf' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        // Assert: HTTP response indicates an error (e.g., 500 or a specific error code if handled)
        // The adapter currently catches the error and returns a 500 if recordTransaction fails.
        assertEquals(response.status, 500, "Response status should be 500 for token award failure");
        assertEquals(responseBody.success, false);
        assert(responseBody.error.includes('Simulated Token Award Failure'), "Response body error message mismatch");

        // Assert: payment_transactions status is updated to TOKEN_AWARD_FAILED or similar
        // The adapter attempts to update PT status to TOKEN_AWARD_FAILED in this scenario.
        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "PT insert should be called once");
        const insertedPT = dbCounters.capturedPaymentTransactionsInsert?.[0];
        assertExists(insertedPT, "Payment transaction should have been inserted");
        assertEquals(insertedPT.user_id, userId);
        assertEquals(insertedPT.gateway_transaction_id, invoiceId);
        assertEquals(insertedPT.tokens_to_award, tokensExpectedToAward);
        // Initial status is likely PENDING or PROCESSING, then updated.
        // Check the update call for TOKEN_AWARD_FAILED status
        assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 1, "PT update should be called once for failure status");
        const updatedPT = dbCounters.capturedPaymentTransactionsUpdate;
        assertExists(updatedPT, "Payment transaction update data not captured");
        assertEquals(updatedPT.status, 'TOKEN_AWARD_FAILED', "PT status should be TOKEN_AWARD_FAILED");
        assertEquals(updatedPT.id, insertedPT.id, "PT ID in update should match inserted PT ID");

        // Assert: user_subscriptions is not inappropriately changed (or updated as expected)
        // The handler should still update subscription period dates even if token award fails.
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "User subscriptions update should still be called");
        assertExists(dbCounters.capturedUserSubscriptionsUpdate, "User subscription update data not captured");
        // Add specific assertions for current_period_start/end if those are being updated by the handler

        // Assert: recordTransactionSpy was called
        assertEquals(recordTransactionSpy.calls.length, 1, "recordTransaction should have been called once");
      });

      it('invoice.payment_succeeded: should handle DB Update Failure (UserSubscriptions)', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_us_db_fail';
        const stripeCustomerId = 'cus_invoice_ps_us_db_fail';
        const userId = 'user_invoice_ps_us_db_fail';
        const invoiceId = 'in_test_invoice_ps_us_db_fail';
        const priceIdForPlan = 'price_id_for_sub_invoice_ps_us_db_fail';
        const tokensExpectedToAward = 6000;
        // const mockPtxId = 'mock_ptx_id_us_db_fail'; // Removed, will use captured ID

        // Configure test-specific data
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
        }];
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: priceIdForPlan,
          item_id_internal: 'item_id_for_invoice_ps_us_db_fail',
          tokens_to_award: tokensExpectedToAward,
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for US DB Update Failure"
        }];
        dbCounters.tokenWalletsSelectData = [{ // Ensure wallet exists for token award step
            wallet_id: `wallet_for_${userId}`, user_id: userId, balance: 0, currency: 'USD', 
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }];


        // Set the flag for this test
        dbCounters.userSubscriptionsUpdateShouldFail = true;
        // dbCounters.userSubscriptionsUpdateError can be customized here if needed, e.g.:
        // dbCounters.userSubscriptionsUpdateError = { message: 'Custom error for this test', code: 'CUST001', details: '' };

        // Mock TokenWalletService.recordTransaction for success (as this is not the failure point for THIS test)
        if (recordTransactionSpy && !recordTransactionSpy.restored) recordTransactionSpy.restore();
        recordTransactionSpy = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async (tx) => {
          return Promise.resolve({
            transactionId: 'mock_tws_tx_id_us_db_fail', walletId: tx.walletId, type: tx.type, amount: tx.amount,
            balanceAfterTxn: tx.amount, relatedEntityId: tx.relatedEntityId, status: 'COMPLETED',
            recordedByUserId: 'mock_system_user_id', timestamp: new Date(),
          } as TokenWalletTransaction);
        });

        // Payment_transactions insert will use the generic mock.
        // We will retrieve the inserted ID from dbCounters.capturedPaymentTransactionsInsert

        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId, status: 'paid', subscription: stripeSubscriptionId, customer: stripeCustomerId,
          customer_email: 'user-us-db-fail@example.com',
          lines: { object: 'list' as const, data: [ { id: 'il_mock_us_db_fail', object: 'line_item' as const, price: { id: priceIdForPlan, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price, quantity: 1 } as Stripe.InvoiceLineItem ], has_more: false, url: '/', },
          metadata: { user_id: userId, tokens_to_award: tokensExpectedToAward.toString() }, 
        };
        const mockEvent = { id: `evt_invoice_ps_usdbf_${invoiceId}`, type: 'invoice.payment_succeeded' as Stripe.Event.Type, data: { object: mockInvoiceSucceeded as Stripe.Invoice } } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        const now = Math.floor(Date.now() / 1000);
        const currentPeriodStart = now - 10000;
        const currentPeriodEnd = now + 10000;
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                return Promise.resolve({
                    object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active' as Stripe.Subscription.Status,
                    items: { object: 'list' as const, data: [{ object: 'subscription_item' as const, id: 'si_mock_usdbf', price: { object: 'price' as const, id: priceIdForPlan, product: 'prod_mock_usdbf'} as Stripe.Price, quantity: 1, created: now - 100, subscription: stripeSubscriptionId } as Stripe.SubscriptionItem], has_more: false, url: '/'},
                    current_period_end: currentPeriodEnd, current_period_start: currentPeriodStart, livemode: false, cancel_at_period_end: false, created: now - 2000, start_date: now - 2000, metadata: { plan_id: 'plan_mock_usdbf' },
                    lastResponse: { headers: {}, requestId: 'req_mock_usdbf', statusCode: 200 },
                } as unknown as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (us_db_fail) called with unexpected ID: ${id}`);
        });
        
        // REMOVED: Direct mock of payment_transactions.insert
        // const originalPaymentTransactionsInsertFn = mockSupabaseInstance.from('payment_transactions').insert;
        // (mockSupabaseInstance.from('payment_transactions') as any).insert = (state: any) => { ... };


        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps-usdbf' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        
        // Assert: HTTP response should be 200 as user_subscriptions update is not part of this handler.
        // The payment transaction should be recorded, and tokens awarded (or attempted).
        assertEquals(response.status, 200, "Response status should be 200 for this scenario");
        assertEquals(responseBody.message, "Webhook processed", "Response message mismatch");
        assertExists(responseBody.transactionId, "Response body should contain transactionId");

        // Assert: payment_transactions was inserted successfully
        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "PT insert should be called once");
        const insertedPT = dbCounters.capturedPaymentTransactionsInsert?.[0];
        assertExists(insertedPT, "Payment transaction should have been inserted");
        assertEquals(insertedPT.status, 'COMPLETED');

        // Assert: user_subscriptions update was NOT called by this handler
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 0, "User subscriptions update should NOT be called by this handler");

        // Assert: recordTransactionSpy was called (since tokensExpectedToAward > 0)
        assertEquals(recordTransactionSpy.calls.length, 1, "recordTransaction should have been called once");

        // Reset the flag for other tests
        dbCounters.userSubscriptionsUpdateShouldFail = false;
      });

      it('invoice.payment_succeeded: should handle DB Update/Insert Failure (PaymentTransaction)', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_ptx_db_fail';
        const stripeCustomerId = 'cus_invoice_ps_ptx_db_fail';
        const userId = 'user_invoice_ps_ptx_db_fail';
        const invoiceId = 'in_test_invoice_ps_ptx_db_fail';
        const priceIdForPlan = 'price_id_for_sub_invoice_ps_ptx_db_fail';
        const tokensExpectedToAward = 7000;

        dbCounters.paymentTransactionsInsertShouldFail = true; 

        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
        }];
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: priceIdForPlan,
          item_id_internal: 'item_id_for_invoice_ps_ptx_db_fail',
          tokens_to_award: tokensExpectedToAward,
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for PTX DB Failure"
        }];
        dbCounters.tokenWalletsSelectData = [{ // Ensure wallet exists
            wallet_id: `wallet_for_${userId}`, user_id: userId, balance: 0, currency: 'USD', 
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }];


        if (recordTransactionSpy && !recordTransactionSpy.restored) {
            recordTransactionSpy.restore();
            recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction; 
        }
        

        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId, status: 'paid', subscription: stripeSubscriptionId, customer: stripeCustomerId,
          customer_email: 'user-ptx-db-fail@example.com',
          lines: { object: 'list' as const, data: [ { id: 'il_mock_ptx_db_fail', object: 'line_item' as const, price: { id: priceIdForPlan, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price, quantity: 1 } as Stripe.InvoiceLineItem ], has_more: false, url: '/', },
          metadata: { user_id: userId, tokens_to_award: tokensExpectedToAward.toString() }, 
        };
        const mockEvent = { id: `evt_invoice_ps_ptxdbf_${invoiceId}`, type: 'invoice.payment_succeeded' as Stripe.Event.Type, data: { object: mockInvoiceSucceeded as Stripe.Invoice } } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        const now = Math.floor(Date.now() / 1000);
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                return Promise.resolve({
                    object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active' as Stripe.Subscription.Status,
                    items: { object: 'list' as const, data: [{ object: 'subscription_item' as const, id: 'si_mock_ptxdbf', price: { object: 'price' as const, id: priceIdForPlan, product: 'prod_mock_ptxdbf'} as Stripe.Price, quantity: 1, created: now -100, subscription: stripeSubscriptionId } as Stripe.SubscriptionItem], has_more: false, url: '/'},
                    current_period_end: now + 10000, current_period_start: now - 10000, livemode: false, cancel_at_period_end: false, created: now - 20000, start_date: now - 20000, metadata: { plan_id: 'plan_mock_ptxdbf' },
                    lastResponse: { headers: {}, requestId: 'req_mock_ptxdbf', statusCode: 200 },
                } as unknown as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (ptx_db_fail) called with unexpected ID: ${id}`);
        });

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps-ptxdbf' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        assertEquals(response.status, 500, "Response status should be 500 for PTX DB insert failure");
        assertEquals(responseBody.success, false, "Response success should be false");
        assert(responseBody.error.includes(dbCounters.paymentTransactionsInsertError.message), "Response error message mismatch");

        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "PT insert should have been attempted");
        
        assertEquals(recordTransactionSpy.calls.length, 0, "recordTransaction should NOT have been called");

        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 0, "User subscriptions update should NOT have been attempted");

        dbCounters.paymentTransactionsInsertShouldFail = false; 
      });

      it('invoice.payment_succeeded: should handle Missing User Subscription', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_no_user_sub';
        const stripeCustomerId = 'cus_invoice_ps_no_user_sub'; // This customer ID will not have a user_subscription
        const invoiceId = 'in_test_invoice_ps_no_user_sub';
        const priceIdForPlan = 'price_id_for_sub_invoice_ps_no_user_sub';
        const tokensExpectedToAward = 8000;

        // Mock Supabase client.from('user_subscriptions').select() to return no data for this customer_id
        // The generic mock for user_subscriptions.select in the main beforeEach (around line 257)
        // already returns an error if matchingUserSub is not found. We just need to ensure
        // dbCounters.userSubscriptionsSelectData does NOT contain an entry for stripeCustomerId.
        dbCounters.userSubscriptionsSelectData = []; // Ensure no user subscriptions are found

        // Provide a plan for plan lookup to succeed, so failure is isolated to missing user subscription
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: priceIdForPlan,
          item_id_internal: 'item_id_for_invoice_ps_no_user_sub',
          tokens_to_award: tokensExpectedToAward,
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for Missing User Sub Scenario"
        }];

        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId, status: 'paid', subscription: stripeSubscriptionId, customer: stripeCustomerId,
          customer_email: 'user-no-sub@example.com',
          lines: { object: 'list' as const, data: [ { id: 'il_mock_no_user_sub', object: 'line_item' as const, price: { id: priceIdForPlan, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price, quantity: 1 } as Stripe.InvoiceLineItem ], has_more: false, url: '/', },
          metadata: { user_id: 'user_who_should_exist_but_sub_is_missing' }, // metadata.user_id might be present or not, adapter primarily uses customer_id
        };
        const mockEvent = { id: `evt_invoice_ps_nus_${invoiceId}`, type: 'invoice.payment_succeeded' as Stripe.Event.Type, data: { object: mockInvoiceSucceeded as Stripe.Invoice } } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        // Mock retrieveSubscription for completeness, though it might not be reached if user_sub lookup fails first
        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        const now = Math.floor(Date.now() / 1000);
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                return Promise.resolve({
                    object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active' as Stripe.Subscription.Status,
                    items: { object: 'list' as const, data: [{ object: 'subscription_item' as const, id: 'si_mock_nus', price: { object: 'price' as const, id: priceIdForPlan, product: 'prod_mock_nus'} as Stripe.Price, quantity: 1, created: now -100, subscription: stripeSubscriptionId } as Stripe.SubscriptionItem], has_more: false, url: '/'},
                    current_period_end: now + 10000, current_period_start: now - 10000, livemode: false, cancel_at_period_end: false, created: now - 20000, start_date: now - 20000, metadata: { plan_id: 'plan_mock_nus' },
                    lastResponse: { headers: {}, requestId: 'req_mock_nus', statusCode: 200 },
                } as unknown as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (no_user_sub) called with unexpected ID: ${id}`);
        });

        // Reset spy history for this specific test
        if (recordTransactionSpy && !recordTransactionSpy.restored) recordTransactionSpy.restore();
        recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction; 
        // recordTransactionSpy.resetHistory(); // THIS LINE TO BE REMOVED

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps-nus' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        // Assert: Appropriate error response (e.g., 500 because adapter throws error)
        assertEquals(response.status, 500, "Response status should be 500 for missing user subscription");
        assertEquals(responseBody.success, false, "Response success should be false");
        assertEquals(responseBody.error, 'User subscription data not found for Stripe customer ID.', "Response error message mismatch for missing user sub");

        // Assert: No tokens awarded
        assertEquals(recordTransactionSpy.calls.length, 0, "recordTransaction should NOT have been called");

        // Assert: No payment_transaction created/updated incorrectly
        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 0, "PT insert should NOT have been called");
        assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 0, "PT update should NOT have been called");
        
        // Assert: No user subscription update attempted, as it wasn't found
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 0, "User subscriptions update should NOT have been attempted");
      });

      it('invoice.payment_succeeded: should handle Missing Token Wallet', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_no_wallet';
        const stripeCustomerId = 'cus_invoice_ps_no_wallet';
        const userId = 'user_invoice_ps_no_wallet'; // This user will have a subscription but TWS will fail for their wallet
        const invoiceId = 'in_test_invoice_ps_no_wallet';
        const priceIdForPlan = 'price_id_for_sub_invoice_ps_no_wallet';
        const tokensExpectedToAward = 9000;
        // const mockPtxId = 'mock_ptx_id_no_wallet'; // Removed, will use captured ID

        // Setup: Mock successful user_subscription lookup
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          // other necessary fields for the handler to proceed
        }];

        // Setup: Mock successful subscription_plans lookup
        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: priceIdForPlan,
          item_id_internal: 'item_id_for_invoice_ps_no_wallet',
          tokens_to_award: tokensExpectedToAward,
          plan_type: 'subscription',
          active: true,
          name: "Test Plan for Missing Wallet Scenario"
        }];

        // dbCounters.tokenWalletsSelectData is NOT set, or set to empty if the main mock logic for token_wallets.select
        // in createMockSupabaseClient needs it to simulate "not found".
        // The error originates from TokenWalletService.recordTransaction in this test.
        // However, the first log shows it fails because the initial select for token_wallets fails.
        // Let's ensure tokenWalletsSelectData is set to simulate wallet not found by the handler *before* TWS.recordTransaction
        dbCounters.tokenWalletsSelectData = []; // Simulate wallet not found by the SELECT query in the handler
        dbCounters.tokenWalletsSelectShouldReturnEmpty = true; // Ensure the generic mock returns empty/error
        dbCounters.tokenWalletsSelectError = { name: "PGRST116", message: "Mock: Wallet not found by user_id for no_wallet test", code: "PGRST116", details: "Test setup for missing wallet" };


        // Setup: Mock TokenWalletService.recordTransaction to throw a "Wallet not found" like error
        // This might not be reached if the handler's own token wallet select fails first.
        if (recordTransactionSpy && !recordTransactionSpy.restored) recordTransactionSpy.restore();
        recordTransactionSpy = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', () => {
          return Promise.reject(new Error('Simulated Wallet Not Found Failure for user: ' + userId));
        });

        // REMOVED: Direct mock of payment_transactions.insert
        // const originalPaymentTransactionsInsert = mockSupabaseInstance.from('payment_transactions').insert;
        // mockSupabaseInstance.from('payment_transactions').insert = () => { ... };

        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId, status: 'paid', subscription: stripeSubscriptionId, customer: stripeCustomerId,
          customer_email: 'user-no-wallet@example.com',
          lines: { object: 'list' as const, data: [ { id: 'il_mock_no_wallet', object: 'line_item' as const, price: { id: priceIdForPlan, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price, quantity: 1 } as Stripe.InvoiceLineItem ], has_more: false, url: '/', },
          metadata: { user_id: userId },
        };
        const mockEvent = { id: `evt_invoice_ps_nw_${invoiceId}`, type: 'invoice.payment_succeeded' as Stripe.Event.Type, data: { object: mockInvoiceSucceeded as Stripe.Invoice } } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        const now = Math.floor(Date.now() / 1000);
        const currentPeriodStart = now - 10000;
        const currentPeriodEnd = now + 10000;
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                return Promise.resolve({
                    object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active' as Stripe.Subscription.Status,
                    items: { object: 'list' as const, data: [{ object: 'subscription_item' as const, id: 'si_mock_nw', price: { object: 'price' as const, id: priceIdForPlan, product: 'prod_mock_nw'} as Stripe.Price, quantity: 1, created: now -100, subscription: stripeSubscriptionId } as Stripe.SubscriptionItem], has_more: false, url: '/'},
                    current_period_end: currentPeriodEnd, current_period_start: currentPeriodStart, livemode: false, cancel_at_period_end: false, created: now - 20000, start_date: now - 20000, metadata: { plan_id: 'plan_mock_nw' },
                    lastResponse: { headers: {}, requestId: 'req_mock_nw', statusCode: 200 },
                } as unknown as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (no_wallet) called with unexpected ID: ${id}`);
        });

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps-nw' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        // Assert: HTTP response indicates a server error
        // Original log showed 404 from adapter: "Wallet not found for user..."
        // This indicates the handler's own check for token_wallets fails.
        assertEquals(response.status, 404, "Response status should be 404 for missing token wallet (handler check)");
        assertEquals(responseBody.success, false, "Response success should be false");
        assertEquals(responseBody.error, 'Token wallet not found for user.', "Response error message mismatch for missing wallet");


        // Assert: payment_transactions was NOT inserted because wallet check failed early
        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 0, "PT insert should NOT be called due to early wallet fail");
        
        // Assert: payment_transactions status is NOT updated 
        assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 0, "PT update should NOT be called");

        // Assert: TokenWalletService.recordTransaction was NOT called
        assertEquals(recordTransactionSpy.calls.length, 0, "recordTransaction should NOT have been called");

        // Assert: user_subscriptions are NOT updated because of the early failure
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 0, "User subscriptions update should NOT be called");
        
        // Restore original mocks / dbCounter flags
        // (mockSupabaseInstance.from('payment_transactions') as any).insert = originalPaymentTransactionsInsert; // Removed
        dbCounters.tokenWalletsSelectShouldReturnEmpty = false; // Reset flag
        dbCounters.tokenWalletsSelectError = { name: 'MockedDataError', message: 'Simulated DB error selecting token_wallet', code: 'MOCK40402', details: 'Configured to fail/return empty by test' }; // Reset to default
      });

      it('invoice.payment_succeeded: should handle Missing Subscription Plan', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_no_plan';
        const stripeCustomerId = 'cus_invoice_ps_no_plan';
        const userId = 'user_invoice_ps_no_plan';
        const invoiceId = 'in_test_invoice_ps_no_plan';
        const priceIdMissingFromDB = 'price_id_not_in_subscription_plans'; // This price ID will not be found
        // const mockPtxId = 'mock_ptx_id_no_plan'; // Removed

        // Setup: Mock successful user_subscription lookup
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
        }];
        
        // Ensure a token wallet IS found for this user, so failure is isolated to plan.
        dbCounters.tokenWalletsSelectData = [{ wallet_id: `wallet_for_${userId}`, user_id: userId }];
        dbCounters.tokenWalletsSelectShouldReturnEmpty = false;


        // Setup: Mock Supabase client.from('subscription_plans').select() to return no data for this price ID
        dbCounters.subscriptionPlansSelectData = []; // Ensure no subscription plans are found by default for the specific price
        dbCounters.subscriptionPlansSelectShouldReturnEmpty = true; // This flag should be used by the generic mock
        dbCounters.subscriptionPlansSelectError = { name: 'MockedDataError', message: `Mock: Plan not found by stripe_price_id ${priceIdMissingFromDB}`, code: 'MOCK40401', details: 'Test setup for missing plan' };


        // REMOVED: Direct mock of subscription_plans.select
        // const originalSubscriptionPlansSelect = mockSupabaseInstance.from('subscription_plans').select;
        // mockSupabaseInstance.from('subscription_plans').select = (columns?: string) => { ... };

        // REMOVED: Direct mock of payment_transactions.insert
        // const originalPaymentTransactionsInsert = mockSupabaseInstance.from('payment_transactions').insert;
        // mockSupabaseInstance.from('payment_transactions').insert = () => { ... };
        
        // Record transaction spy should not be called if plan is not found.
        if (recordTransactionSpy && !recordTransactionSpy.restored) recordTransactionSpy.restore();
        recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;


        const mockInvoiceSucceeded: Partial<Stripe.Invoice> = {
          id: invoiceId, status: 'paid', subscription: stripeSubscriptionId, customer: stripeCustomerId,
          customer_email: 'user-no-plan@example.com',
          lines: { 
            object: 'list' as const, 
            data: [ 
              { 
                id: 'il_mock_no_plan', 
                object: 'line_item' as const, 
                price: { id: priceIdMissingFromDB, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price, 
                quantity: 1 
              } as Stripe.InvoiceLineItem 
            ], 
            has_more: false, url: '/', 
          },
          metadata: { user_id: userId },
        };
        const mockEvent = { id: `evt_invoice_ps_np_${invoiceId}`, type: 'invoice.payment_succeeded' as Stripe.Event.Type, data: { object: mockInvoiceSucceeded as Stripe.Invoice } } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        const now = Math.floor(Date.now() / 1000);
        const currentPeriodStart = now - 10000;
        const currentPeriodEnd = now + 10000;
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                return Promise.resolve({
                    object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active' as Stripe.Subscription.Status,
                    items: { object: 'list' as const, data: [{ object: 'subscription_item' as const, id: 'si_mock_np', price: { object: 'price' as const, id: priceIdMissingFromDB, product: 'prod_mock_np'} as Stripe.Price, quantity: 1, created: now -100, subscription: stripeSubscriptionId } as Stripe.SubscriptionItem], has_more: false, url: '/'},
                    current_period_end: currentPeriodEnd, current_period_start: currentPeriodStart, livemode: false, cancel_at_period_end: false, created: now - 20000, start_date: now - 20000, metadata: { plan_id: 'plan_mock_np' },
                    lastResponse: { headers: {}, requestId: 'req_mock_np', statusCode: 200 },
                } as unknown as Stripe.Response<Stripe.Subscription>);
            }
            throw new Error(`Mock subscriptions.retrieve (no_plan) called with unexpected ID: ${id}`);
        });

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-ps-np' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        // Assert: HTTP response should be 200. The handler defaults tokens_to_award to 0 if not in metadata.
        // A missing entry in 'subscription_plans' table does not affect this handler for token calculation.
        assertEquals(response.status, 200, "Response status should be 200");
        assertEquals(responseBody.success, true, "Response success should be true");
        assertExists(responseBody.transactionId, "Response should contain a transactionId");

        // Assert: payment_transactions was inserted successfully with 0 tokens
        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "PT insert should be called once");
        const insertedPT = dbCounters.capturedPaymentTransactionsInsert?.[0];
        assertExists(insertedPT, "Payment transaction should have been inserted");
        assertEquals(insertedPT.status, 'COMPLETED');
        assertEquals(insertedPT.tokens_to_award, 0, "Tokens to award should be 0");

        // Assert: recordTransactionSpy was NOT called (since tokens_to_award is 0)
        assertEquals(recordTransactionSpy.calls.length, 0, "recordTransaction should NOT have been called");

        // Reset the flag for other tests
        dbCounters.subscriptionPlansSelectShouldReturnEmpty = false;
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
  
      it('should update payment_transactions, award tokens for renewal, and return 200', async () => {
        const stripeSubscriptionId = 'sub_invoice_ps_test_int';
        const stripeCustomerId = 'cus_invoice_ps_test_int';
        const userId = 'user_invoice_ps_test_int'; // Corrected to match userSubscriptionsSelectData
        const invoiceId = 'in_test_invoice_ps';
        const tokensExpectedToAward = 7500; // From the subscription plan associated with the invoice

        // --- Added for this specific test to ensure wallet is found --- 
        dbCounters.tokenWalletsSelectData = [{
          wallet_id: `wallet_for_${userId}`,
          user_id: userId,
          balance: 0, 
          currency: 'USD',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }];
        dbCounters.tokenWalletsSelectShouldReturnEmpty = false;
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
        assertEquals(dbCounters.capturedUserSubscriptionsUpdate.status, 'past_due', "US status for Scenario A");
      });
  
      it('invoice.payment_failed: should handle Stripe API Error (stripe.subscriptions.retrieve fails)', async () => {
        const stripeSubscriptionId = 'sub_pf_stripe_api_err';
        const stripeCustomerId = 'cus_pf_stripe_api_err';
        const userId = 'user_pf_stripe_api_err';
        const invoiceId = 'in_pf_stripe_api_err';
        const mockPtxId = 'ptx_pf_stripe_api_err';

        // Setup: Mock user_subscription and payment_transaction for initial lookups
        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          // other necessary fields for the handler to proceed
        }];
        dbCounters.paymentTransactionsSelectData = [{
          id: mockPtxId,
          user_id: userId,
          target_wallet_id: `wallet_for_${userId}`, // Make sure target_wallet_id is available in the PT select
          payment_gateway_id: 'stripe',
          gateway_transaction_id: invoiceId,
          status: 'PENDING', // or any status that would be updated
          tokens_to_award: 0, // For failed payments, tokens_to_award is usually not relevant for the initial record
        }];

        // --- ADDED: Ensure a token wallet IS found for this user ---
        dbCounters.tokenWalletsSelectData = [{
            wallet_id: `wallet_for_${userId}`,
            user_id: userId,
            balance: 0, 
            currency: 'USD',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }];
        dbCounters.tokenWalletsSelectShouldReturnEmpty = false;
        // --- END ADDITION ---

        // Setup: Mock Stripe SDK's subscriptions.retrieve to throw an error
        if (retrieveSubscriptionStubPf && !retrieveSubscriptionStubPf.restored) retrieveSubscriptionStubPf.restore();
        retrieveSubscriptionStubPf = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
          if (id === stripeSubscriptionId) {
            return Promise.reject(new Stripe.errors.StripeAPIError({ 
              message: 'Simulated Stripe API Error', 
              type: 'api_error' // Added type property
            }));
          }
          // Fallback for other IDs if necessary, though this test should isolate this one
          throw new Error(`Mock subscriptions.retrieve (PF Stripe API Error) called with unexpected ID: ${id}`);
        });

        const mockInvoiceFailed: Partial<Stripe.Invoice> = {
          id: invoiceId,
          status: 'open', // Typical for failed payments before finalization
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
          customer_email: 'user-pf-stripe-api-err@example.com',
          metadata: { user_id: userId }, // Adapter may use this if customer object is missing on invoice
          // Billing reason can be important for failed invoices if logic varies
          billing_reason: 'subscription_cycle', 
        };
        const mockEvent = {
          id: `evt_pf_sae_${invoiceId}`,
          type: 'invoice.payment_failed' as Stripe.Event.Type,
          data: { object: mockInvoiceFailed as Stripe.Invoice },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-pf-sae' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        // Assert: HTTP response indicates a server error (e.g., 500)
        assertEquals(response.status, 500, "Response status should be 500 for Stripe API error on subscription retrieve");
        assertEquals(responseBody.success, false, "Response success should be false");
        assert(responseBody.error.includes(`Stripe API error retrieving subscription ${stripeSubscriptionId} for invoice ${invoiceId}: Simulated Stripe API Error. While the payment transaction ${mockPtxId} has been marked FAILED, the subscription status could not be verified/updated due to this internal error.`), "Response error message mismatch for Stripe API error");

        // Assert: payment_transactions status is updated/upserted to FAILED
        // The adapter attempts this even if Stripe API call fails.
        assert(dbCounters.paymentTransactionsUpdateCallCount > 0 || dbCounters.paymentTransactionsUpsertCallCount > 0, "PT Update or Upsert should be called");
        const finalPTState = dbCounters.capturedPaymentTransactionsUpdate || dbCounters.capturedPaymentTransactionsUpsert?.[0];
        assertExists(finalPTState, "Final PT state not captured");
        assertEquals(finalPTState.status, 'FAILED', "PT status should be FAILED");
        if (finalPTState.id) { 
            assertEquals(finalPTState.id, mockPtxId, "Updated PT ID should match mockPtxId");
        } else if (dbCounters.capturedPaymentTransactionsUpsert && dbCounters.capturedPaymentTransactionsUpsert[0]) {
            assertEquals(dbCounters.capturedPaymentTransactionsUpsert[0].gateway_transaction_id, invoiceId, "Upserted PT gateway_transaction_id should match invoiceId");
        }

        // Assert: user_subscriptions update was NOT attempted due to Stripe API failure
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 0, "User subscriptions update should NOT be attempted if Stripe API for subscription retrieval fails");
        
        // // OLD Assertions - No longer valid if no update is expected:
        // assertExists(dbCounters.capturedUserSubscriptionsUpdate, "Captured user_subscriptions update data is missing");
        // assertEquals(dbCounters.capturedUserSubscriptionsUpdate.status, 'past_due', "User subscription status should be updated to past_due on Stripe API failure");
      });

      it('invoice.payment_failed: should handle Missing User Subscription', async () => {
        const stripeSubscriptionId = 'sub_pf_no_user_sub';
        const stripeCustomerId = 'cus_pf_no_user_sub'; // This customer ID will not have a user_subscription
        // const userId = 'user_pf_no_user_sub'; // userId is not strictly needed if lookup is by customerId and fails
        const invoiceId = 'in_pf_no_user_sub';

        // Setup: Mock user_subscriptions.select() to return no data for this customer_id
        dbCounters.userSubscriptionsSelectData = []; // Ensure no user subscriptions are found

        // paymentTransactionsSelectData can be empty or null as PT lookup might not occur or its result won't matter here
        dbCounters.paymentTransactionsSelectData = [];

        // Mock Stripe SDK's subscriptions.retrieve - this might not even be called if user_sub lookup fails first.
        // Provide a generic successful response just in case the adapter logic tries to call it.
        if (retrieveSubscriptionStubPf && !retrieveSubscriptionStubPf.restored) retrieveSubscriptionStubPf.restore();
        retrieveSubscriptionStubPf = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
          if (id === stripeSubscriptionId) {
        const now = Math.floor(Date.now() / 1000);
            return Promise.resolve({
                object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId, status: 'past_due' as Stripe.Subscription.Status,
                items: { object: 'list' as const, data: [{ id: 'si_no_user_sub', price: { id: 'price_no_user_sub', product: 'prod_no_user_sub' } } as Stripe.SubscriptionItem], url: '/v1/items', has_more: false },
                current_period_start: now - 10000, current_period_end: now + 10000, cancel_at_period_end: false,
                lastResponse: { headers: {}, requestId: 'req_mock_nus_pf', statusCode: 200 },
            } as unknown as Stripe.Response<Stripe.Subscription>);
          }
          throw new Error(`Mock subscriptions.retrieve (PF No User Sub) called with unexpected ID: ${id}`);
        });

        const mockInvoiceFailed: Partial<Stripe.Invoice> = {
          id: invoiceId,
          status: 'open',
          subscription: stripeSubscriptionId, // May or may not be present/used if customer_id is primary lookup
          customer: stripeCustomerId,      // Crucial for the user_subscription lookup
          customer_email: 'user-pf-no-sub@example.com',
          // metadata: { user_id: userId }, // Not relying on metadata.user_id for this test
          billing_reason: 'subscription_cycle',
        };
        const mockEvent = {
          id: `evt_pf_nus_${invoiceId}`,
          type: 'invoice.payment_failed' as Stripe.Event.Type,
          data: { object: mockInvoiceFailed as Stripe.Invoice },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-pf-nus' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        
        // Assert: Appropriate error response (e.g., 500 because adapter throws error)
        assertEquals(response.status, 500, "Response status should be 500 for missing user subscription on payment failure");
        assertEquals(responseBody.success, false, "Response success should be false");
        assert(responseBody.error.includes(`Essential user/wallet info missing for failed invoice ${invoiceId}`), "Response error message mismatch for missing user sub");

        // Assert: payment_transaction IS NOT upserted because essential info (user_id/wallet_id) couldn't be found
        assertEquals(dbCounters.paymentTransactionsUpsertCallCount, 0, "PT Upsert should NOT be called when essential user/wallet info is missing");
        // const upsertedPT = dbCounters.capturedPaymentTransactionsUpsert?.[0]; // REMOVE
        // assertExists(upsertedPT, "Upserted PT data not captured"); // REMOVE
        // assertEquals(upsertedPT.gateway_transaction_id, invoiceId, "Upserted PT gateway_transaction_id should match invoiceId"); // REMOVE
        // assertEquals(upsertedPT.status, 'FAILED', "Upserted PT status should be FAILED"); // REMOVE
        // assert(upsertedPT.user_id === null || upsertedPT.user_id === undefined, "Upserted PT user_id should be null or undefined"); // REMOVE


        // Assert: No user subscription update attempted, as it wasn't found
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 0, "User subscriptions update should NOT have been attempted");
      });  
      
      it('should update payment_transactions and user_subscriptions statuses, and return 200 (second failure scenario)', async () => {
        // This test maps to "Scenario B / second failure"
        // Uses PF_B constants from the describe block's beforeEach
        const { stripeSubscriptionIdPF_B, stripeCustomerIdPF_B, userIdPF_B, invoiceIdPF_B } = (
            this as any // Allow access to describe-scoped constants if not directly in scope
        ) || {
            stripeSubscriptionIdPF_B: 'sub_invoice_pf_test_int_B', 
            stripeCustomerIdPF_B: 'cus_invoice_pf_test_int_B',
            userIdPF_B: 'user_invoice_pf_test_B',
            invoiceIdPF_B: 'in_test_invoice_pf_B'
        }; 

        dbCounters.userSubscriptionsSelectData = [{
          user_id: userIdPF_B,
          stripe_customer_id: stripeCustomerIdPF_B,
          stripe_subscription_id: stripeSubscriptionIdPF_B,
          status: 'past_due', // Simulate it was past_due before this failure, now might go to unpaid
        } as Partial<Tables<'user_subscriptions'>>];
        
        dbCounters.paymentTransactionsSelectData = [{
          id: 'pt_for_failed_invoice_B',
          user_id: userIdPF_B,
          target_wallet_id: 'wallet_for_' + userIdPF_B,
          payment_gateway_id: 'stripe',
          gateway_transaction_id: invoiceIdPF_B,
          status: 'PENDING', // Or FAILED from a previous attempt
          tokens_to_award: 0,
        } as Partial<Tables<'payment_transactions'>>];

        // retrieveSubscriptionStubPf is configured in the describe's beforeEach to return subscriptionDetailsB
        // which has status: 'unpaid' for stripeSubscriptionIdPF_B

        const mockInvoiceFailed: Partial<Stripe.Invoice> = {
          id: invoiceIdPF_B,
          status: 'open', // Or 'void' or other relevant status for a retry failure
          subscription: stripeSubscriptionIdPF_B,
          customer: stripeCustomerIdPF_B,
          metadata: { user_id: userIdPF_B },
          billing_reason: 'subscription_cycle', // Could be 'subscription_update' or other, ensure handler is robust
          attempt_count: 2, // Indicate this is not the first attempt for this invoice
        };
        const mockEvent = {
          id: `evt_invoice_pf_B_${invoiceIdPF_B}`,
          type: 'invoice.payment_failed' as Stripe.Event.Type,
          data: { object: mockInvoiceFailed as Stripe.Invoice },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', () => Promise.resolve(mockEvent));

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-invoice-pf-B' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        
        assertEquals(response.status, 200, "Response status for second failure scenario should be 200");
        const processedPaymentTransactionId = dbCounters.capturedPaymentTransactionsUpsert?.[0]?.id || dbCounters.capturedPaymentTransactionsUpdate?.id || 'pt_for_failed_invoice_B';
        assertEquals(responseBody.transactionId, processedPaymentTransactionId, "Response transactionId mismatch for second failure");

        assert(dbCounters.paymentTransactionsUpdateCallCount > 0 || dbCounters.paymentTransactionsUpsertCallCount > 0, "PT Update or Upsert should be called (Scenario B)");
        const finalPTState = dbCounters.capturedPaymentTransactionsUpdate || dbCounters.capturedPaymentTransactionsUpsert?.[0];
        assertExists(finalPTState, "Final PT state not captured (Scenario B)");
        assertEquals(finalPTState.status, 'FAILED', "PT status for Scenario B should be FAILED");

        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "user_subscriptions update count for Scenario B");
        assertExists(dbCounters.capturedUserSubscriptionsUpdate, "Captured US update for Scenario B");
        // The subscriptionDetailsB mock for stripe.subscriptions.retrieve returns 'unpaid'.
        // The adapter should use this status.
        assertEquals(dbCounters.capturedUserSubscriptionsUpdate.status, 'unpaid', "US status for Scenario B should be unpaid");
      });

    });
  });