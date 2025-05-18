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
                data: [],
                status: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.getAiProviders();

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith('/ai-providers', { isPublic: true });
        });

        it('should return the providers array on successful response', async () => {
            // Arrange
            const mockProviders: AiProvider[] = [
                { id: 'p1', name: 'Provider 1', description: 'Desc 1' },
                { id: 'p2', name: 'Provider 2', description: null },
            ];
            const mockResponse: ApiResponse<AiProvider[]> = {
                data: mockProviders,
                status: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.getAiProviders();

            // Assert
            expect(result.data).toEqual(mockProviders);
            expect(result.status).toBe(200);
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
            expect(result.error).toBe('Failed to fetch providers');
            expect(result.statusCode).toBe(500);
        });
    });

    // Tests for getSystemPrompts
    describe('getSystemPrompts', () => {
        it('should call apiClient.get with the correct endpoint', async () => {
            // Arrange
             const mockResponse: ApiResponse<SystemPrompt[]> = {
                data: [],
                status: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.getSystemPrompts();

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get).toHaveBeenCalledWith('/system-prompts', { isPublic: true });
        });

        it('should return the prompts array on successful response', async () => {
            // Arrange
            const mockPrompts: SystemPrompt[] = [
                { id: 'sp1', name: 'Prompt 1', prompt_text: 'Act as...' },
                { id: 'sp2', name: 'Prompt 2', prompt_text: 'Generate...' },
            ];
            const mockResponse: ApiResponse<SystemPrompt[]> = {
                data: mockPrompts,
                status: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.getSystemPrompts();

            // Assert
            expect(result.data).toEqual(mockPrompts);
            expect(result.status).toBe(200);
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
                data: mockAssistantMessage,
                status: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act: Call without explicit options
            await aiApiClient.sendChatMessage(chatRequestData);

            // Assert
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith('chat', chatRequestData, undefined);
        });

        it('should call apiClient.post with contextMessages when provided', async () => {
            // Arrange
            const chatRequestDataWithContext: ChatApiRequest = {
                ...chatRequestData,
                contextMessages: [
                    { role: 'user', content: 'Previous user message' },
                    { role: 'assistant', content: 'Previous assistant response' },
                ],
            };
            const mockResponse: ApiResponse<ChatMessage> = {
                data: mockAssistantMessage,
                status: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            await aiApiClient.sendChatMessage(chatRequestDataWithContext);

            // Assert
            expect(mockApiClient.post).toHaveBeenCalledTimes(1);
            expect(mockApiClient.post).toHaveBeenCalledWith('chat', chatRequestDataWithContext, undefined);
        });

        it('should return the assistant message object on successful response', async () => {
             // Arrange
             const mockResponse: ApiResponse<ChatMessage> = {
                data: mockAssistantMessage,
                status: 200,
            };
            (mockApiClient.post as vi.Mock).mockResolvedValue(mockResponse);

            // Act
            const result = await aiApiClient.sendChatMessage(chatRequestData);

            // Assert
            expect(result.data).toEqual(mockAssistantMessage);
            expect(result.status).toBe(200);
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
            expect(result.error).toBe('Failed to send message');
            expect(result.statusCode).toBe(500);
        });
    });

    // Tests for getChatHistory
    describe('getChatHistory', () => {
        const mockToken = 'test-auth-token'; // Define a mock token
        const mockOrgId = 'org-789';

        it('should call apiClient.get with the correct endpoint and token when no orgId is provided', async () => {
            // Arrange
             const mockResponse: ApiResponse<Chat[]> = {
                data: [],
                status: 200
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act: Call with the mock token
            await aiApiClient.getChatHistory(mockToken);

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            // Verify endpoint AND options object with token
            expect(mockApiClient.get).toHaveBeenCalledWith('chat-history', { token: mockToken }); 
        });
        
        // New Test Case for organizationId
        it('should call apiClient.get with the correct endpoint including organizationId when provided', async () => {
            // Arrange
             const mockResponse: ApiResponse<Chat[]> = {
                data: [],
                status: 200
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act: Call with mock token and organizationId
            // Note: Method signature will need update later for this to compile
            // @ts-expect-error - Temporarily ignore error until method signature is updated
            await aiApiClient.getChatHistory(mockToken, mockOrgId); 

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            const expectedEndpoint = `chat-history?organizationId=${mockOrgId}`;
            expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, { token: mockToken });
        });

        it('should return the chat history array on successful response', async () => {
            // Arrange
            const mockHistory: Chat[] = [
                { id: 'c1', title: 'Chat 1', user_id: 'u1', created_at: 't1', updated_at: 't1' },
                { id: 'c2', title: null, user_id: 'u1', created_at: 't2', updated_at: 't2' },
            ];
            const mockResponse: ApiResponse<Chat[]> = {
                success: true,
                data: mockHistory,
                statusCode: 200,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockResponse);

            // Act: Call with the mock token
            const result = await aiApiClient.getChatHistory(mockToken);

            // Assert
            expect(result.data).toEqual(mockHistory);
            expect(result.statusCode).toBe(200);
        });

        it('should return the error object on failed response', async () => {
             // Arrange
            const mockErrorResponse: ApiResponse<ChatHistoryApiResponse> = {
                success: false,
                error: 'Failed to fetch history',
                statusCode: 401,
            };
            (mockApiClient.get as vi.Mock).mockResolvedValue(mockErrorResponse);

            // Act: Call with the mock token
            const result = await aiApiClient.getChatHistory(mockToken);

            // Assert
            expect(result.error).toBe('Failed to fetch history');
            expect(result.statusCode).toBe(401);
        });
    });

    // Tests for getChatWithMessages
    describe('getChatWithMessages', () => {
        const chatId = 'chat-abc-123';
        const mockToken = 'mock-jwt-token';
        const mockOrgId = 'org-xyz-789';
        const mockMessagesResponse: { chat: Chat, messages: ChatMessage[] } = {
            chat: { id: chatId, user_id: 'user-1', created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', organization_id: null, system_prompt_id: null, title: 'Test Chat' },
            messages: [{ id: 'msg-1', chat_id: chatId, user_id: 'user-1', role: 'user', content: 'Hello', created_at: '2023-01-01T00:00:00Z', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null }]
        };

        it('should return an error object if chatId is missing', async () => {
            const invalidChatId = ''; // Test with an empty or invalid chatId
            // Mock apiClient.get to ensure it's not called due to client-side validation
            (mockApiClient.get as vi.Mock).mockResolvedValue({ data: { chat: {} as Chat, messages: []} }); // Should not be reached

            // Act
            const result = await aiApiClient.getChatWithMessages(invalidChatId, mockToken);

            // Assert
            expect(result.error).toBeDefined();
            expect(result.error?.message).toEqual('Chat ID is required');
            expect(result.status).toBe(400); // Check status code from client-side validation
            expect(mockApiClient.get).not.toHaveBeenCalled(); // Verify apiClient.get was not called
        });

        it('should call apiClient.get with the correct endpoint including chatId when no orgId is provided', async () => {
            (mockApiClient.get as vi.Mock).mockResolvedValue({ data: mockMessagesResponse });

            // Act
            await aiApiClient.getChatWithMessages(chatId, mockToken);

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledWith(
                `chat-details/${chatId}`,
                { token: mockToken }
            );
        });

        it('should call apiClient.get with the correct endpoint including chatId and organizationId when provided', async () => {
            (mockApiClient.get as vi.Mock).mockResolvedValue({ data: mockMessagesResponse });

            // Act
            // @ts-expect-error - Temporarily ignore error until method signature is updated (already updated)
            await aiApiClient.getChatWithMessages(chatId, mockToken, mockOrgId);

            // Assert
            expect(mockApiClient.get).toHaveBeenCalledWith(
                `chat-details/${chatId}?organizationId=${mockOrgId}`,
                { token: mockToken }
            );
        });

        it('should return the chat and messages object on successful response', async () => {
            (mockApiClient.get as vi.Mock).mockResolvedValue({ data: mockMessagesResponse });

            // Act
            const result = await aiApiClient.getChatWithMessages(chatId, mockToken);

            // Assert
            expect(result.data).toEqual(mockMessagesResponse);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const errorResponse = { message: 'Failed to fetch messages' };
            (mockApiClient.get as vi.Mock).mockResolvedValue({ error: errorResponse });

            // Act
            const result = await aiApiClient.getChatWithMessages(chatId, mockToken);

            // Assert
            expect(result.error).toEqual(errorResponse);
            expect(result.data).toBeUndefined();
        });
    });
}); 