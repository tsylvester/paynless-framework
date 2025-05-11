import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { SubscriptionPage } from './Subscription';
import { useAuthStore, useSubscriptionStore } from '@paynless/store'; // Import actual stores
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { UserProfile, SubscriptionPlan, UserSubscription } from '@paynless/types';
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

// Define Initial States for Stores (ensure stripe_subscription_id is present)
// Add necessary fields for formatters (amount, currency, interval, intervalCount)
const authStoreInitialState = {
  user: { id: 'user-123' } as any, 
  profile: { id: 'user-123' } as UserProfile, 
  session: { access_token: 'mock-token' } as any,
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
      { id: 'plan-1', name: 'Basic Plan', stripe_price_id: 'price_basic', amount: 1000, currency: 'usd', interval: 'month', interval_count: 1, description: { subtitle: 'Basic Sub', features: ['Feature 1'] } } as unknown as SubscriptionPlan,
      { id: 'plan-2', name: 'Pro Plan', stripe_price_id: 'price_pro', amount: 5000, currency: 'usd', interval: 'month', interval_count: 1, description: { subtitle: 'Pro Sub', features: ['Feature A', 'Feature B'] } } as unknown as SubscriptionPlan
  ],
  userSubscription: {
    id: 'sub-db-id-123', 
    status: 'active', 
    stripeSubscriptionId: 'stripe_sub_abc', // Make sure this exists for cancel
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Add date for display
    cancelAtPeriodEnd: false, // Add for display logic
    plan: { id: 'plan-1', name: 'Basic Plan', stripe_price_id: 'price_basic', amount: 1000, currency: 'usd', interval: 'month', interval_count: 1 } 
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

// Mock the store module BUT use the actual hook implementation
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useAuthStore: actual.useAuthStore,
    useSubscriptionStore: actual.useSubscriptionStore,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSubscriptionData.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockCreateBillingPortalSession.mockReset();
    mockCancelSubscription.mockReset();
    mockResumeSubscription.mockReset();

    // Set initial store states using direct setState
    act(() => {
      useAuthStore.setState({ ...authStoreInitialState }, true);
      useSubscriptionStore.setState({ ...subscriptionStoreInitialState }, true);
    });
    mockLoadSubscriptionData.mockResolvedValue(); 
  });

  // --- Rendering tests (adjusted for real components) ---
  it('should render loading spinner if auth is loading', () => {
    act(() => { useAuthStore.setState({ isLoading: true, user: null }); });
    renderWithRouter(<SubscriptionPage />); 
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument(); 
  });

  it('should render loading spinner if subscription data is loading', () => {
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
    // Check for content *inside* the real component
    const currentSubCard = screen.getByText(/Current Subscription/i).closest('div.bg-primary\\/10'); // Find the card container
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
        userSubscription: { id: 'sub-free', status: 'free', plan: { id: 'plan-free', name: 'Free Plan' } } as any, // Cast for simplicity
        hasActiveSubscription: false 
      }); 
    });
    renderWithRouter(<SubscriptionPage />);
    expect(screen.queryByText(/Current Subscription/i)).not.toBeInTheDocument();
  });

  it('should render PlanCard content for each available plan', () => {
    renderWithRouter(<SubscriptionPage />);
    // Check for content inside the real component using within for specificity
    const planCardsContainer = screen.getByRole('heading', { name: /Subscription Plans/i }).parentElement?.parentElement?.querySelector('.grid.gap-8');
    if (!planCardsContainer) throw new Error('Plan cards container not found');

    // Find cards more robustly, e.g., by looking for a heading within a div that's a direct child of the grid
    const basicPlanCard = within(planCardsContainer).getByRole('heading', { name: /Basic Plan/i, level: 2 }).closest('div.border');
    const proPlanCard = within(planCardsContainer).getByRole('heading', { name: /Pro Plan/i, level: 2 }).closest('div.border');

    if (!basicPlanCard || !proPlanCard) throw new Error('Could not find specific plan card containers');

    // Use within to scope assertions to each card
    expect(within(basicPlanCard).getByRole('heading', { name: /Basic Plan/i, level: 2 })).toBeInTheDocument(); // Check heading specifically
    expect(within(proPlanCard).getByRole('heading', { name: /Pro Plan/i, level: 2 })).toBeInTheDocument();   // Check heading specifically
    expect(within(basicPlanCard).getByText('Feature 1')).toBeInTheDocument(); // Check a feature instead
    expect(within(proPlanCard).getByText('Feature A')).toBeInTheDocument(); // Check a feature
    
    // Check for buttons (might be Subscribe, Change Plan, or Downgrade)
    expect(within(basicPlanCard).getByRole('button', { name: /Current Plan/i })).toBeInTheDocument();
    expect(within(proPlanCard).getByRole('button', { name: /Change Plan/i })).toBeInTheDocument();
  });

  // --- Refactored Interaction Tests --- 

  it('should call createBillingPortalSession when manage button is clicked', async () => {
    mockCreateBillingPortalSession.mockResolvedValue('mock-portal-url'); 
    renderWithRouter(<SubscriptionPage />);

    const manageButton = screen.getByRole('button', { name: /Manage Billing/i });
    expect(manageButton).toBeEnabled(); 

    await user.click(manageButton);

    // Check action called immediately
    expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);

    // Simulate loading state change AFTER the action is called (as the action itself sets loading)
    act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: true }); });
    expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeDisabled();

    // Simulate completion
    await act(async () => { await mockCreateBillingPortalSession.mock.results[0].value; });
    act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: false, error: null }); });

    expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeEnabled();
  });

  it('should call createCheckoutSession when subscribe button on a PlanCard is clicked', async () => {
    // Setup: Ensure user has no active sub, so 'Subscribe' button appears for Pro plan
    act(() => { useSubscriptionStore.setState({ userSubscription: null, hasActiveSubscription: false }); });
    
    mockCreateCheckoutSession.mockResolvedValue('mock-checkout-url'); 
    renderWithRouter(<SubscriptionPage />);

    // Find the Pro Plan card container
    const planCardsContainer = screen.getByRole('heading', { name: /Subscription Plans/i }).parentElement?.parentElement?.querySelector('.grid.gap-8');
    if (!planCardsContainer) throw new Error('Plan cards container not found');
    const proPlanCard = within(planCardsContainer).getByRole('heading', { name: /Pro Plan/i, level: 2 }).closest('div.border');
    if (!proPlanCard) throw new Error('Could not find Pro plan card container');

    // Find the Subscribe button WITHIN the Pro Plan card
    const subscribeButton = within(proPlanCard).getByRole('button', { name: /Subscribe/i });
    expect(subscribeButton).toBeEnabled();

    await user.click(subscribeButton);

    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith('price_pro'); // Ensure correct price ID

    // Simulate loading
    act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: true }); });
    // Re-find the button within the scope and check if it's disabled
    expect(within(proPlanCard).getByRole('button', { name: /Subscribe/i })).toBeDisabled();

    // Simulate completion
    await act(async () => { await mockCreateCheckoutSession.mock.results[0].value; }); 
    act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: false, error: null }); });

    expect(within(proPlanCard).getByRole('button', { name: /Subscribe/i })).toBeEnabled();
  });

  it('should call cancelSubscription when cancel button is clicked', async () => {
    const currentSubscription = subscriptionStoreInitialState.userSubscription;
    if (!currentSubscription?.stripeSubscriptionId) throw new Error('Initial state missing subscription or stripe ID');
    mockCancelSubscription.mockResolvedValue(true); 
    
    renderWithRouter(<SubscriptionPage />);

    const cancelButton = screen.getByRole('button', { name: /Cancel Subscription/i });
    expect(cancelButton).toBeEnabled();

    await user.click(cancelButton);

    // Check action called immediately
    expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
    expect(mockCancelSubscription).toHaveBeenCalledWith(currentSubscription.stripeSubscriptionId);

    // Simulate loading
    act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: true }); });
    expect(screen.getByRole('button', { name: /Cancel Subscription/i })).toBeDisabled();

    // Simulate completion
    await act(async () => { await mockCancelSubscription.mock.results[0].value; });
    act(() => { useSubscriptionStore.setState({ isSubscriptionLoading: false, error: null }); });

    expect(screen.getByRole('button', { name: /Cancel Subscription/i })).toBeEnabled();
  });

}); 