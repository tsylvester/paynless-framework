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
  
  import * as adapterFactory from '../_shared/adapters/adapterFactory.ts';
  import { IPaymentGatewayAdapter, PaymentConfirmation } from '../_shared/types/payment.types.ts';
  import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
  import { createMockSupabaseClient, MockQueryBuilderState, MockSupabaseClientSetup, MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';
  import { IMockSupabaseClient } from '../_shared/types.ts'; 
  import { createMockTokenWalletService, MockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
  import Stripe from 'npm:stripe';
  
  import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js';
  import type { ITokenWalletService, TokenWalletTransaction, TokenWalletTransactionType } from '../_shared/types/tokenWallet.types.ts';
  import type { Database, Tables, TablesInsert, Json } from '../types_db.ts'; 
  import type { PaymentAdapterFactoryFn } from './index.ts'; 
  
  const originalDenoEnvGet = Deno.env.get;
  let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
  let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
  
  const dbCounters = {
    capturedPaymentTransactionsInsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsInsertCallCount: 0,
    capturedPaymentTransactionsUpdate: null as Partial<Tables<'payment_transactions'>> | null,
    paymentTransactionsUpdateCallCount: 0,
    paymentTransactionsEqCallCount: 0, 
    capturedUserSubscriptionsUpdate: null as Partial<Tables<'user_subscriptions'>> | null,
    userSubscriptionsUpdateCallCount: 0,
    userSubscriptionsEqCallCount: 0, 
    paymentTransactionsUpsertCallCount: 0,
    capturedPaymentTransactionsUpsert: null as TablesInsert<'payment_transactions'>[] | null,
    paymentTransactionsSelectData: null as Partial<Tables<'payment_transactions'>>[] | null,
    userSubscriptionsSelectData: null as Partial<Tables<'user_subscriptions'>>[] | null, 
    subscriptionPlansSelectData: null as Partial<Tables<'subscription_plans'>>[] | null,
    tokenWalletsSelectData: null as Partial<Tables<'token_wallets'>>[] | null,
  };
  
  const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret_idem';
  
  beforeAll(() => {
    if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
      try { fileScopeDenoEnvGetStub.restore(); } catch (e) { console.warn("Stray fileScopeDenoEnvGetStub restore failed in beforeAll:", e);}
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
  
  describe('Stripe Invoice Event Idempotency with Real StripePaymentAdapter', () => {
    let mockAdminClient: SupabaseClient<Database>; 
    let mockTokenWalletService: ITokenWalletService;
    let paymentAdapterFactorySpy: Spy<PaymentAdapterFactoryFn>;
    let dependencies: WebhookHandlerDependencies;
    
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSupabaseInstance: IMockSupabaseClient; 
    let mockTokenWalletServiceInstance: MockTokenWalletService;
    let stripeInstance: Stripe;
    let constructEventStub: Stub<Stripe.Webhooks> | undefined = undefined; // Initialize as undefined
    let retrieveSubscriptionStub: Stub<Stripe.SubscriptionsResource> | undefined = undefined; // Initialize as undefined
    let recordTransactionSpy: Spy<ITokenWalletService, Parameters<ITokenWalletService['recordTransaction']>, Promise<TokenWalletTransaction>>;

  
    beforeEach(() => {
      mockEnvVarsForFileScope = {}; 
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';

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
      dbCounters.paymentTransactionsSelectData = null;
      dbCounters.userSubscriptionsSelectData = null;
      dbCounters.subscriptionPlansSelectData = null;
      dbCounters.tokenWalletsSelectData = null;

      // Correct structure for createMockSupabaseClient argument
      const mockSetup: MockSupabaseDataConfig = {
        genericMockResults: {
            subscription_plans: {
                select: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'subscription_plans'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    let resultData: Partial<Tables<'subscription_plans'>>[] = [];
                    if (dbCounters.subscriptionPlansSelectData) {
                        resultData = dbCounters.subscriptionPlansSelectData.filter(plan => {
                            if (!state.filters) return true;
                            return state.filters.every(filter => {
                                if (filter.column && filter.type === 'eq') {
                                    return (plan as any)[filter.column] === filter.value;
                                }
                                return true; 
                            });
                        });
                    }
                    return { data: resultData, error: null, count: resultData.length, status: 200 };
                },
            },
            payment_transactions: {
                insert: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'payment_transactions'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    dbCounters.paymentTransactionsInsertCallCount++;
                    const insertDataArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData].filter(d => d);
                    
                    const processedInserts = insertDataArray.map((item, index) => {
                        const newItem = { ...(item as object) } as TablesInsert<'payment_transactions'>;
                        if (!newItem.id) newItem.id = `mock_ptx_id_inserted_idem_${dbCounters.paymentTransactionsInsertCallCount}_${index}`;
                        return newItem;
                    });
                    dbCounters.capturedPaymentTransactionsInsert = processedInserts;

                    let returnData: Partial<Tables<'payment_transactions'>>[] = processedInserts;
                    if (state.selectColumns && state.selectColumns !== '*') {
                        returnData = processedInserts.map(item => {
                            const selectedItem: Partial<Tables<'payment_transactions'>> = {};
                            for (const col of state.selectColumns!.split(',')) {
                                (selectedItem as any)[col.trim()] = (item as any)[col.trim()];
                            }
                            return selectedItem;
                        });
                    }
                    return { data: returnData, error: null, count: returnData.length, status: 201 };
                },
                select: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'payment_transactions'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    let resultData: Partial<Tables<'payment_transactions'>>[] = [];
                    if (dbCounters.paymentTransactionsSelectData) {
                        resultData = dbCounters.paymentTransactionsSelectData.filter(ptx => {
                            if (!state.filters) return true;
                            return state.filters.every(f => {
                                if (f.column) return (ptx as any)[f.column] === f.value;
                                return true;
                            });
                        });
                    }
                    return { data: resultData, error: null, count: resultData.length, status: 200 };
                },
                update: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'payment_transactions'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    dbCounters.paymentTransactionsUpdateCallCount++;
                    const idFilter = state.filters?.find(f => f.column === 'id' && f.type === 'eq');
                    const ptxIdBeingUpdated = idFilter?.value as string | undefined;
                    const updatedData = { 
                        ...(ptxIdBeingUpdated && { id: ptxIdBeingUpdated }), 
                        ...(state.updateData as object), 
                        updated_at: new Date().toISOString() 
                    } as Partial<Tables<'payment_transactions'>>;
                    dbCounters.capturedPaymentTransactionsUpdate = updatedData;
                    return { data: [updatedData], error: null, count: 1, status: 200 };
                },
            },
            user_subscriptions: {
                select: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'user_subscriptions'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    let resultData: Partial<Tables<'user_subscriptions'>>[] = [];
                    if (dbCounters.userSubscriptionsSelectData) {
                        resultData = dbCounters.userSubscriptionsSelectData.filter(sub => {
                            if (!state.filters) return true;
                            return state.filters.every(f => {
                               if (f.column) return (sub as any)[f.column] === f.value;
                               return true;
                            });
                        });
                    }
                    return { data: resultData, error: null, count: resultData.length, status: 200 };
                },
                update: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'user_subscriptions'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    dbCounters.userSubscriptionsUpdateCallCount++;
                    const updatedData = state.updateData as Partial<Tables<'user_subscriptions'>>;
                    dbCounters.capturedUserSubscriptionsUpdate = updatedData;
                    return { data: [updatedData], error: null, count: 1, status: 200 };
                },
            },
            token_wallets: {
                select: async (state: MockQueryBuilderState): Promise<{ data: Partial<Tables<'token_wallets'>>[] | null; error: Error | null; count: number | null; status: number; }> => {
                    let resultData: Partial<Tables<'token_wallets'>>[] = [];
                    if (dbCounters.tokenWalletsSelectData) {
                        resultData = dbCounters.tokenWalletsSelectData.filter(wallet => {
                             if (!state.filters) return true;
                             return state.filters.every(f => {
                                if (f.column) return (wallet as any)[f.column] === f.value;
                                return true;
                             });
                        });
                    }
                    return { data: resultData, error: null, count: resultData.length, status: 200 };
                }
            }
        }
      };
      mockSupabaseInstance = createMockSupabaseClient(mockSetup).client;
      
      mockTokenWalletServiceInstance = createMockTokenWalletService();
      recordTransactionSpy = mockTokenWalletServiceInstance.stubs.recordTransaction; 

      stripeInstance = new Stripe('sk_test_DUMMYKEYFORIDEMPOTENCY', { apiVersion: '2023-10-16' });
  
      // Restore stubs if they exist from a previous test run before re-stubbing
      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync',
        async () => Promise.resolve({} as Stripe.Event) 
      );
      if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
      retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', 
        async () => Promise.resolve({} as Stripe.Response<Stripe.Subscription>)
      );

      mockAdminClient = mockSupabaseInstance as unknown as SupabaseClient<Database>; 
      mockTokenWalletService = mockTokenWalletServiceInstance.instance;
  
      realStripePaymentAdapter = new StripePaymentAdapter(
        stripeInstance,
        mockAdminClient, 
        mockTokenWalletService, 
        MOCK_STRIPE_WEBHOOK_SECRET
      );
      
      const fakePaymentAdapterFactory = (source: string): IPaymentGatewayAdapter | null => {
        if (source === 'stripe') return realStripePaymentAdapter;
        return null;
      };
      paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory as PaymentAdapterFactoryFn);

      dependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockTokenWalletService,
        paymentAdapterFactory: paymentAdapterFactorySpy,
        getEnv: (key: string) => Deno.env.get(key),
      };
    });
  
    afterEach(() => {
      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
    });
  
    describe('invoice.payment_succeeded idempotency', () => {
      it('should process the same event twice, award tokens once, update PT and US once', async () => {
        const stripeSubscriptionId = 'sub_idem_inv_ps_1';
        const stripeCustomerId = 'cus_idem_inv_ps_1';
        const userId = 'user_idem_inv_ps_1';
        const tokensToAward = 4242;
        const invoiceId = 'in_idem_inv_ps_1';
        const eventId = `evt_idem_inv_ps_${invoiceId}`;
        const idemPriceId = 'price_idem_inv_ps_1';
        const idemPlanItemId = 'item_idem_inv_ps_1';
        const idemWalletId = `wallet_for_${userId}`;

        dbCounters.userSubscriptionsSelectData = [{
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId, 
          plan_id: 'plan_idem_inv_ps_1',
          status: 'active'
        } as Partial<Tables<'user_subscriptions'>>];

        dbCounters.subscriptionPlansSelectData = [{
          stripe_price_id: idemPriceId,
          item_id_internal: idemPlanItemId, 
          tokens_awarded: tokensToAward,
          plan_type: 'subscription',
          active: true,
          name: "Idempotency Test Plan"
        } as Partial<Tables<'subscription_plans'>>];

        dbCounters.tokenWalletsSelectData = [{
            wallet_id: idemWalletId,
            user_id: userId,
            balance: 10000, // Changed to number
            currency: 'AI_TOKEN', // Assuming AI_TOKEN based on schema
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            organization_id: null,
        } as Partial<Tables<'token_wallets'>>];

        dbCounters.paymentTransactionsSelectData = []; 

        const mockInvoiceObject: Partial<Stripe.Invoice> = {
          id: invoiceId, status: 'paid', subscription: stripeSubscriptionId, customer: stripeCustomerId,
          lines: { object: 'list' as const, data: [{
              id: 'il_idem_1', object: 'line_item' as const,
              price: { id: idemPriceId, object: 'price' as const, active: true, currency: 'usd' } as Stripe.Price,
              quantity: 1, subscription_item: 'si_idem_1'
            } as Stripe.InvoiceLineItem], has_more: false, url: '' },
          metadata: { user_id: userId }, 
        };
        const stripeEventData: Stripe.Event = {
          id: eventId, type: 'invoice.payment_succeeded', api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 0,
          request: { id: null, idempotency_key: null }, object: 'event',
          data: { object: mockInvoiceObject as Stripe.Invoice },
        };
        // Re-stub for this specific test's event data
        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async () => stripeEventData);

        const mockSubscriptionObject: Partial<Stripe.Subscription> = {
            id: stripeSubscriptionId, customer: stripeCustomerId, status: 'active',
            items: { 
                object: 'list', 
                data: [{ 
                    id: 'si_idem_1', 
                    object: 'subscription_item',
                    price: {id: idemPriceId, object: 'price', active: true, currency: 'usd', product: 'prod_idem_1'} as Stripe.Price, 
                    quantity: 1,
                    subscription: stripeSubscriptionId,
                    created: Math.floor(Date.now() / 1000) - 7200,
                    current_period_start: Math.floor(Date.now() / 1000) - 3600,
                    current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600 - 3600),
                    metadata: {},
                    billing_thresholds: null,
                    plan: {
                        id: idemPriceId,
                        object: 'plan',
                        active: true,
                        amount: 1000,
                        currency: 'usd',
                        interval: 'month',
                        product: 'prod_idem_1',
                        created: Math.floor(Date.now() / 1000) - 7200,
                    } as Stripe.Plan,
                    tax_rates: [],
                    discounts: [],
                }], 
                url:'', 
                has_more: false 
            },            
            current_period_start: Math.floor(Date.now() / 1000) - 3600,
            current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 3600 - 3600),
            cancel_at_period_end: false, metadata: { plan_id: 'plan_idem_inv_ps_1' }
        };
        // Re-stub for this specific test's subscription data
        if (retrieveSubscriptionStub && !retrieveSubscriptionStub.restored) retrieveSubscriptionStub.restore();
        retrieveSubscriptionStub = stub(stripeInstance.subscriptions, 'retrieve', async (id: string) => {
            if (id === stripeSubscriptionId) {
                return { ...mockSubscriptionObject, lastResponse: {} as any } as Stripe.Response<Stripe.Subscription>;
            }
            throw new Error(`Idempotency test: Unexpected subscription retrieve ID: ${id}`);
        });

        const requestDetails = {
          method: 'POST', body: JSON.stringify(stripeEventData), 
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_idem_inv_ps_1' },
        };

        // --- First Call ---
        const response1 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody1 = await response1.json() as PaymentConfirmation;

        assertEquals(response1.status, 200, "First call: status should be 200");
        assertExists(responseBody1.transactionId, "First call: transactionId should exist in response");
        const firstProcessedPtxId = responseBody1.transactionId;

        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "First call: PT insert count");
        const insertedPT = dbCounters.capturedPaymentTransactionsInsert?.[0];
        assertExists(insertedPT, "First call: insertedPT should exist");
        assertEquals(insertedPT.gateway_transaction_id, invoiceId, "First call: insertedPT gateway_transaction_id");
        assertEquals(insertedPT.tokens_to_award?.toString(), tokensToAward.toString(), "First call: insertedPT tokens_to_award");
        assertEquals(insertedPT.user_id, userId, "First call: insertedPT user_id");
        assertEquals(insertedPT.status, 'PROCESSING_RENEWAL', "First call: insertedPT status should be PROCESSING_RENEWAL initially"); 
        
        assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 1, "First call: PT update count");
        const updatedPTCall1 = dbCounters.capturedPaymentTransactionsUpdate;
        assertExists(updatedPTCall1, "First call: updatedPTCall1 should exist");
        assertEquals(updatedPTCall1.id, firstProcessedPtxId, "First call: updatedPTCall1 ID");
        assertEquals(updatedPTCall1.status, 'COMPLETED', "First call: updatedPTCall1 status");

        assertEquals(recordTransactionSpy.calls.length, 1, "First call: recordTransactionSpy call count");
        const txArgs1 = recordTransactionSpy.calls[0].args[0];
        assertEquals(txArgs1.walletId, idemWalletId, "First call: recordTransactionSpy walletId");
        assertEquals(txArgs1.type, 'CREDIT_PURCHASE', "First call: recordTransactionSpy type");
        assertEquals(txArgs1.amount, tokensToAward.toString(), "First call: recordTransactionSpy amount");
        assertEquals(txArgs1.relatedEntityId, firstProcessedPtxId, "First call: recordTransactionSpy relatedEntityId");

        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "First call: userSubscriptionsUpdateCallCount");
        const updatedSubCall1 = dbCounters.capturedUserSubscriptionsUpdate;
        assertExists(updatedSubCall1, "First call: updatedSubCall1 should exist");

        // --- Setup for SECOND Call ---
        assertExists(insertedPT, "insertedPT is needed for second call setup"); // Ensure insertedPT is defined before spread
        assertExists(updatedPTCall1, "updatedPTCall1 is needed for second call setup"); // Ensure updatedPTCall1 is defined

        dbCounters.paymentTransactionsSelectData = [{
            ...insertedPT, 
            id: firstProcessedPtxId, 
            status: 'COMPLETED', 
            gateway_transaction_id: invoiceId, 
            tokens_to_award: tokensToAward,
            user_id: userId,
            target_wallet_id: idemWalletId,
            updated_at: updatedPTCall1.updated_at, 
        } as Partial<Tables<'payment_transactions'>>];
        
        // --- Second Call (Same Event) ---
        const response2 = await handleWebhookRequestLogic(new Request('http://localhost/webhooks/stripe', requestDetails), dependencies);
        const responseBody2 = await response2.json() as PaymentConfirmation;

        assertEquals(response2.status, 200, "Second call: status should be 200 (idempotency)");
        assertEquals(responseBody2.transactionId, firstProcessedPtxId, "Second call: transactionId should match first call");
        assertEquals(responseBody2.message, 'Webhook processed', "Second call: message for already processed event");

        assertEquals(dbCounters.paymentTransactionsInsertCallCount, 1, "Second call: PT insert count should remain 1");
        assertEquals(dbCounters.paymentTransactionsUpdateCallCount, 1, "Second call: PT update count should remain 1");
        assertEquals(recordTransactionSpy.calls.length, 1, "Second call: recordTransactionSpy call count should remain 1");
        assertEquals(dbCounters.userSubscriptionsUpdateCallCount, 1, "Second call: userSubscriptionsUpdateCallCount should remain 1");
      });
    });
  });
