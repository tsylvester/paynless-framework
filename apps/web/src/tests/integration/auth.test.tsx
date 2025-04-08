import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../../App';
import { createMockAuthStore } from '../../test-utils/mocks/stores/authStore';

describe('Auth Integration Tests', () => {
  it('should handle successful login', async () => {
    // Setup
    const mockStore = createMockAuthStore();
    mockStore.getState().login.mockResolvedValueOnce({
      user: { email: 'test@example.com' },
      session: { access_token: 'token' },
    });

    // Render
    render(<App />, {
      initialAuthState: mockStore.getState(),
    });

    // Test
    await waitFor(() => {
      expect(mockStore.getState().login).toHaveBeenCalled();
      expect(screen.getByText('Welcome, test@example.com')).toBeInTheDocument();
    });
  });

  it('should handle invalid credentials', async () => {
    // Setup
    const mockStore = createMockAuthStore();
    mockStore.getState().login.mockRejectedValueOnce(new Error('Invalid credentials'));

    // Render
    render(<App />, {
      initialAuthState: mockStore.getState(),
    });

    // Test
    await waitFor(() => {
      expect(mockStore.getState().login).toHaveBeenCalled();
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('should handle server error', async () => {
    // Setup
    const mockStore = createMockAuthStore();
    mockStore.getState().login.mockRejectedValueOnce(new Error('Server error'));

    // Render
    render(<App />, {
      initialAuthState: mockStore.getState(),
    });

    // Test
    await waitFor(() => {
      expect(mockStore.getState().login).toHaveBeenCalled();
      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
    });
  });
}); 