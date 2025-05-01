import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@/tests/utils';
import { HomePage } from '../../pages/Home';
import { useAuthStore, useAiStore } from '@paynless/store';
import React from 'react';
import { useTheme } from '../../hooks/useTheme';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Mock react-router-dom Link
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual, // Spread actual exports
    Link: ({ to, children, ...props }: { to: string, children: React.ReactNode }) => 
      <a href={to} data-testid={`link-${to}`} {...props}>{children}</a>,
    useNavigate: () => vi.fn(), // <<< Add mock useNavigate
  };
});

// vi.mock('@paynless/store', () => ({ // <<< REMOVE Top-level mock
//   useAuthStore: vi.fn(),
// }));

// +++ Mock the entire store module +++
const mockAiState = {
  loadAiConfig: vi.fn(),
  sendMessage: vi.fn(),
  startNewChat: vi.fn(),
  availableProviders: [],
  currentChatMessages: [], 
  currentChatId: null,     
  isLoadingAiResponse: false, 
  aiError: null,           
  clearAiError: vi.fn(),     
};

vi.mock('@paynless/store', async (importOriginal) => {
  const actualStore = await importOriginal<typeof import('@paynless/store')>();

  // Mock useAiStore to handle selectors
  const mockUseAiStore = (selector?: (state: typeof mockAiState) => any) => {
    if (selector) {
      return selector(mockAiState);
    }
    return mockAiState; // Return full state if no selector
  };

  return {
    ...actualStore,
    useAuthStore: vi.fn(), // Define actual mock in beforeEach
    useAiStore: mockUseAiStore,
  };
});
// +++ End store module mock +++

// <<< ADD Mock for useTheme hook >>>
// vi.mock('../../hooks/useTheme'); // <<< REMOVE Simple mock
// <<< ADD Mock factory for useTheme >>>
vi.mock('../../hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    colorMode: 'light', // Provide default values
    toggleColorMode: vi.fn(), 
    isDarkMode: false,
    isLightMode: true,
  })),
}));

// --- Test Suite ---
describe('HomePage Component', () => {
  // Define mocked hooks here to reference them easily
  let mockedUseAuthStore: ReturnType<typeof vi.fn>;
  let aiStoreActions: typeof mockAiState;

  beforeEach(() => {
    vi.resetAllMocks();
    
    // Get the mocked store functions AFTER mocks are set
    const storeMocks = vi.mocked(require('@paynless/store'));
    mockedUseAuthStore = storeMocks.useAuthStore;
    // Set default auth state (logged out)
    mockedUseAuthStore.mockReturnValue({ user: null, session: null });

    // Get AI store actions for potential clearing/assertions
    // Note: useAiStore() without selector returns the full state object
    aiStoreActions = storeMocks.useAiStore(); 
    // Clear any previous calls (optional, good practice)
    Object.values(aiStoreActions).forEach(mockFn => {
      if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
        mockFn.mockClear();
      }
    });

    // Setup Theme mock
    vi.mocked(useTheme).mockReturnValue({
      colorMode: 'light', 
      toggleColorMode: vi.fn(), 
      isDarkMode: false,
      isLightMode: true,
    });
  });
  
  // afterEach(() => {
  //   vi.doUnmock('react-router-dom');
  //   vi.doUnmock('@paynless/store'); // <<< ADD Unmock
  // });

  it('should render main heading, description, and features', () => {
    // Auth mock is set in the main beforeEach
    render(<HomePage />);
    
    // Check that AI store actions were called on mount
    expect(aiStoreActions.loadAiConfig).toHaveBeenCalled();
    expect(aiStoreActions.startNewChat).toHaveBeenCalled();

    expect(screen.getByText(/Welcome to the/i)).toBeInTheDocument();
    expect(screen.getByText(/Paynless Framework/i)).toBeInTheDocument();
    // expect(screen.getByText(/A modern application built with React/i)).toBeInTheDocument(); // <<< Text updated in component
    expect(screen.getByText(/Get your app up and running in seconds/i)).toBeInTheDocument();
    
    // Check feature titles
    // expect(screen.getByText(/API-First Design/i)).toBeInTheDocument(); // <<< Text updated in component
    expect(screen.getByText(/Multi-Platform API/i)).toBeInTheDocument(); 
    expect(screen.getByText(/Supabase Backend/i)).toBeInTheDocument();
    expect(screen.getByText(/Secure Authentication/i)).toBeInTheDocument();
    expect(screen.getByText(/Stripe Integration/i)).toBeInTheDocument(); // <<< Added feature
  });

  describe('When user is logged out', () => {
    // No specific beforeEach needed here, main one sets logged out state

    it('should render "Get Started" link', () => {
      render(<HomePage />);
      const getStartedLink = screen.getByTestId('link-/register');
      
      expect(getStartedLink).toBeInTheDocument();
      expect(getStartedLink).toHaveAttribute('href', '/register');
      expect(getStartedLink).toHaveTextContent(/Get Started/i);
    });

    it('should NOT render "Go to Dashboard" link', () => {
      render(<HomePage />);
      expect(screen.queryByTestId('link-/dashboard')).not.toBeInTheDocument();
    });
  });

  describe('When user is logged in', () => {
    beforeEach(() => {
      // Override the auth store mock for this suite
      mockedUseAuthStore.mockReturnValue({ 
        user: { id: 'user-123' } as any, 
        session: { access_token: 'token' } as any 
      });
    });

    it('should render "Go to Dashboard" link', () => {
      render(<HomePage />);
      const dashboardLink = screen.getByTestId('link-/dashboard');
      
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
      expect(dashboardLink).toHaveTextContent(/Go to Dashboard/i);
    });

    it('should NOT render "Get Started" and "Log In" links', () => {
      render(<HomePage />);
      expect(screen.queryByTestId('link-/register')).not.toBeInTheDocument();
      expect(screen.queryByTestId('link-/login')).not.toBeInTheDocument(); // <<< Log in link removed
    });
  });
}); 