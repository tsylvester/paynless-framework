import { vi } from 'vitest';
import type { 
    DialecticProject, 
    ApiResponse, 
    DialecticStageRecipe,
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
    SaveContributionEditSuccessResponse,
    EditedDocumentResource,
    GetProjectResourceContentPayload,
    GetProjectResourceContentResponse,
    DialecticDomain,
    DialecticProcessTemplate,
    UpdateSessionModelsPayload,
    GetSessionDetailsResponse,
    GetStageDocumentFeedbackPayload,
    StageDocumentFeedback,
    SubmitStageDocumentFeedbackPayload,
    ListStageDocumentsPayload,
    ListStageDocumentsResponse,
    GetAllStageProgressPayload,
    GetAllStageProgressResponse,
} from '@paynless/types'; 

// --- Dialectic Client Mock Setup ---
export type MockDialecticApiClient = {
    listAvailableDomains: ReturnType<typeof vi.fn<[], Promise<ApiResponse<{ data: DomainDescriptor[] }>>>>;
    listAvailableDomainOverlays: ReturnType<typeof vi.fn<[payload: { stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>>;
    fetchStageRecipe: ReturnType<typeof vi.fn<[stageSlug: string], Promise<ApiResponse<DialecticStageRecipe>>>>;
    createProject: ReturnType<typeof vi.fn<[payload: FormData], Promise<ApiResponse<DialecticProject>>>>;
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
    saveContributionEdit: ReturnType<typeof vi.fn<[payload: SaveContributionEditPayload], Promise<ApiResponse<SaveContributionEditSuccessResponse>>>>;
    getProjectResourceContent: ReturnType<typeof vi.fn<[payload: GetProjectResourceContentPayload], Promise<ApiResponse<GetProjectResourceContentResponse>>>>;
    listDomains: ReturnType<typeof vi.fn<[], Promise<ApiResponse<DialecticDomain[]>>>>;
    fetchProcessTemplate: ReturnType<typeof vi.fn<[templateId: string], Promise<ApiResponse<DialecticProcessTemplate>>>>;
    updateSessionModels: ReturnType<typeof vi.fn<[payload: UpdateSessionModelsPayload], Promise<ApiResponse<DialecticSession>>>>;
    getSessionDetails: ReturnType<typeof vi.fn<[sessionId: string], Promise<ApiResponse<GetSessionDetailsResponse>>>>;
    getStageDocumentFeedback: ReturnType<typeof vi.fn<[payload: GetStageDocumentFeedbackPayload], Promise<ApiResponse<StageDocumentFeedback[]>>>>;
    submitStageDocumentFeedback: ReturnType<typeof vi.fn<[payload: SubmitStageDocumentFeedbackPayload], Promise<ApiResponse<{ success: boolean }>>>>;
    listStageDocuments: ReturnType<typeof vi.fn<[payload: ListStageDocumentsPayload], Promise<ApiResponse<ListStageDocumentsResponse>>>>;
    getAllStageProgress: ReturnType<typeof vi.fn<[payload: GetAllStageProgressPayload], Promise<ApiResponse<GetAllStageProgressResponse>>>>;
};

// Factory function to create a new mock instance
export function createMockDialecticClient(): MockDialecticApiClient {
    return {
        listAvailableDomains: vi.fn<[], Promise<ApiResponse<{ data: DomainDescriptor[] }>>>(),
        listAvailableDomainOverlays: vi.fn<[{ stageAssociation: string }], Promise<ApiResponse<DomainOverlayDescriptor[]>>>(),
        fetchStageRecipe: vi.fn<[string], Promise<ApiResponse<DialecticStageRecipe>>>(),
        createProject: vi.fn<[FormData], Promise<ApiResponse<DialecticProject>>>(),
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
        saveContributionEdit: vi.fn<[SaveContributionEditPayload], Promise<ApiResponse<SaveContributionEditSuccessResponse>>>(),
        getProjectResourceContent: vi.fn<[GetProjectResourceContentPayload], Promise<ApiResponse<GetProjectResourceContentResponse>>>(),
        listDomains: vi.fn<[], Promise<ApiResponse<DialecticDomain[]>>>(),
        fetchProcessTemplate: vi.fn<[string], Promise<ApiResponse<DialecticProcessTemplate>>>(),
        updateSessionModels: vi.fn<[UpdateSessionModelsPayload], Promise<ApiResponse<DialecticSession>>>(),
        getSessionDetails: vi.fn<[string], Promise<ApiResponse<GetSessionDetailsResponse>>>(),
        getStageDocumentFeedback: vi.fn<[GetStageDocumentFeedbackPayload], Promise<ApiResponse<StageDocumentFeedback[]>>>(),
        submitStageDocumentFeedback: vi.fn<[SubmitStageDocumentFeedbackPayload], Promise<ApiResponse<{ success: boolean }>>>(),
        listStageDocuments: vi.fn<[ListStageDocumentsPayload], Promise<ApiResponse<ListStageDocumentsResponse>>>(),
        getAllStageProgress: vi.fn<[GetAllStageProgressPayload], Promise<ApiResponse<GetAllStageProgressResponse>>>(),
    };
}

export function resetMockDialecticClient(instance: MockDialecticApiClient) {
    for (const key in instance) {
        const prop = instance[key as keyof MockDialecticApiClient];
        if (typeof prop === 'function' && 'mockReset' in prop) {
            (prop).mockReset();
        }
    }
}

/**
 * Creates a realistic EditedDocumentResource mock object.
 * Helper builder for constructing default return objects that match the dialectic_project_resources row shape.
 */
export function createMockEditedDocumentResource(
    overrides?: Partial<EditedDocumentResource>
): EditedDocumentResource {
    const now = new Date().toISOString();
    return {
        id: `resource-edit-${Date.now()}`,
        resource_type: 'rendered_document',
        project_id: 'proj-123',
        session_id: 'sess-456',
        stage_slug: 'thesis',
        iteration_number: 1,
        document_key: 'feature_spec',
        source_contribution_id: 'contrib-original',
        storage_bucket: 'project-resources',
        storage_path: `edits/user-abc/resource-edit-${Date.now()}.md`,
        file_name: `resource-edit-${Date.now()}.md`,
        mime_type: 'text/markdown',
        size_bytes: 1024,
        created_at: now,
        updated_at: now,
        ...overrides,
    };
}

/**
 * Creates a realistic SaveContributionEditSuccessResponse mock object.
 * Helper builder that constructs default return objects with realistic EditedDocumentResource payloads.
 */
export function createMockSaveContributionEditSuccessResponse(
    resourceOverrides?: Partial<EditedDocumentResource>
): SaveContributionEditSuccessResponse {
    const resource = createMockEditedDocumentResource(resourceOverrides);
    return {
        resource,
        sourceContributionId: resource.source_contribution_id ?? 'contrib-original',
    };
}
