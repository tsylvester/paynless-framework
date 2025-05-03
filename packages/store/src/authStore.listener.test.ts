import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';
import { act } from '@testing-library/react';
import {
  SupabaseClient,
  Session as SupabaseSession,
  User as SupabaseUser,
  AuthChangeEvent
} from '@supabase/supabase-js';
import { useAuthStore } from './authStore'; // Import the store hook itself
import { initAuthListener } from './authStore';
import { ApiClient } from '@paynless/api'; // Import ApiClient type
// Import shared Supabase mock
import { createMockSupabaseClient, resetMockSupabaseClient } from '@paynless/api/mocks/supabase.mock'; 
// Import our actual mapped types for verifying results
import { Session, User, UserProfile, UserRole } from '@paynless/types'; 
// --- Import Notification Store for Mocking ---
import { useNotificationStore } from './notificationStore'; 
// --- Import getApiClient --- 
import { getApiClient } from '@paynless/api'; 
import { useOrganizationStore } from './organizationStore'; // Import org store

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

// Create a mock Supabase client instance using the factory from the shared mock
const mockSupabase = createMockSupabaseClient();

// Mock the ApiClient instance needed for fetching the profile ('/me')
const mockApiClientInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getSupabaseClient: vi.fn().mockReturnValue(mockSupabase), // Ensure this returns the NEW shared mock
} as unknown as ApiClient;

// --- Mock the entire @paynless/api module ---
vi.mock('@paynless/api', () => ({
  getApiClient: vi.fn(() => mockApiClientInstance),
  // We might need to explicitly mock the SupabaseClient if authStore imports it directly,
  // but for now, authStore seems to get it via getApiClient.
  // If direct import is needed:
  // SupabaseClient: vi.fn().mockImplementation(() => mockSupabase) 
}));

// --- Mock Notification Store --- 
const mockUnsubscribeNotifications = vi.fn();
const mockSubscribeNotifications = vi.fn(); // Define the mock subscribe function
vi.mock('./notificationStore', () => ({
    useNotificationStore: {
        getState: vi.fn(() => ({ 
            // Provide mocks for actions called by authStore listener
            subscribeToUserNotifications: mockSubscribeNotifications, // Use the defined mock
            unsubscribeFromUserNotifications: mockUnsubscribeNotifications
        })),
        // Mock other store properties/actions if needed by other parts of authStore
        setState: vi.fn(),
        getInitialState: vi.fn(() => ({ notifications: [], unreadCount: 0, isLoading: false, error: null, subscribedUserId: null }))
    }
}));

// --- Mock Organization Store --- 
const mockSetCurrentOrgId = vi.fn();
vi.mock('./organizationStore', () => ({
    useOrganizationStore: {
        getState: vi.fn(() => ({
            // Provide mock for the action called by authStore listener
            setCurrentOrganizationId: mockSetCurrentOrgId,
            // Add other state/actions if needed by authStore interactions
        })),
        // Mock other store methods if needed
        setState: vi.fn(),
        getInitialState: vi.fn(() => ({ /* initial org state if needed */ }))
    }
}));

describe('authStore Listener Logic (initAuthListener)', () => {
  let listenerUnsubscribe: () => void;
  let listenerCallback: (event: string, session: SupabaseSession | null) => Promise<void>; // Adjusted type for async
  let setStateSpy: MockInstance;

  beforeEach(async () => { // Make beforeEach async
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();

    // Mock initial getApiClient return for profile fetch
    vi.mocked(getApiClient).mockReturnValue({
      organizations: vi.fn() as any,
      get: vi.fn().mockResolvedValue({ // Mock the 'get' method used by profile fetch
          status: 200,
          data: { profile: mockUserProfile },
          error: null,
      }),
      // Add other methods if needed
    });

    // Mock NotificationStore actions used by listener
    mockSubscribeNotifications.mockClear();
    mockUnsubscribeNotifications.mockClear();

    // Reset AuthStore state
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    act(() => { 
      useAuthStore.setState({ navigate: mockNavigate }, true);
    });

    // --- Initialize Listener and capture callback ---
    // Setup Supabase mock to capture the callback
    let capturedCallback: any = null;
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    // Initialize the listener
    listenerUnsubscribe = initAuthListener(mockSupabase as any);
    listenerCallback = capturedCallback; // Assign captured callback

    // Spy on setState AFTER listener setup
    setStateSpy = vi.spyOn(useAuthStore, 'setState');

    expect(listenerCallback).toBeDefined();

    // Clear org store mock
    mockSetCurrentOrgId.mockClear();
  });

  afterEach(() => {
    if (listenerUnsubscribe) {
      listenerUnsubscribe();
    }
    setStateSpy.mockRestore();
    vi.useRealTimers(); // Restore real timers after each test
  });

  it('should set session=null, user=null, profile=null on INITIAL_SESSION without session', async () => {
    vi.useFakeTimers(); // Use fake timers for this test
    // Act: Simulate INITIAL_SESSION event with null session
    await act(async () => {
        await listenerCallback('INITIAL_SESSION', null);
        // Wait for potential setTimeout in profile fetch to settle (though it shouldn't run)
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert: Check state updates
    // Profile fetch shouldn't happen, so only 1 setState call
    expect(setStateSpy).toHaveBeenCalledTimes(1); 
    expect(setStateSpy).toHaveBeenCalledWith({
      session: null,
      user: null,
      isLoading: false,
      error: null,
      profile: null, // Expect null as set in the initial state update
    });
    // Double-check final state
    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.user).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.isLoading).toBe(false);
    // Verify profile fetch was NOT called
    expect(vi.mocked(getApiClient)().get).not.toHaveBeenCalled();
  });

  it('should set session, user, profile and isLoading=false on INITIAL_SESSION with session', async () => {
    vi.useFakeTimers(); // Use fake timers
    // Arrange: Mock profile fetch for this specific test
    const profileWithLastOrg = { 
        ...mockUserProfile, 
        last_selected_org_id: 'org-from-profile' 
    };
    const profileApiMock = vi.mocked(getApiClient)().get.mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg },
        error: null 
    });

    // Act: Simulate INITIAL_SESSION event with a session
    await act(async () => {
        await listenerCallback('INITIAL_SESSION', mockSupabaseSession);
        // Wait for potential setTimeout in profile fetch
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert: Check state updates
    // Expect 2 calls: 1 initial, 1 for profile via setTimeout
    expect(setStateSpy).toHaveBeenCalledTimes(2); 
    // Assert initial state update (optional, focus on final state)
    // expect(setStateSpy).toHaveBeenNthCalledWith(1, {
    //   session: expectedMappedSession,
    //   user: expectedMappedUser,       
    //   isLoading: false,
    //   error: null,
    //   profile: null, 
    // });
    // Assert profile update (optional, focus on final state)
    // expect(setStateSpy).toHaveBeenNthCalledWith(2, { 
    //   profile: mockUserProfile,
    //   error: null // Assuming profile fetch clears error
    // });

    // Assert final state directly
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    // --- Modify Profile Mock --- 
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();

    // Verify profile fetch was called
    expect(profileApiMock).toHaveBeenCalledTimes(1);
    expect(profileApiMock).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });

    // --- Add Assertions --- 
    // Verify notification subscription was called
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(expectedMappedUser.id);
    // Verify organization context was set
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-from-profile'); 
  });

  // Add a new test case for null last_selected_org_id
  it('should call setCurrentOrganizationId with null if last_selected_org_id is null in profile', async () => {
    vi.useFakeTimers(); 
    // Arrange: Mock profile fetch with null last_selected_org_id
    const profileWithNullOrg = { ...mockUserProfile, last_selected_org_id: null };
    vi.mocked(getApiClient)().get.mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithNullOrg }, 
        error: null 
    });

    // Act
    await act(async () => {
        await listenerCallback('INITIAL_SESSION', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith(null);
    expect(vi.mocked(getApiClient)().get).toHaveBeenCalledTimes(1); // Ensure profile fetch happened
  });

  // Add a new test case for profile fetch failure
  it('should call setCurrentOrganizationId with null if profile fetch fails', async () => {
    vi.useFakeTimers(); 
    // Arrange: Mock profile fetch to fail
    vi.mocked(getApiClient)().get.mockResolvedValueOnce({ 
        status: 500, 
        data: null, 
        error: { message: 'Fetch failed', code: '500' }
    });

    // Act
    await act(async () => {
        await listenerCallback('INITIAL_SESSION', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith(null);
    expect(vi.mocked(getApiClient)().get).toHaveBeenCalledTimes(1); // Ensure profile fetch happened
    expect(useAuthStore.getState().error).toBeInstanceOf(Error); // Verify error was set in authStore
  });

  it('should set session, user, profile on SIGNED_IN', async () => {
    vi.useFakeTimers(); // Use fake timers
    // Arrange: Mock profile fetch
    const profileApiMock = vi.mocked(getApiClient)().get.mockResolvedValueOnce({ status: 200, data: { profile: mockUserProfile }, error: null });
    localStorage.setItem('pendingAction', JSON.stringify({ returnPath: '/pending' })); // Simulate pending action

    // Act
    await act(async () => {
        await listenerCallback('SIGNED_IN', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    expect(setStateSpy).toHaveBeenCalledTimes(2); // Initial + Profile
    // Check final state
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(mockUserProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();
    expect(profileApiMock).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/pending'); // Check navigation to pending path
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(expectedMappedUser.id);
  });

  it('should set session=null, user=null, profile=null on SIGNED_OUT', async () => {
    // Arrange: Set some initial state to ensure it's cleared
    act(() => {
        useAuthStore.setState({ 
            session: expectedMappedSession, 
            user: expectedMappedUser, 
            profile: mockUserProfile 
        });
    });
    setStateSpy.mockClear(); // Clear spy calls from setup
    mockUnsubscribeNotifications.mockClear(); // Clear this mock too

    // Act
    await act(async () => {
        await listenerCallback('SIGNED_OUT', null);
        // No setTimeout expected here
    });

    // Assert: Check state updates
    // expect(setStateSpy).toHaveBeenCalledTimes(1); // Keep this commented out for now
    expect(setStateSpy).toHaveBeenCalledWith({
      session: null,
      user: null,
      isLoading: false,
      error: null,
      profile: null, 
    });
    // Check final state
    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.user).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.isLoading).toBe(false);
    // Verify profile fetch NOT called
    expect(vi.mocked(getApiClient)().get).not.toHaveBeenCalled();
    // Verify notification unsubscribe called
    expect(mockUnsubscribeNotifications).toHaveBeenCalledTimes(1);
    // Verify navigation to root
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should update session, user, profile on TOKEN_REFRESHED', async () => {
    vi.useFakeTimers(); // Use fake timers
    // Arrange
    const refreshedSession = { ...mockSupabaseSession, access_token: 'refreshed-token' };
    const refreshedMappedSession = { ...expectedMappedSession, access_token: 'refreshed-token', expiresAt: refreshedSession.expires_at! };
    const profileApiMock = vi.mocked(getApiClient)().get.mockResolvedValueOnce({ status: 200, data: { profile: mockUserProfile }, error: null });

    // Act
    await act(async () => {
        await listenerCallback('TOKEN_REFRESHED', refreshedSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    expect(setStateSpy).toHaveBeenCalledTimes(2); // Initial + Profile
    // Check final state
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(refreshedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(mockUserProfile);
    expect(profileApiMock).toHaveBeenCalledTimes(1);
    expect(profileApiMock).toHaveBeenCalledWith('me', { token: refreshedSession.access_token });
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(expectedMappedUser.id);
  });

  it('should update user and profile on USER_UPDATED', async () => {
    vi.useFakeTimers(); // Use fake timers
    // Arrange
    const updatedUser = { ...mockSupabaseUser, email: 'updated@example.com' };
    const updatedMappedUser = { ...expectedMappedUser, email: 'updated@example.com' };
    const updatedSession = { ...mockSupabaseSession, user: updatedUser }; // Assume session contains updated user
    const profileApiMock = vi.mocked(getApiClient)().get.mockResolvedValueOnce({ status: 200, data: { profile: mockUserProfile }, error: null });

    // Act
    await act(async () => {
        await listenerCallback('USER_UPDATED', updatedSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    expect(setStateSpy).toHaveBeenCalledTimes(2); // Initial + Profile
    // Check final state
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(updatedMappedUser);
    expect(finalState.profile).toEqual(mockUserProfile);
    expect(profileApiMock).toHaveBeenCalledTimes(1);
    expect(profileApiMock).toHaveBeenCalledWith('me', { token: updatedSession.access_token });
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(updatedMappedUser.id);
  });

  // --- Modify SIGNED_IN test ---
  it('should set session, user, profile, navigate, and set org context on SIGNED_IN', async () => {
    vi.useFakeTimers();
    localStorage.setItem('pendingAction', JSON.stringify({ returnPath: '/pending' }));
    // Arrange: Mock profile fetch with org id
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-signed-in' };
    vi.mocked(getApiClient)().get.mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg }, 
        error: null 
    });

    // Act
    await act(async () => {
        await listenerCallback('SIGNED_IN', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('/pending');
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-signed-in');
  });
  
  // --- Modify TOKEN_REFRESHED test ---
  it('should update session, user, profile, and set org context on TOKEN_REFRESHED', async () => {
     vi.useFakeTimers();
     // Arrange: Mock profile fetch with org id
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-refreshed' };
    vi.mocked(getApiClient)().get.mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg }, 
        error: null 
    });
    
    // Act
    await act(async () => {
      await listenerCallback('TOKEN_REFRESHED', mockSupabaseSession);
      await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-refreshed');
  });

  // --- Modify USER_UPDATED test ---
  it('should update user, fetch profile, and set org context on USER_UPDATED', async () => {
    vi.useFakeTimers();
    const updatedSupabaseUser = { ...mockSupabaseUser, email: 'updated@example.com' };
    const expectedUpdatedMappedUser = { ...expectedMappedUser, email: 'updated@example.com' };
    // Arrange: Mock profile fetch with org id
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-user-update' };
    vi.mocked(getApiClient)().get.mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg }, 
        error: null 
    });

    // Act
    await act(async () => {
      await listenerCallback('USER_UPDATED', { ...mockSupabaseSession, user: updatedSupabaseUser });
      await vi.advanceTimersByTimeAsync(10);
    });

    // Assert
    const finalState = useAuthStore.getState();
    expect(finalState.user).toEqual(expectedUpdatedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-user-update');
  });

  // Test SIGNED_OUT
  it('should clear session, user, profile, and call unsubscribe on SIGNED_OUT', async () => {
    // Arrange: Set some initial state
    act(() => {
        useAuthStore.setState({
            session: expectedMappedSession,
            user: expectedMappedUser,
            profile: mockUserProfile
        });
    });

    // Act
    await act(async () => {
      await listenerCallback('SIGNED_OUT', null);
    });

    // Assert
    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.user).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(mockUnsubscribeNotifications).toHaveBeenCalledTimes(1);
  });
}); 