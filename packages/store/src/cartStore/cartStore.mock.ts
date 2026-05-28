import { vi, type Mock } from 'vitest';
import type { SubscriptionPlan } from '@paynless/types';
import type {
  CartItem,
  CheckoutCart,
  PrefillCartRequest,
  CartState,
  CartStore,
} from './cartStore.interface';

export type CartItemOverrides = {
  [K in keyof CartItem]?: CartItem[K] | null;
};

export type CheckoutCartOverrides = {
  [K in keyof CheckoutCart]?: CheckoutCart[K] | null;
};

export type PrefillCartRequestOverrides = {
  [K in keyof PrefillCartRequest]?: PrefillCartRequest[K] | null;
};

export type CartStateOverrides = {
  [K in keyof CartState]?: CartState[K] | null;
};

export type CartStoreOverrides = {
  [K in keyof CartStore]?: CartStore[K] | null;
};

export const mockSetSubscriptionItem: Mock<
  [plan: SubscriptionPlan | null],
  void
> = vi.fn();

export const mockAddOtpItem: Mock<
  [plan: SubscriptionPlan, quantity: number],
  void
> = vi.fn();

export const mockRemoveOtpItem: Mock<[planId: string], void> = vi.fn();

export const mockClearCart: Mock<[], void> = vi.fn();

export const mockPrefillCart: Mock<[request: PrefillCartRequest], void> = vi.fn();

export const mockCheckoutCart: Mock<[], Promise<void>> = vi.fn();

export function buildCartItem(overrides: CartItemOverrides): CartItem {
  const plan: SubscriptionPlan | null | undefined = overrides.plan;
  if (plan === undefined || plan === null) {
    throw new Error('buildCartItem requires overrides.plan');
  }
  const quantity: number =
    overrides.quantity !== undefined && overrides.quantity !== null
      ? overrides.quantity
      : 1;
  const item: CartItem = {
    plan,
    quantity,
  };
  return item;
}

export function buildCheckoutCart(
  overrides?: CheckoutCartOverrides,
): CheckoutCart {
  const base: CheckoutCart = {
    subscriptionItem: null,
    otpItems: [],
  };
  if (overrides === undefined) {
    return base;
  }
  return {
    subscriptionItem:
      overrides.subscriptionItem !== undefined
        ? overrides.subscriptionItem
        : base.subscriptionItem,
    otpItems:
      overrides.otpItems !== undefined && overrides.otpItems !== null
        ? overrides.otpItems
        : base.otpItems,
  };
}

export function buildPrefillCartRequest(
  overrides?: PrefillCartRequestOverrides,
): PrefillCartRequest {
  const base: PrefillCartRequest = {
    subscriptionPlanId: 'mock-plan-sub',
  };
  if (overrides === undefined) {
    return base;
  }
  const request: PrefillCartRequest = { ...base };
  if (overrides.subscriptionPlanId !== undefined) {
    request.subscriptionPlanId =
      overrides.subscriptionPlanId === null
        ? undefined
        : overrides.subscriptionPlanId;
  }
  if (overrides.otpPlanIds !== undefined) {
    request.otpPlanIds =
      overrides.otpPlanIds === null ? undefined : overrides.otpPlanIds;
  }
  return request;
}

export function buildCartState(overrides?: CartStateOverrides): CartState {
  const base: CartState = {
    cart: buildCheckoutCart(),
    isCheckingOut: false,
    checkoutError: null,
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
  };
}

export function buildCartStore(overrides?: CartStoreOverrides): CartStore {
  const state: CartState = buildCartState(
    overrides !== undefined
      ? {
          cart:
            overrides.cart !== undefined && overrides.cart !== null
              ? overrides.cart
              : undefined,
          isCheckingOut:
            overrides.isCheckingOut !== undefined &&
            overrides.isCheckingOut !== null
              ? overrides.isCheckingOut
              : undefined,
          checkoutError:
            overrides.checkoutError !== undefined
              ? overrides.checkoutError
              : undefined,
        }
      : undefined,
  );
  const store: CartStore = {
    ...state,
    setSubscriptionItem:
      overrides?.setSubscriptionItem !== undefined &&
      overrides.setSubscriptionItem !== null
        ? overrides.setSubscriptionItem
        : mockSetSubscriptionItem,
    addOtpItem:
      overrides?.addOtpItem !== undefined && overrides.addOtpItem !== null
        ? overrides.addOtpItem
        : mockAddOtpItem,
    removeOtpItem:
      overrides?.removeOtpItem !== undefined &&
      overrides.removeOtpItem !== null
        ? overrides.removeOtpItem
        : mockRemoveOtpItem,
    clearCart:
      overrides?.clearCart !== undefined && overrides.clearCart !== null
        ? overrides.clearCart
        : mockClearCart,
    prefillCart:
      overrides?.prefillCart !== undefined && overrides.prefillCart !== null
        ? overrides.prefillCart
        : mockPrefillCart,
    checkoutCart:
      overrides?.checkoutCart !== undefined &&
      overrides.checkoutCart !== null
        ? overrides.checkoutCart
        : mockCheckoutCart,
  };
  return store;
}

export function initializeMockCartStore(
  overrides?: CartStoreOverrides,
): CartStore {
  mockSetSubscriptionItem.mockClear();
  mockAddOtpItem.mockClear();
  mockRemoveOtpItem.mockClear();
  mockClearCart.mockClear();
  mockPrefillCart.mockClear();
  mockCheckoutCart.mockClear();
  mockCheckoutCart.mockResolvedValue(undefined);
  return buildCartStore(overrides);
}

export const mockCartStore: CartStore = buildCartStore();
