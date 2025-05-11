import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore } from './aiStore';
import { selectCurrentChatMessages } from './aiStore.selectors'; // Import the selector
// Import the actual AiApiClient class
import { AiApiClient } from '@paynless/api';
// Import the shared mock factory and reset function
import { createMockAiApiClient, resetMockAiApiClient } from '@paynless/api/mocks/ai.api.mock';
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

// --- Create an instance of the shared mock ---
const mockAiApi = createMockAiApiClient();

// --- Update API Mock Factory --- 
vi.mock('@paynless/api', async (importOriginal) => {
    const actualApiModule = await importOriginal<typeof import('@paynless/api')>();
    return {
        ...actualApiModule, 
        AiApiClient: vi.fn(() => mockAiApi),
        api: {
            ...actualApiModule.api,
            ai: () => mockAiApi, 
            // Add mocks for other api parts if needed
            organizations: vi.fn(),
            notifications: vi.fn(),
        },
        initializeApiClient: vi.fn(), 
    };
});

// --- Mock the authStore --- (Keep this)
vi.mock('./authStore');

// Helper to reset Zustand store state between tests (manual reset)
const resetAiStore = () => {
    // Get the actual initial state from the store to ensure all fields are covered
    const actualInitialState = useAiStore.getState();
    // Create a reset state based on the default values or specific test defaults
    useAiStore.setState({
        ...actualInitialState, // Spread to get all fields
        availableProviders: [],
        availablePrompts: [],
        messagesByChatId: {}, // Reset this to empty for a clean slate
        chatsByContext: { personal: [], orgs: {} }, // Reset this
        currentChatId: null,
        isLoadingAiResponse: false,
        isConfigLoading: false,
        isLoadingHistoryByContext: { personal: false, orgs: {} },
        isDetailsLoading: false,
        aiError: null,
        newChatContext: null,
        rewindTargetMessageId: null,
    }, true); // Replace the state entirely for a clean reset
};

// Define a global navigate mock
const mockNavigateGlobal = vi.fn();

describe('aiStore - Misc Actions', () => {
    // No API spies needed for these tests

    // Top-level beforeEach for mock/store reset
    beforeEach(() => {
        vi.clearAllMocks(); 
        vi.restoreAllMocks();
        // Use the shared reset function for the mock API client
        resetMockAiApiClient(mockAiApi);
        act(() => {
             resetAiStore();
             const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
             useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true); 
        });
    });

    // --- Tests for startNewChat ---
    describe('startNewChat', () => {
        it('should reset currentChatId and selected messages should be empty', () => {
            act(() => { 
                useAiStore.setState({
                    currentChatId: 'existing-chat-id',
                    messagesByChatId: {
                        'existing-chat-id': [{ id: 'm1', chat_id: 'existing-chat-id', role: 'user' as const, content: 'Old message', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true }],
                    }
                }); 
            });

            act(() => { 
                useAiStore.getState().startNewChat();
            });

            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(selectCurrentChatMessages(state)).toEqual([]); // Use selector
        });

        it('should reset loading/error states and currentChatId, selected messages should be empty', () => { 
             const initialProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-id-1', config: null, is_active: true, is_enabled: true, provider: null, created_at: '', updated_at: ''}];
             const initialPrompts: SystemPrompt[] = [{ id: 's1', name: 'S1', prompt_text: '', created_at: '', updated_at: '', is_active: true }];
             // chatHistoryList is derived, not stored directly.
             // We set up chatsByContext instead for initial state if needed for other parts of the test.
             const initialPersonalChats: Chat[] = [{ id: 'h1', title: 'History 1', user_id: 'u1', created_at: '', updated_at: '', organization_id: null, system_prompt_id: null }];

             act(() => { 
                useAiStore.setState({
                    availableProviders: initialProviders,
                    availablePrompts: initialPrompts,
                    chatsByContext: { personal: initialPersonalChats, orgs: {} },
                    isLoadingAiResponse: true, 
                    aiError: 'Some error', 
                    currentChatId: 'to-be-cleared',
                    messagesByChatId: {
                        'to-be-cleared': [{ id: 'm1', chat_id: 'to-be-cleared', role: 'user' as const, content: 'Old', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true }],
                    }
                }); 
            });

             act(() => {
                useAiStore.getState().startNewChat();
             });

             const state = useAiStore.getState();
             expect(state.currentChatId).toBeNull();
             expect(selectCurrentChatMessages(state)).toEqual([]); // Use selector
             expect(state.availableProviders).toEqual(initialProviders);
             expect(state.availablePrompts).toEqual(initialPrompts);
             // To test chat history, use selectChatHistoryList(state, null) for personal
             // For this test, we are just checking that other parts of state are preserved.
             // So, checking chatsByContext directly is fine if that's the intent.
             expect(state.chatsByContext.personal).toEqual(initialPersonalChats);
             expect(state.isLoadingAiResponse).toBe(false);
             expect(state.aiError).toBeNull(); 
        });
    }); // End startNewChat describe

    // --- Tests for clearAiError ---
    describe('clearAiError', () => {
        it('should set aiError to null', () => {
             act(() => { 
                useAiStore.setState({ aiError: 'An error occurred' });
             });
            expect(useAiStore.getState().aiError).not.toBeNull();

            act(() => {
                useAiStore.getState().clearAiError();
            });

            expect(useAiStore.getState().aiError).toBeNull();
        });

        it('should not affect other state properties', () => {
            const initialProviders: AiProvider[] = [{ id: 'p1', name: 'P1', description: '', api_identifier: 'mock-id-clear', config: null, is_active: true, is_enabled: true, provider: null, created_at: '', updated_at: '' }];
            // messagesByChatId should be used instead of currentChatMessages for setup
            const chatIdForTest = 'c1';
            const initialMessagesInChat: ChatMessage[] = [{ id: 'm1', chat_id: chatIdForTest, role: 'user' as const, content: 'Msg', user_id: 'u1', created_at: '', ai_provider_id: null, system_prompt_id: null, token_usage: null, is_active_in_thread: true }];
            
            act(() => { 
                useAiStore.setState({
                    availableProviders: initialProviders,
                    messagesByChatId: { [chatIdForTest]: initialMessagesInChat },
                    currentChatId: chatIdForTest, // Set currentChatId to make selectCurrentChatMessages work if needed
                    isLoadingAiResponse: true,
                    aiError: 'Error to be cleared',
                });
            });

            act(() => {
                useAiStore.getState().clearAiError();
            });

            const state = useAiStore.getState();
            expect(state.aiError).toBeNull();
            expect(state.availableProviders).toEqual(initialProviders);
            // Assert messages for the specific chat ID using the selector
            expect(selectCurrentChatMessages(state)).toEqual(initialMessagesInChat);
            expect(state.isLoadingAiResponse).toBe(true);
        });
    }); // End clearAiError describe

}); // End main describe block
