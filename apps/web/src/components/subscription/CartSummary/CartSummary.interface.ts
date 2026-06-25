import type { ReactElement } from 'react';
import type { CheckoutCart } from '@paynless/store';

export type CartSummaryFormatAmountFn = (
  amount: number,
  currency: string,
) => string;

export type CartSummaryOnRemoveSubscriptionFn = () => void;

export type CartSummaryOnRemoveOtpFn = (planId: string) => void;

export type CartSummaryOnClearCartFn = () => void;

export type CartSummaryOnCheckoutFn = () => void;

export type CartSummaryElement = ReactElement | null;

export interface CartSummaryProps {
  cart: CheckoutCart;
  isCheckingOut: boolean;
  checkoutError: Error | null;
  onRemoveSubscription: CartSummaryOnRemoveSubscriptionFn;
  onRemoveOtp: CartSummaryOnRemoveOtpFn;
  onClearCart: CartSummaryOnClearCartFn;
  onCheckout: CartSummaryOnCheckoutFn;
  formatAmount: CartSummaryFormatAmountFn;
}
