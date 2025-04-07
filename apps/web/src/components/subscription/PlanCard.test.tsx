import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanCard } from './PlanCard';
import type { SubscriptionPlan } from '@paynless/types';
import React from 'react'; // Needed for JSX

// --- Mock Data & Functions ---
const mockPlan: SubscriptionPlan = {
  id: 'plan_basic_123',
  stripePriceId: 'price_basic_stripe_123',
  stripeProductId: 'prod_basic_stripe',
  name: 'Basic Plan',
  description: { 
    subtitle: 'Good for starters', 
    features: ['Feature 1', 'Feature 2'] 
  },
  amount: 1000, // $10.00
  currency: 'usd',
  interval: 'month',
  intervalCount: 1,
  active: true,
  metadata: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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
      expect(mockHandleSubscribe).toHaveBeenCalledWith(mockPlan.stripePriceId); // Check it passes price ID
      expect(mockHandleCancelSubscription).not.toHaveBeenCalled();
    });

    it('should render "Change Plan" button if plan is paid, not current, and user IS on paid plan', () => {
      render(<PlanCard {...defaultProps} isCurrentPlan={false} userIsOnPaidPlan={true} />);
      
      const button = screen.getByRole('button', { name: /Change Plan/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
      
      fireEvent.click(button);
      expect(mockHandleSubscribe).toHaveBeenCalledTimes(1);
      expect(mockHandleSubscribe).toHaveBeenCalledWith(mockPlan.stripePriceId);
      expect(mockHandleCancelSubscription).not.toHaveBeenCalled();
    });

    it('should disable action buttons when isProcessing is true', () => {
      // Test with Subscribe button scenario
      render(<PlanCard {...defaultProps} isProcessing={true} />);
      expect(screen.getByRole('button', { name: /Subscribe/i })).toBeDisabled();

      // Test with Downgrade button scenario - Find by 'Processing...' text
      const freePlan = { ...mockPlan, amount: 0 };
      // Need to unmount the previous render to avoid duplicates in screen
      const { unmount } = render(<PlanCard {...defaultProps} plan={freePlan} userIsOnPaidPlan={true} isProcessing={true} />); 
      expect(screen.getByRole('button', { name: /Processing.../i })).toBeDisabled();
      unmount(); // Clean up

       // Test with Change Plan button scenario
       // Need to unmount the previous render to avoid duplicates in screen
      const { unmount: unmount2 } = render(<PlanCard {...defaultProps} userIsOnPaidPlan={true} isProcessing={true} />);
      expect(screen.getByRole('button', { name: /Change Plan/i })).toBeDisabled();
      unmount2(); // Clean up
    });

     it('should use plan.id as fallback if stripePriceId is missing', () => {
      const planWithoutStripeId = { ...mockPlan, stripePriceId: null };
      render(<PlanCard {...defaultProps} plan={planWithoutStripeId} />);
      
      const button = screen.getByRole('button', { name: /Subscribe/i });
      fireEvent.click(button);
      expect(mockHandleSubscribe).toHaveBeenCalledWith(planWithoutStripeId.id); // Fallback to plan.id
    });
  });
}); 