import { spy, type Spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import type {
    DialecticProject,
    CreateProjectPayload,
    // ApiResponse is not a generic type here; responses are specific
    GetContributionContentSignedUrlPayload, // For the payload, actual response type will be simpler
    StartSessionPayload,
    DialecticSession,
    AIModelCatalogEntry,
    DomainOverlayDescriptor,
    UploadProjectResourceFilePayload,
    DialecticProjectResource,
    GenerateContributionsPayload, // Corrected name
    GenerateContributionsSuccessResponse, // Corrected name
    SubmitStageResponsesPayload, 
    SubmitStageResponsesResponse, 
    SaveContributionEditPayload,
    DialecticContribution,
    // DomainDescriptor is not from dialectic.interface.ts, used in ActionHandlers
    UpdateProjectDomainPayload,
    GetProjectResourceContentPayload,
    GetProjectResourceContentResponse,
    // CloneProjectResult is not from dialectic.interface.ts, used in ActionHandlers
    DialecticStage // For listAvailableDomains payload
} from '../dialectic-service/dialectic.interface.ts';

// 1. Define Function Signature Types
type CreateProjectFn = (payload: FormData | CreateProjectPayload) => Promise<DialecticProject>;
type StartSessionFn = (payload: StartSessionPayload) => Promise<DialecticSession>;
type GenerateContributionsFn = (payload: GenerateContributionsPayload) => Promise<GenerateContributionsSuccessResponse>;
type SubmitStageResponsesFn = (payload: SubmitStageResponsesPayload) => Promise<SubmitStageResponsesResponse>;
type SaveContributionEditFn = (payload: SaveContributionEditPayload) => Promise<DialecticContribution>;
type GetProjectDetailsFn = (projectId: string) => Promise<DialecticProject | null>;
type ListProjectsFn = () => Promise<DialecticProject[]>;
type ListModelCatalogFn = () => Promise<AIModelCatalogEntry[]>;
type ListAvailableDomainOverlaysFn = (payload: { stageAssociation: string }) => Promise<DomainOverlayDescriptor[]>;
type GetContributionContentSignedUrlLogicFn = (contributionId: string) => Promise<{ data?: { signedUrl: string }; error?: any }>;
type HandleInitialPromptUploadFn = (projectId: string, file: File) => Promise<DialecticProjectResource>;
type ListAvailableDomainsFn = (payload?: { stageAssociation?: DialecticStage }) => Promise<any[] | { error: any }>;
type UpdateProjectDomainFn = (payload: UpdateProjectDomainPayload) => Promise<{ data?: any; error?: any }>;
type CloneProjectFn = (originalProjectId: string, newProjectName?: string) => Promise<{ data: DialecticProject | null; error: any | null }>;
type DeleteProjectFn = (payload: { projectId: string }) => Promise<{ data?: null; error?: any }>;
type ExportProjectFn = (projectId: string) => Promise<{ data?: { export_url: string }; error?: any }>;
type GetProjectResourceContentFn = (payload: GetProjectResourceContentPayload) => Promise<{ data?: GetProjectResourceContentResponse; error?: any }>;

// 2. Define IDialecticService Interface (plain methods)
export interface IDialecticService {
    createProject: CreateProjectFn;
    startSession: StartSessionFn;
    generateContributions: GenerateContributionsFn;
    submitStageResponses: SubmitStageResponsesFn;
    saveContributionEdit: SaveContributionEditFn;
    getProjectDetails: GetProjectDetailsFn;
    listProjects: ListProjectsFn;
    listModelCatalog: ListModelCatalogFn;
    listAvailableDomainOverlays: ListAvailableDomainOverlaysFn;
    getContributionContentSignedUrlLogic: GetContributionContentSignedUrlLogicFn;
    handleInitialPromptUpload: HandleInitialPromptUploadFn;
    listAvailableDomains: ListAvailableDomainsFn;
    updateProjectDomain: UpdateProjectDomainFn;
    cloneProject: CloneProjectFn;
    deleteProject: DeleteProjectFn;
    exportProject: ExportProjectFn;
    getProjectResourceContent: GetProjectResourceContentFn;
}

// 3. Create a Dummy Implementation Class
class _DialecticServiceDummyImpl implements IDialecticService {
    async createProject(_payload: FormData | CreateProjectPayload): Promise<DialecticProject> { return undefined as any; }
    async startSession(_payload: StartSessionPayload): Promise<DialecticSession> { return undefined as any; }
    async generateContributions(_payload: GenerateContributionsPayload): Promise<GenerateContributionsSuccessResponse> { return undefined as any; }
    async submitStageResponses(_payload: SubmitStageResponsesPayload): Promise<SubmitStageResponsesResponse> { return undefined as any; }
    async saveContributionEdit(_payload: SaveContributionEditPayload): Promise<DialecticContribution> { return undefined as any; }
    async getProjectDetails(_projectId: string): Promise<DialecticProject | null> { return undefined as any; }
    async listProjects(): Promise<DialecticProject[]> { return undefined as any; }
    async listModelCatalog(): Promise<AIModelCatalogEntry[]> { return undefined as any; }
    async listAvailableDomainOverlays(_payload: { stageAssociation: string }): Promise<DomainOverlayDescriptor[]> { return undefined as any; }
    async getContributionContentSignedUrlLogic(_contributionId: string): Promise<{ data?: { signedUrl: string }; error?: any }> { return undefined as any; }
    async handleInitialPromptUpload(_projectId: string, _file: File): Promise<DialecticProjectResource> { return undefined as any; }
    async listAvailableDomains(_payload?: { stageAssociation?: DialecticStage }): Promise<any[] | { error: any }> { return undefined as any; }
    async updateProjectDomain(_payload: UpdateProjectDomainPayload): Promise<{ data?: any; error?: any }> { return undefined as any; }
    async cloneProject(_originalProjectId: string, _newProjectName?: string): Promise<{ data: DialecticProject | null; error: any | null }> { return undefined as any; }
    async deleteProject(_payload: { projectId: string }): Promise<{ data?: null; error?: any }> { return undefined as any; }
    async exportProject(_projectId: string): Promise<{ data?: { export_url: string }; error?: any }> { return undefined as any; }
    async getProjectResourceContent(_payload: GetProjectResourceContentPayload): Promise<{ data?: GetProjectResourceContentResponse; error?: any }> { return undefined as any; }
}

// 4. Define MockDialecticServiceSpies Type with explicit spy signatures
export type MockDialecticServiceSpies = {
    createProject: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.createProject>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.createProject>>;
    startSession: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.startSession>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.startSession>>;
    generateContributions: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.generateContributions>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.generateContributions>>;
    submitStageResponses: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.submitStageResponses>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.submitStageResponses>>;
    saveContributionEdit: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.saveContributionEdit>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.saveContributionEdit>>;
    getProjectDetails: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.getProjectDetails>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.getProjectDetails>>;
    listProjects: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.listProjects>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.listProjects>>;
    listModelCatalog: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.listModelCatalog>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.listModelCatalog>>;
    listAvailableDomainOverlays: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.listAvailableDomainOverlays>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.listAvailableDomainOverlays>>;
    getContributionContentSignedUrlLogic: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.getContributionContentSignedUrlLogic>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.getContributionContentSignedUrlLogic>>;
    handleInitialPromptUpload: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.handleInitialPromptUpload>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.handleInitialPromptUpload>>;
    listAvailableDomains: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.listAvailableDomains>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.listAvailableDomains>>;
    updateProjectDomain: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.updateProjectDomain>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.updateProjectDomain>>;
    cloneProject: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.cloneProject>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.cloneProject>>;
    deleteProject: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.deleteProject>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.deleteProject>>;
    exportProject: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.exportProject>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.exportProject>>;
    getProjectResourceContent: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.getProjectResourceContent>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.getProjectResourceContent>>;
};

// 5. createMockDialecticService Function
export function createMockDialecticService(): {
    service: _DialecticServiceDummyImpl; // Return the concrete type for direct modification
    spies: MockDialecticServiceSpies;
    resetAllMocks: () => void;
} {
    const dummyServiceInstance = new _DialecticServiceDummyImpl();
    
    const spiesInstance = {
        createProject: spy(dummyServiceInstance, "createProject"),
        startSession: spy(dummyServiceInstance, "startSession"),
        generateContributions: spy(dummyServiceInstance, "generateContributions"),
        submitStageResponses: spy(dummyServiceInstance, "submitStageResponses"),
        saveContributionEdit: spy(dummyServiceInstance, "saveContributionEdit"),
        getProjectDetails: spy(dummyServiceInstance, "getProjectDetails"),
        listProjects: spy(dummyServiceInstance, "listProjects"),
        listModelCatalog: spy(dummyServiceInstance, "listModelCatalog"),
        listAvailableDomainOverlays: spy(dummyServiceInstance, "listAvailableDomainOverlays"),
        getContributionContentSignedUrlLogic: spy(dummyServiceInstance, "getContributionContentSignedUrlLogic"),
        handleInitialPromptUpload: spy(dummyServiceInstance, "handleInitialPromptUpload"),
        listAvailableDomains: spy(dummyServiceInstance, "listAvailableDomains"),
        updateProjectDomain: spy(dummyServiceInstance, "updateProjectDomain"),
        cloneProject: spy(dummyServiceInstance, "cloneProject"),
        deleteProject: spy(dummyServiceInstance, "deleteProject"),
        exportProject: spy(dummyServiceInstance, "exportProject"),
        getProjectResourceContent: spy(dummyServiceInstance, "getProjectResourceContent"),
    } as MockDialecticServiceSpies;

    const resetAllMocks = () => {
        Object.values(spiesInstance).forEach(s => {
            if (s && typeof s.restore === 'function') { // Check if restore exists
                s.restore();
            }
        });
        // After restoring, re-assign original dummy methods if they were overwritten by helpers
        // This is a bit complex; simpler if helpers only modify for one call.
        // For now, restore() should put back the _DialecticServiceDummyImpl methods.
    };

    return {
        service: dummyServiceInstance, 
        spies: spiesInstance,
        resetAllMocks,
    };
}

// 6. Helper functions updated to modify the underlying service instance
export const mockSubmitStageResponsesSuccess = (
    serviceInstance: _DialecticServiceDummyImpl, // Modify the actual instance
    response: SubmitStageResponsesResponse
) => {
    serviceInstance.submitStageResponses = () => Promise.resolve(response);
};

export const mockSubmitStageResponsesError = (
    serviceInstance: _DialecticServiceDummyImpl, // Modify the actual instance
    error: Error
) => {
    serviceInstance.submitStageResponses = () => Promise.reject(error);
}; 