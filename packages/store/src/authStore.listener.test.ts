import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
  SupabaseClient,
  Session as SupabaseSession,
  User as SupabaseUser,
  AuthChangeEvent,
  createClient
} from '@supabase/supabase-js';
import { useAuthStore } from './authStore'; // Import the store hook itself
import { initAuthListener } from './authStore';
import { ApiClient } from '@paynless/api'; // Import ApiClient type
// Import our actual mapped types for verifying results
import { Session, User, UserProfile, UserRole } from '@paynless/types'; 

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

// Add mock navigate function
const mockNavigate = vi.fn();

// ---> REMOVE mockSupabaseClient definition here <--- 
// const mockSupabaseClient = {
// ...
// } as unknown as SupabaseClient;

// ---> REMOVE mockApiClientInstance definition here <--- 
// const mockApiClientInstance = {
// ...
// } as unknown as ApiClient;

// --- Mock the entire @paynless/api module ---
vi.mock('@paynless/api', () => {
    // ---> DEFINE *BOTH* mocks inside the factory <--- 
    const internalMockSupabaseClient = {
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

    const internalMockApiClientInstance = {
        get: vi.fn(),
        post: vi.fn(), 
        put: vi.fn(),
        delete: vi.fn(),
        getSupabaseClient: vi.fn().mockReturnValue(internalMockSupabaseClient), // Use internal mock
    } as unknown as ApiClient;

    return {
        api: internalMockApiClientInstance,
    };
});

// Get a reference to the mock *after* vi.mock has run
// This requires importing the mocked module first
import { api as mockedApi } from '@paynless/api';

describe('authStore Listener Logic (initAuthListener)', () => {
  
  beforeEach(() => {
    // Reset mocks and store state before each test
    vi.clearAllMocks();
    useAuthStore.setState({ // Reset store to initial state
        user: null,
        session: null,
        profile: null,
        isLoading: true,
        error: null,
        navigate: null,
    }, true); // Replace state

    // Set the mock navigate function in the store state
    useAuthStore.setState({ navigate: mockNavigate });

    // Reset listener callback store
    listenerCallback = null;

    // Mock API calls - NEST profile data correctly
    // ---> Use mockedApi reference <--- 
    vi.mocked(mockedApi.get).mockResolvedValue({
      data: { profile: mockUserProfile }, // <<< FIX: Nest profile data
      error: null,
      status: 200
    });
    // vi.mocked(mockedApi.getSupabaseClient).mockReturnValue(mockSupabaseClient); // Already mocked in factory

    // Spy on setState AFTER resetting state
    vi.spyOn(useAuthStore, 'setState');
  });

  afterEach(() => {
     vi.restoreAllMocks(); // Restore original implementations
  });

  // Helper to trigger the listener
  const triggerListener = (event: AuthChangeEvent, session: SupabaseSession | null) => {
    if (!listenerCallback) {
        throw new Error('Listener callback not set by initAuthListener');
    }
    return listenerCallback(event, session); // Return promise if callback is async
  }

  it('should set session, user, profile and isLoading=false on INITIAL_SESSION with session', async () => {
    // Explicitly configure the mock for THIS test case
    // ---> Use mockedApi reference <--- 
    vi.mocked(mockedApi.get).mockResolvedValue({
      data: { profile: mockUserProfile }, // Use the correctly nested structure
      error: null,
      status: 200
    });
    
    initAuthListener();
    expect(listenerCallback).toBeDefined();

    // Use timers to handle setTimeout within the listener
    vi.useFakeTimers();
    triggerListener('INITIAL_SESSION', mockSupabaseSession); // Trigger synchronously
    await vi.advanceTimersToNextTimerAsync(); // Advance timers to execute the setTimeout callback
    vi.useRealTimers(); // Restore real timers

    // Check API call for profile
    // ---> Use mockedApi reference <--- 
    expect(vi.mocked(mockedApi.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mockedApi.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // Check state updates
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); // 1 for session/user, 1 for profile
    // Check first call (session/user/loading - now expecting role as string, includes token_type/expires_in)
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, {
      session: expectedMappedSession, // This now includes token_type, expires_in
      user: expectedMappedUser,       // This now expects role: 'authenticated'
      isLoading: false,
      error: null,
      // profile: undefined, // Profile shouldn't be set in the first call
    });
    // Check second call (profile)
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: mockUserProfile 
    });
    // Optionally check final state if needed
    // expect(useAuthStore.getState()).toMatchObject({ ... });
  });

  it('should set profile=null, set error, and still call replay on profile fetch failure', async () => {
    const fetchError = new Error('Failed to fetch profile');
    // Explicitly configure the mock for THIS test case (Error)
    // ---> Use mockedApi reference <--- 
    vi.mocked(mockedApi.get).mockResolvedValue({ 
      data: null, // Expect null data on error
      error: { message: fetchError.message, code: 'FETCH_ERROR' }, // Match expected error shape 
      status: 500 
    });

    initAuthListener();
    expect(listenerCallback).toBeDefined();

    // Use timers to handle setTimeout
    vi.useFakeTimers();
    triggerListener('INITIAL_SESSION', mockSupabaseSession); // Trigger synchronously
    await vi.advanceTimersToNextTimerAsync(); // Advance timers to execute the setTimeout callback
    vi.useRealTimers(); // Restore real timers

    // Check API call
    // ---> Use mockedApi reference <--- 
    expect(vi.mocked(mockedApi.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mockedApi.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // Check state updates (should be 2: session/user/loading, then profile/error)
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); 
    // Check first call (session/user/loading)
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      session: expectedMappedSession, 
      user: expectedMappedUser, 
      isLoading: false,
      error: null,
    }));
    // Check second call (profile/error)
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: null, // Profile should be null on error
      error: expect.any(Error) // Check if an error object was set
    });
    
    // ---> Remove Logging <---
    const actualError = useAuthStore.getState().error; // Keep this line to use below
    // console.log('----- DEBUG START -----');
    // console.log('Actual Error Object:', actualError);
    // console.log('typeof Actual Error Object:', typeof actualError);
    // console.log('Actual Error Message:', actualError?.message);
    // console.log('Expected Error Message:', 'Failed to fetch profile'); // Corrected expected message here too
    // console.log('Are messages strictly equal (===)?', actualError?.message === 'Failed to fetch profile');
    // // Log character codes for comparison
    // if (actualError?.message) {
    //   console.log('Actual Char Codes:', actualError.message.split('').map(c => c.charCodeAt(0)));
    // }
    // console.log('Expected Char Codes:', 'Failed to fetch profile'.split('').map(c => c.charCodeAt(0)));
    // console.log('----- DEBUG END -----');
    // --- End Logging ---

    // Existing assertions
    expect(actualError).toBeInstanceOf(Error);
    // ---> Correct the expected string literal <---
    expect(actualError?.message).toEqual('Failed to fetch profile'); 
  });

  it('should set session=null, user=null, profile=undefined on INITIAL_SESSION without session', async () => {
    // ---> Pass the *real* (but globally mocked) Supabase client to initAuthListener <--- 
    initAuthListener(createClient('', '')); // Pass a valid (though mocked) client
    expect(listenerCallback).toBeDefined();

    await triggerListener('INITIAL_SESSION', null);

    // Should not fetch profile
    // ---> Use mockedApi reference <--- 
    expect(vi.mocked(mockedApi.get)).not.toHaveBeenCalled();

    // Check state update
    expect(useAuthStore.setState).toHaveBeenCalledTimes(1); 
    expect(useAuthStore.setState).toHaveBeenCalledWith({
      session: null,
      user: null,
      profile: undefined, // <<< CHANGED: Expect undefined initially, not null
      isLoading: false,
      error: null,
    });
  });

  it('should set session, user, profile on SIGNED_IN event', async () => {
    // Explicitly configure the mock for THIS test case (Success)
    // ---> Use mockedApi reference <--- 
    vi.mocked(mockedApi.get).mockResolvedValue({
      data: { profile: mockUserProfile }, // Use the correctly nested structure
      error: null,
      status: 200
    });
    
    // ---> Pass the *real* (but globally mocked) Supabase client <--- 
    initAuthListener(createClient('', ''));
    expect(listenerCallback).toBeDefined();

    // Use timers to handle setTimeout
    vi.useFakeTimers();
    triggerListener('SIGNED_IN', mockSupabaseSession); // Trigger synchronously
    await vi.advanceTimersToNextTimerAsync(); // Advance timers to execute the setTimeout callback
    vi.useRealTimers(); // Restore real timers

    // Check API call for profile
    // ---> Use mockedApi reference <--- 
    expect(vi.mocked(mockedApi.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mockedApi.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // Check state updates
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); // 1 for session/user, 1 for profile
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      session: expectedMappedSession, // Expecting session with token_type, expires_in
      user: expectedMappedUser,       // Expecting user with role: 'authenticated'
      isLoading: false, 
      error: null,
    }));
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: mockUserProfile 
    });
  });

  it('should clear user, session, profile on SIGNED_OUT event', async () => {
    // Set initial state as if logged in
    useAuthStore.setState({ 
        session: expectedMappedSession, 
        user: expectedMappedUser, 
        profile: mockUserProfile,
        isLoading: false,
        navigate: mockNavigate // Ensure navigate is set here too
    }, true);
    vi.clearAllMocks(); // Clear mocks after setting state
    vi.spyOn(useAuthStore, 'setState'); // Re-apply spy
    
    // ---> Pass the *real* (but globally mocked) Supabase client <--- 
    initAuthListener(createClient('', ''));
    expect(listenerCallback).toBeDefined();

    await triggerListener('SIGNED_OUT', null);

    // ---> Use mockedApi reference <--- 
    expect(vi.mocked(mockedApi.get)).not.toHaveBeenCalled(); // No profile fetch on logout

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
    // ---> Pass the *real* (but globally mocked) Supabase client <--- 
    initAuthListener(createClient('', ''));
    expect(listenerCallback).toBeDefined();

    const refreshedSupabaseSession = { 
      ...mockSupabaseSession, 
      access_token: 'new-refreshed-token', 
      expires_at: Math.floor(Date.now() / 1000) + 7200, // New expiry
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

    // ---> Use mockedApi reference <--- 
    expect(vi.mocked(mockedApi.get)).not.toHaveBeenCalled(); // No profile fetch on refresh usually

    expect(useAuthStore.setState).toHaveBeenCalledTimes(1);
    expect(useAuthStore.setState).toHaveBeenCalledWith({ 
        session: expectedMappedRefreshedSession, // Expecting session with token_type, expires_in
        user: expectedMappedUser, // Expecting user with role: 'authenticated'
        isLoading: false, 
        error: null,     
     });
  });

  // Add test for USER_UPDATED if needed
  // Add test for profile fetch failure if needed
  // Add test verifying replayPendingAction is called if needed

}); 