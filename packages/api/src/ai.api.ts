import type { ApiClient } from './apiClient';
import type {
    ApiResponse,
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest,
    ChatHandlerSuccessResponse,
    ApiError,
    FetchOptions,
    IAiApiClient,
    TokenEstimationRequest,
    TokenEstimationResponse
} from '@paynless/types';
import { logger } from '@paynless/utils';

/**
 * API Client for interacting with AI-related Edge Functions.
 */
export class AiApiClient implements IAiApiClient {
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
        const options: FetchOptions = token ? { token } : {};
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
    async sendChatMessage(data: ChatApiRequest, options?: FetchOptions): Promise<ApiResponse<ChatHandlerSuccessResponse>> {
        // Validate essential data (can add more specific checks)
        if (!data.message || !data.providerId || !data.promptId) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Missing required fields in chat message request' };
            return { error, status: 400 };
        }
        // Pass data and potentially undefined options to the underlying post method
        return this.apiClient.post<ChatHandlerSuccessResponse, ChatApiRequest>('chat', data, options);
    }

    /**
     * Sends a streaming chat message to the backend using Server-Sent Events (SSE).
     * Returns an EventSource for receiving real-time updates.
     */
    async sendStreamingChatMessage(data: ChatApiRequest, options?: FetchOptions): Promise<EventSource | { error: ApiError }> {
        // Validate essential data
        if (!data.message || !data.providerId || !data.promptId) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'Missing required fields in streaming chat message request' };
            return { error };
        }

        // Add stream flag to request
        const streamingData = { ...data, stream: true };

        try {
            // Create URL for the chat endpoint
            const baseUrl = this.apiClient.getBaseUrl();
            const url = `${baseUrl}/chat`;
            
            // Prepare headers
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            };

            // Add auth token if provided
            if (options?.token) {
                headers['Authorization'] = `Bearer ${options.token}`;
            }

            // Send POST request to initiate streaming
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(streamingData),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const error: ApiError = { 
                    code: 'STREAMING_ERROR', 
                    message: `Streaming request failed: ${response.status} ${errorText}` 
                };
                return { error };
            }

            // For SSE, we need to handle the stream directly rather than using EventSource
            // since EventSource doesn't support POST requests with bodies
            return this.createStreamingResponse(response);
            
        } catch (err) {
            const error: ApiError = { 
                code: 'NETWORK_ERROR', 
                message: `Failed to establish streaming connection: ${err instanceof Error ? err.message : String(err)}` 
            };
            return { error };
        }
    }

    /**
     * Creates a streaming response handler for SSE data
     */
    private createStreamingResponse(response: Response): EventSource {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        // Create a custom EventSource-like object
        const eventSource = new EventTarget() as EventSource & EventTarget;
        
        // Add EventSource properties and methods
        Object.defineProperties(eventSource, {
            readyState: { value: 1, writable: false }, // OPEN
            url: { value: response.url, writable: false },
            withCredentials: { value: false, writable: false },
            CONNECTING: { value: 0, writable: false },
            OPEN: { value: 1, writable: false },
            CLOSED: { value: 2, writable: false },
        });

        eventSource.close = () => {
            if (reader) {
                reader.cancel();
            }
        };

        if (reader) {
            this.processStream(reader, decoder, eventSource);
        }

        return eventSource as EventSource;
    }

    /**
     * Processes the SSE stream and dispatches events
     */
    private async processStream(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder, eventSource: EventSource & EventTarget) {
        try {
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // Process complete messages
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = line.substring(6); // Remove 'data: ' prefix
                            if (data.trim()) {
                                const parsedData = JSON.parse(data);
                                const event = new MessageEvent('message', { data: parsedData });
                                eventSource.dispatchEvent(event);
                            }
                        } catch (parseError) {
                            logger.error('Failed to parse SSE data:', { error: parseError, line });
                        }
                    }
                }
            }
            
            // Dispatch close event
            const closeEvent = new Event('close');
            eventSource.dispatchEvent(closeEvent);
            
        } catch (error) {
            // Dispatch error event
            const errorEvent = new ErrorEvent('error', { error });
            eventSource.dispatchEvent(errorEvent);
        }
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

    /**
     * Estimates tokens for given text or messages using server-side estimation.
     * @param data - The token estimation request containing text/messages and model config.
     * @param token - The user's authentication token.
     * @returns An ApiResponse containing the estimated token count.
     */
    async estimateTokens(data: TokenEstimationRequest, token: string): Promise<ApiResponse<TokenEstimationResponse>> {
        if (!data.textOrMessages || !data.modelConfig) {
            const error: ApiError = { code: 'VALIDATION_ERROR', message: 'textOrMessages and modelConfig are required' };
            return { error, status: 400 };
        }
        if (!token) {
            const error: ApiError = { code: 'AUTH_ERROR', message: 'Authentication token is required' };
            return { error, status: 401 };
        }

        const options: FetchOptions = { token };
        
        logger.info('Estimating tokens', { 
            inputType: typeof data.textOrMessages,
            modelStrategy: data.modelConfig.tokenization_strategy?.type 
        });
        
        const response = await this.apiClient.post<TokenEstimationResponse, TokenEstimationRequest>('tokenEstimator', data, options);
        
        if (response.error) {
            logger.error('Error estimating tokens:', { error: response.error });
        } else {
            logger.info(`Token estimation completed: ${response.data?.estimatedTokens} tokens`);
        }
        
        return response;
    }
} 