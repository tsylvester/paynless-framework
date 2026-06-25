import { Loader2, ShoppingCart, Trash2, X } from 'lucide-react';
import type { CartItem } from '@paynless/store';
import type { CartSummaryProps } from './CartSummary.interface';

export function CartSummary({
  cart,
  isCheckingOut,
  checkoutError,
  onRemoveSubscription,
  onRemoveOtp,
  onClearCart,
  onCheckout,
  formatAmount,
}: CartSummaryProps) {
  const isEmpty =
    cart.subscriptionItem === null && cart.otpItems.length === 0;

  if (isEmpty) {
    return (
      <div data-testid="cart-summary" className="w-full">
        <div
          data-testid="cart-summary-empty"
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-8 text-textSecondary"
        >
          <ShoppingCart className="h-10 w-10" />
          <p>Your cart is empty</p>
        </div>
      </div>
    );
  }

  const subscriptionItem = cart.subscriptionItem;

  let totalAmount: number = 0;
  let cartCurrency: string | null = null;
  let subscriptionAmount: number | null = null;
  let subscriptionCurrency: string | null = null;
  const validatedOtpLines: Array<{
    item: CartItem;
    amount: number;
    currency: string;
  }> = [];

  if (subscriptionItem !== null) {
    const amount: number | null = subscriptionItem.plan.amount;
    if (amount === null) {
      throw new Error('Subscription plan amount is missing');
    }
    const planCurrency: string | null = subscriptionItem.plan.currency;
    if (planCurrency === null || planCurrency.length === 0) {
      throw new Error('Subscription plan currency is missing');
    }
    subscriptionAmount = amount;
    subscriptionCurrency = planCurrency;
    totalAmount = totalAmount + amount * subscriptionItem.quantity;
    cartCurrency = planCurrency;
  }

  for (const item of cart.otpItems) {
    const itemAmount: number | null = item.plan.amount;
    if (itemAmount === null) {
      throw new Error('OTP plan amount is missing');
    }
    const itemCurrency: string | null = item.plan.currency;
    if (itemCurrency === null || itemCurrency.length === 0) {
      throw new Error('OTP plan currency is missing');
    }
    if (cartCurrency !== null && cartCurrency !== itemCurrency) {
      throw new Error('Cart items must use the same currency');
    }
    if (cartCurrency === null) {
      cartCurrency = itemCurrency;
    }
    totalAmount = totalAmount + itemAmount * item.quantity;
    validatedOtpLines.push({ item, amount: itemAmount, currency: itemCurrency });
  }

  if (cartCurrency === null) {
    throw new Error('Cart currency is missing');
  }

  const displayCurrency: string = cartCurrency;

  return (
    <div data-testid="cart-summary" className="w-full">
      <div className="rounded-lg border border-border bg-surface divide-y divide-border">
        {subscriptionItem !== null &&
        subscriptionAmount !== null &&
        subscriptionCurrency !== null ? (
          <div
            data-testid="cart-summary-subscription-row"
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-textPrimary">
                {subscriptionItem.plan.name}
              </p>
              <p className="text-sm text-textSecondary">
                {formatAmount(subscriptionAmount, subscriptionCurrency)}
                {subscriptionItem.plan.interval != null &&
                subscriptionItem.plan.interval_count != null
                  ? subscriptionItem.plan.interval === 'month' &&
                    subscriptionItem.plan.interval_count === 1
                    ? '/month'
                    : subscriptionItem.plan.interval === 'year' &&
                        subscriptionItem.plan.interval_count === 1
                      ? '/year'
                      : `/${subscriptionItem.plan.interval}`
                  : ' one-time'}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemoveSubscription}
              disabled={isCheckingOut}
              className="shrink-0 rounded p-2 text-textSecondary hover:bg-muted hover:text-textPrimary disabled:opacity-50"
              aria-label="Remove subscription"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {validatedOtpLines.map((line) => (
          <div
            key={line.item.plan.id}
            data-testid={`cart-summary-otp-row-${line.item.plan.id}`}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-textPrimary">
                {line.item.plan.name}
              </p>
              <p className="text-sm text-textSecondary">
                ×{line.item.quantity}{' '}
                {formatAmount(line.amount, line.currency)} (
                {formatAmount(line.amount * line.item.quantity, line.currency)})
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemoveOtp(line.item.plan.id)}
              disabled={isCheckingOut}
              className="shrink-0 rounded p-2 text-textSecondary hover:bg-muted hover:text-textPrimary disabled:opacity-50"
              aria-label={`Remove ${line.item.plan.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <div
          data-testid="cart-summary-total"
          className="flex items-center justify-between p-4 font-semibold text-textPrimary"
        >
          <span>Total</span>
          <span>{formatAmount(totalAmount, displayCurrency)}</span>
        </div>

        <div className="flex flex-col gap-2 p-4 sm:flex-row">
          <button
            type="button"
            onClick={onClearCart}
            disabled={isCheckingOut}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-textPrimary hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Clear All
          </button>
          <button
            type="button"
            data-testid="cart-summary-checkout-btn"
            onClick={onCheckout}
            disabled={isCheckingOut}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isCheckingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Checkout
          </button>
        </div>
      </div>

      {checkoutError !== null ? (
        <div
          data-testid="cart-summary-error"
          className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700"
        >
          {checkoutError.message}
        </div>
      ) : null}
    </div>
  );
}
