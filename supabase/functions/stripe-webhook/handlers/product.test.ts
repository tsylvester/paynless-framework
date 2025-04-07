import { assertEquals, assertExists } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { spy, assertSpyCalls, assertSpyCall, type Spy } from "jsr:@std/testing/mock";
import Stripe from "npm:stripe";
import { 
    handleProductUpdated,
    handleProductCreated 
} from "./product.ts";
import { ISupabaseProductWebhookService } from "../services/product_webhook_service.ts";
import { logger } from "@paynless/utils";

// --- Mocks & Spies ---
let mockService: ISupabaseProductWebhookService;
let mockStripeInstance: Stripe;

// Spies for service methods
let updatePlanStatusSpy: Spy;
let invokeSyncPlansSpy: Spy;

// --- Test Data ---
const eventId = "evt_prod_test_123";
const stripeProductId = "prod_test_abc";

const createMockProduct = (overrides: Partial<Stripe.Product> = {}): Stripe.Product => ({
    id: stripeProductId,
    object: 'product',
    active: true, // Default to active
    name: 'Test Product',
    ...overrides,
} as Stripe.Product);

// --- Logger Mocking ---
let loggerInfoSpy: Spy, loggerErrorSpy: Spy;

beforeEach(() => {
    mockStripeInstance = {} as Stripe;
    loggerInfoSpy = spy(logger, 'info');
    loggerErrorSpy = spy(logger, 'error');
});

afterEach(() => {
    loggerInfoSpy.restore();
    loggerErrorSpy.restore();
});


// --- Test Suite ---
describe("Stripe Webhook Product Handlers", () => {

    // --- handleProductUpdated Tests ---
    describe("handleProductUpdated", () => {
        const eventType = "product.updated";

        it("should call updatePlanStatus with active: false when product is deactivated", async () => {
            // Arrange
            const mockProduct = createMockProduct({ active: false });
            updatePlanStatusSpy = spy(() => Promise.resolve({ error: null })); // Mock service success
            mockService = { 
                updatePlanStatus: updatePlanStatusSpy, 
                invokeSyncPlans: spy() // Dummy method
            };

            // Act
            await handleProductUpdated(mockService, mockStripeInstance, mockProduct, eventId, eventType);

            // Assert
            assertSpyCalls(updatePlanStatusSpy, 1);
            assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripeProductId, false]);
            assertSpyCalls(loggerInfoSpy, 2); // Start and End logs
            assertSpyCalls(loggerErrorSpy, 0);
        });

        it("should call updatePlanStatus with active: true when product is activated", async () => {
            // Arrange
            const mockProduct = createMockProduct({ active: true });
            updatePlanStatusSpy = spy(() => Promise.resolve({ error: null })); // Mock service success
            mockService = { 
                updatePlanStatus: updatePlanStatusSpy, 
                invokeSyncPlans: spy()
            };

            // Act
            await handleProductUpdated(mockService, mockStripeInstance, mockProduct, eventId, eventType);

            // Assert
            assertSpyCalls(updatePlanStatusSpy, 1);
            assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripeProductId, true]);
            assertSpyCalls(loggerInfoSpy, 2);
            assertSpyCalls(loggerErrorSpy, 0);
        });

        it("should log error but not throw if service reports update error", async () => {
            // Arrange
            const mockProduct = createMockProduct({ active: false });
            const serviceError = { message: "Service DB update failed" };
            updatePlanStatusSpy = spy(() => Promise.resolve({ error: serviceError })); // Mock service failure
            mockService = { 
                updatePlanStatus: updatePlanStatusSpy, 
                invokeSyncPlans: spy() 
            };

            // Act
            await handleProductUpdated(mockService, mockStripeInstance, mockProduct, eventId, eventType);

            // Assert - No error thrown
            assertSpyCalls(updatePlanStatusSpy, 1);
            assertEquals(updatePlanStatusSpy.calls[0]!.args, [stripeProductId, false]);
            assertSpyCalls(loggerInfoSpy, 1); // Only the initial log
            assertSpyCalls(loggerErrorSpy, 1); // Error logged by handler
            assertEquals(loggerErrorSpy.calls[0]?.args[0], `[handleProductUpdated] Service reported error updating plan status for product ${stripeProductId}`);
        });
    });

    // --- handleProductCreated Tests ---
    describe("handleProductCreated", () => {
        const eventType = "product.created";
        const mockProduct = createMockProduct();

        it("should call invokeSyncPlans with isTestMode: true", async () => {
            // Arrange
            const isTestMode = true;
            invokeSyncPlansSpy = spy(() => Promise.resolve({ data: { message: "Sync successful" }, error: null })); // Mock service success
            mockService = { 
                updatePlanStatus: spy(), // Dummy method
                invokeSyncPlans: invokeSyncPlansSpy 
            };

            // Act
            await handleProductCreated(mockService, mockStripeInstance, mockProduct, eventId, eventType, isTestMode);

            // Assert
            assertSpyCalls(invokeSyncPlansSpy, 1);
            assertEquals(invokeSyncPlansSpy.calls[0]!.args, [true]);
            assertSpyCalls(loggerInfoSpy, 2); // Start and Success logs
            assertSpyCalls(loggerErrorSpy, 0);
        });

        it("should call invokeSyncPlans with isTestMode: false", async () => {
             // Arrange
            const isTestMode = false;
            invokeSyncPlansSpy = spy(() => Promise.resolve({ data: { message: "Sync successful" }, error: null })); // Mock service success
            mockService = { 
                updatePlanStatus: spy(), 
                invokeSyncPlans: invokeSyncPlansSpy 
            };

            // Act
            await handleProductCreated(mockService, mockStripeInstance, mockProduct, eventId, eventType, isTestMode);

            // Assert
            assertSpyCalls(invokeSyncPlansSpy, 1);
            assertEquals(invokeSyncPlansSpy.calls[0]!.args, [false]);
            assertSpyCalls(loggerInfoSpy, 2); 
            assertSpyCalls(loggerErrorSpy, 0);
        });

        it("should log error but not throw if service reports invoke error", async () => {
            // Arrange
            const invokeError = { message: "Service invoke failed" };
            const isTestMode = true;
            invokeSyncPlansSpy = spy(() => Promise.resolve({ data: null, error: invokeError })); // Mock service failure
            mockService = { 
                updatePlanStatus: spy(), 
                invokeSyncPlans: invokeSyncPlansSpy 
            };

            // Act
            await handleProductCreated(mockService, mockStripeInstance, mockProduct, eventId, eventType, isTestMode);

            // Assert - No error thrown
            assertSpyCalls(invokeSyncPlansSpy, 1);
            assertEquals(invokeSyncPlansSpy.calls[0]!.args, [true]);
            assertSpyCalls(loggerInfoSpy, 1); // Start log
            assertSpyCalls(loggerErrorSpy, 1); // Error logged by handler
            assertEquals(loggerErrorSpy.calls[0]?.args[0], `[handleProductCreated] Service reported error invoking sync-stripe-plans function.`);
        });

        // Note: The case where the service *itself* throws an exception 
        // (e.g., network error during invoke) isn't directly tested here, 
        // as the service implementation catches it and returns an error object.
        // Testing that catch block would be part of the service's own unit tests.
    });
}); 