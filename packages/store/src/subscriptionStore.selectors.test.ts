import { describe, it, expect } from 'vitest';
import type { SubscriptionState, SubscriptionPlan } from '@paynless/types';
import { buildSubscriptionPlan } from '../../../apps/web/src/components/subscription/PlanCard.mock';
import {
  buildUserSubscription,
  mockUserSubscriptionTrialing,
} from '../../../apps/web/src/mocks/userSubscription.mock';
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

const mockPlan1: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan_1',
  name: 'Pro Plan',
  amount: 1000,
  stripe_price_id: 'price_1',
  stripe_product_id: 'prod_1',
  metadata: { token_limit: 100000, features: ['feature_a'] },
  tokens_to_award: 100000,
  tier_level: 10,
});

const mockPlan2: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan_2',
  name: 'Team Plan',
  amount: 5000,
  stripe_price_id: 'price_2',
  stripe_product_id: 'prod_2',
  metadata: { token_limit: 500000, features: ['feature_a', 'feature_b'] },
  tokens_to_award: 500000,
});

const mockPlanNoLimit: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan_free',
  name: 'Free Plan',
  amount: 0,
  stripe_price_id: 'price_free',
  stripe_product_id: 'prod_free',
  metadata: { features: ['basic_feature'] },
  tokens_to_award: 0,
  tier_level: 0,
});

const mockUserSubActivePlan1 = buildUserSubscription({
  id: 'sub_active_1',
  user_id: 'user_123',
  plan_id: 'plan_1',
  status: 'active',
  current_period_start: '2023-01-01T00:00:00Z',
  current_period_end: '2023-02-01T00:00:00Z',
  cancel_at_period_end: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
});

const mockUserSubNoPlanId = buildUserSubscription({
  id: 'sub_no_plan_id',
  plan_id: null,
});

const mockUserSubNoPeriodDates = buildUserSubscription({
  id: 'sub_no_period',
  current_period_start: null,
  current_period_end: null,
});

const initialMockState: SubscriptionState = {
  userSubscription: null,
  availablePlans: [],
  isSubscriptionLoading: false,
  hasActiveSubscription: false,
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

    it('returns false when store has trialing subscription and hasActiveSubscription false', () => {
      const state: SubscriptionState = {
        ...initialMockState,
        userSubscription: mockUserSubscriptionTrialing,
        hasActiveSubscription: false,
      };
      expect(selectHasActiveSubscription(state)).toBe(false);
      expect(state.userSubscription?.status).toBe('trialing');
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
        userSubscription: buildUserSubscription({ plan_id: 'non_existent_plan' }),
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
      const state: SubscriptionState = { ...initialMockState, userSubscription: buildUserSubscription({ current_period_start: null }) };
      expect(selectCurrentUserSubscriptionPeriod(state)).toBeNull();
    });

    it('should return null if current_period_end is missing', () => {
      const state: SubscriptionState = { ...initialMockState, userSubscription: buildUserSubscription({ current_period_end: null }) };
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
      const planWithNullMeta: SubscriptionPlan = buildSubscriptionPlan({
        id: mockPlan1.id,
        metadata: null,
      });
      const state = {
        ...initialMockState,
        availablePlans: [planWithNullMeta],
        userSubscription: buildUserSubscription({ plan_id: planWithNullMeta.id }),
      };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });

    it('should return null if token_limit is missing in metadata', () => {
      const state = {
        ...initialMockState,
        availablePlans: [mockPlanNoLimit],
        userSubscription: buildUserSubscription({ plan_id: mockPlanNoLimit.id }),
      };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });

    it('should return null if token_limit is not a number', () => {
      const planWithInvalidLimit: SubscriptionPlan = buildSubscriptionPlan({
        id: mockPlan1.id,
        metadata: { token_limit: 'not-a-number' },
      });
      const state = {
        ...initialMockState,
        availablePlans: [planWithInvalidLimit],
        userSubscription: buildUserSubscription({ plan_id: planWithInvalidLimit.id }),
      };
      expect(selectCurrentUserTokenBudget(state)).toBeNull();
    });
  });
}); 