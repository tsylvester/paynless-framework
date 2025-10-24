import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import {
  assembleContinuationPrompt,
  MOCK_CONTINUATION_INSTRUCTION_EXPLICIT,
  MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON,
} from "./assembleContinuationPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssembledPrompt,
  AssembleContinuationPromptDeps,
} from "./prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockFileManagerService } from "../services/file_manager.mock.ts";
import { FileType } from "../types/file_manager.types.ts";
import { FileRecord } from "../types/file_manager.types.ts";
import {
  DialecticJobRow,
  DialecticRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { assertSpyCall } from "jsr:@std/testing@0.225.1/mock";
import { isRecord } from "../utils/type_guards.ts";

Deno.test("assembleContinuationPrompt", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let mockFileManager: ReturnType<typeof createMockFileManagerService>;

  const setup = (config: MockSupabaseDataConfig = {}) => {
    mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    mockFileManager = createMockFileManagerService();
    return {
      client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      fileManager: mockFileManager,
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
    project_name: "Test Project",
    initial_user_prompt: "Initial prompt",
    initial_prompt_resource_id: "res-1",
    selected_domain_id: "domain-1",
    dialectic_domains: { name: "Software Development" },
    process_template_id: "proc-1",
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

  const defaultStage: StageContext = {
    id: "stage-123",
    system_prompts: { prompt_text: "Default prompt" },
    domain_specific_prompt_overlays: [],
    slug: "synthesis",
    display_name: "Synthesis",
    description: "Synthesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: "dsp-123",
    recipe_step: {
      id: "recipe-step-123",
      step_key: "recipe-step-key",
      step_slug: "recipe-step-slug",
      step_name: "Recipe Step",
      job_type: "EXECUTE",
      prompt_type: "Turn",
      granularity_strategy: "all_to_one",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_skipped: false,
      config_override: {},
      object_filter: {},
      output_overrides: {},
      parallel_group: null,
      branch_key: null,
      prompt_template_id: null,
      template_step_id: null,
      execution_order: 1,
      output_type: "RenderedDocument",
      instance_id: "instance-123",
    }, // Not always needed for continuation
    active_recipe_instance_id: null,
    expected_output_template_ids: [],
    recipe_template_id: null,
  };

  const headerContextContent = {
    system_materials: {
      shared_plan: "This is the shared plan.",
      style_guide: "Use formal language.",
    },
  };

  const mockFileRecord: FileRecord = {
    id: "mock-continuation-resource-id",
    project_id: defaultProject.id,
    user_id: defaultProject.user_id,
    file_name: "continuation_prompt.md",
    storage_bucket: "test-bucket",
    storage_path: "path/to/continuation.md",
    mime_type: "text/markdown",
    size_bytes: 100,
    resource_description: "A mock continuation prompt",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    session_id: defaultSession.id,
    stage_slug: defaultStage.slug,
    iteration_number: 1,
    resource_type: "turn_prompt", // This will be asserted per test
    source_contribution_id: null,
    feedback_type: undefined,
    target_contribution_id: null,
  };

  await t.step(
    "Category A: Explicit Continuations (Base Cases - Triggered by ContinueReason)",
    async (t) => {
      // These tests prove the function correctly handles the base cases for planned continuations
      // where the model explicitly signals it was truncated.
  
      await t.step(
        "A.1: TurnPrompt - should handle a base case explicit continuation",
        async () => {
        // 1. Setup:
        //    - Configure a mock 'Turn' job from a model call that returned a ContinueReason.
        //    - The job's payload MUST include a `header_context_resource_id`.
        //    - Mock the storage download to return a valid HeaderContext object containing `system_materials`.
          const mockTurnJob: DialecticJobRow = {
            id: "job-turn-cont",
            job_type: "EXECUTE",
            payload: {
              header_context_resource_id: "header-res-123",
              continuation_reason: "length",
              model_id: "model-123",
              model_slug: "test-model",
            },
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 1,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
            storageMock: {
              downloadResult: () =>
                Promise.resolve({
                  data: new Blob([JSON.stringify(headerContextContent)]),
                  error: null,
                }),
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          const partialContent = "This is the partial markdown content.";

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock 'Turn' job and a partial markdown string.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: partialContent,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
        //    - Verify the storage download was called for the `header_context_resource_id`.
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from("dialectic_project_resources").downloadSpy;
            assertSpyCall(downloadSpy, 0);
            assertEquals(downloadSpy.calls[0].args[0], "header-res-123");

            //    - Verify the final prompt includes the `system_materials`, a generic "please continue" instruction, and the exact partial markdown.
            assert(
              result.promptContent.includes(
                headerContextContent.system_materials.shared_plan,
              ),
            );
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_EXPLICIT));
            assert(result.promptContent.endsWith(partialContent));

            //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext =
              fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
            assert("contributionMetadata" in uploadContext);
            assertEquals(uploadContext.pathContext.isContinuation, true);
            assertEquals(uploadContext.pathContext.turnIndex, 2);
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "A.2: PlannerPrompt - should handle a base case explicit continuation",
        async () => {
        // 1. Setup:
        //    - Configure a mock 'PLAN' job from a model call that returned a ContinueReason.
        //    - The payload for this job type does NOT have a `header_context_resource_id`.
          const mockPlannerJob: DialecticJobRow = {
            id: "job-plan-cont",
            job_type: "PLAN",
            payload: {
              continuation_reason: "length",
              model_id: "model-123",
              model_slug: "test-model",
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
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          const partialContent = `{"key": "value"`;

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock 'PLAN' job and a partial JSON string.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockPlannerJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: partialContent,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
        //    - Verify the final prompt contains a specific "continue JSON" instruction and the exact partial JSON.
            assert(
              result.promptContent.includes(
                MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON,
              ),
            );
            assert(result.promptContent.endsWith(partialContent));

        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext =
              fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(
              uploadContext.pathContext.fileType,
              FileType.PlannerPrompt,
            );
            assert("contributionMetadata" in uploadContext);
            assertEquals(uploadContext.pathContext.isContinuation, true);
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "A.3: SeedPrompt - should handle a base case explicit continuation",
        async () => {
        // 1. Setup:
        //    - Configure a mock 'Seed' job from a model call that returned a ContinueReason.
        //    - The payload for this job type does NOT have a `header_context_resource_id`.
          const mockSeedJob: DialecticJobRow = {
            id: "job-seed-cont",
            job_type: "EXECUTE", // No seed job type, so EXECUTE is a generic stand-in
            payload: {
              continuation_reason: "length",
              model_id: "model-123",
              model_slug: "test-model",
            },
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 3,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          const partialContent = "This is generic partial text.";

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock 'Seed' job and partial text.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockSeedJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: partialContent,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
        //    - Verify a simple "please continue" prompt is built.
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_EXPLICIT));
            assert(!result.promptContent.includes("JSON"));
            assert(result.promptContent.endsWith(partialContent));

        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext =
              fileManager.uploadAndRegisterFile.calls[0].args[0];
            // Since there's no "SeedPrompt" file type for jobs, we expect a generic "TurnPrompt"
            assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
            assert("contributionMetadata" in uploadContext);
            assertEquals(uploadContext.pathContext.isContinuation, true);
            assertEquals(uploadContext.pathContext.turnIndex, 4);
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "A.4: should pass branch_key and parallel_group to FileManager if present in recipe",
        async () => {
        // 1. Setup:
          const stageWithOrchestrationKeys: StageContext = {
            ...defaultStage,
            recipe_step: {
              ...defaultStage.recipe_step!,
              branch_key: "branch-abc",
              parallel_group: 1,
            },
          };
          const mockTurnJob: DialecticJobRow = {
            id: "job-turn-orchestration",
            job_type: "EXECUTE",
            payload: {
              header_context_resource_id: "header-res-123",
              continuation_reason: "length",
              model_id: "model-123",
              model_slug: "test-model",
            },
            session_id: defaultSession.id,
            stage_slug: stageWithOrchestrationKeys.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 1,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
            storageMock: {
              downloadResult: () =>
                Promise.resolve({
                  data: new Blob([JSON.stringify(headerContextContent)]),
                  error: null,
                }),
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

          try {
        // 2. Execute:
            await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: stageWithOrchestrationKeys,
              continuationContent: "partial content",
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext =
              fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(uploadContext.pathContext.branchKey, "branch-abc");
            assertEquals(uploadContext.pathContext.parallelGroup, 1);
            assert("contributionMetadata" in uploadContext);
          } finally {
            teardown();
          }
        },
      );
    });
  
    await t.step("Category B: Implicit/Corrective Continuations (Invalid Content)", async (t) => {
      // These tests prove the NEW functionality where `finish_reason` was 'stop' but the content is invalid, requiring a corrective prompt.
  
      await t.step("B.1: PlannerPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
        // 1. Setup:
        //    - Configure a mock 'PLAN' job with `continuationContent` of an incomplete JSON string (e.g., `{"key":`).
        const mockPlannerJob: DialecticJobRow = {
          id: "job-plan-incomplete",
          job_type: "PLAN",
          payload: { model_id: "model-123", model_slug: "test-model" },
          session_id: defaultSession.id,
          stage_slug: defaultStage.slug,
          iteration_number: 1,
          status: "pending",
          user_id: defaultProject.user_id,
          is_test_job: false,
          created_at: new Date().toISOString(),
          attempt_count: 1,
          completed_at: null,
          error_details: null,
          max_retries: 3,
          parent_job_id: null,
          prerequisite_job_id: null,
          results: null,
          started_at: null,
          target_contribution_id: null,
        };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            ai_providers: {
              select: {
                data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
              },
            },
          },
        };
        const { client, fileManager } = setup(config);
        fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
        const incompleteJson = `{"key": "value"`;

        try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock job and the incomplete JSON.
          const result = await assembleContinuationPrompt({
            dbClient: client,
            fileManager,
            job: mockPlannerJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            continuationContent: incompleteJson,
            gatherContext: spy(async () => ({
              user_objective: "",
              domain: "",
              agent_count: 0,
              context_description: "",
              original_user_request: null,
              prior_stage_ai_outputs: "",
              prior_stage_user_feedback: "",
              deployment_context: null,
              reference_documents: null,
              constraint_boundaries: null,
              stakeholder_considerations: null,
              deliverable_format: null,
            })),
          });

        // 3. Assert:
        //    - Verify the prompt contains a specific CORRECTIVE instruction to COMPLETE the JSON.
          assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
          assert(result.promptContent.endsWith(incompleteJson));
        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
          assertSpyCall(fileManager.uploadAndRegisterFile, 0);
          const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          assertEquals(uploadContext.pathContext.fileType, FileType.PlannerPrompt);
          assert("contributionMetadata" in uploadContext);
        } finally {
          teardown();
        }
      });
  
      await t.step("B.2: TurnPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
        // 1. Setup:
        //    - Configure a mock 'Turn' job with incomplete JSON content.
        //    - Mock the required HeaderContext download.
        const mockTurnJob: DialecticJobRow = {
          id: "job-turn-incomplete",
          job_type: "EXECUTE",
          payload: { header_context_resource_id: "header-res-456", model_id: "model-123", model_slug: "test-model" },
          session_id: defaultSession.id,
          stage_slug: defaultStage.slug,
          iteration_number: 1,
          status: "pending",
          user_id: defaultProject.user_id,
          is_test_job: false,
          created_at: new Date().toISOString(),
          attempt_count: 1,
          completed_at: null,
          error_details: null,
          max_retries: 3,
          parent_job_id: null,
          prerequisite_job_id: null,
          results: null,
          started_at: null,
          target_contribution_id: null,
        };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            ai_providers: {
              select: {
                data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
              },
            },
          },
          storageMock: {
            downloadResult: () => Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null }),
          },
        };
        const { client, fileManager } = setup(config);
        fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
        const incompleteJson = `{"data": [`;

        try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock job and the incomplete JSON.
          const result = await assembleContinuationPrompt({
            dbClient: client,
            fileManager,
            job: mockTurnJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            continuationContent: incompleteJson,
            gatherContext: spy(async () => ({
              user_objective: "",
              domain: "",
              agent_count: 0,
              context_description: "",
              original_user_request: null,
              prior_stage_ai_outputs: "",
              prior_stage_user_feedback: "",
              deployment_context: null,
              reference_documents: null,
              constraint_boundaries: null,
              stakeholder_considerations: null,
              deliverable_format: null,
            })),
          });

        // 3. Assert:
        //    - Verify the prompt includes both the HeaderContext AND the CORRECTIVE instruction to COMPLETE the JSON.
          assert(result.promptContent.includes(headerContextContent.system_materials.shared_plan));
          assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
          assert(result.promptContent.endsWith(incompleteJson));
        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
          assertSpyCall(fileManager.uploadAndRegisterFile, 0);
          const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          assert("contributionMetadata" in uploadContext);
        } finally {
          teardown();
        }
      });
  
      await t.step("B.3: SeedPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Seed' job with incomplete JSON content.
          const mockSeedJob: DialecticJobRow = {
            id: "job-seed-incomplete",
            job_type: "EXECUTE",
            payload: { model_id: "model-123", model_slug: "test-model" },
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 1,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          const incompleteJson = `[{"item": 1},`;

          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job and the incomplete JSON.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockSeedJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: incompleteJson,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

          // 3. Assert:
          //    - Verify the prompt contains the CORRECTIVE instruction to COMPLETE the JSON.
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
            assert("contributionMetadata" in uploadContext);
          } finally {
            teardown();
          }
      });
  
      await t.step("B.4: PlannerPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
        // 1. Setup:
        //    - Configure a mock 'PLAN' job with `continuationContent` of a complete but syntactically invalid JSON string (e.g., `{"key": "value",}`).
        const mockPlannerJob: DialecticJobRow = {
          id: "job-plan-malformed",
          job_type: "PLAN",
          payload: { model_id: "model-123", model_slug: "test-model" },
          session_id: defaultSession.id,
          stage_slug: defaultStage.slug,
          iteration_number: 1,
          status: "pending",
          user_id: defaultProject.user_id,
          is_test_job: false,
          created_at: new Date().toISOString(),
          attempt_count: 1,
          completed_at: null,
          error_details: null,
          max_retries: 3,
          parent_job_id: null,
          prerequisite_job_id: null,
          results: null,
          started_at: null,
          target_contribution_id: null,
        };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            ai_providers: {
              select: {
                data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
              },
            },
          },
        };
        const { client, fileManager } = setup(config);
        fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
        const malformedJson = `{"key": "value",}`;

        try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock job and the malformed JSON.
          const result = await assembleContinuationPrompt({
            dbClient: client,
            fileManager,
            job: mockPlannerJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            continuationContent: malformedJson,
            gatherContext: spy(async () => ({
              user_objective: "",
              domain: "",
              agent_count: 0,
              context_description: "",
              original_user_request: null,
              prior_stage_ai_outputs: "",
              prior_stage_user_feedback: "",
              deployment_context: null,
              reference_documents: null,
              constraint_boundaries: null,
              stakeholder_considerations: null,
              deliverable_format: null,
            })),
          });

        // 3. Assert:
        //    - Verify the prompt contains a specific CORRECTIVE instruction to FIX the syntax of the JSON.
          assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
          assertSpyCall(fileManager.uploadAndRegisterFile, 0);
          const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          assert("contributionMetadata" in uploadContext);
        } finally {
          teardown();
        }
      });
  
      await t.step("B.5: TurnPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
        // 1. Setup:
        //    - Configure a mock 'Turn' job with malformed JSON content.
        //    - Mock the required HeaderContext download.
        const mockTurnJob: DialecticJobRow = {
          id: "job-turn-malformed",
          job_type: "EXECUTE",
          payload: { header_context_resource_id: "header-res-789", model_id: "model-123", model_slug: "test-model" },
          session_id: defaultSession.id,
          stage_slug: defaultStage.slug,
          iteration_number: 1,
          status: "pending",
          user_id: defaultProject.user_id,
          is_test_job: false,
          created_at: new Date().toISOString(),
          attempt_count: 1,
          completed_at: null,
          error_details: null,
          max_retries: 3,
          parent_job_id: null,
          prerequisite_job_id: null,
          results: null,
          started_at: null,
          target_contribution_id: null,
        };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            ai_providers: {
              select: {
                data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
              },
            },
          },
          storageMock: {
            downloadResult: () => Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null }),
          },
        };
        const { client, fileManager } = setup(config);
        fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
        const malformedJson = `{"key": "value" oops}`;

        try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock job and the malformed JSON.
          const result = await assembleContinuationPrompt({
            dbClient: client,
            fileManager,
            job: mockTurnJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            continuationContent: malformedJson,
            gatherContext: spy(async () => ({
              user_objective: "",
              domain: "",
              agent_count: 0,
              context_description: "",
              original_user_request: null,
              prior_stage_ai_outputs: "",
              prior_stage_user_feedback: "",
              deployment_context: null,
              reference_documents: null,
              constraint_boundaries: null,
              stakeholder_considerations: null,
              deliverable_format: null,
            })),
          });

        // 3. Assert:
        //    - Verify the prompt includes both the HeaderContext AND the CORRECTIVE instruction to FIX the JSON syntax.
          assert(result.promptContent.includes(headerContextContent.system_materials.shared_plan));
          assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
          assertSpyCall(fileManager.uploadAndRegisterFile, 0);
          const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          assert("contributionMetadata" in uploadContext);
        } finally {
          teardown();
        }
      });
  
      await t.step("B.6: SeedPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
        // 1. Setup:
        //    - Configure a mock 'Seed' job with malformed JSON content.
        const mockSeedJob: DialecticJobRow = {
          id: "job-seed-malformed",
          job_type: "EXECUTE",
          payload: { model_id: "model-123", model_slug: "test-model" },
          session_id: defaultSession.id,
          stage_slug: defaultStage.slug,
          iteration_number: 1,
          status: "pending",
          user_id: defaultProject.user_id,
          is_test_job: false,
          created_at: new Date().toISOString(),
          attempt_count: 1,
          completed_at: null,
          error_details: null,
          max_retries: 3,
          parent_job_id: null,
          prerequisite_job_id: null,
          results: null,
          started_at: null,
          target_contribution_id: null,
        };
        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            ai_providers: {
              select: {
                data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
              },
            },
          },
        };
        const { client, fileManager } = setup(config);
        fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
        const malformedJson = `{"valid": true, "invalid":,}`;

        try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the mock job and the malformed JSON.
          const result = await assembleContinuationPrompt({
            dbClient: client,
            fileManager,
            job: mockSeedJob,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            continuationContent: malformedJson,
            gatherContext: spy(async () => ({
              user_objective: "",
              domain: "",
              agent_count: 0,
              context_description: "",
              original_user_request: null,
              prior_stage_ai_outputs: "",
              prior_stage_user_feedback: "",
              deployment_context: null,
              reference_documents: null,
              constraint_boundaries: null,
              stakeholder_considerations: null,
              deliverable_format: null,
            })),
          });

        // 3. Assert:
        //    - Verify the prompt contains the CORRECTIVE instruction to FIX the JSON syntax.
          assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
        //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
          assertSpyCall(fileManager.uploadAndRegisterFile, 0);
          const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          assert("contributionMetadata" in uploadContext);
        } finally {
          teardown();
        }
      });
    });
  
  await t.step(
    "Category C: Recursive & Mixed-Mode Continuations (System Robustness)",
    async (t) => {
      // These tests prove the system can handle failures within its own recovery loops.
  
      await t.step(
        "C.1: should correctly chain multiple explicit continuations (Explicit -> Explicit)",
        async () => {
        // 1. Setup:
          //    - Configure a mock job that is ALREADY a continuation (e.g., `attempt_count > 0`).
        //    - This job's last turn ALSO resulted in a conceptual ContinueReason.
          const mockRecursiveJob: DialecticJobRow = {
            id: "job-recursive-explicit",
            job_type: "EXECUTE",
            payload: {
              continuation_reason: "length",
              model_id: "model-123",
              model_slug: "test-model",
            },
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 2, // This is the 3rd attempt overall
            completed_at: null,
            error_details: null,
            max_retries: 5,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt to generate the next prompt in the chain.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockRecursiveJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: "some partial text",
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
        //    - Verify the next prompt is assembled with the correct stateless logic (e.g., still a simple "please continue" instruction).
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_EXPLICIT));
            const uploadContext =
              fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(uploadContext.pathContext.turnIndex, 3); // 2 prior attempts + this one
            assert("contributionMetadata" in uploadContext);
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "C.2: should generate a corrective prompt from an explicit continuation (Explicit -> Corrective)",
        async () => {
        // 1. Setup:
        //    - Configure a mock job that is a planned continuation, but its provided `continuationContent` is malformed JSON.
          const mockMixedJob: DialecticJobRow = {
            id: "job-mixed-e-to-c",
            job_type: "PLAN",
            payload: {
              continuation_reason: "length",
              model_id: "model-123",
              model_slug: "test-model",
            }, // Explicit reason
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 1,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          const malformedJson = `{"key": oops}`; // Corrective content

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockMixedJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: malformedJson,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
        //    - Verify the resulting prompt is a CORRECTIVE prompt, not a simple "continue" prompt, proving the system can switch modes.
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
            assert(!result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_EXPLICIT));
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "C.3: should generate an explicit continuation from a corrective continuation (Corrective -> Explicit)",
        async () => {
        // 1. Setup:
        //    - Configure a mock job that is a corrective continuation, but whose model response was truncated (conceptual ContinueReason).
          const mockMixedJob: DialecticJobRow = {
            id: "job-mixed-c-to-e",
            job_type: "PLAN",
            payload: {
              continuation_reason: "truncation_recovery",
              model_id: "model-123",
              model_slug: "test-model",
            }, // Corrective reason
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 1,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          // This content is valid but conceptually represents a truncated stream that needs an explicit continue.
          const partialValidJson = `{"key": "this is valid but we pretend it was cut off"`;

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt with the partial corrective text.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockMixedJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: partialValidJson,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

            // 3. Assert:
            //    - The logic should detect it's incomplete JSON and generate a corrective prompt, overriding the job's explicit reason.
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "C.4: should generate a corrective prompt from a corrective continuation (Corrective -> Corrective)",
        async () => {
        // 1. Setup:
        //    - Configure a mock job that is a corrective continuation, but its `continuationContent` (the attempted fix) is STILL malformed JSON.
          const mockRecursiveCorrectiveJob: DialecticJobRow = {
            id: "job-recursive-corrective",
            job_type: "PLAN",
            payload: {
              continuation_reason: "truncation_recovery",
              model_id: "model-123",
              model_slug: "test-model",
            },
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 2,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
          const stillMalformedJson = `{"key": "value", "anotherkey"}`;

          try {
        // 2. Execute:
        //    - Call assembleContinuationPrompt.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockRecursiveCorrectiveJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: stillMalformedJson,
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });

        // 3. Assert:
        //    - Verify the resulting prompt is another CORRECTIVE prompt, asking the model to try again.
            assert(result.promptContent.includes(MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON));
            const uploadContext =
              fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(uploadContext.pathContext.turnIndex, 3);
            assert("contributionMetadata" in uploadContext);
          } finally {
            teardown();
          }
        },
      );
    });

  await t.step(
    "Category D: Universal Error Handling and Preconditions",
    async (t) => {
      // These tests prove the function's fundamental robustness.
  
      await t.step(
        "D.1: should throw an error if continuationContent is not provided",
        async () => {
          // 1. Execute & Assert:
          //    - Call `assembleContinuationPrompt` with `null`, `undefined`, and `''` for `continuationContent`.
          //    - Verify `assertRejects` for all invalid inputs with a specific "PRECONDITION_FAILED" error message.
          const { client, fileManager } = setup();
          const baseArgs = {
            dbClient: client,
            fileManager,
            job: { id: "job-empty" } as DialecticJobRow,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            gatherContext: spy(async () => ({
              user_objective: "",
              domain: "",
              agent_count: 0,
              context_description: "",
              original_user_request: null,
              prior_stage_ai_outputs: "",
              prior_stage_user_feedback: "",
              deployment_context: null,
              reference_documents: null,
              constraint_boundaries: null,
              stakeholder_considerations: null,
              deliverable_format: null,
            })),
            render: spy(() => "rendered prompt"),
          };

          await assertRejects(
            () =>
              assembleContinuationPrompt({
                ...baseArgs,
                continuationContent: null as any,
              }),
            Error,
            "PRECONDITION_FAILED",
          );
          await assertRejects(
            () =>
              assembleContinuationPrompt({
                ...baseArgs,
                continuationContent: undefined as any,
              }),
            Error,
            "PRECONDITION_FAILED",
          );
          await assertRejects(
            () =>
              assembleContinuationPrompt({
                ...baseArgs,
                continuationContent: "",
              }),
            Error,
            "PRECONDITION_FAILED",
          );
        },
      );

      await t.step(
        "D.2: should throw an error if a HeaderContext is required (TurnPrompt) but cannot be fetched",
        async () => {
          // 1. Setup:
          //    - Configure a mock 'Turn' job.
          //    - Mock the storage download to throw an error.
          const mockTurnJob: DialecticJobRow = {
            id: "job-turn-fetch-fail",
            job_type: "EXECUTE",
            payload: {
              header_context_resource_id: "header-res-fail",
              model_id: "model-123",
              model_slug: "test-model",
            },
            session_id: defaultSession.id,
            stage_slug: defaultStage.slug,
            iteration_number: 1,
            status: "pending",
            user_id: defaultProject.user_id,
            is_test_job: false,
            created_at: new Date().toISOString(),
            attempt_count: 1,
            completed_at: null,
            error_details: null,
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
            storageMock: {
              downloadResult: () => Promise.resolve({ data: null, error: new Error("Storage download failed") }),
            },
          };
          const { client, fileManager } = setup(config);

          // 2. Execute & Assert:
          //    - Verify `assertRejects` with an error message indicating the download failed.
          await assertRejects(
            () =>
              assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockTurnJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                continuationContent: "any content",
                gatherContext: spy(async () => ({
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: null,
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: null,
                  reference_documents: null,
                  constraint_boundaries: null,
                  stakeholder_considerations: null,
                  deliverable_format: null,
                })),
              }),
            Error,
            "Failed to fetch HeaderContext",
          );
        },
      );

      await t.step(
        "D.3: should NOT throw for missing HeaderContext when not required (Planner/Seed)",
        async () => {
          // 1. Setup:
          //    - Configure a mock 'PLAN' job.
          //    - Do not mock any storage download.
          const mockPlannerJob: DialecticJobRow = {
            id: "job-plan-no-header",
            job_type: "PLAN",
            payload: { model_id: "model-123", model_slug: "test-model" },
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
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

          try {
            // 2. Execute:
            //    - Call `assembleContinuationPrompt`.
            await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockPlannerJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              continuationContent: "any content",
              gatherContext: spy(async () => ({
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: null,
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: null,
                reference_documents: null,
                constraint_boundaries: null,
                stakeholder_considerations: null,
                deliverable_format: null,
              })),
            });
            // 3. Assert:
            //    - The call completes successfully, proving it did not attempt to download a non-existent context.
            //    - (No assertion needed, success is the test)
          } finally {
            teardown();
          }
        },
      );

      await t.step(
        "D.4: should propagate errors from the FileManager service",
        async () => {
          // 1. Setup:
          //    - Configure `mockFileManager` to return an error from `uploadAndRegisterFile`.
          const mockPlannerJob: DialecticJobRow = {
            id: "job-plan-fm-fail",
            job_type: "PLAN",
            payload: { model_id: "model-123", model_slug: "test-model" },
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
            max_retries: 3,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            started_at: null,
            target_contribution_id: null,
          };
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
            },
          };
          const { client, fileManager } = setup(config);
          const fileManagerError = new Error("FileManager failed");
          fileManager.setUploadAndRegisterFileResponse(null, fileManagerError);

          // 2. Execute & Assert:
          //    - Verify `assertRejects` with the exact error from the mock.
          await assertRejects(
            () =>
              assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockPlannerJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                continuationContent: "any content",
                gatherContext: spy(async () => ({
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: null,
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: null,
                  reference_documents: null,
                  constraint_boundaries: null,
                  stakeholder_considerations: null,
                  deliverable_format: null,
                })),
              }),
            Error,
            fileManagerError.message,
          );
        },
      );

      await t.step(
        "D.5: should throw an error if the session has no selected models",
        async () => {
          // 1. Setup:
          //    - Provide a mock `SessionContext` with an empty `selected_model_ids` array.
          const { client, fileManager } = setup();
          const sessionWithNoModels = {
            ...defaultSession,
            selected_model_ids: [],
          };

          // 2. Execute & Assert:
          //    - Verify `assertRejects` with the "no selected model" error message.
          await assertRejects(
            () =>
              assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: { id: "job-no-model" } as DialecticJobRow,
                project: defaultProject,
                session: sessionWithNoModels,
                stage: defaultStage,
                continuationContent: "any content",
                gatherContext: spy(async () => ({
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: null,
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: null,
                  reference_documents: null,
                  constraint_boundaries: null,
                  stakeholder_considerations: null,
                  deliverable_format: null,
                })),
              }),
            Error,
            "Session has no selected models",
          );
        },
      );
    });
  });
