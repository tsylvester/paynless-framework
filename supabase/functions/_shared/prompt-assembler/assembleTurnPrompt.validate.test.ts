import { assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, Spy } from "jsr:@std/testing@0.225.1/mock";
import {
  assembleTurnPrompt,
} from "./assembleTurnPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssembleTurnPromptDeps,
  AssembleTurnPromptParams,
} from "./prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  type MockQueryBuilderState,
} from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockFileManagerService } from "../services/file_manager.mock.ts";
import { FileType } from "../types/file_manager.types.ts";
import { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import {
  type DialecticStageRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { GatherContextFn } from "./gatherContext.ts";
import { createMockDownloadFromStorage } from "../supabase_storage_utils.mock.ts";

const STAGE_SLUG = "synthesis";
const BUSINESS_CASE_DOCUMENT_KEY = FileType.business_case;
const HEADER_CONTEXT_CONTRIBUTION_ID = "header-context-contrib-id";
const baseRecipeStep: DialecticStageRecipeStep = {
  id: "step-123",
  branch_key: BUSINESS_CASE_DOCUMENT_KEY,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  execution_order: 1,
  output_type: FileType.RenderedDocument,
  parallel_group: null,
  config_override: {},
  instance_id: "instance-123",
  job_type: "EXECUTE",
  prompt_type: "Turn",
  step_name: "generate-executive-summary",
  step_description: "Generate the executive summary document.",
  granularity_strategy: "all_to_one",
  inputs_required: [{
    type: "header_context",
    slug: STAGE_SLUG,
    document_key: FileType.HeaderContext,
    required: true,
  }],
  inputs_relevance: [],
  outputs_required: {
    files_to_generate: [{
      from_document_key: BUSINESS_CASE_DOCUMENT_KEY,
      template_filename: "summary_template.md",
    }],
  },
  prompt_template_id: "pt-exec-summary-123",
  step_key: "generate-executive-summary",
  step_slug: "generate-executive-summary",
  template_step_id: "template-step-123",
  is_skipped: false,
  object_filter: {},
  output_overrides: {},
};

const buildRecipeStep = (
  overrides: Partial<DialecticStageRecipeStep> = {},
): DialecticStageRecipeStep => ({
  ...baseRecipeStep,
  ...overrides,
});

const defaultRecipeStep: DialecticStageRecipeStep = buildRecipeStep();

Deno.test("assembleTurnPrompt", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  const consoleSpies: { error?: Spy<Console>; warn?: Spy<Console> } = {};
  
  const mockGatherContext: GatherContextFn = spy(async () => { return { 
    user_objective: "mock user objective", 
    domain: "Software Development", 
    agent_count: 1, 
    context_description: "A test context", 
    original_user_request: "The original request", 
    prior_stage_ai_outputs: "", 
    prior_stage_user_feedback: "", 
    deployment_context: undefined, 
    reference_documents: undefined, 
    constraint_boundaries: undefined, 
    stakeholder_considerations: undefined, 
    deliverable_format: undefined,
    recipeStep: defaultRecipeStep,
  } });
  const mockRender = spy(() => "rendered turn prompt");
  const mockFileManager = createMockFileManagerService();

  const setup = (
    config: MockSupabaseDataConfig = {},
  ) => {
    mockSupabaseSetup = createMockSupabaseClient(undefined, config);

    consoleSpies.error = spy(console, "error");
    consoleSpies.warn = spy(console, "warn");


    return {
      client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      spies: mockSupabaseSetup.spies,
    };
  };

  const teardown = () => {
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
    system_prompts: { prompt_text: "Default system prompt" },
    domain_specific_prompt_overlays: [],
    slug: STAGE_SLUG,
    display_name: "Synthesis",
    description: "Synthesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: "dsp-123",
    recipe_step: defaultRecipeStep,
    active_recipe_instance_id: null,
    expected_output_template_ids: [],
    recipe_template_id: null,
  };

  const mockTurnJob: DialecticJobRow = {
    id: "job-turn-123",
    job_type: 'EXECUTE',
    payload: {
        job_type: "EXECUTE",
        model_id: "model-123",
        model_slug: "test-model",
        projectId: defaultProject.id,
        sessionId: defaultSession.id,
        stageSlug: defaultStage.slug,
        iterationNumber: 1,
        walletId: "wallet-123",
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
        document_specific_data: {
            title: "Project Executive Summary",
            points_to_cover: ["Problem", "Solution", "Market"]
        },
    },
    session_id: defaultSession.id,
    stage_slug: defaultStage.slug,
    iteration_number: 1,
    status: 'pending',
    user_id: defaultProject.user_id,
    is_test_job: false,
    created_at: new Date().toISOString(),
    attempt_count: 0,
    completed_at: null,
    error_details: null,
    parent_job_id: null,
    results: null,
    max_retries: 3,
    prerequisite_job_id: null,
    started_at: null,
    target_contribution_id: null,
  };

  await t.step("should successfully validate that inputs.header_context_id is present", async () => {
    const { client } = setup();
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    delete payload.header_context_resource_id;
    const jobWithMissingInputs: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...payload,
        inputs: {},
      },
    };

    try {
      await assertRejects(
        async () => {
          const mockDownloadFromStorage = createMockDownloadFromStorage({ mode: 'error', error: new Error("Storage Error") });
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
            downloadFromStorage: mockDownloadFromStorage,
          };
          const params: AssembleTurnPromptParams = {
            job: jobWithMissingInputs,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
          };
          await assembleTurnPrompt(deps, params);
        },
        Error,
        "PRECONDITION_FAILED: Job payload inputs is missing 'header_context_id'."
      );
    } finally {
      teardown();
    }
  });

  await t.step("should successfully validate that the contribution exists in the database", async () => {
    const contributionId = "contrib-not-found";
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: {
          select: async () => {
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          }
        }
      },
    };

    const { client } = setup(config);
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithInvalidContributionId: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: contributionId,
        },
      },
    };
    delete (jobWithInvalidContributionId.payload as any).header_context_resource_id;

    try {
      await assertRejects(
        async () => {
          const mockDownloadFromStorage = createMockDownloadFromStorage({ mode: 'error', error: new Error("Storage Error") });
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
            downloadFromStorage: mockDownloadFromStorage,
          };
          const params: AssembleTurnPromptParams = {
            job: jobWithInvalidContributionId,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
          };
          await assembleTurnPrompt(deps, params);
        },
        Error,
        `Header context contribution with id '${contributionId}' not found in database.`
      );
    } finally {
      teardown();
    }
  });

  await t.step("should successfully validate that the contribution has storage_bucket", async () => {
    const contributionId = "contrib-no-bucket";
    const contributionStoragePath = "path/to/header";
    const contributionFileName = "header_context.json";

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: {
          select: async (state: MockQueryBuilderState) => {
            const idFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'id' && f.value === contributionId);
            if (idFilter) {
              return {
                data: [{
                  id: contributionId,
                  storage_bucket: null,
                  storage_path: contributionStoragePath,
                  file_name: contributionFileName,
                  contribution_type: "header_context",
                  session_id: defaultSession.id,
                  iteration_number: 1,
                  stage: defaultStage.slug,
                  is_latest_edit: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  user_id: defaultProject.user_id,
                  model_id: "model-123",
                  model_name: "Test Model",
                  edit_version: 1,
                  mime_type: "application/json",
                  size_bytes: 100,
                  raw_response_storage_path: null,
                  prompt_template_id_used: null,
                  seed_prompt_url: null,
                  original_model_contribution_id: null,
                  target_contribution_id: null,
                  tokens_used_input: null,
                  tokens_used_output: null,
                  processing_time_ms: null,
                  error: null,
                  citations: null,
                  document_relationships: null,
                  source_prompt_resource_id: null,
                  is_header: false,
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: "OK"
              };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          }
        }
      },
    };

    const { client } = setup(config);
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithInvalidContribution: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: contributionId,
        },
      },
    };
    delete (jobWithInvalidContribution.payload as any).header_context_resource_id;

    try {
      await assertRejects(
        async () => {
          const mockDownloadFromStorage = createMockDownloadFromStorage({ mode: 'error', error: new Error("Storage Error") });
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
            downloadFromStorage: mockDownloadFromStorage,
          };
          const params: AssembleTurnPromptParams = {
            job: jobWithInvalidContribution,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
          };
          await assembleTurnPrompt(deps, params);
        },
        Error,
        `Header context contribution '${contributionId}' is missing required storage_bucket.`
      );
    } finally {
      teardown();
    }
  });

  await t.step("should successfully validate that the contribution has storage_path", async () => {
    const contributionId = "contrib-no-path";
    const contributionStorageBucket = "dialectic_contributions";
    const contributionFileName = "header_context.json";

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: {
          select: async (state: MockQueryBuilderState) => {
            const idFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'id' && f.value === contributionId);
            if (idFilter) {
              return {
                data: [{
                  id: contributionId,
                  storage_bucket: contributionStorageBucket,
                  storage_path: null,
                  file_name: contributionFileName,
                  contribution_type: "header_context",
                  session_id: defaultSession.id,
                  iteration_number: 1,
                  stage: defaultStage.slug,
                  is_latest_edit: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  user_id: defaultProject.user_id,
                  model_id: "model-123",
                  model_name: "Test Model",
                  edit_version: 1,
                  mime_type: "application/json",
                  size_bytes: 100,
                  raw_response_storage_path: null,
                  prompt_template_id_used: null,
                  seed_prompt_url: null,
                  original_model_contribution_id: null,
                  target_contribution_id: null,
                  tokens_used_input: null,
                  tokens_used_output: null,
                  processing_time_ms: null,
                  error: null,
                  citations: null,
                  document_relationships: null,
                  source_prompt_resource_id: null,
                  is_header: false,
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: "OK"
              };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          }
        }
      },
    };

    const { client } = setup(config);
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithInvalidContribution: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: contributionId,
        },
      },
    };
    delete (jobWithInvalidContribution.payload as any).header_context_resource_id;

    try {
      await assertRejects(
        async () => {
          const mockDownloadFromStorage = createMockDownloadFromStorage({ mode: 'error', error: new Error("Storage Error") });
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
            downloadFromStorage: mockDownloadFromStorage,
          };
          const params: AssembleTurnPromptParams = {
            job: jobWithInvalidContribution,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
          };
          await assembleTurnPrompt(deps, params);
        },
        Error,
        `Header context contribution '${contributionId}' is missing required storage_path.`
      );
    } finally {
      teardown();
    }
  });

  await t.step("should successfully validate that the contribution has file_name", async () => {
    const contributionId = "contrib-no-filename";
    const contributionStorageBucket = "dialectic_contributions";
    const contributionStoragePath = "path/to/header";

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: {
          select: async (state: MockQueryBuilderState) => {
            const idFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'id' && f.value === contributionId);
            if (idFilter) {
              return {
                data: [{
                  id: contributionId,
                  storage_bucket: contributionStorageBucket,
                  storage_path: contributionStoragePath,
                  file_name: null,
                  contribution_type: "header_context",
                  session_id: defaultSession.id,
                  iteration_number: 1,
                  stage: defaultStage.slug,
                  is_latest_edit: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  user_id: defaultProject.user_id,
                  model_id: "model-123",
                  model_name: "Test Model",
                  edit_version: 1,
                  mime_type: "application/json",
                  size_bytes: 100,
                  raw_response_storage_path: null,
                  prompt_template_id_used: null,
                  seed_prompt_url: null,
                  original_model_contribution_id: null,
                  target_contribution_id: null,
                  tokens_used_input: null,
                  tokens_used_output: null,
                  processing_time_ms: null,
                  error: null,
                  citations: null,
                  document_relationships: null,
                  source_prompt_resource_id: null,
                  is_header: false,
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: "OK"
              };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          }
        }
      },
    };

    const { client } = setup(config);
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithInvalidContribution: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: contributionId,
        },
      },
    };
    delete (jobWithInvalidContribution.payload as any).header_context_resource_id;

    try {
      await assertRejects(
        async () => {
          const mockDownloadFromStorage = createMockDownloadFromStorage({ mode: 'error', error: new Error("Storage Error") });
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
            downloadFromStorage: mockDownloadFromStorage,
          };
          const params: AssembleTurnPromptParams = {
            job: jobWithInvalidContribution,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
          };
          await assembleTurnPrompt(deps, params);
        },
        Error,
        `Header context contribution '${contributionId}' is missing required file_name.`
      );
    } finally {
      teardown();
    }
  });

});
