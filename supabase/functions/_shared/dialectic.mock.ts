import { spy, type Spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import type {
    DialecticProject,
    CreateProjectPayload,
    StartSessionPayload,
    DialecticSession,
    AiProvidersRow,
    DomainOverlayDescriptor,
    DialecticProjectResource,
    GenerateContributionsPayload,
    GenerateContributionsSuccessResponse,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    SaveContributionEditPayload,
    DialecticContribution,
    UpdateProjectDomainPayload,
    GetProjectResourceContentPayload,
    GetProjectResourceContentResponse,
    DialecticStage,
    DialecticStageRecipeStep,
    DialecticRecipeTemplateStep,
    SeedPromptRecipeStep,
    InputRule,
    OutputRule,
    RelevanceRule,
    JobType,
    PromptType,
    GranularityStrategy,
    ContextForDocument,
    ContentToInclude,
    FailedAttemptError,
    StageWithRecipeSteps,
    DatabaseRecipeSteps,
    DialecticStepPlannerMetadata,
    DialecticExecuteJobPayload,
    DialecticPlanJobPayload,
    DialecticSkeletonJobPayload,
    DialecticRenderJobPayload,
    SystemMaterials,
    HeaderContextArtifact,
    RenderedDocumentArtifact,
    AssembledJsonArtifact,
    EditedDocumentResource,
    SelectAnchorResult,
    SourceDocument,
    HeaderContext,
    GitHubRepoSettings,
    SyncMapEntry,
    SyncToGitHubPayload,
    SyncToGitHubResponse,
    DialecticContributionRow,
    DialecticJobRow,
    DialecticProjectResourceRow,
    DialecticSessionRow,
    DialecticProjectRow,
    ReviewMetadata,
    DocumentRelationships,
    JobInsert,
    PlanJobInsert,
    DialecticSimpleJobPayload,
    DialecticBaseJobPayload,
    SelectedModels,
    UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType, DialecticStageSlug } from './types/file_manager.types.ts';
import type { Messages, FinishReason } from './types.ts';
import type { Tables } from '../types_db.ts';

// 1. Define Function Signature Types
type CreateProjectFn = (payload: FormData | CreateProjectPayload) => Promise<DialecticProject>;
type StartSessionFn = (payload: StartSessionPayload) => Promise<DialecticSession>;
type GenerateContributionsFn = (payload: GenerateContributionsPayload) => Promise<GenerateContributionsSuccessResponse>;
type SubmitStageResponsesFn = (payload: SubmitStageResponsesPayload) => Promise<SubmitStageResponsesResponse>;
type SaveContributionEditFn = (payload: SaveContributionEditPayload) => Promise<DialecticContribution>;
type GetProjectDetailsFn = (projectId: string) => Promise<DialecticProject | null>;
type ListProjectsFn = () => Promise<DialecticProject[]>;
type ListModelCatalogFn = () => Promise<AiProvidersRow[]>;
type GetContributionContentSignedUrlLogicFn = (contributionId: string) => Promise<{ data?: { signedUrl: string }; error?: any }>;
type HandleInitialPromptUploadFn = (projectId: string, file: File) => Promise<DialecticProjectResource>;
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
    getContributionContentSignedUrlLogic: GetContributionContentSignedUrlLogicFn;
    handleInitialPromptUpload: HandleInitialPromptUploadFn;
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
    async listModelCatalog(): Promise<AiProvidersRow[]> { return undefined as any; }
    async getContributionContentSignedUrlLogic(_contributionId: string): Promise<{ data?: { signedUrl: string }; error?: any }> { return undefined as any; }
    async handleInitialPromptUpload(_projectId: string, _file: File): Promise<DialecticProjectResource> { return undefined as any; }
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
    getContributionContentSignedUrlLogic: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.getContributionContentSignedUrlLogic>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.getContributionContentSignedUrlLogic>>;
    handleInitialPromptUpload: Spy<_DialecticServiceDummyImpl, Parameters<typeof _DialecticServiceDummyImpl.prototype.handleInitialPromptUpload>, ReturnType<typeof _DialecticServiceDummyImpl.prototype.handleInitialPromptUpload>>;
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
        getContributionContentSignedUrlLogic: spy(dummyServiceInstance, "getContributionContentSignedUrlLogic"),
        handleInitialPromptUpload: spy(dummyServiceInstance, "handleInitialPromptUpload"),
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

// --- Job Processors Mock ---

// Import types for the processor functions
import type { IJobProcessors } from '../dialectic-service/dialectic.interface.ts';
import type { ProcessCompressJobReturn } from '../dialectic-worker/processCompressJob/processCompressJob.interface.ts';

// Dummy implementation class for job processors
class _JobProcessorsDummyImpl implements IJobProcessors {
    // deno-lint-ignore no-explicit-any
    processSimpleJob = async (..._args: any[]): Promise<void> => { /* dummy */ }
    // deno-lint-ignore no-explicit-any
    processComplexJob = async (..._args: any[]): Promise<void> => { /* dummy */ }
    // deno-lint-ignore no-explicit-any
    processRenderJob = async (..._args: any[]): Promise<void> => { /* dummy */ }
    // deno-lint-ignore no-explicit-any
    processCompressJob = async (..._args: any[]): Promise<ProcessCompressJobReturn> => ({ queued: false })
    // deno-lint-ignore no-explicit-any
    planComplexStage = async (..._args: any[]): Promise<any> => { /* dummy */ }
}

// A specific type for the spies on our dummy implementation
export type MockJobProcessorsSpies = {
    processSimpleJob: Spy<_JobProcessorsDummyImpl, Parameters<typeof _JobProcessorsDummyImpl.prototype.processSimpleJob>, ReturnType<typeof _JobProcessorsDummyImpl.prototype.processSimpleJob>>;
    processComplexJob: Spy<_JobProcessorsDummyImpl, Parameters<typeof _JobProcessorsDummyImpl.prototype.processComplexJob>, ReturnType<typeof _JobProcessorsDummyImpl.prototype.processComplexJob>>;
    processRenderJob: Spy<_JobProcessorsDummyImpl, Parameters<typeof _JobProcessorsDummyImpl.prototype.processRenderJob>, ReturnType<typeof _JobProcessorsDummyImpl.prototype.processRenderJob>>;
    processCompressJob: Spy<_JobProcessorsDummyImpl, Parameters<typeof _JobProcessorsDummyImpl.prototype.processCompressJob>, ReturnType<typeof _JobProcessorsDummyImpl.prototype.processCompressJob>>;
    planComplexStage: Spy<_JobProcessorsDummyImpl, Parameters<typeof _JobProcessorsDummyImpl.prototype.planComplexStage>, ReturnType<typeof _JobProcessorsDummyImpl.prototype.planComplexStage>>;
};

// Creator function that builds and returns the mock processors and their spies
export function createMockJobProcessors(): {
    processors: IJobProcessors;
    spies: MockJobProcessorsSpies;
} {
    const dummyInstance = new _JobProcessorsDummyImpl();

    const spies = {
        processSimpleJob: spy(dummyInstance, "processSimpleJob"),
        processComplexJob: spy(dummyInstance, "processComplexJob"),
        processRenderJob: spy(dummyInstance, "processRenderJob"),
        processCompressJob: spy(dummyInstance, "processCompressJob"),
        planComplexStage: spy(dummyInstance, "planComplexStage"),
    };

    return {
        processors: dummyInstance,
        spies: spies,
    };
}

// --- ProcessJob Mock ---

// Dummy implementation for processJob function
class _ProcessJobDummyImpl {
    // deno-lint-ignore no-explicit-any
    processJob = async (..._args: any[]): Promise<void> => { /* dummy */ }
}

// Type for processJob spy
export type MockProcessJobSpy = Spy<_ProcessJobDummyImpl, Parameters<typeof _ProcessJobDummyImpl.prototype.processJob>, ReturnType<typeof _ProcessJobDummyImpl.prototype.processJob>>;

// Creator function for processJob mock
export function createMockProcessJob(): {
    processJob: MockProcessJobSpy;
    restore: () => void;
} {
    const dummyInstance = new _ProcessJobDummyImpl();
    const processJobSpy = spy(dummyInstance, "processJob");

    return {
        processJob: processJobSpy,
        restore: () => processJobSpy.restore(),
    };
}

// --- ContextForDocument Factory ---

export type ContextForDocumentOverrides = Partial<ContextForDocument>;

export function buildContextForDocument(
    overrides?: ContextForDocumentOverrides,
): ContextForDocument {
    const content: ContentToInclude = { field: "" };
    const base: ContextForDocument = {
        document_key: FileType.business_case,
        content_to_include: content,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type ContextForDocumentCorruptions = { [K in keyof ContextForDocument]?: unknown };

export function invalidateContextForDocument(
    corruptions: ContextForDocumentCorruptions,
): unknown {
    return { ...buildContextForDocument(), ...corruptions };
}

// --- Recipe Step / Rule Factories ---

export function buildInputRule(
    overrides?: Partial<InputRule>,
): InputRule {
    const base: InputRule = {
        type: 'document',
        slug: 'thesis',
        document_key: FileType.business_case,
        required: true,
    };
    return { ...base, ...overrides };
}

export function buildRelevanceRule(
    overrides?: Partial<RelevanceRule>,
): RelevanceRule {
    const base: RelevanceRule = {
        document_key: FileType.business_case,
        relevance: 1,
        type: 'document',
        slug: 'thesis',
    };
    return { ...base, ...overrides };
}

export function buildOutputRule(
    overrides?: Partial<OutputRule>,
): OutputRule {
    const base: OutputRule = {
        system_materials: {
            stage_rationale: 'Compress context to fit target schema.',
            agent_notes_to_self: 'Preserve facts relevant to the target schema.',
            input_artifacts_summary: 'Source content to compress.',
            document_order: ['business_case'],
            current_document: 'business_case',
        },
        header_context_artifact: {
            type: 'header_context',
            document_key: 'header_context',
            artifact_class: 'header_context',
            file_type: 'json',
        },
        context_for_documents: [
            buildContextForDocument({ content_to_include: { focus: 'target schema relevance', reasoning_chain: true } }),
        ],
        documents: [
            {
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'business_case.md',
            },
        ],
    };
    return { ...base, ...overrides };
}

export function buildDialecticStageRecipeStep(
    overrides?: Partial<DialecticStageRecipeStep> | null,
): DialecticStageRecipeStep | null {
    if (overrides === null) {
        return null;
    }
    const base: DialecticStageRecipeStep = {
        id: 'a000000e-0000-4000-a000-00000000000e',
        instance_id: 'a000000d-0000-4000-a000-00000000000d',
        template_step_id: 'a000000b-0000-4000-a000-00000000000b',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        step_key: 'compress_consuming',
        step_slug: 'compress',
        step_name: 'Compression Consuming Step',
        step_description: 'Compress context for downstream document generation.',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [buildInputRule()],
        inputs_relevance: [buildRelevanceRule()],
        outputs_required: buildOutputRule(),
        config_override: {},
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        parallel_group: null,
        branch_key: null,
        prompt_template_id: null,
        execution_order: 1,
    };
    return { ...base, ...overrides };
}

export type DialecticRecipeTemplateStepOverrides = Partial<DialecticRecipeTemplateStep>;

export function buildDialecticRecipeTemplateStep(
    overrides?: DialecticRecipeTemplateStepOverrides,
): DialecticRecipeTemplateStep {
    const base: DialecticRecipeTemplateStep = {
        id: 'a000000c-0000-4000-a000-00000000000c',
        template_id: 'a000000a-0000-4000-a000-00000000000a',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        step_number: 1,
        step_key: 'compress_consuming',
        step_slug: 'compress',
        step_name: 'Compression Consuming Step',
        step_description: 'Compress context for downstream document generation.',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        output_type: FileType.ModelContributionRawJson,
        granularity_strategy: 'per_source_document',
        inputs_required: [buildInputRule()],
        inputs_relevance: [buildRelevanceRule()],
        outputs_required: buildOutputRule(),
        prompt_template_id: null,
        branch_key: null,
        parallel_group: null,
    };
    return { ...base, ...overrides };
}

export type DialecticRecipeTemplateStepCorruptions = { [K in keyof DialecticRecipeTemplateStep]?: unknown };

export function invalidateDialecticRecipeTemplateStep(corruptions: DialecticRecipeTemplateStepCorruptions): unknown {
    return { ...buildDialecticRecipeTemplateStep(), ...corruptions };
}

export type SeedPromptRecipeStepOverrides = Partial<SeedPromptRecipeStep>;

export function buildSeedPromptRecipeStep(
    overrides?: SeedPromptRecipeStepOverrides,
): SeedPromptRecipeStep {
    const base: SeedPromptRecipeStep = {
        prompt_type: 'Seed',
        step_number: 1,
        step_name: 'Assemble Seed Prompt',
        granularity_strategy: null,
        branch_key: null,
        parallel_group: null,
        output_type: 'seed_prompt',
        description: 'Assemble the seed prompt for the session.',
        inputs_required: [],
        outputs_required: [],
        inputs_relevance: [],
        prompt_template_id: null,
        job_type: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type SeedPromptRecipeStepCorruptions = { [K in keyof SeedPromptRecipeStep]?: unknown };

export function invalidateSeedPromptRecipeStep(corruptions: SeedPromptRecipeStepCorruptions): unknown {
    return { ...buildSeedPromptRecipeStep(), ...corruptions };
}

export type InputRuleCorruptions = { [K in keyof InputRule]?: unknown };

export function invalidateInputRule(corruptions: InputRuleCorruptions): unknown {
    return { ...buildInputRule(), ...corruptions };
}

export type RelevanceRuleCorruptions = { [K in keyof RelevanceRule]?: unknown };

export function invalidateRelevanceRule(corruptions: RelevanceRuleCorruptions): unknown {
    return { ...buildRelevanceRule(), ...corruptions };
}

export type OutputRuleCorruptions = { [K in keyof OutputRule]?: unknown };

export function invalidateOutputRule(corruptions: OutputRuleCorruptions): unknown {
    return { ...buildOutputRule(), ...corruptions };
}

export type DialecticStageRecipeStepCorruptions = { [K in keyof DialecticStageRecipeStep]?: unknown };

export function invalidateDialecticStageRecipeStep(corruptions: DialecticStageRecipeStepCorruptions): unknown {
    const builder = buildDialecticStageRecipeStep();
    if (builder === null) return null;
    return { ...builder, ...corruptions };
}

// --- FailedAttemptError ---

export type FailedAttemptErrorOverrides = Partial<FailedAttemptError>;

export function buildFailedAttemptError(overrides?: FailedAttemptErrorOverrides): FailedAttemptError {
    const base: FailedAttemptError = {
        modelId: 'test-model-id',
        error: 'Test error',
        api_identifier: 'test-api-identifier',
    };
    return { ...base, ...overrides };
}

export type FailedAttemptErrorCorruptions = { [K in keyof FailedAttemptError]?: unknown };

export function invalidateFailedAttemptError(corruptions: FailedAttemptErrorCorruptions): unknown {
    return { ...buildFailedAttemptError(), ...corruptions };
}

// --- SystemMaterials ---

export type SystemMaterialsOverrides = Partial<SystemMaterials>;

export function buildSystemMaterials(overrides?: SystemMaterialsOverrides): SystemMaterials {
    const base: SystemMaterials = {
        stage_rationale: 'Test stage rationale',
        agent_notes_to_self: 'Test agent notes',
        input_artifacts_summary: 'Test input artifacts summary',
        document_order: ['business_case'],
        current_document: 'business_case',
    };
    return { ...base, ...overrides };
}

export type SystemMaterialsCorruptions = { [K in keyof SystemMaterials]?: unknown };

export function invalidateSystemMaterials(corruptions: SystemMaterialsCorruptions): unknown {
    return { ...buildSystemMaterials(), ...corruptions };
}

// --- HeaderContextArtifact ---

export type HeaderContextArtifactOverrides = Partial<HeaderContextArtifact>;

export function buildHeaderContextArtifact(overrides?: HeaderContextArtifactOverrides): HeaderContextArtifact {
    const base: HeaderContextArtifact = {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json',
    };
    return { ...base, ...overrides };
}

export type HeaderContextArtifactCorruptions = { [K in keyof HeaderContextArtifact]?: unknown };

export function invalidateHeaderContextArtifact(corruptions: HeaderContextArtifactCorruptions): unknown {
    return { ...buildHeaderContextArtifact(), ...corruptions };
}

// --- RenderedDocumentArtifact ---

export type RenderedDocumentArtifactOverrides = Partial<RenderedDocumentArtifact>;

export function buildRenderedDocumentArtifact(overrides?: RenderedDocumentArtifactOverrides): RenderedDocumentArtifact {
    const base: RenderedDocumentArtifact = {
        artifact_class: 'rendered_document',
        file_type: 'markdown',
        document_key: FileType.business_case,
        template_filename: 'business_case.md',
    };
    return { ...base, ...overrides };
}

export type RenderedDocumentArtifactCorruptions = { [K in keyof RenderedDocumentArtifact]?: unknown };

export function invalidateRenderedDocumentArtifact(corruptions: RenderedDocumentArtifactCorruptions): unknown {
    return { ...buildRenderedDocumentArtifact(), ...corruptions };
}

// --- AssembledJsonArtifact ---

export type AssembledJsonArtifactOverrides = {
    artifact_class?: "assembled_document_json" | "assembled_json";
    document_key?: FileType;
    lineage_key?: string;
    source_model_slug?: string;
    fields?: string[];
    template_filename?: string;
    content_to_include?: Record<string, unknown> | Record<string, unknown>[];
    file_type?: "json";
};

export function buildAssembledJsonArtifact(overrides?: AssembledJsonArtifactOverrides): AssembledJsonArtifact {
    if (overrides && 'template_filename' in overrides) {
        return {
            artifact_class: overrides.artifact_class ?? 'assembled_document_json',
            document_key: overrides.document_key ?? FileType.business_case,
            lineage_key: overrides.lineage_key,
            source_model_slug: overrides.source_model_slug,
            template_filename: overrides.template_filename ?? 'template.json',
            content_to_include: overrides.content_to_include ?? {},
            file_type: overrides.file_type ?? 'json',
        };
    }
    return {
        artifact_class: overrides?.artifact_class ?? 'assembled_document_json',
        document_key: overrides?.document_key ?? FileType.business_case,
        lineage_key: overrides?.lineage_key,
        source_model_slug: overrides?.source_model_slug,
        fields: overrides?.fields ?? ['field1', 'field2'],
    };
}

export type AssembledJsonArtifactCorruptions = { [K in keyof AssembledJsonArtifact]?: unknown };

export function invalidateAssembledJsonArtifact(corruptions: AssembledJsonArtifactCorruptions): unknown {
    return { ...buildAssembledJsonArtifact(), ...corruptions };
}

// --- EditedDocumentResource ---

export type EditedDocumentResourceOverrides = Partial<EditedDocumentResource>;

export function buildEditedDocumentResource(overrides?: EditedDocumentResourceOverrides): EditedDocumentResource {
    const base: EditedDocumentResource = {
        id: 'a000000f-0000-4000-a000-00000000000f',
        resource_type: 'edited_document',
        project_id: 'test-project-id',
        session_id: 'test-session-id',
        stage_slug: 'thesis',
        iteration_number: 1,
        document_key: FileType.business_case,
        source_contribution_id: 'test-contribution-id',
        storage_bucket: 'test-bucket',
        storage_path: 'test/path',
        file_name: 'test-file.md',
        mime_type: 'text/markdown',
        size_bytes: 100,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
    };
    return { ...base, ...overrides };
}

export type EditedDocumentResourceCorruptions = { [K in keyof EditedDocumentResource]?: unknown };

export function invalidateEditedDocumentResource(corruptions: EditedDocumentResourceCorruptions): unknown {
    return { ...buildEditedDocumentResource(), ...corruptions };
}

// --- HeaderContext ---

export type HeaderContextOverrides = Partial<HeaderContext>;

export function buildHeaderContext(overrides?: HeaderContextOverrides): HeaderContext {
    const base: HeaderContext = {
        system_materials: buildSystemMaterials(),
        header_context_artifact: buildHeaderContextArtifact(),
        context_for_documents: [buildContextForDocument()],
    };
    return { ...base, ...overrides };
}

export type HeaderContextCorruptions = { [K in keyof HeaderContext]?: unknown };

export function invalidateHeaderContext(corruptions: HeaderContextCorruptions): unknown {
    return { ...buildHeaderContext(), ...corruptions };
}

// --- DialecticStepPlannerMetadata ---

export type DialecticStepPlannerMetadataOverrides = Partial<DialecticStepPlannerMetadata>;

export function buildDialecticStepPlannerMetadata(overrides?: DialecticStepPlannerMetadataOverrides): DialecticStepPlannerMetadata {
    const base: DialecticStepPlannerMetadata = {
        recipe_template_id: 'test-template-id',
        recipe_step_id: 'test-step-id',
        stage_slug: 'thesis',
        description: 'Test step description',
        dependencies: [],
        parallel_successors: [],
    };
    return { ...base, ...overrides };
}

export type DialecticStepPlannerMetadataCorruptions = { [K in keyof DialecticStepPlannerMetadata]?: unknown };

export function invalidateDialecticStepPlannerMetadata(corruptions: DialecticStepPlannerMetadataCorruptions): unknown {
    return { ...buildDialecticStepPlannerMetadata(), ...corruptions };
}

// --- GitHubRepoSettings ---

export type GitHubRepoSettingsOverrides = Partial<GitHubRepoSettings>;

export function buildGitHubRepoSettings(overrides?: GitHubRepoSettingsOverrides): GitHubRepoSettings {
    const base: GitHubRepoSettings = {
        provider: 'github',
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        folder: 'docs',
        last_sync_at: null,
    };
    return { ...base, ...overrides };
}

export type GitHubRepoSettingsCorruptions = { [K in keyof GitHubRepoSettings]?: unknown };

export function invalidateGitHubRepoSettings(corruptions: GitHubRepoSettingsCorruptions): unknown {
    return { ...buildGitHubRepoSettings(), ...corruptions };
}

// --- SyncMapEntry ---

export type SyncMapEntryOverrides = Partial<SyncMapEntry>;

export function buildSyncMapEntry(overrides?: SyncMapEntryOverrides): SyncMapEntry {
    const base: SyncMapEntry = {
        documentKey: 'business_case',
        friendlyName: 'Business Case',
        stageGroup: 'thesis',
        layer: 'research',
        audience: null,
        sortOrder: 1,
        available: true,
        updatedSinceLastSync: false,
    };
    return { ...base, ...overrides };
}

export type SyncMapEntryCorruptions = { [K in keyof SyncMapEntry]?: unknown };

export function invalidateSyncMapEntry(corruptions: SyncMapEntryCorruptions): unknown {
    return { ...buildSyncMapEntry(), ...corruptions };
}

// --- SyncToGitHubPayload ---

export type SyncToGitHubPayloadOverrides = Partial<SyncToGitHubPayload>;

export function buildSyncToGitHubPayload(overrides?: SyncToGitHubPayloadOverrides): SyncToGitHubPayload {
    const base: SyncToGitHubPayload = {
        projectId: 'test-project-id',
        selectedModelIds: ['model-1'],
        selectedDocumentKeys: ['business_case'],
        includeRulesFile: false,
    };
    return { ...base, ...overrides };
}

export type SyncToGitHubPayloadCorruptions = { [K in keyof SyncToGitHubPayload]?: unknown };

export function invalidateSyncToGitHubPayload(corruptions: SyncToGitHubPayloadCorruptions): unknown {
    return { ...buildSyncToGitHubPayload(), ...corruptions };
}

// --- SyncToGitHubResponse ---

export type SyncToGitHubResponseOverrides = Partial<SyncToGitHubResponse>;

export function buildSyncToGitHubResponse(overrides?: SyncToGitHubResponseOverrides): SyncToGitHubResponse {
    const base: SyncToGitHubResponse = {
        commitSha: null,
        filesUpdated: 0,
        syncedAt: '2025-01-01T00:00:00.000Z',
        syncedDocumentKeys: [],
        skippedDocumentKeys: [],
    };
    return { ...base, ...overrides };
}

export type SyncToGitHubResponseCorruptions = { [K in keyof SyncToGitHubResponse]?: unknown };

export function invalidateSyncToGitHubResponse(corruptions: SyncToGitHubResponseCorruptions): unknown {
    return { ...buildSyncToGitHubResponse(), ...corruptions };
}

// --- DialecticContributionRow (DB row) ---

export type DialecticContributionRowOverrides = Partial<DialecticContributionRow>;

// WARNING: The default id is hardcoded. When multiple contributions are created
// without overriding id, they all share the same key in mock lookup tables, and
// the last write wins. If the surviving row has a target_contribution_id that
// points back to that same id, the root-resolution loop in
// assembleContinuationPrompt will never break, causing an infinite loop / OOM.
// Always pass a unique id override when creating more than one contribution.
export function buildDialecticContributionRow(overrides?: DialecticContributionRowOverrides): DialecticContributionRow {
    const base: DialecticContributionRow = {
        id: 'a0000001-0000-4000-a000-000000000001',
        session_id: 'test-session-id',
        user_id: 'test-user-id',
        stage: 'thesis',
        iteration_number: 1,
        model_id: 'test-model-id',
        model_name: 'Test Model',
        prompt_template_id_used: 'test-template-id',
        seed_prompt_url: null,
        edit_version: 0,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: 100,
        tokens_used_output: 200,
        processing_time_ms: 500,
        error: null,
        citations: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        contribution_type: 'thesis',
        file_name: 'test-contribution.md',
        storage_bucket: 'test-bucket',
        storage_path: 'test/path',
        size_bytes: 1000,
        mime_type: 'text/markdown',
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };
    return { ...base, ...overrides };
}

export type DialecticContributionRowCorruptions = { [K in keyof DialecticContributionRow]?: unknown };

export function invalidateDialecticContributionRow(corruptions: DialecticContributionRowCorruptions): unknown {
    return { ...buildDialecticContributionRow(), ...corruptions };
}

// --- DialecticJobRow (DB row) ---

export type DialecticJobRowOverrides = Partial<DialecticJobRow>;

export function buildDialecticJobRow(overrides?: DialecticJobRowOverrides): DialecticJobRow {
    const base: DialecticJobRow = {
        id: 'a0000002-0000-4000-a000-000000000002',
        session_id: 'test-session-id',
        user_id: 'test-user-id',
        job_type: 'EXECUTE',
        status: 'pending',
        payload: {},
        iteration_number: 1,
        stage_slug: 'thesis',
        attempt_count: 0,
        max_retries: 3,
        parent_job_id: null,
        prerequisite_job_id: null,
        idempotency_key: 'test-idempotency-key',
        is_test_job: false,
        started_at: null,
        completed_at: null,
        error_details: null,
        results: null,
        target_contribution_id: null,
        created_at: '2025-01-01T00:00:00.000Z',
    };
    return { ...base, ...overrides };
}

export type DialecticJobRowCorruptions = { [K in keyof DialecticJobRow]?: unknown };

export function invalidateDialecticJobRow(corruptions: DialecticJobRowCorruptions): unknown {
    return { ...buildDialecticJobRow(), ...corruptions };
}

// --- DialecticProjectResourceRow (DB row) ---

export type DialecticProjectResourceRowOverrides = Partial<DialecticProjectResourceRow>;

export function buildDialecticProjectResourceRow(overrides?: DialecticProjectResourceRowOverrides): DialecticProjectResourceRow {
    const base: DialecticProjectResourceRow = {
        id: 'a0000003-0000-4000-a000-000000000003',
        project_id: 'test-project-id',
        user_id: 'test-user-id',
        file_name: 'test-resource.md',
        storage_bucket: 'test-bucket',
        storage_path: 'test/path',
        mime_type: 'text/markdown',
        size_bytes: 1000,
        resource_description: null,
        resource_type: null,
        session_id: null,
        stage_slug: null,
        iteration_number: null,
        source_contribution_id: null,
        source_prompt_resource_id: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type DialecticProjectResourceRowCorruptions = { [K in keyof DialecticProjectResourceRow]?: unknown };

export function invalidateDialecticProjectResourceRow(corruptions: DialecticProjectResourceRowCorruptions): unknown {
    return { ...buildDialecticProjectResourceRow(), ...corruptions };
}

// --- DialecticBaseJobPayload ---

export type DialecticBaseJobPayloadOverrides = Partial<DialecticBaseJobPayload>;

export function buildDialecticBaseJobPayload(overrides?: DialecticBaseJobPayloadOverrides): DialecticBaseJobPayload {
    const base: DialecticBaseJobPayload = {
        sessionId: 'test-session-id',
        projectId: 'test-project-id',
        stageSlug: 'thesis',
        iterationNumber: 1,
        walletId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        user_jwt: 'test-jwt',
        idempotencyKey: 'test-idempotency-key',
        model_id: 'test-model-id',
        model_slug: 'test-model-slug',
    };
    return { ...base, ...overrides };
}

export type DialecticBaseJobPayloadCorruptions = { [K in keyof DialecticBaseJobPayload]?: unknown };

export function invalidateDialecticBaseJobPayload(corruptions: DialecticBaseJobPayloadCorruptions): unknown {
    return { ...buildDialecticBaseJobPayload(), ...corruptions };
}

// --- DialecticExecuteJobPayload ---

export type DialecticExecuteJobPayloadOverrides = Partial<DialecticExecuteJobPayload>;

export function buildDialecticExecuteJobPayload(overrides?: DialecticExecuteJobPayloadOverrides): DialecticExecuteJobPayload {
    const base: DialecticExecuteJobPayload = {
        ...buildDialecticBaseJobPayload(),
        prompt_template_id: 'test-template-id',
        output_type: FileType.ModelContributionRawJson,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: DialecticStageSlug.Thesis,
        },
        inputs: {},
        document_key: FileType.business_case,
    };
    return { ...base, ...overrides };
}

export type DialecticExecuteJobPayloadCorruptions = { [K in keyof DialecticExecuteJobPayload]?: unknown };

export function invalidateDialecticExecuteJobPayload(corruptions: DialecticExecuteJobPayloadCorruptions): unknown {
    return { ...buildDialecticExecuteJobPayload(), ...corruptions };
}

// --- DialecticPlanJobPayload ---

export type DialecticPlanJobPayloadOverrides = Partial<DialecticPlanJobPayload>;

export function buildDialecticPlanJobPayload(overrides?: DialecticPlanJobPayloadOverrides): DialecticPlanJobPayload {
    const base: DialecticPlanJobPayload = {
        ...buildDialecticBaseJobPayload(),
        document_relationships: null,
    };
    return { ...base, ...overrides };
}

export type DialecticPlanJobPayloadCorruptions = { [K in keyof DialecticPlanJobPayload]?: unknown };

export function invalidateDialecticPlanJobPayload(corruptions: DialecticPlanJobPayloadCorruptions): unknown {
    return { ...buildDialecticPlanJobPayload(), ...corruptions };
}

// --- DialecticSkeletonJobPayload ---

export type DialecticSkeletonJobPayloadOverrides = Partial<DialecticSkeletonJobPayload>;

export function buildDialecticSkeletonJobPayload(overrides?: DialecticSkeletonJobPayloadOverrides): DialecticSkeletonJobPayload {
    const base: DialecticSkeletonJobPayload = {
        ...buildDialecticPlanJobPayload(),
        projectId: 'test-project-id',
        sessionId: 'test-session-id',
        model_id: 'test-model-id',
        walletId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        user_jwt: 'test-jwt',
        stageSlug: 'thesis',
        iterationNumber: 1,
        planner_metadata: buildDialecticStepPlannerMetadata(),
        step_info: {},
    };
    return { ...base, ...overrides };
}

export type DialecticSkeletonJobPayloadCorruptions = { [K in keyof DialecticSkeletonJobPayload]?: unknown };

export function invalidateDialecticSkeletonJobPayload(corruptions: DialecticSkeletonJobPayloadCorruptions): unknown {
    return { ...buildDialecticSkeletonJobPayload(), ...corruptions };
}

// --- DialecticRenderJobPayload ---

export type DialecticRenderJobPayloadOverrides = Partial<DialecticRenderJobPayload>;

export function buildDialecticRenderJobPayload(overrides?: DialecticRenderJobPayloadOverrides): DialecticRenderJobPayload {
    const base: DialecticRenderJobPayload = {
        ...buildDialecticBaseJobPayload(),
        documentIdentity: 'test-document-identity',
        documentKey: FileType.business_case,
        sourceContributionId: 'test-contribution-id',
        template_filename: 'business_case.md',
    };
    return { ...base, ...overrides };
}

export type DialecticRenderJobPayloadCorruptions = { [K in keyof DialecticRenderJobPayload]?: unknown };

export function invalidateDialecticRenderJobPayload(corruptions: DialecticRenderJobPayloadCorruptions): unknown {
    return { ...buildDialecticRenderJobPayload(), ...corruptions };
}

// --- StageWithRecipeSteps ---

export type StageWithRecipeStepsOverrides = Partial<StageWithRecipeSteps>;

export function buildStageWithRecipeSteps(overrides?: StageWithRecipeStepsOverrides): StageWithRecipeSteps {
    const step = buildDialecticStageRecipeStep();
    const base: StageWithRecipeSteps = {
        dialectic_stage: {
            id: 'a0000004-0000-4000-a000-000000000004',
            slug: 'thesis',
            display_name: 'Thesis',
            description: 'Thesis stage',
            created_at: '2025-01-01T00:00:00.000Z',
            default_system_prompt_id: null,
            recipe_template_id: null,
            active_recipe_instance_id: null,
            expected_output_template_ids: [],
            minimum_balance: 0,
        },
        dialectic_stage_recipe_instances: {
            id: 'a000000d-0000-4000-a000-00000000000d',
            stage_id: 'a0000004-0000-4000-a000-000000000004',
            template_id: 'test-template-id',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        },
        dialectic_stage_recipe_steps: step ? [step] : [],
    };
    return { ...base, ...overrides };
}

export type StageWithRecipeStepsCorruptions = { [K in keyof StageWithRecipeSteps]?: unknown };

export function invalidateStageWithRecipeSteps(corruptions: StageWithRecipeStepsCorruptions): unknown {
    return { ...buildStageWithRecipeSteps(), ...corruptions };
}

// --- DatabaseRecipeSteps ---

export type DatabaseRecipeStepsOverrides = Partial<DatabaseRecipeSteps>;

export function buildDatabaseRecipeSteps(overrides?: DatabaseRecipeStepsOverrides): DatabaseRecipeSteps {
    const base: DatabaseRecipeSteps = {
        id: 'a0000004-0000-4000-a000-000000000004',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        created_at: '2025-01-01T00:00:00.000Z',
        default_system_prompt_id: null,
        recipe_template_id: null,
        active_recipe_instance_id: null,
        expected_output_template_ids: [],
        minimum_balance: 0,
        dialectic_stage_recipe_instances: [{
            id: 'a000000d-0000-4000-a000-00000000000d',
            stage_id: 'a0000004-0000-4000-a000-000000000004',
            template_id: 'test-template-id',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
            dialectic_stage_recipe_steps: [],
        }],
    };
    return { ...base, ...overrides };
}

export type DatabaseRecipeStepsCorruptions = { [K in keyof DatabaseRecipeSteps]?: unknown };

export function invalidateDatabaseRecipeSteps(corruptions: DatabaseRecipeStepsCorruptions): unknown {
    return { ...buildDatabaseRecipeSteps(), ...corruptions };
}

// --- SourceDocument ---

export type SourceDocumentOverrides = Partial<SourceDocument>;

export function buildSourceDocument(overrides?: SourceDocumentOverrides): SourceDocument {
    const { document_relationships: _omit, ...row } = buildDialecticContributionRow();
    const base: SourceDocument = {
        ...row,
        content: 'Test content',
        document_relationships: null,
        attempt_count: 1,
        document_key: FileType.business_case,
        type: 'thesis',
        stage_slug: DialecticStageSlug.Thesis,
    };
    return { ...base, ...overrides };
}

export type SourceDocumentCorruptions = { [K in keyof SourceDocument]?: unknown };

export function invalidateSourceDocument(corruptions: SourceDocumentCorruptions): unknown {
    return { ...buildSourceDocument(), ...corruptions };
}

// --- SelectAnchorResult ---

export function buildSelectAnchorResultNoAnchorRequired(): SelectAnchorResult {
    return { status: 'no_anchor_required' };
}

export function buildSelectAnchorResultDeriveFromHeaderContext(): SelectAnchorResult {
    return { status: 'derive_from_header_context' };
}

export function buildSelectAnchorResultAnchorFound(document?: SourceDocument): SelectAnchorResult {
    return { status: 'anchor_found', document: document ?? buildSourceDocument() };
}

export function buildSelectAnchorResultAnchorNotFound(): SelectAnchorResult {
    return { status: 'anchor_not_found', targetSlug: 'thesis', targetDocumentKey: 'business_case' };
}

// --- ReviewMetadata ---

export type ReviewMetadataOverrides = Partial<ReviewMetadata>;

export function buildReviewMetadata(overrides?: ReviewMetadataOverrides): ReviewMetadata {
    const base: ReviewMetadata = {
        proposal_identifier: {
            lineage_key: 'business_case',
            source_model_slug: 'test-model-slug',
        },
        proposal_summary: 'Test proposal summary',
        review_focus: ['feasibility'],
        user_constraints: ['Must be under budget'],
        normalization_guidance: {
            scoring_scale: '1-10',
            required_dimensions: ['feasibility', 'cost'],
        },
    };
    return { ...base, ...overrides };
}

export type ReviewMetadataCorruptions = { [K in keyof ReviewMetadata]?: unknown };

export function invalidateReviewMetadata(corruptions: ReviewMetadataCorruptions): unknown {
    return { ...buildReviewMetadata(), ...corruptions };
}

// --- ContentToInclude ---

export type ContentToIncludeOverrides = ContentToInclude;

export function buildContentToInclude(overrides?: ContentToIncludeOverrides): ContentToInclude {
    const base: ContentToInclude = { field: "" };
    return { ...base, ...overrides };
}

export type ContentToIncludeCorruptions = { [K in keyof ContentToInclude]?: unknown };

export function invalidateContentToInclude(corruptions: ContentToIncludeCorruptions): unknown {
    return { ...buildContentToInclude(), ...corruptions };
}

// --- SelectedModels ---

export type SelectedModelsOverrides = Partial<SelectedModels>;

export function buildSelectedModels(overrides?: SelectedModelsOverrides): SelectedModels {
    const base: SelectedModels = {
        id: 'test-model-id',
        displayName: 'Test Model',
    };
    return { ...base, ...overrides };
}

export type SelectedModelsCorruptions = { [K in keyof SelectedModels]?: unknown };

export function invalidateSelectedModels(corruptions: SelectedModelsCorruptions): unknown {
    return { ...buildSelectedModels(), ...corruptions };
}

// --- DocumentRelationships ---

export type DocumentRelationshipsOverrides = Partial<DocumentRelationships>;

export function buildDocumentRelationships(overrides?: DocumentRelationshipsOverrides): DocumentRelationships {
    const base: DocumentRelationships = {
        thesis: 'test-contribution-id',
    };
    return { ...base, ...overrides };
}

export type DocumentRelationshipsCorruptions = { [K in keyof DocumentRelationships]?: unknown };

export function invalidateDocumentRelationships(corruptions: DocumentRelationshipsCorruptions): unknown {
    return { ...buildDocumentRelationships(), ...corruptions };
}

// --- DialecticSimpleJobPayload ---

export type DialecticSimpleJobPayloadOverrides = Partial<DialecticSimpleJobPayload>;

export function buildDialecticSimpleJobPayload(overrides?: DialecticSimpleJobPayloadOverrides): DialecticSimpleJobPayload {
    const base: DialecticSimpleJobPayload = {
        ...buildDialecticBaseJobPayload(),
    };
    return { ...base, ...overrides };
}

export type DialecticSimpleJobPayloadCorruptions = { [K in keyof DialecticSimpleJobPayload]?: unknown };

export function invalidateDialecticSimpleJobPayload(corruptions: DialecticSimpleJobPayloadCorruptions): unknown {
    return { ...buildDialecticSimpleJobPayload(), ...corruptions };
}

// --- JobInsert ---

export type JobInsertOverrides = Partial<JobInsert>;

export function buildJobInsert(overrides?: JobInsertOverrides): JobInsert {
    const base: JobInsert = {
        session_id: 'test-session-id',
        user_id: 'test-user-id',
        stage_slug: 'thesis',
        iteration_number: 1,
        payload: { model_id: 'test-model-id' },
        job_type: 'PLAN',
        is_test_job: false,
    };
    return { ...base, ...overrides };
}

export type JobInsertCorruptions = { [K in keyof JobInsert]?: unknown };

export function invalidateJobInsert(corruptions: JobInsertCorruptions): unknown {
    return { ...buildJobInsert(), ...corruptions };
}

// --- PlanJobInsert ---

export type PlanJobInsertOverrides = Partial<PlanJobInsert>;

export function buildPlanJobInsert(overrides?: PlanJobInsertOverrides): PlanJobInsert {
    const base: PlanJobInsert = {
        session_id: 'test-session-id',
        user_id: 'test-user-id',
        stage_slug: 'thesis',
        iteration_number: 1,
        payload: {
            model_id: 'test-model-id',
            sessionId: 'test-session-id',
            projectId: 'test-project-id',
            walletId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
            user_jwt: 'test-jwt',
            job_type: 'PLAN',
        },
        job_type: 'PLAN',
        is_test_job: false,
    };
    return { ...base, ...overrides };
}

export type PlanJobInsertCorruptions = { [K in keyof PlanJobInsert]?: unknown };

export function invalidatePlanJobInsert(corruptions: PlanJobInsertCorruptions): unknown {
    return { ...buildPlanJobInsert(), ...corruptions };
}

// --- UnifiedAIResponse ---

export type UnifiedAIResponseOverrides = Partial<UnifiedAIResponse>;

export function buildUnifiedAIResponse(overrides?: UnifiedAIResponseOverrides): UnifiedAIResponse {
    const base: UnifiedAIResponse = {
        content: 'Test AI response content',
        finish_reason: 'stop',
    };
    return { ...base, ...overrides };
}

export type UnifiedAIResponseCorruptions = { [K in keyof UnifiedAIResponse]?: unknown };

export function invalidateUnifiedAIResponse(corruptions: UnifiedAIResponseCorruptions): unknown {
    return { ...buildUnifiedAIResponse(), ...corruptions };
}

// --- Messages ---

export type MessagesOverrides = Partial<Messages>;

export function buildMessages(overrides?: MessagesOverrides): Messages {
    const base: Messages = {
        role: 'user',
        content: 'Test message content',
    };
    return { ...base, ...overrides };
}

export type MessagesCorruptions = { [K in keyof Messages]?: unknown };

export function invalidateMessages(corruptions: MessagesCorruptions): unknown {
    return { ...buildMessages(), ...corruptions };
}

// --- TokenWalletRow (DB row) ---

export type TokenWalletRowOverrides = Partial<Tables<'token_wallets'>>;

export function buildTokenWalletRow(overrides?: TokenWalletRowOverrides): Tables<'token_wallets'> {
    const now = new Date().toISOString();
    const base: Tables<'token_wallets'> = {
        wallet_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        user_id: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        organization_id: null,
        balance: 1000,
        currency: 'credits',
        created_at: now,
        updated_at: now,
    };
    return { ...base, ...overrides };
}

export type TokenWalletRowCorruptions = { [K in keyof Tables<'token_wallets'>]?: unknown };

export function invalidateTokenWalletRow(corruptions: TokenWalletRowCorruptions): unknown {
    return { ...buildTokenWalletRow(), ...corruptions };
}

// --- DialecticSessionRow (DB row) ---

export type DialecticSessionRowOverrides = Partial<DialecticSessionRow>;

export function buildDialecticSessionRow(overrides?: DialecticSessionRowOverrides): DialecticSessionRow {
    const now = new Date().toISOString();
    const base: DialecticSessionRow = {
        id: 'test-session-id',
        project_id: 'test-project-id',
        session_description: 'test session',
        user_input_reference_url: null,
        iteration_count: 1,
        selected_model_ids: ['test-model-id'],
        status: 'in-progress',
        associated_chat_id: null,
        current_stage_id: 'test-stage-id',
        created_at: now,
        updated_at: now,
        viewing_stage_id: null,
        idempotency_key: 'test-session-idempotency-key',
    };
    return { ...base, ...overrides };
}

export type DialecticSessionRowCorruptions = { [K in keyof DialecticSessionRow]?: unknown };

export function invalidateDialecticSessionRow(corruptions: DialecticSessionRowCorruptions): unknown {
    return { ...buildDialecticSessionRow(), ...corruptions };
}

// --- DialecticProjectRow (DB row) ---

export type DialecticProjectRowOverrides = Partial<DialecticProjectRow>;

export function buildDialecticProjectRow(overrides?: DialecticProjectRowOverrides): DialecticProjectRow {
    const now = new Date().toISOString();
    const base: DialecticProjectRow = {
        id: 'test-project-id',
        project_name: 'test project',
        initial_user_prompt: 'test initial prompt',
        selected_domain_id: 'test-domain-id',
        selected_domain_overlay_id: null,
        user_id: 'test-user-id',
        status: 'active',
        repo_url: null,
        user_domain_overlay_values: null,
        initial_prompt_resource_id: null,
        process_template_id: null,
        idempotency_key: null,
        created_at: now,
        updated_at: now,
    };
    return { ...base, ...overrides };
}

export type DialecticProjectRowCorruptions = { [K in keyof DialecticProjectRow]?: unknown };

export function invalidateDialecticProjectRow(corruptions: DialecticProjectRowCorruptions): unknown {
    return { ...buildDialecticProjectRow(), ...corruptions };
}

// --- DialecticStage (DB row) ---

export type DialecticStageOverrides = Partial<DialecticStage>;

export function buildDialecticStage(overrides?: DialecticStageOverrides): DialecticStage {
    const now = new Date().toISOString();
    const base: DialecticStage = {
        id: 'test-stage-id',
        slug: 'thesis',
        display_name: 'Thesis',
        description: 'Thesis stage',
        minimum_balance: 0,
        expected_output_template_ids: [],
        default_system_prompt_id: 'test-system-prompt-id',
        active_recipe_instance_id: null,
        recipe_template_id: null,
        created_at: now,
    };
    return { ...base, ...overrides };
}

export type DialecticStageCorruptions = { [K in keyof DialecticStage]?: unknown };

export function invalidateDialecticStage(corruptions: DialecticStageCorruptions): unknown {
    return { ...buildDialecticStage(), ...corruptions };
}