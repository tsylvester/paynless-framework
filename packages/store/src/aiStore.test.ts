import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore';
// Import the actual api object to be mocked
import { api } from '@paynless/api-client';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest,
    ApiResponse,
    User,
    Session,
    UserProfile
} from '@paynless/types';
// Import authStore for mocking
import { useAuthStore } from './authStore';

// --- Mock the entire @paynless/api-client module ---
// Define mock functions for the methods we need to control
const mockGetAiProviders = vi.fn();
const mockGetSystemPrompts = vi.fn();
const mockSendChatMessage = vi.fn();
const mockGetChatHistory = vi.fn();
const mockGetChatMessages = vi.fn();

vi.mock('@paynless/api-client', () => ({
    // Mock the 'api' export
    api: {
        // Mock the 'ai' method to return our mock functions
        ai: () => ({
            getAiProviders: mockGetAiProviders,
            getSystemPrompts: mockGetSystemPrompts,
            sendChatMessage: mockSendChatMessage,
            getChatHistory: mockGetChatHistory,
            getChatMessages: mockGetChatMessages,
        }),
        // Add mocks for other parts of 'api' if needed, otherwise empty objects/functions
        // These might be needed if the store indirectly uses them, though unlikely for aiStore
        auth: () => ({}),
        billing: () => ({}),
        // Mock base methods if the store somehow bypasses the sub-clients
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
    // Mock other exports from the module if necessary
    initializeApiClient: vi.fn(),
    getApiClient: vi.fn(),
    // Keep ApiError if it's used (it likely isn't directly in the store)
    ApiError: class MockApiError extends Error {
        code?: string | number;
        constructor(message: string, code?: string | number) {
            super(message);
            this.code = code;
            this.name = 'MockApiError';
        }
    },
}));

// --- Mock the authStore ---
vi.mock('./authStore');


describe('aiStore', () => {
    // Reset store and mocks before each test
    beforeEach(() => {
        // Reset mocks first
        vi.resetAllMocks();

        // Reset Zustand store state properties, merging with existing state (keeps actions)
         useAiStore.setState({
            availableProviders: [],
            availablePrompts: [],
            currentChatMessages: [],
            currentChatId: null,
            isLoadingAiResponse: false,
            isConfigLoading: false,
            isHistoryLoading: false,
            isDetailsLoading: false,
            chatHistoryList: [],
            aiError: null,
            anonymousMessageCount: 0,
            // Keep anonymousMessageLimit as it's not typically reset
            // anonymousMessageLimit: useAiStore.getState().anonymousMessageLimit,
         }); // REMOVED 'true' argument - perform merge instead of replace
    });

     afterEach(() => {
        // Clean up any potential side effects if needed
     });

    // REMOVE: Tests for the removed init action
    /*
    it('init should set the apiClient', () => {
        // ... removed ...
    });

     it('init should not overwrite an existing apiClient', () => {
        // ... removed ...
    });
    */

    // --- Tests for loadAiConfig ---
    describe('loadAiConfig', () => {
        const mockProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '' }];
        const mockPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '' }];

        it('should set loading state to true initially and false on completion', async () => {
            // Arrange
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 });

            // Act
            const promise = useAiStore.getState().loadAiConfig();
            expect(useAiStore.getState().isConfigLoading).toBe(true);
            await promise;

            // Assert
            expect(useAiStore.getState().isConfigLoading).toBe(false);
        });

        it('should call getAiProviders and getSystemPrompts via mocked api', async () => {
             // Arrange
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            expect(mockGetAiProviders).toHaveBeenCalledTimes(1);
            expect(mockGetSystemPrompts).toHaveBeenCalledTimes(1);
        });

        it('should update availableProviders and availablePrompts on success', async () => {
             // Arrange
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            expect(state.availableProviders).toEqual(mockProviders);
            expect(state.availablePrompts).toEqual(mockPrompts);
            expect(state.aiError).toBeNull();
        });

        it('should set aiError if getAiProviders fails', async () => {
             // Arrange
            const errorMsg = 'Failed to load providers'; // Original error message from mock
            mockGetAiProviders.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });
            mockGetSystemPrompts.mockResolvedValue({ success: true, data: mockPrompts, statusCode: 200 }); // Prompts succeed

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe('Failed to load AI providers.'); 
            expect(state.availableProviders).toEqual([]); // Should not be updated
            expect(state.availablePrompts).toEqual([]); // Neither should be updated if one fails
            expect(state.isConfigLoading).toBe(false);
        });

         it('should set aiError if getSystemPrompts fails', async () => {
             // Arrange
            const errorMsg = 'Failed to load prompts'; // Original error message from mock
            mockGetAiProviders.mockResolvedValue({ success: true, data: mockProviders, statusCode: 200 }); // Providers succeed
            mockGetSystemPrompts.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

            // Act
            await useAiStore.getState().loadAiConfig();

            // Assert
            const state = useAiStore.getState();
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe('Failed to load system prompts.');
            expect(state.availableProviders).toEqual([]);
            expect(state.availablePrompts).toEqual([]);
            expect(state.isConfigLoading).toBe(false);
        });

        // REMOVE: Test for uninitialized client is no longer applicable with singleton import
        /*
        it('should set aiError if apiClient is not initialized', async () => {
            // ... removed ...
        });
        */
    });

    // --- Tests for sendMessage ---
    describe('sendMessage', () => {
        const messageData = {
            message: 'Hello',
            providerId: 'p1',
            promptId: 's1',
            isAnonymous: false,
        };
        const anonMessageData = { ...messageData, isAnonymous: true };

        const mockAssistantResponse: ChatMessage = {
            id: 'm2',
            chat_id: 'c123',
            role: 'assistant',
            content: 'Hi there',
            user_id: null,
            ai_provider_id: messageData.providerId,
            system_prompt_id: messageData.promptId,
            token_usage: { total_tokens: 20 },
            created_at: '2024-01-01T12:00:00.000Z', // Use fixed date
        };

        it('should set loading state, add optimistic message, and call api client', async () => {
            // Arrange
            // Use the correctly mocked function
            mockSendChatMessage.mockResolvedValue({ 
                success: true, 
                data: mockAssistantResponse, 
                statusCode: 200 
            });

            // Act
            const promise = useAiStore.getState().sendMessage(messageData);

            // Assert (during call)
            const stateBeforeAwait = useAiStore.getState();
            expect(stateBeforeAwait.isLoadingAiResponse).toBe(true);
            expect(stateBeforeAwait.aiError).toBeNull();
            expect(stateBeforeAwait.currentChatMessages).toHaveLength(1);
            expect(stateBeforeAwait.currentChatMessages[0].role).toBe('user');
            expect(stateBeforeAwait.currentChatMessages[0].content).toBe(messageData.message);
            expect(stateBeforeAwait.currentChatMessages[0].id).toContain('temp-user-');

            await promise; // Wait for completion

            // Assert (after call)
            // Use the correctly mocked function
            expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            expect(mockSendChatMessage).toHaveBeenCalledWith({
                message: messageData.message,
                providerId: messageData.providerId,
                promptId: messageData.promptId,
                chatId: undefined, // No initial chatId provided
            });
             expect(useAiStore.getState().isLoadingAiResponse).toBe(false);
        });

        it('should update messages and chatId on successful response (new chat)', async () => {
             // Arrange
             // Use the correctly mocked function
             mockSendChatMessage.mockResolvedValue({ 
                success: true, 
                data: mockAssistantResponse, 
                statusCode: 200 
            });

            // Act
            await useAiStore.getState().sendMessage(messageData);

            // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages).toHaveLength(2); // User + Assistant
            // Check the assistant message details
            const assistantMsg = state.currentChatMessages.find(m => m.role === 'assistant');
            expect(assistantMsg?.id).toBe(mockAssistantResponse.id);
            expect(assistantMsg?.content).toBe(mockAssistantResponse.content);
            // REMOVE: Incorrect assertion - optimistic message is updated, not removed initially.
            // expect(state.currentChatMessages.find(m => m.id.startsWith('temp-user-'))).toBeUndefined();
            expect(state.currentChatId).toBe(mockAssistantResponse.chat_id);
            expect(state.aiError).toBeNull();
        });

        it('should update messages on successful response (existing chat)', async () => {
             // Arrange
            const existingChatId = 'c-existing';
            const existingMessages: ChatMessage[] = [
                { id: 'm0', chat_id: existingChatId, role: 'user', content: 'Previous Q', /*...other fields*/ created_at: 't0' },
            ];
            useAiStore.setState({ currentChatId: existingChatId, currentChatMessages: existingMessages });

            // Mock response with the existing chat ID
            const responseInExistingChat = { ...mockAssistantResponse, chat_id: existingChatId };
            mockSendChatMessage.mockResolvedValue({ 
                success: true, 
                data: responseInExistingChat, 
                statusCode: 200 
            });

            // Act
            await useAiStore.getState().sendMessage({...messageData, chatId: existingChatId});

            // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            // Previous message + new user optimistic + new assistant
            expect(state.currentChatMessages).toHaveLength(3); 
            expect(state.currentChatMessages[0].id).toBe('m0'); // Previous message
            expect(state.currentChatMessages[1].role).toBe('user'); // New optimistic/replaced user message
            expect(state.currentChatMessages[2].id).toBe(responseInExistingChat.id); // New assistant message
            expect(state.currentChatId).toBe(existingChatId); // Chat ID should remain the same
             expect(mockSendChatMessage).toHaveBeenCalledWith({
                message: messageData.message,
                providerId: messageData.providerId,
                promptId: messageData.promptId,
                chatId: existingChatId, // Should pass existing chatId
            });
        });

        it('should set aiError and remove optimistic message on failed response', async () => {
             // Arrange
            const errorMsg = 'AI failed'; // Original message from mock
            mockSendChatMessage.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

            // Act
            await useAiStore.getState().sendMessage(messageData);

            // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe(errorMsg); // The store now uses the error from the response
            // Checking it's removed:
            expect(state.currentChatMessages).toHaveLength(0);
            expect(state.currentChatId).toBeNull(); // Chat ID shouldn't be set on failure
        });

        it('should return { error: \'limit_reached\' } if anonymous count is >= limit', async () => {
            // Arrange
            const limit = useAiStore.getState().ANONYMOUS_MESSAGE_LIMIT;
            useAiStore.setState({ anonymousMessageCount: limit });

            // Act
            const result = await useAiStore.getState().sendMessage(anonMessageData);

            // Assert: Check for the specific return object
            expect(result).toEqual({ error: 'limit_reached' });

            // Ensure API was not called and state is unchanged
            expect(mockSendChatMessage).not.toHaveBeenCalled();
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages).toHaveLength(0);
            expect(state.anonymousMessageCount).toBe(limit); // Count shouldn't change
        });

        it('should increment anonymous count for anonymous messages below limit', async () => {
            // Arrange
            const limit = useAiStore.getState().ANONYMOUS_MESSAGE_LIMIT;
            useAiStore.setState({ anonymousMessageCount: limit - 1 }); // Start at 2 (assuming limit is 3)
            console.log(`[Test Setup] Limit: ${limit}, Initial Count Set To: ${useAiStore.getState().anonymousMessageCount}`); // Log setup
            mockSendChatMessage.mockResolvedValue({ 
                success: true, 
                data: mockAssistantResponse, 
                statusCode: 200 
            });

            // Act
            await useAiStore.getState().sendMessage(anonMessageData);

            // Assert
            const finalCount = useAiStore.getState().anonymousMessageCount;
            console.log(`[Test Assertion] Final Count: ${finalCount}, Expected Limit: ${limit}`); // Log before assertion
            // Use .toEqual for potentially safer comparison
            expect(finalCount).toEqual(limit); 
            expect(mockSendChatMessage).toHaveBeenCalledTimes(1); // API should be called
        });

        it('should NOT increment anonymous count for non-anonymous messages', async () => {
             // Arrange
            useAiStore.setState({ anonymousMessageCount: 1 }); // Set some count
            mockSendChatMessage.mockResolvedValue({ 
                success: true, 
                data: mockAssistantResponse, 
                statusCode: 200 
            });

            // Act
            await useAiStore.getState().sendMessage(messageData); // isAnonymous: false

            // Assert
            expect(useAiStore.getState().anonymousMessageCount).toBe(1); // Count should remain unchanged
            expect(mockSendChatMessage).toHaveBeenCalledTimes(1); 
        });

        // REMOVE: Test for uninitialized client is no longer applicable
        /*
        it('should set aiError if apiClient is not initialized', async () => {
            // ... removed ...
        });
        */
    });

    // --- Tests for loadChatHistory (UPDATED) ---
    describe('loadChatHistory', () => {
        const mockChats: Chat[] = [
            { id: 'c1', user_id: 'u1', title: 'Chat 1', created_at: 't1', updated_at: 't2'},
        ];
        const mockToken = 'valid-token-for-history';
        const mockUser: User = { id: 'user-123', email: 'test@test.com', role: 'user', created_at: 't', updated_at: 't'};
        const mockSession: Session = { access_token: mockToken, refresh_token: 'r', expiresAt: Date.now() / 1000 + 3600 };

        // Mock authStore state before each test in this block
        beforeEach(() => {
            vi.mocked(useAuthStore.getState).mockReturnValue({
                user: mockUser,
                session: mockSession,
                profile: {} as UserProfile, // Provide a mock profile object
                isLoading: false,
                error: null,
                navigate: vi.fn(),
                // Mock actions as needed, likely just need state
                initialize: vi.fn(),
                login: vi.fn(),
                register: vi.fn(),
                logout: vi.fn(),
                refreshSession: vi.fn(),
                updateProfile: vi.fn(),
                clearError: vi.fn(),
                setNavigate: vi.fn(),
                handleSupabaseAuthChange: vi.fn(), // Include the new action
            });
        });

        it('should set loading state and call api client with token', async () => {
            // Arrange
            mockGetChatHistory.mockResolvedValue({ success: true, data: mockChats, statusCode: 200 });

            // Act
            const promise = useAiStore.getState().loadChatHistory();
            expect(useAiStore.getState().isHistoryLoading).toBe(true);
            await promise;

            // Assert
            expect(useAiStore.getState().isHistoryLoading).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            // Verify it was called with the mockToken from the mocked authStore
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken); 
        });

        it('should update chatHistoryList on success', async () => {
             // Arrange
             mockGetChatHistory.mockResolvedValue({ success: true, data: mockChats, statusCode: 200 });

             // Act
             await useAiStore.getState().loadChatHistory();

             // Assert
             const state = useAiStore.getState();
             expect(state.chatHistoryList).toEqual(mockChats);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError on API failure', async () => {
             // Arrange
             const errorMsg = 'Failed to load history';
             mockGetChatHistory.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

             // Act
             await useAiStore.getState().loadChatHistory();

             // Assert
             const state = useAiStore.getState();
             expect(state.aiError).toBe(errorMsg);
             expect(state.chatHistoryList).toEqual([]);
             expect(state.isHistoryLoading).toBe(false);
             // Verify API was still called (with token)
             expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
             expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken);
        });

        // NEW Test Case: No token
        it('should set aiError and not call api client if no token exists', async () => {
            // Arrange: Override authStore mock for this specific test
            vi.mocked(useAuthStore.getState).mockReturnValueOnce({
                 ...useAuthStore.getState(), // Keep other mocked state/functions
                 session: null, // Explicitly set session to null
             });

            // Act
            await useAiStore.getState().loadChatHistory();

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe('Authentication required');
            expect(state.isHistoryLoading).toBe(false);
            expect(state.chatHistoryList).toEqual([]);
            // Verify API was NOT called
            expect(mockGetChatHistory).not.toHaveBeenCalled(); 
        });
    });

    // --- Tests for loadChatDetails ---
    describe('loadChatDetails', () => {
        const chatId = 'c123';
        const mockMessages: ChatMessage[] = [
             { id: 'm1', chat_id: chatId, role: 'user', content: 'Q', /* other fields */ created_at: 't1' },
             { id: 'm2', chat_id: chatId, role: 'assistant', content: 'A', /* other fields */ created_at: 't2' },
        ];

        it('should set loading state and call api client with chatId', async () => {
            // Arrange
            mockGetChatMessages.mockResolvedValue({ success: true, data: mockMessages, statusCode: 200 });

            // Act
            const promise = useAiStore.getState().loadChatDetails(chatId);
            expect(useAiStore.getState().isDetailsLoading).toBe(true);
            await promise;

            // Assert
            expect(useAiStore.getState().isDetailsLoading).toBe(false);
            expect(mockGetChatMessages).toHaveBeenCalledTimes(1);
            expect(mockGetChatMessages).toHaveBeenCalledWith(chatId);
        });

        it('should update currentChatMessages and currentChatId on success', async () => {
             // Arrange
            mockGetChatMessages.mockResolvedValue({ success: true, data: mockMessages, statusCode: 200 });

             // Act
             await useAiStore.getState().loadChatDetails(chatId);

             // Assert
             const state = useAiStore.getState();
             expect(state.currentChatMessages).toEqual(mockMessages);
             expect(state.currentChatId).toBe(chatId);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError on failure', async () => {
            // Arrange
            const errorMsg = 'Failed to load details'; // Original message from mock
            mockGetChatMessages.mockResolvedValue({ success: false, error: errorMsg, statusCode: 500 });

            // Act
            await useAiStore.getState().loadChatDetails(chatId);

            // Assert
            const state = useAiStore.getState();
            // Expect the actual error set by the store's catch block
            expect(state.aiError).toBe(errorMsg); // The store uses the error from the response
            expect(state.currentChatMessages).toEqual([]); // Should remain empty
            expect(state.currentChatId).toBeNull(); // Should remain null
            expect(state.isDetailsLoading).toBe(false);
        });

        // REMOVE: Test for uninitialized client is no longer applicable
        /*
         it('should set aiError if apiClient is not initialized', async () => {
           // ... removed ...
        });
        */
    });

    // --- Tests for startNewChat ---
    describe('startNewChat', () => {
        it('should clear currentChatMessages, currentChatId, and reset anonymous count', () => {
            // Arrange: Set some initial state
            useAiStore.setState({
                currentChatId: 'c123',
                currentChatMessages: [{ id: 'm1', /* ... */ } as ChatMessage],
                anonymousMessageCount: 2,
            });

            // Act
            useAiStore.getState().startNewChat();

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatMessages).toEqual([]);
            expect(state.currentChatId).toBeNull();
            expect(state.anonymousMessageCount).toBe(0); // This should pass if the action is correct
        });
    });

    // --- Tests for anonymous count helpers ---
    describe('anonymous count helpers', () => {
        it('incrementAnonymousCount should increment the count', () => {
            // Arrange
            useAiStore.setState({ anonymousMessageCount: 1 });
            // Act
            useAiStore.getState().incrementAnonymousCount();
            // Assert
            expect(useAiStore.getState().anonymousMessageCount).toBe(2);
        });

         it('resetAnonymousCount should set the count to 0', () => {
            // Arrange
            useAiStore.setState({ anonymousMessageCount: 5 });
            // Act
            useAiStore.getState().resetAnonymousCount();
            // Assert
            expect(useAiStore.getState().anonymousMessageCount).toBe(0);
        });

        it('setAnonymousCount should set the count to the specified value', () => {
            // Arrange
            useAiStore.setState({ anonymousMessageCount: 0 });
            // Act
            useAiStore.getState().setAnonymousCount(10);
            // Assert
            expect(useAiStore.getState().anonymousMessageCount).toBe(10);
        });
    });

    // --- Test for clearAiError ---
    describe('clearAiError', () => {
        it('should set aiError to null', () => {
             // Arrange
             useAiStore.setState({ aiError: 'Some previous error' });
             // Act
             useAiStore.getState().clearAiError();
             // Assert
             expect(useAiStore.getState().aiError).toBeNull();
        });
    });

}); 