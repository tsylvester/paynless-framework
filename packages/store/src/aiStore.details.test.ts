import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore } from './aiStore';
import { api } from '@paynless/api-client';
import { act } from '@testing-library/react';
import {
    // AiProvider,
    // SystemPrompt,
    // Chat,
    ChatMessage,
    // ChatApiRequest,
    ApiResponse,
    User,
    Session,
    // UserProfile,
    UserRole
} from '@paynless/types';
import { useAuthStore } from './authStore';
import { AuthRequiredError } from '@paynless/types';

// --- Restore API Client Factory Mock --- 
const mockGetAiProviders = vi.fn(); 
const mockGetSystemPrompts = vi.fn(); 
const mockSendChatMessage = vi.fn(); 
const mockGetChatHistory = vi.fn();
const mockGetChatMessages = vi.fn(); 

vi.mock('@paynless/api-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api-client')>();
    return {
        ...actual, 
        api: {
            ...actual.api,
            ai: () => ({
                getAiProviders: mockGetAiProviders,
                getSystemPrompts: mockGetSystemPrompts,
                sendChatMessage: mockSendChatMessage, 
                getChatHistory: mockGetChatHistory,
                getChatMessages: mockGetChatMessages,
            }),
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

// --- Mock the authStore --- (Keep this)
vi.mock('./authStore');

// Helper to reset Zustand store state between tests (manual reset)
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

// Define a global navigate mock
const mockNavigateGlobal = vi.fn();

describe('aiStore - loadChatDetails', () => {

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        act(() => {
             resetAiStore();
             // Reset authStore state but preserve/set navigate
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); // Replace state but include global navigate
        });
        // No API spy setup needed here
    });

    // --- Tests for loadChatDetails ---
    describe('loadChatDetails', () => {
        // Define constants for mock data
        const mockChatId = 'c123';
        const mockToken = 'valid-token-for-details';
        const mockUser: User = { id: 'user-123', email: 'test@test.com', role: 'user', created_at: '2023-01-01', updated_at: '2023-01-01' };
        const mockSession: Session = { access_token: mockToken, refresh_token: 'rt', expiresAt: Date.now() / 1000 + 3600 };
        const mockMessages: ChatMessage[] = [
            { id: 'm1', chat_id: mockChatId, user_id: mockUser.id, role: 'user', content: 'Q', ai_provider_id: null, system_prompt_id: null, token_usage: null, created_at: 't1' },
            { id: 'm2', chat_id: mockChatId, user_id: null, role: 'assistant', content: 'A', ai_provider_id: 'p1', system_prompt_id: 's1', token_usage: null, created_at: 't2' },
        ];

        // Nested beforeEach using mockReturnValue for authStore.getState
        beforeEach(() => {
             if (vi.isMockFunction(useAuthStore)) {
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    profile: null,
                    isLoading: false,
                    error: null,
                    navigate: mockNavigateGlobal,
                    setNavigate: vi.fn(),
                    login: vi.fn(),
                    logout: vi.fn(),
                    register: vi.fn(),
                    setProfile: vi.fn(),
                    setUser: vi.fn(),
                    setSession: vi.fn(),
                    setIsLoading: vi.fn(),
                    setError: vi.fn(),
                    initialize: vi.fn(),
                    refreshSession: vi.fn(),
                    updateProfile: vi.fn(),
                    clearError: vi.fn(),
                } as any);
            } else {
                console.warn("useAuthStore mock was not found for mocking getState in loadChatDetails tests.");
            }
        });

        it('should set isDetailsLoading to true initially and false on completion (success)', async () => {
            // Arrange
            mockGetChatMessages.mockResolvedValue({
                data: { mockMessages },
                status: 200,
                error: null
            });

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().loadChatDetails(mockChatId);
                // Assert immediate synchronous state change *inside* act
                expect(useAiStore.getState().isDetailsLoading).toBe(true);
            });
            // Await the promise *outside* act
            await promise;
            // Assert final state
            expect(useAiStore.getState().isDetailsLoading).toBe(false);
        });

        it('should set isDetailsLoading to true initially and false on completion (failure)', async () => {
            // Arrange
            mockGetChatMessages.mockResolvedValue({
                data: null,
                status: 500,
                error: { message: 'Failed to load' }
            });

            // Act
            let promise;
            act(() => {
                promise = useAiStore.getState().loadChatDetails(mockChatId);
                 // Assert immediate synchronous state change *inside* act
                 expect(useAiStore.getState().isDetailsLoading).toBe(true);
            });
             // Await the promise *outside* act
             await promise;
             // Assert final state
            expect(useAiStore.getState().isDetailsLoading).toBe(false);
        });

        it('should set aiError and return early if chatId is empty', async () => {
            // Arrange
            const invalidChatId = '';
            // Act
            await act(async () => {
                await useAiStore.getState().loadChatDetails(invalidChatId);
            });
            // Assert
            expect(mockGetChatMessages).not.toHaveBeenCalled();
            // Fix: Use the correct error message from the store logic
            expect(useAiStore.getState().aiError).toBe('Chat ID is required to load details.'); 
            expect(useAiStore.getState().isDetailsLoading).toBe(false);
        });

        it('should set aiError and return early if auth token is missing', async () => {
            // Arrange: Override authStore.getState for this specific test
             if (vi.isMockFunction(useAuthStore)) { 
                const currentMockState = useAuthStore.getState();
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({
                    ...currentMockState, 
                    session: null, // Override session to null
                });
            } else {
                 console.warn("useAuthStore mock was not found for mocking getState in 'no auth token' test.");
            }

            // Act
            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            // Assert
            expect(mockGetChatMessages).not.toHaveBeenCalled();
            expect(useAiStore.getState().aiError).toBe('Authentication token not found.');
            expect(useAiStore.getState().isDetailsLoading).toBe(false);
        });

        it('should call api.ai().getChatMessages with chatId and token on success', async () => {
            // Arrange
            mockGetChatMessages.mockResolvedValue({
                data: { messages: mockMessages },
                status: 200,
                error: null
            });

            // Act
            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            // Assert
            expect(mockGetChatMessages).toHaveBeenCalledTimes(1);
            expect(mockGetChatMessages).toHaveBeenCalledWith(mockChatId, mockToken);
        });

        it('should update state correctly on successful API call', async () => {
            // Arrange
            mockGetChatMessages.mockResolvedValue({
                data: mockMessages,
                status: 200,
                error: null
            });

            // Act
            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatMessages).toEqual(mockMessages);
            expect(state.currentChatId).toBe(mockChatId);
            expect(state.aiError).toBeNull();
            expect(state.isDetailsLoading).toBe(false);
        });

        it('should set aiError state on API error response', async () => {
            // Arrange
            const errorMsg = 'API Error Fetching Details';
            mockGetChatMessages.mockResolvedValue({
                data: null,
                status: 500,
                error: { message: errorMsg }
            });

            // Act
            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe(errorMsg);
            expect(state.currentChatMessages).toEqual([]);
            expect(state.currentChatId).toBeNull();
            expect(state.isDetailsLoading).toBe(false);
        });

        it('should set aiError state if API call throws an error', async () => {
             // Arrange
            const errorMsg = 'Network Error Fetching Details';
            mockGetChatMessages.mockRejectedValue(new Error(errorMsg));

            // Act
            await act(async () => {
                await useAiStore.getState().loadChatDetails(mockChatId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe(errorMsg);
            expect(state.currentChatMessages).toEqual([]);
            expect(state.currentChatId).toBeNull();
            expect(state.isDetailsLoading).toBe(false);
        });
    }); // End loadChatDetails describe

}); // End main describe block
