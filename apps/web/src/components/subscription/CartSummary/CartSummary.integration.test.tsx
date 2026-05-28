import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { SubscriptionPlan } from '@paynless/types';
import type { CheckoutCart } from '@paynless/store';
import { CartSummary } from './CartSummary';
import type { CartSummaryProps } from './CartSummary.interface';
import {
  createMockCartSummaryCallbacks,
  mockCartSummaryFormatAmount,
  type CartSummaryCallbacks,
} from './CartSummary.mock';
import { mockOtpPlan, mockSubscriptionPlan } from '../PlanCard.mock';

const MOCK_PLAN_TIMESTAMP: string = '2024-01-01T00:00:00.000Z';

const integrationSecondOtpPlan: SubscriptionPlan = {
  id: 'plan_otp_456',
  stripe_price_id: 'price_otp_stripe_456',
  stripe_product_id: 'prod_otp_stripe_456',
  name: 'Token Pack Plus',
  description: {
    subtitle: 'Extended token purchase',
    features: ['10000 tokens'],
  },
  amount: 300,
  currency: 'usd',
  interval: null,
  interval_count: null,
  active: true,
  metadata: null,
  created_at: MOCK_PLAN_TIMESTAMP,
  updated_at: MOCK_PLAN_TIMESTAMP,
  item_id_internal: null,
  plan_type: 'one_time_purchase',
  tokens_to_award: 10000,
  tier_level: 0,
};

const mixedCart: CheckoutCart = {
  subscriptionItem: {
    plan: mockSubscriptionPlan,
    quantity: 1,
  },
  otpItems: [
    { plan: mockOtpPlan, quantity: 2 },
    { plan: integrationSecondOtpPlan, quantity: 1 },
  ],
};

describe('CartSummary integration', () => {
  let callbacks: CartSummaryCallbacks;

  beforeEach(() => {
    callbacks = createMockCartSummaryCallbacks();
  });

  function baseProps(): CartSummaryProps {
    return {
      cart: mixedCart,
      isCheckingOut: false,
      checkoutError: null,
      onRemoveSubscription: callbacks.onRemoveSubscription,
      onRemoveOtp: callbacks.onRemoveOtp,
      onClearCart: callbacks.onClearCart,
      onCheckout: callbacks.onCheckout,
      formatAmount: mockCartSummaryFormatAmount,
    };
  }

  it('validate provider → function: realistic CheckoutCart renders item count, names, amounts, and total', () => {
    render(<CartSummary {...baseProps()} />);

    expect(screen.getByTestId('cart-summary-subscription-row')).toBeInTheDocument();
    expect(screen.getByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`cart-summary-otp-row-${integrationSecondOtpPlan.id}`)).toBeInTheDocument();

    const subscriptionRow = screen.getByTestId('cart-summary-subscription-row');
    expect(within(subscriptionRow).getByText(/basic plan/i)).toBeInTheDocument();
    expect(within(subscriptionRow).getByText(/\$10\.00/)).toBeInTheDocument();
    expect(within(subscriptionRow).getByText(/\/month/)).toBeInTheDocument();

    const firstOtpRow = screen.getByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`);
    expect(within(firstOtpRow).getByText(/token pack/i)).toBeInTheDocument();
    expect(within(firstOtpRow).getByText(/×2/)).toBeInTheDocument();
    expect(within(firstOtpRow).getByText(/\$5\.00/)).toBeInTheDocument();
    expect(within(firstOtpRow).getByText(/\$10\.00/)).toBeInTheDocument();

    const secondOtpRow = screen.getByTestId(
      `cart-summary-otp-row-${integrationSecondOtpPlan.id}`,
    );
    expect(within(secondOtpRow).getByText(/token pack plus/i)).toBeInTheDocument();
    expect(within(secondOtpRow).getByText(/×1/)).toBeInTheDocument();
    expect(within(secondOtpRow).getByText(/\$3\.00/)).toBeInTheDocument();

    const totalRow = screen.getByTestId('cart-summary-total');
    expect(within(totalRow).getByText(/\$23\.00/)).toBeInTheDocument();
  });

  it('validate function → consumer: row actions and footer buttons invoke callback spies', () => {
    render(<CartSummary {...baseProps()} />);

    fireEvent.click(
      within(screen.getByTestId('cart-summary-subscription-row')).getByRole('button'),
    );
    expect(callbacks.onRemoveSubscription).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(screen.getByTestId(`cart-summary-otp-row-${mockOtpPlan.id}`)).getByRole('button'),
    );
    expect(callbacks.onRemoveOtp).toHaveBeenCalledTimes(1);
    expect(callbacks.onRemoveOtp).toHaveBeenCalledWith(mockOtpPlan.id);

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(callbacks.onClearCart).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('cart-summary-checkout-btn'));
    expect(callbacks.onCheckout).toHaveBeenCalledTimes(1);
  });

  it('validate full chain: total 2300, checkout, loading, then Stripe error alert', () => {
    const props: CartSummaryProps = baseProps();
    const { rerender } = render(<CartSummary {...props} />);

    const totalRow = screen.getByTestId('cart-summary-total');
    expect(within(totalRow).getByText(/\$23\.00/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cart-summary-checkout-btn'));
    expect(callbacks.onCheckout).toHaveBeenCalledTimes(1);

    rerender(
      <CartSummary
        {...props}
        isCheckingOut={true}
      />,
    );

    const checkoutBtn = screen.getByTestId('cart-summary-checkout-btn');
    expect(checkoutBtn).toBeDisabled();
    expect(checkoutBtn.querySelector('svg')).toBeInTheDocument();

    rerender(
      <CartSummary
        {...props}
        isCheckingOut={false}
        checkoutError={new Error('Stripe error')}
      />,
    );

    const alert = screen.getByTestId('cart-summary-error');
    expect(within(alert).getByText('Stripe error')).toBeInTheDocument();
  });
});
