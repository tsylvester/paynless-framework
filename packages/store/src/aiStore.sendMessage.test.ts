import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance, type Mock } from 'vitest';
import { useAiStore, type AiState, type AiStoreType } from './aiStore';
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import {
    // AiProvider,
    // SystemPrompt,
    // Chat,
    ChatMessage,
    ChatApiRequest,
    ApiResponse,
    User,
    Session,
    UserProfile,
    UserRole,
    AuthRequiredError
} from '@paynless/types';
import { useAuthStore } from './authStore';

// --- Restore API Client Factory Mock --- 
// Define mock functions for the methods we need to control
const mockGetAiProviders = vi.fn(); // Keep even if unused in this file
const mockGetSystemPrompts = vi.fn(); // Keep even if unused
const mockSendChatMessage = vi.fn();
const mockGetChatHistory = vi.fn(); // Keep even if unused
const mockGetChatMessages = vi.fn(); // Keep even if unused

vi.mock('@paynless/api-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api-client')>();
    return {
        ...actual, 
        api: {
            ...actual.api,
            ai: () => ({
                getAiProviders: mockGetAiProviders,
                getSystemPrompts: mockGetSystemPrompts,
                sendChatMessage: mockSendChatMessage, // Use the mock function here
                getChatHistory: mockGetChatHistory,
                getChatMessages: mockGetChatMessages,
            }),
            // Ensure other parts of api are mocked if needed by store/authstore interactions
            auth: () => ({}), 
            billing: () => ({}),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        initializeApiClient: vi.fn(), 
    };
});

// --- Mock the authStore --- 
vi.mock('./authStore');

// Helper to reset Zustand store state between tests (manual reset)
// Assuming getInitialState is not exported from aiStore
const resetAiStore = () => {
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
    }); // Merge state
};

// Define a global navigate mock consistent with authStore tests
const mockNavigateGlobal = vi.fn();

describe('aiStore - sendMessage', () => {
    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        act(() => {
            resetAiStore();
            // --- REMOVED authStore.setState from top-level --- 
        });
    });

    // --- Tests for sendMessage (Authenticated) ---
    describe('sendMessage (Authenticated)', () => {
        // Define constants for mock data
        const mockToken = 'valid-token-for-send';
        const mockUser: User = { id: 'user-auth-send', email: 'test@test.com', created_at: 't', updated_at: 't', role: 'user' };
        const mockSession: Session = { access_token: mockToken, refresh_token: 'r', expiresAt: Date.now() / 1000 + 3600 };
        const messageData = { message: 'Hello', providerId: 'p1', promptId: 's1' };
        const mockAssistantResponse: ChatMessage = { id: 'm2', chat_id: 'c123', role: 'assistant', content: 'Hi there', user_id: null, ai_provider_id: messageData.providerId, system_prompt_id: messageData.promptId, token_usage: { total_tokens: 20 }, created_at: '2024-01-01T12:00:00.000Z' };

        // Nested beforeEach using mockReturnValue for authenticated state
        beforeEach(() => {
             if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    navigate: mockNavigateGlobal,
                    // Add other state/functions if needed, cast as any for simplicity
                    profile: null,
                    isLoading: false,
                    error: null,
                    // Mock actions as needed
                    setNavigate: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(),
                    setProfile: vi.fn(), setUser: vi.fn(), setSession: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                    initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(),
                } as any);
            } else {
                console.warn("useAuthStore mock was not found for mocking getState in sendMessage (Authenticated) tests.");
            }
        });

        it('should set loading state, add optimistic message, call API, and update state on success', async () => {
            // Arrange
            mockSendChatMessage.mockResolvedValue({ data: mockAssistantResponse, status: 200, error: null });
            const initialMessagesLength = useAiStore.getState().currentChatMessages.length;

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                expect(useAiStore.getState().isLoadingAiResponse).toBe(true);
                expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessagesLength + 1);
                const optimisticMessage = useAiStore.getState().currentChatMessages[initialMessagesLength];
                expect(optimisticMessage.role).toBe('user');
                expect(optimisticMessage.content).toBe(messageData.message);
                expect(optimisticMessage.id.startsWith('temp-user-')).toBe(true);
            });
            await promise;

            // Assert
            const expectedRequestData: ChatApiRequest = { message: messageData.message, providerId: messageData.providerId, promptId: messageData.promptId, chatId: undefined };
            const expectedOptions = { token: mockToken };
            expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
            expect(mockSendChatMessage).toHaveBeenCalledWith(expectedRequestData, expectedOptions);
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessagesLength + 2);
            expect(state.currentChatMessages[initialMessagesLength + 1]).toEqual(mockAssistantResponse);
            expect(state.currentChatId).toBe(mockAssistantResponse.chat_id);
            expect(state.aiError).toBeNull();
        });

        it('should update existing chatId in optimistic message when response contains chatId', async () => {
            // Arrange
            const newChatId = 'new-chat-id-123';
            const responseWithChatId = { ...mockAssistantResponse, chat_id: newChatId };
            mockSendChatMessage.mockResolvedValue({ data: responseWithChatId, status: 200, error: null });
            const existingChatId = 'old-chat-id-456';
            act(() => { useAiStore.setState({ currentChatId: existingChatId }); });

            // Act
            await act(async () => { await useAiStore.getState().sendMessage(messageData); });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBe(newChatId);
            const userMessage = state.currentChatMessages.find(m => m.role === 'user' && m.content === messageData.message);
            expect(userMessage).toBeDefined();
            expect(userMessage?.chat_id).toBe(newChatId);
        });

        it('should handle API error, remove optimistic message, and set aiError', async () => {
            // Arrange
            const errorMsg = 'AI failed to respond';
            mockSendChatMessage.mockResolvedValue({ data: null, status: 500, error: { message: errorMsg } });
            const initialMessagesLength = useAiStore.getState().currentChatMessages.length;

             // Act
             let promise;
             act(() => {
                 promise = useAiStore.getState().sendMessage(messageData);
                 expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessagesLength + 1);
             });
             await promise; 
 
             // Assert
             const state = useAiStore.getState();
             expect(state.isLoadingAiResponse).toBe(false);
             expect(state.currentChatMessages.length).toBe(initialMessagesLength);
             expect(state.aiError).toBe(errorMsg);
        });

        it('should handle thrown error during API call (network error)', async () => {
            // Arrange
            const errorMsg = 'Network connection failed';
            mockSendChatMessage.mockRejectedValue(new Error(errorMsg));
            const initialMessagesLength = useAiStore.getState().currentChatMessages.length;

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessagesLength + 1);
            });
             await promise;

            // Assert
            const state = useAiStore.getState();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.currentChatMessages.length).toBe(initialMessagesLength);
            expect(state.aiError).toBe(errorMsg);
        });
    }); // End Authenticated describe

    describe('sendMessage (Anonymous Flow - Pending Action)', () => {
        let setItemSpy: SpyInstance;

        // Nested beforeEach using mockReturnValue for anonymous state
        beforeEach(() => {
            setItemSpy = vi.spyOn(Storage.prototype, 'setItem'); 
             if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: null, 
                    session: null, 
                    navigate: null, // <<< SET TO NULL for all tests in this block
                    // ... other minimal state/actions ...
                    profile: null,
                    isLoading: false,
                    error: null,
                    setNavigate: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(),
                    setProfile: vi.fn(), setUser: vi.fn(), setSession: vi.fn(), setIsLoading: vi.fn(), setError: vi.fn(),
                    initialize: vi.fn(), refreshSession: vi.fn(), updateProfile: vi.fn(), clearError: vi.fn(),
                } as any);
            } else {
                 console.warn("useAuthStore mock was not found for mocking getState in sendMessage (Anonymous) tests.");
            }
        });

        afterEach(() => {
            setItemSpy.mockRestore(); 
        });

        const messageData = { message: 'Anonymous Hello', providerId: 'p-anon', promptId: 's-anon' };
        const authError = new AuthRequiredError('Auth required');

        it('should store pendingAction with correct structure and returnPath when AuthRequiredError is caught', async () => {
            // Arrange
            mockSendChatMessage.mockRejectedValue(authError);
            const initialMessagesLength = useAiStore.getState().currentChatMessages.length;

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                // expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessagesLength + 1); // Optimistic message removed in error path
            });
            await promise;

            // Assert
            act(() => { // Assert final state
                const finalState = useAiStore.getState();
                expect(finalState.isLoadingAiResponse).toBe(false);
                expect(finalState.currentChatMessages.length).toBe(initialMessagesLength);
                // NOTE: Error is expected to be set here now because navigate is null
                expect(finalState.aiError).toBe(authError.message);
            });
            const expectedPendingAction = { endpoint: 'chat', method: 'POST', body: { ...messageData, chatId: null }, returnPath: '/chat' };
            expect(setItemSpy).toHaveBeenCalledTimes(1);
            expect(setItemSpy).toHaveBeenCalledWith('pendingAction', JSON.stringify(expectedPendingAction));
            // Ensure navigate was NOT called
            expect(mockNavigateGlobal).not.toHaveBeenCalled(); 
        });

        it('should set error state if navigate is unavailable when AuthRequiredError is caught', async () => {
            // Arrange
            mockSendChatMessage.mockRejectedValue(authError);
            // REMOVE mockReturnValueOnce - navigate is already null from beforeEach
            const initialMessagesLength = useAiStore.getState().currentChatMessages.length;

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
            });
            await promise;

            // Assert FINAL state, wrapped in act
            act(() => { 
                const finalState = useAiStore.getState();
                expect(finalState.isLoadingAiResponse).toBe(false);
                expect(finalState.currentChatMessages.length).toBe(initialMessagesLength);
                expect(finalState.aiError).toBe(authError.message);
                expect(setItemSpy).toHaveBeenCalledTimes(1);
            });
        });

        it('should set error state if localStorage write fails when AuthRequiredError is caught', async () => {
             // Arrange
            mockSendChatMessage.mockRejectedValue(authError);
            const storageErrorMsg = 'Session storage is full';
            setItemSpy.mockImplementation(() => { throw new Error(storageErrorMsg); });
            const initialMessagesLength = useAiStore.getState().currentChatMessages.length;

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().sendMessage(messageData);
                // expect(useAiStore.getState().currentChatMessages.length).toBe(initialMessagesLength + 1); // Optimistic message removed in error path
            });
            await promise;

            // Assert FINAL state
             act(() => {
                const finalState = useAiStore.getState();
                expect(finalState.isLoadingAiResponse).toBe(false);
                expect(finalState.currentChatMessages.length).toBe(initialMessagesLength);
                expect(finalState.aiError).toBe(authError.message); 
                expect(setItemSpy).toHaveBeenCalledTimes(1);
                expect(mockNavigateGlobal).not.toHaveBeenCalled(); 
             });
        });
    }); // End Anonymous describe

}); // End main describe block
