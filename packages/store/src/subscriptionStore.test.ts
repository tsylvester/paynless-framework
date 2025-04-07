// src/subscriptionStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSubscriptionStore } from './subscriptionStore'; 
import { act } from '@testing-library/react';
import { mockStripeApiClient } from './setupTests'; // May need later for async tests
import { UserSubscription, SubscriptionPlan } from '@paynless/types';

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

describe('SubscriptionStore', () => {
  beforeEach(() => {
    act(() => {
      resetStore();
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

      // Act
      let resultSessionId: string | null = null;
      await act(async () => {
        resultSessionId = await useSubscriptionStore.getState().createCheckoutSession(priceId);
      });

      // Assert
      const state = useSubscriptionStore.getState();
      expect(state.isSubscriptionLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message); // Check if message is included
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledTimes(1);
      expect(mockStripeApiClient.createCheckoutSession).toHaveBeenCalledWith(priceId, state.isTestMode);
      expect(resultSessionId).toBeNull(); // Action should return null on failure
    });
  });

  it.todo('createBillingPortalSession action should call StripeApiClient and return portal URL');

  it.todo('cancelSubscription action should call StripeApiClient and update state');

  it.todo('resumeSubscription action should call StripeApiClient and update state');

  it.todo('getUsageMetrics action should call StripeApiClient and return metrics');
}); 