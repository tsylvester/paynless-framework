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
  type SubmitStageResponsesPayload,
  type DialecticSession,
  SubmitStageResponsesDependencies,
} from "./dialectic.interface.ts";
import { createMockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { Database } from "../types_db.ts";
import { submitStageResponses } from "./submitStageResponses.ts";
import { logger } from "../_shared/logger.ts";
import {
  UploadContext,
  FileManagerResponse,
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
    selected_model_ids: ["test-model-id"],
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
        // The presence of this feedback should NOT trigger a file save
        userStageFeedback: { content: "This should not be saved", feedbackType: "test" },
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
              data: [{ id: testSessionId, status: "pending_antithesis" }],
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
    },
  );

  await t.step(
    "Failure: Does NOT transition if preconditions for next stage are not met",
    async () => {
      const mockAntithesisWithInputs = {
        ...mockAntithesisStage,
        // This is a simplified representation of what the logic would check
        inputs_required: [{ type: "document", document_key: "required_doc" }],
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
            select: {
              data: [{
                inputs_required: [{
                  type: "document",
                  document_key: "required_doc",
                }],
              }],
            },
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
                  target_stage: mockAntithesisWithInputs,
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
      const testRequiredDocumentKey = "required_thesis_document";
      const testResourceId = crypto.randomUUID();

      const mockAntithesisWithActiveRecipe: DialecticStage = {
        ...mockAntithesisStage,
        active_recipe_instance_id: testRecipeInstanceId,
      };

      const mockRecipeStep = {
        instance_id: testRecipeInstanceId,
        inputs_required: [{
          type: "document",
          document_key: testRequiredDocumentKey,
        }],
      };

      const mockResource = {
        id: testResourceId,
        project_id: testProjectId,
        resource_type: "rendered_document",
        session_id: testSessionId,
        stage_slug: "thesis",
        iteration_number: 1,
        file_name: `${testRequiredDocumentKey}.md`,
        source_contribution_id: null,
      };

      const mockInitialPromptResource = {
        id: "test-resource-id",
        project_id: testProjectId,
        storage_bucket: "test-bucket",
        storage_path: "test-path",
        file_name: "test-file.txt",
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

      const fileManagerAllowsUpload = createMockFileManagerService();
      fileManagerAllowsUpload.uploadAndRegisterFile = spy((_context) =>
        Promise.resolve({
          record: {
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
          },
          error: null,
        })
      );

      const mockDependenciesWithFileManager = {
        ...mockDependenciesWithStorage,
        fileManager: fileManagerAllowsUpload,
      };

      const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_sessions: {
            select: { data: [createMockSession(mockThesisStage, testUserId, 1)] },
            update: {
              data: [{ id: testSessionId, status: "pending_antithesis" }],
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
        "Validation should filter by stage_slug column when stage context is available",
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
              data: [{ id: testSessionId, status: "pending_antithesis" }],
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
              data: [{ id: testSessionId, status: "pending_antithesis" }],
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
});
