import { describe, it, expect } from 'vitest';
import type { SubscriptionState, UserSubscription, SubscriptionPlan } from '@paynless/types';
import {
  selectUserSubscription,
  selectAvailablePlans,
  selectIsSubscriptionLoading,
  selectHasActiveSubscription,
  selectSubscriptionError,
  selectCurrentUserResolvedPlan,
  selectCurrentUserSubscriptionPeriod,
  selectCurrentUserTokenBudget,
} from './subscriptionStore.selectors';

// Mock Data
const mockPlan1: SubscriptionPlan = {
  id: 'plan_1',
  active: true,
  amount: 1000,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  name: 'Pro Plan',
  stripe_price_id: 'price_1',
  stripe_product_id: 'prod_1',
  metadata: { token_limit: 100000, features: ['feature_a'] },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: null,
};

const mockPlan2: SubscriptionPlan = {
  id: 'plan_2',
  active: true,
  amount: 5000,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  name: 'Team Plan',
  stripe_price_id: 'price_2',
  stripe_product_id: 'prod_2',
  metadata: { token_limit: 500000, features: ['feature_a', 'feature_b'] },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: null,
};

const mockPlanNoLimit: SubscriptionPlan = {
  id: 'plan_free',
  active: true,
  amount: 0,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  name: 'Free Plan',
  stripe_price_id: 'price_free',
  stripe_product_id: 'prod_free',
  metadata: { features: ['basic_feature'] }, // No token_limit
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: null,
};

const mockUserSubActivePlan1: UserSubscription = {
  id: 'sub_active_1',
  user_id: 'user_123',
  plan_id: 'plan_1',
  status: 'active',
  current_period_start: '2023-01-01T00:00:00Z',
  current_period_end: '2023-02-01T00:00:00Z',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  cancel_at_period_end: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
};

const mockUserSubTrialingPlan2: UserSubscription = {
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
};

const mockUserSubNoPlanId: UserSubscription = {
  ...mockUserSubActivePlan1,
  id: 'sub_no_plan_id',
  plan_id: null,
};

const mockUserSubNoPeriodDates: UserSubscription = {
    ...mockUserSubActivePlan1,
    id: 'sub_no_period',
    current_period_start: null,
    current_period_end: null,
};

const initialMockState: SubscriptionState = {
  userSubscription: null,
  availablePlans: [],
  isSubscriptionLoading: false,
  hasActiveSubscription: false,
  isTestMode: false,
  error: null,
};

describe('Subscription Selectors', () => {
  describe('selectUserSubscription', () => {
    it('should return the userSubscription from state', () => {
      const state: SubscriptionState = { ...initialMockState, userSubscription: mockUserSubActivePlan1 };
      expect(selectUserSubscription(state)).toBe(mockUserSubActivePlan1);
    });
  });

  describe('selectAvailablePlans', () => {
    it('should return the availablePlans from state', () => {
      const plans = [mockPlan1, mockPlan2];
      const state: SubscriptionState = { ...initialMockState, availablePlans: plans };
      expect(selectAvailablePlans(state)).toBe(plans);
    });
  });

  describe('selectIsSubscriptionLoading', () => {
    it('should return isSubscriptionLoading state', () => {
      const state: SubscriptionState = { ...initialMockState, isSubscriptionLoading: true };
      expect(selectIsSubscriptionLoading(state)).toBe(true);
    });
  });

  describe('selectHasActiveSubscription', () => {
    it('should return hasActiveSubscription state', () => {
      const state: SubscriptionState = { ...initialMockState, hasActiveSubscription: true };
      expect(selectHasActiveSubscription(state)).toBe(true);
    });
  });

  describe('selectSubscriptionError', () => {
    it('should return error state', () => {
      const error = new Error('Test Error');
      const state: SubscriptionState = { ...initialMockState, error };
      expect(selectSubscriptionError(state)).toBe(error);
    });
  });

  describe('selectCurrentUserResolvedPlan', () => {
    const stateWithPlans: SubscriptionState = {
      ...initialMockState,
      availablePlans: [mockPlan1, mockPlan2, mockPlanNoLimit],
    };

    it('should return the resolved plan if user has an active subscription with a valid plan_id', () => {
      const state = { ...stateWithPlans, userSubscription: mockUserSubActivePlan1 };
      expect(selectCurrentUserResolvedPlan(state)).toBe(mockPlan1);
    });

    it('should return null if userSubscription is null', () => {
      const state = { ...stateWithPlans, userSubscription: null };
      expect(selectCurrentUserResolvedPlan(state)).toBeNull();
    });

    it('should return null if userSubscription.plan_id is null', () => {
      const state = { ...stateWithPlans, userSubscription: mockUserSubNoPlanId };
      expect(selectCurrentUserResolvedPlan(state)).toBeNull();
    });

    it('should return null if plan_id does not exist in availablePlans', () => {
      const state = {
        ...stateWithPlans,
        userSubscription: { ...mockUserSubActivePlan1, plan_id: 'non_existent_plan' },
      };
      expect(selectCurrentUserResolvedPlan(state)).toBeNull();
    });
  });

  describe('selectCurrentUserSubscriptionPeriod', () => {
    it('should return the period if userSubscription has start and end dates', () => {
      const state: SubscriptionState = { ...initialMockState, userSubscription: mockUserSubActivePlan1 };
      expect(selectCurrentUserSubscriptionPeriod(state)).toEqual({
        start: mockUserSubActivePlan1.current_period_start,
        end: mockUserSubActivePlan1.current_period_end,
      });
    });

    it('should return null if userSubscription is null', () => {
      const state: SubscriptionState = { ...initialMockState, userSubscription: null };
      expect(selectCurrentUserSubscriptionPeriod(state)).toBeNull();
    });

    it('should return null if current_period_start is missing', () => {
      const state: SubscriptionState = { ...initialMockState, userSubscription: { ...mockUserSubActivePlan1, current_period_start: null } };
      expect(selectCurrentUserSubscriptionPeriod(state)).toBeNull();
    });

    it('should return null if current_period_end is missing', () => {
      const state: SubscriptionState = { ...initialMockState, userSubscription: { ...mockUserSubActivePlan1, current_period_end: null } };
      expect(selectCurrentUserSubscriptionPeriod(state)).toBeNull();
    });
    it('should return null if both period dates are missing', () => {
        const state: SubscriptionState = { ...initialMockState, userSubscription: mockUserSubNoPeriodDates };
        expect(selectCurrentUserSubscriptionPeriod(state)).toBeNull();
      });
  });

  describe('selectCurrentUserTokenBudget', () => {
    const stateWithPlansAndSub: SubscriptionState = {
      ...initialMockState,
      availablePlans: [mockPlan1, mockPlan2, mockPlanNoLimit],
      userSubscription: mockUserSubActivePlan1, // linked to mockPlan1
    };

    it('should return the token_limit if plan is resolved and metadata contains token_limit', () => {
      expect(selectCurrentUserTokenBudget(stateWithPlansAndSub)).toBe(100000);
    });

    it('should return null if resolved plan is null (e.g., no subscription)', () => {
      const state = { ...stateWithPlansAndSub, userSubscription: null };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });

    it('should return null if resolved plan metadata is null', () => {
      const planWithNullMeta: SubscriptionPlan = { ...mockPlan1, metadata: null };
      const state = {
        ...initialMockState,
        availablePlans: [planWithNullMeta],
        userSubscription: { ...mockUserSubActivePlan1, plan_id: planWithNullMeta.id },
      };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });

    it('should return null if token_limit is missing in metadata', () => {
      const state = {
        ...initialMockState,
        availablePlans: [mockPlanNoLimit],
        userSubscription: { ...mockUserSubActivePlan1, plan_id: mockPlanNoLimit.id },
      };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });

    it('should return null if token_limit is not a number', () => {
      const planWithInvalidLimit: SubscriptionPlan = {
        ...mockPlan1,
        metadata: { token_limit: 'not-a-number' },
      };
      const state = {
        ...initialMockState,
        availablePlans: [planWithInvalidLimit],
        userSubscription: { ...mockUserSubActivePlan1, plan_id: planWithInvalidLimit.id },
      };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });
  });
}); 