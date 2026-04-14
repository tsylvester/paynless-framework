import { vi, type Mock } from 'vitest';
import type { ChatApiRequest, FetchOptions, IAiApiClient } from '@paynless/types';

/**
 * Defines the structure of a mocked AiApiClient, where each method
 * from IAiApiClient is replaced with a Vitest Mock.
 */
export type MockedAiApiClient = {
    [K in keyof IAiApiClient]: IAiApiClient[K] extends (...args: infer A) => infer R
        ? Mock<A, R>
        : IAiApiClient[K];
};

const mockAiApiClientKeys: (keyof IAiApiClient)[] = [
    'getAiProviders',
    'getSystemPrompts',
    'sendChatMessage',
    'sendStreamingChatMessage',
    'getChatHistory',
    'getChatWithMessages',
    'deleteChat',
    'estimateTokens',
];

/**
 * Creates a mock instance of AiApiClient with all its public methods implemented as Vitest mock functions.
 * The method signatures for vi.fn() should match the actual AiApiClient methods.
 */
export const createMockAiApiClient = (): MockedAiApiClient => {
    const client: MockedAiApiClient = {
        getAiProviders: vi.fn<Parameters<IAiApiClient['getAiProviders']>, ReturnType<IAiApiClient['getAiProviders']>>(),
        getSystemPrompts: vi.fn<Parameters<IAiApiClient['getSystemPrompts']>, ReturnType<IAiApiClient['getSystemPrompts']>>(),
        sendChatMessage: vi.fn<Parameters<IAiApiClient['sendChatMessage']>, ReturnType<IAiApiClient['sendChatMessage']>>(),
        sendStreamingChatMessage: vi.fn<Parameters<IAiApiClient['sendStreamingChatMessage']>, ReturnType<IAiApiClient['sendStreamingChatMessage']>>(),
        getChatHistory: vi.fn<Parameters<IAiApiClient['getChatHistory']>, ReturnType<IAiApiClient['getChatHistory']>>(),
        getChatWithMessages: vi.fn<Parameters<IAiApiClient['getChatWithMessages']>, ReturnType<IAiApiClient['getChatWithMessages']>>(),
        deleteChat: vi.fn<Parameters<IAiApiClient['deleteChat']>, ReturnType<IAiApiClient['deleteChat']>>(),
        estimateTokens: vi.fn<Parameters<IAiApiClient['estimateTokens']>, ReturnType<IAiApiClient['estimateTokens']>>(),
    };
    return client;
};

/**
 * Resets all mock functions on the provided mock AI API client instance.
 */
export const resetMockAiApiClient = (mockClient: MockedAiApiClient) => {
    for (const key of mockAiApiClientKeys) {
        const fn = mockClient[key];
        if (typeof fn === 'function' && 'mockReset' in fn) {
            fn.mockReset();
        }
    }
};

// Optional: Export a default instance
// export const mockAiApiClient = createMockAiApiClient();

export const streamingTestBaseUrl = 'http://mock-functions.api/v1';

/**
 * Default `ChatApiRequest` for `sendStreamingChatMessage` tests; override any field (including explicit `undefined` where applicable).
 */
export function mockChatApiRequestStreaming(overrides?: Partial<ChatApiRequest>): ChatApiRequest {
    const data: ChatApiRequest = {
        message: 'streaming test message',
        providerId: 'provider-1',
        promptId: 'prompt-1',
    };
    if (overrides === undefined) {
        return data;
    }
    return { ...data, ...overrides };
}

/**
 * Default `FetchOptions` for `sendStreamingChatMessage` tests; override any field.
 */
export function mockFetchOptionsStreaming(overrides?: Partial<FetchOptions>): FetchOptions {
    const data: FetchOptions = {
        token: 'streaming-test-token',
    };
    if (overrides === undefined) {
        return data;
    }
    return { ...data, ...overrides };
}
