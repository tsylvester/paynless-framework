import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import {
  installSubscriptionPageTestWindowLocation,
  renderSubscriptionPage,
  SubscriptionPageTestWindowLocation,
  getMonthlyPlanGrid,
  getPlanCardByPlanName,
  getCurrentSubscriptionCard,
  findProcessingManageButton,
  findProcessingCancelButton,
  requireHTMLElementFromElement,
} from './Subscription.mock';
import { SubscriptionPage } from './Subscription';
import { screen, act, within, waitFor } from '@testing-library/react';
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
import { ComponentProps } from 'react';
import {
  UserTier,
  SubscriptionPlan,
  UserSubscription,
  Session,
  User,
} from '@paynless/types';
import userEvent from '@testing-library/user-event';
import { mockUserTier, mockUserProfile, mockAllTiers } from '../mocks/profile.mock';
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

const subscriptionTestUser: User = {
  id: 'user-123',
  email: 'user@example.com',
};

const subscriptionTestSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expiresAt: Date.now() + 3600000,
};

const mockBasicTier: UserTier = mockAllTiers[1];

const mockPremiumTier: UserTier = mockAllTiers[2];

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

const freePlan: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan-free',
  name: 'Free Plan',
  stripe_price_id: 'price_free',
  amount: 0,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  description: null,
  tokens_to_award: null,
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

describe('SubscriptionPage Component', () => {
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

    const cartStoreInitialState = initializeMockCartStore();

    act(() => {
      useAuthStore.setState(
        {
          user: subscriptionTestUser,
          profile: mockUserProfile,
          session: subscriptionTestSession,
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
  });

  it('should render loading spinner if auth is loading', () => {
    act(() => {
      useAuthStore.setState({ isLoading: true, user: null });
    });
    renderSubscriptionPage();
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
  });

  it('should render loading spinner if subscription data is loading initially', () => {
    act(() => {
      useAuthStore.setState({
        isLoading: false,
        user: subscriptionTestUser,
      });
      useSubscriptionStore.setState({
        isSubscriptionLoading: true,
        userSubscription: null,
        availablePlans: [],
      });
    });
    renderSubscriptionPage();
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Subscription Plans/i }),
    ).not.toBeInTheDocument();
  });

  it('should redirect to /login if user is not authenticated', () => {
    act(() => {
      useAuthStore.setState({ user: null, isLoading: false });
    });
    renderSubscriptionPage();
    expect(screen.getByTestId('navigate')).toHaveTextContent(
      'Redirecting to /login',
    );
  });

  it('should display error message if subscription store has error', () => {
    const testError: Error = new Error('Something went wrong from store');
    act(() => {
      useSubscriptionStore.setState({
        error: testError,
        isSubscriptionLoading: false,
      });
    });
    renderSubscriptionPage();
    expect(screen.getByTestId('subscription-error-message')).toHaveTextContent(
      testError.message,
    );
  });

  it('should display test mode warning if isTestMode is true', () => {
    act(() => {
      useSubscriptionStore.setState({ isTestMode: true });
    });
    renderSubscriptionPage();
    expect(screen.getByText(/Test Mode Active/i)).toBeInTheDocument();
  });

  it('should render page title and description when loaded', () => {
    renderSubscriptionPage();
    expect(
      screen.getByRole('heading', { name: /Subscription Plans/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Choose the plan that.s right for you/i),
    ).toBeInTheDocument();
  });

  it('should render CurrentSubscriptionCard content if user has an active subscription with a plan', () => {
    renderSubscriptionPage();
    const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
    expect(
      within(currentSubCard).getByText(/Basic Monthly Plan/i),
    ).toBeInTheDocument();
    expect(
      within(currentSubCard).getByRole('button', { name: /Manage Billing/i }),
    ).toBeInTheDocument();
    expect(
      within(currentSubCard).getByRole('button', {
        name: /Cancel Subscription/i,
      }),
    ).toBeInTheDocument();
  });

  it('should NOT render CurrentSubscriptionCard content if user subscription is null or has no plan', () => {
    act(() => {
      useSubscriptionStore.setState({
        userSubscription: null,
        hasActiveSubscription: false,
      });
    });
    renderSubscriptionPage();
    expect(screen.queryByText(/Current Subscription/i)).not.toBeInTheDocument();
  });

  it('should NOT render CurrentSubscriptionCard content if user subscription status is free', () => {
    const freeUserSubscription: UserSubscription = {
      id: 'sub-free',
      plan_id: 'plan-free',
      status: 'free',
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: null,
      created_at: MOCK_TIMESTAMP,
      updated_at: MOCK_TIMESTAMP,
      user_id: 'user-123',
      stripe_customer_id: null,
      current_period_start: null,
      has_ever_paid: false,
      tier_level: 0,
    };
    act(() => {
      useSubscriptionStore.setState({
        userSubscription: freeUserSubscription,
        availablePlans: [basicMonthlyPlan, proMonthlyPlan, freePlan],
        hasActiveSubscription: false,
      });
    });
    renderSubscriptionPage();
    expect(screen.queryByText(/Current Subscription/i)).not.toBeInTheDocument();
  });

  it('should render PlanCard content for each available plan (user on Basic)', () => {
    renderSubscriptionPage();
    const basicPlanCard: HTMLElement = getPlanCardByPlanName(
      'Basic Monthly Plan',
    );
    const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
    expect(
      within(basicPlanCard).getByRole('heading', {
        name: /Basic Monthly Plan/i,
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(
      within(proPlanCard).getByRole('heading', {
        name: /Pro Monthly Plan/i,
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(within(basicPlanCard).getByText('Feature 1')).toBeInTheDocument();
    expect(within(proPlanCard).getByText('Feature A')).toBeInTheDocument();
    expect(
      within(basicPlanCard).getByRole('button', { name: /Current Plan/i }),
    ).toBeInTheDocument();
    expect(
      within(proPlanCard).getByRole('button', { name: /Select Plan/i }),
    ).toBeInTheDocument();
  });

  it('should correctly display button texts on PlanCards based on user subscription state (user on Basic)', () => {
    renderSubscriptionPage();
    const basicPlanCard: HTMLElement = getPlanCardByPlanName(
      'Basic Monthly Plan',
    );
    const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
    expect(
      within(basicPlanCard).getByRole('button', { name: /Current Plan/i }),
    ).toBeInTheDocument();
    expect(
      within(proPlanCard).getByRole('button', { name: /Select Plan/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Subscribe/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Downgrade to Free/i }),
    ).not.toBeInTheDocument();
  });

  describe('Subscription Management Interactions', () => {
    it('should call createBillingPortalSession when manage button on CurrentSubscriptionCard is clicked', async () => {
      mockCreateBillingPortalSession.mockResolvedValue('mock-portal-url');
      renderSubscriptionPage();
      const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
      const manageButton = within(currentSubCard).getByRole('button', {
        name: /Manage Billing/i,
      });
      expect(manageButton).toBeEnabled();
      await user.click(manageButton);
      expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);

      act(() => {
        useSubscriptionStore.setState({ isSubscriptionLoading: true });
      });
      const processingManageButton: HTMLElement =
        findProcessingManageButton(currentSubCard);
      expect(processingManageButton).toBeInTheDocument();
      expect(processingManageButton).toBeDisabled();
      expect(processingManageButton.querySelector('svg')).toBeInTheDocument();

      await act(async () => {
        await mockCreateBillingPortalSession.mock.results[0].value;
      });
      act(() => {
        useSubscriptionStore.setState({
          isSubscriptionLoading: false,
          error: null,
        });
      });
      expect(
        within(currentSubCard).getByRole('button', { name: /Manage Billing/i }),
      ).toBeEnabled();
    });

    it('should call setSubscriptionItem when Select Plan is clicked on a subscription PlanCard (user has no sub)', async () => {
      act(() => {
        useSubscriptionStore.setState({
          userSubscription: null,
          hasActiveSubscription: false,
          isTestMode: false,
        });
      });

      renderSubscriptionPage();
      const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
      const selectButton = within(proPlanCard).getByRole('button', {
        name: /Select Plan/i,
      });
      expect(selectButton).toBeEnabled();
      await user.click(selectButton);
      expect(mockSetSubscriptionItem).toHaveBeenCalledTimes(1);
      expect(mockSetSubscriptionItem).toHaveBeenCalledWith(proMonthlyPlan);
    });

    it('should call cancelSubscription when cancel button on CurrentSubscriptionCard is clicked', async () => {
      const subscriptionFromStore =
        useSubscriptionStore.getState().userSubscription;
      if (subscriptionFromStore === null) {
        throw new Error('Initial state missing subscription');
      }
      const stripeSubscriptionId = subscriptionFromStore.stripe_subscription_id;
      if (stripeSubscriptionId === null) {
        throw new Error('Initial state missing stripe subscription ID');
      }
      mockCancelSubscription.mockResolvedValue(true);
      renderSubscriptionPage();
      const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
      const cancelButton = within(currentSubCard).getByRole('button', {
        name: /Cancel Subscription/i,
      });
      expect(cancelButton).toBeEnabled();
      await user.click(cancelButton);
      expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockCancelSubscription).toHaveBeenCalledWith(stripeSubscriptionId);

      act(() => {
        useSubscriptionStore.setState({ isSubscriptionLoading: true });
      });
      const processingCancelButton: HTMLElement =
        findProcessingCancelButton(currentSubCard);
      expect(processingCancelButton).toBeInTheDocument();
      expect(processingCancelButton).toBeDisabled();

      await act(async () => {
        await mockCancelSubscription.mock.results[0].value;
      });
      act(() => {
        useSubscriptionStore.setState({
          isSubscriptionLoading: false,
          error: null,
        });
      });
      expect(
        within(currentSubCard).getByRole('button', {
          name: /Cancel Subscription/i,
        }),
      ).toBeEnabled();
    });
  });

  it('should call loadSubscriptionData on mount if user is present', () => {
    renderSubscriptionPage();
    expect(mockLoadSubscriptionData).toHaveBeenCalledWith(subscriptionTestUser.id);
  });

  it('should call createBillingPortalSession and redirect when Manage Billing on CurrentSubCard is clicked and succeeds', async () => {
    const portalUrl: string = 'https://stripe.com/billing_portal_mock_url';
    mockCreateBillingPortalSession.mockResolvedValue(portalUrl);
    renderSubscriptionPage();
    const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
    const manageButton = within(currentSubCard).getByRole('button', {
      name: /Manage Billing/i,
    });
    await user.click(manageButton);
    expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);
    await act(async () => {
      await mockCreateBillingPortalSession.mock.results[0].value;
    });
    expect(testWindowLocation.href).toBe(portalUrl);
  });

  it('should call cancelSubscription with correct ID when Cancel on CurrentSubCard is clicked', async () => {
    renderSubscriptionPage();
    const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
    const cancelButton = within(currentSubCard).getByRole('button', {
      name: /Cancel Subscription/i,
    });
    await user.click(cancelButton);
    expect(mockCancelSubscription).toHaveBeenCalledWith('stripe_sub_abc');
  });

  describe('cart integration', () => {
    it('should call addOtpItem with plan and quantity 1 when Add to Cart is clicked on an OTP PlanCard', async () => {
      renderSubscriptionPage();
      await user.click(screen.getByRole('tab', { name: /Top-Up/i }));
      const otpCard: HTMLElement = screen.getByTestId(`plan-card-${topUpOtpPlan.id}`);
      const addButton = within(otpCard).getByRole('button', {
        name: /Add to Cart/i,
      });
      await user.click(addButton);
      expect(mockAddOtpItem).toHaveBeenCalledTimes(1);
      expect(mockAddOtpItem).toHaveBeenCalledWith(topUpOtpPlan, 1);
    });

    it('should call cancelSubscription when Downgrade to Free is clicked on the free PlanCard', async () => {
      act(() => {
        useSubscriptionStore.setState({
          availablePlans: [
            basicMonthlyPlan,
            proMonthlyPlan,
            topUpOtpPlan,
            freePlan,
          ],
          hasActiveSubscription: true,
        });
      });
      renderSubscriptionPage();
      const downgradeButton = screen.getByRole('button', {
        name: /Downgrade to Free/i,
      });
      await user.click(downgradeButton);
      expect(mockCancelSubscription).toHaveBeenCalledWith('stripe_sub_abc');
    });

    it('should render cart-summary when cart has a subscription item', () => {
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
      expect(screen.getByTestId('cart-summary')).toBeInTheDocument();
      expect(
        screen.getByTestId('cart-summary-subscription-row'),
      ).toBeInTheDocument();
    });

    it('should render cart-summary-empty when cart is empty', () => {
      renderSubscriptionPage();
      expect(screen.getByTestId('cart-summary')).toBeInTheDocument();
      expect(screen.getByTestId('cart-summary-empty')).toBeInTheDocument();
    });

    it('should render Selected on PlanCard when subscription plan is in cart', () => {
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
      const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
      expect(
        within(proPlanCard).getByRole('button', { name: /Selected/i }),
      ).toBeInTheDocument();
    });

    it('should render OTP cart quantity on PlanCard when OTP item is in cart', async () => {
      act(() => {
        useCartStore.setState({
          cart: buildCheckoutCart({
            otpItems: [
              buildCartItem({ plan: topUpOtpPlan, quantity: 3 }),
            ],
          }),
        });
      });
      renderSubscriptionPage();
      await user.click(screen.getByRole('tab', { name: /Top-Up/i }));
      const otpCard: HTMLElement = screen.getByTestId(`plan-card-${topUpOtpPlan.id}`);
      expect(within(otpCard).getByText(/×3/)).toBeInTheDocument();
    });

    it('should keep CartSummary subscription row visible after switching to Top-Up tab', async () => {
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
    });

    it('should call checkoutCart when CartSummary checkout button is clicked', async () => {
      const checkoutUrl: string = 'https://stripe.com/checkout_mock_success_url';
      mockCheckoutCart.mockImplementation(async () => {
        testWindowLocation.href = checkoutUrl;
      });
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
      const checkoutButton = screen.getByTestId('cart-summary-checkout-btn');
      await user.click(checkoutButton);
      expect(mockCheckoutCart).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(testWindowLocation.href).toBe(checkoutUrl);
      });
    });

    it('should display checkoutError via CartSummary when checkoutError is set', () => {
      const errorMessage: string = 'Payment initiation failed.';
      const checkoutError: Error = new Error(errorMessage);
      act(() => {
        useCartStore.setState({
          cart: buildCheckoutCart({
            subscriptionItem: buildCartItem({
              plan: basicMonthlyPlan,
              quantity: 1,
            }),
          }),
          checkoutError,
        });
      });
      renderSubscriptionPage();
      const alert: HTMLElement = screen.getByTestId('cart-summary-error');
      expect(within(alert).getByText(errorMessage)).toBeInTheDocument();
      expect(
        screen.queryByTestId('purchase-error-message'),
      ).not.toBeInTheDocument();
    });

    it('should show Processing on PlanCard when isCheckingOut is true', async () => {
      act(() => {
        useCartStore.setState({ isCheckingOut: true });
      });
      renderSubscriptionPage();
      const proPlanCard: HTMLElement = getPlanCardByPlanName('Pro Monthly Plan');
      expect(
        within(proPlanCard).getByRole('button', { name: /Processing.../i }),
      ).toBeDisabled();
    });

    it('should render cart-summary-panel with fixed upper-right placement classes', () => {
      renderSubscriptionPage();
      const panel: HTMLElement = screen.getByTestId('cart-summary-panel');
      expect(panel.className).toContain('fixed');
      expect(panel.className).toContain('top-20');
      expect(panel.className).toContain('right-4');
      expect(panel.className).toContain('z-40');
    });

    it('should render cart-summary inside cart-summary-panel', () => {
      renderSubscriptionPage();
      const panel: HTMLElement = screen.getByTestId('cart-summary-panel');
      expect(within(panel).getByTestId('cart-summary')).toBeInTheDocument();
    });
  });

  describe('URL prefill', () => {
    it('should call prefillCart with subscriptionPlanId and clear query params on load', async () => {
      const expectedPrefillRequest: PrefillCartRequest = buildPrefillCartRequest({
        subscriptionPlanId: 'plan-1',
        otpPlanIds: [],
      });
      const harness = renderSubscriptionPage({
        initialEntries: ['/subscription?plan=plan-1'],
      });
      await waitFor(() => {
        expect(mockPrefillCart).toHaveBeenCalledWith(expectedPrefillRequest);
      });
      await waitFor(() => {
        expect(harness.router.state.location.search).toBe('');
      });
    });

    it('should call prefillCart with subscription and otp plan ids on load', async () => {
      const expectedPrefillRequest: PrefillCartRequest = buildPrefillCartRequest({
        subscriptionPlanId: 'plan-1',
        otpPlanIds: ['otp-1', 'otp-2'],
      });
      renderSubscriptionPage({
        initialEntries: [
          '/subscription?plan=plan-1&otp=otp-1&otp=otp-2',
        ],
      });
      await waitFor(() => {
        expect(mockPrefillCart).toHaveBeenCalledWith(expectedPrefillRequest);
      });
    });

    it('should not call prefillCart when no query params are present', () => {
      renderSubscriptionPage({ initialEntries: ['/subscription'] });
      expect(mockPrefillCart).not.toHaveBeenCalled();
    });
  });

  describe('plan change warning', () => {
    it('should render plan-change-warning when active user selects a different subscription plan in cart', () => {
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

    it('should not render plan-change-warning when cart subscription matches current plan', () => {
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
        screen.queryByTestId('plan-change-warning'),
      ).not.toBeInTheDocument();
    });

    it('should not render plan-change-warning when user has no active subscription', () => {
      act(() => {
        useSubscriptionStore.setState({
          userSubscription: null,
          hasActiveSubscription: false,
        });
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
      expect(
        screen.queryByTestId('plan-change-warning'),
      ).not.toBeInTheDocument();
    });
  });

  it("should render 'Your Tier' badge on plan cards matching user's tier level", () => {
    act(() => {
      useAuthStore.setState({ userTier: mockBasicTier });
    });
    renderSubscriptionPage();
    const basicPlanHeading: HTMLElement = within(getMonthlyPlanGrid()).getByRole(
      'heading',
      { name: /Basic Monthly Plan/i, level: 2 },
    );
    const basicPlanWrapperCandidate = basicPlanHeading.closest('.relative');
    if (basicPlanWrapperCandidate === null) {
      throw new Error('Basic plan card wrapper not found');
    }
    const basicPlanWrapper: HTMLElement =
      requireHTMLElementFromElement(basicPlanWrapperCandidate);
    expect(within(basicPlanWrapper).getByText('Your Tier')).toBeInTheDocument();
  });

  it("should render 'Upgrade' badge on plan cards with higher tier level", () => {
    renderSubscriptionPage();
    const basicPlanHeading: HTMLElement = within(getMonthlyPlanGrid()).getByRole(
      'heading',
      { name: /Basic Monthly Plan/i, level: 2 },
    );
    const proPlanHeading: HTMLElement = within(getMonthlyPlanGrid()).getByRole(
      'heading',
      { name: /Pro Monthly Plan/i, level: 2 },
    );
    const basicPlanWrapperCandidate = basicPlanHeading.closest('.relative');
    const proPlanWrapperCandidate = proPlanHeading.closest('.relative');
    if (basicPlanWrapperCandidate === null || proPlanWrapperCandidate === null) {
      throw new Error('Plan card wrappers not found');
    }
    const basicPlanWrapper: HTMLElement =
      requireHTMLElementFromElement(basicPlanWrapperCandidate);
    const proPlanWrapper: HTMLElement =
      requireHTMLElementFromElement(proPlanWrapperCandidate);
    expect(within(basicPlanWrapper).getByText('Upgrade')).toBeInTheDocument();
    expect(within(proPlanWrapper).getByText('Upgrade')).toBeInTheDocument();
  });

  it("should not render 'Upgrade' badge on plan cards at or below user's tier level", () => {
    act(() => {
      useAuthStore.setState({ userTier: mockPremiumTier });
    });
    renderSubscriptionPage();
    const basicPlanHeading: HTMLElement = within(getMonthlyPlanGrid()).getByRole(
      'heading',
      { name: /Basic Monthly Plan/i, level: 2 },
    );
    const proPlanHeading: HTMLElement = within(getMonthlyPlanGrid()).getByRole(
      'heading',
      { name: /Pro Monthly Plan/i, level: 2 },
    );
    const basicPlanWrapperCandidate = basicPlanHeading.closest('.relative');
    const proPlanWrapperCandidate = proPlanHeading.closest('.relative');
    if (basicPlanWrapperCandidate === null || proPlanWrapperCandidate === null) {
      throw new Error('Plan card wrappers not found');
    }
    const basicPlanWrapper: HTMLElement =
      requireHTMLElementFromElement(basicPlanWrapperCandidate);
    const proPlanWrapper: HTMLElement =
      requireHTMLElementFromElement(proPlanWrapperCandidate);
    expect(within(basicPlanWrapper).queryByText('Upgrade')).not.toBeInTheDocument();
    expect(within(proPlanWrapper).getByText('Your Tier')).toBeInTheDocument();
  });

  it('should not render any tier badge when userTier is null', () => {
    act(() => {
      useAuthStore.setState({ userTier: null });
    });
    renderSubscriptionPage();
    expect(screen.queryByText('Your Tier')).not.toBeInTheDocument();
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });
});
