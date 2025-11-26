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
        // REQUIRED: storage_path filter MUST contain docs/prompts/{stage_slug}/
        const storagePathFilter = state.filters.find((f) => 
          (f.type === 'ilike' || f.type === 'like') && 
          f.column === 'storage_path' && 
          typeof f.value === 'string' &&
          f.value.includes('docs/prompts/')
        );
        
        if (!storagePathFilter || typeof storagePathFilter.value !== 'string') {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }
        
        // Extract stage_slug from storage_path pattern (e.g., 'docs/prompts/{stage_slug}/%')
        const storagePathPattern = storagePathFilter.value;
        const stageSlugMatch = storagePathPattern.match(/docs\/prompts\/([^/%]+)/);
        if (!stageSlugMatch) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }
        const stageSlug = stageSlugMatch[1];
        
        // REQUIRED: file_name filter MUST contain document_key (we verify the filter exists, not the exact value)
        const fileNameFilter = state.filters.find((f) => 
          (f.type === 'ilike' || f.type === 'like' || f.type === 'eq') && 
          f.column === 'file_name' && 
          typeof f.value === 'string'
        );
        
        if (!fileNameFilter || typeof fileNameFilter.value !== 'string') {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }
        
        // Extract document_key from filename pattern - filename MUST contain document_key
        // Pattern might be like: '%business_case%' or exact match containing the key
        const fileNamePattern = fileNameFilter.value.replace(/%/g, '').toLowerCase();
        
        // REQUIRED: is_active filter
        const isActiveFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'is_active' && f.value === true);
        if (!isActiveFilter) {
          return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
        }
        
        // Optional: domain_id filter
        const domainIdFilter = state.filters.find((f) => f.type === 'eq' && f.column === 'domain_id');
        const domainId = domainIdFilter ? domainIdFilter.value : (defaultProject.selected_domain_id || null);
        
        // Return mock record that satisfies the filters
        // We construct a filename that contains the document_key (extracted from pattern or generic)
        // The exact pattern doesn't matter as long as it contains the document_key
        const documentKeyFromPattern = fileNamePattern.match(/([a-z_]+)/)?.[1] || 'document';
        const mockFileName = fileNamePattern.includes('.md') 
          ? fileNamePattern 
          : `${stageSlug}_${documentKeyFromPattern}_turn_v1.md`;
        
        return {
          data: [{
            id: `template-${mockFileName.replace(/[^a-z0-9]/gi, '-')}`,
            domain_id: domainId,
            name: mockFileName.replace('.md', '').replace(/_/g, ' '),
            description: `Prompt template for ${mockFileName}`,
            file_name: mockFileName,
            storage_bucket: TEMPLATE_STORAGE_BUCKET,
            storage_path: `docs/prompts/${stageSlug}/`,
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
        const result: AssembledPrompt = await assembleTurnPrompt(deps);

        const expectedPromptContent = "## Project Executive Summary\n\nCover these points: Problem, Solution, Market";
        
        assertEquals(result.promptContent, expectedPromptContent);
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
        
        assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
        const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
        assertEquals(uploadContext.fileContent, expectedPromptContent);
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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: continuationJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      await assembleTurnPrompt(deps);

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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobForDesignDoc,
        project: projectWithUserOverlay,
        session: defaultSession,
        stage: stageWithDesignRecipeStep,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result = await assembleTurnPrompt(deps);

      assertEquals(result.promptContent, "Design Style: formal");
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
        "Failed to download document template file summary_template.md from storage: Template Not Found"
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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobForDesignDoc,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithDesignRecipeStep,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps);
  
      const expectedPromptContent = "Design Style: minimalist";
      assertEquals(result.promptContent, expectedPromptContent);
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
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
        const deps: AssembleTurnPromptDeps = {
          dbClient: client,
          job: jobForDesignDoc,
          project: defaultProject,
          session: defaultSession,
          stage: stageWithDesignRecipeStep2,
          gatherContext: mockGatherContext,
          render: mockRender,
          fileManager: mockFileManager,
        };
        const result: AssembledPrompt = await assembleTurnPrompt(deps);
    
        const expectedPromptContent = "Design Style: brutalist";
        assertEquals(result.promptContent, expectedPromptContent);
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
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
      // assembleTurnPrompt queries database for template metadata, then downloads from storage.
      // This test verifies that a storage failure during template fetch is handled correctly.
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
        "Failed to download document template file summary_template.md from storage: Template Not Found from Storage"
      )
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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithNoExtraInputs,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps);
  
      const expectedPromptContent = "## Project Executive Summary\n\nCover these points: Problem, Solution, Market";
      assertEquals(result.promptContent, expectedPromptContent);
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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithNoStepName,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      await assembleTurnPrompt(deps);

      assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
      const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
      // We assert that stepName is undefined, which is the correct behavior.
      assertEquals(uploadContext.pathContext.stepName, undefined);
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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithBranchingInfo,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      await assembleTurnPrompt(deps);

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
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobWithInputs,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps);

      const expectedPromptContent = "## Project Executive Summary\n\nCover these points: Problem, Solution, Market";
      assertEquals(result.promptContent, expectedPromptContent);
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
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithMissingInputs,
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
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithInvalidContributionId,
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
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithInvalidContribution,
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
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithInvalidContribution,
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
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithInvalidContribution,
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
        `Header context contribution '${contributionId}' is missing required file_name.`
      );
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
      const result: AssembledPrompt = await assembleTurnPrompt(deps);

      const expectedPromptContent = "Template with value1 and value2";
      assertEquals(result.promptContent, expectedPromptContent);
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
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

      assert(downloadSpy.calls.length >= 2, "downloadFromStorage should be called at least twice (header context and template)");
      const templateDownloadCall = downloadSpy.calls.find((call: any) => 
        call.args[1] && call.args[1].includes(`${STAGE_SLUG}_${BUSINESS_CASE_DOCUMENT_KEY}_turn_v1.md`)
      );
      assert(templateDownloadCall !== undefined, "downloadFromStorage should be called with prompt file path based on stage slug and document_key");
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

  await t.step("should throw error when content_to_include structure doesn't match recipe step's expected structure", async () => {
    const headerContextWithMismatchedStructure = {
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

    const recipeStepWithMismatchedStructure = buildRecipeStep({
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
      recipe_step: recipeStepWithMismatchedStructure
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
            return Promise.resolve({ data: new Blob([JSON.stringify(headerContextWithMismatchedStructure)]), error: null });
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
        "content_to_include structure for document_key"
      );
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
      const result: AssembledPrompt = await assembleTurnPrompt(deps);

      assert(
        result.promptContent.includes("alignment_value_from_context") || result.promptContent.includes("another_value"),
        "Prompt content should include alignment values from context_for_documents.content_to_include when merged into renderContext"
      );
    } finally {
      teardown();
    }
  });

});
