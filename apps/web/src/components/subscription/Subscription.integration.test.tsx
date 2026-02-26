import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { SubscriptionPage } from '../../pages/Subscription';
import { useAuthStore, useSubscriptionStore, useWalletStore } from '@paynless/store';
import {
  mockStripeGetSubscriptionPlans,
  mockStripeGetUserSubscription,
  mockStripeCreatePortalSession,
  mockStripeCancelSubscription,
} from '@paynless/api/mocks/stripe.mock';
import type { User, SubscriptionPlan, UserSubscription, ApiError } from '@paynless/types';
import { MemoryRouter } from 'react-router-dom';

const customRender = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

vi.mock('../../components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
  };
});

vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockUser: User = { id: 'user-sub-int-123', email: 'subint@example.com', created_at: 'date' };

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
  },
];

describe('SubscriptionPage Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeGetSubscriptionPlans.mockResolvedValue({ data: mockPlansData, error: null });
    mockStripeGetUserSubscription.mockResolvedValue({ data: null, error: null });
    mockStripeCreatePortalSession.mockResolvedValue({ data: { url: 'https://portal.example' }, error: null });
    mockStripeCancelSubscription.mockResolvedValue({ data: null, error: null });
    act(() => {
      useAuthStore.setState({
        user: mockUser,
        session: { access_token: 'int-token', refresh_token: 'refresh', expiresAt: 0 },
      });
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState());
    });
  });


  it('should load and display subscription plans from API', async () => {
    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText('Integration Basic Monthly')).toBeInTheDocument();
      expect(screen.getByText('Integration Pro Monthly')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /Subscribe/i })).toHaveLength(2);
    expect(useSubscriptionStore.getState().availablePlans).toEqual(mockPlansData);
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
    };
    mockStripeGetUserSubscription.mockResolvedValue({ data: mockCurrentSub, error: null });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(within(screen.getByTestId('plan-card-int_basic')).getByRole('button', { name: /Change Plan/i })).toBeEnabled();
      expect(within(screen.getByTestId('plan-card-int_pro')).getByRole('button', { name: /Current Plan/i })).toBeDisabled();
    });
    expect(useSubscriptionStore.getState().userSubscription?.id).toBe('sub-int-pro');
    expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(true);
  });

  it('should call initiatePurchase when Subscribe is clicked', async () => {
    const mockInitiatePurchase = vi.fn().mockResolvedValue({
      success: true,
      redirectUrl: 'https://checkout.example',
    });
    useWalletStore.setState({ initiatePurchase: mockInitiatePurchase });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText('Integration Pro Monthly')).toBeInTheDocument();
    });
    const subscribeButton = within(screen.getByTestId('plan-card-int_pro')).getByRole('button', { name: /Subscribe/i });
    await act(async () => {
      fireEvent.click(subscribeButton);
    });
    await waitFor(() => {
      expect(mockInitiatePurchase).toHaveBeenCalledTimes(1);
    });
    expect(mockInitiatePurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'price_int_pro',
        userId: mockUser.id,
      })
    );
  });

  it('should display error message if initiatePurchase fails', async () => {
    const checkoutError: ApiError = { message: 'Checkout process failed!', code: 'CHECKOUT_FAILED' };
    const mockInitiatePurchase = vi.fn().mockImplementation(async () => {
      useWalletStore.setState({ purchaseError: checkoutError });
      return null;
    });
    useWalletStore.setState({ initiatePurchase: mockInitiatePurchase });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText('Integration Pro Monthly')).toBeInTheDocument();
    });
    const subscribeButton = within(screen.getByTestId('plan-card-int_pro')).getByRole('button', { name: /Subscribe/i });
    await act(async () => {
      fireEvent.click(subscribeButton);
    });
    await waitFor(() => {
      expect(screen.getByText(checkoutError.message)).toBeInTheDocument();
    });
  });

  it('should call createBillingPortalSession and redirect when Manage Billing is clicked', async () => {
    const mockPortalUrl = 'http://mock-portal-url';
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
      },
      error: null,
    });
    mockStripeCreatePortalSession.mockResolvedValue({ data: { url: mockPortalUrl }, error: null });

    const mockLocation = { href: '', assign: vi.fn() };
    Object.defineProperty(window, 'location', { value: mockLocation, writable: true });

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
    };
    mockStripeGetUserSubscription.mockResolvedValue({ data: mockCurrentSub, error: null });

    customRender(<SubscriptionPage />);
    await waitFor(() => {
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
    });
    const cancelButton = screen.getByRole('button', { name: /Cancel Subscription/i });
    await act(async () => {
      fireEvent.click(cancelButton);
    });
    await waitFor(() => {
      expect(mockStripeCancelSubscription).toHaveBeenCalledWith(
        'stripe_sub_cancel',
        expect.objectContaining({ token: 'int-token' })
      );
    });
  });
});
