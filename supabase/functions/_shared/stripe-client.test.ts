import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  stub,
  Spy,
  Stub,
  spy,
  assertSpyCall,
  assertSpyCalls,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
import Stripe from "npm:stripe"; // Import type

import {
  getStripeMode,
  getStripeClient,
  verifyWebhookSignature,
  StripeConstructor // Import type for mocking
} from "./stripe-client.ts";

// --- Test Setup ---

let envStub: Stub | undefined;

function setupEnvStub(envVars: Record<string, string | undefined>) {
  if (envStub) envStub.restore();
  envStub = stub(Deno.env, "get", (key: string) => envVars[key]);
}

describe("Stripe Client Utilities", () => {
  afterEach(() => {
    if (envStub) envStub.restore();
    envStub = undefined;
  });

  // --- getStripeMode Tests ---
  describe("getStripeMode", () => {
    it("should return true (test mode) if STRIPE_TEST_MODE is 'true'", () => {
      setupEnvStub({ STRIPE_TEST_MODE: "true" });
      assertEquals(getStripeMode(), true);
    });

    it("should return true (test mode) if STRIPE_TEST_MODE is undefined", () => {
      setupEnvStub({}); // No var set
      assertEquals(getStripeMode(), true);
    });

    it("should return true (test mode) if STRIPE_TEST_MODE is any string other than 'false'", () => {
      setupEnvStub({ STRIPE_TEST_MODE: "yes" });
      assertEquals(getStripeMode(), true);
    });

    it("should return false (live mode) if STRIPE_TEST_MODE is exactly 'false'", () => {
      setupEnvStub({ STRIPE_TEST_MODE: "false" });
      assertEquals(getStripeMode(), false);
    });
  });

  // --- getStripeClient Tests ---
  describe("getStripeClient", () => {
    // Define with let outside beforeEach
    let mockStripeInstance: { constructorArgs: any[] };
    let MockStripe: Spy<StripeConstructor>; 

    beforeEach(() => {
      // Re-initialize spy before each test in this suite
      MockStripe = spy(function (key: string, config?: Stripe.StripeConfig) {
          mockStripeInstance = { constructorArgs: [key, config] };
          return { apiKey: key } as any; 
      });
    });

    it("should use STRIPE_SECRET_TEST_KEY in test mode", () => {
      // No need to reset calls = [] anymore
      const testKey = "sk_test_123";
      setupEnvStub({ STRIPE_SECRET_TEST_KEY: testKey, STRIPE_TEST_MODE: "true" });
      getStripeClient(true, MockStripe);
      assertSpyCall(MockStripe, 0, { args: [testKey, { apiVersion: "2023-10-16" }] });
    });

    it("should use STRIPE_SECRET_LIVE_KEY in live mode", () => {
      // No need to reset calls = [] anymore
      const liveKey = "sk_live_456";
      setupEnvStub({ STRIPE_SECRET_LIVE_KEY: liveKey, STRIPE_TEST_MODE: "false" });
      getStripeClient(false, MockStripe);
      assertSpyCall(MockStripe, 0, { args: [liveKey, { apiVersion: "2023-10-16" }] });
    });

    it("should throw error if TEST key is missing in test mode", () => {
      // No need to reset calls = [] anymore
      setupEnvStub({ STRIPE_TEST_MODE: "true" }); // Missing test key
      assertThrows(
        () => getStripeClient(true, MockStripe),
        Error,
        "Stripe test secret key environment variable (STRIPE_SECRET_TEST_KEY) is not defined"
      );
    });

    it("should throw error if LIVE key is missing in live mode", () => {
      // No need to reset calls = [] anymore
      setupEnvStub({ STRIPE_TEST_MODE: "false" }); // Missing live key
      assertThrows(
        () => getStripeClient(false, MockStripe),
        Error,
        "Stripe live secret key environment variable (STRIPE_SECRET_LIVE_KEY) is not defined"
      );
    });
  });

  // --- verifyWebhookSignature Tests (Placeholder) ---
  describe("verifyWebhookSignature", () => {
    // TODO: Add tests mocking stripe.webhooks.constructEventAsync
    it.ignore("should call constructEventAsync with correct args (test mode)", async () => {
      // ... setup ...
    });
    
    it.ignore("should call constructEventAsync with correct args (live mode)", async () => {
      // ... setup ...
    });
    
    it.ignore("should throw if TEST webhook secret is missing", async () => {
      // ... setup ...
    });
    
    it.ignore("should throw if LIVE webhook secret is missing", async () => {
      // ... setup ...
    });
    
    it.ignore("should re-throw constructEventAsync errors", async () => {
      // ... setup ...
    });
  });
}); 