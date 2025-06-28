import { describe, it, expect, afterEach, beforeEach, vi, SpyInstance } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '@paynless/api';
// Direct import of the mock client and its reset function
import { mockApiClient, resetMockApiClient } from '@paynless/api/mocks';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiError, UserProfileUpdate, SuccessResponse, ErrorResponse, ProfilePrivacySetting, Json } from '@paynless/types';
import { logger } from '@paynless/utils';

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate;
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data aligned with type definitions
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user', created_at: 'now', updated_at: 'now' };
const mockSession: Session = { access_token: 'mock-token', refresh_token: 'mock-refresh', expiresAt: Date.now() + 3600 * 1000, token_type: 'bearer', expires_in: 3600 };
const mockProfile: UserProfile = { 
  id: 'user-123', 
  first_name: 'Test', 
  last_name: 'User', 
  role: 'user' as UserRole, 
  created_at: 'now', 
  updated_at: 'now',
  last_selected_org_id: null,
  chat_context: null as Json | null, // Explicitly type chat_context
  profile_privacy_setting: 'private' as ProfilePrivacySetting, // Explicitly type profile_privacy_setting
};
const profileUpdateData: UserProfileUpdate = { first_name: 'Updated', last_name: 'Name' };
const updatedProfile: UserProfile = { 
  ...mockProfile, 
  ...profileUpdateData, 
  updated_at: 'later',
  chat_context: mockProfile.chat_context, 
  profile_privacy_setting: mockProfile.profile_privacy_setting, 
};

// Mock the logger
vi.mock('@paynless/utils', () => ({ 
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } 
}));

// No longer doing a broad vi.mock('@paynless/api', ...)
// We will spyOn api.put and make it use mockApiClient.put behavior

describe('AuthStore - Update Profile Action', () => {
  let logErrorSpy: SpyInstance;
  let apiPutSpy: SpyInstance; // Spy for api.put
  let setStateSpy: SpyInstance; // Spy on the store's setState

  beforeEach(() => {
    resetStore();
    resetMockApiClient(); // Reset the standalone mockApiClient
    
    apiPutSpy = vi.spyOn(api, 'put').mockImplementation(mockApiClient.put);

    logErrorSpy = vi.spyOn(logger, 'error');
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();

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

  it('should call api.put, update profile state, clear error, and return profile on success', async () => {
    vi.mocked(mockApiClient.put).mockResolvedValueOnce({
      data: updatedProfile,
      error: undefined,
      status: 200,
      statusText: 'OK',
    } as SuccessResponse<UserProfile>);

    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPutSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(updatedProfile);
    expect(finalState.error).toBeNull();
    expect(finalState.isLoading).toBe(false);
    expect(result).toEqual(updatedProfile);
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it('should set error state, not update profile, and return null on API failure (ErrorResponse)', async () => {
    const apiError: ApiError = { message: 'Update failed', code: '500' };
    vi.mocked(mockApiClient.put).mockResolvedValueOnce({
      data: undefined,
      error: apiError, // This is the full ApiErrorType object
      status: 500,
      statusText: 'Internal Server Error',
    } as ErrorResponse);

    const initialProfile = useAuthStore.getState().profile;
    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPutSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(initialProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe(apiError.message);
    expect(result).toBeNull();
    // Corrected: store logs { error: apiError.message }
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Profile update failed.', { error: apiError.message });
  });

  it('should set error and return null if no session token exists', async () => {
    useAuthStore.setState({ session: null, isLoading: false });

    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    expect(apiPutSpy).not.toHaveBeenCalled();
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

    expect(apiPutSpy).not.toHaveBeenCalled();
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toBeNull();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('Profile not loaded');
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, no current profile loaded.');
  });

  it('should set error state if API update returns no data (SuccessResponse with undefined data)', async () => {
    vi.mocked(mockApiClient.put).mockResolvedValueOnce({
      data: undefined as any,
      error: undefined,
      status: 200,
      statusText: 'OK',
    } as SuccessResponse<UserProfile>);
    
    const initialProfile = useAuthStore.getState().profile;
    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(initialProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('Failed to update profile');
    expect(result).toBeNull();
    // Corrected: store logs { error: "Failed to update profile" }
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Profile update failed.', { error: 'Failed to update profile' });
  });

  it('should handle thrown error during api.put call (e.g. network error)', async () => {
    const thrownError = new Error('Network Error');
    vi.mocked(mockApiClient.put).mockRejectedValueOnce(thrownError);

    const initialProfile = useAuthStore.getState().profile;
    const result = await useAuthStore.getState().updateProfile(profileUpdateData);

    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(initialProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe(thrownError.message);
    expect(result).toBeNull();
    // Corrected: store logs { message: thrownError.message }
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Unexpected error.', { message: thrownError.message });
  });
  
  it('should update profile_privacy_setting successfully and set isLoading correctly', async () => {
    const privacyUpdateData: UserProfileUpdate = { profile_privacy_setting: 'public' };
    const profileWithPrivacyUpdate: UserProfile = {
      ...mockProfile,
      profile_privacy_setting: 'public',
      updated_at: 'later',
    };

    vi.mocked(mockApiClient.put).mockResolvedValueOnce({
      data: profileWithPrivacyUpdate,
      error: undefined,
      status: 200,
      statusText: 'OK',
    } as SuccessResponse<UserProfile>);
    
    useAuthStore.setState({ isLoading: false });
    // Clear spy calls from beforeEach and the setState above
    setStateSpy.mockClear(); 

    const result = await useAuthStore.getState().updateProfile(privacyUpdateData);

    expect(apiPutSpy).toHaveBeenCalledWith('me', privacyUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(profileWithPrivacyUpdate);
    expect(finalState.error).toBeNull();
    expect(result).toEqual(profileWithPrivacyUpdate);
    
    const setStateCalls = setStateSpy.mock.calls;
    const isLoadingTrueCallIndex = setStateCalls.findIndex(call => call[0].isLoading === true);
    const isLoadingFalseCallAfterTrue = setStateCalls.findIndex((call, index) => index > isLoadingTrueCallIndex && call[0].isLoading === false);

    expect(isLoadingTrueCallIndex).toBeGreaterThan(-1); // This should now pass, finding the call at index 0
    expect(isLoadingFalseCallAfterTrue).toBeGreaterThan(isLoadingTrueCallIndex); // This should find the call at index 1
    
    expect(finalState.isLoading).toBe(false); 
  });

  it('should prioritize auth/profile checks over API call and not set global loading for these errors', async () => {
    // Test case 1: No session
    useAuthStore.setState({ session: null, isLoading: false, error: null });
    await useAuthStore.getState().updateProfile(profileUpdateData);
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, user not authenticated.');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(apiPutSpy).not.toHaveBeenCalled();
    logErrorSpy.mockClear();
    apiPutSpy.mockClear();

    useAuthStore.setState({ 
      user: mockUser, 
      session: mockSession, 
      profile: { ...mockProfile }, 
      isLoading: false,
      error: null 
    });

    // Test case 2: No profile
    useAuthStore.setState({ profile: null, isLoading: false, error: null });
    await useAuthStore.getState().updateProfile(profileUpdateData);
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, no current profile loaded.');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(apiPutSpy).not.toHaveBeenCalled();
  });
  
  it('should NOT set global isLoading for chat_context only updates', async () => {
    const chatContextUpdate: UserProfileUpdate = { chat_context: { newChatContext: 'org-123' } };
    const profileWithChatContextUpdate: UserProfile = {
      ...mockProfile,
      chat_context: { newChatContext: 'org-123' },
      updated_at: 'later',
    };

    vi.mocked(mockApiClient.put).mockResolvedValueOnce({
      data: profileWithChatContextUpdate,
      error: undefined,
      status: 200,
      statusText: 'OK',
    } as SuccessResponse<UserProfile>);

    useAuthStore.setState({ isLoading: false });

    const result = await useAuthStore.getState().updateProfile(chatContextUpdate);

    expect(apiPutSpy).toHaveBeenCalledWith('me', chatContextUpdate, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(profileWithChatContextUpdate);
    expect(finalState.error).toBeNull();
    expect(result).toEqual(profileWithChatContextUpdate);
    
    const isLoadingTrueCall = setStateSpy.mock.calls.find(call => call[0].isLoading === true);
    expect(isLoadingTrueCall).toBeUndefined(); 
    expect(finalState.isLoading).toBe(false);
  });
}); 