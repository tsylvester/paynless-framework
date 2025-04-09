import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { create } from 'zustand';
import {
	AiActions,
	AiProvider,
	AiState,
	ChatMessage,
	SystemPrompt,
	ChatApiRequest,
} from '@paynless/types';
import { api } from '@paynless/api-client'; 
import { logger } from '@paynless/utils';
// Removed produce import as immer middleware handles it

// --- Constants ---
const ANONYMOUS_MESSAGE_LIMIT = 3; 

// --- Initial State Values (for direct use in create) ---
const initialAiStateValues: AiState = {
    availableProviders: [],
    availablePrompts: [],
    currentChatMessages: [],
    currentChatId: null,
    chatHistoryList: [],
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isHistoryLoading: false,
    isDetailsLoading: false,
    aiError: null,
    anonymousMessageCount: 0,
    anonymousMessageLimit: ANONYMOUS_MESSAGE_LIMIT,
};

export const useAiStore = create<AiState & AiActions>()(
    devtools(
        immer((set, get) => ({
            // --- State Properties ---
            ...initialAiStateValues,

            // --- Action Definitions ---
            loadAiConfig: async () => {
                logger.info('Loading AI config...');
                set({ isConfigLoading: true, aiError: null }); // Simple set is fine
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
                    set((state) => { // Use immer set for mutation
                        state.availableProviders = loadedProviders;
                        state.availablePrompts = loadedPrompts;
                        state.isConfigLoading = false;
                    });
                    logger.info('AI Config loaded successfully:', { providers: loadedProviders.length, prompts: loadedPrompts.length });
                } catch (error: any) {
                    logger.error('Error loading AI config:', { error: error.message });
                    set(state => { // Use immer set for mutation
                        state.aiError = error.message || 'An unknown error occurred while loading AI configuration.';
                        state.isConfigLoading = false;
                    });
                }
            },

            sendMessage: async (data) => {
                const { message, providerId, promptId, chatId: inputChatId, isAnonymous } = data;
                const { anonymousMessageCount, anonymousMessageLimit, currentChatId } = get();
                
                if (isAnonymous && anonymousMessageCount >= anonymousMessageLimit) {
                    logger.warn('Anonymous message limit reached.', { count: anonymousMessageCount });
                    return { error: 'limit_reached' };
                }
                
                // Define helpers inline or move outside create if complex
                const _addOptimisticUserMessage = (msgContent: string): string => {
                    const tempId = `temp-user-${Date.now()}`;
                    const userMsg: ChatMessage = {
                         id: tempId, chat_id: currentChatId || 'temp-chat', user_id: 'current-user',
                         role: 'user', content: msgContent, ai_provider_id: null, system_prompt_id: null,
                         token_usage: null, created_at: new Date().toISOString(),
                    };
                    set(state => { state.currentChatMessages.push(userMsg); });
                    logger.info('[sendMessage] Added optimistic user message', { id: tempId });
                    return tempId;
                };
                 const _handleSendError = (error: unknown, optimisticMessageId: string | null): null => {
                    const errorText = error instanceof Error ? error.message : 'An unknown error occurred while sending the message.';
                    logger.error('Error during send message API call:', { error: errorText, optimisticMessageId });
                    set(state => {
                        state.isLoadingAiResponse = false;
                        state.aiError = errorText;
                        if (optimisticMessageId) {
                            const idx = state.currentChatMessages.findIndex(m => m.id === optimisticMessageId);
                            if (idx > -1) {
                                state.currentChatMessages.splice(idx, 1);
                                logger.info('[sendMessage] Removed optimistic message on error', { id: optimisticMessageId });
                            }
                        }
                    });
                    return null;
                };

                // Action Logic continues...
                set(state => { // Use immer set for initial updates
                    state.isLoadingAiResponse = true;
                    state.aiError = null;
                    if (isAnonymous) {
                        state.anonymousMessageCount = Number(state.anonymousMessageCount || 0) + 1;
                        logger.info('[sendMessage] Incremented anonymous count to:', { count: state.anonymousMessageCount });
                    }
                });

                const tempUserMessageId = _addOptimisticUserMessage(message);

                try {
                    const effectiveChatId = inputChatId ?? currentChatId ?? undefined;
                    const requestData: ChatApiRequest = { message, providerId, promptId, chatId: effectiveChatId };
                    const response = await api.ai().sendChatMessage(requestData);

                    if (!response.error && response.data) {
                        const assistantMessage = response.data;
                        set((state) => { // Immer set for success update
                            if (!state.currentChatId && assistantMessage.chat_id) {
                                state.currentChatId = assistantMessage.chat_id;
                                const userMsgIndex = state.currentChatMessages.findIndex((m: ChatMessage) => m.id === tempUserMessageId);
                                if (userMsgIndex > -1) {
                                    state.currentChatMessages[userMsgIndex].chat_id = assistantMessage.chat_id;
                                }
                            }
                            state.currentChatMessages.push(assistantMessage);
                            state.isLoadingAiResponse = false;
                        });
                        logger.info('Message sent and response received:', { messageId: assistantMessage.id });
                        return assistantMessage;
                    } else {
                        const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to send message');
                        throw new Error(errorMsg);
                    }
                } catch (error: unknown) {
                    return _handleSendError(error, tempUserMessageId);
                }
            },
            
            loadChatHistory: async () => {
                logger.info('Loading chat history...');
                set({ isHistoryLoading: true, aiError: null }); // Simple set
                try {
                    const response = await api.ai().getChatHistory();
                    if (!response.error && response.data) {
                        set({ chatHistoryList: response.data, isHistoryLoading: false }); // Simple set
                        logger.info('Chat history loaded:', { count: response.data.length });
                    } else {
                        const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to load chat history');
                        throw new Error(errorMsg);
                    }
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : 'An unknown error occurred while loading chat history.');
                    logger.error('Error loading chat history:', { error: message });
                    set({ aiError: message, isHistoryLoading: false, chatHistoryList: [] }); // Simple set
                }
            },

            loadChatDetails: async (chatId: string) => {
                if (!chatId) {
                    logger.warn('[loadChatDetails] chatId is required.');
                    set({ aiError: 'Chat ID is required to load details.', isDetailsLoading: false }); // Simple set
                    return;
                }
                logger.info(`Loading chat details for ${chatId}...`);
                set({ isDetailsLoading: true, aiError: null, currentChatId: chatId, currentChatMessages: [] }); // Simple set
                try {
                    const response = await api.ai().getChatMessages(chatId);
                    if (!response.error && response.data) {
                        set({ currentChatMessages: response.data, isDetailsLoading: false }); // Simple set
                        logger.info(`Chat details loaded for ${chatId}:`, { count: response.data.length });
                    } else {
                        const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to load chat details');
                        throw new Error(errorMsg);
                    }
                } catch (error: unknown) {
                     const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : 'An unknown error occurred while loading chat details.');
                    logger.error('Error loading chat details:', { error: message, chatId });
                    set({ aiError: message, isDetailsLoading: false, currentChatMessages: [], currentChatId: null }); // Simple set
                }
            },

            startNewChat: () => {
                logger.info('Starting new chat state...');
                set(state => { // Immer set
                    state.currentChatMessages = [];
                    state.currentChatId = null;
                    state.isLoadingAiResponse = false;
                    state.aiError = null;
                    state.anonymousMessageCount = 0;
                });
            },

            incrementAnonymousCount: () => {
                 set((state) => { // Immer set
                    state.anonymousMessageCount = (state.anonymousMessageCount || 0) + 1;
                 });
                 logger.info('Manually incremented anonymous count', { count: get().anonymousMessageCount });
             },

            resetAnonymousCount: () => {
                 set((state) => { // Immer set
                     state.anonymousMessageCount = 0;
                 });
                 logger.info('Reset anonymous count.');
             },
            
            setAnonymousCount: (count) => {
                 if (typeof count === 'number' && count >= 0) {
                     set({ anonymousMessageCount: count }); // Simple set
                     logger.info('Set anonymous count', { count });
                 } else {
                     logger.warn('Invalid count provided to setAnonymousCount', { count });
                 }
             },
             clearAiError: () => {
                logger.info('Clearing AI error state.');
                set({ aiError: null }); // Simple set
             },
        })),
        { name: 'aiStore' }
    )
);
