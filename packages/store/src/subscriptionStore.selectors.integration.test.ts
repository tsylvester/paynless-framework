import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { SubscriptionState } from '@paynless/types';
import {
  mockUserSubscriptionActive,
  mockUserSubscriptionTrialing,
} from '../../../apps/web/src/mocks/userSubscription.mock';
import { selectHasActiveSubscription } from './subscriptionStore.selectors';
import { useSubscriptionStore } from './subscriptionStore';

vi.mock('@paynless/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      billing: vi.fn(() => ({
        getSubscriptionPlans: vi.fn(),
        getUserSubscription: vi.fn(),
        createPortalSession: vi.fn(),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        getUsageMetrics: vi.fn(),
      })),
    },
  };
});

vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./authStore', async () => {
  const authStoreMockModule = await import('../../../apps/web/src/mocks/authStore.mock');
  Object.assign(authStoreMockModule.useAuthStore, {
    subscribe: vi.fn(() => vi.fn()),
  });
  return { useAuthStore: authStoreMockModule.useAuthStore };
});

function subscriptionStateFromStore(): SubscriptionState {
  const state = useSubscriptionStore.getState();
  return {
    userSubscription: state.userSubscription,
    availablePlans: state.availablePlans,
    isSubscriptionLoading: state.isSubscriptionLoading,
    hasActiveSubscription: state.hasActiveSubscription,
    error: state.error,
  };
}

describe('selectHasActiveSubscription integration (subscriptionStore → selector)', () => {
  beforeEach(() => {
    act(() => {
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState(), true);
    });
  });

  it('returns false when producer setUserSubscription leaves trialing subscription with hasActiveSubscription false', () => {
    act(() => {
      useSubscriptionStore.getState().setUserSubscription(mockUserSubscriptionTrialing);
    });

    const producerState = useSubscriptionStore.getState();
    expect(producerState.userSubscription?.status).toBe('trialing');
    expect(producerState.hasActiveSubscription).toBe(false);

    expect(selectHasActiveSubscription(subscriptionStateFromStore())).toBe(false);
  });

  it('returns true when producer setUserSubscription leaves active subscription with hasActiveSubscription true', () => {
    act(() => {
      useSubscriptionStore.getState().setUserSubscription(mockUserSubscriptionActive);
    });

    const producerState = useSubscriptionStore.getState();
    expect(producerState.userSubscription?.status).toBe('active');
    expect(producerState.hasActiveSubscription).toBe(true);

    expect(selectHasActiveSubscription(subscriptionStateFromStore())).toBe(true);
  });
});
