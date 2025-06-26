import { assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { 
    PromptAssembler, 
    ProjectContext, 
    SessionContext, 
    StageContext 
} from "./prompt-assembler.ts";
import { FileManagerService } from "./services/file_manager.ts";
import { type InputArtifactRules, type ArtifactSourceRule, type DialecticContribution } from '../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient, type MockSupabaseDataConfig, type IMockSupabaseClient, type IMockClientSpies, type MockSupabaseClientSetup, type MockQueryBuilderState } from "./supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Tables } from "../types_db.ts";
import { Database } from "../dist/types_db.d.ts";

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
            if (mockSupabaseSetup && typeof (mockSupabaseSetup as any).clearAllStubs === 'function') {
                (mockSupabaseSetup as any).clearAllStubs();
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);

                assertEquals(result.priorStageContributions, "");
                assertEquals(result.priorStageFeedback, "");
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);

                assertEquals(result.priorStageContributions, "");
                assertEquals(result.priorStageFeedback, "");
                
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);

                assertEquals(result.priorStageContributions, "");
                assertEquals(result.priorStageFeedback, "");
                
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, 1);

                assertEquals(result.priorStageContributions, "");
                assertEquals(result.priorStageFeedback, "");
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
            const storagePath = "path/to/contrib1.md";
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
                        if (bucketId === "test-bucket" && path === `${storagePath}/${fileName}`) {
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);
                
                const expectedHeader = "Contributions from some-slug stage\n\n";
                const expectedContentSegment = `#### Contribution from ${modelName}\n\n${contribContent}\n\n---\n`;

                assertEquals(result.priorStageContributions.includes(expectedHeader), true, `Contribution section header missing or incorrect. Got: ${result.priorStageContributions}`);
                assertEquals(result.priorStageContributions.includes(expectedContentSegment), true, `Contribution content missing or incorrect. Got: ${result.priorStageContributions}`);
                assertEquals(result.priorStageFeedback, "");
                
                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 1);
                assertEquals(downloadSpies.calls[0].args[0], `${storagePath}/${fileName}`);
            } finally {
                teardown();
            }
        });

        await tCtx.step("should fetch and format only feedback when rules specify feedback", async () => {
            const feedbackStageSlug = "prev-stage-feedback";
            const mockStageDisplayName = "Previous Feedback Stage";
            const feedbackContent = "This is user feedback content.";
            const projectId = "p100";
            const sessionId = "s100";
            const iteration = 2;
            const expectedFeedbackPath = `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${feedbackStageSlug}/user_feedback_${feedbackStageSlug}.md`;

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
                    user_id: 'u100',
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
                                multiple: false,
                                section_header: "Feedback from some-slug stage",
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
                
                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);
                
                const expectedHeader = "Feedback from some-slug stage\n\n";
                const expectedContentSegment = `#### User Feedback for ${mockStageDisplayName}\n\n${feedbackContent}\n\n---\n`;

                assertEquals(result.priorStageFeedback.includes(expectedHeader), true, `Feedback section header missing. Got: ${result.priorStageFeedback}`);
                assertEquals(result.priorStageFeedback.includes(expectedContentSegment), true, `Feedback content missing. Got: ${result.priorStageFeedback}`);
                assertEquals(result.priorStageContributions, "");

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
            const contribStoragePath = "path/to/contrib-both.md";
            const contribFileName = "contrib-both.md";
            const expectedFeedbackPath = `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${feedbackSlug}/user_feedback_${feedbackSlug}.md`;

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
                                        storage_bucket: "test-bucket", model_name: modelName, session_id: sessionId, iteration_number: iteration, stage: contribSlug, is_latest_edit: true, created_at: new Date().toISOString(), user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: projectId,
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
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (bucketId === "test-bucket" && path === `${contribStoragePath}/${contribFileName}`) {
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);

                const expectedContribHeader = "Contributions from contrib-slug-for-both stage\n\n";
                assertEquals(result.priorStageContributions.includes(expectedContribHeader), true, `Contribution header mismatch. Got: ${result.priorStageContributions}`);
                assertEquals(result.priorStageContributions.includes(`#### Contribution from ${modelName}\n\n${contribContent}\n\n---\n`), true);
                
                const expectedFeedbackHeader = "Feedback from feedback-slug-for-both stage\n\n";
                assertEquals(result.priorStageFeedback.includes(expectedFeedbackHeader), true, `Feedback header mismatch. Got: ${result.priorStageFeedback}`);
                assertEquals(result.priorStageFeedback.includes(`#### User Feedback for ${feedbackDisplayName}\n\n${feedbackContent}\n\n---\n`), true);
                
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
            const contribStoragePath = "path/ch.md";
            const contribFileName = "ch.md";
            const expectedFeedbackPath = `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${feedbackSlug}/user_feedback_${feedbackSlug}.md`;

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
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (bucketId === "test-bucket" && path === `${contribStoragePath}/${contribFileName}`) return { data: new Blob([contribContent]), error: null };
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);

                assertEquals(result.priorStageContributions.startsWith(customContribHeader + "\n\n"), true, "Contribution does not start with custom header.");
                assertEquals(result.priorStageContributions.includes(`#### Contribution from ${modelName}\n\n${contribContent}\n\n---\n`), true);
                
                assertEquals(result.priorStageFeedback.startsWith(customFeedbackHeader + "\n\n"), true, "Feedback does not start with custom header.");
                assertEquals(result.priorStageFeedback.includes(`#### User Feedback for Feedback Stage CH\n\n${feedbackContent}\n\n---\n`), true);
                
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
            const sessionId = "s400";
            const iteration = 1;
            const expectedFeedbackPath = `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${optionalFeedbackSlug}/user_feedback_${optionalFeedbackSlug}.md`;

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
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (bucketId === "test-bucket" && path === expectedFeedbackPath) {
                            return { data: null, error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path (optional feedback): ${path}`) };
                    }
                }
            };
            const { assembler, spies } = setup(config);

            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: 'u400',
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
                let result: { priorStageContributions: string; priorStageFeedback: string } | null = null;
                try {
                     result = await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);
                } catch (e) {
                    errorThrown = true;
                    console.error("Test unexpectedly threw an error:", e)
                }
                
                assertEquals(errorThrown, false, "Error was unexpectedly thrown for missing optional feedback.");
                assertEquals(result?.priorStageContributions, "");
                
                assertEquals(result?.priorStageFeedback, "", "Feedback content was not empty as expected.");
                
                const errorLogCall = currentConsoleErrorSpy!.calls.find(call => {
                    if (!(call.args.length > 1 && typeof call.args[0] === 'string' && typeof call.args[1] === 'object' && call.args[1] !== null)) {
                        return false;
                    }

                    const messageString = call.args[0];
                    const detailsObject = call.args[1] as { error?: { message?: string }, rule?: ArtifactSourceRule }; // Type assertion for easier access

                    const pathCheck = messageString.includes(`[PromptAssembler._gatherInputsForStage] Failed to download feedback file. Path: ${expectedFeedbackPath}`);
                    const errorMessageCheck = detailsObject.error?.message?.includes("No data returned from storage download");
                    
                    const ruleCheck = call.args.some(arg => { // This part can remain as it checks any argument for the rule structure
                        if (typeof arg === 'object' && arg !== null && (arg as {rule?: ArtifactSourceRule}).rule) {
                            const ruleArg = (arg as {rule: ArtifactSourceRule}).rule;
                            return ruleArg.stage_slug === optionalFeedbackSlug && ruleArg.required === false;
                        }
                        return false;
                    });

                    return pathCheck && errorMessageCheck && ruleCheck;
                });
                assertEquals(!!errorLogCall, true, "Expected console.error log for failed optional feedback download not found or incorrect.");
                
                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 1);
            } finally {
                teardown();
            }
        });

        await tCtx.step("should throw error if required feedback file is not found", async () => {
            const requiredFeedbackSlug = "prev-stage-req-feedback";
            const requiredFeedbackDisplayName = "Required Feedback Stage";
            const projectId = "p500";
            const sessionId = "s500";
            const iteration = 1;
            const expectedFeedbackPath = `projects/${projectId}/sessions/${sessionId}/iteration_${iteration}/${requiredFeedbackSlug}/user_feedback_${requiredFeedbackSlug}.md`;

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
                    }
                },
                storageMock: {
                    downloadResult: async (bucketId: string, path: string) => {
                        if (bucketId === "test-bucket" && path === expectedFeedbackPath) {
                            return { data: null, error: null };
                        }
                        return { data: null, error: new Error(`Unexpected download path (required feedback): ${path}`) };
                    }
                }
            };
            const { assembler, spies } = setup(config);
            
            try {
                const project: ProjectContext = { 
                    id: projectId,
                    user_id: 'u500',
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
                        await assembler['_gatherInputsForStage'](stage, project, session, iterationNumber);
                    },
                    Error,
                    `Failed to download REQUIRED feedback for stage '${requiredFeedbackDisplayName}' (slug: ${requiredFeedbackSlug})`
                );
                
                const downloadSpies = spies.storage.from("test-bucket").downloadSpy;
                assertEquals(downloadSpies.calls.length, 1);
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
                    async () => await assembler['_gatherInputsForStage'](stage, project, session, 1),
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, 1);

                assertEquals(result.priorStageContributions, "", "priorStageContributions was not empty as expected when optional DB query fails.");
                assertEquals(result.priorStageFeedback, "");
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
                                    id: badContentContribId, storage_path: "path/to/required_content_error.md", file_name: "required_content_error.md",
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
                    async () => await assembler['_gatherInputsForStage'](stage, project, session, 1),
                    Error,
                    `Failed to download REQUIRED content for contribution ${badContentContribId} from stage '${mockStageDisplayName}'.`
                );
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 && 
                    typeof call.args[0] === 'string' && 
                    call.args[0].includes(`Failed to download content for contribution ${badContentContribId}`)
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
                                    id: badContentContribId, storage_path: "path/to/optional_content_error.md", file_name: "optional_content_error.md",
                                    storage_bucket: "test-bucket", model_name: "Model Content Error Opt",
                                    session_id: 's-cdl-err-opt', iteration_number: 1, stage: contribStageSlug, is_latest_edit: true, created_at: new Date().toISOString(),
                                    user_id: 'u1', content_type: 'text/markdown', raw_text_content: null, word_count: null, token_count: null, dialectic_project_id: 'p-cdl-err-opt',
                                    model_id: "model-cdl-error-opt-id", updated_at: new Date().toISOString(), contribution_type: "model_generated", mime_type: "text/markdown"
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, 1);

                assertEquals(result.priorStageContributions, "", "priorStageContributions was not empty as expected when optional content download fails.");
                assertEquals(result.priorStageFeedback, "");
                assertEquals(currentConsoleErrorSpy!.calls.some(call => 
                    call.args.length > 0 &&
                    typeof call.args[0] === 'string' &&
                    call.args[0].includes(`Failed to download content for contribution ${badContentContribId}`)
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
                    async () => await assembler['_gatherInputsForStage'](stage, project, session, 1),
                    Error,
                    `REQUIRED Contribution ${badContribId} from stage '${mockStageDisplayName}' is missing storage details.`
                );
                assertEquals(currentConsoleWarnSpy!.calls.some(call => 
                    call.args.length > 0 && 
                    typeof call.args[0] === 'string' && 
                    call.args[0].includes(`Contribution ${badContribId} is missing storage_path or storage_bucket`)
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

                const result = await assembler['_gatherInputsForStage'](stage, project, session, 1);

                assertEquals(result.priorStageContributions, "", "priorStageContributions was not empty as expected when optional item misses storage details.");
                assertEquals(result.priorStageFeedback, "");
                assertEquals(currentConsoleWarnSpy!.calls.some(call => 
                    call.args.length > 0 &&
                    typeof call.args[0] === 'string' &&
                    call.args[0].includes(`Contribution ${badContribId} is missing storage_path or storage_bucket`)
                ), true, "Expected console.warn for missing storage details");
            } finally {
                teardown();
            }
        });
    });
}); 