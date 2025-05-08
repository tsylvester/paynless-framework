import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@/tests/utils';
import { HomePage } from './Home';
// import { useAuthStore, useAiStore } from '@paynless/store'; // Keep commented if direct import not needed after spyOn
import * as PaynlessStore from '@paynless/store'; // Import the actual module for spyOn
import type {
  ThemeState, 
  Theme, 
  ColorMode, 
  AuthStore, // <<< IMPORT AuthStore type
  AiStore,   // <<< IMPORT AiStore type
  User,      // <<< IMPORT User type
  UserRole   // <<< IMPORT UserRole type
} from '@paynless/types'; // Import types from the correct package 
import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { createMockAuthStore, createMockAiStore } from '@/tests/utils/mocks/stores'; // Import mock creators

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Mock react-router-dom Link
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual, // Spread actual exports
    Link: ({ to, children, ...props }: { to: string, children: React.ReactNode }) => 
      <a href={to} data-testid={`link-${to}`} {...props}>{children}</a>,
    useNavigate: () => vi.fn(), 
  };
});

// // +++ REMOVE Simple mock for needed store hooks +++
// vi.mock('@paynless/store', () => ({
//   useAuthStore: vi.fn(), 
//   useAiStore: vi.fn(() => ({
//       loadAiConfig: vi.fn(),
//       sendMessage: vi.fn(),
//       startNewChat: vi.fn(),
//       availableProviders: [],
//       currentChatMessages: [], 
//       currentChatId: null,     
//       isLoadingAiResponse: false, 
//       aiError: null,           
//       clearAiError: vi.fn(),     
//   })),
// }));

// Mock useTheme hook
vi.mock('../../hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    // Provide a minimal valid ThemeState object
    currentTheme: { name: 'light', isDark: false, colors: {} } as Theme, // Provide a minimal theme object
    colorMode: 'light' as ColorMode, 
    setColorMode: vi.fn(), // Mock function
    setTheme: vi.fn(),     // Mock function
  } as ThemeState)), // Cast to ThemeState
}));

// --- Test Suite ---
describe('HomePage Component', () => {
  // Keep track of mock store instances
  let mockAuthStore: ReturnType<typeof createMockAuthStore>;
  let mockAiStore: ReturnType<typeof createMockAiStore>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Create mock store instances for this test run
    mockAuthStore = createMockAuthStore({ user: null }); // Default: logged out
    mockAiStore = createMockAiStore();

    // Spy on the actual store module and redirect hook calls to our mock instances
    // Handle selectors correctly with proper store types
    vi.spyOn(PaynlessStore, 'useAuthStore').mockImplementation(<S,>(selector?: (state: AuthStore) => S): S | AuthStore => {
      const state = mockAuthStore.getState();
      return selector ? selector(state) : state;
    });
    vi.spyOn(PaynlessStore, 'useAiStore').mockImplementation(<S,>(selector?: (state: AiStore) => S): S | AiStore => {
      const state = mockAiStore.getState();
      return selector ? selector(state) : state; // Apply selector if provided
    });
    
    // Setup Theme mock
    vi.mocked(useTheme).mockReturnValue({
        currentTheme: { name: 'light', isDark: false, colors: {} } as Theme,
        colorMode: 'light' as ColorMode,
        setColorMode: vi.fn(),
        setTheme: vi.fn(),
    });
  });
  
  afterEach(() => {
    // Restore original implementations
    vi.restoreAllMocks();
  });

  it('should render main heading, description, and features', () => {
    render(<HomePage />);
    
    // Check that AI store actions were called on mount
    // Actions are on the store instance now, not the hook return value
    expect(mockAiStore.getState().loadAiConfig).toHaveBeenCalled();
    expect(mockAiStore.getState().startNewChat).toHaveBeenCalled();

    expect(screen.getByText(/Welcome to the/i)).toBeInTheDocument();
    expect(screen.getByText(/Paynless Framework/i)).toBeInTheDocument();
    expect(screen.getByText(/Get your app up and running in seconds/i)).toBeInTheDocument();
    
    // Check feature titles
    expect(screen.getByText(/Multi-Platform API/i)).toBeInTheDocument(); 
    expect(screen.getByText(/Supabase Backend/i)).toBeInTheDocument();
    expect(screen.getByText(/Secure Authentication/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Stripe Integration/i })).toBeInTheDocument(); 
  });

  describe('When user is logged out', () => {
    // Auth store is already mocked as logged out in the main beforeEach

    it('should render "Get Started" link', () => {
      render(<HomePage />);
      const getStartedLink = screen.getByTestId('link-/register');
      
      expect(getStartedLink).toBeInTheDocument();
      expect(getStartedLink).toHaveAttribute('href', '/register');
      expect(getStartedLink).toHaveTextContent(/Get Started/i);
    });

    it('should NOT render "Go to Dashboard" link', () => {
      render(<HomePage />);
      expect(screen.queryByRole('link', { name: /Go to Dashboard/i })).not.toBeInTheDocument();
    });
  });

  describe('When user is logged in', () => {
    beforeEach(() => {
      // Override the auth store state for this suite by recreating the store
      const loggedInUser: User = {
          id: 'user-123',
          email: 'test@example.com',
          role: 'user' as UserRole, // Use a valid role
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
      }; 
      mockAuthStore = createMockAuthStore({
          user: loggedInUser,
          isAuthenticated: true, // Keep this if createMockAuthStore uses it
      });
      // Re-apply the spy for this specific instance (needs to handle selectors too)
      vi.spyOn(PaynlessStore, 'useAuthStore').mockImplementation(<S,>(selector?: (state: AuthStore) => S): S | AuthStore => {
        const state = mockAuthStore.getState();
        return selector ? selector(state) : state;
      });
      // AI store spy from outer beforeEach still applies
    });

    it('should render "Go to Dashboard" link', () => {
      render(<HomePage />);
      const dashboardLink = screen.getByRole('link', { name: /Go to Dashboard/i }); 
      
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });

    it('should NOT render "Get Started" and "Log In" links', () => {
      render(<HomePage />);
      expect(screen.queryByRole('link', { name: /Get Started/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Log In/i })).not.toBeInTheDocument();
    });
  });
}); 