import { vi } from 'vitest';
import type { 
    DialecticProject, 
    CreateProjectPayload, 
    ApiResponse, 
    ContributionContentSignedUrlResponse, 
    StartSessionPayload, 
    DialecticSession, 
    AIModelCatalogEntry,
    DomainTagDescriptor,
    UpdateProjectDomainTagPayload
} from '@paynless/types'; 

// --- Dialectic Client Mock Setup ---
export type MockDialecticApiClient = {
    listAvailableDomainTags: ReturnType<typeof vi.fn<[], Promise<ApiResponse<{ data: DomainTagDescriptor[] }>>>>;
    createProject: ReturnType<typeof vi.fn<[payload: CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>>;
    listProjects: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>>;
    getContributionContentSignedUrl: ReturnType<typeof vi.fn<[contributionId: string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>>;
    startSession: ReturnType<typeof vi.fn<[payload: StartSessionPayload], Promise<ApiResponse<DialecticSession>>>>;
    getProjectDetails: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<DialecticProject>>>>;
    listModelCatalog: ReturnType<typeof vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>>;
    updateProjectDomainTag: ReturnType<typeof vi.fn<[payload: UpdateProjectDomainTagPayload], Promise<ApiResponse<DialecticProject>>>>;
};

// Typed vi.fn() calls
export const mockDialecticClientInstance: MockDialecticApiClient = {
    listAvailableDomainTags: vi.fn<[], Promise<ApiResponse<{ data: DomainTagDescriptor[] }>>>(),
    createProject: vi.fn<[CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>(),
    listProjects: vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>(),
    getContributionContentSignedUrl: vi.fn<[string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>(),
    startSession: vi.fn<[StartSessionPayload], Promise<ApiResponse<DialecticSession>>>(),
    getProjectDetails: vi.fn<[string], Promise<ApiResponse<DialecticProject>>>(),
    listModelCatalog: vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>(),
    updateProjectDomainTag: vi.fn<[UpdateProjectDomainTagPayload], Promise<ApiResponse<DialecticProject>>>(),
};

// Moved reset logic into its own function
export function resetMockDialecticClient(instance?: MockDialecticApiClient) {
  const clientToReset = instance || mockDialecticClientInstance;
  clientToReset.listAvailableDomainTags.mockReset();
  clientToReset.createProject.mockReset();
  clientToReset.listProjects.mockReset();
  clientToReset.getContributionContentSignedUrl.mockReset();
  clientToReset.startSession.mockReset();
  clientToReset.getProjectDetails.mockReset();
  clientToReset.listModelCatalog.mockReset();
  clientToReset.updateProjectDomainTag.mockReset();
}

/**
 * Helper to get the current instance of the mock Dialectic client.
 */
export const getMockDialecticClient = (): MockDialecticApiClient => mockDialecticClientInstance;

