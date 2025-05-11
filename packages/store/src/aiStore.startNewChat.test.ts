import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAiStore } from './aiStore';
import { act } from '@testing-library/react';
import { useAuthStore } from './authStore'; // Needed for reset logic, even if not directly used by startNewChat
import { AiState, ChatMessage } from '@paynless/types';

// No need for hoisted mock function variables if using inline vi.fn() in the factory

vi.mock('@paynless/api', async () => {
    // Simplified mock: returns a structure with inline vi.fn() for all methods.
    // This avoids issues with hoisted variables and `importOriginal` complexity when not strictly needed.
    return {
        api: {
            ai: () => ({
                getAiProviders: vi.fn(),
                getSystemPrompts: vi.fn(),
                sendChatMessage: vi.fn(), 
                getChatHistory: vi.fn(),
                getChatMessages: vi.fn(),
            }),
            auth: () => ({}), // Mock other groups as needed
            billing: () => ({}),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
        initializeApiClient: vi.fn(), 
    };
});

// Mock authStore (remains the same)
vi.mock('./authStore');

// Helper to reset Zustand store state between tests
// Adapted to include all relevant AiState fields
const initialTestAiState: AiState = {
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
};

const resetAiStore = (initialState: Partial<AiState> = {}) => {
    useAiStore.setState({ ...initialTestAiState, ...initialState }, false); // Ensure actions are preserved by merging
};

const mockNavigateGlobal = vi.fn();

describe('aiStore - startNewChat action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        act(() => {
            resetAiStore();
            // Mock minimal authStore state if needed, startNewChat doesn't directly use auth token
            const initialAuthState = useAuthStore.getInitialState ? useAuthStore.getInitialState() : { user: null, session: null, profile: null, isLoading: false, error: null, navigate: null };
            useAuthStore.setState({ ...initialAuthState, navigate: mockNavigateGlobal }, true);
        });
    });

    describe('when starting a new personal chat (no organizationId)', () => {
        it('should reset chat-specific state for a personal context', () => {
            // Arrange: Set some initial state that should be cleared or reset
            act(() => {
                resetAiStore({
                    currentChatId: 'prev-chat-123',
                    aiError: 'Some previous error',
                    isLoadingAiResponse: true,
                    newChatContext: 'some-org-id', // Should be cleared for personal
                    rewindTargetMessageId: 'msg-rewind-target',
                    messagesByChatId: { 'prev-chat-123': [{id: 'm1'} as ChatMessage] }
                });
            });

            // Act
            act(() => {
                console.log('Store object before calling startNewChat (personal test):', useAiStore.getState()); // <<< ADD THIS
                console.log('Is startNewChat a function here (personal test)?:', typeof useAiStore.getState().startNewChat); // <<< AND THIS
                useAiStore.getState().startNewChat(); // No argument implies personal
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(state.newChatContext).toBeNull(); // Assuming null for personal
            expect(state.aiError).toBeNull();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.rewindTargetMessageId).toBeNull();
            // Ensure messages from other chats are not wiped out by the reset
            expect(state.messagesByChatId['prev-chat-123']).toBeDefined();
        });
    });

    describe('when starting a new chat for a specific organization', () => {
        const mockOrgId = 'org-xyz-789';

        it('should reset chat-specific state and set organization context', () => {
            // Arrange: Set some initial state
            act(() => {
                resetAiStore({
                    currentChatId: 'prev-chat-456',
                    aiError: 'Another error',
                    isLoadingAiResponse: true,
                    newChatContext: null, // Start with no context or different context
                    rewindTargetMessageId: 'msg-rewind-target-2',
                });
            });
            
            // Act
            act(() => {
                useAiStore.getState().startNewChat(mockOrgId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(state.newChatContext).toBe(mockOrgId);
            expect(state.aiError).toBeNull();
            expect(state.isLoadingAiResponse).toBe(false);
            expect(state.rewindTargetMessageId).toBeNull();
        });
    });

    describe('when starting a new chat while a previous chat was active and had an error', () => {
        const previousChatId = 'active-chat-id';
        const initialMessages = { [previousChatId]: [{ id: 'msg1', chat_id: previousChatId } as ChatMessage] };

        it('should clear currentChatId, aiError, and set new context correctly (personal)', () => {
            // Arrange
            act(() => {
                resetAiStore({
                    currentChatId: previousChatId,
                    messagesByChatId: initialMessages,
                    aiError: 'Error from active chat',
                    newChatContext: 'some-old-org-context',
                });
            });

            // Act
            act(() => {
                useAiStore.getState().startNewChat(); // Start new personal chat
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(state.aiError).toBeNull();
            expect(state.newChatContext).toBeNull(); // Personal context
            expect(state.messagesByChatId[previousChatId]).toEqual(initialMessages[previousChatId]); // Important: Don't delete other chats' messages
        });

        it('should clear currentChatId, aiError, and set new context correctly (organization)', () => {
            const newOrgContext = 'new-org-for-chat';
            // Arrange
            act(() => {
                resetAiStore({
                    currentChatId: previousChatId,
                    messagesByChatId: initialMessages,
                    aiError: 'Error from active chat',
                    newChatContext: 'some-old-org-context',
                });
            });

            // Act
            act(() => {
                useAiStore.getState().startNewChat(newOrgContext);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.currentChatId).toBeNull();
            expect(state.aiError).toBeNull();
            expect(state.newChatContext).toBe(newOrgContext);
            expect(state.messagesByChatId[previousChatId]).toEqual(initialMessages[previousChatId]);
        });
    });
}); 