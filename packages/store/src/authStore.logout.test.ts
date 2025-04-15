import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance, Mock } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils'; 

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
  // Preserve navigate fn during reset
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 }; 
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };

// Mock the logger 
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock navigate function (will be injected into store state)
const mockNavigateGlobal = vi.fn(); 

describe('AuthStore - Logout Action', () => {
  // Define spies at the describe level
  let postSpy: MockInstance;
  let logErrorSpy: MockInstance;
  let logWarnSpy: MockInstance;
  let localMockNavigate: Mock<[], void>; // Use local mock for navigation tests

  beforeEach(() => {
    resetStore();
    // Inject the mock navigate function before relevant tests
    localMockNavigate = vi.fn(); // Initialize local mock here
    useAuthStore.getState().setNavigate(localMockNavigate); // Inject it

    // Setup spies
    postSpy = vi.spyOn(api, 'post'); // Spy on post globally for tests if needed
    logErrorSpy = vi.spyOn(logger, 'error');
    logWarnSpy = vi.spyOn(logger, 'warn');
  });

  // ADD afterEach for cleanup
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

   it('should clear state, call api.post(/logout), and navigate to /login', async () => {
      // Arrange: Set some initial authenticated state
      useAuthStore.setState({
        user: mockUser,
        session: mockSession,
        profile: mockProfile,
        isLoading: false,
        error: new Error('previous error'),
      });
      // Configure the spy return value for this specific test if needed
      postSpy.mockResolvedValue({ data: { success: true }, error: undefined, status: 200 });

      // Act
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      // Assert
      expect(postSpy).toHaveBeenCalledWith('/logout', {}, { token: mockSession.access_token });
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false); 
      expect(state.error).toBeNull(); // Error should be cleared
      expect(useAuthStore.getState().navigate).toBe(localMockNavigate);
      expect(localMockNavigate).toHaveBeenCalledTimes(1);
      expect(localMockNavigate).toHaveBeenCalledWith('/login');
    });

    it('should clear state and navigate even if API call fails', async () => {
        // Arrange
        useAuthStore.setState({
            user: mockUser,
            session: mockSession,
        });
         const mockApiError: ApiError = { code: 'LOGOUT_FAILED', message: 'Logout failed' };
         postSpy.mockResolvedValue({ data: null, error: mockApiError, status: 500 });

         // Act
         await act(async () => {
            await useAuthStore.getState().logout();
         });

         // Assert
         expect(postSpy).toHaveBeenCalledWith('/logout', {}, { token: mockSession.access_token });
         const state = useAuthStore.getState();
         expect(state.user).toBeNull(); // State should still be cleared
         expect(state.session).toBeNull();
         expect(state.profile).toBeNull();
         expect(state.error).toBeNull(); // Should still clear local error state
         expect(localMockNavigate).toHaveBeenCalledTimes(1); // Navigation should still happen
         expect(localMockNavigate).toHaveBeenCalledWith('/login');

    });
    
     it('should clear state and navigate without calling API if no session exists', async () => {
        // Arrange: Ensure state is logged out (default after reset)
        useAuthStore.setState({ user: null, session: null /* navigate is set in beforeEach */ });
        // postSpy is already set up in beforeEach
        // const postSpy = vi.spyOn(api, 'post');
        // logWarnSpy is already set up in beforeEach
        // const logWarnSpy = vi.spyOn(logger, 'warn');

        // Act
        await act(async () => {
            await useAuthStore.getState().logout();
        });

        // Assert
        expect(postSpy).not.toHaveBeenCalled(); // API should not be called
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.session).toBeNull();
        expect(state.profile).toBeNull();
        expect(state.error).toBeNull(); 
        expect(logWarnSpy).toHaveBeenCalledWith('Logout called but no session token found. Clearing local state only.');
        expect(localMockNavigate).toHaveBeenCalledTimes(1); 
        expect(localMockNavigate).toHaveBeenCalledWith('/login');
    });
}); 