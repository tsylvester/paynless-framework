// src/subscriptionStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSubscriptionStore } from './subscriptionStore'; 
import { act } from '@testing-library/react';
import { mockStripeApiClient } from './setupTests'; // May need later for async tests
import { UserSubscription, SubscriptionPlan, SubscriptionUsageMetrics } from '@paynless/types';
import { useAuthStore } from './authStore'; // Import auth store
import { logger } from '@paynless/utils';

// Helper function for small delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    // Add other required fields from UserSubscription type
    stripeCustomerId: "cus_abc",
    stripeSubscriptionId: "sub_ext_123",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Approx 30 days later
    cancelAtPeriodEnd: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: { // Include nested plan mock if necessary for some tests
        id: "plan_xyz",
        name: "Pro Plan",
        amount: 1000,
        currency: "usd",
        interval: "month",
        stripePriceId: "price_abc",
        active: true,
        // ... other plan fields
    }
};

const mockPlans: SubscriptionPlan[] = [
    { id: 'plan_abc', name: 'Basic', stripePriceId: 'price_basic', amount: 500, currency: 'usd', interval: 'month', active: true },
    { id: 'plan_xyz', name: 'Pro', stripePriceId: 'price_pro', amount: 1000, currency: 'usd', interval: 'month', active: true },
];

const mockUser = { id: 'user_abc', email: 'test@example.com' }; // Mock user data
const mockSession = { access_token: 'mock-token' }; // Simplified mock session

describe('SubscriptionStore', () => {
  beforeEach(() => {
    act(() => {
      resetSubscriptionStore();
      resetAuthStore();
    });
    vi.clearAllMocks();
  });

  it('should have correct initial state', () => {
    const { userSubscription, availablePlans, isSubscriptionLoading, hasActiveSubscription, isTestMode, error } = useSubscriptionStore.getState();
    expect(userSubscription).toBeNull();
    expect(availablePlans).toEqual([]);
    expect(isSubscriptionLoading).toBe(false); // Assuming it doesn't load initially by default
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
       useAuthStore.setState({ user: mockUser, session: mockSession });
     });
  }

  // Test loadSubscriptionData (assuming it didn't change significantly)
  describe('loadSubscriptionData action', () => {
     it('should fetch plans and subscription, updating state on success', async () => {
        setAuthenticated();
        mockStripeApiClient.getSubscriptionPlans.mockResolvedValueOnce({ status: 200, data: mockPlans });
        mockStripeApiClient.getUserSubscription.mockResolvedValueOnce({ status: 200, data: mockSubscription });

        await act(async () => {
            await useSubscriptionStore.getState().loadSubscriptionData(mockUser.id);
        });

        expect(mockStripeApiClient.getSubscriptionPlans).toHaveBeenCalled();
        expect(mockStripeApiClient.getUserSubscription).toHaveBeenCalledWith(mockUser.id);
        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.availablePlans).toEqual(mockPlans);
        expect(state.userSubscription).toEqual(mockSubscription);
        expect(state.hasActiveSubscription).toBe(true);
        expect(state.error).toBeNull();
     });

     it('should set error state if fetching plans fails', async () => {
        setAuthenticated();
        const plansError = { message: 'Failed to get plans' };
        mockStripeApiClient.getSubscriptionPlans.mockResolvedValueOnce({ status: 500, error: plansError });
        // Mock successful subscription fetch to isolate the plans error
        mockStripeApiClient.getUserSubscription.mockResolvedValueOnce({ status: 200, data: mockSubscription });

        await act(async () => {
           await useSubscriptionStore.getState().loadSubscriptionData(mockUser.id);
        });

        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain(plansError.message);
        expect(state.availablePlans).toEqual([]); // Plans should not be set
        // Subscription might still be set depending on Promise.all behavior, check store logic if needed
     });

     it('should handle null subscription without error', async () => {
        setAuthenticated();
        mockStripeApiClient.getSubscriptionPlans.mockResolvedValueOnce({ status: 200, data: mockPlans });
        // Simulate no subscription found (e.g., 404)
        mockStripeApiClient.getUserSubscription.mockResolvedValueOnce({ status: 404, data: null, error: { message: 'Not found'} });

        await act(async () => {
            await useSubscriptionStore.getState().loadSubscriptionData(mockUser.id);
        });

        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.availablePlans).toEqual(mockPlans);
        expect(state.userSubscription).toBeNull();
        expect(state.hasActiveSubscription).toBe(false);
        expect(state.error).toBeNull(); // No error state for 404 on user sub
     });

     it('should not fetch if user is not authenticated', async () => {
        // Ensure user is not authenticated
        act(() => { resetAuthStore(); });

        await act(async () => {
            await useSubscriptionStore.getState().loadSubscriptionData('some-id'); // Pass ID anyway
        });

        expect(mockStripeApiClient.getSubscriptionPlans).not.toHaveBeenCalled();
        expect(mockStripeApiClient.getUserSubscription).not.toHaveBeenCalled();
        expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(false);
     });
  });

  describe('createCheckoutSession action', () => {
    const priceId = 'price_abc';
    const mockCheckoutUrl = 'https://checkout.stripe.com/session/test_checkout_123';

    it('should set loading, call API, return URL, and clear state on success', async () => {
      setAuthenticated();
      mockStripeApiClient.createCheckoutSession.mockResolvedValueOnce({
        status: 200,
        data: { url: mockCheckoutUrl }, // Mock provides URL
      });

      let resultUrl: string | null = null;
      let stateAfter: ReturnType<typeof useSubscriptionStore.getState> | undefined;

      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createCheckoutSession(priceId);
        stateAfter = useSubscriptionStore.getState();
      });

      expect(stateAfter?.isSubscriptionLoading).toBe(false);
      expect(stateAfter?.error).toBeNull();
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledWith(priceId, false);
      expect(resultUrl).toBe(mockCheckoutUrl); // Expect the URL
    });

    it('should set loading, set error state, and return null if API client fails', async () => {
      setAuthenticated();
      const apiErrorMsg = 'Could not create session';
      mockStripeApiClient.createCheckoutSession.mockRejectedValueOnce(new Error(apiErrorMsg));

      let resultUrl: string | null = 'initial';
      let errorFromSubscription: Error | null = null;

      // Subscribe to store changes to capture the error state update
      const unsubscribe = useSubscriptionStore.subscribe(
        (state) => {
          if (state.error) {
            errorFromSubscription = state.error;
          }
        }
      );

      // Call the action within act
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createCheckoutSession(priceId);
      });

      unsubscribe(); // Clean up the subscription

      // Assert based on the value captured by the subscription
      expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(false); // Check loading state normally
      expect(errorFromSubscription).toBeInstanceOf(Error);
      expect(errorFromSubscription?.message).toContain(apiErrorMsg);
      expect(resultUrl).toBeNull(); // API call failed, result should be null
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it('should set error state and return null if user is not authenticated', async () => {
        act(() => { resetAuthStore(); }); // Ensure logged out
        let resultUrl: string | null = 'initial';
        await act(async () => {
            resultUrl = await useSubscriptionStore.getState().createCheckoutSession(priceId);
        });

        expect(resultUrl).toBeNull();
        expect(mockStripeApiClient.createCheckoutSession).not.toHaveBeenCalled();
        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain('User not authenticated');
    });
  });

  describe('createBillingPortalSession action', () => {
    const mockPortalUrl = 'https://billing.stripe.com/session/test_portal_123';

    it('should set loading, call API, return URL, and clear state on success', async () => {
      setAuthenticated();
      mockStripeApiClient.createPortalSession.mockResolvedValueOnce({ status: 200, data: { url: mockPortalUrl } });

      let resultUrl: string | null = null;
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
      });

      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStripeApiClient.createPortalSession).toHaveBeenCalledWith(false); // Default test mode
      expect(resultUrl).toBe(mockPortalUrl);
    });

    it('should set loading, set error state, and return null if API fails', async () => {
      setAuthenticated();
      const apiErrorMsg = 'Portal failed';
      mockStripeApiClient.createPortalSession.mockRejectedValueOnce(new Error(apiErrorMsg));

      let resultUrl: string | null = 'initial';
      let errorFromSubscription: Error | null = null;

      const unsubscribe = useSubscriptionStore.subscribe((state) => {
        if (state.error) {
          errorFromSubscription = state.error;
        }
      });

      await act(async () => {
        try {
          resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
        } catch (e) { /* Catch potential re-throw */ }
      });

      unsubscribe();

      expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(false);
      expect(errorFromSubscription).toBeInstanceOf(Error);
      expect(errorFromSubscription?.message).toContain(apiErrorMsg);
      expect(resultUrl).toBeNull();
    });

    it('should set error state and return null if not authenticated', async () => {
       act(() => { resetAuthStore(); });
       let resultUrl: string | null = 'initial';
       await act(async () => {
           resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
       });
       expect(resultUrl).toBeNull();
       expect(mockStripeApiClient.createPortalSession).not.toHaveBeenCalled();
       const state = useSubscriptionStore.getState();
       expect(state.isSubscriptionLoading).toBe(false);
       expect(state.error?.message).toContain('User not logged in');
    });
  });

  describe('cancelSubscription action', () => {
    const subId = 'sub_ext_123';
    let refreshSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
       setAuthenticated();
       act(() => { useSubscriptionStore.getState().setUserSubscription(mockSubscription); });
       refreshSpy = vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockResolvedValue();
    });

    afterEach(() => {
        refreshSpy.mockRestore();
    });

    it('should set loading, call API, call refresh, return true, and clear state on success', async () => {
      mockStripeApiClient.cancelSubscription.mockResolvedValueOnce({ status: 200, data: undefined });

      let success: boolean = false;
      await act(async () => {
        success = await useSubscriptionStore.getState().cancelSubscription(subId);
      });

      expect(mockStripeApiClient.cancelSubscription).toHaveBeenCalledWith(subId);
      expect(refreshSpy).toHaveBeenCalledOnce(); // Verify refresh was called
      expect(success).toBe(true);
    });

    it('should set loading, set error state, not call refresh, and return false if API fails', async () => {
       const apiErrorMsg = 'Cancel failed';
       mockStripeApiClient.cancelSubscription.mockRejectedValueOnce(new Error(apiErrorMsg));

       let success: boolean = true;
       await act(async () => {
         success = await useSubscriptionStore.getState().cancelSubscription(subId);
       });

       const state = useSubscriptionStore.getState();
       expect(state.isSubscriptionLoading).toBe(false);
       expect(state.error).toBeInstanceOf(Error);
       expect(state.error?.message).toContain(apiErrorMsg);
       expect(refreshSpy).not.toHaveBeenCalled();
       expect(success).toBe(false);
    });

    it('should set error state and return false if not authenticated', async () => {
        act(() => { resetAuthStore(); });
        let success: boolean = true;
        await act(async () => {
          success = await useSubscriptionStore.getState().cancelSubscription(subId);
        });
        expect(success).toBe(false);
        expect(mockStripeApiClient.cancelSubscription).not.toHaveBeenCalled();
        expect(refreshSpy).not.toHaveBeenCalled();
        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error?.message).toContain('User not logged in');
    });

     it('should handle missing subscription ID case', async () => {
        act(() => { useSubscriptionStore.getState().setUserSubscription({...mockSubscription, stripeSubscriptionId: undefined }); });
        let success: boolean = true;
        await act(async () => {
          success = await useSubscriptionStore.getState().cancelSubscription(useSubscriptionStore.getState().userSubscription?.stripeSubscriptionId as any);
        });
        expect(success).toBe(false);
        expect(mockStripeApiClient.cancelSubscription).not.toHaveBeenCalled();
        expect(refreshSpy).not.toHaveBeenCalled();
        expect(useSubscriptionStore.getState().error?.message).toContain('Missing subscription ID');
    });
  });

  // --- Tests for resumeSubscription (Similar structure to cancel) ---
  describe('resumeSubscription action', () => {
    const subId = 'sub_ext_123';
    let refreshSpy: ReturnType<typeof vi.spyOn>;

     beforeEach(() => {
       setAuthenticated();
       act(() => { useSubscriptionStore.getState().setUserSubscription(mockSubscription); });
       refreshSpy = vi.spyOn(useSubscriptionStore.getState(), 'refreshSubscription').mockResolvedValue();
    });

    afterEach(() => {
        refreshSpy.mockRestore();
    });

     it('should call API, call refresh, return true on success', async () => {
      mockStripeApiClient.resumeSubscription.mockResolvedValueOnce({ status: 200, data: undefined });
      let success = false;
      await act(async () => {
        success = await useSubscriptionStore.getState().resumeSubscription(subId);
      });
      expect(mockStripeApiClient.resumeSubscription).toHaveBeenCalledWith(subId);
      expect(refreshSpy).toHaveBeenCalledOnce();
      expect(success).toBe(true);
    });

    it('should set error state, not call refresh, and return false if API fails', async () => {
      const apiErrorMsg = 'Resume failed';
      mockStripeApiClient.resumeSubscription.mockRejectedValueOnce(new Error(apiErrorMsg));
      let success = true;
      await act(async () => {
        success = await useSubscriptionStore.getState().resumeSubscription(subId);
      });
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiErrorMsg);
      expect(refreshSpy).not.toHaveBeenCalled();
      expect(success).toBe(false);
    });
  });

  // --- Tests for getUsageMetrics ---
  describe('getUsageMetrics action', () => {
      const metric = 'api_calls';
      const mockUsage: SubscriptionUsageMetrics = { used: 500, limit: 1000, metric: 'api_calls' };

      it('should set loading, call API, return metrics, and clear state on success', async () => {
        setAuthenticated();
        mockStripeApiClient.getUsageMetrics.mockResolvedValueOnce({ status: 200, data: mockUsage });

        let result: SubscriptionUsageMetrics | null = null;
        await act(async () => {
            result = await useSubscriptionStore.getState().getUsageMetrics(metric);
        });

        const state = useSubscriptionStore.getState();
        expect(state.isSubscriptionLoading).toBe(false);
        expect(state.error).toBeNull();
        expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledWith(metric);
        expect(result).toEqual(mockUsage);
      });

      it('should set loading, set error state, and return null if API fails', async () => {
          setAuthenticated();
          const apiErrorMsg = 'Usage unavailable';
          mockStripeApiClient.getUsageMetrics.mockRejectedValueOnce(new Error(apiErrorMsg));

          let result: SubscriptionUsageMetrics | null = mockUsage;
          let errorFromSubscription: Error | null = null;

          const unsubscribe = useSubscriptionStore.subscribe((state) => {
            if (state.error) {
              errorFromSubscription = state.error;
            }
          });
          
          await act(async () => {
            try {
              result = await useSubscriptionStore.getState().getUsageMetrics(metric);
            } catch (e) { /* Catch potential re-throw */ }
          });

          unsubscribe();

          expect(useSubscriptionStore.getState().isSubscriptionLoading).toBe(false);
          expect(errorFromSubscription).toBeInstanceOf(Error);
          expect(errorFromSubscription?.message).toContain(apiErrorMsg);
          expect(result).toBeNull();
      });

       it('should set error state and return null if not authenticated', async () => {
          act(() => { resetAuthStore(); });
          let result: SubscriptionUsageMetrics | null = mockUsage;
          await act(async () => {
              result = await useSubscriptionStore.getState().getUsageMetrics(metric);
          });
          expect(result).toBeNull();
          expect(mockStripeApiClient.getUsageMetrics).not.toHaveBeenCalled();
          const state = useSubscriptionStore.getState();
          expect(state.isSubscriptionLoading).toBe(false);
          expect(state.error?.message).toContain('User not logged in');
      });
  });

  // TODO: Test refreshSubscription action thoroughly
  describe('refreshSubscription action', () => {
    let loadDataSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Spy on loadSubscriptionData before each test in this block
        loadDataSpy = vi.spyOn(useSubscriptionStore.getState(), 'loadSubscriptionData').mockResolvedValue();
    });

    afterEach(() => {
        // Restore the original implementation after each test
        loadDataSpy.mockRestore();
    });

    it('should call loadSubscriptionData with the current user ID if authenticated', async () => {
        setAuthenticated(); // Ensure user is logged in via helper
        loadDataSpy.mockClear(); // Reset spy *after* setting auth state

        await act(async () => {
            await useSubscriptionStore.getState().refreshSubscription();
        });

        expect(loadDataSpy).toHaveBeenCalledOnce();
        expect(loadDataSpy).toHaveBeenCalledWith(mockUser.id);
    });

    it('should not call loadSubscriptionData if not authenticated', async () => {
        act(() => { resetAuthStore(); }); // Ensure logged out

        await act(async () => {
            await useSubscriptionStore.getState().refreshSubscription();
        });

        expect(loadDataSpy).not.toHaveBeenCalled();
    });
  });

}); 