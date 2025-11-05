import { assertThrows, assertEquals, assert } from "jsr:@std/assert@0.225.3";
import {
  spy,
  stub,
  assertSpyCalls,
  assertSpyCall,
} from "jsr:@std/testing@0.225.1/mock";
import { PromptAssembler } from "./prompt-assembler.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
} from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../../types_db.ts";
import {
  type AssembledPrompt,
  type AssemblePlannerPromptDeps,
  type AssembleSeedPromptDeps,
  type AssembleTurnPromptDeps,
  type AssembleContinuationPromptDeps,
  type ProjectContext,
  type SessionContext,
  type StageContext,
  type AssemblePromptOptions,
  type RenderFn,
  type RenderPromptFunctionType,
  type DynamicContextVariables,
} from "./prompt-assembler.interface.ts";
import { IFileManager, FileType } from "../types/file_manager.types.ts";
import { FileManagerService } from "../services/file_manager.ts";
import {
  DialecticJobRow,
  DialecticRecipeStep,
  DialecticStageRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";


// Mock implementations for standalone functions
const mockAssembleSeedPrompt = (
  _deps: AssembleSeedPromptDeps,
): Promise<AssembledPrompt> =>
  Promise.resolve({
    promptContent: "seed",
    source_prompt_resource_id: "seed-id",
  });
const mockAssemblePlannerPrompt = (
  _deps: AssemblePlannerPromptDeps,
): Promise<AssembledPrompt> =>
  Promise.resolve({
    promptContent: "planner",
    source_prompt_resource_id: "planner-id",
  });
const mockAssembleTurnPrompt = (
  _deps: AssembleTurnPromptDeps,
): Promise<AssembledPrompt> =>
  Promise.resolve({
    promptContent: "turn",
    source_prompt_resource_id: "turn-id",
  });
const mockAssembleContinuationPrompt = (
  _deps: AssembleContinuationPromptDeps,
): Promise<AssembledPrompt> =>
  Promise.resolve({
    promptContent: "continuation",
    source_prompt_resource_id: "continuation-id",
  });

const mockRenderFn: RenderFn = (
  _renderPromptFn: RenderPromptFunctionType,
  _stage: StageContext,
  _context: DynamicContextVariables,
  _userProjectOverlayValues: Json | null,
) => "rendered_prompt";

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
  selected_model_ids: ["model-1"],
  session_description: null,
  user_input_reference_url: null,
};

const mockRecipeStep: DialecticStageRecipeStep = {
  id: "recipe-step-id",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  step_name: "test-step",
  job_type: "PLAN",
  prompt_type: "Planner",
  granularity_strategy: "all_to_one",
  inputs_required: [],
  inputs_relevance: [],
  outputs_required: [],
  prompt_template_id: "prompt-template-id",
  template_step_id: "template-step-id",
  branch_key: "main",
  config_override: {},
  execution_order: 1,
  output_type: FileType.HeaderContext,
  parallel_group: null,
  step_description: "test-step-description",
  step_key: "step-key",
  step_slug: "test-step",
  instance_id: "instance-id",
  is_skipped: false,
  object_filter: {},
  output_overrides: {},
};

const mockStage: StageContext = {
  id: "stage-id",
  created_at: new Date().toISOString(),
  display_name: "Test Stage",
  slug: "test-stage",
  recipe_step: mockRecipeStep,
  default_system_prompt_id: null,
  description: null,
  system_prompts: null,
  domain_specific_prompt_overlays: [],
  active_recipe_instance_id: null,
  expected_output_template_ids: [],
  recipe_template_id: null,
};

const mockJob: DialecticJobRow = {
  id: "job-id",
  created_at: new Date().toISOString(),
  session_id: "session-id",
  user_id: "user-id",
  status: "pending",
  payload: { model_id: "model-1" },
  parent_job_id: null,
  error_details: null,
  completed_at: null,
  attempt_count: 0,
  iteration_number: 1,
  is_test_job: false,
  job_type: "EXECUTE",
  stage_slug: "test-stage",
  target_contribution_id: null,
  max_retries: 3,
  prerequisite_job_id: null,
  results: null,
  started_at: null,
};

// --- END: Mocks ---

Deno.test("PromptAssembler", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let denoEnvStub: any = null;

  const setup = (envVars: Record<string, string> = {}) => {
    denoEnvStub = stub(Deno.env, "get", (key: string) => envVars[key]);
    mockSupabaseSetup = createMockSupabaseClient();
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<
      Database
    >;
    
    let fileManager: IFileManager | null = null;
    try {
      fileManager = new FileManagerService(client, { constructStoragePath: () => ({ storagePath: '', fileName: '' }) });
    } catch (e) {
      // Allow setup to proceed without a file manager if the env var is not set, 
      // so that the constructor test can fail gracefully.
      if (e instanceof Error && e.message !== "SB_CONTENT_STORAGE_BUCKET environment variable is not set.") {
        throw e; // re-throw unexpected errors
      }
    }

    return { client, fileManager };
  };

  const teardown = () => {
    denoEnvStub?.restore();
    mockSupabaseSetup?.clearAllStubs?.();
  };

  await t.step(
    "constructor should throw an error if SB_CONTENT_STORAGE_BUCKET is not set",
    () => {
      try {
        const { client } = setup(); // No env vars
        assertThrows(
          () =>
            new FileManagerService(client, {
              constructStoragePath: () => ({ storagePath: "", fileName: "" }),
            }),
          Error,
          "SB_CONTENT_STORAGE_BUCKET environment variable is not set.",
        );
      } finally {
        teardown();
      }
    },
  );

  await t.step("assembleSeedPrompt should call the injected function", async () => {
    try {
      const { client, fileManager } = setup({
        "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
      });
      const assembleSeedSpy = spy(mockAssembleSeedPrompt);
      const assembler = new PromptAssembler(
        client,
        fileManager!,
        undefined,
        undefined,
        assembleSeedSpy,
      );

      const deps: AssembleSeedPromptDeps = {
        dbClient: client,
        fileManager: fileManager!,
        project: mockProject,
        session: mockSession,
        stage: mockStage,
        projectInitialUserPrompt: "init prompt",
        iterationNumber: 1,
        downloadFromStorageFn: assembler["downloadFromStorageFn"],
        gatherInputsForStageFn: assembler["gatherInputsForStageFn"],
        renderPromptFn: assembler["renderPromptFn"],
      };

      await assembler.assembleSeedPrompt(deps);

      assertSpyCalls(assembleSeedSpy, 1);
      assertEquals(assembleSeedSpy.calls[0].args[0], deps);
    } finally {
      teardown();
    }
  });

  await t.step("assemblePlannerPrompt should call the injected function", async () => {
    try {
      const { client, fileManager } = setup({
        "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
      });
      const assemblePlannerSpy = spy(mockAssemblePlannerPrompt);
      const assembler = new PromptAssembler(
        client,
        fileManager!,
        undefined,
        undefined,
        undefined,
        assemblePlannerSpy,
      );

      const deps: AssemblePlannerPromptDeps = {
        dbClient: client,
        fileManager: fileManager!,
        job: { ...mockJob, job_type: "PLAN" },
        project: mockProject,
        session: mockSession,
        stage: mockStage,
        gatherContext: assembler["gatherContextFn"],
        render: mockRenderFn,
      };

      await assembler.assemblePlannerPrompt(deps);

      assertSpyCalls(assemblePlannerSpy, 1);
      assertEquals(assemblePlannerSpy.calls[0].args[0], deps);
    } finally {
      teardown();
    }
  });

  await t.step("assembleTurnPrompt should call the injected function", async () => {
    try {
      const { client, fileManager } = setup({
        "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
      });
      const assembleTurnSpy = spy(mockAssembleTurnPrompt);
      const assembler = new PromptAssembler(
        client,
        fileManager!,
        undefined,
        undefined,
        undefined,
        undefined,
        assembleTurnSpy,
      );

      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        fileManager: fileManager!,
        job: { ...mockJob, job_type: "EXECUTE" },
        project: mockProject,
        session: mockSession,
        stage: mockStage,
        gatherContext: assembler["gatherContextFn"],
        render: mockRenderFn,
      };

      await assembler.assembleTurnPrompt(deps);

      assertSpyCalls(assembleTurnSpy, 1);
      assertEquals(assembleTurnSpy.calls[0].args[0], deps);
    } finally {
      teardown();
    }
  });

  await t.step(
    "assembleContinuationPrompt should call the injected function",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        const assembleContinuationSpy = spy(mockAssembleContinuationPrompt);
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          assembleContinuationSpy,
        );

        const deps: AssembleContinuationPromptDeps = {
          dbClient: client,
          fileManager: fileManager!,
          job: mockJob,
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          continuationContent: "continue this...",
          gatherContext: assembler["gatherContextFn"],
        };

        await assembler.assembleContinuationPrompt(deps);

        assertSpyCalls(assembleContinuationSpy, 1);
        assertEquals(assembleContinuationSpy.calls[0].args[0], deps);
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "assemble router should delegate to assembleSeedPrompt",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          mockAssembleSeedPrompt,
        );
        const seedSpy = spy(assembler, "assembleSeedPrompt");

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          projectInitialUserPrompt: "init prompt",
          iterationNumber: 1,
        };

        await assembler.assemble(options);

        assertSpyCalls(seedSpy, 1);
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "assemble router should delegate to assemblePlannerPrompt",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          mockAssemblePlannerPrompt,
        );
        const plannerSpy = spy(assembler, "assemblePlannerPrompt");

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          projectInitialUserPrompt: "init prompt",
          iterationNumber: 1,
          job: {
            id: "job-id-planner",
            created_at: new Date().toISOString(),
            session_id: "session-id",
            user_id: "user-id",
            status: "pending",
            parent_job_id: null,
            error_details: null,
            completed_at: null,
            attempt_count: 0,
            iteration_number: 1,
            is_test_job: false,
            stage_slug: "test-stage",
            target_contribution_id: null,
            max_retries: 3,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            job_type: "PLAN",
            payload: {
              job_type: "PLAN",
              header_context_resource_id: "mock-header-id",
            },
          },
        };

        await assembler.assemble(options);

        assertSpyCalls(plannerSpy, 1);
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "assemble router should delegate to assembleTurnPrompt",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          undefined,
          mockAssembleTurnPrompt,
        );
        const turnSpy = spy(assembler, "assembleTurnPrompt");

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          projectInitialUserPrompt: "init prompt",
          iterationNumber: 1,
          job: { ...mockJob, job_type: "EXECUTE" },
        };

        await assembler.assemble(options);

        assertSpyCalls(turnSpy, 1);
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "assemble router should delegate to assembleContinuationPrompt",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockAssembleContinuationPrompt,
        );
        const continuationSpy = spy(assembler, "assembleContinuationPrompt");

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          projectInitialUserPrompt: "init prompt",
          iterationNumber: 1,
          job: mockJob,
          continuationContent: "continue this...",
        };

        await assembler.assemble(options);

        assertSpyCalls(continuationSpy, 1);
      } finally {
        teardown();
      }
    },
  );
});
