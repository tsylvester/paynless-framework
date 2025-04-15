import { describe, it, expect, beforeEach, vi, type MockInstance, type Mock } from 'vitest';
import { useAuthStore } from './authStore'; 
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import type { User, Session, UserProfile, UserRole, ChatMessage, ApiResponse, FetchOptions } from '@paynless/types';
import { logger } from '@paynless/utils'; 

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
         const { user, session, profile } = mockRegisterData; // Use the register-specific mock data
         const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { user, session, profile }, error: undefined, status: 201 });
         // Spy on sessionStorage getItem to ensure it's checked but returns null
         const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
         const localMockNavigate = vi.fn(); // Use local mock for this test
         useAuthStore.setState({ navigate: localMockNavigate });

         const result = await useAuthStore.getState().register(email, password);

         expect(postSpy).toHaveBeenCalledWith('/register', { email, password });
         expect(getItemSpy).toHaveBeenCalledWith('pendingAction'); // Verify replay check
         const state = useAuthStore.getState();
         expect(state.isLoading).toBe(false);
         expect(state.user).toEqual(user);
         expect(state.session).toEqual(session);
         expect(state.profile).toEqual(profile);
         expect(state.error).toBeNull();
         expect(result).toEqual(user); // Should return the user object on success
         expect(localMockNavigate).toHaveBeenCalledOnce();
         expect(localMockNavigate).toHaveBeenCalledWith('/dashboard'); // Default navigation
     });

     it('should set error state, clear user data, not navigate, and return null on API failure', async () => {
         const { email, password } = mockRegisterData;
         const apiError = { code: 'EMAIL_EXISTS', message: 'Email already exists' };
         const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: null, error: apiError, status: 409 });
         const localMockNavigate = vi.fn(); // Use local mock
         useAuthStore.setState({ navigate: localMockNavigate });
         useAuthStore.setState({ user: { id: 'old-user' } as any, session: { access_token: 'old_token' } as any }); // Pre-set user/session

         const result = await useAuthStore.getState().register(email, password);

         expect(postSpy).toHaveBeenCalledWith('/register', { email, password });
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
        let getItemSpy: MockInstance<[key: string], string | null>;
        let removeItemSpy: MockInstance<[key: string], void>;
        let setItemSpy: MockInstance<[key: string, value: string], void>;
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
            endpoint: '/chat',
            method: 'POST',
            body: { message: 'Stored message for register' },
            returnPath: '/chat'
        };
        const chatPendingActionJson = JSON.stringify(chatPendingActionData);

         // Non-chat action data
        const nonChatPendingActionData = {
            endpoint: '/settings',
            method: 'POST', // Assuming POST for simplicity
            body: { theme: 'dark' },
            returnPath: '/settings'
        };
         const nonChatPendingActionJson = JSON.stringify(nonChatPendingActionData);

          beforeEach(() => {
            // Mock sessionStorage
            getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
            removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
            setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            // Mock api.post
            apiPostSpy = vi.spyOn(api, 'post');
             // Use a local mock for navigation
            localMockNavigate = vi.fn();
            useAuthStore.setState({ navigate: localMockNavigate });

             // Mock successful register response by default for the FIRST call
            apiPostSpy.mockResolvedValueOnce({
                data: { user: mockRegisterData.user, session: mockRegisterData.session, profile: mockRegisterData.profile },
                error: undefined,
                status: 201 // Typically 201 Created for register
            });
        });

         it('should replay chat action, store chatId, navigate to /chat, and skip default nav on success', async () => {
            // Arrange
            getItemSpy.mockReturnValue(chatPendingActionJson); // Provide pending chat action
            // Mock successful replay response (SECOND api.post call)
            apiPostSpy.mockResolvedValueOnce({ data: mockReplayChatMessage, error: undefined, status: 200 });

            // Act
            await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

            // Assert
            expect(getItemSpy).toHaveBeenCalledWith('pendingAction');
            expect(removeItemSpy).toHaveBeenCalledWith('pendingAction');
            // Check register call (1st call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(1, '/register', { email: mockRegisterData.email, password: mockRegisterData.password });
            // Check replay call (2nd call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(2,
                chatPendingActionData.endpoint,
                chatPendingActionData.body,
                { token: mockRegisterData.session.access_token } // Use token from register response
            );
            // Assert sessionStorage.setItem for redirect ID
            expect(setItemSpy).toHaveBeenCalledWith('loadChatIdOnRedirect', mockChatId);

            // Assert navigation to specific path from pending action
            expect(localMockNavigate).toHaveBeenCalledTimes(1);
            expect(localMockNavigate).toHaveBeenCalledWith(chatPendingActionData.returnPath); // Should be '/chat'
        });

         it('should navigate to /chat and NOT store chatId if chat replay fails', async () => {
             // Arrange
            getItemSpy.mockReturnValue(chatPendingActionJson); // Provide pending chat action
            // Redefine replayError to include status and nested error
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
            expect(getItemSpy).toHaveBeenCalledWith('pendingAction');
            expect(removeItemSpy).toHaveBeenCalledWith('pendingAction'); // Action should still be removed
            // Check register call (1st call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(1, '/register', { email: mockRegisterData.email, password: mockRegisterData.password });
            // Check replay call (2nd call)
            expect(apiPostSpy).toHaveBeenNthCalledWith(2,
                chatPendingActionData.endpoint,
                chatPendingActionData.body,
                { token: mockRegisterData.session.access_token }
            );
            // Assert sessionStorage.setItem for redirect ID was NOT called
            expect(setItemSpy).not.toHaveBeenCalledWith('loadChatIdOnRedirect', expect.anything());

            // Assert navigation still goes to the returnPath from pending action
            expect(localMockNavigate).toHaveBeenCalledTimes(1);
            expect(localMockNavigate).toHaveBeenCalledWith(chatPendingActionData.returnPath); // Should still be '/chat'

              // Fix: Adjust assertion to match actual nested error structure
              expect(logErrorSpy).toHaveBeenCalledWith(
                "Error replaying pending action:", 
                expect.objectContaining({
                  status: replayError.status, // Use status from replayError
                  error: expect.objectContaining(replayError.error) // Match nested error
                })
              );
              // expect(useAuthStore.getState().error).toBeNull(); // Replay error shouldn't block register state
         });

         it('should replay non-chat action, navigate to returnPath, and NOT store chatId', async () => {
            // Arrange
            getItemSpy.mockReturnValue(nonChatPendingActionJson); // Provide pending NON-chat action
             // Mock successful non-chat replay response - assumes POST for /settings (SECOND api.post call)
             apiPostSpy.mockResolvedValueOnce({ data: { success: true }, error: undefined, status: 200 });


             // Act
             await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

             // Assert
             expect(getItemSpy).toHaveBeenCalledWith('pendingAction');
             expect(removeItemSpy).toHaveBeenCalledWith('pendingAction');
             // Check register call (api.post - 1st call)
             expect(apiPostSpy).toHaveBeenNthCalledWith(1, '/register', { email: mockRegisterData.email, password: mockRegisterData.password });
             // Check replay call (api.post - 2nd call)
             expect(apiPostSpy).toHaveBeenNthCalledWith(2,
                 nonChatPendingActionData.endpoint, // /settings
                 nonChatPendingActionData.body,
                 { token: mockRegisterData.session.access_token }
             );
             // Assert sessionStorage.setItem for redirect ID was NOT called
             expect(setItemSpy).not.toHaveBeenCalledWith('loadChatIdOnRedirect', expect.anything());

             // Assert navigation to specific path from non-chat pending action
             expect(localMockNavigate).toHaveBeenCalledTimes(1);
             expect(localMockNavigate).toHaveBeenCalledWith(nonChatPendingActionData.returnPath); // Should be '/settings'
         });

         it('should navigate to dashboard if pendingAction JSON is invalid', async () => {
            // Arrange
            getItemSpy.mockReturnValue('{invalid json'); // Invalid JSON
            const logErrorSpy = vi.spyOn(logger, 'error');
            const expectedError = expect.any(SyntaxError);

            // Act
            await useAuthStore.getState().register(mockRegisterData.email, mockRegisterData.password);

            // Assert
            expect(getItemSpy).toHaveBeenCalledWith('pendingAction');
            expect(removeItemSpy).not.toHaveBeenCalled(); // Should not remove if parse fails
            expect(apiPostSpy).toHaveBeenCalledTimes(1); // Only register call
            // Assert sessionStorage.setItem was NOT called for redirect ID
            expect(setItemSpy).not.toHaveBeenCalledWith('loadChatIdOnRedirect', expect.anything());
            // Should navigate to default dashboard path
            expect(localMockNavigate).toHaveBeenCalledTimes(1);
            expect(localMockNavigate).toHaveBeenCalledWith('/dashboard');
            // Should log an error
            expect(logErrorSpy).toHaveBeenCalledWith("Error processing pending action after registration:", expect.objectContaining({
                error: expect.any(String) // Check if error property is a string
             }));
         });

    });
}); 