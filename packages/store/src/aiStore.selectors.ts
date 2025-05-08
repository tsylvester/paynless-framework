import { createSelector } from 'reselect';
import type { AiState, ChatMessage, Chat } from '@paynless/types';

// Base selector for chatsByContext
const selectChatsByContext = (state: AiState) => state.chatsByContext;

// Base selector for the contextId parameter
const selectContextId = (_state: AiState, contextId: string | null) => contextId;

/**
 * Selects the chat history list for a given context (personal or organization).
 * @param state The AiState object.
 * @param contextId The ID of the organization for organization chats, or null for personal chats.
 * @returns An array of Chat objects.
 */
export const selectChatHistoryList = createSelector(
  [selectChatsByContext, selectContextId],
  (chatsByContext, contextId): Chat[] => {
    if (contextId === null) {
      return chatsByContext.personal || [];
    }
    return chatsByContext.orgs?.[contextId] || [];
  }
);

// Base selector for currentChatId
const selectCurrentChatId = (state: AiState) => state.currentChatId;

// Base selector for messagesByChatId
const selectMessagesByChatId = (state: AiState) => state.messagesByChatId;

/**
 * Selects active messages for the current chat.
 * Filters messages where is_active_in_thread is true.
 * @param state The AiState object.
 * @returns An array of ChatMessage objects.
 */
export const selectCurrentChatMessages = createSelector(
  [selectCurrentChatId, selectMessagesByChatId],
  (currentChatId, messagesByChatId): ChatMessage[] => {
    if (!currentChatId) {
      return [];
    }
    const messages = messagesByChatId[currentChatId] || [];
    return messages.filter(message => message.is_active_in_thread);
  }
);

// --- Other Selectors (can be simple functions or use createSelector if deriving data) ---

// Base selector for isLoadingHistoryByContext
const selectIsLoadingHistoryByContext = (state: AiState) => state.isLoadingHistoryByContext;

/**
 * Selects the loading state for chat history for a given context.
 * @param state The AiState object.
 * @param contextId The ID of the organization, or null for personal.
 * @returns Boolean indicating if history is loading for the context.
 */
export const selectIsHistoryLoading = createSelector(
  [selectIsLoadingHistoryByContext, selectContextId],
  (isLoadingHistoryByContext, contextId): boolean => {
    if (contextId === null) {
      return isLoadingHistoryByContext.personal || false;
    }
    return isLoadingHistoryByContext.orgs?.[contextId] || false;
  }
);

export const selectIsDetailsLoading = (state: AiState): boolean => state.isDetailsLoading;

export const selectIsLoadingAiResponse = (state: AiState): boolean => state.isLoadingAiResponse;

export const selectAiError = (state: AiState): string | null => state.aiError;

export const selectRewindTargetMessageId = (state: AiState): string | null => state.rewindTargetMessageId;

export const selectIsRewinding = (state: AiState): boolean => !!state.rewindTargetMessageId;

// Selector for availableProviders
export const selectAvailableProviders = (state: AiState) => state.availableProviders;

// Selector for availablePrompts
export const selectAvailablePrompts = (state: AiState) => state.availablePrompts;

// Selector for newChatContext
export const selectNewChatContext = (state: AiState) => state.newChatContext;

// Selector for the whole AiState (if ever needed, though generally discouraged)
// export const selectFullAiState = (state: AiState) => state; 