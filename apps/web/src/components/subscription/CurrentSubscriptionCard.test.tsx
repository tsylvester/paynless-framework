import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrentSubscriptionCard } from './CurrentSubscriptionCard';
import type { UserSubscription, SubscriptionPlan } from '@paynless/types';
import React from 'react';

// --- Mock Data & Functions ---
const mockPlan: SubscriptionPlan = {
  id: 'plan_pro_456',
  stripe_price_id: 'price_pro_stripe_456',
  stripe_product_id: 'prod_pro_stripe',
  name: 'Pro Plan',
  description: { subtitle: 'For professionals', features: ['Pro Feature 1'] },
  amount: 2500, // $25.00
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  active: true,
  metadata: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  item_id_internal: null,
  plan_type: 'subscription'
};

const mockSubscription: UserSubscription & { plan: SubscriptionPlan } = {
  id: 'sub_user_123',
  user_id: 'user-abc',
  stripe_customer_id: 'cus_xyz',
  stripe_subscription_id: 'stripe_sub_xyz',
  status: 'active',
  plan_id: mockPlan.id,
  plan: mockPlan,
  current_period_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
  cancel_at_period_end: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  trial_start: null,
  trial_end: null,
  ended_at: null,
  canceled_at: null,
  metadata: null,
  price_id: mockPlan.stripe_price_id,
};

const mockHandleManageSubscription = vi.fn();
const mockHandleCancelSubscription = vi.fn();
const mockFormatAmount = (amount: number, currency: string) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
const mockFormatInterval = (interval: string, count: number) => 
  count === 1 ? `${interval}ly` : `every ${count} ${interval}s`; // Match the original format used in this component

const defaultProps = {
  userSubscription: mockSubscription,
  isProcessing: false,
  handleManageSubscription: mockHandleManageSubscription,
  handleCancelSubscription: mockHandleCancelSubscription,
  formatAmount: mockFormatAmount,
  formatInterval: mockFormatInterval,
};

// Helper function to render the component with provided props
const renderCurrentSubscriptionCard = (props: Partial<Parameters<typeof CurrentSubscriptionCard>[0]>) => {
  const mergedProps = { ...defaultProps, ...props };
  const view = render(<CurrentSubscriptionCard {...mergedProps} />);
  return { ...view, props: mergedProps }; // Return props for easy access in tests if needed
};

// --- Test Suite ---
describe('CurrentSubscriptionCard Component', () => {
  beforeEach(() => {
    mockHandleManageSubscription.mockClear();
    mockHandleCancelSubscription.mockClear();
  });

  it('should render current subscription details correctly', () => {
    render(<CurrentSubscriptionCard {...defaultProps} />);

    expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro Plan/i)).toBeInTheDocument(); // Plan name
    expect(screen.getByText(/\$25\.00/)).toBeInTheDocument(); // Price
    expect(screen.getByText(/monthly/i)).toBeInTheDocument(); // Interval
    expect(screen.getByText(/Active/i)).toBeInTheDocument(); // Status
    expect(screen.getByText(/Current period ends:/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your subscription will be canceled/i)).not.toBeInTheDocument(); // Cancel notice should not be visible
  });

  it('should display cancel notice if cancelAtPeriodEnd is true', () => {
    const cancelingSub = { ...mockSubscription, cancel_at_period_end: true };
    render(<CurrentSubscriptionCard {...defaultProps} userSubscription={cancelingSub} />);
    expect(screen.getByText(/Your subscription will be canceled/i)).toBeInTheDocument();
  });

  it('should call handleManageSubscription when Manage Billing button is clicked', () => {
    render(<CurrentSubscriptionCard {...defaultProps} />);
    const button = screen.getByRole('button', { name: /Manage Billing/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockHandleManageSubscription).toHaveBeenCalledTimes(1);
  });

  it('should show and call handleCancelSubscription when Cancel button is clicked (if active and not canceling)', () => {
    render(<CurrentSubscriptionCard {...defaultProps} />); // Default is active and not canceling
    const button = screen.getByRole('button', { name: /Cancel Subscription/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockHandleCancelSubscription).toHaveBeenCalledTimes(1);
  });

  it('should hide Cancel button if status is not active', () => {
    const inactiveSub = { ...mockSubscription, status: 'past_due' };
    render(<CurrentSubscriptionCard {...defaultProps} userSubscription={inactiveSub} />);
    expect(screen.queryByRole('button', { name: /Cancel Subscription/i })).not.toBeInTheDocument();
  });

  it('should hide Cancel button if cancelAtPeriodEnd is true', () => {
    const cancelingSub = { ...mockSubscription, cancel_at_period_end: true };
    render(<CurrentSubscriptionCard {...defaultProps} userSubscription={cancelingSub} />);
    expect(screen.queryByRole('button', { name: /Cancel Subscription/i })).not.toBeInTheDocument();
  });

  it('should disable buttons when isProcessing is true', () => {
    const { rerender } = renderCurrentSubscriptionCard({ isProcessing: false });
    // Initial state: buttons are enabled
    expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Cancel Subscription/i })).toBeEnabled();

    // Set isProcessing to true
    rerender(renderCurrentSubscriptionCard({ isProcessing: true }).ui);

    // Now buttons should be named "Processing..." and be disabled
    const processingButtons = screen.getAllByRole('button', { name: /Processing.../i });
    expect(processingButtons.length).toBe(2); // Expecting two buttons to be in processing state
    processingButtons.forEach(button => {
      expect(button).toBeDisabled();
    });
    
    // Ensure original named buttons are not found (because their text changed)
    expect(screen.queryByRole('button', { name: /Manage Billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel Subscription/i })).not.toBeInTheDocument();
  });

  it('should not render cancel button if cancelAtPeriodEnd is true', () => {
    const cancelingSub = { ...mockSubscription, cancel_at_period_end: true };
    render(<CurrentSubscriptionCard {...defaultProps} userSubscription={cancelingSub} />);
    expect(screen.queryByRole('button', { name: /Cancel Subscription/i })).not.toBeInTheDocument();
  });
}); 