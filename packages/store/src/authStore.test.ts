import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore'; // Assuming store is default export or named export
import { mockApi } from './setupTests'; // Import the mocked API methods
import { act } from '@testing-library/react'; // Use act for state updates

// Helper to reset Zustand store state between tests
const resetStore = () => useAuthStore.setState(useAuthStore.getInitialState());

// Mock data for API responses
const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockSession = { access_token: 'abc', refresh_token: 'def', user: mockUser };
const mockProfile = { id: 'user-123', first_name: 'Test', last_name: 'User' };

describe('AuthStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    act(() => {
      resetStore();
    });
    // Mocks are cleared automatically by setupTests.ts
  });

  it('should have correct initial state', () => {
    const { user, session, profile, isLoading, error } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(session).toBeNull();
    expect(profile).toBeNull();
    expect(isLoading).toBe(true);
    expect(error).toBeNull();
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
  });

  it('setError should update error state', () => {
    const testError = new Error('Test Error');
    act(() => {
      useAuthStore.getState().setError(testError);
    });
    expect(useAuthStore.getState().error).toEqual(testError);
  });

  // --- Test Async Actions ---

  describe('login action', () => {
    it('should call api.post, set user/session/profile, and clear error on success', async () => {
      const email = 'test@example.com';
      const password = 'password';
      const apiResponse = { user: mockUser, session: mockSession, profile: mockProfile };
      mockApi.post.mockResolvedValue(apiResponse); // Mock successful API call

      // Set an initial error to ensure it gets cleared
      act(() => { useAuthStore.getState().setError(new Error('Previous error')) });

      await act(async () => {
        await useAuthStore.getState().login(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledOnce();
      expect(mockApi.post).toHaveBeenCalledWith('/login', { email, password });

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(mockUser);
      expect(state.session).toEqual(mockSession);
      expect(state.profile).toEqual(mockProfile);
      expect(state.error).toBeNull();
    });

    it('should set error state and clear user/session/profile on API failure', async () => {
      const email = 'test@example.com';
      const password = 'password';
      const apiError = new Error('Invalid credentials');
      mockApi.post.mockRejectedValue(apiError); // Mock failed API call

      // Set initial state to ensure it gets cleared
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile);
      });
      
      await act(async () => {
         await useAuthStore.getState().login(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledOnce();
      expect(mockApi.post).toHaveBeenCalledWith('/login', { email, password });

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toEqual(apiError);
    });
  });

  describe('register action', () => {
    // Similar structure to login tests
    it('should call api.post, set user/session (no profile), and clear error on success', async () => {
      const email = 'new@example.com';
      const password = 'newpassword';
      // Register might only return user/session, profile created by trigger
      const apiResponse = { user: mockUser, session: mockSession }; 
      mockApi.post.mockResolvedValue(apiResponse);

      await act(async () => {
        await useAuthStore.getState().register(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledOnce();
      expect(mockApi.post).toHaveBeenCalledWith('/register', { email, password });

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(mockUser);
      expect(state.session).toEqual(mockSession);
      expect(state.profile).toBeNull(); // Expect profile to be null initially
      expect(state.error).toBeNull();
    });

    it('should set error state on API failure', async () => {
      const email = 'new@example.com';
      const password = 'newpassword';
      const apiError = new Error('Email already exists');
      mockApi.post.mockRejectedValue(apiError);

      await act(async () => {
        await useAuthStore.getState().register(email, password);
      });

      expect(mockApi.post).toHaveBeenCalledOnce();

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toEqual(apiError);
    });
  });
  
  describe('logout action', () => {
    it('should call api.post, clear user/session/profile, and clear error on success', async () => {
      mockApi.post.mockResolvedValue({}); // Logout returns simple success

      // Set initial state
      act(() => {
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setProfile(mockProfile);
        useAuthStore.getState().setError(new Error('Previous error'))
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(mockApi.post).toHaveBeenCalledOnce();
      expect(mockApi.post).toHaveBeenCalledWith('/logout', {}); // Expect empty body

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should clear state even if API call fails (local logout should always work)', async () => {
      const apiError = new Error('Logout API failed');
      mockApi.post.mockRejectedValue(apiError);
      
      // Set initial state
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
      expect(state.user).toBeNull(); // State is cleared locally
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull(); // Error from API is ignored for logout
    });
  });

  // TODO: Add tests for initialize(), refreshSession(), updateProfile()
}); 