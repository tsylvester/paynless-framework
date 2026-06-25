import type { SubscriptionPlan } from '@paynless/types';

export interface CartItem {
  plan: SubscriptionPlan;
  quantity: number;
}

export interface CheckoutCart {
  subscriptionItem: CartItem | null;
  otpItems: CartItem[];
}

export interface PrefillCartRequest {
  subscriptionPlanId?: string;
  otpPlanIds?: string[];
}

export interface CartState {
  cart: CheckoutCart;
  isCheckingOut: boolean;
  checkoutError: Error | null;
}

export interface CartStore extends CartState {
  setSubscriptionItem: (plan: SubscriptionPlan | null) => void;
  addOtpItem: (plan: SubscriptionPlan, quantity: number) => void;
  removeOtpItem: (planId: string) => void;
  clearCart: () => void;
  prefillCart: (request: PrefillCartRequest) => void;
  checkoutCart: () => Promise<void>;
}
