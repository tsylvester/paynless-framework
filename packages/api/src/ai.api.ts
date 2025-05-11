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
     * Fetches the chat history list for the current user or an organization.
     * @param token - The user's authentication token.
     * @param organizationId - Optional ID of the organization to fetch history for.
     */
    async getChatHistory(token: string, organizationId?: string | null): Promise<ApiResponse<Chat[]>> {
        if (!token) {
            const error: ApiError = { code: 'AUTH_ERROR', message: 'Authentication token is required' };
            return { error, status: 401 };
        }
        const options: FetchOptions = { token };
        let endpoint = 'chat-history';
        if (organizationId) {
            endpoint += `?organizationId=${encodeURIComponent(organizationId)}`;
        }
        return this.apiClient.get<Chat[]>(endpoint, options);
    }

    /**
     * Fetches the full chat object (metadata) and all its active messages for a specific chat.
     * @param chatId - The ID of the chat to fetch details for.
     * @param token - The user's authentication token.
     * @param organizationId - Optional ID of the organization the chat belongs to (for context).
     */
    async getChatWithMessages(chatId: string, token: string, organizationId?: string | null): Promise<ApiResponse<{ chat: Chat, messages: ChatMessage[] }>> {
        if (!chatId) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Chat ID is required' };
            return { error, status: 400 };
        }
        if (!token) {
            const error: ApiError = { code: 'AUTH_ERROR', message: 'Authentication token is required' };
            return { error, status: 401 };
        }
        const options: FetchOptions = { token };
        let endpoint = `chat-details/${chatId}`;
        if (organizationId) {
            // Add organizationId as a query parameter
            endpoint += `?organizationId=${encodeURIComponent(organizationId)}`;
        }
        // The generic type for .get now reflects the new expected structure
        return this.apiClient.get<{ chat: Chat, messages: ChatMessage[] }>(endpoint, options);
    }

    /**
     * Deletes a specific chat and its associated messages.
     * @param chatId - The ID of the chat to delete.
     * @param token - The user's authentication token.
     * @param organizationId - Optional ID of the organization the chat belongs to.
     * @returns An ApiResponse indicating success or failure (often with no specific data on success).
     */
    async deleteChat(chatId: string, token: string, organizationId?: string | null): Promise<ApiResponse<void>> {
        if (!chatId) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Chat ID is required for deletion' };
            return { error, status: 400 };
        }
        if (!token) {
            const error: ApiError = { code: 'AUTH_ERROR', message: 'Authentication token is required' };
            return { error, status: 401 };
        }
        const options: FetchOptions = { token };
        let endpoint = `chat/${chatId}`; // Assume endpoint structure like /chat/{chatId}
        if (organizationId) {
            // Pass organizationId as a query parameter for authorization/scoping on the backend
            endpoint += `?organizationId=${encodeURIComponent(organizationId)}`;
        }
        
        logger.info(`Attempting to delete chat: ${chatId}`, { organizationId });
        // Use the base client's delete method
        const response = await this.apiClient.delete<void>(endpoint, options);
        if (response.error) {
            logger.error('Error deleting chat:', { chatId, organizationId, error: response.error });
        } else {
            logger.info(`Successfully deleted chat: ${chatId}`, { organizationId });
        }
        return response;
    }
} 