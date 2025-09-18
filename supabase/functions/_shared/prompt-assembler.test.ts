import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { 
    PromptAssembler,
} from "./prompt-assembler.ts";
import { ProjectContext, SessionContext, StageContext, DynamicContextVariables } from "./prompt-assembler.interface.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockSupabaseClientSetup } from "./supabase.mock.ts";
import { isRecord } from "./utils/type_guards.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Database } from "../types_db.ts";
import type { AiModelExtendedConfig, Messages } from "./types.ts";
import { ContributionMetadata, DocumentRelationships } from "./types/file_manager.types.ts";
import { MockQueryBuilderState } from "./supabase.mock.ts";
import { DownloadStorageResult } from "./supabase_storage_utils.ts";


// Define a type for the mock implementation of renderPrompt
type RenderPromptMock = (
    _basePromptText: string, 
    _dynamicContextVariables: DynamicContextVariables, 
    _systemDefaultOverlayValues?: Json, 
    _userProjectOverlayValues?: Json
) => string;

// Define the correct two-argument function type for the download mock
type DownloadFnMock = (bucket: string, path: string) => Promise<DownloadStorageResult>;

Deno.test("PromptAssembler", async (t) => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
    let denoEnvStub: any = null;
    const consoleSpies: { error?: Spy<Console>, warn?: Spy<Console> } = {};

    const mockModelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-model',
        tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 1 },
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0002,
        hard_cap_output_tokens: 1000,
        context_window_tokens: 1000,
        provider_max_input_tokens: 1000,
        provider_max_output_tokens: 1000,
        default_temperature: 0.5,
    };

    const setup = (
        config: MockSupabaseDataConfig = {}, 
        renderPromptFn?: RenderPromptMock, 
        countTokensFn?: () => number,
        downloadFn?: DownloadFnMock
    ) => {
        denoEnvStub = stub(Deno.env, "get", (key: string) => {
            if (key === "SB_CONTENT_STORAGE_BUCKET") {
                return "test-bucket";
            }
            return undefined;
        });

        mockSupabaseSetup = createMockSupabaseClient(undefined, config);
        
        consoleSpies.error = spy(console, "error");
        consoleSpies.warn = spy(console, "warn");

        const assembler = new PromptAssembler(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            downloadFn,
            renderPromptFn,
            countTokensFn
        );
        return { assembler, spies: mockSupabaseSetup.spies };
    };

    const teardown = () => {
        denoEnvStub?.restore();
        consoleSpies.error?.restore();
        consoleSpies.warn?.restore();
        if (mockSupabaseSetup) {
            mockSupabaseSetup.clearAllStubs?.();
        }
    };

    const defaultProject: ProjectContext = {
        id: "proj-123",
        user_id: 'user-123',
        project_name: "Test Project Objective",
        initial_user_prompt: "This is the initial user prompt content.",
        initial_prompt_resource_id: null,
        selected_domain_id: "domain-123",
        dialectic_domains: { name: "Software Development Domain" },
        process_template_id: 'pt-123',
        selected_domain_overlay_id: null,
        user_domain_overlay_values: null,
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const defaultSession: SessionContext = {
        id: "sess-123",
        project_id: "proj-123",
        selected_model_ids: ["model-1", "model-2"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_stage_id: 'stage-123',
        iteration_count: 1,
        session_description: 'Test session',
        status: 'pending_thesis',
        associated_chat_id: null,
        user_input_reference_url: null
    };

    const stageSystemPromptText = "System prompt for {user_objective} in {domain}.";
    const stageOverlayValues: Json = { "style": "formal" };

    const defaultStage: StageContext = {
        id: "stage-123",
        system_prompts: { prompt_text: stageSystemPromptText },
        domain_specific_prompt_overlays: [ { overlay_values: stageOverlayValues } ],
        slug: 'initial-hypothesis',
        display_name: 'Initial hypothesis',
        description: 'Initial hypothesis stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: null,
        input_artifact_rules: null
    };

    await t.step("should correctly assemble and render a prompt for the initial stage", async () => {
        const expectedRenderedPrompt = "Mocked Rendered Prompt Output";
        let renderPromptCallCount = 0;
        let lastRenderPromptArgs: [string, Record<string, unknown>, Json | undefined, Json | undefined] | null = null;
        
        const renderPromptMockFn: RenderPromptMock = (base, vars, sysOverlays, userOverlays) => {
            renderPromptCallCount++;
            lastRenderPromptArgs = [base, vars, sysOverlays, userOverlays];
            return expectedRenderedPrompt;
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_stages: { select: () => Promise.resolve({ data: [], error: null }) },
                dialectic_contributions: { select: () => Promise.resolve({ data: [], error: null }) },
                dialectic_feedback: {
                    select: () => Promise.resolve({
                        data: [{
                            storage_bucket: 'test-bucket',
                            storage_path: 'path/to/feedback',
                            file_name: 'user_feedback.md'
                        }],
                        error: null
                    })
                }
            },
        };

        const { assembler } = setup(config, renderPromptMockFn);

        try {
            const result = await assembler.assemble(defaultProject, defaultSession, defaultStage, defaultProject.initial_user_prompt, 1);
            
            assertEquals(result, expectedRenderedPrompt);
            assertEquals(renderPromptCallCount, 1);
            
            const renderArgs = lastRenderPromptArgs;
            assertEquals(renderArgs?.[0], stageSystemPromptText);
            
            const expectedDynamicVars: DynamicContextVariables = {
                user_objective: "Test Project Objective",
                domain: "Software Development Domain",
                agent_count: 2,
                context_description: "This is the initial user prompt content.",
                original_user_request: null,
                prior_stage_ai_outputs: "", 
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: 'Standard markdown format.'
            };
            assertEquals(renderArgs?.[1], expectedDynamicVars);
            assertEquals(renderArgs?.[2], stageOverlayValues); 
            assertEquals(renderArgs?.[3], null);

        } finally {
            teardown();
        }
    });

    await t.step("does not include expected_output_artifacts_json when stage.expected_output_artifacts is null", async () => {
        const renderPromptMockFn: RenderPromptMock = (_base, _vars, sysOverlays, userOverlays) => {
            // Narrow overlays to records before checking keys; no casts
            const sysVal = isRecord(sysOverlays) ? sysOverlays['expected_output_artifacts_json'] : undefined;
            const usrVal = isRecord(userOverlays) ? userOverlays['expected_output_artifacts_json'] : undefined;
            if (typeof sysVal === 'string' || typeof usrVal === 'string') {
                throw new Error('expected_output_artifacts_json should not be present when stage.expected_output_artifacts is null');
            }
            return 'ok';
        };

        const { assembler } = setup({}, renderPromptMockFn);
        try {
            const stageWithoutArtifacts: StageContext = {
                ...defaultStage,
                expected_output_artifacts: null,
            };

            const result = await assembler.assemble(defaultProject, defaultSession, stageWithoutArtifacts, defaultProject.initial_user_prompt, 1);
            assertEquals(result, 'ok');
        } finally {
            teardown();
        }
    });

    await t.step("includes expected_output_artifacts_json when stage.expected_output_artifacts is provided", async () => {
        let capturedSysOverlay: Json | undefined;
        const renderPromptMockFn: RenderPromptMock = (_base, _vars, sysOverlays) => {
            capturedSysOverlay = sysOverlays;
            return 'ok';
        };

        const artifacts = { a: 1, b: { c: 'x' } };
        const stageWithArtifacts: StageContext = {
            ...defaultStage,
            expected_output_artifacts: artifacts,
        };

        const { assembler } = setup({}, renderPromptMockFn);
        try {
            const result = await assembler.assemble(defaultProject, defaultSession, stageWithArtifacts, defaultProject.initial_user_prompt, 1);
            assertEquals(result, 'ok');

            // Assert renderer receives expected_output_artifacts_json in overlays as a JSON object
            if (capturedSysOverlay && isRecord(capturedSysOverlay)) {
                const val = capturedSysOverlay["expected_output_artifacts_json"];
                if (isRecord(val)) {
                    assertEquals(val, artifacts);
                } else {
                    throw new Error('expected_output_artifacts_json must be a JSON object');
                }
            } else {
                throw new Error('System overlays were not provided to renderer');
            }
        } finally {
            teardown();
        }
    });

    await t.step("should correctly assemble for a subsequent stage with prior inputs", async () => {
        const stageSlug = 'prev-stage';
        const contribContent = "AI contribution content.";
        const feedbackContent = "User feedback content.";
        
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_stages: {
                    select: () => Promise.resolve({ data: [{ slug: stageSlug, display_name: 'Previous Stage' }], error: null })
                },
                dialectic_contributions: {
                    select: () => Promise.resolve({ 
                        data: [{
                            id: 'c1',
                            storage_path: 'path/to/contrib.md',
                            storage_bucket: 'test-bucket',
                            model_name: 'Test Model',
                        }], 
                        error: null 
                    })
                },
                dialectic_feedback: {
                    select: () => Promise.resolve({
                        data: [{
                            storage_bucket: 'test-bucket',
                            storage_path: 'path/to/feedback',
                            file_name: 'user_feedback.md'
                        }],
                        error: null
                    })
                }
            },
            storageMock: {
                downloadResult: (bucket, path) => {
                    if (path.includes('contrib.md')) {
                        return Promise.resolve({ data: new Blob([contribContent]), error: null });
                    }
                    if (path.includes('user_feedback')) {
                        return Promise.resolve({ data: new Blob([feedbackContent]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('File not found in mock') });
                }
            }
        };

        const expectedRenderedPrompt = "Mocked Subsequent Stage Output";
        const renderPromptMockFn: RenderPromptMock = () => expectedRenderedPrompt;

        const { assembler, spies } = setup(config, renderPromptMockFn);
        
        try {
            const subsequentStage: StageContext = {
                ...defaultStage,
                id: 'stage-subsequent',
                slug: 'subsequent-stage',
                input_artifact_rules: {
                    sources: [
                        { type: 'contribution', stage_slug: stageSlug, required: true },
                        { type: 'feedback', stage_slug: stageSlug, required: true }
                    ]
                }
            };

            const result = await assembler.assemble(defaultProject, defaultSession, subsequentStage, defaultProject.initial_user_prompt, 1);
            
            assertEquals(result, expectedRenderedPrompt);

            // Add assertions to verify that the spy for download was called for feedback
            const downloadSpy = spies.storage.from('test-bucket').downloadSpy;
            assert(downloadSpy.calls.some(call => call.args[0].includes('user_feedback')), "Download was not called for feedback file");

        } finally {
            teardown();
        }
    });

    await t.step("should throw an error if stage is missing system prompt", async () => {
        const { assembler } = setup();
        try {
            const stageWithMissingPrompt: StageContext = { ...defaultStage, system_prompts: null };
            
            await assertRejects(
                async () => {
                    await assembler.assemble(defaultProject, defaultSession, stageWithMissingPrompt, defaultProject.initial_user_prompt, 1);
                },
                Error,
                `RENDER_PRECONDITION_FAILED: missing system prompt text for stage ${stageWithMissingPrompt.slug}`
            );
        } finally {
            teardown();
        }
    });

    await t.step("should correctly propagate errors from gatherInputsForStage", async () => {
        const originalErrorMessage = "Simulated DB Error";
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_stages: { select: () => Promise.resolve({ data: [{slug: 'failing-stage', display_name: 'Failing Stage'}], error: null }) },
                dialectic_contributions: {
                    select: () => Promise.resolve({ data: null, error: new Error(originalErrorMessage) })
                },
                dialectic_feedback: {
                    select: () => Promise.resolve({
                        data: [],
                        error: null
                    })
                }
            }
        };

        const { assembler } = setup(config);
        
        try {
            const stageWithRequiredInput: StageContext = {
                ...defaultStage,
                id: 'stage-err-prop',
                slug: 'error-prop-stage',
                input_artifact_rules: {
                    sources: [{ type: 'contribution', stage_slug: 'failing-stage', required: true }]
                }
            };
            
            await assertRejects(
                async () => {
                    await assembler.gatherContext(defaultProject, defaultSession, stageWithRequiredInput, defaultProject.initial_user_prompt, 1);
                },
                Error,
                "Failed to gather inputs for prompt assembly"
            );

        } finally {
            teardown();
        }
    });



    await t.step("should throw an error if rendering the prompt fails", async () => {
        const renderPromptMockFn_ThrowsError = () => {
            throw new Error("Simulated prompt rendering failure.");
        };

        const { assembler } = setup({}, renderPromptMockFn_ThrowsError);

        try {
            const context: DynamicContextVariables = {
                user_objective: "Test Project Objective",
                domain: "Software Development Domain",
                agent_count: 2,
                context_description: "This is the initial user prompt content.",
                original_user_request: null,
                prior_stage_ai_outputs: "", 
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: 'Standard markdown format.'
            };

            await assertRejects(
                async () => {
                    assembler.render(defaultStage, context, null);
                },
                Error,
                "Failed to render prompt"
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContext should use overrideContributions when provided", async () => {
        const { assembler, spies } = setup();

        try {
            const overrideContributions = [
                {
                    content: 'This is the override content.'
                }
            ];

            const context = await assembler.gatherContext(
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1,
                overrideContributions
            );

            assert(context.prior_stage_ai_outputs.includes("This is the override content."));
            assertEquals(spies.fromSpy.calls.length, 0, "Database should not be queried when overrides are provided");

        } finally {
            teardown();
        }
    });

    await t.step("gatherContext should use gatherInputsForStage when no overrides are provided", async () => {
        const stageSlug = 'prev-stage';
        const contribContent = "AI contribution content.";

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_stages: {
                    select: () => Promise.resolve({ data: [{ slug: stageSlug, display_name: 'Previous Stage' }], error: null })
                },
                dialectic_contributions: {
                    select: () => Promise.resolve({ 
                        data: [{
                            id: 'c1',
                            storage_path: 'path/to/contrib.md',
                            storage_bucket: 'test-bucket',
                            model_name: 'Test Model',
                        }], 
                        error: null 
                    })
                },
                dialectic_feedback: {
                    select: () => Promise.resolve({
                        data: [],
                        error: null
                    })
                }
            },
            storageMock: {
                downloadResult: (bucket, path) => {
                    if (path.includes('contrib.md')) {
                        return Promise.resolve({ data: new Blob([contribContent]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('File not found in mock') });
                }
            }
        };

        const { assembler, spies } = setup(config);

        try {
            const subsequentStage: StageContext = {
                ...defaultStage,
                id: 'stage-subsequent',
                slug: 'subsequent-stage',
                input_artifact_rules: {
                    sources: [
                        { type: 'contribution', stage_slug: stageSlug, required: true },
                    ]
                }
            };

            const context = await assembler.gatherContext(
                defaultProject,
                defaultSession,
                subsequentStage,
                defaultProject.initial_user_prompt,
                1
            );

            assert(context.prior_stage_ai_outputs.includes(contribContent));
            assert(spies.fromSpy.calls.length > 0, "Database should be queried when no overrides are provided");

        } finally {
            teardown();
        }
    });

    await t.step("render should correctly call the renderPromptFn", async () => {
        const expectedRenderedPrompt = "Mocked Rendered Prompt Output";
        let renderPromptCallCount = 0;
        let lastRenderPromptArgs: [string, DynamicContextVariables, Json | undefined, Json | undefined] | null = null;
        
        const renderPromptMockFn = (base: string, vars: DynamicContextVariables, sysOverlays?: Json, userOverlays?: Json) => {
            renderPromptCallCount++;
            lastRenderPromptArgs = [base, vars, sysOverlays, userOverlays];
            return expectedRenderedPrompt;
        };

        const { assembler } = setup({}, renderPromptMockFn);

        try {
            const context: DynamicContextVariables = {
                user_objective: "Test Project Objective",
                domain: "Software Development Domain",
                agent_count: 2,
                context_description: "This is the initial user prompt content.",
                original_user_request: null,
                prior_stage_ai_outputs: "", 
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: 'Standard markdown format.'
            };

            const result = assembler.render(defaultStage, context, null);
            
            assertEquals(result, expectedRenderedPrompt);
            assertEquals(renderPromptCallCount, 1);
            
            const renderArgs = lastRenderPromptArgs;
            assertEquals(renderArgs?.[0], stageSystemPromptText);
            assertEquals(renderArgs?.[1], context);
            assertEquals(renderArgs?.[2], stageOverlayValues); 
            assertEquals(renderArgs?.[3], null);

        } finally {
            teardown();
        }
    });

    await t.step("render enforces required style guide and artifacts when template includes those sections", async () => {
        // Prompt template declares both sections as required via section tags
        const basePrompt = [
            "SYSTEM INSTRUCTIONS",
            "{{#section:style_guide_markdown}}",
            "Style Guide:\n{style_guide_markdown}",
            "{{/section:style_guide_markdown}}",
            "",
            "EXPECTED JSON OUTPUT",
            "{{#section:expected_output_artifacts_json}}",
            "Artifacts:\n{expected_output_artifacts_json}",
            "{{/section:expected_output_artifacts_json}}",
        ].join("\n");

        // Create a stage missing both values (no style_guide_markdown in overlays; no artifacts on stage)
        const stageMissingValues: StageContext = {
            ...defaultStage,
            system_prompts: { prompt_text: basePrompt },
            domain_specific_prompt_overlays: [{ overlay_values: { role: "architect" } }],
            expected_output_artifacts: null,
        };

        // Minimal context for render; values don't matter for this precondition test
        const context: DynamicContextVariables = {
            user_objective: "Test",
            domain: "Software Development",
            agent_count: 1,
            context_description: "Desc",
            original_user_request: null,
            prior_stage_ai_outputs: "",
            prior_stage_user_feedback: "",
            deployment_context: null,
            reference_documents: null,
            constraint_boundaries: null,
            stakeholder_considerations: null,
            deliverable_format: "Standard markdown format.",
        };

        // Renderer should not be called if preconditions are enforced
        let rendererCalled = false;
        const renderPromptMockFn: RenderPromptMock = () => {
            rendererCalled = true;
            return "ok";
        };

        const { assembler } = setup({}, renderPromptMockFn);
        let threw = false;
        try {
            assembler.render(stageMissingValues, context, null);
        } catch (_e) {
            threw = true;
        } finally {
            teardown();
        }

        // Expect assembler to enforce preconditions and throw before calling renderer
        assertEquals(threw, true);
        assertEquals(rendererCalled, false);
    });

    await t.step("render fails with precondition error when style guide section is present but overlay value is missing", async () => {
        const basePrompt = [
            "{{#section:style_guide_markdown}}",
            "Style Guide:\n{style_guide_markdown}",
            "{{/section:style_guide_markdown}}",
        ].join("\n");

        const stageMissingStyle: StageContext = {
            ...defaultStage,
            system_prompts: { prompt_text: basePrompt },
            domain_specific_prompt_overlays: [{ overlay_values: { role: "architect" } }],
            expected_output_artifacts: null,
        };

        const context: DynamicContextVariables = {
            user_objective: "Test",
            domain: "Software Development",
            agent_count: 1,
            context_description: "Desc",
            original_user_request: null,
            prior_stage_ai_outputs: "",
            prior_stage_user_feedback: "",
            deployment_context: null,
            reference_documents: null,
            constraint_boundaries: null,
            stakeholder_considerations: null,
            deliverable_format: "Standard markdown format.",
        };

        let rendererCalled = false;
        const renderPromptMockFn: RenderPromptMock = () => {
            rendererCalled = true;
            return "ok";
        };

        const { assembler } = setup({}, renderPromptMockFn);
        let threw = false;
        try {
            assembler.render(stageMissingStyle, context, null);
        } catch (e) {
            threw = true;
            // Check the precondition failure marker
            if (e instanceof Error) {
                assertEquals(e.message.includes("RENDER_PRECONDITION_FAILED"), true);
            }
        } finally {
            teardown();
        }

        assertEquals(threw, true);
        assertEquals(rendererCalled, false);
    });

    await t.step("render proceeds and provides both style guide and artifacts when present", async () => {
        const basePrompt = [
            "{{#section:style_guide_markdown}}",
            "Style Guide:\n{style_guide_markdown}",
            "{{/section:style_guide_markdown}}",
            "",
            "{{#section:expected_output_artifacts_json}}",
            "Artifacts:\n{expected_output_artifacts_json}",
            "{{/section:expected_output_artifacts_json}}",
        ].join("\n");

        const artifacts = { shape: "object", ok: true };
        const stageOk: StageContext = {
            ...defaultStage,
            system_prompts: { prompt_text: basePrompt },
            domain_specific_prompt_overlays: [{ overlay_values: { role: "architect", style_guide_markdown: "# Guide" } }],
            expected_output_artifacts: artifacts,
        };

        const context: DynamicContextVariables = {
            user_objective: "Test",
            domain: "Software Development",
            agent_count: 1,
            context_description: "Desc",
            original_user_request: null,
            prior_stage_ai_outputs: "",
            prior_stage_user_feedback: "",
            deployment_context: null,
            reference_documents: null,
            constraint_boundaries: null,
            stakeholder_considerations: null,
            deliverable_format: "Standard markdown format.",
        };

        let rendererCalled = false;
        let capturedOverlay: Json | undefined;
        const renderPromptMockFn: RenderPromptMock = (_base, _vars, sysOverlays) => {
            rendererCalled = true;
            capturedOverlay = sysOverlays;
            return "ok";
        };

        const { assembler } = setup({}, renderPromptMockFn);
        try {
            const result = assembler.render(stageOk, context, null);
            assertEquals(result, "ok");
            assertEquals(rendererCalled, true);
            if (capturedOverlay && isRecord(capturedOverlay)) {
                const sg = capturedOverlay["style_guide_markdown"];
                const artifactsVal = capturedOverlay["expected_output_artifacts_json"];
                assertEquals(typeof sg === 'string' && sg.length > 0, true);
                if (isRecord(artifactsVal)) {
                    assertEquals(artifactsVal, artifacts);
                } else {
                    throw new Error("expected_output_artifacts_json must be a JSON object");
                }
            } else {
                throw new Error("system overlays missing in renderer call");
            }
        } finally {
            teardown();
        }
    });

    await t.step("should correctly append continuation content to the prompt", async () => {
        const expectedRenderedPrompt = "Base Prompt. Continuation Content.";
        const renderPromptMockFn: RenderPromptMock = (_base, _vars, _sysOverlays, _userOverlays) => {
            return "Base Prompt."; 
        };
        const { assembler } = setup({}, renderPromptMockFn);

        try {
            const result = await assembler.assemble(
                defaultProject, 
                defaultSession, 
                defaultStage, 
                defaultProject.initial_user_prompt, 
                1,
                "Continuation Content."
            );
            
            assertEquals(result, expectedRenderedPrompt);

        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs returns an atomic message for each chunk", async () => {
        const rootContributionId = 'contrib-root-123';
        const continuationId = 'contrib-cont-456';
        const seedPromptContent = "This is the original seed prompt.";
        const rootAiChunkContent = "This is the root AI part.";
        const continuationAiChunkContent = "This is the continuation AI part.";

        const mockContributions: Database['public']['Tables']['dialectic_contributions']['Row'][] = [
            {
                id: rootContributionId,
                session_id: 'sess-123',
                iteration_number: 1,
                storage_path: 'path/to/root',
                file_name: 'root_chunk.md',
                storage_bucket: 'test-bucket',
                document_relationships: { "thesis": rootContributionId },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: 'test-model',
                user_id: 'user-123',
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: 'text/markdown',
                model_id: 'model-123',
                original_model_contribution_id: null,
                processing_time_ms: 100,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 100,
                tokens_used_input: 100,
                tokens_used_output: 100,
                stage: 'thesis',
                updated_at: new Date().toISOString(),
            },
            {
                id: 'contrib-cont-456',
                session_id: 'sess-123',
                iteration_number: 1,
                storage_path: 'path/to/cont1',
                file_name: 'cont1_chunk.md',
                storage_bucket: 'test-bucket',
                document_relationships: { 
                    "thesis": rootContributionId,
                    "isContinuation": true,
                    "turnIndex": 0
                },
                created_at: new Date().toISOString(),
                is_latest_edit: true,
                model_name: 'test-model',
                user_id: 'user-123',
                citations: null,
                contribution_type: null,
                edit_version: 1,
                error: null,
                mime_type: 'text/markdown',
                model_id: 'model-123',
                original_model_contribution_id: null,
                processing_time_ms: 100,
                target_contribution_id: null,
                prompt_template_id_used: null,
                raw_response_storage_path: null,
                seed_prompt_url: null,
                size_bytes: 100,
                tokens_used_input: 100,
                tokens_used_output: 100,
                stage: 'thesis',
                updated_at: new Date().toISOString(),
            }
        ];

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isQueryingForRootById = modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId);
                        if (isQueryingForRootById) {
                            const rootChunk = mockContributions.find(c => c.id === rootContributionId);
                            // The .single() is called on the builder, so .select() should return an array.
                            return Promise.resolve({ data: rootChunk ? [rootChunk] : [], error: null });
                        }
                        return Promise.resolve({ data: mockContributions, error: null });
                    }
                },
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.includes('seed_prompt.md')) {
                        return Promise.resolve({ data: new Blob([seedPromptContent]), error: null });
                    }
                    if (path.includes('root_chunk.md')) {
                        return Promise.resolve({ data: new Blob([rootAiChunkContent]), error: null });
                    }
                    if (path.includes('cont1_chunk.md')) {
                        return Promise.resolve({ data: new Blob([continuationAiChunkContent]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('File not found in mock') });
                }
            }
        };

        const { assembler } = setup(config);

        try {
            const expectedMessages: Messages[] = [
                { role: 'user', content: seedPromptContent },
                { role: 'assistant', content: rootAiChunkContent, id: rootContributionId },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: continuationAiChunkContent, id: continuationId },
            ];

            const result = await (assembler).gatherContinuationInputs(rootContributionId);

            assertEquals(result, expectedMessages);

        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs creates a valid, alternating 3-turn conversation history", async () => {
        const rootId = 'root-3-turn';
        const stageSlug = 'test-stage';
        const seedContent = "Initial user prompt for 3-turn test.";
        const turn1Content = "Assistant turn 1 content.";
        const turn2Content = "Assistant turn 2 content.";
        const turn3Content = "Assistant turn 3 content.";

        const baseRow = (
            id: string,
            content: string,
            turnIndex?: number,
            createdAtOffset = 0
        ): Database['public']['Tables']['dialectic_contributions']['Row'] => ({
            id,
            session_id: 'sess-3-turn',
            iteration_number: 1,
            storage_path: `path/to/${id}`,
            file_name: `${id}.md`,
            storage_bucket: 'test-bucket',
            document_relationships: {
                [stageSlug]: rootId,
                ...(turnIndex !== undefined && { isContinuation: true, turnIndex: turnIndex }),
            },
            created_at: new Date(Date.now() + createdAtOffset).toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-3-turn',
            stage: stageSlug,
            // --- other fields ---
            citations: null, contribution_type: null, edit_version: 1, error: null, mime_type: 'text/markdown',
            model_id: 'model-3-turn', original_model_contribution_id: null, processing_time_ms: 1,
            target_contribution_id: turnIndex !== undefined ? rootId : null, prompt_template_id_used: null, raw_response_storage_path: null,
            seed_prompt_url: null, size_bytes: 1, tokens_used_input: 1, tokens_used_output: 1, updated_at: new Date().toISOString()
        });

        const turn1Chunk = baseRow('turn1', turn1Content, 1, 100);
        const turn3Chunk = baseRow('turn3', turn3Content, 3, 300);
        const rootChunk = baseRow(rootId, 'Root content should be included but its content is from a separate download', undefined, 0);
        const turn2Chunk = baseRow('turn2', turn2Content, 2, 200);
        
        const mockChunks = [turn1Chunk, turn3Chunk, rootChunk, turn2Chunk];

        const { assembler } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // Return all chunks for the .contains query
                        return Promise.resolve({ data: mockChunks, error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.endsWith('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedContent]), error: null });
                    if (path.endsWith(`${rootId}.md`)) return Promise.resolve({ data: new Blob([rootChunk.id]), error: null });
                    if (path.endsWith('turn1.md')) return Promise.resolve({ data: new Blob([turn1Content]), error: null });
                    if (path.endsWith('turn2.md')) return Promise.resolve({ data: new Blob([turn2Content]), error: null });
                    if (path.endsWith('turn3.md')) return Promise.resolve({ data: new Blob([turn3Content]), error: null });
                    return Promise.resolve({ data: null, error: new Error(`Mock download fail for path: ${path}`) });
                }
            }
        });

        try {
            const result = await assembler.gatherContinuationInputs(rootId);

            const expectedMessages: Messages[] = [
                { role: 'user', content: seedContent },
                { role: 'assistant', content: rootId, id: rootId },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: turn1Content, id: 'turn1' },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: turn2Content, id: 'turn2' },
                { role: 'user', content: 'Please continue.' },
                { role: 'assistant', content: turn3Content, id: 'turn3' },
            ];
            
            assertEquals(result.length, expectedMessages.length, "Should have the correct number of messages");
            for (let i = 0; i < expectedMessages.length; i++) {
                assertEquals(result[i].role, expectedMessages[i].role, `Message ${i} should have role '${expectedMessages[i].role}'`);
                // Only assert content for user messages as assistant content is complex
                if(expectedMessages[i].role === 'user') {
                    assertEquals(result[i].content, expectedMessages[i].content, `Message ${i} should have correct content`);
                }
            }

        } finally {
            teardown();
        }
    });

    // This test was previously named "gatherContinuationInputs never reads seed prompt from _work" but was
    // failing due to an incomplete mock after a bug fix. The name was also misleading as it did not
    // test the "_work" directory logic. It has been renamed and its mocks and assertions updated to
    // correctly verify that a single root chunk is downloaded and included.
    await t.step("gatherContinuationInputs correctly downloads seed and a single root chunk", async () => {
        const stageRoot = 'proj-xyz/session_abcd1234/iteration_1/1_thesis';
        const rootContributionId = 'root-abc';
        const bucket = 'test-bucket';

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-xyz',
            user_id: 'user-xyz',
            stage: 'thesis',
            iteration_number: 1,
            model_id: 'model-1',
            model_name: 'model-one',
            prompt_template_id_used: null,
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 1,
            tokens_used_output: 1,
            processing_time_ms: 1,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'thesis',
            file_name: 'gpt-4_0_thesis.md',
            storage_bucket: bucket,
            storage_path: `${stageRoot}`,
            mime_type: 'text/markdown',
            size_bytes: 10,
            document_relationships: { thesis: rootContributionId },
        };

        const seedPromptPath = `${stageRoot}/seed_prompt.md`;
        const rootChunkPath = `${stageRoot}/${rootChunk.file_name}`;

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: async (state: MockQueryBuilderState) => {
                        // First select for root by id
                        if (state.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return { data: [rootChunk], error: null, count: 1, status: 200, statusText: 'OK' };
                        }
                        // Then the .contains query will find no other chunks
                        return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
                    },
                },
            },
            storageMock: {
                downloadResult: async (_bucket: string, path: string) => {
                    if (path === seedPromptPath) {
                        return { data: new Blob(["Seed content"], { type: 'text/markdown' }), error: null };
                    }
                    // The bug fix causes the root chunk to be downloaded. The mock must provide it.
                    if (path === rootChunkPath) {
                        return { data: new Blob(["Root chunk content"], { type: 'text/markdown' }), error: null };
                    }
                    return { data: null, error: new Error(`Mock not implemented for path: ${path}`) };
                },
            },
        };

        const { assembler } = setup(config);
        try {
            const messages = await assembler.gatherContinuationInputs(rootContributionId);

            const expectedMessages: Messages[] = [
                { role: 'user', content: 'Seed content' },
                { role: 'assistant', content: 'Root chunk content', id: rootContributionId },
            ];

            assertEquals(messages, expectedMessages);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs should NOT read seed prompt from _work directory", async () => {
        const rootContributionId = 'root-seed-001';
        const stageRootPath = 'project123/session_sess-123/iteration_1/1_thesis';
        const wrongWorkPath = `${stageRootPath}/_work`;
        const expectedSeedPromptPath = `${stageRootPath}/seed_prompt.md`; // correct path (no _work)

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-123',
            iteration_number: 1,
            storage_path: wrongWorkPath, // Current implementation derives from this and appends seed_prompt.md → wrong
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { thesis: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-123',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-123',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            stage: 'thesis',
            updated_at: new Date().toISOString(),
        };

        const contChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            ...rootChunk,
            id: 'cont-xyz',
            storage_path: `${stageRootPath}/cont`,
            file_name: 'cont.md',
            document_relationships: { thesis: rootContributionId, isContinuation: true, turnIndex: 0 },
        };

        const { assembler } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isRootQuery = modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId);
                        if (isRootQuery) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [rootChunk, contChunk], error: null });
                    }
                }
            },
            storageMock: {
                // Only return data when the CORRECT seed prompt path (no _work) is requested
                downloadResult: (_bucket, path) => {
                    if (path === expectedSeedPromptPath) {
                        return Promise.resolve({ data: new Blob(["seed content"]), error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('Wrong path requested') });
                }
            }
        });

        try {
            await assertRejects(
                async () => {
                    await assembler.gatherContinuationInputs(rootContributionId);
                },
                Error,
                'Failed to download content for chunk'
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs orders root first, then by turnIndex, then created_at", async () => {
        const rootId = 'root-ordered-1';
        const createdAtBase = Date.parse('2025-01-01T00:00:00.000Z');

        const seedPromptContent = "Seed prompt ordered.";
        const rootContent = "Root content.";
        const cont0Content = "Cont turnIndex 0.";
        const cont1Content = "Cont turnIndex 1.";
        const cont2Content = "Cont turnIndex 2.";
        const noTiEarlyContent = "Cont no turnIndex (early).";
        const noTiLateContent = "Cont no turnIndex (late).";

        const row = (overrides: Partial<Database['public']['Tables']['dialectic_contributions']['Row']>): Database['public']['Tables']['dialectic_contributions']['Row'] => ({
            id: '',
            session_id: 'sess-ord',
            iteration_number: 1,
            storage_path: 'path/to',
            file_name: 'file.md',
            storage_bucket: 'test-bucket',
            document_relationships: { thesis: rootId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-ord',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-ord',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 10,
            tokens_used_output: 10,
            stage: 'thesis',
            updated_at: new Date().toISOString(),
            ...overrides,
        });

        // Root and continuation chunks (provided in scrambled DB order)
        const cont2 = row({ id: 'cont-2', storage_path: 'path/to/cont2', file_name: 'cont2.md', document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 2 }, created_at: new Date(createdAtBase + 3000).toISOString() });
        const root = row({ id: rootId, storage_path: 'path/to/root', file_name: 'root.md', document_relationships: { thesis: rootId }, created_at: new Date(createdAtBase + 0).toISOString() });
        const noTiLate = row({ id: 'cont-no-ti-late', storage_path: 'path/to/noTiLate', file_name: 'no_ti_late.md', document_relationships: { thesis: rootId, isContinuation: true }, created_at: new Date(createdAtBase + 6000).toISOString() });
        const cont0 = row({ id: 'cont-0', storage_path: 'path/to/cont0', file_name: 'cont0.md', document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 0 }, created_at: new Date(createdAtBase + 1000).toISOString() });
        const noTiEarly = row({ id: 'cont-no-ti-early', storage_path: 'path/to/noTiEarly', file_name: 'no_ti_early.md', document_relationships: { thesis: rootId, isContinuation: true }, created_at: new Date(createdAtBase + 4000).toISOString() });
        const cont1 = row({ id: 'cont-1', storage_path: 'path/to/cont1', file_name: 'cont1.md', document_relationships: { thesis: rootId, isContinuation: true, turnIndex: 1 }, created_at: new Date(createdAtBase + 2000).toISOString() });

        const scrambled: Database['public']['Tables']['dialectic_contributions']['Row'][] = [cont2, root, noTiLate, cont0, noTiEarly, cont1];

        const { assembler } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isQueryingForRootById = modifier.filters.some(f => f.column === 'id' && f.value === rootId);
                        if (isQueryingForRootById) {
                            return Promise.resolve({ data: [root], error: null });
                        }
                        // Return scrambled list to ensure client-side sort is applied
                        return Promise.resolve({ data: scrambled, error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.includes('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedPromptContent]), error: null });
                    if (path.includes('root.md')) return Promise.resolve({ data: new Blob([rootContent]), error: null });
                    if (path.includes('cont0.md')) return Promise.resolve({ data: new Blob([cont0Content]), error: null });
                    if (path.includes('cont1.md')) return Promise.resolve({ data: new Blob([cont1Content]), error: null });
                    if (path.includes('cont2.md')) return Promise.resolve({ data: new Blob([cont2Content]), error: null });
                    if (path.includes('no_ti_early.md')) return Promise.resolve({ data: new Blob([noTiEarlyContent]), error: null });
                    if (path.includes('no_ti_late.md')) return Promise.resolve({ data: new Blob([noTiLateContent]), error: null });
                    return Promise.resolve({ data: null, error: new Error('Not found') });
                }
            }
        });

        try {
            const messages = await assembler.gatherContinuationInputs(rootId);
            const contents = messages.map(m => m.content);
            // Expected order: seed, root, cont0, cont1, cont2, noTiEarly (earlier created_at), noTiLate (later created_at), followed by 'Please continue.' after each assistant turn
            const expectedContents = [
                seedPromptContent,
                rootContent, "Please continue.",
                cont0Content, "Please continue.",
                cont1Content, "Please continue.",
                cont2Content, "Please continue.",
                noTiEarlyContent, "Please continue.",
                noTiLateContent,
            ];
            assertEquals(contents, expectedContents);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs uses direct stage field instead of parsing document_relationships", async () => {
        const rootContributionId = 'contrib-stage-test-123';
        const correctStageSlug = 'correct-stage';
        const incorrectStageSlug = 'incorrect-stage';

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-stage-test',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { [incorrectStageSlug]: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-stage-test',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-stage-test',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            stage: correctStageSlug,
            updated_at: new Date().toISOString(),
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // This query should use the correct stage slug.
                        if (modifier.filters.some(f => f.column === 'document_relationships' && f.type === 'contains' && isRecord(f.value) && f.value[correctStageSlug])) {
                            return Promise.resolve({ data: [], error: null });
                        }
                        return Promise.resolve({ data: [], error: new Error(`Query was called with incorrect stage slug`) });
                    }
                },
            },
            storageMock: {
                downloadResult: () => Promise.resolve({ data: new Blob(["seed content"]), error: null })
            }
        };

        const { assembler } = setup(config);

        try {
            // This will throw if the mock receives a query with the incorrect stage slug.
            await assembler.gatherContinuationInputs(rootContributionId);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs includes root chunk when no other chunks are found", async () => {
        const rootContributionId = 'contrib-root-only-123';
        const rootContent = "Root content here.";
        const seedContent = "Seed prompt for root-only test.";

        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-root-only',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root.md',
            storage_bucket: 'test-bucket',
            document_relationships: { 'thesis': rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-root-only',
            stage: 'thesis',
            citations: null, contribution_type: null, edit_version: 1, error: null, mime_type: 'text/markdown',
            model_id: 'model-root-only', original_model_contribution_id: null, processing_time_ms: 1,
            target_contribution_id: null, prompt_template_id_used: null, raw_response_storage_path: null,
            seed_prompt_url: null, size_bytes: 1, tokens_used_input: 1, tokens_used_output: 1, updated_at: new Date().toISOString()
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // Simulate no other chunks being found.
                        return Promise.resolve({ data: [], error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.endsWith('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedContent]), error: null });
                    if (path.endsWith('root.md')) return Promise.resolve({ data: new Blob([rootContent]), error: null });
                    return Promise.resolve({ data: null, error: new Error('File not found') });
                }
            }
        };

        const { assembler } = setup(config);

        try {
            const messages = await assembler.gatherContinuationInputs(rootContributionId);
            const expectedMessages: Messages[] = [
                { role: 'user', content: seedContent },
                { role: 'assistant', content: rootContent, id: rootContributionId },
            ];
            assertEquals(messages, expectedMessages);
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs throws error when stage field is missing", async () => {
        const rootContributionId = 'contrib-missing-stage-123';

        // Create a root contribution without a stage field
        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-missing-stage',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { "thesis": rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-missing-stage',
            citations: null,
            contribution_type: null,
            edit_version: 1,
            error: null,
            mime_type: 'text/markdown',
            model_id: 'model-missing-stage',
            original_model_contribution_id: null,
            processing_time_ms: 100,
            target_contribution_id: null,
            prompt_template_id_used: null,
            raw_response_storage_path: null,
            seed_prompt_url: null,
            size_bytes: 100,
            tokens_used_input: 100,
            tokens_used_output: 100,
            // Missing stage field - should cause error
            stage: null as any,
            updated_at: new Date().toISOString(),
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        const isQueryingForRootById = modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId);
                        if (isQueryingForRootById) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: [], error: null });
                    }
                },
            },
        };

        const { assembler } = setup(config);

        try {
            await assertRejects(
                async () => {
                    await assembler.gatherContinuationInputs(rootContributionId);
                },
                Error,
                'Root contribution contrib-missing-stage-123 has no stage information'
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs throws an error when a content chunk download fails", async () => {
        const rootContributionId = 'contrib-download-fail-123';
        const rootChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            id: rootContributionId,
            session_id: 'sess-download-fail',
            iteration_number: 1,
            storage_path: 'path/to/root',
            file_name: 'root_chunk.md',
            storage_bucket: 'test-bucket',
            document_relationships: { thesis: rootContributionId },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-download-fail',
            citations: null, contribution_type: null, edit_version: 1, error: null,
            mime_type: 'text/markdown', model_id: 'model-download-fail', original_model_contribution_id: null,
            processing_time_ms: 100, target_contribution_id: null, prompt_template_id_used: null,
            raw_response_storage_path: null, seed_prompt_url: null, size_bytes: 100,
            tokens_used_input: 100, tokens_used_output: 100,
            stage: 'thesis',
            updated_at: new Date().toISOString(),
        };

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        // Return the same chunk for the 'contains' query to trigger the download
                        return Promise.resolve({ data: [rootChunk], error: null });
                    }
                },
            },
        };

        // Create a mock download function that simulates an error only for the chunk
        const failingDownloadFn: DownloadFnMock = async (_bucket, path) => {
            if (path.includes('seed_prompt.md')) {
                // Allow the seed prompt download to succeed by creating a proper ArrayBuffer from a Blob.
                return {
                    data: await new Blob(['seed content']).arrayBuffer(),
                    error: null,
                };
            }
            // Fail the chunk download
            return {
                data: null,
                error: new Error('File not found'),
            };
        };

        const { assembler } = setup(config, undefined, undefined, failingDownloadFn);

        try {
            // This test must fail initially. The current implementation catches the download error,
            // logs it, and continues, which means assertRejects will not find a thrown error.
            await assertRejects(
                async () => {
                    await assembler.gatherContinuationInputs(rootContributionId);
                },
                Error,
                'Failed to download content for chunk'
            );
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs history ends with the last assistant message", async () => {
        const rootId = 'root-last-msg-test';
        const stageSlug = 'test-stage';
        const seedContent = "Initial user prompt for last message test.";
        const turn1Content = "Assistant turn 1 content.";
        const turn2Content = "Assistant turn 2 content.";

        const baseRow = (
            id: string,
            turnIndex?: number
        ): Database['public']['Tables']['dialectic_contributions']['Row'] => ({
            id,
            session_id: 'sess-last-msg-test',
            iteration_number: 1,
            storage_path: `path/to/${id}`,
            file_name: `${id}.md`,
            storage_bucket: 'test-bucket',
            document_relationships: {
                [stageSlug]: rootId,
                ...(turnIndex !== undefined && { isContinuation: true, turnIndex: turnIndex }),
            },
            created_at: new Date().toISOString(),
            is_latest_edit: true,
            model_name: 'test-model',
            user_id: 'user-last-msg-test',
            stage: stageSlug,
            citations: null, contribution_type: null, edit_version: 1, error: null, mime_type: 'text/markdown',
            model_id: 'model-last-msg-test', original_model_contribution_id: null, processing_time_ms: 1,
            target_contribution_id: null, prompt_template_id_used: null, raw_response_storage_path: null,
            seed_prompt_url: null, size_bytes: 1, tokens_used_input: 1, tokens_used_output: 1, updated_at: new Date().toISOString()
        });

        const rootChunk = baseRow(rootId);
        const turn1Chunk = baseRow('turn1', 1);
        const turn2Chunk = baseRow('turn2', 2);
        
        const mockChunks = [rootChunk, turn1Chunk, turn2Chunk];

        const { assembler } = setup({
            genericMockResults: {
                dialectic_contributions: {
                    select: (modifier: MockQueryBuilderState) => {
                        if (modifier.filters.some(f => f.column === 'id' && f.value === rootId)) {
                            return Promise.resolve({ data: [rootChunk], error: null });
                        }
                        return Promise.resolve({ data: mockChunks, error: null });
                    }
                }
            },
            storageMock: {
                downloadResult: (_bucket, path) => {
                    if (path.endsWith('seed_prompt.md')) return Promise.resolve({ data: new Blob([seedContent]), error: null });
                    if (path.endsWith(`${rootId}.md`)) return Promise.resolve({ data: new Blob([rootId]), error: null });
                    if (path.endsWith('turn1.md')) return Promise.resolve({ data: new Blob([turn1Content]), error: null });
                    if (path.endsWith('turn2.md')) return Promise.resolve({ data: new Blob([turn2Content]), error: null });
                    return Promise.resolve({ data: null, error: new Error(`Mock download fail for path: ${path}`) });
                }
            }
        });

        try {
            const result = await assembler.gatherContinuationInputs(rootId);

            // This test will fail because the current implementation adds a final user message.
            assert(result.length > 0, "Should have messages");
            const lastMessage = result[result.length - 1];
            assertEquals(lastMessage.role, 'assistant', "The last message in the history should be from the assistant");
            assertEquals(lastMessage.content, turn2Content);

        } finally {
            teardown();
        }
    });
});
