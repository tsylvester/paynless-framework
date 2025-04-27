import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance, Mock, type SpyInstance } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils'; 
// Import the module to access the mocked version later
import * as analyticsClient from '@paynless/analytics';
import { SupabaseClient, Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'; // Import Supabase types

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

// Mock analytics client
vi.mock('@paynless/analytics', () => ({ 
  analytics: { identify: vi.fn(), reset: vi.fn(), track: vi.fn() } 
}));

// --- Mock Supabase Client Setup ---
const mockSignInWithPassword = vi.fn(); 
const mockSignUp = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null }); // Mock signOut specifically

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
    get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
    getSupabaseClient: vi.fn(() => mockSupabaseClient),
    ai: vi.fn(), billing: vi.fn(), notifications: vi.fn(),
  };
  return { ...actual, api: mockedApi, getApiClient: vi.fn(() => mockedApi) }
});

describe('AuthStore - Logout Action (Refactored for Supabase)', () => {
  let signOutSpy: SpyInstance;
  let logErrorSpy: MockInstance;
  let logWarnSpy: MockInstance;
  let mockReset: Mock; // For analytics
  let localMockNavigate: Mock<[], void>; 

  beforeEach(() => {
    // Reset Zustand store state
    useAuthStore.setState(useAuthStore.getInitialState(), true);

    // Assign mocks/spies
    signOutSpy = vi.spyOn(mockSupabaseClient.auth, 'signOut');
    logErrorSpy = vi.spyOn(logger, 'error');
    logWarnSpy = vi.spyOn(logger, 'warn');
    mockReset = vi.mocked(analyticsClient.analytics.reset); // Get analytics mock
    
    // Setup navigation mock
    localMockNavigate = vi.fn();
    useAuthStore.getState().setNavigate(localMockNavigate);

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call supabase.signOut, reset analytics, and navigate (state cleared by listener)', async () => {
    // Arrange: Set initial authenticated state (simulate state after listener ran)
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    signOutSpy.mockResolvedValue({ error: null }); // Ensure success

    // Act
    await useAuthStore.getState().logout();

    // Assert: Supabase call
    expect(signOutSpy).toHaveBeenCalledTimes(1);

    // Assert: State is NOT cleared directly by the action
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser); // State remains until listener reacts
    expect(state.session).toEqual(mockSession);
    // Note: Depending on timing, the listener *might* have already cleared state 
    // before this assertion runs in a real async environment. 
    // In unit tests with mocks, it likely hasn't reacted yet.

    // Assert: Navigation
    expect(localMockNavigate).toHaveBeenCalledTimes(1);
    expect(localMockNavigate).toHaveBeenCalledWith('login');

    // Assert: Analytics reset called immediately
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('should reset analytics and navigate even if supabase.signOut fails (state cleared by listener)', async () => {
    // Arrange
    useAuthStore.setState({ user: mockUser, session: mockSession });
    const supabaseError = new Error('Sign out failed');
    signOutSpy.mockResolvedValue({ error: supabaseError }); // Mock failure

    // Act
    await useAuthStore.getState().logout();

    // Assert: Supabase call attempted
    expect(signOutSpy).toHaveBeenCalledTimes(1);

    // Assert: State not cleared directly
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser); 
    expect(state.session).toEqual(mockSession);
    
    // Assert: Error logged (if implemented in logout action)
    expect(logErrorSpy).toHaveBeenCalledWith('Supabase signOut failed, proceeding with local cleanup.', { error: supabaseError.message });

    // Assert: Navigation still happens
    expect(localMockNavigate).toHaveBeenCalledTimes(1);
    expect(localMockNavigate).toHaveBeenCalledWith('login');

    // Assert: Analytics reset still called
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
    
  it('should reset analytics and navigate without calling signOut if no session exists', async () => {
    // Arrange: Ensure state is logged out
    useAuthStore.setState({ user: null, session: null });

    // Act
    await useAuthStore.getState().logout();

    // Assert: Supabase call NOT made
    expect(signOutSpy).not.toHaveBeenCalled();

    // Assert: State remains cleared
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();

    // Assert: Logged warning (if implemented)
    expect(logWarnSpy).toHaveBeenCalledWith('Logout called but no session token found. Clearing local state only.');

    // Assert: Navigation still happens
    expect(localMockNavigate).toHaveBeenCalledTimes(1); 
    expect(localMockNavigate).toHaveBeenCalledWith('login');

    // Assert: Analytics reset still called
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
}); 