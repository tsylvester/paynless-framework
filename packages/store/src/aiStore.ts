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
                set({ isConfigLoading: true, aiError: null }); 
                try {
                    logger.info('[aiStore] Checking api object before call:', { 
                        apiObjectExists: !!api, 
                        apiAiExists: !!api?.ai,
                    }); 
                    
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
                        throw new Error(errorMessages.join(' \n'));
                    }
                    
                    set({
                        availableProviders: loadedProviders, 
                        availablePrompts: loadedPrompts,   
                        isConfigLoading: false,
                        aiError: null
                    });
                    
                    logger.info(`AI Config loaded successfully. Providers: ${loadedProviders.length}, Prompts: ${loadedPrompts.length}`);

                } catch (error: any) {
                    logger.error('Error loading AI config:', { 
                        error: error.message, 
                        apiObjectExists: !!api, 
                        apiAiExists: !!api?.ai 
                    });
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

                } catch (err: any) {
                    let errorHandled = false;
                    let requiresLogin = false;
                    let errorMessage = err?.message || String(err) || 'Unknown error';

                    // Check 1: Was it the specific AuthRequiredError thrown by apiClient?
                    if (err instanceof AuthRequiredError || err?.name === 'AuthRequiredError') {
                        logger.warn('sendMessage caught AuthRequiredError. Initiating login flow...');
                        requiresLogin = true;
                        errorMessage = err.message || 'Authentication required'; // Use specific message
                    }
                    // Check 2: Was it a generic error thrown *after* apiClient returned a standard 401 response?
                    // We check the original requestData context, assuming the generic error message
                    // might match the one from the 401 ApiResponse. This is slightly indirect.
                    // A potentially cleaner way might involve inspecting a custom property on the thrown generic error,
                    // but let's stick closer to the original structure for now.
                    // ---> THIS CHECK IS LIKELY INSUFFICIENT <--- 
                    // Let's simplify: The primary signal is the AuthRequiredError. If that's not thrown,
                    // the current design means we treat other errors as non-auth-related for the replay mechanism.
                    // We rely on apiClient ONLY throwing AuthRequiredError when replay/login is needed.

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
                        currentChatMessages: response.data || [], // Handle potentially missing messages key
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
                localStorage.removeItem('pendingAction');
                logger.info('[aiStore] Removed pending action from localStorage.');

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
                    } else {
                        throw new Error('API returned success status but no data during replay.');
                    }
                } catch (error: any) {
                    logger.error('[aiStore] Error during pending action replay API call:', { error: error.message || String(error) });
                    set(state => {
                        const updatedMessages = state.currentChatMessages.map(msg =>
                            msg.id === tempId
                                ? { ...msg, status: 'error' as const }
                                : msg
                        );
                        return {
                            currentChatMessages: updatedMessages,
                            isLoadingAiResponse: false,
                            aiError: error.message || String(error)
                        };
                    });
                }
            }
        })
    // )
);
