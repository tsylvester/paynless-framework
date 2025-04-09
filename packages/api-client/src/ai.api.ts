import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest,
    ApiError,
} from '@paynless/types';

/**
 * API Client for interacting with AI-related Edge Functions.
 */
export class AiApiClient {
    private apiClient: ApiClient;

    constructor(apiClient: ApiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Fetches the list of active AI providers.
     */
    async getAiProviders(): Promise<ApiResponse<AiProvider[]>> {
        return this.apiClient.get<AiProvider[]>('ai-providers');
    }

    /**
     * Fetches the list of active system prompts.
     */
    async getSystemPrompts(): Promise<ApiResponse<SystemPrompt[]>> {
        return this.apiClient.get<SystemPrompt[]>('system-prompts');
    }

    /**
     * Sends a chat message to the backend.
     * @param data - The chat message request data.
     */
    async sendChatMessage(data: ChatApiRequest): Promise<ApiResponse<ChatMessage>> {
        // Assuming the API returns the new ChatMessage object directly
        return this.apiClient.post<ChatMessage, ChatApiRequest>('chat', data);
    }

    /**
     * Fetches the chat history list for the current user.
     */
    async getChatHistory(): Promise<ApiResponse<Chat[]>> {
        return this.apiClient.get<Chat[]>('chat-history');
    }

    /**
     * Fetches all messages for a specific chat.
     * @param chatId - The ID of the chat to fetch messages for.
     */
    async getChatMessages(chatId: string): Promise<ApiResponse<ChatMessage[]>> {
        if (!chatId) {
            // Return the standard ApiResponse error format
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Chat ID is required' };
            return { error, status: 400 };
        }
        // Ensure the path is constructed correctly according to URL conventions
        return this.apiClient.get<ChatMessage[]>(`chat-details/${chatId}`);
    }
} 