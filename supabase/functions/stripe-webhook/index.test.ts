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

// Helper to create the Deno.env.get stub
function createEnvStub(envVars: Record<string, string | undefined>): Stub {
  // No try-catch needed if beforeEach/afterEach is reliable
  return stub(Deno.env, "get", (key: string) => envVars[key]);
}

// Helper to create mock Request objects
function createMockRequest(method: string, body: string | null, headers: Record<string, string>): Request {
  return new Request("http://example.com/stripe-webhook", {
    method,
    body,
    headers,
  });
}

// Helper to create mock Stripe Event objects (Keep this helper)
const createMockStripeEvent = (type: string, data: any = {}, livemode: boolean = false): Stripe.Event => ({
  id: `evt_test_${Math.random().toString(36).substring(7)}`,
  object: "event",
  api_version: "2024-04-10", // Use a recent API version
  created: Math.floor(Date.now() / 1000),
  data: {
    object: data, // The actual event payload
  },
  livemode: livemode,
  pending_webhooks: 0,
  request: { id: null, idempotency_key: null },
  type: type,
} as Stripe.Event); // Use 'as' for casting simplicity in tests

// --- Tests ---

describe("Stripe Webhook Handler", () => {

  // --- Mock Variables ---
  let mockDeps: Partial<WebhookDependencies>;
  let envStub: Stub | undefined; // The single stub for Deno.env.get

  // Spies for dependency functions
  let mockHandleCorsPreflightRequest: Spy;
  let mockCreateErrorResponse: Spy;
  let mockCreateSuccessResponse: Spy;
  let mockVerifyWebhookSignature: Spy;
  let mockCreateSupabaseAdminClient: Spy;
  let mockHandleEvent: Spy;
  let mockEnvGet: Spy;

  // Mock instances
  let mockStripeInstance: Partial<Stripe> = {};
  let mockSupabaseInstance: Partial<SupabaseClient> = {};

  beforeEach(() => {
    // --- Setup Environment Stub ---
    // Ensure any previous stub is restored before creating a new one
    if (envStub) {
      try { envStub.restore(); } catch (_) { /* Ignore errors if already restored */ }
    }
    envStub = createEnvStub(defaultEnv);

    // --- Reset Spies & Mock Dependencies ---
    // Define the base structure for mockDeps here
    mockHandleCorsPreflightRequest = spy(() => null);
    mockCreateErrorResponse = spy((message: string, status: number) => new Response(JSON.stringify({ error: message }), { status }));
    mockCreateSuccessResponse = spy(() => new Response(JSON.stringify({ received: true }), { status: 200 }));
    mockVerifyWebhookSignature = spy(() => Promise.resolve(createMockStripeEvent("test.event")));
    mockCreateSupabaseAdminClient = spy(() => mockSupabaseInstance as SupabaseClient);
    mockHandleEvent = spy(() => Promise.resolve());
    mockEnvGet = spy((key: string) => Deno.env.get(key));

    mockDeps = {
        envGet: mockEnvGet,
        handleCorsPreflightRequest: mockHandleCorsPreflightRequest,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        verifyWebhookSignature: mockVerifyWebhookSignature,
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleEvent: mockHandleEvent,
        // Rename factories to match expected names in index.ts
        createStripeClient: () => mockStripeInstance as Stripe,
        createSupabaseClient: () => mockSupabaseInstance as SupabaseClient,
        // Simplified event handlers
        handleCheckoutSessionCompleted: spy(() => Promise.resolve()),
        handleSubscriptionUpdated: spy(() => Promise.resolve()),
        handleSubscriptionDeleted: spy(() => Promise.resolve()),
        handleInvoicePaymentSucceeded: spy(() => Promise.resolve()),
        handleInvoicePaymentFailed: spy(() => Promise.resolve()),
        handleProductCreated: spy(() => Promise.resolve()),
        handleProductUpdated: spy(() => Promise.resolve()),
        handlePriceChange: spy(() => Promise.resolve()),
        findPlanByStripeId: spy(() => Promise.resolve(null)),
        updatePlanDetails: spy(() => Promise.resolve()),
        updatePriceDetails: spy(() => Promise.resolve()),
        deactivatePlanByPriceId: spy(() => Promise.resolve()),
        findOrCreateTransaction: spy(() => Promise.resolve({ id: 'tx_123' })),
        updateTransactionStatus: spy(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    // Restore the environment stub AFTER EACH test
    if (envStub) {
      try { envStub.restore(); } catch (_) { /* Ignore errors if already restored */ }
      envStub = undefined; // Clear the reference
    }
  });

  // --- Basic Request Handling Tests ---

  it("should handle CORS preflight requests", async () => {
    const req = createMockRequest("OPTIONS", null, { Origin: "http://localhost:3000" });
    mockDeps.handleCorsPreflightRequest = spy(() => new Response(null, { status: 204 })); // Specific mock for this test
    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);
    assertEquals(res.status, 204);
    assertSpyCall(mockDeps.handleCorsPreflightRequest!, 0);
  });

  it("should return 405 for non-POST requests", async () => {
    // No specific env changes needed, uses default mocks
    const req = createMockRequest("GET", null, {});
    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);
    assertEquals(res.status, 405);
    assertSpyCall(mockCreateErrorResponse, 0, { args: ["Method not allowed", 405] });
    assertSpyCalls(mockVerifyWebhookSignature, 0);
  });

  it("should return 400 if stripe-signature header is missing", async () => {
    // No specific env changes needed, uses default mocks
    const req = createMockRequest("POST", JSON.stringify({ type: "test.event" }), {
      "Content-Type": "application/json",
    });
    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);
    assertEquals(res.status, 400);
    assertSpyCall(mockCreateErrorResponse, 0, { args: ["Missing Stripe signature", 400] });
    assertSpyCalls(mockVerifyWebhookSignature, 0);
  });

  // --- Dependency Failure Tests ---

  it("should return 400 if signature verification fails", async () => {
    // *** Modify mockDeps for this test, DO NOT modify envStub ***
    const verifyError = new Error("Webhook signature verification failed.");
    mockVerifyWebhookSignature = spy(() => Promise.reject(verifyError));
    mockDeps.verifyWebhookSignature = mockVerifyWebhookSignature; // Update mockDeps

    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_invalid" });
    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);

    assertEquals(res.status, 400);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateErrorResponse, 0, { args: [verifyError.message, 400] });
  });

  it("should return 500 if Supabase client initialization fails", async () => {
    // *** Modify mockDeps for this test, DO NOT modify envStub ***
    const supabaseError = new Error("Failed to initialize Supabase client.");
    mockCreateSupabaseAdminClient = spy(() => { throw supabaseError; });
    mockDeps.createSupabaseAdminClient = mockCreateSupabaseAdminClient; // Update mockDeps

    // Ensure signature verification succeeds for this test path
    mockVerifyWebhookSignature = spy(() => Promise.resolve(createMockStripeEvent("test.event")));
    mockDeps.verifyWebhookSignature = mockVerifyWebhookSignature;

    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_valid" });
    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);

    assertEquals(res.status, 500);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateSupabaseAdminClient, 0);
    assertSpyCall(mockCreateErrorResponse, 0, { args: ["Supabase admin client initialization failed.", 500] });
  });

  it("should return 500 if event handling fails", async () => {
    const eventError = new Error("Event handler failed.");
    const mockEvent = createMockStripeEvent("checkout.session.completed"); // Use a type that has a handler

    // *** Mock the SPECIFIC handler to reject ***
    const mockSpecificHandler = spy(() => Promise.reject(eventError));
    mockDeps.handleCheckoutSessionCompleted = mockSpecificHandler; // Mock the specific handler in deps

    // Ensure dependencies up to the handler succeed
    mockVerifyWebhookSignature = spy(() => Promise.resolve(mockEvent));
    mockCreateSupabaseAdminClient = spy(() => mockSupabaseInstance as SupabaseClient);
    mockDeps.verifyWebhookSignature = mockVerifyWebhookSignature;
    mockDeps.createSupabaseAdminClient = mockCreateSupabaseAdminClient;

    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_valid" });
    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);

    assertEquals(res.status, 500); // Should catch the handler error
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateSupabaseAdminClient, 0);
    // Assert the SPECIFIC handler was called
    assertSpyCall(mockSpecificHandler, 0);
    // Assert error response with correct message (assuming top-level catch uses error.message)
    // and only message/status args
    assertSpyCall(mockCreateErrorResponse, 0, { args: [eventError.message, 500] });
  });

  // --- Successful Event Handling Tests ---

  it("should successfully process a valid event and return 200", async () => {
    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_valid" });
    const mockEvent = createMockStripeEvent("checkout.session.completed"); // Use a handled type
    const mockSessionData = mockEvent.data.object as Stripe.Checkout.Session; // Extract data for assertion

    // Ensure verify returns the specific event
    mockVerifyWebhookSignature = spy(() => Promise.resolve(mockEvent));
    mockDeps.verifyWebhookSignature = mockVerifyWebhookSignature;

    // Ensure the specific handler mock resolves
    const mockSpecificHandlerSuccess = spy(() => Promise.resolve());
    mockDeps.handleCheckoutSessionCompleted = mockSpecificHandlerSuccess; // Mock the specific handler

    const res = await handleWebhookRequest(req, mockDeps as WebhookDependencies);

    assertEquals(res.status, 200);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateSupabaseAdminClient, 0);
    // Assert the SPECIFIC handler was called with correct args
    assertSpyCall(mockSpecificHandlerSuccess, 0, { args: [
        mockSupabaseInstance as SupabaseClient, 
        mockStripeInstance as Stripe, 
        mockSessionData, // Use extracted data
        mockEvent.id, 
        mockEvent.type
    ] }); 
    // Assert success response was called with NO arguments
    assertSpyCall(mockCreateSuccessResponse, 0, { args: [] }); 
    assertSpyCalls(mockCreateErrorResponse, 0);
  });

  it("should determine test/live mode based on webhook secret used", async () => {
    // Test 1: Using TEST secret -> isTestMode = true
    const testReq = createMockRequest("POST", "{}", { "stripe-signature": "sig_test" });
    // Use a handled event type like product.created to test mode propagation
    const testEvent = createMockStripeEvent("product.created", { id: "prod_test" }, false); // livemode = false
    const testProductData = testEvent.data.object as Stripe.Product;
    mockVerifyWebhookSignature = spy(() => Promise.resolve(testEvent)); 
    mockDeps.verifyWebhookSignature = mockVerifyWebhookSignature;

    // Spy on the specific handler for product.created
    const mockProductCreatedHandler = spy(() => Promise.resolve());
    mockDeps.handleProductCreated = mockProductCreatedHandler;

    await handleWebhookRequest(testReq, mockDeps as WebhookDependencies);
    // Assert the specific handler was called ONCE with isTestMode = true
    assertSpyCall(mockProductCreatedHandler, 0, { args: [
        mockSupabaseInstance as SupabaseClient, 
        mockStripeInstance as Stripe, 
        testProductData, 
        testEvent.id, 
        testEvent.type, 
        true // isTestMode should be true
    ] }); 
    assertSpyCalls(mockProductCreatedHandler, 1); // Ensure it was called exactly once so far
    
    // Test 2: Using LIVE secret -> isTestMode = false
    const liveReq = createMockRequest("POST", "{}", { "stripe-signature": "sig_live" });
    const liveEvent = createMockStripeEvent("product.created", { id: "prod_live" }, true); // livemode = true
    const liveProductData = liveEvent.data.object as Stripe.Product;
    mockVerifyWebhookSignature = spy(() => Promise.resolve(liveEvent)); // Simulate success with live event
    mockDeps.verifyWebhookSignature = mockVerifyWebhookSignature;
    // Ensure the handler spy is the same instance
    mockDeps.handleProductCreated = mockProductCreatedHandler; 

    await handleWebhookRequest(liveReq, mockDeps as WebhookDependencies);
    // Assert the specific handler was called a SECOND time (callIndex 1) with isTestMode = false
    assertSpyCall(mockProductCreatedHandler, 1, { args: [
        mockSupabaseInstance as SupabaseClient, 
        mockStripeInstance as Stripe, 
        liveProductData, 
        liveEvent.id, 
        liveEvent.type, 
        false // isTestMode should be false
    ] }); 
    assertSpyCalls(mockProductCreatedHandler, 2); // Ensure it was called exactly twice in total
  });

});

// --- Helper Functions ---

// Moved createEnvStub to top

// Keep createMockRequest here temporarily until structure is confirmed

// Moved createMockStripeEvent to top

// Helper to create mock Stripe client objects
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