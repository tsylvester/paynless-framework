import { describe, it, expect } from 'vitest';
import { isCartSummaryProps } from './CartSummary.guard';

describe('isCartSummaryProps', () => {
  it('returns true for full valid props with cart items all callbacks and formatAmount', () => {
    expect(
      isCartSummaryProps({
        cart: {
          subscriptionItem: { plan: {}, quantity: 1 },
          otpItems: [{ plan: {}, quantity: 2 }],
        },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(true);
  });

  it('returns true for valid props with empty cart', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(true);
  });

  it('returns true for valid props with checkoutError as Error instance', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: new Error('Payment failed'),
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(true);
  });

  it('returns false for null', () => {
    const value: null = null;
    expect(isCartSummaryProps(value)).toBe(false);
  });

  it('returns false for non-object string value', () => {
    const value: string = 'not-props';
    expect(isCartSummaryProps(value)).toBe(false);
  });

  it('returns false for non-object number value', () => {
    const value: number = 42;
    expect(isCartSummaryProps(value)).toBe(false);
  });

  it('returns false when cart field is missing', () => {
    expect(
      isCartSummaryProps({
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when cart field is not a valid CheckoutCart with otpItems as string', () => {
    expect(
      isCartSummaryProps({
        cart: {
          subscriptionItem: null,
          otpItems: 'not-an-array',
        },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when isCheckingOut is string instead of boolean', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: 'true',
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when onRemoveSubscription callback is missing', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when onRemoveOtp callback is missing', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when onClearCart callback is missing', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when onCheckout callback is missing', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when onCheckout is string instead of function', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: 'checkout',
        formatAmount: (): string => '',
      }),
    ).toBe(false);
  });

  it('returns false when formatAmount is missing', () => {
    expect(
      isCartSummaryProps({
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
      }),
    ).toBe(false);
  });
});
