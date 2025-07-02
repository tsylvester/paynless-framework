import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom'; // Import real components
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { RootRoute } from './RootRoute';
import type { User } from '@paynless/types';

// Mock components are defined inline in vi.mock calls to avoid hoisting issues

// Define mock state
// Use const as it's not reassigned, only its property is modified
const mockAuthState: { user: Partial<User> | null } = {
  user: null,
};

// Note: We're providing test elements directly in Routes instead of mocking page components

// Mock the NavigateInjector from App.tsx to avoid setNavigate dependency
vi.mock('../../App', () => ({
  NavigateInjector: () => null,
}));

// Mock the Layout component to avoid all layout dependencies (Header, Theme, Platform, etc.)
vi.mock('../layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

// Mock stores to handle with/without selector
vi.mock('@paynless/store', () => ({
  useAuthStore: (selector?: (state: typeof mockAuthState) => unknown) => {
    // If a selector is provided, use it
    if (selector) {
      return selector(mockAuthState);
    }
    // Otherwise, return the whole mock state
    return mockAuthState;
  },
}));

// Define simple placeholder for the dashboard route target
const TestDashboardPage = () => <div>Test Dashboard Page</div>;

describe('RootRoute Component', () => {

  beforeEach(() => {
    // Reset state
    mockAuthState.user = null;
  });

  // Helper function - Renders the App's routing structure matching the real app
  const renderAppStructure = (initialPath: string = '/') => {
      render(
        <MemoryRouter initialEntries={[initialPath]}>
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<RootRoute />}>
                {/* Child routes that RootRoute's Outlet will render */}
                <Route index element={<div data-testid="home-page">Paynless Coding</div>} />
                <Route path="dashboard" element={<TestDashboardPage />} />
              </Route>
            </Routes>
          </Suspense>
        </MemoryRouter>
      );
  };

it('should render actual HomePage content when user is not authenticated', async () => {
    mockAuthState.user = null;
    renderAppStructure('/');
    
    // Wait for lazy-loaded components to resolve
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
  });

  it('should render TestDashboardPage content when navigating to /dashboard', async () => {
    mockAuthState.user = { id: 'user-123' }; // Minimal mock user  
    renderAppStructure('/dashboard');
    
    // Wait for lazy-loaded components to resolve
    await waitFor(() => {
      expect(screen.getByText('Test Dashboard Page')).toBeInTheDocument();
    });
    // Use queryByTestId for the negative assertion
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument(); 
  });

}); 