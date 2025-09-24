import { assertThrows, assertEquals, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy, assertSpyCalls, assertSpyCall } from "jsr:@std/testing@0.225.1/mock";
import { PromptAssembler } from "./prompt-assembler.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup } from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { AssembleFn } from "./assemble.ts";
import { GatherContextFn } from "./gatherContext.ts";
import { RenderFn } from "./render.ts";
import { GatherInputsForStageFn } from "./gatherInputsForStage.ts";
import { GatherContinuationInputsFn } from "./gatherContinuationInputs.ts";
import { DynamicContextVariables, AssemblerSourceDocument, ProjectContext, SessionContext, StageContext, ContributionOverride } from "./prompt-assembler.interface.ts";
import { Messages } from "../types.ts";

Deno.test("PromptAssembler", async (t) => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
    let denoEnvStub: any = null;
    
    // Shared mock data
    const mockProject: ProjectContext = {
        id: "project-id",
        created_at: new Date().toISOString(),
        initial_user_prompt: "Test prompt",
        project_name: "Test Project",
        selected_domain_id: "domain-id",
        status: "active",
        updated_at: new Date().toISOString(),
        user_id: "user-id",
        dialectic_domains: { name: "Test Domain" },
        initial_prompt_resource_id: null,
        process_template_id: null,
        repo_url: null,
        selected_domain_overlay_id: null,
        user_domain_overlay_values: null,
    };
    
    const mockSession: SessionContext = {
        id: "session-id",
        created_at: new Date().toISOString(),
        current_stage_id: "stage-id",
        iteration_count: 1,
        project_id: "project-id",
        status: "active",
        updated_at: new Date().toISOString(),
        associated_chat_id: null,
        selected_model_ids: [],
        session_description: null,
        user_input_reference_url: null,
    };

    const mockStage: StageContext = {
        id: "stage-id",
        created_at: new Date().toISOString(),
        display_name: "Test Stage",
        slug: "test-stage",
        default_system_prompt_id: null,
        description: null,
        expected_output_artifacts: null,
        input_artifact_rules: null,
        system_prompts: null,
        domain_specific_prompt_overlays: [],
    };

    const mockDynamicContext: DynamicContextVariables = {
        user_objective: 'mock user objective',
        domain: 'mock domain',
        agent_count: 1,
        context_description: 'mock context description',
        original_user_request: 'mock original user request',
        prior_stage_ai_outputs: 'mock prior stage ai outputs',
        prior_stage_user_feedback: 'mock prior stage user feedback',
        deployment_context: null,
        reference_documents: null,
        constraint_boundaries: null,
        stakeholder_considerations: null,
        deliverable_format: 'Standard markdown format.',
    };

    const setup = (envVars: Record<string, string> = {}) => {
        denoEnvStub = stub(Deno.env, "get", (key: string) => envVars[key]);
        mockSupabaseSetup = createMockSupabaseClient();
        
        return {
            client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        };
    };

    const teardown = () => {
        denoEnvStub?.restore();
        if (mockSupabaseSetup) {
            mockSupabaseSetup.clearAllStubs?.();
        }
    };

    await t.step("constructor should throw an error if SB_CONTENT_STORAGE_BUCKET is not set", () => {
        try {
            const { client } = setup(); // No env vars provided
            assertThrows(
                () => {
                    new PromptAssembler(client);
                },
                Error,
                "SB_CONTENT_STORAGE_BUCKET environment variable is not set."
            );
        } finally {
            teardown();
        }
    });

    await t.step("constructor should use default functions when none are provided", () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const assembler = new PromptAssembler(client);
            
            // Assert that internal function properties are assigned the default imports.
            // This is a "white box" test, but necessary to ensure DI fallback.
            assert(assembler['assembleFn'], "assembleFn should be set");
            assert(assembler['gatherContextFn'], "gatherContextFn should be set");
            assert(assembler['renderFn'], "renderFn should be set");
            assert(assembler['gatherInputsForStageFn'], "gatherInputsForStageFn should be set");
            assert(assembler['gatherContinuationInputsFn'], "gatherContinuationInputsFn should be set");
        } finally {
            teardown();
        }
    });

    await t.step("assemble should call the injected assembleFn with the correct arguments", async () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockAssembleFn: AssembleFn = () => Promise.resolve("");
            const assembleSpy = spy(mockAssembleFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                assembleSpy
            );
            
            const projectInitialUserPrompt = "prompt";
            const iterationNumber = 1;
            const continuationContent = "continue";

            await assembler.assemble(mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber, continuationContent);

            assertSpyCalls(assembleSpy, 1);
            assertSpyCall(assembleSpy, 0, {
                args: [client, assembler['downloadFromStorageFn'], assembler['gatherInputsForStageFn'], assembler['renderPromptFn'], mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber, continuationContent],
            });
        } finally {
            teardown();
        }
    });

    await t.step("assemble should call the injected assembleFn correctly when continuationContent is omitted", async () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockAssembleFn: AssembleFn = () => Promise.resolve("");
            const assembleSpy = spy(mockAssembleFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                assembleSpy
            );
            
            const projectInitialUserPrompt = "prompt";
            const iterationNumber = 1;

            await assembler.assemble(mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber);

            assertSpyCalls(assembleSpy, 1);
            assertSpyCall(assembleSpy, 0, {
                args: [client, assembler['downloadFromStorageFn'], assembler['gatherInputsForStageFn'], assembler['renderPromptFn'], mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber, undefined],
            });
        } finally {
            teardown();
        }
    });

    await t.step("gatherContext should call the injected gatherContextFn with the correct arguments", async () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockGatherContextFn: GatherContextFn = () => Promise.resolve(mockDynamicContext);
            const gatherContextSpy = spy(mockGatherContextFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                undefined,
                gatherContextSpy
            );

            const projectInitialUserPrompt = "prompt";
            const iterationNumber = 1;
            const overrideContributions: ContributionOverride[] = [{ content: "override" }];

            await assembler.gatherContext(mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber, overrideContributions);

            assertSpyCalls(gatherContextSpy, 1);
            assertSpyCall(gatherContextSpy, 0, {
                args: [client, assembler['downloadFromStorageFn'], assembler['gatherInputsForStageFn'], mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber, overrideContributions],
            });
        } finally {
            teardown();
        }
    });

    await t.step("gatherContext should call the injected gatherContextFn correctly when overrideContributions is omitted", async () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockGatherContextFn: GatherContextFn = () => Promise.resolve(mockDynamicContext);
            const gatherContextSpy = spy(mockGatherContextFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                undefined,
                gatherContextSpy
            );

            const projectInitialUserPrompt = "prompt";
            const iterationNumber = 1;

            await assembler.gatherContext(mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber);

            assertSpyCalls(gatherContextSpy, 1);
            assertSpyCall(gatherContextSpy, 0, {
                args: [client, assembler['downloadFromStorageFn'], assembler['gatherInputsForStageFn'], mockProject, mockSession, mockStage, projectInitialUserPrompt, iterationNumber, undefined],
            });
        } finally {
            teardown();
        }
    });

    await t.step("render should call the injected renderFn with the correct arguments", () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockRenderFn: RenderFn = () => "";
            const renderSpy = spy(mockRenderFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                undefined,
                undefined,
                renderSpy
            );

            const userProjectOverlayValues = { key: "value" };

            assembler.render(mockStage, mockDynamicContext, userProjectOverlayValues);

            assertSpyCalls(renderSpy, 1);
            assertSpyCall(renderSpy, 0, {
                args: [assembler['renderPromptFn'], mockStage, mockDynamicContext, userProjectOverlayValues],
            });
        } finally {
            teardown();
        }
    });

    await t.step("render should call the injected renderFn correctly when userProjectOverlayValues is omitted", () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockRenderFn: RenderFn = () => "";
            const renderSpy = spy(mockRenderFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                undefined,
                undefined,
                renderSpy
            );

            assembler.render(mockStage, mockDynamicContext);

            assertSpyCalls(renderSpy, 1);
            assertSpyCall(renderSpy, 0, {
                args: [assembler['renderPromptFn'], mockStage, mockDynamicContext, null],
            });
        } finally {
            teardown();
        }
    });

    await t.step("gatherInputsForStage should call the injected gatherInputsForStageFn with the correct arguments", async () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockGatherInputsFn: GatherInputsForStageFn = () => Promise.resolve([]);
            const gatherInputsSpy = spy(mockGatherInputsFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                gatherInputsSpy
            );
            
            const iterationNumber = 1;

            await assembler.gatherInputsForStage(mockStage, mockProject, mockSession, iterationNumber);

            assertSpyCalls(gatherInputsSpy, 1);
            assertSpyCall(gatherInputsSpy, 0, {
                args: [client, assembler['downloadFromStorageFn'], mockStage, mockProject, mockSession, iterationNumber],
            });
        } finally {
            teardown();
        }
    });

    await t.step("gatherContinuationInputs should call the injected gatherContinuationInputsFn with the correct arguments", async () => {
        try {
            const { client } = setup({ "SB_CONTENT_STORAGE_BUCKET": "test-bucket" });
            const mockGatherContinuationInputsFn: GatherContinuationInputsFn = () => Promise.resolve([]);
            const gatherContinuationInputsSpy = spy(mockGatherContinuationInputsFn);

            const assembler = new PromptAssembler(
                client,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                gatherContinuationInputsSpy
            );
            
            const chunkId = "chunk-id";

            await assembler.gatherContinuationInputs(chunkId);

            assertSpyCalls(gatherContinuationInputsSpy, 1);
            assertSpyCall(gatherContinuationInputsSpy, 0, {
                args: [client, assembler['downloadFromStorageFn'], chunkId],
            });
        } finally {
            teardown();
        }
    });
});
