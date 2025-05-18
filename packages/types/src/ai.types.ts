import type { Database } from '@paynless/db-types';
// If FetchOptions is meant to be the standard fetch options, use RequestInit
// import type { FetchOptions } from '@supabase/supabase-js'; // This was problematic
import type { ApiResponse } from './api.types';
import type { UserProfile } from './auth.types'; // UserProfile import is correct here
// --- Database Table Aliases ---

// Define the specific type for the RPC parameters based on types_db.ts
export type PerformChatRewindArgs = Database['public']['Functions']['perform_chat_rewind']['Args'];

// Define derived DB types needed locally
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
// type ChatRow = Database['public']['Tables']['chats']['Row']; // Not directly used in handlePostRequest return

/**
 * Represents an AI Provider configuration.
 * Derived from the `ai_providers` table.
 */
export type AiProvider = Database['public']['Tables']['ai_providers']['Row'];

/**
 * Represents a reusable System Prompt.
 * Derived from the `system_prompts` table.
 */
export type SystemPrompt = Database['public']['Tables']['system_prompts']['Row'];

/**
 * Represents a Chat conversation thread.
 * Derived from the `chats` table.
 */
export type Chat = Database['public']['Tables']['chats']['Row'];

/**
 * Represents the token usage for a message or a chat.
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Detailed breakdown of token usage for a chat session.
 */
export interface ChatSessionTokenUsageDetails {
  userTokens: number;
  assistantPromptTokens: number;
  assistantCompletionTokens: number;
  assistantTotalTokens: number; // Sum of assistant's prompt & completion for all assistant messages
  overallTotalTokens: number;  // Sum of userTokens + assistantTotalTokens for the session
}

/**
 * Represents a single message within a Chat.
 * Derived from the `chat_messages` table.
 */
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'] 

// --- Application/API/Adapter/Store Specific Types ---

// Keep existing API/Usage types...

/**
 * Structure for sending a message via the 'chat' Edge Function.
 */
export interface ChatApiRequest {
  message: string;
  providerId: AiProvider['id']; // Reference aliased type
  promptId: SystemPrompt['id']; // Reference aliased type
  chatId?: Chat['id'] | null;   // Reference aliased type (optional for new chats)
  organizationId?: string | null; // Add optional organizationId
}

/**
 * Example structure for the response from the 'chat' Edge Function.
 * The actual response wraps the ChatMessage.
 */
export interface ChatApiResponse {
  message: ChatMessage; // Uses the aliased type (with potential status enrichment)
}

/**
 * Response structure for fetching AI providers.
 */
export interface AiProvidersApiResponse {
    providers: AiProvider[]; // Uses the aliased type
}

/**
 * Response structure for fetching system prompts.
 */
export interface SystemPromptsApiResponse {
    prompts: SystemPrompt[]; // Uses the aliased type
}

/**
 * Response structure for fetching chat history.
 */
export interface ChatHistoryApiResponse {
    chats: Chat[]; // Uses the aliased type
}

/**
 * Response structure for fetching chat details/messages.
 */
export interface ChatMessagesApiResponse {
    messages: ChatMessage[]; // Uses the aliased type (with potential status enrichment)
}

/**
 * Represents the standardized information returned by a provider's listModels method.
 */
export interface ProviderModelInfo {
  api_identifier: string; // The specific ID the provider uses for this model in API calls
  name: string;           // A user-friendly name for the model
  description?: string;    // Optional description
  config?: Database['public']['Tables']['ai_providers']['Row']['config']; // Use Json type from DB
  // Add other common relevant fields if needed (e.g., context window size, capabilities)
}

/**
 * Interface for AI provider adapters.
 * Defines the common methods required for interacting with different AI provider APIs.
 */
export interface AiProviderAdapter {
  /**
   * Sends a chat request to the provider's API.
   * @param request - The chat request details (messages, etc.).
   * @param modelIdentifier - The specific API identifier for the model to use.
   * @param apiKey - The API key for the provider.
   * @returns A Promise resolving to the assistant's ChatMessage response.
   */
  sendMessage(
    request: ChatApiRequest, 
    modelIdentifier: string,
    apiKey: string
  ): Promise<ChatMessage>; // Use aliased type

  /**
   * Lists the available models from the provider's API.
   * @param apiKey - The API key for the provider.
   * @returns A Promise resolving to an array of standardized model information.
   */
  listModels(apiKey: string): Promise<ProviderModelInfo[]>;
}

export interface ChatHandlerSuccessResponse {
  userMessage?: ChatMessageRow;       // Populated for normal new messages and new user message in rewind
  assistantMessage: ChatMessageRow;  // Always populated on success
  isRewind?: boolean;                 // True if this was a rewind operation
  isDummy?: boolean;                  // True if dummy provider was used
}

// --- Zustand Store Types ---

/**
 * Defines the state structure for the AI feature store.
 */
export interface AiState {
    // Config fetched from backend
    availableProviders: AiProvider[]; // Use aliased type
    availablePrompts: SystemPrompt[]; // Use aliased type

    // New context-aware chat state
    chatsByContext: { 
        personal: Chat[] | undefined; 
        orgs: { [orgId: string]: Chat[] | undefined };
    };
    messagesByChatId: { [chatId: string]: ChatMessage[] };
    currentChatId: Chat['id'] | null; // Remains the same

    // Message Selection State
    selectedMessagesMap: { [chatId: string]: { [messageId: string]: boolean } };

    // Loading states
    isLoadingAiResponse: boolean; // Remains the same
    isConfigLoading: boolean;   // Remains the same
    isLoadingHistoryByContext: { 
        personal: boolean; 
        orgs: { [orgId: string]: boolean };
    };
    historyErrorByContext: { personal: string | null, orgs: { [orgId: string]: string | null } };
    isDetailsLoading: boolean;  // Remains the same (for currentChatId messages)

    // New chat initiation and context
    newChatContext: 'personal' | string | null; // 'personal' or orgId

    // Rewind feature state
    rewindTargetMessageId: ChatMessage['id'] | null;

    // Error state
    aiError: string | null; // Remains the same

    // Selected provider and prompt
    selectedProviderId: AiProvider['id'] | null;
    selectedPromptId: SystemPrompt['id'] | null;

    isChatContextHydrated?: boolean; // Added for tracking hydration status

    chatParticipantsProfiles: { [userId: string]: UserProfile }; 

    // Token Tracking (placeholders, to be detailed in STEP-2.1.8)
    // Example: chatTokenUsage?: { [chatId: string]: { promptTokens: number; completionTokens: number; totalTokens: number } };
    // Example: sessionTokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Represents the actions available in the AI store.
 */
export interface AiActions {
  loadAiConfig: () => Promise<void>;
  sendMessage: (data: {
    message: string; 
    providerId: AiProvider['id']; // Use aliased type
    promptId: SystemPrompt['id'] | null; // MODIFIED HERE
    chatId?: Chat['id'] | null; // Use aliased type
  }) => Promise<ChatMessage | null>; // Use aliased type
  loadChatHistory: (organizationId?: string | null) => Promise<void>;
  loadChatDetails: (chatId: Chat['id']) => Promise<void>; // Use aliased type
  startNewChat: (organizationId?: string | null) => void;
  clearAiError: () => void;
  checkAndReplayPendingChatAction: () => Promise<void>;
  deleteChat: (chatId: Chat['id'], organizationId?: string | null) => Promise<void>;
  prepareRewind: (messageId: ChatMessage['id'], chatId: Chat['id']) => void;
  cancelRewindPreparation: () => void;
  setSelectedProvider: (providerId: AiProvider['id'] | null) => void;
  setSelectedPrompt: (promptId: SystemPrompt['id'] | null) => void;
  setNewChatContext: (contextId: string | null) => void;

  // Added for chat context hydration
  setChatContextHydrated: (hydrated: boolean) => void;
  hydrateChatContext: (chatContext: ChatContextPreferences | null) => void;
  resetChatContextToDefaults: () => void;

  // Message Selection Actions
  toggleMessageSelection: (chatId: string, messageId: string) => void;
  selectAllMessages: (chatId: string) => void;
  deselectAllMessages: (chatId: string) => void;
  clearMessageSelections: (chatId: string) => void;

  // --- Selectors exposed on the store instance ---
  selectSelectedChatMessages: () => ChatMessage[];
  selectCurrentChatSessionTokenUsage: () => ChatSessionTokenUsageDetails;

  // --- Internal actions exposed for testing or complex workflows ---
  _addOptimisticUserMessage: (msgContent: string, explicitChatId?: string | null) => { tempId: string, chatIdUsed: string, createdTimestamp: string };
  addOptimisticMessageForReplay: (messageContent: string, existingChatId?: string | null) => { tempId: string, chatIdForOptimistic: string };
  _updateChatContextInProfile: (contextUpdate: Partial<ChatContextPreferences>) => Promise<void>;
  _fetchAndStoreUserProfiles: (userIds: string[]) => Promise<void>;
  _dangerouslySetStateForTesting: (newState: Partial<AiState>) => void;
}

/**
 * Defines the selectors that are directly available on the AiStore instance.
 */
export interface AiStoreSelectors {
  selectChatHistoryList: (contextId: string | null) => Chat[];
  selectCurrentChatMessages: () => ChatMessage[];
  selectSelectedChatMessages: () => ChatMessage[];
  selectIsHistoryLoading: (contextId: string | null) => boolean;
  selectIsDetailsLoading: () => boolean;
  selectIsLoadingAiResponse: () => boolean;
  selectAiError: () => string | null;
  selectRewindTargetMessageId: () => string | null;
  selectIsRewinding: () => boolean;
  selectChatTokenUsage: (chatId: string) => TokenUsage | null;
  selectAllPersonalChatMessages: () => ChatMessage[];
  selectCurrentChatSessionTokenUsage: () => ChatSessionTokenUsageDetails;
}

// Combined type for the store
export type AiStore = AiState & AiActions; 

// +++ ADDED PendingAction Type +++
export type AiPendingChatAction = 
  | 'SEND_MESSAGE' 
  | 'LOAD_HISTORY' 
  | 'LOAD_DETAILS' 
  | 'DELETE_CHAT'
  | 'LOAD_CONFIG'
  | 'REPLAY_ACTION'
  | 'REWIND_ACTION'
  | null;
// +++ END PendingAction Type +++

// +++ ADDED Chat Context Preferences Type +++
/**
 * Defines the structure for user-specific chat UI preferences,
 * intended to be stored as JSON in user_profiles.chat_context.
 */
export interface ChatContextPreferences {
  newChatContext?: string | null;      // Corresponds to ChatContextSelector
  selectedProviderId?: string | null;  // Corresponds to ModelSelector (provider ID)
  selectedPromptId?: string | null;    // Corresponds to PromptSelector
}
// +++ END Chat Context Preferences Type +++

// --- API Client Interface ---

/**
 * Defines the public contract for the AiApiClient.
 */
export interface IAiApiClient {
  getAiProviders(token?: string): Promise<ApiResponse<AiProvider[]>>;
  getSystemPrompts(token?: string): Promise<ApiResponse<SystemPrompt[]>>;
  sendChatMessage(data: ChatApiRequest, options?: RequestInit): Promise<ApiResponse<ChatMessage>>;
  getChatHistory(token: string, organizationId?: string | null): Promise<ApiResponse<Chat[]>>;
  getChatWithMessages(chatId: string, token: string, organizationId?: string | null): Promise<ApiResponse<{ chat: Chat, messages: ChatMessage[] }>>;
  deleteChat(chatId: string, token: string, organizationId?: string | null): Promise<ApiResponse<void>>;
  // Add other public methods of AiApiClient here if any
}

// --- Initial State Values (for direct use in create) ---
export const initialAiStateValues: AiState = {
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
  selectedProviderId: null,
  selectedPromptId: null,
  isChatContextHydrated: false, 
  chatParticipantsProfiles: {}, 
  selectedMessagesMap: {},
};