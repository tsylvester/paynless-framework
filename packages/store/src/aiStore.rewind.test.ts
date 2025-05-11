import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAiStore, type AiState } from './aiStore';
import { act } from '@testing-library/react';
import { ChatMessage, Chat } from '@paynless/types'; // Assuming ChatMessage and Chat types are needed

// --- Mocks ---
// No API calls are made by these actions, so no API mocks needed for now.

// --- Test State Setup ---
const initialTestRewindState: Partial<AiState> = {
    rewindTargetMessageId: null,
    currentChatId: null,
    aiError: null,
    // Include other necessary AiState properties with default/mock values
    availableProviders: [],
    availablePrompts: [],
    chatsByContext: { personal: [], orgs: {} },
    messagesByChatId: {},
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isLoadingHistoryByContext: { personal: false, orgs: {} },
    isDetailsLoading: false,
    newChatContext: null,
};

const resetAiStore = (initialState: Partial<AiState> = {}) => {
    useAiStore.setState({
        ...initialTestRewindState,
        ...initialState,
    } as AiState, false); // Merge state to preserve actions
};

describe('AI Store - Rewind Actions', () => {
    beforeEach(() => {
        act(() => {
            resetAiStore();
        });
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Test cases will be added here

    describe('prepareRewind', () => {
        it('should set rewindTargetMessageId, currentChatId, and clear aiError', () => {
            // Arrange
            const targetMessageId = 'msg-rewind-target';
            const targetChatId = 'chat-for-rewind';
            act(() => {
                resetAiStore({ aiError: 'Some previous error' });
            });

            // Act
            act(() => {
                useAiStore.getState().prepareRewind(targetMessageId, targetChatId);
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.rewindTargetMessageId).toBe(targetMessageId);
            expect(state.currentChatId).toBe(targetChatId);
            expect(state.aiError).toBeNull();
        });
    });

    describe('cancelRewindPreparation', () => {
        it('should clear rewindTargetMessageId and preserve currentChatId and aiError', () => {
            // Arrange
            const initialChatId = 'chat-initial';
            const initialError = 'An existing error';
            act(() => {
                resetAiStore({
                    rewindTargetMessageId: 'msg-to-clear',
                    currentChatId: initialChatId,
                    aiError: initialError,
                });
            });

            // Act
            act(() => {
                useAiStore.getState().cancelRewindPreparation();
            });

            // Assert
            const state = useAiStore.getState();
            expect(state.rewindTargetMessageId).toBeNull();
            expect(state.currentChatId).toBe(initialChatId); // Should not change
            expect(state.aiError).toBe(initialError);       // Should not change
        });
    });
}); 