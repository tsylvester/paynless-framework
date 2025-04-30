import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StripeApiClient } from './stripe.api';
import type { ApiResponse, SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics, ApiError as ApiErrorType } from '@paynless/types';
import { mockApiClient, resetMockApiClient } from './mocks/apiClient.mock';

// --- Test Suite ---
describe('StripeApiClient', () => {
    let stripeApiClient: StripeApiClient;

    beforeEach(() => {
        resetMockApiClient(); 
        
        stripeApiClient = new StripeApiClient(mockApiClient); 
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- Test Cases (Ensure assertions match ApiResponse structure) --- 

    it('should be defined', () => {
        expect(stripeApiClient).toBeDefined();
    });

    describe('createCheckoutSession', () => {
        const priceId = 'price_123';
        const isTestMode = false;
        const expectedEndpoint = 'api-subscriptions/checkout';

        it('should call the correct endpoint and return session ID on success', async () => {
            const mockResponseData = { sessionId: 'cs_test_123' };
            const mockApiResponse: ApiResponse<{ sessionId: string }> = { status: 200, data: mockResponseData };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode, undefined!, undefined!);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(
                expectedEndpoint, 
                { priceId, isTestMode, successUrl: undefined, cancelUrl: undefined }, 
                undefined 
            );
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.sessionId).toBe('cs_test_123');
        });

        it('should return ApiResponse with error on 400 Bad Request', async () => {
            const errorResponse: ApiErrorType = { code: 'INVALID_PRICE_ID', message: 'Invalid Stripe Price ID provided.' };
            const mockApiResponse: ApiResponse<any> = { status: 400, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode, undefined!, undefined!);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(
                expectedEndpoint, 
                { priceId, isTestMode, successUrl: undefined, cancelUrl: undefined }, 
                undefined
            );
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'STRIPE_API_DOWN', message: 'Stripe API is temporarily unavailable.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode, undefined!, undefined!);
            
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(
                expectedEndpoint, 
                { priceId, isTestMode, successUrl: undefined, cancelUrl: undefined }, 
                undefined
            );
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('createPortalSession', () => {
        const isTestMode = false;
        const expectedEndpoint = 'api-subscriptions/billing-portal';

        it('should call the correct endpoint and return portal URL on success', async () => {
            const mockResponseData = { url: 'https://billing.stripe.com/session/test_portal' };
            const mockApiResponse: ApiResponse<{ url: string }> = { status: 200, data: mockResponseData };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.createPortalSession(isTestMode, undefined!);
            
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, { isTestMode, returnUrl: undefined }, undefined); 
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.url).toBe('https://billing.stripe.com/session/test_portal');
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            const mockApiResponse: ApiResponse<any> = { status: 401, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.createPortalSession(isTestMode, undefined!);
            
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, { isTestMode, returnUrl: undefined }, undefined);
            expect(result.status).toBe(401);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'PORTAL_SESSION_FAILED', message: 'Could not create Stripe Portal session.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.createPortalSession(isTestMode, undefined!);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, { isTestMode, returnUrl: undefined }, undefined);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('getSubscriptionPlans', () => {
        const expectedEndpoint = 'api-subscriptions/plans';

        it('should call the correct endpoint and return plans on success', async () => {
            const mockPlans: Partial<SubscriptionPlan>[] = [
                { id: 'plan_1', name: 'Basic', amount: 1000, currency: 'usd', interval: 'month', stripePriceId: 'price_basic' }, 
                { id: 'plan_2', name: 'Pro', amount: 2500, currency: 'usd', interval: 'month', stripePriceId: 'price_pro' }, 
            ];
            const mockApiResponse: ApiResponse<SubscriptionPlan[]> = { status: 200, data: mockPlans as SubscriptionPlan[] };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getSubscriptionPlans();

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, undefined);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data).toHaveLength(2);
            expect(result.data?.[0].stripePriceId).toBe('price_basic'); 
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'PLANS_FETCH_FAILED', message: 'Could not fetch subscription plans.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getSubscriptionPlans();

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, undefined);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('getUserSubscription', () => {
        const expectedEndpoint = 'api-subscriptions/current';
        
        it('should call the correct endpoint (/current) and return subscription on success', async () => {
            const mockPlan: Partial<SubscriptionPlan> = { id: 'plan_1', name: 'Basic', amount: 1000, currency: 'usd', interval: 'month', stripePriceId: 'price_basic' };
            const mockSub: UserSubscription = { 
                id: 'sub_123', 
                userId: 'user-abc-from-token', 
                plan: mockPlan as SubscriptionPlan,
                status: 'active', 
                stripeSubscriptionId: 'stripe_sub_123', 
                stripeCustomerId: 'cus_123', 
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                cancelAtPeriodEnd: false,
            };
            const mockApiResponse: ApiResponse<UserSubscription> = { status: 200, data: mockSub };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getUserSubscription();

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, undefined);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.id).toBe('sub_123');
            expect(result.data?.plan.stripePriceId).toBe('price_basic');
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing or invalid token.' };
            const mockApiResponse: ApiResponse<any> = { status: 401, error: errorResponse };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getUserSubscription();

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, undefined);
            expect(result.status).toBe(401);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with 404 error if subscription not found', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Subscription not found.' };
            const mockApiResponse: ApiResponse<any> = { status: 404, error: errorResponse };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getUserSubscription();

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, undefined);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'DB_ERROR', message: 'Database error.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getUserSubscription();

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, undefined);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('cancelSubscription', () => {
        const subId = 'sub_12345';
        const expectedEndpoint = `api-subscriptions/${subId}/cancel`;
        
        it('should call the correct endpoint on success', async () => {
            const mockApiResponse: ApiResponse<null> = { status: 200, data: null }; 
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.cancelSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, {}, undefined); 
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing token.' };
            const mockApiResponse: ApiResponse<any> = { status: 401, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.cancelSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, {}, undefined);
            expect(result.status).toBe(401);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 404 Not Found', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Subscription not found.' };
            const mockApiResponse: ApiResponse<any> = { status: 404, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.cancelSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, {}, undefined);
            expect(result.status).toBe(404);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'STRIPE_ERROR', message: 'Stripe error.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.cancelSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(expectedEndpoint, {}, undefined);
            expect(result.status).toBe(500);
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('resumeSubscription', () => {
        const subId = 'sub_67890';
        const endpoint = `api-subscriptions/${subId}/resume`;
        
        it('should call the correct endpoint on success', async () => {
            const mockApiResponse: ApiResponse<void> = { status: 200, data: undefined }; 
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.resumeSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, {}, undefined);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing token.' };
            const mockApiResponse: ApiResponse<any> = { status: 401, error: errorResponse }; 
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse); 

            const result = await stripeApiClient.resumeSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, {}, undefined);
            expect(result.status).toBe(401);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 404 Not Found', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Subscription not found.' };
            const mockApiResponse: ApiResponse<any> = { status: 404, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse); 

            const result = await stripeApiClient.resumeSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, {}, undefined);
            expect(result.status).toBe(404);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'STRIPE_ERROR', message: 'Stripe error.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse); 
            
            const result = await stripeApiClient.resumeSubscription(subId);

            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith(endpoint, {}, undefined);
            expect(result.status).toBe(500);
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('getUsageMetrics', () => {
        const metric = 'ai_tokens';
        const endpoint = `api-subscriptions/usage/${metric}`;

        it('should call the correct endpoint and return metrics on success', async () => {
            const mockUsage: SubscriptionUsageMetrics = { 
                current: 100, 
                limit: 1000, 
            };
            const mockApiResponse: ApiResponse<SubscriptionUsageMetrics> = { status: 200, data: mockUsage };
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse);

            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(endpoint, undefined);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.current).toBe(100);
            expect(result.data?.limit).toBe(1000);
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing token.' };
            const mockApiResponse: ApiResponse<any> = { status: 401, error: errorResponse }; 
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse); 

            const result = await stripeApiClient.getUsageMetrics(metric);

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(endpoint, undefined);
            expect(result.status).toBe(401);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 404 Not Found (e.g., invalid metric)', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Metric not found.' };
            const mockApiResponse: ApiResponse<any> = { status: 404, error: errorResponse }; 
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse); 

            const result = await stripeApiClient.getUsageMetrics(metric);

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(endpoint, undefined);
            expect(result.status).toBe(404);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'DB_ERROR', message: 'Database error fetching usage.' };
            const mockApiResponse: ApiResponse<any> = { status: 500, error: errorResponse }; 
            vi.mocked(mockApiClient.get).mockResolvedValue(mockApiResponse); 

            const result = await stripeApiClient.getUsageMetrics(metric);

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith(endpoint, undefined);
            expect(result.status).toBe(500);
            expect(result.error).toEqual(errorResponse);
        });
    });

}); 