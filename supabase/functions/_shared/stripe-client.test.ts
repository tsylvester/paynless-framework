import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertThrows,
  assertExists,
  assertRejects,
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
import Stripe from "npm:stripe@18.0.0"; // Import type consistent with implementation

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

  // Define a minimal mock CLASS available to all tests in this suite
  class MockStripeClass {
      apiKey: string;
      // Mocked webhooks property with a spy-able method
      webhooks = {
          // We'll use spy() or stub() on this in specific tests
          constructEventAsync: (_body: string, _sig: string, _secret: string): Promise<Stripe.Event> => {
              // Default implementation throws - tests must explicitly mock success/failure
               return Promise.reject(new Error("Mock constructEventAsync was called without being stubbed!"));
          }
      };
      // Static method for the prototype
      static createFetchHttpClient() {
          // Dummy implementation for testing - doesn't need to return a real client
          // console.log("Mocked createFetchHttpClient called");
          return undefined; 
      }
      constructor(key: string, config?: Stripe.StripeConfig) {
          this.apiKey = key; // Removed capture args, less relevant now
          // Minimal properties to satisfy basic checks if needed
      }
       // Add this to allow tests to access apiKey via client.apiKey if needed
       [key: string]: any; 
  }

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
    // let mockStripeInstanceArgs: any[] | undefined; // Removed, less relevant
    // MockStripeClass defined above

    // Explicitly type as ConstructorSpy - Use instance type for first generic
    let MockStripeSpy: ConstructorSpy<MockStripeClass, [key: string, config?: Stripe.StripeConfig]>;

    beforeEach(() => {
      // Reset captured args
      // mockStripeInstanceArgs = undefined;
      // Create a spy ON the mock class constructor
      MockStripeSpy = spy(MockStripeClass);
    });

    it("should use STRIPE_SECRET_TEST_KEY in test mode", () => {
      const testKey = "sk_test_123";
      setupEnvStub({ STRIPE_SECRET_TEST_KEY: testKey, STRIPE_TEST_MODE: "true" });
      // Pass the SPY, using type assertion to satisfy StripeConstructor
      const client = getStripeClient(true, MockStripeSpy as any as StripeConstructor);
      // Assert the spy wrapping the constructor was called
      assertSpyCalls(MockStripeSpy, 1);
      // Manually validate the arguments of the first call
      const callArgs = MockStripeSpy.calls[0].args;
      assertEquals(callArgs[0], testKey); // Check key
      const configArg = callArgs[1] as Stripe.StripeConfig | undefined;
      assertEquals(configArg?.apiVersion, "2025-03-31.basil");

      assertEquals((client as any).apiKey, testKey);
    });

    it("should use STRIPE_SECRET_LIVE_KEY in live mode", () => {
      const liveKey = "sk_live_456";
      setupEnvStub({ STRIPE_SECRET_LIVE_KEY: liveKey, STRIPE_TEST_MODE: "false" });
      // Pass the SPY, using type assertion
      const client = getStripeClient(false, MockStripeSpy as any as StripeConstructor);
      // Assert the spy wrapping the constructor was called
      assertSpyCalls(MockStripeSpy, 1);
      // Manually validate the arguments of the first call
      const callArgs = MockStripeSpy.calls[0].args;
      assertEquals(callArgs[0], liveKey); // Check key
      const configArg = callArgs[1] as Stripe.StripeConfig | undefined;
      assertEquals(configArg?.apiVersion, "2025-03-31.basil");

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
    const mockBody = "{\"id\": \"evt_test\"}";
    const mockSignature = "t=123,v1=abc";
    const mockTestSecret = "whsec_test_secret";
    const mockLiveSecret = "whsec_live_secret";
    const mockEvent = { id: 'evt_test_success' } as Stripe.Event; // Simplified mock event for assertion

    it("should call constructEventAsync with correct args (test mode)", async () => {
      setupEnvStub({ STRIPE_TEST_MODE: "true", STRIPE_TEST_WEBHOOK_SECRET: mockTestSecret });
      const mockStripeInstance = new MockStripeClass("sk_test_123");
      // Stub the method ON THE INSTANCE to resolve successfully
      const constructEventStub = stub(mockStripeInstance.webhooks, "constructEventAsync", () => Promise.resolve(mockEvent));

      const result = await verifyWebhookSignature(mockStripeInstance as any, mockBody, mockSignature);

      // Assert the stub was called correctly
      assertSpyCall(constructEventStub, 0, {
        args: [mockBody, mockSignature, mockTestSecret]
      });
      assertEquals(result, mockEvent); // Check returned event

      constructEventStub.restore(); // Clean up stub
    });
    
    it("should call constructEventAsync with correct args (live mode)", async () => {
      setupEnvStub({ STRIPE_TEST_MODE: "false", STRIPE_LIVE_WEBHOOK_SECRET: mockLiveSecret });
      const mockStripeInstance = new MockStripeClass("sk_live_456");
      // Stub the method ON THE INSTANCE to resolve successfully
      const constructEventStub = stub(mockStripeInstance.webhooks, "constructEventAsync", () => Promise.resolve(mockEvent));

      const result = await verifyWebhookSignature(mockStripeInstance as any, mockBody, mockSignature);

      // Assert the stub was called correctly
      assertSpyCall(constructEventStub, 0, {
        args: [mockBody, mockSignature, mockLiveSecret] // Check for LIVE secret
      });
      assertEquals(result, mockEvent); // Check returned event

      constructEventStub.restore(); // Clean up stub
    });
    
    it("should throw if TEST webhook secret is missing", async () => {
      setupEnvStub({ STRIPE_TEST_MODE: "true" }); // Omit STRIPE_TEST_WEBHOOK_SECRET
      const mockStripeInstance = new MockStripeClass("sk_test_123");
      // No need to stub constructEventAsync as it shouldn't be reached

      await assertRejects(
        async () => await verifyWebhookSignature(mockStripeInstance as any, mockBody, mockSignature),
        Error,
        "Stripe test webhook secret environment variable (STRIPE_TEST_WEBHOOK_SECRET) is not defined"
      );
    });
    
    it("should throw if LIVE webhook secret is missing", async () => {
      setupEnvStub({ STRIPE_TEST_MODE: "false" }); // Omit STRIPE_LIVE_WEBHOOK_SECRET
      const mockStripeInstance = new MockStripeClass("sk_live_456");
      // No need to stub constructEventAsync

      await assertRejects(
        async () => await verifyWebhookSignature(mockStripeInstance as any, mockBody, mockSignature),
        Error,
        "Stripe live webhook secret environment variable (STRIPE_LIVE_WEBHOOK_SECRET) is not defined"
      );
    });
    
    it("should re-throw constructEventAsync errors", async () => {
      setupEnvStub({ STRIPE_TEST_MODE: "true", STRIPE_TEST_WEBHOOK_SECRET: mockTestSecret });
      const mockStripeInstance = new MockStripeClass("sk_test_123");
      const originalError = new Error("Signature verification failed internally");
      // Stub the method ON THE INSTANCE to reject
      const constructEventStub = stub(mockStripeInstance.webhooks, "constructEventAsync", () => Promise.reject(originalError));

      await assertRejects(
        async () => await verifyWebhookSignature(mockStripeInstance as any, mockBody, mockSignature),
        Error, // Expect an error
        `Webhook signature verification failed: ${originalError.message}` // Check that original message is included
      );

      assertSpyCall(constructEventStub, 0); // Ensure it was called
      constructEventStub.restore();
    });
  });
}); 