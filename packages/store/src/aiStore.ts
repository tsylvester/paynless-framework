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
	FetchOptions,
    ApiResponse,
} from '@paynless/types';
import { api } from '@paynless/api-client';
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore';
// Removed produce import as immer middleware handles it

// --- Constants ---
// --- Removed ANONYMOUS_MESSAGE_LIMIT ---

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
    // --- Removed anonymousMessageCount and anonymousMessageLimit ---
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
                const { message, providerId, promptId, chatId: inputChatId } = data;
                const { currentChatId } = get(); 

                // Let the API call proceed, and handle potential 401 via AuthRequiredError
                const token = useAuthStore.getState().session?.access_token; // Still need token for options if logged in

                // Define helpers inline or move outside create if complex
                const _addOptimisticUserMessage = (msgContent: string): string => {
                    const tempId = `temp-user-${Date.now()}`;
                    const userMsg: ChatMessage = {
                         id: tempId, chat_id: currentChatId || 'temp-chat', user_id: 'current-user', // Replace 'current-user' if actual user ID available
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
                    // --- Removed anonymous count increment ---
                });

                const tempUserMessageId = _addOptimisticUserMessage(message);

                try {
                    const effectiveChatId = inputChatId ?? currentChatId ?? undefined;
                    const requestData: ChatApiRequest = { message, providerId, promptId, chatId: effectiveChatId };
                    const options: FetchOptions = { token }; 

                    // ---> Call API and get the full response object <--- 
                    const response: ApiResponse<ChatMessage> = await api.ai().sendChatMessage(requestData, options);

                    // ---> Check for errors returned in the response object <--- 
                    if (response.error) {
                        // Throw the error to be caught by the outer catch block
                        throw new Error(response.error.message || 'API returned an error');
                    }

                    // ---> Success Handling (requires response.data) <--- 
                    // Ensure data exists (type guard)
                    if (response.data) {
                        const assistantMessage = response.data; // Now we have the ChatMessage
                        set((state) => {
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
                        // Should not happen if error is null, but handle defensively
                        throw new Error('API returned success status but no data.');
                    }

                } catch (err: any) { // Catches AuthRequiredError, network errors, or errors thrown from above
                    // ---> Check error name instead of instanceof <--- 
                    if (err?.name === 'AuthRequiredError') { 
                        logger.warn('sendMessage caught AuthRequiredError. Triggering login flow...');
                        const navigate = useAuthStore.getState().navigate;
                        if (navigate) {
                            navigate('/login');
                        } else {
                            logger.error('Navigate function not found in authStore. Cannot redirect for login.');
                            // Fallback: Set error state if navigation fails
                             set(state => {
                                state.aiError = err.message || 'Authentication required. Please log in.'; 
                             });
                        }
                        // Ensure optimistic message is removed even if navigation fails
                        set(state => {
                            state.currentChatMessages = state.currentChatMessages.filter(
                                (msg) => msg.id !== tempUserMessageId
                            );
                        });
                    } else {
                        // ---> Handle other errors (network, non-401 API errors) <--- 
                        const errorMessage = err?.message || String(err) || 'Unknown error during send message API call';
                        logger.error('Error during send message API call (catch block):', {
                            errorMessage: errorMessage,
                            optimisticMessageId: tempUserMessageId,
                            errorDetails: err 
                        });
                        set(state => {
                            state.currentChatMessages = state.currentChatMessages.filter(
                                (msg) => msg.id !== tempUserMessageId
                            );
                            logger.info('Removed optimistic message on generic error/network error', { id: tempUserMessageId });
                            state.aiError = errorMessage;
                        });
                    }
                    return null; // Return null on any error
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
                    set({ aiError: 'Chat ID is required to load details.', isDetailsLoading: false });
                    return;
                }
                logger.info(`Loading chat details for ${chatId}...`);
                set({ isDetailsLoading: true, aiError: null, currentChatId: chatId, currentChatMessages: [] });

                // Get token from authStore state
                const token = useAuthStore.getState().session?.access_token;

                // Check if token exists
                if (!token) {
                    logger.error('Cannot load chat details: No auth token available in authStore state.');
                    set({ aiError: 'Authentication required', isDetailsLoading: false });
                    return; // Stop if no token
                }

                try {
                    // Pass the chatId AND token to the API call
                    const response = await api.ai().getChatMessages(chatId, token);
                    if (!response.error && response.data) {
                        set({ currentChatMessages: response.data, isDetailsLoading: false });
                        logger.info(`Chat details loaded for ${chatId}:`, { count: response.data.length });
                    } else {
                        const errorMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Failed to load chat details');
                        throw new Error(errorMsg);
                    }
                } catch (error: unknown) {
                     const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : 'An unknown error occurred while loading chat details.');
                    logger.error('Error loading chat details:', { error: message, chatId });
                    set({ aiError: message, isDetailsLoading: false, currentChatMessages: [], currentChatId: null });
                }
            },

            startNewChat: () => {
                logger.info('Starting new chat state...');
                set(state => { // Immer set
                    state.currentChatMessages = [];
                    state.currentChatId = null;
                    state.isLoadingAiResponse = false;
                    state.aiError = null;
                });
            },

            clearAiError: () => {
                logger.info('Clearing AI error state.');
                set({ aiError: null }); // Simple set
             },
        })),
        { name: 'ai-storage' } // persist middleware configuration
    )
);
