import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance, type Mock, SpyInstance } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiResponse, FetchOptions, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils'; 
// Import the module to access the mocked version later
import * as analyticsClient from '@paynless/analytics-client';

// Mock zustand middleware
// import { persist } from 'zustand/middleware';
// vi.mock('zustand/middleware', async (importOriginal) => {
//   const actual = await importOriginal<typeof import('zustand/middleware')>();
//   return {
//     ...actual,
//     // Mock the persist function to disable persistence for these tests
//     persist: vi.fn().mockImplementation((storeCreator, _options) => storeCreator),
//   };
// });

// Helper to reset Zustand store state between tests
// const resetStore = () => {
//   const initialState = useAuthStore.getInitialState();
//   const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
//   // Preserve navigate fn during reset
//   useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
// };

// Mock data
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: (Date.now() / 1000) + 3600 }; 
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

// Declare variables to hold mock functions
let mockIdentify: Mock;
let mockReset: Mock;
let mockTrack: Mock;

// Mock the analytics client module factory (Creates NEW vi.fn() instances)
vi.mock('@paynless/analytics-client', () => ({ 
  analytics: { 
    identify: vi.fn(), 
    reset: vi.fn(), 
    track: vi.fn() 
  } 
}));

// Mock navigate function (will be injected into store state)
const mockNavigateGlobal = vi.fn(); 

describe('AuthStore - Initialize Action', () => {
  let apiGetSpy: MockInstance<[endpoint: string, options?: FetchOptions], Promise<ApiResponse<unknown>>>;
  let apiPostSpy: MockInstance<[endpoint: string, body: unknown, options?: FetchOptions], Promise<ApiResponse<unknown>>>; // For replay
  let localMockNavigate: Mock<[], void>; // Use local mock for navigation tests
  let logErrorSpy: MockInstance; // Define logger spy

  // Store references to mocked storage functions
  let mockLocalStorageGetItem: Mock<[key: string], string | null>;
  let mockLocalStorageSetItem: Mock<[key: string, value: string], void>;
  let mockLocalStorageRemoveItem: Mock<[key: string], void>;

  // Spy for the replay function itself
  let replaySpy: SpyInstance;

  beforeEach(() => {
    // Assign the actual mock functions from the mocked module to the variables
    mockIdentify = vi.mocked(analyticsClient.analytics.identify);
    mockReset = vi.mocked(analyticsClient.analytics.reset);
    mockTrack = vi.mocked(analyticsClient.analytics.track);

    // Spy on the replay action *after* state is potentially reset
    // Note: Spying on methods of the object returned by getState() can be tricky if state resets replace the object.
    // If issues persist, consider spying *before* resetStore if applicable or directly on the store prototype if feasible.
    replaySpy = vi.spyOn(useAuthStore.getState(), '_checkAndReplayPendingAction'); 

    // Setup spies FIRST
    // Mock localStorage globally for this describe block
    const storageCache: Record<string, string> = {};
    mockLocalStorageGetItem = vi.fn((key: string) => storageCache[key] || null);
    mockLocalStorageSetItem = vi.fn((key: string, value: string) => { storageCache[key] = value; });
    mockLocalStorageRemoveItem = vi.fn((key: string) => { delete storageCache[key]; });
    vi.stubGlobal('localStorage', {
        getItem: mockLocalStorageGetItem,
        setItem: mockLocalStorageSetItem,
        removeItem: mockLocalStorageRemoveItem,
        clear: vi.fn(() => { Object.keys(storageCache).forEach(key => delete storageCache[key]); }),
    });
    // Keep using spyOn for localStorage and api/logger
    vi.spyOn(localStorage, 'getItem');
    vi.spyOn(localStorage, 'removeItem'); 
    apiGetSpy = vi.spyOn(api, 'get');
    apiPostSpy = vi.spyOn(api, 'post');
    logErrorSpy = vi.spyOn(logger, 'error');
    
    // THEN reset store and set navigate
    // resetStore();
    // Inject the mock navigate function before relevant tests
    localMockNavigate = vi.fn(); 
    useAuthStore.getState().setNavigate(localMockNavigate);
  });

  // ADD afterEach for cleanup
  afterEach(() => {
    // vi.unstubAllGlobals(); // Restore original localStorage if stubbed globally
    vi.clearAllMocks(); // Clear mocks/spies (includes call counts for stubbed functions)
    vi.restoreAllMocks(); // Restore original implementations (api, logger)
  });

  // Minimal test to isolate localStorage.getItem call for auth-storage
  it('[Minimal] should call localStorage.getItem for auth-storage when initialized', async () => {
    // Arrange: Configure the mock directly for this test
    mockLocalStorageGetItem.mockImplementation((key: string) => {
      if (key === 'auth-storage') return null; // Simulate no stored session
      return null;
    });
    
    // Act: Call initialize 
    await useAuthStore.getState().initialize();
    
    // Assert - Check if getItem was called for the persistence key
    expect(mockLocalStorageGetItem).toHaveBeenCalledWith('auth-storage');
  });

  it('should set loading false if no session in localStorage', async () => {
    // Arrange
    mockLocalStorageGetItem.mockReturnValue(null); // No session stored

     // Act: Call initialize 
     await useAuthStore.getState().initialize();

     // Assert
     expect(useAuthStore.getState().isLoading).toBe(false);
     expect(useAuthStore.getState().user).toBeNull();
     expect(useAuthStore.getState().session).toBeNull();

     // Assert: Analytics NOT called
     expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('should restore session from localStorage, call me, update state, and handle replay on success', async () => {
     // Arrange
     const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 }; 
     // Manually set the state to simulate successful hydration from localStorage
     useAuthStore.setState({ session: storedSession, user: mockUser }, true);

     const pendingAction = { endpoint: 'some-action', method: 'POST', body: {}, returnPath: 'target' };
     mockLocalStorageSetItem('pendingAction', JSON.stringify(pendingAction)); // Still need to mock pendingAction in localStorage
     
     // Mock the /me call that initialize will make
     apiGetSpy.mockResolvedValueOnce({ data: { user: mockUser, session: storedSession, profile: mockProfile }, error: undefined, status: 200 });
     // Mock the replay call
     apiPostSpy.mockResolvedValueOnce({ data: { success: true }, error: undefined, status: 200 });
      
     // Act
     await useAuthStore.getState().initialize();

     // Assert
     expect(apiGetSpy).toHaveBeenCalledWith('me', { token: storedSession.access_token });
     const state = useAuthStore.getState();
     expect(state.session).toEqual(storedSession);
     expect(state.user).toEqual(mockUser); // Should be updated from /me response
     expect(state.profile).toEqual(mockProfile);
     expect(state.isLoading).toBe(false);
     expect(state.error).toBeNull();
      // Assert replay logic was triggered (using localStorage mocks)
      // Re-enable apiPostSpy check
      expect(apiPostSpy).toHaveBeenCalledWith('some-action', {}, { token: storedSession.access_token });
      // Use the mock from stubGlobal
      expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pendingAction');
      expect(localMockNavigate).toHaveBeenCalledWith('target'); 

     // Assert: Analytics identify call
     expect(mockIdentify).toHaveBeenCalledTimes(1);
     expect(mockIdentify).toHaveBeenCalledWith(mockUser.id, { email: mockUser.email });

     // Add assertion to check if replay function was called
     expect(replaySpy).toHaveBeenCalled(); 
     expect(localMockNavigate).toHaveBeenCalledWith('target'); 
  });

  it('should handle expired session from localStorage and clear state', async () => {
     // Arrange
     const expiredTimestampSeconds = Math.floor(Date.now() / 1000) - 3600; // Ensure it's well in the past
     const expiredSession: Session = { ...mockSession, expiresAt: expiredTimestampSeconds }; 
     // Simulate expired session in localStorage
     mockLocalStorageSetItem('auth-storage', JSON.stringify({ state: { session: expiredSession }, version: 0 }));
     
     // Add diagnostic logging
     console.log('Expired Test - Current Time (ms):', Date.now());
     console.log('Expired Test - Session expiresAt (s):', expiredTimestampSeconds);
     console.log('Expired Test - Session expiresAt (ms):', expiredTimestampSeconds * 1000);

     // Act: Call initialize 
     await useAuthStore.getState().initialize();

     // Assert
     expect(apiGetSpy).not.toHaveBeenCalledWith('me', expect.anything()); // Correct path
     expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('auth-storage'); // Zustand persist should remove expired/invalid item
     const state = useAuthStore.getState();
     expect(state.session).toBeNull();
     expect(state.user).toBeNull();
     expect(state.profile).toBeNull();
     expect(state.isLoading).toBe(false);

     // Assert: Analytics NOT called
     expect(mockIdentify).not.toHaveBeenCalled();
  });


   it('should handle me API failure after restoring session', async () => {
      // Arrange
      const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
      // Simulate persisted session
      mockLocalStorageSetItem('auth-storage', JSON.stringify({ state: { session: storedSession }, version: 0 }));
      // Mock failed me response
      const apiError: ApiError = { code: 'ME_FAILED', message: 'Failed to get user' };
      apiGetSpy.mockResolvedValue({ data: null, error: apiError, status: 500 });
      

      // Act: Call initialize 
      await useAuthStore.getState().initialize();


      // Assert
      expect(apiGetSpy).toHaveBeenCalledWith('me', { token: storedSession.access_token }); // Correct path
      // Re-evaluate: Does the corrected authStore remove auth-storage on /me failure now?
      // Let's assume it DOES for now, as refresh fails and clears state.
      expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('auth-storage'); 
      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain('No refresh token available');

      // Assert: Analytics NOT called
      expect(mockIdentify).not.toHaveBeenCalled();

   });


  it('should handle thrown error during me call', async () => {
       // Arrange
       const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
       // Simulate persisted session
       mockLocalStorageSetItem('auth-storage', JSON.stringify({ state: { session: storedSession }, version: 0 }));
       // Mock thrown error
       const thrownError = new Error('Network Error');
       apiGetSpy.mockRejectedValue(thrownError);
       
       const logErrorSpy = vi.spyOn(logger, 'error');


       // Act: Call initialize 
       await useAuthStore.getState().initialize();


       // Assert
       expect(apiGetSpy).toHaveBeenCalledWith('me', { token: storedSession.access_token }); // Correct path
       // Assume removal on error
       expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('auth-storage'); 
       const state = useAuthStore.getState();
       expect(state.session).toBeNull();
       expect(state.user).toBeNull();
       expect(state.profile).toBeNull();
       expect(state.isLoading).toBe(false);
       expect(state.error).toBeInstanceOf(Error);
        // Check for the generic error message set by the catch block
       expect(state.error?.message).toContain('Error during initialization');
       expect(logErrorSpy).toHaveBeenCalledWith('Error during initialization process', { error: thrownError.message });

       // Assert: Analytics NOT called
       expect(mockIdentify).not.toHaveBeenCalled();
  });
  
   it('should not replay action if me fails', async () => {
      // Arrange
      const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
      // Simulate persisted session
      mockLocalStorageSetItem('auth-storage', JSON.stringify({ state: { session: storedSession }, version: 0 }));
      // Mock failed me response
      const apiError: ApiError = { code: 'ME_FAILED_NO_REPLAY', message: 'Failed me' };
      apiGetSpy.mockResolvedValue({ data: null, error: apiError, status: 500 });

      // Act: Call initialize 
      await useAuthStore.getState().initialize();

      // Assert
      expect(apiGetSpy).toHaveBeenCalledWith('me', { token: storedSession.access_token }); // Correct path
      // Assume removal on /me failure
      expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('auth-storage'); 
      // Crucially, replay should NOT have happened
      expect(apiPostSpy).not.toHaveBeenCalled();
      expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pendingAction');
      expect(localMockNavigate).not.toHaveBeenCalled(); 
      // Verify state is cleared
      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error); // Error from /me failure is set

      // Assert: Analytics NOT called (as /me failed)
      expect(mockIdentify).not.toHaveBeenCalled();
   });

   it('should handle invalid JSON in stored auth-storage', async () => {
       // Arrange
       mockLocalStorageSetItem('auth-storage', 'this is not json'); // Invalid JSON for session
       const logErrorSpy = vi.spyOn(logger, 'error');

       // Act: Call initialize 
       await useAuthStore.getState().initialize();

       // Assert
       expect(logErrorSpy).toHaveBeenCalledWith('Failed to parse stored session JSON.', { error: expect.any(String) });
       expect(apiGetSpy).not.toHaveBeenCalled(); // Should not call me
       expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('auth-storage'); 
       // State should be cleared, loading false
       const state = useAuthStore.getState();
       expect(state.session).toBeNull();
       expect(state.user).toBeNull();
       expect(state.isLoading).toBe(false);
       expect(state.error).toBeNull(); // Error during parse is logged, not set in state here
   });

   it('should handle invalid JSON in stored pendingAction after successful me', async () => {
       // Arrange
       const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
       mockLocalStorageSetItem('auth-storage', JSON.stringify({ state: { session: storedSession }, version: 0 }));
       mockLocalStorageSetItem('pendingAction', '[[invalidPendingJSON');
       
       apiGetSpy.mockResolvedValueOnce({ data: mockProfile, error: undefined, status: 200 }); // Mock successful /me

       // Act
       await useAuthStore.getState().initialize();

       // Assert
       // Verify me was called and state updated
       expect(apiGetSpy).toHaveBeenCalledWith('me', { token: storedSession.access_token }); // Correct path
       const state = useAuthStore.getState();
       expect(state.session).toEqual(storedSession);
       expect(state.user).toBeNull();
       expect(state.isLoading).toBe(false);
       // Verify pendingAction check happened
       // Re-enable logErrorSpy check
       expect(logErrorSpy).toHaveBeenCalledWith('Error processing pending action:', { error: expect.any(String) });
       // Verify replay was NOT attempted and item WAS removed (current logic)
       expect(apiPostSpy).not.toHaveBeenCalled();
       // Use the mock from stubGlobal
       expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pendingAction');
       // Verify navigation DID NOT happen (as replay failed)
       expect(localMockNavigate).not.toHaveBeenCalled();

       // Assert: Analytics identify call
       expect(mockIdentify).toHaveBeenCalledTimes(1);
       expect(mockIdentify).toHaveBeenCalledWith(mockUser.id, { email: mockUser.email });

       // Add assertion to check if replay function was called
       expect(replaySpy).toHaveBeenCalled(); 
       expect(localMockNavigate).not.toHaveBeenCalled();
   });

}); 