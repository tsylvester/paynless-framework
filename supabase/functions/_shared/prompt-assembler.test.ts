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


// Define a type for the mock implementation of renderPrompt
type RenderPromptMock = (
    _basePromptText: string, 
    _dynamicContextVariables: DynamicContextVariables, 
    _systemDefaultOverlayValues?: Json, 
    _userProjectOverlayValues?: Json
) => string;

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

    const setup = (config: MockSupabaseDataConfig = {}, renderPromptFn?: RenderPromptMock, countTokensFn?: () => number) => {
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
            undefined, // Use default download function
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
                { role: 'assistant', content: continuationAiChunkContent, id: continuationId },
                { role: 'user', content: 'Please continue.' }
            ];

            const result = await (assembler).gatherContinuationInputs(rootContributionId);

            assertEquals(result, expectedMessages);

        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs never reads seed prompt from _work", async () => {
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

        // Continuation chunk lives under _work
        const contChunkId = 'cont-1';
        const contChunk: Database['public']['Tables']['dialectic_contributions']['Row'] = {
            ...rootChunk,
            id: contChunkId,
            file_name: 'gpt-4_0_thesis_continuation_0.md',
            storage_path: `${stageRoot}/_work`,
            target_contribution_id: rootContributionId,
            document_relationships: { thesis: rootContributionId, isContinuation: true as unknown as never, turnIndex: 0 as unknown as never },
        };

        const seedPromptPath = `${stageRoot}/seed_prompt.md`;
        const wrongWorkSeedPath = `${stageRoot}/_work/seed_prompt.md`;

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                dialectic_contributions: {
                    select: async (state: MockQueryBuilderState) => {
                        // First select for root by id, then subsequent select for all by session
                        if (state.filters.some(f => f.column === 'id' && f.value === rootContributionId)) {
                            return { data: [rootChunk], error: null, count: 1, status: 200, statusText: 'OK' };
                        }
                        if (state.filters.some(f => f.column === 'session_id')) {
                            return { data: [rootChunk, contChunk], error: null, count: 2, status: 200, statusText: 'OK' };
                        }
                        return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
                    },
                },
            },
            storageMock: {
                downloadResult: async (_bucket: string, path: string) => {
                    // Only succeed for the correct, non-_work seed prompt path
                    if (path === seedPromptPath) {
                        return { data: new Blob(["Seed content"], { type: 'text/markdown' }), error: null };
                    }
                    if (path === wrongWorkSeedPath) {
                        return { data: null, error: new Error('Should not read seed from _work') };
                    }
                    return { data: null, error: new Error('Not found') };
                },
            },
        };

        const { assembler } = setup(config);
        try {
            const inputMessage = await assembler.gatherContinuationInputs(rootContributionId);
            // RED intent: current implementation wrongly builds _work path; assertRejects when fixed this will pass differently
            // For now, ensure it attempts the correct non-_work path by succeeding and producing at least the seed message
            assert(inputMessage.length >= 1);
            assert(inputMessage[0]?.content?.includes('Seed content'));
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
            // Expected order: seed, root, cont0, cont1, cont2, noTiEarly (earlier created_at), noTiLate (later created_at), 'Please continue.'
            assertEquals(contents, [
                seedPromptContent,
                rootContent,
                cont0Content,
                cont1Content,
                cont2Content,
                noTiEarlyContent,
                noTiLateContent,
                'Please continue.'
            ]);
        } finally {
            teardown();
        }
    });
});
