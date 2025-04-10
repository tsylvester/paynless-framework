import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom'; // Import real components
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RootRoute } from './RootRoute';
import type { User } from '@paynless/types';
// Import the REAL HomePage to test against when user is null
import { HomePage } from '../../pages/Home';

// Define mock state
let mockAuthState: { user: Partial<User> | null } = {
  user: null,
};

// Mock useAuthStore to handle with/without selector
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

  // Helper function - Renders the App's potential root structure
  const renderAppStructure = (initialPath: string = '/') => {
      render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                {/* RootRoute handles the '/' path internally deciding what to show */}
                <Route path="/" element={<RootRoute />} /> 
                {/* Define the target route for authenticated redirect */}
                <Route path="/dashboard" element={<TestDashboardPage />} />
                 {/* Define HomePage at its own route IF NEEDED for other tests, but RootRoute imports it directly */}
                 {/* <Route path="/home" element={<HomePage />} /> */}
            </Routes>
        </MemoryRouter>
      );
  };

it('should render actual HomePage content when user is not authenticated', () => {
    mockAuthState.user = null;
    renderAppStructure('/');
    
    // Use getByRole with accessible name for the heading
    expect(screen.getByRole('heading', { name: /welcome to the paynless framework/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('Test Dashboard Page')).not.toBeInTheDocument();
  });

  it('should render TestDashboardPage content when user is authenticated', () => {
    mockAuthState.user = { id: 'user-123' }; // Minimal mock user
    renderAppStructure('/');
    
    // Assert dashboard content is rendered
    expect(screen.getByText('Test Dashboard Page')).toBeInTheDocument();
    // Use queryByRole for the negative assertion
    expect(screen.queryByRole('heading', { name: /welcome to the paynless framework/i, level: 1 })).not.toBeInTheDocument(); 
  });

}); 