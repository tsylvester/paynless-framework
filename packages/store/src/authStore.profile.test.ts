import { describe, it, expect, afterEach, beforeEach, vi, SpyInstance } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '@paynless/api';
import { mockApiClient, resetMockApiClient } from '@paynless/api/mocks';
import type { User, Session, UserProfile, UserRole, ApiError, UserProfileUpdate, SuccessResponse, ErrorResponse, ProfilePrivacySetting, Json } from '@paynless/types';
import { logger } from '@paynless/utils';

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate;
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user', created_at: 'now', updated_at: 'now' };
const mockSession: Session = { access_token: 'mock-token', refresh_token: 'mock-refresh', expiresAt: Date.now() + 3600 * 1000, token_type: 'bearer', expires_in: 3600 };
const mockProfile: UserProfile = { 
  id: 'user-123', 
  first_name: 'Test', 
  last_name: 'User', 
  role: 'user', 
  created_at: 'now', 
  updated_at: 'now',
  last_selected_org_id: null,
  chat_context: null,
  profile_privacy_setting: 'private',
  has_seen_welcome_modal: false,
  is_subscribed_to_newsletter: false,
};
const profileUpdateData: UserProfileUpdate = { first_name: 'Updated', last_name: 'Name' };
const updatedProfile: UserProfile = { 
  ...mockProfile, 
  ...profileUpdateData, 
  updated_at: 'later',
};

vi.mock('@paynless/utils', () => ({ 
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } 
}));

describe('AuthStore - Update Profile Action', () => {
  let logErrorSpy: SpyInstance;
  let apiPostSpy: SpyInstance;
  let setStateSpy: SpyInstance;

  beforeEach(() => {
    resetStore();
    resetMockApiClient();
    
    apiPostSpy = vi.spyOn(api, 'post').mockImplementation(mockApiClient.post);

    logErrorSpy = vi.spyOn(logger, 'error');
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();

    if (setStateSpy) {
      setStateSpy.mockRestore();
    }
    setStateSpy = vi.spyOn(useAuthStore, 'setState');

    useAuthStore.setState({ 
      user: mockUser, 
      session: mockSession, 
      profile: { ...mockProfile }, 
      isLoading: false,
      error: null,
      navigate: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call api.post, update profile state, clear error, and return profile on success', async () => {
    const mockSuccessResponse: SuccessResponse<UserProfile> = {
      data: updatedProfile,
      error: undefined,
      status: 200,
    };
    vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockSuccessResponse);

    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPostSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(updatedProfile);
    expect(finalState.error).toBeNull();
    expect(finalState.isLoading).toBe(false);
    expect(result).toEqual(updatedProfile);
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it('should set error state, not update profile, and return null on API failure (ErrorResponse)', async () => {
    const apiError: ApiError = { message: 'Update failed', code: '500' };
    const mockErrorResponse: ErrorResponse = {
      data: undefined,
      error: apiError,
      status: 500,
    };
    vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockErrorResponse);

    const initialProfile = useAuthStore.getState().profile;
    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPostSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(initialProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe(apiError.message);
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Profile update failed.', { error: apiError.message });
  });

  it('should set error and return null if no session token exists', async () => {
    useAuthStore.setState({ session: null, isLoading: false });

    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPostSpy).not.toHaveBeenCalled();
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(mockProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('Authentication required');
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, user not authenticated.');
  });
  
  it('should set error and return null if profile is not loaded', async () => {
    useAuthStore.setState({ profile: null, isLoading: false });

    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPostSpy).not.toHaveBeenCalled();
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toBeNull();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('Profile not loaded');
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, no current profile loaded.');
  });

  it('should set error state if API update returns no data', async () => {
    const mockSuccessResponseNoData: SuccessResponse<UserProfile | undefined> = {
      data: undefined,
      error: undefined,
      status: 200,
    };
    vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockSuccessResponseNoData as SuccessResponse<UserProfile>);
    
    const initialProfile = useAuthStore.getState().profile;
    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(initialProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('Failed to update profile');
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Profile update failed.', { error: 'Failed to update profile' });
  });

  it('should handle thrown error during api.post call', async () => {
    const thrownError = new Error('Network Error');
    vi.mocked(mockApiClient.post).mockRejectedValueOnce(thrownError);

    const initialProfile = useAuthStore.getState().profile;
    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(initialProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe(thrownError.message);
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Unexpected error.', { message: thrownError.message });
  });
  
  it('should update profile_privacy_setting successfully and set isLoading correctly', async () => {
    const privacyUpdateData: UserProfileUpdate = { profile_privacy_setting: 'public' };
    const profileWithPrivacyUpdate: UserProfile = {
      ...mockProfile,
      profile_privacy_setting: 'public',
      updated_at: 'later',
    };
    const mockSuccessResponse: SuccessResponse<UserProfile> = {
        data: profileWithPrivacyUpdate,
        error: undefined,
        status: 200,
    };
    vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockSuccessResponse);
    
    expect(useAuthStore.getState().isLoading).toBe(false);

    const resultPromise = useAuthStore.getState().updateProfile(privacyUpdateData);
    
    expect(useAuthStore.getState().isLoading).toBe(true);
    
    await resultPromise;

    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(profileWithPrivacyUpdate);
    expect(finalState.error).toBeNull();
    expect(finalState.isLoading).toBe(false);
    
    const result = await resultPromise;
    expect(result).toEqual(profileWithPrivacyUpdate);

    expect(apiPostSpy).toHaveBeenCalledWith('me', privacyUpdateData, { token: mockSession.access_token });
  });

  it('should prioritize auth/profile checks over API call and not set global loading for these errors', async () => {
    useAuthStore.setState({ session: null, isLoading: false, error: null });
    await useAuthStore.getState().updateProfile(profileUpdateData);
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, user not authenticated.');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(apiPostSpy).not.toHaveBeenCalled();
    logErrorSpy.mockClear();
    apiPostSpy.mockClear();

    useAuthStore.setState({ 
      user: mockUser, 
      session: mockSession, 
      profile: { ...mockProfile }, 
      isLoading: false,
      error: null 
    });

    useAuthStore.setState({ profile: null, isLoading: false, error: null, session: mockSession });
    await useAuthStore.getState().updateProfile(profileUpdateData);
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, no current profile loaded.');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(apiPostSpy).not.toHaveBeenCalled();
  });

  it('should NOT set global isLoading for chat_context only updates', async () => {
    const chatContextUpdate: UserProfileUpdate = { 
      chat_context: { newChatContext: 'org-123' }
    };
    const profileWithChatContextUpdate: UserProfile = {
      ...mockProfile,
      chat_context: { newChatContext: 'org-123' },
      updated_at: 'later',
    };
    const mockSuccessResponse: SuccessResponse<UserProfile> = {
      data: profileWithChatContextUpdate,
      error: undefined,
      status: 200,
    };
    vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockSuccessResponse);

    const result = await useAuthStore.getState().updateProfile(chatContextUpdate);

    expect(apiPostSpy).toHaveBeenCalledWith('me', chatContextUpdate, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(profileWithChatContextUpdate);
    expect(finalState.error).toBeNull();
    expect(finalState.isLoading).toBe(false); 
    expect(result).toEqual(profileWithChatContextUpdate);
    expect(setStateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ isLoading: true }));
  });
}); 