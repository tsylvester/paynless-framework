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

import * as corsHeaders from '../_shared/cors-headers.ts';
import * as adapterFactory from '../_shared/adapters/adapterFactory.ts';
import { IPaymentGatewayAdapter, PaymentConfirmation, PaymentInitiationResult } from '../_shared/types/payment.types.ts';
// TWS import is not used directly in these tests, can be removed if not needed for type inference elsewhere
// import * as TWS from '../_shared/services/tokenWalletService.ts';

import { webhookRouterHandler, handleWebhookRequestLogic, WebhookHandlerDependencies, WebhookRouterDependencies } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import type { Database } from '../types_db.ts'; // Corrected path to types_db.ts
import type { PaymentAdapterFactoryFn } from './index.ts'; // Import the type

// --- Single File-Scope Stub for Deno.env.get ---
const originalDenoEnvGet = Deno.env.get;
let fileScopeDenoEnvGetStub: Stub<typeof Deno.env, [key: string, ...unknown[]], string | undefined> | null = null;
let mockEnvVarsForFileScope: Record<string, string | undefined> = {};
// --- End File-Scope Stub ---

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

  beforeEach(() => {
    mockAdminClient = {} as SupabaseClient<Database>; 
    mockTokenWalletService = {} as ITokenWalletService;

    mockEnvVarsForFileScope = {}; // Reset for each test in this suite
    // No need to create/restore fileScopeDenoEnvGetStub here, managed by beforeAll/afterAll

    const fakePaymentAdapterFactory = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: ITokenWalletService): IPaymentGatewayAdapter | null => {
      if (configuredSourceForAdapterStub === source) {
        return currentMockAdapter;
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
  });

  afterEach(() => {
    // No need to restore fileScopeDenoEnvGetStub here, managed by afterAll
    // paymentAdapterFactorySpy restoration (if it were a method spy) would go here or be handled by its re-creation.
    // For current paymentAdapterFactorySpy (spy on anonymous fn), re-init in beforeEach is fine.
  });

  // Note: Testing the outer `webhookRouterHandler` for OPTIONS is a separate concern.
  // These tests focus on `handleWebhookRequestLogic`.

  describe('POST requests to handleWebhookRequestLogic', () => {
    let mockStripeAdapter: IPaymentGatewayAdapter;
    let handleWebhookSpy: Spy<IPaymentGatewayAdapter, [string | Uint8Array, string | undefined], Promise<PaymentConfirmation>> | undefined;

    beforeEach(() => {
      // REMOVED: mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET;
      // The secret is now an internal concern of the adapter/factory, not directly used by handleWebhookRequestLogic

      mockStripeAdapter = {
        gatewayId: 'stripe',
        initiatePayment: async (_ctx) => ({ success: true, paymentGatewayTransactionId: 'mock_id', transactionId: 'mock_internal_id' }),
        // UPDATED: handleWebhook mock no longer expects secret
        handleWebhook: async (_rawBody, _signature) => ({ success: true, transactionId: 'mock-webhook-tx-id' }),
      };
      configuredSourceForAdapterStub = 'stripe';
      currentMockAdapter = mockStripeAdapter;
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
      assertEquals(handleWebhookSpy.calls[0].args[0], JSON.stringify(testPayload));
      assertEquals(handleWebhookSpy.calls[0].args[1], testSignature);
    });

    it('POST /webhooks/stripe - adapter.handleWebhook returns error, should return 400', async () => {
        const mockAdapterWithError: IPaymentGatewayAdapter = {
            gatewayId: 'stripe',
            initiatePayment: async (_ctx) => ({ success: false, error: 'initiate payment error test' }),
            // UPDATED: handleWebhook mock no longer expects secret
            handleWebhook: async (_rawBody, _sig) => ({ success: false, error: 'Adapter processing failed', transactionId: 'failed-tx-id' })
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
            // UPDATED: handleWebhook mock no longer expects secret
            handleWebhook: async (_rawBody, _sig) => { throw new Error('Internal adapter boom!'); }
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
        assert(responseBody.error.includes('Internal Server Error during webhook processing.'));
        assertEquals(paymentAdapterFactorySpy.calls.length, 1);
        assert(handleWebhookSpy, "handleWebhookSpy should be defined");
        assertEquals(handleWebhookSpy.calls.length, 1);
    });

    it('POST /webhooks/stripe - no signature provided, should call adapter.handleWebhook with undefined signature', async () => {
      // ... existing code ...
    });
  });
  
  // Test for the main webhookRouterHandler (OPTIONS request) - kept for completeness
  // This part tests the DI and composition of webhookRouterHandler.
  describe('webhookRouterHandler direct tests', () => {
    // Stubs for object methods, Spies for standalone functions
    // mainCorsHandlerStub is replaced by corsHandlerSpyForRouter
    // let mainCorsHandlerStub: Stub<typeof corsHeaders, Parameters<typeof corsHeaders.handleCorsPreflightRequest>, ReturnType<typeof corsHeaders.handleCorsPreflightRequest>>;
    let corsHandlerSpyForRouter: Spy<(req: Request) => Response | null>;
    let adminClientFactorySpy: Spy<() => SupabaseClient<Database>>;
    let tokenWalletServiceFactorySpy: Spy<(client: SupabaseClient<Database>) => ITokenWalletService>;
    let paymentAdapterFactorySpyForRouter: Spy<(source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: ITokenWalletService) => IPaymentGatewayAdapter | null>;

    // To hold the constructed dependencies object for router handler
    let routerDeps: WebhookRouterDependencies;

    beforeEach(() => {
      // Ensure spies/stubs from previous tests/steps are restored to avoid conflicts
      // if (corsHandlerSpyForRouter && typeof corsHandlerSpyForRouter.restore === 'function' && !corsHandlerSpyForRouter.restored) {
      //   try { corsHandlerSpyForRouter.restore(); } catch(e) { console.warn("corsHandlerSpyForRouter restore failed in beforeEach: ", e); }
      // }

      // No need to manage fileScopeDenoEnvGetStub here, handled by beforeAll/afterAll
      mockEnvVarsForFileScope = {}; 
      mockEnvVarsForFileScope['STRIPE_WEBHOOK_SECRET'] = MOCK_STRIPE_WEBHOOK_SECRET; // Ensure Stripe secret is available

      // Initialize spies for each dependency of webhookRouterHandler
      corsHandlerSpyForRouter = spy((_req: Request): Response | null => null); // Default fake
      
      adminClientFactorySpy = spy(() => ({} as SupabaseClient<Database>));
      tokenWalletServiceFactorySpy = spy((_client: SupabaseClient<Database>) => ({} as ITokenWalletService));
      const fakePaymentAdapterFactoryForRouter = (source: string, _adminClient: SupabaseClient<Database>, _tokenWalletService: ITokenWalletService): IPaymentGatewayAdapter | null => {
        if (source === 'stripe') {
          return {
            gatewayId: 'stripe',
            initiatePayment: async () => ({ success: false, error: 'Not impl in router test mock' }),
            handleWebhook: async () => ({ success: true, transactionId: 'mock-wh-tx-id-router' }),
          } as IPaymentGatewayAdapter;
        }
        return null;
      };
      paymentAdapterFactorySpyForRouter = spy(fakePaymentAdapterFactoryForRouter);
      
      routerDeps = {
        corsHandler: corsHandlerSpyForRouter, // Use the new spy
        adminClientFactory: adminClientFactorySpy,
        tokenWalletServiceFactory: tokenWalletServiceFactorySpy as unknown as new (adminClient: SupabaseClient<Database>) => ITokenWalletService, 
        paymentAdapterFactory: paymentAdapterFactorySpyForRouter,
        envGetter: (key: string) => Deno.env.get(key), // This will use the fileScopeDenoEnvGetStub
      };
    });

    afterEach(() => {
      // if (corsHandlerSpyForRouter && typeof corsHandlerSpyForRouter.restore === 'function' && !corsHandlerSpyForRouter.restored) {
      //   try { corsHandlerSpyForRouter.restore(); } catch(e) { console.warn("corsHandlerSpyForRouter restore failed in afterEach: ", e); }
      // }
      // No need to manage fileScopeDenoEnvGetStub here
    });

    it('OPTIONS /webhooks/stripe - webhookRouterHandler should call corsHandler', async () => {
      const request = new Request('http://localhost/webhooks/stripe', { method: 'OPTIONS' });
      
      // Define specific behavior for this test by re-assigning the spy or its fake implementation
      corsHandlerSpyForRouter = spy((_req: Request): Response | null => { // Re-spy for this test
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      routerDeps.corsHandler = corsHandlerSpyForRouter; // Update dependency in routerDeps

      const response = await webhookRouterHandler(request, routerDeps);

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

      const response = await webhookRouterHandler(request, routerDeps);
      const responseBody = await response.json();

      assertEquals(response.status, 200);
      assertEquals(responseBody.message, 'Webhook processed');
      assertEquals(responseBody.transactionId, 'mock-wh-tx-id-router');

      // Verify factories and getters were called
      assertEquals(adminClientFactorySpy.calls.length, 1);
      assertEquals(tokenWalletServiceFactorySpy.calls.length, 1);
      assertEquals(paymentAdapterFactorySpyForRouter.calls.length, 1);
      assertEquals(paymentAdapterFactorySpyForRouter.calls[0].args[0], 'stripe');
      assert(fileScopeDenoEnvGetStub?.calls.some(call => call.args[0] === 'STRIPE_WEBHOOK_SECRET'), "Deno.env.get was not called for STRIPE_WEBHOOK_SECRET");
    });

    // Add more tests for webhookRouterHandler as needed:
    // - Test case where corsHandler returns a response (POST, but preflight not done by client)
    // - Test cases for different webhook sources if routerDeps.paymentAdapterFactory is configured differently
    // - Test case where envGetter doesn't find a secret (though handleWebhookRequestLogic tests this, could double check composition)
  });

}); 