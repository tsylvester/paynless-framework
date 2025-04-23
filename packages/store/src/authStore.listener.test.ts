import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SupabaseClient,
  Session as SupabaseSession,
  User as SupabaseUser,
  AuthChangeEvent
} from '@supabase/supabase-js';
import { useAuthStore } from './authStore'; // Import the store hook itself
import { initAuthListener } from './authStore';
import { ApiClient } from '@paynless/api-client'; // Import ApiClient type
// Import our actual mapped types for verifying results
import { Session, User, UserProfile, UserRole } from '@paynless/types'; 

// Mock the replayPendingAction function
vi.mock('./lib/replayPendingAction', () => ({
  replayPendingAction: vi.fn().mockResolvedValue(false), // Mock implementation
}));


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

const mockProfileData: UserProfile = {
    id: 'user-123',
    first_name: 'Testy',
    last_name: 'McTestface',
    role: UserRole.USER,
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-10T10:00:00Z',
    // avatarUrl etc. 
};

// --- Mocks for Dependencies ---
let listenerCallback: AuthStateChangeListener | null = null;
const mockUnsubscribe = vi.fn();

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

const mockApiClientInstance = {
    get: vi.fn(),
    post: vi.fn(), // Mock other methods if needed by replay
    put: vi.fn(),
    delete: vi.fn(),
    getSupabaseClient: vi.fn().mockReturnValue(mockSupabaseClient), // Needed by replay
} as unknown as ApiClient;


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

    // Reset listener callback store
    listenerCallback = null;

    // Mock API calls
    mockApiClientInstance.get = vi.fn().mockResolvedValue({ data: mockProfileData, error: null, status: 200 });
    mockApiClientInstance.getSupabaseClient = vi.fn().mockReturnValue(mockSupabaseClient);

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
    initAuthListener(mockSupabaseClient, mockApiClientInstance); // Pass mock API client
    expect(listenerCallback).toBeDefined();

    await triggerListener('INITIAL_SESSION', mockSupabaseSession);

    // Check API call for profile
    expect(mockApiClientInstance.get).toHaveBeenCalledTimes(1);
    expect(mockApiClientInstance.get).toHaveBeenCalledWith('/me', { token: mockSupabaseSession.access_token });

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
      profile: mockProfileData 
    });
    // Optionally check final state if needed
    // expect(useAuthStore.getState()).toMatchObject({ ... });
  });

  it('should set session=null, user=null, profile=null, isLoading=false on INITIAL_SESSION without session', async () => {
    initAuthListener(mockSupabaseClient, mockApiClientInstance);
    expect(listenerCallback).toBeDefined();

    await triggerListener('INITIAL_SESSION', null);

    // Should not fetch profile
    expect(mockApiClientInstance.get).not.toHaveBeenCalled();

    // Check state update
    expect(useAuthStore.setState).toHaveBeenCalledTimes(1); 
    expect(useAuthStore.setState).toHaveBeenCalledWith({
      session: null,
      user: null,
      profile: null, // Profile should be set null here in the single call
      isLoading: false,
      error: null,
    });
  });

  it('should set session, user, profile on SIGNED_IN event', async () => {
    initAuthListener(mockSupabaseClient, mockApiClientInstance);
    expect(listenerCallback).toBeDefined();

    await triggerListener('SIGNED_IN', mockSupabaseSession);

    // Check API call for profile
    expect(mockApiClientInstance.get).toHaveBeenCalledTimes(1);
    expect(mockApiClientInstance.get).toHaveBeenCalledWith('/me', { token: mockSupabaseSession.access_token });

    // Check state updates
    expect(useAuthStore.setState).toHaveBeenCalledTimes(2); // 1 for session/user, 1 for profile
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      session: expectedMappedSession, // Expecting session with token_type, expires_in
      user: expectedMappedUser,       // Expecting user with role: 'authenticated'
      isLoading: false, 
      error: null,
    }));
    expect(useAuthStore.setState).toHaveBeenNthCalledWith(2, { 
      profile: mockProfileData 
    });
  });

  it('should clear user, session, profile on SIGNED_OUT event', async () => {
    // Set initial state as if logged in
    useAuthStore.setState({ 
        session: expectedMappedSession, 
        user: expectedMappedUser, 
        profile: mockProfileData,
        isLoading: false 
    }, true);
    vi.clearAllMocks(); // Clear mocks after setting state
    vi.spyOn(useAuthStore, 'setState'); // Re-apply spy
    
    initAuthListener(mockSupabaseClient, mockApiClientInstance);
    expect(listenerCallback).toBeDefined();

    await triggerListener('SIGNED_OUT', null);

    expect(mockApiClientInstance.get).not.toHaveBeenCalled(); // No profile fetch on logout

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
    initAuthListener(mockSupabaseClient, mockApiClientInstance);
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

    expect(mockApiClientInstance.get).not.toHaveBeenCalled(); // No profile fetch on refresh usually

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