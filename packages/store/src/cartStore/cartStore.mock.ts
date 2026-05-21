import { vi, type Mock } from 'vitest';
import type {
  PaymentInitiationResult,
  Session,
  SubscriptionPlan,
  User,
} from '@paynless/types';
import type {
  CartItem,
  CheckoutCart,
  PrefillCartRequest,
  CartState,
  CartStore,
} from './cartStore.interface';

export type SubscriptionPlanOverrides = {
  [K in keyof SubscriptionPlan]?: SubscriptionPlan[K] | null;
};

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

export const initialCheckoutCart: CheckoutCart = {
  subscriptionItem: null,
  otpItems: [],
};

export const initialCartState: CartState = {
  cart: initialCheckoutCart,
  isCheckingOut: false,
  checkoutError: null,
};

function createDefaultSubscriptionPlan(): SubscriptionPlan {
  const plan: SubscriptionPlan = {
    id: 'mock-plan-otp',
    stripe_price_id: 'price_mock_otp',
    name: 'Mock OTP Pack',
    amount: 2500,
    currency: 'usd',
    interval: null,
    interval_count: null,
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    description: { subtitle: 'OTP', features: ['tokens'] },
    metadata: null,
    stripe_product_id: 'prod_mock_otp',
    plan_type: 'one_time',
    item_id_internal: 'otp-6m',
    tokens_to_award: 6000000,
    tier_level: 0,
  };
  return plan;
}

export function buildSubscriptionPlan(
  overrides?: SubscriptionPlanOverrides,
): SubscriptionPlan {
  const base: SubscriptionPlan = createDefaultSubscriptionPlan();
  if (overrides === undefined) {
    return base;
  }
  return {
    id: overrides.id !== undefined && overrides.id !== null
      ? overrides.id
      : base.id,
    stripe_price_id:
      overrides.stripe_price_id !== undefined
        ? overrides.stripe_price_id
        : base.stripe_price_id,
    name: overrides.name !== undefined && overrides.name !== null
      ? overrides.name
      : base.name,
    amount: overrides.amount !== undefined && overrides.amount !== null
      ? overrides.amount
      : base.amount,
    currency: overrides.currency !== undefined && overrides.currency !== null
      ? overrides.currency
      : base.currency,
    interval:
      overrides.interval !== undefined ? overrides.interval : base.interval,
    interval_count:
      overrides.interval_count !== undefined
        ? overrides.interval_count
        : base.interval_count,
    active: overrides.active !== undefined && overrides.active !== null
      ? overrides.active
      : base.active,
    created_at:
      overrides.created_at !== undefined && overrides.created_at !== null
        ? overrides.created_at
        : base.created_at,
    updated_at:
      overrides.updated_at !== undefined && overrides.updated_at !== null
        ? overrides.updated_at
        : base.updated_at,
    description:
      overrides.description !== undefined
        ? overrides.description
        : base.description,
    metadata:
      overrides.metadata !== undefined ? overrides.metadata : base.metadata,
    stripe_product_id:
      overrides.stripe_product_id !== undefined &&
      overrides.stripe_product_id !== null
        ? overrides.stripe_product_id
        : base.stripe_product_id,
    plan_type:
      overrides.plan_type !== undefined && overrides.plan_type !== null
        ? overrides.plan_type
        : base.plan_type,
    item_id_internal:
      overrides.item_id_internal !== undefined
        ? overrides.item_id_internal
        : base.item_id_internal,
    tokens_to_award:
      overrides.tokens_to_award !== undefined
        ? overrides.tokens_to_award
        : base.tokens_to_award,
    tier_level:
      overrides.tier_level !== undefined && overrides.tier_level !== null
        ? overrides.tier_level
        : base.tier_level,
  };
}

export function buildCartItem(overrides?: CartItemOverrides): CartItem {
  const base: CartItem = {
    plan: buildSubscriptionPlan(),
    quantity: 1,
  };
  if (overrides === undefined) {
    return base;
  }
  return {
    plan:
      overrides.plan !== undefined && overrides.plan !== null
        ? overrides.plan
        : base.plan,
    quantity:
      overrides.quantity !== undefined && overrides.quantity !== null
        ? overrides.quantity
        : base.quantity,
  };
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

export const mockSubscriptionPlan: SubscriptionPlan = buildSubscriptionPlan();

export const mockCartItemQty2: CartItem = buildCartItem({ quantity: 2 });

export const mockCheckoutCartWithLines: CheckoutCart = buildCheckoutCart({
  subscriptionItem: buildCartItem({
    plan: buildSubscriptionPlan({
      id: 'mock-plan-sub',
      stripe_price_id: 'price_mock_sub',
      plan_type: 'subscription',
      interval: 'month',
      interval_count: 1,
    }),
    quantity: 1,
  }),
  otpItems: [mockCartItemQty2],
});

export const mockCartSubscriptionPlan: SubscriptionPlan =
  mockCheckoutCartWithLines.subscriptionItem!.plan;

export const mockCartAvailablePlansForPrefill: SubscriptionPlan[] = [
  mockCartSubscriptionPlan,
  mockSubscriptionPlan,
];

export const mockCartCheckoutUser: User = {
  id: 'user-cart-checkout',
  email: 'cart-checkout@test.example',
};

export const mockCartCheckoutSession: Session = {
  access_token: 'mock-cart-access-token',
  refresh_token: 'mock-cart-refresh-token',
  expiresAt: 9_999_999_999,
};

export const mockCartPrefillOtpByStripePriceRequest: PrefillCartRequest =
  buildPrefillCartRequest({
    subscriptionPlanId: null,
    otpPlanIds: ['price_mock_otp'],
  });

export const mockCartPrefillMissingSubscriptionRequest: PrefillCartRequest =
  buildPrefillCartRequest({ subscriptionPlanId: 'missing-plan-id' });

export const mockCartPaymentRedirectUrl: string =
  'https://checkout.stripe.test/session';

export const mockCartPaymentSuccessResult: PaymentInitiationResult = {
  success: true,
  redirectUrl: mockCartPaymentRedirectUrl,
};

export const mockCartPaymentFailureMessage: string = 'Card declined';

export const mockCartPaymentFailureResult: PaymentInitiationResult = {
  success: false,
  error: mockCartPaymentFailureMessage,
};

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
    cart: initialCheckoutCart,
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
