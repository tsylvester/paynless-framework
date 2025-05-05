import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { SubscriptionPage } from '../../pages/Subscription';
import { useAuthStore, useSubscriptionStore } from '@paynless/store';
import { render as customRender } from '../../tests/utils/render';
import { server } from '../mocks/server';
import type { User, SubscriptionPlan, UserSubscription, ProfileResponse } from '@paynless/types';
import { http, HttpResponse } from 'msw';

// --- Mocks & Data ---
// Mock Layout and Navigate
vi.mock('../../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
  };
});

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// API URL (Corrected Base URL)
const API_BASE_URL = 'http://test.host/functions/v1';

// Mock User
const mockUser: User = { id: 'user-sub-int-123', email: 'subint@example.com', created_at: 'date' };

// Mock Plans
const mockPlansData: SubscriptionPlan[] = [
  { id: 'int_basic', stripePriceId: 'price_int_basic', name: 'Integration Basic', amount: 600, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date', description: { subtitle: 'Basic', features: ['Int A'] }, metadata: null, stripeProductId: 'prod_int_basic' },
  { id: 'int_pro', stripePriceId: 'price_int_pro', name: 'Integration Pro', amount: 1600, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date', description: { subtitle: 'Pro', features: ['Int A', 'Int B'] }, metadata: null, stripeProductId: 'prod_int_pro' },
];

// --- Test Suite: Subscription Integration Tests ---
describe('SubscriptionPage Integration Tests', () => {

  // --- Test Suite Completeness Tracking ---
  // [✅] Load and display plans from API
  // [✅] Load and display current subscription details from API
  // [✅] Handle create checkout session API success (via onSubscribe prop)
  // [✅] Handle create checkout session API failure (via onSubscribe prop)
  // [✅] Handle create billing portal session API success (store action + redirect)
  // [ ] Handle create billing portal session API failure
  // [✅] Handle cancel subscription API success (store action)
  // [ ] Handle cancel subscription API failure
  // [ ] Handle resume subscription API success (if applicable)
  // [ ] Handle resume subscription API failure (if applicable)
  // [ ] Test Mode UI indication
  // [ ] Display loading states
  // [ ] Display store error messages

  // --- Test Setup ---
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useAuthStore.setState({ ...useAuthStore.getInitialState(), user: mockUser, session: { access_token: 'int-token' } });
      useSubscriptionStore.setState(useSubscriptionStore.getInitialState());
    });
    // Default handlers
    server.use(
      http.get(`${API_BASE_URL}/me`, () => HttpResponse.json(mockUser, { status: 200 })),
      http.get(`${API_BASE_URL}/api-subscriptions/plans`, () => HttpResponse.json(mockPlansData, { status: 200 })),
      http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(null, { status: 404 }))
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  // --- Tests ---
  it('should load and display subscription plans from API', async () => {
      const mockSubscribeProp = vi.fn();
      customRender(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
      await waitFor(() => {
        expect(screen.getByText('Integration Basic')).toBeInTheDocument();
        expect(screen.getByText('Integration Pro')).toBeInTheDocument();
      });
      expect(screen.getAllByRole('button', { name: /Subscribe/i })).toHaveLength(2);
      expect(useSubscriptionStore.getState().availablePlans).toEqual(mockPlansData);
  });

  it('should load and display current subscription details from API', async () => {
      const mockCurrentSub: UserSubscription = {
          id: 'sub-int-pro', userId: mockUser.id, status: 'active', plan: mockPlansData[1],
          stripeSubscriptionId: 'stripe_int_pro', stripeCustomerId: 'cus_int',
          currentPeriodStart: 'date', currentPeriodEnd: 'date', cancelAtPeriodEnd: false, createdAt: 'date', updatedAt: 'date'
      };
      server.use(
          http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(mockCurrentSub, { status: 200 }))
      );
      const mockSubscribeProp = vi.fn();
      customRender(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
      await waitFor(() => {
        expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
        expect(screen.getByText(/Integration Pro/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeInTheDocument();
      });
       await waitFor(() => {
          const basicPlanCard = screen.getByText('Integration Basic').closest('div.border');
          const proPlanCard = screen.getByText('Integration Pro').closest('div.border');
          expect(within(basicPlanCard!).getByRole('button', { name: /Change Plan/i })).toBeEnabled();
          expect(within(proPlanCard!).getByRole('button', { name: /Current Plan/i })).toBeDisabled();
      });
      expect(useSubscriptionStore.getState().userSubscription).toEqual(mockCurrentSub);
      expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(true);
  });

  it('should call onSubscribe prop when checkout session is initiated', async () => {
      const mockSubscribeProp = vi.fn().mockResolvedValue(undefined);
      customRender(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
      await waitFor(() => { expect(screen.getByText('Integration Pro')).toBeInTheDocument(); });
      const proPlanCard = screen.getByText('Integration Pro').closest('div.border');
      const subscribeButton = within(proPlanCard!).getByRole('button', { name: /Subscribe/i });
      await act(async () => { await fireEvent.click(subscribeButton); });
      expect(mockSubscribeProp).toHaveBeenCalledTimes(1);
      expect(mockSubscribeProp).toHaveBeenCalledWith(mockPlansData[1].stripePriceId);
  });

  it('should display error message if onSubscribe prop fails/rejects', async () => {
      const checkoutError = new Error('Checkout process failed!');
      const mockSubscribeProp = vi.fn().mockRejectedValue(checkoutError);
      customRender(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
      await waitFor(() => { expect(screen.getByText('Integration Pro')).toBeInTheDocument(); });
      const proPlanCard = screen.getByText('Integration Pro').closest('div.border');
      const subscribeButton = within(proPlanCard!).getByRole('button', { name: /Subscribe/i });
      await act(async () => { await fireEvent.click(subscribeButton); });
      await waitFor(() => {
        expect(screen.getByText(checkoutError.message)).toBeInTheDocument();
      });
  });

  it('should call createBillingPortalSession store action and attempt redirect when Manage Billing is clicked', async () => {
      const mockPortalUrl = 'http://mock-portal-url';
      const mockPortalAction = vi.fn().mockResolvedValue(mockPortalUrl);
       vi.spyOn(useSubscriptionStore.getState(), 'createBillingPortalSession').mockImplementation(mockPortalAction);
      const mockCurrentSub: UserSubscription = { id: 'sub-active', userId: mockUser.id, status: 'active', plan: mockPlansData[1] };
      server.use(http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(mockCurrentSub, { status: 200 })));
      const originalLocation = window.location;
      // @ts-expect-error - Need to mock window.location.assign
      delete window.location;
      window.location = { assign: vi.fn() } as any;
      customRender(<SubscriptionPage onSubscribe={vi.fn()} />);
      await waitFor(() => { expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument(); });
      const manageButton = screen.getByRole('button', { name: /Manage Billing/i });
      await act(async () => { await fireEvent.click(manageButton); });
      expect(mockPortalAction).toHaveBeenCalledTimes(1);
       await waitFor(() => {
            expect(window.location.assign).toHaveBeenCalledWith(mockPortalUrl);
       });
      window.location = originalLocation;
  });

  it('should call cancelSubscription store action when Cancel Subscription is clicked', async () => {
        const mockCancelAction = vi.fn().mockResolvedValue(true);
        vi.spyOn(useSubscriptionStore.getState(), 'cancelSubscription').mockImplementation(mockCancelAction);
      const mockCurrentSub: UserSubscription = { id: 'sub-to-cancel', userId: mockUser.id, status: 'active', plan: mockPlansData[1], stripeSubscriptionId: 'stripe_sub_cancel' };
      server.use(http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(mockCurrentSub, { status: 200 })));
      customRender(<SubscriptionPage onSubscribe={vi.fn()} />);
      await waitFor(() => { expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument(); });
      const cancelButton = screen.getByRole('button', { name: /Cancel Subscription/i });
      await act(async () => { await fireEvent.click(cancelButton); });
      expect(mockCancelAction).toHaveBeenCalledTimes(1);
      expect(mockCancelAction).toHaveBeenCalledWith(mockCurrentSub.stripeSubscriptionId);
  });

}); 