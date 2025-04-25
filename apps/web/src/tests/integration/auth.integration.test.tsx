import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';

// Use shared render function
import { render as customRender } from '../utils/render';
// Use shared MSW server instance (assuming setup in setup.ts or similar)
import { server } from '../mocks/server'; // Corrected Path
// Import shared react-router mock
import { mockNavigate } from '../utils/mocks/react-router.mock'; // Import the mock function
// Import components to test (Correct paths)
import { LoginPage } from '../../pages/Login';
import { RegisterPage } from '../../pages/Register';
// Import actual store
import { useAuthStore } from '@paynless/store';
// Import types
import type { AuthResponse } from '@paynless/types';

// Mock Layout? Probably not needed when testing pages directly
// vi.mock('../../components/layout/Layout', ...) // Path relative to this file

// API URL (Corrected Base URL) - <<< Use Environment Variable >>>
const supabaseUrlFromEnv = process.env.VITE_SUPABASE_URL;
if (!supabaseUrlFromEnv) {
  throw new Error('[Auth Tests] VITE_SUPABASE_URL environment variable not set.');
}
const API_BASE_URL = `${supabaseUrlFromEnv.replace(/\/$/, '')}/functions/v1`;
console.log(`[Auth Tests] Using API_BASE_URL for overrides: ${API_BASE_URL}`);

describe('Auth Integration Tests', () => {
  // --- Test Suite Completeness Tracking ---
  // [✅] Login Form - Success
  // [✅] Login Form - Invalid Credentials
  // [✅] Login Form - Server Error
  // [✅] Register Form - Success
  // [✅] Register Form - Email Exists Error
  // [✅] Register Form - Server Error
  // [ ] Logout - Button click clears state/redirects
  // [ ] Session Loading - Initial app load with existing session
  // [ ] Session Refresh - Handling token refresh scenarios (if applicable in UI)
  // [ ] Password Reset Flow (if applicable within authenticated app)

  // --- Test Setup ---
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear(); // Clear the shared mock
    act(() => {
        useAuthStore.setState(useAuthStore.getInitialState());
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  // --- Login Tests ---
  describe('Login Flow', () => {
      it('should log in successfully and navigate to dashboard on valid credentials', async () => {
        // Corrected path check (implicitly tested by successful call)
        customRender(<LoginPage />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } }); // Use correct password from handler

        const signInButton = screen.getByRole('button', { name: /sign in/i });
        expect(signInButton).not.toBeDisabled();

        await act(async () => {
          fireEvent.click(signInButton);
        });

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
        });

        await waitFor(() => {
            const state = useAuthStore.getState();
            expect(state.user?.email).toBe('test@example.com');
            // Check for session/profile based on handler response
            expect(state.session?.access_token).toBe('test-access-token');
            // expect(state.profile?.first_name).toBe('Test');
            expect(state.isLoading).toBe(false);
            expect(state.error).toBeNull();
        });
      });

      it('should display error message on invalid credentials (401)', async () => {
        // Corrected path check (implicitly tested by successful call)
        customRender(<LoginPage />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } }); // Use wrong password from handler

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
        });

        await waitFor(() => {
          // Match error message from handler/LoginForm
          expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
        });

        expect(mockNavigate).not.toHaveBeenCalled();
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.session).toBeNull();
      });

      it('should display generic error message on server error (500)', async () => {
        // Corrected path in override
        server.use(
          http.post(`${API_BASE_URL}/login`, () => {
             return HttpResponse.json({ message: 'Server exploded' }, { status: 500 });
          })
        );
        customRender(<LoginPage />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'any@example.com' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'anypassword' } });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
        });

        await waitFor(() => {
             expect(screen.getByText(/Failed to login. Please try again./i)).toBeInTheDocument(); // Adjust based on LoginForm
        });

         expect(mockNavigate).not.toHaveBeenCalled();
         const state = useAuthStore.getState();
         expect(state.user).toBeNull();
      });
  });

  // --- Register Tests ---
  describe('Register Flow', () => {
      it('should register successfully and navigate to dashboard', async () => {
        // Corrected path check (implicitly tested by successful call)
        customRender(<RegisterPage />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'newpassword123' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword123' } });

        const registerButton = screen.getByRole('button', { name: /register/i });
        expect(registerButton).not.toBeDisabled();

        await act(async () => {
          fireEvent.click(registerButton);
        });

        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
        });

        await waitFor(() => {
            const state = useAuthStore.getState();
            expect(state.user?.email).toBe('new@example.com');
            expect(state.session?.access_token).toBe('test-access-token');
            expect(state.isLoading).toBe(false);
            expect(state.error).toBeNull();
        });
      });

      it('should display error message if email already exists (400)', async () => {
        // Corrected path check (implicitly tested by successful call)
        customRender(<RegisterPage />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } }); // Email from handler
        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /register/i }));
        });

        await waitFor(() => {
          expect(screen.getByText(/Email already exists/i)).toBeInTheDocument(); // Match handler/RegisterForm message
        });
        expect(mockNavigate).not.toHaveBeenCalled();
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
      });

      it('should display generic error message on server error (500)', async () => {
        // Corrected path in override
        server.use(
          http.post(`${API_BASE_URL}/register`, () => {
            return HttpResponse.json({ message: 'Server exploded' }, { status: 500 });
          })
        );
        customRender(<RegisterPage />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'error@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /register/i }));
        });

        await waitFor(() => {
           expect(screen.getByText(/Failed to register. Please try again./i)).toBeInTheDocument(); // Adjust based on RegisterForm
        });
         expect(mockNavigate).not.toHaveBeenCalled();
         const state = useAuthStore.getState();
         expect(state.user).toBeNull();
      });
  });

  // --- Other Auth Tests (Placeholder) ---
  describe('Other Auth Flows', () => {
      it.todo('should handle logout');
      it.todo('should handle initial session loading');
  });

}); 