import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  spy,
  stub,
  Spy, // Import Spy type if needed for typing
  Stub, // Import Stub type if needed for typing
  assertSpyCall,
  assertSpyCalls,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
import Stripe from "npm:stripe"; // Import Stripe namespace
import { SupabaseClient } from "jsr:@supabase/supabase-js@2"; // Import SupabaseClient type

import { handleWebhookRequest, WebhookDependencies } from "./index.ts"; // Adjust path as necessary

// --- Test Setup ---

const defaultEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  STRIPE_SECRET_TEST_KEY: "sk_test_123",
  STRIPE_SECRET_LIVE_KEY: "sk_live_456",
  STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_abc",
  STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live_xyz",
};

let envStub: Stub | undefined;

function setupEnvStub(envVars: Record<string, string | undefined>) {
  envStub = stub(Deno.env, "get", (key: string) => envVars[key]);
}

function createMockDeps(overrides: Partial<WebhookDependencies> = {}): WebhookDependencies & { [K in keyof WebhookDependencies]: Spy } {
  // Create spies for all functions in WebhookDependencies
  const mocks = {
    envGet: spy(Deno.env.get), // Simple spy, stubbing is done per-test by setupEnvStub
    createStripeClient: spy((key: string, options?: Stripe.StripeConfig): Stripe => {
      // Return a mock Stripe client object with necessary methods spied on
      return {
        webhooks: {
          constructEventAsync: spy(() => Promise.resolve({} as Stripe.Event)) // Default mock for constructEventAsync
        }
        // Add other Stripe methods used in verifyWebhookSignature or handlers if needed
      } as any; // Use 'any' for simplicity or create a more detailed mock
    }),
    verifyWebhookSignature: spy((stripe: Stripe, payload: string, sig: string, secret: string): Promise<Stripe.Event> => {
      // Basic mock implementation, can be overridden per test
      console.log(`Mock verifyWebhookSignature called with secret: ${secret}`);
      if (secret === defaultEnv.STRIPE_TEST_WEBHOOK_SECRET || secret === defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET) {
          // Simulate a successful verification with a basic event object
          return Promise.resolve({
              id: "evt_test_webhook",
              object: "event",
              api_version: "2024-04-10",
              created: Date.now() / 1000,
              data: { object: {} }, // Provide a default empty object
              livemode: secret === defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET,
              pending_webhooks: 0,
              request: { id: null, idempotency_key: null },
              type: "test.event", // Default event type
          } as Stripe.Event);
      }
      return Promise.reject(new Error("Invalid webhook secret"));
    }),
    createSupabaseAdminClient: spy((): SupabaseClient => {
        // Simpler default mock - sufficient for non-chaining tests
        const basicQueryBuilder = {
             select: spy(() => Promise.resolve({ data: [], error: null })), 
             insert: spy(() => Promise.resolve({ data: [], error: null })), 
             update: spy(() => Promise.resolve({ data: [], error: null })), // Non-chainable default
             delete: spy(() => Promise.resolve({ data: [], error: null })), // Non-chainable default
             eq: spy(() => Promise.resolve({ data: [], error: null })), // Non-chainable default
             neq: spy(() => Promise.resolve({ data: [], error: null })), // Non-chainable default
        };
        const mockSupabase = {
            from: spy((_tableName: string) => basicQueryBuilder), // Returns basic builder
            functions: {
                invoke: spy(() => Promise.resolve({ data: null, error: null }))
            }
        };
        return mockSupabase as any; 
    }),
    handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response(null, { status: 204 }) : null),
    createErrorResponse: spy((message: string, status: number) => new Response(JSON.stringify({ error: message }), { status })),
    createSuccessResponse: spy((body?: Record<string, unknown>) => new Response(JSON.stringify(body ?? { received: true }), { status: 200 })),
    // Event Handlers
    handleCheckoutSessionCompleted: spy(() => Promise.resolve()),
    handleSubscriptionUpdated: spy(() => Promise.resolve()),
    handleSubscriptionDeleted: spy(() => Promise.resolve()),
    handleInvoicePaymentSucceeded: spy(() => Promise.resolve()),
    handleInvoicePaymentFailed: spy(() => Promise.resolve()),
  };

  // Apply overrides
  for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          (mocks as any)[key] = overrides[key as keyof WebhookDependencies];
      }
  }

  return mocks as WebhookDependencies & { [K in keyof WebhookDependencies]: Spy };
}

// --- Tests ---

describe("Stripe Webhook Handler", () => {

  beforeEach(() => {
    // Reset spies before each test
    // This assumes createMockDeps is called within each test or describe block
    // If mocks are created outside, reset them here.
  });

  afterEach(() => {
    if (envStub) {
      envStub.restore();
      envStub = undefined;
    }
  });

  it("should handle CORS preflight requests", async () => {
    setupEnvStub(defaultEnv); // Env needed even for CORS sometimes
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/stripe-webhook", { method: "OPTIONS" });
    const res = await handleWebhookRequest(req, mockDeps);

    assertEquals(res.status, 204);
    assertSpyCall(mockDeps.handleCorsPreflightRequest, 0, { args: [req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0); // Ensure no error response
    assertSpyCalls(mockDeps.createSuccessResponse, 0); // Ensure no success response
  });

  it("should return 405 for non-POST requests", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/stripe-webhook", { method: "GET" });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 405);
      assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Method not allowed", 405] });
      assertSpyCalls(mockDeps.verifyWebhookSignature, 0); // Ensure signature check wasn't reached
  });

  it("should return 400 if stripe-signature header is missing", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/stripe-webhook", {
      method: "POST",
      body: JSON.stringify({ type: "test.event" }),
      headers: { "Content-Type": "application/json" },
      // No stripe-signature header
    });
    const res = await handleWebhookRequest(req, mockDeps);

    assertEquals(res.status, 400);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Missing Stripe signature", 400] });
    assertSpyCalls(mockDeps.verifyWebhookSignature, 0); // Ensure signature verification was not attempted
  });

  it("should return 500 if webhook secrets are missing", async () => {
    setupEnvStub({ ...defaultEnv, STRIPE_TEST_WEBHOOK_SECRET: undefined, STRIPE_LIVE_WEBHOOK_SECRET: undefined });
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/stripe-webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });
    const res = await handleWebhookRequest(req, mockDeps);

    assertEquals(res.status, 500);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Webhook secrets not configured.", 500] });
  });

  it("should return 500 if Stripe API keys are missing", async () => {
    setupEnvStub({ ...defaultEnv, STRIPE_SECRET_TEST_KEY: undefined, STRIPE_SECRET_LIVE_KEY: undefined });
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/stripe-webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });
    const res = await handleWebhookRequest(req, mockDeps);

    assertEquals(res.status, 500);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Stripe key configuration error.", 500] });
  });

  it("should return 500 if Stripe client initialization fails", async () => {
    setupEnvStub(defaultEnv);
    const initError = new Error("Stripe init failed");
    const mockDeps = createMockDeps({
        createStripeClient: spy(() => { throw initError; })
    });
    const req = new Request("http://example.com/stripe-webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });
    const res = await handleWebhookRequest(req, mockDeps);

    assertEquals(res.status, 500);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Stripe client initialization failed.", 500] });
  });

  it("should return 500 if Supabase client initialization fails", async () => {
    setupEnvStub(defaultEnv);
    const supabaseError = new Error("Supabase init failed");
    // Mock successful signature verification first
    const mockEvent = { id: "evt_test", type: "test.event", livemode: false } as Stripe.Event;
    const mockVerify = spy(() => Promise.resolve(mockEvent));
    
    const mockDeps = createMockDeps({
        verifyWebhookSignature: mockVerify,
        createSupabaseAdminClient: spy(() => { throw supabaseError; })
    });

    const req = new Request("http://example.com/stripe-webhook", {
      method: "POST",
      body: "valid_payload",
      headers: { "stripe-signature": "sig_test" },
    });
    const res = await handleWebhookRequest(req, mockDeps);

    assertEquals(res.status, 500);
    assertSpyCall(mockVerify, 0); // Ensure verification was attempted
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Supabase admin client initialization failed.", 500] });
  });

  describe("Signature Verification", () => {
    const mockBody = "webhook_payload";
    const mockSig = "sig_test_123";
    const mockTestEvent = { id: "evt_test_verified", type: "test.event", livemode: false, data: { object: { id: "obj_test" } } } as Stripe.Event;
    const mockLiveEvent = { id: "evt_live_verified", type: "live.event", livemode: true, data: { object: { id: "obj_live" } } } as Stripe.Event;
    const verifyError = new Error("Invalid signature");

    it("should succeed with TEST secret", async () => {
        setupEnvStub(defaultEnv);
        const mockVerify = spy(async (stripe: Stripe, payload: string, sig: string, secret: string): Promise<Stripe.Event> => {
            if (secret === defaultEnv.STRIPE_TEST_WEBHOOK_SECRET) return mockTestEvent;
            throw verifyError; // Should not be called with live secret
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", {
          method: "POST",
          body: mockBody,
          headers: { "stripe-signature": mockSig },
        });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 200);
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_TEST_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 1); // Only called once with test secret
        // Check that a success handler was called (e.g., default unhandled event)
        assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should succeed with LIVE secret after TEST fails", async () => {
        setupEnvStub(defaultEnv);
        const mockVerify = spy(async (stripe: Stripe, payload: string, sig: string, secret: string): Promise<Stripe.Event> => {
            if (secret === defaultEnv.STRIPE_TEST_WEBHOOK_SECRET) throw verifyError;
            if (secret === defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET) return mockLiveEvent;
            throw new Error("Unexpected secret");
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", {
          method: "POST",
          body: mockBody,
          headers: { "stripe-signature": mockSig },
        });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 200);
        // Called first with test secret
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_TEST_WEBHOOK_SECRET);
        // Called second with live secret
        assertSpyCall(mockVerify, 1);
        assertEquals(mockVerify.calls[1].args[1], mockBody);
        assertEquals(mockVerify.calls[1].args[2], mockSig);
        assertEquals(mockVerify.calls[1].args[3], defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 2);
        assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

     it("should succeed with only TEST secret present", async () => {
        setupEnvStub({ ...defaultEnv, STRIPE_LIVE_WEBHOOK_SECRET: undefined });
        const mockVerify = spy(async (stripe: Stripe, payload: string, sig: string, secret: string): Promise<Stripe.Event> => {
            if (secret === defaultEnv.STRIPE_TEST_WEBHOOK_SECRET) return mockTestEvent;
            throw new Error("Should not be called with other secrets");
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 200);
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_TEST_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 1);
        assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should succeed with only LIVE secret present", async () => {
        setupEnvStub({ ...defaultEnv, STRIPE_TEST_WEBHOOK_SECRET: undefined });
        const mockVerify = spy(async (stripe: Stripe, payload: string, sig: string, secret: string): Promise<Stripe.Event> => {
            if (secret === defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET) return mockLiveEvent;
            throw new Error("Should not be called with other secrets");
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 200);
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 1);
        assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should return 400 if both TEST and LIVE secrets fail", async () => {
        setupEnvStub(defaultEnv);
        const mockVerify = spy(async (): Promise<Stripe.Event> => {
            throw verifyError;
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 400);
        // Called first with test secret
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_TEST_WEBHOOK_SECRET);
        // Called second with live secret
        assertSpyCall(mockVerify, 1);
        assertEquals(mockVerify.calls[1].args[1], mockBody);
        assertEquals(mockVerify.calls[1].args[2], mockSig);
        assertEquals(mockVerify.calls[1].args[3], defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 2);
        assertSpyCall(mockDeps.createErrorResponse, 0, { args: [verifyError.message, 400] });
    });

    it("should return 400 if only TEST secret present and fails", async () => {
        setupEnvStub({ ...defaultEnv, STRIPE_LIVE_WEBHOOK_SECRET: undefined });
         const mockVerify = spy(async (): Promise<Stripe.Event> => {
            throw verifyError;
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 400);
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_TEST_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 1);
        assertSpyCall(mockDeps.createErrorResponse, 0, { args: [verifyError.message, 400] });
    });

     it("should return 400 if only LIVE secret present and fails", async () => {
        setupEnvStub({ ...defaultEnv, STRIPE_TEST_WEBHOOK_SECRET: undefined });
         const mockVerify = spy(async (): Promise<Stripe.Event> => {
            throw verifyError;
        });
        const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

        const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
        const res = await handleWebhookRequest(req, mockDeps);

        assertEquals(res.status, 400);
        assertSpyCall(mockVerify, 0);
        assertEquals(mockVerify.calls[0].args[1], mockBody);
        assertEquals(mockVerify.calls[0].args[2], mockSig);
        assertEquals(mockVerify.calls[0].args[3], defaultEnv.STRIPE_LIVE_WEBHOOK_SECRET);
        assertSpyCalls(mockVerify, 1);
        assertSpyCall(mockDeps.createErrorResponse, 0, { args: [verifyError.message, 400] });
    });

  }); // End Signature Verification describe block

  describe("Event Handling", () => {
    const mockBody = "webhook_payload";
    const mockSig = "sig_test_123";

    // Helper to create a mock event
    const createMockEvent = (type: string, data: Record<string, any>, livemode = false): Stripe.Event => ({
      id: `evt_${type.replace('.', '_')}`,
      object: "event",
      api_version: "2024-04-10",
      created: Date.now() / 1000,
      data: { object: data },
      livemode,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type,
    } as Stripe.Event);

    it("should call handleCheckoutSessionCompleted for checkout.session.completed", async () => {
      setupEnvStub(defaultEnv);
      const mockSession = { id: "cs_test_1", object: "checkout.session", customer: "cus_123" } as Stripe.Checkout.Session;
      const mockEvent = createMockEvent("checkout.session.completed", mockSession);
      const mockVerify = spy(() => Promise.resolve(mockEvent));
      const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0); // Verify signature check happened
      assertSpyCall(mockDeps.handleCheckoutSessionCompleted, 0);
      assertEquals(mockDeps.handleCheckoutSessionCompleted.calls[0].args[1], mockSession);
      assertEquals(mockDeps.handleCheckoutSessionCompleted.calls[0].args[2], mockEvent.id);
      assertEquals(mockDeps.handleCheckoutSessionCompleted.calls[0].args[3], mockEvent.type);
      assertSpyCalls(mockDeps.handleSubscriptionUpdated, 0); // Ensure other handlers not called
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should call handleSubscriptionUpdated for customer.subscription.updated", async () => {
      setupEnvStub(defaultEnv);
      const mockSubscription = { id: "sub_test_1", object: "subscription", status: "active" } as Stripe.Subscription;
      const mockEvent = createMockEvent("customer.subscription.updated", mockSubscription);
      const mockVerify = spy(() => Promise.resolve(mockEvent));
      const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      assertSpyCall(mockDeps.handleSubscriptionUpdated, 0);
      assertEquals(mockDeps.handleSubscriptionUpdated.calls[0].args[1], mockSubscription);
      assertEquals(mockDeps.handleSubscriptionUpdated.calls[0].args[2], mockEvent.id);
      assertEquals(mockDeps.handleSubscriptionUpdated.calls[0].args[3], mockEvent.type);
      assertSpyCalls(mockDeps.handleCheckoutSessionCompleted, 0); // Ensure other handlers not called
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should handle unhandled event types gracefully", async () => {
      setupEnvStub(defaultEnv);
      const mockDataObject = { id: "unhandled_obj_1" };
      const mockEvent = createMockEvent("some.other.event", mockDataObject);
      const mockVerify = spy(() => Promise.resolve(mockEvent));
      const mockDeps = createMockDeps({ verifyWebhookSignature: mockVerify });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      // Ensure no specific handlers were called
      assertSpyCalls(mockDeps.handleCheckoutSessionCompleted, 0);
      assertSpyCalls(mockDeps.handleSubscriptionUpdated, 0);
      assertSpyCalls(mockDeps.handleSubscriptionDeleted, 0);
      assertSpyCalls(mockDeps.handleInvoicePaymentSucceeded, 0);
      assertSpyCalls(mockDeps.handleInvoicePaymentFailed, 0);
      // It should still return success
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should return 500 if an event handler throws an error", async () => {
       setupEnvStub(defaultEnv);
       const handlerError = new Error("Handler failed!");
       const mockSession = { id: "cs_fail_1" } as Stripe.Checkout.Session;
       const mockEvent = createMockEvent("checkout.session.completed", mockSession);
       const mockVerify = spy(() => Promise.resolve(mockEvent));
       const mockHandler = spy(() => Promise.reject(handlerError)); // Mock the specific handler to throw
       const mockDeps = createMockDeps({
            verifyWebhookSignature: mockVerify,
            handleCheckoutSessionCompleted: mockHandler
       });

       const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
       const res = await handleWebhookRequest(req, mockDeps);

       assertEquals(res.status, 500);
       assertSpyCall(mockVerify, 0);
       assertSpyCall(mockHandler, 0); // Ensure the handler was called
       assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, 500] });
       assertSpyCalls(mockDeps.createSuccessResponse, 0); // Ensure success response wasn't called
    });

    // --- Tests for events handled directly in the switch statement ---

    it("should handle product.updated by updating plans", async () => {
      setupEnvStub(defaultEnv);
      const mockProduct = { id: "prod_123", object: "product", active: false } as Stripe.Product;
      const mockEvent = createMockEvent("product.updated", mockProduct);
      const mockVerify = spy(() => Promise.resolve(mockEvent));

      // Setup specific mock chain for this test
      const updateResult = { data: [], error: null };
      const neqSpy = spy(() => Promise.resolve(updateResult));
      const eqSpy = spy(() => ({ neq: neqSpy }));
      const updateSpy = spy(() => ({ eq: eqSpy }));
      const fromSpy = spy(() => ({ update: updateSpy }));
      const mockSupabaseClient = { from: fromSpy, functions: { invoke: spy() } }; // Add functions mock

      const mockDeps = createMockDeps({
          verifyWebhookSignature: mockVerify,
          createSupabaseAdminClient: spy(() => mockSupabaseClient as any)
      });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      assertSpyCall(fromSpy, 0, { args: ['subscription_plans'] });
      assertSpyCall(updateSpy, 0);
      const updateArgs = updateSpy.calls[0].args[0] as { active: boolean, updated_at: string };
      assertEquals(updateArgs.active, false);
      assertExists(updateArgs.updated_at);
      assertEquals(typeof updateArgs.updated_at, "string");
      assertSpyCall(eqSpy, 0, { args: ['stripe_product_id', mockProduct.id] });
      assertSpyCall(neqSpy, 0, { args: ['stripe_price_id', 'price_FREE'] });
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should handle price.updated by updating the specific plan", async () => {
      setupEnvStub(defaultEnv);
      const mockPrice = { id: "price_abc", object: "price", active: false } as Stripe.Price;
      const mockEvent = createMockEvent("price.updated", mockPrice);
      const mockVerify = spy(() => Promise.resolve(mockEvent));
      
      // Setup specific mock chain for this test
      const updateResult = { data: [], error: null };
      const eqSpy = spy(() => Promise.resolve(updateResult));
      const updateSpy = spy(() => ({ eq: eqSpy }));
      const fromSpy = spy(() => ({ update: updateSpy }));
      const mockSupabaseClient = { from: fromSpy, functions: { invoke: spy() } };

      const mockDeps = createMockDeps({
          verifyWebhookSignature: mockVerify,
          createSupabaseAdminClient: spy(() => mockSupabaseClient as any)
      });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      assertSpyCall(fromSpy, 0, { args: ['subscription_plans'] });
      assertSpyCall(updateSpy, 0);
      const updateArgsPrice = updateSpy.calls[0].args[0] as { active: boolean, updated_at: string };
      assertEquals(updateArgsPrice.active, false);
      assertExists(updateArgsPrice.updated_at);
      assertEquals(typeof updateArgsPrice.updated_at, "string");
      assertSpyCall(eqSpy, 0, { args: ['stripe_price_id', mockPrice.id] });
      // assertSpyCalls(mockSupabaseClient.from("").update({}).eq("","").neq, 0); // Cannot check neq this way on simplified mock
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should handle price.deleted by deactivating the specific plan", async () => {
       setupEnvStub(defaultEnv);
      const mockPrice = { id: "price_def", object: "price", active: true } as Stripe.Price;
      const mockEvent = createMockEvent("price.deleted", mockPrice);
      const mockVerify = spy(() => Promise.resolve(mockEvent));

      // Setup specific mock chain for this test
      const updateResult = { data: [], error: null };
      const eqSpy = spy(() => Promise.resolve(updateResult));
      const updateSpy = spy(() => ({ eq: eqSpy }));
      const fromSpy = spy(() => ({ update: updateSpy }));
      const mockSupabaseClient = { from: fromSpy, functions: { invoke: spy() } };

      const mockDeps = createMockDeps({
          verifyWebhookSignature: mockVerify,
          createSupabaseAdminClient: spy(() => mockSupabaseClient as any)
      });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      assertSpyCall(fromSpy, 0, { args: ['subscription_plans'] });
      assertSpyCall(updateSpy, 0);
      const updateArgsDeleted = updateSpy.calls[0].args[0] as { active: boolean, updated_at: string };
      assertEquals(updateArgsDeleted.active, false);
      assertExists(updateArgsDeleted.updated_at);
      assertEquals(typeof updateArgsDeleted.updated_at, "string");
      assertSpyCall(eqSpy, 0, { args: ['stripe_price_id', mockPrice.id] });
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should ignore price.updated/deleted for 'price_FREE'", async () => {
       setupEnvStub(defaultEnv);
       const mockPrice = { id: "price_FREE", object: "price", active: true } as Stripe.Price;
       const mockEvent = createMockEvent("price.updated", mockPrice);
       const mockVerify = spy(() => Promise.resolve(mockEvent));
       const mockSupabaseClient = createMockDeps().createSupabaseAdminClient(); // Uses the simple default mock
       const mockDeps = createMockDeps({
            verifyWebhookSignature: mockVerify,
            createSupabaseAdminClient: spy(() => mockSupabaseClient)
       });

       const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
       const res = await handleWebhookRequest(req, mockDeps);

       assertEquals(res.status, 200);
       assertSpyCall(mockVerify, 0);
       assertSpyCalls(mockSupabaseClient.from, 0); // Ensure no DB calls were made
       assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should handle product.created by invoking sync-stripe-plans (test mode)", async () => {
      setupEnvStub(defaultEnv);
      const mockProduct = { id: "prod_new", object: "product" } as Stripe.Product;
      const mockEvent = createMockEvent("product.created", mockProduct, false); // livemode = false
      const mockVerify = spy(() => Promise.resolve(mockEvent));
      const mockSupabaseClient = createMockDeps().createSupabaseAdminClient();
      const mockInvoke = mockSupabaseClient.functions.invoke;
      const mockDeps = createMockDeps({
          verifyWebhookSignature: mockVerify,
          createSupabaseAdminClient: spy(() => mockSupabaseClient)
      });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      assertSpyCall(mockInvoke, 0, {
        args: ['sync-stripe-plans', { body: JSON.stringify({ isTestMode: true }) }]
      });
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

    it("should handle price.created by invoking sync-stripe-plans (live mode)", async () => {
      setupEnvStub(defaultEnv);
      const mockPrice = { id: "price_new", object: "price" } as Stripe.Price;
      const mockEvent = createMockEvent("price.created", mockPrice, true); // livemode = true
      const mockVerify = spy(() => Promise.resolve(mockEvent));
      const mockSupabaseClient = createMockDeps().createSupabaseAdminClient();
      const mockInvoke = mockSupabaseClient.functions.invoke;
      const mockDeps = createMockDeps({
          verifyWebhookSignature: mockVerify,
          createSupabaseAdminClient: spy(() => mockSupabaseClient)
      });

      const req = new Request("http://example.com/stripe-webhook", { method: "POST", body: mockBody, headers: { "stripe-signature": mockSig } });
      const res = await handleWebhookRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockVerify, 0);
      assertSpyCall(mockInvoke, 0, {
        args: ['sync-stripe-plans', { body: JSON.stringify({ isTestMode: false }) }]
      });
      assertSpyCall(mockDeps.createSuccessResponse, 0);
    });

  }); // End Event Handling describe block

  // More tests will go here...

}); 