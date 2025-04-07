import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { StripeApiClient } from './stripe.api';
import { initializeApiClient, ApiError, _resetApiClient } from './apiClient';
import type { ApiResponse, SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics } from '@paynless/types';
import { server } from './setupTests';

// --- Mock Server Setup (MSW) ---
const BASE_URL = 'http://localhost/api'; 

const stripeApiHandlers = [
    http.post(`${BASE_URL}/api-subscriptions/checkout`, async () => {
        return HttpResponse.json<ApiResponse<{ sessionId: string }>>({ status: 200, data: { sessionId: 'cs_test_123' } });
    }),
    http.post(`${BASE_URL}/api-subscriptions/billing-portal`, async () => {
        return HttpResponse.json<ApiResponse<{ url: string }>>({ status: 200, data: { url: 'https://billing.stripe.com/session/test_portal' } });
    }),
    http.get(`${BASE_URL}/api-subscriptions/plans`, async () => {
        const mockPlans: Partial<SubscriptionPlan>[] = [
            { id: 'plan_1', name: 'Basic', amount: 1000, currency: 'usd', interval: 'month', stripePriceId: 'price_basic' }, 
            { id: 'plan_2', name: 'Pro', amount: 2500, currency: 'usd', interval: 'month', stripePriceId: 'price_pro' }, 
        ];
        return HttpResponse.json<ApiResponse<SubscriptionPlan[]>>({ status: 200, data: mockPlans as SubscriptionPlan[] });
    }),
    http.get(`${BASE_URL}/api-subscriptions/current`, async () => { 
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
        return HttpResponse.json<ApiResponse<UserSubscription>>({ status: 200, data: mockSub });
    }),
    http.post(`${BASE_URL}/api-subscriptions/:subId/cancel`, async () => { 
        return HttpResponse.json<ApiResponse<void>>({ status: 200, data: undefined });
    }),
    http.post(`${BASE_URL}/api-subscriptions/:subId/resume`, async () => { 
        return HttpResponse.json<ApiResponse<void>>({ status: 200, data: undefined });
    }),
    http.get(`${BASE_URL}/api-subscriptions/usage/:metric`, async ({ params }) => { 
        const mockUsage: SubscriptionUsageMetrics = { 
            current: 100, 
            limit: 1000, 
        };
        return HttpResponse.json<ApiResponse<SubscriptionUsageMetrics>>({ status: 200, data: mockUsage });
    }),
];

// --- Test Suite ---
describe('StripeApiClient', () => {
    let stripeApiClient: StripeApiClient;
    const mockGetToken = vi.fn(() => 'mock-jwt-token');

    beforeEach(() => {
        _resetApiClient(); 
        initializeApiClient({ baseUrl: BASE_URL, supabaseAnonKey: 'test-anon-key' }); 
        stripeApiClient = new StripeApiClient(mockGetToken);
        server.resetHandlers();
        server.use(...stripeApiHandlers);
        mockGetToken.mockClear();
    });

    afterEach(() => {
        server.resetHandlers();
        _resetApiClient();
    });

    // --- Test Cases --- 

    it('should be defined', () => {
        expect(stripeApiClient).toBeDefined();
    });

    describe('createCheckoutSession', () => {
        const endpoint = `${BASE_URL}/api-subscriptions/checkout`;
        const priceId = 'price_123';
        const isTestMode = false;

        it('should call the correct endpoint and return session ID on success', async () => {
            // No override needed, uses default handler
            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.sessionId).toBe('cs_test_123');
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

        it('should return ApiError on 400 Bad Request', async () => {
            const errorResponse = { code: 'INVALID_PRICE_ID', message: 'Invalid Stripe Price ID provided.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 400 })
                )
            );

            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode);

            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1); // Token is still retrieved even if API fails
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'STRIPE_API_DOWN', message: 'Stripe API is temporarily unavailable.' };
             server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );

            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode);

            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('createPortalSession', () => {
        const endpoint = `${BASE_URL}/api-subscriptions/billing-portal`;
        const isTestMode = false;

        it('should call the correct endpoint and return portal URL on success', async () => {
            const result = await stripeApiClient.createPortalSession(isTestMode);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.url).toBe('https://billing.stripe.com/session/test_portal');
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

        it('should return ApiError on 401 Unauthorized', async () => {
            const errorResponse = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 401 })
                )
            );

            const result = await stripeApiClient.createPortalSession(isTestMode);

            expect(result.status).toBe(401);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1); // Still called getToken
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'PORTAL_SESSION_FAILED', message: 'Could not create Stripe Portal session.' };
             server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );

            const result = await stripeApiClient.createPortalSession(isTestMode);

            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('getSubscriptionPlans', () => {
        const endpoint = `${BASE_URL}/api-subscriptions/plans`;

        it('should call the correct endpoint and return plans on success', async () => {
            // Uses default handler
            const result = await stripeApiClient.getSubscriptionPlans();
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data).toHaveLength(2);
            expect(result.data?.[0].stripePriceId).toBe('price_basic'); 
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'PLANS_FETCH_FAILED', message: 'Could not fetch subscription plans.' };
             server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );

            const result = await stripeApiClient.getSubscriptionPlans();

            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('getUserSubscription', () => {
        const endpoint = `${BASE_URL}/api-subscriptions/current`;
        const userId = 'user-abc'; // Not actually used in endpoint path, but passed to method

        it('should call the correct endpoint (/current) and return subscription on success', async () => {
            // Uses default handler
            const result = await stripeApiClient.getUserSubscription(userId);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.id).toBe('sub_123');
            expect(result.data?.stripeSubscriptionId).toBe('stripe_sub_123');
            expect(mockGetToken).toHaveBeenCalledTimes(1); 
        });

        it('should return ApiError on 401 Unauthorized', async () => {
            const errorResponse = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 401 })
                )
            );

            const result = await stripeApiClient.getUserSubscription(userId);

            expect(result.status).toBe(401);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1); // Still called getToken
        });

         it('should return ApiError with 404 status if subscription not found', async () => {
            // Simulate backend returning a 404 if no subscription exists for the user (identified by token)
            const errorResponse = { code: 'NOT_FOUND', message: 'User subscription not found.' };
            server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 404 })
                )
            );

            const result = await stripeApiClient.getUserSubscription(userId);

            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'DB_ERROR', message: 'Database error fetching subscription.' };
             server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );

            const result = await stripeApiClient.getUserSubscription(userId);

            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe(errorResponse.code);
            expect(result.error?.message).toBe(errorResponse.message);
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('cancelSubscription', () => {
        const subId = 'sub_xyz';
        const endpoint = `${BASE_URL}/api-subscriptions/${subId}/cancel`;

        it('should call the correct endpoint on success', async () => {
            // Uses default handler
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data).toBeUndefined();
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

        it('should return ApiError on 401 Unauthorized', async () => {
            const errorResponse = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 401 })
                )
            );
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(401);
            expect(result.error?.code).toBe(errorResponse.code);
        });

        it('should return ApiError on 404 Not Found', async () => {
            const errorResponse = { code: 'SUB_NOT_FOUND', message: 'Subscription not found.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 404 })
                )
            );
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(404);
            expect(result.error?.code).toBe(errorResponse.code);
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'STRIPE_ERROR', message: 'Stripe API error during cancellation.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(500);
            expect(result.error?.code).toBe(errorResponse.code);
        });
    });

    describe('resumeSubscription', () => {
        const subId = 'sub_xyz';
        const endpoint = `${BASE_URL}/api-subscriptions/${subId}/resume`;

        it('should call the correct endpoint on success', async () => {
            // Uses default handler
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data).toBeUndefined();
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

        it('should return ApiError on 401 Unauthorized', async () => {
            const errorResponse = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 401 })
                )
            );
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(401);
            expect(result.error?.code).toBe(errorResponse.code);
        });

        it('should return ApiError on 404 Not Found', async () => {
            const errorResponse = { code: 'SUB_NOT_FOUND', message: 'Subscription not found.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 404 })
                )
            );
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(404);
            expect(result.error?.code).toBe(errorResponse.code);
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'STRIPE_ERROR', message: 'Stripe API error during resume.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(500);
            expect(result.error?.code).toBe(errorResponse.code);
        });
    });

    describe('getUsageMetrics', () => {
        const metric = 'api_calls';
        const endpoint = `${BASE_URL}/api-subscriptions/usage/${metric}`;

        it('should call the correct endpoint and return metrics on success', async () => {
            // Uses default handler
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.current).toBe(100);
            expect(result.data?.limit).toBe(1000);
            expect(mockGetToken).toHaveBeenCalledTimes(1);
        });

         it('should return ApiError on 401 Unauthorized', async () => {
            const errorResponse = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 401 })
                )
            );
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(401);
            expect(result.error?.code).toBe(errorResponse.code);
        });

         it('should return ApiError on 404 Not Found (e.g., invalid metric)', async () => {
            const errorResponse = { code: 'METRIC_NOT_FOUND', message: 'Usage metric not found.' };
            server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 404 })
                )
            );
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(404);
            expect(result.error?.code).toBe(errorResponse.code);
        });

        it('should return ApiError on 500 Internal Server Error', async () => {
            const errorResponse = { code: 'USAGE_FETCH_ERROR', message: 'Could not fetch usage data.' };
            server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(500);
            expect(result.error?.code).toBe(errorResponse.code);
        });
    });
}); 