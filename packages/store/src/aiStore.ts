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
    Chat,
    AiState, // Explicitly ensure AiState is imported
    AiStore, 
    initialAiStateValues,     // <-- Add this import
    UserProfileUpdate, // Added for typing the updateProfile payload
    ChatContextPreferences,
    UserProfile, // Import UserProfile from @paynless/types
    ChatHandlerSuccessResponse
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

// Use the imported AiStore type
export const useAiStore = create<AiStore>()(
    // devtools(
        // immer(
            (set, get) => {
                // --- Helper function to update chat context in user's profile ---
                const _updateChatContextInProfile = async (contextUpdate: Partial<ChatContextPreferences>) => {
                    try {
                        const { profile, updateProfile } = useAuthStore.getState();
                        if (!profile || !updateProfile) {
                            logger.warn('[aiStore._updateChatContextInProfile] User profile or updateProfile action not available. Skipping update.');
                            return;
                        }

                        // Ensure chat_context is treated as an object, even if initially null from DB
                        const currentChatContext = (profile.chat_context || {}) as ChatContextPreferences;
                        
                        const newChatContextState = {
                            ...currentChatContext,
                            ...contextUpdate,
                        };

                        // Type the payload for updateProfile
                        const profileUpdatePayload: UserProfileUpdate = {
                            chat_context: newChatContextState
                        };

                        logger.info('[aiStore._updateChatContextInProfile] Attempting to update chat_context in profile:', profileUpdatePayload);
                        const result = await updateProfile(profileUpdatePayload);

                        if (result) {
                            logger.info('[aiStore._updateChatContextInProfile] Successfully updated chat_context in profile.');
                        } else {
                            // Error should be logged by updateProfile in authStore, but we can add context here
                            logger.error('[aiStore._updateChatContextInProfile] Failed to update chat_context in profile. See authStore logs for details.');
                        }
                    } catch (error) {
                        logger.error('[aiStore._updateChatContextInProfile] Error during chat_context update:', { error });
                    }
                };

                const _fetchAndStoreUserProfiles = async (userIds: string[]) => {
                    const currentUser = useAuthStore.getState().user;
                    const existingProfiles = get().chatParticipantsProfiles;
                    
                    const idsToFetch = userIds.filter(id => 
                        id !== currentUser?.id && 
                        !existingProfiles[id]
                    );

                    if (idsToFetch.length === 0) {
                        logger.debug('[aiStore._fetchAndStoreUserProfiles] No new user profiles to fetch.', { requestedUserIds: userIds, currentUserId: currentUser?.id, existingProfileCount: Object.keys(existingProfiles).length });
                        return;
                    }

                    logger.info('[aiStore._fetchAndStoreUserProfiles] Attempting to fetch profiles for user IDs:', { userIds: idsToFetch });
                    
                    const profilePromises = idsToFetch.map(userId => 
                        api.users().getProfile(userId) // Use the new UserApiClient method
                            .then((response: ApiResponse<UserProfile>) => ({ userId, response })) // Explicitly type response
                            .catch((error: Error) => ({ userId, error })) // Explicitly type error as Error
                    );

                    const results = await Promise.allSettled(profilePromises);
                    const newProfilesMap: { [userId: string]: UserProfile } = {};
                    let successfullyFetchedCount = 0;

                    results.forEach(result => {
                        if (result.status === 'fulfilled') {
                            const { userId, response, error } = result.value as { userId: string; response?: ApiResponse<UserProfile>; error?: Error }; // error is now Error
                            
                            if (error) { // Handle errors caught by the .catch in profilePromises
                                logger.warn(`[aiStore._fetchAndStoreUserProfiles] Error fetching profile for user ${userId} (caught by promise.catch):`, { error });
                            } else if (response && response.data && !response.error) {
                                newProfilesMap[userId] = response.data;
                                successfullyFetchedCount++;
                            } else if (response && response.error) {
                                logger.warn(`[aiStore._fetchAndStoreUserProfiles] API error fetching profile for user ${userId} (RLS denial or other server error):`, { 
                                    status: response.status, 
                                    errorCode: response.error.code, 
                                    errorMessage: response.error.message 
                                });
                                // Do not add to newProfilesMap, RLS likely denied access or another server-side issue occurred
                            } else {
                                logger.warn(`[aiStore._fetchAndStoreUserProfiles] Unexpected empty response or structure for user ${userId}.`, { response });
                            }
                        } else {
                            // result.status === 'rejected' - error from api.users().getProfile() itself before .then/.catch
                            // This case should ideally be less common if getProfile itself catches and returns ApiResponse
                            const failedPromise = result.reason as { userId?: string; error?: Error } | Error; // Refined type for failedPromise
                            const userId = typeof failedPromise === 'object' && failedPromise !== null && 'userId' in failedPromise && typeof failedPromise.userId === 'string' ? failedPromise.userId : 'unknown_user_id_in_rejected_promise';
                            logger.error(`[aiStore._fetchAndStoreUserProfiles] Promise rejected while fetching profile for user ${userId}:`, { reason: result.reason });
                        }
                    });

                    if (successfullyFetchedCount > 0) {
                        set(state => ({
                            chatParticipantsProfiles: {
                                ...state.chatParticipantsProfiles,
                                ...newProfilesMap,
                            }
                        }));
                        logger.info(`[aiStore._fetchAndStoreUserProfiles] Successfully fetched and stored ${successfullyFetchedCount} of ${idsToFetch.length} requested profiles.`, { fetchedUserIds: Object.keys(newProfilesMap) });
                    } else {
                        logger.warn('[aiStore._fetchAndStoreUserProfiles] No new profiles were successfully fetched.', { totalAttempted: idsToFetch.length });
                    }
                };

                return {
                    // --- State Properties ---
                    ...initialAiStateValues,

                    // --- Action Definitions ---
                    setNewChatContext: (contextId: string | null) => {
                        set({ newChatContext: contextId });
                        logger.info(`[aiStore] newChatContext set to: ${contextId}`);
                        _updateChatContextInProfile({ newChatContext: contextId });
                    },
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

                            type ProvidersPayload = { providers: AiProvider[] };
                            if (!providersResponse.error && providersResponse.data && typeof providersResponse.data === 'object' && providersResponse.data !== null && 'providers' in providersResponse.data && Array.isArray((providersResponse.data as ProvidersPayload).providers)) {
                                loadedProviders = (providersResponse.data as ProvidersPayload).providers;

                                logger.info('[aiStore] Initial loadedProviders from API:', {
                                    count: loadedProviders.length,
                                    providerNames: loadedProviders.map(p => p.name) // Log names for brevity
                                });
                                logger.info(`[aiStore] Value of import.meta.env.MODE in loadAiConfig: "${import.meta.env.MODE}"`);

                                // Filter out dummy providers if not in development mode
                                if (import.meta.env.MODE !== 'development') {
                                    logger.info(`[aiStore] MODE is "${import.meta.env.MODE}", attempting to filter dummy providers.`);
                                    const originalProviderNames = loadedProviders.map(p => p.name); // For logging before filter

                                    loadedProviders = loadedProviders.filter(provider => {
                                        const isDummy = provider.name && provider.name.toLowerCase().includes('dummy');
                                        if (isDummy) {
                                            logger.info(`[aiStore] Identified dummy provider for filtering: name="${provider.name}"`);
                                        }
                                        return !isDummy;
                                    });
                                    logger.info(`[aiStore] Providers after filtering: count=${loadedProviders.length}`, {
                                        providerNamesAfter: loadedProviders.map(p => p.name),
                                        providerNamesBefore: originalProviderNames
                                    });
                                } else {
                                    logger.info(`[aiStore] MODE is "${import.meta.env.MODE}", skipping dummy provider filter.`);
                                }
                            } else if (providersResponse.error) {
                                errorMessages.push(providersResponse.error?.message || 'Failed to load AI providers.');
                            }
                            
                            type PromptsPayload = { prompts: SystemPrompt[] };
                            if (!promptsResponse.error && promptsResponse.data && typeof promptsResponse.data === 'object' && promptsResponse.data !== null && 'prompts' in promptsResponse.data && Array.isArray((promptsResponse.data as PromptsPayload).prompts)) {
                                loadedPrompts = (promptsResponse.data as PromptsPayload).prompts;
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
                        const { message, chatId: inputChatId } = data;
                        const { 
                            currentChatId: existingChatIdFromState,
                            rewindTargetMessageId: currentRewindTargetId,
                            newChatContext,
                            selectedProviderId,
                            selectedPromptId
                        } = get();

                        // Define isRewindOperation flag based on client state BEFORE the main try block
                        const isRewindOperation = !!(inputChatId && currentRewindTargetId);

                        // DETAILED LOGGING FOR DEBUGGING ORG CHAT RESET
                        logger.info('[aiStore sendMessage DEBUG] Called with:', {
                            inputMessage: message,
                            inputChatId,
                            stateCurrentChatId: existingChatIdFromState,
                            stateNewChatContext: newChatContext,
                            stateSelectedProviderId: selectedProviderId,
                            stateSelectedPromptId: selectedPromptId,
                            stateRewindTargetMessageId: currentRewindTargetId
                        });

                        const token = useAuthStore.getState().session?.access_token;

                        if (!selectedProviderId) {
                            logger.error('[sendMessage] No provider selected. Cannot send message.');
                            set({ isLoadingAiResponse: false, aiError: 'No AI provider selected.' });
                            return null;
                        }

                        const providerId = selectedProviderId;
                        const promptId = selectedPromptId;

                        // --- Helper to add optimistic user message (remains largely the same) ---
                        const _addOptimisticUserMessage = (msgContent: string, explicitChatId?: string | null): { tempId: string, chatIdUsed: string, createdTimestamp: string } => {
                            const createdTimestamp = new Date().toISOString();
                            const tempId = `temp-user-${Date.parse(createdTimestamp)}-${Math.random().toString(36).substring(2, 7)}`;
                            const currentChatIdFromGetter = get().currentChatId;
                            const chatIdUsed = (typeof explicitChatId === 'string' && explicitChatId) 
                                                ? explicitChatId 
                                                : (currentChatIdFromGetter || `temp-chat-${Date.parse(createdTimestamp)}-${Math.random().toString(36).substring(2, 7)}`);
                            
                            const userMsg: ChatMessage = {
                                 id: tempId, 
                                 chat_id: chatIdUsed, 
                                 user_id: useAuthStore.getState().user?.id || 'optimistic-user', 
                                 role: 'user', 
                                 content: msgContent, 
                                 ai_provider_id: null, 
                                 system_prompt_id: null,
                                 token_usage: null, 
                                 created_at: createdTimestamp,
                                 is_active_in_thread: true,
                                 updated_at: createdTimestamp
                            };
                            set(state => ({ 
                                messagesByChatId: { 
                                    ...state.messagesByChatId, 
                                    [chatIdUsed]: [...(state.messagesByChatId[chatIdUsed] || []), userMsg] 
                                },
                                // If it's a new chat, set currentChatId optimistically IF it wasn't already set by startNewChat
                                // currentChatId: state.currentChatId || (chatIdUsed.startsWith('temp-chat-') ? chatIdUsed : state.currentChatId)
                            }));
                            logger.info('[sendMessage] Added optimistic user message', { id: tempId, chatId: chatIdUsed });
                            return { tempId, chatIdUsed, createdTimestamp };
                        };

                        set({ isLoadingAiResponse: true, aiError: null });
                        const { tempId: tempUserMessageId, chatIdUsed: optimisticMessageChatId } = _addOptimisticUserMessage(message, inputChatId);

                        // Standard API call logic (will now also correctly call backend for dummy provider)

                        // --- Existing API Call Logic ---
                        const effectiveChatIdForApi = inputChatId ?? existingChatIdFromState ?? undefined;
                        let organizationIdForApi: string | undefined | null = undefined;
                        if (!effectiveChatIdForApi) { // It's a new chat
                            organizationIdForApi = newChatContext; 
                        } else {
                            // For existing chats, orgId is implicit in the chatId, API/backend handles this.
                            organizationIdForApi = undefined; 
                        }

                        // DETAILED LOGGING FOR DEBUGGING ORG CHAT RESET - Part 2
                        logger.info('[aiStore sendMessage DEBUG] Determined API params:', {
                            effectiveChatIdForApi,
                            organizationIdForApi 
                        });

                        const apiPromptId = promptId === null || promptId === '__none__' ? '__none__' : promptId;

                        const requestData: ChatApiRequest = { 
                            message, 
                            providerId,
                            promptId: apiPromptId,
                            chatId: effectiveChatIdForApi, 
                            organizationId: organizationIdForApi, 
                            ...(effectiveChatIdForApi && currentRewindTargetId && { rewindFromMessageId: currentRewindTargetId })
                        };
                        const options: FetchOptions = { token }; 
                        
                        try {
                            // Expect ChatHandlerResponse, use type assertion if API client type is not updated yet
                            const response = await api.ai().sendChatMessage(requestData, options) as ApiResponse<ChatHandlerSuccessResponse>; 

                            if (response.error) {
                                throw new Error(response.error.message || 'API returned an error');
                            }

                            if (response.data) {
                                const { userMessage: actualUserMessage, assistantMessage, isRewind: responseIsRewind } = response.data; 
                                let finalChatIdForLog: string | null | undefined = null; 

                                set(state => {
                                    // Use backend response flag primarily, fallback to client flag if needed
                                    const wasRewind = responseIsRewind ?? isRewindOperation;
                                    logger.debug('[sendMessage] Inside set callback. Backend response data:', { 
                                        userMsgId: actualUserMessage?.id, 
                                        assistantMsgId: assistantMessage.id,
                                        chatId: assistantMessage.chat_id,
                                        wasRewind 
                                    });

                                    const actualNewChatId = assistantMessage.chat_id; 
                                    finalChatIdForLog = actualNewChatId; // Assign for logging outside this scope

                                    if (!actualNewChatId) {
                                        logger.error('[sendMessage] Critical error: finalChatId is undefined/null after successful API call.');
                                        return { 
                                            ...state, 
                                            isLoadingAiResponse: false, 
                                            aiError: 'Internal error: Chat ID missing post-send.'
                                        };
                                    }

                                    let messagesForChatProcessing = [...(state.messagesByChatId[optimisticMessageChatId] || [])];
                                    // Use the wasRewind flag determined above

                                    if (wasRewind && actualNewChatId) { // <-- Use wasRewind
                                        // --- Rewind Logic --- 
                                        const messagesInStoreForChat = state.messagesByChatId[actualNewChatId] || [];
                                        const newBranchMessages: ChatMessage[] = []; // Changed to const

                                        // Find the optimistic user message (the one that initiated the rewind)
                                        const optimisticUserMessageIndex = messagesInStoreForChat.findIndex(m => m.id === tempUserMessageId);
                                        
                                        // If the backend provided the actual saved user message from the rewind branch:
                                        if (actualUserMessage && actualUserMessage.id !== tempUserMessageId) {
                                            // Use type assertion to add status
                                            newBranchMessages.push({ ...actualUserMessage, status: 'sent' as const } as ChatMessage);
                                        } else {
                                            // Fallback: Update the existing optimistic message if found
                                            const newOptimisticUserMsg = messagesInStoreForChat[optimisticUserMessageIndex];
                                            if (newOptimisticUserMsg) {
                                                // Use type assertion to add status
                                                newBranchMessages.push({ ...newOptimisticUserMsg, chat_id: actualNewChatId, status: 'sent' as const } as ChatMessage);
                                            }
                                        }
                                        newBranchMessages.push(assistantMessage); // The new assistant message from backend

                                        // Get messages up to (and including) the rewind point
                                        let baseHistory: ChatMessage[] = [];
                                        const rewindPointIdx = messagesInStoreForChat.findIndex(m => m.id === currentRewindTargetId); 
                                        if (rewindPointIdx !== -1) {
                                            baseHistory = messagesInStoreForChat.slice(0, rewindPointIdx + 1); 
                                        } else {
                                            logger.warn(`[sendMessage] Rewind target ${currentRewindTargetId} not found in chat ${actualNewChatId} for history reconstruction.`);
                                            // Fallback: Try using all messages except the optimistic one we just pushed
                                            baseHistory = messagesInStoreForChat.filter(m => m.id !== tempUserMessageId);
                                        }

                                        // Filter out the optimistic message from baseHistory if it exists there (unlikely but safety)
                                        baseHistory = baseHistory.filter(m => m.id !== tempUserMessageId);

                                        messagesForChatProcessing = [...baseHistory, ...newBranchMessages];

                                    } else {
                                        // --- Standard (Non-Rewind) Logic --- 
                                        // Update optimistic user message with its actual data if backend sent it
                                        if (actualUserMessage && actualUserMessage.id !== tempUserMessageId) {
                                            messagesForChatProcessing = messagesForChatProcessing.map(msg =>
                                                msg.id === tempUserMessageId
                                                    // Use type assertion to add status
                                                    ? { ...actualUserMessage, status: 'sent' as const } as ChatMessage // Use all data from actualUserMessage
                                                    : msg
                                            );
                                        } else { // Fallback: just update status and chat_id
                                            messagesForChatProcessing = messagesForChatProcessing.map(msg =>
                                                msg.id === tempUserMessageId
                                                    // Use type assertion to add status
                                                    ? { ...msg, chat_id: actualNewChatId, status: 'sent' as const } as ChatMessage
                                                    : msg
                                            );
                                        }
                                        // Ensure the assistant message isn't accidentally added twice if mapping didn't find the temp ID
                                        if (!messagesForChatProcessing.some(msg => msg.id === assistantMessage.id)) {
                                            messagesForChatProcessing.push(assistantMessage); // Add the AI's response
                                        }
                                    }

                                    const newMessagesByChatId = { ...state.messagesByChatId };

                                    if (optimisticMessageChatId !== actualNewChatId && newMessagesByChatId[optimisticMessageChatId]) {
                                        newMessagesByChatId[actualNewChatId] = messagesForChatProcessing;
                                        delete newMessagesByChatId[optimisticMessageChatId];
                                    } else {
                                        newMessagesByChatId[actualNewChatId] = messagesForChatProcessing;
                                    }
                                    
                                    let updatedChatsByContext = { ...state.chatsByContext };
                                    // If it was a new chat, add it to chatsByContext
                                    if (optimisticMessageChatId !== actualNewChatId) {
                                        const newChatEntry: Chat = {
                                            id: actualNewChatId,
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
                                        currentChatId: actualNewChatId, 
                                        isLoadingAiResponse: false,
                                        aiError: null,
                                        // Clear rewind target on successful rewind
                                        rewindTargetMessageId: wasRewind ? null : state.rewindTargetMessageId, // <-- Use wasRewind
                                    };
                                });
                                logger.info('Message sent and response received:', { messageId: assistantMessage.id, chatId: finalChatIdForLog, rewound: responseIsRewind ?? isRewindOperation }); // Use combined flag
                                return assistantMessage; // Keep returning assistant message for potential UI focus etc.
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

                    loadChatDetails: async (chatId: string) => { 
                        if (!chatId) {
                            logger.warn('[aiStore] loadChatDetails called with no chatId.');
                            set({ isDetailsLoading: false });
                            return;
                        }
                        logger.info(`[aiStore] Loading details for chat: ${chatId}`);
                        set({ 
                            currentChatId: chatId, 
                            isDetailsLoading: true, 
                            aiError: null 
                        });
                    
                        try {
                            const token = useAuthStore.getState().session?.access_token;
                            if (!token) {
                                throw new AuthRequiredError('Authentication required to load chat details.');
                            }
                    
                            const { chatsByContext, newChatContext } = get();
                            let organizationId: string | undefined | null = undefined;
                            if (chatsByContext.orgs) {
                                for (const orgIdKey in chatsByContext.orgs) {
                                    if (chatsByContext.orgs[orgIdKey]?.find(c => c.id === chatId)) {
                                        organizationId = orgIdKey;
                                        break;
                                    }
                                }
                            }
                            if (organizationId === undefined && typeof newChatContext === 'string' && newChatContext !== 'personal') {
                                organizationId = newChatContext;
                            }
                            logger.debug(`[aiStore] loadChatDetails determined organizationId for API call: ${organizationId} (for chatId: ${chatId})`);

                            const response = await api.ai().getChatWithMessages(chatId, token, organizationId);
                    
                            if (response.error) {
                                throw new Error(response.error.message);
                            }
                    
                            if (response.data?.messages) {
                                const messages = response.data.messages;
                                set(state => ({
                                    messagesByChatId: {
                                        ...state.messagesByChatId,
                                        [chatId]: messages,
                                    },
                                    isDetailsLoading: false,
                                    currentChatId: chatId 
                                }));
                                logger.info(`[aiStore] Successfully loaded ${messages.length} messages for chat ${chatId}.`);
                    
                                const userMessageSenderIds = messages
                                    .filter(msg => msg.role === 'user' && msg.user_id)
                                    .map(msg => msg.user_id!)
                                    .filter((id, index, self) => self.indexOf(id) === index);
                                
                                if (userMessageSenderIds.length > 0) {
                                    await _fetchAndStoreUserProfiles(userMessageSenderIds);
                                }

                            } else {
                                set({ isDetailsLoading: false });
                                logger.warn(`[aiStore] No data returned for chat ${chatId} despite no error.`);
                            }
                        } catch (error: unknown) {
                            logger.error(`[aiStore] Error loading details for chat ${chatId}:`, { error }); // Wrapped error
                            let errorMessage = 'Failed to load chat details.';
                            if (error instanceof AuthRequiredError) {
                                errorMessage = error.message;
                               // set({ pendingAction: { type: 'loadChatDetails', payload: { chatId } } });
                            } else if (error instanceof Error) {
                                errorMessage = error.message;
                            }
                            set({ 
                                aiError: errorMessage, 
                                isDetailsLoading: false,
                            });
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
                                ai_provider_id: null,
                                system_prompt_id: null,
                                token_usage: null,
                                created_at: new Date(parseInt(tempId.split('-')[2])).toISOString(),
                                is_active_in_thread: true,
                                updated_at: new Date(parseInt(tempId.split('-')[2])).toISOString()
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
                    },

                    setSelectedProvider: (providerId: string | null) => {
                        set({ selectedProviderId: providerId });
                        logger.info(`[aiStore] selectedProviderId set to: ${providerId}`);
                        _updateChatContextInProfile({ selectedProviderId: providerId });
                    },
            
                    setSelectedPrompt: (promptId: string | null) => {
                        set({ selectedPromptId: promptId });
                        logger.info(`[aiStore] selectedPromptId set to: ${promptId}`);
                        _updateChatContextInProfile({ selectedPromptId: promptId });
                    },

                    // --- Hydration Actions ---
                    setChatContextHydrated: (hydrated: boolean) => {
                        set({ isChatContextHydrated: hydrated });
                        logger.info(`[aiStore] isChatContextHydrated set to: ${hydrated}`);
                    },

                    hydrateChatContext: (chatContext: ChatContextPreferences | null) => {
                        if (chatContext) {
                            logger.info('[aiStore] Attempting to hydrate chat context from profile:', { data: chatContext });
                            const updates: Partial<Pick<AiState, 'newChatContext' | 'selectedProviderId' | 'selectedPromptId'>> = {};
                            if (typeof chatContext.newChatContext !== 'undefined') {
                                updates.newChatContext = chatContext.newChatContext;
                            }
                            if (typeof chatContext.selectedProviderId !== 'undefined') {
                                updates.selectedProviderId = chatContext.selectedProviderId;
                            }
                            if (typeof chatContext.selectedPromptId !== 'undefined') {
                                updates.selectedPromptId = chatContext.selectedPromptId;
                            }

                            if (Object.keys(updates).length > 0) {
                                set(updates);
                                logger.info('[aiStore] Chat context hydrated with values:', updates);
                            } else {
                                logger.info('[aiStore] chat_context from profile was empty or contained no relevant keys. No hydration applied.');
                            }
                        } else {
                            logger.info('[aiStore] No chat_context found in profile to hydrate from.');
                        }
                        // Always mark as hydrated after attempt, even if no data, to prevent re-attempts in same session part
                        set({ isChatContextHydrated: true }); 
                    },

                    resetChatContextToDefaults: () => {
                        logger.info('[aiStore] Resetting chat context to defaults and clearing hydration flag.');
                        set({
                            newChatContext: initialAiStateValues.newChatContext,
                            selectedProviderId: initialAiStateValues.selectedProviderId,
                            selectedPromptId: initialAiStateValues.selectedPromptId,
                            isChatContextHydrated: false,
                        });
                    },

                    // --- Internal Helper Functions Exposed for Testing ---
                    _fetchAndStoreUserProfiles, // Export for testing
                };
            }
        // )
    // )
);

export const useAiStoreTyped = useAiStore as unknown as AiStore;

// Export initialAiStateValues for testing purposes
export { initialAiStateValues };