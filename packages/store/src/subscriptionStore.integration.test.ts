import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { Session, SubscriptionPlan, User, UserSubscription } from '@paynless/types';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import {
  mockStripeGetSubscriptionPlans,
  mockStripeGetUserSubscription,
  resetStripeMocks,
} from '@paynless/api/mocks/stripe.mock';
import {
  mockSetAuthSession,
  mockSetAuthUser,
  resetAuthStoreMock,
} from '../../../apps/web/src/mocks/authStore.mock';
import {
  initializeMockSubscriptionStore,
  mockSetUserSubscription,
  mockedUseSubscriptionStoreHookLogic,
} from '../../../apps/web/src/mocks/subscriptionStore.mock';
import { useSubscriptionStore } from './subscriptionStore';

const integrationUser: User = {
  id: 'user_abc',
  email: 'test@example.com',
};

const integrationSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expiresAt: Date.now() + 3600000,
};

const mockSubscriptionActive: UserSubscription = {
  id: 'sub_123',
  user_id: 'user_abc',
  status: 'active',
  plan_id: 'plan_xyz',
  stripe_customer_id: 'cus_abc',
  stripe_subscription_id: 'sub_ext_123',
  current_period_start: new Date().toISOString(),
  current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancel_at_period_end: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  has_ever_paid: true,
  tier_level: 10,
};

const mockUserSubTrialing: UserSubscription = {
  id: 'sub_trial_2',
  user_id: 'user_123',
  plan_id: 'plan_2',
  status: 'trialing',
  current_period_start: '2023-03-01T00:00:00Z',
  current_period_end: '2023-04-01T00:00:00Z',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  cancel_at_period_end: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  has_ever_paid: false,
  tier_level: 0,
};

const mockPlans: SubscriptionPlan[] = [
  {
    id: 'plan_abc',
    name: 'Basic',
    stripe_price_id: 'price_basic',
    amount: 500,
    currency: 'usd',
    interval: 'month',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    interval_count: 1,
    item_id_internal: null,
    metadata: null,
    plan_type: 'subscription',
    tokens_to_award: null,
    tier_level: 10,
    stripe_product_id: null,
  },
];

vi.mock('@paynless/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      billing: vi.fn(() => ({
        getSubscriptionPlans: mockStripeGetSubscriptionPlans,
        getUserSubscription: mockStripeGetUserSubscription,
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

describe('useSubscriptionStore (integration)', () => {
  beforeEach(() => {
    initializeApiClient({
      supabaseUrl: 'http://dummy.url',
      supabaseAnonKey: 'dummy-key',
    });
    resetStripeMocks();
    resetAuthStoreMock();
    initializeMockSubscriptionStore();
    act(() => {
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState(), true);
    });
    mockSetAuthUser(integrationUser);
    mockSetAuthSession(integrationSession);
  });

  afterEach(() => {
    _resetApiClient();
    vi.clearAllMocks();
  });

  it('loadSubscriptionData with trialing subscription sets hasActiveSubscription false on real store', async () => {
    mockStripeGetSubscriptionPlans.mockResolvedValue({ data: mockPlans, error: null });
    mockStripeGetUserSubscription.mockResolvedValue({ data: mockUserSubTrialing, error: null });

    await act(async () => {
      await useSubscriptionStore.getState().loadSubscriptionData(integrationUser.id);
    });

    expect(mockStripeGetUserSubscription).toHaveBeenCalledWith({
      token: integrationSession.access_token,
    });
    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(false);
    expect(useSubscriptionStore.getState().userSubscription?.status).toBe('trialing');
  });

  it('loadSubscriptionData with active subscription sets hasActiveSubscription true on real store', async () => {
    mockStripeGetSubscriptionPlans.mockResolvedValue({ data: mockPlans, error: null });
    mockStripeGetUserSubscription.mockResolvedValue({ data: mockSubscriptionActive, error: null });

    await act(async () => {
      await useSubscriptionStore.getState().loadSubscriptionData(integrationUser.id);
    });

    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(true);
    expect(useSubscriptionStore.getState().error).toBeNull();
  });

  it('setUserSubscription with trialing derives identical hasActiveSubscription on real store and web mock', () => {
    act(() => {
      useSubscriptionStore.getState().setUserSubscription(mockUserSubTrialing);
    });
    mockSetUserSubscription(mockUserSubTrialing);

    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(false);
    expect(mockedUseSubscriptionStoreHookLogic.getState().hasActiveSubscription).toBe(false);
    expect(useSubscriptionStore.getState().userSubscription?.status).toBe('trialing');
    expect(mockedUseSubscriptionStoreHookLogic.getState().userSubscription?.status).toBe('trialing');
  });
});
