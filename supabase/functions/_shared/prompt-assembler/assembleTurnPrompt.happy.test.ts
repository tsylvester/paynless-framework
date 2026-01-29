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
  AssembleTurnPromptParams,
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
import { createMockDownloadFromStorage } from "../supabase_storage_utils.mock.ts";
import { DownloadFromStorageFn, DownloadStorageResult } from "../supabase_storage_utils.ts";

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
    context_description: "A test context", 
    original_user_request: "The original request", 
    recipeStep: defaultRecipeStep,
    sourceDocuments: [],
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
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }

        const promptTemplateId = idFilter.value;
        const prefix = "pt-turn-";
        if (!promptTemplateId.startsWith(prefix)) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }

        const documentKey = promptTemplateId.slice(prefix.length);
        if (documentKey.length === 0) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
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
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }

        const isActiveFilter = state.filters.find((f) =>
          f.type === "eq" && f.column === "is_active" && f.value === true
        );
        if (!isActiveFilter) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }

        const domainIdFilter = state.filters.find((f) =>
          f.type === "eq" && f.column === "domain_id" && typeof f.value === "string"
        );
        if (!domainIdFilter || typeof domainIdFilter.value !== "string") {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }

        const templateId = templateIdFilter.value;
        const prefix = "doc-template-turn-";
        if (!templateId.startsWith(prefix)) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }

        const documentKey = templateId.slice(prefix.length);
        if (documentKey.length === 0) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
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

  const createConditionalDownloadMock = (
    customHeaderContent?: unknown,
    customTemplateContent?: string,
    customDesignTemplateContent?: string,
  ): DownloadFromStorageFn => {
    return async (_supabase: unknown, bucket: string, path: string): Promise<DownloadStorageResult> => {
      const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
      const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
      const fullDesignPath = getPromptFilePath(STAGE_SLUG, TECHNICAL_DESIGN_DOCUMENT_KEY);

      if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
        const content = customHeaderContent ?? headerContextContent;
        const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
        return { data: await blob.arrayBuffer(), error: null };
      }

      if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
        const content = customTemplateContent ?? documentTemplateContent;
        const blob = new Blob([content], { type: 'text/markdown' });
        return { data: await blob.arrayBuffer(), error: null };
      }

      if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullDesignPath) {
        const content = customDesignTemplateContent ?? designTemplateContent;
        const blob = new Blob([content], { type: 'text/markdown' });
        return { data: await blob.arrayBuffer(), error: null };
      }

      return { data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) };
    };
  };

  await t.step("should correctly assemble and persist a turn prompt", async () => {
      const mockFileRecord: FileRecord = {
        id: "mock-turn-resource-id-789",
        project_id: defaultProject.id,
        file_name: "turn_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
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
                // The template mock returns files in docs/prompts/{stage_slug}/ with filenames like {stage_slug}_{document_key}_turn_v1.md
                const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
                if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                    return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
            },
        }
      };

      const { client } = setup(config);
      mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

      try {
        const mockDownloadFromStorage = createConditionalDownloadMock();
        const deps: AssembleTurnPromptDeps = {
          dbClient: client,
          gatherContext: mockGatherContext,
          render: mockRender,
          fileManager: mockFileManager,
          downloadFromStorage: mockDownloadFromStorage,
        };
        const params: AssembleTurnPromptParams = {
          job: mockTurnJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
        };
        const result: AssembledPrompt = await assembleTurnPrompt(deps, params);
        
        assertEquals(result.promptContent, "rendered turn prompt");
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
        
        assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
        const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
        assertEquals(uploadContext.fileContent, "rendered turn prompt");
      } finally {
        teardown();
      }
    },
  );

  await t.step("should pass sourceContributionId for continuation turns", async () => {
    const continuationContributionId = "contrib-123";
    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-continuation",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt for continuation jobs",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          },
        },
        dialectic_contributions: createHeaderContextContributionMock(),
        dialectic_document_templates: createTemplateMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({
              data: new Blob([JSON.stringify(headerContextContent)]),
              error: null,
            });
          }
          const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
          if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
            return Promise.resolve({
              data: new Blob([documentTemplateContent]),
              error: null,
            });
          }
          return Promise.resolve({
            data: null,
            error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`),
          });
        },
      },
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("PRECONDITION_FAILED: Mock turn job payload is not a record");
    }
    const continuationJob: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        target_contribution_id: continuationContributionId,
      },
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock();
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: continuationJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
      };
      await assembleTurnPrompt(deps, params);

      assert(
        mockFileManager.uploadAndRegisterFile.calls.length === 1,
        "uploadAndRegisterFile should be called once",
      );
      const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
      assertEquals(
        uploadContext.pathContext.sourceContributionId,
        continuationContributionId,
      );
    } finally {
      teardown();
    }
  });

  await t.step("should correctly apply user-specific overlay values", async () => {
    const userOverlay = { "custom_style": "formal" };
    const projectWithUserOverlay: ProjectContext = {
      ...defaultProject,
      user_domain_overlay_values: userOverlay,
    };

    const recipeStepForDesignDoc = buildRecipeStep({
      outputs_required: {
        files_to_generate: [{
          from_document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
          template_filename: "design_template.md",
        }],
      },
    });

    const stageWithDesignRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepForDesignDoc
    };

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobForDesignDoc: DialecticJobRow = {
        ...mockTurnJob,
        payload: {
            ...mockTurnJob.payload,
            inputs: {
              header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
            },
            document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
            document_specific_data: {
                title: "Technical Design",
                points_to_cover: []
            },
        }
    };

    const mockFileRecord: FileRecord = {
        id: "mock-overlay-record-id",
        project_id: defaultProject.id,
        file_name: "turn_prompt_overlay.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt_overlay.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
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
              const fullPromptPath = getPromptFilePath(STAGE_SLUG, TECHNICAL_DESIGN_DOCUMENT_KEY);
              if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                  return Promise.resolve({ data: new Blob([designTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
          },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock(undefined, undefined, designTemplateContent);
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobForDesignDoc,
        project: projectWithUserOverlay,
        session: defaultSession,
        stage: stageWithDesignRecipeStep,
      };
      const result = await assembleTurnPrompt(deps, params);

      assertEquals(result.promptContent, "rendered turn prompt");
    } finally {
      teardown();
    }
  });

  await t.step("should successfully assemble a prompt using a dynamic template specified in the HeaderContext", async () => {
    const recipeStepForDesignDoc = buildRecipeStep({
      outputs_required: {
        files_to_generate: [{
          from_document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
          template_filename: "design_template.md",
        }],
      },
    });

    const stageWithDesignRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepForDesignDoc
    };

    const mockFileRecord: FileRecord = {
      id: "mock-dynamic-template-id",
      project_id: defaultProject.id,
      file_name: "turn_prompt_dynamic.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt_dynamic.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
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
              const fullPromptPath = getPromptFilePath(STAGE_SLUG, TECHNICAL_DESIGN_DOCUMENT_KEY);
              if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                  return Promise.resolve({ data: new Blob([designTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
          },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    if(!isRecord(mockTurnJob.payload.inputs)) {
      throw new Error("Job payload inputs is not valid JSON");
    }
    const jobForDesignDoc: DialecticJobRow = {
        ...mockTurnJob,
        payload: {
            ...mockTurnJob.payload,
            inputs: {
                header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
            },
            document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
            document_specific_data: { custom_style: "minimalist" },
            model_slug: "test-model",
        }
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock(undefined, undefined, designTemplateContent);
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobForDesignDoc,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithDesignRecipeStep,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps, params);
  
      assertEquals(result.promptContent, "rendered turn prompt");
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
    } finally {
      teardown();
    }
  });

  await t.step("should successfully assemble a prompt using a dynamic template specified in the HeaderContext", async () => {
    const recipeStepForDesignDoc2 = buildRecipeStep({
      outputs_required: {
        files_to_generate: [{
          from_document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
          template_filename: "design_template.md",
        }],
      },
    });

    const stageWithDesignRecipeStep2: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepForDesignDoc2
    };

    const mockFileRecord: FileRecord = {
        id: "mock-dynamic-template-id-2",
        project_id: defaultProject.id,
        file_name: "turn_prompt_dynamic.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt_dynamic.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
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
                const fullPromptPath = getPromptFilePath(STAGE_SLUG, TECHNICAL_DESIGN_DOCUMENT_KEY);
                if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
                    return Promise.resolve({ data: new Blob([designTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
            },
        }
      };
    
      const { client } = setup(config);
      mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    
      if(!isRecord(mockTurnJob.payload)) {
        throw new Error("Job payload is not valid JSON");
      }
      if(!isRecord(mockTurnJob.payload.inputs)) {
        throw new Error("Job payload inputs is not valid JSON");
      }
      const jobForDesignDoc: DialecticJobRow = {
          ...mockTurnJob,
          payload: {
              ...mockTurnJob.payload,
              inputs: {
                  header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID,
              },
              document_key: TECHNICAL_DESIGN_DOCUMENT_KEY,
              document_specific_data: { custom_style: "brutalist" },
              model_slug: "test-model",
          }
      };
  
      try {
        const mockDownloadFromStorage = createConditionalDownloadMock(undefined, undefined, designTemplateContent);
        const deps: AssembleTurnPromptDeps = {
          dbClient: client,
          gatherContext: mockGatherContext,
          render: mockRender,
          fileManager: mockFileManager,
          downloadFromStorage: mockDownloadFromStorage,
        };
        const params: AssembleTurnPromptParams = {
          job: jobForDesignDoc,
          project: defaultProject,
          session: defaultSession,
          stage: stageWithDesignRecipeStep2,
        };
        const result: AssembledPrompt = await assembleTurnPrompt(deps, params);
    
        assertEquals(result.promptContent, "rendered turn prompt");
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
      } finally {
        teardown();
      }
    });

  await t.step("should handle a recipe step that requires no additional source documents beyond the HeaderContext", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-no-sources-id-456",
      project_id: defaultProject.id,
      file_name: "turn_prompt_no_sources.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt_no_sources.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
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
                    return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
            },
        }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
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
  
    // This test explicitly verifies that the function can run successfully
    // when the only required input is the header context, proving it doesn't
    // fail when the source document list is empty.
    const stageWithNoExtraInputs: StageContext = {
        ...defaultStage,
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock();
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithNoExtraInputs,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps, params);
  
      assertEquals(result.promptContent, "rendered turn prompt");
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
    } finally {
      teardown();
    }
  });

  await t.step("should correctly construct the prompt artifact filename when 'step_name' is missing from the recipe step", async () => {
    const mockFileRecord: FileRecord = { 
      id: "file-record-id-no-step", 
      project_id: "", 
      file_name: "", 
      storage_bucket: "", 
      storage_path: "", 
      mime_type: "", 
      size_bytes: 0, 
      resource_description: "", 
      created_at: "", 
      updated_at: "", 
      user_id: "", 
      session_id: "", 
      stage_slug: "", 
      iteration_number: 0, 
      resource_type: "", 
      source_contribution_id: null, 
      feedback_type: "test", 
      target_contribution_id: null, 
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
                    return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
            },
        }
    };
    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    
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
    const stageWithNoStepName: StageContext = {
      ...defaultStage,
      recipe_step: {
        ...defaultStage.recipe_step,
        step_name: undefined,
      } as unknown as DialecticRecipeStep,
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock();
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithNoStepName,
      };
      await assembleTurnPrompt(deps, params);

      assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
      const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
      // We assert that stepName is undefined, which is the correct behavior.
      assertEquals(uploadContext.pathContext.stepName, undefined);
    } finally {
      teardown();
    }
  });

  await t.step("should pass branch_key and parallel_group to the file manager", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-bh-pg",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt for branching",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
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
                    return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
            },
        }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
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

    const branchKey = "feature_branch_a";
    const parallelGroup = 1;

    const stageWithBranchingInfo: StageContext = {
      ...defaultStage,
      recipe_step: {
        ...defaultRecipeStep,
        branch_key: branchKey,
        parallel_group: parallelGroup,
      },
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock();
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithBranchingInfo,
      };
      await assembleTurnPrompt(deps, params);

      assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should have been called once.");
      const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
      
      assertEquals(uploadContext.pathContext.branchKey, branchKey, "branchKey was not passed correctly to the file manager.");
      assertEquals(uploadContext.pathContext.parallelGroup, parallelGroup, "parallelGroup was not passed correctly to the file manager.");

    } finally {
      teardown();
    }
  });

  await t.step("should query header context by contribution ID from inputs and use contribution's storage bucket", async () => {
    const contributionId = "contrib-123";
    const contributionStorageBucket = "dialectic_contributions";
    const contributionStoragePath = "path/to/header";
    const contributionFileName = "header_context.json";
    const fullStoragePath = `${contributionStoragePath}/${contributionFileName}`;

    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-contrib",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };

    const downloadSpy = spy((bucket: string, path: string) => {
      if (bucket === contributionStorageBucket && path === fullStoragePath) {
        return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
      }
      const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
      if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
        return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
      }
      return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
    });

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
            ],
          }
        },
        dialectic_document_templates: createTemplateMock(),
        dialectic_contributions: {
          select: async (state: MockQueryBuilderState) => {
            const idFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'id' && f.value === contributionId);
            if (idFilter) {
              return {
                data: [{
                  id: contributionId,
                  storage_bucket: contributionStorageBucket,
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
      storageMock: {
        downloadResult: downloadSpy,
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }

    const jobWithInputs: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        inputs: {
          header_context_id: contributionId,
        },
      },
    };
    delete (jobWithInputs.payload as any).header_context_resource_id;

    try {
      const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const result = await downloadSpy(bucket, path);
        if (result.data instanceof Blob) {
          return { data: await result.data.arrayBuffer(), error: result.error };
        }
        return { data: null, error: result.error };
      };
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps, params);

      assertEquals(result.promptContent, "rendered turn prompt");
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);

      assert(downloadSpy.calls.length >= 1, "downloadFromStorage should be called at least once");
      const headerDownloadCall = downloadSpy.calls.find((call: any) => 
        call.args[0] === contributionStorageBucket && call.args[1] === fullStoragePath
      );
      assert(headerDownloadCall !== undefined, `downloadFromStorage should be called with bucket "${contributionStorageBucket}" and path "${fullStoragePath}"`);
    } finally {
      teardown();
    }
  });

  await t.step("should read files_to_generate from recipe step and use context_for_documents for alignment", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-files-from-recipe",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };

    const headerContextWithAlignment = {
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
        dialectic_document_templates: createTemplateMock(),
      },
      storageMock: {
        downloadResult: (bucket, path) => {
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
          if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithAlignment)]), error: null });
          }
          const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
          if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
            const templateContent = "Template with {field1} and {field2}";
            return Promise.resolve({ data: new Blob([templateContent]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
        },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

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
        document_specific_data: {}
      },
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock();
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithBusinessCase,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithRecipeStep,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps, params);

      assertEquals(result.promptContent, "rendered turn prompt");
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
    } finally {
      teardown();
    }
  });

  await t.step("should use template_filename from files_to_generate in recipe step, not from headerContext", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-template-from-recipe",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };

    const headerContextWithAlignment = {
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

    const downloadSpy = spy((bucket: string, path: string) => {
      const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
      if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
        return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithAlignment)]), error: null });
      }
      const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
      if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
        const templateContent = "Template from recipe step";
        return Promise.resolve({ data: new Blob([templateContent]), error: null });
      }
      return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
    });

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
        downloadResult: downloadSpy,
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

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
        document_specific_data: {}
      },
    };

    try {
      const mockDownloadFromStorage: DownloadFromStorageFn = async (_supabase, bucket, path) => {
        const result = await downloadSpy(bucket, path);
        if (result.data instanceof Blob) {
          return { data: await result.data.arrayBuffer(), error: result.error };
        }
        return { data: null, error: result.error };
      };
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithBusinessCase,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithRecipeStep,
      };
      await assembleTurnPrompt(deps, params);

      assert(downloadSpy.calls.length >= 2, "downloadFromStorage should be called at least twice (header context and template)");
      const templateDownloadCall = downloadSpy.calls.find((call: any) => 
        call.args[1] && call.args[1].includes(`${STAGE_SLUG}_${BUSINESS_CASE_DOCUMENT_KEY}_turn_v1.md`)
      );
      assert(templateDownloadCall !== undefined, "downloadFromStorage should be called with prompt file path based on stage slug and document_key");
    } finally {
      teardown();
    }
  });

  await t.step("should accept content_to_include with compatible types when all required keys exist", async () => {
    const headerContextWithCompatibleTypes = {
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
            field1: { nested: "object", value: "test" }, // object instead of string
            field2: ["array", "of", "strings"], // array instead of string
            field3: "string value" // string as expected
          }
        }
      ]
    };

    const recipeStepWithStringTypes = buildRecipeStep({
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
              field1: "", // recipe expects string
              field2: "", // recipe expects string
              field3: ""  // recipe expects string
            }
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithStringTypes
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
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithCompatibleTypes)]), error: null });
          }
          const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
          if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
            return Promise.resolve({ data: new Blob(["Template content"]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse({
      id: "mock-turn-resource-id",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    }, null);

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
      const mockDownloadFromStorage = createConditionalDownloadMock(headerContextWithCompatibleTypes, "Template content");
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithBusinessCase,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithRecipeStep,
      };
      const result = await assembleTurnPrompt(deps, params);
      assert(result, "assembleTurnPrompt should succeed with compatible types");
      assert(result.promptContent, "assembleTurnPrompt should return prompt content");
    } finally {
      teardown();
    }
  });

  await t.step("should accept content_to_include where recipe expects string but receives object", async () => {
    const headerContextWithObject = {
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
            summary: { title: "Title", body: "Body" } // object instead of string
          }
        }
      ]
    };

    const recipeStepWithStringType = buildRecipeStep({
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
              summary: "" // recipe expects string
            }
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithStringType
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
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithObject)]), error: null });
          }
          const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
          if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
            return Promise.resolve({ data: new Blob(["Template content"]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse({
      id: "mock-turn-resource-id",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    }, null);

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
      const mockDownloadFromStorage = createConditionalDownloadMock(headerContextWithObject, "Template content");
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithBusinessCase,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithRecipeStep,
      };
      const result = await assembleTurnPrompt(deps, params);
      assert(result, "assembleTurnPrompt should succeed when object is provided instead of string");
      assert(result.promptContent, "assembleTurnPrompt should return prompt content");
    } finally {
      teardown();
    }
  });

  await t.step("should accept content_to_include where recipe expects string but receives array", async () => {
    const headerContextWithArray = {
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
            items: ["item1", "item2"] // array instead of string
          }
        }
      ]
    };

    const recipeStepWithStringType = buildRecipeStep({
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
              items: "" // recipe expects string
            }
          }
        ]
      }
    });

    const stageWithRecipeStep: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithStringType
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
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithArray)]), error: null });
          }
          const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
          if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
            return Promise.resolve({ data: new Blob(["Template content"]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error("File not found in mock") });
        },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse({
      id: "mock-turn-resource-id",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    }, null);

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
      const mockDownloadFromStorage = createConditionalDownloadMock(headerContextWithArray, "Template content");
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithBusinessCase,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithRecipeStep,
      };
      const result = await assembleTurnPrompt(deps, params);
      assert(result, "assembleTurnPrompt should succeed when array is provided instead of string");
      assert(result.promptContent, "assembleTurnPrompt should return prompt content");
    } finally {
      teardown();
    }
  });

  await t.step("should merge contextForDoc.content_to_include into renderContext passed to renderPrompt", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-merge-alignment",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };

    const headerContextWithAlignment = {
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
            alignment_key: "alignment_value_from_context",
            another_alignment: "another_value"
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

    const templateContent = "Template with {alignment_key} and {another_alignment}";

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
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithAlignment)]), error: null });
          }
          const fullPromptPath = getPromptFilePath(STAGE_SLUG, BUSINESS_CASE_DOCUMENT_KEY);
          if (bucket === TEMPLATE_STORAGE_BUCKET && path === fullPromptPath) {
            return Promise.resolve({ data: new Blob([templateContent]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
        },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

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
        document_specific_data: {}
      },
    };

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock(headerContextWithAlignment, templateContent);
      const renderSpy = spy((_renderPromptFn: unknown, _stage: unknown, context: unknown, _overlay: unknown) => {
        if (!isRecord(context)) {
          return "rendered turn prompt";
        }
        if (("alignment_key" in context && context.alignment_key === "alignment_value_from_context") ||
            ("another_alignment" in context && context.another_alignment === "another_value")) {
          return "rendered turn prompt with alignment";
        }
        return "rendered turn prompt";
      });
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: renderSpy,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: jobWithBusinessCase,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithRecipeStep,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps, params);

      assert(renderSpy.calls.length === 1, "render should be called once");
      const renderCall = renderSpy.calls[0];
      const contextArg = renderCall.args[2];
      if (!isRecord(contextArg)) {
        throw new Error("render context must be a record");
      }
      assert(
        "alignment_key" in contextArg && contextArg.alignment_key === "alignment_value_from_context" &&
        "another_alignment" in contextArg && contextArg.another_alignment === "another_value",
        "renderContext should include alignment values from context_for_documents.content_to_include"
      );
    } finally {
      teardown();
    }
  });

  await t.step("should include full header_context object in render context when requiresHeaderContext is true", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-turn-resource-id-header-context-object",
      project_id: defaultProject.id,
      file_name: "turn_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
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
            return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
          }
          return Promise.resolve({ data: null, error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`) });
        },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    // Create a render spy that captures the context and verifies header_context is present
    const renderSpy = spy((_renderPromptFn: unknown, _stage: unknown, context: unknown, _overlay: unknown) => {
      return "rendered turn prompt";
    });

    try {
      const mockDownloadFromStorage = createConditionalDownloadMock();
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        gatherContext: mockGatherContext,
        render: renderSpy,
        fileManager: mockFileManager,
        downloadFromStorage: mockDownloadFromStorage,
      };
      const params: AssembleTurnPromptParams = {
        job: mockTurnJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
      };
      await assembleTurnPrompt(deps, params);

      // Verify render was called
      assert(renderSpy.calls.length === 1, "render should be called once");
      
      // Get the context argument passed to render (3rd argument, index 2)
      const renderCall = renderSpy.calls[0];
      const contextArg = renderCall.args[2];
      
      if (!isRecord(contextArg)) {
        throw new Error("render context must be a record");
      }

      // Assert that header_context is present as a full object
      assert(
        "header_context" in contextArg,
        "renderContext must include 'header_context' as a named property for {{header_context}} substitution"
      );

      const headerContextInContext = contextArg.header_context;
      if (!isRecord(headerContextInContext)) {
        throw new Error("header_context in context must be an object");
      }

      // Verify the header_context object contains the expected structure
      assert(
        "system_materials" in headerContextInContext,
        "header_context must include system_materials"
      );
      assert(
        "header_context_artifact" in headerContextInContext,
        "header_context must include header_context_artifact"
      );
      assert(
        "context_for_documents" in headerContextInContext,
        "header_context must include context_for_documents"
      );
    } finally {
      teardown();
    }
  });

  await t.step(
    "should resolve the prompt template via recipe_step.prompt_template_id → system_prompts.document_template_id → dialectic_document_templates.id (no heuristic template lookup)",
    async () => {
      const promptDocumentTemplateId = "doc-template-turn-prompt-123";

      const expectedTemplateFileName = `${STAGE_SLUG}_${BUSINESS_CASE_DOCUMENT_KEY}_turn_v1.md`;
      const expectedTemplateStoragePath = `docs/prompts/${STAGE_SLUG}/`;
      const expectedFullTemplatePath =
        `${expectedTemplateStoragePath.replace(/\/$/, "")}/${expectedTemplateFileName}`;

      const mockFileRecord: FileRecord = {
        id: "mock-turn-resource-id-db-driven-template",
        project_id: defaultProject.id,
        file_name: "turn_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-123", name: "Test Model", provider: "test", slug: "test-model" },
              ],
            },
          },
          dialectic_contributions: createHeaderContextContributionMock(),
          system_prompts: {
            select: async (state: MockQueryBuilderState) => {
              const idFilter = state.filters.find((f) =>
                f.type === "eq" &&
                f.column === "id" &&
                f.value === defaultRecipeStep.prompt_template_id
              );
              if (!idFilter) {
                return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
              }
              return {
                data: [{
                  id: defaultRecipeStep.prompt_template_id,
                  prompt_text: null,
                  document_template_id: promptDocumentTemplateId,
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: "OK",
              };
            },
          },
          dialectic_document_templates: {
            select: async (state: MockQueryBuilderState) => {
              // Disallow heuristic matching (storage_path LIKE / file_name contains document_key)
              const hasHeuristicFilter = state.filters.some((f) =>
                (f.type === "ilike" || f.type === "like") &&
                (f.column === "storage_path" || f.column === "file_name")
              );
              if (hasHeuristicFilter) {
                throw new Error(
                  "DISALLOWED_TEMPLATE_LOOKUP: assembleTurnPrompt must resolve the prompt template via system_prompts.document_template_id and dialectic_document_templates.id, not by ilike(storage_path) + ilike(file_name).",
                );
              }

              const idFilter = state.filters.find((f) =>
                f.type === "eq" &&
                f.column === "id" &&
                f.value === promptDocumentTemplateId
              );
              if (!idFilter) {
                return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
              }

              return {
                data: [{
                  id: promptDocumentTemplateId,
                  domain_id: defaultProject.selected_domain_id,
                  name: "synthesis business_case turn prompt v1",
                  description: "DB-authoritative prompt template row",
                  storage_bucket: TEMPLATE_STORAGE_BUCKET,
                  storage_path: expectedTemplateStoragePath,
                  file_name: expectedTemplateFileName,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }],
                error: null,
                count: 1,
                status: 200,
                statusText: "OK",
              };
            },
          },
        },
        storageMock: {
          downloadResult: (bucket, path) => {
            const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
            if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
              return Promise.resolve({
                data: new Blob([JSON.stringify(headerContextContent)]),
                error: null,
              });
            }

            if (bucket === TEMPLATE_STORAGE_BUCKET && path === expectedFullTemplatePath) {
              return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
            }

            return Promise.resolve({
              data: null,
              error: new Error(`File not found in mock (bucket: ${bucket}, path: ${path})`),
            });
          },
        },
      };

      const { client, spies } = setup(config);
      mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

      try {
        const mockDownloadFromStorage = createConditionalDownloadMock();
        const deps: AssembleTurnPromptDeps = {
          dbClient: client,
          gatherContext: mockGatherContext,
          render: mockRender,
          fileManager: mockFileManager,
          downloadFromStorage: mockDownloadFromStorage,
        };
        const params: AssembleTurnPromptParams = {
          job: mockTurnJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
        };

        const result: AssembledPrompt = await assembleTurnPrompt(deps, params);

        assertEquals(result.promptContent, "rendered turn prompt");

        const usedSystemPromptsTable = spies.fromSpy.calls.some((call) =>
          call.args[0] === "system_prompts"
        );
        assert(
          usedSystemPromptsTable,
          "assembleTurnPrompt must query system_prompts by recipe_step.prompt_template_id",
        );
      } finally {
        teardown();
      }
    },
  );

});
