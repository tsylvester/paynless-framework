import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest,
    ApiError,
    FetchOptions
} from '@paynless/types';
import { logger } from '@paynless/utils';

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
    async getAiProviders(token?: string): Promise<ApiResponse<AiProvider[]>> {
        const options: FetchOptions = token ? { token } : { isPublic: true };
        logger.info('Fetching AI providers');
        const response = await this.apiClient.get<AiProvider[]>('/ai-providers', options);
        if (response.error) {
            logger.error('Error fetching AI providers:', { error: response.error });
        } else {
            logger.info(`Fetched ${response.data?.length ?? 0} AI providers`);
        }
        return response;
    }

    /**
     * Fetches the list of active system prompts.
     */
    async getSystemPrompts(token?: string): Promise<ApiResponse<SystemPrompt[]>> {
        const options: FetchOptions = token ? { token } : { isPublic: true };
        logger.info('Fetching system prompts');
        const response = await this.apiClient.get<SystemPrompt[]>('/system-prompts', options);
        if (response.error) {
            logger.error('Error fetching system prompts:', { error: response.error });
        } else {
            logger.info(`Fetched ${response.data?.length ?? 0} system prompts`);
        }
        return response;
    }

    /**
     * Sends a chat message to the backend.
     * Handles both anonymous (isPublic: true) and authenticated requests.
     */
    async sendChatMessage(data: ChatApiRequest, options?: FetchOptions): Promise<ApiResponse<ChatMessage>> {
        // Validate essential data (can add more specific checks)
        if (!data.message || !data.providerId || !data.promptId) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Missing required fields in chat message request' };
            return { error, status: 400 };
        }
        // Pass data and potentially undefined options to the underlying post method
        return this.apiClient.post<ChatMessage, ChatApiRequest>('chat', data, options);
    }

    /**
     * Fetches the chat history list for the current user.
     * @param token - The user's authentication token.
     */
    async getChatHistory(token: string): Promise<ApiResponse<Chat[]>> {
        if (!token) {
            const error: ApiError = { code: 'AUTH_ERROR', message: 'Authentication token is required' };
            return { error, status: 401 };
        }
        const options: FetchOptions = { token };
        return this.apiClient.get<Chat[]>('chat-history', options);
    }

    /**
     * Fetches all messages for a specific chat.
     * @param chatId - The ID of the chat to fetch messages for.
     */
    async getChatMessages(chatId: string, token: string): Promise<ApiResponse<ChatMessage[]>> {
        if (!chatId) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Chat ID is required' };
            return { error, status: 400 };
        }
        if (!token) {
            const error: ApiError = { code: 'AUTH_ERROR', message: 'Authentication token is required' };
            return { error, status: 401 };
        }
        // Pass the token in options
        const options: FetchOptions = { token };
        return this.apiClient.get<ChatMessage[]>(`chat-details/${chatId}`, options);
    }
} 