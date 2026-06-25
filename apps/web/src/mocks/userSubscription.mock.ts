import { UserSubscription } from '@paynless/types';

export const MOCK_USER_SUBSCRIPTION_TIMESTAMP: string =
  '2024-01-01T00:00:00.000Z';

const MOCK_USER_SUBSCRIPTION_PERIOD_END: string = '2024-02-01T00:00:00.000Z';

export type UserSubscriptionOverrides = {
  [K in keyof UserSubscription]?: UserSubscription[K] | null | undefined;
};

export const mockUserSubscriptionActive: UserSubscription = {
  id: 'sub_user_123',
  user_id: 'user-abc',
  stripe_customer_id: 'cus_xyz',
  stripe_subscription_id: 'stripe_sub_xyz',
  status: 'active',
  plan_id: 'plan_pro_456',
  current_period_start: MOCK_USER_SUBSCRIPTION_TIMESTAMP,
  current_period_end: MOCK_USER_SUBSCRIPTION_PERIOD_END,
  cancel_at_period_end: false,
  created_at: MOCK_USER_SUBSCRIPTION_TIMESTAMP,
  updated_at: MOCK_USER_SUBSCRIPTION_TIMESTAMP,
  has_ever_paid: true,
  tier_level: 10,
};

function applyUserSubscriptionOverrides(
  result: UserSubscription,
  overrides: UserSubscriptionOverrides,
): void {
  const keys: Array<keyof UserSubscription> = Object.keys(
    overrides,
  ) as Array<keyof UserSubscription>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      Reflect.set(result, key, overrides[key]);
    }
  }
}

export function buildUserSubscription(
  overrides?: UserSubscriptionOverrides,
): UserSubscription {
  const result: UserSubscription = { ...mockUserSubscriptionActive };
  if (overrides === undefined) {
    return result;
  }
  applyUserSubscriptionOverrides(result, overrides);
  return result;
}

export const mockUserSubscriptionTrialing: UserSubscription = buildUserSubscription(
  { status: 'trialing' },
);

export const mockUserSubscriptionPastDue: UserSubscription = buildUserSubscription(
  { status: 'past_due' },
);
