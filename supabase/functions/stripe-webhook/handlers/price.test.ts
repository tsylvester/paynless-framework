import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, assertSpyCall, type Spy } from "jsr:@std/testing/mock";
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from "npm:stripe";
import { handlePriceChange } from "./price.ts";
// Import the SERVICE interface
import { ISupabasePriceWebhookService } from "../services/price_webhook_service.ts"; 
import { logger } from "../../_shared/logger.ts";

// --- Mocks & Spies ---
let mockService: ISupabasePriceWebhookService; // Mock the service interface
let mockStripeInstance: Stripe;

// Spies for service methods
let updatePlanStatusSpy: Spy;
let invokeSyncPlansSpy: Spy;

// --- Test Data ---
const eventIdBase = "evt_price_test_";
const stripePriceId = "price_test_def";
const stripeProductId = "prod_test_price";

const createMockPrice = (overrides: Partial<Stripe.Price> = {}): Stripe.Price => ({
    id: stripePriceId,
    object: 'price',
    active: true, // Default to active
    product: stripeProductId,
    currency: 'usd',
    unit_amount: 1000,
    type: 'recurring',
    // Add other necessary Stripe.Price fields with default values
    ...overrides,
} as Stripe.Price);

// --- Logger Mocking ---
let loggerInfoSpy: Spy, loggerErrorSpy: Spy;

beforeEach(() => {
    mockStripeInstance = {} as Stripe;
    // Reset spies used in most tests
    updatePlanStatusSpy = spy(() => Promise.resolve({ error: null }));
    invokeSyncPlansSpy = spy(() => Promise.resolve({ data: null, error: null }));
    // Default mock service implementation
    mockService = {
        updatePlanStatusByPriceId: updatePlanStatusSpy,
        invokeSyncPlans: invokeSyncPlansSpy
    };
    // Reset logger spies
    loggerInfoSpy = spy(logger, 'info');
    loggerErrorSpy = spy(logger, 'error');
});

afterEach(() => {
    // Restore logger spies
    loggerInfoSpy.restore();
    loggerErrorSpy.restore();
});


// --- Test Suite ---
describe("Stripe Webhook Price Handler (handlePriceChange)", () => {

    it("should call update and invoke for price.created event", async () => {
        // Arrange
        const eventType = "price.created";
        const isTestMode = true;
        const mockPrice = createMockPrice({ active: true }); // New price is active

        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert
        // Update called with active: true
        assertSpyCalls(updatePlanStatusSpy, 1);
        assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripePriceId, true]);
        // Invoke called
        assertSpyCalls(invokeSyncPlansSpy, 1);
        assertEquals(invokeSyncPlansSpy.calls[0]!.args, [isTestMode]);
        // Logging
        assertSpyCalls(loggerInfoSpy, 4); // Start Handler, Update Success, Start Invoke, Invoke Success
        assertSpyCalls(loggerErrorSpy, 0);
    });

    it("should call update (active: true) only for price.updated event (active price)", async () => {
        // Arrange
        const eventType = "price.updated";
        const isTestMode = false;
        const mockPrice = createMockPrice({ active: true });

        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert
        // Update called with active: true
        assertSpyCalls(updatePlanStatusSpy, 1);
        assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripePriceId, true]);
        // Invoke NOT called
        assertSpyCalls(invokeSyncPlansSpy, 0);
        // Logging
        assertSpyCalls(loggerInfoSpy, 2); // Start Handler, Update Success
        assertSpyCalls(loggerErrorSpy, 0);
    });

    it("should call update (active: false) only for price.updated event (inactive price)", async () => {
        // Arrange
        const eventType = "price.updated";
        const isTestMode = false;
        const mockPrice = createMockPrice({ active: false });

        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert
        // Update called with active: false
        assertSpyCalls(updatePlanStatusSpy, 1);
        assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripePriceId, false]);
        // Invoke NOT called
        assertSpyCalls(invokeSyncPlansSpy, 0);
        // Logging
        assertSpyCalls(loggerInfoSpy, 2); // Start Handler, Update Success
        assertSpyCalls(loggerErrorSpy, 0);
    });

    it("should call update (active: false) only for price.deleted event", async () => {
        // Arrange
        const eventType = "price.deleted";
        const isTestMode = false;
        // Price object might still have active=true during delete event, logic overrides to false
        const mockPrice = createMockPrice({ active: true }); 

        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert
        // Update called with active: false (due to eventType)
        assertSpyCalls(updatePlanStatusSpy, 1);
        assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripePriceId, false]);
        // Invoke NOT called
        assertSpyCalls(invokeSyncPlansSpy, 0);
        // Logging
        assertSpyCalls(loggerInfoSpy, 2); // Start Handler, Update Success
        assertSpyCalls(loggerErrorSpy, 0);
    });

    it("should ignore price_FREE ID and not call service methods", async () => {
        // Arrange
        const eventType = "price.updated";
        const isTestMode = false;
        const mockPrice = createMockPrice({ id: 'price_FREE', active: true });

        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert
        // Service methods NOT called
        assertSpyCalls(updatePlanStatusSpy, 0);
        assertSpyCalls(invokeSyncPlansSpy, 0);
        // Logging
        assertSpyCalls(loggerInfoSpy, 2); // Start Handler, Ignoring log
        assertSpyCalls(loggerErrorSpy, 0);
    });

    it("should log error but not throw if service update fails", async () => {
        // Arrange
        const eventType = "price.updated";
        const isTestMode = false;
        const mockPrice = createMockPrice({ active: true });
        const serviceError = { message: "Service DB update failed" };
        // Redefine mockService for this test to simulate service error
        updatePlanStatusSpy = spy(() => Promise.resolve({ error: serviceError }));
        mockService = { 
            updatePlanStatusByPriceId: updatePlanStatusSpy, 
            invokeSyncPlans: invokeSyncPlansSpy // Still use default success spy for invoke
        };

        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert - No error thrown
        assertSpyCalls(updatePlanStatusSpy, 1);
        assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripePriceId, true]);
        assertSpyCalls(invokeSyncPlansSpy, 0); // Invoke still not called
        assertSpyCalls(loggerInfoSpy, 1); // Start Handler log
        assertSpyCalls(loggerErrorSpy, 1); // Error logged by handler
        assertEquals(loggerErrorSpy.calls[0]?.args[0], `[handlePriceChange] Service reported error updating plan status for price ${stripePriceId}`);
    });

    it("should log error but not throw if service invoke fails (on price.created)", async () => {
        // Arrange
        const eventType = "price.created";
        const isTestMode = true;
        const mockPrice = createMockPrice({ active: true });
        const invokeError = { message: "Service invoke failed" };
        // Redefine mockService for this test
        invokeSyncPlansSpy = spy(() => Promise.resolve({ data: null, error: invokeError }));
        mockService = { 
            updatePlanStatusByPriceId: updatePlanStatusSpy, // Use default success spy for update
            invokeSyncPlans: invokeSyncPlansSpy 
        };
        
        // Act
        await handlePriceChange(mockService, mockStripeInstance, mockPrice, eventIdBase + eventType, eventType, isTestMode);

        // Assert - No error thrown
        assertSpyCalls(updatePlanStatusSpy, 1); // Update still called and succeeded
        assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripePriceId, true]);
        assertSpyCalls(invokeSyncPlansSpy, 1); // Invoke called
        assertEquals(invokeSyncPlansSpy.calls[0]!.args, [isTestMode]);
        assertSpyCalls(loggerInfoSpy, 3); // Start Handler, Update Success, Start Invoke logs
        assertSpyCalls(loggerErrorSpy, 1); // Error logged by handler about invoke failure
        assertEquals(loggerErrorSpy.calls[0]?.args[0], `[handlePriceChange] Service reported error invoking sync-stripe-plans function.`);
    });
}); 