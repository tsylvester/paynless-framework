import { createSelector } from 'reselect';
import type { AiState, ChatMessage, Chat, TokenUsage, ChatSessionTokenUsageDetails } from '@paynless/types';

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

// Base selector for selectedMessagesMap
const selectSelectedMessagesMap = (state: AiState) => state.selectedMessagesMap;

/**
 * Selects active and selected messages for the current chat.
 * Filters messages where is_active_in_thread is true.
 * A message is considered selected if its ID is in selectedMessagesMap[currentChatId] and true,
 * or if its ID is NOT in selectedMessagesMap[currentChatId] (defaults to selected).
 * @param state The AiState object.
 * @returns An array of ChatMessage objects.
 */
export const selectSelectedChatMessages = createSelector(
  [selectCurrentChatId, selectMessagesByChatId, selectSelectedMessagesMap],
  (currentChatId, messagesByChatId, selectedMessagesMap): ChatMessage[] => {
    if (!currentChatId) {
      return [];
    }
    const messages = messagesByChatId[currentChatId] || [];
    if (messages.length === 0) {
      return [];
    }

    const currentChatSelections = selectedMessagesMap[currentChatId];

    return messages.filter(message => {
      // Only include messages that are explicitly active (true or undefined)
      // Exclude messages that are explicitly inactive (false)
      if (message.is_active_in_thread === false) {
        return false;
      }
      // If currentChatSelections is undefined or message.id is not a key, default to selected (true).
      // Otherwise, use the explicit boolean value from the map.
      return currentChatSelections?.[message.id] ?? true;
    });
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

          acc.prompt_tokens += prompt;
          acc.completion_tokens += completion;
          acc.total_tokens += total;
        }
        return acc;
      },
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } as TokenUsage // Initial accumulator typed as TokenUsage
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

export const selectCurrentChatSessionTokenUsage = createSelector(
  [selectCurrentChatMessages],
  (currentChatMessages): ChatSessionTokenUsageDetails => {
    const totals: ChatSessionTokenUsageDetails = {
      assistantPromptTokens: 0,
      assistantCompletionTokens: 0,
      assistantTotalTokens: 0,
      overallTotalTokens: 0,
    };

    for (const message of currentChatMessages) {
      const tu = message.token_usage as unknown as TokenUsage;
      let messageTurnTotal = 0;

      if (tu && typeof tu === 'object' && !Array.isArray(tu)) {
        const prompt = Number(tu.prompt_tokens || 0);
        const completion = Number(tu.completion_tokens || 0);
        const totalFromRecord = Number(tu.total_tokens || 0);
        
        // Calculate message turn total: use total_tokens if valid, otherwise sum of prompt and completion
        messageTurnTotal = (totalFromRecord > 0 && !isNaN(totalFromRecord)) ? totalFromRecord : (prompt + completion);

        if (message.role === 'assistant') {
          totals.assistantPromptTokens += prompt;
          totals.assistantCompletionTokens += completion;
          totals.assistantTotalTokens += messageTurnTotal;
        }
      }
      // Add current message's total tokens to overallTotalTokens regardless of role
      totals.overallTotalTokens += messageTurnTotal;
    }
    
    // Ensure assistantTotalTokens is consistent if it was based on individual message totals
    // If assistantTotalTokens was intended to be a sum of its prompt & completion, this might need adjustment
    // For now, we trust the per-message calculation for assistantTotalTokens derived above.

    // The console.warn for discrepancy can be removed or adjusted if this new logic is correct.
    // For example, a discrepancy might still occur if a user message had prompt/completion tokens but no total_tokens.
    // However, overallTotalTokens now aims to sum all messageTurnTotals.
    if (totals.assistantPromptTokens + totals.assistantCompletionTokens !== totals.assistantTotalTokens && totals.assistantTotalTokens !== 0) {
        console.warn('Discrepancy in assistant token calculation:', {
            sumOfPromptAndCompletion: totals.assistantPromptTokens + totals.assistantCompletionTokens,
            assistantTotalTokensFromMessages: totals.assistantTotalTokens,
        });
        // Optionally, decide on a source of truth if they differ, e.g.:
        // totals.assistantTotalTokens = totals.assistantPromptTokens + totals.assistantCompletionTokens;
    }

    return totals;
  }
);

export type ChatSelectionState = 'all' | 'none' | 'some' | 'empty';

export const selectCurrentChatSelectionState = createSelector(
  [selectCurrentChatMessages, selectSelectedChatMessages],
  (activeMessages, selectedMessages): ChatSelectionState => {
    if (activeMessages.length === 0) {
      return 'empty';
    }
    if (selectedMessages.length === 0) {
      return 'none';
    }
    if (selectedMessages.length === activeMessages.length) {
      return 'all';
    }
    return 'some';
  }
);
