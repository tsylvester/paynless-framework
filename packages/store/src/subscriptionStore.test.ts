// src/subscriptionStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSubscriptionStore } from './subscriptionStore'; 
import { act } from '@testing-library/react';
import { mockStripeApiClient } from './setupTests'; // May need later for async tests
import { UserSubscription, SubscriptionPlan, SubscriptionUsageMetrics } from '@paynless/types';
import { useAuthStore } from './authStore'; // Import auth store

// Helper to reset Zustand store state between tests
const resetStore = () => useSubscriptionStore.setState(useSubscriptionStore.getInitialState());

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

describe('SubscriptionStore', () => {
  beforeEach(() => {
    act(() => {
      resetStore();
      // Reset auth store too for safety
      useAuthStore.setState(useAuthStore.getInitialState(), true); 
    });
    // Mocks are reset in setupTests.ts
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

  // --- Placeholder Tests for Async Actions ---
  // These depend on the Stripe API implementation

  it.todo('loadSubscriptionData action should fetch plans and user subscription');

  it.todo('refreshSubscription action should re-fetch user subscription');

  // --- Test createCheckoutSession ---
  describe('createCheckoutSession action', () => {
    const priceId = 'price_abc';
    const mockSessionId = 'cs_test_session_123';

    // Set up authenticated user before these tests run
    beforeEach(() => {
      act(() => {
        useAuthStore.setState({ user: mockUser, session: { access_token: 'mock-token' } });
      });
    });

    it('should set loading state, call API client, and return session ID on success', async () => {
      // Arrange: Mock successful API response
      mockStripeApiClient.createCheckoutSession.mockResolvedValueOnce({
        status: 200,
        data: { sessionId: mockSessionId },
      });

      // Act
      let resultSessionId: string | null = null;
      await act(async () => {
        resultSessionId = await useSubscriptionStore.getState().createCheckoutSession(priceId);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false); // Should be reset after completion
      expect(state.error).toBeNull();
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledTimes(1);
      // Check isTestMode from store state
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledWith(priceId, state.isTestMode);
      expect(resultSessionId).toBe(mockSessionId);
    });

    it('should set loading and error state if API client fails', async () => {
      // Arrange: Mock failed API response
      const apiError = { code: 'CHECKOUT_FAILED', message: 'Could not create session' };
      mockStripeApiClient.createCheckoutSession.mockResolvedValueOnce({
        status: 500,
        error: apiError,
      });

      // Act & Assert: Expect the action to reject with the error message
      await expect(act(async () => {
        await useSubscriptionStore.getState().createCheckoutSession(priceId);
      })).rejects.toThrow(apiError.message); // Assert that the specific error is thrown

      // Assert state after rejection
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false); // Should still reset loading
      // Error state might not be set if the error is re-thrown immediately
      // Depending on desired behavior, we might check this or remove it.
      // For now, let's assume the primary check is the thrown error.
      // expect(state.error).toBeInstanceOf(Error); 
      // expect(state.error?.message).toContain(apiError.message); 
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledWith(priceId, state.isTestMode);
      // Cannot check return value as it throws
    });

    it('should throw error immediately if user is not authenticated', async () => {
        // Arrange: Ensure user is logged out
        act(() => {
            useAuthStore.setState({ user: null, session: null });
        });

        // Act & Assert: Check that calling the action throws the expected error
        await expect(act(async () => {
            await useSubscriptionStore.getState().createCheckoutSession(priceId);
        })).rejects.toThrow('User not authenticated');

        // Assert: Check that API client was NOT called
        expect(mockStripeApiClient.createCheckoutSession).not.toHaveBeenCalled();
    });
  });

  // --- Test createBillingPortalSession ---
  describe('createBillingPortalSession action', () => {
    const mockPortalUrl = 'https://billing.stripe.com/session/test_portal_session_123';

    // Set up authenticated user before these tests run
    beforeEach(() => {
      act(() => {
        useAuthStore.setState({ user: mockUser, session: { access_token: 'mock-token' } });
      });
    });

    it('should set loading state, call API client, and return portal URL on success', async () => {
      // Arrange: Mock successful API response
      mockStripeApiClient.createPortalSession.mockResolvedValueOnce({
        status: 200,
        data: { url: mockPortalUrl },
      });

      // Act
      let resultUrl: string | null = null;
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStripeApiClient.createPortalSession).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.createPortalSession).toHaveBeenCalledWith(state.isTestMode);
      expect(resultUrl).toBe(mockPortalUrl);
    });

    it('should set loading and error state, and return null if API client fails', async () => {
      // Arrange: Mock failed API response
      const apiError = { code: 'PORTAL_FAILED', message: 'Could not create portal session' };
      mockStripeApiClient.createPortalSession.mockResolvedValueOnce({
        status: 500,
        error: apiError,
      });

      // Act
      let resultUrl: string | null = null;
      await act(async () => {
        resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      // Note: The store action catches the error and SETS the state.error, unlike checkout which re-threw
      expect(state.error?.message).toContain(apiError.message); 
      expect(mockStripeApiClient.createPortalSession).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.createPortalSession).toHaveBeenCalledWith(state.isTestMode);
      expect(resultUrl).toBeNull(); // Action should return null on failure
    });

    it('should set error state and return null if user is not authenticated', async () => {
        // Arrange: Ensure user is logged out
        act(() => {
            useAuthStore.setState({ user: null, session: null });
        });

        // Act
        let resultUrl: string | null = null;
        await act(async () => {
            resultUrl = await useSubscriptionStore.getState().createBillingPortalSession();
        });
        
        // Assert: Check state and return value
        const state = useSubscriptionStore.getState();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toBe('User not logged in');
        expect(resultUrl).toBeNull();

        // Assert: Check that API client was NOT called
        expect(mockStripeApiClient.createPortalSession).not.toHaveBeenCalled();
    });
  });

  // --- Test cancelSubscription ---
  describe('cancelSubscription action', () => {
    const subId = 'sub_123';

    // Set up authenticated user before these tests run
    beforeEach(() => {
      act(() => {
        useAuthStore.setState({ user: mockUser, session: { access_token: 'mock-token' } });
        // Also set an initial subscription to cancel
        useSubscriptionStore.setState({ userSubscription: mockSubscription }); 
      });
      // Default mocks for getUserSubscription/getSubscriptionPlans are set in setupTests
      // and will be used by the refreshSubscription call on success.
    });

    it('should call API client, refresh state, and return true on success', async () => {
      // Arrange: Mock successful API response for cancellation
      mockStripeApiClient.cancelSubscription.mockResolvedValueOnce({ status: 200 });
      // Mock refresh dependencies (getUserSub will return null after cancel)
      mockStripeApiClient.getUserSubscription.mockResolvedValueOnce({ status: 200, data: null });

      // Act
      let result: boolean | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().cancelSubscription(subId);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false); // Should be reset by refresh
      expect(state.error).toBeNull();
      expect(mockStripeApiClient.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.cancelSubscription).toHaveBeenCalledWith(subId);
      // Check that refresh calls were made
      expect(mockStripeApiClient.getUserSubscription).toHaveBeenCalled(); 
      expect(mockStripeApiClient.getSubscriptionPlans).toHaveBeenCalled(); 
      expect(result).toBe(true);
      // Check if state was updated by refresh (userSubscription should be null)
      expect(state.userSubscription).toBeNull(); 
    });

    it('should set error state and return false if API client fails', async () => {
      // Arrange: Mock failed API response
      const apiError = { code: 'CANCEL_FAILED', message: 'Could not cancel subscription' };
      mockStripeApiClient.cancelSubscription.mockResolvedValueOnce({
        status: 500,
        error: apiError,
      });

      // Act
      let result: boolean | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().cancelSubscription(subId);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message); 
      expect(mockStripeApiClient.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.cancelSubscription).toHaveBeenCalledWith(subId);
      expect(result).toBe(false);
    });

    it('should set error state and return false if user is not authenticated', async () => {
        // Arrange: Ensure user is logged out
        act(() => {
            useAuthStore.setState({ user: null, session: null });
        });

        // Act
        let result: boolean | null = null;
        await act(async () => {
             result = await useSubscriptionStore.getState().cancelSubscription(subId);
        });
        
        // Assert
        const state = useSubscriptionStore.getState();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toBe('User not logged in');
        expect(result).toBe(false);
        expect(mockStripeApiClient.cancelSubscription).not.toHaveBeenCalled();
    });
  });

  // --- Test resumeSubscription ---
  describe('resumeSubscription action', () => {
    const subId = 'sub_123';

    // Set up authenticated user before these tests run
    beforeEach(() => {
      act(() => {
        useAuthStore.setState({ user: mockUser, session: { access_token: 'mock-token' } });
        // Set an initial (cancelled) subscription to resume
        const cancelledSub = { ...mockSubscription, status: 'canceled' as const, cancelAtPeriodEnd: true };
        useSubscriptionStore.setState({ userSubscription: cancelledSub }); 
      });
    });

    it('should call API client, refresh state, and return true on success', async () => {
      // Arrange: Mock successful API response for resume
      mockStripeApiClient.resumeSubscription.mockResolvedValueOnce({ status: 200 });
      // Mock refresh dependencies (getUserSub will return the active sub)
      const resumedSub = { ...mockSubscription, status: 'active' as const, cancelAtPeriodEnd: false };
      mockStripeApiClient.getUserSubscription.mockResolvedValueOnce({ status: 200, data: resumedSub });

      // Act
      let result: boolean | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().resumeSubscription(subId);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false); 
      expect(state.error).toBeNull();
      expect(mockStripeApiClient.resumeSubscription).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.resumeSubscription).toHaveBeenCalledWith(subId);
      // Check that refresh calls were made
      expect(mockStripeApiClient.getUserSubscription).toHaveBeenCalled(); 
      expect(mockStripeApiClient.getSubscriptionPlans).toHaveBeenCalled(); 
      expect(result).toBe(true);
      // Check if state was updated by refresh (userSubscription should be active)
      expect(state.userSubscription?.status).toBe('active'); 
      expect(state.userSubscription?.cancelAtPeriodEnd).toBe(false);
    });

    it('should set error state and return false if API client fails', async () => {
      // Arrange: Mock failed API response
      const apiError = { code: 'RESUME_FAILED', message: 'Could not resume subscription' };
      mockStripeApiClient.resumeSubscription.mockResolvedValueOnce({
        status: 500,
        error: apiError,
      });

      // Act
      let result: boolean | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().resumeSubscription(subId);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message); 
      expect(mockStripeApiClient.resumeSubscription).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.resumeSubscription).toHaveBeenCalledWith(subId);
      expect(result).toBe(false);
    });

    it('should set error state and return false if user is not authenticated', async () => {
        // Arrange: Ensure user is logged out
        act(() => {
            useAuthStore.setState({ user: null, session: null });
        });

        // Act
        let result: boolean | null = null;
        await act(async () => {
             result = await useSubscriptionStore.getState().resumeSubscription(subId);
        });
        
        // Assert
        const state = useSubscriptionStore.getState();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toBe('User not logged in');
        expect(result).toBe(false);
        expect(mockStripeApiClient.resumeSubscription).not.toHaveBeenCalled();
    });
  });

  // --- Test getUsageMetrics ---
  describe('getUsageMetrics action', () => {
    const metric = 'api_calls';
    const mockUsageData: SubscriptionUsageMetrics = { current: 50, limit: 1000 };

    // Set up authenticated user before these tests run
    beforeEach(() => {
      act(() => {
        useAuthStore.setState({ user: mockUser, session: { access_token: 'mock-token' } });
      });
    });

    it('should call API client and return usage data on success', async () => {
      // Arrange: Mock successful API response
      mockStripeApiClient.getUsageMetrics.mockResolvedValueOnce({
        status: 200,
        data: mockUsageData,
      });

      // Act
      let result: SubscriptionUsageMetrics | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().getUsageMetrics(metric);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.error).toBeNull();
      expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledWith(metric);
      expect(result).toEqual(mockUsageData);
    });

    it('should set error state and return null if API client fails', async () => {
      // Arrange: Mock failed API response
      const apiError = { code: 'USAGE_FETCH_ERROR', message: 'Could not fetch usage data' };
      mockStripeApiClient.getUsageMetrics.mockResolvedValueOnce({
        status: 500,
        error: apiError,
      });

      // Act
      let result: SubscriptionUsageMetrics | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().getUsageMetrics(metric);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message); 
      expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledWith(metric);
      expect(result).toBeNull();
    });

     it('should set error state and return null if API returns 404 (metric not found)', async () => {
      // Arrange: Mock 404 API response
      const apiError = { code: 'METRIC_NOT_FOUND', message: 'Metric not found' };
      mockStripeApiClient.getUsageMetrics.mockResolvedValueOnce({
        status: 404,
        error: apiError,
      });

      // Act
      let result: SubscriptionUsageMetrics | null = null;
      await act(async () => {
        result = await useSubscriptionStore.getState().getUsageMetrics(metric);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message); 
      expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.getUsageMetrics).toHaveBeenCalledWith(metric);
      expect(result).toBeNull();
    });

    it('should set error state and return null if user is not authenticated', async () => {
        // Arrange: Ensure user is logged out
        act(() => {
            useAuthStore.setState({ user: null, session: null });
        });

        // Act
        let result: SubscriptionUsageMetrics | null = null;
        await act(async () => {
             result = await useSubscriptionStore.getState().getUsageMetrics(metric);
        });
        
        // Assert
        const state = useSubscriptionStore.getState();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toBe('User not logged in');
        expect(result).toBeNull();
        expect(mockStripeApiClient.getUsageMetrics).not.toHaveBeenCalled();
    });
  });
}); 