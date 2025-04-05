import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@0.225.3";
import { spy, stub, assertSpyCall } from "jsr:@std/testing@0.225.1/mock"; 

// Import functions to test
import {
    getStripeClient,
    verifyWebhookSignature,
    getStripeMode
} from "./stripe-client.ts";

// Import types needed for mocks
import type Stripe from "npm:stripe@14.11.0";

// --- Test Cases ---
Deno.test("Stripe Client Utilities", async (t) => {

    // --- Test getStripeMode ---
    await t.step("getStripeMode: should return value from requestData if present", () => {
        assertEquals(getStripeMode({ isTestMode: true }), true);
        assertEquals(getStripeMode({ isTestMode: false }), false);
        assertEquals(getStripeMode({ isTestMode: "true" }), true); // Check truthiness
        assertEquals(getStripeMode({ isTestMode: 0 }), false); // Check truthiness
    });

    await t.step("getStripeMode: should use env var if requestData missing", () => {
        const envStub = stub(Deno.env, "get", (key) => key === 'STRIPE_TEST_MODE' ? 'false' : undefined);
        try {
            assertEquals(getStripeMode({}), false); // Env is explicitly 'false'
        } finally {
            envStub.restore();
        }
    });

    await t.step("getStripeMode: should default to true if env var not 'false'", () => {
        const envStub1 = stub(Deno.env, "get", (key) => key === 'STRIPE_TEST_MODE' ? 'true' : undefined);
        try {
            assertEquals(getStripeMode({}), true);
        } finally {
            envStub1.restore();
        }
        
        const envStub2 = stub(Deno.env, "get", () => undefined); // Env var missing
         try {
            assertEquals(getStripeMode({}), true);
        } finally {
            envStub2.restore();
        }
    });

    // --- Test getStripeClient ---
    await t.step("getStripeClient: should throw if test key missing", () => {
        // Define mock constructor locally
        const LocalMockStripeConstructor = spy((_key, _config) => ({})); 
        const envStub = stub(Deno.env, "get", () => undefined); 
        try {
            assertThrows(
                () => getStripeClient(true, LocalMockStripeConstructor),
                Error,
                "Stripe test secret key is not defined"
            );
        } finally {
            envStub.restore();
        }
    });

    await t.step("getStripeClient: should throw if live key missing", () => {
        // Define mock constructor locally
        const LocalMockStripeConstructor = spy((_key, _config) => ({})); 
        const envStub = stub(Deno.env, "get", () => undefined); 
        try {
            assertThrows(
                () => getStripeClient(false, LocalMockStripeConstructor),
                Error,
                "Stripe live secret key is not defined"
            );
        } finally {
            envStub.restore();
        }
    });

    await t.step("getStripeClient: should use test key in test mode", () => {
        // Define mock constructor locally
        const mockStripeInstance = { name: "MockStripe" };
        const LocalMockStripeConstructor = spy((_key, _config) => mockStripeInstance);
        const envStub = stub(Deno.env, "get", (key) => key === 'STRIPE_SECRET_TEST_KEY' ? 'test_sk' : undefined);
        // MockStripeConstructor.calls = []; // Remove reset attempt
        try {
            const client = getStripeClient(true, LocalMockStripeConstructor);
            assertEquals(client, mockStripeInstance); 
            assertSpyCall(LocalMockStripeConstructor, 0, {
                args: ['test_sk', { apiVersion: "2023-10-16" }]
            });
        } finally {
            envStub.restore();
        }
    });

    await t.step("getStripeClient: should use live key in live mode", () => {
        // Define mock constructor locally
        const mockStripeInstance = { name: "MockStripe" };
        const LocalMockStripeConstructor = spy((_key, _config) => mockStripeInstance);
        const envStub = stub(Deno.env, "get", (key) => key === 'STRIPE_SECRET_LIVE_KEY' ? 'live_sk' : undefined);
        // MockStripeConstructor.calls = []; // Remove reset attempt
        try {
            const client = getStripeClient(false, LocalMockStripeConstructor);
            assertEquals(client, mockStripeInstance);
            assertSpyCall(LocalMockStripeConstructor, 0, {
                args: ['live_sk', { apiVersion: "2023-10-16" }]
            });
        } finally {
            envStub.restore();
        }
    });

    // --- Test verifyWebhookSignature ---
    await t.step("verifyWebhookSignature: should call constructEventAsync and return event", async () => {
        const mockEvent = { id: 'evt_123', type: 'test.event' };
        const constructEventSpy = spy(async () => mockEvent);
        // Ensure mockStripe has the expected nested structure
        const mockStripe = { 
            webhooks: { 
                constructEventAsync: constructEventSpy 
            } 
        } as any; 
        const body = "payload";
        const sig = "sig_abc";
        const secret = "whsec_123";
        
        const event = await verifyWebhookSignature(mockStripe, body, sig, secret);
        
        assertEquals(event, mockEvent);
        assertSpyCall(constructEventSpy, 0, { args: [body, sig, secret] });
    });

    await t.step("verifyWebhookSignature: should throw if constructEventAsync throws", async () => {
        const constructEventSpy = spy(async () => { throw new Error("Invalid signature"); });
         // Ensure mockStripe has the expected nested structure
        const mockStripe = { 
            webhooks: { 
                constructEventAsync: constructEventSpy 
            } 
        } as any;
        const body = "payload";
        const sig = "sig_abc";
        const secret = "whsec_123";

        await assertRejects(
            () => verifyWebhookSignature(mockStripe, body, sig, secret),
            Error,
            "Webhook signature verification failed: Invalid signature"
        );
        assertSpyCall(constructEventSpy, 0);
    });

}); 