  // Helper function to create header context contribution mocks
  import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
  import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
  import {
    assembleContinuationPrompt,
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
    type MockQueryBuilderState,
  } from "../supabase.mock.ts";
  import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
  import type { Database } from "../../types_db.ts";
  import { createMockFileManagerService } from "../services/file_manager.mock.ts";
  import { FileType } from "../types/file_manager.types.ts";
  import { FileRecord } from "../types/file_manager.types.ts";
  import {
    DialecticExecuteJobPayload,
    DialecticJobRow,
    DialecticRecipeStep,
    HeaderContext,
  } from "../../dialectic-service/dialectic.interface.ts";
  import { assertSpyCall } from "jsr:@std/testing@0.225.1/mock";
  import { isRecord, isJson } from "../utils/type_guards.ts";
  import { DynamicContextVariables } from "./prompt-assembler.interface.ts";
  
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
        outputs_required: { documents: [{ artifact_class: "rendered_document", file_type: "markdown", document_key: FileType.business_case, template_filename: "business_case.md" }] },
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
        output_type: FileType.business_case,
        instance_id: "instance-123",
        step_description: "Recipe Step Description",
      }, // Not always needed for continuation
      active_recipe_instance_id: null,
      expected_output_template_ids: [],
      recipe_template_id: null,
    };
  
    const headerContextContent: HeaderContext = {
      system_materials: {
        agent_notes_to_self: "This is the shared plan.",
        input_artifacts_summary: "Use formal language.",
        stage_rationale: "Use formal language.",
        validation_checkpoint: ["Use formal language."],
        quality_standards: ["Use formal language."],
        diversity_rubric: { "Use formal language.": "Use formal language." },
        progress_update: "Use formal language.",
      },
      header_context_artifact: {
        type: "header_context",
        document_key: "header_context",
        artifact_class: "header_context",
        file_type: "json",
      },
      context_for_documents: [],
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
  
    const defaultExecutePayload: DialecticExecuteJobPayload = {
      sessionId: "session-default",
      projectId: "proj-default",
      walletId: "wallet-default",
      user_jwt: "mock-jwt",
      stageSlug: "stage-default",
      iterationNumber: 1,
      model_id: "model-default",
      model_slug: "test-model",
      prompt_template_id: "template-default",
      output_type: FileType.business_case,
      canonicalPathParams: {
        contributionType: "antithesis",
        stageSlug: "stage-default",
      },
      inputs: {},
      target_contribution_id: "target-contrib-default",
      document_key: FileType.business_case,
    };


    const createMockJob = (
      payloadOverrides: Partial<DialecticExecuteJobPayload> = {},
      overrides: Partial<Omit<DialecticJobRow, "payload">> = {},
    ): DialecticJobRow & { payload: DialecticExecuteJobPayload } => {
   
      const payload: DialecticExecuteJobPayload = { ...defaultExecutePayload, ...payloadOverrides };
      if (!isJson(payload)) {
        throw new Error("Payload is not a valid JSON object");
      }         

      return {
        id: "job-default-id",
        job_type: "EXECUTE",
        session_id: "session-default",
        stage_slug: "stage-default",
        iteration_number: 1,
        status: "pending",
        user_id: "user-default",
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
        target_contribution_id: "target-contrib-default",
        payload,
        ...overrides,
      };
    };
  
    // Helper function to create contribution mocks (generic)
    const createContributionsMock = (
      entries: Record<string, { storage_bucket: string; storage_path: string; file_name: string; contribution_type: string }>
    ) => {
      return {
        select: async (state: MockQueryBuilderState) => {
          const idFilter = state.filters.find(
            (f) => f.type === "eq" && f.column === "id"
          );
          const id = idFilter?.value;
          
          if (id !== undefined && id !== null && typeof id === "string" && entries[id]) {
            return {
              data: [{
                id: id,
                ...entries[id]
              }],
              error: null,
              count: 1,
              status: 200,
              statusText: "OK",
            };
          }
          return {
            data: null,
            error: new Error("Contribution not found"),
            count: 0,
            status: 404,
            statusText: "Not Found",
          };
        },
      };
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
          //    - The job's payload MUST include `inputs.header_context_id`.
          //    - Mock the database query and storage download to return a valid HeaderContext object containing `system_materials`.
            const HEADER_CONTEXT_CONTRIBUTION_ID = "header-contrib-123";
            const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
            const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
            const HEADER_CONTEXT_FILE_NAME = "header_context.json";
            const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-123";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const partialContent = "This is the partial markdown content.";
  
            const mockTurnJob = createMockJob(
              { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-turn-cont", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                    storage_bucket: HEADER_CONTEXT_STORAGE_BUCKET,
                    storage_path: HEADER_CONTEXT_STORAGE_PATH,
                    file_name: HEADER_CONTEXT_FILE_NAME,
                    contribution_type: "header_context",
                  },
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContextContent)]),
                      error: null,
                    });
                  }
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([partialContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
            // Access storage spy before the call so it tracks calls correctly
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from(HEADER_CONTEXT_STORAGE_BUCKET).downloadSpy;
  
            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock 'Turn' job.
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockTurnJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "mock user objective",
                  domain: "Software Development",
                  agent_count: 1,
                  context_description: "A test context",
                  original_user_request: "The original request",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
          // 3. Assert:
          //    - Verify the storage download was called for the header context contribution.
              assertSpyCall(downloadSpy, 0); // This checks if ANY download was called on this bucket spy, which covers header
              // To be precise, we can verify arguments of calls if needed, but the spy setup is bucket-specific in the mock setup helper
              // We should ideally check both downloads occurred. The mock setup tracks calls via spies.
              
              //    - Verify the final prompt includes the `system_materials`, a generic "please continue" instruction, and the exact partial markdown.
              assert(
                result.promptContent.includes(
                  headerContextContent.system_materials.agent_notes_to_self,
                ),
              );
              assert(result.promptContent.endsWith(partialContent));
  
              //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-123";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const partialContent = `{"key": "value"`;
  
            const mockPlannerJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-plan-cont", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 0, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([partialContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock 'PLAN' job.
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockPlannerJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => ({
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,  
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                })),
              });
  
          // 3. Assert:
          //    - Verify the final prompt contains a specific "continue JSON" instruction and the exact partial JSON.
              assert(result.promptContent.endsWith(partialContent));
  
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(
                uploadContext.pathContext.fileType,
                FileType.PlannerPrompt,
              );
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-123";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const partialContent = "This is generic partial text.";
  
            const mockSeedJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-seed-cont", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 3, target_contribution_id: null },
            );
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([partialContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock 'Seed' job.
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockSeedJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
          // 3. Assert:
          //    - Verify a simple "please continue" prompt is built.
              assert(!result.promptContent.includes("JSON"));
              assert(result.promptContent.endsWith(partialContent));
  
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              // Since there's no "SeedPrompt" file type for jobs, we expect a generic "TurnPrompt"
              assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
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
            const HEADER_CONTEXT_CONTRIBUTION_ID = "header-contrib-456";
            const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
            const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
            const HEADER_CONTEXT_FILE_NAME = "header_context.json";
            const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-456";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const partialContent = "partial content";
  
            const stageWithOrchestrationKeys: StageContext = {
              ...defaultStage,
              recipe_step: {
                id: "recipe-step-456",
                step_key: "recipe-step-key-orchestration",
                step_slug: "recipe-step-slug-orchestration",
                step_name: "Orchestration Recipe Step",
                step_description: "Orchestration Recipe Step Description",
                job_type: "EXECUTE",
                prompt_type: "Turn",
                granularity_strategy: "all_to_one",
                inputs_required: [],
                inputs_relevance: [],
                outputs_required: { documents: [{ artifact_class: "rendered_document", file_type: "markdown", document_key: FileType.business_case, template_filename: "business_case.md" }] },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
                prompt_template_id: null,
                template_step_id: null,
                execution_order: 1,
                output_type: FileType.business_case,
                instance_id: "instance-456",
                branch_key: "branch-abc",
                parallel_group: 1,
              },
            };
            const mockTurnJob = createMockJob(
              { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-turn-orchestration", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: stageWithOrchestrationKeys.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                    storage_bucket: HEADER_CONTEXT_STORAGE_BUCKET,
                    storage_path: HEADER_CONTEXT_STORAGE_PATH,
                    file_name: HEADER_CONTEXT_FILE_NAME,
                    contribution_type: "header_context",
                  },
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContextContent)]),
                      error: null,
                    });
                  }
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([partialContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
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
                  gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
          // 3. Assert:
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.branchKey, "branch-abc");
              assertEquals(uploadContext.pathContext.parallelGroup, 1);
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
          const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-123";
          const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
          const PRIOR_OUTPUT_PATH = "path/to/prior";
          const PRIOR_OUTPUT_FILENAME = "prior_output.json";
          const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
          const incompleteJson = `{"key": "value"`;
  
          const mockPlannerJob = createMockJob(
            { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
            { id: "job-plan-incomplete", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
          );
  
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
              dialectic_contributions: createContributionsMock({
                [PRIOR_OUTPUT_CONTRIB_ID]: {
                  storage_bucket: PRIOR_OUTPUT_BUCKET,
                  storage_path: PRIOR_OUTPUT_PATH,
                  file_name: PRIOR_OUTPUT_FILENAME,
                  contribution_type: "antithesis",
                },
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                  return Promise.resolve({
                    data: new Blob([incompleteJson]),
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockPlannerJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: spy(async () => { return {
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: "",
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: undefined,
                reference_documents: undefined,
                constraint_boundaries: undefined,
                stakeholder_considerations: undefined,
                deliverable_format: undefined,
                recipeStep: defaultStage.recipe_step,
              }}),
            });
  
          // 3. Assert:
          //    - Verify the prompt contains a specific CORRECTIVE instruction to COMPLETE the JSON.
            assert(result.promptContent.endsWith(incompleteJson));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(uploadContext.pathContext.fileType, FileType.PlannerPrompt);
          } finally {
            teardown();
          }
        });
    
        await t.step("B.2: TurnPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Turn' job with incomplete JSON content.
          //    - Mock the required HeaderContext contribution query and download.
          const HEADER_CONTEXT_CONTRIBUTION_ID = "header-contrib-456";
          const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
          const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
          const HEADER_CONTEXT_FILE_NAME = "header_context.json";
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
          const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-456";
          const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
          const PRIOR_OUTPUT_PATH = "path/to/prior";
          const PRIOR_OUTPUT_FILENAME = "prior_output.json";
          const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
          const incompleteJson = `{"data": [`;
  
          const mockTurnJob = createMockJob(
            { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
            { id: "job-turn-incomplete", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
          );
  
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
              dialectic_contributions: createContributionsMock({
                [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                  storage_bucket: HEADER_CONTEXT_STORAGE_BUCKET,
                  storage_path: HEADER_CONTEXT_STORAGE_PATH,
                  file_name: HEADER_CONTEXT_FILE_NAME,
                  contribution_type: "header_context",
                },
                [PRIOR_OUTPUT_CONTRIB_ID]: {
                  storage_bucket: PRIOR_OUTPUT_BUCKET,
                  storage_path: PRIOR_OUTPUT_PATH,
                  file_name: PRIOR_OUTPUT_FILENAME,
                  contribution_type: "antithesis",
                },
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                  return Promise.resolve({ data: new Blob([incompleteJson]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: spy(async () => { return {
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: "",
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: undefined,
                reference_documents: undefined,
                constraint_boundaries: undefined,
                stakeholder_considerations: undefined,
                deliverable_format: undefined,
                recipeStep: defaultStage.recipe_step,
              }}),
            });
  
          // 3. Assert:
          //    - Verify the prompt includes both the HeaderContext AND the CORRECTIVE instruction to COMPLETE the JSON.
            assert(result.promptContent.includes(headerContextContent.system_materials.agent_notes_to_self));
            assert(result.promptContent.endsWith(incompleteJson));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
    
        await t.step("B.3: SeedPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
            // 1. Setup:
            //    - Configure a mock 'Seed' job with incomplete JSON content.
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-789";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const incompleteJson = `[{"item": 1},`;
  
            const mockSeedJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-seed-incomplete", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([incompleteJson]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
            try {
            // 2. Execute:
            //    - Call assembleContinuationPrompt with the mock job.
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockSeedJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
            // 3. Assert:
            //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
            } finally {
              teardown();
            }
        });
    
        await t.step("B.4: PlannerPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'PLAN' job with `continuationContent` of a complete but syntactically invalid JSON string (e.g., `{"key": "value",}`).
          const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-malformed";
          const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
          const PRIOR_OUTPUT_PATH = "path/to/prior";
          const PRIOR_OUTPUT_FILENAME = "prior_output.json";
          const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
          const malformedJson = `{"key": "value",}`;
  
          const mockPlannerJob = createMockJob(
            { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
            { id: "job-plan-malformed", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
          );
  
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
              dialectic_contributions: createContributionsMock({
                [PRIOR_OUTPUT_CONTRIB_ID]: {
                  storage_bucket: PRIOR_OUTPUT_BUCKET,
                  storage_path: PRIOR_OUTPUT_PATH,
                  file_name: PRIOR_OUTPUT_FILENAME,
                  contribution_type: "antithesis",
                },
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                  return Promise.resolve({
                    data: new Blob([malformedJson]),
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockPlannerJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: spy(async () => { return {
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: "",
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: undefined,
                reference_documents: undefined,
                constraint_boundaries: undefined,
                stakeholder_considerations: undefined,
                deliverable_format: undefined,
                recipeStep: defaultStage.recipe_step,
              }   }),
            });
  
          // 3. Assert:
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
    
        await t.step("B.5: TurnPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Turn' job with malformed JSON content.
          //    - Mock the required HeaderContext contribution query and download.
          const HEADER_CONTEXT_CONTRIBUTION_ID = "header-contrib-789";
          const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
          const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
          const HEADER_CONTEXT_FILE_NAME = "header_context.json";
          const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
          const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-789";
          const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
          const PRIOR_OUTPUT_PATH = "path/to/prior";
          const PRIOR_OUTPUT_FILENAME = "prior_output.json";
          const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
          const malformedJson = `{"key": "value" oops}`;
  
          const mockTurnJob = createMockJob(
            { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
            { id: "job-turn-malformed", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
          );
  
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
              dialectic_contributions: createContributionsMock({
                [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                  storage_bucket: HEADER_CONTEXT_STORAGE_BUCKET,
                  storage_path: HEADER_CONTEXT_STORAGE_PATH,
                  file_name: HEADER_CONTEXT_FILE_NAME,
                  contribution_type: "header_context",
                },
                [PRIOR_OUTPUT_CONTRIB_ID]: {
                  storage_bucket: PRIOR_OUTPUT_BUCKET,
                  storage_path: PRIOR_OUTPUT_PATH,
                  file_name: PRIOR_OUTPUT_FILENAME,
                  contribution_type: "antithesis",
                },
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                  return Promise.resolve({ data: new Blob([malformedJson]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: spy(async () => { return {
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: "",
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: undefined,
                reference_documents: undefined,
                constraint_boundaries: undefined,
                stakeholder_considerations: undefined,
                deliverable_format: undefined,
                recipeStep: defaultStage.recipe_step,
              }}),
            });
  
          // 3. Assert:
          //    - Verify the prompt includes both the HeaderContext  to FIX the JSON syntax.
            assert(result.promptContent.includes(headerContextContent.system_materials.agent_notes_to_self));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
    
        await t.step("B.6: SeedPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Seed' job with malformed JSON content.
          const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-malformed-seed";
          const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
          const PRIOR_OUTPUT_PATH = "path/to/prior";
          const PRIOR_OUTPUT_FILENAME = "prior_output.json";
          const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
          const malformedJson = `{"valid": true, "invalid":,}`;
  
          const mockSeedJob = createMockJob(
            { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
            { id: "job-seed-malformed", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
          );
  
          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                },
              },
              dialectic_contributions: createContributionsMock({
                [PRIOR_OUTPUT_CONTRIB_ID]: {
                  storage_bucket: PRIOR_OUTPUT_BUCKET,
                  storage_path: PRIOR_OUTPUT_PATH,
                  file_name: PRIOR_OUTPUT_FILENAME,
                  contribution_type: "antithesis",
                },
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                  return Promise.resolve({
                    data: new Blob([malformedJson]),
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt({
              dbClient: client,
              fileManager,
              job: mockSeedJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: spy(async () => { return {
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: "",
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: undefined,
                reference_documents: undefined,
                constraint_boundaries: undefined,
                stakeholder_considerations: undefined,
                deliverable_format: undefined,
                recipeStep: defaultStage.recipe_step,
              }}),
            });
  
          // 3. Assert:
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-recursive";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const partialContent = "some partial text";
  
            const mockRecursiveJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-recursive-explicit", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 2, max_retries: 5, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([partialContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
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
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
          // 3. Assert:
          //    - Verify the next prompt is assembled with the correct stateless logic (e.g., still a simple "please continue" instruction).
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.turnIndex, 3); // 2 prior attempts + this one
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-mixed-ec";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const malformedJson = `{"key": oops}`; // Corrective content
  
            const mockMixedJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-mixed-e-to-c", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([malformedJson]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
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
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
          // 3. Assert:
          //    - Verify the prior output content is present in the resulting prompt.
              assert(result.promptContent.endsWith(malformedJson));
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-mixed-ce";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            // This content is valid but conceptually represents a truncated stream that needs an explicit continue.
            const partialValidJson = `{"key": "this is valid but we pretend it was cut off"`;
  
            const mockMixedJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-mixed-c-to-e", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([partialValidJson]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
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
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
              // 3. Assert:
              //    - Verify the prior output content is present in the resulting prompt.
              assert(result.promptContent.endsWith(partialValidJson));
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-mixed-cc";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
            const stillMalformedJson = `{"key": "value", "anotherkey"}`;
  
            const mockRecursiveCorrectiveJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-recursive-corrective", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 2, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([stillMalformedJson]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
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
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
          // 3. Assert:
          //    - Verify the resulting prompt is another CORRECTIVE prompt, asking the model to try again.
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.turnIndex, 3);
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
          "D.1: should throw an error if target_contribution_id is not provided in the job payload",
          async () => {
            // 1. Execute & Assert:
            //    - Call `assembleContinuationPrompt` with a job missing `target_contribution_id`.
            //    - Verify `assertRejects` with a "PRECONDITION_FAILED" error message.
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [
                      {
                        id: "model-123",
                        name: "Test Model",
                        provider: "test",
                        slug: "test-model",
                      },
                    ],
                  },
                },
              },
            };
            const { client, fileManager } = setup(config);
            const jobWithoutTarget = createMockJob(
              { model_id: "model-123", target_contribution_id: undefined },
              { id: "job-no-target" },
            );
  
            const baseArgs = {
              dbClient: client,
              fileManager,
              job: jobWithoutTarget,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: spy(async () => { return {
                user_objective: "",
                domain: "",
                agent_count: 0,
                context_description: "",
                original_user_request: "",
                prior_stage_ai_outputs: "",
                prior_stage_user_feedback: "",
                deployment_context: undefined,
                reference_documents: undefined,
                constraint_boundaries: undefined,
                stakeholder_considerations: undefined,
                deliverable_format: undefined,
                recipeStep: defaultStage.recipe_step,
              }}),
              render: spy(() => "rendered prompt"),
            };
  
            await assertRejects(
              () => assembleContinuationPrompt(baseArgs),
              Error,
              "PRECONDITION_FAILED"
            );
          },
        );
  
        await t.step(
          "D.2: should throw an error if a HeaderContext is required (TurnPrompt) but cannot be fetched",
          async () => {
            // 1. Setup:
            //    - Configure a mock 'Turn' job with header_context_id AND target_contribution_id.
            //    - Mock the storage download for HEADER to throw an error.
            //    - We also need to mock the prior output contribution/storage just to pass that check if it happens before header (though logical order might vary, typically header fetch comes first or they are independent).
            const HEADER_CONTEXT_CONTRIBUTION_ID = "header-contrib-fail";
            const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
            const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
            const HEADER_CONTEXT_FILE_NAME = "header_context.json";
            const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-ok";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
  
            const mockTurnJob = createMockJob(
              { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-turn-fetch-fail", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                    storage_bucket: HEADER_CONTEXT_STORAGE_BUCKET,
                    storage_path: HEADER_CONTEXT_STORAGE_PATH,
                    file_name: HEADER_CONTEXT_FILE_NAME,
                    contribution_type: "header_context",
                  },
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({ data: null, error: new Error("Storage download failed") });
                  }
                  // Allow prior output download to succeed (or not, header fails first hopefully)
                  return Promise.resolve({ data: new Blob(["content"]), error: null });
                },
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
                  gatherContext: spy(async () => { return {
                    user_objective: "",
                    domain: "",
                    agent_count: 0,
                    context_description: "",
                    original_user_request: "",
                    prior_stage_ai_outputs: "",
                    prior_stage_user_feedback: "",
                    deployment_context: undefined,
                    reference_documents: undefined,
                    constraint_boundaries: undefined,
                    stakeholder_considerations: undefined,
                    deliverable_format: undefined,
                    recipeStep: defaultStage.recipe_step,
                  }}),
                }),
              Error,
              "Failed to download header context file from storage",
            );
          },
        );
  
        await t.step(
          "D.3: should NOT throw for missing HeaderContext when not required (Planner/Seed)",
          async () => {
            // 1. Setup:
            //    - Configure a mock 'PLAN' job.
            //    - Mock prior output to succeed.
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-ok-no-header";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
  
            const mockPlannerJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-plan-no-header", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 0, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob(["content"]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
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
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
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
            const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-ok-fm-fail";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
  
            const mockPlannerJob = createMockJob(
              { model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-plan-fm-fail", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 0, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob(["content"]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
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
                  gatherContext: spy(async () => { return {
                    user_objective: "",
                    domain: "",
                    agent_count: 0,
                    context_description: "",
                    original_user_request: "",
                    prior_stage_ai_outputs: "",
                    prior_stage_user_feedback: "",
                    deployment_context: undefined,
                    reference_documents: undefined,
                    constraint_boundaries: undefined,
                    stakeholder_considerations: undefined,
                    deliverable_format: undefined,
                    recipeStep: defaultStage.recipe_step,
                  }}),
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
                  job: createMockJob({ model_id: "model-no-model" }),
                  project: defaultProject,
                  session: sessionWithNoModels,
                  stage: defaultStage,
                  gatherContext: spy(async () => { return {
                    user_objective: "",
                    domain: "",
                    agent_count: 0,
                    context_description: "",
                    original_user_request: "",
                    prior_stage_ai_outputs: "",
                    prior_stage_user_feedback: "",
                    deployment_context: undefined,
                    reference_documents: undefined,
                    constraint_boundaries: undefined,
                    stakeholder_considerations: undefined,
                    deliverable_format: undefined,
                    recipeStep: defaultStage.recipe_step,
                  }}),
                }),
              Error,
              "Session has no selected models",
            );
          },
        );
  
    await t.step("Category E: Source Contribution Metadata", async (t) => {
        await t.step(
          "E.1: should forward sourceContributionId when continuation references a prior contribution",
          async () => {
            const sourceContributionId = "contrib-123";
            const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
            const PRIOR_OUTPUT_PATH = "path/to/prior";
            const PRIOR_OUTPUT_FILENAME = "prior_output.json";
            const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
  
            const mockContinuationJob = createMockJob(
              { model_id: "model-123", target_contribution_id: sourceContributionId },
              { id: "job-cont-source-link", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 0, target_contribution_id: sourceContributionId },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{
                      id: "model-123",
                      name: "Test Model",
                      provider: "test",
                      slug: "test-model",
                    }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [sourceContributionId]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob(["continuation content"]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
            try {
              await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockContinuationJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadArgs =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(
                uploadArgs.pathContext.sourceContributionId,
                sourceContributionId,
              );
            } finally {
              teardown();
            }
          },
        );
      },
    );
  
    await t.step(
      "Category F: Header Context Contribution ID Lookup (Step 10.b)",
      async (t) => {
        const HEADER_CONTEXT_CONTRIBUTION_ID = "header-context-contrib-id";
        const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
        const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
        const HEADER_CONTEXT_FILE_NAME = "header_context.json";
        const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
        const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-f";
        const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
        const PRIOR_OUTPUT_PATH = "path/to/prior";
        const PRIOR_OUTPUT_FILENAME = "prior_output.json";
        const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
  
        await t.step(
          "10.b.i: should successfully query and download header context using contribution ID from inputs",
          async () => {
            const mockTurnJob = createMockJob(
              { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-turn-contrib-id", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                    storage_bucket: HEADER_CONTEXT_STORAGE_BUCKET,
                    storage_path: HEADER_CONTEXT_STORAGE_PATH,
                    file_name: HEADER_CONTEXT_FILE_NAME,
                    contribution_type: "header_context",
                  },
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === HEADER_CONTEXT_STORAGE_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContextContent)]),
                      error: null,
                    });
                  }
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob(["This is the partial markdown content."]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
            const partialContent = "This is the partial markdown content.";
  
            // Access storage spy before the call so it tracks calls correctly
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from(HEADER_CONTEXT_STORAGE_BUCKET).downloadSpy;
  
            try {
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockTurnJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "mock user objective",
                  domain: "Software Development",
                  agent_count: 1,
                  context_description: "A test context",
                  original_user_request: "The original request",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
              assertSpyCall(downloadSpy, 0); // At least one call to this bucket
              
              assert(
                result.promptContent.includes(
                  headerContextContent.system_materials.agent_notes_to_self,
                ),
              );
              assert(result.promptContent.endsWith(partialContent));
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "10.b.ii: should work correctly when inputs.header_context_id is missing (header context is optional)",
          async () => {
            const mockPlannerJob = createMockJob(
              { inputs: {}, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-plan-no-header-id", job_type: "PLAN", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 0, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob(["This is partial content without header context."]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
            const partialContent = "This is partial content without header context.";
  
            try {
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockPlannerJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "",
                  domain: "",
                  agent_count: 0,
                  context_description: "",
                  original_user_request: "",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  constraint_boundaries: undefined,
                  stakeholder_considerations: undefined,
                  deliverable_format: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
              assert(!result.promptContent.includes(headerContextContent.system_materials.agent_notes_to_self));
              assert(result.promptContent.endsWith(partialContent));
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "10.b.iii: should throw an error when inputs.header_context_id is provided but contribution is not found",
          async () => {
            const mockTurnJob = createMockJob(
              { inputs: { header_context_id: "non-existent-contrib-id" }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-turn-missing-contrib", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: {
                  select: async () => ({
                    data: null,
                    error: new Error("Contribution not found"),
                    count: 0,
                    status: 404,
                    statusText: "Not Found",
                  }),
                },
              },
            };
            const { client, fileManager } = setup(config);
  
            try {
              await assertRejects(
                () =>
                  assembleContinuationPrompt({
                    dbClient: client,
                    fileManager,
                    job: mockTurnJob,
                    project: defaultProject,
                    session: defaultSession,
                    stage: defaultStage,
                    gatherContext: spy(async () => { return {
                      user_objective: "",
                      domain: "",
                      agent_count: 0,
                      context_description: "",
                      original_user_request: "",
                      prior_stage_ai_outputs: "",
                      prior_stage_user_feedback: "",
                      deployment_context: undefined,
                      reference_documents: undefined,
                      constraint_boundaries: undefined,
                      stakeholder_considerations: undefined,
                      deliverable_format: undefined,
                      recipeStep: defaultStage.recipe_step,
                    }}),
                  }),
                Error,
                "contribution",
              );
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "10.b.iv: should use the contribution's storage_bucket instead of hardcoded 'dialectic_project_resources'",
          async () => {
            const CUSTOM_BUCKET = "custom-contributions-bucket";
            
            const mockTurnJob = createMockJob(
              { inputs: { header_context_id: HEADER_CONTEXT_CONTRIBUTION_ID }, model_id: "model-123", target_contribution_id: PRIOR_OUTPUT_CONTRIB_ID },
              { id: "job-turn-custom-bucket", job_type: "EXECUTE", session_id: defaultSession.id, stage_slug: defaultStage.slug, user_id: defaultProject.user_id, attempt_count: 1, target_contribution_id: null },
            );
  
            const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                ai_providers: {
                  select: {
                    data: [{ id: "model-123", name: "Test Model", provider: "test", slug: "test-model" }],
                  },
                },
                dialectic_contributions: createContributionsMock({
                  [HEADER_CONTEXT_CONTRIBUTION_ID]: {
                    storage_bucket: CUSTOM_BUCKET,
                    storage_path: HEADER_CONTEXT_STORAGE_PATH,
                    file_name: HEADER_CONTEXT_FILE_NAME,
                    contribution_type: "header_context",
                  },
                  [PRIOR_OUTPUT_CONTRIB_ID]: {
                    storage_bucket: PRIOR_OUTPUT_BUCKET,
                    storage_path: PRIOR_OUTPUT_PATH,
                    file_name: PRIOR_OUTPUT_FILENAME,
                    contribution_type: "antithesis",
                  },
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === CUSTOM_BUCKET && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContextContent)]),
                      error: null,
                    });
                  }
                  if (bucket === PRIOR_OUTPUT_BUCKET && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob(["This is the partial markdown content."]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
            const partialContent = "This is the partial markdown content.";
  
            // Access storage spy before the call so it tracks calls correctly
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from(CUSTOM_BUCKET).downloadSpy;
  
            try {
              const result = await assembleContinuationPrompt({
                dbClient: client,
                fileManager,
                job: mockTurnJob,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: spy(async () => { return {
                  user_objective: "mock user objective",
                  domain: "Software Development",
                  agent_count: 1,
                  context_description: "A test context",
                  original_user_request: "The original request",
                  prior_stage_ai_outputs: "",
                  prior_stage_user_feedback: "",
                  deployment_context: undefined,
                  reference_documents: undefined,
                  recipeStep: defaultStage.recipe_step,
                }}),
              });
  
              assertSpyCall(downloadSpy, 0);
              assertEquals(downloadSpy.calls[0].args[0], fullHeaderPath);
  
              assert(
                result.promptContent.includes(
                  headerContextContent.system_materials.agent_notes_to_self,
                ),
              );
            } finally {
              teardown();
            }
          },
        );
      },
    );
      });
    });
  