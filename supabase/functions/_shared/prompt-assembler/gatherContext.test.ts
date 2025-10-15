import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { gatherContext } from "./gatherContext.ts";
import { ProjectContext, SessionContext, StageContext, DynamicContextVariables, AssemblerSourceDocument } from "./prompt-assembler.interface.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockSupabaseClientSetup } from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { downloadFromStorage } from '../supabase_storage_utils.ts';
import { DialecticRecipeStep } from "../../dialectic-service/dialectic.interface.ts";

const mockSimpleRecipeStep: DialecticRecipeStep = {
    id: 'step-123',
    instance_id: 'instance-123',
    job_type: 'EXECUTE',
    step_key: 'simple-step',
    step_slug: 'simple-step-slug',
    step_name: 'Simple Step',
    step_number: 1,
    prompt_type: 'Turn',
    granularity_strategy: 'per_source_document',
    output_type: 'thesis',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: [],
    config_override: {},
    object_filter: {},
    output_overrides: {},
    is_skipped: false,
    parallel_group: null,
    prompt_template_id: null,
    template_step_id: null,
    branch_key: null,
    execution_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const mockRecipeStepWithInputs: DialecticRecipeStep = {
    ...mockSimpleRecipeStep,
    id: 'step-with-inputs',
    inputs_required: [
        { type: 'document', stage_slug: 'failing-stage', required: true }
    ]
};

const mockComplexRecipeStep: DialecticRecipeStep = {
    ...mockSimpleRecipeStep,
    id: 'step-456',
    job_type: 'PLAN',
    step_key: 'complex-step',
};


Deno.test("gatherContext", async (t) => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
    let denoEnvStub: any = null;
    const consoleSpies: { error?: Spy<Console>, warn?: Spy<Console> } = {};

    const setup = (
        config: MockSupabaseDataConfig = {}, 
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

        return { mockSupabaseClient: mockSupabaseSetup.client, spies: mockSupabaseSetup.spies };
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

    const defaultStage: StageContext = {
        id: "stage-123",
        system_prompts: { prompt_text: "System prompt" },
        domain_specific_prompt_overlays: [],
        slug: 'initial-hypothesis',
        display_name: 'Initial hypothesis',
        description: 'Initial hypothesis stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        recipe_step: mockSimpleRecipeStep,
        active_recipe_instance_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
    };
    
    await t.step("should correctly format a single override contribution", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const overrideContributions = [
                {
                    content: 'This is a single override.'
                }
            ];

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = () => Promise.resolve([]);
            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1,
                overrideContributions
            );

            const expectedOutput = `#### Contribution from AI Model\n${overrideContributions[0].content}\n\n`;
            assertEquals(context.prior_stage_ai_outputs, expectedOutput);
            assertEquals(context.prior_stage_user_feedback, "");

        } finally {
            teardown();
        }
    });

    await t.step("should correctly format multiple override contributions", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const overrideContributions = [
                { content: 'First override.' },
                { content: 'Second override.' }
            ];

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = () => Promise.resolve([]);
            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1,
                overrideContributions
            );

            const expectedOutput = `#### Contribution from AI Model\n${overrideContributions[0].content}\n\n` +
                                 `#### Contribution from AI Model\n${overrideContributions[1].content}\n\n`;
            assertEquals(context.prior_stage_ai_outputs, expectedOutput);
            assertEquals(context.prior_stage_user_feedback, "");

        } finally {
            teardown();
        }
    });

    await t.step("should return an empty contribution string when overrideContributions is an empty array", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const overrideContributions: [] = [];

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = () => Promise.resolve([]);
            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1,
                overrideContributions
            );

            assertEquals(context.prior_stage_ai_outputs, "");
            assertEquals(context.prior_stage_user_feedback, "");

        } finally {
            teardown();
        }
    });

    await t.step("should not call gatherInputsForStage when overrideContributions is provided", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const overrideContributions = [{ content: 'An override.' }];
            const gatherInputsFn = spy(() => Promise.resolve([]));

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1,
                overrideContributions
            );

            assertEquals(gatherInputsFn.calls.length, 0);

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

        const { mockSupabaseClient } = setup(config);
        
        try {
            const stageWithRequiredInput: StageContext = {
                ...defaultStage,
                id: 'stage-err-prop',
                slug: 'error-prop-stage',
                recipe_step: mockRecipeStepWithInputs,
            };
            
            await assertRejects(
                async () => {
                    const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
                    const gatherInputsFn = () => Promise.reject(new Error(originalErrorMessage));
                    await gatherContext(
                        mockSupabaseClient as unknown as SupabaseClient<Database>, 
                        downloadFn, 
                        gatherInputsFn,
                        defaultProject, 
                        defaultSession, 
                        stageWithRequiredInput, 
                        defaultProject.initial_user_prompt, 
                        1
                    );
                },
                Error,
                "Failed to gather inputs for prompt assembly"
            );

        } finally {
            teardown();
        }
    });

    await t.step("should use overrideContributions when provided", async () => {
        const { mockSupabaseClient, spies } = setup();

        try {
            const overrideContributions = [
                {
                    content: 'This is the override content.'
                }
            ];

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = () => Promise.resolve([]);
            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
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

    await t.step("should use gatherInputsForStage when no overrides are provided", async () => {
        const stageSlug = 'prev-stage';
        const contribContent = "AI contribution content.";
        const { mockSupabaseClient } = setup();

        try {
            const subsequentStage: StageContext = {
                ...defaultStage,
                id: 'stage-subsequent',
                slug: 'subsequent-stage',
                recipe_step: mockRecipeStepWithInputs,
            };

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([{
                id: 'c1',
                type: 'document',
                content: contribContent,
                metadata: {
                    displayName: 'Previous Stage',
                    modelName: 'Test Model'
                }
            }] as AssemblerSourceDocument[]));
            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                subsequentStage,
                defaultProject.initial_user_prompt,
                1
            );

            assert(context.prior_stage_ai_outputs.includes(contribContent));
            assertEquals(gatherInputsFn.calls.length, 1, "gatherInputsForStage should be called when no overrides are provided");

        } finally {
            teardown();
        }
    });

    await t.step("should correctly format a single AI contribution", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const sourceDoc: AssemblerSourceDocument = {
                id: 'c1',
                type: 'document',
                content: 'AI-generated content.',
                metadata: {
                    displayName: 'Previous Stage',
                    modelName: 'Test Model'
                }
            };

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([sourceDoc]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            const expectedHeader = `### Contributions from ${sourceDoc.metadata.displayName} Stage\n\n`;
            const expectedContent = `#### Contribution from ${sourceDoc.metadata.modelName}\n${sourceDoc.content}\n\n`;
            assertEquals(context.prior_stage_ai_outputs, expectedHeader + expectedContent);
            assertEquals(context.prior_stage_user_feedback, "");
            assertEquals(gatherInputsFn.calls.length, 1);

        } finally {
            teardown();
        }
    });

    await t.step("should correctly format a single user feedback document", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const sourceDoc: AssemblerSourceDocument = {
                id: 'f1',
                type: 'feedback',
                content: 'User feedback content.',
                metadata: {
                    displayName: 'Previous Stage'
                }
            };

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([sourceDoc]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            const expectedHeader = `### User Feedback on Previous Stage: ${sourceDoc.metadata.displayName}\n---\n\n`;
            const expectedContent = `${sourceDoc.content}\n\n---\n`;
            assertEquals(context.prior_stage_user_feedback, expectedHeader + expectedContent);
            assertEquals(context.prior_stage_ai_outputs, "");
            assertEquals(gatherInputsFn.calls.length, 1);

        } finally {
            teardown();
        }
    });

    await t.step("should correctly format a mix of multiple contributions and feedback documents", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const sourceDocs: AssemblerSourceDocument[] = [
                {
                    id: 'c1',
                    type: 'document',
                    content: 'First AI content.',
                    metadata: { displayName: 'Stage A', modelName: 'Model X' }
                },
                {
                    id: 'f1',
                    type: 'feedback',
                    content: 'First user feedback.',
                    metadata: { displayName: 'Stage A' }
                },
                {
                    id: 'c2',
                    type: 'document',
                    content: 'Second AI content.',
                    metadata: { displayName: 'Stage B', modelName: 'Model Y' }
                }
            ];

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve(sourceDocs));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            const expectedContribOutput = 
                `### Contributions from Stage A Stage\n\n` +
                `#### Contribution from Model X\nFirst AI content.\n\n` +
                `### Contributions from Stage B Stage\n\n` +
                `#### Contribution from Model Y\nSecond AI content.\n\n`;
            
            const expectedFeedbackOutput = 
                `### User Feedback on Previous Stage: Stage A\n---\n\n` +
                `First user feedback.\n\n---\n`;

            assertEquals(context.prior_stage_ai_outputs, expectedContribOutput);
            assertEquals(context.prior_stage_user_feedback, expectedFeedbackOutput);
            assertEquals(gatherInputsFn.calls.length, 1);

        } finally {
            teardown();
        }
    });

    await t.step("should correctly use a custom section_header for contributions when provided in the rule", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const sourceDoc: AssemblerSourceDocument = {
                id: 'c1',
                type: 'document',
                content: 'AI-generated content.',
                metadata: {
                    displayName: 'Previous Stage',
                    modelName: 'Test Model',
                    header: '### Custom Contribution Header'
                }
            };

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([sourceDoc]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            const expectedHeader = `${sourceDoc.metadata.header}\n\n`;
            const expectedContent = `#### Contribution from ${sourceDoc.metadata.modelName}\n${sourceDoc.content}\n\n`;
            assertEquals(context.prior_stage_ai_outputs, expectedHeader + expectedContent);
            assertEquals(gatherInputsFn.calls.length, 1);

        } finally {
            teardown();
        }
    });

    await t.step("should correctly use a custom section_header for feedback when provided in the rule", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const sourceDoc: AssemblerSourceDocument = {
                id: 'f1',
                type: 'feedback',
                content: 'User feedback content.',
                metadata: {
                    displayName: 'Previous Stage',
                    header: '### Custom Feedback Header'
                }
            };

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([sourceDoc]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            const expectedHeader = `${sourceDoc.metadata.header}\n---\n\n`;
            const expectedContent = `${sourceDoc.content}\n\n---\n`;
            assertEquals(context.prior_stage_user_feedback, expectedHeader + expectedContent);
            assertEquals(gatherInputsFn.calls.length, 1);

        } finally {
            teardown();
        }
    });

    await t.step("should return empty strings when gatherInputsForStage returns an empty array", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            assertEquals(context.prior_stage_ai_outputs, "");
            assertEquals(context.prior_stage_user_feedback, "");
            assertEquals(gatherInputsFn.calls.length, 1);

        } finally {
            teardown();
        }
    });

    await t.step("should correctly map project and session properties to the dynamic context", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage,
                defaultProject.initial_user_prompt,
                1
            );

            assertEquals(context.user_objective, defaultProject.project_name);
            assertEquals(context.domain, defaultProject.dialectic_domains.name);
            assertEquals(context.agent_count, defaultSession.selected_model_ids!.length);
            assertEquals(context.context_description, defaultProject.initial_user_prompt);

        } finally {
            teardown();
        }
    });

    await t.step("should set original_user_request when stage has a processing strategy", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const stageWithStrategy: StageContext = {
                ...defaultStage,
                recipe_step: mockComplexRecipeStep,
            };

            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                stageWithStrategy,
                defaultProject.initial_user_prompt,
                1
            );

            assertEquals(context.original_user_request, defaultProject.initial_user_prompt);

        } finally {
            teardown();
        }
    });

    await t.step("should set original_user_request to null when stage does not have a processing strategy", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);
            const gatherInputsFn = spy(() => Promise.resolve([]));

            const context = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                defaultStage, // This stage has no processing_strategy
                defaultProject.initial_user_prompt,
                1
            );

            assertEquals(context.original_user_request, null);

        } finally {
            teardown();
        }
    });

    await t.step("should throw an error if session.selected_model_ids is null or empty", async () => {
        const { mockSupabaseClient } = setup();

        try {
            const gatherInputsFn = spy(() => Promise.resolve([]));
            const downloadFn = (bucket: string, path: string) => downloadFromStorage(mockSupabaseClient as unknown as SupabaseClient<Database>, bucket, path);

            // Case 1: selected_model_ids is an empty array
            const sessionWithEmptyModels: SessionContext = {
                ...defaultSession,
                selected_model_ids: []
            };

            await assertRejects(
                async () => {
                    await gatherContext(
                        mockSupabaseClient as unknown as SupabaseClient<Database>,
                        downloadFn,
                        gatherInputsFn,
                        defaultProject,
                        sessionWithEmptyModels,
                        defaultStage,
                        defaultProject.initial_user_prompt,
                        1
                    );
                },
                Error,
                "PRECONDITION_FAILED: Session must have at least one selected model."
            );

            // Case 2: selected_model_ids is null
            const sessionWithNullModels: SessionContext = {
                ...defaultSession,
                selected_model_ids: null
            };

            await assertRejects(
                async () => {
                    await gatherContext(
                        mockSupabaseClient as unknown as SupabaseClient<Database>,
                        downloadFn,
                        gatherInputsFn,
                        defaultProject,
                        sessionWithNullModels,
                        defaultStage,
                        defaultProject.initial_user_prompt,
                        1
                    );
                },
                Error,
                "PRECONDITION_FAILED: Session must have at least one selected model."
            );

        } finally {
            teardown();
        }
    });
});
