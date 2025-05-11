import type { Database } from '@paynless/db-types';
// If FetchOptions is meant to be the standard fetch options, use RequestInit
// import type { FetchOptions } from '@supabase/supabase-js'; // This was problematic
import type { ApiResponse } from './api.types';
// --- Database Table Aliases ---

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
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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
}

// Combined type for the store
export type AiStore = AiState & AiActions; 

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
};