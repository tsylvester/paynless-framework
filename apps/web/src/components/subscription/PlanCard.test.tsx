import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanCard } from './PlanCard';
import type { PlanCardProps } from './PlanCard.interface';
import {
  buildPlanCardProps,
  buildSubscriptionPlan,
  createMockPlanCardCallbacks,
  mockSubscriptionPlan,
  mockOtpPlan,
  mockFreePlan,
  type PlanCardCallbacks,
  type PlanCardPropsOverrides,
} from './PlanCard.mock';

describe('PlanCard Component', () => {
  let callbacks: PlanCardCallbacks;

  beforeEach(() => {
    callbacks = createMockPlanCardCallbacks();
  });

  function renderPlanCard(overrides?: PlanCardPropsOverrides): void {
    const props: PlanCardProps = buildPlanCardProps({
      onSelect: callbacks.onSelect,
      onAdd: callbacks.onAdd,
      onDowngrade: callbacks.onDowngrade,
      ...overrides,
    });
    render(<PlanCard {...props} />);
  }

  it('should render basic plan details correctly', () => {
    renderPlanCard();

    expect(screen.getByRole('heading', { name: /Basic Plan/i })).toBeInTheDocument();
    expect(screen.getByText(/Good for starters/i)).toBeInTheDocument();
    expect(screen.getByText(/\$10\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\/month/i)).toBeInTheDocument();
  });

  it('should render features from description correctly', () => {
    renderPlanCard();

    expect(screen.getByText(/Feature 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Feature 2/i)).toBeInTheDocument();
  });

  it('should render fallback message when features are empty', () => {
    const planWithoutFeatures = buildSubscriptionPlan({
      description: { subtitle: 'No features here', features: [] },
    });
    renderPlanCard({ plan: planWithoutFeatures });

    expect(screen.getByText(/No specific features listed/i)).toBeInTheDocument();
  });

  it('should handle missing or invalid description structure gracefully', () => {
    const planWithInvalidDesc = buildSubscriptionPlan({ description: null });
    renderPlanCard({ plan: planWithInvalidDesc });

    expect(screen.getByRole('heading', { name: /Basic Plan/i })).toBeInTheDocument();
    expect(screen.getByText(/Basic Plan/i, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/No specific features listed/i)).toBeInTheDocument();
  });

  describe('Button Logic', () => {
    beforeEach(() => {
      callbacks.onSelect.mockClear();
      callbacks.onAdd.mockClear();
      callbacks.onDowngrade.mockClear();
    });

    it('should render "Current Plan" button (disabled) if isCurrentPlan is true', () => {
      renderPlanCard({ isCurrentPlan: true });

      const button = screen.getByRole('button', { name: /Current Plan/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('should render "Downgrade to Free" button if plan is free and not current', () => {
      renderPlanCard({
        plan: mockFreePlan,
        isCurrentPlan: false,
        userIsOnPaidPlan: true,
      });

      const button = screen.getByRole('button', { name: /Downgrade to Free/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(callbacks.onDowngrade).toHaveBeenCalledTimes(1);
      expect(callbacks.onSelect).not.toHaveBeenCalled();
      expect(callbacks.onAdd).not.toHaveBeenCalled();
    });

    it('should disable "Downgrade to Free" if user is not on a paid plan', () => {
      renderPlanCard({
        plan: mockFreePlan,
        isCurrentPlan: false,
        userIsOnPaidPlan: false,
      });

      const button = screen.getByRole('button', { name: /Downgrade to Free/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('should render "Select Plan" button for subscription plan not in cart', () => {
      renderPlanCard({ plan: mockSubscriptionPlan, isInCart: false });

      const button = screen.getByRole('button', { name: /Select Plan/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
      expect(callbacks.onSelect).toHaveBeenCalledWith(mockSubscriptionPlan);
      expect(callbacks.onAdd).not.toHaveBeenCalled();
      expect(callbacks.onDowngrade).not.toHaveBeenCalled();
    });

    it('should render "Selected" button for subscription plan in cart and call onSelect on click', () => {
      renderPlanCard({ plan: mockSubscriptionPlan, isInCart: true });

      const button = screen.getByRole('button', { name: /Selected/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
      expect(callbacks.onSelect).toHaveBeenCalledWith(mockSubscriptionPlan);
    });

    it('should apply cart-selected border styling when subscription plan is in cart', () => {
      renderPlanCard({ plan: mockSubscriptionPlan, isInCart: true, isCurrentPlan: false });

      const card = screen.getByTestId(`plan-card-${mockSubscriptionPlan.id}`);
      expect(card.className).toMatch(/ring-green-500/);
      expect(card.className).toMatch(/border-green-500/);
    });

    it('should render "Add to Cart" button for OTP plan not in cart', () => {
      renderPlanCard({ plan: mockOtpPlan, isInCart: false });

      const button = screen.getByRole('button', { name: /Add to Cart/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
      expect(callbacks.onAdd).toHaveBeenCalledWith(mockOtpPlan);
      expect(callbacks.onSelect).not.toHaveBeenCalled();
    });

    it('should render "In Cart" with quantity for OTP plan in cart', () => {
      renderPlanCard({ plan: mockOtpPlan, isInCart: true, cartQuantity: 2 });

      expect(screen.getByText(/In Cart/i)).toBeInTheDocument();
      expect(screen.getByText(/×2/)).toBeInTheDocument();
    });

    it('should call onAdd when OTP increment button is clicked', () => {
      renderPlanCard({ plan: mockOtpPlan, isInCart: true, cartQuantity: 2 });

      const incrementButton = screen.getByRole('button', { name: '+' });
      fireEvent.click(incrementButton);
      expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
      expect(callbacks.onAdd).toHaveBeenCalledWith(mockOtpPlan);
    });

    it('should disable OTP increment button when isProcessing is true', () => {
      renderPlanCard({
        plan: mockOtpPlan,
        isInCart: true,
        cartQuantity: 2,
        isProcessing: true,
      });

      const incrementButton = screen.getByRole('button', { name: '+' });
      expect(incrementButton).toBeDisabled();
    });

    it('should fall back to subscription behavior for unknown plan_type', () => {
      const unknownPlan = buildSubscriptionPlan({ plan_type: 'unknown_value' });
      renderPlanCard({ plan: unknownPlan, isInCart: false });

      const button = screen.getByRole('button', { name: /Select Plan/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
      expect(callbacks.onSelect).toHaveBeenCalledWith(unknownPlan);
    });

    it('should disable action buttons when isProcessing is true', () => {
      const { rerender } = render(
        <PlanCard
          {...buildPlanCardProps({
            onSelect: callbacks.onSelect,
            onAdd: callbacks.onAdd,
            onDowngrade: callbacks.onDowngrade,
            plan: mockSubscriptionPlan,
            isCurrentPlan: false,
            isProcessing: false,
            isInCart: false,
          })}
        />,
      );
      expect(screen.getByRole('button', { name: /Select Plan/i })).toBeEnabled();

      rerender(
        <PlanCard
          {...buildPlanCardProps({
            onSelect: callbacks.onSelect,
            onAdd: callbacks.onAdd,
            onDowngrade: callbacks.onDowngrade,
            plan: mockSubscriptionPlan,
            isCurrentPlan: false,
            isProcessing: true,
            isInCart: false,
          })}
        />,
      );
      const processingButton = screen.getByRole('button', { name: /Processing.../i });
      expect(processingButton).toBeInTheDocument();
      expect(processingButton).toBeDisabled();
      expect(screen.queryByRole('button', { name: /Select Plan/i })).not.toBeInTheDocument();

      const { rerender: rerenderFree, container: freePlanContainer } = render(
        <PlanCard
          {...buildPlanCardProps({
            onSelect: callbacks.onSelect,
            onAdd: callbacks.onAdd,
            onDowngrade: callbacks.onDowngrade,
            plan: mockFreePlan,
            isCurrentPlan: false,
            userIsOnPaidPlan: true,
            isProcessing: false,
          })}
        />,
      );
      expect(
        within(freePlanContainer).getByRole('button', { name: /Downgrade to Free/i }),
      ).toBeEnabled();

      rerenderFree(
        <PlanCard
          {...buildPlanCardProps({
            onSelect: callbacks.onSelect,
            onAdd: callbacks.onAdd,
            onDowngrade: callbacks.onDowngrade,
            plan: mockFreePlan,
            isCurrentPlan: false,
            userIsOnPaidPlan: true,
            isProcessing: true,
          })}
        />,
      );
      const downgradeProcessingButton = within(freePlanContainer).getByRole('button', {
        name: /Processing.../i,
      });
      expect(downgradeProcessingButton).toBeInTheDocument();
      expect(downgradeProcessingButton).toBeDisabled();
      expect(
        within(freePlanContainer).queryByRole('button', { name: /Downgrade to Free/i }),
      ).not.toBeInTheDocument();
    });
  });
});
