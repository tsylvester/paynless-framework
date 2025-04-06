import { assertEquals } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { assertSpyCalls, spy, Spy } from "jsr:@std/testing@0.225.1/mock";
import { SupabaseClient } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";
import { createBillingPortalSession } from "./billing-portal.ts";
// Import types AND functions needed for spy setup
import { 
    createErrorResponse, 
    createSuccessResponse, 
    type createErrorResponse as CreateErrorResponseType, 
    type createSuccessResponse as CreateSuccessResponseType 
} from "@shared/responses.ts"; 
import { BillingPortalRequest } from "../types.ts";

// --- Mocks & Spies ---
let mockSupabaseClient: SupabaseClient;
let mockStripeInstance: Stripe;
let mockCreateErrorResponse: Spy<CreateErrorResponseType>; 
let mockCreateSuccessResponse: Spy<CreateSuccessResponseType>;

// Default spy implementations for chained methods
const defaultMaybeSingleSpy = (data: any = { stripe_customer_id: "cus_default_123" }, error: any = null) => 
    spy(() => Promise.resolve({ data, error }));
const defaultEqSpy = (maybeSingleSpy = defaultMaybeSingleSpy()) => 
    spy(() => ({ maybeSingle: maybeSingleSpy }));
const defaultSelectSpy = (eqSpy = defaultEqSpy()) => 
    spy(() => ({ eq: eqSpy }));

// Default From Spy - Returns an object with chainable spies
const defaultFromSpy = (selectSpy = defaultSelectSpy()) => 
    spy(() => ({ select: selectSpy }));

// Default Portal Session Create Spy
const defaultPortalSessionCreateSpy = () => spy(() => 
    Promise.resolve({ id: "bps_123", url: "https://billing.stripe.com/session/test" } as any)
);

// Mock dependencies object structure (matches handler)
const mockDeps = () => ({
  createErrorResponse: mockCreateErrorResponse,
  createSuccessResponse: mockCreateSuccessResponse,
});

// --- Test Suite ---
describe("createBillingPortalSession Handler", () => {

  beforeEach(() => {
    // Re-initialize spies before each test
    mockSupabaseClient = {
      // Assign the spy function directly. It will return the object with chainable methods.
      from: defaultFromSpy()
    } as unknown as SupabaseClient;

    mockStripeInstance = {
      billingPortal: {
        sessions: { create: defaultPortalSessionCreateSpy() },
      },
      // Add other Stripe methods if needed
    } as unknown as Stripe;

    // Re-initialize response spies using the imported functions
    mockCreateErrorResponse = spy(createErrorResponse);
    mockCreateSuccessResponse = spy(createSuccessResponse);
  });

  // --- Test Cases ---

  it("should return 400 if returnUrl is missing", async () => {
     // No specific DB mock needed here, default behavior is fine
    const requestBody = {} as BillingPortalRequest;
    const userId = "user_test_1";
    
    const response = await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody, mockDeps());

    assertEquals(response.status, 400);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Missing return URL");
  });

  it("should return 500 if fetching subscription fails", async () => {
    const dbError = new Error("DB select failed");
    // Create spies for this specific error path
    const maybeSingleSpyWithError = defaultMaybeSingleSpy(null, dbError);
    const eqSpyWithError = defaultEqSpy(maybeSingleSpyWithError);
    const selectSpyWithError = defaultSelectSpy(eqSpyWithError);
    // Override the default 'from' mock for this test
    mockSupabaseClient.from = defaultFromSpy(selectSpyWithError);

    const requestBody = { returnUrl: "/account" };
    const userId = "user_test_2";
    
    const response = await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody, mockDeps());

    assertEquals(response.status, 500);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "Failed to retrieve subscription data");
    assertEquals(mockCreateErrorResponse.calls[0].args[2], dbError);

    // Verify the chain was called
    assertSpyCalls(mockSupabaseClient.from as Spy, 1);
    assertSpyCalls(selectSpyWithError, 1);
    assertSpyCalls(eqSpyWithError, 1);
    assertSpyCalls(maybeSingleSpyWithError, 1);
  });

  it("should return 400 if user has no stripe_customer_id", async () => {
    // Create spies for this specific null data path
    const maybeSingleSpyNull = defaultMaybeSingleSpy(null, null);
    const eqSpyNull = defaultEqSpy(maybeSingleSpyNull);
    const selectSpyNull = defaultSelectSpy(eqSpyNull);
    mockSupabaseClient.from = defaultFromSpy(selectSpyNull);

    const requestBody = { returnUrl: "/account" };
    const userId = "user_test_3_no_customer";
    
    const response = await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody, mockDeps());

    assertEquals(response.status, 400);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], "No Stripe customer found for this user");

    // Verify the chain was called
    assertSpyCalls(mockSupabaseClient.from as Spy, 1);
    assertSpyCalls(selectSpyNull, 1);
    assertSpyCalls(eqSpyNull, 1);
    assertSpyCalls(maybeSingleSpyNull, 1);
  });

  it("should create and return portal session URL on success", async () => {
    const customerId = "cus_success_user";
    const portalUrl = "https://billing.stripe.com/session/success_test";
    
    // Setup spies for this success path
    const maybeSingleSpySuccess = defaultMaybeSingleSpy({ stripe_customer_id: customerId }, null);
    const eqSpySuccess = defaultEqSpy(maybeSingleSpySuccess);
    const selectSpySuccess = defaultSelectSpy(eqSpySuccess);
    mockSupabaseClient.from = defaultFromSpy(selectSpySuccess);

    // Mock Stripe to return specific URL
    const stripeCreateSpy = spy(() => 
        Promise.resolve({ id: "bps_success", url: portalUrl } as any)
    );
    mockStripeInstance.billingPortal.sessions.create = stripeCreateSpy;

    const requestBody = { returnUrl: "/account-success" };
    const userId = "user_test_4_success";
    
    const response = await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody, mockDeps());

    let responseBody;
    try {
      responseBody = await response.json();
    } catch(e) {
      console.error("Failed to parse success response:", await response.text());
      throw e;
    }

    assertEquals(response.status, 200);
    assertSpyCalls(mockCreateSuccessResponse, 1);
    assertEquals(responseBody.url, portalUrl);
    assertEquals(responseBody.sessionId, "bps_success");

    // Verify DB and Stripe calls
    assertSpyCalls(mockSupabaseClient.from as Spy, 1);
    assertSpyCalls(selectSpySuccess, 1);
    assertSpyCalls(eqSpySuccess, 1);
    assertSpyCalls(maybeSingleSpySuccess, 1);
    assertSpyCalls(stripeCreateSpy, 1);
    assertEquals(stripeCreateSpy.calls[0].args[0], {
      customer: customerId,
      return_url: "/account-success",
    });
  });

  it("should return 500 if Stripe session creation fails", async () => {
    const stripeError = new Error("Stripe portal boom");
    // Setup DB spies for success path (default behavior is fine here)
    const maybeSingleSpy = defaultMaybeSingleSpy();
    const eqSpy = defaultEqSpy(maybeSingleSpy);
    const selectSpy = defaultSelectSpy(eqSpy);
    mockSupabaseClient.from = defaultFromSpy(selectSpy);
    
    // Mock Stripe to reject
    const stripeCreateSpy = spy(() => Promise.reject(stripeError));
    mockStripeInstance.billingPortal.sessions.create = stripeCreateSpy;

    const requestBody = { returnUrl: "/account" };
    const userId = "user_test_5_stripe_fail";
    
    const response = await createBillingPortalSession(mockSupabaseClient, mockStripeInstance, userId, requestBody, mockDeps());

    assertEquals(response.status, 500);
    assertSpyCalls(mockCreateErrorResponse, 1);
    assertEquals(mockCreateErrorResponse.calls[0].args[0], stripeError.message);
    assertEquals(mockCreateErrorResponse.calls[0].args[2], stripeError);

    // Verify DB chain was called
    assertSpyCalls(mockSupabaseClient.from as Spy, 1);
    assertSpyCalls(selectSpy, 1);
    assertSpyCalls(eqSpy, 1);
    assertSpyCalls(maybeSingleSpy, 1);
    // Verify Stripe was called
    assertSpyCalls(stripeCreateSpy, 1);
  });

}); 