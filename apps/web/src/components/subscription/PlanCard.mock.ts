import { vi, type Mock } from 'vitest';
import { SubscriptionPlan } from '@paynless/types';
import type {
  PlanCardFormatAmountFn,
  PlanCardFormatIntervalFn,
  PlanCardProps,
} from './PlanCard.interface';

const MOCK_PLAN_TIMESTAMP: string = '2024-01-01T00:00:00.000Z';

export type SubscriptionPlanOverrides = {
  [K in keyof SubscriptionPlan]?: SubscriptionPlan[K] | null | undefined;
};

export type PlanCardPropsOverrides = {
  [K in keyof PlanCardProps]?: PlanCardProps[K] | null | undefined;
};

export type PlanCardCallbacks = {
  onSelect: Mock<[plan: SubscriptionPlan], void>;
  onAdd: Mock<[plan: SubscriptionPlan], void>;
  onDowngrade: Mock<[], void>;
};

export const mockSubscriptionPlan: SubscriptionPlan = {
  id: 'plan_basic_123',
  stripe_price_id: 'price_basic_stripe_123',
  stripe_product_id: 'prod_basic_stripe',
  name: 'Basic Plan',
  description: {
    subtitle: 'Good for starters',
    features: ['Feature 1', 'Feature 2'],
  },
  amount: 1000,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  active: true,
  metadata: null,
  created_at: MOCK_PLAN_TIMESTAMP,
  updated_at: MOCK_PLAN_TIMESTAMP,
  item_id_internal: null,
  plan_type: 'subscription',
  tokens_to_award: 1000,
  tier_level: 10,
};

export const mockOtpPlan: SubscriptionPlan = {
  id: 'plan_otp_123',
  stripe_price_id: 'price_otp_stripe_123',
  stripe_product_id: 'prod_otp_stripe',
  name: 'Token Pack',
  description: {
    subtitle: 'One-time token purchase',
    features: ['5000 tokens'],
  },
  amount: 500,
  currency: 'usd',
  interval: null,
  interval_count: null,
  active: true,
  metadata: null,
  created_at: MOCK_PLAN_TIMESTAMP,
  updated_at: MOCK_PLAN_TIMESTAMP,
  item_id_internal: null,
  plan_type: 'one_time_purchase',
  tokens_to_award: 5000,
  tier_level: 0,
};

export const mockFreePlan: SubscriptionPlan = {
  id: 'plan_free_001',
  stripe_price_id: 'price_Free',
  stripe_product_id: null,
  name: 'Free',
  description: {
    subtitle: 'Basic free features',
    features: ['Limited Access'],
  },
  amount: 0,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  active: true,
  metadata: null,
  created_at: MOCK_PLAN_TIMESTAMP,
  updated_at: MOCK_PLAN_TIMESTAMP,
  item_id_internal: 'default_free',
  plan_type: 'subscription',
  tokens_to_award: 0,
  tier_level: 0,
};

export const mockFormatAmount: PlanCardFormatAmountFn = (
  amount: number,
  currency: string,
): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount / 100,
  );

export const mockFormatInterval: PlanCardFormatIntervalFn = (
  interval: string | null | undefined,
  count: number | null | undefined,
): string => {
  if (interval == null || count == null) {
    return '';
  }
  return count === 1 ? interval : `every ${count} ${interval}s`;
};

export function createMockPlanCardCallbacks(): PlanCardCallbacks {
  const onSelect: Mock<[plan: SubscriptionPlan], void> = vi.fn();
  const onAdd: Mock<[plan: SubscriptionPlan], void> = vi.fn();
  const onDowngrade: Mock<[], void> = vi.fn();
  return { onSelect, onAdd, onDowngrade };
}

function buildDefaultPlanCardCallbacks(): PlanCardCallbacks {
  return createMockPlanCardCallbacks();
}

function applySubscriptionPlanOverrides(
  result: SubscriptionPlan,
  overrides: SubscriptionPlanOverrides,
): void {
  const keys: Array<keyof SubscriptionPlan> = Object.keys(
    overrides,
  ) as Array<keyof SubscriptionPlan>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      Reflect.set(result, key, overrides[key]);
    }
  }
}

export function buildSubscriptionPlan(
  overrides?: SubscriptionPlanOverrides,
): SubscriptionPlan {
  const result: SubscriptionPlan = { ...mockSubscriptionPlan };
  if (overrides === undefined) {
    return result;
  }
  applySubscriptionPlanOverrides(result, overrides);
  return result;
}

export function buildPlanCardProps(
  overrides?: PlanCardPropsOverrides,
): PlanCardProps {
  const defaultCallbacks: PlanCardCallbacks = buildDefaultPlanCardCallbacks();
  const base: PlanCardProps = {
    plan: mockSubscriptionPlan,
    isCurrentPlan: false,
    userIsOnPaidPlan: false,
    isProcessing: false,
    onSelect: defaultCallbacks.onSelect,
    onAdd: defaultCallbacks.onAdd,
    onDowngrade: defaultCallbacks.onDowngrade,
    isInCart: false,
    cartQuantity: 0,
    formatAmount: mockFormatAmount,
    formatInterval: mockFormatInterval,
  };
  if (overrides === undefined) {
    return base;
  }
  const result: PlanCardProps = { ...base };
  const keys: Array<keyof PlanCardProps> = Object.keys(
    overrides,
  ) as Array<keyof PlanCardProps>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      Reflect.set(result, key, overrides[key]);
    }
  }
  return result;
}
