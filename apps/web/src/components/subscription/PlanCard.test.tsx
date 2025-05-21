import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanCard } from './PlanCard';
import type { SubscriptionPlan } from '@paynless/types';

// --- Mock Data & Functions ---
const mockPlan: SubscriptionPlan = {
  id: 'plan_basic_123',
  stripe_price_id: 'price_basic_stripe_123',
  stripe_product_id: 'prod_basic_stripe',
  name: 'Basic Plan',
  description: { 
    subtitle: 'Good for starters', 
    features: ['Feature 1', 'Feature 2'] 
  },
  amount: 1000, // $10.00
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  active: true,
  metadata: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  item_id_internal: null,
  plan_type: 'subscription',
  tokens_to_award: 1000,
};

const mockHandleSubscribe = vi.fn();
const mockHandleCancelSubscription = vi.fn();
const mockFormatAmount = (amount: number, currency: string) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
const mockFormatInterval = (interval: string, count: number) => 
  count === 1 ? interval : `every ${count} ${interval}s`;

const defaultProps = {
  plan: mockPlan,
  isCurrentPlan: false,
  userIsOnPaidPlan: false,
  isProcessing: false,
  handleSubscribe: mockHandleSubscribe,
  handleCancelSubscription: mockHandleCancelSubscription,
  formatAmount: mockFormatAmount,
  formatInterval: mockFormatInterval,
};

// --- Test Suite ---
describe('PlanCard Component', () => {

  it('should render basic plan details correctly', () => {
    render(<PlanCard {...defaultProps} />);

    // Check plan name
    expect(screen.getByRole('heading', { name: /Basic Plan/i })).toBeInTheDocument();

    // Check subtitle from description
    expect(screen.getByText(/Good for starters/i)).toBeInTheDocument();

    // Check formatted price
    expect(screen.getByText(/\$10\.00/)).toBeInTheDocument(); // $10.00

    // Check formatted interval (using replace logic from component)
    expect(screen.getByText(/\/month/i)).toBeInTheDocument(); // /month (monthly becomes month)
  });

  // --- Tests for features --- 
  it('should render features from description correctly', () => {
    render(<PlanCard {...defaultProps} />);
    
    expect(screen.getByText(/Feature 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Feature 2/i)).toBeInTheDocument();
  });

  it('should render fallback message when features are empty', () => {
    const planWithoutFeatures = {
      ...mockPlan,
      description: { subtitle: 'No features here', features: [] },
    };
    render(<PlanCard {...defaultProps} plan={planWithoutFeatures} />);

    expect(screen.getByText(/No specific features listed/i)).toBeInTheDocument();
  });

  it('should handle missing or invalid description structure gracefully', () => {
    const planWithInvalidDesc = {
      ...mockPlan,
      description: null, // Or could be { subtitle: 'Only sub' } etc.
    };
    render(<PlanCard {...defaultProps} plan={planWithInvalidDesc} />);

    // Check heading exists
    expect(screen.getByRole('heading', { name: /Basic Plan/i })).toBeInTheDocument(); 
    // Check paragraph contains fallback subtitle
    expect(screen.getByText(/Basic Plan/i, { selector: 'p' })).toBeInTheDocument(); 
    // Should render fallback message for features
    expect(screen.getByText(/No specific features listed/i)).toBeInTheDocument();
  });
  
  // --- Tests for button logic --- 
  describe('Button Logic', () => {
    const freePlan: SubscriptionPlan = {
      ...mockPlan, // Spread mockPlan to get defaults for other fields
      id: 'plan_free_001', // Ensure a unique ID
      stripe_price_id: 'price_Free',
      stripe_product_id: null,
      name: 'Free',
      description: { 
        subtitle: 'Basic free features', 
        features: ['Limited Access'] 
      },
      amount: 0,
      plan_type: 'subscription', // Or 'subscription' if appropriate, ensure consistency
      item_id_internal: 'default_free',
      tokens_to_award: 0,
    };

    beforeEach(() => {
      // Clear mock calls before each button test
      mockHandleSubscribe.mockClear();
      mockHandleCancelSubscription.mockClear();
    });

    it('should render "Current Plan" button (disabled) if isCurrentPlan is true', () => {
      render(<PlanCard {...defaultProps} isCurrentPlan={true} />);
      const button = screen.getByRole('button', { name: /Current Plan/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('should render "Downgrade to Free" button if plan is free and not current', () => {
      const freePlan = { ...mockPlan, amount: 0, name: 'Free Plan' };
      render(<PlanCard {...defaultProps} plan={freePlan} isCurrentPlan={false} userIsOnPaidPlan={true} />); // User must be on paid plan to downgrade
      
      const button = screen.getByRole('button', { name: /Downgrade to Free/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
      
      fireEvent.click(button);
      expect(mockHandleCancelSubscription).toHaveBeenCalledTimes(1);
      expect(mockHandleSubscribe).not.toHaveBeenCalled();
    });

    it('should disable "Downgrade to Free" if user is not on a paid plan', () => {
      const freePlan = { ...mockPlan, amount: 0, name: 'Free Plan' };
      render(<PlanCard {...defaultProps} plan={freePlan} isCurrentPlan={false} userIsOnPaidPlan={false} />);
      
      const button = screen.getByRole('button', { name: /Downgrade to Free/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('should render "Subscribe" button if plan is paid, not current, and user is not on paid plan', () => {
      render(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={false} />); // Default state
      
      const button = screen.getByRole('button', { name: /Subscribe/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
      
      fireEvent.click(button);
      expect(mockHandleSubscribe).toHaveBeenCalledTimes(1);
      expect(mockHandleSubscribe).toHaveBeenCalledWith(mockPlan.stripe_price_id);
      expect(mockHandleCancelSubscription).not.toHaveBeenCalled();
    });

    it('should render "Change Plan" button if plan is paid, not current, and user IS on paid plan', () => {
      render(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={true} />);
      
      const button = screen.getByRole('button', { name: /Change Plan/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
      
      fireEvent.click(button);
      expect(mockHandleSubscribe).toHaveBeenCalledTimes(1);
      expect(mockHandleSubscribe).toHaveBeenCalledWith(mockPlan.stripe_price_id);
      expect(mockHandleCancelSubscription).not.toHaveBeenCalled();
    });

    it('should disable action buttons when isProcessing is true', () => {
      // Test for a typical paid plan that is NOT the current plan
      const { rerender } = render(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={true} isProcessing={false} plan={mockPlan} />);
      expect(screen.getByRole('button', { name: /Change Plan/i })).toBeEnabled();

      rerender(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={true} isProcessing={true} plan={mockPlan} />);
      const processingButton = screen.getByRole('button', { name: /Processing.../i });
      expect(processingButton).toBeInTheDocument();
      expect(processingButton).toBeDisabled();
      expect(screen.queryByRole('button', { name: /Change Plan/i })).not.toBeInTheDocument();

      // Test for the "Downgrade to Free" button on the Free plan card when user is on a paid plan
      const { rerender: rerenderFree, container: freePlanContainer } = render(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={true} isProcessing={false} plan={freePlan} />);
      expect(within(freePlanContainer).getByRole('button', { name: /Downgrade to Free/i })).toBeEnabled();
      
      rerenderFree(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={true} isProcessing={true} plan={freePlan} />);
      // Scope the search for the processing button to within the freePlanContainer
      const downgradeProcessingButton = within(freePlanContainer).getByRole('button', { name: /Processing.../i });
      expect(downgradeProcessingButton).toBeInTheDocument();
      expect(downgradeProcessingButton).toBeDisabled();
      expect(within(freePlanContainer).queryByRole('button', { name: /Downgrade to Free/i })).not.toBeInTheDocument();
    });

     it('should use plan.id as fallback if stripePriceId is missing', () => {
      const planWithoutStripeId = { ...mockPlan, stripe_price_id: null };
      render(<PlanCard {...defaultProps} plan={planWithoutStripeId} />);
      
      const button = screen.getByRole('button', { name: /Subscribe/i });
      fireEvent.click(button);
      expect(mockHandleSubscribe).toHaveBeenCalledWith(planWithoutStripeId.id); // Fallback to plan.id
    });
  });
}); 