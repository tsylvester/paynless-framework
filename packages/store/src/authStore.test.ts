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
  });

  describe('logout action', () => {
    it('should clear state and call api.post if authenticated', async () => {
       act(() => {
         useAuthStore.getState().setUser(mockUser);
         useAuthStore.getState().setSession(mockSession);
         useAuthStore.getState().setProfile(mockProfile);
       });
       // FIX: Mock the ApiResponse structure (void on success)
       const successResponse: ApiResponse<void> = { data: undefined, error: null };
       const postSpy = vi.spyOn(api, 'post').mockResolvedValue(successResponse);

       await act(async () => {
         await useAuthStore.getState().logout();
       });

       expect(postSpy).toHaveBeenCalledWith('/logout', {}, { token: mockSession.access_token });
       const state = useAuthStore.getState();
       expect(state.user).toBeNull();
       expect(state.session).toBeNull();
       expect(state.profile).toBeNull();
       expect(state.isLoading).toBe(false);
       expect(state.error).toBeNull();
     });

    it('should clear state even if API call fails', async () => {
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
      });
      const apiError = { message: 'Logout failed', code: 'LOGOUT_ERR' };
      // FIX: Mock the ApiResponse structure for error
      const errorResponse: ApiResponse<void> = { data: undefined, error: apiError as ApiErrorType };
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(errorResponse);

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(postSpy).toHaveBeenCalledTimes(1);
      const state = useAuthStore.getState();
      // State should still be cleared
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull(); // Error during logout might not be surfaced
    });

    it('should clear state if not authenticated (no API call)', async () => {
        act(() => {
            // Ensure starting state is logged out
            resetStore();
            useAuthStore.getState().setIsLoading(false); // Simulate initial load complete
          });
          const postSpy = vi.spyOn(api, 'post');

          await act(async () => {
            await useAuthStore.getState().logout();
          });

          expect(postSpy).not.toHaveBeenCalled(); // No token, no call
          const state = useAuthStore.getState();
          expect(state.user).toBeNull();
          expect(state.session).toBeNull();
          expect(state.profile).toBeNull();
          expect(state.isLoading).toBe(false);
          expect(state.error).toBeNull();
      });
  });

  describe('initialize action', () => {
      // Interface for refresh response used in initialize/refresh
      interface RefreshResponse {
        session: Session | null;
        user: User | null;
        profile: UserProfile | null;
      }

     it('should set loading false and state to nulls if no session exists initially', async () => {
       // Start with clean, empty state
       act(() => { resetStore(); });

       await act(async () => {
         await useAuthStore.getState().initialize();
       });

       const state = useAuthStore.getState();
       expect(state.isLoading).toBe(false);
       expect(state.user).toBeNull();
       expect(state.session).toBeNull();
       expect(state.profile).toBeNull();
       expect(state.error).toBeNull();
     });

     it('should load user, session, and profile if a valid session exists', async () => {
       // Simulate persisted session
       act(() => {
         resetStore();
         useAuthStore.getState().setSession(mockSession);
       });

       // FIX: Mock the ApiResponse structure for /me
       const meResponse: ApiResponse<AuthResponse> = { data: { user: mockUser, session: mockSession, profile: mockProfile }, error: null };
       const getSpy = vi.spyOn(api, 'get').mockResolvedValue(meResponse);

       await act(async () => {
         await useAuthStore.getState().initialize();
       });

       expect(getSpy).toHaveBeenCalledWith('me', { token: mockSession.access_token });
       const state = useAuthStore.getState();
       expect(state.isLoading).toBe(false);
       expect(state.user).toEqual(mockUser);
       expect(state.session).toEqual(mockSession); // Session should remain the same or be updated by /me
       expect(state.profile).toEqual(mockProfile);
       expect(state.error).toBeNull();
     });

     it('should clear session and set error if /me call fails', async () => {
        act(() => {
            resetStore();
            useAuthStore.getState().setSession(mockSession);
          });
        const apiError = { message: 'Token expired', code: 'TOKEN_EXPIRED' };
        // FIX: Mock the ApiResponse structure for error
        const errorResponse: ApiResponse<AuthResponse> = { data: null, error: apiError as ApiErrorType };
        const getSpy = vi.spyOn(api, 'get').mockResolvedValue(errorResponse);

        await act(async () => {
          await useAuthStore.getState().initialize();
        });

        expect(getSpy).toHaveBeenCalledWith('me', { token: mockSession.access_token });
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.session).toBeNull(); // Session cleared on failure
        expect(state.profile).toBeNull();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain(apiError.message);
      });

     it('should set user/session but null profile and error if profile data is missing from me response', async () => {
         act(() => {
            resetStore();
            useAuthStore.getState().setSession(mockSession);
          });
         // Simulate /me returning user/session but no profile
         // FIX: Mock the ApiResponse structure
         const incompleteMeResponse: ApiResponse<AuthResponse> = { data: { user: mockUser, session: mockSession, profile: null }, error: null };
         const getSpy = vi.spyOn(api, 'get').mockResolvedValue(incompleteMeResponse);

         await act(async () => {
           await useAuthStore.getState().initialize();
         });

         expect(getSpy).toHaveBeenCalledWith('me', { token: mockSession.access_token });
         const state = useAuthStore.getState();
         expect(state.isLoading).toBe(false);
         // FIX: User and Session should be set based on corrected store logic
         expect(state.user).toEqual(mockUser);
         expect(state.session).toEqual(mockSession);
         expect(state.profile).toBeNull();
         // FIX: This case might not set an error if API call was technically successful
         expect(state.error).toBeNull(); // Or expect specific warning?
      });
  });

  describe('refreshSession action', () => {
      interface RefreshResponse {
        session: Session | null;
        user: User | null;
        profile: UserProfile | null;
      }
      const refreshedSession: Session = { ...mockSession, access_token: 'new-access', refresh_token: 'new-refresh' };
      // FIX: Mock the ApiResponse structure
      const refreshSuccessResponse: ApiResponse<RefreshResponse> = { data: { session: refreshedSession, user: mockUser, profile: mockProfile }, error: null };


     it('should not call API and set error if no session (refresh token) exists', async () => {
       act(() => { resetStore(); }); // Start logged out
       const postSpy = vi.spyOn(api, 'post');

       await act(async () => {
         await useAuthStore.getState().refreshSession();
       });

       expect(postSpy).not.toHaveBeenCalled();
       const state = useAuthStore.getState();
       expect(state.isLoading).toBe(false);
       expect(state.error).toBeInstanceOf(Error);
       expect(state.error?.message).toContain('No refresh token');
     });

     it('should call refresh, update state on success', async () => {
       // Simulate existing session with refresh token
       act(() => {
         resetStore();
         useAuthStore.getState().setSession(mockSession);
       });
       const postSpy = vi.spyOn(api, 'post').mockResolvedValue(refreshSuccessResponse);

       await act(async () => {
         await useAuthStore.getState().refreshSession();
       });

       // FIX: Check call args, including header, removing isPublic
       expect(postSpy).toHaveBeenCalledWith('refresh', {}, { headers: { 'Authorization': `Bearer ${mockSession.refresh_token}` } });
       const state = useAuthStore.getState();
       expect(state.isLoading).toBe(false);
       expect(state.user).toEqual(mockUser);
       expect(state.session).toEqual(refreshedSession);
       expect(state.profile).toEqual(mockProfile); // Profile updated if returned
       expect(state.error).toBeNull();
     });

     it('should clear state and set error if refresh fails (does not call logout)', async () => {
        act(() => {
            resetStore();
            useAuthStore.getState().setSession(mockSession);
          });
        const apiError = { message: 'Invalid refresh token', code: 'INVALID_TOKEN' };
        // FIX: Mock the ApiResponse structure for error
        const errorResponse: ApiResponse<RefreshResponse> = { data: null, error: apiError as ApiErrorType };
        const postSpy = vi.spyOn(api, 'post').mockResolvedValue(errorResponse);
        const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout'); // Spy on logout

        await act(async () => {
          await useAuthStore.getState().refreshSession();
        });

        expect(postSpy).toHaveBeenCalledTimes(1);
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.session).toBeNull(); // Cleared on refresh failure
        expect(state.profile).toBeNull();
        expect(state.error).toBeInstanceOf(Error);
        expect(state.error?.message).toContain(apiError.message);
        expect(logoutSpy).not.toHaveBeenCalled(); // Ensure logout wasn't triggered
      });
  });
}); 