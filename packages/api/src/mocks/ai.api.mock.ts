import { vi } from 'vitest';
import type { AiApiClient } from '../ai.api';
import { AiProvider, SystemPrompt, ApiResponse } from '@paynless/types';

/**
 * Creates a reusable mock object for the AiApiClient, suitable for Vitest unit tests.
 * Provides vi.fn() implementations for all AiApiClient methods.
 *
 * @returns A mocked AiApiClient instance.
 */
export const createMockAiApiClient = (): AiApiClient => ({
    getAiProviders: vi.fn<[], Promise<ApiResponse<AiProvider[]>>>(),
    getSystemPrompts: vi.fn<[], Promise<ApiResponse<SystemPrompt[]>>>(),
    // Ensure all methods from the actual AiApiClient are mocked
});

/**
 * Resets all mock functions within a given mock AiApiClient instance.
 * Useful for cleaning up mocks between tests (e.g., in `beforeEach`).
 *
 * @param mockClient - The mock AiApiClient instance to reset.
 */
export const resetMockAiApiClient = (mockClient: AiApiClient) => {
    mockClient.getAiProviders.mockReset();
    mockClient.getSystemPrompts.mockReset();
};

// Optional: Export a default instance
// export const mockAiApiClient = createMockAiApiClient(); 