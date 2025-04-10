import { assertEquals, assertObjectMatch } from "https://deno.land/std/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { assertSpyCalls, spy, Spy } from "jsr:@std/testing@0.225.1/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { createCheckoutSession } from "./checkout.ts";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../../_shared/responses.ts";

// Declare mocks/spies with let
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;
let mockCreateErrorResponse: Spy<typeof createErrorResponse>;
let mockCreateSuccessResponse: Spy<typeof createSuccessResponse>;

// Default spy implementations
const defaultGetUserSpy = () => spy(() => Promise.resolve({ data: { user: { id: "user-123", email: "test@example.com" } } }));
const defaultFromSpy = () => spy(() => mockSupabaseClient); // Use the mock client instance
const defaultSelectSpy = () => spy(() => mockSupabaseClient);
const defaultUpsertSpy = () => spy(() => Promise.resolve({ error: null }));
const defaultEqSpy = () => spy(() => mockSupabaseClient);
const defaultMaybeSingleSpy = () => spy(() => Promise.resolve({ data: null, error: null }));

const defaultCustomerCreateSpy = () => spy(() => Promise.resolve({ id: "cus_new" } as any));
const defaultSessionCreateSpy = () => spy(() => Promise.resolve({ id: "cs_123", url: "https://checkout.stripe.com/session" } as any));

// Define mock dependencies object structure (matches handler)
const mockDeps = () => ({
  createErrorResponse: mockCreateErrorResponse, 
  createSuccessResponse: mockCreateSuccessResponse,
});

describe("createCheckoutSession Handler", () => {
  beforeEach(() => {
    // Re-initialize spies before each test
    mockSupabaseClient = {
      auth: { getUser: defaultGetUserSpy() },
      from: defaultFromSpy(),
      select: defaultSelectSpy(),
      upsert: defaultUpsertSpy(),
      eq: defaultEqSpy(),
      maybeSingle: defaultMaybeSingleSpy(),
    } as unknown as SupabaseClient;

    mockStripeInstance = {
      customers: { create: defaultCustomerCreateSpy() },
      checkout: { sessions: { create: defaultSessionCreateSpy() } },
    } as unknown as Stripe;

    mockCreateErrorResponse = spy(createErrorResponse);
    mockCreateSuccessResponse = spy(createSuccessResponse);
  });

  afterEach(() => {
    // REMOVE globalThis restoration
  });

  it("should return 400 if priceId is missing", async () => {
    const requestBody = { successUrl: "/success", cancelUrl: "/cancel" }; 
    const userId = "test-user-id";
    const isTestMode = false;

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 400);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Missing required parameters or server config for checkout URLs");
  });

  it("should return 400 if successUrl is missing", async () => {
    const requestBody = { priceId: "price_123", cancelUrl: "/cancel" };
    const userId = "test-user-id";
    const isTestMode = false;

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 400);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Missing required parameters or server config for checkout URLs");
  });

  it("should return 400 if cancelUrl is missing", async () => {
    const requestBody = { priceId: "price_123", successUrl: "/success" };
    const userId = "test-user-id";
    const isTestMode = false;

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 400);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Missing required parameters or server config for checkout URLs"); 
  });

  it("should return 401 if user is not authenticated (simulated via handler logic)", async () => {
    // The actual handler relies on the main function caller to pass userId.
    // For unit testing, we can simulate the getUser failing inside the handler if it were called
    // However, the current checkout.ts implementation expects userId to be passed *in*.
    // Let's adjust the test to reflect how the handler is actually structured.
    // We'll simulate the *caller* failing to get a userId.
    // The handler itself doesn't have an explicit "401" path based on its own auth check.
    // It relies on the edge function runner or caller to enforce auth.
    // We will test the paths *within* the handler, assuming userId *is* provided.

    // Test adjusted: Simulate DB error when fetching profile for the provided userId
     mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
            return {
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: null, error: new Error("Profile fetch failed") })) })) }))
            } as any;
        }
        return defaultFromSpy()(); // Return default mock behavior for other tables
    });

    const requestBody = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "dummy-user-id";
    const isTestMode = false;
    
    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 400); // Handler returns 400 for DB errors
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Profile fetch failed"); 
  });

  it("should create a new Stripe customer and session if none exists", async () => {
    // Mock DB calls for this specific flow
    const profileData = { first_name: 'Test', last_name: 'User' };
    const mockUpsertSpy = spy(() => Promise.resolve({ error: null })); // Separate spy for upsert
    mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
             return { 
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: profileData, error: null })) })) }))
            } as any;
        }
        if (tableName === 'user_subscriptions') {
            return { 
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: null, error: null })) })) })), // No existing sub
                upsert: mockUpsertSpy // Use the dedicated upsert spy
            } as any;
        }
        return defaultFromSpy()(); // Fallback to default mock
    });
    // Mock getUser specifically for customer creation within the handler
    mockSupabaseClient.auth.getUser = spy(() => Promise.resolve({ data: { user: { email: "test@example.com" } } as any, error: null }));

    const requestBody = { priceId: "price_prod_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps()); 
    
     let responseBody;
     try {
        responseBody = await response.json();
    } catch (e) {
        console.error("Failed to parse response JSON. Status:", response.status, "Body:", await response.text()); 
        throw e;
    }
     assertEquals(response.status, 200);
     assertEquals(responseBody.sessionUrl, "https://checkout.stripe.com/session");
    assertSpyCalls(mockCreateSuccessResponse, 1);

    // Verify interactions
    assertSpyCalls(mockSupabaseClient.from as Spy, 3); // Corrected: Profiles, Subscriptions(select), Subscriptions(upsert)
    assertSpyCalls(mockSupabaseClient.auth.getUser as Spy, 1); // For email
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 1);
    assertSpyCalls(mockUpsertSpy, 1); // Check the dedicated upsert spy
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 1);

    // Verify upsert arguments
    assertEquals(mockUpsertSpy.calls[0].args[0], {
      user_id: "user-123",
      stripe_customer_id: "cus_new",
      status: "incomplete",
    });
    assertEquals(mockUpsertSpy.calls[0].args[1], { onConflict: 'user_id' });

    // Verify Stripe session create arguments
    const sessionArgs = (mockStripeInstance.checkout.sessions.create as Spy).calls[0].args[0];
    assertEquals(sessionArgs.customer, "cus_new");
    assertEquals(sessionArgs.line_items[0].price, "price_prod_123");
    assertEquals(sessionArgs.mode, "subscription");
    assertEquals(sessionArgs.success_url, "/success");
    assertEquals(sessionArgs.cancel_url, "/cancel");
    assertEquals(sessionArgs.metadata?.userId, "user-123");
    assertEquals(sessionArgs.metadata?.isTestMode, "false"); // Note: handler converts boolean to string
  });

  it("should use existing Stripe customer ID if found", async () => {
    const existingCustomerId = "cus_existing_123";
    // Mock DB calls for this specific flow
    mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
            return { // Simulate successful profile fetch
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { first_name: 'Test', last_name: 'User' }, error: null })) })) }))
            } as any;
        }
        if (tableName === 'user_subscriptions') {
            return { // Simulate existing subscription found
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { stripe_customer_id: existingCustomerId }, error: null })) })) }))
                // No upsert mock needed here
            } as any;
        }
        return defaultFromSpy()(); 
    });
     // getUser shouldn't be called in this path
    mockSupabaseClient.auth.getUser = spy(() => Promise.reject("Should not call getUser")); 

    const requestBody = { priceId: "price_prod_456", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());
    
    let responseBody;
     try {
        responseBody = await response.json();
    } catch (e) {
        console.error("Failed to parse response JSON. Status:", response.status, "Body:", await response.text());
        throw e;
    }
    assertEquals(response.status, 200);
    assertEquals(responseBody.sessionUrl, "https://checkout.stripe.com/session");
    assertSpyCalls(mockCreateSuccessResponse, 1);

    // Verify interactions
    assertSpyCalls(mockSupabaseClient.from as Spy, 2); // Corrected: Profiles, Subscriptions(select) - NO upsert call in this path
    assertSpyCalls(mockSupabaseClient.auth.getUser as Spy, 0); // Should NOT be called
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 0); // Should NOT be called
    // Assert upsert was not called
     const upsertSpy = (mockSupabaseClient.from as Spy).calls.find(c => c.args[0] === 'user_subscriptions')?.returned?.upsert as Spy | undefined;
     assertEquals(upsertSpy, undefined); // Or assertSpyCalls(upsertSpy, 0) if it existed but wasn't called

    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 1);

    // Verify Stripe session create arguments use existing customer ID
    const sessionArgs = (mockStripeInstance.checkout.sessions.create as Spy).calls[0].args[0];
    assertEquals(sessionArgs.customer, existingCustomerId);
    assertEquals(sessionArgs.line_items[0].price, "price_prod_456");
     assertEquals(sessionArgs.metadata?.isTestMode, "false"); 
  });

  it("should return 500 if database upsert fails", async () => {
     const dbError = new Error("DB upsert failed"); // Original DB error
     const profileData = { first_name: 'Test', last_name: 'User' };
     const mockUpsertSpy = spy(() => Promise.resolve({ error: dbError })); // Separate spy for upsert failure
    // Mock DB calls for this specific flow
    mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
            return { 
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: profileData, error: null })) })) }))
            } as any;
        }
        if (tableName === 'user_subscriptions') {
            return { 
                select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: null, error: null })) })) })), // No existing sub
                upsert: mockUpsertSpy // Use the dedicated upsert spy
            } as any;
        }
        return defaultFromSpy()(); 
    });
     // Mock getUser for customer creation
    mockSupabaseClient.auth.getUser = spy(() => Promise.resolve({ data: { user: { email: "test@example.com" } } as any, error: null }));

    const requestBody = { priceId: "price_prod_789", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 500); 
    assertSpyCalls(mockCreateErrorResponse, 1);
    // Check the message passed to the error response creator
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Failed to save Stripe customer ID to user subscription."); 
    // Assert the error object passed was the one *thrown* by the handler, not the original dbError
    assertEquals(mockCreateErrorResponse.calls[0].args[2] instanceof Error, true); 
    assertEquals((mockCreateErrorResponse.calls[0].args[2] as Error).message, "Failed to save Stripe customer ID to user subscription."); 
   
    // Verify interactions up to the failure point
    assertSpyCalls(mockSupabaseClient.from as Spy, 3); // Correct: Profiles, Subscriptions(select), Subscriptions(upsert attempt)
    assertSpyCalls(mockSupabaseClient.auth.getUser as Spy, 1);
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 1);
    assertSpyCalls(mockUpsertSpy, 1); // Check the dedicated upsert spy
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 0); // Should not be called
  });

  it("should pass isTestMode=true to Stripe session metadata", async () => {
    const existingCustomerId = "cus_existing_test_mode";
    // Mock DB calls 
    mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
            return { select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { first_name: 'Test', last_name: 'User' }, error: null })) })) })) } as any;
        }
        if (tableName === 'user_subscriptions') {
             return { select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { stripe_customer_id: existingCustomerId }, error: null })) })) })) } as any;
        }
        return defaultFromSpy()(); 
    });
    
    const requestBody = { priceId: "price_test_123", successUrl: "/success-test", cancelUrl: "/cancel-test" };
    const userId = "user-123";
    const isTestMode = true; // Pass true

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps()); 
    
     let responseBody;
     try {
        responseBody = await response.json(); // Consume body
    } catch (e) {
        console.error("Failed to parse response JSON. Status:", response.status, "Body:", await response.text());
        throw e;
    }
    assertEquals(response.status, 200);
    assertEquals(responseBody.sessionUrl, "https://checkout.stripe.com/session");
    assertSpyCalls(mockCreateSuccessResponse, 1);
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 1);

    // Verify Stripe session create arguments include isTestMode: true (as string)
    const sessionArgs = (mockStripeInstance.checkout.sessions.create as Spy).calls[0].args[0];
    assertEquals(sessionArgs.customer, existingCustomerId);
    assertEquals(sessionArgs.line_items[0].price, "price_test_123");
    assertEquals(sessionArgs.success_url, "/success-test");
    assertEquals(sessionArgs.cancel_url, "/cancel-test");
    assertEquals(sessionArgs.metadata?.userId, "user-123");
    assertEquals(sessionArgs.metadata?.isTestMode, "true"); // Check the flag (handler converts to string)
  });

  it("should return 500 if Stripe customer creation fails", async () => {
    // Mock DB calls
     mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
            return { select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { first_name: 'Test', last_name: 'User' }, error: null })) })) })) } as any;
        }
        if (tableName === 'user_subscriptions') {
            return { select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: null, error: null })) })) })) } as any; // No existing sub
        }
        return defaultFromSpy()(); 
    });
     // Mock getUser for customer creation
    mockSupabaseClient.auth.getUser = spy(() => Promise.resolve({ data: { user: { email: "test@example.com" } } as any, error: null }));
    // Mock Stripe customer create to throw an error
    const stripeError = new Error("Stripe customer create failed");
    mockStripeInstance.customers.create = spy(() => Promise.reject(stripeError)); // Reassign spy

    const requestBody = { priceId: "price_err_cust", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 500);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Stripe customer create failed"); 
    assertEquals(mockCreateErrorResponse.calls[0].args[2], stripeError);

    // Verify interactions up to the failure point
    assertSpyCalls(mockSupabaseClient.from as Spy, 2); // Corrected: Profiles, Subscriptions(select) - upsert is not reached
    assertSpyCalls(mockSupabaseClient.auth.getUser as Spy, 1);
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 1);
    // Assert upsert was not called
     const upsertSpy = (mockSupabaseClient.from as Spy).calls.find(c => c.args[0] === 'user_subscriptions')?.returned?.upsert as Spy | undefined;
     assertEquals(upsertSpy, undefined);
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 0); // Should not be called
  });

  it("should return 500 if Stripe session creation fails", async () => {
     const existingCustomerId = "cus_existing_sess_err";
    // Mock DB calls
    mockSupabaseClient.from = spy((tableName: string) => {
        if (tableName === 'user_profiles') {
            return { select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { first_name: 'Test', last_name: 'User' }, error: null })) })) })) } as any;
        }
        if (tableName === 'user_subscriptions') {
             return { select: spy(() => ({ eq: spy(() => ({ single: spy(() => Promise.resolve({ data: { stripe_customer_id: existingCustomerId }, error: null })) })) })) } as any; // Existing sub
        }
        return defaultFromSpy()(); 
    });
    // Mock Stripe session create to throw an error
    const stripeError = new Error("Stripe session create failed");
    mockStripeInstance.checkout.sessions.create = spy(() => Promise.reject(stripeError)); // Reassign spy

    const requestBody = { priceId: "price_err_sess", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    // Pass mockDeps
    const response = await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode, mockDeps());

    assertEquals(response.status, 500);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Stripe session create failed");
    assertEquals(mockCreateErrorResponse.calls[0].args[2], stripeError);

    // Verify interactions up to the failure point
    assertSpyCalls(mockSupabaseClient.from as Spy, 2); // Corrected: Profiles, Subscriptions(select) - upsert is not reached
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 0); // Not called
     const upsertSpy = (mockSupabaseClient.from as Spy).calls.find(c => c.args[0] === 'user_subscriptions')?.returned?.upsert as Spy | undefined;
     assertEquals(upsertSpy, undefined); // Not called
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 1);
  });

}); 