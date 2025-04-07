import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionPage } from './Subscription';
import { useAuthStore } from '@paynless/store';
import { useSubscriptionStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom'; // Use MemoryRouter for testing routes/redirects

// --- Mocks --- 
// Mock child components
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));
vi.mock('../components/subscription/CurrentSubscriptionCard', () => ({ CurrentSubscriptionCard: () => <div data-testid="current-sub-card">Current Sub Card</div> }));
vi.mock('../components/subscription/PlanCard', () => ({ PlanCard: ({ plan }: { plan: { name: string } }) => <div data-testid={`plan-card-${plan.name.toLowerCase().replace(' ', '-')}`}>Plan Card: {plan.name}</div> }));

// Mock react-router-dom Navigate
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
  }
})

// Mock Zustand stores
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useSubscriptionStore: vi.fn(),
}));

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock props
const mockOnSubscribe = vi.fn();

// Helper function for rendering with router
const renderWithRouter = (ui: React.ReactElement, { route = '/' } = {}) => {
  window.history.pushState({}, 'Test page', route);
  return render(ui, { wrapper: MemoryRouter });
};

// --- Test Suite --- 
describe('SubscriptionPage Component', () => {
  // Reset mocks and default state before each test
  beforeEach(() => {
    vi.resetAllMocks();
    // Default happy path state
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'user-123' }, // Mock user object
      isLoading: false,
    });
    vi.mocked(useSubscriptionStore).mockReturnValue({
      availablePlans: [{ id: 'plan-1', name: 'Basic Plan' }, { id: 'plan-2', name: 'Pro Plan' }],
      userSubscription: { id: 'sub-1', status: 'active', plan: { id: 'plan-1', name: 'Basic Plan' } }, // Mock subscription object with plan
      isSubscriptionLoading: false,
      isTestMode: false,
      error: null,
      createBillingPortalSession: vi.fn(),
      cancelSubscription: vi.fn(),
    });
  });

  it('should render loading spinner if auth is loading', () => {
    vi.mocked(useAuthStore).mockReturnValue({ isLoading: true, user: null });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
  });

  it('should render loading spinner if subscription data is loading', () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'user-123' }, isLoading: false });
    vi.mocked(useSubscriptionStore).mockReturnValue({
      isSubscriptionLoading: true,
      availablePlans: [],
      userSubscription: null,
      isTestMode: false,
      error: null,
      createBillingPortalSession: vi.fn(),
      cancelSubscription: vi.fn(),
    });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
  });

  it('should redirect to /login if user is not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: null, isLoading: false });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /login');
  });

  it('should display error message if store has error', () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'user-123' }, isLoading: false });
    vi.mocked(useSubscriptionStore).mockReturnValue({
      availablePlans: [],
      userSubscription: null,
      isSubscriptionLoading: false,
      isTestMode: false,
      error: new Error('Something went wrong from store'),
      createBillingPortalSession: vi.fn(),
      cancelSubscription: vi.fn(),
    });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByText(/Something went wrong from store/i)).toBeInTheDocument();
  });

  it('should display test mode warning if isTestMode is true', () => {
     vi.mocked(useSubscriptionStore).mockReturnValue({ 
        ...vi.mocked(useSubscriptionStore)(), // Keep other defaults
        isTestMode: true 
    });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByText(/Test Mode Active/i)).toBeInTheDocument();
  });

  it('should render page title and description', () => {
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByRole('heading', { name: /Subscription Plans/i })).toBeInTheDocument();
    expect(screen.getByText(/Choose the plan that.s right for you/i)).toBeInTheDocument();
  });

  it('should render CurrentSubscriptionCard if user has an active subscription with a plan', () => {
    // Default state in beforeEach covers this
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByTestId('current-sub-card')).toBeInTheDocument();
  });

  it('should NOT render CurrentSubscriptionCard if user subscription is null or has no plan', () => {
    vi.mocked(useSubscriptionStore).mockReturnValue({ ...vi.mocked(useSubscriptionStore)(), userSubscription: null });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.queryByTestId('current-sub-card')).not.toBeInTheDocument();
    
    // Test with subscription but null plan
    vi.mocked(useSubscriptionStore).mockReturnValue({ ...vi.mocked(useSubscriptionStore)(), userSubscription: { id: 'sub-1', status: 'active', plan: null } });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.queryByTestId('current-sub-card')).not.toBeInTheDocument();
  });
  
    it('should NOT render CurrentSubscriptionCard if user subscription status is free', () => {
    vi.mocked(useSubscriptionStore).mockReturnValue({ 
        ...vi.mocked(useSubscriptionStore)(), 
        userSubscription: { id: 'sub-free', status: 'free', plan: { id: 'plan-free', name: 'Free Plan' } }
    });
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.queryByTestId('current-sub-card')).not.toBeInTheDocument();
  });

  it('should render PlanCard for each available plan', () => {
    // Default state has 2 plans
    renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
    expect(screen.getByTestId('plan-card-basic-plan')).toBeInTheDocument();
    expect(screen.getByTestId('plan-card-pro-plan')).toBeInTheDocument();
    expect(screen.getAllByText(/Plan Card:/i)).toHaveLength(2);
  });

  // TODO: Add tests for handler functions (handleSubscribe, handleCancel, handleManage)
  // These might involve interacting with mocked child components or verifying state changes

}); 