import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { SubscriptionPage } from './Subscription';
import { useAuthStore } from '@paynless/store';
import { useSubscriptionStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../../../../packages/api-client/src/setupTests'; // Adjust path
import { http, HttpResponse } from 'msw';
import type { SubscriptionPlan, UserSubscription, User, ProfileResponse } from '@paynless/types';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div> };
})
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return { ...actual }; // Use real store
});
vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

const API_BASE_URL = 'http://localhost/api'; // Adjust as needed

// Mock Data
const mockUser: User = { id: 'user-msw-123', email: 'msw@example.com', created_at: 'date' };
const mockPlansData: SubscriptionPlan[] = [
  { id: 'msw_basic', stripePriceId: 'price_msw_basic', name: 'MSW Basic', amount: 500, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date', description: { subtitle: 'Basic', features: [] }, metadata: null, stripeProductId: 'prod_msw_basic' },
  { id: 'msw_pro', stripePriceId: 'price_msw_pro', name: 'MSW Pro', amount: 1500, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date', description: { subtitle: 'Pro', features: [] }, metadata: null, stripeProductId: 'prod_msw_pro' }
];

// --- Test Suite --- 
describe('SubscriptionPage MSW Integration', () => {

  afterEach(() => { server.resetHandlers(); vi.clearAllMocks(); });
  beforeEach(() => {
     // Reset store state
     vi.mocked(useAuthStore).setState({ user: mockUser, session: { access_token: 'msw-token' }, profile: null, isLoading: false, error: null });
     vi.mocked(useSubscriptionStore).setState({ userSubscription: null, availablePlans: [], isSubscriptionLoading: false, hasActiveSubscription: false, isTestMode: false, error: null });
     
     // Mock profile fetch potentially triggered by store init
     server.use(http.get(`${API_BASE_URL}/profile`, () => HttpResponse.json({ user: mockUser, profile: null }, { status: 200 })));
  });

  it('should load and display subscription plans from API', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api-subscriptions/plans`, () => {
        return HttpResponse.json(mockPlansData, { status: 200 });
      })
    );
    
    // Mock current subscription endpoint (assume none for this test)
     server.use(
        http.get(`${API_BASE_URL}/api-subscriptions/current`, () => {
            return HttpResponse.json(null, { status: 404 }); // Simulate no active subscription
        })
    );

    // The component might load plans on mount via the store's loadSubscriptionData
    renderWithProviders(<SubscriptionPage onSubscribe={vi.fn()} />); 

    // Wait for plans to be loaded and rendered
    await waitFor(() => {
      expect(screen.getByText('MSW Basic')).toBeInTheDocument();
      expect(screen.getByText('MSW Pro')).toBeInTheDocument();
    });
    // Verify subscribe buttons are present
    expect(screen.getAllByRole('button', { name: /Subscribe/i })).toHaveLength(2);
  });
  
    it('should display current subscription details loaded from API', async () => {
    const mockCurrentSub: UserSubscription = { 
        id: 'sub-msw-basic', userId: mockUser.id, status: 'active', plan: mockPlansData[0], 
        stripeSubscriptionId: 'stripe_msw_basic', stripeCustomerId: 'cus_msw', 
        currentPeriodStart: 'date', currentPeriodEnd: 'date', cancelAtPeriodEnd: false, createdAt: 'date', updatedAt: 'date'
    };
    server.use(
      http.get(`${API_BASE_URL}/api-subscriptions/plans`, () => HttpResponse.json(mockPlansData, { status: 200 })),
      http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(mockCurrentSub, { status: 200 }))
    );

    renderWithProviders(<SubscriptionPage onSubscribe={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Current Subscription/i)).toBeInTheDocument();
      expect(screen.getByText(/MSW Basic/i)).toBeInTheDocument(); // Active plan name
      expect(screen.getByRole('button', { name: /Manage Billing/i })).toBeInTheDocument();
    });
    // Verify button texts on PlanCards have updated
     await waitFor(() => {
        const basicPlanCard = screen.getByText('MSW Basic').closest('div.border');
        const proPlanCard = screen.getByText('MSW Pro').closest('div.border');
        expect(within(basicPlanCard!).getByRole('button', { name: /Current Plan/i })).toBeDisabled();
        expect(within(proPlanCard!).getByRole('button', { name: /Change Plan/i })).toBeEnabled();
    });
  });

  it('should handle create checkout session API success', async () => {
    const checkoutSessionId = 'cs_msw_12345';
    server.use(
      http.get(`${API_BASE_URL}/api-subscriptions/plans`, () => HttpResponse.json(mockPlansData, { status: 200 })),
      http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(null, { status: 404 })),
      http.post(`${API_BASE_URL}/api-subscriptions/checkout`, async () => {
          return HttpResponse.json({ sessionId: checkoutSessionId }, { status: 200 });
      })
    );
    const mockSubscribeProp = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
    
    // Wait for plans to load
    await waitFor(() => { expect(screen.getByText('MSW Pro')).toBeInTheDocument(); });
    const proPlanCard = screen.getByText('MSW Pro').closest('div.border');
    const subscribeButton = within(proPlanCard!).getByRole('button', { name: /Subscribe/i });

    // Store original window.location
    const originalLocation = window.location;
    // @ts-ignore // Mock window.location.href assignment
    delete window.location;
    window.location = { assign: vi.fn(), href: '' } as any;

    await act(async () => {
        await fireEvent.click(subscribeButton);
    });
    
    // The mock onSubscribe prop should be called by SubscriptionPage
    // This prop is responsible for the platform-specific checkout (e.g., redirect)
    expect(mockSubscribeProp).toHaveBeenCalledTimes(1);
    expect(mockSubscribeProp).toHaveBeenCalledWith(mockPlansData[1].stripePriceId);
    
     // Restore window.location
     window.location = originalLocation;
  });

    it('should display error message on create checkout API failure', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api-subscriptions/plans`, () => HttpResponse.json(mockPlansData, { status: 200 })),
      http.get(`${API_BASE_URL}/api-subscriptions/current`, () => HttpResponse.json(null, { status: 404 })),
      http.post(`${API_BASE_URL}/api-subscriptions/checkout`, async () => {
          return HttpResponse.json({ message: 'Checkout failed' }, { status: 500 });
      })
    );
    // Mock the onSubscribe prop to simulate the error boundary
    const mockSubscribeProp = vi.fn().mockRejectedValue(new Error('Checkout failed'));

    renderWithProviders(<SubscriptionPage onSubscribe={mockSubscribeProp} />);
    
    await waitFor(() => { expect(screen.getByText('MSW Pro')).toBeInTheDocument(); });
    const proPlanCard = screen.getByText('MSW Pro').closest('div.border');
    const subscribeButton = within(proPlanCard!).getByRole('button', { name: /Subscribe/i });

    await act(async () => {
        await fireEvent.click(subscribeButton);
    });

    // Check for error message displayed by SubscriptionPage
    await waitFor(() => {
      expect(screen.getByText(/Checkout failed/i)).toBeInTheDocument();
    });
  });

}); 