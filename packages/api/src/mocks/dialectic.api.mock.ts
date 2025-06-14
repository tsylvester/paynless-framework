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
    UpdateProjectDomainPayload,
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
    GetProjectResourceContentResponse,
    DialecticDomain,
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
    updateProjectDomain: ReturnType<typeof vi.fn<[payload: UpdateProjectDomainPayload], Promise<ApiResponse<DialecticProject>>>>;
    uploadProjectResourceFile: ReturnType<typeof vi.fn<[payload: UploadProjectResourceFilePayload], Promise<ApiResponse<DialecticProjectResource>>>>;
    deleteProject: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<void>>>>;
    cloneProject: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<DialecticProject>>>>;
    exportProject: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<{ export_url: string }>>>>;
    updateDialecticProjectInitialPrompt: ReturnType<typeof vi.fn<[payload: UpdateProjectInitialPromptPayload], Promise<ApiResponse<DialecticProject>>>>;
    generateContributions: ReturnType<typeof vi.fn<[payload: GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>>;
    getIterationInitialPromptContent: ReturnType<typeof vi.fn<[payload: GetIterationInitialPromptPayload], Promise<ApiResponse<IterationInitialPromptData>>>>;
    submitStageResponses: ReturnType<typeof vi.fn<[payload: SubmitStageResponsesPayload], Promise<ApiResponse<SubmitStageResponsesResponse>>>>;
    saveContributionEdit: ReturnType<typeof vi.fn<[payload: SaveContributionEditPayload], Promise<ApiResponse<DialecticContribution>>>>;
    getProjectResourceContent: ReturnType<typeof vi.fn<[payload: GetProjectResourceContentPayload], Promise<ApiResponse<GetProjectResourceContentResponse>>>>;
    listDomains: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticDomain[]>>>>;
};

// Factory function to create a new mock instance
export function createMockDialecticClient(): MockDialecticApiClient {
    return {
        listAvailableDomainTags: vi.fn<[], Promise<ApiResponse<{ data: DomainTagDescriptor[] }>>>(),
        listAvailableDomainOverlays: vi.fn<[{ stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>(),
        createProject: vi.fn<[CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>(),
        listProjects: vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>(),
        getContributionContentSignedUrl: vi.fn<[string], Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>>(),
        startSession: vi.fn<[StartSessionPayload], Promise<ApiResponse<DialecticSession>>>(),
        getProjectDetails: vi.fn<[string], Promise<ApiResponse<DialecticProject>>>(),
        listModelCatalog: vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>(),
        updateProjectDomain: vi.fn<[UpdateProjectDomainPayload], Promise<ApiResponse<DialecticProject>>>(),
        uploadProjectResourceFile: vi.fn<[UploadProjectResourceFilePayload], Promise<ApiResponse<DialecticProjectResource>>>(),
        deleteProject: vi.fn<[string], Promise<ApiResponse<void>>>(),
        cloneProject: vi.fn<[string], Promise<ApiResponse<DialecticProject>>>(),
        exportProject: vi.fn<[string], Promise<ApiResponse<{ export_url: string }>>>(),
        updateDialecticProjectInitialPrompt: vi.fn<[UpdateProjectInitialPromptPayload], Promise<ApiResponse<DialecticProject>>>(),
        generateContributions: vi.fn<[GenerateContributionsPayload], Promise<ApiResponse<GenerateContributionsResponse>>>(),
        getIterationInitialPromptContent: vi.fn<[GetIterationInitialPromptPayload], Promise<ApiResponse<IterationInitialPromptData>>>(),
        submitStageResponses: vi.fn<[SubmitStageResponsesPayload], Promise<ApiResponse<SubmitStageResponsesResponse>>>(),
        saveContributionEdit: vi.fn<[SaveContributionEditPayload], Promise<ApiResponse<DialecticContribution>>>(),
        getProjectResourceContent: vi.fn<[GetProjectResourceContentPayload], Promise<ApiResponse<GetProjectResourceContentResponse>>>(),
        listDomains: vi.fn<[], Promise<ApiResponse<DialecticDomain[]>>>(),
    };
}
