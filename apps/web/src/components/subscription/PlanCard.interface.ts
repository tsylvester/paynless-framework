import { SubscriptionPlan } from '@paynless/types';

export type PlanCardFormatAmountFn = (
  amount: number,
  currency: string,
) => string;

export type PlanCardFormatIntervalFn = (
  interval: string | null | undefined,
  count: number | null | undefined,
) => string;

export type PlanCardOnSelectFn = (plan: SubscriptionPlan) => void;

export type PlanCardOnAddFn = (plan: SubscriptionPlan) => void;

export type PlanCardOnDowngradeFn = () => void;

export interface PlanCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan: boolean;
  userIsOnPaidPlan: boolean;
  isProcessing: boolean;
  onSelect: PlanCardOnSelectFn;
  onAdd: PlanCardOnAddFn;
  onDowngrade: PlanCardOnDowngradeFn;
  isInCart: boolean;
  cartQuantity: number;
  formatAmount: PlanCardFormatAmountFn;
  formatInterval: PlanCardFormatIntervalFn;
}
