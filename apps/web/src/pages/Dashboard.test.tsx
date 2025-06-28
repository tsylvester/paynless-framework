import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './Dashboard';
import { useAuthStore, useWalletStore } from '@paynless/store';
import type { User, UserProfile, TokenWallet } from '@paynless/types';

// --- Mocks ---
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
    Link: ({ to, children }: { to: string, children: React.ReactNode }) => <a href={to}>{children}</a>,
  };
});

vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
  useWalletStore: vi.fn(),
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
};

const mockWallet: TokenWallet = {
    walletId: 'wallet-123',
    balance: 100000,
    ownerId: 'user-abc',
    walletType: 'personal',
    lastTransactionDate: new Date().toISOString(),
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
    expect(screen.getByRole('heading', { name: /Account Summary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Recent Activity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Quick Actions/i })).toBeInTheDocument();
  });

  describe('Display Role Logic', () => {
    it('should display profile role if available', () => {
      renderWithRouter(<DashboardPage />);
      expect(screen.getByText(/Role: admin/i)).toBeInTheDocument();
    });

    it('should display default role "user" if profile and user roles are missing', () => {
      const profileWithoutRole = { ...mockProfile, role: null };
      vi.mocked(useAuthStore).mockReturnValue({ user: { ...mockUser, role: undefined }, profile: profileWithoutRole, isLoading: false });
      renderWithRouter(<DashboardPage />);
      expect(screen.getByText(/Role: user/i)).toBeInTheDocument();
    });
  });

  it('should render account summary details correctly', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByText(/User ID: user-abc/i)).toBeInTheDocument();
    expect(screen.getByText(/Email: test@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Role: admin/i)).toBeInTheDocument();
    expect(screen.getByText(/Created: \d{1,2}\/\d{1,2}\/\d{4}/i)).toBeInTheDocument();
  });

  it('should render the WalletSelector and CreateDialecticProjectForm', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByTestId('wallet-selector')).toBeInTheDocument();
    expect(screen.getByText(/tokens remaining/i)).toBeInTheDocument();
    expect(screen.getByTestId('create-dialectic-form')).toBeInTheDocument();
  });
}); 