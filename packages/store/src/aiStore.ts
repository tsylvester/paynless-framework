import { create } from 'zustand';
import {
	AiProvider,
	SystemPrompt,
	ChatMessage,
	ChatApiRequest,
	FetchOptions,
    ApiResponse,
    AiState, 
    AiStore // Import the combined type
} from '@paynless/types';
import { api } from '@paynless/api-client';
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore';

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
};

// Use the imported AiStore type
export const useAiStore = create<AiStore>()(
    // devtools(
        // immer(
            (set, get) => ({
            // --- State Properties ---
            ...initialAiStateValues,

            // --- Action Definitions ---
            loadAiConfig: async () => {
                logger.info('Loading AI config...');
                // Use plain set without immer
                set({ isConfigLoading: true, aiError: null }); 
                try {
                    const [providersResponse, promptsResponse] = await Promise.all([
                        api.ai().getAiProviders(),
                        api.ai().getSystemPrompts(),
                    ]);
                    let errorMessages: string[] = [];
                    let loadedProviders: AiProvider[] = [];
                    let loadedPrompts: SystemPrompt[] = [];

                    // Check providers response
                    if (!providersResponse.error && providersResponse.data && Array.isArray((providersResponse.data as any).providers)) {
                        loadedProviders = (providersResponse.data as any).providers;
                    } else if (providersResponse.error) {
                        errorMessages.push(providersResponse.error?.message || 'Failed to load AI providers.');
                    }
                    
                    // Check prompts response
                    if (!promptsResponse.error && promptsResponse.data && Array.isArray((promptsResponse.data as any).prompts)) {
                        loadedPrompts = (promptsResponse.data as any).prompts;
                    } else if (promptsResponse.error) {
                        errorMessages.push(promptsResponse.error?.message || 'Failed to load system prompts.');
                    }
                    
                    if (errorMessages.length > 0) {
                        // Combine errors properly
                        throw new Error(errorMessages.join(' \n'));
                    }
                    
                    // Use plain set without immer
                    set({
                        availableProviders: loadedProviders, 
                        availablePrompts: loadedPrompts,   
                        isConfigLoading: false,
                        aiError: null // Clear error on success
                    });
                    
                    logger.info(`AI Config loaded successfully. Providers: ${loadedProviders.length}, Prompts: ${loadedPrompts.length}`);
                } catch (error: any) {
                    logger.error('Error loading AI config:', { error: error.message });
                    // Use plain set without immer
                    set({
                        availableProviders: [], 
                        availablePrompts: [],  
                        aiError: error.message || 'An unknown error occurred while loading AI configuration.',
                        isConfigLoading: false,
                    });
                }
            },

            sendMessage: async (data) => {
                const { message, providerId, promptId, chatId: inputChatId } = data;
                const { currentChatId: existingChatId } = get(); // Get current chatId from state

                const token = useAuthStore.getState().session?.access_token;

                const _addOptimisticUserMessage = (msgContent: string): string => {
                    const tempId = `temp-user-${Date.now()}`;
                    const userMsg: ChatMessage = {
                         id: tempId, chat_id: existingChatId || 'temp-chat', user_id: 'current-user', 
                         role: 'user', content: msgContent, ai_provider_id: null, system_prompt_id: null,
                         token_usage: null, created_at: new Date().toISOString(),
                    };
                    // Use plain set without immer
                    set(state => ({ 
                        currentChatMessages: [...state.currentChatMessages, userMsg]
                    }));
                    logger.info('[sendMessage] Added optimistic user message', { id: tempId });
                    return tempId;
                };

                // Use plain set without immer
                set({ isLoadingAiResponse: true, aiError: null });

                const tempUserMessageId = _addOptimisticUserMessage(message);

                const effectiveChatId = inputChatId ?? existingChatId ?? undefined;
                const requestData: ChatApiRequest = { message, providerId, promptId, chatId: effectiveChatId };
                const options: FetchOptions = { token }; 
                
                try {
                    const response: ApiResponse<ChatMessage> = await api.ai().sendChatMessage(requestData, options);

                    if (response.error) {
                        throw new Error(response.error.message || 'API returned an error');
                    }

                    if (response.data) {
                        const assistantMessage = response.data;
                        // Use plain set without immer - more complex state update
                        set(state => {
                            const newChatId = assistantMessage.chat_id;
                            let updatedMessages = state.currentChatMessages;
                            // Fix: Update chat_id of the user message if a newChatId is received,
                            // regardless of whether existingChatId was present.
                            if (newChatId) { 
                                updatedMessages = updatedMessages.map(msg => 
                                    msg.id === tempUserMessageId ? { ...msg, chat_id: newChatId } : msg
                                );
                            }
                            // Add the assistant message
                            updatedMessages.push(assistantMessage);

                            return {
                                currentChatId: newChatId || existingChatId || null,
                                currentChatMessages: updatedMessages,
                                isLoadingAiResponse: false,
                            };
                        });
                        logger.info('Message sent and response received:', { messageId: assistantMessage.id });
                        return assistantMessage;
                    } else {
                        throw new Error('API returned success status but no data.');
                    }

                } catch (err: any) {
                    let errorHandled = false;
                    let authErrorMessage: string | null = null; // Store original auth error message

                    if (err?.name === 'AuthRequiredError') { 
                        logger.warn('sendMessage caught AuthRequiredError...');
                        authErrorMessage = err.message || 'Authentication required'; // Capture the message
                        let storageSuccess = false; 
                        try {
                            const pendingAction = { 
                                endpoint: 'chat', 
                                method: 'POST',
                                body: { ...requestData, chatId: effectiveChatId ?? null }, 
                                returnPath: '/chat'
                            };
                            sessionStorage.setItem('pendingAction', JSON.stringify(pendingAction));
                            logger.info('Stored pending chat action:', pendingAction);
                            storageSuccess = true; 
                        } catch (storageError: unknown) {
                           logger.error('Failed to store pending action in sessionStorage:', { 
                                error: storageError instanceof Error ? storageError.message : String(storageError)
                           });
                        }
                        
                        if (storageSuccess) {
                            const navigate = useAuthStore.getState().navigate;
                            if (navigate) {
                                navigate('/login');
                                errorHandled = true; // Set only if navigation occurs
                            } else {
                                logger.error('Navigate function not found after successful storage...');
                            }
                        }
                    }

                    // Use plain set without immer for error/cleanup
                    set(state => {
                        const finalMessages = state.currentChatMessages.filter(
                            (msg) => msg.id !== tempUserMessageId
                        );
                        const finalError = errorHandled 
                            ? null 
                            : (authErrorMessage || err?.message || String(err) || 'Unknown error');
                            
                        if (!errorHandled) {
                             logger.error('Error during send message API call (catch block):', { error: finalError });
                        }
                        return { 
                            currentChatMessages: finalMessages,
                            aiError: finalError,
                            isLoadingAiResponse: false, 
                         };
                    });
                    return null;
                } 
            },

            loadChatHistory: async () => {
                const token = useAuthStore.getState().session?.access_token;
                if (!token) {
                    set({ aiError: 'Authentication token not found.', isHistoryLoading: false });
                    return;
                }
                set({ isHistoryLoading: true, aiError: null });
                try {
                    // Pass token directly as a string if that's what the API expects
                    const response = await api.ai().getChatHistory(token); 
                    if (response.error) {
                        throw new Error(response.error.message || 'Failed to load chat history');
                    }
                    // Use plain set without immer
                    set({
                        chatHistoryList: (response.data as any)?.history || [], // Handle potentially missing history key
                        isHistoryLoading: false,
                        aiError: null,
                    });
                } catch (error: any) {
                    logger.error('Error loading chat history:', { error: error.message });
                    // Use plain set without immer
                    set({
                        aiError: error.message || 'An unexpected error occurred while loading chat history.',
                        chatHistoryList: [],
                        isHistoryLoading: false,
                    });
                }
            },

            loadChatDetails: async (chatId) => {
                if (!chatId) {
                    set({ aiError: 'Chat ID is required to load details.', isDetailsLoading: false });
                    return;
                }
                const token = useAuthStore.getState().session?.access_token;
                 if (!token) {
                    set({ aiError: 'Authentication token not found.', isDetailsLoading: false });
                    return;
                }
                set({ isDetailsLoading: true, aiError: null, currentChatId: chatId }); // Optimistically set chatId
                try {
                    // Pass token directly as a string
                    const response = await api.ai().getChatMessages(chatId, token); 
                    if (response.error) {
                         throw new Error(response.error.message || 'Failed to load chat details');
                    }
                    // Use plain set without immer
                     set({
                        currentChatMessages: (response.data as any)?.messages || [], // Handle potentially missing messages key
                        isDetailsLoading: false,
                        currentChatId: chatId, // Confirm chatId
                        aiError: null,
                    });
                } catch (error: any) {
                    logger.error('Error loading chat details:', { chatId, error: error.message });
                    // Use plain set without immer
                    set({
                        aiError: error.message || 'An unexpected error occurred while loading chat details.',
                        currentChatMessages: [],
                        currentChatId: null, // Clear chatId on error
                        isDetailsLoading: false,
                    });
                }
            },

            startNewChat: () => {
                 // Use plain set without immer
                 set({ 
                    currentChatId: null, 
                    currentChatMessages: [], 
                    aiError: null, 
                    isLoadingAiResponse: false 
                });
                logger.info('Started new chat session locally.');
            },

            clearAiError: () => {
                 // Use plain set without immer
                 set({ aiError: null });
            },
            
        })
    // )
);
