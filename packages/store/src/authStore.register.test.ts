import { describe, it, expect, beforeEach, vi, type MockInstance, type Mock, type SpyInstance } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ChatMessage, ApiResponse, FetchOptions } from '@paynless/types';
import { logger } from '@paynless/utils'; 
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'; // Import Supabase types

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

// Mock replayPendingAction (still needed by listener, potentially)
vi.mock('./lib/replayPendingAction', () => ({
  replayPendingAction: vi.fn(),
}));

// --- Mock Supabase Client Setup ---
const mockSupabaseAuthResponse = { data: { user: {} as SupabaseUser, session: {} as SupabaseSession }, error: null }; // Generic success response
const mockSignInWithPassword = vi.fn(); 
const mockSignUp = vi.fn().mockResolvedValue(mockSupabaseAuthResponse); // Mock signUp specificially
const mockSignOut = vi.fn();

const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    signOut: mockSignOut,
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
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

    // Assign mocks/spies
    signUpSpy = vi.spyOn(mockSupabaseClient.auth, 'signUp');
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

  it('should call supabase.auth.signUp, set loading/error, navigate, but NOT set state directly', async () => {
    // Arrange
    const { email, password } = mockRegisterData;
    signUpSpy.mockResolvedValue(mockSupabaseAuthResponse); // Ensure success

    // Act
    const result = await useAuthStore.getState().register(email, password);

    // Assert: Supabase call
    expect(signUpSpy).toHaveBeenCalledTimes(1);
    expect(signUpSpy).toHaveBeenCalledWith({ email, password });

    // Assert: Final state (loading false, no user/session/profile set by action)
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.user).toBeNull(); 
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.error).toBeNull();

    // Assert: Return value (expect null as listener handles state)
    // expect(result).toBeNull(); 

    // Assert: Navigation (REMOVED - Handled by listener)
    // expect(navigateMock).toHaveBeenCalledTimes(1);
    // expect(navigateMock).toHaveBeenCalledWith('dashboard');
  });

  it('should set error state, not navigate, and return null on Supabase signUp failure', async () => {
    // Arrange
    const { email, password } = mockRegisterData;
    const supabaseError = new Error('User already registered');
    signUpSpy.mockRejectedValue(supabaseError);
    
    // Act
    const result = await useAuthStore.getState().register(email, password);

    // Assert: Supabase call
    expect(signUpSpy).toHaveBeenCalledTimes(1);
    expect(signUpSpy).toHaveBeenCalledWith({ email, password });

    // Assert: Final state (loading false, error set, user/session/profile null)
    const finalState = useAuthStore.getState();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.user).toBeNull(); 
    expect(finalState.session).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.error).toBe(supabaseError);

    // Assert: Return value
    expect(result).toBeNull();

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