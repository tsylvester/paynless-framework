import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAiStore } from './aiStore';
import { act } from '@testing-library/react';
import { useAuthStore } from './authStore';
import { AiState, ChatMessage, TokenUsage, User } from '@paynless/types'; // Combined User import

vi.mock('@paynless/api', async () => {
    return {
        api: {
            ai: () => ({
                getAiProviders: vi.fn(),
                getSystemPrompts: vi.fn(),
                sendChatMessage: vi.fn(), 
                getChatHistory: vi.fn(),
                getChatMessages: vi.fn(),
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

// Revised mock for authStore
vi.mock('./authStore', () => ({
    useAuthStore: vi.fn(), // Mock the hook itself
}));

import { initialAiStateValues } from './aiStore';

const resetAiStore = (initialOverrides: Partial<AiState> = {}) => {
    act(() => {
        useAiStore.setState({
            ...initialAiStateValues,
            currentChatId: null,
            messagesByChatId: {},
            isLoadingAiResponse: false,
            aiError: null,
            ...initialOverrides,
        }, false);
    });
};

const mockNavigateGlobal = vi.fn();

describe('aiStore - startNewChat action', () => {
    const mockUserInstance: User = { id: 'test-user-startnew', email: 'startnew@test.com', created_at: 't', updated_at: 't', role: 'user' };

    beforeEach(() => {
        vi.clearAllMocks();

        // Configure the mocked useAuthStore hook to return an object with getState
        vi.mocked(useAuthStore).mockReturnValue({
            getState: () => ({
                user: mockUserInstance,
                session: { access_token: 'fake-token-startnew', refresh_token: 'fake-refresh-token-startnew', expiresAt: Date.now() + 3600000 },
                navigate: mockNavigateGlobal,
                // Include other state/actions from authStore if needed by aiStore directly
            }),
            // If aiStore subscribes or uses other parts of the hook, mock them as well
            // e.g., subscribe: vi.fn(), setState: vi.fn(), etc.
        } as any); // Using 'as any' for brevity in mock setup

        act(() => {
            resetAiStore(); // resetAiStore can now safely assume authStore is mocked
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