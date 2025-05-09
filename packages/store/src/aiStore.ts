import { create } from 'zustand';
import {
	AiProvider,
	SystemPrompt,
	ChatMessage,
	ChatApiRequest,
	FetchOptions,
    ApiResponse,
    PendingAction,
    AuthRequiredError, // Correctly from @paynless/types
    Chat
} from '@paynless/types';

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

// Define AiState interface locally or ensure it's correctly imported if needed elsewhere
export interface AiState {
    availableProviders: AiProvider[];
    availablePrompts: SystemPrompt[];
    chatsByContext: { personal: Chat[] | undefined, orgs: { [orgId: string]: Chat[] | undefined } };
    messagesByChatId: { [chatId: string]: ChatMessage[] };
    currentChatId: string | null;
    isLoadingAiResponse: boolean;
    isConfigLoading: boolean;
    isLoadingHistoryByContext: { personal: boolean, orgs: { [orgId: string]: boolean } };
    historyErrorByContext: { personal: string | null, orgs: { [orgId: string]: string | null } };
    isDetailsLoading: boolean;
    newChatContext: string | null;
    rewindTargetMessageId: string | null;
    aiError: string | null;
}

// Define AiActions locally within this file
interface AiActions {
  loadAiConfig: () => Promise<void>;
  sendMessage: (data: {
    message: string; 
    providerId: AiProvider['id']; 
    promptId: SystemPrompt['id']; 
    chatId?: Chat['id'] | null; 
  }) => Promise<ChatMessage | null>; 
  loadChatHistory: (organizationId?: string | null) => Promise<void>;
  loadChatDetails: (chatId: Chat['id']) => Promise<void>; 
  startNewChat: (organizationId?: string | null) => void;
  clearAiError: () => void;
  checkAndReplayPendingChatAction: () => Promise<void>;
  deleteChat: (chatId: Chat['id'], organizationId?: string | null) => Promise<void>; // Ensure deleteChat is here
  prepareRewind: (messageId: string, chatId: string) => void;
  cancelRewindPreparation: () => void;
}

// Combine state and actions for the store type
export type AiStore = AiState & AiActions;

// --- Constants ---
// --- Removed ANONYMOUS_MESSAGE_LIMIT ---

// --- Initial State Values (for direct use in create) ---
const initialAiStateValues: AiState = {
    availableProviders: [],
    availablePrompts: [],
    chatsByContext: { personal: undefined, orgs: {} },
    messagesByChatId: {},
    currentChatId: null,
    isLoadingAiResponse: false,
    isConfigLoading: false,
    isLoadingHistoryByContext: { personal: false, orgs: {} },
    historyErrorByContext: { personal: null, orgs: {} },
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
                                        personal: [...(updatedChatsByContext.personal || []), newChatEntry]
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
                const contextKey = organizationId || 'personal';
                const isOrgContext = !!organizationId;
                logger.info(`Loading chat history for context: ${contextKey}`);
                
                set(state => {
                    const newIsLoadingHistoryByContext = { ...state.isLoadingHistoryByContext };
                    const newHistoryErrorByContext = { ...state.historyErrorByContext };

                    if (isOrgContext) {
                        newIsLoadingHistoryByContext.orgs = { ...newIsLoadingHistoryByContext.orgs, [organizationId]: true };
                        newHistoryErrorByContext.orgs = { ...newHistoryErrorByContext.orgs, [organizationId]: null };
                    } else {
                        newIsLoadingHistoryByContext.personal = true;
                        newHistoryErrorByContext.personal = null;
                    }
                    return {
                        isLoadingHistoryByContext: newIsLoadingHistoryByContext,
                        historyErrorByContext: newHistoryErrorByContext,
                        // aiError: null // Keep general aiError for other operations, only clear context-specific error
                    };
                });

                try {
                    const token = useAuthStore.getState().session?.access_token;
                    if (!token && !isOrgContext) { // Only throw for personal if no token
                        throw new AuthRequiredError('Authentication is required to load personal chat history.');
                    }
                    // Ensure token is a string if it exists, otherwise, the API call will handle missing token logic internally
                    // The API client itself checks for token validity.
                    const response: ApiResponse<Chat[]> = await api.ai().getChatHistory(token as string, organizationId);

                    if (response.error) {
                        throw new Error(response.error.message || `Failed to load chat history for ${contextKey}.`);
                    }
                    
                    const history = response.data || [];
                    logger.info(`Chat history loaded successfully for ${contextKey}. Count: ${history.length}`);

                    set(state => {
                        const newChatsByContext = { ...state.chatsByContext };
                        const newIsLoadingHistoryByContext = { ...state.isLoadingHistoryByContext };
                        // Error should remain null if successful, already set by initial part of action

                        if (isOrgContext) {
                            newChatsByContext.orgs = { ...newChatsByContext.orgs, [organizationId]: history };
                            newIsLoadingHistoryByContext.orgs = { ...newIsLoadingHistoryByContext.orgs, [organizationId]: false };
                        } else {
                            newChatsByContext.personal = history;
                            newIsLoadingHistoryByContext.personal = false;
                        }
                        return {
                            chatsByContext: newChatsByContext,
                            isLoadingHistoryByContext: newIsLoadingHistoryByContext,
                        };
                    });

                } catch (error: unknown) {
                    const typedError = error as Error;
                    const errorMessage = typedError.message || `An unknown error occurred while loading history for ${contextKey}.`;
                    logger.error(`Error loading chat history for ${contextKey}:`, { error: errorMessage });
                    set(state => {
                        const newIsLoadingHistoryByContext = { ...state.isLoadingHistoryByContext };
                        const newHistoryErrorByContext = { ...state.historyErrorByContext };

                        if (isOrgContext) {
                            newIsLoadingHistoryByContext.orgs = { ...newIsLoadingHistoryByContext.orgs, [organizationId]: false };
                            newHistoryErrorByContext.orgs = { ...newHistoryErrorByContext.orgs, [organizationId]: errorMessage };
                        } else {
                            newIsLoadingHistoryByContext.personal = false;
                            newHistoryErrorByContext.personal = errorMessage;
                        }
                        return {
                            isLoadingHistoryByContext: newIsLoadingHistoryByContext,
                            historyErrorByContext: newHistoryErrorByContext,
                        };
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
                const pendingActionJSON = localStorage.getItem('pendingAction');
                if (!pendingActionJSON) {
                    logger.info('[aiStore] No pending action found.');
                    return;
                }

                let pendingAction: PendingAction | null = null;
                try {
                    pendingAction = JSON.parse(pendingActionJSON);
                } catch (e) {
                    logger.error('[aiStore] Failed to parse pending action from localStorage.', { error: e });
                    localStorage.removeItem('pendingAction'); // Clear invalid item
                    return;
                }

                if (!pendingAction || typeof pendingAction.body !== 'object' || pendingAction.body === null) {
                    logger.error('[aiStore] Pending action is invalid or body is missing.', { action: pendingAction });
                    localStorage.removeItem('pendingAction'); // Clear invalid item
                    return;
                }


                // Helper inside checkAndReplayPendingChatAction to add optimistic message for replay
                const addOptimisticMessageForReplay = (messageContent: string, existingChatId?: string | null): { tempId: string, chatIdForOptimistic: string } => {
                    const tempId = `temp-user-${Date.now()}`;
                    // If replaying for an existing chat, use its ID. Otherwise, create a temporary one.
                    const chatIdForOptimistic = existingChatId || `temp-chat-replay-${Date.now()}`;

                    const userMsg: ChatMessage = {
                        id: tempId,
                        chat_id: chatIdForOptimistic,
                        user_id: useAuthStore.getState().user?.id || 'optimistic-user-replay',
                        role: 'user',
                        content: messageContent,
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
                            [chatIdForOptimistic]: [...(state.messagesByChatId[chatIdForOptimistic] || []), userMsg]
                        },
                        // Set currentChatId so selectors can pick up the optimistic message
                        currentChatId: chatIdForOptimistic,
                    }));
                    logger.info('[aiStore] Added optimistic pending message for replay via helper.', { tempId, chatIdForOptimistic });
                    return { tempId, chatIdForOptimistic };
                };


                if (pendingAction.endpoint === 'chat' && pendingAction.method === 'POST' && pendingAction.body) {
                    const token = useAuthStore.getState().session?.access_token;
                    if (!token) {
                        logger.error('[aiStore] Cannot replay pending action: User is not authenticated (no token).');
                        set({ aiError: 'Authentication required to replay pending action.' });
                        // Do not remove pendingAction here, user might log in.
                        return;
                    }

                    logger.info('[aiStore] Pending chat action is valid and user authenticated. Processing...');
                    set({ isLoadingAiResponse: true, aiError: null });

                    const messageContent = String(pendingAction.body['message'] || '');
                    // Pass the original chatId from the pending action body if it exists
                    const originalChatIdFromPendingAction = pendingAction.body['chatId'] as string | null | undefined;

                    const { tempId, chatIdForOptimistic } = addOptimisticMessageForReplay(messageContent, originalChatIdFromPendingAction);

                    try {   
                        // Ensure the body sent to API matches ChatApiRequest, especially chatId
                        const apiRequestBody: ChatApiRequest = {
                            message: messageContent,
                            providerId: pendingAction.body['providerId'] as string,
                            promptId: pendingAction.body['promptId'] as string,
                            chatId: originalChatIdFromPendingAction, // Now correctly typed
                            organizationId: pendingAction.body['organizationId'] as string | undefined | null,
                            // rewindFromMessageId is not typically part of a generic pending action replay for send.
                        };

                        const response: ApiResponse<ChatMessage> = await api.post( // Using baseApi.post
                            `/${pendingAction.endpoint}`, // Should be '/chat'
                            apiRequestBody,
                            { token }
                        );

                        if (response.error) {
                            throw new Error(response.error.message || 'API returned an error during replay');
                        }

                        if (response.data) {
                            const assistantMessage = response.data;
                            set(state => {
                                const actualNewChatId = assistantMessage.chat_id;
                                
                                const newMessagesByChatId = { ...state.messagesByChatId };
                                let updatedMessagesForChat = [...(newMessagesByChatId[chatIdForOptimistic] || [])];
                                
                                // Update the optimistic user message to 'sent'
                                updatedMessagesForChat = updatedMessagesForChat.map(msg =>
                                    msg.id === tempId
                                        ? { ...msg, status: 'sent' as const, chat_id: actualNewChatId } // Ensure chat_id is updated
                                        : msg
                                );
                                
                                // Add assistant message
                                updatedMessagesForChat.push(assistantMessage);

                                if (chatIdForOptimistic !== actualNewChatId && newMessagesByChatId[chatIdForOptimistic]) {
                                    newMessagesByChatId[actualNewChatId] = updatedMessagesForChat;
                                    delete newMessagesByChatId[chatIdForOptimistic];
                                } else {
                                    newMessagesByChatId[actualNewChatId] = updatedMessagesForChat;
                                }

                                return {
                                    messagesByChatId: newMessagesByChatId,
                                    currentChatId: actualNewChatId, // Update currentChatId to the real one
                                    isLoadingAiResponse: false,
                                    aiError: null,
                                };
                            });
                            localStorage.removeItem('pendingAction'); // Clear after successful replay
                            logger.info('[aiStore] Pending chat action replayed successfully.', { chatId: assistantMessage.chat_id });
                        } else {
                            throw new Error('API returned success but no data during replay.');
                        }
                    } catch (error: unknown) {
                        // Make the check more robust, similar to sendMessage
                        const isAuthError = error instanceof AuthRequiredError || 
                                          (typeof error === 'object' && error !== null && 'name' in error && (error as {name: string}).name === 'AuthRequiredError');
                        const errorMessage = isAuthError ? 'Session expired during replay. Please log in again.' 
                                           : (error instanceof Error ? error.message : String(error));
                        logger.error('[aiStore] Error during pending action replay API call:', { error: errorMessage });
                        set(state => {
                            const messagesForThisChat = state.messagesByChatId[chatIdForOptimistic];
                            let updatedMessages = messagesForThisChat ? [...messagesForThisChat] : [];

                            if (!isAuthError) { // Only set to 'error' if it's NOT an AuthRequiredError
                                updatedMessages = messagesForThisChat
                                    ? messagesForThisChat.map(msg =>
                                        msg.id === tempId
                                            ? { ...msg, status: 'error' as const }
                                            : msg
                                      )
                                    : [];
                            }
                            // If it is an AuthError, updatedMessages remains as it was (i.e. with 'pending' status)
                            // if (isAuthError) { 
                            //     logger.info('[Replay AuthError Debug] Messages before return in set', { messages: JSON.stringify(updatedMessages) });
                            // } // Removed log

                            return {
                                isLoadingAiResponse: false,
                                aiError: errorMessage,
                                messagesByChatId: {
                                    ...state.messagesByChatId,
                                    [chatIdForOptimistic]: updatedMessages,
                                },
                            };
                        });
                        if (isAuthError) {
                            // Pending action is kept for next login.
                        }
                    }
                } else {
                    logger.warn('[aiStore] Pending action found, but not a valid chat POST. Ignoring.', { action: pendingAction });
                    // Optionally remove if it's clearly malformed and not a chat POST.
                    // localStorage.removeItem('pendingAction');
                }
            },

            deleteChat: async (chatId: string, organizationId?: string | null) => {
                const token = useAuthStore.getState().session?.access_token;
                if (!token) {
                    set({ aiError: 'Authentication token not found.' });
                    return;
                }

                set({ aiError: null }); 

                try {
                    const response = await api.ai().deleteChat(chatId, token, organizationId);

                    if (response.error) {
                        throw new Error(response.error.message || 'Failed to delete chat');
                    }

                    set(state => {
                        const newMessagesByChatId = { ...state.messagesByChatId };
                        delete newMessagesByChatId[chatId];

                        let newChatsByContext = { ...state.chatsByContext };
                        if (organizationId) {
                            const orgChats = (state.chatsByContext.orgs[organizationId] || []).filter(c => c.id !== chatId);
                            newChatsByContext = {
                                ...newChatsByContext,
                                orgs: { ...newChatsByContext.orgs, [organizationId]: orgChats },
                            };
                        } else {
                            const personalChats = (state.chatsByContext.personal || []).filter(c => c.id !== chatId);
                            newChatsByContext = {
                                ...newChatsByContext,
                                personal: personalChats,
                            };
                        }

                        let newCurrentChatId = state.currentChatId;
                        if (state.currentChatId === chatId) {
                            newCurrentChatId = null; 
                        }

                        return {
                            ...state,
                            messagesByChatId: newMessagesByChatId,
                            chatsByContext: newChatsByContext,
                            currentChatId: newCurrentChatId,
                            aiError: null,
                        };
                    });

                    // Call startNewChat if the deleted chat was active and currentChatId was reset
                    // This check ensures startNewChat is called only if the deletion was successful and current chat was indeed the one deleted.
                    if (get().currentChatId === null && get().messagesByChatId[chatId] === undefined) { 
                        get().startNewChat(null); 
                    }
                    
                    // useAnalyticsStore.getState().trackEvent('chat_deleted', { chat_id: chatId, organization_id: organizationId });
                    logger.info('Chat deleted successfully', { chatId, organizationId });

                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while deleting the chat.';
                    logger.error('Error deleting chat:', { chatId, organizationId, error: errorMessage });
                    set({
                        aiError: errorMessage,
                    });
                }
            },

            prepareRewind: (messageId: string, chatId: string) => {
                set({
                    rewindTargetMessageId: messageId,
                    currentChatId: chatId, // Ensure the context is set to the chat being rewound
                    aiError: null, // Clear any previous errors as we are starting a new action
                });
                logger.info(`[rewind] Prepared rewind for messageId: ${messageId} in chatId: ${chatId}`);
            },

            cancelRewindPreparation: () => {
                set({
                    rewindTargetMessageId: null,
                    // currentChatId remains as is, no need to change it here
                });
                logger.info('[rewind] Canceled rewind preparation.');
            }
        }) as AiStore
    // )
);
