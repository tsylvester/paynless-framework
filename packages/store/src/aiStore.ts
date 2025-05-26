import { create } from 'zustand';
import {
	AiProvider,
	SystemPrompt,
	ChatMessage,
	ChatApiRequest,
    ApiResponse,
    PendingAction, // Correctly from @paynless/types
    AuthRequiredError, // Correctly from @paynless/types
    Chat,
    AiState, // Explicitly ensure AiState is imported
    AiStore, 
    initialAiStateValues,     // <-- Add this import
    UserProfileUpdate, // Added for typing the updateProfile payload
    ChatContextPreferences,
    UserProfile, // Import UserProfile from @paynless/types
    MessageForTokenCounting,
    ChatHandlerSuccessResponse, // For casting the api call result type
    ILogger, // For casting the logger type
    IAuthService,
    IWalletService,
    IAiStateService,
    HandleSendMessageServiceParams
} from '@paynless/types' // IMPORT NECESSARY TYPES

// Import api AFTER other local/utility imports but BEFORE code that might use types that cause issues with mocking
import { api } from '@paynless/api'; // MOVED HERE

// PRESERVECHATTYPE HACK WAS HERE - NOW MOVED INSIDE create()

import { logger } from '@paynless/utils';
import { estimateInputTokens, getMaxOutputTokens } from '../../utils/src/tokenCostUtils';
import { useAuthStore } from './authStore';
import { useWalletStore } from './walletStore'; // Keep this for getState()
import { selectActiveChatWalletInfo } from './walletStore.selectors'; // Corrected import path

// Import the new handler function and its required interfaces from ai.SendMessage.ts
import {
    handleSendMessage,
} from './ai.SendMessage';

// Use the imported AiStore type
export const useAiStore = create<AiStore>()(
    // devtools(
        // immer(
            (set, get) => {
                // Re-add the runtime constant hack to ensure build passes - MOVED INSIDE
                // @ts-expect-error HACK: Preserving Chat type for build until full store hydration or alternative fix.
                        const _preserveChatType: Chat = {
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
                // console.log('Using preserveChatType hack for build', !!preserveChatType); // Optional: keeping it commented for now to reduce side-effects further

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

                // _addOptimisticUserMessage moved below to be part of the returned object
                // addOptimisticMessageForReplay moved below to be part of the returned object

                return {
                    // --- State Properties ---
                    ...initialAiStateValues,

                    // --- Selectors (Derived State) ---
                    selectSelectedChatMessages: () => {
                        const { messagesByChatId, currentChatId, selectedMessagesMap } = get();
                        if (!currentChatId || !messagesByChatId[currentChatId]) {
                            return [];
                        }
                        const currentSelections = selectedMessagesMap[currentChatId];
                        if (!currentSelections) return [];
                        return messagesByChatId[currentChatId].filter(msg => currentSelections[msg.id]);
                    },

                    // --- Internal Helper Actions (now part of the store interface) ---
                    _updateChatContextInProfile, // Expose if needed by other actions/tests
                    _fetchAndStoreUserProfiles,  // Expose if needed by other actions/tests
                    
                    _addOptimisticUserMessage: (msgContent: string, explicitChatId?: string | null): { tempId: string, chatIdUsed: string, createdTimestamp: string } => {
                        const { currentChatId, newChatContext, messagesByChatId, selectedMessagesMap } = get();
                        const { user: currentUser } = useAuthStore.getState();
                        const createdTimestamp = new Date().toISOString();
                        let chatIdUsed = explicitChatId || currentChatId;
                        let isNewChat = false;

                        if (!chatIdUsed) {
                            isNewChat = true;
                            // Determine if this is for an org or personal based on newChatContext
                            if (newChatContext && newChatContext !== 'personal') { // Assuming 'personal' or null means user's personal context
                                chatIdUsed = `temp-chat-org-${newChatContext}-${Date.now()}`; // Org context
                            } else {
                                chatIdUsed = `temp-chat-user-${currentUser?.id || 'anon'}-${Date.now()}`; // User's personal context
                            }
                            logger.info('[aiStore._addOptimisticUserMessage] No explicit or current chatId, generated temporary chatIdUsed for new chat:', { chatIdUsed });
                        } else {
                            logger.info('[aiStore._addOptimisticUserMessage] Using existing or explicit chatId:', { chatIdUsed });
                        }
                        
                        const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                        const optimisticMessage: ChatMessage = {
                            id: tempId,
                            chat_id: chatIdUsed,
                            role: 'user',
                            content: msgContent,
                            created_at: createdTimestamp,
                            updated_at: createdTimestamp,
                            user_id: currentUser?.id || null, // Can be null if user is anonymous
                            ai_provider_id: null,
                            system_prompt_id: null,
                            token_usage: null,
                            is_active_in_thread: true,
                            error_type: null,
                            response_to_message_id: null,
                        };

                        const currentMessagesForChat = messagesByChatId[chatIdUsed] || [];
                        const updatedMessagesForChat = [...currentMessagesForChat, optimisticMessage];
                        
                        const updatedMessagesByChatId = {
                            ...messagesByChatId,
                            [chatIdUsed]: updatedMessagesForChat,
                        };

                        // Automatically select the new optimistic message
                        const updatedSelectedMessagesMap = {
                            ...selectedMessagesMap,
                            [chatIdUsed]: {
                                ...(selectedMessagesMap[chatIdUsed] || {}),
                                [tempId]: true,
                            },
                        };

                        set(state => ({
                            messagesByChatId: updatedMessagesByChatId,
                            selectedMessagesMap: updatedSelectedMessagesMap,
                            currentChatId: isNewChat ? chatIdUsed : state.currentChatId,
                            isLoadingAiResponse: true, // CORRECTED from isSending
                            pendingAction: 'SEND_MESSAGE', // Store 'SEND_MESSAGE' when optimistically sending
                        }));
                        logger.info('[aiStore._addOptimisticUserMessage] Added optimistic user message:', { tempId, chatIdUsed, newChat: isNewChat });
                        return { tempId, chatIdUsed, createdTimestamp };
                    },

                    addOptimisticMessageForReplay: (messageContent: string, existingChatId?: string | null): { tempId: string, chatIdForOptimistic: string } => {
                        const { messagesByChatId, selectedMessagesMap } = get();
                        const { user: currentUser } = useAuthStore.getState(); // Ensure currentUser is available
                        const createdTimestamp = new Date().toISOString();
                    
                        // Determine the chat ID to use for this replayed message
                        let chatIdForOptimistic = existingChatId;
                        if (!chatIdForOptimistic) {
                            // If no existingChatId is provided (e.g., truly new chat for replay or error state),
                            // generate a temporary one. This mirrors logic in _addOptimisticUserMessage.
                            // For replay, it might be more common to ALWAYS have an existingChatId,
                            // but this handles edge cases.
                            const newChatContext = get().newChatContext; // Get current newChatContext
                            if (newChatContext && newChatContext !== 'personal') {
                                chatIdForOptimistic = `temp-chat-org-${newChatContext}-${Date.now()}-replay`;
                            } else {
                                chatIdForOptimistic = `temp-chat-user-${currentUser?.id || 'anon'}-${Date.now()}-replay`;
                            }
                            logger.warn('[aiStore.addOptimisticMessageForReplay] No existingChatId provided for replay, generated temporary ID:', { chatIdForOptimistic });
                        } else {
                            logger.info('[aiStore.addOptimisticMessageForReplay] Using provided existingChatId for replay:', { chatIdForOptimistic });
                        }
                    
                        const tempId = `optimistic-replay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                        const optimisticMessage: ChatMessage = {
                            id: tempId,
                            chat_id: chatIdForOptimistic, // Use the determined chat ID
                            role: 'user',
                            content: messageContent,
                            created_at: createdTimestamp,
                            updated_at: createdTimestamp,
                            user_id: currentUser?.id || null,
                            ai_provider_id: null,
                            system_prompt_id: null,
                            token_usage: null,
                            is_active_in_thread: true,
                            error_type: null,
                            response_to_message_id: null,
                        };
                    
                        const currentMessagesForChat = messagesByChatId[chatIdForOptimistic] || [];
                        const updatedMessagesForChat = [...currentMessagesForChat, optimisticMessage];
                    
                        const updatedMessagesByChatId = {
                            ...messagesByChatId,
                            [chatIdForOptimistic]: updatedMessagesForChat,
                        };

                        // Automatically select the new replayed optimistic message
                        const updatedSelectedMessagesMap = {
                            ...selectedMessagesMap,
                            [chatIdForOptimistic]: {
                                ...(selectedMessagesMap[chatIdForOptimistic] || {}),
                                [tempId]: true,
                            },
                        };
                    
                        set(_state => ({
                            messagesByChatId: updatedMessagesByChatId,
                            selectedMessagesMap: updatedSelectedMessagesMap,
                            // currentChatId might not change here unless explicitly intended for replay to set context
                            // currentChatMessages: updatedMessagesForChat, // Consider if this direct update is needed
                            // isSending might not be appropriate for replay, depends on UX for replay
                        }));
                        logger.info('[aiStore.addOptimisticMessageForReplay] Added optimistic message for replay:', { tempId, chatIdUsed: chatIdForOptimistic });
                        return { tempId, chatIdForOptimistic };
                    },

                    // --- Public Action Definitions ---
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
                        logger.info(`[aiStore] loadChatDetails called for chatId: ${chatId}`);
                        if (!chatId) {
                            logger.warn('[aiStore] loadChatDetails called with null or undefined chatId. Aborting.');
                            set({ aiError: 'Cannot load details for an undefined chat.', isDetailsLoading: false });
                            return;
                        }
                        set({ isDetailsLoading: true, aiError: null, currentChatId: chatId });
                            const token = useAuthStore.getState().session?.access_token;
                            if (!token) {
                            set({ aiError: 'Authentication token not found.', isDetailsLoading: false });
                            return;
                        }

                        try {
                            const orgId = get().chatsByContext.orgs[chatId] 
                                ? chatId // This logic seems flawed; orgId should be derived differently if chatId is an org chat ID
                                : (get().currentChatId === chatId && get().newChatContext !== 'personal' ? get().newChatContext : null);
                            
                            logger.info(`[aiStore] Attempting to fetch chat details for chatId: ${chatId}, derived orgId: ${orgId}`);


                            // const response = await api.ai.getChatWithMessages(chatId, token, orgId ?? undefined );
                            // Corrected API call: Assuming getChatWithMessages might not need orgId if chatId is globally unique
                            // or the backend derives context from chatId + user token.
                            // The key is that `api.ai()` returns the client, then we call methods on it.
                            const response = await api.ai().getChatWithMessages(chatId, token, orgId ?? undefined);

                    
                            if (response.error || !response.data) {
                                throw new Error(response.error?.message || 'Failed to load chat messages.');
                            }
                            const { messages } = response.data; // chat object also available if needed

                            set(state => {
                                const newMessagesByChatId = {
                                        ...state.messagesByChatId,
                                        [chatId]: messages,
                                };

                                // Select all loaded messages by default
                                const newSelectedMessagesMap = { ...state.selectedMessagesMap };
                                const selectionsForThisChat: { [messageId: string]: boolean } = {};
                                messages.forEach(message => {
                                    selectionsForThisChat[message.id] = true;
                                });
                                newSelectedMessagesMap[chatId] = selectionsForThisChat;

                                return {
                                    messagesByChatId: newMessagesByChatId,
                                    selectedMessagesMap: newSelectedMessagesMap, // ADDED
                                isDetailsLoading: false,
                                    currentChatId: chatId, // Ensure currentChatId is set to the one being loaded
                                    aiError: null,
                                };
                            });
                            logger.info(`[aiStore] Successfully loaded and set ${messages.length} messages for chatId: ${chatId}. All are now selected.`);

                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                            logger.error(`[aiStore] Error loading chat details for chatId ${chatId}:`, { error: errorMessage });
                            set({ aiError: `Failed to load messages for chat ${chatId}: ${errorMessage}`, isDetailsLoading: false });
                        }
                    },

                    startNewChat: (organizationId?: string | null) => {
                        const currentUser = useAuthStore.getState().user;
                        const currentTimestamp = Date.now();
                        // Ensure newChatContext is correctly set if organizationId is provided
                        // This part of the logic might need review based on how newChatContext is used elsewhere.
                        const contextForNewChat = organizationId || 'personal'; 

                        // Logic to generate a temporary chat ID if needed, or set currentChatId to null
                        // For now, let's assume a new temp ID is always generated for a truly new chat context
                        // to ensure optimistic messages have a place before a real ID is assigned.
                        const newTempChatId = `temp-chat-${currentUser?.id || 'unknown'}-${currentTimestamp}`;

                        logger.info(`[aiStore] startNewChat called. Org ID: ${organizationId}. New context: ${contextForNewChat}. New temp chat ID: ${newTempChatId}`);

                        set(state => {
                            const newSelectedMessagesMap = { ...state.selectedMessagesMap };
                            // Initialize/clear selections for the new temporary chat ID
                            newSelectedMessagesMap[newTempChatId] = {};

                            return {
                                currentChatId: newTempChatId,
                                messagesByChatId: {
                                    ...state.messagesByChatId,
                                    [newTempChatId]: [] // Initialize with empty messages array
                                },
                                selectedMessagesMap: newSelectedMessagesMap, // ADDED
                            aiError: null,
                                isDetailsLoading: false, 
                            isLoadingAiResponse: false,
                                newChatContext: contextForNewChat, // Set the context for the new chat
                                rewindTargetMessageId: null, // Clear any rewind state
                            };
                        });
                        logger.info(`[aiStore] New chat started. currentChatId is now ${newTempChatId}. Selections for it are cleared.`);
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
                                updated_at: new Date(parseInt(tempId.split('-')[2])).toISOString(),
                                error_type: null,
                                response_to_message_id: null,
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

                    // --- Message Selection Actions ---
                    toggleMessageSelection: (chatId: string, messageId: string) => {
                        set(state => {
                            const currentSelection = state.selectedMessagesMap[chatId]?.[messageId];
                            // If undefined (not in map), it defaults to true. So, toggling an undefined (implicitly true) makes it false.
                            // If true, toggling makes it false.
                            // If false, toggling makes it true.
                            // This means: if undefined or true, set to false. Else (if false), set to true.
                            // Simplified: new state is !(currentSelection ?? true)
                            // Let's follow the plan: "Toggles the boolean value ... Defaults to true if the message isn't in the map."
                            // This should mean that if it's not in the map, the value to toggle *from* is effectively false for the purpose of map storage,
                            // so the first toggle makes it true.
                            // OR, it means the UI considers it true, and a toggle should make it false (explicitly in map).
                            // The most straightforward interpretation of "Defaults to true if the message isn't in the map [for the toggle action itself]"
                            // is that if it's not there, this action will add it as 'true'.

                            const newSelectionState = currentSelection === undefined ? true : !currentSelection;

                            return {
                                selectedMessagesMap: {
                                    ...state.selectedMessagesMap,
                                    [chatId]: {
                                        ...(state.selectedMessagesMap[chatId] || {}),
                                        [messageId]: newSelectionState,
                                    }
                                }
                            };
                        });
                    },
                    
                    selectAllMessages: (chatId: string) => {
                        set(state => {
                            const messagesForChat = state.messagesByChatId[chatId];
                            // If no messages are loaded for the chat, we still might want to ensure the map is empty or non-existent for this chat
                            // rather than doing nothing, to reflect a "select all" on an empty set.
                            // However, the plan says "Iterates through messages for the given chatId (from messagesByChatId)"
                            // So, if messagesForChat is undefined/empty, newSelectionsForChat will be empty.
                            const newSelectionsForChat: { [messageId: string]: boolean } = {};
                            if (messagesForChat) {
                                for (const message of messagesForChat) {
                                    newSelectionsForChat[message.id] = true;
                                }
                            }
                    
                            return {
                                selectedMessagesMap: {
                                    ...state.selectedMessagesMap,
                                    [chatId]: newSelectionsForChat,
                                }
                            };
                        });
                    },
                    
                    deselectAllMessages: (chatId: string) => {
                        set(state => {
                            const messagesForChat = state.messagesByChatId[chatId];
                            const newSelectionsForChat: { [messageId: string]: boolean } = {};
                            if (messagesForChat) {
                                for (const message of messagesForChat) {
                                    newSelectionsForChat[message.id] = false;
                                }
                            }
                            // If messagesForChat is empty, this will set an empty object for the chat's selections, effectively deselecting all.
                    
                            return {
                                selectedMessagesMap: {
                                    ...state.selectedMessagesMap,
                                    [chatId]: newSelectionsForChat,
                                }
                            };
                        });
                    },
                    
                    clearMessageSelections: (chatId: string) => {
                        set(state => {
                            const newSelectedMessagesMap = { ...state.selectedMessagesMap };
                            delete newSelectedMessagesMap[chatId];
                            logger.info(`[aiStore] Cleared message selections for chat ID: ${chatId}`);
                            return { selectedMessagesMap: newSelectedMessagesMap };
                        });
                    },

                    // --- Test utility actions (consider moving to a separate test setup file if they grow) ---
                    _dangerouslySetStateForTesting: (newState: Partial<AiState>) => {
                        if (import.meta.env.MODE === 'test' || import.meta.env['NODE_ENV'] === 'test') {
                            set(newState);
                        } else {
                            logger.warn('[aiStore._dangerouslySetStateForTesting] This function is only available in test environments.');
                        }
                    },

                    // SIMPLIFIED sendMessage ACTION
                    sendMessage: async (data: { message: string; chatId?: string | null; contextMessages?: MessageForTokenCounting[] }) => {
                        // --- Create Adapters for Service Dependencies ---
                        const authStoreState = useAuthStore.getState();
                        const authServiceAdapter: IAuthService = {
                            getCurrentUser: () => authStoreState.user,
                            getSession: () => authStoreState.session,
                            requestLoginNavigation: () => {
                                if (authStoreState.navigate) authStoreState.navigate('/login');
                            }
                        };

                        const walletServiceAdapter: IWalletService = {
                            getActiveWalletInfo: () => selectActiveChatWalletInfo(useWalletStore.getState())
                        };

                        const aiStateServiceAdapter: IAiStateService = {
                            getAiState: get, 
                            setAiState: set, 
                            addOptimisticUserMessage: get()._addOptimisticUserMessage 
                        };
                        
                        // --- Prepare parameters for handleSendMessage ---
                        const serviceParams: HandleSendMessageServiceParams = {
                            data,
                            aiStateService: aiStateServiceAdapter,
                            authService: authServiceAdapter,
                            walletService: walletServiceAdapter,
                            estimateInputTokensFn: estimateInputTokens,
                            getMaxOutputTokensFn: getMaxOutputTokens,
                            callChatApi: api.ai().sendChatMessage.bind(api.ai()) as unknown as (request: ChatApiRequest, options: RequestInit) => Promise<ApiResponse<ChatHandlerSuccessResponse>>,
                            logger: logger as ILogger,
                        };

                        const assistantMessage = await handleSendMessage(serviceParams);

                        // --- Post-processing: Wallet Refresh (if needed) ---
                        if (assistantMessage) { // Only refresh if send was successful
                            try {
                                const activeWalletInfo = walletServiceAdapter.getActiveWalletInfo(); // Get current info again
                                logger.info('[aiStore sendMessage] Triggering wallet refresh after successful message.');
                                if (activeWalletInfo.type === 'organization' && activeWalletInfo.orgId) {
                                    useWalletStore.getState().loadOrganizationWallet(activeWalletInfo.orgId);
                                } else {
                                    useWalletStore.getState().loadPersonalWallet();
                                }
                            } catch (walletError) {
                                logger.error('[aiStore sendMessage] Error triggering wallet refresh:', { error: String(walletError) });
                            }
                        }
                        return assistantMessage; // Return the assistant message or null
                    },
                };
            }
        // )
    // )
);

export const useAiStoreTyped = useAiStore as unknown as AiStore;

// Export initialAiStateValues for testing purposes
export { initialAiStateValues };

// Selector to get the current user's profile from useAuthStore
export const selectCurrentUserProfile = () => useAuthStore.getState().profile;