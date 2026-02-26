import { assertEquals, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, Spy } from "jsr:@std/testing@0.225.1/mock";
import { assemblePlannerPrompt } from "./assemblePlannerPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssembledPrompt,
  DynamicContextVariables,
  RenderFn,
  AssemblerSourceDocument,
} from "./prompt-assembler.interface.ts";
import { type GatherContextFn } from "./gatherContext.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import {
  createMockFileManagerService,
  MockFileManagerService,
} from "../services/file_manager.mock.ts";
import {
  FileType,
  type FileRecord,
  type ResourceUploadContext,
} from "../types/file_manager.types.ts";
import {
  DialecticJobRow,
  DialecticRecipeStep,
  ContextForDocument,
} from "../../dialectic-service/dialectic.interface.ts";
import { assertSpyCall, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import { isRecord } from "../utils/type_guards.ts";
import { assert } from "jsr:@std/assert@0.225.3";

const defaultMockContext: DynamicContextVariables = {
  user_objective: "mock user objective",
  domain: "Software Development",
  context_description: "A test context",
  original_user_request: "The original request",
  recipeStep: {
    id: "step-id-123",
    template_id: "rt-123",
    step_number: 1,
    step_key: "GeneratePlanKey",
    step_slug: "generate-plan-slug",
    step_name: "GeneratePlan",
    job_type: "PLAN",
    prompt_type: "Planner",
    prompt_template_id: "spt-123",
    output_type: FileType.HeaderContext,
    granularity_strategy: "all_to_one",
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parallel_group: null,
    branch_key: null,
    step_description: "A step for planning",
  },
  sourceDocuments: [],
};

Deno.test("assemblePlannerPrompt", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let mockFileManager: MockFileManagerService;
  let mockGatherContextFn: Spy<GatherContextFn>;
  let mockRenderFn: Spy<RenderFn>;

  const setup = (
    config: MockSupabaseDataConfig = {},
    mockContext: DynamicContextVariables,
  ) => {
    mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    mockFileManager = createMockFileManagerService();

    mockGatherContextFn = spy(async () => mockContext);
    mockRenderFn = spy(() => "rendered planner prompt");

    return {
      client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      spies: mockSupabaseSetup.spies,
      fileManager: mockFileManager,
      gatherContextFn: mockGatherContextFn,
      renderFn: mockRenderFn,
    };
  };

  const teardown = () => {
    if (mockSupabaseSetup) {
      mockSupabaseSetup.clearAllStubs?.();
      mockSupabaseSetup = null;
    }
  };

  const defaultProject: ProjectContext = {
    id: "proj-123",
    user_id: "user-123",
    project_name: "Test Project Objective",
    initial_user_prompt: "This is the initial user prompt content.",
    initial_prompt_resource_id: "res-user-prompt-123",
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
    selected_model_ids: ["model-1"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_stage_id: "stage-123",
    iteration_count: 1,
    session_description: "Test session",
    status: "pending_thesis",
    associated_chat_id: null,
    user_input_reference_url: null,
  };

  const mockRecipeStep: DialecticRecipeStep = {
    id: "step-id-123",
    template_id: "rt-123",
    step_number: 1,
    step_key: "GeneratePlanKey",
    step_slug: "generate-plan-slug",
    step_name: "GeneratePlan",
    job_type: "PLAN",
    prompt_type: "Planner",
    prompt_template_id: "spt-123",
    output_type: FileType.HeaderContext,
    granularity_strategy: "all_to_one",
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {
      context_for_documents: [
        {
          document_key: FileType.business_case,
          content_to_include: {},
        },
      ],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parallel_group: null,
    branch_key: null,
    step_description: "A step for planning"
  };

  const defaultStage: StageContext = {
    id: "stage-123",
    system_prompts: { prompt_text: "This is the default stage prompt and should not be used by the planner." },
    domain_specific_prompt_overlays: [],
    slug: "synthesis",
    display_name: "Synthesis",
    description: "Synthesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: "prompt-default-stage",
    active_recipe_instance_id: "instance-123",
    expected_output_template_ids: [],
    recipe_template_id: "recipe-template-123",
    recipe_step: mockRecipeStep,
  };

  const plannerPromptText = "This is the planner prompt for step {step_name}.";

  const legacyMockPlannerJob: DialecticJobRow = {
    id: "job-planner-123",
    job_type: "PLAN",
    payload: {
      model_slug: "claude-3-opus",
      model_id: "model-claude-3-opus",
      step_info: {},
    },
    session_id: defaultSession.id,
    stage_slug: defaultStage.slug,
    iteration_number: 1,
    status: "pending",
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

  const mockPlannerJob: DialecticJobRow = {
    ...legacyMockPlannerJob,
    payload: {
      model_id: "model-claude-3-opus",
      model_slug: "claude-3-opus",
    },
  };

  await t.step("should correctly assemble a planner prompt and fulfill all dependency contracts",
    async () => {
      const mockFileRecord: FileRecord = {
        id: "mock-planner-resource-id-456",
        project_id: defaultProject.id,
        file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/planner_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock planner prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "planner_prompt",
        source_contribution_id: null,
      };

      const mockDynamicContext: DynamicContextVariables = {
        ...defaultMockContext,
        original_user_request: "The original request",
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup(config, mockDynamicContext);

      fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      try {
        const result: AssembledPrompt = await assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: "resolved prompt from storage",
          gatherContext: gatherContextFn,
          render: renderFn,
        });

        // 1. Assert the final return value is correct
        assertEquals(result.promptContent, "rendered planner prompt");
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);

        // 2. Assert the database was queried for the correct template
        const dbSpies = mockSupabaseSetup!.spies.getLatestQueryBuilderSpies(
          "system_prompts",
        )!;
        assertSpyCalls(dbSpies.select!, 1);
        assertSpyCall(dbSpies.eq!, 0, {
          args: ["id", mockRecipeStep.prompt_template_id],
        });
        assertSpyCalls(dbSpies.single!, 1);

        // 3. Assert context was gathered correctly with all dependencies
        assertSpyCalls(gatherContextFn, 1);
        const gatherArgs = gatherContextFn.calls[0].args;
        assertEquals(gatherArgs[0], client);
        assertEquals(typeof gatherArgs[1], "function"); // downloadFn
        assertEquals(typeof gatherArgs[2], "function"); // gatherInputsFn
        assertEquals(gatherArgs[3], defaultProject);
        assertEquals(gatherArgs[4], defaultSession);
        assertEquals(gatherArgs[5], defaultStage);
        assertEquals(gatherArgs[6], "resolved prompt from storage");
        assertEquals(gatherArgs[7], defaultSession.iteration_count);

        // 4. Assert rendering was performed with the overridden template and correct context
        assertSpyCalls(renderFn, 1);
        const renderCallArgs = renderFn.calls[0].args;
        assertEquals(typeof renderCallArgs[0], "function"); // renderPromptFn
        const stageArgForRender = renderCallArgs[1];
        assertEquals(
          stageArgForRender.system_prompts!.prompt_text,
          plannerPromptText,
        );
        // assemblePlannerPrompt adds context_for_documents and removes raw sourceDocuments
        const { sourceDocuments: _removed, ...contextWithoutRawDocs } = mockDynamicContext;
        const expectedContext = {
          ...contextWithoutRawDocs,
          context_for_documents: {
            _instructions: "You must fill in the content_to_include objects in the context_for_documents array with specific alignment values. These alignment details ensure cross-document coordination:\n\n1. Fill in each content_to_include object with shared terminology, consistent values, and coordinated decisions that will be used across all documents in this step group.\n2. Produce a header_context artifact with completed content_to_include objects containing these alignment values.\n3. Ensure all documents in the step group will use these alignment details when they are generated.\n\nThe context_for_documents array below contains empty content_to_include object models that you must fill in with specific alignment values.",
            documents: [
              {
                document_key: FileType.business_case,
                content_to_include: {},
              },
            ],
          },
        };
        assertEquals(renderCallArgs[2], expectedContext);
        assertEquals(
          renderCallArgs[3],
          defaultProject.user_domain_overlay_values,
        );

        // 5. Assert the file was saved with the correct and complete context
        assertSpyCalls(uploadSpy, 1);
        if (!isRecord(mockPlannerJob.payload)) {
          throw new Error("Test setup error: mockPlannerJob.payload is not a record.");
        }
        if (typeof mockPlannerJob.payload.model_id !== 'string') {
          throw new Error("Test setup error: mockPlannerJob.payload.model_id is not a string.");
        }
        const expectedUploadContext: ResourceUploadContext = {
          pathContext: {
            projectId: defaultProject.id,
            sessionId: defaultSession.id,
            iteration: defaultSession.iteration_count,
            stageSlug: defaultStage.slug,
            fileType: FileType.PlannerPrompt,
            modelSlug: "claude-3-opus",
            attemptCount: mockPlannerJob.attempt_count,
            stepName: "GeneratePlan",
            branchKey: null,
            parallelGroup: null,
            sourceContributionId: null,
          },
          resourceTypeForDb: "planner_prompt",
          fileContent: "rendered planner prompt",
          mimeType: "text/markdown",
          sizeBytes: 23,
          userId: defaultProject.user_id,
          description: `Planner prompt for stage: ${defaultStage.slug}, step: ${mockRecipeStep.step_name}`,
        };
        assertEquals(uploadSpy.calls[0].args[0], expectedUploadContext);
      } finally {
        teardown();
      }
    },
  );

  await t.step("should forward sourceContributionId when continuation exists",
    async () => {
      const continuationContributionId = "contrib-123";
      const continuationJob: DialecticJobRow = {
        ...mockPlannerJob,
        target_contribution_id: continuationContributionId,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup(config, defaultMockContext);

      const mockFileRecord: FileRecord = {
        id: "mock-planner-resource-id-continuation",
        project_id: defaultProject.id,
        file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/planner_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock planner prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "planner_prompt",
        source_contribution_id: null,
      };

      fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      try {
        await assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: continuationJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

        assertSpyCalls(uploadSpy, 1);
        const uploadContext = uploadSpy.calls[0].args[0];
        assertEquals(
          uploadContext.pathContext.sourceContributionId,
          continuationContributionId,
        );
      } finally {
        teardown();
      }
    },
  );

  await t.step("should correctly handle domain_specific_prompt_overlays",
    async () => {
      const stageWithOverlays: StageContext = {
        ...defaultStage,
        domain_specific_prompt_overlays: [{
          overlay_values: { "custom_key": "custom_value" },
        }],
      };
      const { client, fileManager, renderFn, gatherContextFn } = setup({
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      }, defaultMockContext);

      const mockFileRecord: FileRecord = {
        id: "mock-planner-resource-id-456",
        project_id: defaultProject.id,
        file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/planner_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock planner prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "planner_prompt",
        source_contribution_id: null,
      };

      fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

      try {
        await assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: stageWithOverlays,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

        assertSpyCalls(renderFn, 1);
        // The overlay is the fourth argument to render
        assertEquals(
          renderFn.calls[0].args[1].domain_specific_prompt_overlays[0],
          {
            "overlay_values": { "custom_key": "custom_value" },
          },
        );
      } finally {
        teardown();
      }
    },
  );

  await t.step("should use different names for db query and file naming when provided",
    async () => {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "special text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const { client, fileManager, gatherContextFn, renderFn } = setup(config, defaultMockContext);

      const mockFileRecord: FileRecord = {
        id: "mock-planner-resource-id-456",
        project_id: defaultProject.id,
        file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/planner_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock planner prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "planner_prompt",
        source_contribution_id: null,
      };

      fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
      const uploadSpy = fileManager.uploadAndRegisterFile;

      try {
        await assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

        // Assert DB query used recipe step's prompt_template_id
        const dbSpies = mockSupabaseSetup!.spies.getLatestQueryBuilderSpies(
          "system_prompts",
        )!;
        assertSpyCall(dbSpies.eq!, 0, {
          args: ["id", mockRecipeStep.prompt_template_id],
        });

        // Assert file naming used recipe step's step_name
        assertSpyCalls(uploadSpy, 1);
        assertEquals(
          uploadSpy.calls[0].args[0].pathContext.stepName,
          mockRecipeStep.step_name,
        );
      } finally {
        teardown();
      }
    },
  );

  await t.step("should throw an error if the specified prompt template is not found",
    async () => {
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: null, error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup(config, defaultMockContext);

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      await assertRejects(
        assembleFn,
        Error,
        `Failed to find planner prompt template with ID ${mockRecipeStep.prompt_template_id}`,
      );

      teardown();
    },
  );

  await t.step("should propagate errors from the database when fetching the prompt template",
    async () => {
      const dbError = new Error("Database query failed");
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: null, error: dbError }
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };

      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup(config, defaultMockContext);

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      await assertRejects(
        assembleFn,
        Error,
        dbError.message,
      );

      teardown();
    },
  );
  
  await t.step("should throw an error if file manager fails to save",
    async () => {
      const fileManagerError = new Error("Failed to upload file");
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null }
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      };
      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup(config, defaultMockContext);

      fileManager.setUploadAndRegisterFileResponse(null, fileManagerError);

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      await assertRejects(
        assembleFn,
        Error,
        `Failed to save planner prompt: ${fileManagerError.message}`,
      );
  
      teardown();
    },
  );

  await t.step("should propagate errors from gatherContext dependency",
    async () => {
      const gatherError = new Error("Failed to gather context");
      const { client, fileManager } = setup({
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      }, defaultMockContext);
      const mockDeps = {
        gatherContext: () => Promise.reject(gatherError),
        render: spy(() => "should-not-be-called"),
      };

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          ...mockDeps,
        });

      await assertRejects(assembleFn, Error, gatherError.message);
      teardown();
    },
  );

  await t.step("should propagate errors from render dependency", async () => {
    const renderError = new Error("Failed to render prompt");
    const { client, fileManager } = setup({
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    }, defaultMockContext);

    const mockDeps = {
      gatherContext: spy(async () => defaultMockContext),
      render: () => {
        throw renderError;
      },
    };

    await assertRejects(
      () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          ...mockDeps,
        }),
      Error,
      renderError.message,
    );
    teardown();
  });

  await t.step("should throw an error if session has no selected models",
    async () => {
      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup({
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        }
      }, defaultMockContext);
      const sessionWithNoModels: SessionContext = {
        ...defaultSession,
        selected_model_ids: [],
      };

      const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: sessionWithNoModels,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      await assertRejects(
        assembleFn,
        Error,
        "PRECONDITION_FAILED: Session must have at least one selected model.",
      );

      teardown();
    },
  );

  await t.step("should throw an error if job payload is invalid",
    async () => {
      const {
        client,
        fileManager,
        gatherContextFn,
        renderFn,
      } = setup({
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        }
      }, defaultMockContext);
      
      const invalidJob: DialecticJobRow = {
        ...mockPlannerJob,
        payload: {},
      };

      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager,
            job: invalidJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            gatherContext: gatherContextFn,
            render: renderFn,
          }),
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'model_id'.",
      );

      teardown();
    },
  );

  await t.step("should correctly handle domain_specific_prompt_overlays being passed to render function",
    async () => {
      const stageWithOverlays: StageContext = {
        ...defaultStage,
        domain_specific_prompt_overlays: [{
          overlay_values: { "custom_key": "custom_value" },
        }],
      };
      const { client, fileManager } = setup({
        genericMockResults: {
          system_prompts: {
            select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
          },
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        },
      }, defaultMockContext);
      
      const fullFileRecord: FileRecord = {
        id: "file-123",
        project_id: defaultProject.id,
        user_id: defaultProject.user_id,
        file_name: "planner_prompt.md",
        storage_bucket: "prompts",
        storage_path: "path/to/prompt.md",
        mime_type: "text/markdown",
        size_bytes: 100,
        resource_description: "desc",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: defaultSession.iteration_count,
        resource_type: "planner_prompt",
        source_contribution_id: null,
      };
      fileManager.setUploadAndRegisterFileResponse(fullFileRecord, null);
      
      const mockRenderFn: Spy<RenderFn> = spy(() => "rendered");
      const mockGatherFn = spy(async () => (defaultMockContext));
      const mockDeps = { gatherContext: mockGatherFn, render: mockRenderFn };

      try {
        await assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: stageWithOverlays,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          ...mockDeps,
        });

        assertSpyCalls(mockRenderFn, 1);
        assertSpyCall(mockRenderFn, 0);
        const renderCallArgs = mockRenderFn.calls[0].args;
        const stageArg = renderCallArgs[1];
        assertEquals(stageArg.domain_specific_prompt_overlays[0], {
          "overlay_values": { "custom_key": "custom_value" },
        });
      } finally {
        teardown();
      }
    },
  );

  await t.step("should propagate errors from render dependency", async () => {
    const renderError = new Error("Failed to render prompt");
    const { client, fileManager } = setup({
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: "any text", document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    }, defaultMockContext);

    const mockDeps = {
      gatherContext: spy(async () => defaultMockContext),
      render: () => { throw renderError; },
    };

    await assertRejects(
      () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          ...mockDeps,
        }),
      Error,
      renderError.message,
    );
    teardown();
  });

  await t.step("should throw a precondition error if model_slug is missing from job payload",
    async () => {
      const { client, fileManager } = setup({
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        }
      }, defaultMockContext);
      const jobWithoutModelSlug = {
        ...mockPlannerJob,
        payload: {
          model_id: "model-claude-3-opus",
        },
      };

      const mockDeps = {
        gatherContext: spy(async () => defaultMockContext),
        render: spy(() => "irrelevant"),
      };

      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager,
            job: jobWithoutModelSlug as DialecticJobRow,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            ...mockDeps,
          }),
        Error,
        "PRECONDITION_FAILED: Job payload is missing model_slug.",
      );

      teardown();
    },
  );

  await t.step("should throw a precondition error if recipe_step is missing from stage context",
    async () => {
      const { client, fileManager } = setup({
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          }
        }
      }, defaultMockContext);
      // This is one of the two allowed exceptions for type casting, as we are intentionally
      // creating a malformed object to test graceful error handling.
      const stageWithoutRecipe: StageContext = {
        ...defaultStage,
        recipe_step: null as unknown as DialecticRecipeStep,
      };

      const mockDeps = {
        gatherContext: spy(async () => defaultMockContext),
        render: spy(() => "irrelevant"),
      };

      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager,
            job: mockPlannerJob,
            project: defaultProject,
            session: defaultSession,
            stage: stageWithoutRecipe,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            ...mockDeps,
          }),
        Error,
        "PRECONDITION_FAILED: Stage context is missing recipe_step.",
      );

      teardown();
    },
  );

  await t.step("should throw a precondition error if the legacy step_info object is present in the job payload",
    async () => {
      const { client, fileManager, gatherContextFn, renderFn } = setup({
        genericMockResults: {
          ai_providers: {
            select: {
              data: [
                { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
              ],
            }
          },
          system_prompts: {
            select: {
              data: [{
                id: "spt-123",
                prompt_text: "any text",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            },
          },
        }
      }, defaultMockContext);

      await assertRejects(
        () =>
          assemblePlannerPrompt({
            dbClient: client,
            fileManager,
            job: legacyMockPlannerJob, // This mock contains the deprecated step_info
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            gatherContext: gatherContextFn,
            render: renderFn,
          }),
        Error,
        "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload. This field is deprecated.",
      );

      teardown();
    },
  );

  await t.step("should pass branch_key and parallel_group from recipe_step to fileManager", async () => {
    const recipeWithKeys: DialecticRecipeStep = {
      ...mockRecipeStep,
      branch_key: "test-branch-key",
      parallel_group: 1,
    };

    const stageWithKeys: StageContext = {
      ...defaultStage,
      recipe_step: recipeWithKeys,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-456",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    const uploadSpy = fileManager.uploadAndRegisterFile;

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithKeys,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      assertSpyCalls(uploadSpy, 1);
      const uploadContext = uploadSpy.calls[0].args[0];
      assertEquals(uploadContext.pathContext.branchKey, recipeWithKeys.branch_key);
      assertEquals(
        uploadContext.pathContext.parallelGroup,
        recipeWithKeys.parallel_group,
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing 'model_id'", async () => {
    const { client, fileManager, gatherContextFn, renderFn } = setup({
      genericMockResults: {
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      }
    }, defaultMockContext);
    if(!isRecord(mockPlannerJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockPlannerJob.payload };
    delete payload.model_id;
    const jobWithMissingModelId: DialecticJobRow = {
        ...mockPlannerJob,
        payload,
    };

    await assertRejects(
      () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: jobWithMissingModelId,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        }),
      Error,
      "PRECONDITION_FAILED: Job payload is missing 'model_id'.",
    );

    teardown();
  });

  await t.step("should include resourceTypeForDb when saving the planner prompt", async () => {
    const mockModelName = "Test Model 7000";
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: mockModelName, provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };
    const { client, fileManager, gatherContextFn, renderFn } = setup(config, defaultMockContext);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-metadata",
      project_id: defaultProject.id,
      file_name: "planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt with metadata",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };
    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    
    if (!isRecord(mockPlannerJob.payload)) {
      throw new Error("Test setup error: mockPlannerJob.payload is not a record.");
    }

    try {
      await         assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      assertSpyCalls(fileManager.uploadAndRegisterFile, 1);
      const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];

      assert('resourceTypeForDb' in uploadContext, "The upload context for a PlannerPrompt must include resourceTypeForDb.");
      
      assertEquals(uploadContext.resourceTypeForDb, "planner_prompt");

    } finally {
      teardown();
    }
  });

  await t.step("should fetch template from storage when prompt_text is null and document_template_id exists", async () => {
    const templateContent = "# Template Content\n\nThis is the actual template.";
    const templateId = "template-uuid-123";
    const storageBucket = "prompt-templates";
    const storagePath = "docs/prompts/thesis/";
    const fileName = "thesis_planner_header_v1.md";
    const fullPath = `${storagePath}${fileName}`;

    // Create a Blob with the template content for the mock storage download
    const templateBlob = new Blob([templateContent], { type: "text/markdown" });

    // Mock system_prompts with null prompt_text and document_template_id
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{
              prompt_text: null,
              document_template_id: templateId,
            }],
            error: null,
          },
        },
        dialectic_document_templates: {
          select: {
            data: [{
              id: templateId,
              storage_bucket: storageBucket,
              storage_path: storagePath,
              file_name: fileName,
            }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
      storageMock: {
        downloadResult: async (bucketId: string, path: string) => {
          assertEquals(bucketId, storageBucket);
          assertEquals(path, fullPath);
          return { data: templateBlob, error: null };
        },
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-storage",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    // Access storage spy before the call so it tracks calls correctly
    const storageBucketApi = mockSupabaseSetup!.spies.storage.from(storageBucket);
    const downloadSpy = storageBucketApi.downloadSpy;

    try {
      await         assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Assert storage download was called with correct parameters via the Supabase client
      assertSpyCalls(downloadSpy, 1);
      assertSpyCall(downloadSpy, 0, {
        args: [fullPath],
      });

      // Assert render was called with downloaded template content, not null or path string
      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const stageArgForRender = renderCallArgs[1];
      assertEquals(
        stageArgForRender.system_prompts!.prompt_text,
        templateContent,
      );

      // Assert database was queried for document_template_id
      const dbSpies = mockSupabaseSetup!.spies.getLatestQueryBuilderSpies(
        "system_prompts",
      )!;
      assertSpyCall(dbSpies.select!, 0, {
        args: ["prompt_text, document_template_id"],
      });

      // Assert dialectic_document_templates was queried
      const templateDbSpies = mockSupabaseSetup!.spies.getLatestQueryBuilderSpies(
        "dialectic_document_templates",
      )!;
      assertSpyCalls(templateDbSpies.select!, 1);
      assertSpyCall(templateDbSpies.eq!, 0, {
        args: ["id", templateId],
      });
    } finally {
      teardown();
    }
  });

  await t.step("should use inline prompt_text when present (backward compatibility)", async () => {
    const inlineTemplateContent = "inline template content";
    
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{
              prompt_text: inlineTemplateContent,
              document_template_id: null,
            }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-inline",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    try {
      await         assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

      // Assert render was called with inline template content
      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const stageArgForRender = renderCallArgs[1];
      assertEquals(
        stageArgForRender.system_prompts!.prompt_text,
        inlineTemplateContent,
      );

      // Assert that no template download occurred (verify no storage.from calls for template bucket)
      // The gatherContext call may use storage, but template-specific storage should not be called
      // We verify backward compatibility by asserting the inline content is used
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when both prompt_text and document_template_id are null", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{
              prompt_text: null,
              document_template_id: null,
            }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

    await assertRejects(
      assembleFn,
      Error,
      "System prompt template is missing both prompt_text and document_template_id",
    );

    teardown();
  });

  await t.step("should throw error when template download fails", async () => {
    const templateId = "template-uuid-123";
    const storageBucket = "prompt-templates";
    const storagePath = "docs/prompts/thesis/";
    const fileName = "thesis_planner_header_v1.md";
    const fullPath = `${storagePath}${fileName}`;
    const downloadError = new Error("File not found");

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{
              prompt_text: null,
              document_template_id: templateId,
            }],
            error: null,
          },
        },
        dialectic_document_templates: {
          select: {
            data: [{
              id: templateId,
              storage_bucket: storageBucket,
              storage_path: storagePath,
              file_name: fileName,
            }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          },
        },
      },
      storageMock: {
        downloadResult: async (bucketId: string, path: string) => {
          assertEquals(bucketId, storageBucket);
          assertEquals(path, fullPath);
          return { data: null, error: downloadError };
        },
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const assembleFn = () =>
        assemblePlannerPrompt({
          dbClient: client,
          fileManager,
          job: mockPlannerJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          projectInitialUserPrompt: defaultProject.initial_user_prompt,
          gatherContext: gatherContextFn,
          render: renderFn,
        });

    await assertRejects(
      assembleFn,
      Error,
      "Failed to download template from storage",
    );

    teardown();
  });

  await t.step("should include context_for_documents in PLAN prompts when recipe step has context_for_documents", async () => {
    const contextForDocuments: ContextForDocument[] = [
      {
        document_key: FileType.business_case,
        content_to_include: {
          field1: "",
          field2: [],
        },
      },
      {
        document_key: FileType.feature_spec,
        content_to_include: {
          features: [{ name: "", stories: [] }],
        },
      },
    ];

    const recipeStepWithContext: DialecticRecipeStep = {
      ...mockRecipeStep,
      outputs_required: {
        context_for_documents: contextForDocuments,
      },
    };

    const stageWithContext: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithContext,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-context",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithContext,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const contextArg = renderCallArgs[2];
      
      assert(isRecord(contextArg), "Context argument must be a record");
      assert('context_for_documents' in contextArg, "Context passed to render must include context_for_documents");
      const contextForDocsValue = contextArg['context_for_documents'];
      assert(isRecord(contextForDocsValue), "context_for_documents must be an object with _instructions and documents");
      assert('documents' in contextForDocsValue, "context_for_documents must have documents property");
      assert('_instructions' in contextForDocsValue, "context_for_documents must have _instructions property");
      assertEquals(contextForDocsValue.documents, contextForDocuments);
    } finally {
      teardown();
    }
  });

  await t.step("should include instructions telling agent to fill in content_to_include objects with alignment values", async () => {
    const contextForDocuments: ContextForDocument[] = [
      {
        document_key: FileType.business_case,
        content_to_include: {
          field1: "",
          field2: [],
        },
      },
    ];

    const recipeStepWithContext: DialecticRecipeStep = {
      ...mockRecipeStep,
      outputs_required: {
        context_for_documents: contextForDocuments,
      },
    };

    const stageWithContext: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithContext,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-instructions",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithContext,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: gatherContextFn,
        render: renderFn,
      });

      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const contextArg = renderCallArgs[2];
      
      assert(isRecord(contextArg), "Context argument must be a record");
      assert('context_for_documents' in contextArg, "Context passed to render must include context_for_documents");
      const contextForDocsValue = contextArg['context_for_documents'];
      assert(isRecord(contextForDocsValue), "context_for_documents must be an object with _instructions and documents");
      assert('_instructions' in contextForDocsValue, "context_for_documents must have _instructions property");
      const instructionsValue = contextForDocsValue['_instructions'];
      assert(typeof instructionsValue === 'string', "_instructions must be a string");
      assert(
        instructionsValue.includes('fill in') ||
        instructionsValue.includes('alignment') ||
        instructionsValue.includes('header_context'),
        "Context passed to render must include instructions telling agent to fill in content_to_include objects with alignment values"
      );
      assert('documents' in contextForDocsValue, "context_for_documents must have documents property");
      assertEquals(contextForDocsValue.documents, contextForDocuments);
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error when recipe_step.outputs_required is missing context_for_documents for PLAN jobs", async () => {
    const recipeStepWithoutContext: DialecticRecipeStep = {
      ...mockRecipeStep,
      outputs_required: {},
    };

    const stageWithoutContext: StageContext = {
      ...defaultStage,
      recipe_step: recipeStepWithoutContext,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const {
      client,
      fileManager,
      gatherContextFn,
      renderFn,
    } = setup(config, defaultMockContext);

    const assembleFn = () =>
      assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithoutContext,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: gatherContextFn,
        render: renderFn,
      });

    await assertRejects(
      assembleFn,
      Error,
      "PRECONDITION_FAILED: PLAN job requires context_for_documents in recipe_step.outputs_required",
    );

    teardown();
  });

  await t.step("should create dot-notation template variables from sourceDocuments with header and documentKey", async () => {
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "doc-biz-case",
        type: "document",
        content: "# Business Case\n\nThis proposal addresses market need X.",
        metadata: {
          displayName: "Thesis Business Case",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.business_case,
        },
      },
    ];

    const mockContextWithDocs: DynamicContextVariables = {
      ...defaultMockContext,
      sourceDocuments: mockSourceDocuments,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const { client, fileManager, renderFn } = setup(config, mockContextWithDocs);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-dot-notation",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    const mockGatherFn = spy(async () => mockContextWithDocs);

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: mockGatherFn,
        render: renderFn,
      });

      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const contextArg = renderCallArgs[2];

      assert(isRecord(contextArg), "Context argument must be a record");
      assert(
        'thesis_documents.business_case' in contextArg,
        "Context must include dot-notation key 'thesis_documents.business_case'",
      );
      const bizCaseValue = contextArg['thesis_documents.business_case'];
      assert(typeof bizCaseValue === 'string', "Dot-notation variable must be a string");
      assert(
        bizCaseValue.includes("market need X"),
        "Dot-notation variable must contain the document content",
      );
    } finally {
      teardown();
    }
  });

  await t.step("should create multiple dot-notation variables for different documentKeys under same header", async () => {
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "doc-1",
        type: "document",
        content: "Business case content",
        metadata: {
          displayName: "Thesis Business Case",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.business_case,
        },
      },
      {
        id: "doc-2",
        type: "document",
        content: "Feature spec content",
        metadata: {
          displayName: "Thesis Feature Spec",
          header: "Thesis Documents",
          modelName: "gemini-1.5-pro",
          documentKey: FileType.feature_spec,
        },
      },
      {
        id: "doc-3",
        type: "document",
        content: "Technical approach content",
        metadata: {
          displayName: "Thesis Technical Approach",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.technical_approach,
        },
      },
      {
        id: "doc-4",
        type: "document",
        content: "Success metrics content",
        metadata: {
          displayName: "Thesis Success Metrics",
          header: "Thesis Documents",
          modelName: "gemini-1.5-pro",
          documentKey: FileType.success_metrics,
        },
      },
    ];

    const mockContextWithDocs: DynamicContextVariables = {
      ...defaultMockContext,
      sourceDocuments: mockSourceDocuments,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const { client, fileManager, renderFn } = setup(config, mockContextWithDocs);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-multi-docs",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    const mockGatherFn = spy(async () => mockContextWithDocs);

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: mockGatherFn,
        render: renderFn,
      });

      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const contextArg = renderCallArgs[2];

      assert(isRecord(contextArg), "Context argument must be a record");
      
      assert(
        'thesis_documents.business_case' in contextArg,
        "Context must include 'thesis_documents.business_case'",
      );
      assert(
        'thesis_documents.feature_spec' in contextArg,
        "Context must include 'thesis_documents.feature_spec'",
      );
      assert(
        'thesis_documents.technical_approach' in contextArg,
        "Context must include 'thesis_documents.technical_approach'",
      );
      assert(
        'thesis_documents.success_metrics' in contextArg,
        "Context must include 'thesis_documents.success_metrics'",
      );

      assertEquals(contextArg['thesis_documents.business_case'], "Business case content");
      assertEquals(contextArg['thesis_documents.feature_spec'], "Feature spec content");
      assertEquals(contextArg['thesis_documents.technical_approach'], "Technical approach content");
      assertEquals(contextArg['thesis_documents.success_metrics'], "Success metrics content");
    } finally {
      teardown();
    }
  });

  await t.step("should create section-level truthy variable when sourceDocuments exist with that header", async () => {
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "feedback-1",
        type: "feedback",
        content: "Feedback on the business case",
        metadata: {
          displayName: "Thesis Feedback",
          header: "Thesis Feedback",
          documentKey: FileType.business_case,
        },
      },
    ];

    const mockContextWithDocs: DynamicContextVariables = {
      ...defaultMockContext,
      sourceDocuments: mockSourceDocuments,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const { client, fileManager, renderFn } = setup(config, mockContextWithDocs);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-truthy",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    const mockGatherFn = spy(async () => mockContextWithDocs);

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: mockGatherFn,
        render: renderFn,
      });

      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const contextArg = renderCallArgs[2];

      assert(isRecord(contextArg), "Context argument must be a record");
      assert(
        'thesis_feedback' in contextArg,
        "Context must include section-level truthy variable 'thesis_feedback'",
      );
      const truthyValue = contextArg['thesis_feedback'];
      assert(
        truthyValue !== null && truthyValue !== undefined && truthyValue !== '',
        "Section-level variable must be truthy to enable conditional sections",
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw error when documentKey is undefined", async () => {
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "doc-no-key",
        type: "document",
        content: "Content without a specific document key",
        metadata: {
          displayName: "Generic Document",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: undefined,
        },
      },
    ];

    const mockContextWithDocs: DynamicContextVariables = {
      ...defaultMockContext,
      sourceDocuments: mockSourceDocuments,
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const { client, fileManager, renderFn } = setup(config, mockContextWithDocs);
    const mockGatherFn = spy(async () => mockContextWithDocs);

    try {
      await assertRejects(
        async () => {
          await assemblePlannerPrompt({
            dbClient: client,
            fileManager,
            job: mockPlannerJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            projectInitialUserPrompt: defaultProject.initial_user_prompt,
            gatherContext: mockGatherFn,
            render: renderFn,
          });
        },
        Error,
        "missing required metadata.documentKey",
        "assemblePlannerPrompt must throw error when sourceDocument has header but no documentKey",
      );
    } finally {
      teardown();
    }
  });

  await t.step("should not create dot-notation keys when sourceDocuments is empty", async () => {
    const mockContextNoDocs: DynamicContextVariables = {
      ...defaultMockContext,
      sourceDocuments: [],
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: { data: [{ prompt_text: plannerPromptText, document_template_id: null }], error: null },
        },
        ai_providers: {
          select: {
            data: [
              { id: "model-claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", slug: "claude-3-opus" },
            ],
          }
        }
      },
    };

    const { client, fileManager, renderFn } = setup(config, mockContextNoDocs);

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-id-empty",
      project_id: defaultProject.id,
      file_name: "claude-3-opus_1_GeneratePlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    const mockGatherFn = spy(async () => mockContextNoDocs);

    try {
      await assemblePlannerPrompt({
        dbClient: client,
        fileManager,
        job: mockPlannerJob,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        projectInitialUserPrompt: defaultProject.initial_user_prompt,
        gatherContext: mockGatherFn,
        render: renderFn,
      });

      assertSpyCalls(renderFn, 1);
      const renderCallArgs = renderFn.calls[0].args;
      const contextArg = renderCallArgs[2];

      assert(isRecord(contextArg), "Context argument must be a record");
      
      // When sourceDocuments is empty, no dot-notation keys should be created
      const keys = Object.keys(contextArg);
      const dotNotationKeys = keys.filter(key => key.includes('.'));
      assertEquals(
        dotNotationKeys.length,
        0,
        "No dot-notation keys should exist when sourceDocuments is empty",
      );

      // Raw sourceDocuments array should not be passed to render
      assert(
        !('sourceDocuments' in contextArg) || !Array.isArray(contextArg['sourceDocuments']),
        "Raw sourceDocuments array should not be passed to render",
      );
    } finally {
      teardown();
    }
  });
});
