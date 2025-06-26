import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
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
import * as promptRenderer from "./prompt-renderer.ts";

// Define a type for the mock implementation of _gatherInputsForStage
type GatherInputsMock = (_stage: StageContext, _project: ProjectContext, _session: SessionContext, _iterationNumber: number) => Promise<{ priorStageContributions: string; priorStageFeedback: string; }>;

// Define a type for the mock implementation of renderPrompt
type RenderPromptMock = (
    _basePromptText: string, 
    _dynamicContextVariables: Record<string, unknown>, 
    _systemDefaultOverlayValues?: Json, 
    _userProjectOverlayValues?: Json
) => string;

Deno.test("PromptAssembler", async (t) => {
    await t.step("should correctly assemble and render a prompt for the initial stage", async () => {
        const mockDbClient: any = { 
            from: (_table: string) => ({
                select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }),
            }),
            supabaseUrl: "http://localhost:54321",
            supabaseKey: "anon-key",
            auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
            realtime: null,
            storage: { from: (_id: string) => ({}) },
            rpc: () => Promise.resolve({ data: null, error: null }),
        };
        const mockFileManager = new FileManagerService(mockDbClient as SupabaseClient<any>);
        
        let denoEnvStub: any = null;
        let originalGatherInputs: any = null;
        let assembler: PromptAssembler | null = null;

        try {
            denoEnvStub = stub(Deno.env, "get", (key: string) => {
                if (key === "SB_CONTENT_STORAGE_BUCKET") {
                    return "test-bucket";
                }
                return undefined;
            });

            // --- Mock renderPrompt --- 
            const expectedRenderedPrompt = "Mocked Rendered Prompt Output";
            let renderPromptCallCount = 0;
            let lastRenderPromptArgs: [string, Record<string, unknown>, Json | undefined, Json | undefined] | null = null;
            const renderPromptMockFn: RenderPromptMock = (base, vars, sysOverlays, userOverlays) => {
                renderPromptCallCount++;
                lastRenderPromptArgs = [base, vars, sysOverlays, userOverlays];
                return expectedRenderedPrompt;
            };
            // --- End Mock renderPrompt --- 

            assembler = new PromptAssembler(
                mockDbClient as SupabaseClient<any>, 
                renderPromptMockFn // Inject mock function
            );

            let gatherInputsCallCount = 0;
            let lastGatherInputsArgs: [StageContext, ProjectContext, SessionContext, number] | null = null;
            const gatherInputsMockFn: GatherInputsMock = async (stage, project, session, iterationNumber) => {
                gatherInputsCallCount++;
                lastGatherInputsArgs = [stage, project, session, iterationNumber];
                return { priorStageContributions: "N/A for initial stage.", priorStageFeedback: "N/A for initial stage." };
            };
            
            originalGatherInputs = (assembler as any)._gatherInputsForStage;
            (assembler as any)._gatherInputsForStage = gatherInputsMockFn;

            const project: ProjectContext = {
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

            const session: SessionContext = {
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
            const stageOverlayValues = { "style": "formal" } as Json;

            const stage: StageContext = {
                id: "stage-123",
                system_prompts: {
                    prompt_text: stageSystemPromptText
                },
                domain_specific_prompt_overlays: [
                    { 
                        overlay_values: stageOverlayValues
                    }
                ],
                slug: 'initial-hypothesis',
                display_name: 'Initial hypothesis',
                description: 'Initial hypothesis stage',
                created_at: new Date().toISOString(),
                default_system_prompt_id: null,
                expected_output_artifacts: null,
                input_artifact_rules: null
            };
            
            const iterationNumber = 1;
            const result = await assembler.assemble(project, session, stage, project.initial_user_prompt, iterationNumber);
            
            assertEquals(result, expectedRenderedPrompt);

            assertEquals(gatherInputsCallCount, 1);
            const gatherArgs = lastGatherInputsArgs;
            assertEquals(gatherArgs?.[0], stage);
            assertEquals(gatherArgs?.[1], project);
            assertEquals(gatherArgs?.[2], session);
            assertEquals(gatherArgs?.[3], iterationNumber);

            assertEquals(renderPromptCallCount, 1);
            const renderArgs = lastRenderPromptArgs;
            assertEquals(renderArgs?.[0], stageSystemPromptText);
            
            const expectedDynamicVars: Record<string, unknown> = {
                user_objective: "Test Project Objective",
                domain: "Software Development Domain",
                agent_count: 2,
                initial_project_context: "This is the initial user prompt content.",
                prior_stage_ai_outputs: "N/A for initial stage.", 
                prior_stage_user_feedback: "N/A for initial stage.",
                deployment_context: 'Not provided.',
                reference_documents: 'Not provided.',
                constraint_boundaries: 'Not provided.',
                stakeholder_considerations: 'Not provided.',
                deliverable_format: 'Standard markdown format.'
            };
            assertEquals(renderArgs?.[1], expectedDynamicVars);
            assertEquals(renderArgs?.[2], stageOverlayValues); 
            assertEquals(renderArgs?.[3], null);

        } finally {
            denoEnvStub?.restore();
            if (originalGatherInputs && assembler) {
                (assembler as any)._gatherInputsForStage = originalGatherInputs;
            }
        }
    });

    await t.step("should correctly assemble for a subsequent stage with prior inputs", async () => {
        const mockDbClient: any = { 
            from: (_table: string) => ({
                select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }),
            }),
            supabaseUrl: "http://localhost:54321",
            supabaseKey: "anon-key",
            auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
            realtime: null,
            storage: { from: (_id: string) => ({}) },
            rpc: () => Promise.resolve({ data: null, error: null }),
        };
        const mockFileManager = new FileManagerService(mockDbClient as SupabaseClient<any>);
        
        let denoEnvStub: any = null;
        let originalGatherInputs: any = null;
        let assembler: PromptAssembler | null = null;

        try {
            denoEnvStub = stub(Deno.env, "get", (key: string) => {
                if (key === "SB_CONTENT_STORAGE_BUCKET") {
                    return "test-bucket";
                }
                return undefined;
            });

            const expectedRenderedPrompt = "Mocked Subsequent Stage Output";
            let renderPromptCallCount = 0;
            let lastRenderPromptArgs: [string, Record<string, unknown>, Json | undefined, Json | undefined] | null = null;
            const renderPromptMockFn: RenderPromptMock = (base, vars, sysOverlays, userOverlays) => {
                renderPromptCallCount++;
                lastRenderPromptArgs = [base, vars, sysOverlays, userOverlays];
                return expectedRenderedPrompt;
            };

            assembler = new PromptAssembler(
                mockDbClient as SupabaseClient<any>,
                renderPromptMockFn
            );

            const expectedPriorContributions = "These are the AI outputs from the previous stage.";
            const expectedPriorFeedback = "This is the user feedback from the previous stage.";
            let gatherInputsCallCount = 0;
            let lastGatherInputsArgs: [StageContext, ProjectContext, SessionContext, number] | null = null;
            const gatherInputsMockFn: GatherInputsMock = async (stage, project, session, iterationNumber) => {
                gatherInputsCallCount++;
                lastGatherInputsArgs = [stage, project, session, iterationNumber];
                return { priorStageContributions: expectedPriorContributions, priorStageFeedback: expectedPriorFeedback };
            };
            
            originalGatherInputs = (assembler as any)._gatherInputsForStage;
            (assembler as any)._gatherInputsForStage = gatherInputsMockFn;

            const project: ProjectContext = {
                id: "proj-456",
                user_id: 'user-456',
                project_name: "Subsequent Test Project",
                initial_user_prompt: "Initial prompt for subsequent test.",
                initial_prompt_resource_id: null,
                selected_domain_id: "domain-456",
                dialectic_domains: { name: "Testing Domain" },
                process_template_id: 'pt-456',
                selected_domain_overlay_id: null,
                user_domain_overlay_values: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const session: SessionContext = {
                id: "sess-456",
                project_id: "proj-456",
                selected_model_ids: ["model-alpha"],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                current_stage_id: 'stage-789',
                iteration_count: 2, // Simulating a second iteration or later stage
                session_description: 'Subsequent test session',
                status: 'pending_synthesis',
                associated_chat_id: null,
                user_input_reference_url: null
            };

            const stageSystemPromptText = "Synthesize based on {prior_stage_ai_outputs} and {prior_stage_user_feedback}. Context: {initial_project_context}";
            const stage: StageContext = {
                id: "stage-789",
                system_prompts: { prompt_text: stageSystemPromptText },
                domain_specific_prompt_overlays: [], // No system overlays for this test
                slug: 'synthesis-stage',
                display_name: 'Synthesis Stage',
                description: 'A stage that uses prior inputs',
                created_at: new Date().toISOString(),
                default_system_prompt_id: null,
                expected_output_artifacts: null,
                input_artifact_rules: { sources: [] } as Json // Non-null to ensure _gatherInputsForStage is meaningfully called
            };
            
            const iterationNumber = 2;
            const result = await assembler.assemble(project, session, stage, project.initial_user_prompt, iterationNumber);
            
            assertEquals(result, expectedRenderedPrompt);

            assertEquals(gatherInputsCallCount, 1);
            const gatherArgs = lastGatherInputsArgs;
            assertEquals(gatherArgs?.[0], stage);
            assertEquals(gatherArgs?.[1], project);
            assertEquals(gatherArgs?.[2], session);
            assertEquals(gatherArgs?.[3], iterationNumber);

            assertEquals(renderPromptCallCount, 1);
            const renderArgs = lastRenderPromptArgs;
            assertEquals(renderArgs?.[0], stageSystemPromptText);
            
            const expectedDynamicVars: Record<string, unknown> = {
                user_objective: "Subsequent Test Project",
                domain: "Testing Domain",
                agent_count: 1,
                initial_project_context: "Initial prompt for subsequent test.",
                prior_stage_ai_outputs: expectedPriorContributions,
                prior_stage_user_feedback: expectedPriorFeedback,
                deployment_context: 'Not provided.',
                reference_documents: 'Not provided.',
                constraint_boundaries: 'Not provided.',
                stakeholder_considerations: 'Not provided.',
                deliverable_format: 'Standard markdown format.'
            };
            assertEquals(renderArgs?.[1], expectedDynamicVars);
            assertEquals(renderArgs?.[2], null); // No system overlays in this stage mock
            assertEquals(renderArgs?.[3], null); // user_domain_overlay_values is null in project mock

        } finally {
            denoEnvStub?.restore();
            if (originalGatherInputs && assembler) {
                (assembler as any)._gatherInputsForStage = originalGatherInputs;
            }
        }
    });

    await t.step("should throw an error if stage is missing system prompt", async () => {
        const mockDbClient: any = { 
            from: (_table: string) => ({
                select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }),
            }),
            supabaseUrl: "http://localhost:54321",
            supabaseKey: "anon-key",
            auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
            realtime: null,
            storage: { from: (_id: string) => ({}) },
            rpc: () => Promise.resolve({ data: null, error: null }),
        };
        const mockFileManager = new FileManagerService(mockDbClient as SupabaseClient<any>);
        
        let denoEnvStub: any = null;
        let originalGatherInputs: any = null;
        let assembler: PromptAssembler | null = null;

        try {
            denoEnvStub = stub(Deno.env, "get", (key: string) => {
                if (key === "SB_CONTENT_STORAGE_BUCKET") {
                    return "test-bucket";
                }
                return undefined;
            });

            // This mock won't be called if the error is thrown correctly, but it's needed for PromptAssembler instantiation
            const renderPromptMockFn: RenderPromptMock = () => "should-not-be-called"; 

            assembler = new PromptAssembler(
                mockDbClient as SupabaseClient<any>,
                renderPromptMockFn
            );

            const gatherInputsMockFn: GatherInputsMock = async () => {
                return { priorStageContributions: "", priorStageFeedback: "" };
            };
            
            originalGatherInputs = (assembler as any)._gatherInputsForStage;
            (assembler as any)._gatherInputsForStage = gatherInputsMockFn;

            const project: ProjectContext = {
                id: "proj-err",
                user_id: 'user-err',
                project_name: "Error Test Project",
                initial_user_prompt: "Initial prompt for error test.",
                initial_prompt_resource_id: null,
                selected_domain_id: "domain-err",
                dialectic_domains: { name: "Error Domain" },
                process_template_id: 'pt-err',
                selected_domain_overlay_id: null,
                user_domain_overlay_values: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const session: SessionContext = {
                id: "sess-err",
                project_id: "proj-err",
                selected_model_ids: ["model-err"],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                current_stage_id: 'stage-err',
                iteration_count: 1,
                session_description: 'Error test session',
                status: 'pending_thesis',
                associated_chat_id: null,
                user_input_reference_url: null
            };
            
            const stageSlug = "missing-prompt-stage";
            const stage: StageContext = {
                id: "stage-err",
                system_prompts: null, // Key for this test
                domain_specific_prompt_overlays: [],
                slug: stageSlug,
                display_name: 'Missing Prompt Stage',
                description: 'A stage deliberately missing its system prompt',
                created_at: new Date().toISOString(),
                default_system_prompt_id: null,
                expected_output_artifacts: null,
                input_artifact_rules: null 
            };
            
            const iterationNumber = 1;

            await assertRejects(
                async () => {
                    await assembler!.assemble(project, session, stage, project.initial_user_prompt, iterationNumber);
                },
                Error,
                `No system prompt template found for stage ${stage.id}`
            );

        } finally {
            denoEnvStub?.restore();
            if (originalGatherInputs && assembler) {
                (assembler as any)._gatherInputsForStage = originalGatherInputs;
            }
        }
    });

    await t.step("should correctly propagate errors from _gatherInputsForStage", async () => {
        const mockDbClient: any = { 
            // Simplified mock as DB won't be hit directly if _gatherInputsForStage is fully mocked
            from: (_table: string) => ({
                select: () => Promise.resolve({ data: [], error: null }),
            }),
            supabaseUrl: "http://localhost:54321",
            supabaseKey: "anon-key",
            auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
            storage: { from: (_id: string) => ({}) },
        };
        
        let denoEnvStub: any = null;
        let originalGatherInputs: any = null;
        let assembler: PromptAssembler | null = null;
        let consoleErrorSpy: Spy<Console> | null = null;

        try {
            denoEnvStub = stub(Deno.env, "get", (key: string) => {
                if (key === "SB_CONTENT_STORAGE_BUCKET") {
                    return "test-bucket";
                }
                return undefined;
            });

            // This mock won't be called if the error is thrown correctly before rendering
            const renderPromptMockFn: RenderPromptMock = () => "should-not-be-called"; 

            assembler = new PromptAssembler(
                mockDbClient as SupabaseClient<any>,
                renderPromptMockFn
            );

            const originalErrorMessage = "Simulated input gathering failure";
            const gatherInputsMockFn_ThrowsError: GatherInputsMock = async (_stage, _project, _session, _iterationNumber) => {
                throw new Error(originalErrorMessage);
            };
            
            originalGatherInputs = (assembler as any)._gatherInputsForStage;
            (assembler as any)._gatherInputsForStage = gatherInputsMockFn_ThrowsError;

            consoleErrorSpy = spy(console, "error");

            const project: ProjectContext = {
                id: "proj-err-prop", user_id: 'user-err-prop', project_name: "Error Propagation Test",
                initial_user_prompt: "Initial prompt for error prop test.", initial_prompt_resource_id: null,
                selected_domain_id: "domain-err-prop", dialectic_domains: { name: "Error Prop Domain" },
                process_template_id: 'pt-err-prop', selected_domain_overlay_id: null, user_domain_overlay_values: null,
                repo_url: null, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            };

            const session: SessionContext = {
                id: "sess-err-prop", project_id: "proj-err-prop", selected_model_ids: ["model-err-prop"],
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(), current_stage_id: 'stage-err-prop',
                iteration_count: 1, session_description: 'Error prop test session', status: 'pending_thesis',
                associated_chat_id: null, user_input_reference_url: null
            };
            
            const stage: StageContext = { // Stage needs a system_prompts to pass the initial check in assemble
                id: "stage-err-prop", system_prompts: { prompt_text: "Dummy prompt" }, 
                domain_specific_prompt_overlays: [], slug: "error-prop-stage", display_name: 'Error Prop Stage',
                description: 'A stage for testing error propagation', created_at: new Date().toISOString(),
                default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null 
            };
            
            const iterationNumber = 1;
            const expectedThrownErrorMessagePrefix = "Failed to gather inputs for prompt assembly:";
            
            await assertRejects(
                async () => {
                    await assembler!.assemble(project, session, stage, project.initial_user_prompt, iterationNumber);
                },
                Error,
                `${expectedThrownErrorMessagePrefix} ${originalErrorMessage}` 
            );

            // Verify console.error was called by the catch block in 'assemble'
            assertEquals(consoleErrorSpy.calls.length, 1, "console.error was not called exactly once");
            const consoleErrorArgs = consoleErrorSpy.calls[0].args;
            assertEquals(typeof consoleErrorArgs[0], 'string');
            assert((consoleErrorArgs[0] as string).startsWith("[PromptAssembler.assemble] Error during input gathering:"), "console.error message preamble did not match");
            assert((consoleErrorArgs[0] as string).includes(originalErrorMessage), "console.error message did not include original error message");
            
            const errorDetailsLogged = consoleErrorArgs[1] as { error: Error, stageSlug: string, projectId: string, sessionId: string };
            assertEquals(errorDetailsLogged.error.message, originalErrorMessage);
            assertEquals(errorDetailsLogged.stageSlug, stage.slug);
            assertEquals(errorDetailsLogged.projectId, project.id);
            assertEquals(errorDetailsLogged.sessionId, session.id);

        } finally {
            denoEnvStub?.restore();
            consoleErrorSpy?.restore();
            if (originalGatherInputs && assembler) {
                (assembler as any)._gatherInputsForStage = originalGatherInputs;
            }
        }
    });

    await t.step("getContextDocuments should return null in its initial stub implementation", async () => {
        const mockDbClient: any = { 
            from: (_table: string) => ({
                select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: "OK" }),
            }),
            supabaseUrl: "http://localhost:54321",
            supabaseKey: "anon-key",
            auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
            realtime: null,
            storage: { from: (_id: string) => ({}) },
            rpc: () => Promise.resolve({ data: null, error: null }),
        };
        const mockFileManager = new FileManagerService(mockDbClient as SupabaseClient<Database>);
        let denoEnvStub: any;

        try {
            denoEnvStub = stub(Deno.env, "get", (key: string) => {
                if (key === "SB_CONTENT_STORAGE_BUCKET") {
                    return "test-bucket";
                }
                return undefined;
            });

            // For this test, we don't need to mock renderPrompt specifically, 
            // as getContextDocuments doesn't call it. We can let PromptAssembler use its default.
            const assembler = new PromptAssembler(mockDbClient as SupabaseClient<Database>);

            const mockProjectContext: ProjectContext = { 
                id: "proj-test-ctx",
                user_id: 'user-test',
                project_name: "Test Project Context",
                initial_user_prompt: "Initial prompt for context test.",
                initial_prompt_resource_id: null,
                selected_domain_id: "domain-test",
                dialectic_domains: { name: "Test Domain" },
                process_template_id: 'pt-test',
                selected_domain_overlay_id: null,
                user_domain_overlay_values: null,
                repo_url: null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const mockStageContext: StageContext = { 
                id: "stage-test-ctx",
                slug: "test-stage-slug",
                display_name: "Test Stage Display Name",
                description: "Test stage description",
                default_system_prompt_id: null,
                input_artifact_rules: null,
                expected_output_artifacts: null,
                system_prompts: null, 
                domain_specific_prompt_overlays: [], 
                created_at: new Date().toISOString(),
            };

            const result = await assembler.getContextDocuments(
                mockProjectContext, 
                mockStageContext
            );
            assertEquals(result, null);
        } finally {
            if (denoEnvStub) {
                denoEnvStub.restore();
            }
        }
    });
}); 