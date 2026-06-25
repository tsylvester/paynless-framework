import { SubscriptionPlan, UserSubscription } from '@paynless/types';

export type CurrentSubscriptionCardFormatAmountFn = (
  amount: number,
  currency: string,
) => string;

export type CurrentSubscriptionCardFormatIntervalFn = (
  interval: string | null | undefined,
  count: number | null | undefined,
) => string;

export type CurrentSubscriptionCardHandleManageSubscriptionFn = () => void;

export type CurrentSubscriptionCardHandleCancelSubscriptionFn = () => void;

export interface CurrentSubscriptionCardProps {
  subscription: UserSubscription;
  plan: SubscriptionPlan;
  isProcessing: boolean;
  handleManageSubscription: CurrentSubscriptionCardHandleManageSubscriptionFn;
  handleCancelSubscription: CurrentSubscriptionCardHandleCancelSubscriptionFn;
  formatAmount: CurrentSubscriptionCardFormatAmountFn;
  formatInterval: CurrentSubscriptionCardFormatIntervalFn;
}
