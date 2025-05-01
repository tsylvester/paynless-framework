import { assertEquals, assertObjectMatch, assertRejects } from "https://deno.land/std/testing/asserts.ts";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { assertSpyCalls, spy, Spy } from "jsr:@std/testing@0.225.1/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { createBillingPortalSession } from "./billing-portal.ts";
import { HandlerError } from "./current.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../../_shared/test-utils.ts";
import { BillingPortalRequest } from "../../_shared/types.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;
let stripeCreateSpy: Spy; // Define Stripe spy here for use across tests

// Default Portal Session Create Spy
const defaultPortalSessionCreateSpy = () => spy(() => 
    Promise.resolve({ id: "bps_123", url: "https://billing.stripe.com/session/test" } as any)
);

// --- Test Suite ---
describe("createBillingPortalSession Handler", () => {

  beforeEach(() => {
    // Default success setup for Supabase (finds customer ID)
    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            user_subscriptions: {
                select: () => Promise.resolve({ data: [{ stripe_customer_id: "cus_default_123" }], error: null })
            }
        }
    };
    const { client } = createMockSupabaseClient(mockSupabaseConfig);
    mockSupabaseClient = client;

    // Default success setup for Stripe
    stripeCreateSpy = defaultPortalSessionCreateSpy();
    mockStripeInstance = {
      billingPortal: {
        sessions: { create: stripeCreateSpy },
      },
    } as unknown as Stripe;
  });

  // --- Test Cases ---

  it("should throw HandlerError(400) if returnUrl is missing", async () => {
    // Arrange
    const requestBody = {} as BillingPortalRequest; // Missing returnUrl
    const userId = "user_test_1";
    
    // Act & Assert
    await assertRejects(
        async () => await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody), // Remove mockDeps
        HandlerError,
        "Missing return URL"
    );
    assertSpyCalls(stripeCreateSpy, 0); // Stripe should not be called
  });

  it("should throw HandlerError(500) if fetching subscription fails", async () => {
    // Arrange: Configure Supabase mock for DB error
    const dbError = new Error("DB select failed");
    const mockConfig: MockSupabaseDataConfig = {
        genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: null, error: dbError }) } }
    };
    const { client: errorClient } = createMockSupabaseClient(mockConfig);
    const requestBody = { returnUrl: "/account" };
    const userId = "user_test_2";
    
    // Act & Assert
    await assertRejects(
        async () => await createBillingPortalSession(errorClient, mockStripeInstance, userId, requestBody), // Use errorClient, remove mockDeps
        HandlerError,
        "Failed to retrieve subscription data"
    );
    assertSpyCalls(stripeCreateSpy, 0);
  });

  it("should throw HandlerError(400) if user has no stripe_customer_id", async () => {
    // Arrange: Configure Supabase mock for null data
     const mockConfig: MockSupabaseDataConfig = {
        genericMockResults: { user_subscriptions: { select: () => Promise.resolve({ data: null, error: null }) } }
    };
    const { client: nullClient } = createMockSupabaseClient(mockConfig);
    const requestBody = { returnUrl: "/account" };
    const userId = "user_test_3_no_customer";
    
    // Act & Assert
    await assertRejects(
        async () => await createBillingPortalSession(nullClient, mockStripeInstance, userId, requestBody), // Use nullClient, remove mockDeps
        HandlerError,
        "No Stripe customer found for this user"
    );
    assertSpyCalls(stripeCreateSpy, 0);
  });

  it("should create and return portal session URL on success", async () => {
    // Arrange: Use default mocks from beforeEach (DB success)
    // Configure specific Stripe mock for this test if needed (or rely on beforeEach default)
    const customerId = "cus_default_123"; // Matches beforeEach mock
    const portalUrl = "https://billing.stripe.com/session/success_test";
    const portalSessionId = "bps_success";
    stripeCreateSpy = spy(() => Promise.resolve({ id: portalSessionId, url: portalUrl } as any)); // Re-assign spy for this test
    mockStripeInstance.billingPortal.sessions.create = stripeCreateSpy;
    
    const requestBody = { returnUrl: "/account-success" };
    const userId = "user_test_4_success";
    
    // Act
    const result = await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody); // Remove mockDeps
    
    // Assert
    assertEquals(result.url, portalUrl);
    assertEquals(result.sessionId, portalSessionId);

    // Verify Stripe call
    assertSpyCalls(stripeCreateSpy, 1);
    assertEquals(stripeCreateSpy.calls[0].args[0], {
      customer: customerId,
      return_url: "/account-success",
    });
  });

  it("should throw HandlerError if Stripe session creation fails", async () => {
    // Arrange: Use default Supabase mock (DB success)
    // Configure Stripe mock to reject
    const stripeError = new Error("Stripe portal boom");
    stripeCreateSpy = spy(() => Promise.reject(stripeError)); // Re-assign spy
    mockStripeInstance.billingPortal.sessions.create = stripeCreateSpy;

    const requestBody = { returnUrl: "/account" };
    const userId = "user_test_5_stripe_fail";
    
    // Act & Assert
    await assertRejects(
        async () => await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody), // Remove mockDeps
        HandlerError,
        stripeError.message // Expect Stripe error message
    );
    // Verify Stripe was called
    assertSpyCalls(stripeCreateSpy, 1);
  });

}); 