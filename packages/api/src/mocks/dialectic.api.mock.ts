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
    UpdateProjectDomainTagPayload,
    DomainOverlayDescriptor,
    UploadProjectResourceFilePayload,
    DialecticProjectResource,
    UpdateProjectInitialPromptPayload,
    GenerateContributionsPayload,
    GenerateContributionsResponse,
    GetIterationInitialPromptPayload,
    IterationInitialPromptData,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    SaveContributionEditPayload,
    DialecticContribution,
    GetProjectResourceContentPayload,
    GetProjectResourceContentResponse
} from '@paynless/types'; 

// --- Dialectic Client Mock Setup ---
export type MockDialecticApiClient = {
    listAvailableDomainTags: ReturnType<typeof vi.fn<[], Promise<ApiResponse<{ data: DomainTagDescriptor[] }>>>>;
    listAvailableDomainOverlays: ReturnType<typeof vi.fn<[payload: { stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>>;
    createProject: ReturnType<typeof vi.fn<[payload: CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>>;
    listProjects: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>>;
    getContributionContentSignedUrl: ReturnType<typeof vi.fn<[contributionId: string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>>;
    startSession: ReturnType<typeof vi.fn<[payload: StartSessionPayload], Promise<ApiResponse<DialecticSession>>>>;
    getProjectDetails: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<DialecticProject>>>>;
    listModelCatalog: ReturnType<typeof vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>>;
    updateProjectDomainTag: ReturnType<typeof vi.fn<[payload: UpdateProjectDomainTagPayload], Promise<ApiResponse<DialecticProject>>>>;
    uploadProjectResourceFile: ReturnType<typeof vi.fn<[payload: UploadProjectResourceFilePayload], Promise<ApiResponse<DialecticProjectResource>>>>;
    deleteProject: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<void>>>>;
    cloneProject: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<DialecticProject>>>>;
    exportProject: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<{ export_url: string }>>>>;
    updateDialecticProjectInitialPrompt: ReturnType<typeof vi.fn<[payload: UpdateProjectInitialPromptPayload], Promise<ApiResponse<DialecticProject>>>>;
    generateContributions: ReturnType<typeof vi.fn<[payload: GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>>;
    getIterationInitialPromptContent: ReturnType<typeof vi.fn<[payload: GetIterationInitialPromptPayload], Promise<ApiResponse<IterationInitialPromptData>>>>;
    submitStageResponses: ReturnType<typeof vi.fn<[payload: SubmitStageResponsesPayload], Promise<ApiResponse<SubmitStageResponsesResponse>>>>;
    updateContributionContent: ReturnType<typeof vi.fn<[payload: SaveContributionEditPayload], Promise<ApiResponse<DialecticContribution>>>>;
    getProjectResourceContent: ReturnType<typeof vi.fn<[payload: GetProjectResourceContentPayload], Promise<ApiResponse<GetProjectResourceContentResponse>>>>;
};

// Typed vi.fn() calls
export const mockDialecticClientInstance: MockDialecticApiClient = {
    listAvailableDomainTags: vi.fn<[], Promise<ApiResponse<{ data: DomainTagDescriptor[] }>>>(),
    listAvailableDomainOverlays: vi.fn<[{ stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>(),
    createProject: vi.fn<[CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>(),
    listProjects: vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>(),
    getContributionContentSignedUrl: vi.fn<[string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>(),
    startSession: vi.fn<[StartSessionPayload], Promise<ApiResponse<DialecticSession>>>(),
    getProjectDetails: vi.fn<[string], Promise<ApiResponse<DialecticProject>>>(),
    listModelCatalog: vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>(),
    updateProjectDomainTag: vi.fn<[UpdateProjectDomainTagPayload], Promise<ApiResponse<DialecticProject>>>(),
    uploadProjectResourceFile: vi.fn<[UploadProjectResourceFilePayload], Promise<ApiResponse<DialecticProjectResource>>>(),
    deleteProject: vi.fn<[string], Promise<ApiResponse<void>>>(),
    cloneProject: vi.fn<[string], Promise<ApiResponse<DialecticProject>>>(),
    exportProject: vi.fn<[string], Promise<ApiResponse<{ export_url: string }>>>(),
    updateDialecticProjectInitialPrompt: vi.fn<[UpdateProjectInitialPromptPayload], Promise<ApiResponse<DialecticProject>>>(),
    generateContributions: vi.fn<[GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>(),
    getIterationInitialPromptContent: vi.fn<[GetIterationInitialPromptPayload], Promise<ApiResponse<IterationInitialPromptData>>>(),
    submitStageResponses: vi.fn<[SubmitStageResponsesPayload], Promise<ApiResponse<SubmitStageResponsesResponse>>>(),
    updateContributionContent: vi.fn<[SaveContributionEditPayload], Promise<ApiResponse<DialecticContribution>>>(),
    getProjectResourceContent: vi.fn<[GetProjectResourceContentPayload], Promise<ApiResponse<GetProjectResourceContentResponse>>>(),
};

// Moved reset logic into its own function
export function resetMockDialecticClient(instance?: MockDialecticApiClient) {
  const clientToReset = instance || mockDialecticClientInstance;
  clientToReset.listAvailableDomainTags.mockReset();
  clientToReset.listAvailableDomainOverlays.mockReset();
  clientToReset.createProject.mockReset();
  clientToReset.listProjects.mockReset();
  clientToReset.getContributionContentSignedUrl.mockReset();
  clientToReset.startSession.mockReset();
  clientToReset.getProjectDetails.mockReset();
  clientToReset.listModelCatalog.mockReset();
  clientToReset.updateProjectDomainTag.mockReset();
  clientToReset.uploadProjectResourceFile.mockReset();
  clientToReset.deleteProject.mockReset();
  clientToReset.cloneProject.mockReset();
  clientToReset.exportProject.mockReset();
  clientToReset.updateDialecticProjectInitialPrompt.mockReset();
  clientToReset.generateContributions.mockReset();
  clientToReset.getIterationInitialPromptContent.mockReset();
  clientToReset.submitStageResponses.mockReset();
  clientToReset.updateContributionContent.mockReset();
  clientToReset.getProjectResourceContent.mockReset();
}

/**
 * Helper to get the current instance of the mock Dialectic client.
 */
export const getMockDialecticClient = (): MockDialecticApiClient => mockDialecticClientInstance;

/**
 * Helper to reset all mocks in the Dialectic client.
 * If you only need to reset the Dialectic client, prefer `resetMockDialecticClient`.
 * This is typically used in a global `beforeEach` or `afterEach`.
 */
export function resetAllDialecticMocks() {
    resetMockDialecticClient(mockDialecticClientInstance);
}

