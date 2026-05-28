import { vi, type Mock } from 'vitest';
import {
  buildSubscriptionPlan,
  mockFormatAmount,
  mockFormatInterval,
} from './PlanCard.mock';
import {
  mockUserSubscriptionActive,
} from '../../mocks/userSubscription.mock';
import type { CurrentSubscriptionCardProps } from './CurrentSubscriptionCard.interface';

export const mockHandleManageSubscription: Mock<[], void> = vi.fn();
export const mockHandleCancelSubscription: Mock<[], void> = vi.fn();

export type CurrentSubscriptionCardPropsOverrides = {
  [K in keyof CurrentSubscriptionCardProps]?:
    | CurrentSubscriptionCardProps[K]
    | null
    | undefined;
};

function applyCurrentSubscriptionCardPropsOverrides(
  result: CurrentSubscriptionCardProps,
  overrides: CurrentSubscriptionCardPropsOverrides,
): void {
  const keys: Array<keyof CurrentSubscriptionCardProps> = Object.keys(
    overrides,
  ) as Array<keyof CurrentSubscriptionCardProps>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      Reflect.set(result, key, overrides[key]);
    }
  }
}

export function buildCurrentSubscriptionCardProps(
  overrides?: CurrentSubscriptionCardPropsOverrides,
): CurrentSubscriptionCardProps {
  const base: CurrentSubscriptionCardProps = {
    subscription: mockUserSubscriptionActive,
    plan: buildSubscriptionPlan(),
    isProcessing: false,
    handleManageSubscription: mockHandleManageSubscription,
    handleCancelSubscription: mockHandleCancelSubscription,
    formatAmount: mockFormatAmount,
    formatInterval: mockFormatInterval,
  };
  if (overrides === undefined) {
    return base;
  }
  const result: CurrentSubscriptionCardProps = { ...base };
  applyCurrentSubscriptionCardPropsOverrides(result, overrides);
  return result;
}

export const defaultCurrentSubscriptionCardProps: CurrentSubscriptionCardProps =
  buildCurrentSubscriptionCardProps();
