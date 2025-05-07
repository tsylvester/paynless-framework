import { create } from 'zustand';
import {
	AiProvider,
	SystemPrompt,
	ChatMessage,
	ChatApiRequest,
	FetchOptions,
    ApiResponse,
    AiState, 
    AiStore, // Import the combined type
    PendingAction, // <<< Add this import
    AuthRequiredError // <<< Add this import
} from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore';

// --- Constants ---
// --- Removed ANONYMOUS_MESSAGE_LIMIT ---

// --- Initial State Values (for direct use in create) ---
const initialAiStateValues: AiState = {
    availableProviders: [],
    availablePrompts: [],
    currentChatId: null,
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isDetailsLoading: false,
    aiError: null,

    // New context-aware state
    chatsByContext: { 
        personal: [], 
        orgs: {}
    },
    messagesByChatId: {},
    isLoadingHistoryByContext: { 
        personal: false, 
        orgs: {}
    },
    newChatContext: null,
    rewindTargetMessageId: null,
    
    // Token tracking placeholders - will be initialized if defined in AiState
    // chatTokenUsage: undefined, 
    // sessionTokenUsage: undefined,
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
                    const errorMessages: string[] = [];
                    let loadedProviders: AiProvider[] = [];
                    let loadedPrompts: SystemPrompt[] = [];

                    // Check providers response
                    // Define expected payload structure
                    type ProvidersPayload = { providers: AiProvider[] };
                    if (!providersResponse.error && providersResponse.data && typeof providersResponse.data === 'object' && providersResponse.data !== null && 'providers' in providersResponse.data && Array.isArray((providersResponse.data as ProvidersPayload).providers)) {
                        loadedProviders = (providersResponse.data as ProvidersPayload).providers;
                    } else if (providersResponse.error) {
                        errorMessages.push(providersResponse.error?.message || 'Failed to load AI providers.');
                    }
                    
                    // Check prompts response
                    // Define expected payload structure
                    type PromptsPayload = { prompts: SystemPrompt[] };
                    if (!promptsResponse.error && promptsResponse.data && typeof promptsResponse.data === 'object' && promptsResponse.data !== null && 'prompts' in promptsResponse.data && Array.isArray((promptsResponse.data as PromptsPayload).prompts)) {
                        loadedPrompts = (promptsResponse.data as PromptsPayload).prompts;
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
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while loading AI configuration.';
                    logger.error('Error loading AI config:', { error: errorMessage });
                    // Use plain set without immer
                    set({
                        availableProviders: [], 
                        availablePrompts: [],  
                        aiError: errorMessage,
                        isConfigLoading: false,
                    });
                }
            },

            sendMessage: async (data) => {
                const { message, providerId, promptId, chatId: inputChatId } = data;
                const { currentChatId: existingChatId } = get(); // Get current chatId from state

                const token = useAuthStore.getState().session?.access_token;

                // --- Refactored Helper --- 
                // Now accepts optional explicitChatId
                const _addOptimisticUserMessage = (msgContent: string, explicitChatId?: string | null): string => {
                    const tempId = `temp-user-${Date.now()}`;
                    const existingChatId = get().currentChatId; // Get current state ID
                    // Use explicit ID if provided, else fallback to existing or temp string
                    const chatIdToUse = (typeof explicitChatId === 'string' && explicitChatId) 
                                        ? explicitChatId 
                                        : (existingChatId || `temp-chat-${Date.now()}`); // Fallback to new temp ID
                    
                    const userMsg: ChatMessage = {
                         id: tempId, 
                         chat_id: chatIdToUse, // Use determined chat ID
                         user_id: useAuthStore.getState().user?.id || 'optimistic-user', 
                         role: 'user', 
                         content: msgContent, 
                         status: 'pending', // Add status
                         ai_provider_id: null, 
                         system_prompt_id: null,
                         token_usage: null, 
                         created_at: new Date(parseInt(tempId.split('-')[2])).toISOString(),
                         is_active_in_thread: true
                    };
                    set(state => ({ 
                        currentChatMessages: [...state.currentChatMessages, userMsg]
                    }));
                    logger.info('[sendMessage] Added optimistic user message', { id: tempId, chatId: chatIdToUse });
                    return tempId;
                };
                // --- End Refactored Helper ---

                set({ isLoadingAiResponse: true, aiError: null });

                // Call helper without explicit chatId - it will use current state or temp
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

                } catch (err: unknown) {
                    let errorHandled = false;
                    let requiresLogin = false;
                    // Safely access message
                    let errorMessage = (err instanceof Error ? err.message : String(err)) || 'Unknown error'; 

                    // Check 1: Was it the specific AuthRequiredError thrown by apiClient?
                    // Check name property as well for robustness
                    if (err instanceof AuthRequiredError || (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AuthRequiredError')) {
                        logger.warn('sendMessage caught AuthRequiredError. Initiating login flow...');
                        requiresLogin = true;
                        // Use specific message if available, otherwise fall back
                        errorMessage = (err instanceof Error ? err.message : null) || 'Authentication required'; 
                    }
                    // Check 2: (Simplified - rely on AuthRequiredError being thrown explicitly)

                    // If AuthRequiredError was caught, try to save pending action and navigate
                    if (requiresLogin) {
                        let storageSuccess = false;
                        try {
                            const pendingAction = {
                                endpoint: 'chat',
                                method: 'POST',
                                body: { ...requestData, chatId: effectiveChatId ?? null },
                                returnPath: 'chat' // Or dynamically get current path
                            };
                            localStorage.setItem('pendingAction', JSON.stringify(pendingAction));
                            logger.info('Stored pending chat action:', pendingAction);
                            storageSuccess = true;
                        } catch (storageError: unknown) {
                           logger.error('Failed to store pending action in localStorage:', { 
                                error: storageError instanceof Error ? storageError.message : String(storageError)
                           });
                        }

                        if (storageSuccess) {
                            const navigate = useAuthStore.getState().navigate;
                            if (navigate) {
                                navigate('login');
                                errorHandled = true; // Set flag: state cleanup should clear aiError
                            } else {
                                logger.error('Navigate function not found after successful storage...');
                                // Proceed with error state if navigation fails
                            }
                        }
                        // If storage failed, we also proceed to show an error state
                    }

                    // State update: Clean up optimistic message. Set error ONLY if login wasn't triggered/successful.
                    set(state => {
                        const finalMessages = state.currentChatMessages.filter(
                            (msg) => msg.id !== tempUserMessageId
                        );
                        const finalError = errorHandled ? null : errorMessage;

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
                        chatHistoryList: response.data || [], // Handle potentially missing history key
                        isHistoryLoading: false,
                        aiError: null,
                    });
                } catch (error: unknown) {
                    logger.error('Error loading chat history:', { error: error instanceof Error ? error.message : String(error) });
                    // Use plain set without immer
                    set({
                        aiError: error instanceof Error ? error.message : 'An unexpected error occurred while loading chat history.',
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
                        currentChatMessages: response.data || [], // Handle potentially missing messages key
                        isDetailsLoading: false,
                        currentChatId: chatId, // Confirm chatId
                        aiError: null,
                    });
                } catch (error: unknown) {
                    logger.error('Error loading chat details:', { chatId, error: error instanceof Error ? error.message : String(error) });
                    // Use plain set without immer
                    set({
                        aiError: error instanceof Error ? error.message : 'An unexpected error occurred while loading chat details.',
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
            
            checkAndReplayPendingChatAction: async () => {
                logger.info('[aiStore] Checking for pending chat action...');
                const pendingActionJson = localStorage.getItem('pendingAction');

                if (!pendingActionJson) {
                    logger.info('[aiStore] No pending action found.');
                    return;
                }

                let action: PendingAction | null = null;
                try {
                    action = JSON.parse(pendingActionJson);
                } catch (e) {
                    logger.error('[aiStore] Failed to parse pending action JSON. Removing invalid item.', { error: e });
                    localStorage.removeItem('pendingAction');
                    return;
                }

                // Validate if it's a chat POST action - Added null check for body
                if (!action || action.endpoint !== 'chat' || action.method !== 'POST' || !action.body || typeof action.body['message'] !== 'string') { // Use bracket notation and check type
                    logger.warn('[aiStore] Pending action found, but not a valid chat POST. Ignoring.', { action });
                    return;
                }

                // --- Authentication Check ---
                const token = useAuthStore.getState().session?.access_token;
                if (!token) {
                    logger.error('[aiStore] Cannot replay pending action: User is not authenticated (no token).');
                    set({ aiError: 'Authentication required to replay pending action.' });
                    return;
                }

                // --- Process Valid Chat Action ---
                logger.info('[aiStore] Pending chat action is valid and user authenticated. Processing...');
                // <<< KEEP removeItem commented out here >>>
                // localStorage.removeItem('pendingAction'); 
                // logger.info('[aiStore] Removed pending action from localStorage.');

                // --- Refactored Helper (same as above, defined once in scope) --- 
                const _addOptimisticUserMessage = (msgContent: string, explicitChatId?: string | null): string => {
                    const tempId = `temp-user-${Date.now()}`;
                    const existingChatId = get().currentChatId; // Get current state ID
                    // Use explicit ID if provided, else fallback to existing or temp string
                    const chatIdToUse = (typeof explicitChatId === 'string' && explicitChatId) 
                                        ? explicitChatId 
                                        : (existingChatId || `temp-chat-replay-${Date.now()}`); // Unique temp ID for replay
                    
                    const userMsg: ChatMessage = {
                         id: tempId, 
                         chat_id: chatIdToUse, // Use determined chat ID
                         user_id: useAuthStore.getState().user?.id || 'unknown-replay-user', 
                         role: 'user', 
                         content: msgContent, 
                         status: 'pending', // Add status
                         ai_provider_id: null, 
                         system_prompt_id: null,
                         token_usage: null, 
                         created_at: new Date(parseInt(tempId.split('-')[2])).toISOString(),
                         is_active_in_thread: true
                    };
                    set(state => ({ 
                        currentChatMessages: [...state.currentChatMessages, userMsg]
                    }));
                    logger.info('[replayAction] Added optimistic user message', { id: tempId, chatId: chatIdToUse });
                    return tempId;
                };
                 // --- End Refactored Helper ---

                 set({ isLoadingAiResponse: true, aiError: null });

                 // --- BEGIN ADD OPTIMISTIC UPDATE (using helper) ---
                 const userMessageContent = action?.body?.['message'] as string ?? '[Message content not found]';
                 // Extract chatId from the action, which might be string or null/undefined
                 const chatIdFromAction = (typeof action?.body?.['chatId'] === 'string' ? action.body['chatId'] : null);
                 // Call the refactored helper, passing the chatId from the action
                 const tempId = _addOptimisticUserMessage(userMessageContent, chatIdFromAction);
                 logger.info('[aiStore] Added optimistic pending message for replay via helper.', { tempId });
                 // --- END ADD OPTIMISTIC UPDATE ---

                try {
                    const response: ApiResponse<ChatMessage> = await api.post(
                        '/chat',
                        action.body,
                        { token }
                    );

                    if (response.error) {
                        throw new Error(response.error.message || 'API returned an error during replay');
                    }

                    if (response.data) {
                        const assistantMessage = response.data;
                        logger.info('[aiStore] Pending action replay successful. Received AI response.', { assistantMessage });

                        set(state => {
                            const newChatId = assistantMessage.chat_id;
                            
                            // --- Update existing optimistic message ---
                            const updatedMessages = state.currentChatMessages.map(msg => 
                                msg.id === tempId 
                                    ? { ...msg, status: 'sent' as const, chat_id: newChatId } 
                                    : msg
                            );

                            // --- Add the assistant message ---
                            updatedMessages.push(assistantMessage);
                            
                            // --- Filter out potential duplicates (just in case) ---
                            // This ensures we don't have duplicate assistant messages if the API were ever called twice by mistake
                            const finalMessages = updatedMessages.filter((msg, index, self) =>
                                index === self.findIndex((m) => m.id === msg.id)
                            );

                            return {
                                currentChatMessages: finalMessages,
                                currentChatId: newChatId || state.currentChatId,
                                isLoadingAiResponse: false,
                                aiError: null,
                            };
                        });

                        // <<< CORRECT: Remove pending action ONLY on successful API call and data processing >>>
                        localStorage.removeItem('pendingAction');
                        logger.info('[aiStore] Successfully processed and removed pending action.');

                    } else {
                        throw new Error('API returned success status but no data during replay.');
                    }
                } catch (error: unknown) {
                    // Revert error check back to just checking the name
                    if (error instanceof AuthRequiredError) { 
                        logger.warn('[AiStore] Auth required during replay. Redirecting.', { error: error.message });
                        set({ isLoadingAiResponse: false, aiError: error.message }); // Sets error message
                        // Do NOT remove pending action on auth error
                    } else {
                        logger.error('[aiStore] Error during pending action replay API call:', { error: error instanceof Error ? error.message : String(error) });
                        set(state => {
                            const updatedMessages = state.currentChatMessages.map(msg =>
                                msg.id === tempId
                                    ? { ...msg, status: 'error' as const }
                                    : msg
                            );
                            return {
                                currentChatMessages: updatedMessages,
                                isLoadingAiResponse: false,
                                aiError: error instanceof Error ? error.message : String(error)
                            };
                        });
                    }
                }
            }
        })
    // )
);
