import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, UserProfileUpdate, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils'; 

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
  // Preserve navigate fn during reset
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 }; 
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };


// Mock the logger 
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock navigate function (not strictly needed for profile tests, but keep setup consistent)
const mockNavigateGlobal = vi.fn(); 

describe('AuthStore - Update Profile Action', () => {
    const profileUpdate: UserProfileUpdate = { first_name: 'Updated' };
    const updatedProfile: UserProfile = { ...mockProfile, first_name: 'Updated' };


    beforeEach(() => {
        act(() => {
        resetStore();
        // Inject the mock navigate function before relevant tests
        useAuthStore.getState().setNavigate(mockNavigateGlobal);
        });
        // Clear mocks between tests
        vi.clearAllMocks();
        // Restore any spies
        vi.restoreAllMocks();
    });


        it('should call api.put(profile), update profile state, clear error, and return profile on success', async () => {
             // Arrange
             useAuthStore.setState({
                 session: mockSession, 
                 profile: mockProfile, 
                 user: mockUser, 
                 error: new Error('previous error') 
             });
             const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: updatedProfile, error: undefined, status: 200 });

             // Act
             const result = await useAuthStore.getState().updateProfile(profileUpdate);

             // Assert
             expect(putSpy).toHaveBeenCalledWith('me', profileUpdate, { token: mockSession.access_token });
             const state = useAuthStore.getState();
             expect(state.profile).toEqual(updatedProfile);
             expect(state.error).toBeNull(); 
             expect(state.isLoading).toBe(false); 
             expect(result).toEqual(updatedProfile);
        });


        it('should set error state, not update profile, and return null on API failure', async () => {
            // Arrange
            useAuthStore.setState({
                session: mockSession,
                user: mockUser,
                profile: mockProfile,
            });
            const apiError: ApiError = { code: 'UPDATE_FAILED', message: 'Update failed' };
            const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: null, error: apiError, status: 500 });

            // Act
            const result = await useAuthStore.getState().updateProfile(profileUpdate);

            // Assert
            expect(putSpy).toHaveBeenCalledWith('me', profileUpdate, { token: mockSession.access_token });
            const state = useAuthStore.getState();
            expect(state.profile).toEqual(mockProfile); 
            expect(state.error).toBeInstanceOf(Error);
            expect(state.error?.message).toContain(apiError.message);
            expect(state.isLoading).toBe(false);
            expect(result).toBeNull();
        });


         it('should set error state and return null if no session token exists', async () => {
            // Arrange
            useAuthStore.setState({ user: mockUser, session: null, profile: mockProfile }); // No session
            const putSpy = vi.spyOn(api, 'put');

            // Act
            const result = await useAuthStore.getState().updateProfile(profileUpdate);

            // Assert
            expect(putSpy).not.toHaveBeenCalled(); 
            const state = useAuthStore.getState();
            expect(state.profile).toEqual(mockProfile);
            expect(state.error).toBeInstanceOf(Error);
            expect(state.error?.message).toContain('Not authenticated'); 
            expect(state.isLoading).toBe(false);
            expect(result).toBeNull();
         });
         
         it('should set error state and return null if profile is not loaded', async () => {
             // Arrange
             useAuthStore.setState({ user: mockUser, session: mockSession, profile: null }); // No profile
             const putSpy = vi.spyOn(api, 'put');
 
             // Act
             const result = await useAuthStore.getState().updateProfile(profileUpdate);
 
             // Assert
             expect(putSpy).not.toHaveBeenCalled(); 
             const state = useAuthStore.getState();
             expect(state.profile).toBeNull(); // Profile remains null
             expect(state.error).toBeInstanceOf(Error);
             expect(state.error?.message).toContain('Profile not loaded'); 
             expect(state.isLoading).toBe(false);
             expect(result).toBeNull();
          });


          it('should handle thrown error during API call', async () => {
             // Arrange
             useAuthStore.setState({ user: mockUser, session: mockSession, profile: mockProfile });
             const thrownError = new Error('Network Error');
             const putSpy = vi.spyOn(api, 'put').mockRejectedValue(thrownError);
             const logErrorSpy = vi.spyOn(logger, 'error');

             // Act
             const result = await useAuthStore.getState().updateProfile(profileUpdate);

             // Assert
             expect(putSpy).toHaveBeenCalledWith('me', profileUpdate, { token: mockSession.access_token });
             const state = useAuthStore.getState();
             expect(state.profile).toEqual(mockProfile);
             expect(state.error).toBeInstanceOf(Error);
             expect(state.error?.message).toBe(thrownError.message);
             expect(state.isLoading).toBe(false);
             expect(result).toBeNull();
             expect(logErrorSpy).toHaveBeenCalledWith('Update profile: Error during API call.', { message: thrownError.message });
          });
}); 