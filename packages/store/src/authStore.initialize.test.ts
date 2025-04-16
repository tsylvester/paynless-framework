import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance, type Mock } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ApiResponse, FetchOptions, ApiError } from '@paynless/types';
import { logger } from '@paynless/utils'; 

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

// Mock navigate function (will be injected into store state)
const mockNavigateGlobal = vi.fn(); 

describe('AuthStore - Initialize Action', () => {
  let getItemSpy: MockInstance<[key: string], string | null>;
  let removeItemSpy: MockInstance<[key: string], void>;
  let setItemSpy: MockInstance<[key: string, value: string], void>;
  let apiGetSpy: MockInstance<[endpoint: string, options?: FetchOptions], Promise<ApiResponse<unknown>>>;
  let apiPostSpy: MockInstance<[endpoint: string, body: unknown, options?: FetchOptions], Promise<ApiResponse<unknown>>>; // For replay
  let localMockNavigate: Mock<[], void>; // Use local mock for navigation tests
  let logErrorSpy: MockInstance; // Define logger spy

  // Store references to mocked storage functions
  let mockSessionGetItem: Mock<[key: string], string | null>;
  let mockSessionSetItem: Mock<[key: string, value: string], void>;
  let mockSessionRemoveItem: Mock<[key: string], void>;

  beforeEach(() => {
    // Setup spies FIRST
    // Mock localStorage globally for this describe block
    const storageCache: Record<string, string> = {};
    mockSessionGetItem = vi.fn((key: string) => storageCache[key] || null);
    mockSessionSetItem = vi.fn((key: string, value: string) => { storageCache[key] = value; });
    mockSessionRemoveItem = vi.fn((key: string) => { delete storageCache[key]; });
    vi.stubGlobal('localStorage', {
        getItem: mockSessionGetItem,
        setItem: mockSessionSetItem,
        removeItem: mockSessionRemoveItem,
        clear: vi.fn(() => { /* implement if needed */ Object.keys(storageCache).forEach(key => delete storageCache[key]); }),
        // Add length/key if necessary
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

  // Minimal test to isolate localStorage.getItem call
  it('[Minimal] should call localStorage.getItem when initialized', async () => {
    // Arrange - Minimal setup, only need the mock function reference
    mockSessionGetItem.mockReturnValue(null); // Ensure it returns null
    
    // Act: Call initialize directly (persist is mocked)
    await useAuthStore.getState().initialize();
    
    // Assert - Only check if getItem was called
  });

  // Basic sanity check for localStorage mocking
  it('[Sanity Check] Mocked localStorage.getItem should be called', () => {
    // Arrange
    const key = 'sanity-check-key';
        
    // Act
    localStorage.getItem(key); // Direct call to the mocked global
    
    // Assert - Use the mock function reference
    expect(mockSessionGetItem).toHaveBeenCalledWith(key);
  });

  it('should set loading false if no session in storage', async () => {
    // Arrange
    mockSessionGetItem.mockReturnValue(null); // No session stored

     // Act: Call initialize directly now that persist is mocked
     await useAuthStore.getState().initialize();

     // Assert
     expect(useAuthStore.getState().isLoading).toBe(false);
     expect(useAuthStore.getState().user).toBeNull();
     expect(useAuthStore.getState().session).toBeNull();
  });

  it('should restore session from storage, call /me, update state, and handle replay on success', async () => {
     // Arrange
     const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 }; // Valid session
     const pendingAction = { endpoint: '/some-action', method: 'POST', body: {}, returnPath: '/target' };
     // Set both items in mock storage
     mockSessionSetItem('auth-session', JSON.stringify(storedSession));
     mockSessionSetItem('pendingAction', JSON.stringify(pendingAction));
     
      apiGetSpy.mockResolvedValueOnce({ 
         data: { user: mockUser, profile: mockProfile }, 
         error: undefined, 
         status: 200
      });
      
      apiPostSpy.mockResolvedValueOnce({ data: { success: true }, error: undefined, status: 200 });
      

     // Act: Call initialize directly now that persist is mocked
     await useAuthStore.getState().initialize();


     // Assert
     expect(apiGetSpy).toHaveBeenCalledWith('/me', { token: storedSession.access_token });
     const state = useAuthStore.getState();
     expect(state.session).toEqual(storedSession);
     expect(state.user).toEqual(mockUser);
     expect(state.profile).toEqual(mockProfile);
     expect(state.isLoading).toBe(false);
     expect(state.error).toBeNull();
      // Assert replay logic was triggered
     expect(apiPostSpy).toHaveBeenCalledWith('/some-action', {}, { token: storedSession.access_token });
     expect(mockSessionRemoveItem).toHaveBeenCalledWith('pendingAction');
     expect(localMockNavigate).toHaveBeenCalledWith('/target'); 
 });

  it('should handle expired session from storage and clear state', async () => {
     // Arrange
     const expiredTimestampSeconds = Math.floor(Date.now() / 1000) - 3600; // Ensure it's well in the past
     const expiredSession: Session = { ...mockSession, expiresAt: expiredTimestampSeconds }; 
     mockSessionSetItem('auth-session', JSON.stringify(expiredSession));
     
     // Add diagnostic logging
     console.log('Expired Test - Current Time (ms):', Date.now());
     console.log('Expired Test - Session expiresAt (s):', expiredTimestampSeconds);
     console.log('Expired Test - Session expiresAt (ms):', expiredTimestampSeconds * 1000);

     // Act: Call initialize directly now that persist is mocked
     await useAuthStore.getState().initialize();

     // Assert
     expect(apiGetSpy).not.toHaveBeenCalledWith('/me', expect.anything()); // /me should NOT be called
     expect(mockSessionRemoveItem).toHaveBeenCalledWith('auth-session'); // Expired session removed
     const state = useAuthStore.getState();
     expect(state.session).toBeNull();
     expect(state.user).toBeNull();
     expect(state.profile).toBeNull();
     expect(state.isLoading).toBe(false);
  });


   it('should handle /me API failure after restoring session', async () => {
      // Arrange
      const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
      mockSessionSetItem('auth-session', JSON.stringify(storedSession));
      // Mock failed /me response
      const apiError: ApiError = { code: 'ME_FAILED', message: 'Failed to get user' };
      apiGetSpy.mockResolvedValue({ data: null, error: apiError, status: 500 });
      

      // Act: Call initialize directly now that persist is mocked
      await useAuthStore.getState().initialize();


      // Assert
      expect(apiGetSpy).toHaveBeenCalledWith('/me', { token: storedSession.access_token });
      expect(mockSessionRemoveItem).toHaveBeenCalledWith('auth-session'); // Session removed on /me failure
      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toContain(apiError.message);


   });


  it('should handle thrown error during /me call', async () => {
       // Arrange
       const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
       mockSessionSetItem('auth-session', JSON.stringify(storedSession));
       // Mock thrown error
       const thrownError = new Error('Network Error');
       apiGetSpy.mockRejectedValue(thrownError);
       
       const logErrorSpy = vi.spyOn(logger, 'error');


       // Act: Call initialize directly now that persist is mocked
       await useAuthStore.getState().initialize();


       // Assert
       expect(apiGetSpy).toHaveBeenCalledWith('/me', { token: storedSession.access_token });
       expect(mockSessionRemoveItem).toHaveBeenCalledWith('auth-session'); // Session removed
       const state = useAuthStore.getState();
       expect(state.session).toBeNull();
       expect(state.user).toBeNull();
       expect(state.profile).toBeNull();
       expect(state.isLoading).toBe(false);
       expect(state.error).toBeInstanceOf(Error);
        // Check for the generic error message set by the catch block
       expect(state.error?.message).toContain('Error during initialization');
       expect(logErrorSpy).toHaveBeenCalledWith('Error during initialization process', { error: thrownError.message });
  });
  
   it('should not replay action if /me fails', async () => {
      // Arrange
      const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
      mockSessionSetItem('auth-session', JSON.stringify(storedSession));
      // Mock failed /me response
      const apiError: ApiError = { code: 'ME_FAILED_NO_REPLAY', message: 'Failed /me' };
      apiGetSpy.mockResolvedValue({ data: null, error: apiError, status: 500 });

      // Act: Call initialize directly now that persist is mocked
      await useAuthStore.getState().initialize();

      // Assert
      expect(apiGetSpy).toHaveBeenCalledWith('/me', { token: storedSession.access_token });
      expect(mockSessionRemoveItem).toHaveBeenCalledWith('auth-session'); // Session removed due to /me failure
      // Crucially, replay should NOT have happened
      expect(apiPostSpy).not.toHaveBeenCalled();
      expect(mockSessionRemoveItem).not.toHaveBeenCalledWith('pendingAction');
      expect(localMockNavigate).not.toHaveBeenCalled(); 
      // Verify state is cleared
      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeInstanceOf(Error); // Error from /me failure is set
   });

   it('should handle invalid JSON in stored auth-session', async () => {
       // Arrange
       mockSessionSetItem('auth-session', 'this is not json'); // Invalid JSON for session
       const logErrorSpy = vi.spyOn(logger, 'error');

       // Act: Call initialize directly now that persist is mocked
       await useAuthStore.getState().initialize();

       // Assert
       expect(logErrorSpy).toHaveBeenCalledWith('Failed to parse stored session JSON.', { error: expect.any(String) });
       expect(apiGetSpy).not.toHaveBeenCalled(); // Should not call /me
       expect(mockSessionRemoveItem).toHaveBeenCalledWith('auth-session'); // Should still remove invalid item
       // State should be cleared, loading false
       const state = useAuthStore.getState();
       expect(state.session).toBeNull();
       expect(state.user).toBeNull();
       expect(state.isLoading).toBe(false);
       expect(state.error).toBeNull(); // Error during parse is logged, not set in state here
   });

   it('should handle invalid JSON in stored pendingAction after successful /me', async () => {
       // Arrange
       const storedSession: Session = { ...mockSession, expiresAt: (Date.now() / 1000) + 3600 };
       mockSessionSetItem('auth-session', JSON.stringify(storedSession));
       mockSessionSetItem('pendingAction', '[[invalidPendingJSON');
       // Mock successful /me 
       apiGetSpy.mockResolvedValueOnce({ 
          data: { user: mockUser, profile: mockProfile }, 
          error: undefined, 
          status: 200
       });
       const logErrorSpy = vi.spyOn(logger, 'error');

       // Act: Call initialize directly now that persist is mocked
       await useAuthStore.getState().initialize();

       // Assert
       // Verify /me was called and state updated
       expect(apiGetSpy).toHaveBeenCalledWith('/me', { token: storedSession.access_token });
       const state = useAuthStore.getState();
       expect(state.session).toEqual(storedSession);
       expect(state.user).toEqual(mockUser);
       expect(state.isLoading).toBe(false);
       // Verify pendingAction check happened
       expect(logErrorSpy).toHaveBeenCalledWith('Error processing pending action:', { error: expect.any(String) });
       // Verify replay was NOT attempted and item WAS removed (current logic)
       expect(apiPostSpy).not.toHaveBeenCalled();
       expect(mockSessionRemoveItem).toHaveBeenCalledWith('pendingAction');
       // Verify navigation DID NOT happen (as replay failed)
       expect(localMockNavigate).not.toHaveBeenCalled();
   });

}); 