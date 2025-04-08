import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { SubscriptionPage } from './Subscription';
import { useAuthStore } from '@paynless/store';
import { useSubscriptionStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom'; 
import type { User, UserProfile, SubscriptionPlan, UserSubscription } from '@paynless/types';

// --- Mocks --- 
// Mock Layout and Navigate, but NOT PlanCard or CurrentSubscriptionCard
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual, // Keep original Link etc.
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
  }
})

// Mock Zustand stores
const mockCreateBillingPortalSession = vi.fn().mockResolvedValue('http://portal-url');
const mockCancelSubscription = vi.fn().mockResolvedValue(true);
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useSubscriptionStore: vi.fn(),
}));

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock props
const mockOnSubscribe = vi.fn().mockResolvedValue(undefined);

// Mock Data
const mockUser: User = { id: 'user-123', email: 'test@example.com', created_at: 'date' };
const mockPlans: SubscriptionPlan[] = [
  {
    id: 'plan_free', stripePriceId: 'price_free', name: 'Free Plan', amount: 0, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date',
    description: { subtitle: 'Free forever', features: ['Basic feature'] }, metadata: null, stripeProductId: 'prod_free'
  },
  {
    id: 'plan_basic', stripePriceId: 'price_basic', name: 'Basic Plan', amount: 1000, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date',
    description: { subtitle: 'Good start', features: ['Feature A', 'Feature B'] }, metadata: null, stripeProductId: 'prod_basic'
  },
  {
    id: 'plan_pro', stripePriceId: 'price_pro', name: 'Pro Plan', amount: 2500, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date',
    description: { subtitle: 'For pros', features: ['Feature A', 'Feature B', 'Feature C'] }, metadata: null, stripeProductId: 'prod_pro'
  }
];

const mockActiveSub: UserSubscription = {
  id: 'sub-pro-123', userId: 'user-123', status: 'active', plan: mockPlans[2], // Pro Plan
  stripeSubscriptionId: 'stripe_sub_pro', stripeCustomerId: 'cus_123', 
  currentPeriodStart: 'date', currentPeriodEnd: 'date', cancelAtPeriodEnd: false, createdAt: 'date', updatedAt: 'date'
};

// Helper to render with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

// --- Test Suite: Integration Tests ---
describe('SubscriptionPage Integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default user
    vi.mocked(useAuthStore).mockReturnValue({ user: mockUser, isLoading: false, profile: null });
  });

  describe('Scenario: User with Active Subscription (Pro Plan)', () => {
    beforeEach(() => {
      // Setup store for this scenario
      vi.mocked(useSubscriptionStore).mockReturnValue({
        availablePlans: mockPlans,
        userSubscription: mockActiveSub,
        isSubscriptionLoading: false,
        isTestMode: false,
        error: null,
        createBillingPortalSession: mockCreateBillingPortalSession,
        cancelSubscription: mockCancelSubscription,
      });
    });

    it('should render CurrentSubscriptionCard with correct plan details', () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      // Find the current subscription card (may not have specific testid, look within layout)
      const currentCard = screen.getByText(/Current Subscription/i).closest('div.p-6');
      expect(currentCard).toBeInTheDocument();
      expect(within(currentCard!).getByText(/Pro Plan/i)).toBeInTheDocument();
      expect(within(currentCard!).getByText(/\$25\.00/i)).toBeInTheDocument();
      expect(within(currentCard!).getByRole('button', { name: /Manage Billing/i })).toBeInTheDocument();
      expect(within(currentCard!).getByRole('button', { name: /Cancel Subscription/i })).toBeInTheDocument();
    });

    it("should render PlanCards with correct buttons ('Current', 'Change', 'Downgrade')", () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      
      // Find plan cards (assuming they render the plan name)
      const freePlanCard = screen.getByText('Free Plan').closest('div.border');
      const basicPlanCard = screen.getByText('Basic Plan').closest('div.border');
      const proPlanCard = screen.getByRole('heading', { name: /Pro Plan/i, level: 2 }).closest('div.border');
      
      expect(freePlanCard).toBeInTheDocument();
      expect(basicPlanCard).toBeInTheDocument();
      expect(proPlanCard).toBeInTheDocument();
      
      // Pro Plan (Current)
      expect(within(proPlanCard!).getByRole('button', { name: /Current Plan/i })).toBeDisabled();
      
      // Basic Plan (Change)
      expect(within(basicPlanCard!).getByRole('button', { name: /Change Plan/i })).toBeEnabled();
      
      // Free Plan (Downgrade)
      expect(within(freePlanCard!).getByRole('button', { name: /Downgrade to Free/i })).toBeEnabled();
    });

    it('should call createBillingPortalSession when Manage Billing is clicked', async () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      const manageButton = screen.getByRole('button', { name: /Manage Billing/i });
      await act(async () => {
        await fireEvent.click(manageButton);
      });
      expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);
    });

    it('should call cancelSubscription when Cancel Subscription (in Current Card) is clicked', async () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      const cancelButton = screen.getByRole('button', { name: /Cancel Subscription/i });
      await act(async () => {
        await fireEvent.click(cancelButton);
      });
      expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockCancelSubscription).toHaveBeenCalledWith(mockActiveSub.stripeSubscriptionId); // Check ID
    });
    
    it('should call cancelSubscription when Downgrade to Free (in Free Plan Card) is clicked', async () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      const freePlanCard = screen.getByText('Free Plan').closest('div.border');
      const downgradeButton = within(freePlanCard!).getByRole('button', { name: /Downgrade to Free/i });
      await act(async () => {
        await fireEvent.click(downgradeButton);
      });
      expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockCancelSubscription).toHaveBeenCalledWith(mockActiveSub.stripeSubscriptionId); // Still cancelling the active sub
    });

    it('should call onSubscribe when Change Plan (in Basic Plan Card) is clicked', async () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      const basicPlanCard = screen.getByText('Basic Plan').closest('div.border');
      const changeButton = within(basicPlanCard!).getByRole('button', { name: /Change Plan/i });
      await act(async () => {
        await fireEvent.click(changeButton);
      });
      expect(mockOnSubscribe).toHaveBeenCalledTimes(1);
      expect(mockOnSubscribe).toHaveBeenCalledWith(mockPlans[1].stripePriceId); // Basic Plan price ID
    });
  });

  // --- Scenario 2: User with No Active Subscription --- 
  describe('Scenario: User with No Paid Subscription', () => {
    beforeEach(() => {
      // Setup store for this scenario (could be null or free status)
      vi.mocked(useSubscriptionStore).mockReturnValue({
        availablePlans: mockPlans,
        userSubscription: null, // Or: { ...mockActiveSub, status: 'free', plan: mockPlans[0] }
        isSubscriptionLoading: false,
        isTestMode: false,
        error: null,
        createBillingPortalSession: mockCreateBillingPortalSession,
        cancelSubscription: mockCancelSubscription,
      });
    });

    it('should NOT render CurrentSubscriptionCard', () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      // Look for text unique to the CurrentSubscriptionCard
      expect(screen.queryByText(/Current Subscription/i)).not.toBeInTheDocument(); 
    });

    it('should render PlanCards with "Subscribe" buttons for paid plans', () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      
      const freePlanCard = screen.getByText('Free Plan').closest('div.border');
      const basicPlanCard = screen.getByText('Basic Plan').closest('div.border');
      const proPlanCard = screen.getByRole('heading', { name: /Pro Plan/i, level: 2 }).closest('div.border');
      
      // Free Plan (might show Current if sub is free, or nothing interactable? Check component logic)
      // Based on PlanCard logic, if !isCurrentPlan and isFreePlan, it shows Downgrade (disabled if !userIsOnPaidPlan)
      expect(within(freePlanCard!).getByRole('button', { name: /Downgrade to Free/i })).toBeDisabled();
      
      // Basic Plan (Subscribe)
      expect(within(basicPlanCard!).getByRole('button', { name: /Subscribe/i })).toBeEnabled();
      
      // Pro Plan (Subscribe)
      expect(within(proPlanCard!).getByRole('button', { name: /Subscribe/i })).toBeEnabled();
    });

    it('should call onSubscribe when Subscribe (Basic Plan) is clicked', async () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      const basicPlanCard = screen.getByText('Basic Plan').closest('div.border');
      const subscribeButton = within(basicPlanCard!).getByRole('button', { name: /Subscribe/i });
      await act(async () => {
        await fireEvent.click(subscribeButton);
      });
      expect(mockOnSubscribe).toHaveBeenCalledTimes(1);
      expect(mockOnSubscribe).toHaveBeenCalledWith(mockPlans[1].stripePriceId); // Basic Plan price ID
    });
    
    it('should call onSubscribe when Subscribe (Pro Plan) is clicked', async () => {
      renderWithRouter(<SubscriptionPage onSubscribe={mockOnSubscribe} />);
      const proPlanCard = screen.getByRole('heading', { name: /Pro Plan/i, level: 2 }).closest('div.border');
      const subscribeButton = within(proPlanCard!).getByRole('button', { name: /Subscribe/i });
      await act(async () => {
        await fireEvent.click(subscribeButton);
      });
      expect(mockOnSubscribe).toHaveBeenCalledTimes(1);
      expect(mockOnSubscribe).toHaveBeenCalledWith(mockPlans[2].stripePriceId); // Pro Plan price ID
    });
  });
}); 