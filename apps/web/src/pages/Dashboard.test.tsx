import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './Dashboard.tsx';
import { useAuthStore, useWalletStore, useAiStore, useDialecticStore } from '@paynless/store';
import type { User, UserProfile, TokenWallet } from '@paynless/types';
import { selectDialecticProjects, selectIsLoadingProjects } from '@paynless/store';

// --- Mocks ---
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
    Link: React.forwardRef<HTMLAnchorElement, { to: string; children: React.ReactNode }>(
      ({ to, children, ...props }, ref) => (
        <a href={to} {...props} ref={ref}>
          {children}
        </a>
      ),
    ),
  };
});

vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useWalletStore: vi.fn(),
  useAiStore: vi.fn(),
  useDialecticStore: vi.fn(),
  selectDialecticProjects: vi.fn(),
  selectIsLoadingProjects: vi.fn(),
  selectActiveChatWalletInfo: vi.fn(),
}));

vi.mock('../components/dialectic/CreateDialecticProjectForm', () => ({
  CreateDialecticProjectForm: () => <div data-testid="create-dialectic-form" />,
}));

vi.mock('../components/ai/WalletSelector', () => ({
  WalletSelector: () => <div data-testid="wallet-selector" />,
}));


// Mock User/Profile/Wallet Data
const mockUser: User = {
  id: 'user-abc',
  email: 'test@example.com',
  created_at: new Date('2023-01-01T00:00:00Z').toISOString(),
};

const mockProfile: UserProfile = {
  id: 'user-abc',
  first_name: 'Testy',
  last_name: 'McTest',
  role: 'admin',
  created_at: new Date('2023-01-01T00:00:00Z').toISOString(),
  updated_at: new Date('2023-01-02T00:00:00Z').toISOString(),
  chat_context: {},
  has_seen_welcome_modal: false,
  is_subscribed_to_newsletter: false,
  last_selected_org_id: null,
  profile_privacy_setting: 'public',
};

const mockWallet: TokenWallet = {
    walletId: 'wallet-123',
    balance: '100000',
    userId: 'user-abc',
    currency: 'AI_TOKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
};

// Helper to render with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

// --- Test Suite ---
describe('DashboardPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: Loaded, user, profile, and wallet exist
    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      isLoading: false,
    });
    vi.mocked(useWalletStore).mockReturnValue({
      personalWallet: mockWallet,
      isLoadingPersonalWallet: false,
      personalWalletError: null,
      loadPersonalWallet: vi.fn(),
      activeChatWalletInfo: { balance: mockWallet.balance },
    });
    vi.mocked(useAiStore).mockReturnValue({
      chats: [],
      loadChatHistory: vi.fn(),
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => {
      if (selector === selectDialecticProjects) {
        return [];
      }
      if (selector === selectIsLoadingProjects) {
        return false;
      }
      return {
        fetchDialecticProjects: vi.fn(),
      };
    });
  });

  it('should render loading spinner if isLoading is true', () => {
    vi.mocked(useAuthStore).mockReturnValue({ isLoading: true, user: null, profile: null });
    renderWithRouter(<DashboardPage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should redirect to /login if user is not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: null, profile: null, isLoading: false });
    renderWithRouter(<DashboardPage />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /login');
  });

  it('should render dashboard card titles', () => {
    renderWithRouter(<DashboardPage />);
    const tokensCard = screen.getByText(/Tokens Remaining/i).closest('div[data-slot="card"]');
    const chatsCard = screen.getByText(/Active Chats/i).closest('div[data-slot="card"]');
    const projectsCardTitle = screen.getAllByText(/Projects/i).find(el => el.closest('div[data-slot="card-title"]'));
    expect(projectsCardTitle).toBeInTheDocument();
    const projectsCard = projectsCardTitle?.closest('div[data-slot="card"]');


    expect(tokensCard).toBeInTheDocument();
    expect(chatsCard).toBeInTheDocument();
    expect(projectsCard).toBeInTheDocument();
  });

  it('should render account summary details correctly', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByText(/Welcome back, Testy/i)).toBeInTheDocument();
    expect(screen.getByText(/Tokens Remaining/i)).toBeInTheDocument();
    expect(screen.getByText(/100,000/i)).toBeInTheDocument();
  });

  it('should render quick actions', () => {
    renderWithRouter(<DashboardPage />);
    const quickActionsCard = screen.getByText(/Quick Actions/i).closest('div[data-slot="card"]');
    expect(quickActionsCard).toBeInTheDocument();

    function isHTMLElement(element: Element | null): element is HTMLElement {
      return element instanceof HTMLElement;
    }

    if (isHTMLElement(quickActionsCard)) {
      const quickActions = within(quickActionsCard);
      expect(quickActions.getByText(/Start Chat/i)).toBeInTheDocument();
      expect(quickActions.getByText(/New Project/i)).toBeInTheDocument();
      expect(quickActions.getByText(/Organizations/i)).toBeInTheDocument();
      expect(quickActions.getByText(/Upgrade/i)).toBeInTheDocument();
    }
  });
}); 