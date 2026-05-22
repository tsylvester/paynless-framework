import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentProps, ReactElement } from 'react';
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  waitFor,
} from '@testing-library/react';
import { SubscriptionPage } from '../../pages/Subscription';
import { useAuthStore, useSubscriptionStore, useCartStore } from '@paynless/store';
import {
  mockStripeGetSubscriptionPlans,
  mockStripeGetUserSubscription,
  mockStripeCreatePortalSession,
  mockStripeCancelSubscription,
} from '@paynless/api/mocks/stripe.mock';
import type {
  User,
  SubscriptionPlan,
  UserSubscription,
} from '@paynless/types';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../layout/Layout';
import { Navigate } from 'react-router-dom';

function customRender(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

vi.mock('../layout/Layout', () => ({
  Layout: (props: ComponentProps<typeof Layout>) => (
    <div data-testid="layout">{props.children}</div>
  ),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: (props: ComponentProps<typeof Navigate>) => {
      const destination: string =
        typeof props.to === 'string' ? props.to : '/';
      return (
        <div data-testid="navigate">Redirecting to {destination}</div>
      );
    },
  };
});

vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockUser: User = {
  id: 'user-sub-int-123',
  email: 'subint@example.com',
  created_at: 'date',
};

const mockPlansData: SubscriptionPlan[] = [
  {
    id: 'int_basic',
    stripe_price_id: 'price_int_basic',
    name: 'Integration Basic Monthly',
    amount: 600,
    currency: 'usd',
    interval: 'month',
    interval_count: 1,
    active: true,
    created_at: 'date',
    updated_at: 'date',
    description: { subtitle: 'Basic', features: ['Int A'] },
    metadata: null,
    stripe_product_id: 'prod_int_basic',
    plan_type: 'subscription',
    item_id_internal: null,
    tokens_to_award: null,
    tier_level: 10,
  },
  {
    id: 'int_pro',
    stripe_price_id: 'price_int_pro',
    name: 'Integration Pro Monthly',
    amount: 1600,
    currency: 'usd',
    interval: 'month',
    interval_count: 1,
    active: true,
    created_at: 'date',
    updated_at: 'date',
    description: { subtitle: 'Pro', features: ['Int A', 'Int B'] },
    metadata: null,
    stripe_product_id: 'prod_int_pro',
    plan_type: 'subscription',
    item_id_internal: null,
    tokens_to_award: null,
    tier_level: 20,
  },
];

describe('SubscriptionPage Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeGetSubscriptionPlans.mockResolvedValue({
      data: mockPlansData,
      error: null,
    });
    mockStripeGetUserSubscription.mockResolvedValue({ data: null, error: null });
    mockStripeCreatePortalSession.mockResolvedValue({
      data: { url: 'https://portal.example' },
      error: null,
    });
    mockStripeCancelSubscription.mockResolvedValue({ data: null, error: null });
    act(() => {
      useAuthStore.setState({
        user: mockUser,
        session: {
          access_token: 'int-token',
          refresh_token: 'refresh',
          expiresAt: 0,
        },
      });
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState());
      useCartStore.setState(useCartStore.getInitialState(), true);
    });
  });

  it('should load and display subscription plans from API', async () => {
    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText('Integration Basic Monthly')).toBeInTheDocument();
      expect(screen.getByText('Integration Pro Monthly')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /Select Plan/i })).toHaveLength(
      2,
    );
    expect(screen.getByTestId('cart-summary-empty')).toBeInTheDocument();
    expect(useSubscriptionStore.getState().availablePlans).toEqual(
      mockPlansData,
    );
  });

  it('should load and display current subscription details from API', async () => {
    const mockCurrentSub: UserSubscription = {
      id: 'sub-int-pro',
      user_id: mockUser.id,
      status: 'active',
      plan_id: 'int_pro',
      stripe_subscription_id: 'stripe_int_pro',
      stripe_customer_id: 'cus_int',
      current_period_start: 'date',
      current_period_end: 'date',
      cancel_at_period_end: false,
      created_at: 'date',
      updated_at: 'date',
      has_ever_paid: true,
      tier_level: 20,
    };
    mockStripeGetUserSubscription.mockResolvedValue({
      data: mockCurrentSub,
      error: null,
    });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Manage Billing/i }),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId('plan-card-int_basic')).getByRole('button', {
          name: /Select Plan/i,
        }),
      ).toBeEnabled();
      expect(
        within(screen.getByTestId('plan-card-int_pro')).getByRole('button', {
          name: /Current Plan/i,
        }),
      ).toBeDisabled();
    });
    expect(useSubscriptionStore.getState().userSubscription?.id).toBe(
      'sub-int-pro',
    );
    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(true);
  });

  it('should add subscription plan to cart when Select Plan is clicked', async () => {
    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText('Integration Pro Monthly')).toBeInTheDocument();
    });
    const selectButton = within(
      screen.getByTestId('plan-card-int_pro'),
    ).getByRole('button', { name: /Select Plan/i });
    await act(async () => {
      fireEvent.click(selectButton);
    });
    await waitFor(() => {
      const cartSubscriptionId =
        useCartStore.getState().cart.subscriptionItem?.plan.id;
      expect(cartSubscriptionId).toBe('int_pro');
    });
    expect(
      within(screen.getByTestId('plan-card-int_pro')).getByRole('button', {
        name: /Selected/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('cart-summary-subscription-row'),
    ).toBeInTheDocument();
  });

  it('should display checkout error via CartSummary when checkoutError is set', async () => {
    const errorMessage: string = 'Checkout process failed!';
    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText('Integration Pro Monthly')).toBeInTheDocument();
    });
    const selectButton = within(
      screen.getByTestId('plan-card-int_pro'),
    ).getByRole('button', { name: /Select Plan/i });
    await act(async () => {
      fireEvent.click(selectButton);
    });
    await waitFor(() => {
      expect(useCartStore.getState().cart.subscriptionItem?.plan.id).toBe(
        'int_pro',
      );
    });
    act(() => {
      useCartStore.setState({
        checkoutError: new Error(errorMessage),
      });
    });
    const alert = screen.getByTestId('cart-summary-error');
    expect(within(alert).getByText(errorMessage)).toBeInTheDocument();
  });

  it('should call createBillingPortalSession and redirect when Manage Billing is clicked', async () => {
    const mockPortalUrl: string = 'http://mock-portal-url';
    mockStripeGetUserSubscription.mockResolvedValue({
      data: {
        id: 'sub-active',
        user_id: mockUser.id,
        status: 'active',
        plan_id: 'int_pro',
        stripe_subscription_id: 'stripe_active',
        stripe_customer_id: 'cus_act',
        current_period_start: 'date',
        current_period_end: 'date',
        cancel_at_period_end: false,
        created_at: 'date',
        updated_at: 'date',
        has_ever_paid: true,
        tier_level: 20,
      },
      error: null,
    });
    mockStripeCreatePortalSession.mockResolvedValue({
      data: { url: mockPortalUrl },
      error: null,
    });

    const mockLocation = { href: '', assign: vi.fn() };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
    });
    const manageButton = screen.getByRole('button', { name: /Manage Billing/i });
    await act(async () => {
      fireEvent.click(manageButton);
    });
    await waitFor(() => {
      expect(mockLocation.href).toBe(mockPortalUrl);
    });
  });

  it('should call cancelSubscription when Cancel Subscription is clicked', async () => {
    const mockCurrentSub: UserSubscription = {
      id: 'sub-to-cancel',
      user_id: mockUser.id,
      status: 'active',
      plan_id: 'int_pro',
      stripe_subscription_id: 'stripe_sub_cancel',
      stripe_customer_id: 'cus_cancel',
      current_period_start: 'date',
      current_period_end: 'date',
      cancel_at_period_end: false,
      created_at: 'date',
      updated_at: 'date',
      has_ever_paid: true,
      tier_level: 20,
    };
    mockStripeGetUserSubscription.mockResolvedValue({
      data: mockCurrentSub,
      error: null,
    });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
    });
    const cancelButton = screen.getByRole('button', {
      name: /Cancel Subscription/i,
    });
    await act(async () => {
      fireEvent.click(cancelButton);
    });
    await waitFor(() => {
      expect(mockStripeCancelSubscription).toHaveBeenCalledWith(
        'stripe_sub_cancel',
        expect.objectContaining({ token: 'int-token' }),
      );
    });
  });
});
