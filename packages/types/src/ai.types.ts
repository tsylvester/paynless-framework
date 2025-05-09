import type { Database } from '@paynless/db-types';
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
 * Represents a single message within a Chat.
 * Derived from the `chat_messages` table.
 */
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'] & {
  // Keep application-level status enrichment if needed by UI directly
  // Note: status was previously added to LocalChatMessage, consider if it belongs here
  status?: 'pending' | 'sent' | 'error'; 
};

// --- Application/API/Adapter/Store Specific Types ---

// Keep existing API/Usage types...

/**
 * Structure for sending a message via the 'chat' Edge Function.
 */
export interface ChatApiRequest {
  message: string;
  providerId: AiProvider['id']; // Reference aliased type
  promptId: SystemPrompt['id']; // Reference aliased type
  chatId?: Chat['id'];   // Reference aliased type (optional for new chats)
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

    // Current chat state
    currentChatMessages: ChatMessage[]; // Use aliased type
    currentChatId: Chat['id'] | null; // Use aliased type
    isLoadingAiResponse: boolean; // Loading indicator specifically for AI response generation
    isConfigLoading: boolean;   // Loading indicator for fetching providers/prompts
    isHistoryLoading: boolean;  // Loading indicator for fetching chat list
    isDetailsLoading: boolean;  // Loading indicator for fetching messages of a specific chat

    // Chat history list
    chatHistoryList: Chat[]; // Use aliased type

    // Error state
    aiError: string | null;
}

/**
 * Represents the actions available in the AI store.
 */
export interface AiActions {
  loadAiConfig: () => Promise<void>;
  sendMessage: (data: {
    message: string; 
    providerId: AiProvider['id']; // Use aliased type
    promptId: SystemPrompt['id']; // Use aliased type
    chatId?: Chat['id'] | null; // Use aliased type
  }) => Promise<ChatMessage | null>; // Use aliased type
  loadChatHistory: () => Promise<void>;
  loadChatDetails: (chatId: Chat['id']) => Promise<void>; // Use aliased type
  startNewChat: () => void;
  clearAiError: () => void;
  checkAndReplayPendingChatAction: () => Promise<void>;
}

// Combined type for the store
export type AiStore = AiState & AiActions; 