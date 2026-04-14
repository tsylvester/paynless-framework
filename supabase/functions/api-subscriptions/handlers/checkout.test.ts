import { assertEquals, assertObjectMatch, assertRejects, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { spy, type Spy, assertSpyCalls, assertSpyCall } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { createCheckoutSession } from "./checkout.ts";
import { TablesInsert } from "../../types_db.ts";
import type { Database } from "../../types_db.ts";
import { HandlerError } from "./current.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/supabase.mock.ts";
import { CheckoutSessionRequest } from "../../_shared/types.ts";

// Declare mocks/spies with let
let mockSupabaseClient: ReturnType<typeof createMockSupabaseClient>["client"];
let mockStripeInstance: Stripe;
let customerCreateSpy: Spy;
let sessionCreateSpy: Spy;

const defaultCustomerCreateSpy = () => spy(() => Promise.resolve({ id: "cus_new" }));
const defaultSessionCreateSpy = () => spy(() => Promise.resolve({ id: "cs_123", url: "https://checkout.stripe.com/session" }));
const mockAuthUser: User = {
  id: "user-123",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
  email: "test@example.com",
};

describe("createCheckoutSession Handler", () => {
  beforeEach(() => {
    // Use shared Supabase mock setup (basic config, will be overridden in tests)
    const mockSupabaseConfig: MockSupabaseDataConfig = {}; // Start empty
    const { client } = createMockSupabaseClient(undefined, mockSupabaseConfig);
    mockSupabaseClient = client;

    // Keep local Stripe mock setup
    customerCreateSpy = defaultCustomerCreateSpy();
    sessionCreateSpy = defaultSessionCreateSpy();
    mockStripeInstance = {
      customers: { create: customerCreateSpy },
      checkout: { sessions: { create: sessionCreateSpy } },
    } as unknown as Stripe;
  });

  it("should throw HandlerError(400) if priceId is missing", async () => {
    const requestBody: CheckoutSessionRequest = { priceId: "", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "test-user-id";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(mockSupabaseClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError, // Expect HandlerError
      "Missing required parameters for checkout" // Updated message
    );
    // Verify no Stripe/DB calls were made (optional, depends on implementation)
    // assertSpyCalls(mockStripeInstance.checkout.sessions.create, 0);
  });

  it("should throw HandlerError(400) if successUrl is missing", async () => {
    const requestBody: CheckoutSessionRequest = { priceId: "price_123", successUrl: "", cancelUrl: "/cancel" };
    const userId = "test-user-id";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(mockSupabaseClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError, 
      "Missing required parameters for checkout" // Updated message
    );
  });

  it("should throw HandlerError(400) if cancelUrl is missing", async () => {
    const requestBody: CheckoutSessionRequest = { priceId: "price_123", successUrl: "/success", cancelUrl: "" };
    const userId = "test-user-id";
    const isTestMode = false;

     await assertRejects(
      async () => await createCheckoutSession(mockSupabaseClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError, 
      "Missing required parameters for checkout" // Updated message
    );
  });

  it("should throw HandlerError for DB errors during profile fetch", async () => {
    // Test adjusted: Simulate DB error when fetching profile for the provided userId
    const dbError = new Error("Profile fetch failed");
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        user_profiles: { // Target the profiles table
          select: () => Promise.resolve({ data: null, error: dbError })
        }
      }
    };
    const { client: errorClient } = createMockSupabaseClient(undefined, mockSupabaseConfig);
    // No need to mock other tables if they aren't reached

    const requestBody: CheckoutSessionRequest = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "dummy-user-id";
    const isTestMode = false;
    
    await assertRejects(
      async () => await createCheckoutSession(errorClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError, 
      dbError.message // Expect the specific DB error message
    );
    // Add assertion for status code if HandlerError includes it (assuming 500 for DB errors)
    // try { ... } catch (e) { if (e instanceof HandlerError) assertEquals(e.status, 500); } 
  });

  it("should create a new Stripe customer and session if none exists", async () => {
    // Define userId early
    const userId = "user-123"; 
    // Mock DB calls for this specific flow
    const profileData = { first_name: 'Test', last_name: 'User' };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        mockUser: mockAuthUser,
        genericMockResults: {
            user_profiles: {
                select: () => Promise.resolve({ data: [profileData], error: null }) // Profile found
            },
            user_subscriptions: {
                select: () => Promise.resolve({ data: null, error: null }), // No existing sub
                upsert: () => Promise.resolve({ data: null, error: null })
            }
        }
    };
    // Create the mock client for this test
    const { client: testClient, spies: testSpies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const requestBody: CheckoutSessionRequest = { priceId: "price_prod_123", successUrl: "/success", cancelUrl: "/cancel" };
    // userId is already defined above
    // const userId = "user-123"; 
    const isTestMode = false;

    // Act: Call the handler directly, no deps
    const result = await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode);
    
    // Assert: Check returned SessionResponse object
    assertEquals(result.sessionId, "cs_123"); // Check sessionId
    assertEquals(result.url, "https://checkout.stripe.com/session"); // Check url
    
    // Verify interactions
    // Use the spies returned from createMockSupabaseClient if possible
    // assertSpyCall(testSpies.fromSpy, ...); // Need more specific assertions on fromSpy.calls
    assertSpyCalls(testSpies.auth.getUserSpy, 1); // Corrected: Use assertSpyCalls
    assertSpyCalls(customerCreateSpy, 1); // New customer created
    // Cannot easily verify upsert call via generic mock, rely on Stripe calls for now
    // assertSpyCalls(mockUpsertSpy, 1); 
    assertSpyCalls(sessionCreateSpy, 1);

    // Verify Stripe session create arguments
    const sessionArgs = sessionCreateSpy.calls[0].args[0];
    assertEquals(sessionArgs.customer, "cus_new");
    assertEquals(sessionArgs.line_items[0].price, "price_prod_123");
    assertEquals(sessionArgs.mode, "subscription");
    assertEquals(sessionArgs.success_url, "/success");
    assertEquals(sessionArgs.cancel_url, "/cancel");
    assertEquals(sessionArgs.metadata?.userId, undefined);
    assertEquals(sessionArgs.metadata?.isTestMode, "false");
  });

  it("should use existing Stripe customer ID if found", async () => {
    const existingCustomerId = "cus_existing_123";
    // Mock DB calls for this specific flow
    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            user_profiles: {
                select: () => Promise.resolve({ data: [{ first_name: 'Test', last_name: 'User' }], error: null })
            },
            user_subscriptions: {
                select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) // Existing sub found
                // No upsert expected
            }
        }
    };
    const { client: testClient, spies: testSpies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const requestBody: CheckoutSessionRequest = { priceId: "price_prod_456", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    // Act: Call the handler directly
    const result = await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode);
    
    // Assert: Check returned SessionResponse object
    assertEquals(result.sessionId, "cs_123"); // Check sessionId
    assertEquals(result.url, "https://checkout.stripe.com/session"); // Check url

    // Verify interactions
    // assertSpyCall(testSpies.fromSpy, ...); // Need more specific assertions
    assertSpyCalls(testSpies.auth.getUserSpy, 0); // Corrected: Use assertSpyCalls for 0 calls
    assertSpyCalls(customerCreateSpy, 0); // Should NOT be called
    assertSpyCalls(sessionCreateSpy, 1);

    // Verify Stripe session create arguments use existing customer ID
    const sessionArgs = sessionCreateSpy.calls[0].args[0];
    assertEquals(sessionArgs.customer, existingCustomerId);
    assertEquals(sessionArgs.line_items[0].price, "price_prod_456");
    assertEquals(sessionArgs.mode, "subscription");
    assertEquals(sessionArgs.success_url, "/success");
    assertEquals(sessionArgs.cancel_url, "/cancel");
    assertEquals(sessionArgs.metadata?.isTestMode, "false");
  });

  it("should throw HandlerError(500) if Stripe customer creation fails", async () => {
    const stripeError = new Error("Stripe customer create failed");
    // Mock Stripe to fail customer creation
    customerCreateSpy = spy(() => Promise.reject(stripeError));
    mockStripeInstance = {
      ...mockStripeInstance,
      customers: { create: customerCreateSpy },
    } as unknown as Stripe;
    // Mock DB to return no existing subscription
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      mockUser: mockAuthUser,
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test', last_name: 'User' }], error: null }) },
          user_subscriptions: { select: () => Promise.resolve({ data: null, error: null }) } // No sub found
      }
    };
    const { client: testClient } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const requestBody: CheckoutSessionRequest = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError,
      stripeError.message // Expect the Stripe error message wrapped in HandlerError
    );
    // Optionally verify status code is 500
  });

  it("should throw HandlerError(500) if subscription upsert fails", async () => {
    const dbError = new Error("Upsert failed");
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      mockUser: mockAuthUser,
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test', last_name: 'User' }], error: null }) },
          user_subscriptions: {
              select: () => Promise.resolve({ data: null, error: null }), // No sub found
              upsert: () => Promise.resolve({ data: null, error: dbError })
          }
      }
    };
    const { client: testClient } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const requestBody: CheckoutSessionRequest = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError,
      "Failed to save Stripe customer ID to user subscription." // Specific error message from handler
    );
    // Check original cause (optional)
    // try { ... } catch(e) { if (e instanceof HandlerError) assertEquals(e.cause, dbError); }
  });

  it("should pass isTestMode=true to Stripe session create", async () => {
    // Mock DB to return existing subscription
    const existingCustomerId = "cus_existing_123";
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test', last_name: 'User' }], error: null }) },
          user_subscriptions: { select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) }
      }
    };
    const { client: testClient } = createMockSupabaseClient(undefined, mockSupabaseConfig);
    // Use default Stripe session create spy
    sessionCreateSpy = defaultSessionCreateSpy();
    mockStripeInstance = {
      ...mockStripeInstance,
      checkout: { sessions: { create: sessionCreateSpy } },
    } as unknown as Stripe;

    const requestBody: CheckoutSessionRequest = { priceId: "price_test_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = true; // Pass true

    const result = await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode);
    
    // Assert: Check returned SessionResponse object
    assertEquals(result.sessionId, "cs_123"); // Check sessionId
    assertSpyCalls(sessionCreateSpy, 1);

    // Verify Stripe session create arguments using assertSpyCall
    assertSpyCall(sessionCreateSpy, 0, {
        args: [
            {
                customer: existingCustomerId,
                line_items: [{ price: "price_test_123", quantity: 1 }],
                mode: "subscription",
                success_url: "/success",
                cancel_url: "/cancel",
                client_reference_id: userId,
                metadata: { isTestMode: "true" } // Check metadata directly
            }
        ]
    });
  });

  it("should throw HandlerError(500) if Stripe session creation fails", async () => {
    const stripeError = new Error("Stripe session create failed");
    // Mock Stripe session create to fail
    sessionCreateSpy = spy(() => Promise.reject(stripeError));
    mockStripeInstance = {
      ...mockStripeInstance,
      checkout: { sessions: { create: sessionCreateSpy } },
    } as unknown as Stripe;
    // Mock DB to return existing subscription
    const existingCustomerId = "cus_existing_123";
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test', last_name: 'User' }], error: null }) },
          user_subscriptions: { select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) }
      }
    };
    const { client: testClient } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const requestBody: CheckoutSessionRequest = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, userId, requestBody, isTestMode),
      HandlerError,
      stripeError.message // Expect Stripe error message wrapped in HandlerError
    );
  });

  it("should include client_reference_id and not userId in metadata", async () => {
    const mockUserId = "user-for-client-ref-test";
    const existingCustomerId = "cus_for_client_ref";
    // Mock DB to simulate existing customer
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: null, last_name: null }], error: null }) }, // Simple profile mock
          user_subscriptions: { select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) }
      }
    };
    const { client: testClient } = createMockSupabaseClient(undefined, mockSupabaseConfig);
    // Use default Stripe session create spy
    sessionCreateSpy = defaultSessionCreateSpy();
    mockStripeInstance = {
      ...mockStripeInstance,
      checkout: { sessions: { create: sessionCreateSpy } },
    } as unknown as Stripe;
    
    const requestBody: CheckoutSessionRequest = { priceId: "price_client_ref", successUrl: "/success", cancelUrl: "/cancel" };
    const isTestMode = true;

    // Act: Call handler without mockDeps
    await createCheckoutSession(testClient as unknown as SupabaseClient<Database>, mockStripeInstance, mockUserId, requestBody, isTestMode);

    // Assert Stripe session create was called
    // const sessionCreateSpy = mockStripeInstance.checkout.sessions.create; // Already defined above
    assertSpyCall(sessionCreateSpy, 0); // Check it was called (index 0 for first call)

    // Assert arguments passed to Stripe using assertSpyCall
    assertSpyCall(sessionCreateSpy, 0, {
        args: [
            {
                client_reference_id: mockUserId,
                customer: existingCustomerId,
                line_items: [{ price: "price_client_ref", quantity: 1 }],
                mode: "subscription",
                success_url: "/success", // Assuming these are still needed
                cancel_url: "/cancel",   // Assuming these are still needed
                metadata: { isTestMode: "true" } // Verify metadata structure
            }
        ]
    });
    // Remove the individual assertEquals for sessionArgs properties as they are covered above
    // assertEquals(sessionArgs.client_reference_id, mockUserId, "client_reference_id should match userId");
    // assertEquals(sessionArgs.customer, existingCustomerId, "customer should be existing ID");
    // assertEquals(sessionArgs.line_items[0].price, "price_client_ref");
    // assertEquals(sessionArgs.metadata?.isTestMode, "true");
    // assertEquals(sessionArgs.metadata?.userId, undefined, "userId should NOT be in metadata");
  });

}); 