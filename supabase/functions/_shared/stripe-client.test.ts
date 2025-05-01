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
  type ConstructorSpy
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
    // Store instance details
    let mockStripeInstanceArgs: any[] | undefined;
    // Define a minimal mock CLASS 
    class MockStripeClass {
        apiKey: string;
        constructor(key: string, config?: Stripe.StripeConfig) {
            mockStripeInstanceArgs = [key, config]; // Capture args
            this.apiKey = key;
            // Minimal properties to satisfy basic checks if needed
            // webhooks = {}; // Add only if verifyWebhookSignature test needs it later
        }
         // Add this to allow tests to access apiKey via client.apiKey if needed
         [key: string]: any; 
    }

    // Explicitly type as ConstructorSpy - Use instance type for first generic
    let MockStripeSpy: ConstructorSpy<MockStripeClass, [key: string, config?: Stripe.StripeConfig]>;

    beforeEach(() => {
      // Reset captured args
      mockStripeInstanceArgs = undefined;
      // Create a spy ON the mock class constructor
      MockStripeSpy = spy(MockStripeClass);
    });

    it("should use STRIPE_SECRET_TEST_KEY in test mode", () => {
      const testKey = "sk_test_123";
      setupEnvStub({ STRIPE_SECRET_TEST_KEY: testKey, STRIPE_TEST_MODE: "true" });
      // Pass the SPY, using type assertion to satisfy StripeConstructor
      const client = getStripeClient(true, MockStripeSpy as any as StripeConstructor);
      // Assert the spy wrapping the constructor was called correctly
      assertSpyCall(MockStripeSpy, 0, { args: [testKey, { apiVersion: "2025-03-31.basil" }] });
      assertEquals((client as any).apiKey, testKey);
    });

    it("should use STRIPE_SECRET_LIVE_KEY in live mode", () => {
      const liveKey = "sk_live_456";
      setupEnvStub({ STRIPE_SECRET_LIVE_KEY: liveKey, STRIPE_TEST_MODE: "false" });
      // Pass the SPY, using type assertion
      const client = getStripeClient(false, MockStripeSpy as any as StripeConstructor);
      // Assert the spy wrapping the constructor was called correctly
      assertSpyCall(MockStripeSpy, 0, { args: [liveKey, { apiVersion: "2025-03-31.basil" }] });
      assertEquals((client as any).apiKey, liveKey);
    });

    it("should throw error if TEST key is missing in test mode", () => {
      setupEnvStub({ STRIPE_TEST_MODE: "true" }); // Missing test key
      assertThrows(
        // Pass the SPY, using type assertion
        () => getStripeClient(true, MockStripeSpy as any as StripeConstructor),
        Error,
        "Stripe test secret key environment variable (STRIPE_SECRET_TEST_KEY) is not defined"
      );
      assertSpyCalls(MockStripeSpy, 0);
    });

    it("should throw error if LIVE key is missing in live mode", () => {
      setupEnvStub({ STRIPE_TEST_MODE: "false" }); // Missing live key
      assertThrows(
        // Pass the SPY, using type assertion
        () => getStripeClient(false, MockStripeSpy as any as StripeConstructor),
        Error,
        "Stripe live secret key environment variable (STRIPE_SECRET_LIVE_KEY) is not defined"
      );
       assertSpyCalls(MockStripeSpy, 0);
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