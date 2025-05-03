import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiError, UserProfileUpdate, ISupabaseDataClient } from '@paynless/types';
import { logger } from '@paynless/utils';
import { SupabaseClient } from '@supabase/supabase-js'; // Keep SupabaseClient for type assertion if needed

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  // Keep navigate if set
  const currentNavigate = useAuthStore.getState().navigate; 
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expires_at: Date.now() + 3600 };
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };
const profileUpdateData: UserProfileUpdate = { first_name: 'Updated', last_name: 'Name' };
const updatedProfile: UserProfile = { ...mockProfile, ...profileUpdateData, updated_at: 'later' };

// Mock the logger 
vi.mock('@paynless/utils', () => ({ 
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } 
}));

// --- Mock Supabase Data Client Setup ---
// Create spies for the chained methods
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockEq = vi.fn(() => ({ select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

// Assemble the mock data client implementing ISupabaseDataClient
const mockDataClient: ISupabaseDataClient = {
  from: mockFrom,
  // Add other methods if the store action uses them
};


describe('AuthStore - Update Profile Action', () => {
  let logErrorSpy: SpyInstance;
  // Spies for the data client chain
  let fromSpy: SpyInstance;
  let updateSpy: SpyInstance;
  let eqSpy: SpyInstance;
  let selectSpy: SpyInstance;
  let singleSpy: SpyInstance;

  beforeEach(() => {
    resetStore();

    // Assign spies
    logErrorSpy = vi.spyOn(logger, 'error');
    fromSpy = mockFrom;
    updateSpy = mockUpdate;
    eqSpy = mockEq;
    selectSpy = mockSelect;
    singleSpy = mockSingle;

    // Clear mock history
    vi.clearAllMocks(); 
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call dataClient methods, update profile state, clear error, and return profile on success', async () => {
             // Arrange: Set initial state and mock success response for single()
             useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
             singleSpy.mockResolvedValue({ data: updatedProfile, error: null });
 
             // Act
             let result: UserProfile | null = null;
             await act(async () => {
                 result = await useAuthStore.getState().updateProfile(mockDataClient, mockUser.id, profileUpdateData);
             });
 
             // Assert: Data client calls
             expect(fromSpy).toHaveBeenCalledWith('user_profiles');
             expect(updateSpy).toHaveBeenCalledWith(profileUpdateData);
             expect(eqSpy).toHaveBeenCalledWith('id', mockUser.id);
             expect(selectSpy).toHaveBeenCalledTimes(1);
             expect(singleSpy).toHaveBeenCalledTimes(1);
 
             // Assert: State update
             const finalState = useAuthStore.getState();
             expect(finalState.profile).toEqual(updatedProfile);
             expect(finalState.isLoading).toBe(false);
             expect(finalState.error).toBeNull();
 
             // Assert: Return value
             expect(result).toEqual(updatedProfile);
         });

  it('should set error state, not update profile, and return null on Supabase failure', async () => {
             // Arrange
             useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
             const supabaseError = { message: 'Update failed', code: '123' };
             singleSpy.mockResolvedValue({ data: null, error: supabaseError });
 
             // Act
             let result: UserProfile | null = null;
             await act(async () => {
                 result = await useAuthStore.getState().updateProfile(mockDataClient, mockUser.id, profileUpdateData);
             });
 
             // Assert: Data client calls made
             expect(fromSpy).toHaveBeenCalledWith('user_profiles');
             expect(updateSpy).toHaveBeenCalledWith(profileUpdateData);
             expect(eqSpy).toHaveBeenCalledWith('id', mockUser.id);
             expect(selectSpy).toHaveBeenCalledTimes(1);
             expect(singleSpy).toHaveBeenCalledTimes(1);

             // Assert: State update (error set, profile unchanged)
             const finalState = useAuthStore.getState();
             expect(finalState.profile).toEqual(mockProfile); // Profile remains the old one
             expect(finalState.isLoading).toBe(false);
             expect(finalState.error).toBeInstanceOf(Error); // Check it's an error object
             expect(finalState.error?.message).toBe(supabaseError.message);
 
             // Assert: Return value
             expect(result).toBeNull();

             // Assert: Logger called
             expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Failed to update profile in Supabase', { error: supabaseError });
         });

  it('should set error state and return null if no user ID exists', async () => {
             // Arrange
             useAuthStore.setState({ user: null, session: mockSession, profile: mockProfile }); // No user
 
             // Act
             let result: UserProfile | null = null;
             await act(async () => {
                 // Pass an empty string or handle appropriately if store expects ID
                 result = await useAuthStore.getState().updateProfile(mockDataClient, '', profileUpdateData); 
             });
 
             // Assert: Data client NOT called
             expect(fromSpy).not.toHaveBeenCalled();
             expect(updateSpy).not.toHaveBeenCalled();
             expect(eqSpy).not.toHaveBeenCalled();
             expect(selectSpy).not.toHaveBeenCalled();
             expect(singleSpy).not.toHaveBeenCalled();
 
             // Assert: State update (error set)
             const finalState = useAuthStore.getState();
             expect(finalState.profile).toEqual(mockProfile); // Profile remains unchanged
             expect(finalState.isLoading).toBe(false);
             expect(finalState.error).toBeInstanceOf(Error);
             expect(finalState.error?.message).toBe('Authentication required'); 
 
             // Assert: Return value
             expect(result).toBeNull();

             // Assert: Logger called
             expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Cannot update profile, user not authenticated or ID missing.');
         });

  // Test for case where update succeeds but returns no data
  it('should set error state if update returns no data', async () => {
    // Arrange
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    singleSpy.mockResolvedValue({ data: null, error: null }); // Success, but no data

    // Act
    let result: UserProfile | null = null;
    await act(async () => {
        result = await useAuthStore.getState().updateProfile(mockDataClient, mockUser.id, profileUpdateData);
    });

    // Assert: Data client calls made
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(singleSpy).toHaveBeenCalledTimes(1);

    // Assert: State update (error set)
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(mockProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeInstanceOf(Error);
    expect(finalState.error?.message).toBe('No profile data returned after update');

    // Assert: Return value
    expect(result).toBeNull();

    // Assert: Logger called
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: No profile data returned after update');
  });

  // Test for unexpected thrown errors during the dataClient call
  it('should handle thrown error during dataClient call', async () => {
    // Arrange
    useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
    const thrownError = new Error('Network Error');
    singleSpy.mockRejectedValue(thrownError); // Make the final chained call reject

    // Act
    let result: UserProfile | null = null;
    await act(async () => {
        result = await useAuthStore.getState().updateProfile(mockDataClient, mockUser.id, profileUpdateData);
    });

    // Assert: Data client calls made (up to the point of error)
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(singleSpy).toHaveBeenCalledTimes(1);

    // Assert: State update (error set)
    const finalState = useAuthStore.getState();
    expect(finalState.profile).toEqual(mockProfile);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBe(thrownError); // Should be the exact thrown error

    // Assert: Return value
    expect(result).toBeNull();

    // Assert: Logger called
    expect(logErrorSpy).toHaveBeenCalledWith('updateProfile: Unknown error', { error: thrownError.message });
  });

  // REMOVE: Obsolete tests that relied on the old api.put mock
  // it('should set error state and return null if no session token exists', async () => { ... });
  // it('should set error state and return null if profile is not loaded', async () => { ... });
}); 