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
  import { createMockSupabaseClient, MockQueryBuilderState, IMockSupabaseClient, IMockQueryBuilder } from '../_shared/supabase.mock.ts';
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
    
  // Define the DbCounters type
  type DbCounters = {
    // General mock behavior
    stripeApiError: Stripe.errors.StripeAPIError | null;

    // Call counters
    selectCallCount: number;
    insertCallCount: number; // General insert for subscription_plans
    updateCallCount: number; // General update for subscription_plans
    deleteCallCount: number;
    eqCallCount: number;     // Generic .eq() counter for general queries (if any)
    neqCallCount: number;    // Generic .neq() counter for general queries (if any)

    // Captured data for generic mocks (e.g., subscription_plans)
    capturedInsertData: TablesInsert<'subscription_plans'>[] | null;
    capturedUpsertData: TablesInsert<'subscription_plans'>[] | null; // If subscription_plans uses upsert
    capturedUpdateDataManual: Partial<Tables<'subscription_plans'>> | null; // For manual checks on subscription_plans updates

    // Payment Transactions specific
    paymentTransactionsInsertCallCount: number;
    capturedPaymentTransactionsInsert: TablesInsert<'payment_transactions'>[] | null;
    paymentTransactionsUpdateCallCount: number; // Specific to PT updates (e.g. status changes)
    capturedPaymentTransactionsUpdate: Partial<Tables<'payment_transactions'>> | null; // Captures data for PT updates
    paymentTransactionsUpsertCallCount: number;
    capturedPaymentTransactionsUpsert: TablesInsert<'payment_transactions'>[] | null;
    paymentTransactionsEqCallCount: number; // Specific to PT .eq() chains (e.g. .eq('id', ...))

    // User Subscriptions specific
    userSubscriptionsInsertCallCount: number;
    capturedUserSubscriptionsInsert: TablesInsert<'user_subscriptions'>[] | null;
    userSubscriptionsUpsertCallCount: number;
    capturedUserSubscriptionsUpsert: TablesInsert<'user_subscriptions'>[] | null;
    userSubscriptionsUpdateCallCount: number;
    capturedUserSubscriptionsUpdate: Partial<Tables<'user_subscriptions'>> | null;
    userSubscriptionsEqCallCount: number; // Specific to US .eq() chains

    // Token Wallet specific
    tokenWalletRecordTransactionCallCount: number;

    // Data to be returned by select mocks
    paymentTransactionsSelectData: Partial<Tables<'payment_transactions'>>[] | null;
    userSubscriptionsSelectData: Partial<Tables<'user_subscriptions'>>[] | null;
    subscriptionPlansSelectData: (Partial<Tables<'subscription_plans'>> & { id?: string })[] | null;
    tokenWalletsSelectData: Partial<Tables<'token_wallets'>>[] | null;

    // Flags to force errors in mock DB operations
    forcePaymentTransactionUpdateError: Error | null;
    targetPtxIdForUpdateError: string | null;
    forceUserSubscriptionUpsertError: Error | null;
    targetStripeSubIdForUpsertError: string | null;
  };

  // Initialize dbCounters with default values
  const dbCounters: DbCounters = {
    stripeApiError: null,
    selectCallCount: 0,
    insertCallCount: 0,
    updateCallCount: 0,
    deleteCallCount: 0,
    eqCallCount: 0,
    neqCallCount: 0,
    capturedInsertData: null,
    capturedUpsertData: null,
    capturedUpdateDataManual: null,
    paymentTransactionsInsertCallCount: 0,
    capturedPaymentTransactionsInsert: null,
    paymentTransactionsUpdateCallCount: 0,
    capturedPaymentTransactionsUpdate: null,
    paymentTransactionsUpsertCallCount: 0,
    capturedPaymentTransactionsUpsert: null,
    paymentTransactionsEqCallCount: 0,
    userSubscriptionsInsertCallCount: 0,
    capturedUserSubscriptionsInsert: null,
    userSubscriptionsUpsertCallCount: 0,
    capturedUserSubscriptionsUpsert: null,
    userSubscriptionsUpdateCallCount: 0,
    capturedUserSubscriptionsUpdate: null,
    userSubscriptionsEqCallCount: 0,
    tokenWalletRecordTransactionCallCount: 0,
    paymentTransactionsSelectData: null,
    userSubscriptionsSelectData: null,
    subscriptionPlansSelectData: null,
    tokenWalletsSelectData: null,
    forcePaymentTransactionUpdateError: null,
    targetPtxIdForUpdateError: null,
    forceUserSubscriptionUpsertError: null,
    targetStripeSubIdForUpsertError: null,
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
    let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource> | null = null; // MOVED and INITIALIZED HERE
  
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
      if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) { // MOVED RESTORATION LOGIC HERE
          retrieveSubscriptionStub.restore();
      }
    });

    // New describe block for testing with the real StripePaymentAdapter
    describe('Stripe Event Processing with Real StripePaymentAdapter', () => {
      beforeEach(() => {
        // Reset captured data and counts for each test in this suite
        // Reset all fields of dbCounters
        for (const key in dbCounters) {
          (dbCounters as any)[key] = typeof (dbCounters as any)[key] === 'number' ? 0 : null;
        }
        
        dbCounters.stripeApiError = null;
        dbCounters.paymentTransactionsUpdateCallCount = 0;
        dbCounters.tokenWalletRecordTransactionCallCount = 0;
        dbCounters.capturedPaymentTransactionsUpdate = null;
        dbCounters.selectCallCount = 0;
        dbCounters.insertCallCount = 0;
        dbCounters.updateCallCount = 0; // General update counter
        dbCounters.deleteCallCount = 0;
        dbCounters.capturedInsertData = null;
        dbCounters.capturedUpsertData = null;
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
        dbCounters.subscriptionPlansSelectData = [
          { 
            stripe_price_id: 'price_for_invoice_ps', 
            item_id_internal: 'item_id_for_invoice_ps', 
            tokens_to_award: 7500,
            id: 'plan_for_invoice_ps' // Added id
          },
          // For checkout.session.completed (mode: subscription) success test
          {
            id: 'plan_sub_test_integration',
            item_id_internal: 'test_subscription_item_id', 
            stripe_price_id: 'price_sub_test_integration', 
            tokens_to_award: 5000,
          },
          // For checkout.session.completed (mode: subscription) idempotency test
          {
            id: 'plan_sub_idem_test_integration', 
            item_id_internal: 'test_subscription_item_id_idem', 
            stripe_price_id: 'price_sub_idem_test_integration', 
            tokens_to_award: 5000,
          },
          // For checkout.session.completed (mode: subscription) - Token Award Failure (Initial Payment) Test
          {
            id: 'plan_sub_token_f_init_int',
            item_id_internal: 'item_id_sub_token_f_init',
            tokens_to_award: 777,
            stripe_price_id: 'price_for_sub_token_fail',
          },
          // For checkout.session.completed (mode: subscription) - DB Upsert Failure (UserSubscriptions) Test
          {
            id: 'plan_sub_us_upsert_f_int',
            item_id_internal: 'item_id_sub_us_upsert_f',
            tokens_to_award: 888,
            stripe_price_id: 'price_for_sub_us_upsert_fail',
          },
          // For checkout.session.completed (mode: subscription) - DB Update Failure (PaymentTransaction - Initial) Test
          {
            id: 'plan_sub_pt_upd_f_init_int',
            item_id_internal: 'item_id_sub_pt_upd_f_init',
            tokens_to_award: 999,
            stripe_price_id: 'price_for_sub_pt_upd_fail_init', // Corrected to match typical usage
          }
          // Note: The "Missing Subscription Plan" test explicitly sets dbCounters.subscriptionPlansSelectData = []
          // so its item_id ('item_id_sub_missing_plan_NONEXISTENT') should NOT be added here.
        ];
        // --- RESET NEW ERROR FLAGS ---
        dbCounters.forcePaymentTransactionUpdateError = null;
        dbCounters.targetPtxIdForUpdateError = null;
        // --- RESET NEW USER_SUBSCRIPTION ERROR FLAGS ---
        dbCounters.forceUserSubscriptionUpsertError = null;
        dbCounters.targetStripeSubIdForUpsertError = null;
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
              select: (state: MockQueryBuilderState) => { // Modified to handle item_id_internal lookup dynamically
                const itemIdFilter = state.filters?.find(f => f.column === 'item_id_internal' && f.type === 'eq');
                if (itemIdFilter && itemIdFilter.value && dbCounters.subscriptionPlansSelectData) {
                  const foundPlan = dbCounters.subscriptionPlansSelectData.find(p => p.item_id_internal === itemIdFilter.value);
                  if (foundPlan) {
                    let dataToReturn: Partial<Tables<'subscription_plans'>> = { id: foundPlan.id };
                    if (state.selectColumns && state.selectColumns !== 'id') { 
                        dataToReturn = { ...foundPlan }; 
                        if (state.selectColumns !== '*') { 
                            const selectedCols = state.selectColumns.split(',').map(c => c.trim());
                            const filteredData: Partial<Tables<'subscription_plans'>> = {};
                            selectedCols.forEach(col => {
                                if (col in dataToReturn) {
                                    (filteredData as any)[col] = (dataToReturn as any)[col];
                                }
                            });
                            dataToReturn = filteredData;
                        }
                    }
                    return Promise.resolve({ data: [dataToReturn], error: null, count: 1, status: 200, statusText: `OK (Found Plan by item_id_internal: ${itemIdFilter.value})` });
                  }
                }
                // If no specific filter for item_id_internal or plan not found in mock data, return empty array for data
                return Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Empty Select or Plan Not Found in Mock by item_id_internal)'});
              },
              delete: () => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Mock Delete)'}), // Added statusText
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
              select: (state: MockQueryBuilderState) => {
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
              update: (state: MockQueryBuilderState) => {
                const ptxIdBeingUpdated = state.filters?.find(f => f.column === 'id')?.value as string | undefined;
                console.log(`[Mock QB payment_transactions] ENTERING UPDATE FN for ${ptxIdBeingUpdated}. Current count BEFORE inc: ${dbCounters.paymentTransactionsUpdateCallCount}`);
                dbCounters.paymentTransactionsUpdateCallCount++;
                console.log(`[Mock QB payment_transactions] Current count AFTER inc: ${dbCounters.paymentTransactionsUpdateCallCount} for ${ptxIdBeingUpdated}`); 
                
                // Capture the update data along with the ID if available
                dbCounters.capturedPaymentTransactionsUpdate = {
                  ...(ptxIdBeingUpdated && { id: ptxIdBeingUpdated }),
                  ...(state.updateData as object),
                } as Partial<Tables<'payment_transactions'>>;

                // --- Check for forced error ---
                if (dbCounters.forcePaymentTransactionUpdateError && 
                    ptxIdBeingUpdated === dbCounters.targetPtxIdForUpdateError &&
                    state.updateData && (state.updateData as Partial<Tables<'payment_transactions'>>).status === 'COMPLETED') {
                    const errToReturn = dbCounters.forcePaymentTransactionUpdateError;
                    console.error(`[Mock QB payment_transactions] FORCING DB ERROR for update on ${ptxIdBeingUpdated}:`, errToReturn);
                    return Promise.resolve({ data: null, error: errToReturn, count: 0, status: 500, statusText: 'Internal Server Error (Test Forced DB Error)' });
                }

                // Simulate successful update, returning the updated data including a simulated updated_at
                const dataToReturn = {
                    id: ptxIdBeingUpdated,
                    ...(state.updateData as object),
                    updated_at: new Date().toISOString(),
                };

                let finalDataToReturn: any = dataToReturn;
                if (state.selectColumns && state.selectColumns !== '*' && ptxIdBeingUpdated) {
                    const selectedReturn: Partial<Tables<'payment_transactions'>> = { id: ptxIdBeingUpdated };
                    for (const col of state.selectColumns.split(',')) {
                        if (col.trim() !== 'id' && Object.prototype.hasOwnProperty.call(dataToReturn, col.trim())) { // LINTER FIX
                            (selectedReturn as any)[col.trim()] = (dataToReturn as any)[col.trim()];
                        }
                    }
                    if (Object.keys(selectedReturn).length === 1 && selectedReturn.id === ptxIdBeingUpdated && state.selectColumns !== 'id') {
                         // If only ID was selected implicitly but more was requested, return full object (or PostgREST does)
                         // This mimics Supabase behavior where if you .select('non_id_col') it still returns id.
                         // However, if you .select() nothing, it returns all.
                         // If .select('id'), it returns only id.
                    } else {
                        finalDataToReturn = selectedReturn;
                    }
                } else if (state.selectColumns === 'id' && ptxIdBeingUpdated) {
                    finalDataToReturn = { id: ptxIdBeingUpdated };
                } // Else, if selectColumns is '*' or undefined, return the whole dataToReturn object

                return Promise.resolve({ data: [finalDataToReturn], error: null, count: 1, status: 200, statusText: 'OK (Updated)' });
              },
              upsert: (state: MockQueryBuilderState) => {
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

                // --- NEW: Check for forced user_subscription upsert error ---
                const stripeSubIdBeingUpserted = (state.upsertData as TablesInsert<'user_subscriptions'>)?.stripe_subscription_id;
                if (
                  dbCounters.forceUserSubscriptionUpsertError &&
                  stripeSubIdBeingUpserted &&
                  stripeSubIdBeingUpserted === dbCounters.targetStripeSubIdForUpsertError
                ) {
                  const errToReturn = dbCounters.forceUserSubscriptionUpsertError;
                  return Promise.resolve({
                    data: null,
                    error: errToReturn,
                    count: 0,
                    status: 500, // Or a more specific error status reflecting DB error
                    statusText: 'Internal Server Error (Test Forced DB Upsert Error for user_subscriptions)'
                  });
                }
                // --- END NEW ---

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
        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) { // MOVED RESTORATION LOGIC HERE
            retrieveSubscriptionStub.restore();
        }
      });
     
      // --- checkout.session.completed Event Tests ---
      describe('checkout.session.completed event', () => {
        let recordTransactionSpy: Spy<ITokenWalletService, Parameters<ITokenWalletService['recordTransaction']>, Promise<TokenWalletTransaction>>;
        // let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource> | null = null; // REMOVED FROM HERE
  
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
          // if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) { // REMOVED FROM HERE
          //     retrieveSubscriptionStub.restore();
          // }
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
          assertEquals(responseBody2.transactionId, internalPaymentId, "Second call transactionId should match first call (internalPaymentId)");
          
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
    
      describe('checkout.session.completed (mode: payment) idempotency', () => {
        it('should process the same event twice, award tokens once, update PT once', async () => {
          const internalPaymentId = 'ptx_idem_cs_payment_1';
          const userId = 'user_idem_cs_payment_1';
          const tokensToAward = 1000;
          const sessionId = 'cs_idem_payment_1';
          const eventId = `evt_idem_cs_payment_${sessionId}`;
          const customerId = 'cus_idem_cs_payment_1';
          const paymentIntentId = 'pi_idem_cs_payment_1';
          const clientReferenceId = userId;

          // --- Setup for FIRST Call ---
          dbCounters.paymentTransactionsSelectData = [{
            id: internalPaymentId,
            status: 'PENDING',
            tokens_to_award: tokensToAward,
            target_wallet_id: `wallet_for_${userId}`,
            user_id: userId,
            metadata_json: { item_id: 'item_checkout_payment_idem' }
          }];
          dbCounters.tokenWalletsSelectData = [{
            wallet_id: `wallet_for_${userId}`,
            user_id: userId,
            balance: 5000, 
            currency: 'AI_TOKEN',
          }];

          const mockCheckoutSessionObject: Partial<Stripe.Checkout.Session> = {
            id: sessionId,
            mode: 'payment',
            status: 'complete',
            payment_status: 'paid',
            customer: customerId,
            client_reference_id: clientReferenceId,
            payment_intent: paymentIntentId,
            metadata: { internal_payment_id: internalPaymentId },
            // Add other necessary fields if your handler uses them
          };

          const stripeEventData: Stripe.Event = {
            id: eventId, 
            type: 'checkout.session.completed', 
            api_version: '2020-08-27',
            created: Math.floor(Date.now() / 1000), 
            livemode: false, 
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null }, 
            object: 'event',
            data: { object: mockCheckoutSessionObject as Stripe.Checkout.Session },
          };

          // Restore and re-stub constructEventAsync for this specific test
          if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEventData);

          // Configure the adapter factory for this test
          configuredSourceForAdapterStub = 'stripe';
          mockEnvVarsForFileScope['STRIPE_WEBHOOK_SIGNING_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET; // Ensure secret is set

          const requestDetails = {
            method: 'POST', 
            body: JSON.stringify(stripeEventData), 
            headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_idem_cs_payment_1' },
          };

          // --- First Call ---
          // The payment transaction should be found by the handler now.
          const response1 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
          const responseBody1 = await response1.json() as PaymentConfirmation;

          assertEquals(response1.status, 200, "First call: status should be 200");
          assertExists(responseBody1.transactionId, "First call: transactionId should exist in response (this will be the internalPaymentId)");
          assertEquals(responseBody1.transactionId, internalPaymentId, "First call: transactionId in response should be the internalPaymentId");

          assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 1, "First call: PT update count for status COMPLETED");
          const updatedPTCall1 = dbCounters.capturedPaymentTransactionsUpdate;
          assertExists(updatedPTCall1, "First call: updatedPTCall1 should exist");
          assertEquals(updatedPTCall1.status, 'COMPLETED', "First call: updatedPTCall1 status should be COMPLETED");
          assertEquals(updatedPTCall1.gateway_transaction_id, sessionId, "First call: updatedPTCall1 gateway_transaction_id should be session ID");
          // assertEquals(updatedPTCall1.tokens_to_award?.toString(), tokensToAward.toString(), "First call: updatedPTCall1 tokens_to_award"); // tokens_to_award is on the original record from initiate-payment

          const recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
          assertEquals(recordTransactionSpy.calls.length, 1, "First call: recordTransactionSpy call count");
          const txArgs1 = recordTransactionSpy.calls[0].args[0];
          assertEquals(txArgs1.walletId, `wallet_for_${userId}`, "First call: recordTransactionSpy walletId");
          assertEquals(txArgs1.type, 'CREDIT_PURCHASE', "First call: recordTransactionSpy type");
          assertEquals(txArgs1.amount, tokensToAward.toString(), "First call: recordTransactionSpy amount"); // Amount comes from payment_transactions record
          assertEquals(txArgs1.relatedEntityId, internalPaymentId, "First call: recordTransactionSpy relatedEntityId");

          // --- Setup for SECOND Call ---
          // Simulate that the payment transaction record now exists and is COMPLETED
          dbCounters.paymentTransactionsSelectData = [{
            id: internalPaymentId,
            status: 'COMPLETED',
            tokens_to_award: tokensToAward, 
            user_id: userId,
            target_wallet_id: `wallet_for_${userId}`,
            gateway_transaction_id: sessionId,
            updated_at: new Date().toISOString(), // Should reflect the update from the first call
            created_at: dbCounters.paymentTransactionsSelectData[0]?.created_at || new Date().toISOString(), // Preserve original created_at
            metadata_json: dbCounters.paymentTransactionsSelectData[0]?.metadata_json, // Preserve original metadata
            payment_gateway_id: 'stripe',
          }];
          // Reset counters for the second call verification for clarity
          dbCounters.paymentTransactionsUpdateCallCount = 0;
          // recordTransactionSpy's call count should remain 1 after the second call.

          // --- Second Call (Same Event) ---
          const response2 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
          const responseBody2 = await response2.json() as PaymentConfirmation;

          assertEquals(response2.status, 200, "Second call: status should be 200 (idempotency)");
          assertEquals(responseBody2.transactionId, internalPaymentId, "Second call: transactionId should match first call (internalPaymentId)");
          assertEquals(responseBody2.message, 'Webhook processed', "Second call: message for already processed event");

          assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 0, "Second call: PT update count should remain 0 (no new updates)");
          assertEquals(recordTransactionSpy.calls.length, 1, "Second call: recordTransactionSpy call count should remain 1");
        });

        it('should handle Token Award Failure for checkout.session.completed (mode: payment) and return 400/500', async () => {
          const internalPaymentId = 'ipid_test_checkout_payment_token_fail';
          const userIdForWallet = 'user_checkout_payment_token_fail';
          const mockGatewayTxId = 'cs_test_checkout_payment_token_fail';

          dbCounters.paymentTransactionsSelectData = [{
            id: internalPaymentId,
            status: 'PENDING',
            tokens_to_award: 100,
            target_wallet_id: 'wallet_for_checkout_payment_token_fail',
            user_id: userIdForWallet,
            metadata_json: { item_id: 'item_checkout_payment_token_fail' }
          }];

          const tokenAwardError = new Error('Simulated Token Award Failure');
          
          // Restore the default stub for recordTransaction first, then re-stub it to throw for this test.
          if (mockTokenWalletServiceInstance.stubs.recordTransaction && !mockTokenWalletServiceInstance.stubs.recordTransaction.restored) {
            mockTokenWalletServiceInstance.stubs.recordTransaction.restore();
          }
          const tempRecordTxStub = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async () => {
            throw tokenAwardError;
          });

          const mockCheckoutSessionPaymentEvent: Partial<Stripe.Checkout.Session> = {
            id: mockGatewayTxId,
            object: 'checkout.session',
            mode: 'payment',
            status: 'complete',
            payment_status: 'paid',
            metadata: { internal_payment_id: internalPaymentId },
          };

          const stripeEvent = {
            id: 'evt_checkout_payment_token_fail',
            type: 'checkout.session.completed',
            data: { object: mockCheckoutSessionPaymentEvent as Stripe.Checkout.Session },
            // Minimal other Stripe.Event fields to satisfy type
            api_version: '2020-08-27',
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null },
            object: 'event' as const,
          } as Stripe.Event;

          // Restore global constructEventStub if active, then re-stub for this test
          if (constructEventStub && !constructEventStub.restored) {
            constructEventStub.restore();
          }
          constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);

          try {
            const request = new Request('http://localhost/webhooks/stripe', {
              method: 'POST',
              body: JSON.stringify({}), // Body content isn't used by constructEventAsync mock here
              headers: { 'stripe-signature': 'sig_payment_token_fail' }, // Signature isn't verified by mock here
            });
            const response = await handleWebhookRequestLogic(request, dependencies);
            const responseBody = await response.json();

            assertEquals(response.status, 400);
            assertExists(responseBody.error);
            // Use the transformed ID for the expected error message
            const transformedPaymentId = internalPaymentId.startsWith('ipid_') ? internalPaymentId.substring(5) : internalPaymentId;
            assertEquals(responseBody.error, `Failed to award tokens for payment transaction ${transformedPaymentId}: ${tokenAwardError.message}`);
            
            assertEquals(tempRecordTxStub.calls.length, 1);
            
            // Check that payment_transactions was updated to TOKEN_AWARD_FAILED
            // The first update is for COMPLETED (before token award attempt)
            // The second update is for TOKEN_AWARD_FAILED (after token award attempt fails)
            assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 2); 
            
            assertExists(dbCounters.capturedPaymentTransactionsUpdate, "Captured payment transaction update data is missing.");
            assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'TOKEN_AWARD_FAILED');
          } finally {
            // Restore the temporary stub for recordTransaction
            if (tempRecordTxStub && !tempRecordTxStub.restored) {
              tempRecordTxStub.restore();
            }
            // After restoring the temp stub, re-apply the default stub from the mock service
            // This is to ensure the service instance is back to its default mocked state defined by createMockTokenWalletService
            // This might involve re-stubbing it with the default implementation if just restoring isn't enough.
            // However, the main `afterEach` calls `mockTokenWalletServiceInstance.clearStubs()` which should restore all original stubs.

            // The global constructEventStub is restored by the outer afterEach
          }
        });

      }); // End Mode: payment

      // --- DB Update Failure (PaymentTransaction to COMPLETED) Test ---
      it('should return 500 if DB update to COMPLETED fails for checkout.session.completed (mode: payment)', async () => {
        const internalPaymentId = 'ptx_db_update_fail_cs_payment';
        const userId = 'user_db_update_fail_cs_payment';
        const sessionId = 'cs_db_update_fail_payment';
        const tokensToAward = 100;

        dbCounters.paymentTransactionsSelectData = [{
          id: internalPaymentId,
          status: 'PENDING',
          tokens_to_award: tokensToAward,
          target_wallet_id: `wallet_for_${userId}`,
          user_id: userId,
          metadata_json: { item_id: 'item_db_update_fail' }
        }];

        const dbUpdateError = new Error('Simulated DB update failure for payment_transactions to COMPLETED');
        // No need to get paymentTransactionsQB here for stubbing
        
        // const tempUpdateStub: Stub<IMockQueryBuilder, [data: object], IMockQueryBuilder> | null = null; // REMOVED
        // const tempResolveQueryStub: Stub | null = null; // REMOVED

        const mockCheckoutSessionObject: Partial<Stripe.Checkout.Session> = {
          id: sessionId,
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId },
        };
        const stripeEvent: Stripe.Event = {
          id: `evt_db_update_fail_${sessionId}`,
          type: 'checkout.session.completed',
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          object: 'event',
          data: { object: mockCheckoutSessionObject as Stripe.Checkout.Session },
        };

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);

        const requestDetails = {
          method: 'POST',
          body: JSON.stringify(stripeEvent),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_db_update_fail_cs_payment' },
        };

        let response;
        let responseBody;
        try {
          // --- SET FLAGS TO INDUCE ERROR IN THE MOCK ---
          dbCounters.forcePaymentTransactionUpdateError = dbUpdateError;
          dbCounters.targetPtxIdForUpdateError = internalPaymentId;

          response = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
          responseBody = await response.json() as PaymentConfirmation;

          assertEquals(response.status, 500, "Response status should be 500 for DB update failure");
          assertExists(responseBody.error, "Response body should contain an error");
          const expectedError = `Critical: Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`;
          assertEquals(responseBody.error, expectedError);
          assertEquals(responseBody.transactionId, internalPaymentId);

          const recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
          assertEquals(recordTransactionSpy.calls.length, 0, "TokenWalletService.recordTransaction should not have been called");
          assert(dbCounters.paymentTransactionsUpdateCallCount >= 1, "Payment transaction update to COMPLETED should have been attempted");

        } finally {
          // --- CLEAR FLAGS --- 
          dbCounters.forcePaymentTransactionUpdateError = null;
          dbCounters.targetPtxIdForUpdateError = null;
        }
      });
      // --- End DB Update Failure Test ---

      // --- Missing Initial PaymentTransaction Test ---
      it('should return 404 if initial PENDING payment_transaction is not found for checkout.session.completed (mode: payment)', async () => {
        const internalPaymentId = 'ptx_missing_initial_cs_payment';
        const userId = 'user_missing_initial_cs_payment'; // Not strictly needed as PT won't be found
        const sessionId = 'cs_missing_initial_payment';

        // Simulate payment_transactions record NOT being found
        dbCounters.paymentTransactionsSelectData = []; // Or null, mock will return empty for .single() leading to !paymentTx

        const mockCheckoutSessionObject: Partial<Stripe.Checkout.Session> = {
          id: sessionId,
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId, // Still provide it as webhook would
          metadata: { internal_payment_id: internalPaymentId }, // Crucial: the ID that won't be found
        };
        const stripeEvent: Stripe.Event = {
          id: `evt_missing_ptx_${sessionId}`,
          type: 'checkout.session.completed',
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          object: 'event',
          data: { object: mockCheckoutSessionObject as Stripe.Checkout.Session },
        };

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);

        const requestDetails = {
          method: 'POST',
          body: JSON.stringify(stripeEvent),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_missing_ptx_cs_payment' },
        };

        const response = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody = await response.json() as PaymentConfirmation;

        assertEquals(response.status, 404, "Response status should be 404 for missing initial payment transaction");
        assertExists(responseBody.error, "Response body should contain an error");
        assertEquals(responseBody.error, `Payment transaction not found: ${internalPaymentId}`);
        assertEquals(responseBody.transactionId, internalPaymentId, "Response body should contain the attempted transactionId");

        // Ensure no attempts were made to update or award tokens
        const recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;
        assertEquals(recordTransactionSpy.calls.length, 0, "TokenWalletService.recordTransaction should not have been called");
        assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 0, "Payment transaction update should not have been attempted");
      });
      // --- End Missing Initial PaymentTransaction Test ---
      // --- Token Award Failure (Initial Payment) for Subscription Test ---
      it('mode: subscription - should handle Token Award Failure (Initial Payment) and update PT status', async () => {
        const internalPaymentId = 'ptx_sub_token_fail_init';
        const userId = 'user_sub_token_fail_init';
        const stripeSubscriptionId = 'sub_token_fail_init_integ';
        const stripeCustomerId = 'cus_token_fail_init_integ';
        const planIdLookup = 'plan_sub_token_f_init_int'; // This is what DB should return for plan_id
        const internalItemIdForLookup = 'item_id_sub_token_f_init';
        const tokensToAward = 777;
        const sessionId = 'cs_sub_token_fail_init';

        // --- Setup for THIS TEST --
        dbCounters.paymentTransactionsSelectData = [{
          id: internalPaymentId,
          user_id: userId,
          target_wallet_id: `wallet_for_${userId}`,
          status: 'PENDING',
          tokens_to_award: tokensToAward,
          metadata_json: { item_id: internalItemIdForLookup, plan_id: planIdLookup } // Ensure metadata matches
        }];
        dbCounters.subscriptionPlansSelectData = [{ // Specific plan for this test
          id: planIdLookup,
          item_id_internal: internalItemIdForLookup,
          tokens_to_award: tokensToAward, // Match expected tokens
          stripe_price_id: 'price_for_sub_token_fail', // Any valid price ID
        }];
        dbCounters.userSubscriptionsSelectData = []; // No existing subscription initially

        // Mock TokenWalletService to throw an error
        if (mockTokenWalletServiceInstance.stubs.recordTransaction && !mockTokenWalletServiceInstance.stubs.recordTransaction.restored) {
          mockTokenWalletServiceInstance.stubs.recordTransaction.restore();
        }
        const tempRecordTxStubSubFail = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async () => {
          throw new Error('Simulated Subscription Token Award Failure (Initial)');
        });

        const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
          id: sessionId,
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, plan_id: planIdLookup, item_id: internalItemIdForLookup },
          subscription: stripeSubscriptionId,
          customer: stripeCustomerId,
        };

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async () => {
          const now = Math.floor(Date.now() / 1000);
          return Promise.resolve({
            object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId,
            status: 'active' as Stripe.Subscription.Status,
            items: { data: [{ price: { id: 'price_sub_token_fail_init', product: 'prod_sub_token_fail_init', object: 'price' as const, active: true, currency: 'usd' } }] } as any,
            current_period_start: now - 10000, current_period_end: now + 10000,
            cancel_at_period_end: false, created: now -20000, livemode: false, start_date: now - 20000,
            metadata: { plan_id: planIdLookup },
            lastResponse: { headers: {}, requestId: 'req_mock_sub_token_f_init', statusCode: 200, }
          } as unknown as Stripe.Response<Stripe.Subscription>);
        });

        const stripeEvent: Stripe.Event = {
          id: `evt_sub_token_fail_init_${sessionId}`, type: 'checkout.session.completed',
          data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
          api_version: '2020-08-27', created: Math.floor(Date.now()/1000), livemode: false, pending_webhooks: 0, request: {id:null, idempotency_key:null}, object:'event'
        };
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);

        try {
            const request = new Request('http://localhost/webhooks/stripe', {
                method: 'POST', body: JSON.stringify({}), headers: { 'stripe-signature': 'sig_sub_token_fail_init' },
            });
            const response = await handleWebhookRequestLogic(request, dependencies);
            const responseBody = await response.json();

            assertEquals(response.status, 400, "Response status should be 400 for token award failure");
            assertExists(responseBody.error, "Response body should contain an error");
            assertEquals(responseBody.error, `Failed to award tokens for payment transaction ${internalPaymentId}: Simulated Subscription Token Award Failure (Initial)`);
            assertEquals(responseBody.transactionId, internalPaymentId);

            assertEquals(tempRecordTxStubSubFail.calls.length, 1, "TokenWalletService.recordTransaction should have been called once");
            
            assertEquals(dbCounters.userSubscriptionsUpsertCallCount, 1, "user_subscriptions should have been upserted once");
            const upsertedSub = dbCounters.capturedUserSubscriptionsUpsert?.[0];
            assertExists(upsertedSub);
            assertEquals(upsertedSub.stripe_subscription_id, stripeSubscriptionId);
            
            // PT update to COMPLETED (by handler) + PT update to TOKEN_AWARD_FAILED (by handler after error)
            assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 2, "Payment transactions should be updated twice (COMPLETED, then TOKEN_AWARD_FAILED)");
            assertExists(dbCounters.capturedPaymentTransactionsUpdate); // This will be the TOKEN_AWARD_FAILED update
            assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'TOKEN_AWARD_FAILED', "Final PT status should be TOKEN_AWARD_FAILED");
        } finally {
            if (tempRecordTxStubSubFail && !tempRecordTxStubSubFail.restored) tempRecordTxStubSubFail.restore();
        }
      });
      // --- End Token Award Failure (Initial Payment) for Subscription Test ---

      // --- DB Upsert Failure (UserSubscriptions) for Subscription Test ---
      it('mode: subscription - should handle DB Upsert Failure (UserSubscriptions) and return 400', async () => {
        const internalPaymentId = 'ptx_sub_us_upsert_fail';
        const userId = 'user_sub_us_upsert_fail';
        const stripeSubscriptionId = 'sub_us_upsert_fail_integ';
        const stripeCustomerId = 'cus_us_upsert_fail_integ';
        const planIdLookup = 'plan_sub_us_upsert_f_int'; // This is what DB should return for plan_id
        const internalItemIdForLookup = 'item_id_sub_us_upsert_f';
        const tokensToAward = 888;
        const sessionId = 'cs_sub_us_upsert_fail';

        // --- Setup for THIS TEST --
        dbCounters.paymentTransactionsSelectData = [{
          id: internalPaymentId,
          user_id: userId,
          target_wallet_id: `wallet_for_${userId}`,
          status: 'PENDING',
          tokens_to_award: tokensToAward,
          metadata_json: { item_id: internalItemIdForLookup, plan_id: planIdLookup }
        }];
        dbCounters.subscriptionPlansSelectData = [{ // Specific plan for this test
          id: planIdLookup,
          item_id_internal: internalItemIdForLookup,
          tokens_to_award: tokensToAward,
          stripe_price_id: 'price_for_sub_us_upsert_fail',
        }];
        dbCounters.userSubscriptionsSelectData = [];

        // Force user_subscriptions.upsert to fail
        if (mockTokenWalletServiceInstance.stubs.recordTransaction && !mockTokenWalletServiceInstance.stubs.recordTransaction.restored) {
          mockTokenWalletServiceInstance.stubs.recordTransaction.restore();
        }
        const tempRecordTxStub = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async () => {
          throw new Error('Simulated DB upsert failure for user_subscriptions');
        });

        const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
          id: sessionId, mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, plan_id: planIdLookup, item_id: internalItemIdForLookup },
          subscription: stripeSubscriptionId, customer: stripeCustomerId,
        };

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async () => { /* ... successful retrieve ... */ 
          const now = Math.floor(Date.now() / 1000);
          return Promise.resolve({
            object: 'subscription' as const, id: stripeSubscriptionId, customer: stripeCustomerId,
            status: 'active' as Stripe.Subscription.Status,
            items: { data: [{ price: { id: 'price_sub_us_upsert_f', product: 'prod_sub_us_upsert_f', object: 'price' as const, active: true, currency: 'usd' } }] } as any,
            current_period_start: now - 10000, current_period_end: now + 10000,
            cancel_at_period_end: false, created: now -20000, livemode: false, start_date: now - 20000,
            metadata: { plan_id: planIdLookup },
            lastResponse: { headers: {}, requestId: 'req_mock_sub_us_upsert_f', statusCode: 200, }
          } as unknown as Stripe.Response<Stripe.Subscription>);
        });
        
        const userSubUpsertError = new Error('Simulated DB upsert failure for user_subscriptions');
        const recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction; // Get ref before potentially clearing

        const stripeEvent: Stripe.Event = { /* ... event object ... */ 
          id: `evt_sub_us_upsert_fail_${sessionId}`, type: 'checkout.session.completed',
          data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
          api_version: '2020-08-27', created: Math.floor(Date.now()/1000), livemode: false, pending_webhooks: 0, request: {id:null, idempotency_key:null}, object:'event'
        };
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);

        try {
          dbCounters.forceUserSubscriptionUpsertError = userSubUpsertError;
          dbCounters.targetStripeSubIdForUpsertError = stripeSubscriptionId;

          const request = new Request('http://localhost/webhooks/stripe', {
              method: 'POST', body: JSON.stringify({}), headers: { 'stripe-signature': 'sig_sub_us_upsert_fail' },
          });
          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();

          assertEquals(response.status, 400, "Response status should be 400 for user_subscriptions upsert failure");
          assertExists(responseBody.error);
          assertEquals(responseBody.error, `Failed to upsert user_subscription for ${stripeSubscriptionId}: Simulated DB upsert failure for user_subscriptions`);
          
          assertEquals(dbCounters.userSubscriptionsUpsertCallCount, 1, "user_subscriptions upsert should have been attempted once");
          
          // PaymentTransaction should be marked as COMPLETED despite upsert failure as per handler logic
          assertExists(dbCounters.capturedPaymentTransactionsUpdate);
          assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'COMPLETED', "PT status should be COMPLETED");
          
          assertEquals(recordTransactionSpy.calls.length, 0, "Tokens should NOT be awarded if user_subscription upsert fails");

        } finally {
          dbCounters.forceUserSubscriptionUpsertError = null;
          dbCounters.targetStripeSubIdForUpsertError = null;
        }
      });
      // --- End DB Upsert Failure (UserSubscriptions) for Subscription Test ---

      // --- DB Update Failure (PaymentTransaction - Initial to COMPLETED) for Subscription Test ---
      it('mode: subscription - should handle DB Update Failure (PaymentTransaction - Initial to COMPLETED) and return 500', async () => {
        const internalPaymentId = 'ptx_sub_pt_upd_fail_init';
        const userId = 'user_sub_pt_upd_fail_init';
        const stripeSubscriptionId = 'sub_pt_upd_fail_init_integ';
        const stripeCustomerId = 'cus_pt_upd_fail_init_integ';
        const planIdLookup = 'plan_sub_pt_upd_f_init_int'; // This is what DB should return for plan_id
        const internalItemIdForLookup = 'item_id_sub_pt_upd_f_init';
        const tokensToAward = 999;
        const sessionId = 'cs_sub_pt_upd_fail_init';

        // --- Setup for THIS TEST --
        dbCounters.paymentTransactionsSelectData = [{
          id: internalPaymentId,
          user_id: userId,
          target_wallet_id: `wallet_for_${userId}`,
          status: 'PENDING',
          tokens_to_award: tokensToAward,
          metadata_json: { item_id: internalItemIdForLookup, plan_id: planIdLookup }
        }];
        dbCounters.subscriptionPlansSelectData = [{ // Specific plan for this test
          id: planIdLookup,
          item_id_internal: internalItemIdForLookup,
          tokens_to_award: tokensToAward,
          stripe_price_id: 'price_for_sub_pt_upd_fail',
        }];
        dbCounters.userSubscriptionsSelectData = [];

        // Force payment_transactions.update to fail for this specific internalPaymentId
        if (mockTokenWalletServiceInstance.stubs.recordTransaction && !mockTokenWalletServiceInstance.stubs.recordTransaction.restored) {
          mockTokenWalletServiceInstance.stubs.recordTransaction.restore();
        }
        const tempRecordTxStub = stub(mockTokenWalletServiceInstance.instance, 'recordTransaction', async () => {
          throw new Error('Simulated DB update failure for PT to COMPLETED (subscription)');
        });

        const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
          id: sessionId, mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, plan_id: planIdLookup, item_id: internalItemIdForLookup },
          subscription: stripeSubscriptionId, customer: 'cus_sub_pt_upd_fail_init_integ',
        };

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async () => { /* ... successful retrieve ... */ 
          const now = Math.floor(Date.now() / 1000);
          return Promise.resolve({ /* ... full subscription object ... */ 
            object: 'subscription' as const, id: stripeSubscriptionId, customer: 'cus_sub_pt_upd_fail_init_integ',
            status: 'active' as Stripe.Subscription.Status,
            items: { data: [{ price: { id: 'price_sub_pt_upd_f_init', product: 'prod_sub_pt_upd_f_init', object: 'price' as const, active: true, currency: 'usd' } }] } as any,
            current_period_start: now - 10000, current_period_end: now + 10000,
            cancel_at_period_end: false, created: now -20000, livemode: false, start_date: now - 20000,
            metadata: { plan_id: planIdLookup },
            lastResponse: { headers: {}, requestId: 'req_mock_sub_pt_upd_f_init', statusCode: 200, }
          } as unknown as Stripe.Response<Stripe.Subscription>);
        });
        
        const ptUpdateError = new Error('Simulated DB update failure for PT to COMPLETED (subscription)');
        const recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;

        const stripeEvent: Stripe.Event = { /* ... event object ... */ 
          id: `evt_sub_pt_upd_fail_init_${sessionId}`, type: 'checkout.session.completed',
          data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
          api_version: '2020-08-27', created: Math.floor(Date.now()/1000), livemode: false, pending_webhooks: 0, request: {id:null, idempotency_key:null}, object:'event'
        };
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);
        
        try {
          dbCounters.forcePaymentTransactionUpdateError = ptUpdateError;
          dbCounters.targetPtxIdForUpdateError = internalPaymentId; // Ensure error targets this PT ID when status is 'COMPLETED'

          const request = new Request('http://localhost/webhooks/stripe', {
              method: 'POST', body: JSON.stringify({}), headers: { 'stripe-signature': 'sig_sub_pt_upd_fail_init' },
          });
          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();
          
          assertEquals(response.status, 500, "Response status should be 500 for PT update to COMPLETED failure");
          assertExists(responseBody.error);
          assertEquals(responseBody.error, `Critical: Failed to update payment_transactions ${internalPaymentId} to COMPLETED.`);
          assertEquals(responseBody.transactionId, internalPaymentId);
          
          // UserSubscriptions upsert should have succeeded before this failure point
          assertEquals(dbCounters.userSubscriptionsUpsertCallCount, 1, "user_subscriptions upsert should have occurred");
          
          // payment_transactions.update (to COMPLETED) was attempted once (and failed)
          assert(dbCounters.paymentTransactionsUpdateCallCount >= 1, "PT update to COMPLETED should be attempted");
          
          assertEquals(recordTransactionSpy.calls.length, 0, "Tokens should NOT be awarded if PT update to COMPLETED fails");

        } finally {
          dbCounters.forcePaymentTransactionUpdateError = null;
          dbCounters.targetPtxIdForUpdateError = null;
        }
      });
      // --- End DB Update Failure (PaymentTransaction - Initial to COMPLETED) for Subscription Test ---

      // --- Missing Subscription Plan for Subscription Test ---
      it('mode: subscription - should handle Missing Subscription Plan and return 400', async () => {
        const internalPaymentId = 'ptx_sub_missing_plan';
        const userId = 'user_sub_missing_plan';
        const stripeSubscriptionId = 'sub_missing_plan_integ';
        const internalItemIdForLookup = 'item_id_sub_missing_plan_NONEXISTENT'; // This item_id won't be found
        const tokensToAward = 123; // Will be in PT, but plan lookup fails
        const sessionId = 'cs_sub_missing_plan';

        dbCounters.paymentTransactionsSelectData = [{
          id: internalPaymentId, user_id: userId, status: 'PENDING', tokens_to_award: tokensToAward,
          target_wallet_id: `wallet_for_${userId}`, metadata_json: { item_id: internalItemIdForLookup } // plan_id might be missing or different
        }];
        // Simulate subscription_plans lookup failing for this item_id
        dbCounters.subscriptionPlansSelectData = []; // No matching plan

        const mockCheckoutSessionSub: Partial<Stripe.Checkout.Session> = {
          id: sessionId, mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: userId,
          metadata: { internal_payment_id: internalPaymentId, item_id: internalItemIdForLookup },
          subscription: stripeSubscriptionId, customer: 'cus_sub_missing_plan_integ',
        };

        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async () => { /* ... successful retrieve ... */
          const now = Math.floor(Date.now() / 1000);
          return Promise.resolve({ /* ... full subscription object ... */ 
            object: 'subscription' as const, id: stripeSubscriptionId, customer: 'cus_sub_missing_plan_integ',
            status: 'active' as Stripe.Subscription.Status,
            items: { data: [{ price: { id: 'price_sub_missing_plan', product: 'prod_sub_missing_plan', object: 'price' as const, active: true, currency: 'usd' } }] } as any,
            current_period_start: now - 10000, current_period_end: now + 10000,
            cancel_at_period_end: false, created: now -20000, livemode: false, start_date: now - 20000,
            metadata: { /* plan_id might be irrelevant here as lookup is by item_id */ },
            lastResponse: { headers: {}, requestId: 'req_mock_sub_missing_plan', statusCode: 200, }
          } as unknown as Stripe.Response<Stripe.Subscription>);
        });
        
        const recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction;

        const stripeEvent: Stripe.Event = { /* ... event object ... */ 
          id: `evt_sub_missing_plan_${sessionId}`, type: 'checkout.session.completed',
          data: { object: mockCheckoutSessionSub as Stripe.Checkout.Session },
          api_version: '2020-08-27', created: Math.floor(Date.now()/1000), livemode: false, pending_webhooks: 0, request: {id:null, idempotency_key:null}, object:'event'
        };
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEvent);

        const request = new Request('http://localhost/webhooks/stripe', {
            method: 'POST', body: JSON.stringify({}), headers: { 'stripe-signature': 'sig_sub_missing_plan' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        
        assertEquals(response.status, 400, "Response status should be 400 for missing subscription plan");
        assertExists(responseBody.error);
        assertEquals(responseBody.error, `Could not find internal subscription plan ID for item_id: ${internalItemIdForLookup}.`);
        assertEquals(responseBody.transactionId, internalPaymentId);
        
        // PaymentTransaction should be updated to FAILED
        assertExists(dbCounters.capturedPaymentTransactionsUpdate);
        assertEquals(dbCounters.capturedPaymentTransactionsUpdate?.status, 'FAILED', "PT status should be FAILED");
        
        assertEquals(dbCounters.userSubscriptionsUpsertCallCount, 0, "user_subscriptions upsert should NOT have occurred");
        assertEquals(recordTransactionSpy.calls.length, 0, "Tokens should NOT be awarded");
      });
      // --- End Missing Subscription Plan for Subscription Test ---
      
    }); // End checkout.session.completed Event Tests
  }); // End Stripe Event Processing with Real StripePaymentAdapter

