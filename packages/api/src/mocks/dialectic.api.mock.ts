import { vi } from 'vitest';
import type { 
    DialecticProject, 
    CreateProjectPayload, 
    ApiResponse, 
    GetContributionContentDataResponse,
    StartSessionPayload, 
    DialecticSession, 
    AIModelCatalogEntry,
    DomainDescriptor,
    UpdateProjectDomainPayload,
    DomainOverlayDescriptor,
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
    DialecticProcessTemplate,
    UpdateSessionModelsPayload,
} from '@paynless/types'; 

// --- Dialectic Client Mock Setup ---
export type MockDialecticApiClient = {
    listAvailableDomains: ReturnType<typeof vi.fn<[], Promise<ApiResponse<{ data: DomainDescriptor[] }>>>>;
    listAvailableDomainOverlays: ReturnType<typeof vi.fn<[payload: { stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>>;
    createProject: ReturnType<typeof vi.fn<[payload: CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>>;
    listProjects: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>>;
    getContributionContentData: ReturnType<typeof vi.fn<[contributionId: string], Promise<ApiResponse<GetContributionContentDataResponse | null>>>>;
    startSession: ReturnType<typeof vi.fn<[payload: StartSessionPayload], Promise<ApiResponse<DialecticSession>>>>;
    getProjectDetails: ReturnType<typeof vi.fn<[projectId: string], Promise<ApiResponse<DialecticProject>>>>;
    listModelCatalog: ReturnType<typeof vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>>;
    updateProjectDomain: ReturnType<typeof vi.fn<[payload: UpdateProjectDomainPayload], Promise<ApiResponse<DialecticProject>>>>;
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
    fetchProcessTemplate: ReturnType<typeof vi.fn<[templateId: string], Promise<ApiResponse<DialecticProcessTemplate>>>>;
    updateSessionModels: ReturnType<typeof vi.fn<[payload: UpdateSessionModelsPayload], Promise<ApiResponse<DialecticSession>>>>;
    getSessionDetails: ReturnType<typeof vi.fn<[sessionId: string], Promise<ApiResponse<DialecticSession>>>>;
};

// Factory function to create a new mock instance
export function createMockDialecticClient(): MockDialecticApiClient {
    return {
        listAvailableDomains: vi.fn<[], Promise<ApiResponse<{ data: DomainDescriptor[] }>>>(),
        listAvailableDomainOverlays: vi.fn<[{ stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>(),
        createProject: vi.fn<[CreateProjectPayload], Promise<ApiResponse<DialecticProject>>>(),
        listProjects: vi.fn<[], Promise<ApiResponse<DialecticProject[]>>>(),
        getContributionContentData: vi.fn<[string], Promise<ApiResponse<GetContributionContentDataResponse | null>>>(),
        startSession: vi.fn<[StartSessionPayload], Promise<ApiResponse<DialecticSession>>>(),
        getProjectDetails: vi.fn<[string], Promise<ApiResponse<DialecticProject>>>(),
        listModelCatalog: vi.fn<[], Promise<ApiResponse<AIModelCatalogEntry[]>>>(),
        updateProjectDomain: vi.fn<[UpdateProjectDomainPayload], Promise<ApiResponse<DialecticProject>>>(),
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
        fetchProcessTemplate: vi.fn<[string], Promise<ApiResponse<DialecticProcessTemplate>>>(),
        updateSessionModels: vi.fn<[UpdateSessionModelsPayload], Promise<ApiResponse<DialecticSession>>>(),
        getSessionDetails: vi.fn<[string], Promise<ApiResponse<DialecticSession>>>(),
    };
}

export function resetMockDialecticClient(instance: MockDialecticApiClient) {
    for (const key in instance) {
        const prop = instance[key as keyof MockDialecticApiClient];
        if (typeof prop === 'function' && 'mockReset' in prop) {
            (prop as ReturnType<typeof vi.fn>).mockReset();
        }
    }
}
