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
  
  // Main describe block for Product Event testing
  describe('Stripe Product Event Processing with Real StripePaymentAdapter', () => {
    // Variables for real StripePaymentAdapter testing
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSupabaseInstance: IMockSupabaseClient;
    let mockTokenWalletServiceInstance: MockTokenWalletService; 
    let stripeInstance: Stripe;
    let constructEventStub: Stub<Stripe.Webhooks>;

    // Dependencies for handleWebhookRequestLogic
    let dependencies: WebhookHandlerDependencies;
    let paymentAdapterFactorySpy: Spy<any, any[], any>; 
    let mockAdminClient: SupabaseClient<Database>; 
    let mockTokenWalletServiceForDeps: ITokenWalletService; 

    beforeEach(() => {
      // Reset dbCounters for each test
      dbCounters.capturedInsertData = null;
      dbCounters.insertCallCount = 0;
      dbCounters.capturedUpdateDataManual = null;
      dbCounters.updateCallCount = 0;
      dbCounters.eqCallCount = 0;
      dbCounters.neqCallCount = 0;
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
      dbCounters.paymentTransactionsSelectData = null; 
      dbCounters.userSubscriptionsSelectData = null; 
      dbCounters.subscriptionPlansSelectData = null;

      mockAdminClient = {} as SupabaseClient<Database>;
      mockTokenWalletServiceForDeps = {} as ITokenWalletService;

      // Initialize mocks for StripePaymentAdapter first
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
              let eqFilterMatchedThisCall = false;
              let neqFilterMatchedThisCall = false; 
              const productUpdatedId = 'prod_test_product_updated_int';
              const productDeletedId = 'prod_test_product_deleted_int';
              const freePriceId = 'price_FREE';
              const hasEqProductUpdated = state.filters?.some(f => f.column === 'stripe_product_id' && f.value === productUpdatedId && f.type === 'eq');
              const hasEqProductDeleted = state.filters?.some(f => f.column === 'stripe_product_id' && f.value === productDeletedId && f.type === 'eq');
              const hasNeqPriceFree = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === freePriceId && f.type === 'neq');
              if ((hasEqProductUpdated || hasEqProductDeleted) && hasNeqPriceFree) {
                eqFilterMatchedThisCall = true;
                neqFilterMatchedThisCall = true;
              }
              if (eqFilterMatchedThisCall) {
                dbCounters.eqCallCount++;
                if (neqFilterMatchedThisCall) {
                  dbCounters.neqCallCount++;
                }
                dbCounters.capturedUpdateDataManual = state.updateData as Partial<Tables<'subscription_plans'>>;
                return Promise.resolve({ data: [state.updateData as any], error: null, count: 1, status: 200, statusText: 'OK (Mock Update)' });
              }
              return Promise.resolve({ data: null, error: null, count: 0, status: 200, statusText: 'OK (Mock Update - No Filter Match)' });
            },
            select: (_state) => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Empty Select Sub Plans)'}),
            delete: () => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Delete Sub Plans)'}),
          },
        }
      }).client;
      
      mockTokenWalletServiceInstance = createMockTokenWalletService(); 
      stripeInstance = new Stripe('sk_test_DUMMYKEYFORTESTING', { apiVersion: '2023-10-16' });

      constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', 
        async (payload: string | Buffer, sig: string | string[] | Buffer, secret: string): Promise<Stripe.Event> => {
          console.log(`Default constructEventAsyncStub called: payload: ${payload}, sig: ${sig}, secret: ${secret}`);
          return Promise.resolve({
            id: 'evt_default_constructed_async',
            object: 'event' as const,
            api_version: '2020-08-27',
            created: Math.floor(Date.now() / 1000),
            data: { object: { id: 'default_data_obj'} }, 
            livemode: false,
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null },
            type: 'test.event.default.async' as Stripe.Event.Type,
          } as Stripe.Event);
        }
      );
      
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';

      realStripePaymentAdapter = new StripePaymentAdapter(
        stripeInstance,
        mockSupabaseInstance as any as SupabaseClient<Database>,
        mockTokenWalletServiceInstance.instance, // Use .instance here
        MOCK_STRIPE_WEBHOOK_SECRET
      );

      // Now define the factory and dependencies, as realStripePaymentAdapter is initialized
      const fakePaymentAdapterFactory = (_source: string, _adminClientArg: SupabaseClient<Database>, _tokenWalletServiceArg: ITokenWalletService): IPaymentGatewayAdapter | null => {
        if (_source === 'stripe' && realStripePaymentAdapter) return realStripePaymentAdapter;
        return null;
      };
      paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);

      dependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockTokenWalletServiceForDeps,
        paymentAdapterFactory: paymentAdapterFactorySpy as unknown as PaymentAdapterFactoryFn,
        getEnv: (key: string) => Deno.env.get(key),
      };
    });

    afterEach(() => {
      mockTokenWalletServiceInstance.clearStubs();
      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
    });

    // --- product.created Event Tests ---
    describe('product.created event', () => {
      it('should process product.created, insert into subscription_plans, and return 200', async () => {
        const mockStripeProduct: Partial<Stripe.Product> = {
          id: 'prod_test_product_created_int',
          name: 'Integration Test Product',
          description: 'A product for integration testing product.created.',
          active: true,
          metadata: { test_key: 'test_value' },
        };
        const mockProductCreatedEvent = {
          id: `evt_prod_created_${mockStripeProduct.id}`,
          object: 'event' as const, api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          data: { object: mockStripeProduct as Stripe.Product },
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
          type: 'product.created' as Stripe.Event.Type,
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => Promise.resolve(mockProductCreatedEvent));

        const requestPayload = { some_key: 'some_value_representing_event_data' }; 
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-product-created' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockProductCreatedEvent.id);
        assertEquals(constructEventStub.calls.length, 1);
        assertEquals(dbCounters.insertCallCount, 1, "Insert was not called exactly once on subscription_plans");
        assertExists(dbCounters.capturedInsertData);
        const planData = dbCounters.capturedInsertData![0];
        assertEquals(planData.stripe_product_id, mockStripeProduct.id);
        assertEquals(planData.name, mockStripeProduct.name);
        const descriptionObject = planData.description as unknown as ParsedProductDescription;
        assertEquals(descriptionObject.subtitle, mockStripeProduct.description);
        assertEquals(planData.active, mockStripeProduct.active);
        assertEquals(planData.metadata, mockStripeProduct.metadata);
        assert(planData.created_at);
        assert(planData.updated_at);
      });
    });

    // --- product.updated Event Tests ---
    describe('product.updated event', () => {
      it('should process product.updated, update existing subscription_plans, and return 200', async () => {
        const productIdToUpdate = 'prod_test_product_updated_int';
        const updatedStripeProduct: Partial<Stripe.Product> = {
          id: productIdToUpdate, name: 'Updated Integration Test Product',
          description: 'An updated description for integration testing.', active: false,
          metadata: { version: '2.0', updated_key: 'updated_value' },
        };
        const mockProductUpdatedEvent = {
          id: `evt_prod_updated_${productIdToUpdate}`,
          object: 'event' as const, api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          data: { object: updatedStripeProduct as Stripe.Product },
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
          type: 'product.updated' as Stripe.Event.Type,
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => Promise.resolve(mockProductUpdatedEvent));
        
        const requestPayload = { event_data_for_update: 'payload' }; 
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-product-updated' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockProductUpdatedEvent.id);
        assertEquals(constructEventStub.calls.length, 1);
        assertEquals(dbCounters.updateCallCount, 1, "update() method was not called exactly once.");
        assertExists(dbCounters.capturedUpdateDataManual);
        const updatedFields = dbCounters.capturedUpdateDataManual as any;
        assertEquals(updatedFields.name, updatedStripeProduct.name);
        const parsedDesc = updatedFields.description as unknown as ParsedProductDescription;
        assertEquals(parsedDesc.subtitle, updatedStripeProduct.description);
        assertEquals(updatedFields.active, updatedStripeProduct.active);
        assertEquals(updatedFields.metadata, updatedStripeProduct.metadata);
        assert(updatedFields.updated_at); 
        assertEquals(dbCounters.eqCallCount, 1);
        assertEquals(dbCounters.neqCallCount, 1);
      });
    });
  
    // --- product.deleted Event Tests ---
    describe('product.deleted event', () => {
      it('should process product.deleted, update active status of matching plans (excluding price_FREE), and return 200', async () => {
        const productIdToDelete = 'prod_test_product_deleted_int';
        const mockProductDeletedEvent = {
          id: `evt_prod_deleted_${productIdToDelete}`,
          object: 'event' as const, api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          data: { object: { id: productIdToDelete, object: 'product', active: false, livemode: false } as Stripe.Product },
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
          type: 'product.deleted' as Stripe.Event.Type,
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => Promise.resolve(mockProductDeletedEvent));

        const requestPayload = { event_data_for_product_deleted: 'payload' }; 
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST', body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-product-deleted' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockProductDeletedEvent.id);
        assertEquals(constructEventStub.calls.length, 1);
        assertEquals(dbCounters.updateCallCount, 1);
        assertExists(dbCounters.capturedUpdateDataManual);
        const updatedFieldsForProductDelete = dbCounters.capturedUpdateDataManual as any;
        assertEquals(updatedFieldsForProductDelete.active, false);
        assertExists(updatedFieldsForProductDelete.updated_at);
        assertEquals(dbCounters.eqCallCount, 1);
        assertEquals(dbCounters.neqCallCount, 1);
      });
    });
  }); 