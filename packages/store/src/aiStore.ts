import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import {
    AiProvider,
    SystemPrompt,
    ChatMessage,
    ChatApiRequest,
    AiState,      // Import AiState
    AiActions,    // Import AiActions
} from '@paynless/types';
// import { ApiClient } from '@paynless/api-client'; // Removed unused import
import { api } from '@paynless/api-client';
import { logger } from '@paynless/utils';
import { produce } from 'immer'; // Direct import for helper functions

// Define a custom error for anonymous limit
export class AnonymousLimitReachedError extends Error {
    constructor(message = "Anonymous message limit reached.") {
        super(message);
        this.name = "AnonymousLimitReachedError";
    }
}

// REMOVE local interface definitions
/*
interface AiState { ... }
interface AiActions { ... }
*/

// Use the imported types in create<>()
export const useAiStore = create<AiState & AiActions>()(
    devtools(
        immer((set, get) => {
            // --- Internal Helper Functions ---

            /**
             * Adds an optimistic user message to the state and returns its temporary ID.
             */
            const _addOptimisticUserMessage = (messageContent: string): string => {
                const tempUserMessageId = `temp-user-${Date.now()}`;
                const userMessage: ChatMessage = {
                    id: tempUserMessageId,
                    chat_id: get().currentChatId || 'temp-chat', // Use currentChatId from state
                    user_id: 'current-user', // Placeholder - replace if actual user ID is available
                    role: 'user',
                    content: messageContent,
                    ai_provider_id: null,
                    system_prompt_id: null,
                    token_usage: null,
                    created_at: new Date().toISOString(),
                };

                set(
                    produce((state: AiState) => {
                        state.currentChatMessages.push(userMessage);
                    })
                );
                logger.info('[sendMessage] Added optimistic user message', { id: tempUserMessageId });
                return tempUserMessageId;
            };

            /**
             * Handles errors during the send message process, logs, updates state,
             * removes the optimistic message, and returns null.
             */
            const _handleSendError = (error: unknown, optimisticMessageId: string | null): null => {
                const message = error instanceof Error ? error.message : 'An unknown error occurred while sending the message.';
                logger.error('Error during send message API call:', { error: message, optimisticMessageId });

                set(
                    produce((state: AiState) => {
                        state.isLoadingAiResponse = false;
                        state.aiError = message;
                        if (optimisticMessageId) {
                            const optimisticIndex = state.currentChatMessages.findIndex(
                                (m) => m.id === optimisticMessageId
                            );
                            if (optimisticIndex > -1) {
                                state.currentChatMessages.splice(optimisticIndex, 1);
                                logger.info('[sendMessage] Removed optimistic message on error', { id: optimisticMessageId });
                            }
                        }
                    })
                );
                return null; // Explicitly return null on error
            };

            // --- Public Actions ---
            return {
                // Initial State
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
                anonymousMessageCount: 0,
                anonymousMessageLimit: 3, // Default limit
                ANONYMOUS_MESSAGE_LIMIT: 3, // Make the constant available as part of the store's state

                // --- Actions --- 
                loadAiConfig: async () => {
                    set(state => { 
                        state.isConfigLoading = true; 
                        state.aiError = null; 
                    });

                    try {
                        const [providersResponse, promptsResponse] = await Promise.all([
                            api.ai().getAiProviders(),
                            api.ai().getSystemPrompts(),
                        ]);

                        let errorMessages: string[] = [];
                        let loadedProviders: AiProvider[] = [];
                        let loadedPrompts: SystemPrompt[] = [];
                        
                        if (!providersResponse.error && providersResponse.data) {
                            loadedProviders = providersResponse.data;
                        } else {
                            errorMessages.push(providersResponse.error?.message || 'Failed to load AI providers.'); 
                        }
                        
                        if (!promptsResponse.error && promptsResponse.data) {
                            loadedPrompts = promptsResponse.data;
                        } else {
                            errorMessages.push(promptsResponse.error?.message || 'Failed to load system prompts.');
                        }

                        if (errorMessages.length > 0) {
                            throw new Error(errorMessages.join(' \n'));
                        }

                        set((state) => {
                            state.availableProviders = loadedProviders;
                            state.availablePrompts = loadedPrompts;
                            state.isConfigLoading = false;
                        });
                        logger.info('AI Config loaded successfully:', { providers: loadedProviders.length, prompts: loadedPrompts.length }); 

                    } catch (error: any) {
                        logger.error('Error loading AI config:', { error: error.message });
                        set(state => { 
                            state.aiError = error.message || 'An unknown error occurred while loading AI configuration.';
                            state.isConfigLoading = false;
                        });
                    }
                },

                sendMessage: async (data) => {
                    const { message, providerId, promptId, chatId: inputChatId, isAnonymous } = data; // Renamed chatId to avoid conflict
                    const { anonymousMessageCount, anonymousMessageLimit, currentChatId } = get();

                    // --- 1. Synchronous Limit Check ---
                    if (isAnonymous && anonymousMessageCount >= anonymousMessageLimit) {
                        logger.warn('Anonymous message limit reached.', { count: anonymousMessageCount });
                        return { error: 'limit_reached' };
                    }

                    // --- 2. Synchronous Initial State Updates ---
                    set(state => {
                        state.isLoadingAiResponse = true;
                        state.aiError = null;
                        if (isAnonymous) {
                            state.anonymousMessageCount = Number(state.anonymousMessageCount || 0) + 1;
                            logger.info('[sendMessage] Incremented anonymous count to:', { count: state.anonymousMessageCount });
                        }
                    });

                    // Add optimistic message AFTER setting loading state
                    const tempUserMessageId = _addOptimisticUserMessage(message);

                    // --- 3. Asynchronous API Call & Subsequent State Updates ---
                    try {
                        const effectiveChatId = inputChatId ?? currentChatId ?? undefined; // Use input chatId first, then store's currentChatId
                        const requestData: ChatApiRequest = { message, providerId, promptId, chatId: effectiveChatId };
                        const response = await api.ai().sendChatMessage(requestData);

                        // Process successful response
                        if (!response.error && response.data) {
                            const assistantMessage = response.data;
                            set((state) => {
                                // Update chat ID if it was new
                                if (!state.currentChatId && assistantMessage.chat_id) {
                                    state.currentChatId = assistantMessage.chat_id;
                                    // Update the optimistic message's chat_id as well
                                    const userMsgIndex = state.currentChatMessages.findIndex((m: ChatMessage) => m.id === tempUserMessageId);
                                    if (userMsgIndex > -1) {
                                        state.currentChatMessages[userMsgIndex].chat_id = assistantMessage.chat_id;
                                    }
                                }
                                // Add assistant message
                                state.currentChatMessages.push(assistantMessage);
                                state.isLoadingAiResponse = false;
                            });
                            logger.info('Message sent and response received:', { messageId: assistantMessage.id });
                            return assistantMessage; // Return success data
                        } else {
                            // Handle explicit API error response from api-client wrapper
                            const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to send message');
                            throw new Error(errorMsg); // Throw to be caught by the catch block
                        }
                    } catch (error: unknown) {
                        // Handle errors from the API call OR the explicit throw above
                        // Use the helper function to handle state updates and logging
                        return _handleSendError(error, tempUserMessageId);
                    }
                },

                loadChatHistory: async () => {
                    logger.info('Loading chat history...');
                    set({ isHistoryLoading: true, aiError: null });
                    try {
                        const response = await api.ai().getChatHistory();
                        if (!response.error && response.data) {
                            set({ chatHistoryList: response.data, isHistoryLoading: false });
                            logger.info('Chat history loaded:', { count: response.data.length });
                        } else {
                            const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to load chat history');
                            throw new Error(errorMsg);
                        }
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : 'An unknown error occurred while loading chat history.');
                        logger.error('Error loading chat history:', { error: message });
                        set({ aiError: message, isHistoryLoading: false, chatHistoryList: [] });
                    }
                },

                loadChatDetails: async (chatId: string) => {
                    if (!chatId) {
                        logger.warn('[loadChatDetails] chatId is required.');
                        set({ aiError: 'Chat ID is required to load details.', isDetailsLoading: false });
                        return;
                    }
                    logger.info(`Loading chat details for ${chatId}...`);
                    set({ isDetailsLoading: true, aiError: null, currentChatId: chatId, currentChatMessages: [] }); // Clear previous messages
                    try {
                        const response = await api.ai().getChatMessages(chatId);
                        if (!response.error && response.data) {
                            set({ currentChatMessages: response.data, isDetailsLoading: false });
                            logger.info(`Chat details loaded for ${chatId}:`, { count: response.data.length });
                        } else {
                            // Handle potential ApiError object in response.error
                            const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to load chat details');
                            throw new Error(errorMsg);
                        }
                    } catch (error: unknown) {
                         const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : 'An unknown error occurred while loading chat details.');
                        logger.error('Error loading chat details:', { error: message, chatId });
                        set({ aiError: message, isDetailsLoading: false, currentChatMessages: [], currentChatId: null }); // Clear on error
                    }
                },

                // Restore deleted actions
                startNewChat: () => {
                    logger.info('Starting new chat state...');
                    set({
                        currentChatMessages: [],
                        currentChatId: null,
                        isLoadingAiResponse: false,
                        aiError: null,
                        // Reset anonymous count when starting a new chat
                        anonymousMessageCount: 0, 
                    });
                },

                incrementAnonymousCount: () => {
                     set((state) => {
                        // Ensure count is treated as a number
                        state.anonymousMessageCount = (state.anonymousMessageCount || 0) + 1;
                     });
                     logger.info('Manually incremented anonymous count', { count: get().anonymousMessageCount });
                 },

                resetAnonymousCount: () => {
                     set((state) => {
                         state.anonymousMessageCount = 0;
                     });
                     logger.info('Reset anonymous count.');
                 },
                
                setAnonymousCount: (count) => {
                     if (typeof count === 'number' && count >= 0) {
                          set({ anonymousMessageCount: count });
                          logger.info('Set anonymous count', { count });
                     } else {
                         logger.warn('Invalid count provided to setAnonymousCount', { count });
                     }
                },

                 clearAiError: () => {
                     logger.info('Clearing AI error state.');
                     set({ aiError: null });
                 },
            };
        }),
        { name: 'aiStore' } // Name for Redux DevTools
    )
);
