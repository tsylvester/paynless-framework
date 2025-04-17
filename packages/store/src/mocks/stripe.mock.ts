import { vi } from 'vitest';

// Create individual mock functions for each StripeApiClient method
export const mockStripeGetSubscriptionPlans = vi.fn();
export const mockStripeGetUserSubscription = vi.fn();
export const mockStripeCreateCheckoutSession = vi.fn();
export const mockStripeCreatePortalSession = vi.fn();
export const mockStripeCancelSubscription = vi.fn();
export const mockStripeResumeSubscription = vi.fn();
export const mockStripeGetUsageMetrics = vi.fn();

// Function to reset all mocks
export const resetStripeMocks = () => {
  mockStripeGetSubscriptionPlans.mockReset();
  mockStripeGetUserSubscription.mockReset();
  mockStripeCreateCheckoutSession.mockReset();
  mockStripeCreatePortalSession.mockReset();
  mockStripeCancelSubscription.mockReset();
  mockStripeResumeSubscription.mockReset();
  mockStripeGetUsageMetrics.mockReset();
};

// Optional: Export a mock implementation object if needed elsewhere
export const mockStripeApiClientImplementation = {
  getSubscriptionPlans: mockStripeGetSubscriptionPlans,
  getUserSubscription: mockStripeGetUserSubscription,
  createCheckoutSession: mockStripeCreateCheckoutSession,
  createPortalSession: mockStripeCreatePortalSession,
  cancelSubscription: mockStripeCancelSubscription,
  resumeSubscription: mockStripeResumeSubscription,
  getUsageMetrics: mockStripeGetUsageMetrics,
}; 