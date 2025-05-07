import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { useAiStore } from './aiStore';
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import {
    // AiProvider,
    // SystemPrompt,
    Chat,
    // ChatMessage,
    // ChatApiRequest,
    ApiResponse,
    User,
    Session,
    UserProfile,
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

vi.mock('@paynless/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@paynless/api')>();
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
        messagesByChatId: {},
        chatsByContext: { personal: [], orgs: {} },
        currentChatId: null,
        isLoadingAiResponse: false,
        isConfigLoading: false,
        isLoadingHistoryByContext: { personal: false, orgs: {} },
        isDetailsLoading: false,
        newChatContext: null,
        rewindTargetMessageId: null,
        aiError: null,
    });
};

// Define a global navigate mock
const mockNavigateGlobal = vi.fn();

describe('aiStore - loadChatHistory', () => {

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
    });

    // --- Tests for loadChatHistory ---
    describe('loadChatHistory', () => {
        // Define constants for mock data
        const mockChats: Chat[] = [
            { id: 'c1', user_id: 'u1', title: 'Chat 1', created_at: 't1', updated_at: 't2', organization_id: null, system_prompt_id: null },
        ];
        const mockToken = 'valid-token-for-history';
        const mockUser: User = { id: 'user-123', email: 'test@test.com', role: 'user', created_at: '2023-01-01', updated_at: '2023-01-01' };
        const mockSession: Session = { access_token: mockToken, refresh_token: 'rt', expiresAt: Date.now() / 1000 + 3600 };

        // Nested beforeEach using mockReturnValue for authStore.getState
        beforeEach(() => {
             // Ensure useAuthStore is mocked before trying to mock getState
             if (vi.isMockFunction(useAuthStore)) { 
                // Mock the return value of getState for this suite
                vi.mocked(useAuthStore.getState).mockReturnValue({
                    user: mockUser,
                    session: mockSession,
                    profile: null, // Provide default values for other state parts
                    isLoading: false,
                    error: null,
                    navigate: mockNavigateGlobal, // Use the global mock
                    // Mock necessary actions if they were called directly by aiStore
                    // (Based on current aiStore code, only state is accessed)
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
                    // Add any other potentially accessed state/functions
                } as any); // Use 'as any' for simplicity if type is complex
            } else {
                console.warn("useAuthStore mock was not found for mocking getState in loadChatHistory tests.");
            }
        });
        
        it('should set loading state and call API client', async () => {
            // Arrange
            mockGetChatHistory.mockResolvedValue({
                data: mockChats,
                status: 200,
                error: null
            });
            // Check initial state before action
            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);

            // Act
            const promise = useAiStore.getState().loadChatHistory();

            // Assert loading state immediately after call, before await
            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(true);
            
            // Wait for the promise to resolve within act
            await act(async () => {
                await promise;
            });

            // Assert final state
            expect(useAiStore.getState().isLoadingHistoryByContext.personal).toBe(false);
            expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
            expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken);
        });

        it('should update chatHistoryList on success', async () => {
             // Arrange
             mockGetChatHistory.mockResolvedValue({
                 data: mockChats,
                 status: 200,
                 error: null
             });

             // Act
             await act(async () => { 
                await useAiStore.getState().loadChatHistory();
             });

             // Assert
             const state = useAiStore.getState();
             expect(state.chatsByContext.personal).toEqual(mockChats);
             expect(state.aiError).toBeNull();
        });

         it('should set aiError on failure', async () => {
             // Arrange
             const errorMsg = 'Failed to load history';
             mockGetChatHistory.mockResolvedValue({
                 data: null,
                 status: 500,
                 error: { message: errorMsg }
             });

             // Act: Wrap async action
             await act(async () => { 
                await useAiStore.getState().loadChatHistory();
             });

             // Assert
             const state = useAiStore.getState();
             expect(state.aiError).toBe(errorMsg);
             expect(state.chatsByContext.personal).toEqual([]);
             expect(state.isLoadingHistoryByContext.personal).toBe(false);
             expect(mockGetChatHistory).toHaveBeenCalledTimes(1);
             expect(mockGetChatHistory).toHaveBeenCalledWith(mockToken);
        });

        it('should set aiError if no auth token is available', async () => {
            // Arrange: Override authStore.getState for this specific test
            if (vi.isMockFunction(useAuthStore)) { 
                // Get the current mock return value to merge with
                const currentMockState = useAuthStore.getState();
                vi.mocked(useAuthStore.getState).mockReturnValueOnce({
                    ...currentMockState, // Keep other state/mocks
                    session: null, // Override session to null
                });
            } else {
                 console.warn("useAuthStore mock was not found for mocking getState in 'no auth token' test.");
            }
            
            // Act: Wrap async action
            await act(async () => { 
                await useAiStore.getState().loadChatHistory();
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBe('Authentication token not found.'); 
            expect(state.isLoadingHistoryByContext.personal).toBe(false);
            expect(state.chatsByContext.personal).toEqual([]);
            expect(mockGetChatHistory).not.toHaveBeenCalled();
        });
    }); // End loadChatHistory describe

}); // End main describe block
