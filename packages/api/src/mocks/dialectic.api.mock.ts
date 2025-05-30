import { vi } from 'vitest';
import type { DialecticProject, CreateProjectPayload, ApiResponse, ContributionContentSignedUrlResponse } from '@paynless/types'; 

// --- Dialectic Client Mock Setup ---
export type MockDialecticApiClient = {
    listAvailableDomainTags: ReturnType<typeof vi.fn<[], Promise<ApiResponse<string[]>>>>;
    createProject: ReturnType<typeof vi.fn<[payload: CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>>;
    listProjects: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>>;
    getContributionContentSignedUrl: ReturnType<typeof vi.fn<[contributionId: string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>>;
};

// Typed vi.fn() calls
export const mockDialecticClientInstance: MockDialecticApiClient = {
    listAvailableDomainTags: vi.fn<[], Promise<ApiResponse<string[]>>>(),
    createProject: vi.fn<[CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>(),
    listProjects: vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>(),
    getContributionContentSignedUrl: vi.fn<[string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>(),
};

// Moved reset logic into its own function
export function resetMockDialecticClient(instance?: MockDialecticApiClient) {
  const clientToReset = instance || mockDialecticClientInstance;
  clientToReset.listAvailableDomainTags.mockReset();
  clientToReset.createProject.mockReset();
  clientToReset.listProjects.mockReset();
  clientToReset.getContributionContentSignedUrl.mockReset();
}

/**
 * Helper to get the current instance of the mock Dialectic client.
 */
export const getMockDialecticClient = (): MockDialecticApiClient => mockDialecticClientInstance;

