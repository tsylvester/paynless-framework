import type {
  CartItem,
  CheckoutCart,
  PrefillCartRequest,
  CartState,
  CartStore,
} from './cartStore.interface';

export function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('plan' in value) || !('quantity' in value)) {
    return false;
  }
  const plan: unknown = value['plan'];
  const quantity: unknown = value['quantity'];
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
    return false;
  }
  return (
    typeof quantity === 'number' &&
    Number.isInteger(quantity) &&
    quantity > 0
  );
}

export function isCheckoutCart(value: unknown): value is CheckoutCart {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('subscriptionItem' in value) || !('otpItems' in value)) {
    return false;
  }
  const subscriptionItem: unknown = value['subscriptionItem'];
  const otpItems: unknown = value['otpItems'];
  if (subscriptionItem !== null && !isCartItem(subscriptionItem)) {
    return false;
  }
  if (!Array.isArray(otpItems)) {
    return false;
  }
  for (const entry of otpItems) {
    if (!isCartItem(entry)) {
      return false;
    }
  }
  return true;
}

export function isPrefillCartRequest(value: unknown): value is PrefillCartRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  let hasSubscriptionPlanId: boolean = false;
  let hasOtpPlanIds: boolean = false;
  if (
    'subscriptionPlanId' in value &&
    typeof value['subscriptionPlanId'] === 'string'
  ) {
    hasSubscriptionPlanId = true;
  }
  if ('otpPlanIds' in value && value['otpPlanIds'] !== undefined) {
    const otpPlanIds: unknown = value['otpPlanIds'];
    if (!Array.isArray(otpPlanIds)) {
      return false;
    }
    for (const planId of otpPlanIds) {
      if (typeof planId !== 'string') {
        return false;
      }
    }
    hasOtpPlanIds = true;
  }
  return hasSubscriptionPlanId || hasOtpPlanIds;
}

export function isCartState(value: unknown): value is CartState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (
    !('cart' in value) ||
    !('isCheckingOut' in value) ||
    !('checkoutError' in value)
  ) {
    return false;
  }
  const cart: unknown = value['cart'];
  const isCheckingOut: unknown = value['isCheckingOut'];
  const checkoutError: unknown = value['checkoutError'];
  if (!isCheckoutCart(cart)) {
    return false;
  }
  if (typeof isCheckingOut !== 'boolean') {
    return false;
  }
  if (checkoutError !== null && !(checkoutError instanceof Error)) {
    return false;
  }
  return true;
}

export function isCartStore(value: unknown): value is CartStore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!isCartState(value)) {
    return false;
  }
  if (
    !('setSubscriptionItem' in value) ||
    typeof value['setSubscriptionItem'] !== 'function' ||
    !('addOtpItem' in value) ||
    typeof value['addOtpItem'] !== 'function' ||
    !('removeOtpItem' in value) ||
    typeof value['removeOtpItem'] !== 'function' ||
    !('clearCart' in value) ||
    typeof value['clearCart'] !== 'function' ||
    !('prefillCart' in value) ||
    typeof value['prefillCart'] !== 'function' ||
    !('checkoutCart' in value) ||
    typeof value['checkoutCart'] !== 'function'
  ) {
    return false;
  }
  return true;
}
