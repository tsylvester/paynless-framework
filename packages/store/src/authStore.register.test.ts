import { describe, it, expect, beforeEach, vi, type MockInstance, type Mock } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ChatMessage, ApiResponse, FetchOptions } from '@paynless/types';
import { logger } from '@paynless/utils'; 
import { analytics } from '@paynless/analytics-client';

// Enable fake timers for testing async waits
vi.useFakeTimers();

// Helper to reset Zustand store state between tests
const resetStore = () => {
  const initialState = useAuthStore.getInitialState();
  const currentNavigate = useAuthStore.getState().navigate; // Get current navigate fn
  // Preserve navigate fn during reset
  useAuthStore.setState({ ...initialState, navigate: currentNavigate }, true);
};

// Mock data (adjust if needed for register-specific scenarios)
const mockUser: User = { id: 'user-123', email: 'test@example.com', role: 'user' as UserRole, created_at: '', updated_at: '' };
const mockSession: Session = { access_token: 'abc', refresh_token: 'def', expiresAt: Date.now() + 3600 * 1000 }; 
const mockProfile: UserProfile = { id: 'user-123', first_name: 'Test', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };

const mockRegisterData = {
  email: 'new@example.com',
  password: 'newpassword',
  // Slightly different user/session for register success response
  user: { ...mockUser, id: 'user-new', email: 'new@example.com' }, 
  session: { ...mockSession, access_token: 'xyz', refresh_token: '123' }, 
  profile: { ...mockProfile, id: 'user-new', first_name: 'New', last_name: 'User' }
};

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

describe('AuthStore - Register Action', () => {
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


     it('should update state, call navigate, and return user on success (no replay)', async () => {
         const { email, password } = mockRegisterData;
         const { user, session } = mockRegisterData; // API doesn't return profile
         // Mock API response WITHOUT profile
         const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { user, session, profile: null }, error: undefined, status: 201 });
         // Spy on localStorage getItem to ensure it's checked but returns null
         const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
         const localMockNavigate = vi.fn(); // Use local mock for this test
         useAuthStore.setState({ navigate: localMockNavigate });

         const result = await useAuthStore.getState().register(email, password);

         expect(postSpy).toHaveBeenCalledWith('register', { email, password });
         const state = useAuthStore.getState();
         expect(state.isLoading).toBe(false);
         expect(state.user).toEqual(user);
         expect(state.session).toEqual(session);
         expect(state.profile).toBeNull(); // Profile is created by DB trigger, not returned by register API
         expect(state.error).toBeNull();
         expect(result).toEqual(user); // Should return the user object on success
         expect(localMockNavigate).toHaveBeenCalledOnce();
         expect(localMockNavigate).toHaveBeenCalledWith('dashboard'); // Correct path
     });

     it('should call analytics.track("Signed Up") on successful registration', async () => {
         const { email, password, user, session } = mockRegisterData;
         // Mock successful registration
         vi.spyOn(api, 'post').mockResolvedValue({ data: { user, session, profile: null }, error: undefined, status: 201 });
         // Mock localStorage to return null for pendingAction
         vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
         // Mock analytics track
         const trackSpy = vi.spyOn(analytics, 'track');

         await useAuthStore.getState().register(email, password);

         expect(trackSpy).toHaveBeenCalledWith('Signed Up');
     });

     it('should set error state, clear user data, not navigate, and return null on API failure', async () => {
         const { email, password } = mockRegisterData;
         const apiError = { code: 'EMAIL_EXISTS', message: 'Email already exists' };
         const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: null, error: apiError, status: 409 });
         const localMockNavigate = vi.fn(); // Use local mock
         useAuthStore.setState({ navigate: localMockNavigate });
         useAuthStore.setState({ user: { id: 'old-user' } as any, session: { access_token: 'old_token' } as any }); // Pre-set user/session

         const result = await useAuthStore.getState().register(email, password);

         expect(postSpy).toHaveBeenCalledWith('register', { email, password });
         const state = useAuthStore.getState();
         expect(state.isLoading).toBe(false);
         expect(state.user).toBeNull(); // User should be cleared
         expect(state.session).toBeNull();
         expect(state.profile).toBeNull();
         expect(state.error).toBeInstanceOf(Error);
         expect(state.error?.message).toContain(apiError.message);
         expect(result).toBeNull(); // Should return null on failure
         expect(localMockNavigate).not.toHaveBeenCalled();
     });


      // --- Tests for Register Replay Logic ---
    describe('register action - replay logic', () => {
        // Use localStorage mock vars (standard pattern)
        let mockLocalStorageGetItem: Mock<[key: string], string | null>;
        let mockLocalStorageSetItem: Mock<[key: string, value: string], void>;
        let mockLocalStorageRemoveItem: Mock<[key: string], void>;
        // Keep API spy
        let apiPostSpy: MockInstance<[endpoint: string, body: unknown, options?: FetchOptions], Promise<ApiResponse<unknown>>>;
        let localMockNavigate: Mock<[], void>;

         // Mock ChatMessage for replay response
        const mockChatId = 'replay-chat-reg-456';
        const mockReplayChatMessage: ChatMessage = { 
             id: 'replay-msg-reg-1',
             chat_id: mockChatId,
             content: 'Replayed after register',
              role: 'assistant', created_at: '2024-01-02T00:00:00Z', user_id: null, ai_provider_id: 'p1', system_prompt_id: 's1', token_usage: {total_tokens: 10}
        };

         // Chat action data
        const chatPendingActionData = {
            endpoint: 'chat',
            method: 'POST',
            body: { message: 'Stored message for register' },
            returnPath: 'chat'
        };
        const chatPendingActionJson = JSON.stringify(chatPendingActionData);

         // Non-chat action data
        const nonChatPendingActionData = {
            endpoint: 'settings',
            method: 'POST', // Assuming POST for simplicity
            body: { theme: 'dark' },
            returnPath: 'settings'
        };
         const nonChatPendingActionJson = JSON.stringify(nonChatPendingActionData);

          beforeEach(() => {
            // Use standard localStorage stub pattern
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

            // Mock api.post
            apiPostSpy = vi.spyOn(api, 'post');
            // Use a local mock for navigation
            localMockNavigate = vi.fn();
            useAuthStore.setState({ navigate: localMockNavigate });

             // Mock successful register response by default for the FIRST call
            apiPostSpy.mockResolvedValueOnce({
                data: { user: mockRegisterData.user, session: mockRegisterData.session, profile: mockRegisterData.profile },
                error: undefined,
                status: 201 
            });
        });

         it('should replay chat action, store chatId, navigate to chat, and skip default nav on success', async () => {
            // Arrange
            mockLocalStorageGetItem.mockReturnValue(chatPendingActionJson); 
            
            // FIX: Use mockImplementationOnce for clearer sequence control
            const mockReplayResponse = { data: mockReplayChatMessage, error: undefined, status: 200 };
            
            // Only mock the second call (replay)
            vi.mocked(api.post).mockResolvedValueOnce(mockReplayResponse); // Mock the 2nd call (replay)

            // Act
            let promise;
            await act(async () => { 
              promise = useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);
            });
            // Ensure the promise resolves fully
            await promise;

            // Add a small delay to ensure async operations within replay complete
            await vi.advanceTimersByTimeAsync(10);

            // Assert
            // Check localStorage interaction (using stubGlobal mocks)
            expect(mockLocalStorageGetItem).toHaveBeenCalledWith('pendingAction');
            expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pendingAction');
            // Check register call (1st call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(1, 'register', { email: mockRegisterData.email, password: mockRegisterData.password }); // Correct path
            // Check replay call (2nd call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(2,
                'chat', // Correct endpoint path
                chatPendingActionData.body,
                { token: mockRegisterData.session.access_token } // Use token from register response
            );
            // Assert localStorage.setItem for redirect ID (using stubGlobal mock)
            expect(mockLocalStorageSetItem).toHaveBeenCalledWith('loadChatIdOnRedirect', mockChatId);

            // Assert navigation to specific path from pending action
            expect(localMockNavigate).toHaveBeenCalledTimes(1);
            expect(localMockNavigate).toHaveBeenCalledWith('chat'); // Correct path
        });

         it('should navigate to chat and NOT store chatId if chat replay fails', async () => {
             // Arrange
             mockLocalStorageGetItem.mockReturnValue(chatPendingActionJson); 
             const replayError = { 
               error: { code: 'REPLAY_FAILED', message: 'Chat replay failed after register' }, 
               status: 500 
             };
             // Mock the SECOND call to apiPostSpy (the replay call)
             apiPostSpy.mockResolvedValueOnce({ data: null, error: replayError.error, status: replayError.status }); 
             const logErrorSpy = vi.spyOn(logger, 'error');

             // Act
             await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

             // Assert
             expect(mockLocalStorageGetItem).toHaveBeenCalledWith('pendingAction');
             expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pendingAction'); 
             // Check register call (1st call)
             expect(apiPostSpy).toHaveBeenNthCalledWith(1, 'register', { email: mockRegisterData.email, password: mockRegisterData.password }); // Correct path
             // Check replay call (2nd call)
             expect(apiPostSpy).toHaveBeenNthCalledWith(2,
                 'chat', // Correct endpoint path
                 chatPendingActionData.body,
                 { token: mockRegisterData.session.access_token }
             );
             // Assert localStorage.setItem was NOT called
             expect(mockLocalStorageSetItem).not.toHaveBeenCalledWith('loadChatIdOnRedirect', expect.anything());
            
             // Assert navigation still goes to the returnPath from pending action
             expect(localMockNavigate).toHaveBeenCalledTimes(1);
             expect(localMockNavigate).toHaveBeenCalledWith('chat'); // Correct path

               // Fix: Adjust assertion to match actual nested error structure
               expect(logErrorSpy).toHaveBeenCalledWith(
                 "Error replaying pending action:", 
                 expect.objectContaining({
                   status: replayError.status, // Use status from replayError
                   error: expect.objectContaining(replayError.error) // Match nested error
                 })
               );
         });

         it('should replay non-chat action, navigate to returnPath, and NOT store chatId', async () => {
            // Arrange
            mockLocalStorageGetItem.mockReturnValue(nonChatPendingActionJson); 

            // Mock the SECOND call to api.post (the non-chat replay, method is POST)
            const mockReplayResponse = { data: { success: true }, error: undefined, status: 200 }; // Example success response
            vi.mocked(api.post).mockResolvedValueOnce(mockReplayResponse); 

            // Act
            await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

            // Assert
            expect(mockLocalStorageGetItem).toHaveBeenCalledWith('pendingAction');
            expect(mockLocalStorageRemoveItem).toHaveBeenCalledWith('pendingAction');
            // Check register call (api.post - 1st call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(1, 'register', { email: mockRegisterData.email, password: mockRegisterData.password }); // Correct path
            // Check replay call (api.post - 2nd call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(2,
                'settings', // Correct endpoint path
                nonChatPendingActionData.body,
                { token: mockRegisterData.session.access_token }
            );
            // Assert localStorage.setItem was NOT called
            expect(mockLocalStorageSetItem).not.toHaveBeenCalledWith('loadChatIdOnRedirect', expect.anything());

            // Assert navigation to specific path from non-chat pending action
            expect(localMockNavigate).toHaveBeenCalledTimes(1);
            expect(localMockNavigate).toHaveBeenCalledWith('settings'); // Correct path
         });

         it('should navigate to dashboard if pendingAction JSON is invalid', async () => {
              // Arrange
              mockLocalStorageGetItem.mockReturnValue('{invalid json');
              const logErrorSpy = vi.spyOn(logger, 'error');

              // Act
              await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

              // Assert
              expect(mockLocalStorageGetItem).toHaveBeenCalledWith('pendingAction');
              // Check API call
              expect(apiPostSpy).toHaveBeenCalledTimes(1);
              // Assert localStorage.setItem was NOT called 
              expect(mockLocalStorageSetItem).not.toHaveBeenCalledWith('loadChatIdOnRedirect', expect.anything());
              // Should navigate to default dashboard path
              expect(localMockNavigate).toHaveBeenCalledTimes(1);
              expect(localMockNavigate).toHaveBeenCalledWith('dashboard'); // Correct path
              // Fix: Adjust assertion to match actual log format (Object with error message string)
              expect(logErrorSpy).toHaveBeenCalledWith("Error processing pending action after registration:", expect.objectContaining({
                  error: expect.any(String) // Check if error property is a string
               }));
         });

    });
}); 