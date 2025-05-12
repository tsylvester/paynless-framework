import { createSelector } from 'reselect';
import type { AiState, ChatMessage, Chat, TokenUsage } from '@paynless/types';

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

// Base selector for chatId parameter (used by selectChatTokenUsage)
const selectChatIdParam = (_state: AiState, chatId: string) => chatId;

/**
 * Selects and sums token usage for a specific chat.
 * @param state The AiState object.
 * @param chatId The ID of the chat.
 * @returns An object with promptTokens, completionTokens, and totalTokens, or null if chatId is invalid or no messages.
 */
export const selectChatTokenUsage = createSelector(
  [selectMessagesByChatId, selectChatIdParam],
  (messagesByChatId, chatId): TokenUsage | null => {
    const messages = messagesByChatId[chatId];
    // Return null if no messages or chat doesn't exist to distinguish from a chat with 0 usage.
    if (!messages || messages.length === 0) {
      return null;
    }

    return messages.reduce(
      (acc: TokenUsage, message: ChatMessage): TokenUsage => {
        const tu = message.token_usage; // tu is Json | null

        // Check if tu is an object and not null or an array
        if (tu && typeof tu === 'object' && !Array.isArray(tu)) {
          // Cast to Record<string, unknown> for safer property checking
          const tokenObject = tu as Record<string, unknown>;

          let prompt = 0;
          let completion = 0;
          let total = 0;

          // Try camelCase first
          if (typeof tokenObject['promptTokens'] === 'number' &&
              typeof tokenObject['completionTokens'] === 'number' &&
              typeof tokenObject['totalTokens'] === 'number') {
            prompt = tokenObject['promptTokens'] as number;
            completion = tokenObject['completionTokens'] as number;
            total = tokenObject['totalTokens'] as number;
          }
          // Else, try snake_case
          else if (typeof tokenObject['prompt_tokens'] === 'number' &&
                   typeof tokenObject['completion_tokens'] === 'number') {
            prompt = tokenObject['prompt_tokens'] as number;
            completion = tokenObject['completion_tokens'] as number;
            // If total_tokens is present (snake_case), use it. Otherwise, sum prompt and completion.
            total = typeof tokenObject['total_tokens'] === 'number' ? tokenObject['total_tokens'] as number : (prompt + completion);
          }

          acc.promptTokens += prompt;
          acc.completionTokens += completion;
          acc.totalTokens += total;
        }
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as TokenUsage // Initial accumulator typed as TokenUsage
    );
  }
);

/**
 * Selects all active messages from all personal chats, flattened into a single array.
 */
export const selectAllPersonalChatMessages = createSelector(
  [selectChatsByContext, selectMessagesByChatId],
  (chatsByContext, messagesByChatId): ChatMessage[] => {
    const personalChats = chatsByContext.personal || [];
    let allMessages: ChatMessage[] = [];

    for (const chat of personalChats) {
      const chatMessages = messagesByChatId[chat.id] || [];
      // Ensure we only consider messages that are active in their thread
      const activeMessages = chatMessages.filter(msg => msg.is_active_in_thread !== false); // Explicitly check for not false to include true/undefined
      allMessages = allMessages.concat(activeMessages);
    }
    return allMessages;
  }
);

// Selector for the whole AiState (if ever needed, though generally discouraged)
// export const selectFullAiState = (state: AiState) => state; 