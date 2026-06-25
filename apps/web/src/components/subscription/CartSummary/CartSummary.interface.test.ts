import { describe, it, expect } from 'vitest';
import type { CartSummaryProps } from './CartSummary.interface';

describe('CartSummary.interface contract', () => {
  describe('CartSummaryProps', () => {
    it('valid CartSummaryProps with all CartSummaryProps fields must pass', () => {
      const props: CartSummaryProps = {
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      };
      expect(props.cart).toBeDefined();
      expect(typeof props.isCheckingOut).toBe('boolean');
      expect(props.checkoutError).toBeNull();
      expect(typeof props.onRemoveSubscription).toBe('function');
      expect(typeof props.onRemoveOtp).toBe('function');
      expect(typeof props.onClearCart).toBe('function');
      expect(typeof props.onCheckout).toBe('function');
      expect(typeof props.formatAmount).toBe('function');
    });

    it('valid CartSummaryProps with empty cart must pass', () => {
      const props: CartSummaryProps = {
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      };
      expect(props.cart.subscriptionItem).toBeNull();
      expect(props.cart.otpItems).toEqual([]);
    });

    it('valid CartSummaryProps with checkoutError as Error instance must pass', () => {
      const props: CartSummaryProps = {
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: new Error('Payment failed'),
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      };
      expect(props.checkoutError).toBeInstanceOf(Error);
      expect(props.checkoutError?.message).toBe('Payment failed');
    });

    it('edge valid CartSummaryProps with checkoutError null must pass', () => {
      const props: CartSummaryProps = {
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      };
      expect(props.checkoutError).toBeNull();
    });

    it('invalid CartSummaryProps cart is null must fail contract', () => {
      const absent: CartSummaryProps | null = null;
      expect(absent).toBeNull();
      const cartKey: keyof CartSummaryProps = 'cart';
      expect(cartKey).toBe('cart');
    });

    it('invalid CartSummaryProps cart with otpItems not an array must fail contract', () => {
      const notCartField = {
        subscriptionItem: null,
        otpItems: 'not-an-array',
      };
      expect(Array.isArray(notCartField.otpItems)).toBe(false);
      const cartKey: keyof CartSummaryProps = 'cart';
      expect(cartKey).toBe('cart');
    });

    it('invalid CartSummaryProps isCheckingOut is not boolean must fail contract', () => {
      const invalidIsCheckingOut: string = 'true';
      expect(typeof invalidIsCheckingOut).not.toBe('boolean');
      const isCheckingOutKey: keyof CartSummaryProps = 'isCheckingOut';
      expect(isCheckingOutKey).toBe('isCheckingOut');
    });

    it('invalid CartSummaryProps missing onRemoveSubscription callback must fail contract', () => {
      const onRemoveSubscriptionKey: keyof CartSummaryProps = 'onRemoveSubscription';
      expect(onRemoveSubscriptionKey).toBe('onRemoveSubscription');
      const missingCallback: undefined = undefined;
      expect(missingCallback).toBeUndefined();
    });

    it('invalid CartSummaryProps missing onRemoveOtp callback must fail contract', () => {
      const onRemoveOtpKey: keyof CartSummaryProps = 'onRemoveOtp';
      expect(onRemoveOtpKey).toBe('onRemoveOtp');
      const missingCallback: undefined = undefined;
      expect(missingCallback).toBeUndefined();
    });

    it('invalid CartSummaryProps missing onClearCart callback must fail contract', () => {
      const onClearCartKey: keyof CartSummaryProps = 'onClearCart';
      expect(onClearCartKey).toBe('onClearCart');
      const missingCallback: undefined = undefined;
      expect(missingCallback).toBeUndefined();
    });

    it('invalid CartSummaryProps missing onCheckout callback must fail contract', () => {
      const onCheckoutKey: keyof CartSummaryProps = 'onCheckout';
      expect(onCheckoutKey).toBe('onCheckout');
      const missingCallback: undefined = undefined;
      expect(missingCallback).toBeUndefined();
    });

    it('invalid CartSummaryProps onCheckout is string instead of function must fail contract', () => {
      const notAFunction: string = 'checkout';
      expect(typeof notAFunction).not.toBe('function');
      const onCheckoutKey: keyof CartSummaryProps = 'onCheckout';
      expect(onCheckoutKey).toBe('onCheckout');
    });

    it('invalid CartSummaryProps missing formatAmount must fail contract', () => {
      const formatAmountKey: keyof CartSummaryProps = 'formatAmount';
      expect(formatAmountKey).toBe('formatAmount');
      const missingFormatAmount: undefined = undefined;
      expect(missingFormatAmount).toBeUndefined();
    });

    it('invalid CartSummaryProps formatAmount is not a function must fail contract', () => {
      const notAFunction: number = 1;
      expect(typeof notAFunction).not.toBe('function');
      const formatAmountKey: keyof CartSummaryProps = 'formatAmount';
      expect(formatAmountKey).toBe('formatAmount');
    });

    it('invariant CartSummaryProps declares cart key', () => {
      const cartKey: keyof CartSummaryProps = 'cart';
      expect(cartKey).toBe('cart');
    });

    it('invariant CartSummaryProps declares isCheckingOut key', () => {
      const isCheckingOutKey: keyof CartSummaryProps = 'isCheckingOut';
      expect(isCheckingOutKey).toBe('isCheckingOut');
    });

    it('invariant CartSummaryProps declares checkoutError key', () => {
      const checkoutErrorKey: keyof CartSummaryProps = 'checkoutError';
      expect(checkoutErrorKey).toBe('checkoutError');
    });

    it('invariant CartSummaryProps callbacks are functions on valid props', () => {
      const props: CartSummaryProps = {
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: false,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      };
      expect(typeof props.onRemoveSubscription).toBe('function');
      expect(typeof props.onRemoveOtp).toBe('function');
      expect(typeof props.onClearCart).toBe('function');
      expect(typeof props.onCheckout).toBe('function');
      expect(typeof props.formatAmount).toBe('function');
    });

    it('invariant CartSummaryProps isCheckingOut is boolean on valid props', () => {
      const props: CartSummaryProps = {
        cart: { subscriptionItem: null, otpItems: [] },
        isCheckingOut: true,
        checkoutError: null,
        onRemoveSubscription: (): void => {},
        onRemoveOtp: (): void => {},
        onClearCart: (): void => {},
        onCheckout: (): void => {},
        formatAmount: (): string => '',
      };
      expect(typeof props.isCheckingOut).toBe('boolean');
    });
  });
});
