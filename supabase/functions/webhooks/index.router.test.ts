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
  } from 'https://deno.land/std@0.224.0/assert/mod.ts';
  import {
    Spy, spy, Stub, stub, 
  } from 'jsr:@std/testing@0.225.1/mock';
  
  import { IPaymentGatewayAdapter, PaymentConfirmation } from '../_shared/types/payment.types.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  
  import { webhookRouterHandler, handleWebhookRequestLogic, WebhookHandlerDependencies } from './index.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js';
  import type { Database } from '../types_db.ts';
  import type { PaymentAdapterFactoryFn } from './index.ts';
  import type { IAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts';
  import { AdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.ts';
  import { isIAdminTokenWalletService } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.guard.ts';
  import {
    asSupabaseAdminClientForTests,
    createMockAdminTokenWalletService,
    type MockAdminTokenWalletService,
  } from '../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts';

  // --- Single File-Scope Stub for Deno.env.get ---
  const originalDenoEnvGet = Deno.env.get;
  let fileScopeDenoEnvGetStub: Stub<
    typeof Deno.env,
    Parameters<typeof Deno.env.get>,
    ReturnType<typeof Deno.env.get>
  > | null = null;
  let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
  // --- End File-Scope Stub ---
  
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
    let mockAdminTokenWalletService: IAdminTokenWalletService;
    let mockAdminTokenWalletServiceBundle: MockAdminTokenWalletService;
    
    let paymentAdapterFactorySpy: Spy<PaymentAdapterFactoryFn>;
    // denoEnvGetStub is removed, will use fileScopeDenoEnvGetStub via Deno.env.get
  
    let dependencies: WebhookHandlerDependencies;
    // mockEnvVars is removed, will use mockEnvVarsForFileScope
  
    // Test-scoped variables to control behavior of the single getPaymentAdapterStub
    let currentMockAdapter: IPaymentGatewayAdapter | null = null;
    let configuredSourceForAdapterStub: string | null = null;
  
    beforeEach(() => {
      const supabaseSetup = createMockSupabaseClient(undefined, {});
      mockAdminClient = asSupabaseAdminClientForTests(supabaseSetup.client);
      mockAdminTokenWalletServiceBundle = createMockAdminTokenWalletService();
      mockAdminTokenWalletService = mockAdminTokenWalletServiceBundle.instance;

      mockEnvVarsForFileScope = {};

      const fakePaymentAdapterFactory = (
        source: string,
        _adminClient: SupabaseClient<Database>,
        _adminTokenWallet: IAdminTokenWalletService,
      ): IPaymentGatewayAdapter | null => {
        if (configuredSourceForAdapterStub === source) {
          if (currentMockAdapter) return currentMockAdapter;
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

      currentMockAdapter = null;
      configuredSourceForAdapterStub = null;
    });

    // Note: Testing the outer `webhookRouterHandler` for OPTIONS is a separate concern.
    // These tests focus on `handleWebhookRequestLogic`.
  
    describe('POST requests to handleWebhookRequestLogic', () => {
      let mockStripeAdapter: IPaymentGatewayAdapter;
      let handleWebhookSpy: Spy<IPaymentGatewayAdapter, [ArrayBuffer, string | undefined], Promise<PaymentConfirmation>> | undefined;
  
      beforeEach(() => {
        // REMOVED: mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
        // The secret is now an internal concern of the adapter/factory, not directly used by handleWebhookRequestLogic
  
        mockStripeAdapter = {
          gatewayId: 'stripe',
          initiatePayment: async (_ctx) => ({ success: true, paymentGatewayTransactionId: 'mock_id', transactionId: 'mock_internal_id' }),
          // UPDATED: handleWebhook mock to align with IPaymentGatewayAdapter (rawBody: ArrayBuffer)
          handleWebhook: async (_rawBody: ArrayBuffer, _signature: string | undefined): Promise<PaymentConfirmation> => ({ success: true, transactionId: 'mock-webhook-tx-id' }),
        };
        configuredSourceForAdapterStub = 'stripe';
        currentMockAdapter = mockStripeAdapter; // Default to generic mock adapter for existing tests
      });
  
      afterEach(() => {
        if (handleWebhookSpy && typeof handleWebhookSpy.restore === 'function' && !handleWebhookSpy.restored) {
          handleWebhookSpy.restore();
          handleWebhookSpy = undefined;
        }
      });
  
      it('POST /webhooks/unknown-source - should return 404 if adapter not found', async () => {
        configuredSourceForAdapterStub = 'unknown-source';
        currentMockAdapter = null; // Ensure it returns null for this source
  
        const request = new Request('http://localhost/webhooks/unknown-source', {
          method: 'POST',
          body: JSON.stringify({ data: 'some-payload' }),
          headers: { 'Content-Type': 'application/json' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 404);
        assert(responseBody.error.includes("Webhook source 'unknown-source' not supported"));
        assertEquals(paymentAdapterFactorySpy.calls.length, 1);
        assertEquals(paymentAdapterFactorySpy.calls[0].args[0], 'unknown-source');
      });
  
      it('POST /webhooks/stripe - should call adapter.handleWebhook correctly', async () => {
        handleWebhookSpy = spy(mockStripeAdapter, 'handleWebhook');
  
        const testPayload = { event: 'test_event', data: 'some-stripe-data' };
        const testSignature = 'test-stripe-signature';
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(testPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': testSignature },
        });
        
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, 'mock-webhook-tx-id');
        assertEquals(paymentAdapterFactorySpy.calls.length, 1);
        assertEquals(paymentAdapterFactorySpy.calls[0].args[0], 'stripe');
        assert(handleWebhookSpy, "handleWebhookSpy should be defined");
        assertEquals(handleWebhookSpy.calls.length, 1);
        // For the spy call, we need to convert the stringified payload to an ArrayBuffer
        const expectedRawBody = new TextEncoder().encode(JSON.stringify(testPayload)).buffer;
        assertEquals(handleWebhookSpy.calls[0].args[0], expectedRawBody);
        assertEquals(handleWebhookSpy.calls[0].args[1], testSignature);
      });
  
      it('POST /webhooks/stripe - adapter.handleWebhook returns error, should return 400', async () => {
          const mockAdapterWithError: IPaymentGatewayAdapter = {
              gatewayId: 'stripe',
              initiatePayment: async (_ctx) => ({ success: false, error: 'initiate payment error test' }),
              // UPDATED: handleWebhook mock to align with IPaymentGatewayAdapter (rawBody: ArrayBuffer)
              handleWebhook: async (_rawBody: ArrayBuffer, _sig: string | undefined): Promise<PaymentConfirmation> => ({ success: false, error: 'Adapter processing failed', transactionId: 'failed-tx-id' })
          };
          configuredSourceForAdapterStub = 'stripe';
          currentMockAdapter = mockAdapterWithError;
          handleWebhookSpy = spy(mockAdapterWithError, 'handleWebhook');
          
          const request = new Request('http://localhost/webhooks/stripe', {
              method: 'POST',
              body: JSON.stringify({ data: 'some-failure-payload' }),
              headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig123' },
          });
          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();
  
          assertEquals(response.status, 400);
          assertEquals(responseBody.error, 'Adapter processing failed'); 
          assertEquals(paymentAdapterFactorySpy.calls.length, 1);
          assert(handleWebhookSpy, "handleWebhookSpy should be defined");
          assertEquals(handleWebhookSpy.calls.length, 1);
      });
  
      it('POST /webhooks/stripe - adapter.handleWebhook throws error, should return 500', async () => {
          const mockAdapterWithThrow: IPaymentGatewayAdapter = {
              gatewayId: 'stripe',
              initiatePayment: async (_ctx) => ({ success: false, error: 'initiate payment error test' }),
              // UPDATED: handleWebhook mock to align with IPaymentGatewayAdapter (rawBody: ArrayBuffer)
              handleWebhook: async (_rawBody: ArrayBuffer, _sig: string | undefined): Promise<PaymentConfirmation> => { throw new Error('Internal adapter boom!'); }
          };
          configuredSourceForAdapterStub = 'stripe';
          currentMockAdapter = mockAdapterWithThrow;
          handleWebhookSpy = spy(mockAdapterWithThrow, 'handleWebhook');
  
          const request = new Request('http://localhost/webhooks/stripe', {
              method: 'POST',
              body: JSON.stringify({ data: 'exception-payload' }),
              headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig456' },
          });
          const response = await handleWebhookRequestLogic(request, dependencies);
          const responseBody = await response.json();
  
          assertEquals(response.status, 500);
          assert(responseBody.error.includes('Internal adapter boom!'));
          assertEquals(paymentAdapterFactorySpy.calls.length, 1);
          assert(handleWebhookSpy, "handleWebhookSpy should be defined");
          assertEquals(handleWebhookSpy.calls.length, 1);
      });
  
      it('POST /webhooks/stripe - no signature provided, should call adapter.handleWebhook with undefined signature', async () => {
        handleWebhookSpy = spy(mockStripeAdapter, 'handleWebhook');
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify({ data: 'no-sig-payload' }),
          headers: { 'Content-Type': 'application/json' },
        });
        const response = await handleWebhookRequestLogic(request, dependencies);
        const responseBody = await response.json();
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assert(handleWebhookSpy);
        assertEquals(handleWebhookSpy.calls.length, 1);
        assertEquals(handleWebhookSpy.calls[0].args[1], undefined);
      });
    });
    
    // Test for the main webhookRouterHandler (OPTIONS request) - kept for completeness
    // This part tests the DI and composition of webhookRouterHandler.
    describe('webhookRouterHandler direct tests', () => {
      let corsHandlerSpyForRouter: Spy<(req: Request) => Response | null>;
      let adminClientFactorySpy: Spy<() => SupabaseClient<Database>>;
      let adminTokenWalletServiceFactorySpy: Spy<
        (client: SupabaseClient<Database>) => IAdminTokenWalletService
      >;
      let mockAdminTokenWalletServiceBundleRouter: MockAdminTokenWalletService;
      let sharedRouterAdminClient: SupabaseClient<Database>;

      type AdminPaymentAdapterFactoryFn = (
        source: string,
        adminClient: SupabaseClient<Database>,
        adminTokenWalletService: IAdminTokenWalletService,
      ) => IPaymentGatewayAdapter | null;

      let routerStripeAdapterFactory: AdminPaymentAdapterFactoryFn;
      let paymentAdapterFactoryMethodSpy: Spy<AdminPaymentAdapterFactoryFn>;

      let routerDeps: {
        corsHandler: (req: Request) => Response | null;
        adminClientFactory: () => SupabaseClient<Database>;
        adminTokenWalletServiceFactory: (
          adminClient: SupabaseClient<Database>,
        ) => IAdminTokenWalletService;
        paymentAdapterFactory: AdminPaymentAdapterFactoryFn;
        envGetter: (key: string) => string | undefined;
      };

      beforeEach(() => {
        mockEnvVarsForFileScope = {};
        mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;

        corsHandlerSpyForRouter = spy((_req: Request): Response | null => null);

        const supabaseSetupRouter = createMockSupabaseClient(undefined, {});
        sharedRouterAdminClient = asSupabaseAdminClientForTests(supabaseSetupRouter.client);
        adminClientFactorySpy = spy(
          (): SupabaseClient<Database> => sharedRouterAdminClient,
        );
        mockAdminTokenWalletServiceBundleRouter = createMockAdminTokenWalletService();
        adminTokenWalletServiceFactorySpy = spy(
          (_client: SupabaseClient<Database>): IAdminTokenWalletService =>
            mockAdminTokenWalletServiceBundleRouter.instance,
        );
        routerStripeAdapterFactory = (
          source: string,
          _adminClient: SupabaseClient<Database>,
          _adminTokenWalletService: IAdminTokenWalletService,
        ): IPaymentGatewayAdapter | null => {
          if (source === 'stripe') {
            const stripeAdapter: IPaymentGatewayAdapter = {
              gatewayId: 'stripe',
              initiatePayment: async () => ({ success: false, error: 'Not impl in router test mock' }),
              handleWebhook: async () => ({ success: true, transactionId: 'mock-wh-tx-id-router' }),
            };
            return stripeAdapter;
          }
          return null;
        };
        paymentAdapterFactoryMethodSpy = spy(routerStripeAdapterFactory);

        routerDeps = {
          corsHandler: corsHandlerSpyForRouter,
          adminClientFactory: adminClientFactorySpy,
          adminTokenWalletServiceFactory: adminTokenWalletServiceFactorySpy,
          paymentAdapterFactory: paymentAdapterFactoryMethodSpy,
          envGetter: (key: string) => Deno.env.get(key),
        };
      });

      it('OPTIONS /webhooks/stripe - webhookRouterHandler should call corsHandler', async () => {
        const request = new Request('http://localhost/webhooks/stripe', { method: 'OPTIONS' });
        
        // Define specific behavior for this test by re-assigning the spy or its fake implementation
        corsHandlerSpyForRouter = spy((_req: Request): Response | null => { // Re-spy for this test
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
        });
        routerDeps.corsHandler = corsHandlerSpyForRouter; // Update dependency in routerDeps
  
        const response = await webhookRouterHandler(
          request,
          routerDeps,
        );
  
        assertEquals(corsHandlerSpyForRouter.calls.length, 1);
        assertEquals(corsHandlerSpyForRouter.calls[0].args[0], request);
        assertEquals(response.status, 204);
        assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
      });
  
      it('POST /webhooks/stripe - should correctly compose and call handleWebhookRequestLogic', async () => {
        const testPayload = { event: 'test_event_router' };
        const testSignature = 'test-stripe-signature-router';
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify(testPayload),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': testSignature },
        });
  
        const response = await webhookRouterHandler(
          request,
          routerDeps,
        );
        const responseBody = await response.json();
  
        assertEquals(response.status, 200);
        assertEquals(responseBody.message, 'Webhook processed');
        assertEquals(responseBody.transactionId, 'mock-wh-tx-id-router');
  
        // Verify factories and getters were called
        assertEquals(adminClientFactorySpy.calls.length, 1);
        assertEquals(adminTokenWalletServiceFactorySpy.calls.length, 1);
        assertEquals(paymentAdapterFactoryMethodSpy.calls.length, 1);
        assertEquals(paymentAdapterFactoryMethodSpy.calls[0].args[0], 'stripe');
        assertEquals(paymentAdapterFactoryMethodSpy.calls[0].args[1], sharedRouterAdminClient);
        assertEquals(
          paymentAdapterFactoryMethodSpy.calls[0].args[2],
          mockAdminTokenWalletServiceBundleRouter.instance,
        );
      });

      it('adminTokenWalletServiceFactory receives adminClient and returns IAdminTokenWalletService', async () => {
        const request = new Request('http://localhost/webhooks/stripe', {
          method: 'POST',
          body: JSON.stringify({ event: 'contract_factory' }),
          headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig-contract-factory' },
        });
        await webhookRouterHandler(
          request,
          routerDeps,
        );
        assertEquals(adminTokenWalletServiceFactorySpy.calls.length, 1);
        assertEquals(
          adminTokenWalletServiceFactorySpy.calls[0].args[0],
          sharedRouterAdminClient,
        );
        assert(isIAdminTokenWalletService(adminTokenWalletServiceFactorySpy.calls[0].returned));
      });

      it('serve wiring contract: factory uses AdminTokenWalletService direct instantiation', () => {
        const supabaseSetupServe = createMockSupabaseClient(undefined, {});
        const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
          supabaseSetupServe.client,
        );
        const productionStyleFactory = (
          client: SupabaseClient<Database>,
        ): IAdminTokenWalletService => new AdminTokenWalletService(client);
        const service: IAdminTokenWalletService = productionStyleFactory(adminClient);
        assert(isIAdminTokenWalletService(service));
      });
  
      // Add more tests for webhookRouterHandler as needed:
      // - Test case where corsHandler returns a response (POST, but preflight not done by client)
      // - Test cases for different webhook sources if routerDeps.paymentAdapterFactory is configured differently
      // - Test case where envGetter doesn't find a secret (though handleWebhookRequestLogic tests this, could double check composition)
    });
  }); 