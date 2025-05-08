import { createSelector } from 'reselect';
import type { SubscriptionState, UserSubscription, SubscriptionPlan } from '@paynless/types';

// Base selector for the entire subscription state (primarily for internal use or simple accessors)
// const selectSubscriptionState = (state: SubscriptionState) => state;

/**
 * Selects the current user's subscription details.
 */
export const selectUserSubscription = (state: SubscriptionState): UserSubscription | null => state.userSubscription;

/**
 * Selects the list of all available subscription plans.
 */
export const selectAvailablePlans = (state: SubscriptionState): SubscriptionPlan[] => state.availablePlans;

/**
 * Selects the loading state of the subscription data.
 */
export const selectIsSubscriptionLoading = (state: SubscriptionState): boolean => state.isSubscriptionLoading;

/**
 * Selects whether the user has an active subscription (either 'active' or 'trialing').
 */
export const selectHasActiveSubscription = (state: SubscriptionState): boolean => state.hasActiveSubscription;

/**
 * Selects any error related to subscription operations.
 */
export const selectSubscriptionError = (state: SubscriptionState): Error | null => state.error;

/**
 * Resolves and selects the current user's active subscription plan object.
 * It looks up the plan details from availablePlans using the plan_id from userSubscription.
 */
export const selectCurrentUserResolvedPlan = createSelector(
  [selectUserSubscription, selectAvailablePlans],
  (userSubscription, availablePlans): SubscriptionPlan | null => {
    if (!userSubscription || !userSubscription.plan_id) {
      return null;
    }
    return availablePlans.find(plan => plan.id === userSubscription.plan_id) || null;
  }
);

/**
 * Selects the current user's active subscription period (start and end dates).
 */
export const selectCurrentUserSubscriptionPeriod = createSelector(
  [selectUserSubscription],
  (userSubscription): { start: string; end: string } | null => {
    if (
      userSubscription &&
      userSubscription.current_period_start &&
      userSubscription.current_period_end
    ) {
      return {
        start: userSubscription.current_period_start,
        end: userSubscription.current_period_end,
      };
    }
    return null;
  }
);

/**
 * Selects the current user's token budget from their active plan's metadata.
 * Assumes the budget is stored in `plan.metadata.token_limit`.
 */
export const selectCurrentUserTokenBudget = createSelector(
  [selectCurrentUserResolvedPlan],
  (resolvedPlan): number | null => {
    if (resolvedPlan && resolvedPlan.metadata && typeof (resolvedPlan.metadata as any).token_limit === 'number') {
      return (resolvedPlan.metadata as any).token_limit;
    }
    // TODO: Consider a default for free plans or if metadata is missing/malformed.
    // For now, null indicates no specific budget found or plan not resolved.
    return null;
  }
); 