import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth, AuthContext } from '../src/context/AuthContext';
import SignIn from '../src/components/auth/SignIn';
import SignUp from '../src/components/auth/SignUp';
import SignOut from '../src/components/auth/SignOut';
import Home from '../src/pages/Home';

// Mock Supabase service
vi.mock('../src/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

// Mock logger
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockUser = {
  id: '123',
  email: 'test@example.com',
  created_at: '2023-01-01',
  updated_at: '2023-01-01',
};

const mockSession = {
  access_token: 'test-token',
  refresh_token: 'refresh-token',
  expires_at: 9999999999,
  user: mockUser,
};

// Test component to easily access auth context
const TestAuthConsumer = () => {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="user-email">{auth.user?.email || 'No user'}</div>
      <div data-testid="loading">{auth.isLoading ? 'Loading' : 'Not loading'}</div>
      <div data-testid="error">{auth.error?.message || 'No error'}</div>
      <button data-testid="sign-in" onClick={() => auth.signIn('test@example.com', 'password')}>
        Sign In
      </button>
      <button data-testid="sign-up" onClick={() => auth.signUp('test@example.com', 'password')}>
        Sign Up
      </button>
      <button data-testid="sign-out" onClick={() => auth.signOut()}>
        Sign Out
      </button>
    </div>
  );
};

describe('Auth Components', () => {
  // Reset mocks between tests
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mock Auth Context for individual component tests
  const mockAuthContext = {
    user: null,
    session: null,
    isLoading: false,
    error: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
  };

  describe('SignIn Component', () => {
    it('renders correctly', () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <SignIn onToggleForm={() => {}} />
        </AuthContext.Provider>
      );
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('calls signIn when form is submitted', async () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <SignIn onToggleForm={() => {}} />
        </AuthContext.Provider>
      );
      
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      });
      
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      });
      
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(mockAuthContext.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('displays error message when sign in fails', async () => {
      const errorMock = { ...mockAuthContext, signIn: vi.fn().mockRejectedValue(new Error('Invalid credentials')) };
      
      render(
        <AuthContext.Provider value={errorMock}>
          <SignIn onToggleForm={() => {}} />
        </AuthContext.Provider>
      );
      
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      });
      
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      });
      
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });
  });

  describe('SignUp Component', () => {
    it('renders correctly', () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <SignUp onToggleForm={() => {}} />
        </AuthContext.Provider>
      );
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
    });

    it('validates passwords match', async () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <SignUp onToggleForm={() => {}} />
        </AuthContext.Provider>
      );
      
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      });
      
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'password123' },
      });
      
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'mismatch' },
      });
      
      fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
      
      // SignUp function should not be called when passwords don't match
      expect(mockAuthContext.signUp).not.toHaveBeenCalled();
    });

    it('calls signUp when form is submitted correctly', async () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <SignUp onToggleForm={() => {}} />
        </AuthContext.Provider>
      );
      
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      });
      
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'password123' },
      });
      
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'password123' },
      });
      
      fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
      
      await waitFor(() => {
        expect(mockAuthContext.signUp).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });
  });

  describe('SignOut Component', () => {
    it('renders nothing when user is null', () => {
      const { container } = render(
        <AuthContext.Provider value={mockAuthContext}>
          <SignOut />
        </AuthContext.Provider>
      );
      
      expect(container).toBeEmptyDOMElement();
    });

    it('renders sign out button when user exists', () => {
      const loggedInMock = {
        ...mockAuthContext,
        user: mockUser,
      };
      
      render(
        <AuthContext.Provider value={loggedInMock}>
          <SignOut />
        </AuthContext.Provider>
      );
      
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
      expect(screen.getByText(mockUser.email)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });

    it('calls signOut when button is clicked', async () => {
      const loggedInMock = {
        ...mockAuthContext,
        user: mockUser,
        signOut: vi.fn(),
      };
      
      render(
        <AuthContext.Provider value={loggedInMock}>
          <SignOut />
        </AuthContext.Provider>
      );
      
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      
      await waitFor(() => {
        expect(loggedInMock.signOut).toHaveBeenCalled();
      });
    });
  });

  describe('Home Page', () => {
    it('shows loading state', () => {
      const loadingMock = {
        ...mockAuthContext,
        isLoading: true,
      };
      
      render(
        <AuthContext.Provider value={loadingMock}>
          <Home />
        </AuthContext.Provider>
      );
      
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('shows sign in form when user is not logged in', () => {
      render(
        <AuthContext.Provider value={mockAuthContext}>
          <Home />
        </AuthContext.Provider>
      );
      
      expect(screen.getByText(/sign in/i)).toBeInTheDocument();
      expect(screen.queryByText(/sign out/i)).not.toBeInTheDocument();
    });

    it('shows welcome message and sign out button when user is logged in', () => {
      const loggedInMock = {
        ...mockAuthContext,
        user: mockUser,
      };
      
      render(
        <AuthContext.Provider value={loggedInMock}>
          <Home />
        </AuthContext.Provider>
      );
      
      expect(screen.getByText(/welcome/i)).toBeInTheDocument();
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });
  });
});