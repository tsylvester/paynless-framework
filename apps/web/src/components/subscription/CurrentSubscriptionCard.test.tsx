import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrentSubscriptionCard } from './CurrentSubscriptionCard';
import type { CurrentSubscriptionCardProps } from './CurrentSubscriptionCard.interface';
import {
  buildCurrentSubscriptionCardProps,
  mockHandleManageSubscription,
  mockHandleCancelSubscription,
  type CurrentSubscriptionCardPropsOverrides,
} from './CurrentSubscriptionCard.mock';
import { buildUserSubscription } from '../../mocks/userSubscription.mock';

function renderCurrentSubscriptionCard(
  overrides?: CurrentSubscriptionCardPropsOverrides,
) {
  const props: CurrentSubscriptionCardProps =
    buildCurrentSubscriptionCardProps(overrides);
  return render(<CurrentSubscriptionCard {...props} />);
}

describe('CurrentSubscriptionCard Component', () => {
  beforeEach(() => {
    mockHandleManageSubscription.mockClear();
    mockHandleCancelSubscription.mockClear();
  });

  it('should render current subscription details correctly', () => {
    renderCurrentSubscriptionCard();

    expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/Basic Plan/i)).toBeInTheDocument();
    expect(screen.getByText(/\$10\.00/)).toBeInTheDocument();
    expect(screen.getByText(/month/i)).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText(/Current period ends:/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Your subscription will be canceled/i),
    ).not.toBeInTheDocument();
  });

  it('should display cancel notice if cancelAtPeriodEnd is true', () => {
    renderCurrentSubscriptionCard({
      subscription: buildUserSubscription({ cancel_at_period_end: true }),
    });
    expect(
      screen.getByText(/Your subscription will be canceled/i),
    ).toBeInTheDocument();
  });

  it('should call handleManageSubscription when Manage Billing button is clicked', () => {
    renderCurrentSubscriptionCard();
    const button = screen.getByRole('button', { name: /Manage Billing/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockHandleManageSubscription).toHaveBeenCalledTimes(1);
  });

  it('should show and call handleCancelSubscription when Cancel button is clicked (if active and not canceling)', () => {
    renderCurrentSubscriptionCard();
    const button = screen.getByRole('button', { name: /Cancel Subscription/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockHandleCancelSubscription).toHaveBeenCalledTimes(1);
  });

  it('should hide Cancel button if status is not active', () => {
    renderCurrentSubscriptionCard({
      subscription: buildUserSubscription({ status: 'past_due' }),
    });
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
  });

  it('should hide Cancel button if cancelAtPeriodEnd is true', () => {
    renderCurrentSubscriptionCard({
      subscription: buildUserSubscription({ cancel_at_period_end: true }),
    });
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
  });

  it('should disable buttons when isProcessing is true', () => {
    const { rerender } = renderCurrentSubscriptionCard({ isProcessing: false });
    expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Cancel Subscription/i }),
    ).toBeEnabled();

    rerender(
      <CurrentSubscriptionCard
        {...buildCurrentSubscriptionCardProps({ isProcessing: true })}
      />,
    );

    const processingButtons = screen.getAllByRole('button', {
      name: /Processing.../i,
    });
    expect(processingButtons.length).toBe(2);
    processingButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });

    expect(
      screen.queryByRole('button', { name: /Manage Billing/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
  });

  it('should not render cancel button if cancelAtPeriodEnd is true', () => {
    renderCurrentSubscriptionCard({
      subscription: buildUserSubscription({ cancel_at_period_end: true }),
    });
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
  });

  it('trialing status uses non-success yellow styling not green', () => {
    renderCurrentSubscriptionCard({
      subscription: buildUserSubscription({ status: 'trialing' }),
    });
    const status = screen.getByTestId('subscription-status');
    expect(status).toHaveClass('text-yellow-600');
    expect(status).not.toHaveClass('text-green-600');
    expect(status).toHaveTextContent(/trialing/i);
  });

  it('trialing status does not show Cancel Subscription button', () => {
    renderCurrentSubscriptionCard({
      subscription: buildUserSubscription({ status: 'trialing' }),
    });
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Manage Billing/i }),
    ).toBeInTheDocument();
  });
});
