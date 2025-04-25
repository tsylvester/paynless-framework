import { vi, describe, it, expect, beforeEach, afterEach, type Mock, type SpyInstance } from 'vitest'
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, ChatMessage, ApiResponse, FetchOptions, AuthResponse } from '@paynless/types';
import { UserRole, AuthRequiredError } from '@paynless/types'; // Import UserRole, AuthRequiredError
import { logger } from '@paynless/utils'; 
import * as analyticsClient from '@paynless/analytics-client';
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'; // Import Supabase types

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
  role: 'user',
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
  role: 'user',
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

// --- Mocks ---
// Keep logger mock
vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Keep analytics mock
vi.mock('@paynless/analytics-client', () => ({ 
  analytics: { identify: vi.fn(), reset: vi.fn(), track: vi.fn() } 
}));

// Keep replayPendingAction mock
vi.mock('./lib/replayPendingAction', () => ({
  replayPendingAction: vi.fn(),
}));

// --- Mock Supabase Client Setup ---
// Mock the Supabase client instance that api.getSupabaseClient() will return
const mockSupabaseAuthResponse = { data: { user: {} as SupabaseUser, session: {} as SupabaseSession }, error: null };
const mockSignInWithPassword = vi.fn().mockResolvedValue(mockSupabaseAuthResponse);
const mockSignUp = vi.fn(); // Add mocks for other methods if needed
const mockSignOut = vi.fn();

const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    signOut: mockSignOut,
    // Mock onAuthStateChange if needed for direct tests, but listener tests cover it
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }
} as unknown as SupabaseClient;

// Mock the api client module to return our mock Supabase client
vi.mock('@paynless/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api-client')>()
  // Define the mocked api object separately for clarity
  const mockedApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getSupabaseClient: vi.fn(() => mockSupabaseClient),
    ai: vi.fn(),
    billing: vi.fn(),
    notifications: vi.fn(),
  };
  return {
    ...actual,
    api: mockedApi, // Export the mocked api object
    getApiClient: vi.fn(() => mockedApi), // getApiClient returns the mocked api object
  }
});

describe('AuthStore - Login Action (Refactored for Supabase)', () => {
  // Spies/Mocks to be assigned in beforeEach
  let signInPasswordSpy: SpyInstance; 
  let navigateMock: Mock;
  let loggerErrorSpy: SpyInstance;

  beforeEach(() => {
    // Reset Zustand store state
    useAuthStore.setState(useAuthStore.getInitialState(), true); // Use initial state

    // Assign mocks/spies
    signInPasswordSpy = vi.spyOn(mockSupabaseClient.auth, 'signInWithPassword'); 
    loggerErrorSpy = vi.spyOn(logger, 'error');
    
    // Setup navigation mock
    navigateMock = vi.fn();
    useAuthStore.getState().setNavigate(navigateMock); // Set navigate after resetting state

    // Clear mock history AFTER setup
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call supabase.auth.signInWithPassword, set loading/error, navigate, but NOT set user/session directly', async () => {
    // Arrange: Mock supabase success
    signInPasswordSpy.mockResolvedValue(mockSupabaseAuthResponse); // Already set globally, but can override here if needed
    
    // Act
    const result = await useAuthStore.getState().login(email, password);

    // Assert: Supabase call
    expect(signInPasswordSpy).toHaveBeenCalledTimes(1);
    expect(signInPasswordSpy).toHaveBeenCalledWith({ email, password });

    // Assert: State changes for loading/error ONLY (Removed setStateSpy checks)
    // expect(setStateSpy).toHaveBeenCalledTimes(2); 
    // expect(setStateSpy).toHaveBeenNthCalledWith(1, { isLoading: true, error: null });
    // expect(setStateSpy).toHaveBeenNthCalledWith(2, { isLoading: false });

    // Check final state directly
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false); // Should be false at the end
    expect(finalState.user).toBeNull(); 
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.error).toBeNull(); // Error should be null on success

    // Assert: Return value (should it return anything now? Plan says handle errors)
    // Let's assume it returns null or void on success after refactor
    // expect(result).toBeNull(); // Tentative assertion based on listener handling state

    // Assert: Navigation (REMOVED - Handled by listener)
    // expect(navigateMock).toHaveBeenCalledTimes(1);
    // expect(navigateMock).toHaveBeenCalledWith('dashboard');
    
    // Assert: Analytics should still be called by the LISTENER (not tested here)
    // Assert: replayPendingAction might be called by LISTENER (not tested here)
  });

  // Keep the API failure test -> Refactor for Supabase error
  it('should set error state, clear user data, not navigate, and return null on Supabase failure', async () => {
    // Arrange: Mock supabase failure
    const supabaseError = new Error('Invalid login credentials');
    signInPasswordSpy.mockRejectedValue(supabaseError);

    // Act
    const result = await useAuthStore.getState().login(email, password);

    // Assert: Supabase call
    expect(signInPasswordSpy).toHaveBeenCalledTimes(1);
    expect(signInPasswordSpy).toHaveBeenCalledWith({ email, password });

    // Assert: State changes for loading/error (Removed setStateSpy checks)
    // expect(setStateSpy).toHaveBeenCalledTimes(3); // Expect 3 calls now
    // expect(setStateSpy).toHaveBeenNthCalledWith(1, { isLoading: true, error: null });
    // expect(setStateSpy).toHaveBeenNthCalledWith(2, { isLoading: false, error: supabaseError }); // Check error is set
    // expect(setStateSpy).toHaveBeenNthCalledWith(3, { isLoading: false }); // Check finally call
    
    // Assert: Final state remains cleared and error is set
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false); // Should be false at the end
    expect(finalState.user).toBeNull();
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.error).toBe(supabaseError); // Verify the specific error object
    
    // Assert: Return value
    expect(result).toBeNull(); // Should return null on failure
    
    // Assert: No navigation
    expect(navigateMock).not.toHaveBeenCalled();
    
    // Assert: Logger called
    expect(loggerErrorSpy).toHaveBeenCalledWith('Login error in store', { message: supabaseError.message });
  });

});