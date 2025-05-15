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
  assertInstanceOf,
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
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'; // Import SupabaseClient type

import { handleWebhookRequest, WebhookDependencies } from "./index.ts"; // Adjust path as necessary
import { ISupabaseProductWebhookService } from "./services/product_webhook_service.ts";

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
const createMockStripeEvent = (type: Stripe.Event['type'] | string = "checkout.session.completed", data: any = {}, livemode: boolean = false): Stripe.Event => ({
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
  type: type as Stripe.Event['type'],
} as Stripe.Event);

// --- Tests ---

describe("Stripe Webhook Handler", () => {

  // --- Mock Variables (Top Level) ---
  let envStub: Stub | undefined;
  // Declare ALL dependency spies here
  let mockCorsHandler: Spy;
  let mockCreateErrorResponse: Spy;
  let mockCreateSuccessResponse: Spy;
  let mockVerifyWebhookSignature: Spy;
  let mockCreateSupabaseAdminClient: Spy;
  let mockCreateStripeClient: Spy;
  let mockEnvGet: Spy;
  let mockHandleCheckout: Spy;
  let mockHandleSubUpdate: Spy;
  let mockHandleSubDelete: Spy;
  let mockHandleInvoiceSuccess: Spy;
  let mockHandleInvoiceFail: Spy;
  type ProductCreatedArgs = [ISupabaseProductWebhookService, Stripe, Stripe.Product, string, string, boolean];
  let mockHandleProductCreate: Spy<unknown, ProductCreatedArgs, Promise<void>>;
  let mockHandleProductUpdate: Spy;
  let mockHandlePriceChange: Spy;
  // Mock instances needed for handlers
  let mockStripeInstance: Partial<Stripe> = {};
  let mockSupabaseInstance: Partial<SupabaseClient> = {};

  beforeEach(() => {
    // --- Setup Environment Stub ---
    if (envStub) { try { envStub.restore(); } catch (_) {} }
    envStub = createEnvStub(defaultEnv);

    // --- Initialize ALL Spies with Default Implementations ---
    mockCorsHandler = spy((req: Request): Response | null => req.method === 'OPTIONS' ? new Response(null, { status: 204 }) : null);
    mockCreateErrorResponse = spy((message: string, status: number) => new Response(JSON.stringify({ error: message }), { status }));
    mockCreateSuccessResponse = spy(() => new Response(JSON.stringify({ received: true }), { status: 200 }));
    mockVerifyWebhookSignature = spy(() => Promise.resolve(createMockStripeEvent("test.event")));
    mockCreateSupabaseAdminClient = spy(() => mockSupabaseInstance as SupabaseClient);
    mockCreateStripeClient = spy(() => mockStripeInstance as Stripe);
    mockEnvGet = spy((key: string) => Deno.env.get(key));
    mockHandleCheckout = spy(() => Promise.resolve());
    mockHandleSubUpdate = spy(() => Promise.resolve());
    mockHandleSubDelete = spy(() => Promise.resolve());
    mockHandleInvoiceSuccess = spy(() => Promise.resolve());
    mockHandleInvoiceFail = spy(() => Promise.resolve());
    mockHandleProductCreate = spy<unknown, ProductCreatedArgs, Promise<void>>(() => Promise.resolve());
    mockHandleProductUpdate = spy(() => Promise.resolve());
    mockHandlePriceChange = spy(() => Promise.resolve());

    // Initialize mock instances
    mockSupabaseInstance = { functions: { invoke: spy() } } as unknown as SupabaseClient;
    mockStripeInstance = { webhooks: { constructEventAsync: spy() } } as unknown as Stripe;
    
    // --- REMOVE mockDeps creation from here ---
  });

  afterEach(() => {
    // Restore the environment stub
    if (envStub) { try { envStub.restore(); } catch (_) {} envStub = undefined; }
  });

  // --- Basic Request Handling Tests ---

  it("should handle CORS preflight requests", async () => {
    const req = createMockRequest("OPTIONS", null, { Origin: "http://localhost:3000" });
    // --- Build mockDeps manually for this test ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        verifyWebhookSignature: mockVerifyWebhookSignature,
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 204);
    assertSpyCall(mockCorsHandler!, 0);
  });

  it("should return 405 for non-POST requests", async () => {
    const req = createMockRequest("GET", null, {});
    // --- Build mockDeps manually ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        verifyWebhookSignature: mockVerifyWebhookSignature,
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 405);
    assertSpyCall(mockCreateErrorResponse, 0, { args: ["Method not allowed", 405] });
    assertSpyCalls(mockVerifyWebhookSignature, 0);
  });

  it("should return 400 if stripe-signature header is missing", async () => {
    const req = createMockRequest("POST", JSON.stringify({ type: "test.event" }), { "Content-Type": "application/json" });
    // --- Build mockDeps manually ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        verifyWebhookSignature: mockVerifyWebhookSignature,
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 400);
    assertSpyCall(mockCreateErrorResponse, 0, { args: ["Missing Stripe signature", 400] });
    assertSpyCalls(mockVerifyWebhookSignature, 0);
  });

  // --- Dependency Failure Tests ---

  it("should return 400 if signature verification fails", async () => {
    const verifyError = new Error("Webhook signature verification failed.");
    mockVerifyWebhookSignature = spy(() => Promise.reject(verifyError));
    // --- Build mockDeps manually ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        // Use reconfigured spy
        verifyWebhookSignature: mockVerifyWebhookSignature, 
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_invalid" });
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 400);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateErrorResponse, 0, { args: [verifyError.message, 400] });
  });

  it("should return 500 if Supabase client initialization fails", async () => {
    const supabaseError = new Error("Failed to initialize Supabase client.");
    mockCreateSupabaseAdminClient = spy(() => { throw supabaseError; });
    // --- Build mockDeps manually ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        verifyWebhookSignature: mockVerifyWebhookSignature,
        // Use reconfigured spy
        createSupabaseAdminClient: mockCreateSupabaseAdminClient, 
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_valid" });
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 500);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateSupabaseAdminClient, 0);
    assertSpyCall(mockCreateErrorResponse, 0, { args: [supabaseError.message, 500] });
  });

  it("should return 500 if event handling fails", async () => {
    const eventError = new Error("Event handler failed.");
    const mockEvent = createMockStripeEvent("checkout.session.completed"); 
    const mockSpecificHandler = spy(() => Promise.reject(eventError));
    mockVerifyWebhookSignature = spy(() => Promise.resolve(mockEvent));
    mockHandleCheckout = mockSpecificHandler;
    // --- Build mockDeps manually ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        // Use reconfigured spies
        verifyWebhookSignature: mockVerifyWebhookSignature, 
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout, 
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_valid" });
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 500);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateSupabaseAdminClient, 0);
    assertSpyCall(mockSpecificHandler, 0); 
    assertSpyCall(mockCreateErrorResponse, 0, { args: [eventError.message, 500] });
  });

  // --- Successful Event Handling Tests ---

  it("should successfully process a valid event and return 200", async () => {
    const req = createMockRequest("POST", "{}", { "stripe-signature": "mock_sig_valid" });
    const mockEvent = createMockStripeEvent("checkout.session.completed"); 
    const mockSessionData = mockEvent.data?.object as Stripe.Checkout.Session; 
    assertExists(mockEvent.data);
    const mockSpecificHandlerSuccess = spy(() => Promise.resolve());
    mockVerifyWebhookSignature = spy(() => Promise.resolve(mockEvent));
    mockHandleCheckout = mockSpecificHandlerSuccess;
    // --- Build mockDeps manually ---
    const mockDeps: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        // Use reconfigured spies
        verifyWebhookSignature: mockVerifyWebhookSignature, 
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout, 
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    const res = await handleWebhookRequest(req, mockDeps);
    assertEquals(res.status, 200);
    assertSpyCall(mockVerifyWebhookSignature, 0);
    assertSpyCall(mockCreateSupabaseAdminClient, 0);
    // Adjust expected args based on actual handler signature
    assertSpyCall(mockSpecificHandlerSuccess, 0, { args: [
        mockSupabaseInstance, 
        mockStripeInstance, 
        mockSessionData, 
        mockEvent.id, 
        mockEvent.type
    ] }); 
    assertSpyCall(mockCreateSuccessResponse, 0, { args: [] }); 
    assertSpyCalls(mockCreateErrorResponse, 0);
    // Restore spy (optional, beforeEach handles it)
    // mockHandleCheckout = spy(() => Promise.resolve());
  });

  it("should determine test/live mode based on webhook secret used", async () => {
    // Test 1: Using TEST secret -> isTestMode = true
    const testReq = createMockRequest("POST", "{}", { "stripe-signature": "sig_test" });
    const testEvent = createMockStripeEvent("product.created", { id: "prod_test" }, false);
    assertExists(testEvent.data);
    mockVerifyWebhookSignature = spy(() => Promise.resolve(testEvent)); 
    // --- Build mockDeps manually for Test 1 ---
    const mockDepsTest1: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        verifyWebhookSignature: mockVerifyWebhookSignature,
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        handleProductCreated: mockHandleProductCreate,
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    await handleWebhookRequest(testReq, mockDepsTest1);
    assertSpyCall(mockHandleProductCreate, 0); 
    assertEquals(mockHandleProductCreate.calls[0].args[5], true);
    assertSpyCalls(mockHandleProductCreate, 1); 
    
    // Test 2: Using LIVE secret -> isTestMode = false
    const liveReq = createMockRequest("POST", "{}", { "stripe-signature": "sig_live" });
    const liveEvent = createMockStripeEvent("product.created", { id: "prod_live" }, true); 
    assertExists(liveEvent.data);
    mockVerifyWebhookSignature = spy(() => Promise.resolve(liveEvent)); 
    // --- Build mockDeps manually for Test 2 ---
    // Use the same top-level spy instances, but verifyWebhookSignature has been updated
    const mockDepsTest2: WebhookDependencies = { 
        envGet: mockEnvGet,
        createStripeClient: mockCreateStripeClient,
        // Use the updated verify spy for Test 2
        verifyWebhookSignature: mockVerifyWebhookSignature, 
        createSupabaseAdminClient: mockCreateSupabaseAdminClient,
        handleCorsPreflightRequest: mockCorsHandler,
        createErrorResponse: mockCreateErrorResponse,
        createSuccessResponse: mockCreateSuccessResponse,
        handleCheckoutSessionCompleted: mockHandleCheckout,
        handleSubscriptionUpdated: mockHandleSubUpdate,
        handleSubscriptionDeleted: mockHandleSubDelete,
        handleInvoicePaymentSucceeded: mockHandleInvoiceSuccess,
        handleInvoicePaymentFailed: mockHandleInvoiceFail,
        // Use the same product create handler spy instance
        handleProductCreated: mockHandleProductCreate, 
        handleProductUpdated: mockHandleProductUpdate,
        handlePriceChange: mockHandlePriceChange,
    }; 
    await handleWebhookRequest(liveReq, mockDepsTest2);
    assertSpyCall(mockHandleProductCreate, 1); 
    assertEquals(mockHandleProductCreate.calls[1].args[5], false);
    assertSpyCalls(mockHandleProductCreate, 2);
  });

});
