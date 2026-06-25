import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { ComponentProps } from 'react';
import { screen, act, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  installSubscriptionPageTestWindowLocation,
  renderSubscriptionPage,
  SubscriptionPageTestWindowLocation,
  getPlanCardByPlanName,
} from './Subscription.mock';
import { SubscriptionPage } from './Subscription';
import {
  useAuthStore,
  useSubscriptionStore,
  useCartStore,
  PrefillCartRequest,
} from '@paynless/store';
import {
  mockSetSubscriptionItem,
  mockAddOtpItem,
  mockPrefillCart,
  mockCheckoutCart,
  initializeMockCartStore,
  buildCartItem,
  buildCheckoutCart,
  buildPrefillCartRequest,
} from '../../../../packages/store/src/cartStore/cartStore.mock';
import {
  User,
  Session,
  UserSubscription,
  SubscriptionPlan,
} from '@paynless/types';
import { mockUserProfile, mockUserTier } from '../mocks/profile.mock';
import {
  mockLoadSubscriptionData,
  mockCreateBillingPortalSession,
  mockCancelSubscription,
} from '../mocks/subscriptionStore.mock';
import { buildSubscriptionPlan } from '../components/subscription/PlanCard.mock';
import { Layout } from '../components/layout/Layout';
import { Navigate } from 'react-router-dom';

vi.mock('../components/layout/Layout', () => ({
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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore,
    useSubscriptionStore: actual.useSubscriptionStore,
    useCartStore: actual.useCartStore,
  };
});

const MOCK_TIMESTAMP: string = '2024-01-01T00:00:00.000Z';

const integrationTestUser: User = {
  id: 'user-123',
  email: 'user@example.com',
};

const integrationTestSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expiresAt: Date.now() + 3600000,
};

const basicMonthlyPlan: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan-1',
  name: 'Basic Monthly Plan',
  stripe_price_id: 'price_basic',
  amount: 1000,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  description: { subtitle: 'Basic Sub', features: ['Feature 1'] },
  tier_level: 10,
});

const proMonthlyPlan: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan-2',
  name: 'Pro Monthly Plan',
  stripe_price_id: 'price_pro',
  amount: 5000,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  description: { subtitle: 'Pro Sub', features: ['Feature A', 'Feature B'] },
  tier_level: 20,
});

const topUpOtpPlan: SubscriptionPlan = buildSubscriptionPlan({
  id: 'otp-1',
  name: 'Top Up Pack',
  stripe_price_id: 'price_otp',
  amount: 500,
  currency: 'usd',
  interval: null,
  interval_count: null,
  plan_type: 'one_time_purchase',
  description: { subtitle: 'OTP', features: ['Tokens'] },
  tier_level: 0,
});

const activeUserSubscription: UserSubscription = {
  id: 'sub-db-id-123',
  status: 'active',
  stripe_subscription_id: 'stripe_sub_abc',
  plan_id: 'plan-1',
  current_period_end: new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString(),
  cancel_at_period_end: false,
  created_at: MOCK_TIMESTAMP,
  updated_at: MOCK_TIMESTAMP,
  user_id: 'user-123',
  stripe_customer_id: 'cus_mock',
  current_period_start: MOCK_TIMESTAMP,
  has_ever_paid: true,
  tier_level: 10,
  plan: basicMonthlyPlan,
};

function setupIntegrationProviders(): void {
  const cartStoreInitialState = initializeMockCartStore();

  act(() => {
    useAuthStore.setState(
      {
        user: integrationTestUser,
        profile: mockUserProfile,
        session: integrationTestSession,
        isLoading: false,
        error: null,
        userTier: mockUserTier,
      },
      true,
    );
    useSubscriptionStore.setState(
      {
        availablePlans: [basicMonthlyPlan, proMonthlyPlan, topUpOtpPlan],
        userSubscription: activeUserSubscription,
        isSubscriptionLoading: false,
        hasActiveSubscription: true,
        isTestMode: false,
        error: null,
        loadSubscriptionData: mockLoadSubscriptionData,
        createBillingPortalSession: mockCreateBillingPortalSession,
        cancelSubscription: mockCancelSubscription,
      },
      true,
    );
    useCartStore.setState(cartStoreInitialState, true);
  });
}

function setupUserWithoutActiveSubscription(): void {
  act(() => {
    useSubscriptionStore.setState({
      userSubscription: null,
      hasActiveSubscription: false,
    });
  });
}

describe('SubscriptionPage integration', () => {
  const user = userEvent.setup();
  let testWindowLocation: SubscriptionPageTestWindowLocation;

  beforeAll(() => {
    testWindowLocation = installSubscriptionPageTestWindowLocation();
    expect(SubscriptionPage).toBeDefined();
  });

  beforeEach(() => {
    testWindowLocation.href = '';
    vi.clearAllMocks();
    mockLoadSubscriptionData.mockReset();
    mockCreateBillingPortalSession.mockReset();
    mockCancelSubscription.mockReset();
    mockSetSubscriptionItem.mockReset();
    mockAddOtpItem.mockReset();
    mockPrefillCart.mockReset();
    mockCheckoutCart.mockReset();
    mockCheckoutCart.mockResolvedValue(undefined);
    mockLoadSubscriptionData.mockResolvedValue(undefined);
    setupIntegrationProviders();
  });

  it('validate provider → function: mixed plans and auth render PlanCards with isInCart false initially', () => {
    setupUserWithoutActiveSubscription();
    renderSubscriptionPage();

    const basicCard: HTMLElement = screen.getByTestId(
      `plan-card-${basicMonthlyPlan.id}`,
    );
    const proCard: HTMLElement = screen.getByTestId(
      `plan-card-${proMonthlyPlan.id}`,
    );

    expect(
      within(basicCard).getByRole('button', { name: /Select Plan/i }),
    ).toBeInTheDocument();
    expect(
      within(proCard).getByRole('button', { name: /Select Plan/i }),
    ).toBeInTheDocument();
    expect(
      within(basicCard).queryByRole('button', { name: /Selected/i }),
    ).not.toBeInTheDocument();
    expect(
      within(proCard).queryByRole('button', { name: /Selected/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('cart-summary-empty')).toBeInTheDocument();
  });

  it('validate function → consumer (subscription cart add): Select Plan updates PlanCard and CartSummary', async () => {
    setupUserWithoutActiveSubscription();
    renderSubscriptionPage();

    const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
    const selectButton = within(proPlanCard).getByRole('button', {
      name: /Select Plan/i,
    });
    await user.click(selectButton);

    expect(mockSetSubscriptionItem).toHaveBeenCalledTimes(1);
    expect(mockSetSubscriptionItem).toHaveBeenCalledWith(proMonthlyPlan);

    act(() => {
      useCartStore.setState({
        cart: buildCheckoutCart({
          subscriptionItem: buildCartItem({
            plan: proMonthlyPlan,
            quantity: 1,
          }),
        }),
      });
    });

    expect(
      within(proPlanCard).getByRole('button', { name: /Selected/i }),
    ).toBeInTheDocument();
    const subscriptionRow = screen.getByTestId('cart-summary-subscription-row');
    expect(
      within(subscriptionRow).getByText(/Pro Monthly Plan/i),
    ).toBeInTheDocument();
  });

  it('validate function → consumer (OTP cart add): Add to Cart updates PlanCard and CartSummary', async () => {
    setupUserWithoutActiveSubscription();
    renderSubscriptionPage();

    await user.click(screen.getByRole('tab', { name: /Top-Up/i }));
    const otpCard: HTMLElement = screen.getByTestId(
      `plan-card-${topUpOtpPlan.id}`,
    );
    const addButton = within(otpCard).getByRole('button', {
      name: /Add to Cart/i,
    });
    await user.click(addButton);

    expect(mockAddOtpItem).toHaveBeenCalledTimes(1);
    expect(mockAddOtpItem).toHaveBeenCalledWith(topUpOtpPlan, 1);

    act(() => {
      useCartStore.setState({
        cart: buildCheckoutCart({
          otpItems: [buildCartItem({ plan: topUpOtpPlan, quantity: 1 })],
        }),
      });
    });

    expect(within(otpCard).getByText(/In Cart ×1/)).toBeInTheDocument();
    const otpRow = screen.getByTestId(`cart-summary-otp-row-${topUpOtpPlan.id}`);
    expect(within(otpRow).getByText(/×1/)).toBeInTheDocument();
    expect(within(otpRow).getByText(/Top Up Pack/i)).toBeInTheDocument();
  });

  it('validate full cart workflow: mixed cart total, checkout, and redirect', async () => {
    const checkoutUrl: string =
      'https://stripe.com/checkout_integration_success';
    mockCheckoutCart.mockImplementation(async () => {
      testWindowLocation.href = checkoutUrl;
    });

    setupUserWithoutActiveSubscription();
    renderSubscriptionPage();

    const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
    await user.click(
      within(proPlanCard).getByRole('button', { name: /Select Plan/i }),
    );
    expect(mockSetSubscriptionItem).toHaveBeenCalledWith(proMonthlyPlan);

    act(() => {
      useCartStore.setState({
        cart: buildCheckoutCart({
          subscriptionItem: buildCartItem({
            plan: proMonthlyPlan,
            quantity: 1,
          }),
        }),
      });
    });

    await user.click(screen.getByRole('tab', { name: /Top-Up/i }));
    const otpCard: HTMLElement = screen.getByTestId(
      `plan-card-${topUpOtpPlan.id}`,
    );
    await user.click(
      within(otpCard).getByRole('button', { name: /Add to Cart/i }),
    );
    expect(mockAddOtpItem).toHaveBeenCalledWith(topUpOtpPlan, 1);

    act(() => {
      useCartStore.setState({
        cart: buildCheckoutCart({
          subscriptionItem: buildCartItem({
            plan: proMonthlyPlan,
            quantity: 1,
          }),
          otpItems: [buildCartItem({ plan: topUpOtpPlan, quantity: 1 })],
        }),
      });
    });

    const totalRow = screen.getByTestId('cart-summary-total');
    expect(within(totalRow).getByText(/\$55\.00/)).toBeInTheDocument();

    await user.click(screen.getByTestId('cart-summary-checkout-btn'));
    expect(mockCheckoutCart).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(testWindowLocation.href).toBe(checkoutUrl);
    });
  });

  it('validate URL prefill: query params invoke prefillCart and clear search', async () => {
    const expectedPrefillRequest: PrefillCartRequest = buildPrefillCartRequest({
      subscriptionPlanId: 'plan-1',
      otpPlanIds: ['otp-1'],
    });
    const harness = renderSubscriptionPage({
      initialEntries: ['/subscription?plan=plan-1&otp=otp-1'],
    });

    await waitFor(() => {
      expect(mockPrefillCart).toHaveBeenCalledWith(expectedPrefillRequest);
    });
    await waitFor(() => {
      expect(harness.router.state.location.search).toBe('');
    });
  });

  it('validate plan change warning when cart subscription differs from current plan', () => {
    act(() => {
      useCartStore.setState({
        cart: buildCheckoutCart({
          subscriptionItem: buildCartItem({
            plan: proMonthlyPlan,
            quantity: 1,
          }),
        }),
      });
    });

    renderSubscriptionPage();

    expect(screen.getByTestId('plan-change-warning')).toHaveTextContent(
      'Selecting a new plan will replace your current Basic Monthly Plan subscription.',
    );
  });

  it('validate cart persistence across tabs: subscription row remains after Top-Up switch', async () => {
    act(() => {
      useCartStore.setState({
        cart: buildCheckoutCart({
          subscriptionItem: buildCartItem({
            plan: basicMonthlyPlan,
            quantity: 1,
          }),
        }),
      });
    });

    renderSubscriptionPage();

    expect(
      screen.getByTestId('cart-summary-subscription-row'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Top-Up/i }));

    expect(
      screen.getByTestId('cart-summary-subscription-row'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('cart-summary-subscription-row')).getByText(
        /Basic Monthly Plan/i,
      ),
    ).toBeInTheDocument();
  });
});
