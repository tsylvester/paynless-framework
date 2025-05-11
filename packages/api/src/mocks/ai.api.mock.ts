import { vi, type Mock } from 'vitest';
// Remove direct import of AiApiClient class type if no longer needed here
// import type { AiApiClient } from '../ai.api'; 
import type { 
    IAiApiClient // Import the contract interface
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