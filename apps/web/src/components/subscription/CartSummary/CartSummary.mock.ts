import { createElement, type ReactElement } from 'react';
import { vi, type Mock } from 'vitest';
import { buildCartItem, buildCheckoutCart } from '../../../../../../packages/store/src/cartStore/cartStore.mock';
import {
  buildSubscriptionPlan,
  mockFormatAmount,
  mockOtpPlan,
  mockSubscriptionPlan,
} from '../PlanCard.mock';
import type {
  CartSummaryFormatAmountFn,
  CartSummaryProps,
} from './CartSummary.interface';

export type CartSummaryPropsOverrides = {
  [K in keyof CartSummaryProps]?: CartSummaryProps[K] | null;
};

export type CartSummaryCallbacks = {
  onRemoveSubscription: Mock<[], void>;
  onRemoveOtp: Mock<[planId: string], void>;
  onClearCart: Mock<[], void>;
  onCheckout: Mock<[], void>;
};

export const mockOnRemoveSubscription: Mock<[], void> = vi.fn();

export const mockOnRemoveOtp: Mock<[planId: string], void> = vi.fn();

export const mockOnClearCart: Mock<[], void> = vi.fn();

export const mockOnCheckout: Mock<[], void> = vi.fn();

export const mockCartSummaryFormatAmount: CartSummaryFormatAmountFn =
  mockFormatAmount;

const mockCartSummarySecondOtpPlan = buildSubscriptionPlan({
  id: 'plan_otp_456',
  stripe_price_id: 'price_otp_stripe_456',
  name: 'Token Pack Plus',
  amount: 300,
});

const mockCartSummaryDefaultCart = buildCheckoutCart({
  subscriptionItem: buildCartItem({
    plan: mockSubscriptionPlan,
    quantity: 1,
  }),
  otpItems: [
    buildCartItem({ plan: mockOtpPlan, quantity: 2 }),
    buildCartItem({
      plan: mockCartSummarySecondOtpPlan,
      quantity: 1,
    }),
  ],
});

export function createMockCartSummaryCallbacks(): CartSummaryCallbacks {
  const onRemoveSubscription: Mock<[], void> = vi.fn();
  const onRemoveOtp: Mock<[planId: string], void> = vi.fn();
  const onClearCart: Mock<[], void> = vi.fn();
  const onCheckout: Mock<[], void> = vi.fn();
  return {
    onRemoveSubscription,
    onRemoveOtp,
    onClearCart,
    onCheckout,
  };
}

function buildDefaultCartSummaryCallbacks(): CartSummaryCallbacks {
  return {
    onRemoveSubscription: mockOnRemoveSubscription,
    onRemoveOtp: mockOnRemoveOtp,
    onClearCart: mockOnClearCart,
    onCheckout: mockOnCheckout,
  };
}

export function buildCartSummaryProps(
  overrides?: CartSummaryPropsOverrides,
): CartSummaryProps {
  const defaultCallbacks: CartSummaryCallbacks = buildDefaultCartSummaryCallbacks();
  const base: CartSummaryProps = {
    cart: mockCartSummaryDefaultCart,
    isCheckingOut: false,
    checkoutError: null,
    onRemoveSubscription: defaultCallbacks.onRemoveSubscription,
    onRemoveOtp: defaultCallbacks.onRemoveOtp,
    onClearCart: defaultCallbacks.onClearCart,
    onCheckout: defaultCallbacks.onCheckout,
    formatAmount: mockCartSummaryFormatAmount,
  };
  if (overrides === undefined) {
    return base;
  }
  return {
    cart:
      overrides.cart !== undefined && overrides.cart !== null
        ? overrides.cart
        : base.cart,
    isCheckingOut:
      overrides.isCheckingOut !== undefined &&
      overrides.isCheckingOut !== null
        ? overrides.isCheckingOut
        : base.isCheckingOut,
    checkoutError:
      overrides.checkoutError !== undefined
        ? overrides.checkoutError
        : base.checkoutError,
    onRemoveSubscription:
      overrides.onRemoveSubscription !== undefined &&
      overrides.onRemoveSubscription !== null
        ? overrides.onRemoveSubscription
        : base.onRemoveSubscription,
    onRemoveOtp:
      overrides.onRemoveOtp !== undefined && overrides.onRemoveOtp !== null
        ? overrides.onRemoveOtp
        : base.onRemoveOtp,
    onClearCart:
      overrides.onClearCart !== undefined && overrides.onClearCart !== null
        ? overrides.onClearCart
        : base.onClearCart,
    onCheckout:
      overrides.onCheckout !== undefined && overrides.onCheckout !== null
        ? overrides.onCheckout
        : base.onCheckout,
    formatAmount:
      overrides.formatAmount !== undefined && overrides.formatAmount !== null
        ? overrides.formatAmount
        : base.formatAmount,
  };
}

export function mockCartSummaryProps(
  overrides?: CartSummaryPropsOverrides,
): CartSummaryProps {
  return buildCartSummaryProps(overrides);
}

export function mockEmptyCartSummaryProps(
  overrides?: CartSummaryPropsOverrides,
): CartSummaryProps {
  const emptyCart = buildCheckoutCart({
    subscriptionItem: null,
    otpItems: [],
  });
  return buildCartSummaryProps({
    ...overrides,
    cart:
      overrides !== undefined &&
      overrides.cart !== undefined &&
      overrides.cart !== null
        ? overrides.cart
        : emptyCart,
  });
}

export function initializeMockCartSummaryCallbacks(): void {
  mockOnRemoveSubscription.mockClear();
  mockOnRemoveOtp.mockClear();
  mockOnClearCart.mockClear();
  mockOnCheckout.mockClear();
}

export function MockCartSummary(): ReactElement {
  return createElement('div', { 'data-testid': 'mock-cart-summary' });
}
