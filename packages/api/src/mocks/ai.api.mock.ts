import { vi, type Mock } from 'vitest';
import type { ApiClient } from '../apiClient';
import type {
    ChatMessage,
    IAiApiClient,
    SseChatCompleteEvent,
} from '@paynless/types';

/**
 * Defines the structure of a mocked AiApiClient, where each method
 * from IAiApiClient is replaced with a Vitest Mock.
 */
export type MockedAiApiClient = {
    [K in keyof IAiApiClient]: IAiApiClient[K] extends (...args: infer A) => Promise<any> 
        ? Mock<A, ReturnType<IAiApiClient[K]>> 
        : IAiApiClient[K]; // For non-function properties, if any (though AiApiClient only has methods)
};

/**
 * Creates a mock instance of AiApiClient with all its public methods implemented as Vitest mock functions.
 * The method signatures for vi.fn() should match the actual AiApiClient methods.
 */
export const createMockAiApiClient = (): MockedAiApiClient => ({
    getAiProviders: vi.fn() as Mock<Parameters<IAiApiClient['getAiProviders']>, ReturnType<IAiApiClient['getAiProviders']>>,
    getSystemPrompts: vi.fn() as Mock<Parameters<IAiApiClient['getSystemPrompts']>, ReturnType<IAiApiClient['getSystemPrompts']>>,
    sendChatMessage: vi.fn() as Mock<Parameters<IAiApiClient['sendChatMessage']>, ReturnType<IAiApiClient['sendChatMessage']>>,
    getChatHistory: vi.fn() as Mock<Parameters<IAiApiClient['getChatHistory']>, ReturnType<IAiApiClient['getChatHistory']>>,
    getChatWithMessages: vi.fn() as Mock<Parameters<IAiApiClient['getChatWithMessages']>, ReturnType<IAiApiClient['getChatWithMessages']>>,
    deleteChat: vi.fn() as Mock<Parameters<IAiApiClient['deleteChat']>, ReturnType<IAiApiClient['deleteChat']>>,
    estimateTokens: vi.fn() as Mock<Parameters<IAiApiClient['estimateTokens']>, ReturnType<IAiApiClient['estimateTokens']>>,
    // Cast the entire object to MockedAiApiClient to satisfy the type.
    // This is safe because we are manually constructing the object to match the MockedAiApiClient structure.
}) as unknown as MockedAiApiClient; // Keep as unknown as MockedAiApiClient for the overall object cast

/**
 * Resets all mock functions on the provided mock AI API client instance.
 */
export const resetMockAiApiClient = (mockClient: MockedAiApiClient) => {
    // Iterate over the keys of the mockClient and reset if it's a mock function
    // This is more robust if methods are added/removed from IAiApiClient
    for (const key in mockClient) {
        if (typeof mockClient[key as keyof MockedAiApiClient] === 'function' && 'mockReset' in mockClient[key as keyof MockedAiApiClient]) {
            (mockClient[key as keyof MockedAiApiClient] as Mock<any[], any>).mockReset();
        }
    }
};

// Optional: Export a default instance
// export const mockAiApiClient = createMockAiApiClient();

export const streamingTestBaseUrl = 'http://mock-functions.api/v1';

/**
 * Minimal ApiClient for streaming tests: only getBaseUrl is exercised by AiApiClient.sendStreamingChatMessage.
 */
export function createStreamingTestApiClient(): ApiClient {
    return {
        getBaseUrl: vi.fn().mockReturnValue(streamingTestBaseUrl),
        getFunctionsUrl: vi.fn().mockReturnValue(streamingTestBaseUrl),
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        getSupabaseClient: vi.fn(),
    } as unknown as ApiClient;
}

/**
 * Full chat_messages row shape for SSE chat_complete contract tests (includes is_active_in_thread).
 */
export const streamingContractFullAssistantMessage: ChatMessage = {
    id: 'asst-stream-1',
    chat_id: 'chat-stream-1',
    role: 'assistant',
    content: 'Hello',
    user_id: null,
    ai_provider_id: 'provider-1',
    system_prompt_id: 'prompt-1',
    token_usage: null,
    created_at: '2024-01-01T12:00:00.000Z',
    updated_at: '2024-01-01T12:00:00.000Z',
    is_active_in_thread: true,
    error_type: null,
    response_to_message_id: null,
};

export function sseWireFromDataLines(payloads: readonly object[]): string {
    return payloads
        .map((payload) => `data: ${JSON.stringify(payload)}\n`)
        .join('');
}

export const streamingContractSseWire: string = sseWireFromDataLines([
    {
        type: 'chat_start',
        chatId: 'chat-stream-1',
        timestamp: '2024-01-01T12:00:00.000Z',
    },
    {
        type: 'content_chunk',
        content: 'Hel',
        assistantMessageId: streamingContractFullAssistantMessage.id,
        timestamp: '2024-01-01T12:00:00.000Z',
    },
    {
        type: 'chat_complete',
        assistantMessage: streamingContractFullAssistantMessage,
        finish_reason: null,
        timestamp: '2024-01-01T12:00:01.000Z',
    },
]);

export function createMockFetchForSseWire(sseWireBody: string): typeof fetch {
    const mockFetch: typeof fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode(sseWireBody));
                        controller.close();
                    },
                }),
                { status: 200, statusText: 'OK' },
            ),
        );
    });
    return mockFetch;
}

/**
 * Compile-time contract hook: a value is only accepted if it satisfies SseChatCompleteEvent (including full ChatMessage).
 */
export function contractAcceptsSseChatCompleteEvent(payload: SseChatCompleteEvent): void {
    void payload;
}