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
import { SupabaseClient, User, AuthError } from "npm:@supabase/supabase-js"; 
import Stripe from "npm:stripe";

import { handleApiSubscriptionsRequest, ApiSubscriptionsDependencies } from "./index.ts";

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
const defaultJsonResponse = (body: any, status: number, headers?: HeadersInit) => 
    new Response(JSON.stringify(body), { status, headers: headers ?? { 'Content-Type': 'application/json' } });

// Default mock for getUser returning success
const defaultMockGetUser = spy(async () => ({
    data: { user: { id: mockUserId } as User },
    error: null,
}));

// Default mock Supabase client with a mockable getUser
const createDefaultMockSupabaseClient = () => ({
    auth: {
        getUser: defaultMockGetUser
    }
} as any);

// Default mock Stripe client
const mockStripeClient = { /* Basic mock */ } as Stripe;

function createMockDeps(overrides: Partial<ApiSubscriptionsDependencies> = {}): ApiSubscriptionsDependencies & { [K in keyof ApiSubscriptionsDependencies]: Spy } {
  // Define the default Supabase client *inside* createMockDeps 
  // so overrides to getUser can be reflected properly.
  let mockSupabaseInstance = createDefaultMockSupabaseClient();
  
  const mocks = {
    handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response("ok", { status: 200 }) : null),
    createUnauthorizedResponse: spy((message: string) => defaultJsonResponse({ error: message }, 401)),
    createErrorResponse: spy(defaultJsonResponse), 
    createSuccessResponse: spy((body: any) => defaultJsonResponse(body, 200)),
    createSupabaseClient: spy(() => mockSupabaseInstance), // Returns the instance
    // Add the getUser dependency mock, pointing to the method on the instance
    getUser: spy((client: SupabaseClient) => client.auth.getUser()), 
    getStripeMode: spy((_data: any) => false), // Default to live mode
    getStripeClient: spy(() => mockStripeClient), // Default client mock
    getPathname: spy((req: Request) => new URL(req.url).pathname.replace(/^\/api-subscriptions/, "")), 
    parseJsonBody: spy((req: Request) => req.json()),
    // Default Handlers 
    getCurrentSubscription: spy(() => Promise.resolve(defaultJsonResponse({ id: mockSubscriptionId, status: 'active' }, 200))),
    getSubscriptionPlans: spy(() => Promise.resolve(defaultJsonResponse([{ id: 'plan_1', name: 'Test Plan' }], 200))),
    createCheckoutSession: spy(() => Promise.resolve(defaultJsonResponse({ sessionId: 'cs_123' }, 200))),
    cancelSubscription: spy(() => Promise.resolve(defaultJsonResponse({ status: 'canceled' }, 200))),
    resumeSubscription: spy(() => Promise.resolve(defaultJsonResponse({ status: 'active' }, 200))),
    createBillingPortalSession: spy(() => Promise.resolve(defaultJsonResponse({ portalUrl: 'https://portal.example.com' }, 200))),
    getUsageMetrics: spy(() => Promise.resolve(defaultJsonResponse({ usage: 100 }, 200))),
  };

  // Apply overrides - Special handling for createSupabaseClient/getUser
  const finalMocks = { ...mocks };
  if (overrides.getUser) {
      // If getUser is overridden, update the mock method on the default client instance
      mockSupabaseInstance.auth.getUser = overrides.getUser;
      // Also override the top-level getUser spy if provided separately
      finalMocks.getUser = spy(overrides.getUser);
  }
  if (overrides.createSupabaseClient) {
      // If createSupabaseClient itself is overridden, use that.
      // Note: This might bypass the specific getUser mock setup above unless handled carefully.
      finalMocks.createSupabaseClient = spy(overrides.createSupabaseClient);
      // We might lose the direct reference to the internal getUser spy here.
  }

  // Apply other overrides
  for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key) && key !== 'getUser' && key !== 'createSupabaseClient') {
          const overrideValue = overrides[key as keyof ApiSubscriptionsDependencies];
          if (typeof overrideValue === 'function' && !(overrideValue as any).isSpy) {
              (finalMocks as any)[key] = spy(overrideValue);
          } else {
              (finalMocks as any)[key] = overrideValue;
          }
      }
  }

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
    assertSpyCalls(mockDeps.createSupabaseClient, 0); // Client creation skipped
    assertSpyCalls(mockDeps.getUser, 0); // Auth skipped
  });

  it("should return 401 if getUser fails (auth error)", async () => {
    setupEnvStub(defaultEnv);
    const authError = new AuthError("Invalid token");
    // Mock getUser to return an error
    const mockGetUserFail = spy(async () => ({ data: { user: null }, error: authError }));
    const mockDeps = createMockDeps({ getUser: mockGetUserFail });
    
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createSupabaseClient, 0); // Client created
    assertSpyCall(mockDeps.getUser, 0); // getUser called
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: [authError.message] });
    assertSpyCalls(mockDeps.getCurrentSubscription, 0); // Handler not called
  });
  
  it("should return 401 if getUser returns no user", async () => {
    setupEnvStub(defaultEnv);
    // Mock getUser to return no user and no error
    const mockGetUserNoUser = spy(async () => ({ data: { user: null }, error: null }));
    const mockDeps = createMockDeps({ getUser: mockGetUserNoUser });
    
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    assertEquals(res.status, 401);
    assertSpyCall(mockDeps.createSupabaseClient, 0);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Authentication failed"] }); // Default message when no error/no user
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
      assertSpyCall(mockCreateClientFail, 0); // createSupabaseClient was called
      assertSpyCalls(mockDeps.getUser, 0); // getUser was NOT called
      assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Internal configuration error", 500] });
  });

  it("should return 500 if Stripe client init fails", async () => {
    setupEnvStub(defaultEnv);
    const stripeError = new Error("Missing Stripe key");
    const mockGetStripeClientFail = spy(() => { throw stripeError; });
    const mockDeps = createMockDeps({ getStripeClient: mockGetStripeClientFail });
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    
    assertEquals(res.status, 500);
    assertSpyCall(mockGetStripeClientFail, 0); 
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Stripe configuration error", 500] });
  });

  // --- Routing Tests ---
  // Assertions now check getUser was called before the handler

  it("GET /current should call getCurrentSubscription", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps(); 
    const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0); // Check auth happened
    assertSpyCall(mockDeps.getCurrentSubscription, 0, { args: [mockDeps.createSupabaseClient(), mockUserId] });
  });

   it("GET /plans should call getSubscriptionPlans", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/api-subscriptions/plans", { method: "GET" });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.getSubscriptionPlans, 0, { args: [mockDeps.createSupabaseClient(), false] });
  });
  
  it("POST /checkout should call createCheckoutSession", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const body = { priceId: 'price_123' };
    const req = new Request("http://example.com/api-subscriptions/checkout", {
         method: "POST",
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body) 
    });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.createCheckoutSession, 0, { args: [mockDeps.createSupabaseClient(), mockStripeClient, mockUserId, body, false] });
  });
  
  it("POST /:id/cancel should call cancelSubscription", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request(`http://example.com/api-subscriptions/${mockSubscriptionId}/cancel`, { method: "POST" });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.cancelSubscription, 0, { args: [mockDeps.createSupabaseClient(), mockStripeClient, mockUserId, mockSubscriptionId] });
  });
  
   it("POST /:id/resume should call resumeSubscription", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request(`http://example.com/api-subscriptions/${mockSubscriptionId}/resume`, { method: "POST" });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.resumeSubscription, 0, { args: [mockDeps.createSupabaseClient(), mockStripeClient, mockUserId, mockSubscriptionId] });
  });
  
  it("POST /billing-portal should call createBillingPortalSession", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const body = { returnUrl: '/' };
     const req = new Request("http://example.com/api-subscriptions/billing-portal", {
         method: "POST",
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body)
     });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.createBillingPortalSession, 0, { args: [mockDeps.createSupabaseClient(), mockStripeClient, mockUserId, body] });
  });
  
  it("GET /usage/:metric should call getUsageMetrics", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const metric = "api_calls";
    const req = new Request(`http://example.com/api-subscriptions/usage/${metric}`, { method: "GET" });
    await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0);
    assertSpyCall(mockDeps.getUsageMetrics, 0, { args: [mockDeps.createSupabaseClient(), mockUserId, metric] });
  });
  
  it("Unknown route should return 404", async () => {
    setupEnvStub(defaultEnv);
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/api-subscriptions/unknown/route", { method: "GET" });
    const res = await handleApiSubscriptionsRequest(req, mockDeps);
    assertSpyCall(mockDeps.getUser, 0); // Auth still checked
    assertEquals(res.status, 404);
    assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Not found", 404] });
  });
  
  it("Should return 400 for invalid JSON body on POST/PUT", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/api-subscriptions/checkout", {
           method: "POST",
           headers: { 'Content-Type': 'application/json' },
           body: "{ invalid json "
      });
      const res = await handleApiSubscriptionsRequest(req, mockDeps);
      assertSpyCall(mockDeps.getUser, 0); // Auth still checked
      assertEquals(res.status, 400);
      assertSpyCall(mockDeps.createErrorResponse, 0, { args: ["Invalid JSON body", 400] });
      assertSpyCalls(mockDeps.createCheckoutSession, 0); // Ensure handler wasn't called
  });
  
   it("Should return 500 if a route handler throws an error", async () => {
      setupEnvStub(defaultEnv);
      const handlerError = new Error("Handler failed unexpectedly");
      const mockHandlerFail = spy(() => { throw handlerError; });
      const mockDeps = createMockDeps({ getCurrentSubscription: mockHandlerFail });
      const req = new Request("http://example.com/api-subscriptions/current", { method: "GET" }); 
      const res = await handleApiSubscriptionsRequest(req, mockDeps);
      assertSpyCall(mockDeps.getUser, 0); // Auth still checked
      assertEquals(res.status, 500);
      assertSpyCall(mockHandlerFail, 0); // Ensure the throwing handler was called
      assertSpyCall(mockDeps.createErrorResponse, 0, { args: [handlerError.message, 500] });
  });

}); 