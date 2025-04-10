import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrentSubscriptionCard } from './CurrentSubscriptionCard';
import type { UserSubscription, SubscriptionPlan } from '@paynless/types';
import React from 'react';

// --- Mock Data & Functions ---
const mockPlan: SubscriptionPlan = {
  id: 'plan_pro_456',
  stripePriceId: 'price_pro_stripe_456',
  stripeProductId: 'prod_pro_stripe',
  name: 'Pro Plan',
  description: { subtitle: 'For professionals', features: ['Pro Feature 1'] },
  amount: 2500, // $25.00
  currency: 'usd',
  interval: 'month',
  intervalCount: 1,
  active: true,
  metadata: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockSubscription: UserSubscription & { plan: SubscriptionPlan } = {
  id: 'sub_user_123',
  userId: 'user-abc',
  stripeCustomerId: 'cus_xyz',
  stripeSubscriptionId: 'stripe_sub_xyz',
  status: 'active',
  plan: mockPlan, // Link the mock plan
  currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
  currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days from now
  cancelAtPeriodEnd: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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
    const cancelingSub = { ...mockSubscription, cancelAtPeriodEnd: true };
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
    const cancelingSub = { ...mockSubscription, cancelAtPeriodEnd: true };
    render(<CurrentSubscriptionCard {...defaultProps} userSubscription={cancelingSub} />);
    expect(screen.queryByRole('button', { name: /Cancel Subscription/i })).not.toBeInTheDocument();
  });

  it('should disable buttons when isProcessing is true', () => {
    render(<CurrentSubscriptionCard {...defaultProps} isProcessing={true} />);
    expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeDisabled();
    // Cancel button might be hidden or shown depending on status, check if it exists before checking disabled
    const cancelButton = screen.queryByRole('button', { name: /Cancel Subscription/i });
    if (cancelButton) {
        expect(cancelButton).toBeDisabled();
    }
  });
}); 