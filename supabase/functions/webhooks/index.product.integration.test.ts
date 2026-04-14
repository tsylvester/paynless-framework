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
  import Stripe from 'npm:stripe';
  import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
  import { createMockSupabaseClient, MockSupabaseClientSetup, MockQueryBuilderState } from '../_shared/supabase.mock.ts';
  import { createMockStripe, MockStripe } from '../_shared/stripe.mock.ts';
  import { createMockAdminTokenWalletService, MockAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
  import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js';
  import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
  import type { Database } from '../types_db.ts';
  import type { PaymentAdapterFactoryFn } from './index.ts';
  
  // --- Single File-Scope Stub for Deno.env.get ---
  const originalDenoEnvGet = Deno.env.get;
  let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
  let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
  // --- End File-Scope Stub ---
  
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
    let realStripePaymentAdapter: StripePaymentAdapter;
    let mockSetup: MockSupabaseClientSetup;
    let mockTokenWalletServiceInstance: MockAdminTokenWalletService;
    let mockStripe: MockStripe;
    let dependencies: WebhookHandlerDependencies;
    let paymentAdapterFactorySpy: Spy<PaymentAdapterFactoryFn>;
    let mockAdminClient: SupabaseClient<Database>;
    let mockTokenWalletServiceForDeps: IAdminTokenWalletService;

    beforeEach(() => {
      mockAdminClient = {} as SupabaseClient<Database>;

      mockSetup = createMockSupabaseClient(undefined, {
        genericMockResults: {
          subscription_plans: {
            insert: (state: MockQueryBuilderState) => {
              const now = new Date().toISOString();
              const values: object[] = Array.isArray(state.insertData)
                ? state.insertData.filter((d): d is object => typeof d === 'object' && d !== null)
                : (state.insertData !== null ? [state.insertData] : []);
              const data: object[] = values.map(item => ({ ...item, created_at: now, updated_at: now }));
              return Promise.resolve({ data, error: null, count: data.length, status: 201, statusText: 'Created' });
            },
            upsert: (state: MockQueryBuilderState) => {
              const now = new Date().toISOString();
              const values: object[] = Array.isArray(state.upsertData)
                ? state.upsertData.filter((d): d is object => typeof d === 'object' && d !== null)
                : (state.upsertData !== null ? [state.upsertData] : []);
              const data: object[] = values.map(item => ({ ...item, created_at: now, updated_at: now }));
              return Promise.resolve({ data, error: null, count: data.length, status: 200, statusText: 'OK (Upserted)' });
            },
            update: (state: MockQueryBuilderState) => {
              const data: object[] | null = state.updateData !== null ? [state.updateData] : null;
              return Promise.resolve({ data, error: null, count: data?.length ?? 0, status: 200, statusText: 'OK (Mock Update)' });
            },
            select: (_state: MockQueryBuilderState) => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK (Empty Select Sub Plans)' }),
            delete: (_state: MockQueryBuilderState) => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK (Delete Sub Plans)' }),
          },
        },
      });

      mockTokenWalletServiceInstance = createMockAdminTokenWalletService();
      mockStripe = createMockStripe();
      mockTokenWalletServiceForDeps = mockTokenWalletServiceInstance.instance;

      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';

      realStripePaymentAdapter = new StripePaymentAdapter(
        mockStripe.instance,
        mockSetup.client as unknown as SupabaseClient<Database>,
        mockTokenWalletServiceInstance.instance,
        MOCK_STRIPE_WEBHOOK_SECRET,
      );

      const fakePaymentAdapterFactory: PaymentAdapterFactoryFn = (_source, _adminClientArg, _tokenWalletServiceArg) => {
        if (_source === 'stripe' && realStripePaymentAdapter) return realStripePaymentAdapter;
        return null;
      };
      paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);

      dependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockTokenWalletServiceForDeps,
        paymentAdapterFactory: paymentAdapterFactorySpy,
        getEnv: (key: string) => Deno.env.get(key),
      };
    });

    afterEach(() => {
      mockTokenWalletServiceInstance.clearStubs();
      mockStripe.clearStubs();
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
          object: 'event', api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          data: { object: mockStripeProduct as Stripe.Product },
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
          type: 'product.created' as Stripe.Event.Type,
        } as Stripe.Event;

        if (!mockStripe.stubs.webhooksConstructEvent.restored) {
          mockStripe.stubs.webhooksConstructEvent.restore();
        }
        mockStripe.stubs.webhooksConstructEvent = stub(
          mockStripe.instance.webhooks,
          'constructEventAsync',
          async (): Promise<Stripe.Event> => Promise.resolve(mockProductCreatedEvent),
        );

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
        assertEquals(mockStripe.stubs.webhooksConstructEvent.calls.length, 1);
        assertEquals(
          mockSetup.spies.getHistoricQueryBuilderSpies('subscription_plans', 'insert')?.callCount ?? 0,
          0,
          "product.created must not write to subscription_plans; plan rows are owned by price events",
        );
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
          object: 'event', api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          data: { object: updatedStripeProduct as Stripe.Product },
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
          type: 'product.updated' as Stripe.Event.Type,
        } as Stripe.Event;

        if (!mockStripe.stubs.webhooksConstructEvent.restored) {
          mockStripe.stubs.webhooksConstructEvent.restore();
        }
        mockStripe.stubs.webhooksConstructEvent = stub(
          mockStripe.instance.webhooks,
          'constructEventAsync',
          async (): Promise<Stripe.Event> => Promise.resolve(mockProductUpdatedEvent),
        );

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
        assertEquals(mockStripe.stubs.webhooksConstructEvent.calls.length, 1);
        assertEquals(mockSetup.spies.getHistoricQueryBuilderSpies('subscription_plans', 'update')?.callCount, 1, "update() method was not called exactly once.");
        const updateBuilder = mockSetup.client.getHistoricBuildersForTable('subscription_plans')
          ?.find(b => b.getQueryBuilderState().operation === 'update');
        const updateState = updateBuilder?.getQueryBuilderState();
        assertExists(updateState?.updateData);
        const updateItem: object | null = updateState!.updateData;
        assert(updateItem !== null);
        assertEquals(Reflect.get(updateItem, 'name'), updatedStripeProduct.name);
        const updateDescRaw: unknown = Reflect.get(updateItem, 'description');
        assert(typeof updateDescRaw === 'object' && updateDescRaw !== null && !Array.isArray(updateDescRaw));
        assertEquals(Reflect.get(updateDescRaw, 'subtitle'), updatedStripeProduct.description);
        assertEquals(Reflect.get(updateItem, 'active'), updatedStripeProduct.active);
        assertEquals(Reflect.get(updateItem, 'metadata'), updatedStripeProduct.metadata);
        assert(Reflect.get(updateItem, 'updated_at'));
        assertEquals(updateState?.filters.filter(f => f.type === 'eq').length, 1);
        assertEquals(updateState?.filters.filter(f => f.type === 'neq').length, 1);
      });
    });
  
    // --- product.deleted Event Tests ---
    describe('product.deleted event', () => {
      it('should process product.deleted, update active status of matching plans (excluding price_FREE), and return 200', async () => {
        const productIdToDelete = 'prod_test_product_deleted_int';
        const mockProductDeletedEvent = {
          id: `evt_prod_deleted_${productIdToDelete}`,
          object: 'event', api_version: '2020-08-27', created: Math.floor(Date.now() / 1000),
          data: { object: { id: productIdToDelete, object: 'product', active: false, livemode: false } as Stripe.Product },
          livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
          type: 'product.deleted' as Stripe.Event.Type,
        } as Stripe.Event;

        if (!mockStripe.stubs.webhooksConstructEvent.restored) {
          mockStripe.stubs.webhooksConstructEvent.restore();
        }
        mockStripe.stubs.webhooksConstructEvent = stub(
          mockStripe.instance.webhooks,
          'constructEventAsync',
          async (): Promise<Stripe.Event> => Promise.resolve(mockProductDeletedEvent),
        );

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
        assertEquals(mockStripe.stubs.webhooksConstructEvent.calls.length, 1);
        assertEquals(mockSetup.spies.getHistoricQueryBuilderSpies('subscription_plans', 'update')?.callCount, 1);
        const deleteUpdateBuilder = mockSetup.client.getHistoricBuildersForTable('subscription_plans')
          ?.find(b => b.getQueryBuilderState().operation === 'update');
        const deleteUpdateState = deleteUpdateBuilder?.getQueryBuilderState();
        assertExists(deleteUpdateState?.updateData);
        const deleteUpdateItem: object | null = deleteUpdateState!.updateData;
        assert(deleteUpdateItem !== null);
        assertEquals(Reflect.get(deleteUpdateItem, 'active'), false);
        assert(Reflect.get(deleteUpdateItem, 'updated_at'));
        assertEquals(deleteUpdateState?.filters.filter(f => f.type === 'eq').length, 1);
        assertEquals(deleteUpdateState?.filters.filter(f => f.type === 'neq').length, 1);
      });
    });
  }); 