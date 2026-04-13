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
import { IPaymentGatewayAdapter } from '../_shared/types/payment.types.ts';
import { StripePaymentAdapter } from '../_shared/adapters/stripe/stripePaymentAdapter.ts';
import { createMockSupabaseClient, IMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { createMockAdminTokenWalletService, MockAdminTokenWalletService, asSupabaseAdminClientForTests } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';
import { createMockStripe, MockStripe } from '../_shared/stripe.mock.ts';
import Stripe from 'npm:stripe';
import { handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
import type { Database, TablesInsert } from '../types_db.ts';
import type { PaymentAdapterFactoryFn } from './index.ts';

// --- Single File-Scope Stub for Deno.env.get ---
const originalDenoEnvGet = Deno.env.get;
let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
// --- End File-Scope Stub ---

const MOCK_STRIPE_WEBHOOK_SECRET = 'test_stripe_webhook_secret';

beforeAll(() => {
  if (fileScopeDenoEnvGetStub && !fileScopeDenoEnvGetStub.restored) {
    try { fileScopeDenoEnvGetStub.restore(); } catch (e) { console.warn("Stray fileScopeDenoEnvGetStub restore failed in beforeAll:", e); }
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

describe('Stripe Price Event Processing with Real StripePaymentAdapter', () => {
  let realStripePaymentAdapter: StripePaymentAdapter;
  let mockSupabaseInstance: IMockSupabaseClient;
  let mockAdminTokenWalletServiceInstance: MockAdminTokenWalletService;
  let mockStripe: MockStripe;
  let constructEventStub: Stub<Stripe.Webhooks>;
  let paymentAdapterFactorySpy: Spy<void, Parameters<PaymentAdapterFactoryFn>, ReturnType<PaymentAdapterFactoryFn>>;
  let dependencies: WebhookHandlerDependencies;
  let configuredSourceForAdapterStub: string | null;
  let currentMockAdapter: IPaymentGatewayAdapter | null;
  let mockAdminClient: SupabaseClient<Database>;
  let mockAdminTokenWalletService: IAdminTokenWalletService;

  beforeEach(() => {
    const { client: adminClientMock } = createMockSupabaseClient(undefined, {});
    mockAdminClient = asSupabaseAdminClientForTests(adminClientMock);
    mockAdminTokenWalletService = createMockAdminTokenWalletService().instance;
    mockAdminTokenWalletServiceInstance = createMockAdminTokenWalletService();

    const fakePaymentAdapterFactory = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: IAdminTokenWalletService): IPaymentGatewayAdapter | null => {
      if (configuredSourceForAdapterStub === source) {
        if (currentMockAdapter) return currentMockAdapter;
        if (source === 'stripe' && realStripePaymentAdapter) return realStripePaymentAdapter;
      }
      return null;
    };
    paymentAdapterFactorySpy = spy(fakePaymentAdapterFactory);

    dependencies = {
      adminClient: mockAdminClient,
      tokenWalletService: mockAdminTokenWalletService,
      paymentAdapterFactory: paymentAdapterFactorySpy,
      getEnv: (key: string) => Deno.env.get(key),
    };

    const { client } = createMockSupabaseClient(undefined, {
      genericMockResults: {
        subscription_plans: {
          insert: { data: [], error: null },
          upsert: { data: [], error: null },
          update: { data: [{ id: 'plan_mock_id' }], error: null, count: 1, status: 200, statusText: 'OK' },
          select: { data: [], error: null },
          delete: { data: [], error: null },
        },
      },
    });
    mockSupabaseInstance = client;

    mockAdminTokenWalletServiceInstance = createMockAdminTokenWalletService();
    mockStripe = createMockStripe();
    constructEventStub = mockStripe.stubs.webhooksConstructEvent;

    mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
    mockEnvVarsForFileScope['SUPABASE_INTERNAL_FUNCTIONS_URL'] = 'http://localhost:54321';

    realStripePaymentAdapter = new StripePaymentAdapter(
      mockStripe.instance,
      asSupabaseAdminClientForTests(mockSupabaseInstance),
      mockAdminTokenWalletService,
      MOCK_STRIPE_WEBHOOK_SECRET,
    );

    configuredSourceForAdapterStub = 'stripe';
    currentMockAdapter = null;
  });

  afterEach(() => {
    mockAdminTokenWalletServiceInstance.clearStubs();
    if (constructEventStub && !constructEventStub.restored) {
      constructEventStub.restore();
    }
    if (!mockStripe.stubs.webhooksConstructEvent.restored) {
      mockStripe.stubs.webhooksConstructEvent.restore();
    }
    if (!mockStripe.stubs.productsRetrieve.restored) {
      mockStripe.stubs.productsRetrieve.restore();
    }
    if (!mockStripe.stubs.pricesRetrieve.restored) {
      mockStripe.stubs.pricesRetrieve.restore();
    }
    if (!mockStripe.stubs.pricesList.restored) {
      mockStripe.stubs.pricesList.restore();
    }
    if (!mockStripe.stubs.subscriptionsRetrieve.restored) {
      mockStripe.stubs.subscriptionsRetrieve.restore();
    }
    if (!mockStripe.stubs.paymentIntentsRetrieve.restored) {
      mockStripe.stubs.paymentIntentsRetrieve.restore();
    }
    if (!mockStripe.stubs.checkoutSessionsCreate.restored) {
      mockStripe.stubs.checkoutSessionsCreate.restore();
    }
  });

  // --- price.created Event Tests ---
  describe('price.created event', () => {
    let productRetrieveStub: Stub<Stripe.ProductsResource>;

    beforeEach(() => {
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
        metadata: { product_meta_key: 'product_meta_value', tokens_to_award: '500' },
      };

      if (!mockStripe.stubs.productsRetrieve.restored) {
        mockStripe.stubs.productsRetrieve.restore();
      }
      productRetrieveStub = stub(mockStripe.instance.products, 'retrieve', async () => {
        return Promise.resolve({
          ...mockAssociatedProduct,
          lastResponse: {
            headers: {},
            requestId: 'req_mock_price_created_test',
            statusCode: 200,
          },
        } as Stripe.Response<Stripe.Product>);
      });

      const mockPriceCreatedEvent: Stripe.Event = {
        id: `evt_price_created_${mockStripePrice.id}`,
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: mockStripePrice as Stripe.Price,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'price.created',
      };

      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
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

      const upsertSpy = mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'upsert');
      assertExists(upsertSpy, "Upsert spy not found - upsert was never called on subscription_plans");
      assertEquals(upsertSpy.calls.length, 1, "Upsert was not called exactly once on subscription_plans");

      const upsertArg: unknown = upsertSpy.calls[0].args[0];
      assert(typeof upsertArg === 'object' && upsertArg !== null, 'Upsert arg should be a non-null object');

      assert('stripe_price_id' in upsertArg);
      assertEquals<unknown>(upsertArg.stripe_price_id, 'price_test_price_created_int');
      assert('stripe_product_id' in upsertArg);
      assertEquals<unknown>(upsertArg.stripe_product_id, 'prod_associated_with_price_created');
      assert('name' in upsertArg);
      assertEquals<unknown>(upsertArg.name, 'Associated Product for Price');

      assert('description' in upsertArg);
      const upsertDescription: unknown = upsertArg.description;
      assert(typeof upsertDescription === 'object' && upsertDescription !== null, 'description should be a non-null object');
      assert('subtitle' in upsertDescription);
      assertEquals<unknown>(upsertDescription.subtitle, 'Product description for price.created test.');

      assert('active' in upsertArg);
      assertEquals<unknown>(upsertArg.active, true);
      assert('amount' in upsertArg);
      assertEquals<unknown>(upsertArg.amount, 1000);
      assert('currency' in upsertArg);
      assertEquals<unknown>(upsertArg.currency, 'usd');
      assert('interval' in upsertArg);
      assertEquals<unknown>(upsertArg.interval, null);
      assert('interval_count' in upsertArg);
      assertEquals<unknown>(upsertArg.interval_count, null);
      assert('plan_type' in upsertArg);
      assertEquals<unknown>(upsertArg.plan_type, 'one_time_purchase');

      assert('metadata' in upsertArg);
      const upsertMetadata: unknown = upsertArg.metadata;
      assert(typeof upsertMetadata === 'object' && upsertMetadata !== null, 'metadata should be a non-null object');
      assert('price_meta_key' in upsertMetadata);
      assertEquals<unknown>(upsertMetadata.price_meta_key, 'price_meta_value');

      assert('tokens_to_award' in upsertArg);
      assertEquals<unknown>(upsertArg.tokens_to_award, 500);
      assert('item_id_internal' in upsertArg);
      assertEquals<unknown>(upsertArg.item_id_internal, 'price_test_price_created_int');
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

      if (productRetrieveStub && !productRetrieveStub.restored) productRetrieveStub.restore();
      if (!mockStripe.stubs.productsRetrieve.restored) {
        mockStripe.stubs.productsRetrieve.restore();
      }
      productRetrieveStub = stub(mockStripe.instance.products, 'retrieve', async () => {
        throw new Stripe.errors.StripeAPIError({ message: 'Simulated product retrieval failure', type: 'api_error' });
      });

      const mockPriceCreatedEventProdFail: Stripe.Event = {
        id: `evt_price_created_prod_fail_${mockStripePrice.id}`,
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        data: { object: mockStripePrice as Stripe.Price },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'price.created',
      };

      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
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
      assertEquals(
        mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'upsert')?.calls.length ?? 0,
        0,
        "Database upsert should not be called if product retrieval fails",
      );
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
        metadata: { tokens_to_award: '750' },
      };

      if (productRetrieveStub && !productRetrieveStub.restored) productRetrieveStub.restore();
      if (!mockStripe.stubs.productsRetrieve.restored) {
        mockStripe.stubs.productsRetrieve.restore();
      }
      productRetrieveStub = stub(mockStripe.instance.products, 'retrieve', async () => {
        return Promise.resolve({
          ...mockAssociatedProductDbFail,
          lastResponse: { headers: {}, requestId: 'req_mock_db_fail_test', statusCode: 200 },
        } as Stripe.Response<Stripe.Product>);
      });

      const upsertError = new Error('Simulated DB upsert failure for subscription_plans');
      const { client: localSupabaseClient } = createMockSupabaseClient(undefined, {
        genericMockResults: {
          subscription_plans: {
            upsert: { data: null, error: upsertError, count: 0, status: 500, statusText: 'Internal Server Error' },
            select: { data: [], error: null },
            insert: { data: [], error: null },
            update: { data: [], error: null },
            delete: { data: [], error: null },
          },
        },
      });

      const localRealStripePaymentAdapter = new StripePaymentAdapter(
        mockStripe.instance,
        asSupabaseAdminClientForTests(localSupabaseClient),
        mockAdminTokenWalletService,
        MOCK_STRIPE_WEBHOOK_SECRET,
      );

      const localFakePaymentAdapterFactory = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: IAdminTokenWalletService): IPaymentGatewayAdapter | null => {
        if (source === 'stripe') return localRealStripePaymentAdapter;
        return null;
      };
      const localPaymentAdapterFactorySpy = spy(localFakePaymentAdapterFactory);

      const localDependencies: WebhookHandlerDependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockAdminTokenWalletService,
        paymentAdapterFactory: localPaymentAdapterFactorySpy,
        getEnv: (key: string) => Deno.env.get(key),
      };

      const mockPriceCreatedEventDbFail: Stripe.Event = {
        id: `evt_price_created_db_fail_${mockStripePriceDbFail.id}`,
        type: 'price.created',
        data: { object: mockStripePriceDbFail as Stripe.Price },
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
        return Promise.resolve(mockPriceCreatedEventDbFail);
      });

      const requestPayload = { event_data_for_price_created_db_fail: 'payload' };
      const request = new Request('http://localhost/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-sig-price-created-db-fail' },
      });

      const response = await handleWebhookRequestLogic(request, localDependencies);
      const responseBody = await response.json();

      assertEquals(response.status, 500);
      assertExists(responseBody.error, "Response body should contain an error message for DB failure");
      assertEquals(responseBody.error, 'Failed to upsert plan for price price_test_db_upsert_fail: Simulated DB upsert failure for subscription_plans');

      assertEquals(productRetrieveStub.calls.length, 1);
      const localUpsertSpy = localSupabaseClient.getSpiesForTableQueryMethod('subscription_plans', 'upsert');
      assertExists(localUpsertSpy, "Upsert spy not found on local client");
      assertEquals(localUpsertSpy.calls.length, 1, "DB upsert should have been attempted once");
    });
  });

  // --- price.updated Event Tests ---
  describe('price.updated event', () => {
    it('should process price.updated, fetch product, update subscription_plans, and return 200', async () => {
      const priceIdToUpdate = 'price_test_price_updated_int';

      const mockUpdatedStripePrice: Partial<Stripe.Price> & { product: string | Stripe.Product } = {
        id: priceIdToUpdate,
        product: 'prod_associated_with_price_updated',
        active: false,
        currency: 'eur',
        unit_amount: 1200,
        type: 'one_time',
        metadata: { version: '2.0', updated_price_key: 'updated_value' },
      };

      const mockPriceUpdatedEvent: Stripe.Event = {
        id: `evt_price_updated_${priceIdToUpdate}`,
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: mockUpdatedStripePrice as Stripe.Price,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'price.updated',
      };

      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
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

      const updateSpy = mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'update');
      assertExists(updateSpy, "Update spy not found - update was never called on subscription_plans");
      assertEquals(updateSpy.calls.length, 1, "Update was not called exactly once for price.updated");

      assertEquals(
        mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'upsert')?.calls.length ?? 0,
        0,
        "Upsert should not have been called for price.updated",
      );

      const eqSpy = mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'eq');
      assertExists(eqSpy, ".eq spy not found on subscription_plans builder");
      assertEquals(eqSpy.calls.length, 1, ".eq('stripe_price_id', ...) was not called exactly once during update");

      assertEquals(
        mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'neq')?.calls.length ?? 0,
        0,
        ".neq() should not have been called for this handler during update",
      );

      const updateArg: unknown = updateSpy.calls[0].args[0];
      assert(typeof updateArg === 'object' && updateArg !== null, 'Update arg should be a non-null object');

      assert('active' in updateArg);
      assertEquals<unknown>(updateArg.active, mockUpdatedStripePrice.active);
      assert('currency' in updateArg);
      assertEquals<unknown>(updateArg.currency, mockUpdatedStripePrice.currency);
      assert('amount' in updateArg);
      assertEquals<unknown>(updateArg.amount, 1200);
      assert('plan_type' in updateArg);
      assertEquals<unknown>(updateArg.plan_type, 'one_time_purchase');

      assert('metadata' in updateArg);
      const updateMetadata: unknown = updateArg.metadata;
      assertEquals<unknown>(updateMetadata, mockUpdatedStripePrice.metadata);

      assert('updated_at' in updateArg, 'updated_at should be set after price.updated');
      assert(typeof updateArg.updated_at === 'string', 'updated_at should be a string');
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

      const updateError = new Error('Simulated DB update failure for subscription_plans during price.updated');
      const { client: localSupabaseClientDbUpdateFail } = createMockSupabaseClient(undefined, {
        genericMockResults: {
          subscription_plans: {
            update: { data: null, error: updateError, count: 0, status: 500, statusText: 'Internal Server Error' },
            select: { data: [], error: null },
            insert: { data: [], error: null },
            upsert: { data: [], error: null },
            delete: { data: [], error: null },
          },
        },
      });

      const localRealStripePaymentAdapterDbUpdateFail = new StripePaymentAdapter(
        mockStripe.instance,
        asSupabaseAdminClientForTests(localSupabaseClientDbUpdateFail),
        mockAdminTokenWalletService,
        MOCK_STRIPE_WEBHOOK_SECRET,
      );

      const localFakePaymentAdapterFactoryDbUpdateFail = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: IAdminTokenWalletService): IPaymentGatewayAdapter | null => {
        if (source === 'stripe') return localRealStripePaymentAdapterDbUpdateFail;
        return null;
      };
      const localPaymentAdapterFactorySpyDbUpdateFail = spy(localFakePaymentAdapterFactoryDbUpdateFail);

      const localDependenciesDbUpdateFail: WebhookHandlerDependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockAdminTokenWalletService,
        paymentAdapterFactory: localPaymentAdapterFactorySpyDbUpdateFail,
        getEnv: (key: string) => Deno.env.get(key),
      };

      const mockPriceUpdatedEventDbFail: Stripe.Event = {
        id: `evt_price_updated_db_fail_${priceIdForDbUpdateFail}`,
        type: 'price.updated',
        data: { object: mockUpdatedStripePriceDbFail as Stripe.Price },
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
        return Promise.resolve(mockPriceUpdatedEventDbFail);
      });

      const request = new Request('http://localhost/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ event_data: 'price.updated db fail' }),
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-price-updated-db-fail' },
      });

      const response = await handleWebhookRequestLogic(request, localDependenciesDbUpdateFail);
      const responseBody = await response.json();

      assertEquals(response.status, 500);
      assertExists(responseBody.error, "Response body should contain an error for DB update failure");
      assertEquals(responseBody.error, `Failed to update plan status for price ${priceIdForDbUpdateFail}: ${updateError.message}`);
    });

    it('should return 200 if price to update is not found in DB (idempotent)', async () => {
      const nonExistentPriceId = 'price_does_not_exist_in_db';
      const mockUpdatedStripePriceNotFound: Partial<Stripe.Price> & { product: string | Stripe.Product } = {
        id: nonExistentPriceId,
        product: 'prod_for_non_existent_price',
        active: false,
        currency: 'usd',
        unit_amount: 999,
        type: 'one_time',
      };

      const { client: localSupabaseClientPriceNotFound } = createMockSupabaseClient(undefined, {
        genericMockResults: {
          subscription_plans: {
            update: { data: [], error: null, count: 0, status: 200, statusText: 'OK' },
            select: { data: [], error: null },
            insert: { data: [], error: null },
            upsert: { data: [], error: null },
            delete: { data: [], error: null },
          },
        },
      });

      const localRealStripePaymentAdapterNotFound = new StripePaymentAdapter(
        mockStripe.instance,
        asSupabaseAdminClientForTests(localSupabaseClientPriceNotFound),
        mockAdminTokenWalletService,
        MOCK_STRIPE_WEBHOOK_SECRET,
      );
      const localFakePaymentAdapterFactoryNotFound = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: IAdminTokenWalletService): IPaymentGatewayAdapter | null => {
        if (source === 'stripe') return localRealStripePaymentAdapterNotFound;
        return null;
      };
      const localPaymentAdapterFactorySpyNotFound = spy(localFakePaymentAdapterFactoryNotFound);
      const localDependenciesNotFound: WebhookHandlerDependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockAdminTokenWalletService,
        paymentAdapterFactory: localPaymentAdapterFactorySpyNotFound,
        getEnv: (key: string) => Deno.env.get(key),
      };

      const mockPriceUpdatedEventNotFound: Stripe.Event = {
        id: `evt_price_updated_not_found_${nonExistentPriceId}`,
        type: 'price.updated',
        data: { object: mockUpdatedStripePriceNotFound as Stripe.Price },
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync',
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

      const localUpdateSpy = localSupabaseClientPriceNotFound.getSpiesForTableQueryMethod('subscription_plans', 'update');
      assertExists(localUpdateSpy, "Update spy not found on local client");
      assertEquals(localUpdateSpy.calls.length, 1, "DB update should have been attempted once even if price not found");
    });
  });

  // --- price.deleted Event Tests ---
  describe('price.deleted event', () => {
    it('should process price.deleted, update active status of matching plans, and return 200', async () => {
      const priceIdToDelete = 'price_test_price_deleted_int';

      const mockPriceDeletedEvent: Stripe.Event = {
        id: `evt_price_deleted_${priceIdToDelete}`,
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: { id: priceIdToDelete, object: 'price', active: false } as Stripe.Price,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'price.deleted',
      };

      if (constructEventStub && !constructEventStub.restored) {
        constructEventStub.restore();
      }
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync', async (): Promise<Stripe.Event> => {
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

      const updateSpy = mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'update');
      assertExists(updateSpy, "Update spy not found - update was never called on subscription_plans");
      assertEquals(updateSpy.calls.length, 1, "Update was not called exactly once for price.deleted");

      const deleteUpdateArg: unknown = updateSpy.calls[0].args[0];
      assert(typeof deleteUpdateArg === 'object' && deleteUpdateArg !== null, 'Update arg should be a non-null object');
      assert('active' in deleteUpdateArg, 'active field should be present');
      assertEquals<unknown>(deleteUpdateArg.active, false);
      assert('updated_at' in deleteUpdateArg, 'updated_at should be set for price.deleted');
      assert(typeof deleteUpdateArg.updated_at === 'string', 'updated_at should be a string');

      const eqSpy = mockSupabaseInstance.getSpiesForTableQueryMethod('subscription_plans', 'eq');
      assertExists(eqSpy, ".eq spy not found on subscription_plans builder");
      assertEquals(eqSpy.calls.length, 1, ".eq('stripe_price_id', ...) was not called for price.deleted");
    });

    it('should return 500 if supabase update fails for price.deleted', async () => {
      const priceIdForDbDeleteFail = 'price_test_db_delete_fail';
      const mockDeletedStripePriceDbFail: Partial<Stripe.Price> = {
        id: priceIdForDbDeleteFail,
        object: 'price',
        active: false,
      };

      const deleteUpdateError = new Error('Simulated DB update failure for subscription_plans during price.deleted');
      const { client: localSupabaseClientDbDeleteFail } = createMockSupabaseClient(undefined, {
        genericMockResults: {
          subscription_plans: {
            update: { data: null, error: deleteUpdateError, count: 0, status: 500, statusText: 'Internal Server Error' },
            select: { data: [], error: null },
            insert: { data: [], error: null },
            upsert: { data: [], error: null },
            delete: { data: [], error: null },
          },
        },
      });

      const localRealStripePaymentAdapterDbDeleteFail = new StripePaymentAdapter(
        mockStripe.instance,
        asSupabaseAdminClientForTests(localSupabaseClientDbDeleteFail),
        mockAdminTokenWalletService,
        MOCK_STRIPE_WEBHOOK_SECRET,
      );
      const localFakePaymentAdapterFactoryDbDeleteFail = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: IAdminTokenWalletService): IPaymentGatewayAdapter | null => {
        if (source === 'stripe') return localRealStripePaymentAdapterDbDeleteFail;
        return null;
      };
      const localPaymentAdapterFactorySpyDbDeleteFail = spy(localFakePaymentAdapterFactoryDbDeleteFail);
      const localDependenciesDbDeleteFail: WebhookHandlerDependencies = {
        adminClient: mockAdminClient,
        tokenWalletService: mockAdminTokenWalletService,
        paymentAdapterFactory: localPaymentAdapterFactorySpyDbDeleteFail,
        getEnv: (key: string) => Deno.env.get(key),
      };

      const mockPriceDeletedEventDbFail: Stripe.Event = {
        id: `evt_price_deleted_db_fail_${priceIdForDbDeleteFail}`,
        type: 'price.deleted',
        data: { object: mockDeletedStripePriceDbFail as Stripe.Price },
        object: 'event',
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };

      if (constructEventStub && !constructEventStub.restored) constructEventStub.restore();
      constructEventStub = stub(mockStripe.instance.webhooks, 'constructEventAsync',
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

      const localUpdateSpy = localSupabaseClientDbDeleteFail.getSpiesForTableQueryMethod('subscription_plans', 'update');
      assertExists(localUpdateSpy, "Update spy not found on local client");
      assertEquals(localUpdateSpy.calls.length, 1, "DB update should have been attempted once for price.deleted DB fail test");
    });
  });
});
