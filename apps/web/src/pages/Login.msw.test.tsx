import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { LoginPage } from './Login';
// Keep original import name
import { useAuthStore } from '@paynless/store'; 
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../../../../packages/api-client/src/setupTests'; 
import { http, HttpResponse } from 'msw';
import type { AuthResponse } from '@paynless/types';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate };
})

// REMOVE top-level mock for the store module
// vi.mock('@paynless/store', () => ({
//   useAuthStore: vi.fn(),
//   useSubscriptionStore: vi.fn(), 
// }));

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

const API_BASE_URL = 'http://localhost/api'; 

// --- Test Suite --- 
describe('LoginPage MSW Integration', () => {

  // No need to get actions here anymore if spyOn works as planned
  // const actualStoreActions = useAuthStore.getState();

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks(); // Use restoreAllMocks with spyOn
  });

  beforeEach(async () => { // Make beforeEach async
     // Get actual actions before spying/mocking implementation
     const actualStoreState = useAuthStore.getState();
     
     // Dynamically import the module to spy on
     const storeModule = await import('@paynless/store');
     vi.spyOn(storeModule, 'useAuthStore').mockImplementation((selector) => {
        const state = {
            // Initial state for tests:
             user: null,
             session: null,
             profile: null,
             isLoading: false,
             error: null,
             // Provide actual actions from the real store state:
             setUser: actualStoreState.setUser,
             setSession: actualStoreState.setSession,
             setProfile: actualStoreState.setProfile,
             setIsLoading: actualStoreState.setIsLoading,
             setError: actualStoreState.setError,
             login: actualStoreState.login,
             register: actualStoreState.register,
             logout: actualStoreState.logout,
             initialize: actualStoreState.initialize,
             refreshSession: actualStoreState.refreshSession,
             updateProfile: actualStoreState.updateProfile,
        };
        // Need to handle the case where the component uses the hook without a selector
        return selector ? selector(state) : state;
     });
  });

  it('should log in successfully and redirect on valid credentials', async () => {
    server.use(
      http.post(`${API_BASE_URL}/login`, async () => {
        const mockResponse: AuthResponse = {
          user: { id: 'user-123', email: 'test@example.com', created_at: 'date' },
          session: { access_token: 'jwt-token', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'user-123' } },
          profile: { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user', created_at: 'date', updatedAt: 'date' },
        };
        return HttpResponse.json(mockResponse, { status: 200 });
      })
    );
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    });
    await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard'); 
    });
    expect(useAuthStore.getState().user?.id).toBe('user-123'); // Check real store state
  });

  it('should display error message on invalid credentials (401)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/login`, () => {
        return HttpResponse.json({ message: 'Invalid login credentials' }, { status: 401 });
      })
    );
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Invalid login credentials/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('should display generic error message on server error (500)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/login`, () => {
        return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 });
      })
    );
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    });
    await waitFor(() => {
        expect(screen.getByText(/Failed to login/i)).toBeInTheDocument(); 
    });
     expect(mockNavigate).not.toHaveBeenCalled();
     expect(useAuthStore.getState().user).toBeNull();
  });

}); 