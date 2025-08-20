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
  assistantPromptTokens: number;
  assistantCompletionTokens: number;
  assistantTotalTokens: number; // Sum of assistant's prompt & completion for all assistant messages
  overallTotalTokens: number;  // Sum of assistantPromptTokens + assistantCompletionTokens for the session
}

/**
 * Represents a single message within a Chat.
 * Derived from the `chat_messages` table.
 */
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'] 

// --- Application/API/Adapter/Store Specific Types ---

// Accepted Tiktoken encoding names
export type TiktokenEncoding = 'cl100k_base' | 'p50k_base' | 'r50k_base' | 'gpt2' | 'o200k_base';

/**
 * Interface for messages used in token counting functions.
 */
export enum ChatRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  FUNCTION = 'function',
}

export interface Messages {
  role: ChatRole; // Function role might be needed for some models
  content: string | null; // Content can be null for some function calls
  name?: string; // Optional, for function calls
}



/**
 * Extended configuration for an AI model, stored in the `ai_providers.config` JSON column.
 * This structure holds information crucial for dynamic token cost calculation, output capping,
 * and input token estimation strategies.
 */
export interface AiModelExtendedConfig {
  // Token Costing & Limits (for getMaxOutputTokens logic)
  input_token_cost_rate: number;    // How many wallet tokens 1 input token costs (e.g., 1.0)
  output_token_cost_rate: number;   // How many wallet tokens 1 output token costs (e.g., 3.0)
  hard_cap_output_tokens?: number; // Provider's absolute max output tokens (e.g., 4096, 8192, 200000)
                                    // This is the 'global_max_tokens' or 'hard_cap' in ChatGPT's suggestion.
  context_window_tokens?: number | null;   // Provider's max context window (input + output usually)

  // Input Token Estimation Strategy (for client-side estimateInputTokens)
  tokenization_strategy: {
    type: 'tiktoken' | 'rough_char_count' | 'provider_specific_api' | 'unknown';
    // For 'tiktoken'
    tiktoken_encoding_name?: TiktokenEncoding; // e.g., 'cl100k_base', 'p50k_base', 'r50k_base', 'gpt2'
    is_chatml_model?: boolean; // If true, apply ChatML counting rules (like in tokenizer_utils.ts)
                                // We might need more granular rules here if ChatML varies.
    api_identifier_for_tokenization?: string; // e.g., "gpt-4o", "gpt-3.5-turbo", for direct use with tiktoken's encodingForModel
    // For 'rough_char_count'
    chars_per_token_ratio?: number; // e.g., 4.0 (average chars per token)
    // For 'provider_specific_api'
    // No extra fields needed here; implies server-side call or pre-fetched from provider if available
  };

  // Optional: Provider-returned limits (can be synced automatically if API provides them)
  provider_max_input_tokens?: number;
  provider_max_output_tokens?: number; // This could directly inform hard_cap_output_tokens

  // Optional: Default parameters for the model
  default_temperature?: number;
  default_top_p?: number;
  // ... other common model params
}

/**
 * Structure for sending a message via the 'chat' Edge Function.
 */
export interface ChatApiRequest {
  message: string;
  providerId: AiProvider['id']; // Reference aliased type
  promptId: SystemPrompt['id']; // Reference aliased type
  chatId?: Chat['id'] | null;   // Reference aliased type (optional for new chats)
  organizationId?: string | null; // Add optional organizationId
  contextMessages?: Messages[]; // Added for selected context
  rewindFromMessageId?: string | null; // Added for rewind
  max_tokens_to_generate?: number; // Added for output capping
  temperature?: number; // Added for temperature control
  top_p?: number; // Added for top_p control
  presence_penalty?: number; // Added for presence penalty
  frequency_penalty?: number; // Added for frequency penalty
  seed?: number; // Added for seed control
  stop?: string[]; // Added for stop sequences
  stream?: boolean; // Added for streaming responses
  user?: string; // Added for user identification
  response_format?: { type: string }; // Added for structured output
  tools?: { type: string; function: { name: string; description: string, parameters: Record<string, unknown> } }[]; // Added for tool calling
  tool_choice?: string; // Added for tool choice
  logprobs?: number; // Added for logprobs
  echo?: boolean; // Added for echoing messages
  best_of?: number; // Added for best of responses
  logit_bias?: Record<string, number>; // Added for logit bias
  max_tokens?: number; // Added for max tokens
  continue_until_complete?: boolean;
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
  chatId: string;                    // ID of the chat session (new or existing)
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

    pendingAction: AiPendingChatAction; // Added missing state property
    continueUntilComplete: boolean;

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
    contextMessages?: Messages[]; // Use the more permissive type here
  }) => Promise<ChatMessage | null>; // Use aliased type
  loadChatHistory: (organizationId?: string | null) => Promise<void>;
  loadChatDetails: (chatId: Chat['id']) => Promise<void>; // Use aliased type
  startNewChat: (organizationId?: string | null) => void;
  clearAiError: () => void;
  deleteChat: (chatId: Chat['id'], organizationId?: string | null) => Promise<void>;
  prepareRewind: (messageId: ChatMessage['id'], chatId: Chat['id']) => void;
  cancelRewindPreparation: () => void;
  setSelectedProvider: (providerId: AiProvider['id'] | null) => void;
  setSelectedPrompt: (promptId: SystemPrompt['id'] | null) => void;
  setNewChatContext: (contextId: string | null) => void;
  setContinueUntilComplete: (shouldContinue: boolean) => void;

  // Added for chat context hydration
  setChatContextHydrated: (hydrated: boolean) => void;
  hydrateChatContext: (chatContext: ChatContextPreferences | null) => void;
  resetChatContextToDefaults: () => void;

  // Message Selection Actions
  toggleMessageSelection: (chatId: string, messageId: string) => void;
  selectAllMessages: (chatId: string) => void;
  deselectAllMessages: (chatId: string) => void;
  clearMessageSelections: (chatId: string) => void;

  // --- Internal actions exposed for testing or complex workflows ---
  _addOptimisticUserMessage: (msgContent: string, explicitChatId?: string | null) => { tempId: string, chatIdUsed: string, createdTimestamp: string };
  _updateChatContextInProfile: (contextUpdate: Partial<ChatContextPreferences>) => Promise<void>;
  _fetchAndStoreUserProfiles: (userIds: string[]) => Promise<void>;
  _dangerouslySetStateForTesting: (newState: Partial<AiState>) => void;
  checkAndReplayPendingChatAction: () => Promise<void>;
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
  selectCurrentChatSelectionState: () => 'all' | 'none' | 'some' | 'empty';
}

// Combined type for the store
export type AiStore = AiState & AiActions; 

// Type for the new selector's return value
export type ChatSelectionState = 'all' | 'none' | 'some' | 'empty';

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
/**
 * Request structure for token estimation.
 */
export interface TokenEstimationRequest {
  textOrMessages: string | Messages[];
  modelConfig: AiModelExtendedConfig;
}

/**
 * Response structure for token estimation.
 */
export interface TokenEstimationResponse {
  estimatedTokens: number;
}

export interface IAiApiClient {
  getAiProviders(token?: string): Promise<ApiResponse<AiProvider[]>>;
  getSystemPrompts(token?: string): Promise<ApiResponse<SystemPrompt[]>>;
  sendChatMessage(data: ChatApiRequest, options?: RequestInit): Promise<ApiResponse<ChatHandlerSuccessResponse>>;
  getChatHistory(token: string, organizationId?: string | null): Promise<ApiResponse<Chat[]>>;
  getChatWithMessages(chatId: string, token: string, organizationId?: string | null): Promise<ApiResponse<{ chat: Chat, messages: ChatMessage[] }>>;
  deleteChat(chatId: string, token: string, organizationId?: string | null): Promise<ApiResponse<void>>;
  
  // Token estimation methods
  estimateTokens(data: TokenEstimationRequest, token: string): Promise<ApiResponse<TokenEstimationResponse>>;
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
  pendingAction: null,
  continueUntilComplete: true,
};
// Type definitions for the new selector
export type ActiveChatWalletInfoStatus = 'ok' | 'loading' | 'error' | 'consent_required' | 'consent_refused' | 'policy_org_wallet_unavailable' | 'policy_member_wallet_unavailable';

export interface ActiveChatWalletInfo {
  status: ActiveChatWalletInfoStatus;
  type: 'personal' | 'organization' | null; 
  walletId: string | null; 
  orgId: string | null; 
  balance: string | null; 
  message?: string; // General message, can be error or informational
  isLoadingPrimaryWallet: boolean; // True if the determined primary wallet (personal or specific org) is loading its details
}