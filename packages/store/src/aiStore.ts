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
import { useOrganizationStore } from './organizationStore'; // Ensure this is uncommented and used

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
                // MODIFIED: Get current state once
                const currentState = get();
                const existingChatId = currentState.currentChatId;
                //const currentMessagesByChatId = currentState.messagesByChatId;
                //const newChatContext = currentState.newChatContext; // Will be used in later steps

                const token = useAuthStore.getState().session?.access_token;

                const _addOptimisticUserMessage = (msgContent: string, explicitChatIdForOptimistic?: string | null): string => {
                    const tempId = `temp-user-${Date.now()}`;
                    const chatIdToUse = explicitChatIdForOptimistic || existingChatId || `temp-chat-${Date.now()}`;
                    
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
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [chatIdToUse]: [...(state.messagesByChatId[chatIdToUse] || []), userMsg],
                        }
                    }));
                    logger.info('[sendMessage] Added optimistic user message', { id: tempId, chatId: chatIdToUse });
                    return tempId;
                };

                set({ isLoadingAiResponse: true, aiError: null });
                
                const effectiveChatIdForApi = inputChatId ?? existingChatId ?? undefined;
                const tempUserMessageId = _addOptimisticUserMessage(message, effectiveChatIdForApi);
                const optimisticMsgChatId = get().messagesByChatId[effectiveChatIdForApi || `temp-chat-${Date.now()}`]?.find(m => m.id === tempUserMessageId)?.chat_id || effectiveChatIdForApi;

                const requestData: ChatApiRequest = { message, providerId, promptId, chatId: effectiveChatIdForApi };
                const options: FetchOptions = { token }; 
                
                try {
                    const response: ApiResponse<ChatMessage> = await api.ai().sendChatMessage(requestData, options);

                    if (response.error) {
                        throw new Error(response.error.message || 'API returned an error');
                    }

                    if (response.data) {
                        const assistantMessage = response.data;
                        const actualChatId = assistantMessage.chat_id; // This is the source of truth for the chat_id

                        set(state => {
                            const updatedMessagesForChat = (state.messagesByChatId[actualChatId] || [])
                                .map(msg => 
                                    msg.id === tempUserMessageId ? { ...msg, chat_id: actualChatId, status: 'sent' as const } : msg
                                );
                            
                            const newMessagesByChatId = { ...state.messagesByChatId };
                            if (optimisticMsgChatId && optimisticMsgChatId !== actualChatId && optimisticMsgChatId.startsWith('temp-chat-')) {
                                delete newMessagesByChatId[optimisticMsgChatId];
                            }
                            
                            newMessagesByChatId[actualChatId] = [...updatedMessagesForChat, assistantMessage];

                            let newCurrentChatId = state.currentChatId;
                            if (!existingChatId && actualChatId) {
                                newCurrentChatId = actualChatId;
                            }
                            
                            return {
                                messagesByChatId: newMessagesByChatId,
                                currentChatId: newCurrentChatId, 
                                isLoadingAiResponse: false,
                                aiError: null, 
                                newChatContext: null, 
                            };
                        });
                        logger.info('Message sent and response received:', { messageId: assistantMessage.id, chatId: actualChatId });
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

                    // If AuthRequiredError was caught, try to save pending action and navigate
                    if (requiresLogin) {
                        // ... (localStorage logic for pendingAction remains largely the same)
                        let storageSuccess = false;
                        try {
                            const pendingAction = {
                                endpoint: 'chat',
                                method: 'POST',
                                body: { ...requestData, chatId: effectiveChatIdForApi ?? null },
                                returnPath: 'chat'
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
                    // MODIFIED: Clean up optimistic message from messagesByChatId
                    set(state => {
                        const chatIdOfOptimisticMsg = optimisticMsgChatId || existingChatId; // Best guess for where the optimistic message was placed
                        const updatedMessagesByChatId = { ...state.messagesByChatId };

                        if (chatIdOfOptimisticMsg && updatedMessagesByChatId[chatIdOfOptimisticMsg]) {
                            updatedMessagesByChatId[chatIdOfOptimisticMsg] = updatedMessagesByChatId[chatIdOfOptimisticMsg].filter(
                                (msg: ChatMessage) => msg.id !== tempUserMessageId
                            );
                            if (updatedMessagesByChatId[chatIdOfOptimisticMsg].length === 0) {
                                delete updatedMessagesByChatId[chatIdOfOptimisticMsg];
                            }
                        }
                        
                        const finalError = errorHandled ? null : errorMessage;
                        if (!errorHandled) {
                             logger.error('Error during send message API call (catch block):', { error: finalError });
                        }
                        return {
                            messagesByChatId: updatedMessagesByChatId,
                            aiError: finalError,
                            isLoadingAiResponse: false,
                         };
                    });
                    return null;
                }
            },

            // MODIFIED: loadChatHistory - basic refactor for build. Full org context in next steps.
            loadChatHistory: async () => {
                const contextKey = 'personal'; 
                const token = useAuthStore.getState().session?.access_token;

                if (!token) {
                    set(state => ({ 
                        aiError: 'Authentication token not found.', 
                        isLoadingHistoryByContext: {
                            ...state.isLoadingHistoryByContext,
                            [contextKey]: false,
                        }
                    }));
                    return;
                }

                set(state => ({ 
                    isLoadingHistoryByContext: {
                        ...state.isLoadingHistoryByContext,
                        [contextKey]: true,
                    }, 
                    aiError: null 
                }));

                try {
                    const response = await api.ai().getChatHistory(token ); 
                    if (response.error) {
                        throw new Error(response.error.message || 'Failed to load chat history');
                    }
                    
                    set(state => ({
                        chatsByContext: {
                            ...state.chatsByContext,
                            [contextKey]: response.data || [],
                        },
                        isLoadingHistoryByContext: {
                            ...state.isLoadingHistoryByContext,
                            [contextKey]: false,
                        },
                        aiError: null,
                    }));
                } catch (error: unknown) {
                    logger.error('Error loading chat history:', { context: contextKey, error: error instanceof Error ? error.message : String(error) });
                    set(state => ({
                        aiError: error instanceof Error ? error.message : 'An unexpected error occurred while loading chat history.',
                        chatsByContext: {
                            ...state.chatsByContext,
                            [contextKey]: [], // Clear on error for this context
                        },
                        isLoadingHistoryByContext: {
                            ...state.isLoadingHistoryByContext,
                            [contextKey]: false,
                        },
                    }));
                }
            },

            // MODIFIED: loadChatDetails
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
                // Optimistically set currentChatId, isDetailsLoading remains
                set({ isDetailsLoading: true, aiError: null, currentChatId: chatId }); 
                try {
                    // API call might need orgId in the future
                    const response = await api.ai().getChatMessages(chatId, token); 
                    if (response.error) {
                         throw new Error(response.error.message || 'Failed to load chat details');
                    }
                    set(state => ({
                        messagesByChatId: {
                            ...state.messagesByChatId,
                            [chatId]: response.data || [], // Update messages for this specific chat ID
                        },
                        isDetailsLoading: false,
                        // currentChatId: chatId, // Already set optimistically
                        aiError: null,
                    }));
                } catch (error: unknown) {
                    logger.error('Error loading chat details:', { chatId, error: error instanceof Error ? error.message : String(error) });
                    set({
                        aiError: error instanceof Error ? error.message : 'An unexpected error occurred while loading chat details.',
                        // messagesByChatId remains as is, or clear for this chatId? For now, keep.
                        // currentChatId: null, // Don't clear currentChatId on error, user might want to retry
                        isDetailsLoading: false,
                    });
                }
            },

            // MODIFIED: startNewChat
            startNewChat: (/* organizationId: string | null = null */) => {
                 // The organizationId param will be used in STEP-2.1.5
                 // For now, it primarily clears the current chat focus and sets up for a new personal one.
                 set({ 
                    currentChatId: null, 
                    // messagesByChatId: {}, // Don't clear all messages, only current chat focus is lost
                    aiError: null, 
                    isLoadingAiResponse: false,
                    newChatContext: 'personal', // Default to personal, orgId will override this later
                    rewindTargetMessageId: null, // Clear rewind state
                });
                logger.info('Started new chat session locally (cleared currentChatId, set newChatContext).');
            },

            clearAiError: () => {
                 set({ aiError: null });
            },
            
            // MODIFIED: checkAndReplayPendingChatAction - more complex, initial pass for build
            checkAndReplayPendingChatAction: async () => {
                logger.info('[aiStore] Checking for pending chat action...');
                const pendingActionJson = localStorage.getItem('pendingAction');

                if (!pendingActionJson) {
                    logger.info('[aiStore] No pending action found.');
                    return;
                }
                // ... (parsing and validation of action remain similar)
                let action: PendingAction | null = null;
                try {
                    action = JSON.parse(pendingActionJson);
                } catch (e) {
                    logger.error('[aiStore] Failed to parse pending action JSON. Removing invalid item.', { error: e });
                    localStorage.removeItem('pendingAction');
                    return;
                }

                if (!action || action.endpoint !== 'chat' || action.method !== 'POST' || !action.body || typeof action.body['message'] !== 'string') {
                    logger.warn('[aiStore] Pending action found, but not a valid chat POST. Ignoring.', { action });
                    return;
                }

                const token = useAuthStore.getState().session?.access_token;
                if (!token) {
                    logger.error('[aiStore] Cannot replay pending action: User is not authenticated (no token).');
                    set({ aiError: 'Authentication required to replay pending action.' });
                    return;
                }
                logger.info('[aiStore] Pending chat action is valid and user authenticated. Processing...');
                
                // MODIFIED: Optimistic update for replay
                const _addOptimisticReplayMessage = (msgContent: string, replayChatId?: string | null): string => {
                    const tempId = `temp-replay-${Date.now()}`;
                    const chatIdToUse = replayChatId || `temp-chat-replay-${Date.now()}`;
                    
                    const userMsg: ChatMessage = {
                         id: tempId, 
                         chat_id: chatIdToUse,
                         user_id: useAuthStore.getState().user?.id || 'unknown-replay-user', 
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
                            [chatIdToUse]: [...(state.messagesByChatId[chatIdToUse] || []), userMsg],
                        }
                    }));
                    logger.info('[replayAction] Added optimistic user message', { id: tempId, chatId: chatIdToUse });
                    return tempId;
                };

                 set({ isLoadingAiResponse: true, aiError: null });

                 const userMessageContent = action?.body?.['message'] as string ?? '[Message content not found]';
                 const chatIdFromAction = (typeof action?.body?.['chatId'] === 'string' ? action.body['chatId'] : null);
                 const tempId = _addOptimisticReplayMessage(userMessageContent, chatIdFromAction);
                 const optimisticReplayMsgChatId = get().messagesByChatId[chatIdFromAction || `temp-chat-replay-${Date.now()}`]?.find(m => m.id === tempId)?.chat_id || chatIdFromAction;


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
                        const actualChatId = assistantMessage.chat_id;
                        logger.info('[aiStore] Pending action replay successful. Received AI response.', { assistantMessage });

                        set(state => {
                            const newMessagesByChatId = { ...state.messagesByChatId };
                            
                            // Update optimistic message
                            const existingMessagesForActualChat = (newMessagesByChatId[actualChatId] || []);
                            let updatedMessagesForActualChat = existingMessagesForActualChat
                                .map(msg => 
                                    msg.id === tempId 
                                        ? { ...msg, status: 'sent' as const, chat_id: actualChatId } 
                                        : msg
                                );
                            
                            // If the optimistic message was under a different temporary chat ID
                            if (optimisticReplayMsgChatId && optimisticReplayMsgChatId !== actualChatId && optimisticReplayMsgChatId.startsWith('temp-chat-replay-')) {
                                if (newMessagesByChatId[optimisticReplayMsgChatId]) {
                                     // Ensure the temp message is removed from the old temp list
                                    newMessagesByChatId[optimisticReplayMsgChatId] = newMessagesByChatId[optimisticReplayMsgChatId].filter(m => m.id !== tempId);
                                    if (newMessagesByChatId[optimisticReplayMsgChatId].length === 0) {
                                        delete newMessagesByChatId[optimisticReplayMsgChatId];
                                    }
                                }
                                 // If the actualChatId list didn't contain the tempId (because it was a new chat ID), add it now corrected.
                                if (!existingMessagesForActualChat.find(m => m.id === tempId)) {
                                    const tempUserMsgCorrected = { // Create the user message again, but with correct chatId
                                        id: tempId, chat_id: actualChatId, user_id: useAuthStore.getState().user?.id || 'unknown-replay-user', role: 'user', content: userMessageContent, status: 'sent' as const, ai_provider_id: null, system_prompt_id: null,token_usage: null, created_at: new Date(parseInt(tempId.split('-')[2])).toISOString(), is_active_in_thread: true
                                    };
                                    updatedMessagesForActualChat = [tempUserMsgCorrected, ...updatedMessagesForActualChat];
                                }
                            }
                            
                            // Add assistant message
                            updatedMessagesForActualChat.push(assistantMessage);
                            
                            // Ensure no duplicates if somehow the optimistic user message wasn't correctly updated and remained
                             const finalMessagesForChat = updatedMessagesForActualChat.filter((msg, index, self) =>
                                index === self.findIndex((m) => m.id === msg.id || (m.id === tempId && msg.id === tempId)) // check id
                            );

                            newMessagesByChatId[actualChatId] = finalMessagesForChat;
                            
                            return {
                                messagesByChatId: newMessagesByChatId,
                                currentChatId: actualChatId || state.currentChatId, // Update currentChatId if a new chat was created/focused
                                isLoadingAiResponse: false,
                                aiError: null,
                            };
                        });
                        localStorage.removeItem('pendingAction');
                        logger.info('[aiStore] Successfully processed and removed pending action.');

                    } else {
                        throw new Error('API returned success status but no data during replay.');
                    }
                } catch (error: unknown) {
                    if (error instanceof AuthRequiredError) { 
                        logger.warn('[AiStore] Auth required during replay. Redirecting.', { error: error.message });
                        set({ isLoadingAiResponse: false, aiError: error.message }); 
                    } else {
                        logger.error('[aiStore] Error during pending action replay API call:', { error: error instanceof Error ? error.message : String(error) });
                        set(state => {
                            const chatIdOfOptimisticMsg = optimisticReplayMsgChatId || chatIdFromAction;
                            const updatedMessagesByChatId = { ...state.messagesByChatId };
                            if (chatIdOfOptimisticMsg && updatedMessagesByChatId[chatIdOfOptimisticMsg]) {
                                updatedMessagesByChatId[chatIdOfOptimisticMsg] = updatedMessagesByChatId[chatIdOfOptimisticMsg].map(msg =>
                                    msg.id === tempId
                                        ? { ...msg, status: 'error' as const }
                                        : msg
                                );
                            }
                            return {
                                messagesByChatId: updatedMessagesByChatId,
                                isLoadingAiResponse: false,
                                aiError: error instanceof Error ? error.message : String(error)
                            };
                        });
                    }
                }
            },

            // --- Selectors ---
            selectChatHistoryList: () => {
                const { chatsByContext } = get();
                const currentOrganizationId = useOrganizationStore.getState().currentOrganizationId;

                if (currentOrganizationId) {
                    return chatsByContext.orgs[currentOrganizationId] || [];
                } else {
                    return chatsByContext.personal || [];
                }
            },

            selectCurrentChatMessages: () => {
                const { messagesByChatId, currentChatId } = get();
                if (!currentChatId || !messagesByChatId[currentChatId]) {
                    return [];
                }
                return messagesByChatId[currentChatId].filter(msg => msg.is_active_in_thread);
            },

            selectIsHistoryLoading: () => {
                const { isLoadingHistoryByContext } = get();
                const currentOrganizationId = useOrganizationStore.getState().currentOrganizationId;

                if (currentOrganizationId) {
                    return isLoadingHistoryByContext.orgs[currentOrganizationId] || false;
                } else {
                    return isLoadingHistoryByContext.personal || false;
                }
            },

            selectIsDetailsLoading: () => get().isDetailsLoading,
            selectIsLoadingAiResponse: () => get().isLoadingAiResponse,
            selectAiError: () => get().aiError,
            selectRewindTargetMessageId: () => get().rewindTargetMessageId,
            selectIsRewinding: () => !!get().rewindTargetMessageId,

        })
    // )
);
