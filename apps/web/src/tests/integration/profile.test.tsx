import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../../App';
import { createMockAuthStore } from '../utils/mocks/stores/authStore';

describe('Profile Integration Tests', () => {
  it('should load profile data', async () => {
    // Setup
    const mockStore = createMockAuthStore({
      user: { email: 'test@example.com' },
      session: { access_token: 'token' },
    });

    // Render
    render(<App />, {
      initialAuthState: mockStore.getState(),
      initialRoute: '/profile',
    });

    // Test
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });

  it('should handle profile update', async () => {
    // Setup
    const mockStore = createMockAuthStore({
      user: { email: 'test@example.com' },
      session: { access_token: 'token' },
    });
    mockStore.getState().updateProfile.mockResolvedValueOnce(true);

    // Render
    render(<App />, {
      initialAuthState: mockStore.getState(),
      initialRoute: '/profile',
    });

    // Test
    await waitFor(() => {
      expect(mockStore.getState().updateProfile).toHaveBeenCalled();
      expect(screen.getByText('Profile updated successfully')).toBeInTheDocument();
    });
  });

  it('should handle profile update error', async () => {
    // Setup
    const mockStore = createMockAuthStore({
      user: { email: 'test@example.com' },
      session: { access_token: 'token' },
    });
    mockStore.getState().updateProfile.mockRejectedValueOnce(new Error('Update failed'));

    // Render
    render(<App />, {
      initialAuthState: mockStore.getState(),
      initialRoute: '/profile',
    });

    // Test
    await waitFor(() => {
      expect(mockStore.getState().updateProfile).toHaveBeenCalled();
      expect(screen.getByText('Failed to update profile')).toBeInTheDocument();
    });
  });
}); 