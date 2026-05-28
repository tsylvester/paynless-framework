import { isCheckoutCart } from '@paynless/store';
import type { CartSummaryProps } from './CartSummary.interface';

export function isCartSummaryProps(value: unknown): value is CartSummaryProps {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (
    !('cart' in value) ||
    !('isCheckingOut' in value) ||
    !('checkoutError' in value) ||
    !('onRemoveSubscription' in value) ||
    !('onRemoveOtp' in value) ||
    !('onClearCart' in value) ||
    !('onCheckout' in value) ||
    !('formatAmount' in value)
  ) {
    return false;
  }
  const cart: unknown = value['cart'];
  const isCheckingOut: unknown = value['isCheckingOut'];
  const checkoutError: unknown = value['checkoutError'];
  const onRemoveSubscription: unknown = value['onRemoveSubscription'];
  const onRemoveOtp: unknown = value['onRemoveOtp'];
  const onClearCart: unknown = value['onClearCart'];
  const onCheckout: unknown = value['onCheckout'];
  const formatAmount: unknown = value['formatAmount'];
  if (!isCheckoutCart(cart)) {
    return false;
  }
  if (typeof isCheckingOut !== 'boolean') {
    return false;
  }
  if (checkoutError !== null && !(checkoutError instanceof Error)) {
    return false;
  }
  if (typeof onRemoveSubscription !== 'function') {
    return false;
  }
  if (typeof onRemoveOtp !== 'function') {
    return false;
  }
  if (typeof onClearCart !== 'function') {
    return false;
  }
  if (typeof onCheckout !== 'function') {
    return false;
  }
  if (typeof formatAmount !== 'function') {
    return false;
  }
  return true;
}
