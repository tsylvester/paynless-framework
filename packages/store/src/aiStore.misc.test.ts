import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore';
import { api } from '@paynless/api';
import { act } from '@testing-library/react';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    // ChatApiRequest,
    // ApiResponse,
    // User,
    // Session,
    // UserProfile,
    // UserRole
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

describe('aiStore - Misc Actions', () => {
    // No API spies needed for these tests

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

    // --- Tests for startNewChat ---
    describe('startNewChat', () => {
        it('should reset currentChatId and currentChatMessages', () => {
            // Arrange: Set some initial state
            act(() => { // Wrap state update
                useAiStore.setState({
                    currentChatId: 'existing-chat-id',
                    currentChatMessages: [{ id: 'm1', chat_id: 'existing-chat-id', role: 'user' as const, content: 'Old message', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null }],
                }); // Use merge (default)
            });

            // Act
            act(() => { // Wrap action call
                useAiStore.getState().startNewChat();
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(state.currentChatMessages).toEqual([]);
        });

        it('should reset loading/error states as well', () => { 
             // Arrange: Set other state properties
             const initialProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-id-1' }];
             const initialPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '' }];
             const initialHistory: Chat[] = [{ id: 'h1', title: 'History 1', user_id: 'u1', created_at: '', updated_at: '' }];
             act(() => { // Wrap state update
                useAiStore.setState({
                    availableProviders: initialProviders,
                    availablePrompts: initialPrompts,
                    chatHistoryList: initialHistory,
                    isLoadingAiResponse: true, 
                    aiError: 'Some error', 
                    currentChatId: 'to-be-cleared',
                    currentChatMessages: [{ id: 'm1', chat_id: 'to-be-cleared', role: 'user' as const, content: 'Old', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null }],
                }); // Use merge (default)
            });

             // Act
             act(() => {
                useAiStore.getState().startNewChat();
             });

             // Assert
             const state = useAiStore.getState();
             expect(state.currentChatId).toBeNull();
             expect(state.currentChatMessages).toEqual([]);
             expect(state.availableProviders).toEqual(initialProviders);
             expect(state.availablePrompts).toEqual(initialPrompts);
             expect(state.chatHistoryList).toEqual(initialHistory);
             expect(state.isLoadingAiResponse).toBe(false);
             expect(state.aiError).toBeNull(); 
        });
    }); // End startNewChat describe

    // --- Tests for clearAiError ---
    describe('clearAiError', () => {
        it('should set aiError to null', () => {
            // Arrange: Set an initial error
             act(() => { // Wrap state update
                useAiStore.setState({ aiError: 'An error occurred' }, false); // Merge
             });
            expect(useAiStore.getState().aiError).not.toBeNull();

            // Act
            act(() => {
                useAiStore.getState().clearAiError();
            });

            // Assert
            expect(useAiStore.getState().aiError).toBeNull();
        });

        it('should not affect other state properties', () => {
            // Arrange: Set other state properties along with an error
            const initialProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-id-clear' }];
            const initialMessages: ChatMessage[] = [{ id: 'm1', chat_id: 'c1', role: 'user' as const, content: 'Msg', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null }];
            act(() => { // Wrap state update
                useAiStore.setState({
                    availableProviders: initialProviders,
                    currentChatMessages: initialMessages,
                    isLoadingAiResponse: true,
                    aiError: 'Error to be cleared',
                }, false); // Merge
            });

            // Act
             act(() => {
                useAiStore.getState().clearAiError();
             });

            // Assert
            const state = useAiStore.getState();
            expect(state.aiError).toBeNull();
            expect(state.availableProviders).toEqual(initialProviders);
            expect(state.currentChatMessages).toEqual(initialMessages);
            expect(state.isLoadingAiResponse).toBe(true);
        });
    }); // End clearAiError describe

}); // End main describe block
