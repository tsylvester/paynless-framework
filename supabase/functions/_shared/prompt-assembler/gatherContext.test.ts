import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import { gatherContext } from "./gatherContext.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssemblerSourceDocument,
  GatheredRecipeContext,
  DynamicContextVariables,
} from "./prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import {
  DialecticRecipeStep,
  DialecticRecipeTemplateStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../types/file_manager.types.ts";

const mockSimpleRecipeStep: DialecticRecipeTemplateStep = {
  id: "step-123",
  job_type: "EXECUTE",
  step_key: "simple-step",
  step_slug: "simple-step-slug",
  step_name: "Simple Step",
  step_number: 1,
  prompt_type: "Turn",
  granularity_strategy: "per_source_document",
  output_type: FileType.HeaderContext,
  inputs_required: [],
  inputs_relevance: [],
  outputs_required: {},
  parallel_group: null,
  prompt_template_id: null,
  branch_key: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  step_description: "A simple step",
  template_id: "template-123",
};

const mockRecipeStepWithInputs: DialecticRecipeTemplateStep = {
  ...mockSimpleRecipeStep,
  id: "step-with-inputs",
  inputs_required: [
    { type: "document", slug: "failing-stage", required: true },
  ],
};

const mockComplexRecipeStep: DialecticRecipeTemplateStep = {
  ...mockSimpleRecipeStep,
  id: "step-456",
  job_type: "PLAN",
  step_key: "complex-step",
};

Deno.test("gatherContext", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let denoEnvStub: any = null;
  const consoleSpies: { error?: Spy<Console>; warn?: Spy<Console> } = {};

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

    return {
      mockSupabaseClient: mockSupabaseSetup.client,
      spies: mockSupabaseSetup.spies,
    };
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
    user_id: "user-123",
    project_name: "Test Project Objective",
    initial_user_prompt: "This is the initial user prompt content.",
    initial_prompt_resource_id: null,
    selected_domain_id: "domain-123",
    dialectic_domains: { name: "Software Development Domain" },
    process_template_id: "pt-123",
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
    repo_url: null,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const defaultSession: SessionContext = {
    id: "sess-123",
    project_id: "proj-123",
    selected_model_ids: ["model-1", "model-2"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_stage_id: "stage-123",
    iteration_count: 1,
    session_description: "Test session",
    status: "pending_thesis",
    associated_chat_id: null,
    user_input_reference_url: null,
  };

  const defaultStage: StageContext = {
    id: "stage-123",
    system_prompts: { prompt_text: "System prompt" },
    domain_specific_prompt_overlays: [],
    slug: "initial-hypothesis",
    display_name: "Initial hypothesis",
    description: "Initial hypothesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: null,
    recipe_step: mockSimpleRecipeStep,
    active_recipe_instance_id: null,
    expected_output_template_ids: [],
    recipe_template_id: null,
  };

  await t.step(
    "should correctly propagate errors from gatherInputsForStage",
    async () => {
      const originalErrorMessage = "Simulated DB Error";
      const { mockSupabaseClient } = setup();

      try {
        const stageWithRequiredInput: StageContext = {
          ...defaultStage,
          id: "stage-err-prop",
          slug: "error-prop-stage",
          recipe_step: mockRecipeStepWithInputs,
        };

        await assertRejects(
          async () => {
            const downloadFn = (bucket: string, path: string) =>
              downloadFromStorage(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                bucket,
                path,
              );
            const gatherInputsFn = () =>
              Promise.reject(new Error(originalErrorMessage));
            await gatherContext(
              mockSupabaseClient as unknown as SupabaseClient<Database>,
              downloadFn,
              gatherInputsFn,
              defaultProject,
              defaultSession,
              stageWithRequiredInput,
              defaultProject.initial_user_prompt,
              1,
            );
          },
          Error,
          "Failed to gather inputs for prompt assembly",
        );
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "should correctly map project and session properties to the dynamic context",
    async () => {
      const { mockSupabaseClient } = setup();

      try {
        const downloadFn = (bucket: string, path: string) =>
          downloadFromStorage(
            mockSupabaseClient as unknown as SupabaseClient<Database>,
            bucket,
            path,
          );

        const mockGatheredContext: GatheredRecipeContext = {
          sourceDocuments: [],
          recipeStep: mockSimpleRecipeStep,
        };
        const gatherInputsFn = spy(() => Promise.resolve(mockGatheredContext));

        const context: DynamicContextVariables = await gatherContext(
          mockSupabaseClient as unknown as SupabaseClient<Database>,
          downloadFn,
          gatherInputsFn,
          defaultProject,
          defaultSession,
          defaultStage,
          defaultProject.initial_user_prompt,
          1,
        );

        assertEquals(context.user_objective, defaultProject.project_name);
        assertEquals(context.domain, defaultProject.dialectic_domains.name);
        assertEquals(
          context.context_description,
          defaultProject.initial_user_prompt,
        );
        assertEquals(context.recipeStep, mockSimpleRecipeStep);
        
        // Assert that optional properties are absent when not provided
        assert(!("deployment_context" in context), "deployment_context should be absent");
        assert(!("reference_documents" in context), "reference_documents should be absent");
        assert(!("constraint_boundaries" in context), "constraint_boundaries should be absent");
        assert(!("stakeholder_considerations" in context), "stakeholder_considerations should be absent");

      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "should set original_user_request when stage has a processing strategy",
    async () => {
      const { mockSupabaseClient } = setup();

      try {
        const stageWithStrategy: StageContext = {
          ...defaultStage,
          recipe_step: mockComplexRecipeStep,
        };

        const downloadFn = (bucket: string, path: string) =>
          downloadFromStorage(
            mockSupabaseClient as unknown as SupabaseClient<Database>,
            bucket,
            path,
          );

        const mockGatheredContext: GatheredRecipeContext = {
          sourceDocuments: [],
          recipeStep: mockComplexRecipeStep,
        };
        const gatherInputsFn = spy(() => Promise.resolve(mockGatheredContext));

        const context: DynamicContextVariables = await gatherContext(
          mockSupabaseClient as unknown as SupabaseClient<Database>,
          downloadFn,
          gatherInputsFn,
          defaultProject,
          defaultSession,
          stageWithStrategy,
          defaultProject.initial_user_prompt,
          1,
        );

        assertEquals(
          context.original_user_request,
          defaultProject.initial_user_prompt,
        );
        assertEquals(context.recipeStep, mockComplexRecipeStep);
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "should call its dependency with the correct recipe step and pass through the results",
    async () => {
        const { mockSupabaseClient } = setup();

        try {
            const sourceDocs: AssemblerSourceDocument[] = [
                { id: 'c1', type: 'document', content: 'Test doc', metadata: { displayName: 'Test' } }
            ];

            const mockGatheredContext: GatheredRecipeContext = {
                sourceDocuments: sourceDocs,
                recipeStep: mockRecipeStepWithInputs
            };
            const gatherInputsFn = spy((..._args) => Promise.resolve(mockGatheredContext));


            const downloadFn = (bucket: string, path: string) =>
                downloadFromStorage(
                    mockSupabaseClient as unknown as SupabaseClient<Database>,
                    bucket,
                    path,
                );
            
            const stageWithInputs: StageContext = { ...defaultStage, recipe_step: mockRecipeStepWithInputs };

            const context: DynamicContextVariables = await gatherContext(
                mockSupabaseClient as unknown as SupabaseClient<Database>,
                downloadFn,
                gatherInputsFn,
                defaultProject,
                defaultSession,
                stageWithInputs,
                defaultProject.initial_user_prompt,
                1,
            );

            // Assert dependency was called correctly
            assertEquals(gatherInputsFn.calls.length, 1);
            const passedStageArg = gatherInputsFn.calls[0].args[2];
            assertEquals(passedStageArg, stageWithInputs);

            // Assert results were passed through
            assertEquals(context.sourceDocuments, sourceDocs);
            assertEquals(context.recipeStep, mockRecipeStepWithInputs);

        } finally {
            teardown();
        }
    }
  );
});
