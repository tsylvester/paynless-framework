import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import {
  assembleTurnPrompt,
} from "./assembleTurnPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssembledPrompt,
  AssembleTurnPromptDeps,
  RenderFn,
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
import { FileType, FileRecord } from "../types/file_manager.types.ts";
import { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import {
  type DialecticRecipeStep,
  type DialecticStageRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { GatherContextFn } from "./gatherContext.ts";

const STAGE_SLUG = "synthesis";
const BUSINESS_CASE_DOCUMENT_KEY = FileType.business_case;
const TECHNICAL_DESIGN_DOCUMENT_KEY = FileType.system_architecture;
const HEADER_CONTEXT_CONTRIBUTION_ID = "header-context-contrib-id";
const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
const HEADER_CONTEXT_FILE_NAME = "header_context.json";

// Template storage constants - these match what's in the database
const TEMPLATE_STORAGE_BUCKET = "prompt-templates";
const TEMPLATE_STORAGE_PATH = "templates/synthesis";
// Prompt storage constants - for agent-facing prompt files
const PROMPT_STORAGE_PATH = "docs/prompts/synthesis";

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
  // Turn prompt templates are resolved authoritatively via:
  // recipe_step.prompt_template_id -> system_prompts.document_template_id -> dialectic_document_templates.id
  // In tests we set this deterministically based on the document_key being generated.
  prompt_template_id: `pt-turn-${BUSINESS_CASE_DOCUMENT_KEY}`,
  step_key: "generate-executive-summary",
  step_slug: "generate-executive-summary",
  template_step_id: "template-step-123",
  is_skipped: false,
  object_filter: {},
  output_overrides: {},
};

const inferDocumentKeyFromOutputsRequired = (
  outputsRequired: unknown,
): string | null => {
  if (!isRecord(outputsRequired)) {
    return null;
  }

  const filesToGenerate = outputsRequired.files_to_generate;
  if (!Array.isArray(filesToGenerate) || filesToGenerate.length === 0) {
    return null;
  }

  const first = filesToGenerate[0];
  if (!isRecord(first)) {
    return null;
  }

  const fromDocumentKey = first.from_document_key;
  return typeof fromDocumentKey === "string" ? fromDocumentKey : null;
};

const buildRecipeStep = (
  overrides: Partial<DialecticStageRecipeStep> = {},
): DialecticStageRecipeStep => {
  const inferredDocumentKey =
    inferDocumentKeyFromOutputsRequired(overrides.outputs_required) ??
      inferDocumentKeyFromOutputsRequired(baseRecipeStep.outputs_required);

  if (typeof inferredDocumentKey !== "string" || inferredDocumentKey.length === 0) {
    throw new Error(
      "Test setup error: could not infer from_document_key from outputs_required.files_to_generate[0].",
    );
  }

  const promptTemplateId = typeof overrides.prompt_template_id === "string" &&
      overrides.prompt_template_id.length > 0
    ? overrides.prompt_template_id
    : `pt-turn-${inferredDocumentKey}`;

  return {
    ...baseRecipeStep,
    ...overrides,
    prompt_template_id: promptTemplateId,
  };
};

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

  const createSystemPromptsMock = () => {
    return {
      select: async (state: MockQueryBuilderState) => {
        const idFilter = state.filters.find((f) =>
          f.type === "eq" && f.column === "id" && typeof f.value === "string"
        );

        if (!idFilter || typeof idFilter.value !== "string") {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const promptTemplateId = idFilter.value;
        const prefix = "pt-turn-";
        if (!promptTemplateId.startsWith(prefix)) {
          // Return empty so MockQueryBuilder .single() shapes it into PGRST116 "no rows"
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const documentKey = promptTemplateId.slice(prefix.length);
        if (documentKey.length === 0) {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        return {
          data: [{
            id: promptTemplateId,
            document_template_id: `doc-template-turn-${documentKey}`,
          }],
          error: null,
          count: 1,
          status: 200,
          statusText: "OK",
        };
      },
    };
  };

  const ensureSystemPromptsMock = (
    config: MockSupabaseDataConfig,
  ): MockSupabaseDataConfig => {
    const existingGeneric = config.genericMockResults ? config.genericMockResults : {};
    if ("system_prompts" in existingGeneric && existingGeneric.system_prompts) {
      return config;
    }

    return {
      ...config,
      genericMockResults: {
        ...existingGeneric,
        system_prompts: createSystemPromptsMock(),
      },
    };
  };

  const setup = (
    config: MockSupabaseDataConfig = {},
  ) => {
    const configWithRequiredMocks = ensureSystemPromptsMock(config);
    mockSupabaseSetup = createMockSupabaseClient(undefined, configWithRequiredMocks);

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

  const createHeaderContextContributionMock = (
    contributionId: string = HEADER_CONTEXT_CONTRIBUTION_ID,
    storageBucket: string = HEADER_CONTEXT_STORAGE_BUCKET,
    storagePath: string = HEADER_CONTEXT_STORAGE_PATH,
    fileName: string = HEADER_CONTEXT_FILE_NAME,
  ) => {
    return {
      select: async (state: MockQueryBuilderState) => {
        const idFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'id' && f.value === contributionId);
        if (idFilter) {
          return {
            data: [{
              id: contributionId,
              storage_bucket: storageBucket,
              storage_path: storagePath,
              file_name: fileName,
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
    };
  };

  // Helper to construct the expected prompt file path based on stage and document_key
  // This matches what createTemplateMock constructs for the file_name
  const getPromptFilePath = (stageSlug: string, documentKey: string): string => {
    return `${PROMPT_STORAGE_PATH}/${stageSlug}_${documentKey}_turn_v1.md`;
  };

  const createTemplateMock = () => {
    return {
      select: async (state: MockQueryBuilderState) => {
        // assembleTurnPrompt must query dialectic_document_templates by exact ID (no heuristic matching).
        const templateIdFilter = state.filters.find((f) =>
          f.type === "eq" && f.column === "id" && typeof f.value === "string"
        );
        if (!templateIdFilter || typeof templateIdFilter.value !== "string") {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const isActiveFilter = state.filters.find((f) =>
          f.type === "eq" && f.column === "is_active" && f.value === true
        );
        if (!isActiveFilter) {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const domainIdFilter = state.filters.find((f) =>
          f.type === "eq" && f.column === "domain_id" && typeof f.value === "string"
        );
        if (!domainIdFilter || typeof domainIdFilter.value !== "string") {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const templateId = templateIdFilter.value;
        const prefix = "doc-template-turn-";
        if (!templateId.startsWith(prefix)) {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const documentKey = templateId.slice(prefix.length);
        if (documentKey.length === 0) {
          return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }

        const mockFileName = `${STAGE_SLUG}_${documentKey}_turn_v1.md`;

        return {
          data: [{
            id: templateId,
            domain_id: domainIdFilter.value,
            name: mockFileName.replace(".md", "").replace(/_/g, " "),
            description: `Prompt template for ${mockFileName}`,
            file_name: mockFileName,
            storage_bucket: TEMPLATE_STORAGE_BUCKET,
            storage_path: `docs/prompts/${STAGE_SLUG}/`,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
          error: null,
          count: 1,
          status: 200,
          statusText: "OK"
        };
      }
    };
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

  const headerContextContent = {
    system_materials: {
        stage_rationale: "This is the stage rationale.",
        executive_summary: "This is the executive summary.",
        input_artifacts_summary: "This is the input artifacts summary."
    },
    header_context_artifact: {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json'
    },
    context_for_documents: [
        {
            document_key: BUSINESS_CASE_DOCUMENT_KEY,
            content_to_include: {
                title: "Project Executive Summary",
                points_to_cover: ["Problem", "Solution", "Market"]
            }
        },
        {
            document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
            content_to_include: {
                custom_style: "Modern and clean"
            }
        }
    ]
  };

  const documentTemplateContent = "## {title}\n\nCover these points: {points_to_cover}";
  const designTemplateContent = "Design Style: {custom_style}";

  await t.step("should throw an error if the header context cannot be fetched", async () => {
    const config: MockSupabaseDataConfig = {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
              ],
            }
          },
          dialectic_contributions: createHeaderContextContributionMock(),
        },
        storageMock: {
            downloadResult: () => Promise.resolve({ data: null, error: new Error("Storage Error") }),
        }
      };

    const { client } = setup(config);
    
    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to download header context file from storage: Storage Error"
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if the document template cannot be fetched", async () => {
    const config: MockSupabaseDataConfig = {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
              ],
            }
          },
          dialectic_contributions: createHeaderContextContributionMock(),
          dialectic_document_templates: createTemplateMock(),
        },
        storageMock: {
            downloadResult: (bucket, path) => {
                const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
                if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
                if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                    // Fail the template download (this is the expected behavior for this test)
                    return Promise.resolve({ data: null, error: new Error("Template Not Found") });
                }
                return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
            },
        }
      };

    const { client } = setup(config);
    
    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        `Failed to download turn prompt template '${getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY)}' from bucket '${TEMPLATE_STORAGE_BUCKET}': Template Not Found`
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if session has no selected models", async () => {
    const { client } = setup();
    const sessionWithNoModels: SessionContext = {
      ...defaultSession,
      selected_model_ids: [],
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: mockTurnJob,
                project: defaultProject,
                session: sessionWithNoModels,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Session must have at least one selected model.",
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if fileManager.uploadAndRegisterFile fails", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
        dialectic_document_templates: createTemplateMock(),
      },
        storageMock: {
            downloadResult: (bucket, path) => {
                const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
                if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
                if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                    return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
            },
        }
    };
    const { client } = setup(config);
    // This test simulates a failure during the final step of saving the assembled prompt.
    mockFileManager.setUploadAndRegisterFileResponse(null, new Error("Upload failed"));

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to save turn prompt: Upload failed"
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if the fetched HeaderContext content is not valid JSON", async () => {
    const config: MockSupabaseDataConfig = {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
              ],
            }
          },
          dialectic_contributions: createHeaderContextContributionMock(),
        },
        storageMock: {
            downloadResult: () => Promise.resolve({ data: new Blob(["{ not json }"]), error: null }),
        }
      };
    const { client } = setup(config);
    
    try {
      // This test ensures that the function validates the structure of the critical HeaderContext.
      const thrownError = await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
      );
      assert(
        thrownError instanceof Error &&
        thrownError.message.includes("Failed to parse header context content as JSON"),
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if document_key from payload is not in header context", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
          downloadResult: (bucket, path) => {
              const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
              if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };
    const { client } = setup(config);
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Header context content is not valid JSON");
    }
    const jobWithInvalidDocKey: DialecticJobRow = {
        ...mockTurnJob,
        payload: {
            ...mockTurnJob.payload,
            document_key: "non_existent_key",
            model_slug: "test-model",
        }
    };
    
    try {
      // This test validates that the job's requested document is actually part of the stage's plan.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: jobWithInvalidDocKey,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "No files_to_generate entry found with from_document_key 'non_existent_key' in recipe step."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing", async () => {
    const { client } = setup();
    const jobWithNullPayload = {
      ...mockTurnJob,
      payload: null,
    };
    
    try {
      // This test uses a typecast, as permitted by the rules for testing error handling of malformed inputs.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithNullPayload as DialecticJobRow,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing or not a valid record."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing document_key", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    delete payload.document_key;
    const jobWithMissingDocKey: DialecticJobRow = {
        ...mockTurnJob,
        payload
    };
    
    try {
      // This test ensures the job provides the essential key for identifying which document to generate.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingDocKey,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'document_key'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload inputs is missing header_context_id", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    if (isRecord(payload.inputs)) {
      delete payload.inputs.header_context_id;
    }
    const jobWithMissingHeaderId: DialecticJobRow = {
        ...mockTurnJob,
        payload
    };

    try {
      // This test validates that the job provides the link to its "blueprints".
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingHeaderId,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload inputs is missing 'header_context_id'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED for deprecated step_info in payload", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithStepInfo: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        step_info: { old_data: "value" },
      },
    } as unknown as DialecticJobRow; // Typecast for testing invalid shape

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithStepInfo,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload.",
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing 'model_id'", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
    };
    const { client } = setup(config);
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    if(!isRecord(mockTurnJob.payload.inputs)) {
      throw new Error("Job payload inputs is not valid JSON");
    }
    const payload = { 
      ...mockTurnJob.payload,
      inputs: {
        header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
      },
    };
    delete (payload as Record<string, unknown>).model_id;
    const jobWithMissingModelSlug: DialecticJobRow = {
        ...mockTurnJob,
        payload,
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingModelSlug,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'model_id'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing 'model_id'", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
    };
    const { client } = setup(config);
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    if(!isRecord(mockTurnJob.payload.inputs)) {
      throw new Error("Job payload inputs is not valid JSON");
    }
    const payload = { 
      ...mockTurnJob.payload,
      inputs: {
        header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
      },
    };
    delete (payload as Record<string, unknown>).model_id;
    const jobWithMissingModelSlug: DialecticJobRow = {
        ...mockTurnJob,
        payload,
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingModelSlug,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'model_id'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if stage context is missing 'recipe_step'", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
    };
    const { client } = setup(config);
    const stageWithoutRecipe: StageContext = {
      ...defaultStage,
      recipe_step: undefined,
    } as unknown as StageContext;

    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithInputs: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
      },
    };
    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithInputs,
                project: defaultProject,
                session: defaultSession,
                stage: stageWithoutRecipe,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Stage context is missing recipe_step."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if the prompt template ID from the recipe step is not found in the database", async () => {
    const stageWithMissingTemplate: StageContext = {
      ...defaultStage,
      recipe_step: {
        ...defaultRecipeStep, // Use the complete default recipe step
        prompt_template_id: "non-existent-template",
      },
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
        dialectic_document_templates: createTemplateMock(),
      },
      storageMock: {
          downloadResult: (bucket, path) => {
              const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
              if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
              if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                  return Promise.resolve({ data: null, error: new Error("Template Not Found from Storage") });
              }
              return Promise.resolve({ data: null, error: new Error(`Unexpected file request in mock (bucket: ${bucket}, path: ${path})`) });
          },
      }
    };
    const { client } = setup(config);
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithInputs: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
      },
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithInputs,
                project: defaultProject,
                session: defaultSession,
                stage: stageWithMissingTemplate,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to load system_prompts row for prompt_template_id 'non-existent-template': Query returned no rows"
      )
    } finally {
        teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload contains deprecated step_info", async () => {
    const { client } = setup();
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    if(!isRecord(mockTurnJob.payload.inputs)) {
      throw new Error("Job payload inputs is not valid JSON");
    }
    const jobWithStepInfo: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        step_info: { old_data: "value" },
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithStepInfo,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload.",
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when recipe step is missing files_to_generate", async () => {
    const recipeStepWithoutFilesToGenerate = buildRecipeStep({
      outputs_required: {
        documents: [{
          artifact_class: "rendered_document",
          file_type: "markdown",
          document_key: BUSINESS_CASE_DOCUMENT_KEY,
          template_filename: "summary_template.md",
        }]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithoutFilesToGenerate
    };

    const headerContextContent = {
      system_materials: {
        stage_rationale: "This is the stage rationale.",
        executive_summary: "This is the executive summary.",
        input_artifacts_summary: "This is the input artifacts summary."
      },
      header_context_artifact: {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json'
      },
      context_for_documents: [
        {
          document_key: BUSINESS_CASE_DOCUMENT_KEY,
          content_to_include: {
            field1: "value1"
          }
        }
      ]
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithBusinessCase: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithBusinessCase,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithRecipeStep,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "files_to_generate"
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when headerContext is missing context_for_documents", async () => {
    // Use an empty array to pass type validation, but runtime check will fail
    const headerContextWithoutContextForDocs = {
      system_materials: {
        stage_rationale: "This is the stage rationale.",
        executive_summary: "This is the executive summary.",
        input_artifacts_summary: "This is the input artifacts summary."
      },
      header_context_artifact: {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json'
      },
      context_for_documents: []
    };

    const recipeStepWithFilesToGenerate = buildRecipeStep({
      outputs_required: {
        files_to_generate: [
          {
            from_document_key: BUSINESS_CASE_DOCUMENT_KEY,
            template_filename: "thesis_business_case.md"
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithFilesToGenerate
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithoutContextForDocs)]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithBusinessCase: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithBusinessCase,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithRecipeStep,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "context_for_documents"
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when no matching context_for_documents entry found for from_document_key", async () => {
    const headerContextWithMismatch = {
      system_materials: {
        stage_rationale: "This is the stage rationale.",
        executive_summary: "This is the executive summary.",
        input_artifacts_summary: "This is the input artifacts summary."
      },
      header_context_artifact: {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json'
      },
      context_for_documents: [
        {
          document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
          content_to_include: {
            field1: "value1"
          }
        }
      ]
    };

    const recipeStepWithFilesToGenerate = buildRecipeStep({
      outputs_required: {
        files_to_generate: [
          {
            from_document_key: BUSINESS_CASE_DOCUMENT_KEY,
            template_filename: "thesis_business_case.md"
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithFilesToGenerate
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithMismatch)]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithBusinessCase: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithBusinessCase,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithRecipeStep,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        BUSINESS_CASE_DOCUMENT_KEY
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when context_for_documents entry has empty content_to_include", async () => {
    const headerContextWithEmptyContent = {
      system_materials: {
        stage_rationale: "This is the stage rationale.",
        executive_summary: "This is the executive summary.",
        input_artifacts_summary: "This is the input artifacts summary."
      },
      header_context_artifact: {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json'
      },
      context_for_documents: [
        {
          document_key: BUSINESS_CASE_DOCUMENT_KEY,
          content_to_include: {}
        }
      ]
    };

    const recipeStepWithFilesToGenerate = buildRecipeStep({
      outputs_required: {
        files_to_generate: [
          {
            from_document_key: BUSINESS_CASE_DOCUMENT_KEY,
            template_filename: "thesis_business_case.md"
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithFilesToGenerate
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithEmptyContent)]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithBusinessCase: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithBusinessCase,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithRecipeStep,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "content_to_include"
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when content_to_include structure is invalid (not conforming to ContentToInclude type)", async () => {
    const headerContextWithInvalidContent = {
      system_materials: {
        shared_plan: "This is the shared plan for all documents."
      },
      header_context_artifact: {
        stage_summary: "Test stage summary"
      },
      context_for_documents: [
        {
          document_key: BUSINESS_CASE_DOCUMENT_KEY,
          content_to_include: {
            invalidField: null
          }
        }
      ]
    };

    const recipeStepWithFilesToGenerate = buildRecipeStep({
      outputs_required: {
        files_to_generate: [
          {
            from_document_key: BUSINESS_CASE_DOCUMENT_KEY,
            template_filename: "thesis_business_case.md"
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithFilesToGenerate
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithInvalidContent)]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithBusinessCase: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithBusinessCase,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithRecipeStep,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when content_to_include is missing required keys from recipe step", async () => {
    const headerContextWithMissingKeys = {
      system_materials: {
        stage_rationale: "This is the stage rationale.",
        executive_summary: "This is the executive summary.",
        input_artifacts_summary: "This is the input artifacts summary."
      },
      header_context_artifact: {
        type: 'header_context',
        document_key: 'header_context',
        artifact_class: 'header_context',
        file_type: 'json'
      },
      context_for_documents: [
        {
          document_key: BUSINESS_CASE_DOCUMENT_KEY,
          content_to_include: {
            field1: "value1",
            field2: "value2"
            // Missing field3 that recipe step expects
          }
        }
      ]
    };

    const recipeStepWithRequiredKeys = buildRecipeStep({
      outputs_required: {
        files_to_generate: [
          {
            from_document_key: BUSINESS_CASE_DOCUMENT_KEY,
            template_filename: "thesis_business_case.md"
          }
        ],
        documents: [
          {
            artifact_class: "rendered_document",
            file_type: "markdown",
            document_key: BUSINESS_CASE_DOCUMENT_KEY,
            template_filename: "thesis_business_case.md",
            content_to_include: {
              field1: "",
              field2: "",
              field3: "" // Recipe step expects field3, but header_context doesn't have it
            }
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithRequiredKeys
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_contributions: createHeaderContextContributionMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithMissingKeys)]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithBusinessCase: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
        },
        document_key: BUSINESS_CASE_DOCUMENT_KEY,
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithBusinessCase,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithRecipeStep,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "missing required keys" // Updated error message expectation to focus on missing keys
      );
    } finally {
      teardown();
    }
  });

});
