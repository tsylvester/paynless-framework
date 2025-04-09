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
import { useAuthStore } from './authStore';
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

                    // Check if the response has data and the expected nested array exists
                    if (!providersResponse.error && providersResponse.data && Array.isArray((providersResponse.data as any).providers)) {
                        loadedProviders = (providersResponse.data as any).providers;
                    } else if (providersResponse.error) {
                        errorMessages.push(providersResponse.error?.message || 'Failed to load AI providers.');
                    } // If no error but data/array is missing, loadedProviders remains []
                    
                    // Check if the response has data and the expected nested array exists
                    if (!promptsResponse.error && promptsResponse.data && Array.isArray((promptsResponse.data as any).prompts)) {
                        loadedPrompts = (promptsResponse.data as any).prompts;
                    } else if (promptsResponse.error) {
                        errorMessages.push(promptsResponse.error?.message || 'Failed to load system prompts.');
                    } // If no error but data/array is missing, loadedPrompts remains []
                    
                    if (errorMessages.length > 0) {
                        throw new Error(errorMessages.join(' \n'));
                    }
                    
                    // State update remains the same, as loadedProviders/loadedPrompts are now correctly assigned arrays
                    set({
                        availableProviders: loadedProviders, // No need for Array.isArray check here now
                        availablePrompts: loadedPrompts,   // No need for Array.isArray check here now
                        isConfigLoading: false,
                        aiError: null // Clear error on success
                    });
                    
                    // Log counts explicitly using the correctly assigned arrays
                    logger.info(`AI Config loaded successfully. Providers: ${loadedProviders.length}, Prompts: ${loadedPrompts.length}`);
                } catch (error: any) {
                    logger.error('Error loading AI config:', { error: error.message });
                    set(state => { // Use immer set for mutation
                        // Ensure state is reset to empty arrays on error too
                        state.availableProviders = [];
                        state.availablePrompts = []; 
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
                    const response = await api.ai().sendChatMessage(requestData, { isPublic: isAnonymous });

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
                } catch (err: any) {
                    logger.error('Error during send message API call:', {
                        error: err?.message || err?.error || err,
                        optimisticMessageId: tempUserMessageId,
                    });
                    // Update state using Immer pattern within set
                    set(state => {
                        // Remove optimistic message on error
                        state.currentChatMessages = state.currentChatMessages.filter(
                            (msg) => msg.id !== tempUserMessageId
                        );
                        logger.info('Removed optimistic message on error', { id: tempUserMessageId });
                        // Update error state
                        state.aiError = err?.message || err?.error?.message || 'Failed to send message';
                    });
                    return null; // Explicitly return null on error
                } finally {
                    // Always reset loading state
                    set(state => {
                        state.isLoadingAiResponse = false;
                    });
                }
            },
            
            loadChatHistory: async () => {
                logger.info('Loading chat history...');
                set({ isHistoryLoading: true, aiError: null });
                
                // Get token from authStore state
                const token = useAuthStore.getState().session?.access_token;
                
                // Check if token exists
                if (!token) {
                    logger.error('Cannot load chat history: No auth token available in authStore state.');
                    set({ aiError: 'Authentication required', isHistoryLoading: false });
                    return; // Stop if no token
                }
                
                try {
                    // Pass the token to the API call
                    // Corrected: Call the function api.ai() to get the client instance
                    const response = await api.ai().getChatHistory(token);
                    if (!response.error && response.data) {
                        // Ensure chatHistoryList is always an array
                        const historyData = Array.isArray(response.data) ? response.data : [];
                        set({ chatHistoryList: historyData, isHistoryLoading: false });
                        logger.info('Chat history loaded:', { count: historyData.length }); // Log length of the guaranteed array
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
