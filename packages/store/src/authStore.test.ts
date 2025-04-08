import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore'; // Assuming store is default export or named export
import { mockApi } from './setupTests'; // Import the mocked API methods
import { act } from '@testing-library/react'; // Use act for state updates
import type { User, Session, UserProfile, UserProfileUpdate, AuthResponse, ProfileResponse, UserRole } from '@paynless/types';
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
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 }; // Use User type from Session
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
      const email = 'test@example.com';
      const password = 'password';
      const apiResponse: AuthResponse = { user: mockUser, session: mockSession, profile: mockProfile };
      mockApi.post.mockResolvedValue(apiResponse);

      let result: User | null = null;
      await act(async () => {
        result = await useAuthStore.getState().login(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledWith('/login', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(mockUser);
      expect(state.session).toEqual(mockSession);
      expect(state.profile).toEqual(mockProfile);
      expect(state.error).toBeNull();
      expect(result).toEqual(mockUser);
      // Verify navigation was called
      expect(mockNavigate).toHaveBeenCalledOnce();
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('should set error state, clear user data, not navigate, and return null on API failure', async () => {
      const email = 'test@example.com';
      const password = 'password';
      const apiError = new Error('Invalid credentials');
      mockApi.post.mockRejectedValue(apiError);

      let result: User | null = mockUser; // Set to non-null initial value
      await act(async () => {
         result = await useAuthStore.getState().login(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledWith('/login', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toEqual(apiError);
      expect(result).toBeNull(); // Check return value on error
      // Verify navigation was NOT called
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('register action', () => {
    it('should update state, call navigate, and return user on success', async () => {
      const email = 'new@example.com';
      const password = 'newpassword';
      const apiResponse: AuthResponse = { user: mockUser, session: mockSession, profile: mockProfile }; // Assuming API might return profile?
      mockApi.post.mockResolvedValue(apiResponse);

      let result: User | null = null;
      await act(async () => {
        result = await useAuthStore.getState().register(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledWith('/register', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(mockUser);
      expect(state.session).toEqual(mockSession);
      // FIX: Expect profile to be null after register action, as implemented
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
      expect(result).toEqual(mockUser);
      expect(mockNavigate).toHaveBeenCalledOnce();
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('should set error state, not navigate, and return null on API failure', async () => {
      const email = 'new@example.com';
      const password = 'newpassword';
      const apiError = new Error('Email already exists');
      mockApi.post.mockRejectedValue(apiError);

      let result: User | null = mockUser;
      await act(async () => {
        result = await useAuthStore.getState().register(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledWith('/register', { email, password });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toEqual(apiError);
      expect(result).toBeNull();
      // Verify navigation NOT called
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile action', () => {
    const profileUpdates: UserProfileUpdate = { first_name: 'Updated', last_name: 'Name' };
    const updatedProfileResponse: UserProfile = { ...mockProfile, ...profileUpdates };

    beforeEach(() => {
      // Ensure user is 'logged in' for profile update tests
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile); // Set initial profile
      });
    });

    it('should call api.put, update profile state, and return true on success', async () => {
      mockApi.put.mockResolvedValue(updatedProfileResponse);

      let success: boolean = false;
      await act(async () => {
        success = await useAuthStore.getState().updateProfile(profileUpdates);
      });

      expect(mockApi.put).toHaveBeenCalledOnce();
      // FIX: Expect endpoint without leading slash, per convention
      expect(mockApi.put).toHaveBeenCalledWith('profile', profileUpdates, { token: mockSession.access_token });

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.profile).toEqual(updatedProfileResponse);
      expect(state.error).toBeNull();
      expect(success).toBe(true);
    });

    it('should set error state, not update profile, and return false on failure', async () => {
      const apiError = new Error('Failed to update profile');
      mockApi.put.mockRejectedValue(apiError);

      let success: boolean = true;
      await act(async () => {
        success = await useAuthStore.getState().updateProfile(profileUpdates);
      });

      expect(mockApi.put).toHaveBeenCalledOnce();

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      // Profile state should remain unchanged from initial value in beforeEach
      expect(state.profile).toEqual(mockProfile);
      expect(state.error).toEqual(apiError);
      expect(success).toBe(false);
    });

     it('should return false and set error if not authenticated', async () => {
        // Log out the user first
        act(() => {
             useAuthStore.getState().setSession(null);
             useAuthStore.getState().setUser(null);
        });

        let success: boolean = true;
        await act(async () => {
            success = await useAuthStore.getState().updateProfile(profileUpdates);
        });

        expect(mockApi.put).not.toHaveBeenCalled();
        expect(success).toBe(false);
        expect(useAuthStore.getState().error?.message).toContain('Not authenticated');
     });

     it('should return false and set error if profile not loaded', async () => {
        // Clear the profile
        act(() => {
             useAuthStore.getState().setProfile(null);
        });

        let success: boolean = true;
        await act(async () => {
            success = await useAuthStore.getState().updateProfile(profileUpdates);
        });

        expect(mockApi.put).not.toHaveBeenCalled();
        expect(success).toBe(false);
        expect(useAuthStore.getState().error?.message).toContain('Not loaded');
     });
  });

  describe('logout action', () => {
    it('should call api.post, clear user/session/profile, and clear error on success', async () => {
      mockApi.post.mockResolvedValue({}); // Logout returns simple success
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile);
        useAuthStore.getState().setError(new Error('Previous error'))
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(mockApi.post).toHaveBeenCalledWith('/logout', {}, { token: mockSession.access_token });
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should clear state even if API call fails', async () => {
      const apiError = new Error('Logout API failed');
      mockApi.post.mockRejectedValue(apiError);
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile);
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(mockApi.post).toHaveBeenCalledOnce();
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull(); // Error from API is ignored for logout
    });
  });

  // TODO: Add/Update tests for initialize(), refreshSession()

  describe('initialize action', () => {
    it('should set loading false and state to nulls if no session exists initially', async () => {
      // Ensure initial state has no session
      act(() => { resetStore(); });
      // No API call should be made if no local session exists initially

      await act(async () => {
        await useAuthStore.getState().initialize();
      });

      expect(mockApi.get).not.toHaveBeenCalled(); // Verify no API call was made
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should load user, session, and profile if a valid session exists', async () => {
      // Simulate a session being present (e.g., from localStorage hydration)
       act(() => {
         resetStore(); // Reset first
         useAuthStore.getState().setSession(mockSession); // Set session before initialize
         useAuthStore.getState().setNavigate(mockNavigate); // Re-inject mock navigate
       });

       const sessionApiResponse: AuthResponse = { user: mockUser, session: mockSession, profile: mockProfile };

       // FIX: Expect the 'me' call, not /session
       mockApi.get.mockResolvedValueOnce(sessionApiResponse); // Mock response for 'me'

       await act(async () => {
         await useAuthStore.getState().initialize();
       });

       // FIX: Expect call to 'me' (no slash)
       expect(mockApi.get).toHaveBeenCalledWith('me', { token: mockSession.access_token });

       const state = useAuthStore.getState();
       expect(state.isLoading).toBe(false);
       expect(state.user).toEqual(mockUser);
       expect(state.session).toEqual(mockSession); // Session should remain the same or be updated
       expect(state.profile).toEqual(mockProfile);
       expect(state.error).toBeNull();
    });

     it('should clear session and set error if /session call fails', async () => {
        act(() => {
            resetStore();
            useAuthStore.getState().setSession(mockSession); // Simulate hydrated session
            useAuthStore.getState().setNavigate(mockNavigate);
        });

        const sessionError = new Error('Session validation failed');
        mockApi.get.mockRejectedValueOnce(sessionError); // /session fails

        await act(async () => {
            await useAuthStore.getState().initialize();
        });

        // FIX: Expect call to 'me' (no slash)
        expect(mockApi.get).toHaveBeenCalledWith('me', { token: mockSession.access_token });
        expect(mockApi.get).not.toHaveBeenCalledWith('profile', expect.anything()); // Keep this check

        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.user).toBeNull();
        expect(state.session).toBeNull(); // Session should be cleared
        expect(state.profile).toBeNull();
        // FIX: Expect the specific error from the failed API call
        expect(state.error).toEqual(sessionError);
     });

      it('should set user/session but null profile and error if profile data is missing from me response', async () => {
         act(() => {
             resetStore();
             useAuthStore.getState().setSession(mockSession);
             useAuthStore.getState().setNavigate(mockNavigate);
         });

         // Simulate `me` succeeding but profile is null
         const sessionApiResponse: AuthResponse = { user: mockUser, session: mockSession, profile: null as UserProfile | null };
         const profileError = new Error('Profile data not available'); // Error set internally by store

         // FIX: Pass object literal to mockResolvedValueOnce, casting null profile to any
         mockApi.get.mockResolvedValueOnce({
           user: mockUser,
           session: mockSession,
           profile: null as any // Cast null directly to any here
         }); // `me` succeeds

         await act(async () => {
             await useAuthStore.getState().initialize();
         });

         // FIX: Expect call to 'me' (no slash)
         expect(mockApi.get).toHaveBeenCalledWith('me', { token: mockSession.access_token });

         const state = useAuthStore.getState();
         expect(state.isLoading).toBe(false);
         // FIX: User and Session should be set based on corrected store logic
         expect(state.user).toEqual(mockUser);
         expect(state.session).toEqual(mockSession);
         expect(state.profile).toBeNull();
         // FIX: Check the specific error message set by the corrected store logic
         expect(state.error?.message).toContain('Profile data not found during initialization');
      });
  });


  describe('refreshSession action', () => {
    const refreshedSession: Session = { ...mockSession, access_token: 'new_access_token' };
    const refreshApiResponse: AuthResponse = { user: mockUser, session: refreshedSession, profile: mockProfile };

    it('should not call API and set error if no session (refresh token) exists', async () => {
        act(() => { resetStore(); }); // Ensure no session

        await act(async () => {
            await useAuthStore.getState().refreshSession();
        });

        expect(mockApi.post).not.toHaveBeenCalled();
        const state = useAuthStore.getState();
        expect(state.isLoading).toBe(false);
        expect(state.error?.message).toContain('No refresh token available');
        expect(state.user).toBeNull();
        expect(state.session).toBeNull();
    });

    it('should call refresh, update state on success', async () => {
      act(() => {
        resetStore();
        useAuthStore.getState().setSession(mockSession); // Need initial session with refresh token
        useAuthStore.getState().setNavigate(mockNavigate);
      });
      mockApi.post.mockResolvedValue(refreshApiResponse);

      await act(async () => {
        await useAuthStore.getState().refreshSession();
      });

      // FIX: Correct API call expectation for refresh (no slash, uses Auth header)
      expect(mockApi.post).toHaveBeenCalledWith('refresh', {}, { headers: { Authorization: `Bearer ${mockSession.refresh_token}` }, isPublic: true });
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
        useAuthStore.getState().setUser(mockUser); // Set initial user/session/profile
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile);
        useAuthStore.getState().setNavigate(mockNavigate);
      });

      const refreshError = new Error('Refresh token invalid');
      mockApi.post.mockRejectedValueOnce(refreshError); // refresh fails

      await act(async () => {
        await useAuthStore.getState().refreshSession();
      });

      // FIX: Correct API call expectation
      expect(mockApi.post).toHaveBeenCalledWith('refresh', {}, { headers: { Authorization: `Bearer ${mockSession.refresh_token}` }, isPublic: true });
      // FIX: Assert state is cleared directly, logout not called
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      // State should be cleared directly by the catch block in refreshSession
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      // Error should reflect the original refresh error
      expect(state.error).toEqual(refreshError);
    });
  });

}); 