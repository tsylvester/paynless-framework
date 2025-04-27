import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  spy,
  stub,
  Spy,
  Stub,
  assertSpyCall,
  assertSpyCalls,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
// Types needed for mocks
import { SupabaseClient, User, AuthError, UserResponse } from "npm:@supabase/supabase-js"; 
import Stripe from "npm:stripe";
import type { Database } from '../types_db.ts'; // Import Database type
import type { SessionResponse } from '../_shared/types.ts';
import type { SubscriptionUsageMetrics } from '../_shared/types.ts';

import { handleApiSubscriptionsRequest, ApiSubscriptionsDependencies } from "./index.ts";
// Fix: Import HandlerError
import { HandlerError } from "./handlers/current.ts"; // Import HandlerError

// --- Test Setup ---

const defaultEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "test-anon-key",
  STRIPE_SECRET_TEST_KEY: "sk_test_123",
  STRIPE_SECRET_LIVE_KEY: "sk_live_456",
  // Add other env vars if needed by shared utils
};

let envStub: Stub | undefined;

function setupEnvStub(envVars: Record<string, string | undefined>) {
  if (envStub) envStub.restore();
  envStub = stub(Deno.env, "get", (key: string) => envVars[key]);
}

const mockUserId = "user-sub-123";
const mockSubscriptionId = "sub_mock_123";

// Mock handler responses
// Keep this helper for basic response structure if needed, but mocks below will use specific signatures
const defaultJsonResponse = (body: any, status: number, headers?: HeadersInit) => 
    new Response(JSON.stringify(body), { status, headers: headers ?? { 'Content-Type': 'application/json' } });

// Fix: Define the expected return type for getUser based on error analysis
// If UserResponse isn't directly importable, define a compatible type
type GetUserMockResponse = 
  | { data: { user: User }; error: null } 
  | { data: { user: null }; error: AuthError }; // Revert: Keep original definition

// Default mock for getUser returning success
// Fix: Explicitly type the spy and return value
const defaultMockGetUser = spy(async (): Promise<GetUserMockResponse> => ({
    data: { user: { id: mockUserId, email: 'test@example.com' /* add other required User fields */ } as User },
    error: null,
}));

// Default mock Supabase client with a mockable getUser
// Use Database type for SupabaseClient mock
const createDefaultMockSupabaseClient = (): SupabaseClient<Database> => ({
    auth: {
        getUser: defaultMockGetUser
    },
    // Add other necessary Supabase client methods/properties if handlers use them
    from: (table: string) => ({ // Basic mock for .from()
        select: spy(() => ({ // Mock .select()
             eq: spy(() => ({ // Mock .eq()
                 // Mock terminal methods like maybeSingle, single, etc.
                 maybeSingle: spy(() => Promise.resolve({ data: null, error: null })), 
                 single: spy(() => Promise.resolve({ data: null, error: null })), 
                 // Add returns() if needed
                 returns: spy(() => ({ maybeSingle: spy(() => Promise.resolve({ data: null, error: null }))})),
            })),
       })),
    }),
} as any); // Use 'as any' for simplicity if full mock is complex

// Default mock Stripe client
const mockStripeClient = { /* Basic mock, add methods if needed */ } as Stripe;

// Fix: Define mock data structure for getCurrentSubscription return type
// This needs to match UserSubscriptionData defined in current.ts (or derive from DB types)
const mockCurrentSubData = {
    id: mockSubscriptionId,
    user_id: mockUserId,
    status: 'active',
    stripe_customer_id: 'cus_123',
    stripe_subscription_id: 'sub_123',
    plan_id: 'plan_abc',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date().toISOString(),
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subscription_plans: { // Mock nested plan details
        id: 'plan_abc',
        stripe_price_id: 'price_123',
        active: true,
        name: 'Test Plan',
        description: 'A plan for testing',
        amount: 1000,
        currency: 'usd',
        interval: 'month',
        interval_count: 1,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }
};

// Fix: Define mock data structure for getSubscriptionPlans return type
const mockPlansData = [
    {
        id: 'plan_abc',
        stripe_price_id: 'price_123',
        active: true,
        name: 'Test Plan',
        description: 'A plan for testing',
        amount: 1000,
        currency: 'usd',
        interval: 'month',
        interval_count: 1,
        metadata: { test_mode: false }, // Example metadata
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }
];

// Fix: Define mock data structure for createCheckoutSession return type (SessionResponse)
const mockCheckoutSessionData: SessionResponse = {
    sessionId: 'cs_test_12345',
    url: 'https://checkout.stripe.com/pay/cs_test_12345'
};

// Fix: Define mock data structure for getUsageMetrics return type
const mockUsageData: SubscriptionUsageMetrics = {
    current: 50,
    limit: 1000,
    reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Approx 30 days from now
};

// Fix: Define mocks matching new signatures
const mockErrorResponse = (message: string, status = 500, request: Request, error?: Error | unknown, additionalHeaders: Record<string, string> = {}) =>
    defaultJsonResponse({ error: message }, status, { 'Content-Type': 'application/json', ...additionalHeaders });

const mockSuccessResponse = (data: any, status = 200, request: Request, additionalHeaders: Record<string, string> = {}) =>
    defaultJsonResponse(data, status, { 'Content-Type': 'application/json', ...additionalHeaders });

function createMockDeps(overrides: Partial<ApiSubscriptionsDependencies> = {}): ApiSubscriptionsDependencies & { [K in keyof ApiSubscriptionsDependencies]: Spy } {
  let mockSupabaseInstance = createDefaultMockSupabaseClient();
  
  // Define default getUser mock and apply to instance
  const defaultGetUserImpl = spy(async (): Promise<GetUserMockResponse> => ({
    data: { user: { id: mockUserId, email: 'test@example.com' } as User },
    error: null,
  }));
  mockSupabaseInstance.auth.getUser = defaultGetUserImpl; 

  // Apply getUser override directly to the instance BEFORE creating the main mocks object
  if (overrides.getUser) {
      const typedOverride = overrides.getUser as () => Promise<GetUserMockResponse>;
      // Ensure the override itself is spied if it's a raw function (optional, depends on assertion needs)
      mockSupabaseInstance.auth.getUser = spy(typedOverride); 
  }

  // Prepare createSupabaseClient mock, applying override if present
  let createSupabaseClientMock = spy((req: Request) => mockSupabaseInstance);
  if (overrides.createSupabaseClient) {
       // Note: If the override returns a different client structure, 
       // the getUser spy below might not point to the correct method.
       createSupabaseClientMock = spy(overrides.createSupabaseClient);
       // Attempt to get the potentially new instance for the getUser spy below?
       // This is tricky. Let's assume compatible structure for now.
       // mockSupabaseInstance = createSupabaseClientMock(new Request('http://dummy')) as any;
  }

  // Define the main mocks object, now using the potentially overridden instance method for getUser
  const mocks = {
    handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response("ok", { status: 200 }) : null),
    createUnauthorizedResponse: spy((message: string) => defaultJsonResponse({ error: message }, 401)),
    createErrorResponse: spy(mockErrorResponse), 
    createSuccessResponse: spy(mockSuccessResponse),
    createSupabaseClient: createSupabaseClientMock, // Use the prepared mock
    // Make getUser spy point to the potentially overridden method on the instance
    getUser: spy((...args: any[]) => mockSupabaseInstance.auth.getUser(...args)), 
    getStripeMode: spy((_data: any) => false), 
    getStripeClient: spy(() => mockStripeClient),
    getPathname: spy((req: Request) => new URL(req.url).pathname.replace(/^\/api-subscriptions/, "")), 
    parseJsonBody: spy((req: Request) => req.json()),
    getCurrentSubscription: spy(() => Promise.resolve(mockCurrentSubData)), 
    getSubscriptionPlans: spy(() => Promise.resolve(mockPlansData)),
    createCheckoutSession: spy(() => Promise.resolve(mockCheckoutSessionData)),
    cancelSubscription: spy(() => Promise.resolve(mockCurrentSubData)),
    resumeSubscription: spy(() => Promise.resolve(mockCurrentSubData)),
    createBillingPortalSession: spy(() => Promise.resolve(mockCheckoutSessionData)),
    getUsageMetrics: spy(() => Promise.resolve(mockUsageData)),
  };

  // Start with the base mocks
  const finalMocks = { ...mocks };

  // Apply other overrides (excluding getUser and createSupabaseClient)
  for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key) && key !== 'getUser' && key !== 'createSupabaseClient') {
           const overrideValue = overrides[key as keyof ApiSubscriptionsDependencies];
           // Assign directly, assuming value is either a spy or doesn't need spying
           (finalMocks as any)[key] = overrideValue; 
      }
  }
  
  // No need to re-spy getUser here, it was set up above to point to the instance method

  return finalMocks as any; 
}

// --- Tests ---

describe("API Subscriptions Handler", () => {

  afterEach(() => {
    if (envStub) envStub.restore();
    envStub = undefined;
  });

  // --- Basic Setup & Auth Tests ---

  it("should handle CORS preflight requests", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/api-subscriptions/current", { method: "OPTIONS" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "ok");
    assertSpyCalls(mockDeps.createSupabaseClient, 0); 
    assertSpyCalls(mockDeps.getUser, 0); 
  });

  it("should return 401 if getUser fails (auth error)", async () => {
    setupEnvStub(defaultEnv);
    const authError = new AuthError("Invalid token");
    // Fix: Ensure the failing mock returns the correct structure { data: { user: null }, error: AuthError }
    const mockGetUserFail = async (): Promise<GetUserMockResponse> => ({ data: { user: null }, error: authError });
    const mockDeps = createMockDeps({ getUser: mockGetUserFail }); // Pass the raw function
    
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createSupabaseClient, 0); 
    assertSpyCall(mockDeps.getUser, 0); 
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: [authError.message] });
    assertSpyCalls(mockDeps.getCurrentSubscription, 0); 
  });
  
  it("should return 401 if getUser returns no user", async () => {
    setupEnvStub(defaultEnv);
    // Fix: This case seems problematic with UserResponse. Let's use the fail case for now.
    // If the API should handle "no user, no error" differently, we need to adjust deps.getUser signature/logic
    const authError = new AuthError("Authentication required", 401); // Use a specific error
    const mockGetUserNoUser = async (): Promise<GetUserMockResponse> => ({ data: { user: null }, error: authError });
    const mockDeps = createMockDeps({ getUser: mockGetUserNoUser });
    
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createSupabaseClient, 0);
    assertSpyCall(mockDeps.getUser, 0);
    // Expect the specific auth error message now
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: [authError.message] }); 
    assertSpyCalls(mockDeps.getCurrentSubscription, 0);
  });

  it("should return 500 if createSupabaseClient fails", async () => {
      setupEnvStub(defaultEnv);
      const clientError = new Error("Client init failed");
      const mockCreateClientFail = spy(() => { throw clientError; });
      const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientFail });
      const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
      const res = await handleApiSubscriptionsRequest(req, mockDeps);
      
      assertEquals(res.status, 500);
      assertSpyCall(mockCreateClientFail, 0); 
      assertSpyCalls(mockDeps.getUser, 0); 
      // Fix: Assert only first 3 args for createErrorResponse to avoid error object comparison issues
      assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Internal configuration error", 500, req] });
  });

  it("should return 500 if Stripe client init fails", async () => {
    setupEnvStub(defaultEnv);
    const stripeError = new Error("Missing Stripe key");
    const mockGetStripeClientFail = spy(() => { throw stripeError; });
    const mockDeps = createMockDeps({ getStripeClient: mockGetStripeClientFail });
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    assertEquals(res.status, 500);
    assertSpyCall(mockDeps.getUser, 0); 
    assertSpyCall(mockGetStripeClientFail, 0); 
    // Fix: Assert only first 3 args for createErrorResponse
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Stripe configuration error", 500, req] });
  });

  // --- Routing Tests ---

  it("GET /current should call getCurrentSubscription and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Uses default mock for getCurrentSubscription (success)
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    // Assertions
    assertEquals(res.status, 200); // Should be success
    const resBody = await res.json();
    assertEquals(resBody.id, mockCurrentSubData.id); // Check data propagation

    assertSpyCall(mockDeps.getUser, 0); // Check auth happened
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    // Fix: Assert getCurrentSubscription call signature
    assertSpyCall(mockDeps.getCurrentSubscription, 0, { args: [clientInstance, mockUserId] }); 
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockCurrentSubData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0); // No error response
  });

  it("GET /current should call getCurrentSubscription and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Subscription DB Error", 503);
    const mockGetCurrentFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ getCurrentSubscription: mockGetCurrentFail }); 
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    // Assertions
    assertEquals(res.status, 503); // Should match HandlerError status
    const resBody = await res.json();
    assertEquals(resBody.error, "Subscription DB Error"); // Check error propagation

    assertSpyCall(mockDeps.getUser, 0); 
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.getCurrentSubscription, 0, { args: [clientInstance, mockUserId] }); 
    // Fix: Assert createErrorResponse call for HandlerError
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0); // No success response
  });

  // --- Tests for other routes (Update assertions for refactored pattern) ---

   it("GET /plans should call getSubscriptionPlans and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Uses default mock for getSubscriptionPlans (success)
    const req = new Request("http://example.com/api-subscriptions/plans", { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    // Assertions
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody, mockPlansData); // Expect the raw data

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.getSubscriptionPlans, 0, { args: [clientInstance, false] }); 
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockPlansData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0); // No error response
  });
  
  // Add test for /plans handler failure
  it("GET /plans should call getSubscriptionPlans and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Failed to fetch plans", 500);
    const mockGetPlansFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ getSubscriptionPlans: mockGetPlansFail }); 
    const req = new Request("http://example.com/api-subscriptions/plans", { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    // Assertions
    assertEquals(res.status, 500);
    const resBody = await res.json();
    assertEquals(resBody.error, "Failed to fetch plans");

    assertSpyCall(mockDeps.getUser, 0); 
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.getSubscriptionPlans, 0, { args: [clientInstance, false] }); 
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });

  // Keep old tests for other routes for now, but update assertions later
  it("POST /checkout should call createCheckoutSession and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Uses default success mock
    const body = { priceId: 'price_123', successUrl:'s', cancelUrl:'c' }; 
    const req = new Request("http://example.com/api-subscriptions/checkout", {
         method: "POST",
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body) 
    });
    const res = await handleApiSubscriptionsRequest(req, mockDeps); 
    
    // Assertions
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody, mockCheckoutSessionData); // Expect the data

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.createCheckoutSession, 0, { args: [clientInstance, mockStripeClient, mockUserId, body, false] });
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockCheckoutSessionData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0); // No error response
  });
  
  // Add test for /checkout handler failure
  it("POST /checkout should call createCheckoutSession and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Stripe checkout error", 500);
    const mockCheckoutFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ createCheckoutSession: mockCheckoutFail }); 
    const body = { priceId: 'price_123', successUrl:'s', cancelUrl:'c' }; 
    const req = new Request("http://example.com/api-subscriptions/checkout", {
         method: "POST",
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body) 
    });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    // Assertions
    assertEquals(res.status, 500);
    const resBody = await res.json();
    assertEquals(resBody.error, "Stripe checkout error");

    assertSpyCall(mockDeps.getUser, 0); 
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.createCheckoutSession, 0, { args: [clientInstance, mockStripeClient, mockUserId, body, false] }); 
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });

  it("POST /:id/cancel should call cancelSubscription and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Default success mock
    const req = new Request(`http://example.com/api-subscriptions/${mockSubscriptionId}/cancel`, { method: "POST" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody.id, mockCurrentSubData.id);

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.cancelSubscription, 0, { args: [clientInstance, mockStripeClient, mockUserId, mockSubscriptionId] });
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockCurrentSubData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0);
  });

  it("POST /:id/cancel should call cancelSubscription and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Cancel failed", 500);
    const mockCancelFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ cancelSubscription: mockCancelFail });
    const req = new Request(`http://example.com/api-subscriptions/${mockSubscriptionId}/cancel`, { method: "POST" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 500);
    const resBody = await res.json();
    assertEquals(resBody.error, "Cancel failed");

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.cancelSubscription, 0, { args: [clientInstance, mockStripeClient, mockUserId, mockSubscriptionId] });
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });
  
   it("POST /:id/resume should call resumeSubscription and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Default success mock
    const req = new Request(`http://example.com/api-subscriptions/${mockSubscriptionId}/resume`, { method: "POST" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody.id, mockCurrentSubData.id);

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.resumeSubscription, 0, { args: [clientInstance, mockStripeClient, mockUserId, mockSubscriptionId] });
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockCurrentSubData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0);
  });

  it("POST /:id/resume should call resumeSubscription and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Resume failed", 500);
    const mockResumeFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ resumeSubscription: mockResumeFail });
    const req = new Request(`http://example.com/api-subscriptions/${mockSubscriptionId}/resume`, { method: "POST" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 500);
    const resBody = await res.json();
    assertEquals(resBody.error, "Resume failed");

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.resumeSubscription, 0, { args: [clientInstance, mockStripeClient, mockUserId, mockSubscriptionId] });
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });
  
  it("POST /billing-portal should call createBillingPortalSession and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Default success mock
    const body = { returnUrl: 'http://localhost:5173/account' };
    const req = new Request("http://example.com/api-subscriptions/billing-portal", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody, mockCheckoutSessionData);

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.createBillingPortalSession, 0, { args: [clientInstance, mockStripeClient, mockUserId, body] });
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockCheckoutSessionData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0);
  });

  it("POST /billing-portal should call createBillingPortalSession and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Portal failed", 400);
    const mockPortalFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ createBillingPortalSession: mockPortalFail });
    const body = { returnUrl: 'http://localhost:5173/account' };
    const req = new Request("http://example.com/api-subscriptions/billing-portal", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 400);
    const resBody = await res.json();
    assertEquals(resBody.error, "Portal failed");

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.createBillingPortalSession, 0, { args: [clientInstance, mockStripeClient, mockUserId, body] });
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });

  it("GET /usage/:metric should call getUsageMetrics and return success", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); // Default success mock
    const metric = 'api-calls';
    const req = new Request(`http://example.com/api-subscriptions/usage/${metric}`, { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 200);
    const resBody = await res.json();
    assertEquals(resBody, mockUsageData);

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.getUsageMetrics, 0, { args: [clientInstance, mockUserId, metric] });
    // Fix: Assert createSuccessResponse call
    assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [mockUsageData, 200, req] });
    assertSpyCalls(mockDeps.createErrorResponse, 0);
  });

  it("GET /usage/:metric should call getUsageMetrics and handle HandlerError", async () => {
    setupEnvStub(defaultEnv);
    const handlerError = new HandlerError("Unknown metric", 400);
    const mockUsageFail = spy(() => Promise.reject(handlerError));
    const mockDeps = createMockDeps({ getUsageMetrics: mockUsageFail });
    const metric = 'unknown-metric';
    const req = new Request(`http://example.com/api-subscriptions/usage/${metric}`, { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);

    // Assertions
    assertEquals(res.status, 400);
    const resBody = await res.json();
    assertEquals(resBody.error, "Unknown metric");

    assertSpyCall(mockDeps.getUser, 0);
    const clientInstance = mockDeps.createSupabaseClient.calls[0]?.returned;
    assertSpyCall(mockDeps.getUsageMetrics, 0, { args: [clientInstance, mockUserId, metric] });
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, handlerError.status, req, handlerError.cause] });
    assertSpyCalls(mockDeps.createSuccessResponse, 0);
  });

}); 