import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { 
    PromptAssembler,
} from "./prompt-assembler.ts";
import { ProjectContext, SessionContext, StageContext, DynamicContextVariables, SourceDocument } from "./prompt-assembler.interface.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockSupabaseClientSetup } from "./supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json, Database } from "../types_db.ts";
import type { AiModelExtendedConfig } from "./types.ts";
import { MockRagService } from './services/rag_service.mock.ts';
import { IRagServiceDependencies } from "./services/rag_service.interface.ts";

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

        const mockRagDeps: IRagServiceDependencies = {
            dbClient: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            logger: console,
            indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
            embeddingClient: { createEmbedding: () => Promise.resolve([]) },
        }

        const assembler = new PromptAssembler(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockRagDeps,
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
            const result = await assembler.assemble(defaultProject, defaultSession, defaultStage, defaultProject.initial_user_prompt, 1, mockModelConfig, 10000);
            
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

            const result = await assembler.assemble(defaultProject, defaultSession, subsequentStage, defaultProject.initial_user_prompt, 1, mockModelConfig, 10000);
            
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
                    await assembler.assemble(defaultProject, defaultSession, stageWithMissingPrompt, defaultProject.initial_user_prompt, 1, mockModelConfig, 10000);
                },
                Error,
                `No system prompt template found for stage ${stageWithMissingPrompt.id}`
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
    
    await t.step("Dynamic Granular RAG Invocation", async (t) => {
        const testModelConfig: AiModelExtendedConfig = {
             ...mockModelConfig,
             provider_max_input_tokens: 100
        };
        const minTokenLimit = 100;

		const mockSourceDocuments: SourceDocument[] = [
			{
				id: 'contrib-1',
				type: 'contribution',
				content: 'This is the first contribution.',
				metadata: { displayName: 'Thesis Stage', modelName: 'Model A' }
			},
			{
				id: 'contrib-2',
				type: 'contribution',
				content: 'This is the second, much longer contribution that will be used to exceed the token limit.',
				metadata: { displayName: 'Thesis Stage', modelName: 'Model B' }
			},
			{
				id: 'feedback-1',
				type: 'feedback',
				content: 'This is user feedback on the previous stage.',
				metadata: { displayName: 'Thesis Stage', header: '### User Feedback' }
			}
		];

        await t.step("Context Under Limit: should not call RAG and should format from individual documents", async () => {
            const mockRagService = new MockRagService();
            const ragSpy = spy(mockRagService, 'getContextForModel');

            // Setup with a token count well below the limit
            const { assembler } = setup({}, undefined, () => 50); 
            assembler.ragService = mockRagService;
            
            const gatherInputsSpy = stub(assembler, "gatherInputsForStage", () => Promise.resolve([mockSourceDocuments[0]])); // Only one short doc

            try {
                const context = await assembler.gatherContext(
                    defaultProject, defaultSession, defaultStage, defaultProject.initial_user_prompt, 1, undefined, testModelConfig, minTokenLimit
                );
                
                assertEquals(ragSpy.calls.length, 0, "RAG service should not have been called.");
                assert(context.prior_stage_ai_outputs.includes("This is the first contribution."), "The formatted output should contain the contribution content.");
				assertEquals(context.prior_stage_user_feedback, "", "Feedback should be empty as it was not in the source docs for this test.");

            } finally {
                gatherInputsSpy.restore();
                ragSpy.restore();
                teardown();
            }
        });

        await t.step("Context Over Limit: should call RAG with granular documents", async () => {
            const mockRagService = new MockRagService({ mockContextResult: "--- RAG Context ---" });
            const ragSpy = spy(mockRagService, 'getContextForModel');
            
            // Setup with a token count that exceeds the limit
            const { assembler } = setup({}, undefined, () => 200); 
            assembler.ragService = mockRagService;

            const gatherInputsSpy = stub(assembler, "gatherInputsForStage", () => Promise.resolve(mockSourceDocuments));

            try {
                const context = await assembler.gatherContext(
                    defaultProject, defaultSession, defaultStage, defaultProject.initial_user_prompt, 1, undefined, testModelConfig, minTokenLimit
                );
                
                assertEquals(ragSpy.calls.length, 1, "RAG service should have been called once.");
                assertEquals(context.prior_stage_ai_outputs, "--- RAG Context ---", "The output should be the compressed context from RAG.");
				assertEquals(context.prior_stage_user_feedback, "", "Feedback should be empty after RAG compression.");

                // Assert that the RAG service was called with the correct granular data
                const ragCallArgs = ragSpy.calls[0].args[0];
                assertEquals(ragCallArgs.length, 3, "RAG service should have been called with 3 individual documents.");
                assertEquals(ragCallArgs[0].id, 'contrib-1');
                assertEquals(ragCallArgs[1].id, 'contrib-2');
                assertEquals(ragCallArgs[2].id, 'feedback-1');
                assert(ragCallArgs[1].content.includes("much longer contribution"), "The content of the documents passed to RAG should be correct.");
                
            } finally {
                gatherInputsSpy.restore();
                ragSpy.restore();
                teardown();
            }
        });
    });
});
