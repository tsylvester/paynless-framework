import { describe, it, expect, beforeEach, vi, type MockInstance, type Mock, type SpyInstance } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api';
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ChatMessage, ApiResponse, FetchOptions, AuthResponse } from '@paynless/types';
import { logger } from '@paynless/utils'; 
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'; // Import Supabase types
import * as analyticsClient from '@paynless/analytics';

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
  // Preserve navigate fn during reset
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data (adjust if needed for register-specific scenarios)
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 }; 
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };

const mockRegisterData = {
  email: 'new@example.com',
  password: 'newpassword',
  // User/session data now comes from Supabase/listener, not register action
};

// Mock the logger 
vi.mock('@paynless/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock analytics
vi.mock('@paynless/analytics', () => ({ 
  analytics: { identify: vi.fn(), reset: vi.fn(), track: vi.fn() } 
}));

// Mock replayPendingAction (still needed by listener, potentially)
vi.mock('./lib/replayPendingAction', () => ({
  replayPendingAction: vi.fn(),
}));

// --- Mock Supabase Client Setup ---
const mockSupabaseAuthSuccessResponse = { data: {}, error: null }; // Simple success object
const mockSignUp = vi.fn().mockResolvedValue(mockSupabaseAuthSuccessResponse);

// Assemble the mock client
const mockSupabaseClient = {
  auth: {
    signUp: mockSignUp,
    // Add other auth methods if needed
  }
} as unknown as SupabaseClient;

// Mock the api client module
vi.mock('@paynless/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/api')>();
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
    api: mockedApi,
    getApiClient: vi.fn(() => mockedApi),
  }
});

describe('AuthStore - Register Action (Refactored for Supabase)', () => {
  let signUpSpy: SpyInstance;
  let navigateMock: Mock;
  let loggerErrorSpy: SpyInstance;

  beforeEach(() => {
    // Reset Zustand store state
    useAuthStore.setState(useAuthStore.getInitialState(), true);

    // Assign spies
    signUpSpy = mockSignUp;
    loggerErrorSpy = vi.spyOn(logger, 'error');
    
    // Setup navigation mock
    navigateMock = vi.fn();
    useAuthStore.getState().setNavigate(navigateMock);

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
     vi.restoreAllMocks();
  });

  it('should call authClient.signUp, set loading/error, navigate, but NOT set state directly', async () => {
    // Arrange
    signUpSpy.mockResolvedValue(mockSupabaseAuthSuccessResponse); // Ensure success

    // Act
    await act(async () => {
      // PASS the mock client directly
      await useAuthStore.getState().register(mockSupabaseClient.auth, mockRegisterData.email, mockRegisterData.password);
    });

    // Assert: Supabase call
    expect(signUpSpy).toHaveBeenCalledTimes(1);
    expect(signUpSpy).toHaveBeenCalledWith({ email: mockRegisterData.email, password: mockRegisterData.password });

    // Assert: State changes for loading/error
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();

    // Assert state is NOT set directly (handled by listener)
    expect(finalState.user).toBeNull();
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();

    // Assert: Navigation (REMOVED - Register action no longer navigates directly)
    // expect(navigateMock).toHaveBeenCalledTimes(1);
    // expect(navigateMock).toHaveBeenCalledWith('login'); // Or wherever register navigates
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('should set error state, not navigate, and return null on Supabase signUp failure', async () => {
    // Arrange: Mock supabase failure
    const supabaseError = new Error('User already registered');
    signUpSpy.mockRejectedValue(supabaseError); // Mock rejection

    // Act
    await act(async () => {
        // PASS the mock client directly
        await useAuthStore.getState().register(mockSupabaseClient.auth, mockRegisterData.email, mockRegisterData.password);
    });

    // Assert: Supabase call
    expect(signUpSpy).toHaveBeenCalledTimes(1);
    expect(signUpSpy).toHaveBeenCalledWith({ email: mockRegisterData.email, password: mockRegisterData.password });

    // Assert: Final state has error
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false); 
    expect(finalState.user).toBeNull();
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.error).toBe(supabaseError); 

    // Assert: Return value
    expect(result).toBeUndefined();

    // Assert: No navigation
    expect(navigateMock).not.toHaveBeenCalled();

    // Assert: Logger called
    expect(loggerErrorSpy).toHaveBeenCalledWith('Register error in store', { message: supabaseError.message });
  });

  // --- Tests for Register Replay Logic --- // REMOVED
  /* 
    describe('register action - replay logic', () => {
       // ... All previous replay tests removed ...
    });
  */
}); 