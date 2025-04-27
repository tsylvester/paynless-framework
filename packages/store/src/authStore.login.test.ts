import { vi, describe, it, expect, beforeEach, afterEach, type Mock, type SpyInstance } from 'vitest'
import { useAuthStore } from './authStore';
// REMOVE: No longer mocking getSupabaseClient
// import { getSupabaseClient } from '@paynless/api/apiClient'; // Adjust path if needed
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, ChatMessage, ApiResponse, FetchOptions, AuthResponse } from '@paynless/types';
import { UserRole, AuthRequiredError } from '@paynless/types'; // Import UserRole, AuthRequiredError
import { logger } from '@paynless/utils';
import * as analyticsClient from '@paynless/analytics';
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'; // Import Supabase types

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
  // Preserve navigate fn during reset
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

const email = 'test@example.com'
const password = 'password123'
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

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock analytics
vi.mock('@paynless/analytics', () => ({ 
  analytics: { identify: vi.fn(), reset: vi.fn(), track: vi.fn() } 
}));

// Mock replayPendingAction
vi.mock('./lib/replayPendingAction', () => ({
  replayPendingAction: vi.fn(),
}));

// REMOVE: Mock the function used by the store to get the Supabase client
// vi.mock('@paynless/api/apiClient', async (importOriginal) => { // Adjust path if needed
//   const actual = await importOriginal<any>();
//   return {
//     ...actual,
//     getSupabaseClient: vi.fn(), // Mock the specific function
//   };
// });

// --- Mock Supabase Client Setup ---
// Define the shape of the mock response expected by the store action (might be minimal)
const mockSupabaseAuthSuccessResponse = { data: {}, error: null }; // Simple success object
// Create the spy for the method the store action calls
const mockSignInWithPassword = vi.fn().mockResolvedValue(mockSupabaseAuthSuccessResponse);
// Mock other methods if needed by other parts of the setup/store, else keep minimal
const mockSignUp = vi.fn(); 
const mockSignOut = vi.fn();

// Assemble the mock client, ensuring it has the 'auth' property with the spied method
const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    // Add other auth methods if needed by the test setup or teardown
    // signUp: mockSignUp,
    // signOut: mockSignOut,
    // onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }
  // Add other top-level client properties if needed by the tests (e.g., 'from')
} as unknown as SupabaseClient; // Use type assertion carefully

describe('AuthStore - Login Action (Refactored for Supabase)', () => {
  // Spies/Mocks to be assigned in beforeEach
  let signInPasswordSpy: SpyInstance;
  let navigateMock: Mock;
  let loggerErrorSpy: SpyInstance;
  let loggerInfoSpy: SpyInstance; // Add spy for logger.info

  beforeEach(() => {
    // Reset Zustand store state
    resetStore(); // Use the helper function

    // Assign spies from the globally defined mock functions/client
    signInPasswordSpy = mockSignInWithPassword; 
    loggerErrorSpy = vi.spyOn(logger, 'error');
    loggerInfoSpy = vi.spyOn(logger, 'info'); // Assign info spy

    // REMOVE: No longer need to mock getSupabaseClient return value
    // (getSupabaseClient as Mock).mockReturnValue(mockSupabaseClient);

    // Setup navigation mock
    navigateMock = vi.fn();
    useAuthStore.getState().setNavigate(navigateMock); // Set navigate after resetting state

    // Clear mock history AFTER setup
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call authClient.signInWithPassword, set loading/error, log, but NOT set user/session directly', async () => {
    // Arrange: Mock supabase success
    signInPasswordSpy.mockResolvedValue(mockSupabaseAuthSuccessResponse);

    // Act
    await act(async () => {
        // PASS the mock client directly to the action
        await useAuthStore.getState().login(mockSupabaseClient.auth, email, password);
    });

    // Assert: Logger call
    expect(loggerInfoSpy).toHaveBeenCalledWith('Attempting to login user via form', { email: email });

    // Assert: Supabase call
    expect(signInPasswordSpy).toHaveBeenCalledTimes(1);
    expect(signInPasswordSpy).toHaveBeenCalledWith({ email, password });

    // Assert: State changes for loading/error
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false); // Should be false at the end
    expect(finalState.error).toBeNull(); // Error should be null on success
    
    // Assert state is NOT set directly (handled by listener)
    expect(finalState.user).toBeNull();
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();

    // Assert: Navigation (REMOVED - Login action no longer navigates directly)
    // expect(navigateMock).toHaveBeenCalledTimes(1);
    // expect(navigateMock).toHaveBeenCalledWith('dashboard');
    expect(navigateMock).not.toHaveBeenCalled(); // Login itself doesn't navigate anymore
  });

  it('should set error state, clear user data, not navigate, and return null on Supabase failure', async () => {
    // Arrange: Mock supabase failure
    const supabaseError = new Error('Invalid login credentials');
    // Make the spy reject with the error
    signInPasswordSpy.mockRejectedValue(supabaseError); 

    // Act
     await act(async () => {
        // PASS the mock client directly to the action
        await useAuthStore.getState().login(mockSupabaseClient.auth, email, password);
    });

    // Assert: Supabase call
    expect(signInPasswordSpy).toHaveBeenCalledTimes(1);
    expect(signInPasswordSpy).toHaveBeenCalledWith({ email, password });

    // Assert: Final state remains cleared and error is set
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false); // Should be false at the end
    expect(finalState.user).toBeNull();
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.error).toBe(supabaseError); // Verify the specific error object

    // Assert: Navigation not called on error
    expect(navigateMock).not.toHaveBeenCalled();

    // Assert: Logger called
    expect(loggerErrorSpy).toHaveBeenCalledWith('Login error in store', { message: supabaseError.message });
  });

  // Add a test case for network/unexpected errors during the call
  it('should handle unexpected errors during login attempt', async () => {
    // Arrange
    const unexpectedError = new Error('Network connection failed');
    // Make the spy throw the error
    signInPasswordSpy.mockImplementation(() => { 
        throw unexpectedError; 
    });

    // Act
    await act(async () => {
        // PASS the mock client directly to the action
        await useAuthStore.getState().login(mockSupabaseClient.auth, email, password);
    });

    // Assert
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false);
    // Ensure the correct error object is set
    expect(finalState.error).toBe(unexpectedError); 
    expect(finalState.user).toBeNull();
    expect(finalState.session).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
    // Check the logger was called with the correct error message
    expect(loggerErrorSpy).toHaveBeenCalledWith('Login error in store', { message: unexpectedError.message }); 
  });

});