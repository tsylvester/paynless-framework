import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { RegisterPage } from './Register';
import { useAuthStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../../../../packages/api-client/src/setupTests'; // Adjust path
import { http, HttpResponse } from 'msw';
import type { AuthResponse } from '@paynless/types';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate };
})

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return { ...actual }; // Use real store
});

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

const API_BASE_URL = 'http://localhost/api'; // Adjust as needed

// --- Test Suite --- 
describe('RegisterPage MSW Integration', () => {

  afterEach(() => { server.resetHandlers(); vi.clearAllMocks(); });
  beforeEach(() => { /* Reset store state if needed */ })

  it('should register successfully and potentially redirect or update UI', async () => {
    server.use(
      http.post(`${API_BASE_URL}/register`, async () => {
        const mockResponse: Partial<AuthResponse> = { // Register might only return user/session
          user: { id: 'user-new', email: 'new@example.com', created_at: 'date' },
          session: { access_token: 'jwt-token-new', refresh_token: 'refresh-new', expires_in: 3600, token_type: 'bearer', user: { id: 'user-new' } },
          // Profile might be null initially after registration
        };
        return HttpResponse.json(mockResponse, { status: 200 }); // Or 201 Created
      })
    );

    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'newpassword123' } });
    // Assuming confirm password exists
    // fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /register/i }));
    });

    await waitFor(() => {
        // Check if registration form disappears or navigation happens
        expect(screen.queryByRole('button', { name: /register/i })).not.toBeInTheDocument();
        // expect(mockNavigate).toHaveBeenCalledWith('/dashboard'); // Or email confirmation page?
    });
  });

  it('should display error message if email already exists (409 Conflict)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/register`, () => {
        return HttpResponse.json({ message: 'User already registered' }, { status: 409 });
      })
    );

    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'existing@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /register/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/User already registered/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should display generic error message on server error (500)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/register`, () => {
        return HttpResponse.json({ message: 'Server exploded' }, { status: 500 });
      })
    );

    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /register/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to register/i)).toBeInTheDocument(); // Check for fallback message
    });
     expect(mockNavigate).not.toHaveBeenCalled();
  });

}); 