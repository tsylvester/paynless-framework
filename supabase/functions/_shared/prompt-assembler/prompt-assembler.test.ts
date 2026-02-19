import { assertThrows, assertEquals } from "jsr:@std/assert@0.225.3";
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
  type MockSupabaseDataConfig,
} from "../supabase.mock.ts";
import { createMockDownloadFromStorage } from "../supabase_storage_utils.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../../types_db.ts";
import {
  type AssembledPrompt,
  type AssemblePlannerPromptDeps,
  type AssembleSeedPromptDeps,
  type AssembleTurnPromptDeps,
  type AssembleTurnPromptParams,
  type AssembleContinuationPromptDeps,
  type ProjectContext,
  type SessionContext,
  type StageContext,
  type AssemblePromptOptions,
  type RenderFn,
  type RenderPromptFunctionType,
  type DynamicContextVariables,
  type GatheredRecipeContext,
} from "./prompt-assembler.interface.ts";
import { gatherInputsForStage, type GatherInputsForStageFn } from "./gatherInputsForStage.ts";
import type { GatherContextFn } from "./gatherContext.ts";
import {
  IFileManager,
  FileType,
  UploadContext,
  type FileRecord,
} from "../types/file_manager.types.ts";
import type { ServiceError } from "../types.ts";
import { FileManagerService } from "../services/file_manager.ts";
import {
  DialecticJobRow,
  DialecticStageRecipeStep,
  OutputRule,
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
  _params: AssembleTurnPromptParams,
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

const mockOutputRule: OutputRule = {
  documents: [{
    artifact_class: "rendered_document",
    file_type: "markdown",
    document_key: FileType.HeaderContext,
    template_filename: "template.md",
  }],
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
  outputs_required: mockOutputRule,
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

// Definitive synthesis planner step shape: 20251006194549_synthesis_stage.sql plus
// 20260109165706_state_machine_fix.sql (seed_prompt slug -> thesis) and
// 20260112211754_antithesis_keys_fix.sql (branch_key -> header_context_pairwise).
const synthesisPlannerOutputsRequired: OutputRule = {
  system_materials: {
    stage_rationale: "",
    agent_notes_to_self: "",
    input_artifacts_summary: "",
  },
  header_context_artifact: {
    type: "header_context",
    document_key: "header_context_pairwise",
    artifact_class: "header_context",
    file_type: "json",
  },
  context_for_documents: [
    {
      document_key: FileType.synthesis_pairwise_business_case,
      content_to_include: {
        thesis_document: "business_case",
        critique_document: "business_case_critique",
        comparison_signal: "comparison_vector",
        agent_notes_to_self: "",
      },
    },
  ],
};

const synthesisPlannerRecipeStep: DialecticStageRecipeStep = {
  id: "synthesis-planner-step-id",
  instance_id: "instance-id",
  template_step_id: null,
  step_key: "synthesis_prepare_pairwise_header",
  step_slug: "prepare-pairwise-synthesis-header",
  step_name: "Prepare Pairwise Synthesis Header",
  step_description: "Generate HeaderContext JSON that guides pairwise synthesis turns.",
  job_type: "PLAN",
  prompt_type: "Planner",
  prompt_template_id: "spt-synthesis-planner",
  output_type: FileType.HeaderContext,
  granularity_strategy: "all_to_one",
  inputs_required: [
    { type: "seed_prompt", slug: "thesis", document_key: FileType.SeedPrompt, required: true },
  ],
  inputs_relevance: [{ document_key: FileType.SeedPrompt, slug: "thesis", relevance: 1.0 }],
  outputs_required: synthesisPlannerOutputsRequired,
  config_override: {},
  object_filter: {},
  output_overrides: {},
  is_skipped: false,
  execution_order: 1,
  parallel_group: null,
  branch_key: "header_context_pairwise",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStageForPlanner: StageContext = {
  ...mockStage,
  slug: "synthesis",
  recipe_step: synthesisPlannerRecipeStep,
  system_prompts: { prompt_text: "Planner prompt for pairwise synthesis header." },
};

// EXECUTE step shape from 20251006194549_synthesis_stage.sql step 4.2 (synthesis_pairwise_business_case).
const synthesisExecuteOutputsRequired: OutputRule = {
  documents: [{
    artifact_class: "assembled_json",
    document_key: FileType.synthesis_pairwise_business_case,
    template_filename: "synthesis_pairwise_business_case.json",
    content_to_include: {},
    file_type: "json",
  }],
  files_to_generate: [{
    from_document_key: "synthesis_pairwise_business_case",
    template_filename: "synthesis_pairwise_business_case.json",
  }],
};

const synthesisExecuteRecipeStep: DialecticStageRecipeStep = {
  id: "synthesis-pairwise-business-step-id",
  instance_id: "instance-id",
  template_step_id: null,
  step_key: "synthesis_pairwise_business_case",
  step_slug: "pairwise-synthesis-business-case",
  step_name: "Pairwise Synthesis – Business Case",
  step_description: "Combine the thesis business case with critiques.",
  job_type: "EXECUTE",
  prompt_type: "Turn",
  prompt_template_id: "spt-synthesis-pairwise-business",
  output_type: FileType.AssembledDocumentJson,
  granularity_strategy: "per_source_document",
  inputs_required: [],
  inputs_relevance: [],
  outputs_required: synthesisExecuteOutputsRequired,
  config_override: {},
  object_filter: {},
  output_overrides: {},
  is_skipped: false,
  execution_order: 2,
  parallel_group: 2,
  branch_key: "synthesis_pairwise_business_case",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStageForTurn: StageContext = {
  ...mockStage,
  slug: "synthesis",
  recipe_step: synthesisExecuteRecipeStep,
  system_prompts: { prompt_text: "Turn prompt for pairwise business case." },
};

const plannerFileRecord: FileRecord = {
  id: "planner-resource-id",
  project_id: mockProject.id,
  file_name: "planner_prompt.md",
  storage_bucket: "test-bucket",
  storage_path: "path/to/planner_prompt.md",
  mime_type: "text/markdown",
  size_bytes: 0,
  resource_description: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: mockProject.user_id,
  session_id: mockSession.id,
  stage_slug: mockStageForPlanner.slug,
  iteration_number: 1,
  resource_type: "planner_prompt",
  source_contribution_id: null,
};

// --- END: Mocks ---

Deno.test("PromptAssembler", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let denoEnvStub: any = null;

  const setup = (envVars: Record<string, string> = {}, config: MockSupabaseDataConfig = {}) => {
    denoEnvStub = stub(Deno.env, "get", (key: string) => envVars[key]);
    mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<
      Database
    >;
    
    let fileManager: IFileManager | null = null;
    try {
      fileManager = new FileManagerService(client, { constructStoragePath: () => ({ storagePath: '', fileName: '' }), logger: console });
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
              logger: console,
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
        projectInitialUserPrompt: "init prompt",
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
        gatherContext: assembler["gatherContextFn"],
        render: mockRenderFn,
        downloadFromStorage: async (_supabase, _bucket, _path) => ({ data: null, error: null }),
      };

      const params: AssembleTurnPromptParams = {
        job: { ...mockJob, job_type: "EXECUTE" },
        project: mockProject,
        session: mockSession,
        stage: mockStage,
      };

      await assembler.assembleTurnPrompt(deps, params);

      assertSpyCalls(assembleTurnSpy, 1);
      assertEquals(assembleTurnSpy.calls[0].args[0], deps);
      assertEquals(assembleTurnSpy.calls[0].args[1], params);
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
    "assemble router should delegate to assemblePlannerPrompt when recipe step is PLAN even if payload is EXECUTE",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        const assemblePlannerSpy = spy(mockAssemblePlannerPrompt);
        const assembleTurnSpy = spy(mockAssembleTurnPrompt);
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          assemblePlannerSpy,
          assembleTurnSpy,
        );

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage, // Has recipe_step.job_type === "PLAN" (line 125)
          projectInitialUserPrompt: "init prompt",
          iterationNumber: 1,
          job: {
            ...mockJob,
            job_type: "EXECUTE",
            payload: {
              model_id: "model-1",
              job_type: "EXECUTE", // EXECUTE payload (child job from planner)
            },
          },
        };

        await assembler.assemble(options);

        // Assert: Should route to assemblePlannerPrompt (recipe_step.job_type === "PLAN")
        assertSpyCalls(assemblePlannerSpy, 1);
        // Assert: Should NOT route to assembleTurnPrompt
        assertSpyCalls(assembleTurnSpy, 0);
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

  await t.step("assemble should pass sourceContributionId through to upload context", async () => {
      const expectedSourceContributionId = "source-contribution-123";
      const uploadContext: UploadContext = {
        fileContent: "seed prompt",
        mimeType: "text/plain",
        sizeBytes: 10,
        userId: null,
        description: "seed prompt upload",
        pathContext: {
          projectId: mockProject.id,
          fileType: FileType.SeedPrompt,
          sourceContributionId: expectedSourceContributionId,
        },
      };

      const { client, fileManager } = setup({
        "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
      });

      const uploadSpy = stub(
        fileManager!,
        "uploadAndRegisterFile",
        async () => ({
          record: null,
          error: { message: "test stub" },
        }),
      );

      try {
        const assembleSeedPromptStub = spy(
          async (deps: AssembleSeedPromptDeps): Promise<AssembledPrompt> => {
            const assembledUploadContext: UploadContext = {
              fileContent: "seed prompt",
              mimeType: "text/plain",
              sizeBytes: 10,
              userId: null,
              description: "seed prompt upload",
              pathContext: {
                projectId: deps.project.id,
                fileType: FileType.SeedPrompt,
                sourceContributionId: deps.sourceContributionId ?? null,
              },
            };
            await deps.fileManager.uploadAndRegisterFile(
              assembledUploadContext,
            );
            return mockAssembleSeedPrompt(deps);
          },
        );

        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          assembleSeedPromptStub,
        );

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          projectInitialUserPrompt: "init prompt",
          iterationNumber: 1,
          sourceContributionId: expectedSourceContributionId,
        };

        await assembler.assemble(options);

        assertSpyCalls(assembleSeedPromptStub, 1);
        assertSpyCalls(uploadSpy, 1);
        const actualUploadContext = uploadSpy.calls[0].args[0];
        assertEquals(
          actualUploadContext.pathContext.sourceContributionId,
          uploadContext.pathContext.sourceContributionId,
        );
      } finally {
        uploadSpy.restore();
        teardown();
      }
    },
  );

  await t.step(
    "should pass projectInitialUserPrompt from options to assemblePlannerPrompt",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        let capturedDeps: AssemblePlannerPromptDeps | undefined;
        const assemblePlannerPromptFn = (
          deps: AssemblePlannerPromptDeps,
        ): Promise<AssembledPrompt> => {
          capturedDeps = deps;
          return Promise.resolve({
            promptContent: "planner",
            source_prompt_resource_id: "planner-id",
          });
        };
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          assemblePlannerPromptFn,
        );

        const options: AssemblePromptOptions = {
          project: mockProject,
          session: mockSession,
          stage: mockStage,
          projectInitialUserPrompt: "resolved from storage",
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

        assertEquals(capturedDeps?.projectInitialUserPrompt, "resolved from storage");
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "default gatherInputsForStageFn wrapper forwards modelId when provided",
    async () => {
      try {
        const { client, fileManager } = setup({
          "SB_CONTENT_STORAGE_BUCKET": "test-bucket",
        });
        let capturedWrapper: GatherInputsForStageFn | null = null;
        const captureSeedDeps = (
          deps: AssembleSeedPromptDeps,
        ): Promise<AssembledPrompt> => {
          capturedWrapper = deps.gatherInputsForStageFn;
          return Promise.resolve({
            promptContent: "seed",
            source_prompt_resource_id: "seed-id",
          });
        };
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          captureSeedDeps,
        );
        await assembler.assemble({
          project: mockProject,
          session: mockSession,
          stage: mockStageForPlanner,
          projectInitialUserPrompt: "init",
          iterationNumber: 1,
        });
        assertEquals(capturedWrapper !== null, true);
        const wrapper: GatherInputsForStageFn = capturedWrapper!;
        const result: GatheredRecipeContext = await wrapper(
          client,
          assembler["downloadFromStorageFn"],
          mockStageForPlanner,
          mockProject,
          mockSession,
          1,
          "test-model-id",
        );
        const directResult: GatheredRecipeContext = await gatherInputsForStage(
          client,
          assembler["downloadFromStorageFn"],
          mockStageForPlanner,
          mockProject,
          mockSession,
          1,
          "test-model-id",
        );
        assertEquals(result.recipeStep, directResult.recipeStep);
        assertEquals(Array.isArray(result.sourceDocuments), true);
        assertEquals(result.recipeStep, synthesisPlannerRecipeStep);
      } finally {
        teardown();
      }
    },
  );

  await t.step(
    "_gatherContext forwards modelId to gatherContextFn",
    async () => {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: {
              data: [
                {
                  id: "spt-synthesis-pairwise-business",
                  prompt_text: "Turn prompt.",
                  document_template_id: "dt-synthesis-pairwise-business",
                },
              ],
              error: null,
            },
          },
          ai_providers: {
            select: { data: [{ id: "model-1", name: "Test Model", provider: "test", slug: "test-slug" }], error: null },
          },
          dialectic_document_templates: {
            select: {
              data: [{
                storage_bucket: "prompt-templates",
                storage_path: "v1/dialectic",
                file_name: "synthesis_pairwise_business.md",
              }],
              error: null,
            },
          },
        },
      };
      const { client, fileManager } = setup(
        { "SB_CONTENT_STORAGE_BUCKET": "test-bucket" },
        config,
      );
      const uploadStub = stub(
        fileManager!,
        "uploadAndRegisterFile",
        () => Promise.resolve({ record: plannerFileRecord, error: null }),
      );
      try {
        const mockContext: DynamicContextVariables = {
          user_objective: "obj",
          domain: "dom",
          context_description: "desc",
          original_user_request: "req",
          recipeStep: synthesisExecuteRecipeStep,
        };
        const calls: Parameters<GatherContextFn>[] = [];
        const gatherContextFn: GatherContextFn = async (...args) => {
          calls.push(args);
          return mockContext;
        };
        
        const templateContent = "template content";
        const arrayBuffer = await new Blob([templateContent]).arrayBuffer();
        const downloadFromStorageMock = createMockDownloadFromStorage({
          mode: 'success',
          data: arrayBuffer,
        });

        const assembleTurnPromptSpy = spy(
          async (
            _deps: AssembleTurnPromptDeps,
            _params: AssembleTurnPromptParams,
          ): Promise<AssembledPrompt> => {
            return {
              promptContent: "turn",
              source_prompt_resource_id: "turn-id",
            };
          },
        );

        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined, // downloadFn
          undefined, // renderPromptFn
          undefined, // assembleSeedPromptFn
          undefined, // assemblePlannerPromptFn
          assembleTurnPromptSpy, // assembleTurnPromptFn
          undefined, // assembleContinuationPromptFn
          gatherContextFn, // gatherContextFn
        );
        
        await assembler.assemble({
          project: mockProject,
          session: mockSession,
          stage: mockStageForTurn,
          projectInitialUserPrompt: "init",
          iterationNumber: 1,
          job: {
            ...mockJob,
            stage_slug: "synthesis",
            job_type: "EXECUTE",
            payload: {
              model_id: "model-1",
              model_slug: "test-slug",
              inputs: {},
              document_key: "synthesis_pairwise_business_case",
            },
          },
        });
        
        assertSpyCalls(assembleTurnPromptSpy, 1);
        const deps = assembleTurnPromptSpy.calls[0].args[0];
        
        // Now we can inspect the `gatherContext` function that was passed.
        const passedGatherContext = deps.gatherContext;
        await passedGatherContext(
          client,
          (bucket, path) => downloadFromStorageMock(client, bucket, path),
          assembler['gatherInputsForStageFn'],
          mockProject,
          mockSession,
          mockStageForTurn,
          "init",
          1,
          "model-1"
        );

        assertEquals(calls.length, 1);
        assertEquals(calls[0].length, 9);
        assertEquals(calls[0][8], "model-1");
      } finally {
        uploadStub.restore();
        teardown();
      }
    },
  );

  await t.step(
    "_gatherInputsForStage forwards modelId to gatherInputsForStageFn",
    async () => {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "Planner prompt.", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: { data: [{ id: "model-1", name: "Test Model", provider: "test", slug: "test-slug" }], error: null },
          },
        },
      };
      const { client, fileManager } = setup(
        { "SB_CONTENT_STORAGE_BUCKET": "test-bucket" },
        config,
      );
      const uploadStub = stub(
        fileManager!,
        "uploadAndRegisterFile",
        () => Promise.resolve({ record: plannerFileRecord, error: null }),
      );
      try {
        const mockGathered: GatheredRecipeContext = {
          sourceDocuments: [],
          recipeStep: synthesisPlannerRecipeStep,
        };
        const calls: Parameters<GatherInputsForStageFn>[] = [];
        const gatherInputsForStageFn: GatherInputsForStageFn = async (
          ...args
        ) => {
          calls.push(args);
          return mockGathered;
        };
        const gatherContextCalls: Parameters<GatherContextFn>[] = [];
        const gatherContextFn: GatherContextFn = async (...args) => {
          gatherContextCalls.push(args);
          return {
            user_objective: "o",
            domain: "d",
            context_description: "c",
            original_user_request: "r",
            recipeStep: synthesisPlannerRecipeStep,
          };
        };
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          gatherContextFn,
          undefined,
          gatherInputsForStageFn,
        );
        await assembler.assemble({
          project: mockProject,
          session: mockSession,
          stage: mockStageForPlanner,
          projectInitialUserPrompt: "init",
          iterationNumber: 1,
          job: {
            ...mockJob,
            stage_slug: "synthesis",
            job_type: "PLAN",
            payload: { model_id: "model-1", model_slug: "test-slug" },
          },
        });
        assertEquals(gatherContextCalls.length >= 1, true);
        assertEquals(gatherContextCalls[0].length, 8);
        const gatherInputsFnArg = gatherContextCalls[0][2];
        const result: GatheredRecipeContext = await gatherInputsFnArg(
          client,
          assembler["downloadFromStorageFn"],
          mockStageForPlanner,
          mockProject,
          mockSession,
          1,
          "forwarded-model-id",
        );
        assertEquals(result.recipeStep, synthesisPlannerRecipeStep);
      } finally {
        uploadStub.restore();
        teardown();
      }
    },
  );

  await t.step(
    "all three methods work unchanged when modelId is omitted (backward-compatible)",
    async () => {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "Planner prompt.", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: { data: [{ id: "model-1", name: "Test Model", provider: "test", slug: "test-slug" }], error: null },
          },
        },
      };
      const { client, fileManager } = setup(
        { "SB_CONTENT_STORAGE_BUCKET": "test-bucket" },
        config,
      );
      const uploadStub = stub(
        fileManager!,
        "uploadAndRegisterFile",
        () => Promise.resolve({ record: plannerFileRecord, error: null }),
      );
      try {
        const mockGathered: GatheredRecipeContext = {
          sourceDocuments: [],
          recipeStep: synthesisPlannerRecipeStep,
        };
        const gatherInputsCalls: Parameters<GatherInputsForStageFn>[] = [];
        const gatherInputsForStageFn: GatherInputsForStageFn = async (
          ...args
        ) => {
          gatherInputsCalls.push(args);
          return mockGathered;
        };
        const gatherContextCalls: Parameters<GatherContextFn>[] = [];
        const gatherContextFn: GatherContextFn = async (...args) => {
          gatherContextCalls.push(args);
          return {
            user_objective: "o",
            domain: "d",
            context_description: "c",
            original_user_request: "r",
            recipeStep: synthesisPlannerRecipeStep,
          };
        };
        const assembler = new PromptAssembler(
          client,
          fileManager!,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          gatherContextFn,
          undefined,
          gatherInputsForStageFn,
        );
        await assembler.assemble({
          project: mockProject,
          session: mockSession,
          stage: mockStageForPlanner,
          projectInitialUserPrompt: "init",
          iterationNumber: 1,
          job: {
            ...mockJob,
            stage_slug: "synthesis",
            job_type: "PLAN",
            payload: { model_id: "model-1", model_slug: "test-slug" },
          },
        });
        assertEquals(gatherContextCalls.length >= 1, true);
        assertEquals(gatherContextCalls[0].length, 8);
      } finally {
        uploadStub.restore();
        teardown();
      }
    },
  );
});
