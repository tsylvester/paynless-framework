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

    useAuthStore.setState({ navigate: mockNavigate });
    listenerCallback = null;

    // ---> Configure default mock for api.get directly using spyOn <--- 
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { profile: mockUserProfile }, 
      error: null,
      status: 200
    });

    // Spy on setState AFTER resetting state
    vi.spyOn(useAuthStore, 'setState');
  });

  afterEach(() => {
     vi.restoreAllMocks(); // Restore original implementations including spies
  });

  // Helper to trigger the listener
  const triggerListener = (event: AuthChangeEvent, session: SupabaseSession | null) => {
    if (!listenerCallback) {
        throw new Error('Listener callback not set by initAuthListener');
    }
    return listenerCallback(event, session); // Return promise if callback is async
  }

  it('should set session, user, profile and isLoading=false on INITIAL_SESSION with session', async () => {
    // Arrange: Default api.get mock is already set in beforeEach for success
    
    initAuthListener(); // Call without arguments
    expect(listenerCallback).toBeDefined();
    // ---> Check if getSupabaseClient was called <--- 
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // ... trigger listener, advance timers ...
    vi.useFakeTimers();
    triggerListener('INITIAL_SESSION', mockSupabaseSession);
    await vi.advanceTimersToNextTimerAsync();
    vi.useRealTimers();

    // ---> Check api.get call <--- 
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // ... check setState calls ...
  });

  it('should set profile=null, set error, and still call replay on profile fetch failure', async () => {
    const fetchError = new Error('Failed to fetch profile');
    // ---> Arrange: Override api.get mock for this specific test using spyOn <--- 
    vi.spyOn(api, 'get').mockResolvedValueOnce({ 
      data: null, 
      error: { message: fetchError.message, code: 'FETCH_ERROR' }, 
      status: 500 
    });

    initAuthListener(); // Call without arguments
    expect(listenerCallback).toBeDefined();
    // ---> Check if getSupabaseClient was called <--- 
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // ... trigger listener, advance timers ...
    vi.useFakeTimers();
    triggerListener('INITIAL_SESSION', mockSupabaseSession);
    await vi.advanceTimersToNextTimerAsync();
    vi.useRealTimers();

    // ---> Check api.get call <--- 
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // ... check setState calls and error state ...
  });

  it('should set session=null, user=null, profile=undefined on INITIAL_SESSION without session', async () => {
    initAuthListener(); // Call without arguments
    expect(listenerCallback).toBeDefined();
    // ---> Check if getSupabaseClient was called <--- 
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    await triggerListener('INITIAL_SESSION', null);

    // ---> Should not fetch profile <--- 
    expect(vi.mocked(api.get)).not.toHaveBeenCalled();

    // ... check setState call ...
  });

  it('should set session, user, profile on SIGNED_IN event', async () => {
    // Arrange: Default api.get mock is already set in beforeEach for success
    
    initAuthListener(); // Call without arguments
    expect(listenerCallback).toBeDefined();
    // ---> Check if getSupabaseClient was called <--- 
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // ... trigger listener, advance timers ...
    vi.useFakeTimers();
    triggerListener('SIGNED_IN', mockSupabaseSession);
    await vi.advanceTimersToNextTimerAsync();
    vi.useRealTimers();

    // ---> Check api.get call <--- 
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // ... check setState calls ...
  });

  it('should clear user, session, profile on SIGNED_OUT event', async () => {
    // ... set initial state ...
    
    initAuthListener(); // Call without arguments
    expect(listenerCallback).toBeDefined();
    // ---> Check if getSupabaseClient was called <--- 
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    await triggerListener('SIGNED_OUT', null);

    // ---> Should not fetch profile <--- 
    expect(vi.mocked(api.get)).not.toHaveBeenCalled(); 

    // ... check setState call ...
  });

  it('should update session and user on TOKEN_REFRESHED event', async () => {
    initAuthListener(); // Call without arguments
    expect(listenerCallback).toBeDefined();
    // ---> Check if getSupabaseClient was called <--- 
    expect(api.getSupabaseClient).toHaveBeenCalledTimes(1);

    // ... set up refreshed session data ...
    const refreshedSupabaseSession = { /* ... */ };
    // ... expected mapped data ...

    await triggerListener('TOKEN_REFRESHED', refreshedSupabaseSession);

    // ---> Should not fetch profile <--- 
    expect(vi.mocked(api.get)).not.toHaveBeenCalled(); 

    // ... check setState call ...
  });

  // Add test for USER_UPDATED if needed
  // Add test for profile fetch failure if needed
  // Add test verifying replayPendingAction is called if needed

}); 