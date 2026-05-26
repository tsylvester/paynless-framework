import { vi } from 'vitest';
import type { SubscriptionStore } from '@paynless/store';

export type MockedUseSubscriptionStoreHook = (<TResult>(
  selector?: (state: SubscriptionStore) => TResult,
) => TResult | SubscriptionStore) & {
  getState: () => SubscriptionStore;
  setState: (newState: Partial<SubscriptionStore>, replace?: boolean) => void;
  getInitialState: () => SubscriptionStore;
};

let internalMockSubscriptionStoreState: SubscriptionStore;

export const mockSetUserSubscription = vi.fn();
export const mockSetAvailablePlans = vi.fn();
export const mockSetIsLoading = vi.fn();
export const mockSetTestMode = vi.fn();
export const mockSetError = vi.fn();
export const mockLoadSubscriptionData = vi.fn();
export const mockRefreshSubscription = vi.fn();
export const mockCreateBillingPortalSession = vi.fn();
export const mockCancelSubscription = vi.fn();
export const mockResumeSubscription = vi.fn();
export const mockGetUsageMetrics = vi.fn();

const buildInitialSubscriptionStore = (): SubscriptionStore => ({
  userSubscription: null,
  availablePlans: [],
  isSubscriptionLoading: false,
  hasActiveSubscription: false,
  isTestMode: false,
  error: null,
  setUserSubscription: mockSetUserSubscription,
  setAvailablePlans: mockSetAvailablePlans,
  setIsLoading: mockSetIsLoading,
  setTestMode: mockSetTestMode,
  setError: mockSetError,
  loadSubscriptionData: mockLoadSubscriptionData,
  refreshSubscription: mockRefreshSubscription,
  createBillingPortalSession: mockCreateBillingPortalSession,
  cancelSubscription: mockCancelSubscription,
  resumeSubscription: mockResumeSubscription,
  getUsageMetrics: mockGetUsageMetrics,
});

const wireMockImplementations = (): void => {
  mockSetUserSubscription.mockImplementation((subscription) => {
    internalMockSubscriptionStoreState.userSubscription = subscription;
    internalMockSubscriptionStoreState.hasActiveSubscription = subscription
      ? subscription.status === 'active'
      : false;
  });
  mockSetAvailablePlans.mockImplementation((plans) => {
    internalMockSubscriptionStoreState.availablePlans = plans;
  });
  mockSetIsLoading.mockImplementation((isLoading) => {
    internalMockSubscriptionStoreState.isSubscriptionLoading = isLoading;
  });
  mockSetTestMode.mockImplementation((isTestMode) => {
    internalMockSubscriptionStoreState.isTestMode = isTestMode;
  });
  mockSetError.mockImplementation((error) => {
    internalMockSubscriptionStoreState.error = error;
  });
  mockLoadSubscriptionData.mockResolvedValue(undefined);
  mockRefreshSubscription.mockResolvedValue(false);
  mockCreateBillingPortalSession.mockResolvedValue(null);
  mockCancelSubscription.mockResolvedValue(false);
  mockResumeSubscription.mockResolvedValue(false);
  mockGetUsageMetrics.mockResolvedValue(null);
};

export const initializeMockSubscriptionStore = (): void => {
  mockSetUserSubscription.mockClear();
  mockSetAvailablePlans.mockClear();
  mockSetIsLoading.mockClear();
  mockSetTestMode.mockClear();
  mockSetError.mockClear();
  mockLoadSubscriptionData.mockClear();
  mockRefreshSubscription.mockClear();
  mockCreateBillingPortalSession.mockClear();
  mockCancelSubscription.mockClear();
  mockResumeSubscription.mockClear();
  mockGetUsageMetrics.mockClear();

  internalMockSubscriptionStoreState = buildInitialSubscriptionStore();
  wireMockImplementations();
};

initializeMockSubscriptionStore();

export const internalMockSubscriptionStoreGetState = (): SubscriptionStore =>
  internalMockSubscriptionStoreState;

export const mockedUseSubscriptionStoreHookLogic: MockedUseSubscriptionStoreHook = <TResult>(
  selector?: (state: SubscriptionStore) => TResult,
): TResult | SubscriptionStore => {
  const state = internalMockSubscriptionStoreGetState();
  return selector ? selector(state) : state;
};

mockedUseSubscriptionStoreHookLogic.getState = internalMockSubscriptionStoreGetState;

mockedUseSubscriptionStoreHookLogic.getInitialState = (): SubscriptionStore =>
  buildInitialSubscriptionStore();

mockedUseSubscriptionStoreHookLogic.setState = (
  newState: Partial<SubscriptionStore>,
  replace?: boolean,
): void => {
  if (replace) {
    internalMockSubscriptionStoreState = {
      ...buildInitialSubscriptionStore(),
      ...newState,
    };
  } else {
    internalMockSubscriptionStoreState = {
      ...internalMockSubscriptionStoreState,
      ...newState,
    };
  }
  wireMockImplementations();
};

export const resetSubscriptionStoreMock = (): void => {
  initializeMockSubscriptionStore();
};

export const useSubscriptionStore: MockedUseSubscriptionStoreHook =
  mockedUseSubscriptionStoreHookLogic;
