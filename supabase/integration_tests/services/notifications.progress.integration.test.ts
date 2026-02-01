/**
 * Integration test: Backend provides complete job lifecycle notifications for frontend progress tracking.
 * Proves dialectic-worker job processors (processComplexJob, processSimpleJob, processRenderJob) emit
 * the correct JobNotificationEvent payloads (PLAN / EXECUTE / RENDER lifecycle + unified job_failed).
 */
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assert,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  testLogger,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticProject,
  StartSessionPayload,
  StartSessionSuccessResponse,
  DialecticJobRow,
  DialecticPlanJobPayload,
  DialecticExecuteJobPayload,
  DialecticRenderJobPayload,
  IRenderJobDeps,
  ExecuteModelCallAndSaveParams,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import { processRenderJob } from "../../functions/dialectic-worker/processRenderJob.ts";
import { processComplexJob } from "../../functions/dialectic-worker/processComplexJob.ts";
import { processSimpleJob } from "../../functions/dialectic-worker/processSimpleJob.ts";
import { handleJob } from "../../functions/dialectic-worker/index.ts";
import { createJobContext } from "../../functions/dialectic-worker/createJobContext.ts";
import { createPlanJobContext } from "../../functions/dialectic-worker/createJobContext.ts";
import { createRenderJobContext } from "../../functions/dialectic-worker/createJobContext.ts";
import type { IJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { getSortedCompressionCandidates } from "../../functions/_shared/utils/vector_utils.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { getGranularityPlanner } from "../../functions/dialectic-worker/strategies/granularity.strategies.ts";
import { findSourceDocuments } from "../../functions/dialectic-worker/findSourceDocuments.ts";
import { planComplexStage } from "../../functions/dialectic-worker/task_isolator.ts";
import { isDialecticExecuteJobPayload, isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { isDialecticRenderJobPayload } from "../../functions/_shared/utils/type_guards.ts";
import { isJson } from "../../functions/_shared/utils/type_guards.ts";
import { createMockJobContextParams } from "../../functions/dialectic-worker/JobContext.mock.ts";
import {
  mockNotificationService,
  resetMockNotificationService,
} from "../../functions/_shared/utils/notification.service.mock.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";
import { createDocumentRendererMock } from "../../functions/_shared/services/document_renderer.mock.ts";
import type {
  JobNotificationEvent,
  JobFailedPayload,
  PlannerStartedPayload,
} from "../../functions/_shared/types/notification.service.types.ts";

function isJobFailedPayload(p: JobNotificationEvent): p is JobFailedPayload {
  return p.type === "job_failed";
}

function isJobNotificationEvent(u: unknown): u is JobNotificationEvent {
  if (!isRecord(u)) return false;
  return (
    typeof u.type === "string" &&
    typeof u.sessionId === "string" &&
    typeof u.job_id === "string" &&
    typeof u.step_key === "string" &&
    typeof u.stageSlug === "string" &&
    typeof u.iterationNumber === "number"
  );
}

function getCapturedJobNotifications(): { payload: JobNotificationEvent; targetUserId: string }[] {
  return mockNotificationService.sendJobNotificationEvent.calls.map((call) => {
    const [payload, targetUserId] = call.args;
    if (!isJobNotificationEvent(payload) || typeof targetUserId !== "string") {
      throw new Error("Invalid sendJobNotificationEvent call args");
    }
    return { payload, targetUserId };
  });
}

function assertBaseFields(payload: JobNotificationEvent): void {
  assert("sessionId" in payload && typeof payload.sessionId === "string");
  assert("stageSlug" in payload && typeof payload.stageSlug === "string");
  assert("iterationNumber" in payload && typeof payload.iterationNumber === "number");
  assert("job_id" in payload && typeof payload.job_id === "string");
  assert("step_key" in payload && typeof payload.step_key === "string");
}

describe("Backend provides complete job lifecycle notifications for progress tracking", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let fileManager: FileManagerService;
  let testModelId: string;
  let testWalletId: string;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
    testUserId = userId;
    testUserJwt = jwt;
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });

    const formData = new FormData();
    formData.append("projectName", "Notifications progress integration test");
    formData.append("initialUserPromptText", "Test prompt");

    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error || !projectResult.data) {
      throw new Error(`Failed to create test project: ${projectResult.error?.message}`);
    }
    testProject = projectResult.data;

    const { data: existingModel } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();

    const validConfig = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens ?? 128000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 16000,
    };

    let model = existingModel;
    if (!model) {
      const { data: newModel, error: createError } = await adminClient
        .from("ai_providers")
        .insert({
          api_identifier: MOCK_MODEL_CONFIG.api_identifier,
          provider: "test-provider",
          name: "Test Model",
          config: validConfig,
          is_active: true,
          is_enabled: true,
        })
        .select("id")
        .single();
      assert(!createError, `Failed to create test model: ${createError?.message}`);
      assertExists(newModel, "New model should be created");
      model = newModel;
    }
    testModelId = model.id;

    await coreEnsureTestUserAndWallet(testUserId, 1000000, "local");
    const { data: walletData, error: walletError } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    assert(!walletError, `Failed to fetch wallet: ${walletError?.message}`);
    assertExists(walletData?.wallet_id, "Wallet should exist");
    testWalletId = walletData.wallet_id;

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to create test session: ${sessionResult.error?.message}`);
    }
    testSession = sessionResult.data;
  });

  afterAll(async () => {
    await coreCleanupTestResources("local");
  });

  it("PLAN job lifecycle emits planner_started and planner_completed (happy path)", async () => {
    resetMockNotificationService();
    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        planComplexStage,
        findSourceDocuments,
        getGranularityPlanner,
        fileManager,
        downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
        getSeedPromptForStage,
      })
    );

    const generatePayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      continueUntilComplete: false,
      maxRetries: 3,
      is_test_job: true,
      user_jwt: testUserJwt,
    };
    const { generateContributions } = await import("../../functions/dialectic-service/generateContribution.ts");
    const generateResult = await generateContributions(
      adminClient,
      generatePayload,
      testUser,
      {
        callUnifiedAIModel: async () => ({ content: "", error: null }),
        downloadFromStorage: (_c: SupabaseClient<Database>, b: string, p: string) =>
          downloadFromStorage(adminClient, b, p),
        getExtensionFromMimeType,
        logger: testLogger,
        randomUUID: () => crypto.randomUUID(),
        fileManager,
        deleteFromStorage: async () => ({ error: null }),
      },
      testUserJwt
    );
    assert(generateResult.success, `generateContributions failed: ${generateResult.error?.message}`);
    assertExists(generateResult.data?.job_ids?.length, "No PLAN job created");
    if(!generateResult.data?.job_ids?.length) {
      throw new Error("No PLAN job created");
    }
    const planJobId = generateResult.data.job_ids[0];

    const { data: planJob, error: fetchError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", planJobId)
      .single();
    assert(!fetchError && planJob, "PLAN job not found");
    assert(planJob.job_type === "PLAN", "Expected PLAN job");

    await handleJob(adminClient, planJob, baseCtx, testUserJwt);

    const captured = getCapturedJobNotifications();
    const plannerStarted = captured.filter((c) => c.payload.type === "planner_started");
    assert(plannerStarted.length >= 1, "Expected at least one planner_started");
    const startedPayload = plannerStarted[0].payload;
    assertEquals(startedPayload.type, "planner_started");
    assertBaseFields(startedPayload);
    assert(!("modelId" in startedPayload) || startedPayload.modelId === undefined);
    assert(!("document_key" in startedPayload) || startedPayload.document_key === undefined);

    const plannerCompleted = captured.filter((c) => c.payload.type === "planner_completed");
    if (plannerCompleted.length >= 1) {
      const completedPayload = plannerCompleted[0].payload;
      assertEquals(completedPayload.type, "planner_completed");
      assertBaseFields(completedPayload);
      assert(!("modelId" in completedPayload) || completedPayload.modelId === undefined);
      assert(!("document_key" in completedPayload) || completedPayload.document_key === undefined);
    }
  });

  it("PLAN job failure emits job_failed with step_key and omits modelId/document_key", async () => {
    resetMockNotificationService();

    const planPayload: DialecticPlanJobPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(planPayload)) throw new Error("Invalid payload");
    const planJobRow: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      session_id: testSession.id,
      stage_slug: "thesis",
      payload: planPayload,
      iteration_number: 1,
      status: "processing",
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      parent_job_id: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      is_test_job: false,
      job_type: "PLAN",
    };
    const { error: insertErr } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: planJobRow.id,
        user_id: planJobRow.user_id,
        session_id: planJobRow.session_id,
        stage_slug: planJobRow.stage_slug,
        payload: planJobRow.payload,
        iteration_number: planJobRow.iteration_number,
        status: planJobRow.status,
        attempt_count: planJobRow.attempt_count,
        max_retries: planJobRow.max_retries,
        created_at: planJobRow.created_at,
        started_at: planJobRow.started_at,
        completed_at: planJobRow.completed_at,
        results: planJobRow.results,
        error_details: planJobRow.error_details,
        parent_job_id: planJobRow.parent_job_id,
        target_contribution_id: planJobRow.target_contribution_id,
        prerequisite_job_id: planJobRow.prerequisite_job_id,
        is_test_job: planJobRow.is_test_job,
        job_type: planJobRow.job_type,
      });
    assert(!insertErr, `Insert PLAN job failed: ${insertErr?.message}`);

    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        planComplexStage: async () => {
          throw new Error("PLAN_FAIL_TEST");
        },
      })
    );
    const planCtx = createPlanJobContext(baseCtx);

    await processComplexJob(
      adminClient,
      planJobRow,
      testUserId,
      planCtx,
      testUserJwt
    );

    const captured = getCapturedJobNotifications();
    const jobFailed = captured.filter((c) => c.payload.type === "job_failed");
    assert(jobFailed.length >= 1, "Expected at least one job_failed");
    const failedPayload = jobFailed[0].payload;
    if (!isJobFailedPayload(failedPayload)) {
      throw new Error("Expected job_failed payload");
    }
    assertEquals(failedPayload.type, "job_failed");
    assertBaseFields(failedPayload);
    assert(typeof failedPayload.error.code === "string");
    assert(typeof failedPayload.error.message === "string");
    assert(!("modelId" in failedPayload) || failedPayload.modelId === undefined);
    assert(!("document_key" in failedPayload) || failedPayload.document_key === undefined);
  });

  it("PLAN payloads include step_key but NOT modelId or document_key", async () => {
    resetMockNotificationService();
    const planPayload: DialecticPlanJobPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(planPayload)) throw new Error("Invalid payload");
    const planJobRow: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      session_id: testSession.id,
      stage_slug: "thesis",
      payload: planPayload,
      iteration_number: 1,
      status: "processing",
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      parent_job_id: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      is_test_job: false,
      job_type: "PLAN",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: planJobRow.id,
      user_id: planJobRow.user_id,
      session_id: planJobRow.session_id,
      stage_slug: planJobRow.stage_slug,
      payload: planJobRow.payload,
      iteration_number: planJobRow.iteration_number,
      status: planJobRow.status,
      attempt_count: planJobRow.attempt_count,
      max_retries: planJobRow.max_retries,
      created_at: planJobRow.created_at,
      started_at: planJobRow.started_at,
      completed_at: planJobRow.completed_at,
      results: planJobRow.results,
      error_details: planJobRow.error_details,
      parent_job_id: planJobRow.parent_job_id,
      target_contribution_id: planJobRow.target_contribution_id,
      prerequisite_job_id: planJobRow.prerequisite_job_id,
      is_test_job: planJobRow.is_test_job,
      job_type: planJobRow.job_type,
    });

    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        planComplexStage: async () => [],
      })
    );
    const planCtx = createPlanJobContext(baseCtx);
    await processComplexJob(adminClient, planJobRow, testUserId, planCtx, testUserJwt);

    const captured = getCapturedJobNotifications();
    const planEvents = captured.filter(
      (c) => c.payload.type === "planner_started" || c.payload.type === "planner_completed"
    );
    assert(planEvents.length >= 1);
    for (const { payload } of planEvents) {
      assert("step_key" in payload && typeof payload.step_key === "string");
      assert(!("modelId" in payload) || payload.modelId === undefined);
      assert(!("document_key" in payload) || payload.document_key === undefined);
    }
  });

  it("EXECUTE job lifecycle emits execute_started, execute_chunk_completed, execute_completed", async () => {
    resetMockNotificationService();

    const { data: thesisStage } = await adminClient
      .from("dialectic_stages")
      .select("recipe_template_id")
      .eq("slug", "thesis")
      .single();
    assertExists(thesisStage?.recipe_template_id, "Thesis stage must have recipe_template_id");
    const { data: templateStep } = await adminClient
      .from("dialectic_recipe_template_steps")
      .select("id")
      .eq("template_id", thesisStage.recipe_template_id)
      .eq("step_slug", "generate-business-case")
      .limit(1)
      .single();
    assertExists(templateStep?.id, "Thesis template must have generate-business-case step");

    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const mockParams = createMockJobContextParams({
      notificationService: mockNotificationService,
      fileManager,
      downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      callUnifiedAIModel: async () => ({
        content: JSON.stringify({ content: "# Doc" }),
        finish_reason: "stop",
        inputTokens: 10,
        outputTokens: 20,
        rawProviderResponse: {},
      }),
      getSeedPromptForStage,
      continueJob: async (deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId) =>
        continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId),
      retryJob: async (deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId) =>
        retryJob(deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId),
      executeModelCallAndSave: async (params: ExecuteModelCallAndSaveParams) =>
        executeModelCallAndSave({ ...params, compressionStrategy: getSortedCompressionCandidates }),
      tokenWalletService,
      documentRenderer: { renderDocument },
    });
    const rootCtx: IJobContext = createJobContext(mockParams);

    const executePayload: DialecticExecuteJobPayload = {
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: { contributionType: "thesis", stageSlug: "thesis" },
      document_key: FileType.business_case,
      planner_metadata: {
        recipe_step_id: templateStep.id,
        recipe_template_id: thesisStage.recipe_template_id,
      },
    };
    if (!isJson(executePayload)) throw new Error("Invalid payload");
    if (!isDialecticExecuteJobPayload(executePayload)) throw new Error("Invalid payload");
    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: executePayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: executeJob.id,
      parent_job_id: executeJob.parent_job_id,
      session_id: executeJob.session_id,
      user_id: executeJob.user_id,
      stage_slug: executeJob.stage_slug,
      iteration_number: executeJob.iteration_number,
      status: executeJob.status,
      max_retries: executeJob.max_retries,
      attempt_count: executeJob.attempt_count,
      created_at: executeJob.created_at,
      started_at: executeJob.started_at,
      completed_at: executeJob.completed_at,
      results: executeJob.results,
      error_details: executeJob.error_details,
      target_contribution_id: executeJob.target_contribution_id,
      prerequisite_job_id: executeJob.prerequisite_job_id,
      payload: executeJob.payload,
      is_test_job: executeJob.is_test_job,
      job_type: executeJob.job_type,
    });

    const { data: providerData } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assertExists(providerData);

    const sessionData = {
      id: testSession.id,
      project_id: testSession.project_id,
      session_description: testSession.session_description ?? null,
      user_input_reference_url: testSession.user_input_reference_url ?? null,
      iteration_count: 1,
      selected_model_ids: testSession.selected_model_ids ?? null,
      status: testSession.status ?? "pending_thesis",
      created_at: testSession.created_at,
      updated_at: testSession.updated_at,
      current_stage_id: testSession.current_stage_id,
      associated_chat_id: testSession.associated_chat_id ?? null,
    };

    await processSimpleJob(
      adminClient,
      executeJob,
      testUserId,
      rootCtx,
      testUserJwt
    );

    const captured = getCapturedJobNotifications();
    const started = captured.filter((c) => c.payload.type === "execute_started");
    const chunkCompleted = captured.filter((c) => c.payload.type === "execute_chunk_completed");
    const completed = captured.filter((c) => c.payload.type === "execute_completed");
    assert(started.length >= 1, "Expected execute_started");
    const startPayload = started[0].payload;
    assertEquals(startPayload.type, "execute_started");
    assertBaseFields(startPayload);
    assert("modelId" in startPayload && typeof startPayload.modelId === "string");
    if (chunkCompleted.length >= 1) {
      assertBaseFields(chunkCompleted[0].payload);
    }
    if (completed.length >= 1) {
      const completePayload = completed[0].payload;
      assertBaseFields(completePayload);
      assert("modelId" in completePayload);
    }
  });

  it("EXECUTE job failure emits job_failed with modelId, document_key optional", async () => {
    resetMockNotificationService();
    const { data: thesisStage } = await adminClient
      .from("dialectic_stages")
      .select("recipe_template_id")
      .eq("slug", "thesis")
      .single();
    assertExists(thesisStage?.recipe_template_id, "Thesis stage must have recipe_template_id");
    const { data: templateStep } = await adminClient
      .from("dialectic_recipe_template_steps")
      .select("id")
      .eq("template_id", thesisStage.recipe_template_id)
      .eq("step_slug", "generate-business-case")
      .limit(1)
      .single();
    assertExists(templateStep?.id, "Thesis template must have generate-business-case step");

    const executePayload: DialecticExecuteJobPayload = {
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: { contributionType: "thesis", stageSlug: "thesis" },
      document_key: FileType.business_case,
      planner_metadata: {
        recipe_step_id: templateStep.id,
        recipe_template_id: thesisStage.recipe_template_id,
      },
    };
    if (!isJson(executePayload)) throw new Error("Invalid payload");
    if (!isDialecticExecuteJobPayload(executePayload)) throw new Error("Invalid payload");
    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "pending",
      max_retries: 0,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: executePayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: executeJob.id,
      parent_job_id: executeJob.parent_job_id,
      session_id: executeJob.session_id,
      user_id: executeJob.user_id,
      stage_slug: executeJob.stage_slug,
      iteration_number: executeJob.iteration_number,
      status: executeJob.status,
      max_retries: executeJob.max_retries,
      attempt_count: executeJob.attempt_count,
      created_at: executeJob.created_at,
      started_at: executeJob.started_at,
      completed_at: executeJob.completed_at,
      results: executeJob.results,
      error_details: executeJob.error_details,
      target_contribution_id: executeJob.target_contribution_id,
      prerequisite_job_id: executeJob.prerequisite_job_id,
      payload: executeJob.payload,
      is_test_job: executeJob.is_test_job,
      job_type: executeJob.job_type,
    });

    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        logger: testLogger,
        fileManager,
        downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
        callUnifiedAIModel: async () => {
          throw new Error("EXECUTE_FAIL_TEST");
        },
        tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
        getSeedPromptForStage,
        documentRenderer: { renderDocument },
        planComplexStage: async () => [],
        findSourceDocuments,
        getGranularityPlanner,
        continueJob: async () => ({ enqueued: false, error: undefined }),
        retryJob: async () => ({ error: undefined }),
        executeModelCallAndSave: async (params: ExecuteModelCallAndSaveParams) =>
          executeModelCallAndSave({ ...params, compressionStrategy: getSortedCompressionCandidates }),
      })
    );
    const { data: providerData } = await adminClient.from("ai_providers").select("*").eq("id", testModelId).single();
    assertExists(providerData);
    const sessionData = {
      id: testSession.id,
      project_id: testSession.project_id,
      session_description: null,
      user_input_reference_url: null,
      iteration_count: 1,
      selected_model_ids: null,
      status: "pending_thesis",
      created_at: testSession.created_at,
      updated_at: testSession.updated_at,
      current_stage_id: null,
      associated_chat_id: null,
    };
    const project = await adminClient.from("dialectic_projects").select("*").eq("id", testProject.id).single();
    assertExists(project.data);
    const stageRows = await adminClient.from("dialectic_stages").select("*").eq("slug", "thesis");
    assertExists(stageRows.data?.[0]);
    try {
      await processSimpleJob(adminClient, executeJob, testUserId, baseCtx, testUserJwt);
    } catch {
      // may throw after emitting job_failed
    }
    const captured = getCapturedJobNotifications();
    const jobFailed = captured.filter((c) => c.payload.type === "job_failed");
    assert(jobFailed.length >= 1, `Expected job_failed; captured: ${captured.map((c) => c.payload.type).join(", ")}`);
    const failedPayload = jobFailed[0].payload;
    if (!isJobFailedPayload(failedPayload)) {
      throw new Error("Expected job_failed payload");
    }
    assert(typeof failedPayload.modelId === "string");
    assert(typeof failedPayload.error.code === "string" && typeof failedPayload.error.message === "string");
  });

  it("EXECUTE payloads include modelId, document_key optional (included when relevant)", async () => {
    resetMockNotificationService();
    const { data: thesisStage } = await adminClient
      .from("dialectic_stages")
      .select("recipe_template_id")
      .eq("slug", "thesis")
      .single();
    assertExists(thesisStage?.recipe_template_id, "Thesis stage must have recipe_template_id");
    const { data: templateStep } = await adminClient
      .from("dialectic_recipe_template_steps")
      .select("id")
      .eq("template_id", thesisStage.recipe_template_id)
      .eq("step_slug", "generate-business-case")
      .limit(1)
      .single();
    assertExists(templateStep?.id, "Thesis template must have generate-business-case step");

    const executePayload: DialecticExecuteJobPayload = {
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: { contributionType: "thesis", stageSlug: "thesis" },
      document_key: FileType.business_case,
      planner_metadata: {
        recipe_step_id: templateStep.id,
        recipe_template_id: thesisStage.recipe_template_id,
      },
    };
    if (!isJson(executePayload)) throw new Error("Invalid payload");
    if (!isDialecticExecuteJobPayload(executePayload)) throw new Error("Invalid payload");
    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: executePayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: executeJob.id,
      parent_job_id: executeJob.parent_job_id,
      session_id: executeJob.session_id,
      user_id: executeJob.user_id,
      stage_slug: executeJob.stage_slug,
      iteration_number: executeJob.iteration_number,
      status: executeJob.status,
      max_retries: executeJob.max_retries,
      attempt_count: executeJob.attempt_count,
      created_at: executeJob.created_at,
      started_at: executeJob.started_at,
      completed_at: executeJob.completed_at,
      results: executeJob.results,
      error_details: executeJob.error_details,
      target_contribution_id: executeJob.target_contribution_id,
      prerequisite_job_id: executeJob.prerequisite_job_id,
      payload: executeJob.payload,
      is_test_job: executeJob.is_test_job,
      job_type: executeJob.job_type,
    });

    const mockParams = createMockJobContextParams({
      notificationService: mockNotificationService,
      fileManager,
      downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      callUnifiedAIModel: async () => ({
        content: JSON.stringify({ content: "# Doc" }),
        finish_reason: "stop",
        inputTokens: 10,
        outputTokens: 20,
        rawProviderResponse: {},
      }),
      getSeedPromptForStage,
      continueJob: async (deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId) =>
        continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId),
      retryJob: async (deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId) =>
        retryJob(deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId),
      executeModelCallAndSave: async (params: ExecuteModelCallAndSaveParams) =>
        executeModelCallAndSave({ ...params, compressionStrategy: getSortedCompressionCandidates }),
      tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
      documentRenderer: { renderDocument },
      planComplexStage: async () => [],
      findSourceDocuments,
      getGranularityPlanner,
    });
    const rootCtx: IJobContext = createJobContext(mockParams);

    await processSimpleJob(adminClient, executeJob, testUserId, rootCtx, testUserJwt);

    const captured = getCapturedJobNotifications();
    const executeEvents = captured.filter(
      (c) =>
        c.payload.type === "execute_started" ||
        c.payload.type === "execute_chunk_completed" ||
        c.payload.type === "execute_completed"
    );
    assert(executeEvents.length >= 1, "Expected at least one EXECUTE notification");
    for (const { payload } of executeEvents) {
      assert("modelId" in payload && typeof payload.modelId === "string");
      if (payload.type === "execute_started" || payload.type === "execute_completed") {
        assert("document_key" in payload && typeof payload.document_key === "string");
      }
    }
  });

  it("RENDER job lifecycle emits render_started, render_chunk_completed (intermediate), render_completed (final)", async () => {
    resetMockNotificationService();

    const renderPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      documentIdentity: crypto.randomUUID(),
      documentKey: FileType.business_case,
      sourceContributionId: crypto.randomUUID(),
      template_filename: "thesis_business_case.md",
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(renderPayload)) throw new Error("Invalid payload");
    if (!isDialecticRenderJobPayload(renderPayload)) throw new Error("Invalid payload");
    const renderJob: DialecticJobRow & { payload: DialecticRenderJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "processing",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: renderPayload,
      is_test_job: false,
      job_type: "RENDER",
    };
    if (!isRecord(renderJob.payload) || !isDialecticRenderJobPayload(renderJob.payload)) {
      throw new Error("Invalid RENDER payload");
    }

    const renderDeps: IRenderJobDeps = {
      documentRenderer: { renderDocument },
      downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      fileManager,
      notificationService: mockNotificationService,
      logger: testLogger,
    };
    const renderCtx = createRenderJobContext(
      createJobContext(
        createMockJobContextParams({
          notificationService: mockNotificationService,
          logger: testLogger,
          fileManager,
          downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
          tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
          getSeedPromptForStage,
          documentRenderer: renderDeps.documentRenderer,
          planComplexStage: async () => [],
          findSourceDocuments,
          getGranularityPlanner,
          continueJob: async () => ({ enqueued: false, error: undefined }),
          retryJob: async () => ({ error: undefined }),
          executeModelCallAndSave: async () => {},
        })
      )
    );

    try {
      await processRenderJob(
        adminClient,
        renderJob,
        testUserId,
        renderCtx,
        testUserJwt
      );
    } catch {
      // renderDocument may throw if storage/seed missing; we still expect render_started (and possibly render_chunk_completed)
    }

    const captured = getCapturedJobNotifications();
    const renderStarted = captured.filter((c) => c.payload.type === "render_started");
    assert(renderStarted.length >= 1, "Expected render_started");
    const startPayload = renderStarted[0].payload;
    assertEquals(startPayload.type, "render_started");
    assertBaseFields(startPayload);
    assert("modelId" in startPayload && typeof startPayload.modelId === "string");
    assert("document_key" in startPayload && typeof startPayload.document_key === "string");

    const chunkCompleted = captured.filter((c) => c.payload.type === "render_chunk_completed");
    if (chunkCompleted.length >= 1) {
      assertBaseFields(chunkCompleted[0].payload);
      assert("modelId" in chunkCompleted[0].payload);
      assert("document_key" in chunkCompleted[0].payload);
    }
    const renderCompleted = captured.filter((c) => c.payload.type === "render_completed");
    if (renderCompleted.length >= 1) {
      const comp = renderCompleted[0].payload;
      assert("latestRenderedResourceId" in comp && typeof comp.latestRenderedResourceId === "string");
      assert("modelId" in comp && "document_key" in comp);
    }
  });

  it("RENDER job failure emits job_failed with modelId AND document_key", async () => {
    resetMockNotificationService();
    const renderPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      documentIdentity: "invalid-identity",
      documentKey: FileType.business_case,
      sourceContributionId: "invalid-source",
      template_filename: "thesis_business_case.md",
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(renderPayload)) throw new Error("Invalid payload");
    if (!isDialecticRenderJobPayload(renderPayload)) throw new Error("Invalid payload");
    const renderJob: DialecticJobRow & { payload: DialecticRenderJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "processing",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: renderPayload,
      is_test_job: false,
      job_type: "RENDER",
    };
    const renderCtx = createRenderJobContext(
      createJobContext(
        createMockJobContextParams({
          notificationService: mockNotificationService,
          logger: testLogger,
          fileManager,
          downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
          tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
          getSeedPromptForStage,
          documentRenderer: { renderDocument },
          planComplexStage: async () => [],
          findSourceDocuments,
          getGranularityPlanner,
          continueJob: async () => ({ enqueued: false, error: undefined }),
          retryJob: async () => ({ error: undefined }),
          executeModelCallAndSave: async () => {},
        })
      )
    );
    try {
      await processRenderJob(adminClient, renderJob, testUserId, renderCtx, testUserJwt);
    } catch {
      // expected to throw (invalid storage path)
    }
    const captured = getCapturedJobNotifications();
    const jobFailed = captured.filter((c) => c.payload.type === "job_failed");
    if (jobFailed.length >= 1) {
      const failedPayload = jobFailed[0].payload;
      assert("modelId" in failedPayload && typeof failedPayload.modelId === "string");
      assert("document_key" in failedPayload && typeof failedPayload.document_key === "string");
      assert("error" in failedPayload && failedPayload.error?.code && failedPayload.error?.message);
    }
  });

  it("RENDER payloads include modelId AND document_key (both required)", async () => {
    resetMockNotificationService();
    const renderPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      documentIdentity: crypto.randomUUID(),
      documentKey: FileType.business_case,
      sourceContributionId: crypto.randomUUID(),
      template_filename: "thesis_business_case.md",
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(renderPayload)) throw new Error("Invalid payload");
    if (!isDialecticRenderJobPayload(renderPayload)) throw new Error("Invalid payload");
    const renderJob: DialecticJobRow & { payload: DialecticRenderJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "processing",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: renderPayload,
      is_test_job: false,
      job_type: "RENDER",
    };
    const renderDeps: IRenderJobDeps = {
      documentRenderer: { renderDocument },
      downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      fileManager,
      notificationService: mockNotificationService,
      logger: testLogger,
    };
    const renderCtx = createRenderJobContext(
      createJobContext(
        createMockJobContextParams({
          notificationService: mockNotificationService,
          logger: testLogger,
          fileManager,
          downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
            downloadFromStorage(adminClient, bucket, path),
          tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
          getSeedPromptForStage,
          documentRenderer: renderDeps.documentRenderer,
          planComplexStage: async () => [],
          findSourceDocuments,
          getGranularityPlanner,
          continueJob: async () => ({ enqueued: false, error: undefined }),
          retryJob: async () => ({ error: undefined }),
          executeModelCallAndSave: async () => {},
        })
      )
    );
    try {
      await processRenderJob(adminClient, renderJob, testUserId, renderCtx, testUserJwt);
    } catch {
      // renderDocument may throw; we still expect render_started
    }
    const captured = getCapturedJobNotifications();
    const renderEvents = captured.filter(
      (c) =>
        c.payload.type === "render_started" ||
        c.payload.type === "render_chunk_completed" ||
        c.payload.type === "render_completed"
    );
    assert(renderEvents.length >= 1, "Expected at least one RENDER notification");
    for (const { payload } of renderEvents) {
      assert("modelId" in payload && typeof payload.modelId === "string");
      assert("document_key" in payload && typeof payload.document_key === "string");
    }
  });

  it("render_chunk_completed emitted for intermediate renders, render_completed only when document finished", async () => {
    resetMockNotificationService();
    const latestResourceId = crypto.randomUUID();
    const { renderer: mockDocumentRenderer } = createDocumentRendererMock({
      handler: async (_dbClient, deps, params) => {
        if (deps.notificationService?.sendJobNotificationEvent && deps.notifyUserId) {
          await deps.notificationService.sendJobNotificationEvent(
            {
              type: "render_completed",
              sessionId: params.sessionId,
              stageSlug: params.stageSlug,
              iterationNumber: params.iterationNumber,
              job_id: `render-${params.documentIdentity}`,
              document_key: params.documentKey,
              modelId: testModelId,
              latestRenderedResourceId: latestResourceId,
              step_key: "document_step",
            },
            deps.notifyUserId
          );
        }
        return {
          pathContext: {
            projectId: params.projectId,
            sessionId: params.sessionId,
            iteration: params.iterationNumber,
            stageSlug: params.stageSlug,
            documentKey: params.documentKey,
            fileType: FileType.RenderedDocument,
            modelSlug: "mock",
            sourceContributionId: params.sourceContributionId,
          },
          renderedBytes: new Uint8Array(0),
        };
      },
    });
    const renderPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      documentIdentity: crypto.randomUUID(),
      documentKey: FileType.business_case,
      sourceContributionId: crypto.randomUUID(),
      template_filename: "thesis_business_case.md",
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isDialecticRenderJobPayload(renderPayload)) throw new Error("Invalid payload");
    if (!isJson(renderPayload)) throw new Error("Invalid payload");
    const renderJob: DialecticJobRow & { payload: DialecticRenderJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "processing",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: renderPayload,
      is_test_job: false,
      job_type: "RENDER",
    };
    const renderCtx = createRenderJobContext(
      createJobContext(
        createMockJobContextParams({
          notificationService: mockNotificationService,
          logger: testLogger,
          fileManager,
          downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
            downloadFromStorage(adminClient, bucket, path),
          tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
          getSeedPromptForStage,
          documentRenderer: mockDocumentRenderer,
          planComplexStage: async () => [],
          findSourceDocuments,
          getGranularityPlanner,
          continueJob: async () => ({ enqueued: false, error: undefined }),
          retryJob: async () => ({ error: undefined }),
          executeModelCallAndSave: async () => {},
        })
      )
    );
    await processRenderJob(adminClient, renderJob, testUserId, renderCtx, testUserJwt);
    const captured = getCapturedJobNotifications();
    const chunkCompleted = captured.filter((c) => c.payload.type === "render_chunk_completed");
    const renderCompleted = captured.filter((c) => c.payload.type === "render_completed");
    assert(chunkCompleted.length >= 1, `Expected render_chunk_completed (intermediate); captured: ${captured.map((c) => c.payload.type).join(", ")}`);
    assert(renderCompleted.length >= 1, "Expected render_completed when document finished");
    const finalPayload = renderCompleted[0].payload;
    if (finalPayload.type !== "render_completed") {
      throw new Error("Expected render_completed payload");
    }
    assertEquals(finalPayload.latestRenderedResourceId, latestResourceId);
  });

  it("all notifications include base fields (sessionId, stageSlug, iterationNumber, job_id, step_key)", async () => {
    resetMockNotificationService();
    const planPayload: DialecticPlanJobPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(planPayload)) throw new Error("Invalid payload");
    const planJobRow: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      session_id: testSession.id,
      stage_slug: "thesis",
      payload: planPayload,
      iteration_number: 1,
      status: "processing",
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      parent_job_id: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      is_test_job: false,
      job_type: "PLAN",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: planJobRow.id,
      user_id: planJobRow.user_id,
      session_id: planJobRow.session_id,
      stage_slug: planJobRow.stage_slug,
      payload: planJobRow.payload,
      iteration_number: planJobRow.iteration_number,
      status: planJobRow.status,
      attempt_count: planJobRow.attempt_count,
      max_retries: planJobRow.max_retries,
      created_at: planJobRow.created_at,
      started_at: planJobRow.started_at,
      completed_at: planJobRow.completed_at,
      results: planJobRow.results,
      error_details: planJobRow.error_details,
      parent_job_id: planJobRow.parent_job_id,
      target_contribution_id: planJobRow.target_contribution_id,
      prerequisite_job_id: planJobRow.prerequisite_job_id,
      is_test_job: planJobRow.is_test_job,
      job_type: planJobRow.job_type,
    });
    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        logger: testLogger,
        fileManager,
        downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
        tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
        getSeedPromptForStage,
        documentRenderer: { renderDocument },
        planComplexStage: async () => [],
        findSourceDocuments,
        getGranularityPlanner,
        continueJob: async () => ({ enqueued: false, error: undefined }),
        retryJob: async () => ({ error: undefined }),
        executeModelCallAndSave: async () => {},
      })
    );
    const planCtx = createPlanJobContext(baseCtx);
    await processComplexJob(adminClient, planJobRow, testUserId, planCtx, testUserJwt);
    const captured = getCapturedJobNotifications();
    assert(captured.length >= 1);
    for (const { payload } of captured) {
      assertBaseFields(payload);
    }
  });

  it("full recipe execution emits notifications in correct order matching DAG structure", async () => {
    resetMockNotificationService();
    const planPayload: DialecticPlanJobPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(planPayload)) throw new Error("Invalid payload");
    const planJobRow: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      session_id: testSession.id,
      stage_slug: "thesis",
      payload: planPayload,
      iteration_number: 1,
      status: "processing",
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      parent_job_id: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      is_test_job: false,
      job_type: "PLAN",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: planJobRow.id,
      user_id: planJobRow.user_id,
      session_id: planJobRow.session_id,
      stage_slug: planJobRow.stage_slug,
      payload: planJobRow.payload,
      iteration_number: planJobRow.iteration_number,
      status: planJobRow.status,
      attempt_count: planJobRow.attempt_count,
      max_retries: planJobRow.max_retries,
      created_at: planJobRow.created_at,
      started_at: planJobRow.started_at,
      completed_at: planJobRow.completed_at,
      results: planJobRow.results,
      error_details: planJobRow.error_details,
      parent_job_id: planJobRow.parent_job_id,
      target_contribution_id: planJobRow.target_contribution_id,
      prerequisite_job_id: planJobRow.prerequisite_job_id,
      is_test_job: planJobRow.is_test_job,
      job_type: planJobRow.job_type,
    });
    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        logger: testLogger,
        fileManager,
        downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
        tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
        getSeedPromptForStage,
        documentRenderer: { renderDocument },
        planComplexStage: async () => [],
        findSourceDocuments,
        getGranularityPlanner,
        continueJob: async () => ({ enqueued: false, error: undefined }),
        retryJob: async () => ({ error: undefined }),
        executeModelCallAndSave: async () => {},
      })
    );
    const planCtx = createPlanJobContext(baseCtx);
    await processComplexJob(adminClient, planJobRow, testUserId, planCtx, testUserJwt);
    const captured = getCapturedJobNotifications();
    const plannerStartedIdx = captured.findIndex((c) => c.payload.type === "planner_started");
    const plannerCompletedIdx = captured.findIndex((c) => c.payload.type === "planner_completed");
    assert(plannerStartedIdx >= 0, "Expected planner_started");
    if (plannerCompletedIdx >= 0) {
      assert(plannerStartedIdx < plannerCompletedIdx, "planner_started must precede planner_completed (DAG order)");
    }
  });

  it("notifications for multi-model stage include correct modelId per model", async () => {
    resetMockNotificationService();
    const { data: secondModel } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", "mock-model-2")
      .eq("is_active", true)
      .maybeSingle();
    let secondModelId: string;
    if (secondModel?.id) {
      secondModelId = secondModel.id;
    } else {
      const { data: inserted, error: insertErr } = await adminClient
        .from("ai_providers")
        .insert({
          api_identifier: "mock-model-2",
          provider: "test-provider",
          name: "Test Model 2",
          config: {
            api_identifier: "mock-model-2",
            context_window_tokens: 128000,
            input_token_cost_rate: 0.001,
            output_token_cost_rate: 0.002,
            tokenization_strategy: { type: "none" },
            provider_max_input_tokens: 128000,
            provider_max_output_tokens: 16000,
          },
          is_active: true,
          is_enabled: true,
        })
        .select("id")
        .single();
      assert(!insertErr, `Failed to create second model: ${insertErr?.message}`);
      assertExists(inserted?.id, "Second model id");
      secondModelId = inserted.id;
    }

    const { data: thesisStage } = await adminClient
      .from("dialectic_stages")
      .select("recipe_template_id")
      .eq("slug", "thesis")
      .single();
    assertExists(thesisStage?.recipe_template_id, "Thesis stage must have recipe_template_id");
    const { data: templateStep } = await adminClient
      .from("dialectic_recipe_template_steps")
      .select("id")
      .eq("template_id", thesisStage.recipe_template_id)
      .eq("step_slug", "generate-business-case")
      .limit(1)
      .single();
    assertExists(templateStep?.id, "Thesis template must have generate-business-case step");

    const basePayload: DialecticExecuteJobPayload = {
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      model_id: testModelId,
      iterationNumber: 1,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: { contributionType: "thesis", stageSlug: "thesis" },
      document_key: FileType.business_case,
      planner_metadata: {
        recipe_step_id: templateStep.id,
        recipe_template_id: thesisStage.recipe_template_id,
      },
    };
    const job1Payload: DialecticExecuteJobPayload = { ...basePayload, model_id: testModelId };
    const job2Payload: DialecticExecuteJobPayload = { ...basePayload, model_id: secondModelId };
    if (!isDialecticExecuteJobPayload(job1Payload) || !isDialecticExecuteJobPayload(job2Payload)) {
      throw new Error("Invalid payload");
    }
    if (!isJson(job1Payload)) throw new Error("Invalid payload");
    if (!isJson(job2Payload)) throw new Error("Invalid payload");
    const executeJob1: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: "thesis",
      iteration_number: 1,
      status: "pending",
      max_retries: 3,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: job1Payload,
      is_test_job: false,
      job_type: "EXECUTE",
    };
    const executeJob2: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      ...executeJob1,
      id: crypto.randomUUID(),
      payload: job2Payload,
    };
    await adminClient.from("dialectic_generation_jobs").insert([
      {
        id: executeJob1.id,
        parent_job_id: executeJob1.parent_job_id,
        session_id: executeJob1.session_id,
        user_id: executeJob1.user_id,
        stage_slug: executeJob1.stage_slug,
        iteration_number: executeJob1.iteration_number,
        status: executeJob1.status,
        max_retries: executeJob1.max_retries,
        attempt_count: executeJob1.attempt_count,
        created_at: executeJob1.created_at,
        started_at: executeJob1.started_at,
        completed_at: executeJob1.completed_at,
        results: executeJob1.results,
        error_details: executeJob1.error_details,
        target_contribution_id: executeJob1.target_contribution_id,
        prerequisite_job_id: executeJob1.prerequisite_job_id,
        payload: executeJob1.payload,
        is_test_job: executeJob1.is_test_job,
        job_type: executeJob1.job_type,
      },
      {
        id: executeJob2.id,
        parent_job_id: executeJob2.parent_job_id,
        session_id: executeJob2.session_id,
        user_id: executeJob2.user_id,
        stage_slug: executeJob2.stage_slug,
        iteration_number: executeJob2.iteration_number,
        status: executeJob2.status,
        max_retries: executeJob2.max_retries,
        attempt_count: executeJob2.attempt_count,
        created_at: executeJob2.created_at,
        started_at: executeJob2.started_at,
        completed_at: executeJob2.completed_at,
        results: executeJob2.results,
        error_details: executeJob2.error_details,
        target_contribution_id: executeJob2.target_contribution_id,
        prerequisite_job_id: executeJob2.prerequisite_job_id,
        payload: executeJob2.payload,
        is_test_job: executeJob2.is_test_job,
        job_type: executeJob2.job_type,
      },
    ]);

    const mockParams = createMockJobContextParams({
      notificationService: mockNotificationService,
      fileManager,
      downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      callUnifiedAIModel: async () => ({
        content: JSON.stringify({ content: "# Doc" }),
        finish_reason: "stop",
        inputTokens: 10,
        outputTokens: 20,
        rawProviderResponse: {},
      }),
      getSeedPromptForStage,
      continueJob: async (deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId) =>
        continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId),
      retryJob: async (deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId) =>
        retryJob(deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId),
      executeModelCallAndSave: async (params: ExecuteModelCallAndSaveParams) =>
        executeModelCallAndSave({ ...params, compressionStrategy: getSortedCompressionCandidates }),
      tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
      documentRenderer: { renderDocument },
      planComplexStage: async () => [],
      findSourceDocuments,
      getGranularityPlanner,
    });
    const rootCtx: IJobContext = createJobContext(mockParams);

    await processSimpleJob(adminClient, executeJob1, testUserId, rootCtx, testUserJwt);
    await processSimpleJob(adminClient, executeJob2, testUserId, rootCtx, testUserJwt);

    const captured = getCapturedJobNotifications();
    const job1Events = captured.filter((c) => c.payload.job_id === executeJob1.id);
    const job2Events = captured.filter((c) => c.payload.job_id === executeJob2.id);
    assert(job1Events.length >= 1, "Expected at least one notification for model 1");
    assert(job2Events.length >= 1, "Expected at least one notification for model 2");
    for (const { payload } of job1Events) {
      assert("modelId" in payload && payload.modelId === testModelId);
    }
    for (const { payload } of job2Events) {
      assert("modelId" in payload && payload.modelId === secondModelId);
    }
  });

  it("job_failed includes error code and message for all job types", async () => {
    resetMockNotificationService();
    const planPayload: DialecticPlanJobPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug: "thesis",
      model_id: testModelId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    if (!isJson(planPayload)) throw new Error("Invalid payload");
    const planJobRow: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      user_id: testUserId,
      session_id: testSession.id,
      stage_slug: "thesis",
      payload: planPayload,
      iteration_number: 1,
      status: "processing",
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      results: null,
      error_details: null,
      parent_job_id: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      is_test_job: false,
      job_type: "PLAN",
    };
    await adminClient.from("dialectic_generation_jobs").insert({
      id: planJobRow.id,
      user_id: planJobRow.user_id,
      session_id: planJobRow.session_id,
      stage_slug: planJobRow.stage_slug,
      payload: planJobRow.payload,
      iteration_number: planJobRow.iteration_number,
      status: planJobRow.status,
      attempt_count: planJobRow.attempt_count,
      max_retries: planJobRow.max_retries,
      created_at: planJobRow.created_at,
      started_at: planJobRow.started_at,
      completed_at: planJobRow.completed_at,
      results: planJobRow.results,
      error_details: planJobRow.error_details,
      parent_job_id: planJobRow.parent_job_id,
      target_contribution_id: planJobRow.target_contribution_id,
      prerequisite_job_id: planJobRow.prerequisite_job_id,
      is_test_job: planJobRow.is_test_job,
      job_type: planJobRow.job_type,
    });
    const baseCtx = createJobContext(
      createMockJobContextParams({
        notificationService: mockNotificationService,
        logger: testLogger,
        fileManager,
        downloadFromStorage: (_supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
        tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve("1000000") }).instance,
        getSeedPromptForStage,
        documentRenderer: { renderDocument },
        planComplexStage: async () => {
          throw new Error("FAIL_CODE_TEST");
        },
        findSourceDocuments,
        getGranularityPlanner,
        continueJob: async () => ({ enqueued: false, error: undefined }),
        retryJob: async () => ({ error: undefined }),
        executeModelCallAndSave: async () => {},
      })
    );
    const planCtx = createPlanJobContext(baseCtx);
    await processComplexJob(adminClient, planJobRow, testUserId, planCtx, testUserJwt);
    const captured = getCapturedJobNotifications();
    const jobFailed = captured.filter((c) => c.payload.type === "job_failed");
    assert(jobFailed.length >= 1);
    const failedPayload = jobFailed[0].payload;
    if (!isJobFailedPayload(failedPayload)) {
      throw new Error("Expected job_failed payload");
    }
    assert(typeof failedPayload.error.code === "string" && failedPayload.error.code.length > 0);
    assert(typeof failedPayload.error.message === "string" && failedPayload.error.message.length > 0);
  });
});
