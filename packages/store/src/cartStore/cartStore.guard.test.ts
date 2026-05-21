import { describe, it, expect } from 'vitest';
import type { CartItem, PrefillCartRequest } from './cartStore.interface';
import {
  isCartItem,
  isCheckoutCart,
  isPrefillCartRequest,
} from './cartStore.guard.ts';
import {
  buildCartItem,
  initialCheckoutCart,
  mockCartItemQty2,
  mockCheckoutCartWithLines,
  mockSubscriptionPlan,
} from './cartStore.mock';

describe('isCartItem', () => {
  it('returns true for valid CartItem with full SubscriptionPlan and positive quantity', () => {
    expect(isCartItem(mockCartItemQty2)).toBe(true);
  });

  it('returns true for valid CartItem with quantity of 1', () => {
    const item: CartItem = buildCartItem({ quantity: 1 });
    expect(isCartItem(item)).toBe(true);
  });

  it('returns false for null', () => {
    const value: null = null;
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false for undefined', () => {
    const value: undefined = undefined;
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false when plan is null', () => {
    const value = { plan: null, quantity: 1 };
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false when plan is undefined', () => {
    const value = { quantity: 1 };
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false when quantity is zero', () => {
    const value = { plan: mockSubscriptionPlan, quantity: 0 };
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false when quantity is negative', () => {
    const value = { plan: mockSubscriptionPlan, quantity: -1 };
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false when quantity is missing', () => {
    const value = { plan: mockSubscriptionPlan };
    expect(isCartItem(value)).toBe(false);
  });

  it('returns false for non-object', () => {
    const value = 'not-a-cart-item';
    expect(isCartItem(value)).toBe(false);
  });
});

describe('isCheckoutCart', () => {
  it('returns true for valid CheckoutCart with null subscriptionItem and empty otpItems', () => {
    expect(isCheckoutCart(initialCheckoutCart)).toBe(true);
  });

  it('returns true for valid CheckoutCart with subscription and otp lines', () => {
    expect(isCheckoutCart(mockCheckoutCartWithLines)).toBe(true);
  });

  it('returns false for null', () => {
    const value: null = null;
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false for undefined', () => {
    const value: undefined = undefined;
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false when subscriptionItem is truthy non-CartItem', () => {
    const value = {
      subscriptionItem: { label: 'not-a-cart-item' },
      otpItems: [],
    };
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false when otpItems is null', () => {
    const value = {
      subscriptionItem: null,
      otpItems: null,
    };
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false when otpItems is not an array', () => {
    const value = {
      subscriptionItem: null,
      otpItems: 'not-an-array',
    };
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false when otpItems contains non-CartItem entry', () => {
    const value = {
      subscriptionItem: null,
      otpItems: [{ id: 'wrong-shape' }],
    };
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false when subscriptionItem is invalid CartItem', () => {
    const value = {
      subscriptionItem: { plan: null, quantity: 1 },
      otpItems: [],
    };
    expect(isCheckoutCart(value)).toBe(false);
  });

  it('returns false for non-object', () => {
    const value = 42;
    expect(isCheckoutCart(value)).toBe(false);
  });
});

describe('isPrefillCartRequest', () => {
  it('returns true for valid PrefillCartRequest with subscriptionPlanId only', () => {
    const request: PrefillCartRequest = {
      subscriptionPlanId: 'premium-monthly',
    };
    expect(isPrefillCartRequest(request)).toBe(true);
  });

  it('returns true for valid PrefillCartRequest with otpPlanIds only', () => {
    const request: PrefillCartRequest = {
      otpPlanIds: ['otp-6m', 'otp-18m'],
    };
    expect(isPrefillCartRequest(request)).toBe(true);
  });

  it('returns true for valid PrefillCartRequest with both fields', () => {
    const request: PrefillCartRequest = {
      subscriptionPlanId: 'premium-monthly',
      otpPlanIds: ['otp-6m'],
    };
    expect(isPrefillCartRequest(request)).toBe(true);
  });

  it('returns true for PrefillCartRequest with empty otpPlanIds and subscriptionPlanId', () => {
    const request: PrefillCartRequest = {
      subscriptionPlanId: 'basic-monthly',
      otpPlanIds: [],
    };
    expect(isPrefillCartRequest(request)).toBe(true);
  });

  it('returns false for null', () => {
    const value: null = null;
    expect(isPrefillCartRequest(value)).toBe(false);
  });

  it('returns false for undefined', () => {
    const value: undefined = undefined;
    expect(isPrefillCartRequest(value)).toBe(false);
  });

  it('returns false for completely empty object', () => {
    const value = {};
    expect(isPrefillCartRequest(value)).toBe(false);
  });

  it('returns false when both subscriptionPlanId and otpPlanIds are undefined', () => {
    const value = {
      subscriptionPlanId: undefined,
      otpPlanIds: undefined,
    };
    expect(isPrefillCartRequest(value)).toBe(false);
  });

  it('returns false for non-object string', () => {
    const value = 'not-a-request';
    expect(isPrefillCartRequest(value)).toBe(false);
  });

  it('returns false for non-object number', () => {
    const value = 0;
    expect(isPrefillCartRequest(value)).toBe(false);
  });
});
