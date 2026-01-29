import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { gatherInputsForStage } from "./gatherInputsForStage.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssemblerSourceDocument,
  GatheredRecipeContext,
} from "./prompt-assembler.interface.ts";
import { FileManagerService } from "../services/file_manager.ts";
import { type DialecticRecipeStep, type DialecticContribution, type DialecticRecipeTemplateStep } from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig, type IMockSupabaseClient, type IMockClientSpies, type MockSupabaseClientSetup, type MockQueryBuilderState } from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { downloadFromStorage } from '../supabase_storage_utils.ts';
import type { Json, Tables } from "../../types_db.ts";
import { Database } from "../../types_db.ts";
import { constructStoragePath } from '../utils/path_constructor.ts';
import { FileType } from "../types/file_manager.types.ts";
import { join } from "jsr:@std/path/join";

// Helper to create a minimal valid recipe step
const createMockRecipeStep = (inputs: DialecticRecipeTemplateStep['inputs_required']): DialecticRecipeTemplateStep => ({
    id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    template_id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    step_description: 'A test description',
    step_number: 1,
    step_key: 'test-step',
    step_slug: 'test-step',
    step_name: 'Test Step',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    output_type: FileType.HeaderContext,
    granularity_strategy: 'all_to_one',
    inputs_required: inputs,
    inputs_relevance: [],
    outputs_required: {},
    parallel_group: null,
    branch_key: null,
    prompt_template_id: null,
});

Deno.test("gatherInputsForStage", async (t) => {
    await t.step("_gatherInputsForStage tests", async (tCtx) => {
        let denoEnvStub: any;
        let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
        let currentConsoleErrorSpy: Spy<Console> | null = null;
        let currentConsoleInfoSpy: Spy<Console> | null = null;
        let currentConsoleWarnSpy: Spy<Console> | null = null;

        const setup = (config: MockSupabaseDataConfig = {}) => {
            if (denoEnvStub) {
                denoEnvStub.restore();
                denoEnvStub = null;
            }
            denoEnvStub = stub(Deno.env, "get", (key: string) => {
                if (key === "SB_CONTENT_STORAGE_BUCKET" || key === "STORAGE_BUCKET") {
                    return "test-bucket";
                }
                return undefined;
            });

            mockSupabaseSetup = createMockSupabaseClient(undefined, config);

            if (currentConsoleErrorSpy) currentConsoleErrorSpy.restore();
            currentConsoleErrorSpy = spy(console, "error");

            if (currentConsoleInfoSpy) currentConsoleInfoSpy.restore();
            currentConsoleInfoSpy = spy(console, "info");

            if (currentConsoleWarnSpy) currentConsoleWarnSpy.restore();
            currentConsoleWarnSpy = spy(console, "warn");

            return { mockSupabaseClient: mockSupabaseSetup.client, spies: mockSupabaseSetup.spies };
        };

        const teardown = () => {
            denoEnvStub?.restore();
            denoEnvStub = null;
            currentConsoleErrorSpy?.restore();
            currentConsoleInfoSpy?.restore();
            currentConsoleWarnSpy?.restore();
            currentConsoleErrorSpy = null;
            currentConsoleInfoSpy = null;
            currentConsoleWarnSpy = null;
            if (mockSupabaseSetup && typeof mockSupabaseSetup.clearAllStubs === 'function') {
                mockSupabaseSetup.clearAllStubs();
            }
            mockSupabaseSetup = null;
        };

        await tCtx.step("should return empty array if recipe step has no input rules", async () => {
            const { mockSupabaseClient } = setup({});
            try {
                const project: ProjectContext = {
                    id: "p1",
                    project_name: "Test Project",
                    user_id: 'u1',
                    initial_user_prompt: "Test prompt",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1",
                    dialectic_domains: { name: "Test Domain" },
                    process_template_id: 'pt1',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s1",
                    project_id: "p1",
                    selected_model_ids: ["m1"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'stage-dummy',
                    iteration_count: 1,
                    session_description: 'Test session',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const stage: StageContext = {
                    id: "stage1",
                    slug: "test-stage",
                    display_name: "Test Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([]), // Empty rules
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };
                const iterationNumber = 1;

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                assert(typeof result === 'object' && result !== null && 'sourceDocuments' in result && 'recipeStep' in result, "Result should be a GatheredRecipeContext object");
                assertEquals(Array.isArray(result.sourceDocuments), true);
                assertEquals(result.sourceDocuments.length, 0);
                assertEquals(result.recipeStep, stage.recipe_step);
            } finally {
                teardown();
            }
        });

        // This test replaces the old "invalid JSON" and "invalid rule structure" tests.
        // The new `parseInputArtifactRules` handles structural validation, so we trust it here.
        // `gatherInputsForStage` should just pass the rules along. If they're empty, it should do nothing.
        await tCtx.step("should return empty array if inputs_required is empty", async () => {
            const { mockSupabaseClient, spies } = setup({});
            try {
                const project: ProjectContext = {
                    id: "p1",
                    user_id: 'u1',
                    project_name: "Test Project",
                    initial_user_prompt: "Test prompt",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1",
                    dialectic_domains: { name: "Test Domain" },
                    process_template_id: 'pt1',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s1",
                    project_id: "p1",
                    selected_model_ids: ["m1"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'stage-dummy',
                    iteration_count: 1,
                    session_description: 'Test session',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const stage: StageContext = {
                    id: "stage1",
                    slug: "test-stage",
                    display_name: "Test Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };
                const iterationNumber = 1;

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                assert(typeof result === 'object' && result !== null && 'sourceDocuments' in result && 'recipeStep' in result, "Result should be a GatheredRecipeContext object");
                assertEquals(Array.isArray(result.sourceDocuments), true);
                assertEquals(result.sourceDocuments.length, 0);
                assertEquals(result.recipeStep, stage.recipe_step);

                const stagesTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_stages', 'in');
                assertEquals(stagesTableSpies?.callCount, 0, "Expected dbClient.from('dialectic_stages')...in() not to be called");

            } finally {
                teardown();
            }
        });

        await tCtx.step("should fetch and format only documents when rules specify documents", async () => {
            const docStageSlug = "prev-stage-doc";
            const mockStageDisplayName = "Previous Document Stage";
            const modelName = "Model Alpha";
            const docContent = "This is document 1 content.";
            const storagePath = "p1/session_s1/iteration_1/thesis/documents";
            const fileName = "gpt-4-turbo_0_business_case.md";
            const resourceId = "doc1";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(docStageSlug)) {
                                return { data: [{ slug: docStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's1');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === docStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: resourceId,
                                        project_id: 'p1',
                                        user_id: 'u1',
                                        file_name: fileName,
                                        storage_bucket: 'test-bucket',
                                        storage_path: storagePath,
                                        mime_type: 'text/markdown',
                                        size_bytes: docContent.length,
                                        resource_type: 'rendered_document',
                                        session_id: 's1',
                                        iteration_number: 1,
                                        stage_slug: docStageSlug,
                                        source_contribution_id: 'contrib-1',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            const idFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'id');
                            if (idFilter && idFilter.value === 'contrib-1') {
                                return { data: [{ id: 'contrib-1', model_name: modelName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 406, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedPath = join(storagePath, fileName);
                        const expectedPathFs = expectedPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedPath || path === expectedPathFs)) {
                            return { data: new Blob([docContent]), error: null };
                        }
                        return { data: null, error: new Error("Unexpected download path in mock") };
                    }
                }
            };

            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = {
                    id: "p1",
                    user_id: 'u1',
                    project_name: "Test Project P1",
                    initial_user_prompt: "Initial prompt for P1",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-p1",
                    dialectic_domains: { name: "Test Domain P1" },
                    process_template_id: 'pt-p1',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s1",
                    project_id: "p1",
                    selected_model_ids: ["model-alpha-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage',
                    iteration_count: 1,
                    session_description: 'Session for doc test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = 1;
                const stage: StageContext = {
                    id: "stage-doc-only",
                    slug: "curr-stage",
                    display_name: "Current Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        {
                            type: "document",
                            slug: docStageSlug,
                            // document_key omitted to fetch any document from that stage
                            required: true,
                            multiple: false,
                            section_header: "Documents from some-slug stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Initialize spies BEFORE the action to ensure calls are tracked
                const storageSpies = spies.storage.from("test-bucket");
                
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                assertEquals(result.sourceDocuments.length, 1);
                const doc = result.sourceDocuments[0];
                assertEquals(doc.id, "doc1");
                assertEquals(doc.type, "document");
                assertEquals(doc.content, docContent);
                // modelName is extracted from file_name (model slug), not from contributions query
                assertEquals(doc.metadata.modelName, "gpt-4-turbo");
                assertEquals(doc.metadata.displayName, mockStageDisplayName);
                assertEquals(doc.metadata.header, "Documents from some-slug stage");

                const downloadSpy = storageSpies.downloadSpy;
                assertEquals(downloadSpy.calls.length, 1);
                const actualPath = downloadSpy.calls[0].args[0];
                const expectedJoined = join(storagePath, fileName);
                const expectedFs = expectedJoined.replace(/\\/g, '/');
                assert(
                    actualPath === expectedJoined || actualPath === expectedFs,
                    `Expected download path to be '${expectedJoined}' or '${expectedFs}', got '${actualPath}'`
                );
            } finally {
                teardown();
            }
        });

        await tCtx.step("should fetch and format only feedback when rules specify feedback", async () => {
            const feedbackStageSlug = "prev-stage-feedback";
            const mockStageDisplayName = "Previous Feedback Stage";
            const feedbackContent = "This is user feedback content.";
            const projectId = "p100";
            const userId = "u100";
            const sessionId = "s100";
            const iteration = 2;

            const feedbackPathParts = constructStoragePath({
                projectId,
                sessionId,
                iteration: iteration - 1, // Feedback is from previous iteration
                stageSlug: feedbackStageSlug,
                fileType: FileType.UserFeedback,
            });
            const expectedFeedbackPath = join(feedbackPathParts.storagePath, feedbackPathParts.fileName);

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(feedbackStageSlug)) {
                                return { data: [{ slug: feedbackStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_feedback': {
                        select: async (state: MockQueryBuilderState) => {
                            const sessionFilter = state.filters.find(f => f.column === 'session_id' && f.value === sessionId);
                            const stageFilter = state.filters.find(f => f.column === 'stage_slug' && f.value === feedbackStageSlug);
                            const iterFilter = state.filters.find(f => f.column === 'iteration_number' && f.value === iteration - 1);
                            const userFilter = state.filters.find(f => f.column === 'user_id' && f.value === userId);
                            if (sessionFilter && stageFilter && iterFilter && userFilter) {
                                return { data: [{ id: 'fb-1', storage_bucket: 'test-bucket', storage_path: feedbackPathParts.storagePath, file_name: feedbackPathParts.fileName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedFeedbackPathFs = expectedFeedbackPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedFeedbackPath || path === expectedFeedbackPathFs)) {
                            return { data: new Blob([feedbackContent]), error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path for feedback: ${path}, expected ${expectedFeedbackPath}`) };
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: userId,
                    project_name: "Test Project P100",
                    initial_user_prompt: "Initial prompt for P100",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-p100",
                    dialectic_domains: { name: "Test Domain P100" },
                    process_template_id: 'pt-p100',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: sessionId,
                    project_id: projectId,
                    selected_model_ids: ["model-beta-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-fb',
                    iteration_count: iteration, 
                    session_description: 'Session for feedback test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = iteration;
                const stage: StageContext = {
                    id: "stage-feedback-only", 
                    slug: "curr-stage-fb", 
                    display_name: "Current Feedback Stage", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    recipe_step: createMockRecipeStep([
                        { 
                            type: "feedback", 
                            slug: feedbackStageSlug,
                            required: true,
                            multiple: false
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };
                
                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Initialize spies BEFORE the action
                const storageSpies = spies.storage.from("test-bucket");
                
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);
                
                console.log("--- TEST LOG: should fetch and format only feedback ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("--- END TEST LOG ---");

                assertEquals(result.sourceDocuments.length, 1);
                const doc = result.sourceDocuments[0];
                assertEquals(doc.id, 'fb-1');
                assertEquals(doc.type, "feedback");
                assertEquals(doc.content, feedbackContent);
                assertEquals(doc.metadata.displayName, mockStageDisplayName);
                assertEquals(doc.metadata.header, undefined); // No header defined in rule

                const downloadSpy = storageSpies.downloadSpy;
                assertEquals(downloadSpy.calls.length, 1);
                const actualPath = downloadSpy.calls[0].args[0];
                const expectedFs = expectedFeedbackPath.replace(/\\/g, '/');
                assert(
                    actualPath === expectedFeedbackPath || actualPath === expectedFs,
                    `Expected download path to be '${expectedFeedbackPath}' or '${expectedFs}', got '${actualPath}'`
                );

            } finally {
                teardown();
            }
        });

        await tCtx.step("should fetch and format both documents and feedback when rules specify both", async () => {
            const contribSlug = "prev-contrib-for-both";
            const feedbackSlug = "prev-feedback-for-both";
            const contribDisplayName = "Previous Contribution Stage (Both)";
            const feedbackDisplayName = "Previous Feedback Stage (Both)";
            const modelName = "Model Gamma";
            const contribContent = "Contribution content for both test.";
            const feedbackContent = "Feedback content for both test.";
            const projectId = "p200";
            const sessionId = "s200";
            const iteration = 3;
            const contribStoragePath = "path/to/documents";
            const contribFileName = "gpt-4-turbo_0_feature_spec.md";

            const feedbackPathParts = constructStoragePath({
                projectId,
                sessionId,
                iteration: iteration - 1,
                stageSlug: feedbackSlug,
                fileType: FileType.UserFeedback
            });
            const expectedFeedbackPath = join(feedbackPathParts.storagePath, feedbackPathParts.fileName);

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value)) {
                                const data = [];
                                if (inFilter.value.includes(contribSlug)) data.push({ slug: contribSlug, display_name: contribDisplayName });
                                if (inFilter.value.includes(feedbackSlug)) data.push({ slug: feedbackSlug, display_name: feedbackDisplayName });
                                return { data, error: null, count: data.length, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === sessionId);
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === iteration);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === contribSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: "contrib-both",
                                        project_id: projectId,
                                        user_id: 'u200',
                                        file_name: contribFileName,
                                        storage_bucket: "test-bucket",
                                        storage_path: contribStoragePath,
                                        mime_type: 'text/markdown',
                                        size_bytes: contribContent.length,
                                        resource_type: 'rendered_document',
                                        session_id: sessionId,
                                        iteration_number: iteration,
                                        stage_slug: contribSlug,
                                        source_contribution_id: 'contrib-gamma-id',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            const idFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'id');
                            if (idFilter && idFilter.value === 'contrib-gamma-id') {
                                return { data: [{ id: 'contrib-gamma-id', model_name: modelName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 406, statusText: "OK" };
                        }
                    },
                    'dialectic_feedback': {
                        select: async (state: MockQueryBuilderState) => {
                            const sessionFilter = state.filters.find(f => f.column === 'session_id' && f.value === sessionId);
                            const stageFilter = state.filters.find(f => f.column === 'stage_slug' && f.value === feedbackSlug);
                            const iterFilter = state.filters.find(f => f.column === 'iteration_number' && f.value === iteration - 1);
                            const userFilter = state.filters.find(f => f.column === 'user_id' && f.value === 'u200');
                            if (sessionFilter && stageFilter && iterFilter && userFilter) {
                                return { data: [{ id: 'fb-both', storage_bucket: 'test-bucket', storage_path: feedbackPathParts.storagePath, file_name: feedbackPathParts.fileName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedContribPath = join(contribStoragePath, contribFileName);
                        const expectedContribPathFs = expectedContribPath.replace(/\\/g, '/');
                        const expectedFeedbackPathFs = expectedFeedbackPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedContribPath || path === expectedContribPathFs)) {
                            return { data: new Blob([contribContent]), error: null };
                        }
                        if (bucketId === "test-bucket" && (path === expectedFeedbackPath || path === expectedFeedbackPathFs)) {
                            return { data: new Blob([feedbackContent]), error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path (both): ${path}`) };
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: 'u200',
                    project_name: "Test Project P200",
                    initial_user_prompt: "Initial prompt for P200",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-p200",
                    dialectic_domains: { name: "Test Domain P200" },
                    process_template_id: 'pt-p200',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: sessionId,
                    project_id: projectId,
                    selected_model_ids: ["model-gamma-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-both',
                    iteration_count: iteration, 
                    session_description: 'Session for both test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = iteration;
                const stage: StageContext = {
                    id: "stage-both-types", 
                    slug: "curr-stage-both", 
                    display_name: "Current Stage Both", 
                    description: null, 
                    system_prompts: null,
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    recipe_step: createMockRecipeStep([
                        { 
                            type: "document", 
                            slug: contribSlug,
                            required: true,
                            multiple: false,
                            section_header: "Contributions from contrib-slug-for-both stage",
                        },
                        { 
                            type: "feedback", 
                            slug: feedbackSlug,
                            required: true,
                            multiple: false,
                            section_header: "Feedback from feedback-slug-for-both stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Initialize spies BEFORE the action
                const storageSpies = spies.storage.from("test-bucket");
                
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                console.log("--- TEST LOG: should fetch and format both contributions and feedback ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("--- END TEST LOG ---");

                assertEquals(result.sourceDocuments.length, 2);
                
                const contribDoc = result.sourceDocuments.find(d => d.type === 'document');
                const feedbackDoc = result.sourceDocuments.find(d => d.type === 'feedback');

                assertEquals(!!contribDoc, true, "Contribution document not found in result");
                assertEquals(contribDoc?.id, "contrib-both");
                assertEquals(contribDoc?.content, contribContent);
                assertEquals(contribDoc?.metadata.header, "Contributions from contrib-slug-for-both stage");
                assertEquals(contribDoc?.metadata.displayName, contribDisplayName);
                // modelName is extracted from file_name (model slug), not from contributions query
                assertEquals(contribDoc?.metadata.modelName, "gpt-4-turbo");

                assertEquals(!!feedbackDoc, true, "Feedback document not found in result");
                assertEquals(feedbackDoc?.id, "fb-both");
                assertEquals(feedbackDoc?.content, feedbackContent);
                assertEquals(feedbackDoc?.metadata.header, "Feedback from feedback-slug-for-both stage");
                assertEquals(feedbackDoc?.metadata.displayName, feedbackDisplayName);

                const downloadSpy = storageSpies.downloadSpy;
                assertEquals(downloadSpy.calls.length, 2, "Expected two download calls");
            } finally {
                teardown();
            }
        });

        await tCtx.step("should use custom section_headers when provided in rules", async () => {
            const customContribHeader = "## Prior Art Review (AI Generated)";
            const customFeedbackHeader = "## Human Editor Notes";
            const contribSlug = "prev-contrib-custom-header";
            const feedbackSlug = "prev-feedback-custom-header";
            const modelName = "Model Custom";
            const contribContent = "Custom header contribution.";
            const feedbackContent = "Custom header feedback.";
            const projectId = "p300";
            const sessionId = "s300";
            const iteration = 1;
            const contribStoragePath = "path/documents";
            const contribFileName = "ch.md";
            const feedbackPathParts = constructStoragePath({
                projectId,
                sessionId,
                iteration: 1, // Feedback is from previous iteration, which is 1
                stageSlug: feedbackSlug,
                fileType: FileType.UserFeedback
            });
            const expectedFeedbackPath = join(feedbackPathParts.storagePath, feedbackPathParts.fileName);
            const expectedContribPath = join(contribStoragePath, contribFileName);

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value)) {
                                const data: {slug: string, display_name: string}[] = [];
                                if (inFilter.value.includes(contribSlug)) data.push({ slug: contribSlug, display_name: "Contrib Stage CH" });
                                if (inFilter.value.includes(feedbackSlug)) data.push({ slug: feedbackSlug, display_name: "Feedback Stage CH" });
                                return { data, error: null, count: data.length, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === sessionId);
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === iteration);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === contribSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: "contrib-ch",
                                        project_id: projectId,
                                        user_id: 'u1',
                                        file_name: contribFileName,
                                        storage_bucket: "test-bucket",
                                        storage_path: contribStoragePath,
                                        mime_type: 'text/markdown',
                                        size_bytes: contribContent.length,
                                        resource_type: 'rendered_document',
                                        session_id: sessionId,
                                        iteration_number: iteration,
                                        stage_slug: contribSlug,
                                        source_contribution_id: 'contrib-custom-id',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: [{ id: 'contrib-custom-id', model_name: modelName }], error: null, count: 1, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_feedback': {
                         select: async (state: MockQueryBuilderState) => {
                            const sessionFilter = state.filters.find(f => f.column === 'session_id' && f.value === sessionId);
                            const stageFilter = state.filters.find(f => f.column === 'stage_slug' && f.value === feedbackSlug);
                            const iterFilter = state.filters.find(f => f.column === 'iteration_number' && f.value === 1); // targetIteration is 1 when iteration is 1
                            const userFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.column === 'user_id' && f.value === 'u300');
                            if (sessionFilter && stageFilter && iterFilter && userFilter) {
                                return { data: [{ id: "fb-ch", storage_bucket: 'test-bucket', storage_path: feedbackPathParts.storagePath, file_name: feedbackPathParts.fileName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            // Debugging fallback if filters fail
                            // console.log("Feedback mock filters failed:", { sessionFilter, stageFilter, iterFilter, userFilter, filters: state.filters });
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedContribPathFs = expectedContribPath.replace(/\\/g, '/');
                        const expectedFeedbackPathFs = expectedFeedbackPath.replace(/\\/g, '/');
                        if (
                            bucketId === "test-bucket" &&
                            (path === expectedContribPath || path === expectedContribPathFs)
                        ) return { data: new Blob([contribContent]), error: null };
                        if (
                            bucketId === "test-bucket" &&
                            (path === expectedFeedbackPath || path === expectedFeedbackPathFs)
                        ) return { data: new Blob([feedbackContent]), error: null };
                        return { data: null, error: new Error(`Unexpected download path (custom header): ${path}`) };
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: 'u300',
                    project_name: "Test Project P300",
                    initial_user_prompt: "Initial prompt for P300",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-p300",
                    dialectic_domains: { name: "Test Domain P300" },
                    process_template_id: 'pt-p300',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: sessionId,
                    project_id: projectId,
                    selected_model_ids: ["model-custom-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-ch',
                    iteration_count: iteration, 
                    session_description: 'Session for custom header test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = iteration;
                const stage: StageContext = {
                    id: "stage-custom-headers", 
                    slug: "curr-stage-ch", 
                    display_name: "Current Stage Custom Headers", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    recipe_step: createMockRecipeStep([
                        { 
                            type: "document", 
                            slug: contribSlug, 
                            section_header: customContribHeader,
                            required: true,
                            multiple: false,
                        },
                        { 
                            type: "feedback", 
                            slug: feedbackSlug, 
                            section_header: customFeedbackHeader, 
                            required: true, 
                            multiple: false,
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Initialize spies BEFORE the action
                const storageSpies = spies.storage.from("test-bucket");
                
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                console.log("--- TEST LOG: should use custom section_headers ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("--- END TEST LOG ---");

                assertEquals(result.sourceDocuments.length, 2);

                const contribDoc = result.sourceDocuments.find(d => d.type === 'document');
                const feedbackDoc = result.sourceDocuments.find(d => d.type === 'feedback');

                assertEquals(!!contribDoc, true, "Custom header contribution document not found");
                assertEquals(contribDoc?.content, contribContent);
                assertEquals(contribDoc?.metadata.header, customContribHeader);

                assertEquals(!!feedbackDoc, true, "Custom header feedback document not found");
                assertEquals(feedbackDoc?.id, "fb-ch");
                assertEquals(feedbackDoc?.content, feedbackContent);
                assertEquals(feedbackDoc?.metadata.header, customFeedbackHeader);

                const downloadSpy = storageSpies.downloadSpy;
                assertEquals(downloadSpy.calls.length, 2, "Expected two download calls for custom headers test");
            } finally {
                teardown();
            }
        });

        await tCtx.step("should handle optional feedback file not found without error, returning empty content for it", async () => {
            const optionalFeedbackSlug = "prev-stage-optional-feedback";
            const optionalFeedbackDisplayName = "Optional Feedback Stage";
            const projectId = "p400";
            const userId = 'u400';
            const sessionId = "s400";
            const iteration = 1;

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                         select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(optionalFeedbackSlug)) {
                                return { data: [{ slug: optionalFeedbackSlug, display_name: optionalFeedbackDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_feedback': {
                        select: async (state: MockQueryBuilderState) => {
                            const userFilter = state.filters.find(f => f.column === 'user_id' && f.value === userId);
                            if (!userFilter) {
                                // If the filter is missing, return something unexpected to make the test fail in a clear way.
                                return { data: [], error: new Error("Missing user_id filter in feedback query mock") };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async () => {
                        return { data: null, error: new Error(`Download should not be called`) };
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: userId,
                    project_name: "Test Project P400",
                    initial_user_prompt: "Initial prompt for P400",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-p400",
                    dialectic_domains: { name: "Test Domain P400" },
                    process_template_id: 'pt-p400',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: sessionId,
                    project_id: projectId,
                    selected_model_ids: ["model-optfb-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-opt-fb',
                    iteration_count: iteration, 
                    session_description: 'Session for optional feedback test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = iteration;
                const stage: StageContext = {
                    id: "stage-optional-fb", 
                    slug: "curr-stage-opt-fb", 
                    display_name: "Current Stage Optional Feedback", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    recipe_step: createMockRecipeStep([
                        { 
                            type: "feedback", 
                            slug: optionalFeedbackSlug, 
                            required: false,
                            multiple: false,
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                let errorThrown = false;
                let result: GatheredRecipeContext | null = null;
                try {
                     const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                     result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);
                } catch (e) {
                    errorThrown = true;
                    console.error("Test unexpectedly threw an error:", e)
                }
                
                assertEquals(errorThrown, false, "Error was unexpectedly thrown for missing optional feedback.");
                assertEquals(result?.sourceDocuments.length, 0, "Result should be empty");
                
                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 0);
            } finally {
                teardown();
            }
        });

        await tCtx.step("should throw error if required feedback file is not found", async () => {
            const requiredFeedbackSlug = "prev-stage-req-feedback";
            const requiredFeedbackDisplayName = "Required Feedback Stage";
            const projectId = "p500";
            const userId = 'u500';
            const sessionId = "s500";
            const iteration = 1;

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                         select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(requiredFeedbackSlug)) {
                                return { data: [{ slug: requiredFeedbackSlug, display_name: requiredFeedbackDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                       }
                    },
                    'dialectic_feedback': {
                        select: async (state: MockQueryBuilderState) => {
                             const userFilter = state.filters.find(f => f.column === 'user_id' && f.value === userId);
                            if (!userFilter) {
                                return { data: [], error: new Error("Missing user_id filter in required feedback query mock") };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        return { data: null, error: new Error(`Unexpected download path (required feedback): ${path}`) };
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);
            
            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: userId,
                    project_name: "Test Project P500",
                    initial_user_prompt: "Initial prompt for P500",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-p500",
                    dialectic_domains: { name: "Test Domain P500" },
                    process_template_id: 'pt-p500',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: sessionId,
                    project_id: projectId,
                    selected_model_ids: ["model-reqfb-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-req-fb',
                    iteration_count: iteration, 
                    session_description: 'Session for required feedback test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = iteration;
                const stage: StageContext = {
                    id: "stage-req-fb", 
                    slug: "curr-stage-req-fb", 
                    display_name: "Current Stage Required Feedback", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    recipe_step: createMockRecipeStep([
                        { 
                            type: "feedback", 
                            slug: requiredFeedbackSlug, 
                            required: true,
                            multiple: false,
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                await assertRejects(
                    async () => {
                        const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                        await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);
                    },
                    Error,
                    `Required feedback for stage '${requiredFeedbackDisplayName}' was not found.`
                );
                
                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 0);
            } finally {
                teardown();
            }
        });

        await tCtx.step("should throw error if DB query for REQUIRED contributions fails", async () => {
            const contribStageSlug = "contrib-stage-db-error-req";
            const mockStageDisplayName = "DB Error Required Stage";
            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(contribStageSlug))) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null };
                            }
                            return { data: [], error: null };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: null, error: new Error("Simulated DB Error"), count: 0, status: 500, statusText: "Internal Server Error" };
                        }
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-db-err-req", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-db-err-req", project_id: "p-db-err-req", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-db-err-req", 
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        { type: "document", slug: contribStageSlug, required: true, multiple: false }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                await assertRejects(
                    async () => {
                        const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                        await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, 1)
                    },
                    Error,
                    `Required rendered document for stage '${mockStageDisplayName}' with document_key 'unspecified' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`
                );
            } finally {
                teardown();
            }
        });

        await tCtx.step("should return placeholder and log error if DB query for OPTIONAL contributions fails", async () => {
            const contribStageSlug = "contrib-stage-db-error-opt";
            const mockStageDisplayName = "DB Error Optional Stage";
            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(contribStageSlug))) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null };
                            }
                            return { data: [], error: null };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: null, error: new Error("Simulated DB Error Optional"), count: 0, status: 500, statusText: "Internal Server Error" };
                        }
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-ms-opt", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-ms-opt", project_id: "p-ms-opt", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-ms-opt", 
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        { type: "document", slug: contribStageSlug, required: false, multiple: false, section_header: "Optional Contributions Missing Storage" }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, 1);

                assertEquals(result.sourceDocuments.length, 0, "Result should be empty");
            } finally {
                teardown();
            }
        });

        await tCtx.step("should throw error if download for REQUIRED contribution content fails", async () => {
            const contribStageSlug = "contrib-content-dl-error-req";
            const mockStageDisplayName = "Content Download Error Required Stage";
            const badContentContribId = "bad-content-dl-req";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(contribStageSlug))) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null };
                            }
                            return { data: [], error: null };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's-cdl-err-req');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === contribStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: badContentContribId,
                                        project_id: 'p-cdl-err-req',
                                        user_id: 'u1',
                                        file_name: "required_content_error.md",
                                        storage_bucket: "test-bucket",
                                        storage_path: "path/to/documents",
                                        mime_type: 'text/markdown',
                                        size_bytes: 0,
                                        resource_type: 'rendered_document',
                                        session_id: 's-cdl-err-req',
                                        iteration_number: 1,
                                        stage_slug: contribStageSlug,
                                        source_contribution_id: 'contrib-cdl-error-req-id',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: [{ id: 'contrib-cdl-error-req-id', model_name: "Model Content Error Req" }], error: null, count: 1, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (path.includes("required_content_error.md")) {
                            return { data: null, error: new Error("Simulated Content Download Error") };
                        }
                        return { data: new Blob(["This should not be returned for this test"]), error: null };
                    }
                }
            };
            const { mockSupabaseClient } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-cdl-err-req", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-cdl-err-req", project_id: "p-cdl-err-req", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-cdl-err-req", 
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        { type: "document", slug: contribStageSlug, required: true, multiple: false }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                await assertRejects(
                    async () => {
                        const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                        await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, 1)
                    },
                    Error,
                    `Failed to download REQUIRED rendered document ${badContentContribId} from stage '${mockStageDisplayName}'.`
                );
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 && 
                    typeof call.args[0] === 'string' && 
                    call.args[0].includes(`Failed to download rendered document from resources.`)
                ), true, "Expected console.error for content download failure");
            } finally {
                teardown();
            }
        });

        await tCtx.step("should return empty for that item and log error if download for OPTIONAL contribution content fails", async () => {
            const contribStageSlug = "contrib-content-dl-error-opt";
            const mockStageDisplayName = "Content Download Error Optional Stage";
            const badContentContribId = "bad-content-dl-opt";
            const sectionHeader = "Optional Contributions With Content Download Error";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(contribStageSlug))) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null };
                            }
                            return { data: [], error: null };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's-cdl-err-opt');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === contribStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: badContentContribId,
                                        project_id: 'p-cdl-err-opt',
                                        user_id: 'u1',
                                        file_name: "optional_content_error.md",
                                        storage_bucket: "test-bucket",
                                        storage_path: "path/to/documents",
                                        mime_type: 'text/markdown',
                                        size_bytes: 0,
                                        resource_type: 'rendered_document',
                                        session_id: 's-cdl-err-opt',
                                        iteration_number: 1,
                                        stage_slug: contribStageSlug,
                                        source_contribution_id: 'contrib-ms-opt-id',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: [{ id: 'contrib-ms-opt-id', model_name: "Model Content Error Opt" }], error: null, count: 1, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (path.includes("optional_content_error.md")) {
                            return { data: null, error: new Error("Simulated Content Download Error Optional") };
                        }
                        return { data: new Blob(["This should not be returned for this test"]), error: null };
                    }
                }
            };
            const { mockSupabaseClient, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-cdl-err-opt", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-cdl-err-opt", project_id: "p-cdl-err-opt", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-cdl-err-opt", 
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        { type: "document", slug: contribStageSlug, required: false, multiple: false, section_header: sectionHeader }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, 1);

                assertEquals(result.sourceDocuments.length, 0, "Result should be empty");
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 &&
                    typeof call.args[0] === 'string' &&
                    call.args[0].includes(`Failed to download rendered document from resources.`)
                ), true, "Expected console.error for content download failure");
            } finally {
                teardown();
            }
        });

        await tCtx.step("should throw error if REQUIRED contribution is missing storage details", async () => {
            const contribStageSlug = "contrib-missing-storage-req";
            const mockStageDisplayName = "Missing Storage Required Stage";
            const badContribId = "bad-storage-contrib-req";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(contribStageSlug))) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null };
                            }
                            return { data: [], error: null };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's-ms-req');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === contribStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: badContribId,
                                        project_id: 'p-ms-req',
                                        user_id: 'u1',
                                        file_name: "missing_path_req.md",
                                        storage_bucket: null, /* Key: Missing bucket */
                                        storage_path: null, /* Key: Missing path */
                                        mime_type: 'text/markdown',
                                        size_bytes: 0,
                                        resource_type: 'rendered_document',
                                        session_id: 's-ms-req',
                                        iteration_number: 1,
                                        stage_slug: contribStageSlug,
                                        source_contribution_id: 'contrib-ms-req-id',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: [{ id: 'contrib-ms-req-id', model_name: "Model Missing Storage Req" }], error: null, count: 1, status: 200, statusText: "OK" };
                        }
                    }
                },
                // No storageMock needed as download should not be attempted if path/bucket is missing
            };
            const { mockSupabaseClient, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-ms-req", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-ms-req", project_id: "p-ms-req", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-ms-req", 
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        { type: "document", slug: contribStageSlug, required: true, multiple: false }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                await assertRejects(
                    async () => {
                        const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                        await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, 1)
                    },
                    Error,
                    `REQUIRED Resource ${badContribId} from stage '${mockStageDisplayName}' is missing storage details.`
                );
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 && 
                    typeof call.args[0] === 'string' && 
                    call.args[0].includes(`Resource ${badContribId} is missing storage details`)
                ), true, "Expected console.error for missing storage details");
            } finally {
                teardown();
            }
        });

        await tCtx.step("should log warning and return empty for item if OPTIONAL contribution is missing storage details", async () => {
            const contribStageSlug = "contrib-missing-storage-opt";
            const mockStageDisplayName = "Missing Storage Optional Stage";
            const badContribId = "bad-storage-contrib-opt";
            const sectionHeader = "Optional Contributions Missing Storage";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'slug' && Array.isArray(f.value) && f.value.includes(contribStageSlug))) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null };
                            }
                            return { data: [], error: null };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's-ms-opt');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === contribStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: badContribId,
                                        project_id: 'p-ms-opt',
                                        user_id: 'u1',
                                        file_name: "missing_bucket_opt.md",
                                        storage_bucket: null, /* Key: Missing bucket */
                                        storage_path: "some/path",
                                        mime_type: 'text/markdown',
                                        size_bytes: 0,
                                        resource_type: 'rendered_document',
                                        session_id: 's-ms-opt',
                                        iteration_number: 1,
                                        stage_slug: contribStageSlug,
                                        source_contribution_id: 'contrib-ms-opt-id',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: [{ id: 'contrib-ms-opt-id', model_name: "Model Missing Storage Opt" }], error: null, count: 1, status: 200, statusText: "OK" };
                        }
                    }
                },
                // No storageMock needed
            };
            const { mockSupabaseClient, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-ms-opt", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-ms-opt", project_id: "p-ms-opt", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-ms-opt", 
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        { type: "document", slug: contribStageSlug, required: false, multiple: false, section_header: sectionHeader }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, 1);

                assertEquals(result.sourceDocuments.length, 0, "Result should be empty");
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 &&
                    typeof call.args[0] === 'string' &&
                    call.args[0].includes(`Resource ${badContribId} is missing storage details`)
                ), true, "Expected console.error for missing storage details on optional item");
            } finally {
                teardown();
            }
        });

        // Step 53.b.i: Test that queries dialectic_project_resources for finished rendered documents
        await tCtx.step("53.b.i: should query dialectic_project_resources for finished rendered documents", async () => {
            const docStageSlug = "prev-stage-resource";
            const mockStageDisplayName = "Previous Resource Stage";
            const documentKey = FileType.business_case;
            const modelSlug = "gpt-4-turbo";
            const attemptCount = 0;
            const resourceContent = "This is rendered document content from resources.";
            const storagePath = "p-resource/session_s1/iteration_1/thesis/documents";
            const fileName = `${modelSlug}_${attemptCount}_${documentKey}.md`;
            const resourceId = "resource-1";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(docStageSlug)) {
                                return { data: [{ slug: docStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's-resource');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === docStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: resourceId,
                                        project_id: 'p-resource',
                                        user_id: 'u-resource',
                                        file_name: fileName,
                                        storage_bucket: 'test-bucket',
                                        storage_path: storagePath,
                                        mime_type: 'text/markdown',
                                        size_bytes: resourceContent.length,
                                        resource_type: 'rendered_document',
                                        session_id: 's-resource',
                                        iteration_number: 1,
                                        stage_slug: docStageSlug,
                                        source_contribution_id: 'contrib-1',
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedPath = join(storagePath, fileName);
                        const expectedPathFs = expectedPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedPath || path === expectedPathFs)) {
                            return { data: new Blob([resourceContent]), error: null };
                        }
                        return { data: null, error: new Error("Unexpected download path in mock") };
                    }
                }
            };

            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = {
                    id: "p-resource",
                    user_id: 'u-resource',
                    project_name: "Test Project Resource",
                    initial_user_prompt: "Initial prompt for resource test",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-resource",
                    dialectic_domains: { name: "Test Domain Resource" },
                    process_template_id: 'pt-resource',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s-resource",
                    project_id: "p-resource",
                    selected_model_ids: ["model-resource-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-resource',
                    iteration_count: 1,
                    session_description: 'Session for resource test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = 1;
                const stage: StageContext = {
                    id: "stage-resource",
                    slug: "curr-stage-resource",
                    display_name: "Current Resource Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        {
                            type: "document",
                            slug: docStageSlug,
                            document_key: documentKey,
                            required: true,
                            multiple: false,
                            section_header: "Documents from resource stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Initialize spies BEFORE the action
                const storageSpies = spies.storage.from("test-bucket");
                
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                // Assert that dialectic_project_resources was queried
                const resourcesTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'select');
                assert(resourcesTableSpies && resourcesTableSpies.callCount > 0, "Expected dialectic_project_resources to be queried");

                // Assert that the function found the rendered document
                assertEquals(result.sourceDocuments.length, 1, "Expected one document from resources");
                const doc = result.sourceDocuments[0];
                assertEquals(doc.id, resourceId, "Expected document ID to match resource ID");
                assertEquals(doc.type, "document", "Expected document type");
                assertEquals(doc.content, resourceContent, "Expected content to match downloaded resource content");
                assertEquals(doc.metadata.displayName, mockStageDisplayName, "Expected display name to match");

                // Assert that content was downloaded from resource's storage_path and file_name
                const downloadSpy = storageSpies.downloadSpy;
                assertEquals(downloadSpy.calls.length, 1, "Expected one download call");
                const actualPath = downloadSpy.calls[0].args[0];
                const expectedJoined = join(storagePath, fileName);
                const expectedFs = expectedJoined.replace(/\\/g, '/');
                assert(
                    actualPath === expectedJoined || actualPath === expectedFs,
                    `Expected download path to be '${expectedJoined}' or '${expectedFs}', got '${actualPath}'`
                );
            } finally {
                teardown();
            }
        });

        // Step 53.b.ii: Test that prefers resources over contributions when both exist
        await tCtx.step("53.b.ii: should prefer resources over contributions when both exist", async () => {
            const docStageSlug = "prev-stage-both";
            const mockStageDisplayName = "Previous Both Stage";
            const documentKey = FileType.feature_spec;
            const modelSlug = "gpt-4-turbo";
            const attemptCount = 0;
            const resourceContent = "This is rendered document content from resources.";
            const contributionContent = "This is raw chunk content from contributions.";
            const storagePath = "p-both/session_s2/iteration_1/thesis/documents";
            const fileName = `${modelSlug}_${attemptCount}_${documentKey}.md`;
            const resourceId = "resource-2";
            const contributionId = "contrib-2";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(docStageSlug)) {
                                return { data: [{ slug: docStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async (state: MockQueryBuilderState) => {
                            const resourceTypeFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'resource_type' && f.value === 'rendered_document');
                            const sessionFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'session_id' && f.value === 's-both');
                            const iterationFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'iteration_number' && f.value === 1);
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage_slug' && f.value === docStageSlug);
                            if (resourceTypeFilter && sessionFilter && iterationFilter && stageFilter) {
                                return {
                                    data: [{
                                        id: resourceId,
                                        project_id: 'p-both',
                                        user_id: 'u-both',
                                        file_name: fileName,
                                        storage_bucket: 'test-bucket',
                                        storage_path: storagePath,
                                        mime_type: 'text/markdown',
                                        size_bytes: resourceContent.length,
                                        resource_type: 'rendered_document',
                                        session_id: 's-both',
                                        iteration_number: 1,
                                        stage_slug: docStageSlug,
                                        source_contribution_id: contributionId,
                                        resource_description: null,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage' && f.value === docStageSlug);
                            if (stageFilter) {
                                return {
                                    data: [{
                                        id: contributionId,
                                        storage_path: storagePath,
                                        file_name: fileName,
                                        storage_bucket: "test-bucket",
                                        model_name: "Model Both",
                                        session_id: 's-both',
                                        iteration_number: 1,
                                        stage: docStageSlug,
                                        is_latest_edit: true,
                                        created_at: new Date().toISOString(),
                                        user_id: 'u-both',
                                        content_type: 'text/markdown',
                                        raw_text_content: null,
                                        word_count: null,
                                        token_count: null,
                                        dialectic_project_id: 'p-both',
                                        model_id: "model-both-id",
                                        prompt_template_id_used: null,
                                        seed_prompt_url: null,
                                        edit_version: 1,
                                        original_model_contribution_id: null,
                                        raw_response_storage_path: null,
                                        target_contribution_id: null,
                                        tokens_used_input: null,
                                        tokens_used_output: null,
                                        processing_time_ms: null,
                                        error: null,
                                        citations: null,
                                        updated_at: new Date().toISOString(),
                                        contribution_type: "model_generated",
                                        size_bytes: null,
                                        mime_type: "text/markdown"
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedPath = join(storagePath, fileName);
                        const expectedPathFs = expectedPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedPath || path === expectedPathFs)) {
                            return { data: new Blob([resourceContent]), error: null };
                        }
                        return { data: null, error: new Error("Unexpected download path in mock") };
                    }
                }
            };

            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = {
                    id: "p-both",
                    user_id: 'u-both',
                    project_name: "Test Project Both",
                    initial_user_prompt: "Initial prompt for both test",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-both",
                    dialectic_domains: { name: "Test Domain Both" },
                    process_template_id: 'pt-both',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s-both",
                    project_id: "p-both",
                    selected_model_ids: ["model-both-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-both',
                    iteration_count: 1,
                    session_description: 'Session for both test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = 1;
                const stage: StageContext = {
                    id: "stage-both",
                    slug: "curr-stage-both",
                    display_name: "Current Both Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        {
                            type: "document",
                            slug: docStageSlug,
                            document_key: documentKey,
                            required: true,
                            multiple: false,
                            section_header: "Documents from both stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                // Assert that resources were queried first
                const resourcesTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'select');
                assert(resourcesTableSpies && resourcesTableSpies.callCount > 0, "Expected dialectic_project_resources to be queried");

                // Assert that only one document is added (from resources, not contributions)
                assertEquals(result.sourceDocuments.length, 1, "Expected only one document (from resources, not contributions)");
                const doc = result.sourceDocuments[0];
                assertEquals(doc.id, resourceId, "Expected document ID to match resource ID (not contribution ID)");
                assertEquals(doc.content, resourceContent, "Expected content to match resource content (not contribution content)");

                // Assert that contributions were NOT queried (resources are sufficient)
                const contributionsTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'select');
                // This test will fail initially because the function currently queries contributions
                // After the fix, contributions should NOT be queried for document-type inputs
                assert(contributionsTableSpies === undefined || contributionsTableSpies.callCount === 0, "Expected dialectic_contributions NOT to be queried when resources are found");
            } finally {
                teardown();
            }
        });

        // Step 53.b.iii: Test that throws error when resources not found for required rules
        await tCtx.step("53.b.iii: should throw error when required rendered document is not found in resources", async () => {
            const docStageSlug = "prev-stage-missing";
            const mockStageDisplayName = "Previous Missing Stage";
            const documentKey = FileType.technical_approach;

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(docStageSlug)) {
                                return { data: [{ slug: docStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async () => {
                            // Return empty - no resources found
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async () => {
                            // This should NOT be queried when resources are not found for required rules
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    }
                }
            };

            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = {
                    id: "p-missing",
                    user_id: 'u-missing',
                    project_name: "Test Project Missing",
                    initial_user_prompt: "Initial prompt for missing test",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-missing",
                    dialectic_domains: { name: "Test Domain Missing" },
                    process_template_id: 'pt-missing',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s-missing",
                    project_id: "p-missing",
                    selected_model_ids: ["model-missing-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-missing',
                    iteration_count: 1,
                    session_description: 'Session for missing test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = 1;
                const stage: StageContext = {
                    id: "stage-missing",
                    slug: "curr-stage-missing",
                    display_name: "Current Missing Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        {
                            type: "document",
                            slug: docStageSlug,
                            document_key: documentKey,
                            required: true,
                            multiple: false,
                            section_header: "Documents from missing stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Assert that error is thrown immediately
                await assertRejects(
                    async () => {
                        await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);
                    },
                    Error,
                    `Required rendered document for stage '${mockStageDisplayName}' with document_key '${documentKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`
                );

                // Assert that resources were queried
                const resourcesTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'select');
                assert(resourcesTableSpies && resourcesTableSpies.callCount > 0, "Expected dialectic_project_resources to be queried");

                // Assert that contributions were NOT queried (finished documents must be in resources, not contributions)
                const contributionsTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'select');
                assert(contributionsTableSpies === undefined || contributionsTableSpies.callCount === 0, "Expected dialectic_contributions NOT to be queried when resources are not found for required rules");
            } finally {
                teardown();
            }
        });

        // Step 53.b.iv: Test that continues to query contributions for header_context type inputs
        await tCtx.step("53.b.iv: should continue to query dialectic_contributions for header_context type inputs", async () => {
            const headerContextStageSlug = "prev-stage-header";
            const mockStageDisplayName = "Previous Header Context Stage";
            const headerContextContent = "This is header context content from contributions.";
            const storagePath = "p-header/session_s3/iteration_1/thesis";
            const fileName = "gpt-4-turbo_0_header_context.json";
            const contributionId = "contrib-header";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(headerContextStageSlug)) {
                                return { data: [{ slug: headerContextStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_project_resources': {
                        select: async () => {
                            // Resources should NOT be queried for header_context type inputs
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage' && f.value === headerContextStageSlug);
                            if (stageFilter) {
                                return {
                                    data: [{
                                        id: contributionId,
                                        storage_path: storagePath,
                                        file_name: fileName,
                                        storage_bucket: "test-bucket",
                                        model_name: "Model Header",
                                        session_id: 's-header',
                                        iteration_number: 1,
                                        stage: headerContextStageSlug,
                                        is_latest_edit: true,
                                        created_at: new Date().toISOString(),
                                        user_id: 'u-header',
                                        content_type: 'application/json',
                                        raw_text_content: null,
                                        word_count: null,
                                        token_count: null,
                                        dialectic_project_id: 'p-header',
                                        model_id: "model-header-id",
                                        prompt_template_id_used: null,
                                        seed_prompt_url: null,
                                        edit_version: 1,
                                        original_model_contribution_id: null,
                                        raw_response_storage_path: null,
                                        target_contribution_id: null,
                                        tokens_used_input: null,
                                        tokens_used_output: null,
                                        processing_time_ms: null,
                                        error: null,
                                        citations: null,
                                        updated_at: new Date().toISOString(),
                                        contribution_type: "model_generated",
                                        size_bytes: null,
                                        mime_type: "application/json"
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedPath = join(storagePath, fileName);
                        const expectedPathFs = expectedPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedPath || path === expectedPathFs)) {
                            return { data: new Blob([headerContextContent]), error: null };
                        }
                        return { data: null, error: new Error("Unexpected download path in mock") };
                    }
                }
            };

            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = {
                    id: "p-header",
                    user_id: 'u-header',
                    project_name: "Test Project Header",
                    initial_user_prompt: "Initial prompt for header test",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-header",
                    dialectic_domains: { name: "Test Domain Header" },
                    process_template_id: 'pt-header',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s-header",
                    project_id: "p-header",
                    selected_model_ids: ["model-header-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-header',
                    iteration_count: 1,
                    session_description: 'Session for header test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = 1;
                const stage: StageContext = {
                    id: "stage-header",
                    slug: "curr-stage-header",
                    display_name: "Current Header Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        {
                            type: "header_context",
                            slug: headerContextStageSlug,
                            required: true,
                            multiple: false,
                            section_header: "Header context from previous stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                
                // Initialize spies BEFORE the action
                const storageSpies = spies.storage.from("test-bucket");
                
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                // Assert that contributions were queried for header_context
                const contributionsTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'select');
                assert(contributionsTableSpies && contributionsTableSpies.callCount > 0, "Expected dialectic_contributions to be queried for header_context type inputs");

                // Assert that resources were NOT queried (header_context is stored in contributions, not resources)
                const resourcesTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'select');
                assert(resourcesTableSpies === undefined || resourcesTableSpies.callCount === 0, "Expected dialectic_project_resources NOT to be queried for header_context type inputs");

                // Assert that header_context was found in contributions
                assertEquals(result.sourceDocuments.length, 1, "Expected one document from contributions");
                const doc = result.sourceDocuments[0];
                assertEquals(doc.id, contributionId, "Expected document ID to match contribution ID");
                assertEquals(doc.content, headerContextContent, "Expected content to match downloaded contribution content");

                const downloadSpy = storageSpies.downloadSpy;
                assertEquals(downloadSpy.calls.length, 1, "Expected one download call");
            } finally {
                teardown();
            }
        });

        // Step 53.b.v: Test that queries dialectic_contributions for contribution type inputs
        await tCtx.step("53.b.v: should query dialectic_contributions for contribution type inputs", async () => {
            const contribStageSlug = "prev-stage-contrib";
            const mockStageDisplayName = "Previous Contribution Stage";
            const contribContent = "This is raw contribution content.";
            const storagePath = "p-contrib/session_s4/iteration_1/thesis";
            const fileName = "gpt-4-turbo_0_comparison_vector.json";
            const contributionId = "contrib-generic";
            const documentKey = FileType.comparison_vector;

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(contribStageSlug)) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            // Check for stage filter (eq)
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage' && f.value === contribStageSlug);
                            
                            // Check for OR filter (used for document_key in gatherInputsForStage)
                            const orFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'or');
                            const orMatch = orFilter && typeof orFilter.filters === 'string' && orFilter.filters.includes(documentKey);

                            // Check for fallback ilike filter (if implementation changes back or for robustness)
                            const nameFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'ilike' && f.column === 'file_name');
                            const nameMatch = nameFilter && typeof nameFilter.value === 'string' && nameFilter.value.includes(documentKey);
                            
                            if (stageFilter && (orMatch || nameMatch)) {
                                return {
                                    data: [{
                                        id: contributionId,
                                        storage_path: storagePath,
                                        file_name: fileName,
                                        storage_bucket: "test-bucket",
                                        model_name: "Model Contrib",
                                        session_id: 's-contrib',
                                        iteration_number: 1,
                                        stage: contribStageSlug,
                                        is_latest_edit: true,
                                        created_at: new Date().toISOString(),
                                        user_id: 'u-contrib',
                                        content_type: 'application/json',
                                        dialectic_project_id: 'p-contrib',
                                        model_id: "model-contrib-id",
                                        updated_at: new Date().toISOString(),
                                        contribution_type: "model_generated",
                                        mime_type: "application/json"
                                    }],
                                    error: null,
                                    count: 1,
                                    status: 200,
                                    statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedPath = join(storagePath, fileName);
                        const expectedPathFs = expectedPath.replace(/\\/g, '/');
                        if (bucketId === "test-bucket" && (path === expectedPath || path === expectedPathFs)) {
                            return { data: new Blob([contribContent]), error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path in mock: ${path}`) };
                    }
                }
            };

            const { mockSupabaseClient, spies } = setup(config);

            try {
                const project: ProjectContext = {
                    id: "p-contrib",
                    user_id: 'u-contrib',
                    project_name: "Test Project Contribution",
                    initial_user_prompt: "Initial prompt for contrib test",
                    initial_prompt_resource_id: null,
                    selected_domain_id: "d1-contrib",
                    dialectic_domains: { name: "Test Domain Contrib" },
                    process_template_id: 'pt-contrib',
                    selected_domain_overlay_id: null,
                    user_domain_overlay_values: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                const session: SessionContext = {
                    id: "s-contrib",
                    project_id: "p-contrib",
                    selected_model_ids: ["model-contrib-id"],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    current_stage_id: 'curr-stage-contrib',
                    iteration_count: 1,
                    session_description: 'Session for contrib test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                };
                const iterationNumber = 1;
                const stage: StageContext = {
                    id: "stage-contrib",
                    slug: "curr-stage-contrib",
                    display_name: "Current Contrib Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    recipe_step: createMockRecipeStep([
                        {
                            type: "contribution",
                            slug: contribStageSlug,
                            document_key: documentKey,
                            required: true,
                            multiple: false,
                            section_header: "Contribution from previous stage",
                        }
                    ]),
                    active_recipe_instance_id: null,
                    recipe_template_id: null,
                    expected_output_template_ids: [],
                };

                const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                const result = await gatherInputsForStage(mockSupabaseClient as unknown as SupabaseClient<Database>, downloadFn, stage, project, session, iterationNumber);

                // Assert that contributions were queried
                const contributionsTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'select');
                assert(contributionsTableSpies && contributionsTableSpies.callCount > 0, "Expected dialectic_contributions to be queried for contribution type inputs");

                // Assert that content was fetched
                assertEquals(result.sourceDocuments.length, 1, "Expected one document from contributions");
                const doc = result.sourceDocuments[0];
                assertEquals(doc.id, contributionId, "Expected document ID to match contribution ID");
                assertEquals(doc.type, "contribution", "Expected document type to be 'contribution'");
                assertEquals(doc.content, contribContent, "Expected content to match downloaded contribution content");
                assertEquals(doc.metadata.displayName, mockStageDisplayName);
                assertEquals(doc.metadata.header, "Contribution from previous stage");
                
            } finally {
                teardown();
            }
        });
    });
}); 