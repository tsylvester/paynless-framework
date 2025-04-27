import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { StripeApiClient } from './stripe.api';
import { ApiClient } from './apiClient';
import type { ApiResponse, SubscriptionPlan, UserSubscription, SubscriptionUsageMetrics, ApiError as ApiErrorType } from '@paynless/types';
import { server } from './setupTests';
import { createClient } from '@supabase/supabase-js';

// --- Mock URLs & Token ---
const MOCK_SUPABASE_URL = 'http://localhost/api';
const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;
const MOCK_ANON_KEY = 'mock-stripe-test-anon-key';
const MOCK_ACCESS_TOKEN = 'mock-stripe-test-access-token';

// Mock the @supabase/supabase-js module for the ApiClient instantiation
vi.mock('@supabase/supabase-js', () => {
  const mockAuth = {
    getSession: vi.fn(),
  };
  const mockClient = {
    auth: mockAuth,
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
  return {
    createClient: vi.fn(() => mockClient),
    SupabaseClient: vi.fn(),
  };
});

// --- Mock Handlers (using MOCK_FUNCTIONS_URL) ---
const stripeApiHandlers = [
    http.post(`${MOCK_FUNCTIONS_URL}/api-subscriptions/checkout`, async () => {
        return HttpResponse.json({ sessionId: 'cs_test_123' }); // Return data directly for success
    }),
    http.post(`${MOCK_FUNCTIONS_URL}/api-subscriptions/billing-portal`, async () => {
        return HttpResponse.json({ url: 'https://billing.stripe.com/session/test_portal' });
    }),
    http.get(`${MOCK_FUNCTIONS_URL}/api-subscriptions/plans`, async () => {
        const mockPlans: Partial<SubscriptionPlan>[] = [
            { id: 'plan_1', name: 'Basic', amount: 1000, currency: 'usd', interval: 'month', stripePriceId: 'price_basic' }, 
            { id: 'plan_2', name: 'Pro', amount: 2500, currency: 'usd', interval: 'month', stripePriceId: 'price_pro' }, 
        ];
        return HttpResponse.json(mockPlans as SubscriptionPlan[]); // Return data directly
    }),
    http.get(`${MOCK_FUNCTIONS_URL}/api-subscriptions/current`, async () => { 
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
        return HttpResponse.json(mockSub); // Return data directly
    }),
    http.post(`${MOCK_FUNCTIONS_URL}/api-subscriptions/:subId/cancel`, async () => { 
        return new HttpResponse(null, { status: 200 }); // Return empty success
    }),
    http.post(`${MOCK_FUNCTIONS_URL}/api-subscriptions/:subId/resume`, async () => { 
        return new HttpResponse(null, { status: 200 }); // Return empty success
    }),
    http.get(`${MOCK_FUNCTIONS_URL}/api-subscriptions/usage/:metric`, async (/* { params } */) => {
        const mockUsage: SubscriptionUsageMetrics = { 
            current: 100, 
            limit: 1000, 
        };
        return HttpResponse.json(mockUsage); // Return data directly
    }),
];

// --- Test Suite ---
describe('StripeApiClient', () => {
    let stripeApiClient: StripeApiClient;
    let apiClientInstance: ApiClient;
    let mockSupabaseClient: ReturnType<typeof createClient>;

    beforeEach(() => {
        vi.clearAllMocks();

        const mockAuth = {
            getSession: vi.fn().mockResolvedValue({
                data: {
                    session: { access_token: MOCK_ACCESS_TOKEN }
                },
                error: null
            }),
        };
        mockSupabaseClient = {
            auth: mockAuth,
            channel: vi.fn().mockReturnThis(),
            removeChannel: vi.fn(),
        } as unknown as ReturnType<typeof createClient>;

        apiClientInstance = new ApiClient({
            supabase: mockSupabaseClient,
            supabaseUrl: MOCK_SUPABASE_URL,
            supabaseAnonKey: MOCK_ANON_KEY,
        });

        stripeApiClient = apiClientInstance.billing;

        server.resetHandlers();
        server.use(...stripeApiHandlers);
    });

    afterEach(() => {
        server.resetHandlers();
    });

    // --- Test Cases (Ensure assertions match ApiResponse structure) --- 

    it('should be defined', () => {
        expect(stripeApiClient).toBeDefined();
    });

    describe('createCheckoutSession', () => {
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/checkout`;
        const priceId = 'price_123';
        const isTestMode = false;

        it('should call the correct endpoint and return session ID on success', async () => {
            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.sessionId).toBe('cs_test_123');
        });

        it('should return ApiResponse with error on 400 Bad Request', async () => {
            const errorResponse: ApiErrorType = { code: 'INVALID_PRICE_ID', message: 'Invalid Stripe Price ID provided.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 400 })
                )
            );
            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'STRIPE_API_DOWN', message: 'Stripe API is temporarily unavailable.' };
             server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );
            const result = await stripeApiClient.createCheckoutSession(priceId, isTestMode);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('createPortalSession', () => {
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/billing-portal`;
        const isTestMode = false;

        it('should call the correct endpoint and return portal URL on success', async () => {
            const result = await stripeApiClient.createPortalSession(isTestMode);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.url).toBe('https://billing.stripe.com/session/test_portal');
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token.' };
            server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 401 })
                )
            );
            const result = await stripeApiClient.createPortalSession(isTestMode);
            expect(result.status).toBe(401);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'PORTAL_SESSION_FAILED', message: 'Could not create Stripe Portal session.' };
             server.use(
                http.post(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );
            const result = await stripeApiClient.createPortalSession(isTestMode);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('getSubscriptionPlans', () => {
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/plans`;

        it('should call the correct endpoint and return plans on success', async () => {
            const result = await stripeApiClient.getSubscriptionPlans();
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data).toHaveLength(2);
            expect(result.data?.[0].stripePriceId).toBe('price_basic'); 
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'PLANS_FETCH_FAILED', message: 'Could not fetch subscription plans.' };
             server.use(
                http.get(endpoint, () => 
                    HttpResponse.json(errorResponse, { status: 500 })
                )
            );
            const result = await stripeApiClient.getSubscriptionPlans();
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('getUserSubscription', () => {
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/current`;
        
        it('should call the correct endpoint (/current) and return subscription on success', async () => {
            const result = await stripeApiClient.getUserSubscription();
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.id).toBe('sub_123');
            expect(result.data?.plan.stripePriceId).toBe('price_basic');
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
             const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing or invalid token.' };
             server.use(http.get(endpoint, () => HttpResponse.json(errorResponse, { status: 401 })));
             const result = await stripeApiClient.getUserSubscription();
             expect(result.status).toBe(401);
             expect(result.data).toBeUndefined();
             expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with 404 error if subscription not found', async () => {
             const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Subscription not found.' };
             server.use(http.get(endpoint, () => HttpResponse.json(errorResponse, { status: 404 })));
             const result = await stripeApiClient.getUserSubscription();
             expect(result.status).toBe(404);
             expect(result.data).toBeUndefined();
             expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'DB_ERROR', message: 'Database error.' };
            server.use(http.get(endpoint, () => HttpResponse.json(errorResponse, { status: 500 })));
            const result = await stripeApiClient.getUserSubscription();
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('cancelSubscription', () => {
        const subId = 'sub_12345';
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/${subId}/cancel`;
        
        it('should call the correct endpoint on success', async () => {
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing token.' };
            server.use(http.post(endpoint, () => HttpResponse.json(errorResponse, { status: 401 })));
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(401);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 404 Not Found', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Subscription not found.' };
            server.use(http.post(endpoint, () => HttpResponse.json(errorResponse, { status: 404 })));
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(404);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'STRIPE_ERROR', message: 'Stripe error.' };
            server.use(http.post(endpoint, () => HttpResponse.json(errorResponse, { status: 500 })));
            const result = await stripeApiClient.cancelSubscription(subId);
            expect(result.status).toBe(500);
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('resumeSubscription', () => {
        const subId = 'sub_67890';
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/${subId}/resume`;
        
        it('should call the correct endpoint on success', async () => {
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing token.' };
            server.use(http.post(endpoint, () => HttpResponse.json(errorResponse, { status: 401 })));
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(401);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 404 Not Found', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Subscription not found.' };
            server.use(http.post(endpoint, () => HttpResponse.json(errorResponse, { status: 404 })));
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(404);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'STRIPE_ERROR', message: 'Stripe error.' };
            server.use(http.post(endpoint, () => HttpResponse.json(errorResponse, { status: 500 })));
            const result = await stripeApiClient.resumeSubscription(subId);
            expect(result.status).toBe(500);
            expect(result.error).toEqual(errorResponse);
        });
    });

    describe('getUsageMetrics', () => {
        const metric = 'ai_tokens';
        const endpoint = `${MOCK_FUNCTIONS_URL}/api-subscriptions/usage/${metric}`;

        it('should call the correct endpoint and return metrics on success', async () => {
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
            expect(result.data?.current).toBe(100);
            expect(result.data?.limit).toBe(1000);
        });

        it('should return ApiResponse with error on 401 Unauthorized', async () => {
            const errorResponse: ApiErrorType = { code: 'UNAUTHORIZED', message: 'Missing token.' };
            server.use(http.get(endpoint, () => HttpResponse.json(errorResponse, { status: 401 })));
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(401);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 404 Not Found (e.g., invalid metric)', async () => {
            const errorResponse: ApiErrorType = { code: 'NOT_FOUND', message: 'Metric not found.' };
            server.use(http.get(endpoint, () => HttpResponse.json(errorResponse, { status: 404 })));
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(404);
            expect(result.error).toEqual(errorResponse);
        });

        it('should return ApiResponse with error on 500 Internal Server Error', async () => {
            const errorResponse: ApiErrorType = { code: 'DB_ERROR', message: 'Database error fetching usage.' };
            server.use(http.get(endpoint, () => HttpResponse.json(errorResponse, { status: 500 })));
            const result = await stripeApiClient.getUsageMetrics(metric);
            expect(result.status).toBe(500);
            expect(result.error).toEqual(errorResponse);
        });
    });

}); 