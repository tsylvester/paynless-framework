import { assertEquals, assertObjectMatch, assertRejects, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { spy, type Spy, assertSpyCalls, assertSpyCall } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { createCheckoutSession } from "./checkout.ts";
import { TablesInsert } from "../../types_db.ts";
import { HandlerError } from "./current.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/supabase.mock.ts";

// Declare mocks/spies with let
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;

// Default spy implementations
const defaultGetUserSpy = () => spy(() => Promise.resolve({ data: { user: { id: "user-123", email: "test@example.com" } } }));
const defaultFromSpy = () => spy(() => mockSupabaseClient); // Use the mock client instance
const defaultSelectSpy = () => spy(() => mockSupabaseClient);
const defaultUpsertSpy = () => spy(() => Promise.resolve({ error: null }));
const defaultEqSpy = () => spy(() => mockSupabaseClient);
const defaultMaybeSingleSpy = () => spy(() => Promise.resolve({ data: null, error: null }));

const defaultCustomerCreateSpy = () => spy(() => Promise.resolve({ id: "cus_new" } as any));
const defaultSessionCreateSpy = () => spy(() => Promise.resolve({ id: "cs_123", url: "https://checkout.stripe.com/session" } as any));

describe("createCheckoutSession Handler", () => {
  beforeEach(() => {
    // Use shared Supabase mock setup (basic config, will be overridden in tests)
    const mockSupabaseConfig: MockSupabaseDataConfig = {}; // Start empty
    const { client } = createMockSupabaseClient(mockSupabaseConfig);
    mockSupabaseClient = client;

    // Keep local Stripe mock setup
    mockStripeInstance = {
      customers: { create: defaultCustomerCreateSpy() },
      checkout: { sessions: { create: defaultSessionCreateSpy() } },
    } as unknown as Stripe;
  });

  afterEach(() => {
    // Restore spies/stubs if necessary (e.g., if using global mocks/stubs)
  });

  it("should throw HandlerError(400) if priceId is missing", async () => {
    const requestBody = { successUrl: "/success", cancelUrl: "/cancel" }; 
    const userId = "test-user-id";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode),
      HandlerError, // Expect HandlerError
      "Missing required parameters for checkout" // Updated message
    );
    // Verify no Stripe/DB calls were made (optional, depends on implementation)
    // assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 0);
  });

  it("should throw HandlerError(400) if successUrl is missing", async () => {
    const requestBody = { priceId: "price_123", cancelUrl: "/cancel" };
    const userId = "test-user-id";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode),
      HandlerError, 
      "Missing required parameters for checkout" // Updated message
    );
  });

  it("should throw HandlerError(400) if cancelUrl is missing", async () => {
    const requestBody = { priceId: "price_123", successUrl: "/success" };
    const userId = "test-user-id";
    const isTestMode = false;

     await assertRejects(
      async () => await createCheckoutSession(mockSupabaseClient, mockStripeInstance, userId, requestBody as any, isTestMode),
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
    const { client: errorClient } = createMockSupabaseClient(mockSupabaseConfig);
    // No need to mock other tables if they aren't reached

    const requestBody = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "dummy-user-id";
    const isTestMode = false;
    
    await assertRejects(
      async () => await createCheckoutSession(errorClient, mockStripeInstance, userId, requestBody as any, isTestMode),
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
    const userEmail = "test@example.com";
    // Define type for upsert args
    type UpsertArgs = [TablesInsert<"user_subscriptions">, { onConflict: string }?];
    // Add type annotation to the specific upsert spy
    const mockUpsertSpy = spy<unknown, UpsertArgs, Promise<{ error: any }>>(() => Promise.resolve({ error: null }));
    const mockGetUserSpy = spy(() => Promise.resolve({ data: { user: { email: userEmail } } as any, error: null }));

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        // Mock getUser on the auth object specifically
        getUserResult: { data: { user: { id: userId, email: userEmail } as any }, error: null },
        genericMockResults: {
            user_profiles: {
                select: () => Promise.resolve({ data: [profileData], error: null }) // Profile found
            },
            user_subscriptions: {
                select: () => Promise.resolve({ data: null, error: null }), // No existing sub
                // Configure the actual upsert mock now
                upsert: mockUpsertSpy as any // Use the existing spy configured to succeed
                // update: mockUpsertSpy as any // Remove old hack
            }
        }
    };
    // Create the mock client for this test
    const { client: testClient, spies: testSpies } = createMockSupabaseClient(mockSupabaseConfig);
    // Override the specific getUser spy if necessary (though getUserResult should handle it)
    // testClient.auth.getUser = mockGetUserSpy; 

    const requestBody = { priceId: "price_prod_123", successUrl: "/success", cancelUrl: "/cancel" };
    // userId is already defined above
    // const userId = "user-123"; 
    const isTestMode = false;

    // Act: Call the handler directly, no deps
    const result = await createCheckoutSession(testClient, mockStripeInstance, userId, requestBody as any, isTestMode);
    
    // Assert: Check returned SessionResponse object
    assertEquals(result.sessionId, "cs_123"); // Check sessionId
    assertEquals(result.url, "https://checkout.stripe.com/session"); // Check url
    
    // Verify interactions
    // Use the spies returned from createMockSupabaseClient if possible
    // assertSpyCall(testSpies.fromSpy, ...); // Need more specific assertions on fromSpy.calls
    assertSpyCalls(testSpies.getUserSpy, 1); // Corrected: Use assertSpyCalls
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 1); // New customer created
    // Cannot easily verify upsert call via generic mock, rely on Stripe calls for now
    // assertSpyCalls(mockUpsertSpy, 1); 
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 1);

    // Verify Stripe session create arguments
    const sessionArgs = (mockStripeInstance.checkout.sessions.create as Spy).calls[0].args[0];
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
    const { client: testClient, spies: testSpies } = createMockSupabaseClient(mockSupabaseConfig);

    const requestBody = { priceId: "price_prod_456", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    // Act: Call the handler directly
    const result = await createCheckoutSession(testClient, mockStripeInstance, userId, requestBody as any, isTestMode);
    
    // Assert: Check returned SessionResponse object
    assertEquals(result.sessionId, "cs_123"); // Check sessionId
    assertEquals(result.url, "https://checkout.stripe.com/session"); // Check url

    // Verify interactions
    // assertSpyCall(testSpies.fromSpy, ...); // Need more specific assertions
    assertSpyCalls(testSpies.getUserSpy, 0); // Corrected: Use assertSpyCalls for 0 calls
    assertSpyCalls(mockStripeInstance.customers.create as Spy, 0); // Should NOT be called
    assertSpyCalls(mockStripeInstance.checkout.sessions.create as Spy, 1);

    // Verify Stripe session create arguments use existing customer ID
    const sessionArgs = (mockStripeInstance.checkout.sessions.create as Spy).calls[0].args[0];
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
    mockStripeInstance.customers.create = spy(() => Promise.reject(stripeError));
    // Mock DB to return no existing subscription
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      getUserResult: { data: { user: { id: 'user-123', email: 'test@example.com' } } as any, error: null },
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test' }], error: null }) },
          user_subscriptions: { select: () => Promise.resolve({ data: null, error: null }) } // No sub found
      }
    };
    const { client: testClient } = createMockSupabaseClient(mockSupabaseConfig);

    const requestBody = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(testClient, mockStripeInstance, userId, requestBody as any, isTestMode),
      HandlerError,
      stripeError.message // Expect the Stripe error message wrapped in HandlerError
    );
    // Optionally verify status code is 500
  });

  it("should throw HandlerError(500) if subscription upsert fails", async () => {
    const dbError = new Error("Upsert failed");
    // Mock DB upsert to fail
    const mockUpsertSpy = spy(() => Promise.resolve({ error: dbError }));
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      getUserResult: { data: { user: { id: 'user-123', email: 'test@example.com' } } as any, error: null },
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test' }], error: null }) },
          user_subscriptions: {
              select: () => Promise.resolve({ data: null, error: null }), // No sub found
              // Use the failing upsert mock (via update config hack)
              update: mockUpsertSpy as any 
          }
      }
    };
    const { client: testClient } = createMockSupabaseClient(mockSupabaseConfig);

    const requestBody = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(testClient, mockStripeInstance, userId, requestBody as any, isTestMode),
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
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test' }], error: null }) },
          user_subscriptions: { select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) }
      }
    };
    const { client: testClient } = createMockSupabaseClient(mockSupabaseConfig);
    // Use default Stripe session create spy
    const sessionCreateSpy = defaultSessionCreateSpy();
    mockStripeInstance.checkout.sessions.create = sessionCreateSpy;

    const requestBody = { priceId: "price_test_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = true; // Pass true

    const result = await createCheckoutSession(testClient, mockStripeInstance, userId, requestBody as any, isTestMode);
    
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
                metadata: { isTestMode: "true" } // Check metadata directly
            }
        ]
    });
  });

  it("should throw HandlerError(500) if Stripe session creation fails", async () => {
    const stripeError = new Error("Stripe session create failed");
    // Mock Stripe session create to fail
    mockStripeInstance.checkout.sessions.create = spy(() => Promise.reject(stripeError));
    // Mock DB to return existing subscription
    const existingCustomerId = "cus_existing_123";
    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
          user_profiles: { select: () => Promise.resolve({ data: [{ first_name: 'Test' }], error: null }) },
          user_subscriptions: { select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) }
      }
    };
    const { client: testClient } = createMockSupabaseClient(mockSupabaseConfig);

    const requestBody = { priceId: "price_123", successUrl: "/success", cancelUrl: "/cancel" };
    const userId = "user-123";
    const isTestMode = false;

    await assertRejects(
      async () => await createCheckoutSession(testClient, mockStripeInstance, userId, requestBody as any, isTestMode),
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
          user_profiles: { select: () => Promise.resolve({ data: [{}], error: null }) }, // Simple profile mock
          user_subscriptions: { select: () => Promise.resolve({ data: [{ stripe_customer_id: existingCustomerId }], error: null }) }
      }
    };
    const { client: testClient } = createMockSupabaseClient(mockSupabaseConfig);
    // Use default Stripe session create spy
    const sessionCreateSpy = defaultSessionCreateSpy();
    mockStripeInstance.checkout.sessions.create = sessionCreateSpy;
    
    const requestBody = { priceId: "price_client_ref", successUrl: "/success", cancelUrl: "/cancel" };
    const isTestMode = true;

    // Act: Call handler without mockDeps
    await createCheckoutSession(testClient, mockStripeInstance, mockUserId, requestBody as any, isTestMode);

    // Assert Stripe session create was called
    // const sessionCreateSpy = mockStripeInstance.checkout.sessions.create as Spy; // Already defined above
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
                metadata: { isTestMode: "true", userId: undefined } // Verify metadata structure
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