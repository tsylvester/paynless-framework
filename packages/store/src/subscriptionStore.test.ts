// src/subscriptionStore.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSubscriptionStore } from './subscriptionStore';
import { act } from '@testing-library/react';
import type { UserSubscription, SubscriptionPlan, SubscriptionUsageMetrics, ApiResponse, ApiError as ApiErrorType, User, Session } from '@paynless/types';
import { api, initializeApiClient, _resetApiClient } from '@paynless/api';
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore'; // Import auth store
import {
    mockStripeGetSubscriptionPlans,
    mockStripeGetUserSubscription,
    mockStripeCreateCheckoutSession,
    mockStripeCreatePortalSession,
    mockStripeCancelSubscription,
    mockStripeResumeSubscription,
    mockStripeGetUsageMetrics,
    resetStripeMocks, // Import the reset function
} from '@paynless/api/mocks/stripe.mock';

// --- Mocks ---
// Mock the API functions *directly* via the mock file functions
vi.mock('@paynless/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api')>();
  return {
    ...actual, // Keep original exports like initializeApiClient, _resetApiClient
    // Mock the api.billing() functions by assigning our imported mocks
    api: {
      ...actual.api, // Keep other api parts if needed (like .get, .post etc if not mocked)
      billing: vi.fn(() => ({ // Ensure api.billing returns an object with mock functions
        getSubscriptionPlans: mockStripeGetSubscriptionPlans,
        getUserSubscription: mockStripeGetUserSubscription,
        createCheckoutSession: mockStripeCreateCheckoutSession,
        createPortalSession: mockStripeCreatePortalSession,
        cancelSubscription: mockStripeCancelSubscription,
        resumeSubscription: mockStripeResumeSubscription,
        getUsageMetrics: mockStripeGetUsageMetrics,
      })),
      // Mock other api parts if necessary (e.g., ai)
      ai: vi.fn(() => ({ /* mock ai functions here */ })),
    },
  };
});

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper to reset Zustand store state between tests
const resetSubscriptionStore = () => useSubscriptionStore.setState(useSubscriptionStore.getInitialState(), true);
const resetAuthStore = () => useAuthStore.setState(useAuthStore.getInitialState(), true);

// Mock data
const mockSubscription: UserSubscription = {
    id: "sub_123",
    userId: "user_abc",
    status: "active",
    planId: "plan_xyz",
    stripeCustomerId: "cus_abc",
    stripeSubscriptionId: "sub_ext_123",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: {
        id: "plan_xyz",
        name: "Pro Plan",
        amount: 1000,
        currency: "usd",
        interval: "month",
        stripePriceId: "price_abc",
        active: true,
    }
};

const mockPlans: SubscriptionPlan[] = [
    { id: 'plan_abc', name: 'Basic', stripePriceId: 'price_basic', amount: 500, currency: 'usd', interval: 'month', active: true },
    { id: 'plan_xyz', name: 'Pro', stripePriceId: 'price_pro', amount: 1000, currency: 'usd', interval: 'month', active: true },
];

const mockUser: Partial<User> = { id: 'user_abc', email: 'test@example.com' };
const mockSession: Partial<Session> = { access_token: 'mock-token' };

describe('SubscriptionStore', () => {
  beforeEach(() => {
    act(() => {
      resetSubscriptionStore();
      resetAuthStore();
      // Initialize the API client before each test
      initializeApiClient({ 
        supabaseUrl: 'http://dummy.url', 
        supabaseAnonKey: 'dummy-key' 
      });
    });
    resetStripeMocks(); // Reset the Stripe mock functions
    vi.clearAllMocks(); // Clear Vitest mocks
  });

  afterEach(() => {
     // Reset the API client singleton after each test
     _resetApiClient(); 
  });

  it('should have correct initial state', () => {
    const { userSubscription, availablePlans, isSubscriptionLoading, hasActiveSubscription, isTestMode, error } = useSubscriptionStore.getState();
    expect(userSubscription).toBeNull();
    expect(availablePlans).toEqual([]);
    expect(isSubscriptionLoading).toBe(false);
    expect(hasActiveSubscription).toBe(false);
    expect(isTestMode).toBe(false);
    expect(error).toBeNull();
  });

  // --- Test Direct Setters ---
  it('setUserSubscription should update userSubscription and hasActiveSubscription', () => {
    act(() => {
      useSubscriptionStore.getState().setUserSubscription(mockSubscription);
    });
    expect(useSubscriptionStore.getState().userSubscription).toEqual(mockSubscription);
    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(true);

    act(() => {
      useSubscriptionStore.getState().setUserSubscription(null);
    });
    expect(useSubscriptionStore.getState().userSubscription).toBeNull();
    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(false);
  });

  it('setAvailablePlans should update availablePlans state', () => {
    act(() => {
      useSubscriptionStore.getState().setAvailablePlans(mockPlans);
    });
    expect(useSubscriptionStore.getState().availablePlans).toEqual(mockPlans);
  });

  it('setIsLoading should update isSubscriptionLoading state', () => {
    act(() => {
      useSubscriptionStore.getState().setIsLoading(true);
    });
    expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(true);
  });

  it('setError should update error state', () => {
    const testError = new Error('Subscription Test Error');
    act(() => {
      useSubscriptionStore.getState().setError(testError);
    });
    expect(useSubscriptionStore.getState().error).toEqual(testError);
  });

  // --- Test Refactored Async Actions ---

  // Helper to set authenticated state
  const setAuthenticated = () => {
     act(() => {
       useAuthStore.setState({ user: mockUser as User, session: mockSession as Session });
     });
  }

  // Test loadSubscriptionData
  describe('loadSubscriptionData action', () => {
     it('should fetch plans and subscription, updating state on success', async () => {
        setAuthenticated();
        // Use imported mock functions
        mockStripeGetSubscriptionPlans.mockResolvedValue({ data: mockPlans, error: null });
        mockStripeGetUserSubscription.mockResolvedValue({ data: mockSubscription, error: null });

        await act(async () => {
            await useSubscriptionStore.getState().loadSubscriptionData();
        });

        expect(mockStripeGetSubscriptionPlans).toHaveBeenCalled();
        expect(mockStripeGetUserSubscription).toHaveBeenCalled();
        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.availablePlans).toEqual(mockPlans);
        expect(state.userSubscription).toEqual(mockSubscription);
        expect(state.hasActiveSubscription).toBe(true);
        expect(state.error).toBeNull();
     });

     it('should set error state if fetching plans fails', async () => {
        setAuthenticated();
        const plansError = { message: 'Failed to get plans', code: 'ERR_PLAN' };
        // Use imported mock functions
        mockStripeGetSubscriptionPlans.mockResolvedValue({ data: null, error: plansError as ApiErrorType });
        mockStripeGetUserSubscription.mockResolvedValue({ data: mockSubscription, error: null });

        await act(async () => {
           await useSubscriptionStore.getState().loadSubscriptionData();
        });

        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain(plansError.message);
        expect(state.availablePlans).toEqual([]);
     });

     it('should handle null subscription without error', async () => {
        setAuthenticated();
        // Use imported mock functions
        mockStripeGetSubscriptionPlans.mockResolvedValue({ data: mockPlans, error: null });
        mockStripeGetUserSubscription.mockResolvedValue({ data: null, error: { message: 'Not found', code: 404 } });

        await act(async () => {
            await useSubscriptionStore.getState().loadSubscriptionData();
        });

        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.availablePlans).toEqual(mockPlans);
        expect(state.userSubscription).toBeNull();
        expect(state.hasActiveSubscription).toBe(false);
        expect(state.error).toBeNull();
     });

     it('should not fetch if user is not authenticated', async () => {
        act(() => { resetAuthStore(); });

        await act(async () => {
            await useSubscriptionStore.getState().loadSubscriptionData();
        });

        expect(mockStripeGetSubscriptionPlans).not.toHaveBeenCalled();
        expect(mockStripeGetUserSubscription).not.toHaveBeenCalled();
        expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(false);
     });

    // --- NEW: Test for loadSubscriptionData when both API calls fail ---
    it('should set error state if both fetching plans and subscription fail', async () => {
      setAuthenticated();
      const plansError = { message: 'Failed to get plans' };
      const subError = { message: 'Failed to get subscription' };
      mockStripeGetSubscriptionPlans.mockResolvedValue({ data: null, error: plansError as ApiErrorType });
      mockStripeGetUserSubscription.mockResolvedValue({ data: null, error: subError as ApiErrorType });

      await act(async () => {
         await useSubscriptionStore.getState().loadSubscriptionData();
      });

      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      // Check if error message combines both or prioritizes one (based on implementation)
      // Assuming Promise.allSettled or similar, it might contain both
      expect(state.error?.message).toContain(plansError.message);
      // OR check for a combined message if the store does that.
      expect(state.availablePlans).toEqual([]);
      expect(state.userSubscription).toBeNull();
   });
   // --- End NEW test ---
  });

  describe('createCheckoutSession action', () => {
    const priceId = 'price_abc';
    const mockSessionUrl = 'http://localhost/checkout/sess_test_123'; // Define mock URL

    it('should set loading, call API, return session URL, and clear state on success', async () => {
      setAuthenticated();
      // Correct the mock to return sessionUrl
      mockStripeCreateCheckoutSession.mockResolvedValue({ data: { sessionUrl: mockSessionUrl }, error: null });

      let resultSessionUrl: string | null = null;
      await act(async () => {
        resultSessionUrl = await useSubscriptionStore.getState().createCheckoutSession(priceId);
      });

      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeNull();
      // Verify the call includes success/cancel URLs derived from window.location.origin
      expect(mockStripeCreateCheckoutSession).toHaveBeenCalledWith(
          priceId, 
          false, // isTestMode (defaulted)
          'http://localhost:3000/subscriptionsuccess', // Expected successUrl
          'http://localhost:3000/', // Expected cancelUrl
          { token: mockSession.access_token } // Expected options
      );
      expect(resultSessionUrl).toBe(mockSessionUrl);
    });

    it('should set loading, set error state, and return null if API client fails', async () => {
      setAuthenticated();
      const apiErrorMsg = 'Could not create session';
      // Use imported mock function
      mockStripeCreateCheckoutSession.mockResolvedValue({ data: null, error: { message: apiErrorMsg, code: 'ERR_CHECKOUT' } });

      let resultSessionUrl: string | null = 'initial';
      await act(async () => {
        resultSessionUrl = await useSubscriptionStore.getState().createCheckoutSession(priceId);
      });

      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiErrorMsg);
      expect(resultSessionUrl).toBeNull();
    });

     it('should set error state and return null if user is not authenticated', async () => {
        act(() => { resetAuthStore(); });
        let resultSessionUrl: string | null = 'initial';
        await act(async () => {
          resultSessionUrl = await useSubscriptionStore.getState().createCheckoutSession(priceId);
        });
        expect(mockStripeCreateCheckoutSession).not.toHaveBeenCalled();
        expect(useSubscriptionStore.getState().error?.message).toContain('User not authenticated');
        expect(resultSessionUrl).toBeNull();
     });
  });

  describe('createBillingPortalSession action', () => {
    const mockPortalUrl = 'https://stripe.com/portal/test';

    // Mock window.location.origin
    const originalLocation = window.location;
    beforeEach(() => {
        // Use vi.stubGlobal to mock window.location
        vi.stubGlobal('window', {
            location: {
                ...originalLocation, // Keep other properties like href, search etc.
                origin: 'http://localhost:3000' // Set the mock origin
            }
        });
    });
    afterEach(() => {
        // Restore original window.location
        vi.unstubAllGlobals();
    });

    it('should set loading, call API with origin, return URL, and clear state on success', async () => {
      setAuthenticated();
      // Use imported mock function
      mockStripeCreatePortalSession.mockResolvedValue({ data: { url: mockPortalUrl }, error: null });

      let resultUrl: string | null = null;
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
      });

      expect(resultUrl).toBe(mockPortalUrl);
      expect(mockStripeCreatePortalSession).toHaveBeenCalledOnce();
      // Verify the mock was called with the origin + path from the mocked window.location
      expect(mockStripeCreatePortalSession).toHaveBeenCalledWith(false, 'http://localhost:3000/subscription', { token: mockSession.access_token });
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set loading, call API, set error state, and return null on failure', async () => {
      setAuthenticated();
      const apiError = { message: 'Portal failed', code: 'ERR_PORTAL' };
      // Use imported mock function
      mockStripeCreatePortalSession.mockResolvedValue({ data: null, error: apiError as ApiErrorType });

      let resultUrl: string | null = 'initial';
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
      });

      expect(resultUrl).toBeNull();
      expect(mockStripeCreatePortalSession).toHaveBeenCalledOnce();
       // Verify the mock was called with the origin + path from the mocked window.location
      expect(mockStripeCreatePortalSession).toHaveBeenCalledWith(false, 'http://localhost:3000/subscription', { token: mockSession.access_token });
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message);
    });

    it('should not call API and return null if user is not authenticated', async () => {
      act(() => { resetAuthStore(); });

      let resultUrl: string | null = 'initial';
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
      });

      expect(resultUrl).toBeNull();
      expect(mockStripeCreatePortalSession).not.toHaveBeenCalled();
      expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(false);
      expect(useSubscriptionStore.getState().error?.message).toContain('User not authenticated');
    });
  });

  describe('cancelSubscription action', () => {
    const subId = 'sub_ext_123';
    const refreshSpy = vi.fn();

    beforeEach(() => {
      setAuthenticated();
      act(() => {
        useSubscriptionStore.setState({ userSubscription: mockSubscription });
        vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockImplementation(refreshSpy);
      });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should set loading, call API, call refresh, return true, and clear state on success', async () => {
      // Arrange
      mockStripeCancelSubscription.mockResolvedValue({ data: undefined, error: null });
      // ---> Explicitly mock refreshSubscription to return true <--- 
      const refreshSpy = vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockResolvedValue(true); 

      let success: boolean = false;
      await act(async () => {
        success = await useSubscriptionStore.getState().cancelSubscription(subId);
      });

      // Verify call includes token
      expect(mockStripeCancelSubscription).toHaveBeenCalledWith(subId, { token: mockSession.access_token });
      expect(refreshSpy).toHaveBeenCalledOnce();
      expect(success).toBe(true);
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set loading, set error state, not call refresh, and return false if API fails', async () => {
       setAuthenticated();
       const apiErrorMsg = 'Cancellation failed';
       // Use imported mock function, mocking the rejection or error response
       mockStripeCancelSubscription.mockResolvedValue({ data: null, error: { message: apiErrorMsg, code: 'ERR_CANCEL'} }); // Or mockRejectedValue
       const refreshSpy = vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription');

       let success: boolean | undefined;
       const actionPromise = act(async () => {
         success = await useSubscriptionStore.getState().cancelSubscription(subId);
       });

       expect(refreshSpy).not.toHaveBeenCalled(); // Check spy immediately
       await actionPromise; // Await completion

        // Verify call includes token
       expect(mockStripeCancelSubscription).toHaveBeenCalledWith(subId, { token: mockSession.access_token });
       expect(refreshSpy).not.toHaveBeenCalled(); // Check spy again
       expect(success).toBe(false);
       const state = useSubscriptionStore.getState();
       expect(state.isSubscriptionLoading).toBe(false);
       expect(state.error).toBeInstanceOf(Error); // Store should set an Error object
       expect(state.error?.message).toContain(apiErrorMsg);
     });

    it('should set error state and return false if not authenticated', async () => {
       act(() => { resetAuthStore(); });
       let success: boolean = true;
       await act(async () => {
         success = await useSubscriptionStore.getState().cancelSubscription(subId);
       });
       expect(mockStripeCancelSubscription).not.toHaveBeenCalled();
       expect(refreshSpy).not.toHaveBeenCalled();
       expect(success).toBe(false);
       expect(useSubscriptionStore.getState().error?.message).toContain('User not authenticated');
     });

    it('should handle missing subscription ID case', async () => {
       let success: boolean = true;
       await act(async () => {
         success = await useSubscriptionStore.getState().cancelSubscription(null as any);
       });
       expect(mockStripeCancelSubscription).not.toHaveBeenCalled();
       expect(refreshSpy).not.toHaveBeenCalled();
       expect(success).toBe(false);
       expect(useSubscriptionStore.getState().error?.message).toContain('Subscription ID is required');
     });

    // --- NEW Test Case: cancelSubscription with refresh failure ---
    it('should set error and return false if refreshSubscription fails after successful API call', async () => {
        // Arrange
        mockStripeCancelSubscription.mockResolvedValue({ data: undefined, error: null }); // API Success
        const refreshError = new Error('Failed to refresh after cancel');
        vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockImplementation(async () => {
             // Simulate refresh failure by setting error state directly or throwing
             useSubscriptionStore.setState({ error: refreshError });
             return false; // Indicate refresh failure
         });

        let success: boolean = true;
        await act(async () => {
            success = await useSubscriptionStore.getState().cancelSubscription(subId);
        });

        // Assert
        expect(mockStripeCancelSubscription).toHaveBeenCalledWith(subId, { token: mockSession.access_token });
        expect(success).toBe(false); // Should return false as refresh failed
        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error).toEqual(refreshError); // Error from refresh should be set
    });
    // --- End NEW Test Case ---
  });

  describe('resumeSubscription action', () => {
    const subId = 'sub_ext_123';
    const refreshSpy = vi.fn();

    beforeEach(() => {
      setAuthenticated();
      act(() => {
        useSubscriptionStore.setState({ userSubscription: { ...mockSubscription, status: 'canceled' } });
        vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockImplementation(refreshSpy);
      });
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call API, call refresh, return true on success', async () => {
      // Arrange
      mockStripeResumeSubscription.mockResolvedValue({ data: undefined, error: null });
      // ---> Explicitly mock refreshSubscription to return true <--- 
      const refreshSpy = vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockResolvedValue(true); 

      let success: boolean = false;
      await act(async () => {
        success = await useSubscriptionStore.getState().resumeSubscription(subId);
      });
      // Verify call includes token
      expect(mockStripeResumeSubscription).toHaveBeenCalledWith(subId, { token: mockSession.access_token });
      expect(refreshSpy).toHaveBeenCalledOnce();
      expect(success).toBe(true);
      expect(useSubscriptionStore.getState().error).toBeNull();
    });

    it('should set error state, not call refresh, and return false if API fails', async () => {
       setAuthenticated();
       const apiErrorMsg = 'Resume failed';
       // Use mockRejectedValue or a resolved error
       mockStripeResumeSubscription.mockResolvedValue({ data: null, error: { message: apiErrorMsg, code: 'ERR_RESUME'} });
       const refreshSpy = vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription');

       let success: boolean | undefined;
       const actionPromise = act(async () => {
         success = await useSubscriptionStore.getState().resumeSubscription(subId);
       });

       expect(refreshSpy).not.toHaveBeenCalled(); // Check immediately
       await actionPromise; // Await completion

        // Verify call includes token
       expect(mockStripeResumeSubscription).toHaveBeenCalledWith(subId, { token: mockSession.access_token });
       expect(refreshSpy).not.toHaveBeenCalled(); // Check spy again
       expect(success).toBe(false);
       const state = useSubscriptionStore.getState();
       expect(state.isSubscriptionLoading).toBe(false);
       expect(state.error).toBeInstanceOf(Error); // Store should set an Error object
       expect(state.error?.message).toContain(apiErrorMsg);
    });

     // TODO: Add tests for not authenticated, missing subId (similar to cancel)

    // --- NEW Test Case: resumeSubscription with refresh failure ---
    it('should set error and return false if refreshSubscription fails after successful API call', async () => {
        // Arrange
        mockStripeResumeSubscription.mockResolvedValue({ data: undefined, error: null }); // API Success
        const refreshError = new Error('Failed to refresh after resume');
        vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockImplementation(async () => {
             useSubscriptionStore.setState({ error: refreshError });
             return false; // Indicate refresh failure
         });

        let success: boolean = true;
        await act(async () => {
            success = await useSubscriptionStore.getState().resumeSubscription(subId);
        });

        // Assert
        expect(mockStripeResumeSubscription).toHaveBeenCalledWith(subId, { token: mockSession.access_token });
        expect(success).toBe(false); // Should return false as refresh failed
        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error).toEqual(refreshError); // Error from refresh should be set
    });
    // --- End NEW Test Case ---
  });

  describe('getUsageMetrics action', () => {
    const metric = 'ai_tokens';
    const mockUsage: SubscriptionUsageMetrics = { current: 50, limit: 1000 };

    it('should call API and return metrics on success', async () => {
        setAuthenticated();
        // Use imported mock function
        mockStripeGetUsageMetrics.mockResolvedValue({ data: mockUsage, error: null });

        let result: SubscriptionUsageMetrics | null = null;
        await act(async () => {
            result = await useSubscriptionStore.getState().getUsageMetrics(metric);
        });

        // Verify call includes token
        expect(mockStripeGetUsageMetrics).toHaveBeenCalledWith(metric, { token: mockSession.access_token });
        expect(result).toEqual(mockUsage);
        expect(useSubscriptionStore.getState().error).toBeNull();
    });

    it('should set error and return null on API failure', async () => {
        setAuthenticated();
        const apiErrorMsg = 'Usage fetch failed';
        // Use imported mock function
        mockStripeGetUsageMetrics.mockResolvedValue({ data: null, error: { message: apiErrorMsg, code: 'ERR_USAGE' } });

        let result: SubscriptionUsageMetrics | null = mockUsage; // Initial non-null value
        await act(async () => {
            result = await useSubscriptionStore.getState().getUsageMetrics(metric);
        });

        // Verify call includes token
        expect(mockStripeGetUsageMetrics).toHaveBeenCalledWith(metric, { token: mockSession.access_token });
        expect(result).toBeNull();
        expect(useSubscriptionStore.getState().error?.message).toContain(apiErrorMsg);
    });

    it('should return null and set error if not authenticated', async () => {
        act(() => { resetAuthStore(); });
        let result: SubscriptionUsageMetrics | null = mockUsage;
        await act(async () => {
            result = await useSubscriptionStore.getState().getUsageMetrics(metric);
        });
        expect(mockStripeGetUsageMetrics).not.toHaveBeenCalled();
        expect(result).toBeNull();
        expect(useSubscriptionStore.getState().error?.message).toContain('User not authenticated');
    });
  });

  describe('refreshSubscription action', () => {
      let loadDataSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
          loadDataSpy = vi.spyOn(useSubscriptionStore.getState(), 'loadSubscriptionData');
      });

      afterEach(() => {
        loadDataSpy.mockRestore();
      });

      it('should call loadSubscriptionData if user is authenticated', async () => {
          setAuthenticated();
          loadDataSpy.mockClear();

          await act(async () => {
              await useSubscriptionStore.getState().refreshSubscription();
          });
          expect(loadDataSpy).toHaveBeenCalledOnce();
      });

      it('should not call loadSubscriptionData if user is not authenticated', async () => {
          act(() => { resetAuthStore(); });
          await act(async () => {
              await useSubscriptionStore.getState().refreshSubscription();
          });
          expect(loadDataSpy).not.toHaveBeenCalled();
      });
  });

}); 