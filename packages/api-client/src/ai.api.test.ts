import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiApiClient } from './ai.api';
import { ApiClient, ApiResponse } from './apiClient';
import {
    AiProvider,
    SystemPrompt,
    Chat,
    ChatMessage,
    ChatApiRequest,
    AiProvidersApiResponse,
    SystemPromptsApiResponse,
    ChatApiResponse,
    ChatHistoryApiResponse,
    ChatMessagesApiResponse,
} from '@paynless/types';

// Mock the base ApiClient
const mockApiClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(), // Include other methods even if not directly used by AiApiClient
    delete: vi.fn(),
} as unknown as ApiClient; // Use type assertion

// Create an instance of the class we are testing
const aiApiClient = new AiApiClient(mockApiClient);

describe('AiApiClient', () => {
    // Reset mocks before each test
    beforeEach(() => {
        vi.resetAllMocks();
    });

    // Tests for getAiProviders
    describe('getAiProviders', () => {
        it('should call apiClient.get with the correct endpoint', async () => {
            // Arrange: Mock successful response
            const mockResponse: ApiResponse<AiProvider[]> = {
                success: true,
                data: [], // Use empty array for endpoint check
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.getAiProviders();

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith('ai-providers');
        });

        it('should return the providers array on successful response', async () => {
            // Arrange
            const mockProviders: AiProvider[] = [
                { id: 'p1', name: 'Provider 1', description: 'Desc 1' },
                { id: 'p2', name: 'Provider 2', description: null },
            ];
            const mockResponse: ApiResponse<AiProvider[]> = {
                success: true,
                data: mockProviders, // Data is the array directly
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.getAiProviders();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockProviders);
            expect(result.statusCode).toBe(200);
        });

        it('should return the error object on failed response', async () => {
            // Arrange
            const mockErrorResponse: ApiResponse<AiProvidersApiResponse> = {
                success: false,
                error: 'Failed to fetch providers',
                statusCode: 500,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await aiApiClient.getAiProviders();

            // Assert
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBe('Failed to fetch providers');
            expect(result.statusCode).toBe(500);
        });
    });

    // Tests for getSystemPrompts
    describe('getSystemPrompts', () => {
        it('should call apiClient.get with the correct endpoint', async () => {
            // Arrange
             const mockResponse: ApiResponse<SystemPrompt[]> = {
                success: true,
                data: [], // Use empty array for endpoint check
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.getSystemPrompts();

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith('system-prompts');
        });

        it('should return the prompts array on successful response', async () => {
            // Arrange
            const mockPrompts: SystemPrompt[] = [
                { id: 'sp1', name: 'Prompt 1', prompt_text: 'Act as...' },
                { id: 'sp2', name: 'Prompt 2', prompt_text: 'Generate...' },
            ];
            const mockResponse: ApiResponse<SystemPrompt[]> = {
                success: true,
                data: mockPrompts, // Data is the array directly
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.getSystemPrompts();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockPrompts);
            expect(result.statusCode).toBe(200);
        });

        it('should return the error object on failed response', async () => {
             // Arrange
            const mockErrorResponse: ApiResponse<SystemPromptsApiResponse> = {
                success: false,
                error: 'Failed to fetch prompts',
                statusCode: 500,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await aiApiClient.getSystemPrompts();

            // Assert
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBe('Failed to fetch prompts');
            expect(result.statusCode).toBe(500);
        });
    });

    // Tests for sendChatMessage
    describe('sendChatMessage', () => {
        const chatRequestData: ChatApiRequest = {
            message: 'Hello AI',
            providerId: 'p1',
            promptId: 'sp1',
            chatId: 'c1',
        };

        const mockAssistantMessage: ChatMessage = {
            id: 'm2',
            chat_id: 'c1',
            role: 'assistant',
            content: 'Hello User',
            user_id: null,
            ai_provider_id: 'p1',
            system_prompt_id: 'sp1',
            token_usage: { total_tokens: 10 },
            created_at: '2024-01-01T12:00:00.000Z',
        };

        it('should call apiClient.post with the correct endpoint and data', async () => {
            // Arrange
             const mockResponse: ApiResponse<ChatMessage> = {
                success: true,
                data: mockAssistantMessage, // Data is the object directly
                statusCode: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.sendChatMessage(chatRequestData);

            // Assert
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith('chat', chatRequestData);
        });

        it('should return the assistant message object on successful response', async () => {
             // Arrange
             const mockResponse: ApiResponse<ChatMessage> = {
                success: true,
                data: mockAssistantMessage, // Data is the object directly
                statusCode: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.sendChatMessage(chatRequestData);

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockAssistantMessage);
            expect(result.statusCode).toBe(200);
        });

        it('should return the error object on failed response', async () => {
            // Arrange
             const mockErrorResponse: ApiResponse<ChatApiResponse> = {
                success: false,
                error: 'Failed to send message',
                statusCode: 500,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await aiApiClient.sendChatMessage(chatRequestData);

            // Assert
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBe('Failed to send message');
            expect(result.statusCode).toBe(500);
        });
    });

    // Tests for getChatHistory
    describe('getChatHistory', () => {
        it('should call apiClient.get with the correct endpoint', async () => {
            // Arrange
             const mockResponse: ApiResponse<Chat[]> = {
                success: true,
                data: [], // Use empty array for endpoint check
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.getChatHistory();

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith('chat-history');
        });

        it('should return the chats array on successful response', async () => {
            // Arrange
            const mockChats: Chat[] = [
                { id: 'c1', user_id: 'u1', title: 'Chat 1', created_at: 't1', updated_at: 't2' },
                { id: 'c2', user_id: 'u1', title: 'Chat 2', created_at: 't3', updated_at: 't4' },
            ];
             const mockResponse: ApiResponse<Chat[]> = {
                success: true,
                data: mockChats, // Data is the array directly
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.getChatHistory();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockChats);
            expect(result.statusCode).toBe(200);
        });

        it('should return the error object on failed response', async () => {
            // Arrange
            const mockErrorResponse: ApiResponse<ChatHistoryApiResponse> = {
                success: false,
                error: 'Failed to fetch history',
                statusCode: 500,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await aiApiClient.getChatHistory();

            // Assert
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBe('Failed to fetch history');
            expect(result.statusCode).toBe(500);
        });
    });

    // Tests for getChatMessages
    describe('getChatMessages', () => {
        const chatId = 'test-chat-id';
        const mockMessages: ChatMessage[] = [
            { id: 'm1', chat_id: chatId, role: 'user', content: 'Hi', user_id: 'u1', ai_provider_id: null, system_prompt_id: null, token_usage: null, created_at: 't1' },
            { id: 'm2', chat_id: chatId, role: 'assistant', content: 'Hello', user_id: null, ai_provider_id: 'p1', system_prompt_id: 'sp1', token_usage: null, created_at: 't2' },
        ];

        it('should return an error if chatId is missing', async () => {
            // Arrange
            const emptyChatId = ''; // Or pass undefined/null depending on how you want to test

            // Act
            // Pass the empty string or undefined/null to the method
            const result = await aiApiClient.getChatMessages(emptyChatId);

            // Assert
            // Check against the corrected error response structure from ai.api.ts
            expect(result.success).toBe(false);
            expect(result.error).toBe('Chat ID is required');
            expect(result.statusCode).toBe(400);
            expect(result.data).toBeUndefined(); // Ensure data is undefined on error
            // Ensure the mock was NOT called
            expect(mockApiClient.get).not.toHaveBeenCalled();
        });

        it('should call apiClient.get with the correct endpoint including chatId', async () => {
             // Arrange
             const mockResponse: ApiResponse<ChatMessage[]> = {
                success: true,
                data: [], // Use empty array for endpoint check
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.getChatMessages(chatId);

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            // Remove leading slash from expected path
            expect(mockApiClient.get).toHaveBeenCalledWith(`chat-details/${chatId}`);
        });

        it('should return the messages array on successful response', async () => {
            // Arrange
             const mockResponse: ApiResponse<ChatMessage[]> = {
                success: true,
                data: mockMessages, // Data is the array directly
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.getChatMessages(chatId);

            // Assert
            expect(result.success).toBe(true);
            // Assertion should now pass
            expect(result.data).toEqual(mockMessages);
            expect(result.statusCode).toBe(200);
        });

        it('should return the error object on failed response', async () => {
            // Arrange
             const mockErrorResponse: ApiResponse<ChatMessagesApiResponse> = {
                success: false,
                error: 'Failed to fetch messages',
                statusCode: 404,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act
            const result = await aiApiClient.getChatMessages(chatId);

            // Assert
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toBe('Failed to fetch messages');
            expect(result.statusCode).toBe(404);
        });
    });
}); 