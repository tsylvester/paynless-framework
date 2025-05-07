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
import type { Chat } from '@paynless/types';

// Re-add the runtime constant hack to ensure build passes
const preserveChatType: Chat = {
    id: 'temp-build-fix',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    organization_id: null,
    system_prompt_id: null,
    title: null,
    user_id: null,
    // Add other required fields from Chat type if necessary, matching their types
    // Example: is_active_in_thread: true // If Chat requires this
} as Chat;
console.log('Using preserveChatType hack for build', !!preserveChatType);


import { api } from '@paynless/api';
import { logger } from '@paynless/utils';
import { useAuthStore } from './authStore';

// --- Constants ---
// --- Removed ANONYMOUS_MESSAGE_LIMIT ---

// --- Initial State Values (for direct use in create) ---
const initialAiStateValues: AiState = {
    availableProviders: [],
    availablePrompts: [],
    chatsByContext: { personal: [], orgs: {} },
    messagesByChatId: {},
    currentChatId: null,
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isLoadingHistoryByContext: { personal: false, orgs: {} },
    isDetailsLoading: false,
    newChatContext: null,
    rewindTargetMessageId: null,
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
                const { currentChatId: existingChatIdFromState, rewindTargetMessageId: currentRewindTargetId } = get(); // Get rewindTargetMessageId

                const token = useAuthStore.getState().session?.access_token;

                const _addOptimisticUserMessage = (msgContent: string, explicitChatId?: string | null): { tempId: string, chatIdUsed: string } => {
                    const tempId = `temp-user-${Date.now()}`;
                    const currentChatIdFromGetter = get().currentChatId; // Get current state ID within the helper
                    const chatIdUsed = (typeof explicitChatId === 'string' && explicitChatId) 
                                        ? explicitChatId 
                                        : (currentChatIdFromGetter || `temp-chat-${Date.now()}`);
                    
                    const userMsg: ChatMessage = {
                         id: tempId, 
                         chat_id: chatIdUsed, 
                         user_id: useAuthStore.getState().user?.id || 'optimistic-user', 
                         role: 'user', 
                         content: msgContent, 
                         status: 'pending', 
                         ai_provider_id: null, 
                         system_prompt_id: null,
                         token_usage: null, 
                         created_at: new Date(parseInt(tempId.split('-')[2])).toISOString(),
                         is_active_in_thread: true
                    };
                    set(state => ({ 
                        messagesByChatId: { 
                            ...state.messagesByChatId, 
                            [chatIdUsed]: [...(state.messagesByChatId[chatIdUsed] || []), userMsg] 
                        }
                    }));
                    logger.info('[sendMessage] Added optimistic user message', { id: tempId, chatId: chatIdUsed });
                    return { tempId, chatIdUsed };
                };

                set({ isLoadingAiResponse: true, aiError: null });

                const { tempId: tempUserMessageId, chatIdUsed: optimisticMessageChatId } = _addOptimisticUserMessage(message, inputChatId); 

                const effectiveChatIdForApi = inputChatId ?? existingChatIdFromState ?? undefined;
                
                // Determine organizationId for the API call
                let organizationIdForApi: string | undefined | null = undefined;
                if (!effectiveChatIdForApi) { // It's a new chat
                    organizationIdForApi = get().newChatContext; // Get from state, could be null or orgId
                } else {
                    // For existing chats, orgId is implicit in the chatId, API/backend handles this.
                    // We don't need to explicitly find the orgId from chatsByContext here.
                    organizationIdForApi = undefined; // Explicitly undefined for existing chats in request
                }

                const requestData: ChatApiRequest = { 
                    message, 
                    providerId, 
                    promptId, 
                    chatId: effectiveChatIdForApi, 
                    organizationId: organizationIdForApi, // Add organizationId to the request
                    // Conditionally add rewindFromMessageId
                    ...(effectiveChatIdForApi && currentRewindTargetId && { rewindFromMessageId: currentRewindTargetId })
                };
                const options: FetchOptions = { token }; 
                
                try {
                    const response: ApiResponse<ChatMessage> = await api.ai().sendChatMessage(requestData, options);

                    if (response.error) {
                        throw new Error(response.error.message || 'API returned an error');
                    }

                    if (response.data) {
                        const assistantMessage = response.data;
                        let finalChatIdForLog: string | null | undefined = null; // Variable for logging

                        set(state => {
                            const actualNewChatId = assistantMessage.chat_id; 
                            const finalChatId = actualNewChatId || existingChatIdFromState;
                            finalChatIdForLog = finalChatId; // Assign for logging outside this scope

                            if (!finalChatId) {
                                logger.error('[sendMessage] Critical error: finalChatId is undefined after successful API call.');
                                // When returning early, ensure all necessary parts of state are preserved or intentionally set
                                return { 
                                    ...state, 
                                    isLoadingAiResponse: false, 
                                    aiError: 'Internal error: Chat ID missing post-send.'
                                };
                            }

                            let messagesForChatProcessing = [...(state.messagesByChatId[optimisticMessageChatId] || [])];
                            const isRewindOperation = !!(effectiveChatIdForApi && currentRewindTargetId);

                            if (isRewindOperation && finalChatId) {
                                // Rewind logic: Rebuild message history
                                const originalMessagesForChat = state.messagesByChatId[finalChatId] || [];
                                const rewindTargetIndex = originalMessagesForChat.findIndex(msg => msg.id === currentRewindTargetId);

                                let newHistoryBase: ChatMessage[] = [];
                                if (rewindTargetIndex !== -1) {
                                    newHistoryBase = originalMessagesForChat.slice(0, rewindTargetIndex);
                                }

                                // Find the optimistic user message (it should be the last one added for this chat)
                                const optimisticUserMessage = messagesForChatProcessing.find(msg => msg.id === tempUserMessageId);
                                if (optimisticUserMessage) {
                                    newHistoryBase.push({ ...optimisticUserMessage, chat_id: finalChatId, status: 'sent' as const });
                                }
                                newHistoryBase.push(assistantMessage); 
                                messagesForChatProcessing = newHistoryBase;

                            } else {
                                // Standard logic: Update optimistic and add assistant message
                                messagesForChatProcessing = messagesForChatProcessing.map(msg =>
                                    msg.id === tempUserMessageId
                                        ? { ...msg, chat_id: finalChatId, status: 'sent' as const }
                                        : msg
                                );
                                messagesForChatProcessing.push(assistantMessage);
                            }

                            const newMessagesByChatId = { ...state.messagesByChatId };

                            if (optimisticMessageChatId !== finalChatId && newMessagesByChatId[optimisticMessageChatId]) {
                                newMessagesByChatId[finalChatId] = messagesForChatProcessing;
                                delete newMessagesByChatId[optimisticMessageChatId];
                            } else {
                                newMessagesByChatId[finalChatId] = messagesForChatProcessing;
                            }
                            
                            let updatedChatsByContext = { ...state.chatsByContext };
                            // If it was a new chat, add it to chatsByContext
                            if (optimisticMessageChatId !== finalChatId) {
                                const newChatEntry: Chat = {
                                    id: finalChatId,
                                    // Derive title from first message? Requires access to the first user message here.
                                    // For simplicity, let's use a placeholder or the assistant's first few words.
                                    // The user message is: requestData.message
                                    title: requestData.message.substring(0, 50) + (requestData.message.length > 50 ? '...' : ''), 
                                    user_id: useAuthStore.getState().user?.id || null, 
                                    organization_id: organizationIdForApi ?? null, // Default undefined to null
                                    created_at: new Date().toISOString(), 
                                    updated_at: new Date().toISOString(),
                                    system_prompt_id: requestData.promptId || null,
                                    // Add other non-nullable fields from Chat type with default/null values if necessary
                                };

                                if (organizationIdForApi) {
                                    // Add to existing org list or create new org list
                                    const orgChats = [...(updatedChatsByContext.orgs[organizationIdForApi] || []), newChatEntry];
                                    updatedChatsByContext = {
                                        ...updatedChatsByContext,
                                        orgs: { ...updatedChatsByContext.orgs, [organizationIdForApi]: orgChats }
                                    };
                                } else {
                                    // Add to personal list
                                    updatedChatsByContext = {
                                        ...updatedChatsByContext,
                                        personal: [...updatedChatsByContext.personal, newChatEntry]
                                    };
                                }
                            } else {
                                // TODO: Optionally update the 'updated_at' for an existing chat in chatsByContext?
                                // Requires finding the chat in the list and updating it.
                            }

                            return {
                                ...state, 
                                messagesByChatId: newMessagesByChatId,
                                chatsByContext: updatedChatsByContext, // Set the updated context
                                currentChatId: finalChatId, 
                                isLoadingAiResponse: false,
                                aiError: null,
                                newChatContext: null, 
                                rewindTargetMessageId: isRewindOperation ? null : state.rewindTargetMessageId, // Clear on successful rewind
                            };
                        });
                        logger.info('Message sent and response received:', { messageId: assistantMessage.id, chatId: finalChatIdForLog, rewound: !!(effectiveChatIdForApi && currentRewindTargetId) });
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
                                body: { ...requestData, chatId: effectiveChatIdForApi ?? null },
                                returnPath: 'chat' 
                            };
                            logger.info('[sendMessage] Attempting to call localStorage.setItem with pendingAction:', pendingAction);
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
                        // Use optimisticMessageChatId to ensure we are looking at the correct chat's messages
                        const messagesForChat = state.messagesByChatId[optimisticMessageChatId] || [];
                        const finalMessages = messagesForChat.filter(
                            (msg) => msg.id !== tempUserMessageId
                        );
                        const finalError = errorHandled ? null : errorMessage;

                        if (!errorHandled) {
                             logger.error('Error during send message API call (catch block):', { error: finalError });
                        }
                        return {
                            messagesByChatId: { ...state.messagesByChatId, [optimisticMessageChatId]: finalMessages },
                            aiError: finalError,
                            isLoadingAiResponse: false,
                         };
                    });
                    return null;
                }
            },

            loadChatHistory: async (organizationId?: string | null) => {
                const token = useAuthStore.getState().session?.access_token;
                if (!token) {
                    set(state => ({
                        aiError: 'Authentication token not found.',
                        isLoadingHistoryByContext: organizationId
                            ? { ...state.isLoadingHistoryByContext, orgs: { ...state.isLoadingHistoryByContext.orgs, [organizationId]: false } }
                            : { ...state.isLoadingHistoryByContext, personal: false },
                    }));
                    return;
                }

                if (organizationId) {
                    set(state => ({ isLoadingHistoryByContext: { ...state.isLoadingHistoryByContext, orgs: { ...state.isLoadingHistoryByContext.orgs, [organizationId]: true } }, aiError: null }));
                } else {
                    set(state => ({ isLoadingHistoryByContext: { ...state.isLoadingHistoryByContext, personal: true }, aiError: null }));
                }

                try {
                    // Pass token and optional organizationId to the API client
                    const response = await api.ai().getChatHistory(token, organizationId);
                    if (response.error) {
                        throw new Error(response.error.message || 'Failed to load chat history');
                    }

                    const chatsForContext = response.data || [];

                    if (organizationId) {
                        set(state => ({
                            chatsByContext: {
                                ...state.chatsByContext,
                                orgs: { ...state.chatsByContext.orgs, [organizationId]: chatsForContext },
                            },
                            isLoadingHistoryByContext: { ...state.isLoadingHistoryByContext, orgs: { ...state.isLoadingHistoryByContext.orgs, [organizationId]: false } },
                            aiError: null,
                        }));
                    } else {
                        set(state => ({
                            chatsByContext: {
                                ...state.chatsByContext,
                                personal: chatsForContext,
                            },
                            isLoadingHistoryByContext: { ...state.isLoadingHistoryByContext, personal: false },
                            aiError: null,
                        }));
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while loading chat history.';
                    logger.error('Error loading chat history:', { context: organizationId || 'personal', error: errorMessage });
                    
                    if (organizationId) {
                        set(state => ({
                            aiError: errorMessage,
                            chatsByContext: { ...state.chatsByContext, orgs: { ...state.chatsByContext.orgs, [organizationId]: [] } }, // Clear data for this org on error
                            isLoadingHistoryByContext: { ...state.isLoadingHistoryByContext, orgs: { ...state.isLoadingHistoryByContext.orgs, [organizationId]: false } },
                        }));
                    } else {
                        set(state => ({
                            aiError: errorMessage,
                            chatsByContext: { ...state.chatsByContext, personal: [] }, // Clear personal data on error
                            isLoadingHistoryByContext: { ...state.isLoadingHistoryByContext, personal: false },
                        }));
                    }
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
                    set(state => ({
                        messagesByChatId: { ...state.messagesByChatId, [chatId]: response.data || [] }, // Handle potentially missing messages key
                        isDetailsLoading: false,
                        currentChatId: chatId, // Confirm chatId
                        aiError: null,
                    }));
                } catch (error: unknown) {
                    logger.error('Error loading chat details:', { chatId, error: error instanceof Error ? error.message : String(error) });
                    // Use plain set without immer
                    set(state => ({
                        aiError: error instanceof Error ? error.message : 'An unexpected error occurred while loading chat details.',
                        messagesByChatId: { ...state.messagesByChatId, [chatId]: [] },
                        currentChatId: null, // Clear chatId on error
                        isDetailsLoading: false,
                    }));
                }
            },

            startNewChat: (organizationId?: string | null) => {
                 set(state => ({ // Ensure functional update form
                    currentChatId: null,
                    newChatContext: organizationId === undefined ? null : organizationId, 
                    aiError: null,
                    isLoadingAiResponse: false,
                    rewindTargetMessageId: null,
                    messagesByChatId: state.messagesByChatId // Preserve existing messages map using current state from callback
                }));
                logger.info('Started new chat session locally.', { newContext: organizationId === undefined ? null : organizationId });
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
                        messagesByChatId: { ...state.messagesByChatId, [chatIdToUse]: [...(state.messagesByChatId[chatIdToUse] || []), userMsg] }
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
                            const updatedMessages = state.messagesByChatId[chatIdFromAction || ''].map(msg => 
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
                                messagesByChatId: { ...state.messagesByChatId, [chatIdFromAction || '']: finalMessages },
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
                            const updatedMessages = state.messagesByChatId[chatIdFromAction || ''].map(msg =>
                                msg.id === tempId
                                    ? { ...msg, status: 'error' as const }
                                    : msg
                            );
                            return {
                                messagesByChatId: { ...state.messagesByChatId, [chatIdFromAction || '']: updatedMessages },
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
