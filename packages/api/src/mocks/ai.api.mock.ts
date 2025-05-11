import { vi, type Mock } from 'vitest';
import type { AiApiClient } from '../ai.api';
import type { ApiResponse, AiProvider, SystemPrompt, ChatMessage, ChatApiRequest, Chat, FetchOptions } from '@paynless/types';

/**
 * Creates a mock instance of AiApiClient with all its public methods implemented as Vitest mock functions.
 * The method signatures for vi.fn() should match the actual AiApiClient methods.
 */
export const createMockAiApiClient = (): AiApiClient => ({
    getAiProviders: vi.fn() as Mock<[string?], Promise<ApiResponse<AiProvider[]>>>,
    getSystemPrompts: vi.fn() as Mock<[string?], Promise<ApiResponse<SystemPrompt[]>>>,
    sendChatMessage: vi.fn() as Mock<[ChatApiRequest, FetchOptions?], Promise<ApiResponse<ChatMessage>>>,
    getChatHistory: vi.fn() as Mock<[string, (string | null | undefined)?], Promise<ApiResponse<Chat[]>>>,
    getChatWithMessages: vi.fn() as Mock<[string, string, (string | null | undefined)?], Promise<ApiResponse<{ chat: Chat, messages: ChatMessage[] }>>>,
    deleteChat: vi.fn() as Mock<[string, string, (string | null | undefined)?], Promise<ApiResponse<void>>>,
    // Cast the entire object to AiApiClient to satisfy the type, 
    // acknowledging that private members are not part of this mock object structure
    // because the class constructor itself is typically mocked in tests.
}) as unknown as AiApiClient;

/**
 * Resets all mock functions on the provided mock AI API client instance.
 */
export const resetMockAiApiClient = (mockClient: AiApiClient) => {
    (mockClient.getAiProviders as Mock).mockReset();
    (mockClient.getSystemPrompts as Mock).mockReset();
    (mockClient.sendChatMessage as Mock).mockReset();
    (mockClient.getChatHistory as Mock).mockReset();
    (mockClient.getChatWithMessages as Mock).mockReset();
    (mockClient.deleteChat as Mock).mockReset();
};

// Optional: Export a default instance
// export const mockAiApiClient = createMockAiApiClient(); 