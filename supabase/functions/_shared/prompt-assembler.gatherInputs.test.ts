import { assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { 
    PromptAssembler, 
} from "./prompt-assembler.ts";
import { ProjectContext, SessionContext, StageContext, AssemblerSourceDocument } from "./prompt-assembler.interface.ts";
import { FileManagerService } from "./services/file_manager.ts";
import { type InputArtifactRules, type ArtifactSourceRule, type DialecticContribution } from '../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig, type IMockSupabaseClient, type IMockClientSpies, type MockSupabaseClientSetup, type MockQueryBuilderState } from "./supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Tables } from "../types_db.ts";
import { Database } from "../types_db.ts";
import { constructStoragePath } from './utils/path_constructor.ts';
import { FileType } from "./types/file_manager.types.ts";
import { join } from "jsr:@std/path/join";

Deno.test("PromptAssembler", async (t) => {
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

            const assembler = new PromptAssembler(mockSupabaseSetup.client as unknown as SupabaseClient<Database>);
            return { assembler, mockSupabaseClient: mockSupabaseSetup.client, spies: mockSupabaseSetup.spies };
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

        await tCtx.step("should return empty strings if stage has no input_artifact_rules", async () => {
            const { assembler } = setup({}); 
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
                    input_artifact_rules: null,
                    slug: "test-stage",
                    display_name: "Test Stage",
                    description: null, 
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    expected_output_artifacts: null,
                };
                const iterationNumber = 1;

                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);

                assertEquals(Array.isArray(result), true);
                assertEquals(result.length, 0);
            } finally {
                teardown();
            }
        });
        
        await tCtx.step("should return empty strings if input_artifact_rules.sources is empty", async () => {
            const { assembler, spies } = setup({});
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
                const rulesForSourcesEmpty: Json = { sources: [] };
                const stage: StageContext = {
                    id: "stage1",
                    input_artifact_rules: rulesForSourcesEmpty,
                    slug: "test-stage",
                    display_name: "Test Stage",
                    description: null, 
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    expected_output_artifacts: null,
                };
                const iterationNumber = 1;

                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);

                assertEquals(Array.isArray(result), true);
                assertEquals(result.length, 0);
                
                const stagesTableSpies = spies.getHistoricQueryBuilderSpies('dialectic_stages', 'in');
                assertEquals(stagesTableSpies?.callCount, 0, "Expected dbClient.from('dialectic_stages')...in() not to be called");

            } finally {
                teardown();
            }
        });
        
        await tCtx.step("should return empty strings if input_artifact_rules is invalid JSON (e.g., a plain string)", async () => {
            const { assembler } = setup({});
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
                    input_artifact_rules: "this is not valid json" as unknown as Json,
                    slug: "test-stage",
                    display_name: "Test Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    expected_output_artifacts: null,
                };
                const iterationNumber = 1;

                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);

                assertEquals(Array.isArray(result), true);
                assertEquals(result.length, 0);
                
                assertEquals(currentConsoleErrorSpy!.calls.length > 0, true, "Expected console.error to be called for invalid JSON rules");

            } finally {
                teardown();
            }
        });

        await tCtx.step("should return empty strings if input_artifact_rules sources contain invalid rule (e.g., missing type)", async () => {
            const { assembler } = setup({});
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
                const invalidRuleStructure: Json = { 
                    sources: [ 
                        { 
                            stage_slug: "some-slug",
                            required: true,
                            multiple: false,
                            section_header: "Contributions from some-slug stage",
                         }
                    ]
                };
                const stage: StageContext = {
                    id: "stage1",
                    input_artifact_rules: invalidRuleStructure, 
                    slug: "test-stage",
                    display_name: "Test Stage",
                    description: null,
                    system_prompts: null,
                    domain_specific_prompt_overlays: [],
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null,
                    expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, 1);

                assertEquals(Array.isArray(result), true);
                assertEquals(result.length, 0);
                assertEquals(currentConsoleErrorSpy!.calls.length > 0, true, "Expected console.error to be called for semantically invalid rule");

            } finally {
                teardown();
            }
        });

        await tCtx.step("should fetch and format only contributions when rules specify contributions", async () => {
            const contribStageSlug = "prev-stage-contrib";
            const mockStageDisplayName = "Previous Contribution Stage";
            const modelName = "Model Alpha";
            const contribContent = "This is contribution 1 content.";
            const storagePath = "path/to";
            const fileName = "contrib1.md";

            const config: MockSupabaseDataConfig = {
                genericMockResults: {
                    'dialectic_stages': {
                        select: async (state: MockQueryBuilderState) => {
                            const inFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'in' && f.column === 'slug');
                            if (inFilter && Array.isArray(inFilter.value) && inFilter.value.includes(contribStageSlug)) {
                                return { data: [{ slug: contribStageSlug, display_name: mockStageDisplayName }], error: null, count: 1, status: 200, statusText: "OK"};
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage' && f.value === contribStageSlug);
                            const latestEditFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'is_latest_edit' && f.value === true);
                            if (stageFilter && latestEditFilter) {
                                return { 
                                    data: [{
                                        id: "contrib1", storage_path: storagePath, file_name: fileName,
                                        storage_bucket: "test-bucket", model_name: modelName,
                                        session_id: 's1', iteration_number: 1, stage: contribStageSlug, is_latest_edit: true, created_at: new Date().toISOString(),
                                        user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: 'p1',
                                        model_id: "model-alpha-id", prompt_template_id_used: null, seed_prompt_url: null, edit_version: 1,
                                        original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null,
                                        tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null,
                                        updated_at: new Date().toISOString(), contribution_type: "model_generated", size_bytes: null, mime_type: "text/markdown"
                                    }], 
                                    error: null, count: 1, status: 200, statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        const expectedPath = join(storagePath, fileName);
                        if (bucketId === "test-bucket" && path === expectedPath) {
                            return { data: new Blob([contribContent]), error: null };
                        }
                        return { data: null, error: new Error("Unexpected download path in mock") };
                    }
                }
            };

            const { assembler, spies } = setup(config);

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
                    session_description: 'Session for contrib test',
                    status: 'pending_thesis',
                    associated_chat_id: null,
                    user_input_reference_url: null
                }; 
                const iterationNumber = 1; 
                const stage: StageContext = {
                    id: "stage-contrib-only", 
                    input_artifact_rules: { 
                        sources: [
                            { 
                                type: "contribution", 
                                stage_slug: contribStageSlug,
                                required: true,
                                multiple: false,
                                section_header: "Contributions from some-slug stage",
                            }
                        ]
                    },
                    slug: "curr-stage", 
                    display_name: "Current Stage", 
                    description: null, 
                    system_prompts: null,
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);
                
                console.log("--- TEST LOG: should fetch and format only contributions ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("EXPECTED CONTENT:", JSON.stringify(contribContent));
                console.log("--- END TEST LOG ---");

                assertEquals(result.length, 1);
                const doc = result[0];
                assertEquals(doc.id, "contrib1");
                assertEquals(doc.type, "contribution");
                assertEquals(doc.content, contribContent);
                assertEquals(doc.metadata.modelName, modelName);
                assertEquals(doc.metadata.displayName, mockStageDisplayName);
                assertEquals(doc.metadata.header, "Contributions from some-slug stage");
                
                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 1);
                assertEquals(downloadSpies.calls[0].args[0], join(storagePath, fileName));
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
                        if (bucketId === "test-bucket" && path === expectedFeedbackPath) {
                            return { data: new Blob([feedbackContent]), error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path for feedback: ${path}, expected ${expectedFeedbackPath}`) };
                    }
                }
            };
            const { assembler, spies } = setup(config);

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
                    input_artifact_rules: { 
                        sources: [
                            { 
                                type: "feedback", 
                                stage_slug: feedbackStageSlug,
                                required: true,
                                multiple: false
                            }
                        ]
                    },
                    slug: "curr-stage-fb", 
                    display_name: "Current Feedback Stage", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    expected_output_artifacts: null,
                };
                
                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);
                
                console.log("--- TEST LOG: should fetch and format only feedback ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("EXPECTED:", JSON.stringify(feedbackContent));
                console.log("--- END TEST LOG ---");

                assertEquals(result.length, 1);
                const doc = result[0];
                assertEquals(doc.id, 'fb-1');
                assertEquals(doc.type, "feedback");
                assertEquals(doc.content, feedbackContent);
                assertEquals(doc.metadata.displayName, mockStageDisplayName);
                assertEquals(doc.metadata.header, undefined); // No header defined in rule

                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 1);
                assertEquals(downloadSpies.calls[0].args[0], expectedFeedbackPath);

            } finally {
                teardown();
            }
        });

        await tCtx.step("should fetch and format both contributions and feedback when rules specify both", async () => {
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
            const contribStoragePath = "path/to";
            const contribFileName = "contrib-both.md";

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
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                            const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage' && f.value === contribSlug);
                            if (stageFilter) {
                                return { 
                                    data: [{
                                        id: "contrib-both", storage_path: contribStoragePath, file_name: contribFileName,
                                        storage_bucket: "test-bucket", model_name: modelName, session_id: sessionId, iteration_number: iteration, stage: contribSlug, is_latest_edit: true, created_at: new Date().toISOString(), user_id: 'u200', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: projectId,
                                        model_id: "model-gamma-id", prompt_template_id_used: null, seed_prompt_url: null, edit_version: 1,
                                        original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null,
                                        tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null,
                                        updated_at: new Date().toISOString(), contribution_type: "model_generated", size_bytes: null, mime_type: "text/markdown"
                                    }], 
                                    error: null, count: 1, status: 200, statusText: "OK"
                                };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
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
                        if (bucketId === "test-bucket" && path === expectedContribPath) {
                            return { data: new Blob([contribContent]), error: null };
                        }
                        if (bucketId === "test-bucket" && path === expectedFeedbackPath) {
                            return { data: new Blob([feedbackContent]), error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path (both): ${path}`) };
                    }
                }
            };
            const { assembler, spies } = setup(config);

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
                    input_artifact_rules: { 
                        sources: [
                            { 
                                type: "contribution", 
                                stage_slug: contribSlug,
                                required: true,
                                multiple: false,
                                section_header: "Contributions from contrib-slug-for-both stage",
                            },
                            { 
                                type: "feedback", 
                                stage_slug: feedbackSlug,
                                required: true,
                                multiple: false,
                                section_header: "Feedback from feedback-slug-for-both stage",
                            }
                        ]
                    },
                    slug: "curr-stage-both", 
                    display_name: "Current Stage Both", 
                    description: null, 
                    system_prompts: null,
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);

                console.log("--- TEST LOG: should fetch and format both contributions and feedback ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("--- END TEST LOG ---");

                assertEquals(result.length, 2);
                
                const contribDoc = result.find(d => d.type === 'contribution');
                const feedbackDoc = result.find(d => d.type === 'feedback');

                assertEquals(!!contribDoc, true, "Contribution document not found in result");
                assertEquals(contribDoc?.id, "contrib-both");
                assertEquals(contribDoc?.content, contribContent);
                assertEquals(contribDoc?.metadata.header, "Contributions from contrib-slug-for-both stage");
                assertEquals(contribDoc?.metadata.displayName, contribDisplayName);
                assertEquals(contribDoc?.metadata.modelName, modelName);

                assertEquals(!!feedbackDoc, true, "Feedback document not found in result");
                assertEquals(feedbackDoc?.id, "fb-both");
                assertEquals(feedbackDoc?.content, feedbackContent);
                assertEquals(feedbackDoc?.metadata.header, "Feedback from feedback-slug-for-both stage");
                assertEquals(feedbackDoc?.metadata.displayName, feedbackDisplayName);

                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 2, "Expected two download calls");
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
            const contribStoragePath = "path";
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
                                const data = [];
                                if (inFilter.value.includes(contribSlug)) data.push({ slug: contribSlug, display_name: "Contrib Stage CH" });
                                if (inFilter.value.includes(feedbackSlug)) data.push({ slug: feedbackSlug, display_name: "Feedback Stage CH" });
                                return { data, error: null, count: data.length, status: 200, statusText: "OK" };
                            }
                            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_contributions': {
                        select: async (state: MockQueryBuilderState) => {
                             const stageFilter = state.filters.find((f: MockQueryBuilderState['filters'][number]) => f.type === 'eq' && f.column === 'stage' && f.value === contribSlug);
                            if (stageFilter) {
                                return { 
                                    data: [{
                                        id: "contrib-ch", storage_path: contribStoragePath, file_name: contribFileName,
                                        storage_bucket: "test-bucket", model_name: modelName, session_id: sessionId, iteration_number: iteration, stage: contribSlug, is_latest_edit: true, created_at: new Date().toISOString(), user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: projectId,
                                        model_id: "model-custom-id", prompt_template_id_used: null, seed_prompt_url: null, edit_version: 1,
                                        original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null,
                                        tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null,
                                        updated_at: new Date().toISOString(), contribution_type: "model_generated", size_bytes: null, mime_type: "text/markdown"
                                    }], 
                                    error: null, count: 1, status: 200, statusText: "OK"
                                };
                            }
                             return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                        }
                    },
                    'dialectic_feedback': {
                         select: async (state: MockQueryBuilderState) => {
                            const sessionFilter = state.filters.find(f => f.column === 'session_id' && f.value === sessionId);
                            const stageFilter = state.filters.find(f => f.column === 'stage_slug' && f.value === feedbackSlug);
                            const iterFilter = state.filters.find(f => f.column === 'iteration_number' && f.value === 1); // targetIteration is 1 when iteration is 1
                            const userFilter = state.filters.find(f => f.column === 'user_id' && f.value === 'u300');
                            if (sessionFilter && stageFilter && iterFilter && userFilter) {
                                return { data: [{ storage_bucket: 'test-bucket', storage_path: feedbackPathParts.storagePath, file_name: feedbackPathParts.fileName }], error: null, count: 1, status: 200, statusText: "OK" };
                            }
                            return { data: null, error: Object.assign(new Error("Not Found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" };
                        }
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (bucketId === "test-bucket" && path === expectedContribPath) return { data: new Blob([contribContent]), error: null };
                        if (bucketId === "test-bucket" && path === expectedFeedbackPath) return { data: new Blob([feedbackContent]), error: null };
                        return { data: null, error: new Error(`Unexpected download path (custom header): ${path}`) };
                    }
                }
            };
            const { assembler, spies } = setup(config);

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
                    input_artifact_rules: { 
                        sources: [
                            { 
                                type: "contribution", 
                                stage_slug: contribSlug, 
                                section_header: customContribHeader,
                                required: true,
                                multiple: false,
                            },
                            { 
                                type: "feedback", 
                                stage_slug: feedbackSlug, 
                                section_header: customFeedbackHeader, 
                                required: true, 
                                multiple: false,
                            }
                        ]
                    },
                    slug: "curr-stage-ch", 
                    display_name: "Current Stage Custom Headers", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);

                console.log("--- TEST LOG: should use custom section_headers ---");
                console.log("ACTUAL:", JSON.stringify(result));
                console.log("--- END TEST LOG ---");

                assertEquals(result.length, 2);

                const contribDoc = result.find(d => d.type === 'contribution');
                const feedbackDoc = result.find(d => d.type === 'feedback');

                assertEquals(!!contribDoc, true, "Custom header contribution document not found");
                assertEquals(contribDoc?.content, contribContent);
                assertEquals(contribDoc?.metadata.header, customContribHeader);

                assertEquals(!!feedbackDoc, true, "Custom header feedback document not found");
                assertEquals(feedbackDoc?.content, feedbackContent);
                assertEquals(feedbackDoc?.metadata.header, customFeedbackHeader);

                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 2, "Expected two download calls for custom headers test");
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
            const { assembler, spies } = setup(config);

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
                    input_artifact_rules: { 
                        sources: [
                            { 
                                type: "feedback", 
                                stage_slug: optionalFeedbackSlug, 
                                required: false,
                                multiple: false,
                            }
                        ]
                    },
                    slug: "curr-stage-opt-fb", 
                    display_name: "Current Stage Optional Feedback", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    expected_output_artifacts: null,
                };

                let errorThrown = false;
                let result: AssemblerSourceDocument[] | null = null;
                try {
                     result = await assembler.gatherInputsForStage(stage, project, session, iterationNumber);
                } catch (e) {
                    errorThrown = true;
                    console.error("Test unexpectedly threw an error:", e)
                }
                
                assertEquals(errorThrown, false, "Error was unexpectedly thrown for missing optional feedback.");
                assertEquals(result?.length, 0, "Result should be empty");
                
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
            const { assembler, spies } = setup(config);
            
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
                    input_artifact_rules: { 
                        sources: [
                            { 
                                type: "feedback", 
                                stage_slug: requiredFeedbackSlug, 
                                required: true,
                                multiple: false,
                            }
                        ]
                    },
                    slug: "curr-stage-req-fb", 
                    display_name: "Current Stage Required Feedback", 
                    description: null,
                    system_prompts: null, 
                    domain_specific_prompt_overlays: [], 
                    created_at: new Date().toISOString(),
                    default_system_prompt_id: null, 
                    expected_output_artifacts: null,
                };

                await assertRejects(
                    async () => {
                        await assembler.gatherInputsForStage(stage, project, session, iterationNumber);
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
            const { assembler, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-db-err-req", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-db-err-req", project_id: "p-db-err-req", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-db-err-req", 
                    input_artifact_rules: { 
                        sources: [
                            { type: "contribution", stage_slug: contribStageSlug, required: true, multiple: false }
                        ]
                    },
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null,
                };

                await assertRejects(
                    async () => await assembler.gatherInputsForStage(stage, project, session, 1),
                    Error,
                    `Failed to retrieve REQUIRED AI contributions for stage '${mockStageDisplayName}'.`
                );
                assertEquals(currentConsoleErrorSpy!.calls.some(call => call.args[0].includes("Failed to retrieve AI contributions")), true, "Expected console.error for DB failure");
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
            const { assembler, spies } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-ms-opt", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-ms-opt", project_id: "p-ms-opt", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-ms-opt", 
                    input_artifact_rules: { 
                        sources: [
                            { type: "contribution", stage_slug: contribStageSlug, required: false, multiple: false, section_header: "Optional Contributions Missing Storage" }
                        ]
                    },
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, 1);

                assertEquals(result.length, 0, "Result should be empty");
                assertEquals(currentConsoleErrorSpy!.calls.some(call => call.args[0].includes("Failed to retrieve AI contributions")), true, "Expected console.error for DB failure");
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
                    'dialectic_contributions': {
                        select: async () => {
                            return { 
                                data: [{
                                    id: badContentContribId, storage_path: "path/to", file_name: "required_content_error.md",
                                    storage_bucket: "test-bucket", model_name: "Model Content Error Req",
                                    session_id: 's-cdl-err-req', iteration_number: 1, stage: contribStageSlug, is_latest_edit: true, created_at: new Date().toISOString(),
                                    user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: 'p-cdl-err-req',
                                    model_id: "model-cdl-error-req-id", updated_at: new Date().toISOString(), contribution_type: "model_generated", mime_type: "text/markdown"
                                }], 
                                error: null, count: 1, status: 200, statusText: "OK"
                            };
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
            const { assembler } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-cdl-err-req", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-cdl-err-req", project_id: "p-cdl-err-req", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-cdl-err-req", 
                    input_artifact_rules: { 
                        sources: [
                            { type: "contribution", stage_slug: contribStageSlug, required: true, multiple: false }
                        ]
                    },
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null,
                };

                await assertRejects(
                    async () => await assembler.gatherInputsForStage(stage, project, session, 1),
                    Error,
                    `Failed to download REQUIRED content for contribution ${badContentContribId} from stage '${mockStageDisplayName}'.`
                );
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 && 
                    typeof call.args[0] === 'string' && 
                    call.args[0].includes(`Failed to download contribution file.`)
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
                    'dialectic_contributions': {
                        select: async () => {
                            return { 
                                data: [{
                                    id: badContentContribId, storage_path: "path/to", file_name: "optional_content_error.md",
                                    storage_bucket: "test-bucket", model_name: "Model Content Error Opt",
                                    session_id: 's-cdl-err-opt', iteration_number: 1, stage: contribStageSlug, is_latest_edit: true, created_at: new Date().toISOString(),
                                    user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: 'p-cdl-err-opt',
                                    model_id: "model-ms-opt-id", updated_at: new Date().toISOString(), contribution_type: "model_generated", mime_type: "text/markdown"
                                }], 
                                error: null, count: 1, status: 200, statusText: "OK"
                            };
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
            const { assembler } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-cdl-err-opt", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-cdl-err-opt", project_id: "p-cdl-err-opt", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-cdl-err-opt", 
                    input_artifact_rules: { 
                        sources: [
                            { type: "contribution", stage_slug: contribStageSlug, required: false, multiple: false, section_header: sectionHeader }
                        ]
                    },
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, 1);

                assertEquals(result.length, 0, "Result should be empty");
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 &&
                    typeof call.args[0] === 'string' &&
                    call.args[0].includes(`Failed to download contribution file.`)
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
                    'dialectic_contributions': {
                        select: async () => {
                            return { 
                                data: [{
                                    id: badContribId, storage_path: null, /* Key: Missing path */ file_name: "missing_path_req.md",
                                    storage_bucket: "test-bucket", model_name: "Model Missing Storage Req",
                                    session_id: 's-ms-req', iteration_number: 1, stage: contribStageSlug, is_latest_edit: true, created_at: new Date().toISOString(),
                                    user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: 'p-ms-req',
                                    model_id: "model-ms-req-id", updated_at: new Date().toISOString(), contribution_type: "model_generated", mime_type: "text/markdown"
                                }], 
                                error: null, count: 1, status: 200, statusText: "OK"
                            };
                        }
                    }
                },
                // No storageMock needed as download should not be attempted if path/bucket is missing
            };
            const { assembler } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-ms-req", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-ms-req", project_id: "p-ms-req", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-ms-req", 
                    input_artifact_rules: { 
                        sources: [
                            { type: "contribution", stage_slug: contribStageSlug, required: true, multiple: false }
                        ]
                    },
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null,
                };

                await assertRejects(
                    async () => await assembler.gatherInputsForStage(stage, project, session, 1),
                    Error,
                    `REQUIRED Contribution ${badContribId} from stage '${mockStageDisplayName}' is missing storage details.`
                );
                assertEquals(currentConsoleWarnSpy!.calls.some(call => 
                    call.args.length > 0 && 
                    typeof call.args[0] === 'string' && 
                    call.args[0].includes(`Contribution ${badContribId} is missing storage details`)
                ), true, "Expected console.warn for missing storage details");
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
                    'dialectic_contributions': {
                        select: async () => {
                            return { 
                                data: [{
                                    id: badContribId, storage_path: "some/path", file_name: "missing_bucket_opt.md",
                                    storage_bucket: null, /* Key: Missing bucket */ model_name: "Model Missing Storage Opt",
                                    session_id: 's-ms-opt', iteration_number: 1, stage: contribStageSlug, is_latest_edit: true, created_at: new Date().toISOString(),
                                    user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: 'p-ms-opt',
                                    model_id: "model-ms-opt-id", updated_at: new Date().toISOString(), contribution_type: "model_generated", mime_type: "text/markdown"
                                }], 
                                error: null, count: 1, status: 200, statusText: "OK"
                            };
                        }
                    }
                },
                // No storageMock needed
            };
            const { assembler } = setup(config);
            try {
                const project: ProjectContext = { 
                    id: "p-ms-opt", user_id: 'u1', project_name: "Test", initial_user_prompt: "Test", initial_prompt_resource_id: null, selected_domain_id: "d1", dialectic_domains: { name: "Test" }, process_template_id: 'pt1', selected_domain_overlay_id: null, user_domain_overlay_values: null, repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                };
                const session: SessionContext = { 
                    id: "s-ms-opt", project_id: "p-ms-opt", selected_model_ids: ["m1"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'curr', iteration_count: 1, session_description: 'Test', status: 'pending_thesis', associated_chat_id: null, user_input_reference_url: null
                }; 
                const stage: StageContext = {
                    id: "stage-ms-opt", 
                    input_artifact_rules: { 
                        sources: [
                            { type: "contribution", stage_slug: contribStageSlug, required: false, multiple: false, section_header: sectionHeader }
                        ]
                    },
                    slug: "curr", display_name: "Current", description: null, system_prompts: null, domain_specific_prompt_overlays: [], created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: null,
                };

                const result = await assembler.gatherInputsForStage(stage, project, session, 1);

                assertEquals(result.length, 0, "Result should be empty");
                assertEquals(currentConsoleWarnSpy!.calls.some(call => 
                    call.args.length > 0 &&
                    typeof call.args[0] === 'string' &&
                    call.args[0].includes(`Contribution ${badContribId} is missing storage details`)
                ), true, "Expected console.warn for missing storage details on optional item");
            } finally {
                teardown();
            }
        });
    });
}); 