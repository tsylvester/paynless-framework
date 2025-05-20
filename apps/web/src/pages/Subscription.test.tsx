import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { SubscriptionPage } from './Subscription';
import { useAuthStore, useSubscriptionStore, useWalletStore } from '@paynless/store'; // Import actual stores
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { UserProfile, SubscriptionPlan, UserSubscription, PurchaseRequest, PaymentInitiationResult, Session, User } from '@paynless/types';
import userEvent from '@testing-library/user-event';

// --- Mocks --- 
// Mock ONLY external dependencies or layout if needed
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Mock react-router-dom Navigate (Keep this for redirect tests)
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
  }
})

// Mock logger 
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Store Actions
const mockLoadSubscriptionData = vi.fn();
const mockCreateCheckoutSession = vi.fn();
const mockCreateBillingPortalSession = vi.fn();
const mockCancelSubscription = vi.fn();
const mockResumeSubscription = vi.fn(); 
const mockInitiatePurchase = vi.fn(); // Added for useWalletStore

// Define Initial States for Stores (ensure stripe_subscription_id is present)
// Add necessary fields for formatters (amount, currency, interval, intervalCount)
const authStoreInitialState = {
  user: { id: 'user-123' } as User, 
  profile: { id: 'user-123' } as UserProfile, 
  session: { access_token: 'mock-token' } as unknown as Session,
  isLoading: false,
  error: null,
  login: vi.fn(), 
  logout: vi.fn(),
  initialize: vi.fn(),
  refreshSession: vi.fn(),
  register: vi.fn(),
  updateProfile: vi.fn(), 
  setUser: vi.fn(),
  setSession: vi.fn(),
  setProfile: vi.fn(),
  setIsLoading: vi.fn(), 
  setError: vi.fn(),    
};

const subscriptionStoreInitialState = {
  availablePlans: [
      { id: 'plan-1', name: 'Basic Plan', stripe_price_id: 'price_basic', amount: 1000, currency: 'usd', interval: 'month', interval_count: 1, description: { subtitle: 'Basic Sub', features: ['Feature 1'] }, tokens_awarded: 1000 } as unknown as SubscriptionPlan,
      { id: 'plan-2', name: 'Pro Plan', stripe_price_id: 'price_pro', amount: 5000, currency: 'usd', interval: 'month', interval_count: 1, description: { subtitle: 'Pro Sub', features: ['Feature A', 'Feature B'] }, tokens_awarded: 5000 } as unknown as SubscriptionPlan
  ],
  userSubscription: {
    id: 'sub-db-id-123', 
    status: 'active', 
    stripe_subscription_id: 'stripe_sub_abc', // Make sure this exists for cancel
    plan_id: 'plan-1', // Added plan_id to match an available plan
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Add date for display
    cancelAtPeriodEnd: false, // Add for display logic
    // The 'plan' object here might be overridden by currentUserResolvedPlan in the component,
    // but keeping it for now in case other selectors or direct access uses it.
    // Ideally, the component relies on currentUserResolvedPlan for consistency.
    plan: { id: 'plan-1', name: 'Basic Plan', stripe_price_id: 'price_basic', amount: 1000, currency: 'usd', interval: 'month', interval_count: 1, description: { subtitle: 'Basic Sub', features: ['Feature 1'] }, tokens_awarded: 1000 } 
  } as unknown as UserSubscription,
  isSubscriptionLoading: false,
  hasActiveSubscription: true, // This is usually derived state, but set for mock
  isTestMode: false,
  error: null as Error | null,
  loadSubscriptionData: mockLoadSubscriptionData,
  createCheckoutSession: mockCreateCheckoutSession,
  createBillingPortalSession: mockCreateBillingPortalSession,
  cancelSubscription: mockCancelSubscription,
  resumeSubscription: mockResumeSubscription,
  setUserSubscription: vi.fn(),
  setAvailablePlans: vi.fn(),
  setIsLoading: vi.fn(),
  setError: vi.fn(), 
  getUsageMetrics: vi.fn(),
  refreshSubscription: vi.fn(),
};

const walletStoreInitialState = {
  currentWallet: null,
  transactionHistory: [],
  isLoadingWallet: false,
  isLoadingHistory: false,
  isLoadingPurchase: false,
  walletError: null,
  purchaseError: null,
  loadWallet: vi.fn(),
  loadTransactionHistory: vi.fn(),
  initiatePurchase: mockInitiatePurchase,
  _resetForTesting: vi.fn(),
};

// Mock the store module BUT use the actual hook implementation
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore,
    useSubscriptionStore: actual.useSubscriptionStore,
    useWalletStore: actual.useWalletStore, // Ensure useWalletStore is also using the actual hook
  };
});

// Helper function for rendering with router
const renderWithRouter = (ui: React.ReactElement, { route = '/' } = {}) => {
  window.history.pushState({}, 'Test page', route);
  return render(ui, { wrapper: MemoryRouter });
};

// --- Test Suite --- 
describe('SubscriptionPage Component', () => {
  const user = userEvent.setup(); // Setup userEvent
  let originalWindowLocation: Location;
  let currentTestHref: string; // To track href assignments during a test

  beforeAll(() => {
    originalWindowLocation = window.location;
  });

  beforeEach(() => {
    currentTestHref = ''; // Reset for each test
    // @ts-expect-error - delete is used to replace the read-only window.location for testing purposes
    delete window.location;
    // @ts-expect-error - window.location is mocked for testing purposes
    window.location = {
      ...originalWindowLocation, // Spread original non-function properties
      // Mock specific properties that are functions or need controlled behavior
      assign: vi.fn((url: string) => { currentTestHref = url; }),
      replace: vi.fn((url: string) => { currentTestHref = url; }),
      reload: vi.fn(),
      ancestorOrigins: {} as DOMStringList, // Provide a default for properties that are objects
      hash: '',
      host: originalWindowLocation.host, // Keep real ones where it makes sense
      hostname: originalWindowLocation.hostname,
      origin: originalWindowLocation.origin,
      pathname: originalWindowLocation.pathname,
      port: originalWindowLocation.port,
      protocol: originalWindowLocation.protocol,
      search: '',
      get href() {
        return currentTestHref;
      },
      set href(url: string) {
        currentTestHref = url;
      },
      toString: () => currentTestHref, // Provide a toString method
    } as Location;

    vi.clearAllMocks();
    mockLoadSubscriptionData.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockCreateBillingPortalSession.mockReset();
    mockCancelSubscription.mockReset();
    mockResumeSubscription.mockReset();
    mockInitiatePurchase.mockReset();

    // Set initial store states using direct setState
    act(() => {
      useAuthStore.setState({ ...authStoreInitialState }, true);
      useSubscriptionStore.setState({ ...subscriptionStoreInitialState }, true);
      useWalletStore.setState({ ...walletStoreInitialState }, true);
    });
    mockLoadSubscriptionData.mockResolvedValue(undefined); 
  });

  afterEach(() => {
    // @ts-expect-error - window.location is mocked for testing purposes
    window.location = originalWindowLocation;
  });

  afterAll(() => {
    // Final cleanup if needed
  });

  // --- Rendering tests ---
  it('should render loading spinner if auth is loading', () => {
    act(() => { useAuthStore.setState({ isLoading: true, user: null }); });
    renderWithRouter(<SubscriptionPage />); 
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument(); 
  });

  it('should render loading spinner if subscription data is loading initially', () => {
    act(() => { 
        useAuthStore.setState({ isLoading: false, user: authStoreInitialState.user }); 
        // Match the component's loading logic: isLoading AND no existing sub AND no plans
        useSubscriptionStore.setState({ 
            isSubscriptionLoading: true, 
            userSubscription: null, 
            availablePlans: [] 
        });
    });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Subscription Plans/i })).not.toBeInTheDocument();
  });

  it('should redirect to /login if user is not authenticated', () => {
    act(() => { useAuthStore.setState({ user: null, isLoading: false }); });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /login');
  });

  it('should display error message if subscription store has error', () => {
    const testError = new Error('Something went wrong from store');
    act(() => { useSubscriptionStore.setState({ error: testError, isSubscriptionLoading: false }); });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.getByTestId('subscription-error-message')).toHaveTextContent(testError.message);
  });

  it('should display test mode warning if isTestMode is true', () => {
    act(() => { useSubscriptionStore.setState({ isTestMode: true }); });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.getByText(/Test Mode Active/i)).toBeInTheDocument();
  });

  it('should render page title and description when loaded', () => {
    renderWithRouter(<SubscriptionPage />);
    expect(screen.getByRole('heading', { name: /Subscription Plans/i })).toBeInTheDocument();
    expect(screen.getByText(/Choose the plan that.s right for you/i)).toBeInTheDocument();
  });

  it('should render CurrentSubscriptionCard content if user has an active subscription with a plan', () => {
    renderWithRouter(<SubscriptionPage />);
    const currentSubHeading = screen.getByRole('heading', { name: /Current Subscription/i, level: 3 });
    const currentSubCard = currentSubHeading.parentElement?.parentElement as HTMLElement; // Navigate two levels up to the card root
    if (!currentSubCard) throw new Error('CurrentSubscriptionCard container not found');
    
    expect(within(currentSubCard).getByText(/Basic Plan/i)).toBeInTheDocument(); // Plan name (scoped)
    expect(within(currentSubCard).getByRole('button', { name: /Manage Billing/i })).toBeInTheDocument();
    expect(within(currentSubCard).getByRole('button', { name: /Cancel Subscription/i })).toBeInTheDocument(); 
  });

  it('should NOT render CurrentSubscriptionCard content if user subscription is null or has no plan', () => {
    act(() => { useSubscriptionStore.setState({ userSubscription: null, hasActiveSubscription: false }); });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.queryByText(/Current Subscription/i)).not.toBeInTheDocument();
  });
  
  it('should NOT render CurrentSubscriptionCard content if user subscription status is free', () => {
    act(() => { 
      useSubscriptionStore.setState({ 
        userSubscription: { id: 'sub-free', plan_id: 'plan-free', status: 'free' } as unknown as UserSubscription, 
        availablePlans: [
          ...subscriptionStoreInitialState.availablePlans, 
          {id: 'plan-free', name: 'Free Plan', stripe_price_id: 'price_free', amount: 0, currency: 'usd', interval: 'month', interval_count: 1} as unknown as SubscriptionPlan
        ],
        hasActiveSubscription: false 
      }); 
    });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.queryByText(/Current Subscription/i)).not.toBeInTheDocument();
  });

  it('should render PlanCard content for each available plan (user on Basic)', () => {
    renderWithRouter(<SubscriptionPage />);
    const planCardsContainer = screen.getByRole('heading', { name: /Subscription Plans/i }).parentElement?.parentElement?.querySelector('.grid.gap-8') as HTMLElement;
    if (!planCardsContainer) throw new Error('Plan cards container not found');

    const basicPlanCard = within(planCardsContainer).getByRole('heading', { name: /Basic Plan/i, level: 2 }).closest('div.border') as HTMLElement;
    const proPlanCard = within(planCardsContainer).getByRole('heading', { name: /Pro Plan/i, level: 2 }).closest('div.border') as HTMLElement;
    if (!basicPlanCard || !proPlanCard) throw new Error('Could not find specific plan card containers');

    expect(within(basicPlanCard).getByRole('heading', { name: /Basic Plan/i, level: 2 })).toBeInTheDocument();
    expect(within(proPlanCard).getByRole('heading', { name: /Pro Plan/i, level: 2 })).toBeInTheDocument();
    expect(within(basicPlanCard).getByText('Feature 1')).toBeInTheDocument();
    expect(within(proPlanCard).getByText('Feature A')).toBeInTheDocument();
    
    expect(within(basicPlanCard).getByRole('button', { name: /Current Plan/i })).toBeInTheDocument();
    expect(within(proPlanCard).getByRole('button', { name: /Change Plan/i })).toBeInTheDocument();
  });

  // This test was previously named 'should render PlanCard content for available plans'
  // Renaming for clarity and ensuring it asserts correct button states for the default mock.
  it('should correctly display button texts on PlanCards based on user subscription state (user on Basic)', () => {
    renderWithRouter(<SubscriptionPage />);

    // Find the main container for all PlanCards first
    const planCardsGrid = screen.getByRole('heading', { name: /Subscription Plans/i })
                            .parentElement?.parentElement?.querySelector('.grid.gap-8') as HTMLElement;
    if (!planCardsGrid) throw new Error('Plan cards grid container not found');

    // Now find the Basic Plan card specifically within the grid
    const basicPlanHeading = within(planCardsGrid).getByRole('heading', { name: /Basic Plan/i, level: 2 });
    const basicPlanCard = basicPlanHeading.closest('div.border') as HTMLElement;
    if (!basicPlanCard) throw new Error("Basic PlanCard not found within the grid");
    expect(within(basicPlanCard).getByRole('button', { name: /Current Plan/i })).toBeInTheDocument();

    // Find the Pro Plan card specifically within the grid
    const proPlanHeading = within(planCardsGrid).getByRole('heading', { name: /Pro Plan/i, level: 2 });
    const proPlanCard = proPlanHeading.closest('div.border') as HTMLElement;
    if (!proPlanCard) throw new Error("Pro PlanCard not found within the grid");
    expect(within(proPlanCard).getByRole('button', { name: /Change Plan/i })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Subscribe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Downgrade to Free/i })).not.toBeInTheDocument(); 
  });

  // --- Interaction Tests (button clicks, loading states for subscription actions) ---
  describe('Subscription Management Interactions', () => {
    it('should call createBillingPortalSession when manage button on CurrentSubscriptionCard is clicked', async () => {
      mockCreateBillingPortalSession.mockResolvedValue('mock-portal-url'); 
      renderWithRouter(<SubscriptionPage />);
      const currentSubHeading = screen.getByRole('heading', { name: /Current Subscription/i, level: 3 });
      const currentSubCard = currentSubHeading.parentElement?.parentElement as HTMLElement;
      if (!currentSubCard) throw new Error('CurrentSubscriptionCard not found');
      const manageButton = within(currentSubCard).getByRole('button', { name: /Manage Billing/i });
      
      expect(manageButton).toBeEnabled(); 
      await user.click(manageButton);
      expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);

      // Check for loading state on the correct button
      act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: true }); });
      
      const processingButtons = within(currentSubCard).getAllByRole('button', { name: /Processing.../i });
      let processingManageButton: HTMLElement | null = null;
      for (const btn of processingButtons) {
        if (btn.querySelector('svg[class*="lucide-credit-card"]')) { // Check for the CreditCard icon
          processingManageButton = btn;
          break;
        }
      }
      if (!processingManageButton) throw new Error('Could not find the processing "Manage Billing" button with CreditCard icon.');
      
      expect(processingManageButton).toBeInTheDocument();
      expect(processingManageButton).toBeDisabled();
      // Check that the icon is still there within the processing button by looking for an SVG tag
      expect(processingManageButton.querySelector('svg')).toBeInTheDocument(); 

      await act(async () => { await mockCreateBillingPortalSession.mock.results[0].value; });
      act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: false, error: null }); });
      expect(within(currentSubCard).getByRole('button', { name: /Manage Billing/i })).toBeEnabled();
    });

    it('should call initiatePurchase and redirect when subscribe button on a PlanCard is clicked (user has no sub)', async () => {
      act(() => { 
        useSubscriptionStore.setState({
          ...subscriptionStoreInitialState,
          userSubscription: null, 
          hasActiveSubscription: false,
          isTestMode: false, // Explicitly ensure not in test mode
        }, true);
        // Ensure wallet store is clean for this test too
        useWalletStore.setState({ ...walletStoreInitialState, purchaseError: null, isLoadingPurchase: false }, true);
      });
      
      const mockRedirectUrl = 'https://stripe.com/checkout_mock_success_url';
      mockInitiatePurchase.mockResolvedValue({ success: true, redirectUrl: mockRedirectUrl } as PaymentInitiationResult);

      renderWithRouter(<SubscriptionPage />);

      const planCardsGrid = screen.getByRole('heading', { name: /Subscription Plans/i })
                              .parentElement?.parentElement?.querySelector('.grid.gap-8') as HTMLElement;
      if (!planCardsGrid) throw new Error('Plan cards grid container not found for initiatePurchase test');
      
      const proPlan = subscriptionStoreInitialState.availablePlans.find(p => p.name === 'Pro Plan');
      if (!proPlan) throw new Error("Pro Plan not found in initial state for test setup");

      const proPlanHeading = within(planCardsGrid).getByRole('heading', { name: proPlan.name, level: 2 });
      const proPlanCard = proPlanHeading.closest('div.border') as HTMLElement;
      if (!proPlanCard) throw new Error('Pro PlanCard not found for initiatePurchase test');
      
      const subscribeButton = within(proPlanCard).getByRole('button', { name: /Subscribe/i });
      
      expect(subscribeButton).toBeEnabled();
      await user.click(subscribeButton);

      const expectedPurchaseRequest: PurchaseRequest = {
        userId: authStoreInitialState.user.id,
        itemId: proPlan.stripe_price_id ?? proPlan.id,
        quantity: 1,
        currency: proPlan.currency.toUpperCase(),
        paymentGatewayId: 'stripe',
        metadata: { planName: proPlan.name, planId: proPlan.id }
      };
      expect(mockInitiatePurchase).toHaveBeenCalledTimes(1);
      expect(mockInitiatePurchase).toHaveBeenCalledWith(expectedPurchaseRequest);

      // Check for redirect
      await act(async () => { await mockInitiatePurchase.mock.results[0].value; });
      expect(window.location.href).toBe(mockRedirectUrl);

      // Check loading states during the process
      // This part might be tricky as initiatePurchase resolves quickly in mock
      // We'd ideally check that isLoadingPurchase was true *during* the call
      // For now, let's check it's false after.
      expect(useWalletStore.getState().isLoadingPurchase).toBe(false);
    });

    it('should call cancelSubscription when cancel button on CurrentSubscriptionCard is clicked', async () => {
      const currentSubscription = subscriptionStoreInitialState.userSubscription;
      if (!currentSubscription?.stripe_subscription_id) throw new Error('Initial state missing subscription or stripe ID');
      mockCancelSubscription.mockResolvedValue(true); 
      renderWithRouter(<SubscriptionPage />);
      const currentSubHeading = screen.getByRole('heading', { name: /Current Subscription/i, level: 3 });
      const currentSubCard = currentSubHeading.parentElement?.parentElement as HTMLElement;
      if (!currentSubCard) throw new Error('CurrentSubscriptionCard not found');
      const cancelButton = within(currentSubCard).getByRole('button', { name: /Cancel Subscription/i });

      expect(cancelButton).toBeEnabled();
      await user.click(cancelButton);
      expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockCancelSubscription).toHaveBeenCalledWith(currentSubscription.stripe_subscription_id);

      // Check for loading state on the correct button
      act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: true }); });
      // The Cancel Subscription button does not have an SVG icon directly inside it in the same way.
      // We need to distinguish it from the Manage Billing button if both are 'Processing...'
      // Find all 'Processing...' buttons within the card and identify the correct one.
      const processingButtons = within(currentSubCard).getAllByRole('button', { name: /Processing.../i });
      let processingCancelButton: HTMLElement | null = null;
      for (const btn of processingButtons) {
        if (!btn.querySelector('svg')) { // The cancel button does not have an SVG child
          processingCancelButton = btn;
          break;
        }
      }
      if (!processingCancelButton) throw new Error('Could not find processing cancel button');
      
      expect(processingCancelButton).toBeInTheDocument();
      expect(processingCancelButton).toBeDisabled();

      await act(async () => { await mockCancelSubscription.mock.results[0].value; });
      act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: false, error: null }); });
      expect(within(currentSubCard).getByRole('button', { name: /Cancel Subscription/i })).toBeEnabled();
    });
  });

  // --- Functional tests for actions (direct calls, redirects) ---
  it('should call loadSubscriptionData on mount if user is present', () => {
    renderWithRouter(<SubscriptionPage />);
    expect(mockLoadSubscriptionData).toHaveBeenCalledWith(authStoreInitialState.user.id);
  });

  it('should call createBillingPortalSession and redirect when Manage Billing on CurrentSubCard is clicked and succeeds', async () => {
    const portalUrl = 'https://stripe.com/billing_portal_mock_url';
    mockCreateBillingPortalSession.mockResolvedValue(portalUrl);
    // window.location is mocked in beforeEach

    renderWithRouter(<SubscriptionPage />);
    const currentSubHeading = screen.getByRole('heading', { name: /Current Subscription/i, level: 3 });
    const currentSubCard = currentSubHeading.parentElement?.parentElement as HTMLElement;
    if (!currentSubCard) throw new Error('CurrentSubscriptionCard not found');
    const manageButton = within(currentSubCard).getByRole('button', { name: /Manage Billing/i });
    await user.click(manageButton);

    expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);
    await act(async () => { await mockCreateBillingPortalSession.mock.results[0].value; });
    expect(window.location.href).toBe(portalUrl);
  });

  it('should call cancelSubscription with correct ID when Cancel on CurrentSubCard is clicked', async () => {
    renderWithRouter(<SubscriptionPage />);    
    const currentSubHeading = screen.getByRole('heading', { name: /Current Subscription/i, level: 3 });
    const currentSubCard = currentSubHeading.parentElement?.parentElement as HTMLElement;
    if (!currentSubCard) throw new Error('CurrentSubscriptionCard not found');
    const cancelButton = within(currentSubCard).getByRole('button', { name: /Cancel Subscription/i });
    await user.click(cancelButton);
    expect(mockCancelSubscription).toHaveBeenCalledWith(subscriptionStoreInitialState.userSubscription.stripe_subscription_id);
  });

  // --- Tests for handleSubscribe and useWalletStore interaction ---
  describe('handleSubscribe with useWalletStore (token purchase flow)', () => {
    const basicPlan = subscriptionStoreInitialState.availablePlans[0];

    beforeEach(() => {
      act(() => {
        useSubscriptionStore.setState({
          ...subscriptionStoreInitialState,
          userSubscription: null,
          hasActiveSubscription: false,
        }, true);
        useWalletStore.setState({
          ...walletStoreInitialState,
          isLoadingPurchase: false,
          purchaseError: null,
        }, true);
      });
      mockInitiatePurchase.mockReset();
    });

    it('should call initiatePurchase with correct PurchaseRequest and redirect on success', async () => {
      const redirectUrl = 'https://stripe.com/checkout_mock_success_url';
      mockInitiatePurchase.mockResolvedValue({ success: true, redirectUrl } as PaymentInitiationResult);
      // window.location is mocked in beforeEach

      renderWithRouter(<SubscriptionPage />);
      const basicPlanCard = screen.getByText(basicPlan.name).closest('div.border') as HTMLElement;
      if (!basicPlanCard) throw new Error("Basic PlanCard not found for subscribe test");
      const subscribeButton = within(basicPlanCard).getByRole('button', { name: /Subscribe/i });
      await user.click(subscribeButton);

      const expectedPurchaseRequest: PurchaseRequest = {
        userId: authStoreInitialState.user.id,
        itemId: basicPlan.stripe_price_id ?? basicPlan.id,
        quantity: 1,
        currency: basicPlan.currency.toUpperCase(),
        paymentGatewayId: 'stripe',
        metadata: { planName: basicPlan.name, planId: basicPlan.id }
      };
      expect(mockInitiatePurchase).toHaveBeenCalledWith(expectedPurchaseRequest);
      await act(async () => { await mockInitiatePurchase.mock.results[0].value; });
      expect(window.location.href).toBe(redirectUrl);
      expect(screen.queryByTestId('purchase-error-message')).not.toBeInTheDocument();
    });

    it('should display purchaseError if initiatePurchase fails or returns no redirectUrl', async () => {
      const errorMessage = 'Payment initiation failed.';
      mockInitiatePurchase.mockImplementation(async () => {
        act(() => {
          useWalletStore.setState({ 
            purchaseError: { message: errorMessage, code: 'PAYMENT_INITIATION_FAILED' }, 
            isLoadingPurchase: false 
          });
        });
        return { success: false, error: errorMessage } as PaymentInitiationResult;
      });

      renderWithRouter(<SubscriptionPage />);
      
      const planCardsGrid = screen.getByRole('heading', { name: /Subscription Plans/i })
                              .parentElement?.parentElement?.querySelector('.grid.gap-8') as HTMLElement;
      if (!planCardsGrid) throw new Error("Plan cards grid container not found for purchaseError test");

      const basicPlanHeading = within(planCardsGrid).getByRole('heading', { name: basicPlan.name, level: 2 });
      const basicPlanCard = basicPlanHeading.closest('div.border') as HTMLElement;
      if (!basicPlanCard) throw new Error("Basic PlanCard not found for purchaseError test");
      
      const subscribeButton = within(basicPlanCard).getByRole('button', { name: /Subscribe/i });
      await user.click(subscribeButton);

      expect(mockInitiatePurchase).toHaveBeenCalled();
      
      // Wait for the error message to appear
      const errorDisplay = await screen.findByTestId('purchase-error-message');
      expect(errorDisplay).toHaveTextContent(errorMessage);
      expect(useWalletStore.getState().isLoadingPurchase).toBe(false);
    });
    
    it('should display purchaseError from useWalletStore if initiatePurchase itself throws', async () => {
        const errorMessage = 'Network problem in initiatePurchase';
        const networkApiError = { message: errorMessage, code: 'NETWORK_ERROR' }; 
        mockInitiatePurchase.mockImplementation(async () => {
            act(() => {
                useWalletStore.setState({ purchaseError: networkApiError }); 
            });
            return { success: false, error: errorMessage } as PaymentInitiationResult; 
        });

        renderWithRouter(<SubscriptionPage />);
        const planCardsGrid = screen.getByRole('heading', { name: /Subscription Plans/i })
                                .parentElement?.parentElement?.querySelector('.grid.gap-8') as HTMLElement;
        if (!planCardsGrid) throw new Error("Plan cards grid container not found for thrown purchaseError test");

        const basicPlanHeading = within(planCardsGrid).getByRole('heading', { name: basicPlan.name, level: 2 });
        const basicPlanCard = basicPlanHeading.closest('div.border') as HTMLElement;
        if (!basicPlanCard) throw new Error("Basic PlanCard for thrown purchaseError test");
        const subscribeButton = within(basicPlanCard).getByRole('button', { name: /Subscribe/i });
        await user.click(subscribeButton);

        expect(mockInitiatePurchase).toHaveBeenCalled();
        expect(screen.getByTestId('purchase-error-message')).toHaveTextContent(errorMessage);
    });

    it('should show loading state on subscribe button (via PlanCard) when isLoadingPurchase is true', async () => {
      let resolveLoadingPhase: (() => void) | undefined;
      const loadingPhasePromise = new Promise<void>(resolve => {
        resolveLoadingPhase = resolve;
      });

      mockInitiatePurchase.mockImplementation(async () => {
        act(() => { useWalletStore.setState({ isLoadingPurchase: true }); });
        await loadingPhasePromise; // Wait for the test to assert the loading state
        act(() => { useWalletStore.setState({ isLoadingPurchase: false }); });
        return { success: true, redirectUrl: 'some-successful-redirect-url' } as PaymentInitiationResult;
      });

      renderWithRouter(<SubscriptionPage />);
      const planCardsGrid = screen.getByRole('heading', { name: /Subscription Plans/i })
                              .parentElement?.parentElement?.querySelector('.grid.gap-8') as HTMLElement;
      if (!planCardsGrid) throw new Error("Plan cards grid container not found for loading state test");

      const basicPlanHeading = within(planCardsGrid).getByRole('heading', { name: basicPlan.name, level: 2 });
      const basicPlanCard = basicPlanHeading.closest('div.border') as HTMLElement;
      if (!basicPlanCard) throw new Error("Basic PlanCard for loading state test");
      const subscribeButton = within(basicPlanCard).getByRole('button', { name: /Subscribe/i });
      
      const clickPromise = user.click(subscribeButton); 

      // Scope the search for the processing button to within the basicPlanCard
      await within(basicPlanCard).findByRole('button', { name: /Processing.../i });
      expect(within(basicPlanCard).getByRole('button', { name: /Processing.../i })).toBeDisabled();

      act(() => {
        if (resolveLoadingPhase) {
          resolveLoadingPhase(); 
        } else {
          // This case should ideally not be reached if the Promise constructor behaves as expected
          throw new Error("resolveLoadingPhase was not assigned by the Promise constructor and is undefined at time of call.");
        }
      });
      await clickPromise; 

      // After processing, the processing button should be gone from the basicPlanCard
      expect(within(basicPlanCard).queryByRole('button', { name: /Processing.../i })).not.toBeInTheDocument();
      // Assuming it redirects on success, as per other tests
      expect(window.location.href).toBe('some-successful-redirect-url'); 
    });
  });
});

// --- To consider for further tests (if not covered by integration tests) ---
// - Test different subscription statuses (trialing, past_due, etc.) and their display.
// - Test behavior when no plans are available.
// - Test specific UI states for `cancelAtPeriodEnd`.
// - Test `resumeSubscription` functionality if UI for it exists.
// - Test `formatAmount` and `formatInterval` more directly if their logic becomes complex,
//   though their usage in cards is implicitly tested.

// Helper to find subscribe button for a specific plan
// async function clickSubscribeButtonForPlan(planName: string) {
//   const planCard = screen.getByText(planName).closest('.border'); // Adjust selector as needed
//   if (!planCard) throw new Error(`Plan card for "${planName}" not found`);
//   const subscribeButton = within(planCard).getByRole('button', { name: /Subscribe/i });
//   await user.click(subscribeButton);
// }

//       renderWithRouter(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
//       const subscribeButton = screen.getAllByRole('button', { name: /Subscribe/i })[0];
//       await user.click(subscribeButton);
//       expect(mockSubscribeProp).toHaveBeenCalledWith(subscriptionStoreInitialState.availablePlans[0].id);
//     });