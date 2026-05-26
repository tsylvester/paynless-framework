import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { ComponentProps } from 'react';
import { render, screen, within, act } from '@testing-library/react';
import { SubscriptionPage } from '../../pages/Subscription';
import { useAuthStore, useSubscriptionStore, useCartStore } from '@paynless/store';
import { CurrentSubscriptionCard } from './CurrentSubscriptionCard';
import {
  buildCurrentSubscriptionCardProps,
  mockHandleManageSubscription,
  mockHandleCancelSubscription,
} from './CurrentSubscriptionCard.mock';
import {
  buildUserSubscription,
  mockUserSubscriptionTrialing,
} from '../../mocks/userSubscription.mock';
import { buildSubscriptionPlan } from './PlanCard.mock';
import {
  getCurrentSubscriptionCard,
  installSubscriptionPageTestWindowLocation,
  renderSubscriptionPage,
  type SubscriptionPageTestWindowLocation,
} from '../../pages/Subscription.mock';
import {
  mockCancelSubscription,
  mockCreateBillingPortalSession,
  mockLoadSubscriptionData,
} from '../../mocks/subscriptionStore.mock';
import { initializeMockCartStore } from '../../../../../packages/store/src/cartStore/cartStore.mock';
import { mockUserProfile, mockUserTier } from '../../mocks/profile.mock';
import type { Session, SubscriptionPlan, User } from '@paynless/types';
import { Layout } from '../layout/Layout';
import { Navigate } from 'react-router-dom';

vi.mock('../layout/Layout', () => ({
  Layout: (props: ComponentProps<typeof Layout>) => (
    <div data-testid="layout">{props.children}</div>
  ),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: (props: ComponentProps<typeof Navigate>) => {
      const destination: string =
        typeof props.to === 'string' ? props.to : '/';
      return (
        <div data-testid="navigate">Redirecting to {destination}</div>
      );
    },
  };
});

vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const integrationTestUser: User = {
  id: 'user-123',
  email: 'user@example.com',
};

const integrationTestSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expiresAt: Date.now() + 3600000,
};

const integrationResolvedPlan: SubscriptionPlan = buildSubscriptionPlan({
  id: 'plan-integration-1',
  name: 'Integration Resolved Plan',
  stripe_price_id: 'price_integration',
  amount: 1500,
  currency: 'usd',
  interval: 'month',
  interval_count: 1,
  tier_level: 10,
});

describe('CurrentSubscriptionCard integration', () => {
  beforeEach(() => {
    mockHandleManageSubscription.mockClear();
    mockHandleCancelSubscription.mockClear();
  });

  it('validate builder → component: active status is green and cancel is visible', () => {
    const props = buildCurrentSubscriptionCardProps();
    render(<CurrentSubscriptionCard {...props} />);

    const status = screen.getByTestId('subscription-status');
    expect(status).toHaveClass('text-green-600');
    expect(status).not.toHaveClass('text-yellow-600');
    expect(status).toHaveTextContent(/active/i);
    expect(
      screen.getByRole('button', { name: /Cancel Subscription/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Manage Billing/i }),
    ).toBeInTheDocument();
  });

  it('validate builder → component: trialing status is yellow not green and cancel is hidden', () => {
    const props = buildCurrentSubscriptionCardProps({
      subscription: buildUserSubscription({ status: 'trialing' }),
    });
    render(<CurrentSubscriptionCard {...props} />);

    const status = screen.getByTestId('subscription-status');
    expect(status).toHaveClass('text-yellow-600');
    expect(status).not.toHaveClass('text-green-600');
    expect(status).toHaveTextContent(/trialing/i);
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Manage Billing/i }),
    ).toBeInTheDocument();
  });

  it('validate builder → component: past_due status is yellow not green and cancel is hidden', () => {
    const props = buildCurrentSubscriptionCardProps({
      subscription: buildUserSubscription({ status: 'past_due' }),
    });
    render(<CurrentSubscriptionCard {...props} />);

    const status = screen.getByTestId('subscription-status');
    expect(status).toHaveClass('text-yellow-600');
    expect(status).not.toHaveClass('text-green-600');
    expect(status).toHaveTextContent(/past_due/i);
    expect(
      screen.queryByRole('button', { name: /Cancel Subscription/i }),
    ).not.toBeInTheDocument();
  });
});

describe('CurrentSubscriptionCard provider integration', () => {
  let testWindowLocation: SubscriptionPageTestWindowLocation;

  beforeAll(() => {
    testWindowLocation = installSubscriptionPageTestWindowLocation();
    expect(SubscriptionPage).toBeDefined();
  });

  beforeEach(() => {
    testWindowLocation.href = '';
    vi.clearAllMocks();
    mockLoadSubscriptionData.mockReset();
    mockCreateBillingPortalSession.mockReset();
    mockCancelSubscription.mockReset();
    mockLoadSubscriptionData.mockResolvedValue(undefined);

    const cartStoreInitialState = initializeMockCartStore();

    act(() => {
      useAuthStore.setState(
        {
          user: integrationTestUser,
          profile: mockUserProfile,
          session: integrationTestSession,
          isLoading: false,
          error: null,
          userTier: mockUserTier,
        },
        true,
      );
      useSubscriptionStore.setState(
        {
          availablePlans: [integrationResolvedPlan],
          userSubscription: buildUserSubscription({
            status: 'active',
            plan_id: integrationResolvedPlan.id,
          }),
          isSubscriptionLoading: false,
          hasActiveSubscription: true,
          isTestMode: false,
          error: null,
          loadSubscriptionData: mockLoadSubscriptionData,
          createBillingPortalSession: mockCreateBillingPortalSession,
          cancelSubscription: mockCancelSubscription,
        },
      );
      useCartStore.setState(cartStoreInitialState, true);
    });
  });

  it('validate Subscription.tsx → CurrentSubscriptionCard: separate subscription row and resolved plan render', () => {
    renderSubscriptionPage();

    const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
    expect(
      within(currentSubCard).getByText(/Integration Resolved Plan/i),
    ).toBeInTheDocument();
    const status = within(currentSubCard).getByTestId('subscription-status');
    expect(status).toHaveClass('text-green-600');
    expect(
      within(currentSubCard).getByRole('button', { name: /Cancel Subscription/i }),
    ).toBeInTheDocument();
  });

  it('validate Subscription.tsx → CurrentSubscriptionCard: trialing row renders without cancel', () => {
    act(() => {
      useSubscriptionStore.setState(
        {
          userSubscription: {
            ...mockUserSubscriptionTrialing,
            plan_id: integrationResolvedPlan.id,
          },
          hasActiveSubscription: false,
        },
      );
    });
    renderSubscriptionPage();

    const currentSubCard: HTMLElement = getCurrentSubscriptionCard();
    const status = within(currentSubCard).getByTestId('subscription-status');
    expect(status).toHaveClass('text-yellow-600');
    expect(status).not.toHaveClass('text-green-600');
    expect(
      within(currentSubCard).queryByRole('button', {
        name: /Cancel Subscription/i,
      }),
    ).not.toBeInTheDocument();
  });
});
