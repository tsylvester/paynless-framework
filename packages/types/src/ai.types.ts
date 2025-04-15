/**
 * Represents an AI Provider available for selection.
 * Matches the ai_providers table structure (public fields only).
 */
export interface AiProvider {
  id: string; // uuid
  name: string;
  description: string | null;
  api_identifier: string; // Add the identifier needed for parsing
  // Note: is_active is used server-side/admin,
  // not typically exposed directly to the frontend via the standard fetch.
}

/**
 * Represents a reusable System Prompt.
 * Matches the system_prompts table structure.
 */
export interface SystemPrompt {
  id: string; // uuid
  name: string;
  prompt_text: string;
  // is_active is used server-side/admin
}

/**
 * Represents a Chat conversation thread.
 * Matches the chats table structure (relevant fields).
 */
export interface Chat {
  id: string; // uuid
  user_id: string | null; // uuid
  title: string | null;
  created_at: string; // ISO 8601 timestamp string
  updated_at: string; // ISO 8601 timestamp string
}

/**
 * Represents a single message within a Chat.
 * Matches the chat_messages table structure.
 */
export interface ChatMessage {
  id: string; // uuid
  chat_id: string; // uuid
  user_id: string | null; // uuid (null for assistant/system)
  role: 'user' | 'assistant' | 'system';
  content: string;
  ai_provider_id: string | null; // uuid
  system_prompt_id: string | null; // uuid
  token_usage: Record<string, number> | null; // e.g., { prompt_tokens: number, completion_tokens: number, total_tokens: number }
  created_at: string; // ISO 8601 timestamp string
}

// --- API Request/Response Types (Placeholders/Examples) ---

/**
 * Structure for sending a message via the 'chat' Edge Function.
 */
export interface ChatApiRequest {
  message: string;
  providerId: string; // AiProvider['id']
  promptId: string;   // SystemPrompt['id']
  chatId?: string;   // Chat['id'] (optional for new chats)
}

/**
 * Example structure for the response from the 'chat' Edge Function.
 * The actual response wraps the ChatMessage.
 */
export interface ChatApiResponse {
  message: ChatMessage; // The assistant's response message record
}

/**
 * Response structure for fetching AI providers.
 */
export interface AiProvidersApiResponse {
    providers: AiProvider[];
}

/**
 * Response structure for fetching system prompts.
 */
export interface SystemPromptsApiResponse {
    prompts: SystemPrompt[];
}

/**
 * Response structure for fetching chat history.
 */
export interface ChatHistoryApiResponse {
    chats: Chat[];
}

/**
 * Response structure for fetching chat details/messages.
 */
export interface ChatMessagesApiResponse {
    messages: ChatMessage[];
}

// --- Zustand Store Types ---

/**
 * Defines the state structure for the AI feature store.
 */
export interface AiState {
    // Config fetched from backend
    availableProviders: AiProvider[];
    availablePrompts: SystemPrompt[];

    // Current chat state
    currentChatMessages: ChatMessage[];
    currentChatId: string | null;
    isLoadingAiResponse: boolean; // Loading indicator specifically for AI response generation
    isConfigLoading: boolean;   // Loading indicator for fetching providers/prompts
    isHistoryLoading: boolean;  // Loading indicator for fetching chat list
    isDetailsLoading: boolean;  // Loading indicator for fetching messages of a specific chat

    // Chat history list
    chatHistoryList: Chat[];

    // Error state
    aiError: string | null;
}

/**
 * Defines the actions available in the AI feature store.
 */
export interface AiActions {
    // Action definitions based on plan
    loadAiConfig: () => Promise<void>;
    sendMessage: (data: {
        message: string;
        providerId: string;
        promptId: string;
        chatId?: string;
    }) => Promise<ChatMessage | null>;
    loadChatHistory: () => Promise<void>;
    loadChatDetails: (chatId: string) => Promise<void>;
    startNewChat: () => void;
    addAssistantMessage: (message: ChatMessage) => void;

    // Clear error state
    clearAiError: () => void;
}

// Combined type for the store
export type AiStore = AiState & AiActions; 