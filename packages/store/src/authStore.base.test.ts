import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore'; 
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole } from '@paynless/types';
import { logger } from '@paynless/utils'; 

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  useAuthStore.setState({ ...initialState, navigate: null }, true);
};

// Mock data for API responses
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 }; 
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };

// Mock the logger to prevent console noise during tests
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock navigate function
const mockNavigate = vi.fn(); // Keep this defined even if not used directly in this file, setup might rely on it

describe('AuthStore - Base State and Setters', () => {
  beforeEach(() => {
    act(() => {
      resetStore();
      // No need to inject mockNavigate here as setters don't use it
    });
    // Clear mocks between tests
    vi.clearAllMocks();
    // Restore any spies
    vi.restoreAllMocks();
  });

  it('should have correct initial state', () => {
    // Reset without mock injection for initial state check
    act(() => { resetStore(); });
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.isLoading).toBe(true); // Starts true until initialize
    expect(state.error).toBeNull();
    expect(state.navigate).toBeNull(); // Check initial navigate state
  });

  // --- Test Direct Setters ---
  it('setUser should update user state', () => {
    act(() => {
      useAuthStore.getState().setUser(mockUser);
    });
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('setSession should update session state', () => {
    act(() => {
      useAuthStore.getState().setSession(mockSession);
    });
    expect(useAuthStore.getState().session).toEqual(mockSession);
  });

  it('setProfile should update profile state', () => {
    act(() => {
      useAuthStore.getState().setProfile(mockProfile);
    });
    expect(useAuthStore.getState().profile).toEqual(mockProfile);
  });

  it('setIsLoading should update isLoading state', () => {
    act(() => {
      useAuthStore.getState().setIsLoading(true);
    });
    expect(useAuthStore.getState().isLoading).toBe(true);
    act(() => {
      useAuthStore.getState().setIsLoading(false);
    });
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('setError should update error state', () => {
    const testError = new Error('Test Error');
    act(() => {
      useAuthStore.getState().setError(testError);
    });
    expect(useAuthStore.getState().error).toEqual(testError);
  });

  it('setNavigate should update navigate function', () => {
    const testNav = vi.fn();
    act(() => {
      useAuthStore.getState().setNavigate(testNav);
    });
    expect(useAuthStore.getState().navigate).toBe(testNav);
  });

  // --- Test clearError action ---
  describe('clearError action', () => {
        it('should set error state to null', () => {
            // Arrange
            useAuthStore.setState({ error: new Error('Test') });
            // Act
            act(() => { useAuthStore.getState().clearError(); });
            // Assert
            expect(useAuthStore.getState().error).toBeNull();
        });
   });
}); 