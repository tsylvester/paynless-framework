import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from "npm:@supabase/supabase-js@^2";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
import {
  type DialecticStage,
  type DialecticStageRecipeStep,
  type InputRule,
  type SubmitStageResponsesPayload,
  type DialecticSession,
  type SelectedModels,
  SubmitStageResponsesDependencies,
} from "./dialectic.interface.ts";
import { createMockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { Database, Tables, TablesUpdate } from "../types_db.ts";
import { submitStageResponses } from "./submitStageResponses.ts";
import { logger } from "../_shared/logger.ts";
import {
  UploadContext,
  FileManagerResponse,
  FileType,
} from "../_shared/types/file_manager.types.ts";

Deno.test("submitStageResponses", async (t) => {
  const testUserId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const testProcessTemplateId = crypto.randomUUID();
  const testThesisStageId = crypto.randomUUID();
  const testAntithesisStageId = crypto.randomUUID();
  const testParalysisStageId = crypto.randomUUID();

  const mockUser: User = {
    id: testUserId,
    app_metadata: {},
    user_metadata: {},
    aud: "test-aud",
    created_at: new Date().toISOString(),
  };

  const mockThesisStage: DialecticStage = {
    id: testThesisStageId,
    slug: "thesis",
    display_name: "Thesis",
    default_system_prompt_id: "prompt-id-thesis",
    created_at: new Date().toISOString(),
    description: null,
    expected_output_template_ids: [],
    active_recipe_instance_id: null,
    recipe_template_id: null,
  };

  const mockAntithesisStage: DialecticStage = {
    id: testAntithesisStageId,
    slug: "antithesis",
    display_name: "Antithesis",
    default_system_prompt_id: "prompt-id-antithesis",
    created_at: new Date().toISOString(),
    description: null,
    expected_output_template_ids: [],
    active_recipe_instance_id: null,
    recipe_template_id: null,
  };

  const mockParalysisStage: DialecticStage = {
    id: testParalysisStageId,
    slug: "paralysis",
    display_name: "Paralysis",
    default_system_prompt_id: "prompt-id-paralysis",
    created_at: new Date().toISOString(),
    description: null,
    expected_output_template_ids: [],
    active_recipe_instance_id: null,
    recipe_template_id: null,
  };

  const defaultSelectedModels: SelectedModels[] = [
    { id: "test-model-id", displayName: "Test Model" },
  ];

  const testSelectedModelIds: string[] = defaultSelectedModels.map((m) => m.id);

  const createMockSession = (
    stage: DialecticStage,
    userId: string = testUserId,
    iterationCount: number | undefined = undefined,
    sessionStatus: string | null = null,
  ): Partial<DialecticSession> & {
    stage: DialecticStage;
    project: {
      id: string;
      user_id: string;
      process_template_id: string;
      selected_domain_id: string;
      dialectic_domains: { name: string };
      initial_prompt_resource_id: string;
    };
    selected_models: SelectedModels[];
    selected_model_ids: string[];
    iteration_count?: number;
    status: string | null;
  } => ({
    id: testSessionId,
    project_id: testProjectId,
    current_stage_id: stage.id,
    stage: stage,
    project: {
      id: testProjectId,
      user_id: userId,
      process_template_id: testProcessTemplateId,
      selected_domain_id: "test-domain-id",
      dialectic_domains: { name: "test-domain" },
      initial_prompt_resource_id: "test-resource-id",
    },
    selected_models: defaultSelectedModels,
    selected_model_ids: testSelectedModelIds,
    status: sessionStatus,
    ...(iterationCount !== undefined && { iteration_count: iterationCount }),
  });

  const fileManagerShouldNotBeCalled = createMockFileManagerService();
  fileManagerShouldNotBeCalled.uploadAndRegisterFile = spy((_context: UploadContext): Promise<FileManagerResponse> => {
    throw new Error(
      "FileManager.uploadAndRegisterFile should not be called in the refactored submitStageResponses function.",
    );
  });

  const mockDependencies: SubmitStageResponsesDependencies = {
    logger,
    fileManager: fileManagerShouldNotBeCalled,
    downloadFromStorage: spy(),
    promptAssembler: {
      assemble: spy(),
      assembleSeedPrompt: spy(),
      assemblePlannerPrompt: spy(),
      assembleTurnPrompt: spy(),
      assembleContinuationPrompt: spy(),
    },
    indexingService: { indexDocument: spy() },
    embeddingClient: { getEmbedding: spy() },
  };

  await t.step("2.1 Fails if the user is not authenticated", async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: [],
    };
    const mockSupabase = createMockSupabaseClient(testUserId, {});
    const { status, error } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as unknown as SupabaseClient<Database>,
      null, // No user
      mockDependencies,
    );
    assertEquals(status, 401);
    assertExists(error);
    assertEquals(error.message, "User not authenticated.");
  });

  await t.step("2.2 Fails if the user does not own the project", async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: [],
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [createMockSession(mockThesisStage, otherUserId)] },
        },
      },
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);

    const { status, error } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as unknown as SupabaseClient<Database>,
      mockUser,
      mockDependencies,
    );
    assertEquals(status, 403);
    assertExists(error);
    assertEquals(error.message, "Unauthorized to submit to this project.");
  });

  await t.step(
    "Success: Transitions to the next stage and does NOT save feedback",
    async () => {
      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "thesis",
        currentIterationNumber: 1,
        responses: [],
      };

      const fileManagerAllowsUpload = createMockFileManagerService();
      fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context) =>
        Promise.resolve({
          record: {
            id: "new-resource-id",
            session_id: testSessionId,
            user_id: testUserId,
            stage: "antithesis",
            iteration_number: 1,
            model_id: "test-model-id",
            model_name: "Test Model",
            prompt_template_id_used: "test-prompt-template-id",
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: "seed_prompt",
            file_name: "seed_prompt.md",
            storage_bucket: "test-bucket",
            storage_path: "test/path",
            size_bytes: 123,
            mime_type: "text/markdown",
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
          },
          error: null,
        })
      );
      const uploadAndRegisterFileSpy = fileManagerAllowsUpload.uploadAndRegisterFile;

      const mockDependenciesWithStorage = {
        ...mockDependencies,
        fileManager: fileManagerAllowsUpload,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
      };

      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: { data: [createMockSession(mockThesisStage)] },
            update: {
              data: [{
                id: testSessionId,
                status: "pending_antithesis",
                selected_model_ids: testSelectedModelIds,
              }],
            },
          },
          dialectic_project_resources: {
            select: {
              data: [{
                storage_bucket: "test-bucket",
                storage_path: "test-path",
                file_name: "test-file.txt",
              }],
            },
          },
          system_prompts: {
            select: {
              data: [
                {
                  id: "prompt-id-antithesis",
                  prompt_text: "Test antithesis prompt",
                },
              ],
            },
          },
          domain_specific_prompt_overlays: {
            select: {
              data: [{ overlay_values: { test: "overlay" } }],
            },
          },
          dialectic_stage_transitions: {
            select: {
              data: [
                {
                  source_stage_id: testThesisStageId,
                  target_stage: mockAntithesisStage,
                },
              ],
            },
          },
          // Mock for precondition check - artifact exists
          dialectic_project_documents: {
            select: { data: [{ id: "required-artifact-id" }] },
          },
        },
      };
      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
      const { status, error, data } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependenciesWithStorage,
      );

      assertEquals(status, 200);
      assertEquals(error, undefined);
      assertExists(data);
      assertEquals(data.updatedSession?.status, "pending_antithesis");

      const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
        "dialectic_sessions",
      )?.update;
      assertExists(updateSpy);
      const updateCall = updateSpy.calls[0];
      assertExists(updateCall);
      assertEquals(updateCall.args[0].current_stage_id, testAntithesisStageId);
      assertEquals(
        updateCall.args[0].status,
        `pending_${mockAntithesisStage.slug}`,
      );

      // Seed prompts are created once at session initiation (thesis stage) and reused across all stages.
      // submitStageResponses should NOT create new seed prompts during stage transitions.
      assertEquals(
        uploadAndRegisterFileSpy.calls.length,
        0,
        "submitStageResponses should NOT save seed prompts - they are created once at thesis stage",
      );
    },
  );

  await t.step(
    "Failure: Does NOT transition if preconditions for next stage are not met",
    async () => {
      const failureInputRules: InputRule[] = [
        { type: "document", document_key: FileType.business_case, slug: "thesis" },
      ];
      const failureRecipeStepRow: Pick<DialecticStageRecipeStep, "inputs_required"> = {
        inputs_required: failureInputRules,
      };

      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "thesis",
        currentIterationNumber: 1,
        responses: [],
      };
      const mockDependenciesWithStorage = {
        ...mockDependencies,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
      };
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: { data: [createMockSession(mockThesisStage)] },
          },
          dialectic_stage_recipe_steps: {
            select: { data: [failureRecipeStepRow] },
          },
          dialectic_project_resources: {
            select: {
              data: [], // ARTIFACT DOES NOT EXIST
            },
          },
          system_prompts: {
            select: {
              data: [
                {
                  id: "prompt-id-antithesis",
                  prompt_text: "Test antithesis prompt",
                },
              ],
            },
          },
          domain_specific_prompt_overlays: {
            select: {
              data: [{ overlay_values: { test: "overlay" } }],
            },
          },
          dialectic_stage_transitions: {
            select: {
              data: [
                {
                  source_stage_id: testThesisStageId,
                  target_stage: mockAntithesisStage,
                },
              ],
            },
          },
          // Mock for precondition check - ARTIFACT DOES NOT EXIST
          dialectic_project_documents: {
            select: { data: [] },
          },
        },
      };
      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
      const { status, error } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependenciesWithStorage,
      );

      assertEquals(status, 412); // 412 Precondition Failed
      assertExists(error);
      assertEquals(
        error.message,
        "Preconditions for the next stage are not met.",
      );
    },
  );

  await t.step(
    "Success: Finalizes the session when it is the last stage",
    async () => {
      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "paralysis",
        currentIterationNumber: 1,
        responses: [],
      };
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: { data: [createMockSession(mockParalysisStage)] },
            update: {
              data: [{
                id: testSessionId,
                status: "iteration_complete_pending_review",
                selected_model_ids: testSelectedModelIds,
              }],
            },
          },
          dialectic_stage_transitions: {
            select: { data: [] }, // No next stage
          },
        },
      };
      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
      const { status, error, data } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependencies,
      );

      assertEquals(status, 200);
      assertEquals(error, undefined);
      assertExists(data);
      assertEquals(
        data.updatedSession?.status,
        "iteration_complete_pending_review",
      );
      assertEquals(
        data.message,
        "Stage responses submitted. Current stage is terminal.",
      );
    },
  );

  await t.step("Validation should use column-based predicates, not JSON descriptors",
    async () => {
      const testRecipeInstanceId = crypto.randomUUID();
      const testRequiredDocumentKey: FileType = FileType.feature_spec;
      const testResourceId = crypto.randomUUID();

      const mockAntithesisWithActiveRecipe: DialecticStage = {
        ...mockAntithesisStage,
        active_recipe_instance_id: testRecipeInstanceId,
      };

      const validationInputRules: InputRule[] = [
        {
          type: "document",
          document_key: testRequiredDocumentKey,
          slug: "thesis",
          required: true,
        },
      ];
      const mockRecipeStep: Pick<DialecticStageRecipeStep, "instance_id" | "inputs_required"> = {
        instance_id: testRecipeInstanceId,
        inputs_required: validationInputRules,
      };

      const mockResource: Tables<"dialectic_project_resources"> = {
        id: testResourceId,
        project_id: testProjectId,
        resource_type: "rendered_document",
        session_id: testSessionId,
        stage_slug: "thesis",
        iteration_number: 1,
        file_name: `${testRequiredDocumentKey}.md`,
        source_contribution_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testUserId,
        storage_bucket: "test-bucket",
        storage_path: "test-path",
        mime_type: "text/markdown",
        size_bytes: 1,
        resource_description: null,
      };

      const mockInitialPromptResource: Tables<"dialectic_project_resources"> = {
        id: "test-resource-id",
        project_id: testProjectId,
        storage_bucket: "test-bucket",
        storage_path: "test-path",
        file_name: "test-file.txt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testUserId,
        mime_type: "text/plain",
        size_bytes: 0,
        resource_type: "initial_user_prompt",
        session_id: null,
        stage_slug: null,
        iteration_number: null,
        source_contribution_id: null,
        resource_description: null,
      };

      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "thesis",
        currentIterationNumber: 1,
        responses: [],
      };

      const mockDependenciesWithStorage = {
        ...mockDependencies,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
      };

      const validationSeedPromptRecord: Tables<"dialectic_project_resources"> = {
        id: "new-seed-prompt-resource-id",
        project_id: testProjectId,
        user_id: testUserId,
        file_name: "seed_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "test/path/seed_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: { type: "SeedPrompt" },
        resource_type: "seed_prompt",
        session_id: testSessionId,
        stage_slug: "antithesis",
        iteration_number: 1,
        source_contribution_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const fileManagerAllowsUpload = createMockFileManagerService();
      fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context): Promise<FileManagerResponse> =>
        Promise.resolve({
          record: validationSeedPromptRecord,
          error: null,
        })
      );

      const mockDependenciesWithFileManager = {
        ...mockDependenciesWithStorage,
        fileManager: fileManagerAllowsUpload,
      };

      const validationSessionUpdate: TablesUpdate<"dialectic_sessions"> = {
        id: testSessionId,
        status: "pending_antithesis",
        selected_model_ids: testSelectedModelIds,
      };

      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: { data: [createMockSession(mockThesisStage, testUserId, 1)] },
            update: {
              data: [validationSessionUpdate],
            },
          },
          dialectic_stage_recipe_steps: {
            select: {
              data: [mockRecipeStep],
            },
          },
          dialectic_project_resources: {
            select: async (state) => {
              const idFilter = state.filters.find(
                (f) => f.column === "id" && f.type === "eq"
              );
              
              if (idFilter && idFilter.value === "test-resource-id") {
                return {
                  data: [mockInitialPromptResource],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: "OK",
                };
              }
              
              const resourceTypeFilter = state.filters.find(
                (f) => f.column === "resource_type" && f.type === "eq" && f.value === "rendered_document"
              );
              
              if (resourceTypeFilter) {
                return {
                  data: [mockResource],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: "OK",
                };
              }
              
              return {
                data: [],
                error: null,
                count: 0,
                status: 200,
                statusText: "OK",
              };
            },
          },
          system_prompts: {
            select: {
              data: [
                {
                  id: "prompt-id-antithesis",
                  prompt_text: "Test antithesis prompt",
                },
              ],
            },
          },
          domain_specific_prompt_overlays: {
            select: {
              data: [{ overlay_values: { test: "overlay" } }],
            },
          },
          dialectic_stage_transitions: {
            select: {
              data: [
                {
                  source_stage_id: testThesisStageId,
                  target_stage: mockAntithesisWithActiveRecipe,
                },
              ],
            },
          },
        },
      };

      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);

      const { status } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependenciesWithFileManager,
      );

      const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
        "dialectic_project_resources",
        "eq",
      );
      assertExists(eqHistory, "eq history should exist for dialectic_project_resources");
      assert(eqHistory.callCount > 0, "eq should have been called at least once");

      const calls = eqHistory.callsArgs;
      const hasFilter = (column: string, value: unknown): boolean =>
        calls.some((args) =>
          Array.isArray(args) &&
          typeof args[0] === 'string' &&
          args[0] === column &&
          args[1] === value
        );

      assert(
        hasFilter("resource_type", "rendered_document"),
        "Validation should filter by resource_type column, not JSON descriptor",
      );

      assert(
        hasFilter("session_id", testSessionId),
        "Validation should filter by session_id column when session context is available",
      );

      assert(
        hasFilter("stage_slug", "thesis"),
        "Precondition must filter by stage_slug from the input rule for that document (thesis), not the current stage",
      );

      assert(
        hasFilter("iteration_number", 1),
        "Validation should filter by iteration_number column when iteration context is available",
      );

      const hasResourceDescriptionFilter = calls.some((args) =>
        Array.isArray(args) &&
        typeof args[0] === 'string' &&
        args[0] === "resource_description"
      );

      assert(
        !hasResourceDescriptionFilter,
        "Validation should NOT use resource_description JSON path; should use column-based predicates instead",
      );

      assertEquals(status, 200, "Function should succeed when resource exists with column metadata");
    },
  );

  await t.step(
    "Precondition uses input rule slug when locating required document (not current stage slug)",
    async () => {
      const testRecipeInstanceId = crypto.randomUUID();
      const testResourceId = crypto.randomUUID();
      const testSynthesisStageId = crypto.randomUUID();

      const mockSynthesisStage: DialecticStage = {
        id: testSynthesisStageId,
        slug: "synthesis",
        display_name: "Synthesis",
        default_system_prompt_id: "prompt-id-synthesis",
        created_at: new Date().toISOString(),
        description: null,
        expected_output_template_ids: [],
        active_recipe_instance_id: testRecipeInstanceId,
        recipe_template_id: null,
      };

      const preconditionInputRules: InputRule[] = [
        {
          type: "document",
          document_key: FileType.feature_spec,
          slug: "thesis",
          required: true,
        },
      ];
      const mockRecipeStep: Pick<DialecticStageRecipeStep, "instance_id" | "inputs_required"> = {
        instance_id: testRecipeInstanceId,
        inputs_required: preconditionInputRules,
      };

      const thesisResource: Tables<"dialectic_project_resources"> = {
        id: testResourceId,
        project_id: testProjectId,
        resource_type: "rendered_document",
        session_id: testSessionId,
        stage_slug: "thesis",
        iteration_number: 1,
        file_name: "feature_spec.md",
        source_contribution_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testUserId,
        storage_bucket: "test-bucket",
        storage_path: "test-path",
        mime_type: "text/markdown",
        size_bytes: 1,
        resource_description: null,
      };

      const preconditionInitialPromptResource: Tables<"dialectic_project_resources"> = {
        id: "test-resource-id",
        project_id: testProjectId,
        storage_bucket: "test-bucket",
        storage_path: "test-path",
        file_name: "test-file.txt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testUserId,
        mime_type: "text/plain",
        size_bytes: 0,
        resource_type: "initial_user_prompt",
        session_id: null,
        stage_slug: null,
        iteration_number: null,
        source_contribution_id: null,
        resource_description: null,
      };

      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "antithesis",
        currentIterationNumber: 1,
        responses: [],
      };

      const preconditionSeedPromptRecord: Tables<"dialectic_project_resources"> = {
        id: "new-seed-prompt-resource-id",
        project_id: testProjectId,
        user_id: testUserId,
        file_name: "seed_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "test/path/seed_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: { type: "SeedPrompt" },
        resource_type: "seed_prompt",
        session_id: testSessionId,
        stage_slug: "synthesis",
        iteration_number: 1,
        source_contribution_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const fileManagerAllowsUpload = createMockFileManagerService();
      fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context): Promise<FileManagerResponse> =>
        Promise.resolve({
          record: preconditionSeedPromptRecord,
          error: null,
        })
      );

      const mockDependenciesWithFileManager = {
        ...mockDependencies,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
        fileManager: fileManagerAllowsUpload,
      };

      const preconditionSessionUpdate: TablesUpdate<"dialectic_sessions"> = {
        id: testSessionId,
        status: "pending_synthesis",
        selected_model_ids: testSelectedModelIds,
      };

      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: { data: [createMockSession(mockAntithesisStage, testUserId, 1)] },
            update: {
              data: [preconditionSessionUpdate],
            },
          },
          dialectic_stage_recipe_steps: {
            select: { data: [mockRecipeStep] },
          },
          dialectic_project_resources: {
            select: async (state: { filters: { column?: string; value?: unknown; type: string }[] }) => {
              const idFilter = state.filters.find(
                (f) => f.column === "id" && f.type === "eq"
              );
              if (idFilter && idFilter.value === "test-resource-id") {
                return {
                  data: [preconditionInitialPromptResource],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: "OK",
                };
              }
              const resourceTypeFilter = state.filters.find(
                (f) => f.column === "resource_type" && f.type === "eq" && f.value === "rendered_document"
              );
              if (!resourceTypeFilter) {
                return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
              }
              const stageSlugFilter = state.filters.find(
                (f) => f.column === "stage_slug" && f.type === "eq"
              );
              if (stageSlugFilter && stageSlugFilter.value === "thesis") {
                return {
                  data: [thesisResource],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: "OK",
                };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
            },
          },
          system_prompts: {
            select: {
              data: [{ id: "prompt-id-synthesis", prompt_text: "Test synthesis prompt" }],
            },
          },
          domain_specific_prompt_overlays: {
            select: { data: [{ overlay_values: { test: "overlay" } }] },
          },
          dialectic_stage_transitions: {
            select: {
              data: [{
                source_stage_id: testAntithesisStageId,
                target_stage: mockSynthesisStage,
              }],
            },
          },
        },
      };

      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);

      const { status } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependenciesWithFileManager,
      );

      const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
        "dialectic_project_resources",
        "eq",
      );
      assertExists(eqHistory, "eq history should exist for dialectic_project_resources");
      const calls = eqHistory.callsArgs;
      const hasFilter = (column: string, value: unknown): boolean =>
        calls.some((args) =>
          Array.isArray(args) &&
          typeof args[0] === "string" &&
          args[0] === column &&
          args[1] === value
        );

      assert(
        hasFilter("stage_slug", "thesis"),
        "Precondition must use the input rule slug (thesis) for the required document, not the current stage (antithesis)",
      );
      assert(
        !hasFilter("stage_slug", "antithesis"),
        "Precondition must not filter by current stage slug when locating a document from another stage",
      );
      assertEquals(status, 200, "Function should succeed when document exists in the stage specified by the input rule");
    },
  );

  await t.step(
    "Accepts session with status thesis_completed and advances",
    async () => {
      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "thesis",
        currentIterationNumber: 1,
        responses: [],
      };
      const fileManagerAllowsUpload = createMockFileManagerService();
      fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context) =>
        Promise.resolve({
          record: {
            id: "new-resource-id",
            session_id: testSessionId,
            user_id: testUserId,
            stage: "antithesis",
            iteration_number: 1,
            model_id: "test-model-id",
            model_name: "Test Model",
            prompt_template_id_used: "test-prompt-template-id",
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: "seed_prompt",
            file_name: "seed_prompt.md",
            storage_bucket: "test-bucket",
            storage_path: "test/path",
            size_bytes: 123,
            mime_type: "text/markdown",
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
          },
          error: null,
        })
      );
      const mockDependenciesWithStorage: SubmitStageResponsesDependencies = {
        ...mockDependencies,
        fileManager: fileManagerAllowsUpload,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
      };
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: {
              data: [
                createMockSession(mockThesisStage, testUserId, 1, "thesis_completed"),
              ],
            },
            update: {
              data: [{
                id: testSessionId,
                status: "pending_antithesis",
                selected_model_ids: testSelectedModelIds,
              }],
            },
          },
          dialectic_project_resources: {
            select: {
              data: [{
                storage_bucket: "test-bucket",
                storage_path: "test-path",
                file_name: "test-file.txt",
              }],
            },
          },
          system_prompts: {
            select: {
              data: [{
                id: "prompt-id-antithesis",
                prompt_text: "Test antithesis prompt",
              }],
            },
          },
          domain_specific_prompt_overlays: {
            select: { data: [{ overlay_values: { test: "overlay" } }] },
          },
          dialectic_stage_transitions: {
            select: {
              data: [{
                source_stage_id: testThesisStageId,
                target_stage: mockAntithesisStage,
              }],
            },
          },
          dialectic_project_documents: {
            select: { data: [{ id: "required-artifact-id" }] },
          },
        },
      };
      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
      const { status, error, data } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependenciesWithStorage,
      );
      assertEquals(status, 200);
      assertEquals(error, undefined);
      assertExists(data);
      assertEquals(data.updatedSession?.status, "pending_antithesis");
      const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
        "dialectic_sessions",
      )?.update;
      assertExists(updateSpy);
      assertEquals(updateSpy.calls[0].args[0].current_stage_id, testAntithesisStageId);
    },
  );

  await t.step(
    "Accepts session with status running_thesis and advances when at target stage",
    async () => {
      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "thesis",
        currentIterationNumber: 1,
        responses: [],
      };
      const fileManagerAllowsUpload = createMockFileManagerService();
      fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context) =>
        Promise.resolve({
          record: {
            id: "new-resource-id",
            session_id: testSessionId,
            user_id: testUserId,
            stage: "antithesis",
            iteration_number: 1,
            model_id: "test-model-id",
            model_name: "Test Model",
            prompt_template_id_used: "test-prompt-template-id",
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: "seed_prompt",
            file_name: "seed_prompt.md",
            storage_bucket: "test-bucket",
            storage_path: "test/path",
            size_bytes: 123,
            mime_type: "text/markdown",
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
          },
          error: null,
        })
      );
      const mockDependenciesWithStorage: SubmitStageResponsesDependencies = {
        ...mockDependencies,
        fileManager: fileManagerAllowsUpload,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
      };
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: {
              data: [
                createMockSession(mockThesisStage, testUserId, 1, "running_thesis"),
              ],
            },
            update: {
              data: [{
                id: testSessionId,
                status: "pending_antithesis",
                selected_model_ids: testSelectedModelIds,
              }],
            },
          },
          dialectic_project_resources: {
            select: {
              data: [{
                storage_bucket: "test-bucket",
                storage_path: "test-path",
                file_name: "test-file.txt",
              }],
            },
          },
          system_prompts: {
            select: {
              data: [{
                id: "prompt-id-antithesis",
                prompt_text: "Test antithesis prompt",
              }],
            },
          },
          domain_specific_prompt_overlays: {
            select: { data: [{ overlay_values: { test: "overlay" } }] },
          },
          dialectic_stage_transitions: {
            select: {
              data: [{
                source_stage_id: testThesisStageId,
                target_stage: mockAntithesisStage,
              }],
            },
          },
          dialectic_project_documents: {
            select: { data: [{ id: "required-artifact-id" }] },
          },
        },
      };
      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
      const { status, error, data } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependenciesWithStorage,
      );
      assertEquals(status, 200);
      assertEquals(error, undefined);
      assertExists(data);
      assertEquals(data.updatedSession?.status, "pending_antithesis");
      const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
        "dialectic_sessions",
      )?.update;
      assertExists(updateSpy);
      assertEquals(updateSpy.calls[0].args[0].current_stage_id, testAntithesisStageId);
    },
  );

  await t.step(
    "Returns success without advancing when session already past target stage",
    async () => {
      const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "thesis",
        currentIterationNumber: 1,
        responses: [],
      };
      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: {
              data: [
                createMockSession(
                  mockAntithesisStage,
                  testUserId,
                  1,
                  "antithesis_completed",
                ),
              ],
            },
          },
        },
      };
      const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
      const { status, error, data } = await submitStageResponses(
        mockPayload,
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockUser,
        mockDependencies,
      );
      assertEquals(status, 200);
      assertEquals(error, undefined);
      assertExists(data);
      const updateSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
        "dialectic_sessions",
      )?.update;
      assert(
        updateSpy === undefined || updateSpy.calls.length === 0,
        "dialectic_sessions.update should not be called when session already past target stage",
      );
    },
  );

  await t.step(
    "Precondition: locates each input_rule artifact type on the correct table and returns 412 when missing",
    async (t) => {
      const testRecipeInstanceId = crypto.randomUUID();
      const testSynthesisStageId = crypto.randomUUID();
      const mockSynthesisStage: DialecticStage = {
        id: testSynthesisStageId,
        slug: "synthesis",
        display_name: "Synthesis",
        default_system_prompt_id: "prompt-id-synthesis",
        created_at: new Date().toISOString(),
        description: null,
        expected_output_template_ids: [],
        active_recipe_instance_id: testRecipeInstanceId,
        recipe_template_id: null,
      };

      const basePayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: "antithesis",
        currentIterationNumber: 1,
        responses: [],
      };

      const baseMockDeps = {
        ...mockDependencies,
        downloadFromStorage: spy(() =>
          Promise.resolve({
            data: new TextEncoder().encode("Mock file content").slice().buffer,
            error: null,
          })
        ),
      };

      const baseSession = createMockSession(mockAntithesisStage, testUserId, 1);
      const baseRecipeStep = (
        inputRules: InputRule[]
      ): Pick<DialecticStageRecipeStep, "instance_id" | "inputs_required"> => ({
        instance_id: testRecipeInstanceId,
        inputs_required: inputRules,
      });
      const baseTransitions = {
        select: {
          data: [{
            source_stage_id: testAntithesisStageId,
            target_stage: mockSynthesisStage,
          }],
        },
      };

      await t.step(
        "type document: queries dialectic_project_resources (rendered_document) and returns 412 when missing",
        async () => {
          const inputRules: InputRule[] = [
            { type: "document", document_key: FileType.business_case, slug: "thesis", required: true },
          ];
          const mockDbConfig: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_sessions: { select: { data: [baseSession] } },
              dialectic_stage_recipe_steps: {
                select: { data: [baseRecipeStep(inputRules)] },
              },
              dialectic_project_resources: {
                select: { data: [] },
              },
              dialectic_stage_transitions: baseTransitions,
            },
          };
          const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
          const { status } = await submitStageResponses(
            basePayload,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockUser,
            baseMockDeps,
          );
          assertEquals(status, 412);
          const fromCalls = mockSupabase.spies.fromSpy.calls;
          assert(
            fromCalls.some((c) => c.args[0] === "dialectic_project_resources"),
            "Precondition must query dialectic_project_resources for type document",
          );
          const builders = mockSupabase.spies.getHistoricQueryBuilderSpies(
            "dialectic_project_resources",
            "eq",
          );
          assertExists(builders);
          assert(
            builders.callsArgs.some(
              (args) =>
                Array.isArray(args) &&
                args[0] === "resource_type" &&
                args[1] === "rendered_document"
            ),
            "Precondition must filter by resource_type rendered_document for type document",
          );
        },
      );

      await t.step(
        "type contribution: queries dialectic_contributions and returns 412 when missing",
        async () => {
          const inputRules: InputRule[] = [
            {
              type: "contribution",
              document_key: FileType.business_case_critique,
              slug: "antithesis",
              required: true,
            },
          ];
          const mockDbConfig: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_sessions: { select: { data: [baseSession] } },
              dialectic_stage_recipe_steps: {
                select: { data: [baseRecipeStep(inputRules)] },
              },
              dialectic_project_resources: {
                select: { data: [] },
              },
              dialectic_contributions: {
                select: { data: [] },
              },
              dialectic_stage_transitions: baseTransitions,
            },
          };
          const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
          const { status } = await submitStageResponses(
            basePayload,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockUser,
            baseMockDeps,
          );
          assertEquals(
            status,
            412,
            "Must return 412 when required contribution is missing",
          );
          const fromCalls = mockSupabase.spies.fromSpy.calls;
          assert(
            fromCalls.some((c) => c.args[0] === "dialectic_contributions"),
            "Precondition must query dialectic_contributions for type contribution",
          );
        },
      );

      await t.step(
        "type header_context: queries dialectic_contributions with contribution_type and stage and returns 412 when missing",
        async () => {
          const inputRules: InputRule[] = [
            {
              type: "header_context",
              document_key: FileType.header_context_pairwise,
              slug: "synthesis",
              required: true,
            },
          ];
          const mockDbConfig: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_sessions: { select: { data: [baseSession] } },
              dialectic_stage_recipe_steps: {
                select: { data: [baseRecipeStep(inputRules)] },
              },
              dialectic_project_resources: {
                select: { data: [] },
              },
              dialectic_contributions: {
                select: { data: [] },
              },
              dialectic_stage_transitions: baseTransitions,
            },
          };
          const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
          const { status } = await submitStageResponses(
            basePayload,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockUser,
            baseMockDeps,
          );
          assertEquals(
            status,
            412,
            "Must return 412 when required header_context is missing",
          );
          const fromCalls = mockSupabase.spies.fromSpy.calls;
          assert(
            fromCalls.some((c) => c.args[0] === "dialectic_contributions"),
            "Precondition must query dialectic_contributions for type header_context",
          );
          const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
            "dialectic_contributions",
            "eq",
          );
          assertExists(eqHistory);
          assert(
            eqHistory.callsArgs.some(
              (args) =>
                Array.isArray(args) &&
                args[0] === "contribution_type" &&
                args[1] === "header_context"
            ),
            "Precondition must filter by contribution_type header_context for type header_context",
          );
        },
      );

      await t.step(
        "type feedback: queries dialectic_feedback and returns 412 when missing",
        async () => {
          const inputRules: InputRule[] = [
            {
              type: "feedback",
              document_key: FileType.business_case_critique,
              slug: "antithesis",
              required: true,
            },
          ];
          const mockDbConfig: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_sessions: { select: { data: [baseSession] } },
              dialectic_stage_recipe_steps: {
                select: { data: [baseRecipeStep(inputRules)] },
              },
              dialectic_project_resources: {
                select: { data: [] },
              },
              dialectic_feedback: {
                select: { data: [] },
              },
              dialectic_stage_transitions: baseTransitions,
            },
          };
          const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
          const { status } = await submitStageResponses(
            basePayload,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockUser,
            baseMockDeps,
          );
          assertEquals(
            status,
            412,
            "Must return 412 when required feedback is missing",
          );
          const fromCalls = mockSupabase.spies.fromSpy.calls;
          assert(
            fromCalls.some((c) => c.args[0] === "dialectic_feedback"),
            "Precondition must query dialectic_feedback for type feedback",
          );
        },
      );

      await t.step(
        "type seed_prompt: queries dialectic_project_resources (seed_prompt) and returns 412 when missing",
        async () => {
          const inputRules: InputRule[] = [
            {
              type: "seed_prompt",
              document_key: FileType.SeedPrompt,
              slug: "synthesis",
              required: true,
            },
          ];
          const mockDbConfig: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_sessions: { select: { data: [baseSession] } },
              dialectic_stage_recipe_steps: {
                select: { data: [baseRecipeStep(inputRules)] },
              },
              dialectic_project_resources: {
                select: { data: [] },
              },
              dialectic_stage_transitions: baseTransitions,
            },
          };
          const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
          const { status } = await submitStageResponses(
            basePayload,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockUser,
            baseMockDeps,
          );
          assertEquals(
            status,
            412,
            "Must return 412 when required seed_prompt is missing",
          );
          const fromCalls = mockSupabase.spies.fromSpy.calls;
          assert(
            fromCalls.some((c) => c.args[0] === "dialectic_project_resources"),
            "Precondition must query dialectic_project_resources for type seed_prompt",
          );
          const builders = mockSupabase.spies.getHistoricQueryBuilderSpies(
            "dialectic_project_resources",
            "eq",
          );
          assertExists(builders);
          assert(
            builders.callsArgs.some(
              (args) =>
                Array.isArray(args) &&
                args[0] === "resource_type" &&
                args[1] === "seed_prompt"
            ),
            "Precondition must filter by resource_type seed_prompt for type seed_prompt",
          );
        },
      );

      await t.step(
        "Precondition: optional input (required: false) missing must not cause 412; function must respect required flag",
        async () => {
          const requiredAndOptionalInputRules: InputRule[] = [
            {
              type: "document",
              document_key: FileType.business_case,
              slug: "thesis",
              required: true,
            },
            {
              type: "feedback",
              document_key: FileType.business_case_critique,
              slug: "antithesis",
              required: false,
            },
          ];
          const thesisResourceId = crypto.randomUUID();
          const thesisResource: Tables<"dialectic_project_resources"> = {
            id: thesisResourceId,
            project_id: testProjectId,
            resource_type: "rendered_document",
            session_id: testSessionId,
            stage_slug: "thesis",
            iteration_number: 1,
            file_name: "mock-model-a_0_business_case.md",
            source_contribution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: testUserId,
            storage_bucket: "test-bucket",
            storage_path: "test-path",
            mime_type: "text/markdown",
            size_bytes: 1,
            resource_description: null,
          };
          const preconditionInitialPromptResource: Tables<"dialectic_project_resources"> = {
            id: "test-resource-id",
            project_id: testProjectId,
            storage_bucket: "test-bucket",
            storage_path: "test-path",
            file_name: "test-file.txt",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: testUserId,
            mime_type: "text/plain",
            size_bytes: 0,
            resource_type: "initial_user_prompt",
            session_id: null,
            stage_slug: null,
            iteration_number: null,
            source_contribution_id: null,
            resource_description: null,
          };
          const preconditionSeedPromptRecord: Tables<"dialectic_project_resources"> = {
            id: "new-seed-prompt-resource-id",
            project_id: testProjectId,
            user_id: testUserId,
            file_name: "seed_prompt.md",
            storage_bucket: "test-bucket",
            storage_path: "test/path/seed_prompt.md",
            mime_type: "text/markdown",
            size_bytes: 123,
            resource_description: { type: "SeedPrompt" },
            resource_type: "seed_prompt",
            session_id: testSessionId,
            stage_slug: "synthesis",
            iteration_number: 1,
            source_contribution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const fileManagerAllowsUpload = createMockFileManagerService();
          fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context: UploadContext): Promise<FileManagerResponse> =>
            Promise.resolve({
              record: preconditionSeedPromptRecord,
              error: null,
            })
          );
          const mockDepsWithFileManager = {
            ...baseMockDeps,
            fileManager: fileManagerAllowsUpload,
          };
          const preconditionSessionUpdate: TablesUpdate<"dialectic_sessions"> = {
            id: testSessionId,
            status: "pending_synthesis",
            selected_model_ids: testSelectedModelIds,
          };
          const mockDbConfig: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_sessions: {
                select: { data: [baseSession] },
                update: { data: [preconditionSessionUpdate] },
              },
              dialectic_stage_recipe_steps: {
                select: {
                  data: [{
                    instance_id: testRecipeInstanceId,
                    inputs_required: requiredAndOptionalInputRules,
                  }],
                },
              },
              dialectic_project_resources: {
                select: async (state: { filters: { column?: string; value?: unknown; type: string }[] }) => {
                  const idFilter = state.filters.find(
                    (f) => f.column === "id" && f.type === "eq"
                  );
                  if (idFilter && idFilter.value === "test-resource-id") {
                    return {
                      data: [preconditionInitialPromptResource],
                      error: null,
                      count: 1,
                      status: 200,
                      statusText: "OK",
                    };
                  }
                  const resourceTypeFilter = state.filters.find(
                    (f) => f.column === "resource_type" && f.type === "eq" && f.value === "rendered_document"
                  );
                  if (!resourceTypeFilter) {
                    const seedPromptFilter = state.filters.find(
                      (f) => f.column === "resource_type" && f.type === "eq" && f.value === "seed_prompt"
                    );
                    if (seedPromptFilter) {
                      return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                    }
                    return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                  }
                  const stageSlugFilter = state.filters.find(
                    (f) => f.column === "stage_slug" && f.type === "eq"
                  );
                  if (stageSlugFilter && stageSlugFilter.value === "thesis") {
                    return {
                      data: [thesisResource],
                      error: null,
                      count: 1,
                      status: 200,
                      statusText: "OK",
                    };
                  }
                  return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                },
              },
              dialectic_feedback: {
                select: { data: [] },
              },
              system_prompts: {
                select: {
                  data: [{ id: "prompt-id-synthesis", prompt_text: "Test synthesis prompt" }],
                },
              },
              domain_specific_prompt_overlays: {
                select: { data: [{ overlay_values: { test: "overlay" } }] },
              },
              dialectic_stage_transitions: {
                select: {
                  data: [{
                    source_stage_id: testAntithesisStageId,
                    target_stage: mockSynthesisStage,
                  }],
                },
              },
            },
          };
          const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
          const { status } = await submitStageResponses(
            basePayload,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockUser,
            mockDepsWithFileManager,
          );
          assertEquals(
            status,
            200,
            "Optional input (required: false) missing must not cause 412; function must respect inputs_required.required and allow advancement when only optional artifacts are absent.",
          );
        },
      );
    },
  );
});
