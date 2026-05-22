import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { buildCartItem, buildCheckoutCart } from '../../../../../../packages/store/src/cartStore/cartStore.mock';
import { CartSummary } from './CartSummary.tsx';
import type { CartSummaryProps } from './CartSummary.interface';
import {
  buildCartSummaryProps,
  createMockCartSummaryCallbacks,
  mockEmptyCartSummaryProps,
  type CartSummaryCallbacks,
  type CartSummaryPropsOverrides,
} from './CartSummary.mock';
import {
  buildSubscriptionPlan,
  mockOtpPlan,
  mockSubscriptionPlan,
} from '../PlanCard.mock';

describe('CartSummary', () => {
  let callbacks: CartSummaryCallbacks;

  beforeEach(() => {
    callbacks = createMockCartSummaryCallbacks();
  });

  function renderCartSummary(overrides?: CartSummaryPropsOverrides): void {
    const props: CartSummaryProps = buildCartSummaryProps({
      onRemoveSubscription: callbacks.onRemoveSubscription,
      onRemoveOtp: callbacks.onRemoveOtp,
      onClearCart: callbacks.onClearCart,
      onCheckout: callbacks.onCheckout,
      ...overrides,
    });
    render(<CartSummary {...props} />);
  }

  it('renders empty-state message when cart is empty and does not render Checkout or Clear All', () => {
    const props: CartSummaryProps = mockEmptyCartSummaryProps({
      onRemoveSubscription: callbacks.onRemoveSubscription,
      onRemoveOtp: callbacks.onRemoveOtp,
      onClearCart: callbacks.onClearCart,
      onCheckout: callbacks.onCheckout,
    });
    render(<CartSummary {...props} />);

    expect(screen.getByTestId('cart-summary-empty')).toBeInTheDocument();
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cart-summary-checkout-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();
  });

  it('renders subscription row with plan name formatted amount interval and Remove when subscription only', () => {
    renderCartSummary({
      cart: buildCheckoutCart({
        subscriptionItem: buildCartItem({
          plan: mockSubscriptionPlan,
          quantity: 1,
        }),
        otpItems: [],
      }),
    });

    const row = screen.getByTestId('cart-summary-subscription-row');
    expect(within(row).getByText(/basic plan/i)).toBeInTheDocument();
    expect(within(row).getByText(/\$10\.00/)).toBeInTheDocument();
    expect(within(row).getByRole('button')).toBeInTheDocument();
    expect(screen.queryByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`)).toBeNull();
  });

  it('renders each OTP row with plan name quantity unit price subtotal and Remove when OTP only', () => {
    renderCartSummary({
      cart: buildCheckoutCart({
        subscriptionItem: null,
        otpItems: [
          buildCartItem({ plan: mockOtpPlan, quantity: 3 }),
        ],
      }),
    });

    const row = screen.getByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`);
    expect(within(row).getByText(/token pack/i)).toBeInTheDocument();
    expect(within(row).getByText(/×3/)).toBeInTheDocument();
    expect(within(row).getByText(/\$5\.00/)).toBeInTheDocument();
    expect(within(row).getByText(/\$15\.00/)).toBeInTheDocument();
    expect(within(row).getByRole('button')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-summary-subscription-row')).toBeNull();
  });

  it('renders all rows and correct total when cart has subscription and OTP items', () => {
    renderCartSummary({
      cart: buildCheckoutCart({
        subscriptionItem: buildCartItem({
          plan: mockSubscriptionPlan,
          quantity: 1,
        }),
        otpItems: [
          buildCartItem({ plan: mockOtpPlan, quantity: 2 }),
          buildCartItem({
            plan: buildSubscriptionPlan({
              id: 'plan_otp_456',
              amount: 300,
            }),
            quantity: 1,
          }),
        ],
      }),
    });

    expect(screen.getByTestId('cart-summary-subscription-row')).toBeInTheDocument();
    expect(screen.getByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('cart-summary-otp-row-plan_otp_456')).toBeInTheDocument();
    const totalRow = screen.getByTestId('cart-summary-total');
    expect(within(totalRow).getByText(/\$23\.00/)).toBeInTheDocument();
  });

  it('computes total as subscription subtotal plus OTP subtotals with amount 1000 qty 1 and amount 500 qty 3', () => {
    renderCartSummary({
      cart: buildCheckoutCart({
        subscriptionItem: buildCartItem({
          plan: buildSubscriptionPlan({ amount: 1000 }),
          quantity: 1,
        }),
        otpItems: [
          buildCartItem({
            plan: buildSubscriptionPlan({
              id: 'plan_otp_total_test',
              stripe_price_id: 'price_otp_total',
              name: 'OTP Total Test',
              amount: 500,
              plan_type: 'one_time_purchase',
              interval: null,
              interval_count: null,
            }),
            quantity: 3,
          }),
        ],
      }),
    });

    const totalRow = screen.getByTestId('cart-summary-total');
    expect(within(totalRow).getByText(/\$25\.00/)).toBeInTheDocument();
  });

  it('calls onRemoveSubscription once when Remove on subscription row is clicked', () => {
    renderCartSummary({
      cart: buildCheckoutCart({
        subscriptionItem: buildCartItem({
          plan: mockSubscriptionPlan,
          quantity: 1,
        }),
        otpItems: [],
      }),
    });

    const row = screen.getByTestId('cart-summary-subscription-row');
    fireEvent.click(within(row).getByRole('button'));
    expect(callbacks.onRemoveSubscription).toHaveBeenCalledTimes(1);
  });

  it('calls onRemoveOtp with correct plan id when Remove on OTP row is clicked', () => {
    renderCartSummary({
      cart: buildCheckoutCart({
        subscriptionItem: null,
        otpItems: [buildCartItem({ plan: mockOtpPlan, quantity: 1 })],
      }),
    });

    const row = screen.getByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`);
    fireEvent.click(within(row).getByRole('button'));
    expect(callbacks.onRemoveOtp).toHaveBeenCalledTimes(1);
    expect(callbacks.onRemoveOtp).toHaveBeenCalledWith(mockOtpPlan.id);
  });

  it('calls onClearCart once when Clear All is clicked', () => {
    renderCartSummary();

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(callbacks.onClearCart).toHaveBeenCalledTimes(1);
  });

  it('calls onCheckout once when Checkout is clicked', () => {
    renderCartSummary();

    fireEvent.click(screen.getByTestId('cart-summary-checkout-btn'));
    expect(callbacks.onCheckout).toHaveBeenCalledTimes(1);
  });

  it('disables Checkout and shows loading indicator when isCheckingOut is true', () => {
    renderCartSummary({ isCheckingOut: true });

    const checkoutBtn = screen.getByTestId('cart-summary-checkout-btn');
    expect(checkoutBtn).toBeDisabled();
    expect(checkoutBtn.querySelector('svg')).toBeInTheDocument();
  });

  it('renders checkout error message in error alert when checkoutError is set', () => {
    renderCartSummary({
      checkoutError: new Error('Payment failed'),
    });

    const alert = screen.getByTestId('cart-summary-error');
    expect(within(alert).getByText(/payment failed/i)).toBeInTheDocument();
  });

  it('throws when subscription plan amount is null', () => {
    const planWithNullAmount = buildSubscriptionPlan({ amount: null });
    expect(() =>
      renderCartSummary({
        cart: buildCheckoutCart({
          subscriptionItem: buildCartItem({
            plan: planWithNullAmount,
            quantity: 1,
          }),
          otpItems: [],
        }),
      }),
    ).toThrow('Subscription plan amount is missing');
  });
});
