import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest'
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, ChatMessage, ApiResponse, FetchOptions, AuthResponse } from '@paynless/types';
import { UserRole } from '@paynless/types'; // Import UserRole separately
import { logger } from '@paynless/utils'; 
// Import the module to access the mocked version later
import * as analyticsClient from '@paynless/analytics-client';

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
  // Preserve navigate fn during reset
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// ---> Define mockUser, mockSession, mockProfile FIRST <---
const email = 'test@example.com' // Needed by mockUser
const mockUser: User = {
  id: 'user-123',
  email,
  role: UserRole.USER,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
const mockSession: Session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expiresAt: Date.now() / 1000 + 3600,
}
const mockProfile: UserProfile = {
  id: 'profile-123',
  role: UserRole.USER,
  first_name: 'Test',
  last_name: 'User',
}

// ---> THEN define mockLoginData using the above <---
const mockLoginData = {
  email: 'test@example.com',
  password: 'password123',
  user: mockUser,
  session: mockSession,
  profile: mockProfile 
};

// Mocks
vi.mock('@paynless/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api-client')>()
  return {
    ...actual, // Keep other exports like getApiClient if needed elsewhere
    // ---> Mock the api object used by the login action (currently) <---
    api: {
      post: vi.fn(),
      get: vi.fn(), // Mock get if needed by other parts or future versions
      // Add mocks for put, delete, etc. if login ever uses them
    },
    // Keep getApiClient mock if listener tests need it, but login tests might not
    getApiClient: vi.fn(() => ({
      // Mock methods needed by replayPendingAction if login were still calling it
      post: vi.fn(), 
      get: vi.fn(),
    })),
  }
})

// ---> Mock replayPendingAction directly as it's imported <---
vi.mock('./lib/replayPendingAction', () => ({
  replayPendingAction: vi.fn(),
}))

// ---> Mock logger <---
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Test data
// ---> Remove these declarations as they are moved up <---
// const email = 'test@example.com'
const password = 'password123' // Keep password declaration here if needed
// const mockUser: User = {
//   id: 'user-123',
//   email,
//   role: UserRole.USER,
//   created_at: new Date().toISOString(),
//   updated_at: new Date().toISOString(),
// }
// const mockSession: Session = {
//   access_token: 'access-token',
//   refresh_token: 'refresh-token',
//   expiresAt: Date.now() / 1000 + 3600,
// }
// const mockProfile: UserProfile = {
//   id: 'profile-123',
//   role: UserRole.USER,
//   first_name: 'Test',
//   last_name: 'User',
// }

describe('AuthStore - Login Action', () => {
  let postSpy: Mock
  let navigateMock: Mock

  beforeEach(() => {
    // Reset Zustand store before each test
    useAuthStore.setState(
      {
        user: null,
        session: null,
        profile: null,
        isLoading: false,
        error: null,
        // Keep navigate mock setup separate
        // navigate: null, 
      },
      // ---> Change true to false (or remove) to merge state instead of replacing <---
      false 
    ) // false merges state, preserving actions

    // Set up mocks
    postSpy = vi.mocked(api.post)
    navigateMock = vi.fn()
    useAuthStore.setState({ navigate: navigateMock })

    // Clear mock call history
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore mocks after each test
    vi.restoreAllMocks()
    // Clear localStorage
    localStorage.clear()
  })

  // ---> Test focuses on basic login success, NOT replay <---
  it('should update state, call navigate("dashboard"), and return user on success (no replay)', async () => {
    postSpy.mockResolvedValue({ data: { user: mockUser, session: mockSession, profile: mockProfile }, error: null, status: 200 });

    const result = await useAuthStore.getState().login(email, password);

    // Verify API call
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('login', { email, password });

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.user).toEqual(mockUser);
    expect(state.session).toEqual(mockSession);
    expect(state.profile).toEqual(mockProfile);
    expect(state.error).toBeNull();
    expect(result).toEqual(mockUser);

    // Verify navigation (default to dashboard when no replay)
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('dashboard');
  });

  // Keep the API failure test
  it('should set error state, clear user data, not navigate, and return null on API failure', async () => {
    const apiError = { code: 'LOGIN_FAILED', message: 'Invalid credentials' };
    postSpy.mockResolvedValue({ data: null, error: apiError, status: 401 });

    const result = await useAuthStore.getState().login(email, password);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('login', { email, password });

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe(apiError.message);
    expect(result).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

});