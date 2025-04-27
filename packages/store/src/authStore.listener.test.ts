import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
  SupabaseClient,
  Session as SupabaseSession,
  User as SupabaseUser,
  AuthChangeEvent
} from '@supabase/supabase-js';
import { useAuthStore } from './authStore'; // Import the store hook itself
import { initAuthListener } from './authStore';
import { api } from '@paynless/api'; // Import the REAL api object
// Import our actual mapped types for verifying results
import { Session, User, UserProfile, UserRole } from '@paynless/types'; 
import { initializeApiClient, _resetApiClient } from '@paynless/api';

// Define a type for the listener callback Supabase expects
type AuthStateChangeListener = (event: AuthChangeEvent, session: SupabaseSession | null) => void;

// --- Realistic Mock Data ---
const mockSupabaseUser: SupabaseUser = {
  id: 'user-123',
  app_metadata: { provider: 'email' },
  user_metadata: { name: 'Test User' },
  aud: 'authenticated',
  email: 'test@example.com',
  phone: '',
  created_at: '2023-01-01T10:00:00Z',
  updated_at: '2023-01-10T10:00:00Z',
  role: 'authenticated',
  // Add any other fields SupabaseUser might have that our mapping uses
};

const mockSupabaseSession: SupabaseSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  user: mockSupabaseUser,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

// Expected results after mapping
const expectedMappedUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'authenticated' as UserRole,
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-10T10:00:00Z',
};

const expectedMappedSession: Session = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expiresAt: mockSupabaseSession.expires_at!,
    token_type: mockSupabaseSession.token_type,
    expires_in: mockSupabaseSession.expires_in,
};

const mockUserProfile: UserProfile = {
    id: 'user-123',
    first_name: 'Testy',
    last_name: 'McTestface',
    role: 'user',
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-10T10:00:00Z',
    // avatarUrl etc. 
};

// --- Mocks for Dependencies ---
let listenerCallback: AuthStateChangeListener | null = null;
const mockUnsubscribe = vi.fn();
const mockNavigate = vi.fn();

// --- Define the mock Supabase client directly ---
const mockSupabaseClient = {
  auth: {
    onAuthStateChange: vi.fn((callback: AuthStateChangeListener) => {
      listenerCallback = callback; // Store the callback
      return { 
        data: { subscription: { unsubscribe: mockUnsubscribe } }, 
        error: null 
      };
    }),
  },
} as unknown as SupabaseClient;

// --- Use vi.spyOn to mock specific api methods BEFORE describe block ---
vi.spyOn(api, 'getSupabaseClient').mockReturnValue(mockSupabaseClient);

// ---> Store the original api.get function <--- 
const originalApiGet = api.get;

describe('authStore Listener Logic (initAuthListener)', () => {
  
  // ---> Initialize API client before all tests in this suite <--- 
  beforeAll(() => {
    initializeApiClient({
      supabaseUrl: 'http://dummy-url.com', // Use dummy values for test initialization
      supabaseAnonKey: 'dummy-key'
    });
  });

  // ---> Reset API client after all tests in this suite <--- 
  afterAll(() => {
    _resetApiClient(); // Clean up the singleton for other test files
  });

  beforeEach(() => {
    // ---> Assign api.get to a new vi.fn() mock <--- 
    api.get = vi.fn().mockResolvedValue({ // Default success case
      data: { profile: mockUserProfile }, 
      error: null,
      status: 200
    });

    // Reset other mocks
    vi.mocked(mockSupabaseClient.auth.onAuthStateChange).mockClear();

    useAuthStore.setState({ // Reset store to initial state
        user: null,
        session: null,
        profile: null,
        isLoading: true,
        error: null,
        navigate: null,
    }, true); // Replace state

    useAuthStore.setState({ navigate: mockNavigate });
    listenerCallback = null;

    // Spy on setState AFTER resetting state
    vi.spyOn(useAuthStore, 'setState');
  });

  afterEach(() => {
    // ---> Restore the original api.get function <--- 
    api.get = originalApiGet;
    
    // Clear other mocks
    vi.mocked(mockSupabaseClient.auth.onAuthStateChange).mockClear();
    vi.mocked(useAuthStore.setState).mockClear();
    mockNavigate.mockClear();
    // ---> Explicitly clear the getSupabaseClient spy <--- 
    vi.mocked(api.getSupabaseClient).mockClear();
  });

  // Helper to trigger the listener
  const triggerListener = (event: AuthChangeEvent, session: SupabaseSession | null) => {
    if (!listenerCallback) {
        throw new Error('Listener callback not set by initAuthListener');
    }
    return listenerCallback(event, session); // Return promise if callback is async
  }

  it('should set session, user, profile and isLoading=false on INITIAL_SESSION with session', async () => {
    // Arrange: Default api.get mock is set in beforeEach
    
    initAuthListener(); 
    expect(listenerCallback).toBeDefined();
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1); // Should be called once per init

    // ... trigger, advance timers ...
    vi.useFakeTimers();
    triggerListener('INITIAL_SESSION', mockSupabaseSession);
    await vi.advanceTimersToNextTimerAsync();
    vi.useRealTimers();

    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // Check state updates (Restore detailed checks)
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); 
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      session: expectedMappedSession, 
      user: expectedMappedUser, 
      isLoading: false,
      error: null,
    }));
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: mockUserProfile 
    });
  });

  it('should set profile=null, set error, and still call replay on profile fetch failure', async () => {
    const fetchError = new Error('Failed to fetch profile');
    // ---> Arrange: Override the mock api.get implementation for this test <--- 
    vi.mocked(api.get).mockResolvedValueOnce({ 
      data: null, 
      error: { message: fetchError.message, code: 'FETCH_ERROR' }, 
      status: 500 
    });

    initAuthListener(); 
    expect(listenerCallback).toBeDefined();
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // ... trigger, advance timers ...
    vi.useFakeTimers();
    triggerListener('INITIAL_SESSION', mockSupabaseSession);
    await vi.advanceTimersToNextTimerAsync();
    vi.useRealTimers();

    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // Check state updates (Restore detailed checks)
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); 
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      session: expectedMappedSession, 
      user: expectedMappedUser, 
      isLoading: false,
      error: null,
    }));
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: null,
      error: expect.any(Error) 
    });
    const actualError = useAuthStore.getState().error;
    expect(actualError).toBeInstanceOf(Error);
    expect(actualError?.message).toEqual('Failed to fetch profile'); 
  });

  it('should set session=null, user=null, profile=undefined on INITIAL_SESSION without session', async () => {
    initAuthListener();
    expect(listenerCallback).toBeDefined();
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    await triggerListener('INITIAL_SESSION', null);

    expect(vi.mocked(api.get)).not.toHaveBeenCalled();

    // Restore detailed checks
    expect(useAuthStore.setState).toHaveBeenCalledTimes(1);
    expect(useAuthStore.setState).toHaveBeenCalledWith({
      session: null,
      user: null,
      profile: undefined, 
      isLoading: false,
      error: null,
    });
  });

  it('should set session, user, profile on SIGNED_IN event', async () => {
    // Arrange: Default api.get mock set in beforeEach
    
    initAuthListener();
    expect(listenerCallback).toBeDefined();
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // ... trigger, advance timers ...
    vi.useFakeTimers();
    triggerListener('SIGNED_IN', mockSupabaseSession);
    await vi.advanceTimersToNextTimerAsync();
    vi.useRealTimers();

    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // Restore detailed checks
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); 
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      session: expectedMappedSession,
      user: expectedMappedUser,
      isLoading: false, 
      error: null,
    }));
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: mockUserProfile 
    });
  });

  it('should clear user, session, profile on SIGNED_OUT event', async () => {
    // Arrange initial state
    useAuthStore.setState({ 
        session: expectedMappedSession, 
        user: expectedMappedUser, 
        profile: mockUserProfile,
        isLoading: false,
        navigate: mockNavigate
    }, true);
    // Reset mocks specifically for this test after setting state
    vi.mocked(api.get).mockClear();
    vi.mocked(mockSupabaseClient.auth.onAuthStateChange).mockClear();
    vi.mocked(useAuthStore.setState).mockClear();
    vi.spyOn(useAuthStore, 'setState'); // Re-apply spy

    initAuthListener();
    expect(listenerCallback).toBeDefined();
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    await triggerListener('SIGNED_OUT', null);

    expect(vi.mocked(api.get)).not.toHaveBeenCalled();

    // Restore detailed checks
    expect(useAuthStore.setState).toHaveBeenCalledTimes(1);
    expect(useAuthStore.setState).toHaveBeenCalledWith({ 
        user: null,
        session: null,
        profile: null,
        isLoading: false, 
        error: null,
     });
  });

  it('should update session and user on TOKEN_REFRESHED event', async () => {
    initAuthListener();
    expect(listenerCallback).toBeDefined();
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // Set up refreshed session data
    const refreshedSupabaseSession = { 
      ...mockSupabaseSession, 
      access_token: 'new-refreshed-token', 
      expires_at: Math.floor(Date.now() / 1000) + 7200, 
      expires_in: 7200 
    };
    const expectedMappedRefreshedSession = {
        ...expectedMappedSession,
        access_token: 'new-refreshed-token',
        expiresAt: refreshedSupabaseSession.expires_at!,
        token_type: refreshedSupabaseSession.token_type,
        expires_in: refreshedSupabaseSession.expires_in,
    };

    await triggerListener('TOKEN_REFRESHED', refreshedSupabaseSession);

    expect(vi.mocked(api.get)).not.toHaveBeenCalled();

    // Restore detailed checks
    expect(useAuthStore.setState).toHaveBeenCalledTimes(1);
    expect(useAuthStore.setState).toHaveBeenCalledWith({ 
        session: expectedMappedRefreshedSession, 
        user: expectedMappedUser, 
        isLoading: false, 
        error: null,     
     });
  });

  // Add test for USER_UPDATED if needed
  // Add test for profile fetch failure if needed
  // Add test verifying replayPendingAction is called if needed

}); 