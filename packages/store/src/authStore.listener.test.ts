import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { act } from '@testing-library/react';
import {
  SupabaseClient,
  Session as SupabaseSession,
  User as SupabaseUser,
  AuthChangeEvent,
  Subscription,
} from '@supabase/supabase-js';
import { useAuthStore, initAuthListener } from './authStore';
import { getApiClient } from '@paynless/api';
import {
  mockApiClient,
  resetMockApiClient,
} from '@paynless/api/mocks';
import { Session, User, UserProfile } from '@paynless/types';
import { useNotificationStore } from './notificationStore';
import { useOrganizationStore } from './organizationStore';
import { Database } from '@paynless/db-types';

type AuthStateChangeListener = (event: AuthChangeEvent, session: SupabaseSession | null) => void;

vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...original,
        getApiClient: vi.fn(() => mockApiClient),
    };
});

const mockUnsubscribeNotifications = vi.fn();
const mockSubscribeNotifications = vi.fn();
vi.mock('./notificationStore', () => ({
    useNotificationStore: {
        getState: vi.fn(() => ({ 
            subscribeToUserNotifications: mockSubscribeNotifications,
            unsubscribeFromUserNotifications: mockUnsubscribeNotifications,
        })),
        setState: vi.fn(),
        getInitialState: vi.fn(() => ({ notifications: [], unreadCount: 0, isLoading: false, error: null, subscribedUserId: null })),
    }
}));

const mockSetCurrentOrgId = vi.fn();
vi.mock('./organizationStore', () => ({
    useOrganizationStore: {
        getState: vi.fn(() => ({
            setCurrentOrganizationId: mockSetCurrentOrgId,
        })),
        setState: vi.fn(),
        getInitialState: vi.fn(() => ({ /* initial org state if needed */ })),
    }
}));

const mockSupabaseUser: SupabaseUser = {
  id: 'user-123',
  app_metadata: { provider: 'email' },
  user_metadata: { name: 'Test User' },
  aud: 'authenticated',
  email: 'test@example.com',
  phone: '',
  created_at: '2023-01-01T10:00:00Z',
  updated_at: '2023-01-10T10:00:00Z',
  role: 'user',
};

const mockSupabaseSession: SupabaseSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  user: mockSupabaseUser,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

const expectedMappedUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'user',
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
    chat_context: null,
    has_seen_welcome_modal: false,
    is_subscribed_to_newsletter: false,
    last_selected_org_id: null,
    profile_privacy_setting: 'private',
};

const mockNavigate = vi.fn();
const mockSubscription: Subscription = {
  id: 'test-subscription',
  unsubscribe: vi.fn(),
  callback: vi.fn(),
};

describe('authStore Listener Logic (initAuthListener)', () => {
  let listenerUnsubscribe: () => void;
  let listenerCallback: AuthStateChangeListener;
  let setStateSpy: MockInstance;
  let mockSupabase: SupabaseClient<Database>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
    resetMockApiClient();

    // Create a fully typed mock Supabase client
    mockSupabase = {
      auth: {
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: mockSubscription } }),
      },
    } as unknown as SupabaseClient<Database>;
    
    // Since getApiClient is mocked to return mockApiClient,
    // we need to ensure mockApiClient returns our mockSupabase
    vi.spyOn(mockApiClient, 'getSupabaseClient').mockReturnValue(mockSupabase);
    
    let capturedCallback: AuthStateChangeListener | null = null;
    vi.mocked(mockSupabase.auth.onAuthStateChange).mockImplementation((callback) => {
      capturedCallback = callback;
      return { data: { subscription: mockSubscription } };
    });
    
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    act(() => { 
      useAuthStore.setState({ navigate: mockNavigate }, true);
    });

    // Pass the correctly typed mock client
    listenerUnsubscribe = initAuthListener(mockSupabase);
    listenerCallback = capturedCallback!;

    setStateSpy = vi.spyOn(useAuthStore, 'setState');
    expect(listenerCallback).toBeDefined();
  });

  afterEach(() => {
    if (listenerUnsubscribe) listenerUnsubscribe();
    setStateSpy.mockRestore();
    vi.useRealTimers();
  });

  it('should set session=null, user=null, profile=null on INITIAL_SESSION without session', async () => {
    vi.useFakeTimers();
    await act(async () => {
        await listenerCallback('INITIAL_SESSION', null);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(setStateSpy).toHaveBeenCalledTimes(1); 
    expect(setStateSpy).toHaveBeenCalledWith({
      session: null,
      user: null,
      isLoading: false,
      error: null,
      profile: null,
    });
    
    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.user).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.isLoading).toBe(false);
    expect(mockApiClient.get).not.toHaveBeenCalled();
  });

  it('should set session, user, profile and isLoading=false on INITIAL_SESSION with session', async () => {
    vi.useFakeTimers();
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-from-profile' };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg },
        error: undefined 
    });

    await act(async () => {
        await listenerCallback('INITIAL_SESSION', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(setStateSpy).toHaveBeenCalledTimes(2); 
    
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.get).toHaveBeenCalledWith('me', { token: mockSupabaseSession.access_token });
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(expectedMappedUser.id);
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-from-profile'); 
  });

  it('should call setCurrentOrganizationId with null if last_selected_org_id is null in profile', async () => {
    vi.useFakeTimers(); 
    const profileWithNullOrg = { ...mockUserProfile, last_selected_org_id: null };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithNullOrg }, 
        error: undefined 
    });

    await act(async () => {
        await listenerCallback('INITIAL_SESSION', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(mockSetCurrentOrgId).toHaveBeenCalledWith(null);
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
  });

  it('should call setCurrentOrganizationId with null if profile fetch fails', async () => {
    vi.useFakeTimers(); 
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ 
        status: 500, 
        data: undefined, 
        error: { message: 'Fetch failed', code: '500' }
    });

    await act(async () => {
        await listenerCallback('INITIAL_SESSION', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(mockSetCurrentOrgId).toHaveBeenCalledWith(null);
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().error).toBeInstanceOf(Error);
  });

  it('should set session, user, profile on SIGNED_IN', async () => {
    vi.useFakeTimers();
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ status: 200, data: { profile: mockUserProfile }, error: undefined });
    localStorage.setItem('pendingAction', JSON.stringify({ returnPath: '/pending' }));

    await act(async () => {
        await listenerCallback('SIGNED_IN', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(setStateSpy).toHaveBeenCalledTimes(2);
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(mockUserProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/pending');
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(expectedMappedUser.id);
  });

  it('should set session=null, user=null, profile=null on SIGNED_OUT', async () => {
    act(() => {
        useAuthStore.setState({ 
            session: expectedMappedSession, 
            user: expectedMappedUser, 
            profile: mockUserProfile 
        });
    });
    setStateSpy.mockClear();
    mockUnsubscribeNotifications.mockClear();

    await act(async () => {
        await listenerCallback('SIGNED_OUT', null);
    });

    expect(setStateSpy).toHaveBeenCalledWith({
      session: null,
      user: null,
      isLoading: false,
      error: null,
      profile: null, 
    });
    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.user).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(finalState.isLoading).toBe(false);
    expect(mockApiClient.get).not.toHaveBeenCalled();
    expect(mockUnsubscribeNotifications).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should update session, user, profile on TOKEN_REFRESHED', async () => {
    vi.useFakeTimers();
    const refreshedSession = { ...mockSupabaseSession, access_token: 'refreshed-token' };
    const refreshedMappedSession = { ...expectedMappedSession, access_token: 'refreshed-token' };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ status: 200, data: { profile: mockUserProfile }, error: undefined });

    await act(async () => {
        await listenerCallback('TOKEN_REFRESHED', refreshedSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(setStateSpy).toHaveBeenCalledTimes(2);
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(refreshedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(mockUserProfile);
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.get).toHaveBeenCalledWith('me', { token: refreshedSession.access_token });
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(expectedMappedUser.id);
  });

  it('should update user and profile on USER_UPDATED', async () => {
    vi.useFakeTimers();
    const updatedUser = { ...mockSupabaseUser, email: 'updated@example.com' };
    const updatedMappedUser = { ...expectedMappedUser, email: 'updated@example.com' };
    const updatedSession = { ...mockSupabaseSession, user: updatedUser };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ status: 200, data: { profile: mockUserProfile }, error: undefined });

    await act(async () => {
        await listenerCallback('USER_UPDATED', updatedSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    expect(setStateSpy).toHaveBeenCalledTimes(2);
    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(updatedMappedUser);
    expect(finalState.profile).toEqual(mockUserProfile);
    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.get).toHaveBeenCalledWith('me', { token: updatedSession.access_token });
    expect(mockSubscribeNotifications).toHaveBeenCalledWith(updatedMappedUser.id);
  });

  it('should set session, user, profile, navigate, and set org context on SIGNED_IN', async () => {
    vi.useFakeTimers();
    localStorage.setItem('pendingAction', JSON.stringify({ returnPath: '/pending' }));
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-signed-in' };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg }, 
        error: undefined 
    });

    await act(async () => {
        await listenerCallback('SIGNED_IN', mockSupabaseSession);
        await vi.advanceTimersByTimeAsync(10);
    });

    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('/pending');
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-signed-in');
  });
  
  it('should update session, user, profile, and set org context on TOKEN_REFRESHED', async () => {
     vi.useFakeTimers();
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-refreshed' };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg }, 
        error: undefined 
    });
    
    await act(async () => {
      await listenerCallback('TOKEN_REFRESHED', mockSupabaseSession);
      await vi.advanceTimersByTimeAsync(10);
    });

    const finalState = useAuthStore.getState();
    expect(finalState.session).toEqual(expectedMappedSession);
    expect(finalState.user).toEqual(expectedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-refreshed');
  });

  it('should update user, fetch profile, and set org context on USER_UPDATED', async () => {
    vi.useFakeTimers();
    const updatedSupabaseUser = { ...mockSupabaseUser, email: 'updated@example.com' };
    const expectedUpdatedMappedUser = { ...expectedMappedUser, email: 'updated@example.com' };
    const updatedSession = { ...mockSupabaseSession, user: updatedSupabaseUser };
    const profileWithLastOrg = { ...mockUserProfile, last_selected_org_id: 'org-user-update' };
    vi.mocked(mockApiClient.get).mockResolvedValueOnce({ 
        status: 200, 
        data: { profile: profileWithLastOrg }, 
        error: undefined 
    });

    await act(async () => {
      await listenerCallback('USER_UPDATED', updatedSession);
      await vi.advanceTimersByTimeAsync(10);
    });

    const finalState = useAuthStore.getState();
    expect(finalState.user).toEqual(expectedUpdatedMappedUser);
    expect(finalState.profile).toEqual(profileWithLastOrg);
    expect(finalState.isLoading).toBe(false);
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-user-update');
  });

  it('should clear session, user, profile, and call unsubscribe on SIGNED_OUT', async () => {
    act(() => {
        useAuthStore.setState({
            session: expectedMappedSession,
            user: expectedMappedUser,
            profile: mockUserProfile
        });
    });

    await act(async () => {
      await listenerCallback('SIGNED_OUT', null);
    });

    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.user).toBeNull();
    expect(finalState.profile).toBeNull();
    expect(mockUnsubscribeNotifications).toHaveBeenCalledTimes(1);
  });
}); 