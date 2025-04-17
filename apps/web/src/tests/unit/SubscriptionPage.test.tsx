import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SubscriptionPage } from '@/pages/Subscription' // Adjust path if needed
import { useAuthStore, useSubscriptionStore } from '@paynless/store'
import { analytics } from '@paynless/analytics-client'
import { BrowserRouter } from 'react-router-dom'
import type { SubscriptionPlan, UserSubscription } from '@paynless/types'

// Mock stores
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useSubscriptionStore: vi.fn(),
}))

// Mock analytics
vi.mock('@paynless/analytics-client', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}))

// Mock child components
const MockPlanCard = vi.fn(({ plan, handleSubscribe, handleCancelSubscription, isCurrentPlan, userIsOnPaidPlan }) => (
  <div data-testid={`plan-${plan.id}`}>
    <span>{plan.name}</span>
    {!isCurrentPlan && plan.amount === 0 && userIsOnPaidPlan && (
        <button onClick={handleCancelSubscription}>Downgrade to Free</button>
    )}
    {!isCurrentPlan && plan.amount > 0 && (
        <button onClick={() => handleSubscribe(plan.stripePriceId)}>Subscribe/Change</button>
    )}
  </div>
))
const MockCurrentSubscriptionCard = vi.fn(({ handleCancelSubscription, handleManageSubscription }) => (
  <div data-testid="current-sub-card">
    <span>CurrentSubscriptionCard Mock</span>
    <button onClick={handleCancelSubscription}>Cancel Subscription</button>
    <button onClick={handleManageSubscription}>Manage Billing</button>
  </div>
))
vi.mock('@/components/subscription/PlanCard', () => ({ PlanCard: MockPlanCard }))
vi.mock('@/components/subscription/CurrentSubscriptionCard', () => ({ CurrentSubscriptionCard: MockCurrentSubscriptionCard }))
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout-mock">{children}</div>
  ),
}))

// Keep refs to mock functions
let mockCreateCheckoutSession: vi.Mock
let mockCancelSubscription: vi.Mock
let mockCreateBillingPortalSession: vi.Mock
let mockAnalyticsTrack: vi.Mock

// Mock data
const mockPlans: SubscriptionPlan[] = [
  {
    id: 'plan_free',
    stripePriceId: 'price_free',
    stripeProductId: 'prod_free',
    name: 'Free',
    description: JSON.stringify({ features: ['Basic Access'] }),
    amount: 0,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    active: true,
    metadata: null,
    createdAt: '",
    updatedAt: '",
  },
  {
    id: 'plan_pro',
    stripePriceId: 'price_pro_123',
    stripeProductId: 'prod_pro',
    name: 'Pro',
    description: JSON.stringify({ features: ['Pro Access'] }),
    amount: 1000,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    active: true,
    metadata: null,
    createdAt: '",
    updatedAt: '",
  },
]

const mockActiveSubscription: UserSubscription = {
  id: 'sub_active_123',
  userId: 'user_sub_test',
  stripeCustomerId: 'cus_mock',
  stripeSubscriptionId: 'stripe_sub_mock_active',
  status: 'active',
  planId: 'plan_pro',
  plan: mockPlans.find(p => p.id === 'plan_pro') as SubscriptionPlan,
  currentPeriodStart: new Date().toISOString(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancelAtPeriodEnd: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('Subscription Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCheckoutSession = vi.fn().mockResolvedValue('https://checkout.stripe.com/mock_session')
    mockCancelSubscription = vi.fn().mockResolvedValue(true)
    mockCreateBillingPortalSession = vi.fn().mockResolvedValue('https://billing.stripe.com/mock_portal')
    mockAnalyticsTrack = vi.mocked(analytics.track)

    // Mock store return values
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'user_sub_test', email: 'sub@test.com' },
      isLoading: false,
      // ... other auth state if needed
    })
    vi.mocked(useSubscriptionStore).mockReturnValue({
      userSubscription: null, // Start with no active subscription
      availablePlans: mockPlans,
      isSubscriptionLoading: false,
      hasActiveSubscription: false,
      isTestMode: true,
      error: null,
      loadSubscriptionData: vi.fn(),
      refreshSubscription: vi.fn(),
      createCheckoutSession: mockCreateCheckoutSession,
      createBillingPortalSession: mockCreateBillingPortalSession,
      cancelSubscription: mockCancelSubscription,
      resumeSubscription: vi.fn(),
      getUsageMetrics: vi.fn(),
      setUserSubscription: vi.fn(),
      setAvailablePlans: vi.fn(),
      setIsLoading: vi.fn(),
      setTestMode: vi.fn(),
      setError: vi.fn(),
    })

    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  })

  it('should render loading state initially', () => {
     vi.mocked(useSubscriptionStore).mockReturnValueOnce({
        ...useSubscriptionStore(),
        isSubscriptionLoading: true,
        availablePlans: [], // No plans while loading
     })
     render(<SubscriptionPage />, { wrapper: BrowserRouter })
     expect(screen.getByText(/loading plans/i)).toBeInTheDocument()
  })

  it('should render available plans', () => {
    render(<SubscriptionPage />, { wrapper: BrowserRouter })
    expect(screen.getByTestId('plan-plan_free')).toBeInTheDocument()
    expect(screen.getByTestId('plan-plan_pro')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })

  it('should call createCheckoutSession and analytics.track when a subscribe button is clicked', async () => {
    render(<SubscriptionPage />, { wrapper: BrowserRouter })

    // Find the subscribe button within the Pro plan card mock
    const proPlanCard = screen.getByTestId('plan-plan_pro');
    const subscribeButton = screen.getByRole('button', { name: /subscribe/i }); // Simpler selector for mock

    expect(subscribeButton).toBeInTheDocument();
    
    await fireEvent.click(subscribeButton);

    // Verify analytics track was called BEFORE checkout session creation
    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Subscription: Clicked Subscribe', { 
        planId: 'plan_pro', 
        priceId: 'price_pro_123' 
    });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);

    // Verify store action was called
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith('price_pro_123');

    // Verify redirect occurred (optional but good)
    expect(window.location.href).toBe('https://checkout.stripe.com/mock_session');
  });

  it('should call cancelSubscription and analytics.track when cancel button on CurrentSubscriptionCard is clicked', async () => {
    vi.mocked(useSubscriptionStore).mockReturnValueOnce({
        ...useSubscriptionStore(),
        userSubscription: mockActiveSubscription,
        hasActiveSubscription: true,
    })
    render(<SubscriptionPage />, { wrapper: BrowserRouter })

    const currentSubCard = screen.getByTestId('current-sub-card');
    const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });

    expect(cancelButton).toBeInTheDocument();
    
    await fireEvent.click(cancelButton);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Subscription: Clicked Cancel Subscription', { 
        subscriptionId: mockActiveSubscription.stripeSubscriptionId,
        currentPlanId: mockActiveSubscription.planId
    });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);

    expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
    expect(mockCancelSubscription).toHaveBeenCalledWith(mockActiveSubscription.stripeSubscriptionId);
  });

  it('should call cancelSubscription and analytics.track when Downgrade button on Free PlanCard is clicked (when user has paid plan)', async () => {
    vi.mocked(useSubscriptionStore).mockReturnValueOnce({
        ...useSubscriptionStore(),
        userSubscription: mockActiveSubscription,
        hasActiveSubscription: true,
    })
    render(<SubscriptionPage />, { wrapper: BrowserRouter })

    const freePlanCard = screen.getByTestId('plan-plan_free');
    const downgradeButton = screen.getByRole('button', { name: /downgrade to free/i });

    expect(downgradeButton).toBeInTheDocument();
    
    await fireEvent.click(downgradeButton);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Subscription: Clicked Cancel Subscription', { 
        subscriptionId: mockActiveSubscription.stripeSubscriptionId,
        currentPlanId: mockActiveSubscription.planId
    });
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);

    expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
    expect(mockCancelSubscription).toHaveBeenCalledWith(mockActiveSubscription.stripeSubscriptionId);
  });

  it('should call createBillingPortalSession and analytics.track when Manage Billing button is clicked', async () => {
    vi.mocked(useSubscriptionStore).mockReturnValueOnce({
        ...useSubscriptionStore(),
        userSubscription: mockActiveSubscription,
        hasActiveSubscription: true,
    })
    render(<SubscriptionPage />, { wrapper: BrowserRouter })

    const currentSubCard = screen.getByTestId('current-sub-card');
    const manageButton = screen.getByRole('button', { name: /manage billing/i });

    expect(manageButton).toBeInTheDocument();
    
    await fireEvent.click(manageButton);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('Subscription: Clicked Manage Billing');
    expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);

    expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);

    expect(window.location.href).toBe('https://billing.stripe.com/mock_portal');
  });

  // Add more tests for current subscription display, cancel, manage billing etc.

}); 