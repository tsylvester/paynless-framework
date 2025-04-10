import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPage } from './Dashboard';
import { useAuthStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { User, UserProfile } from '@paynless/types';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">Redirecting to {to}</div>,
  }
})

vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
}));

// Mock User/Profile Data
const mockUser: User = {
  id: 'user-abc',
  email: 'test@example.com',
  created_at: new Date('2023-01-01T00:00:00Z').toISOString(),
  // Add other User fields if necessary, potentially role/first_name if defined in User type
};

const mockProfile: UserProfile = {
  id: 'user-abc',
  first_name: 'Testy',
  last_name: 'McTest',
  role: 'admin',
  created_at: new Date('2023-01-01T00:00:00Z').toISOString(),
  updated_at: new Date('2023-01-02T00:00:00Z').toISOString(),
};

// Helper to render with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

// --- Test Suite ---
describe('DashboardPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: Loaded, user & profile exist
    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      isLoading: false,
    });
  });

  it('should render loading spinner if isLoading is true', () => {
    vi.mocked(useAuthStore).mockReturnValue({ isLoading: true, user: null, profile: null });
    renderWithRouter(<DashboardPage />);
    expect(screen.getByTestId('layout').querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('should redirect to /login if user is not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({ user: null, profile: null, isLoading: false });
    renderWithRouter(<DashboardPage />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('Redirecting to /login');
  });

  it('should render dashboard title and card titles', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByRole('heading', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Account Summary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Recent Activity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Quick Actions/i })).toBeInTheDocument();
  });

  describe('Display Name Logic', () => {
    it('should display profile first name if available', () => {
      renderWithRouter(<DashboardPage />);
      expect(screen.getByRole('heading', { name: /Welcome back, Testy/i })).toBeInTheDocument();
    });

    it('should display user email if profile name is missing', () => {
      const profileWithoutName = { ...mockProfile, first_name: null };
      vi.mocked(useAuthStore).mockReturnValue({ user: mockUser, profile: profileWithoutName, isLoading: false });
      renderWithRouter(<DashboardPage />);
      expect(screen.getByRole('heading', { name: /Welcome back, test@example.com/i })).toBeInTheDocument();
    });

    // Add test for user.first_name if that field exists on the User type
    // it('should display user first name if profile name is missing', () => { ... });
  });

  describe('Display Role Logic', () => {
    it('should display profile role if available', () => {
      renderWithRouter(<DashboardPage />);
      expect(screen.getByText(/Role: admin/i)).toBeInTheDocument();
    });

    it('should display default role "user" if profile and user roles are missing', () => {
      const profileWithoutRole = { ...mockProfile, role: null };
      // Assuming mockUser doesn't have a role property either
      vi.mocked(useAuthStore).mockReturnValue({ user: mockUser, profile: profileWithoutRole, isLoading: false });
      renderWithRouter(<DashboardPage />);
      expect(screen.getByText(/Role: user/i)).toBeInTheDocument();
    });

    // Add test for user.role if that field exists on the User type
    // it('should display user role if profile role is missing', () => { ... });
  });

  it('should render account summary details correctly', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByText(/User ID: user-abc/i)).toBeInTheDocument();
    expect(screen.getByText(/Email: test@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Role: admin/i)).toBeInTheDocument(); // Based on default mock
    // Use a more flexible date regex to account for timezone variations
    expect(screen.getByText(/Created: \d{1,2}\/\d{1,2}\/\d{4}/i)).toBeInTheDocument(); 
  });
}); 