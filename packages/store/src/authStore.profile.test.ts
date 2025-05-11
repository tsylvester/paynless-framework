import { describe, it, expect, afterEach, beforeEach, vi, SpyInstance } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '@paynless/api';
// Direct import of the mock client and its reset function
import { mockApiClient, resetMockApiClient } from '@paynless/api/mocks';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiError, UserProfileUpdate, SuccessResponse, ErrorResponse } from '@paynless/types';
import { logger } from '@paynless/utils';

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate;
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data aligned with type definitions
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };
const mockSession: Session = { 
  access_token: 'test-access-token', 
  refresh_token: 'def', 
  expiresAt: Date.now() + 3600000, 
  // token_type and expires_in are optional in Session type
  // token_type: 'bearer', 
  // expires_in: 3600 
};
const mockProfile: UserProfile = { 
  id: 'user-123', 
  first_name: 'Test', 
  last_name: 'User', 
  role: 'user' as UserRole, 
  created_at: 'now', 
  updated_at: 'now',
  last_selected_org_id: null,
  // Removed email, phone, address, last_selected_org_id from base mockProfile
  // Add last_selected_org_id: null if UserProfile type strictly requires it and it's not optional
  // based on `Database['public']['Tables']['user_profiles']['Row']`
  // For UserProfileUpdate, only first_name, last_name, last_selected_org_id are relevant.
};
const profileUpdateData: UserProfileUpdate = { first_name: 'Updated', last_name: 'Name' };
const updatedProfile: UserProfile = { ...mockProfile, ...profileUpdateData, updated_at: 'later' };

// Mock the logger
vi.mock('@paynless/utils', () => ({ 
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } 
}));

// No longer doing a broad vi.mock('@paynless/api', ...)
// We will spyOn api.put and make it use mockApiClient.put behavior

describe('AuthStore - Update Profile Action', () => {
  let logErrorSpy: SpyInstance;
  let apiPutSpy: SpyInstance; // Spy for api.put

  beforeEach(() => {
    resetStore();
    resetMockApiClient(); // Reset the standalone mockApiClient
    
    // Spy on the actual api.put and delegate to mockApiClient.put behavior
    // This ensures we're testing the integration with the actual `api` object structure
    // but controlling the `put` method's outcome via `mockApiClient.put`.
    apiPutSpy = vi.spyOn(api, 'put').mockImplementation(mockApiClient.put); // Assign to apiPutSpy

    logErrorSpy = vi.spyOn(logger, 'error');
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks(); // This will restore apiPutSpy among others
  });

  it('should call api.put, update profile state, clear error, and return profile on success', async () => {
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    const mockSuccessResponse: SuccessResponse<UserProfile> = { 
      data: updatedProfile, 
      error: undefined, // Crucial: error must be undefined for SuccessResponse
      status: 200 
    };
    vi.mocked(mockApiClient.put).mockResolvedValue(mockSuccessResponse); // Control via mockApiClient.put

    let result: UserProfile | null = null;
    await act(async () => {
      result = await useAuthStore.getState().updateProfile(profileUpdateData);
    });

    expect(apiPutSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(updatedProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();
    expect(result).toEqual(updatedProfile);
  });

  it('should set error state, not update profile, and return null on API failure (ErrorResponse)', async () => {
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    const apiError: ApiError = { code: 'API123', message: 'Update failed' }; // No `name` property
    const mockErrorResponse: ErrorResponse = { 
      data: undefined, // Crucial: data must be undefined for ErrorResponse
      error: apiError, 
      status: 400 // Example error status
    };
    vi.mocked(mockApiClient.put).mockResolvedValue(mockErrorResponse); // Simulate an API error response

    let result: UserProfile | null = null;
    await act(async () => {
      result = await useAuthStore.getState().updateProfile(profileUpdateData);
    });

    expect(apiPutSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(mockProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe(apiError.message); // Store creates new Error(apiError.message)
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('Update profile: Error during API call.', { message: apiError.message });
  });

  it('should set error and return null if no session token exists', async () => {
    useAuthStore.setState({ user: mockUser, session: null, profile: mockProfile });
    let result: UserProfile | null = null;
    await act(async () => {
      result = await useAuthStore.getState().updateProfile(profileUpdateData);
    });
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
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: null });
    let result: UserProfile | null = null;
    await act(async () => {
      result = await useAuthStore.getState().updateProfile(profileUpdateData);
    });
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
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    const mockSuccessNoDataResponse: SuccessResponse<UserProfile> = { 
      data: undefined, // Data is undefined
      error: undefined, 
      status: 200 
    };
    vi.mocked(mockApiClient.put).mockResolvedValue(mockSuccessNoDataResponse);
    
    let result: UserProfile | null = null;
    await act(async () => {
      result = await useAuthStore.getState().updateProfile(profileUpdateData);
    });

    expect(apiPutSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(mockProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('Failed to update profile');
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('Update profile: Error during API call.', { message: 'Failed to update profile' });
  });

  it('should handle thrown error during api.put call (e.g. network error)', async () => {
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    const thrownError = new Error('Network Error');
    vi.mocked(mockApiClient.put).mockRejectedValue(thrownError); // mockApiClient.put is spied upon by apiPutSpy

    let result: UserProfile | null = null;
    await act(async () => {
      result = await useAuthStore.getState().updateProfile(profileUpdateData);
    });

    expect(apiPutSpy).toHaveBeenCalledWith('me', profileUpdateData, { token: mockSession.access_token });
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(mockProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe(thrownError.message);
    expect(result).toBeNull();
    expect(logErrorSpy).toHaveBeenCalledWith('Update profile: Error during API call.', { message: thrownError.message });
  });
  
  it('should prioritize auth/profile checks', async () => {
    useAuthStore.setState({ user: null, session: null, profile: mockProfile });
    await act(async () => { await useAuthStore.getState().updateProfile(profileUpdateData); });
    const finalStateAuth = useAuthStore.getState();
    expect(finalStateAuth.error?.message).toBe('Authentication required');
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, user not authenticated.');

    // Reset for next check
    resetStore();
    resetMockApiClient(); // Reset the standalone mockApiClient again
    // apiPutSpy is restored in afterEach, so we need to re-spy/re-mock for this specific path if afterEach hasn't run yet
    // However, standard test flow means afterEach from previous test runs before beforeEach of next.
    // So apiPutSpy would be freshly set up by beforeEach.
    logErrorSpy.mockClear();
    // Re-establish spy for this specific part of the test if needed, or rely on beforeEach logic for subsequent tests.
    // For this multi-check test, ensure mocks are clean for the second part.
    vi.mocked(mockApiClient.put).mockClear(); // Clear any previous mockResolvedValue specific to this mock function

    useAuthStore.setState({ user: mockUser, session: mockSession, profile: null });
    await act(async () => { await useAuthStore.getState().updateProfile(profileUpdateData); });
    const finalStateProfile = useAuthStore.getState();
    expect(finalStateProfile.error?.message).toBe('Profile not loaded');
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, no current profile loaded.');
  });

}); 