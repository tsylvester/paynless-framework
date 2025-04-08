import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../context/theme.context';

// FIX: Import and initialize apiClient BEFORE other imports that might use it
import { initializeApiClient, api } from '@paynless/api-client';
initializeApiClient({
  baseUrl: 'http://test.host/functions/v1', // Match real app path structure
  supabaseAnonKey: 'test-anon-key' 
});

import { AppContent } from '../App';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { Dashboard } from '../pages/Dashboard'; // Target for successful login/register

import { useAuthStore } from '@paynless/store';
import { AuthResponse, UserRole } from '@paynless/types';

// Mock data matching store expectations
const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };
const mockSession = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 };
const mockProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };

// --- MSW Handlers ---
const handlers = [
  http.post('http://test.host/functions/v1/login', async ({ request }) => {
    console.log('[MSW Login Handler] Intercepted URL:', request.url);
    const { email } = await request.json() as { email: string };
    if (email === 'test@example.com') {
      const response: AuthResponse = { user: mockUser, session: mockSession, profile: mockProfile };
      return HttpResponse.json(response);
    }
    return new HttpResponse(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });
  }),

  http.post('http://test.host/functions/v1/register', async ({ request }) => {
    const { email } = await request.json() as { email: string };
    if (email === 'new@example.com') {
      const response: AuthResponse = { user: { ...mockUser, email }, session: mockSession, profile: null }; 
      return HttpResponse.json(response);
    }
    // Simulate email exists using the user from login tests
    if (email === 'test@example.com') {
        return new HttpResponse(JSON.stringify({ message: 'Email already exists' }), { status: 400 });
    }
    // Generic fallback for other emails in register test
    return new HttpResponse(JSON.stringify({ message: 'Registration failed unexpectedly' }), { status: 500 });
  }),

  http.get('http://test.host/functions/v1/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (authHeader === `Bearer ${mockSession.access_token}`) {
       return HttpResponse.json({ user: mockUser, profile: mockProfile });
    }
    return new HttpResponse('Unauthorized', { status: 401 });
  })
];

const server = setupServer(...handlers);

// FIX: Create a query client instance for tests
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Disable retries for tests
    },
  },
});

// Helper function to render with necessary providers
const renderWithProviders = (ui: React.ReactElement, { route = '/' } = {}) => {
  window.history.pushState({}, 'Test page', route)

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={[route]}>
            {children}
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    ),
  })
}

// Setup MSW server and reset stores
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  // Clear query cache between tests
  queryClient.clear(); 
});
afterAll(() => server.close());

// --- Test Suite ---
describe('Authentication Integration Tests (MSW)', () => {

  describe('Login Flow', () => {
    it('should log in successfully, fetch profile, and redirect to dashboard', async () => {
      renderWithProviders(<AppContent />, { route: '/login' });

      // Check initial state (Login page is rendered)
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();

      // Fill and submit form
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for redirection to dashboard (or check for dashboard content)
      // Since authStore handles navigation internally, we expect the dashboard content to appear
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
      });

      // Verify store state (optional but good)
      const authState = useAuthStore.getState();
      expect(authState.user?.email).toBe('test@example.com');
      expect(authState.profile?.first_name).toBe('Test');
    });

    it('should display error message for invalid credentials', async () => {
      renderWithProviders(<AppContent />, { route: '/login' });

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'wrong@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      // Wait for error message to appear
      await waitFor(() => {
        expect(screen.getByTestId('login-error-message')).toHaveTextContent('Invalid credentials');
      });

      // Ensure no redirection happened
      expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    });

    it('should display generic error message for server error', async () => {
      // Override handler for this test
      server.use(
        http.post('http://test.host/functions/v1/login', () => {
          return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
        })
      );

      renderWithProviders(<AppContent />, { route: '/login' });

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        // Check for a generic error message derived from the status text or a default
        expect(screen.getByTestId('login-error-message')).toHaveTextContent(/error|failed/i);
      });
      expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
    });
  });

  describe('Register Flow', () => {
    it('should register successfully, fetch profile, and redirect to dashboard', async () => {
      renderWithProviders(<AppContent />, { route: '/register' });

      // Check initial state (Register page is rendered)
      expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();

      // Fill and submit form
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'newpassword' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Wait for redirection to dashboard
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
      });

      // Verify store state
      const authState = useAuthStore.getState();
      expect(authState.user?.email).toBe('new@example.com');
      // Profile might be null initially after register, depending on store logic
      // Check if initialize/profile fetch happens automatically
      await waitFor(() => {
        expect(useAuthStore.getState().profile?.first_name).toBe('Test');
      });
    });

    it('should display error message if email already exists', async () => {
      renderWithProviders(<AppContent />, { route: '/register' });

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } }); // Use an email mocked to exist
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByTestId('register-error-message')).toHaveTextContent('Email already exists');
      });
      expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();
    });

    it('should display generic error message for server error', async () => {
      server.use(
        http.post('http://test.host/functions/v1/register', () => {
          return new HttpResponse(null, { status: 500, statusText: 'Registration Failed' });
        })
      );

      renderWithProviders(<AppContent />, { route: '/register' });

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'another@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByTestId('register-error-message')).toHaveTextContent(/error|failed/i);
      });
      expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
    });
  });

}); 