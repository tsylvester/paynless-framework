import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore'; // Assuming store is default export or named export
import { api } from '@paynless/api-client'; // Import the actual api object
import { act } from '@testing-library/react'; // Use act for state updates
import type { User, Session, UserProfile, UserProfileUpdate, AuthResponse, ProfileResponse, UserRole, ApiError as ApiErrorType, ApiResponse } from '@paynless/types';
import { logger } from '@paynless/utils'; // Import logger

// Helper to reset Zustand store state between tests
const resetStore = () => {
  // Important: Reset *must* include the navigate function reference
  // Otherwise subsequent tests might use a stale mock
  const initialState = useAuthStore.getInitialState();
  useAuthStore.setState({ ...initialState, navigate: null }, true);
};

// Mock data for API responses
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expires_at: Date.now() + 3600 * 1000 }; // FIX: Use expires_at from type
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };

// +++ Add missing mock data +++
const mockLoginData = {
  email: 'test@example.com',
  password: 'password123',
  user: mockUser,
  session: mockSession,
  profile: mockProfile // Assuming login might return profile
};

const mockRegisterData = {
  email: 'new@example.com',
  password: 'newpassword',
  user: { ...mockUser, id: 'user-new', email: 'new@example.com' }, // Slightly different user for register
  session: { ...mockSession, access_token: 'xyz', refresh_token: '123' } // Different tokens for register
};
// +++ End added mock data +++

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
const mockNavigate = vi.fn();

describe('AuthStore', () => {
  beforeEach(() => {
    act(() => {
      resetStore();
      // Inject the mock navigate function before relevant tests
      useAuthStore.getState().setNavigate(mockNavigate);
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

  // --- Test Refactored Async Actions ---

  describe('login action', () => {
    it('should update state, call navigate, and return user on success', async () => {
      const { email, password, user, session } = mockLoginData;
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { user, session, profile: mockProfile }, error: null });
      const navigate = vi.fn();
      useAuthStore.setState({ navigate });

      const result = await useAuthStore.getState().login(email, password);

      // Expect postSpy to be called with URL and body ONLY
      expect(postSpy).toHaveBeenCalledWith('/login', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(user);
      expect(state.session).toEqual(session);
      expect(state.profile).toEqual(mockProfile);
      expect(state.error).toBeNull();
      expect(result).toEqual(user);
      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('should set error state, clear user data, not navigate, and return null on API failure', async () => {
      const { email, password } = mockLoginData;
      const apiError = { message: 'Invalid credentials' };
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: null, error: apiError });
      const navigate = vi.fn();
      useAuthStore.setState({ navigate });
      useAuthStore.setState({ user: { id: 'old-user' } as any, session: { access_token: 'old_token' } as any }); // Pre-set user/session

      const result = await useAuthStore.getState().login(email, password);

      // Expect postSpy to be called with URL and body ONLY
      expect(postSpy).toHaveBeenCalledWith('/login', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull(); // User should be cleared
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message);
      expect(result).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    // --- NEW: Tests for Login Replay Logic ---
    describe('login action - replay logic', () => {
        let getItemSpy: ReturnType<typeof vi.spyOn>;
        let removeItemSpy: ReturnType<typeof vi.spyOn>;
        let apiPostSpy: ReturnType<typeof vi.spyOn>;
        let mockNavigate: ReturnType<typeof vi.fn>;

        const pendingActionData = {
            endpoint: '/chat',
            method: 'POST',
            body: { message: 'Stored message' },
            returnPath: '/chat/123'
        };
        const pendingActionJson = JSON.stringify(pendingActionData);

        beforeEach(() => {
            // Mock sessionStorage
            getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
            removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
            // Mock api.post (used for both login and replay in this test)
            apiPostSpy = vi.spyOn(api, 'post');
            // Mock navigate
            mockNavigate = vi.fn();
            useAuthStore.setState({ navigate: mockNavigate });

            // Mock successful login response by default
            apiPostSpy.mockResolvedValueOnce({ 
                data: { user: mockUser, session: mockSession, profile: mockProfile }, 
                error: null 
            });
        });

        it('should replay pending action, navigate to returnPath, and skip default nav on success', async () => {
            // Arrange
            getItemSpy.mockReturnValue(pendingActionJson);
            // Mock successful replay response
            apiPostSpy.mockResolvedValueOnce({ data: { success: true }, error: null });

            // Act
            await useAuthStore.getState().login(mockLoginData.email, mockLoginData.password);

            // Assert
            expect(getItemSpy).toHaveBeenCalledWith('pendingAction');
            expect(removeItemSpy).toHaveBeenCalledWith('pendingAction');
            // Check login call
            expect(apiPostSpy).toHaveBeenNthCalledWith(1, '/login', { email: mockLoginData.email, password: mockLoginData.password });
            // Check replay call
            expect(apiPostSpy).toHaveBeenNthCalledWith(2, 
                pendingActionData.endpoint, 
                pendingActionData.body, 
                { token: mockSession.access_token } 
            );
            expect(mockNavigate).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith(pendingActionData.returnPath);
        });

        it('should navigate to returnPath even if replay fails', async () => {
            // Arrange
            getItemSpy.mockReturnValue(pendingActionJson);
            // Mock failed replay response
            apiPostSpy.mockResolvedValueOnce({ data: null, error: { message: 'Replay failed' } });

            // Act
            await useAuthStore.getState().login(mockLoginData.email, mockLoginData.password);
            
            // Assert
            expect(removeItemSpy).toHaveBeenCalledWith('pendingAction');
            expect(apiPostSpy).toHaveBeenCalledTimes(2); // Login + Replay attempt
            expect(mockNavigate).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith(pendingActionData.returnPath);
            // Check logger was called with error (optional but good)
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error replaying pending action'), expect.any(Object));
        });

        it('should navigate to dashboard if pendingAction JSON is invalid', async () => {
             // Arrange
            getItemSpy.mockReturnValue('{invalid json'); // Invalid JSON

            // Act
            await useAuthStore.getState().login(mockLoginData.email, mockLoginData.password);

            // Assert
            expect(removeItemSpy).not.toHaveBeenCalled(); // Should not remove if parse fails
            expect(apiPostSpy).toHaveBeenCalledTimes(1); // Only login call
            expect(mockNavigate).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error processing pending action'), expect.any(Object));
        });

        it('should navigate to dashboard if no pendingAction exists', async () => {
            // Arrange
            getItemSpy.mockReturnValue(null); // No pending action

             // Act
            await useAuthStore.getState().login(mockLoginData.email, mockLoginData.password);

            // Assert
            expect(removeItemSpy).not.toHaveBeenCalled();
            expect(apiPostSpy).toHaveBeenCalledTimes(1); // Only login call
            expect(mockNavigate).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
        });
    });
    // --- End NEW Tests for Login Replay Logic ---
  });

  describe('register action', () => {
    it('should update state, call navigate, and return success object on success', async () => {
      const { email, password, user, session } = mockRegisterData;
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { user, session }, error: null });
      const navigate = vi.fn();
      useAuthStore.setState({ navigate });

      const result = await useAuthStore.getState().register(email, password);

      // Expect postSpy to be called with URL and body ONLY
      expect(postSpy).toHaveBeenCalledWith('/register', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(user);
      expect(state.session).toEqual(session);
      expect(state.profile).toBeNull(); // Profile not set immediately on register
      expect(state.error).toBeNull();
      expect(result).toEqual({ success: true, user: user, redirectTo: '/dashboard' });
      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('should set error state, not navigate, and return failure object on API failure', async () => {
      const { email, password } = mockRegisterData;
      const apiError = { message: 'Email already exists' };
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: null, error: apiError });
      const navigate = vi.fn();
      useAuthStore.setState({ navigate });
      useAuthStore.setState({ user: { id: 'old-user' } as any, session: { access_token: 'old_token' } as any }); // Pre-set user/session

      const result = await useAuthStore.getState().register(email, password);

      // Expect postSpy to be called with URL and body ONLY
      expect(postSpy).toHaveBeenCalledWith('/register', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull(); // User should be cleared on registration failure too
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message);
      expect(result).toEqual({ success: false, user: null, redirectTo: null });
      expect(navigate).not.toHaveBeenCalled();
    });

    // --- NEW: Tests for Register Replay Logic ---
    describe('register action - replay logic', () => {
      let getItemSpy: ReturnType<typeof vi.spyOn>;
      let removeItemSpy: ReturnType<typeof vi.spyOn>;
      let apiPostSpy: ReturnType<typeof vi.spyOn>; // Specific spy for post
      let apiGetSpy: ReturnType<typeof vi.spyOn>; // Specific spy for get (if testing GET replay)
      let mockNavigate: ReturnType<typeof vi.fn>;

      const pendingActionData = {
          endpoint: '/some/data', // Use a different endpoint for variety
          method: 'GET', 
          body: null, // GET request typically has no body
          returnPath: '/original/place'
      };
      const pendingActionJson = JSON.stringify(pendingActionData);

      beforeEach(() => {
          getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
          removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
          apiPostSpy = vi.spyOn(api, 'post'); // Spy for the /register call
          apiGetSpy = vi.spyOn(api, 'get'); // Spy for the GET replay call
          mockNavigate = vi.fn();
          useAuthStore.setState({ navigate: mockNavigate });

          // Mock successful registration response by default
          apiPostSpy.mockResolvedValueOnce({ 
              data: { user: mockRegisterData.user, session: mockRegisterData.session }, 
              error: null 
          });
      });

      it('should replay pending action (GET), navigate to returnPath, and update redirectTo', async () => {
          // Arrange
          getItemSpy.mockReturnValue(pendingActionJson);
          // Mock successful GET replay response
          apiGetSpy.mockResolvedValueOnce({ data: { result: 'ok' }, error: null });

          // Act
          const result = await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

          // Assert
          expect(getItemSpy).toHaveBeenCalledWith('pendingAction');
          expect(removeItemSpy).toHaveBeenCalledWith('pendingAction');
          // Check register call
          expect(apiPostSpy).toHaveBeenCalledWith('/register', { email: mockRegisterData.email, password: mockRegisterData.password });
          // Check replay call (GET)
          expect(apiGetSpy).toHaveBeenCalledWith(
              pendingActionData.endpoint, 
              { token: mockRegisterData.session.access_token }
          );
          expect(mockNavigate).toHaveBeenCalledTimes(1);
          expect(mockNavigate).toHaveBeenCalledWith(pendingActionData.returnPath);
          expect(result.redirectTo).toBe(pendingActionData.returnPath); // Check returned redirect path
      });

      it('should navigate to returnPath and update redirectTo even if replay fails', async () => {
          // Arrange
          getItemSpy.mockReturnValue(pendingActionJson);
          // Mock failed GET replay response
          apiGetSpy.mockResolvedValueOnce({ data: null, error: { message: 'Replay GET failed' } });

          // Act
          const result = await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);
          
          // Assert
          expect(removeItemSpy).toHaveBeenCalledWith('pendingAction');
          expect(apiPostSpy).toHaveBeenCalledTimes(1); // Register call
          expect(apiGetSpy).toHaveBeenCalledTimes(1); // Replay attempt (GET)
          expect(mockNavigate).toHaveBeenCalledTimes(1);
          expect(mockNavigate).toHaveBeenCalledWith(pendingActionData.returnPath);
          expect(result.redirectTo).toBe(pendingActionData.returnPath);
          expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error replaying pending action'), expect.any(Object));
      });

      it('should navigate to dashboard and return dashboard redirectTo if JSON is invalid', async () => {
           // Arrange
          getItemSpy.mockReturnValue('invalid json');

          // Act
          const result = await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

          // Assert
          expect(removeItemSpy).not.toHaveBeenCalled();
          expect(apiPostSpy).toHaveBeenCalledTimes(1); // Only register call
          expect(apiGetSpy).not.toHaveBeenCalled(); // No replay call
          expect(mockNavigate).toHaveBeenCalledTimes(1);
          expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
          expect(result.redirectTo).toBe('/dashboard');
          expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error processing pending action'), expect.any(Object));
      });

      it('should navigate to dashboard and return dashboard redirectTo if no pendingAction', async () => {
          // Arrange
          getItemSpy.mockReturnValue(null);

           // Act
          const result = await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

          // Assert
          expect(removeItemSpy).not.toHaveBeenCalled();
          expect(apiPostSpy).toHaveBeenCalledTimes(1); // Only register call
          expect(apiGetSpy).not.toHaveBeenCalled(); // No replay call
          expect(mockNavigate).toHaveBeenCalledTimes(1);
          expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
          expect(result.redirectTo).toBe('/dashboard');
      });
    });
    // --- End NEW Tests for Register Replay Logic ---
  });

  describe('updateProfile action', () => {
    const profileUpdates: UserProfileUpdate = { first_name: 'Updated', last_name: 'Name' };
    const updatedProfileResponse: UserProfile = { ...mockProfile, ...profileUpdates };
    // FIX: Mock the ApiResponse structure
    const successResponse: ApiResponse<UserProfile> = { data: updatedProfileResponse, error: null };

    beforeEach(() => {
      // Ensure user is 'logged in' for profile update tests
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile); // Set initial profile
      });
    });

    it('should call api.put, update profile state, and return true on success', async () => {
      // Use vi.spyOn
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(successResponse);

      let success: boolean = false;
      await act(async () => {
        success = await useAuthStore.getState().updateProfile(profileUpdates);
      });

      expect(putSpy).toHaveBeenCalledOnce();
      // FIX: Endpoint corrected in store already, verify call args
      expect(putSpy).toHaveBeenCalledWith('profile', profileUpdates, { token: mockSession.access_token });

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.profile).toEqual(updatedProfileResponse);
      expect(state.error).toBeNull();
      expect(success).toBe(true);
    });

    it('should set error state, not update profile, and return false on failure', async () => {
      const apiError = { message: 'Failed to update profile', code: 'UPDATE_FAILED' };
      // FIX: Mock the ApiResponse structure for error
      const errorResponse: ApiResponse<UserProfile> = { data: null, error: apiError as ApiErrorType };
      // Use vi.spyOn
      const putSpy = vi.spyOn(api, 'put').mockResolvedValue(errorResponse);

      let success: boolean = true;
      await act(async () => {
        success = await useAuthStore.getState().updateProfile(profileUpdates);
      });

      expect(putSpy).toHaveBeenCalledOnce();

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.profile).toEqual(mockProfile); // Should not change
      // FIX: Check for the error message or code
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message);
      expect(success).toBe(false);
    });

    it('should return false and set error if not authenticated', async () => {
       // Reset auth state to simulate not logged in
       act(() => {
         useAuthStore.getState().setUser(null);
         useAuthStore.getState().setSession(null);
         useAuthStore.getState().setProfile(mockProfile); // Keep profile to test auth check first
       });
       const putSpy = vi.spyOn(api, 'put'); // Spy but don't mock resolved value

       let success: boolean = true;
       await act(async () => {
           success = await useAuthStore.getState().updateProfile(profileUpdates);
       });

        expect(putSpy).not.toHaveBeenCalled(); // API should not be called
        expect(success).toBe(false);
        // FIX: Check for the specific error message set by the action
        expect(useAuthStore.getState().error?.message).toContain('Not authenticated');
     });

    it('should return false and set error if profile not loaded', async () => {
        // Logged in but profile is null
        act(() => {
            useAuthStore.getState().setUser(mockUser);
            useAuthStore.getState().setSession(mockSession);
            useAuthStore.getState().setProfile(null);
        });
        const putSpy = vi.spyOn(api, 'put');

        let success: boolean = true;
        await act(async () => {
            success = await useAuthStore.getState().updateProfile(profileUpdates);
        });

        expect(putSpy).not.toHaveBeenCalled();
        expect(success).toBe(false);
        // FIX: Check for the specific error message set by the action
        expect(useAuthStore.getState().error?.message).toContain('Profile not loaded');
     });

    // --- NEW: Test for updateProfile when not authenticated ---
    it('should not call API and return false if user is not authenticated', async () => {
        // Arrange: Ensure user is logged out
        act(() => {
            resetStore(); // This clears user/session
            useAuthStore.getState().setIsLoading(false); // Simulate initialized state
        });
        const putSpy = vi.spyOn(api, 'put');

        // Act
        let success: boolean = true;
        await act(async () => {
            success = await useAuthStore.getState().updateProfile(profileUpdates);
        });

        // Assert
        expect(putSpy).not.toHaveBeenCalled();
        expect(success).toBe(false);
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeInstanceOf(Error); // Should set an auth error
        expect(state.error?.message).toContain('Not authenticated');
        expect(state.profile).toBeNull(); // Profile should remain null
    });
    // --- End NEW test ---
  });

  // --- NEW: Tests for logout action ---
  describe('logout action', () => {
    it('should call api.post and clear state when logged in', async () => {
      // Arrange
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile);
      });
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: {}, error: null }); // Mock successful logout

      // Act
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      // Assert
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/logout', {}, { token: mockSession.access_token });
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should still clear state even if api.post fails', async () => {
      // Arrange
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
      });
      const postSpy = vi.spyOn(api, 'post').mockRejectedValue(new Error('Logout API failed'));

      // Act
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      // Assert
      expect(postSpy).toHaveBeenCalledTimes(1);
      const state = useAuthStore.getState();
      expect(state.user).toBeNull(); // State should still clear
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull(); // Logout doesn't set error state on API fail
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Logout error caught in store'), expect.any(Object));
    });

    it('should clear state and not call api.post when logged out (no token)', async () => {
      // Arrange: Ensure state is logged out (default after resetStore)
      const postSpy = vi.spyOn(api, 'post');

      // Act
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      // Assert
      expect(postSpy).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Logout called but no session token found'));
    });
  });
  // --- End NEW tests for logout action ---

  // --- NEW: Tests for initialize action ---
  describe('initialize action', () => {
    it('should fetch user/profile and set state if valid token exists', async () => {
        // Arrange: Pre-set session in the store (simulating persisted state)
        act(() => {
            useAuthStore.getState().setSession(mockSession);
            useAuthStore.getState().setIsLoading(true); // Ensure loading starts true
        });
        const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ 
            data: { user: mockUser, profile: mockProfile, session: mockSession }, // Simulate /me response
            error: null 
        });

        // Act
        await act(async () => {
            await useAuthStore.getState().initialize();
        });

        // Assert
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(getSpy).toHaveBeenCalledWith('me', { token: mockSession.access_token });
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toEqual(mockUser);
        expect(state.profile).toEqual(mockProfile);
        expect(state.session).toEqual(mockSession); // Session should remain
        expect(state.error).toBeNull();
    });

    it('should clear state and set error if /me API call fails', async () => {
        // Arrange
        act(() => {
            useAuthStore.getState().setSession(mockSession);
            useAuthStore.getState().setIsLoading(true);
        });
        const apiError = { message: 'Session invalid' };
        const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: null, error: apiError });

        // Act
        await act(async () => {
            await useAuthStore.getState().initialize();
        });

        // Assert
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(getSpy).toHaveBeenCalledWith('me', { token: mockSession.access_token });
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.session).toBeNull();
        expect(state.profile).toBeNull();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain(apiError.message);
    });

    it('should clear state and not call API if no token exists', async () => {
        // Arrange: Ensure no session is set (default after resetStore)
        act(() => {
             useAuthStore.getState().setIsLoading(true);
         });
        const getSpy = vi.spyOn(api, 'get');

        // Act
        await act(async () => {
            await useAuthStore.getState().initialize();
        });

        // Assert
        expect(getSpy).not.toHaveBeenCalled();
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.session).toBeNull();
        expect(state.profile).toBeNull();
        expect(state.error).toBeNull();
    });
  });
  // --- End NEW tests for initialize action ---

  // --- NEW: Tests for refreshSession action ---
  describe('refreshSession action', () => {
    // Interface defined locally for clarity if not imported
    interface RefreshResponse {
      session: Session | null;
      user: User | null;
      profile: UserProfile | null;
    }

    it('should call /refresh and update state on success', async () => {
        // Arrange: Set initial session with a refresh token
        const initialSession = { ...mockSession, refresh_token: 'valid-refresh-token' };
        act(() => {
            useAuthStore.getState().setSession(initialSession);
        });
        const newSession = { ...mockSession, access_token: 'new-access-token', expires_at: Date.now() + 7200 * 1000 };
        const refreshResponse: RefreshResponse = { session: newSession, user: mockUser, profile: mockProfile };
        const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: refreshResponse, error: null });

        // Act
        await act(async () => {
            await useAuthStore.getState().refreshSession();
        });

        // Assert
        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(postSpy).toHaveBeenCalledWith('refresh', {}, { headers: { 'Authorization': `Bearer ${initialSession.refresh_token}` } });
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.session).toEqual(newSession);
        expect(state.user).toEqual(mockUser);
        expect(state.profile).toEqual(mockProfile);
        expect(state.error).toBeNull();
    });

    it('should clear state and set error if /refresh API call fails', async () => {
        // Arrange
        const initialSession = { ...mockSession, refresh_token: 'valid-refresh-token' };
        act(() => {
            useAuthStore.getState().setSession(initialSession);
        });
        const apiError = { message: 'Refresh token invalid' };
        const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: null, error: apiError });

        // Act
        await act(async () => {
            await useAuthStore.getState().refreshSession();
        });

        // Assert
        expect(postSpy).toHaveBeenCalledTimes(1);
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.session).toBeNull();
        expect(state.profile).toBeNull();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain(apiError.message);
    });

    it('should set error and not call API if no refresh token exists', async () => {
        // Arrange: Ensure session has no refresh token
        const initialSession = { ...mockSession, refresh_token: undefined };
        act(() => {
            useAuthStore.getState().setSession(initialSession);
        });
        const postSpy = vi.spyOn(api, 'post');

        // Act
        await act(async () => {
            await useAuthStore.getState().refreshSession();
        });

        // Assert
        expect(postSpy).not.toHaveBeenCalled();
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false); // Should reset loading
        expect(state.user).toBeNull(); // State remains null from initial setup
        expect(state.session).toEqual(initialSession); // Session remains as it was
        expect(state.profile).toBeNull();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain('No refresh token available');
    });
  });
   // --- End NEW tests for refreshSession action ---
}); 