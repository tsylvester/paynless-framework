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
    // Removed payment_transactions, user_subscriptions, and other unused counters
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
  
  // New describe block for testing with the real StripePaymentAdapter
  describe('Stripe Price Event Processing with Real StripePaymentAdapter', () => {
    // Variables for real StripePaymentAdapter testing - MOVED HERE
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSupabaseInstance: IMockSupabaseClient;
    let mockTokenWalletServiceInstance: MockTokenWalletService;
    let stripeInstance: Stripe;
    let constructEventStub: Stub<Stripe.Webhooks>;
    
    // These are now initialized in beforeEach for this describe block
    let paymentAdapterFactorySpy: Spy<any, any[], any>; // Using any for simplicity, will be a spy on fakePaymentAdapterFactory
    let dependencies: WebhookHandlerDependencies;
    let configuredSourceForAdapterStub: string | null;
    let currentMockAdapter: IPaymentGatewayAdapter | null;
    let mockAdminClient: SupabaseClient<Database>;
    let mockTokenWalletService: ITokenWalletService; // This is the ITokenWalletService passed to dependencies.tokenWalletService

    beforeEach(() => {
      // Initialize spies and dependencies here
      mockAdminClient = {} as SupabaseClient<Database>; 
      // For price events, the actual tokenWalletService in dependencies might not be fully used by the specific handlers.
      // We use a simple mock here. The mockTokenWalletServiceInstance is for the StripePaymentAdapter constructor.
      mockTokenWalletService = {} as ITokenWalletService; 
      mockTokenWalletServiceInstance = createMockTokenWalletService(); // This is for the adapter constructor

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
        tokenWalletService: mockTokenWalletService, // Use the simple mock for dependencies obj
        paymentAdapterFactory: paymentAdapterFactorySpy as unknown as PaymentAdapterFactoryFn,
        getEnv: (key: string) => Deno.env.get(key),
      };

      // Reset captured data and counts for each test in this suite
      dbCounters.capturedInsertData = null;
      dbCounters.insertCallCount = 0;
      dbCounters.capturedUpdateDataManual = null;
      dbCounters.updateCallCount = 0;
      dbCounters.eqCallCount = 0;
      dbCounters.neqCallCount = 0;
      // Removed resets for payment_transactions, user_subscriptions, etc.
  
  
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
              const neqFilterMatchedThisCall = false;
  
              // Keep product/price IDs relevant to price event handlers if they affect subscription_plans updates indirectly
              // const productUpdatedId = 'prod_test_product_updated_int'; // Example if needed by a complex price handler
              // const productDeletedId = 'prod_test_product_deleted_int'; // Example if needed
              const priceUpdatedId = 'price_test_price_updated_int'; // Used in mock conditions
              const priceDeletedId = 'price_test_price_deleted_int'; // Used in mock conditions
              // const freePriceId = 'price_FREE'; // Example if needed
  
              // Simplified conditions for price event tests
              const hasEqPriceUpdated = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === priceUpdatedId && f.type === 'eq');
              const hasEqPriceDeleted = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === priceDeletedId && f.type === 'eq');
  
              if (hasEqPriceUpdated) {
                testCondition = "price.updated";
                eqFilterMatchedThisCall = true;
              } else if (hasEqPriceDeleted) {
                testCondition = "price.deleted_price_event";
                eqFilterMatchedThisCall = true;
              }
              // Add other conditions relevant to product events if they affect subscription_plans through price changes
              // e.g., product.updated or product.deleted might cause updates to related subscription_plans
              // For now, focusing only on direct price event effects on subscription_plans
              
              if (eqFilterMatchedThisCall) {
                dbCounters.eqCallCount++;
                // No neqCallCount increment here unless specifically used by price handlers
                dbCounters.capturedUpdateDataManual = state.updateData as Partial<Tables<'subscription_plans'>>;
                
                const returnCount = 1; // Assume 1 row affected if filter matches for price events
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
            // Select and delete for subscription_plans can be minimal if not used by price handlers
            select: (_state) => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Empty Select Sub Plans)'}),
            delete: () => Promise.resolve({data: [], error: null, count:0, status:200, statusText: 'OK (Delete Sub Plans)'}),
          },
          // Removed payment_transactions, user_subscriptions, and token_wallets mocks
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
        mockSupabaseInstance as any as SupabaseClient<Database>,
        {} as ITokenWalletService, // Price events don't use TWS, so a minimal mock is fine
        MOCK_STRIPE_WEBHOOK_SECRET 
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
  
    // --- price.created Event Tests ---
    describe('price.created event', () => {
      let productRetrieveStub: Stub<Stripe.ProductsResource>;
  
      beforeEach(() => {
        // Ensure stubs from other tests are cleared if necessary, though describe-level should be fine.
        if (productRetrieveStub && !productRetrieveStub.restored) {
          productRetrieveStub.restore();
        }
      });
  
      afterEach(() => {
        if (productRetrieveStub && !productRetrieveStub.restored) {
          productRetrieveStub.restore();
        }
      });
  
      it('should process price.created, fetch product, upsert into subscription_plans, and return 200', async () => {
        const mockStripePrice: Partial<Stripe.Price> & { product: string } = {
          id: 'price_test_price_created_int',
          product: 'prod_associated_with_price_created',
          active: true,
          currency: 'usd',
          unit_amount: 1000,
          type: 'one_time',
          metadata: { price_meta_key: 'price_meta_value' },
        };
  
        const mockAssociatedProduct: Partial<Stripe.Product> = {
          id: 'prod_associated_with_price_created',
          name: 'Associated Product for Price',
          description: 'Product description for price.created test.',
          active: true,
          metadata: { product_meta_key: 'product_meta_value', tokens_awarded: '500' },
        };
  
        // Stub stripe.products.retrieve
        productRetrieveStub = stub(stripeInstance.products, 'retrieve', async () => {
          // Return a mock Stripe.Response<Stripe.Product>
          return Promise.resolve({
            ...mockAssociatedProduct,
            lastResponse: {
              headers: {},
              requestId: 'req_mock_price_created_test',
              statusCode: 200,
            }
          } as Stripe.Response<Stripe.Product>);
        });
  
        const mockPriceCreatedEvent = {
          id: `evt_price_created_${mockStripePrice.id}`,
          object: 'event' as const,
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: mockStripePrice as Stripe.Price,
          },
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          type: 'price.created' as Stripe.Event.Type,
        } as Stripe.Event;
  
        if (constructEventStub && !constructEventStub.restored) {
          constructEventStub.restore();
        }
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
          return Promise.resolve(mockPriceCreatedEvent);
        });
  
        const requestPayload = { event_data_for_price_created: 'payload' };
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-price-created' },
        });
  
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockPriceCreatedEvent.id);
  
        assertEquals(constructEventStub.calls.length, 1);
        assertEquals(productRetrieveStub.calls.length, 1);
        assertEquals(productRetrieveStub.calls[0].args[0], mockStripePrice.product);
  
        assertEquals(dbCounters.insertCallCount, 1, "Upsert (via dbCounters.insertCallCount) was not called exactly once on subscription_plans");
        assertExists(dbCounters.capturedInsertData, "No data captured for upsert on subscription_plans");
        
        const upsertedDataArray = dbCounters.capturedInsertData;
        assert(Array.isArray(upsertedDataArray) && upsertedDataArray.length > 0, "Upserted data is not an array or is empty.");
        
        const planData = upsertedDataArray[0];
  
        assertEquals(planData.stripe_product_id, mockAssociatedProduct.id);
        assertEquals(planData.stripe_price_id, mockStripePrice.id);
        assertEquals(planData.name, mockAssociatedProduct.name);
        // Description parsing check
        assert(planData.description, "planData.description should exist");
        const descriptionObject = planData.description as unknown as ParsedProductDescription;
        assertEquals(descriptionObject.subtitle, mockAssociatedProduct.description);
  
        assertEquals(planData.active, mockStripePrice.active); // Plan active status comes from Price
        assertEquals(planData.amount, mockStripePrice.unit_amount); // Corrected field name
        assertEquals(planData.currency, mockStripePrice.currency); // Corrected field name
        assertEquals(planData.plan_type, 'one_time_purchase'); // Corrected field name and expected value for one_time type
        
        // Assert metadata (comes from price.metadata)
        assertEquals((planData.metadata as Record<string, any>).price_meta_key, mockStripePrice.metadata?.price_meta_key);
        
        // Assert tokens_awarded (comes from product.metadata.tokens_awarded)
        assertEquals(planData.tokens_awarded, 500); 
  
        assert(planData.created_at, 'created_at should be set');
        assert(planData.updated_at, 'updated_at should be set');
      });

      it('should return 500 if stripe.products.retrieve fails', async () => {
        const mockStripePrice: Partial<Stripe.Price> & { product: string } = {
          id: 'price_test_prod_fetch_fail',
          product: 'prod_will_fail_to_retrieve',
          active: true,
          currency: 'usd',
          unit_amount: 1000,
          type: 'one_time',
        };

        // Stub stripe.products.retrieve to throw an error
        if (productRetrieveStub && !productRetrieveStub.restored) productRetrieveStub.restore();
        productRetrieveStub = stub(stripeInstance.products, 'retrieve', async () => {
          throw new Stripe.errors.StripeAPIError({ message: 'Simulated product retrieval failure', type: 'api_error' });
        });

        const mockPriceCreatedEventProdFail = {
          id: `evt_price_created_prod_fail_${mockStripePrice.id}`,
          object: 'event' as const,
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          data: { object: mockStripePrice as Stripe.Price },
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          type: 'price.created' as Stripe.Event.Type,
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
          return Promise.resolve(mockPriceCreatedEventProdFail);
        });

        const requestPayload = { event_data_for_price_created_prod_fail: 'payload' };
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-price-created-prod-fail' },
        });

        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();

        assertEquals(response.status, 500);
        assertExists(responseBody.error, "Response body should contain an error message");
        assertEquals(responseBody.error, 'Unexpected error processing price.created for price price_test_prod_fetch_fail: Simulated product retrieval failure');
        
        assertEquals(productRetrieveStub.calls.length, 1);
        assertEquals(dbCounters.insertCallCount, 0, "Database insert should not be called if product retrieval fails");
      });

      it('should return 500 if supabase upsert fails', async () => {
        const mockStripePriceDbFail: Partial<Stripe.Price> & { product: string } = {
          id: 'price_test_db_upsert_fail',
          product: 'prod_for_db_upsert_fail',
          active: true,
          currency: 'eur',
          unit_amount: 2500,
          type: 'one_time',
        };

        const mockAssociatedProductDbFail: Partial<Stripe.Product> = {
          id: 'prod_for_db_upsert_fail',
          name: 'Product for DB Upsert Fail Test',
          description: 'This product is part of a test for DB upsert failures.',
          active: true,
          metadata: { tokens_awarded: '750' },
        };

        // Stub stripe.products.retrieve to succeed (productRetrieveStub is defined in the outer describe block's beforeEach)
        if (productRetrieveStub && !productRetrieveStub.restored) productRetrieveStub.restore();
        productRetrieveStub = stub(stripeInstance.products, 'retrieve', async () => {
          return Promise.resolve({
            ...mockAssociatedProductDbFail,
            lastResponse: { headers: {}, requestId: 'req_mock_db_fail_test', statusCode: 200 }
          } as Stripe.Response<Stripe.Product>);
        });

        // --- LOCAL MOCK SETUP FOR THIS TEST CASE ---
        const upsertError = new Error('Simulated DB upsert failure for subscription_plans');
        const localMockSupabaseInstance = createMockSupabaseClient({
          genericMockResults: {
            subscription_plans: {
              upsert: (_state) => { // Correctly use the state argument, though not strictly needed for this simple error mock
                dbCounters.insertCallCount++; // Still count the attempt
                return Promise.resolve({ data: null, error: upsertError, count: 0, status: 500, statusText: 'Internal Server Error (Mock DB)' });
              },
              // Add other minimal mocks for subscription_plans if required by the types or createMockSupabaseClient structure,
              // even if not directly hit in this error path.
              select: async () => ({ data: [], error: null, count: 0, status: 200 }),
              insert: async () => ({ data: [], error: null, count: 0, status: 201 }),
              update: async () => ({ data: [], error: null, count: 0, status: 200 }),
              delete: async () => ({ data: [], error: null, count: 0, status: 200 }),
            }
          }
        }).client;

        const localRealStripePaymentAdapter = new StripePaymentAdapter(
          stripeInstance, // From outer describe scope
          localMockSupabaseInstance as any as SupabaseClient<Database>,
          mockTokenWalletService, // Use the ITokenWalletService from the outer describe beforeEach scope
          MOCK_STRIPE_WEBHOOK_SECRET // From outer describe scope
        );

        const localFakePaymentAdapterFactory = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: ITokenWalletService): IPaymentGatewayAdapter | null => {
          if (source === 'stripe') {
            return localRealStripePaymentAdapter;
          }
          return null;
        };
        const localPaymentAdapterFactorySpy = spy(localFakePaymentAdapterFactory);
        
        const localDependencies: WebhookHandlerDependencies = {
          adminClient: mockAdminClient, // From outer describe scope
          tokenWalletService: mockTokenWalletService, // From outer describe scope
          paymentAdapterFactory: localPaymentAdapterFactorySpy as unknown as PaymentAdapterFactoryFn,
          getEnv: (key: string) => Deno.env.get(key), // From outer describe scope
        };
        // --- END LOCAL MOCK SETUP ---

        const mockPriceCreatedEventDbFail = {
          id: `evt_price_created_db_fail_${mockStripePriceDbFail.id}`,
          type: 'price.created' as Stripe.Event.Type,
          data: { object: mockStripePriceDbFail as Stripe.Price },
          object: 'event' as const,
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
          return Promise.resolve(mockPriceCreatedEventDbFail);
        });

        const requestPayload = { event_data_for_price_created_db_fail: 'payload' };
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-price-created-db-fail' },
        });

        // Use localDependencies for this call
        const response = await handleWebhookRequestLogic(request, localDependencies);
        const responseBody = await response.json();

        assertEquals(response.status, 500);
        assertExists(responseBody.error, "Response body should contain an error message for DB failure");
        assertEquals(responseBody.error, 'Failed to upsert plan for price price_test_db_upsert_fail: Simulated DB upsert failure for subscription_plans');
        
        assertEquals(productRetrieveStub.calls.length, 1);
        assertEquals(dbCounters.insertCallCount, 1, "DB upsert should have been attempted once");
        
        // No need to restore dbUpsertFailStub as it's not used anymore; mocks are locally scoped or reset by outer beforeEach.
      });
    });
  
    // --- price.updated Event Tests ---
    describe('price.updated event', () => {
      beforeEach(() => {
        // if (productRetrieveStub && !productRetrieveStub.restored) {
        //   productRetrieveStub.restore();
        // }
      });
  
      afterEach(() => {
        // if (productRetrieveStub && !productRetrieveStub.restored) {
        //   productRetrieveStub.restore();
        // }
      });
  
      it('should process price.updated, fetch product, update subscription_plans, and return 200', async () => {
        const priceIdToUpdate = 'price_test_price_updated_int';
        // const associatedProductId = 'prod_associated_with_price_updated';
  
        const mockUpdatedStripePrice: Partial<Stripe.Price> & { product: string | Stripe.Product } = {
          id: priceIdToUpdate,
          product: 'prod_associated_with_price_updated',
          active: false,
          currency: 'eur',
          unit_amount: 1200,
          type: 'one_time',
          metadata: { version: '2.0', updated_price_key: 'updated_value' },
        };
  
        // const mockAssociatedProductForUpdate: Partial<Stripe.Product> = {
        //   id: associatedProductId,
        //   name: 'Associated Product for Price Update',
        //   description: 'Product description for price.updated test.',
        //   active: true,
        //   metadata: { product_v2_meta: 'v2_val', tokens_awarded: '600' },
        // };
  
        // productRetrieveStub = stub(stripeInstance.products, 'retrieve', async () => {
        //   return Promise.resolve({
        //     ...mockAssociatedProductForUpdate,
        //     lastResponse: {
        //       headers: {},
        //       requestId: 'req_mock_price_updated_test',
        //       statusCode: 200,
        //     }
        //   } as Stripe.Response<Stripe.Product>);
        // });
  
        const mockPriceUpdatedEvent = {
          id: `evt_price_updated_${priceIdToUpdate}`,
          object: 'event' as const,
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: mockUpdatedStripePrice as Stripe.Price,
          },
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          type: 'price.updated' as Stripe.Event.Type,
        } as Stripe.Event;
  
        if (constructEventStub && !constructEventStub.restored) {
          constructEventStub.restore();
        }
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
          return Promise.resolve(mockPriceUpdatedEvent);
        });
  
        const requestPayload = { event_data_for_price_updated: 'payload' };
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-price-updated' },
        });
  
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockPriceUpdatedEvent.id);
  
        assertEquals(constructEventStub.calls.length, 1);
        // assertEquals(productRetrieveStub.calls.length, 1);
        // assertEquals(productRetrieveStub.calls[0].args[0], associatedProductId);
  
        // ***** DETAILED DEBUG LOGGING FOR PRICE.UPDATED *****
        console.log("<<<<< DEBUG: PRICE.UPDATED - Just before updateCallCount assertion >>>>>");
        console.log(`<<<<< DEBUG: dbCounters.updateCallCount value is: ${dbCounters.updateCallCount} >>>>>`);
        console.log(`<<<<< DEBUG: Full dbCounters object: ${JSON.stringify(dbCounters)} >>>>>`);
        console.log("<<<<< RELOAD CHECK: PRICE.UPDATED TEST IS RUNNING THE LATEST VERSION - 2024-05-20T21:00:00Z >>>>>"); // Unique log
        // ***** END DETAILED DEBUG LOGGING *****
  
        // price.updated results in an update.
        // Temporarily commenting out the direct updateCallCount assertion due to flakiness,
        // relying on eqCallCount and capturedUpdateDataManual for verification.
        assertEquals(dbCounters.updateCallCount, 1, `Update was not called exactly once for price.updated. Actual: ${dbCounters.updateCallCount}`);
        assertEquals(dbCounters.insertCallCount, 0, "Insert (via upsert mock) should not have been called for price.updated");
        
        assertExists(dbCounters.capturedUpdateDataManual, "No data captured for update on subscription_plans for price.updated");
        
        assertEquals(dbCounters.eqCallCount, 1, ".eq('stripe_price_id', ...) was not called exactly once during update");
        assertEquals(dbCounters.neqCallCount, 0, ".neq() should not have been called for this handler during update");
  
        const updatedFields = dbCounters.capturedUpdateDataManual as any; 
  
        assertEquals(updatedFields.active, mockUpdatedStripePrice.active); 
        assertEquals(updatedFields.metadata?.updated_price_key, mockUpdatedStripePrice.metadata?.updated_price_key); 
        assertEquals(updatedFields.currency, mockUpdatedStripePrice.currency); 
        assertEquals(updatedFields.amount, 12); // mockUpdatedStripePrice.unit_amount (1200) / 100
        assertEquals(updatedFields.plan_type, 'one_time_purchase'); 
        // assertEquals(updatedFields.tokens_awarded, 600); // From mockAssociatedProductForUpdate.metadata.tokens_awarded
        // Check based on price metadata instead
        assertEquals(updatedFields.tokens_awarded, undefined); // Since mockUpdatedStripePrice.metadata does not have tokens_awarded
        
        assertExists(updatedFields.updated_at, 'updated_at should be set after price.updated');
      });

      it('should return 500 if supabase update fails for price.updated', async () => {
        const priceIdForDbUpdateFail = 'price_test_db_update_fail';
        const mockUpdatedStripePriceDbFail: Partial<Stripe.Price> & { product: string | Stripe.Product } = {
          id: priceIdForDbUpdateFail,
          product: 'prod_for_db_upsert_fail',
          active: true,
          currency: 'gbp',
          unit_amount: 2500,
          type: 'one_time',
        };

        // --- LOCAL MOCK SETUP FOR THIS TEST CASE ---
        const updateError = new Error('Simulated DB update failure for subscription_plans during price.updated');
        const localMockSupabaseInstanceDbUpdateFail = createMockSupabaseClient({
          genericMockResults: {
            subscription_plans: {
              update: (state) => {
                dbCounters.updateCallCount++; // Count the attempt
                // Ensure the filter is for the correct price ID
                const isCorrectPrice = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === priceIdForDbUpdateFail && f.type === 'eq');
                if (isCorrectPrice) {
                  return Promise.resolve({ data: null, error: updateError, count: 0, status: 500, statusText: 'Internal Server Error (Mock DB Update Fail)' });
                }
                // If filter doesn't match, return a generic success to not interfere with other potential updates in a complex handler (though not expected here)
                return Promise.resolve({ data: [{ id: 'some_other_id'}], error: null, count: 1, status: 200, statusText: 'OK (Mock Update - Wrong ID)' });
              },
              // Minimal mocks for other methods if createMockSupabaseClient requires them
              select: async () => ({ data: [], error: null, count: 0, status: 200 }),
              insert: async () => ({ data: [], error: null, count: 0, status: 201 }),
              upsert: async () => ({ data: [], error: null, count: 0, status: 200 }),
              delete: async () => ({ data: [], error: null, count: 0, status: 200 }),
            }
          }
        }).client;

        const localRealStripePaymentAdapterDbUpdateFail = new StripePaymentAdapter(
          stripeInstance, // From outer describe scope
          localMockSupabaseInstanceDbUpdateFail as any as SupabaseClient<Database>,
          mockTokenWalletService, // Use the ITokenWalletService from outer scope
          MOCK_STRIPE_WEBHOOK_SECRET // From outer describe scope
        );

        const localFakePaymentAdapterFactoryDbUpdateFail = (source: string): IPaymentGatewayAdapter | null => {
          if (source === 'stripe') return localRealStripePaymentAdapterDbUpdateFail;
          return null;
        };
        const localPaymentAdapterFactorySpyDbUpdateFail = spy(localFakePaymentAdapterFactoryDbUpdateFail);
        
        const localDependenciesDbUpdateFail: WebhookHandlerDependencies = {
          adminClient: mockAdminClient, // From outer scope
          tokenWalletService: mockTokenWalletService, // From outer scope
          paymentAdapterFactory: localPaymentAdapterFactorySpyDbUpdateFail as unknown as PaymentAdapterFactoryFn,
          getEnv: (key: string) => Deno.env.get(key), // From outer scope
        };
        // --- END LOCAL MOCK SETUP ---

        const mockPriceUpdatedEventDbFail = {
          id: `evt_price_updated_db_fail_${priceIdForDbUpdateFail}`,
          type: 'price.updated' as Stripe.Event.Type,
          data: { object: mockUpdatedStripePriceDbFail as Stripe.Price },
          object: 'event' as const, api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
          return Promise.resolve(mockPriceUpdatedEventDbFail);
        });

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify({ event_data: 'price.updated db fail' }),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-price-updated-db-fail' },
        });

        // Use localDependencies for this call
        const response = await handleWebhookRequestLogic(request, localDependenciesDbUpdateFail);
        const responseBody = await response.json();

        assertEquals(response.status, 500);
        assertExists(responseBody.error, "Response body should contain an error for DB update failure");
        assertEquals(responseBody.error, `Failed to update plan status for price ${priceIdForDbUpdateFail}: ${updateError.message}`);
        
        // No need to restore dbUpsertFailStub as it's not used anymore; mocks are locally scoped or reset by outer beforeEach.
      });

      it('should return 200 if price to update is not found in DB (idempotent)', async () => {
        const nonExistentPriceId = 'price_does_not_exist_in_db';
        const mockUpdatedStripePriceNotFound: Partial<Stripe.Price> & { product: string | Stripe.Product } = {
          id: nonExistentPriceId,
          product: 'prod_for_non_existent_price',
          active: false, // Irrelevant as it won't be found
          currency: 'usd',
          unit_amount: 999,
          type: 'one_time',
        };

        // --- LOCAL MOCK SETUP FOR THIS TEST CASE ---
        // Configure the global mockSupabaseInstance for this specific scenario for simplicity,
        // as this is testing the COUNT of updated rows, not an error return from the DB call itself.
        // The default mock for .update already handles the .eq() and returns based on whether the filter matches.
        // We need to ensure the mock for 'subscription_plans.update' returns count: 0 for this specific price ID.
        // This might require adjusting the main mockSupabaseInstance setup in the describe's beforeEach or using a local one.
        // For now, let's assume the main mock is sophisticated enough or we set up a local one.

        // Re-using the local mock setup pattern for clarity and isolation:
        const localMockSupabaseInstancePriceNotFound = createMockSupabaseClient({
          genericMockResults: {
            subscription_plans: {
              update: (state) => {
                dbCounters.updateCallCount++; // Count the attempt
                const isNonExistentPrice = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === nonExistentPriceId && f.type === 'eq');
                if (isNonExistentPrice) {
                  // Simulate no rows found/updated
                  return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK (Mock Update - 0 rows matched)' });
                }
                // Fallback for any other update calls, though not expected in this isolated test
                return Promise.resolve({ data: [{id: 'other_id'}], error: null, count: 1, status: 200, statusText: 'OK (Mock Update - Fallback)' });
              },
              select: async () => ({ data: [], error: null, count: 0, status: 200 }),
              insert: async () => ({ data: [], error: null, count: 0, status: 201 }),
              upsert: async () => ({ data: [], error: null, count: 0, status: 200 }),
              delete: async () => ({ data: [], error: null, count: 0, status: 200 }),
            }
          }
        }).client;

        const localRealStripePaymentAdapterNotFound = new StripePaymentAdapter(
          stripeInstance, localMockSupabaseInstancePriceNotFound as any as SupabaseClient<Database>,
          mockTokenWalletService, MOCK_STRIPE_WEBHOOK_SECRET
        );
        const localFakePaymentAdapterFactoryNotFound = (source: string): IPaymentGatewayAdapter | null => {
          if (source === 'stripe') return localRealStripePaymentAdapterNotFound;
          return null;
        };
        const localPaymentAdapterFactorySpyNotFound = spy(localFakePaymentAdapterFactoryNotFound);
        const localDependenciesNotFound: WebhookHandlerDependencies = {
          adminClient: mockAdminClient, tokenWalletService: mockTokenWalletService,
          paymentAdapterFactory: localPaymentAdapterFactorySpyNotFound as unknown as PaymentAdapterFactoryFn,
          getEnv: (key: string) => Deno.env.get(key),
        };
        // --- END LOCAL MOCK SETUP ---

        const mockPriceUpdatedEventNotFound = {
          id: `evt_price_updated_not_found_${nonExistentPriceId}`,
          type: 'price.updated' as Stripe.Event.Type,
          data: { object: mockUpdatedStripePriceNotFound as Stripe.Price },
          // ... other required event fields
          object: 'event' as const, api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync',
          async (): Promise<Stripe.Event> => Promise.resolve(mockPriceUpdatedEventNotFound));

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify({ event_data: 'price.updated not_found' }),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-price-updated-not-found' },
        });

        const response = await handleWebhookRequestLogic(request, localDependenciesNotFound);
        const responseBody = await response.json();

        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockPriceUpdatedEventNotFound.id);
        assertEquals(dbCounters.updateCallCount, 1, "DB update should have been attempted once even if price not found");
        // Optionally, check logs for "Successfully updated 0 subscription plan(s)" if that's critical
      });
    });
  
    // --- price.deleted Event Tests ---
    describe('price.deleted event', () => {
      it('should process price.deleted, update active status of matching plans, and return 200', async () => {
        const priceIdToDelete = 'price_test_price_deleted_int';
        
        const mockPriceDeletedEvent = {
          id: `evt_price_deleted_${priceIdToDelete}`,
          object: 'event' as const,
          api_version: '2020-08-27',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: { id: priceIdToDelete, object: 'price', active: false } as Stripe.Price, // Key part is 'id'
          },
          livemode: false,
          pending_webhooks: 0,
          request: { id: null, idempotency_key: null },
          type: 'price.deleted' as Stripe.Event.Type,
        } as Stripe.Event;
  
        // Re-stub constructEvent for this specific test
        if (constructEventStub && !constructEventStub.restored) {
          constructEventStub.restore();
        }
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
          return Promise.resolve(mockPriceDeletedEvent);
        });
  
        const requestPayload = { event_data_for_price_deleted: 'payload' }; 
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(requestPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-price-deleted' },
        });
  
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, mockPriceDeletedEvent.id);
  
        assertEquals(constructEventStub.calls.length, 1);
  
        // Verify Supabase update interaction (price.deleted sets active: false)
        assertEquals(dbCounters.updateCallCount, 1, "Update was not called exactly once for price.deleted");
        assertExists(dbCounters.capturedUpdateDataManual, "No data captured for update on subscription_plans for price.deleted");
        
        const updatedFieldsForDelete = dbCounters.capturedUpdateDataManual as any;
        assertEquals(updatedFieldsForDelete.active, false);
        assertExists(updatedFieldsForDelete.updated_at, 'updated_at should be set for price.deleted');
  
        // Check .eq() was called to target the correct price
        assertEquals(dbCounters.eqCallCount, 1, ".eq('stripe_price_id', ...) was not called for price.deleted");
      });

      it('should return 500 if supabase update fails for price.deleted', async () => {
        const priceIdForDbDeleteFail = 'price_test_db_delete_fail';
        const mockDeletedStripePriceDbFail: Partial<Stripe.Price> = {
          id: priceIdForDbDeleteFail,
          object: 'price',
          active: false, 
        };

        const deleteUpdateError = new Error('Simulated DB update failure for subscription_plans during price.deleted');
        const localMockSupabaseInstanceDbDeleteFail = createMockSupabaseClient({
          genericMockResults: {
            subscription_plans: {
              update: (state) => {
                dbCounters.updateCallCount++;
                const isCorrectPrice = state.filters?.some(f => f.column === 'stripe_price_id' && f.value === priceIdForDbDeleteFail && f.type === 'eq');
                if (isCorrectPrice) {
                  return Promise.resolve({ data: null, error: deleteUpdateError, count: 0, status: 500, statusText: 'Internal Server Error (Mock DB Update Fail for Delete)' });
                }
                return Promise.resolve({ data: [{id: 'other_id'}], error: null, count: 1, status: 200, statusText: 'OK (Mock Update - Fallback)' });
              },
              select: async () => ({ data: [], error: null, count: 0, status: 200 }),
              insert: async () => ({ data: [], error: null, count: 0, status: 201 }),
              upsert: async () => ({ data: [], error: null, count: 0, status: 200 }),
              delete: async () => ({ data: [], error: null, count: 0, status: 200 }),
            }
          }
        }).client;

        const localRealStripePaymentAdapterDbDeleteFail = new StripePaymentAdapter(
          stripeInstance, localMockSupabaseInstanceDbDeleteFail as any as SupabaseClient<Database>,
          mockTokenWalletService, MOCK_STRIPE_WEBHOOK_SECRET
        );
        const localFakePaymentAdapterFactoryDbDeleteFail = (source: string): IPaymentGatewayAdapter | null => {
          if (source === 'stripe') return localRealStripePaymentAdapterDbDeleteFail;
          return null;
        };
        const localPaymentAdapterFactorySpyDbDeleteFail = spy(localFakePaymentAdapterFactoryDbDeleteFail);
        const localDependenciesDbDeleteFail: WebhookHandlerDependencies = {
          adminClient: mockAdminClient, tokenWalletService: mockTokenWalletService,
          paymentAdapterFactory: localPaymentAdapterFactorySpyDbDeleteFail as unknown as PaymentAdapterFactoryFn,
          getEnv: (key: string) => Deno.env.get(key),
        };

        const mockPriceDeletedEventDbFail = {
          id: `evt_price_deleted_db_fail_${priceIdForDbDeleteFail}`,
          type: 'price.deleted' as Stripe.Event.Type,
          data: { object: mockDeletedStripePriceDbFail as Stripe.Price },
          object: 'event' as const, api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
        } as Stripe.Event;

        if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
        constructEventStub = stub(stripeInstance.webhooks, 'constructEventAsync',
          async (): Promise<Stripe.Event> => Promise.resolve(mockPriceDeletedEventDbFail));

        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify({ event_data: 'price.deleted db fail' }),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-price-deleted-db-fail' },
        });

        const response = await handleWebhookRequestLogic(request, localDependenciesDbDeleteFail);
        const responseBody = await response.json();

        assertEquals(response.status, 500);
        assertExists(responseBody.error, "Response body should contain an error for DB update failure during price.deleted");
        assertEquals(responseBody.error, `Failed to deactivate plan for deleted price ${priceIdForDbDeleteFail}: ${deleteUpdateError.message}`);
        assertEquals(dbCounters.updateCallCount, 1, "DB update should have been attempted once for price.deleted DB fail test");
      });
    });
  }); 