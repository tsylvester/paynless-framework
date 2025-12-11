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
  IRenderJobDeps,
  DialecticExecuteJobPayload,
  IDialecticJobDeps,
  ExecuteModelCallAndSaveParams,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import { processRenderJob } from "../../functions/dialectic-worker/processRenderJob.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { isJson, isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { getSortedCompressionCandidates } from "../../functions/_shared/utils/vector_utils.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";

describe("processRenderJob Integration Tests", () => {
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

    fileManager = new FileManagerService(adminClient, { constructStoragePath });

    // Create test project using FormData
    const formData = new FormData();
    formData.append("projectName", "ProcessRenderJob Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for processRenderJob integration test");
    
    // Fetch domain ID for software_development
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error) {
      throw new Error(`Failed to create test project: ${projectResult.error.message}`);
    }
    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    testProject = projectResult.data;

    // Fetch or create model ID
    const { data: existingModel, error: fetchError } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    const validConfig = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens || 128000,
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
    } else {
      // Update existing model to ensure it has valid token cost rates
      const { error: updateError } = await adminClient
        .from("ai_providers")
        .update({ config: validConfig })
        .eq("id", model.id);
      assert(!updateError, `Failed to update model config: ${updateError?.message}`);
    }
    testModelId = model.id;

    // Ensure wallet exists for test user
    await coreEnsureTestUserAndWallet(testUserId, 1000000, 'local');
    
    // Get wallet ID
    const { data: walletData, error: walletError } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    assert(!walletError, `Failed to fetch wallet: ${walletError?.message}`);
    assertExists(walletData, "Wallet should exist");
    if (!walletData || !walletData.wallet_id) {
      throw new Error("Wallet record is missing wallet_id");
    }
    testWalletId = walletData.wallet_id;

    // Start a session
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to start session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    testSession = sessionResult.data;
  });

  afterAll(async () => {
    await coreCleanupTestResources('local');
  });

  it("6.e.i: should process RENDER job successfully for root chunk where sourceContributionId equals documentIdentity", async () => {
    // 1) executeModelCallAndSave (producer) enqueues a RENDER job with root chunk payload (sourceContributionId === documentIdentity)
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    // Set up dependencies for executeModelCallAndSave
    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: JSON.stringify({
          content: `# Business Case Document\n\nThis is a test business case document that will be rendered.`
        }),
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: JSON.stringify({
                content: `# Business Case Document\n\nThis is a test business case document that will be rendered.`
              }),
            },
          }],
          finish_reason: 'stop',
        },
      }),
      getExtensionFromMimeType,
      logger: testLogger,
      fileManager: fileManager,
      continueJob: (deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId) => continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId),
      notificationService: new NotificationService(adminClient),
      getSeedPromptForStage: (dbClient, projectId, sessionId, stageSlug, iterationNumber, downloadFromStorageFn) => getSeedPromptForStage(dbClient, projectId, sessionId, stageSlug, iterationNumber, downloadFromStorageFn),
      retryJob: (deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId) => retryJob(deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId),
      downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      randomUUID: crypto.randomUUID,
      deleteFromStorage: () => Promise.resolve({ error: null }),
      executeModelCallAndSave: async () => {},
      tokenWalletService: tokenWalletService,
      countTokens,
      documentRenderer: {
        renderDocument: renderDocument,
      },
      embeddingClient: {
        getEmbedding: async () => ({
          embedding: [],
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      },
      ragService: {
        getContextForModel: async () => ({
          context: "",
          tokensUsedForIndexing: 0,
          error: undefined,
        }),
      },
    };

    // Create an EXECUTE job that will produce a root chunk (no document_relationships)
    const executeJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: stageSlug,
      model_id: testModelId,
      iterationNumber: iterationNumber,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: {
        contributionType: stageSlug,
        stageSlug: stageSlug,
      },
      document_key: documentKey,
      // Omit document_relationships to create a root chunk
    };

    if (!isJson(executeJobPayload)) {
      throw new Error("Execute job payload is not a valid JSON object");
    }

    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
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
      payload: executeJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the EXECUTE job into the database
    const { data: insertedJob, error: insertError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
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
      })
      .select("*")
      .single();

    assert(!insertError, `Failed to insert EXECUTE job: ${insertError?.message}`);
    assertExists(insertedJob, "EXECUTE job should be inserted");

    const params: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: executeJob,
      projectOwnerUserId: testUserId,
      providerDetails: {
        id: providerData.id,
        provider: providerData.provider,
        name: providerData.name,
        api_identifier: providerData.api_identifier,
      },
      promptConstructionPayload: {
        systemInstruction: undefined,
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: "Generate a business case document",
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description ?? null,
        user_input_reference_url: testSession.user_input_reference_url ?? null,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids ?? null,
        status: testSession.status ?? "pending_thesis",
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id ?? null,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Call executeModelCallAndSave - this should enqueue a RENDER job
    await executeModelCallAndSave(params);

    // Get the actual contribution ID that was created by executeModelCallAndSave
    const { data: updatedJob, error: jobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", executeJob.id)
      .single();

    assert(!jobQueryError, `Failed to query updated EXECUTE job: ${jobQueryError?.message}`);
    assertExists(updatedJob, "Updated EXECUTE job should exist");
    assertExists(updatedJob.results, "EXECUTE job should have results");

    let actualContributionId: string | undefined;
    if (typeof updatedJob.results === 'string') {
      const results = JSON.parse(updatedJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        actualContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedJob.results)) {
      const results = updatedJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        actualContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(actualContributionId, "Contribution ID should be available from job results");

    // 2) Verify a RENDER job is enqueued with root chunk payload (sourceContributionId === documentIdentity)
    const { data: renderJobs, error: renderJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("parent_job_id", executeJob.id)
      .eq("job_type", "RENDER")
      .eq("status", "pending");

    assert(!renderJobQueryError, `Failed to query RENDER jobs: ${renderJobQueryError?.message}`);
    assertExists(renderJobs, "RENDER jobs query should return data");
    assert(renderJobs.length >= 1, `At least one RENDER job should be enqueued, found ${renderJobs.length}`);

    const renderJob = renderJobs[0];
    assertExists(renderJob, "RENDER job should exist");
    assertExists(renderJob.payload, "RENDER job should have a payload");

    if (!isRecord(renderJob.payload)) {
      throw new Error("RENDER job payload is not a record");
    }

    const renderPayload = renderJob.payload;
    assertExists(renderPayload.projectId, "renderPayload should have projectId");
    assertExists(renderPayload.sessionId, "renderPayload should have sessionId");
    assertExists(renderPayload.iterationNumber, "renderPayload should have iterationNumber");
    assertExists(renderPayload.stageSlug, "renderPayload should have stageSlug");
    assertExists(renderPayload.documentIdentity, "renderPayload should have documentIdentity");
    assertExists(renderPayload.documentKey, "renderPayload should have documentKey");
    assertExists(renderPayload.sourceContributionId, "renderPayload should have sourceContributionId");

    // For root chunks, sourceContributionId === documentIdentity (both are contribution.id)
    assertEquals(renderPayload.sourceContributionId, renderPayload.documentIdentity, "For root chunks, sourceContributionId must equal documentIdentity");
    assertEquals(renderPayload.sourceContributionId, actualContributionId, "sourceContributionId should equal the actual contribution.id");

    // 3) processRenderJob (test subject) successfully processes the RENDER job
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    let processError: Error | null = null;
    try {
      await processRenderJob(
        adminClient,
        renderJob,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // 4) Verify the job status is updated to 'completed' and results contain correct pathContext with sourceContributionId
    const { data: updatedRenderJob, error: updatedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", renderJob.id)
      .single();

    assert(!updatedJobError, `Failed to query updated RENDER job: ${updatedJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    assertEquals(updatedRenderJob.status, "completed", "RENDER job status should be 'completed'");
    assertExists(updatedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(updatedRenderJob.results, "RENDER job should have results");

    if (!isRecord(updatedRenderJob.results)) {
      throw new Error("RENDER job results is not a record");
    }

    const results = updatedRenderJob.results;
    assertExists(results.pathContext, "RENDER job results should have pathContext");

    if (!isRecord(results.pathContext)) {
      throw new Error("RENDER job results.pathContext is not a record");
    }

    const pathContext = results.pathContext;
    assertExists(pathContext.sourceContributionId, "pathContext should have sourceContributionId");
    assertEquals(pathContext.sourceContributionId, actualContributionId, "pathContext.sourceContributionId should match the root's contribution.id");
    assertEquals(pathContext.projectId, testProject.id, "pathContext.projectId should match");
    assertEquals(pathContext.sessionId, testSession.id, "pathContext.sessionId should match");
    assertEquals(pathContext.iteration, iterationNumber, "pathContext.iteration should match");
    assertEquals(pathContext.stageSlug, stageSlug, "pathContext.stageSlug should match");
    assertEquals(String(pathContext.documentKey), String(documentKey), "pathContext.documentKey should match");
  });

  it("6.e.ii: should process RENDER job successfully for continuation chunk where sourceContributionId differs from documentIdentity", async () => {
    // 1) executeModelCallAndSave (producer) enqueues a RENDER job with continuation chunk payload (sourceContributionId !== documentIdentity)
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const docIdentity = crypto.randomUUID();

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    // Set up dependencies for executeModelCallAndSave
    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: JSON.stringify({
          content: `# Business Case Document - Continuation\n\nThis is a continuation chunk that will be rendered.`
        }),
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: JSON.stringify({
                content: `# Business Case Document - Continuation\n\nThis is a continuation chunk that will be rendered.`
              }),
            },
          }],
          finish_reason: 'stop',
        },
      }),
      getExtensionFromMimeType,
      logger: testLogger,
      fileManager: fileManager,
      continueJob: (deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId) => continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId),
      notificationService: new NotificationService(adminClient),
      getSeedPromptForStage: (dbClient, projectId, sessionId, stageSlug, iterationNumber, downloadFromStorageFn) => getSeedPromptForStage(dbClient, projectId, sessionId, stageSlug, iterationNumber, downloadFromStorageFn),
      retryJob: (deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId) => retryJob(deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId),
      downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      randomUUID: crypto.randomUUID,
      deleteFromStorage: () => Promise.resolve({ error: null }),
      executeModelCallAndSave: async () => {},
      tokenWalletService: tokenWalletService,
      countTokens,
      documentRenderer: {
        renderDocument: renderDocument,
      },
      embeddingClient: {
        getEmbedding: async () => ({
          embedding: [],
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      },
      ragService: {
        getContextForModel: async () => ({
          context: "",
          tokensUsedForIndexing: 0,
          error: undefined,
        }),
      },
    };

    // Create an EXECUTE job that will produce a continuation chunk (with document_relationships)
    const executeJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: stageSlug,
      model_id: testModelId,
      iterationNumber: iterationNumber,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: {
        contributionType: stageSlug,
        stageSlug: stageSlug,
      },
      document_key: documentKey,
      document_relationships: { [stageSlug]: docIdentity },
    };

    if (!isJson(executeJobPayload)) {
      throw new Error("Execute job payload is not a valid JSON object");
    }

    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
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
      payload: executeJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the EXECUTE job into the database
    const { data: insertedJob, error: insertError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
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
      })
      .select("*")
      .single();

    assert(!insertError, `Failed to insert EXECUTE job: ${insertError?.message}`);
    assertExists(insertedJob, "EXECUTE job should be inserted");

    const params: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: executeJob,
      projectOwnerUserId: testUserId,
      providerDetails: {
        id: providerData.id,
        provider: providerData.provider,
        name: providerData.name,
        api_identifier: providerData.api_identifier,
      },
      promptConstructionPayload: {
        systemInstruction: undefined,
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: "Generate a business case document continuation",
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description ?? null,
        user_input_reference_url: testSession.user_input_reference_url ?? null,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids ?? null,
        status: testSession.status ?? "pending_thesis",
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id ?? null,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Call executeModelCallAndSave - this should enqueue a RENDER job
    await executeModelCallAndSave(params);

    // Get the actual contribution ID that was created by executeModelCallAndSave
    const { data: updatedJob, error: jobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", executeJob.id)
      .single();

    assert(!jobQueryError, `Failed to query updated EXECUTE job: ${jobQueryError?.message}`);
    assertExists(updatedJob, "Updated EXECUTE job should exist");
    assertExists(updatedJob.results, "EXECUTE job should have results");

    let actualContributionId: string | undefined;
    if (typeof updatedJob.results === 'string') {
      const results = JSON.parse(updatedJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        actualContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedJob.results)) {
      const results = updatedJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        actualContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(actualContributionId, "Contribution ID should be available from job results");

    // 2) Verify a RENDER job is enqueued with continuation chunk payload (sourceContributionId !== documentIdentity)
    const { data: renderJobs, error: renderJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("parent_job_id", executeJob.id)
      .eq("job_type", "RENDER")
      .eq("status", "pending");

    assert(!renderJobQueryError, `Failed to query RENDER jobs: ${renderJobQueryError?.message}`);
    assertExists(renderJobs, "RENDER jobs query should return data");
    assert(renderJobs.length >= 1, `At least one RENDER job should be enqueued, found ${renderJobs.length}`);

    const renderJob = renderJobs[0];
    assertExists(renderJob, "RENDER job should exist");
    assertExists(renderJob.payload, "RENDER job should have a payload");

    if (!isRecord(renderJob.payload)) {
      throw new Error("RENDER job payload is not a record");
    }

    const renderPayload = renderJob.payload;
    assertExists(renderPayload.projectId, "renderPayload should have projectId");
    assertExists(renderPayload.sessionId, "renderPayload should have sessionId");
    assertExists(renderPayload.iterationNumber, "renderPayload should have iterationNumber");
    assertExists(renderPayload.stageSlug, "renderPayload should have stageSlug");
    assertExists(renderPayload.documentIdentity, "renderPayload should have documentIdentity");
    assertExists(renderPayload.documentKey, "renderPayload should have documentKey");
    assertExists(renderPayload.sourceContributionId, "renderPayload should have sourceContributionId");

    // For continuation chunks, sourceContributionId !== documentIdentity
    // documentIdentity is the root's ID from document_relationships, sourceContributionId is this chunk's contribution.id
    assertEquals(renderPayload.documentIdentity, docIdentity, "documentIdentity should equal the root's ID from document_relationships");
    assertEquals(renderPayload.sourceContributionId, actualContributionId, "sourceContributionId should equal the continuation chunk's contribution.id");
    assert(renderPayload.sourceContributionId !== renderPayload.documentIdentity, "For continuation chunks, sourceContributionId must differ from documentIdentity");

    // 3) processRenderJob (test subject) successfully processes the RENDER job
    // It should find all related chunks via documentIdentity and render them together
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    let processError: Error | null = null;
    try {
      await processRenderJob(
        adminClient,
        renderJob,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // 4) Verify the job status is updated to 'completed' and results contain correct pathContext with sourceContributionId
    const { data: updatedRenderJob, error: updatedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", renderJob.id)
      .single();

    assert(!updatedJobError, `Failed to query updated RENDER job: ${updatedJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    assertEquals(updatedRenderJob.status, "completed", "RENDER job status should be 'completed'");
    assertExists(updatedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(updatedRenderJob.results, "RENDER job should have results");

    if (!isRecord(updatedRenderJob.results)) {
      throw new Error("RENDER job results is not a record");
    }

    const results = updatedRenderJob.results;
    assertExists(results.pathContext, "RENDER job results should have pathContext");

    if (!isRecord(results.pathContext)) {
      throw new Error("RENDER job results.pathContext is not a record");
    }

    const pathContext = results.pathContext;
    assertExists(pathContext.sourceContributionId, "pathContext should have sourceContributionId");
    // For continuation chunks, sourceContributionId should match the continuation chunk's contribution.id (not the documentIdentity)
    assertEquals(pathContext.sourceContributionId, actualContributionId, "pathContext.sourceContributionId should match the continuation chunk's contribution.id (not the documentIdentity)");
    assertEquals(pathContext.projectId, testProject.id, "pathContext.projectId should match");
    assertEquals(pathContext.sessionId, testSession.id, "pathContext.sessionId should match");
    assertEquals(pathContext.iteration, iterationNumber, "pathContext.iteration should match");
    assertEquals(pathContext.stageSlug, stageSlug, "pathContext.stageSlug should match");
    assertEquals(String(pathContext.documentKey), String(documentKey), "pathContext.documentKey should match");

    // (5) Verify the rendered document contains content from all related chunks (proving documentIdentity was used correctly for querying)
    // Query for the rendered document resource record
    const { data: renderedResource, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", actualContributionId)
      .maybeSingle();

    assert(!resourceError, `Failed to query rendered document resource: ${resourceError?.message}`);
    assertExists(renderedResource, "Rendered document resource should exist");
    assertExists(renderedResource.storage_bucket, "Rendered document resource should have storage_bucket");
    assertExists(renderedResource.storage_path, "Rendered document resource should have storage_path");
    assertExists(renderedResource.file_name, "Rendered document resource should have file_name");

    // Download the rendered markdown file from storage
    const fullStoragePath = `${renderedResource.storage_path}/${renderedResource.file_name}`;
    const { data: renderedFileData, error: downloadError } = await downloadFromStorage(
      adminClient,
      renderedResource.storage_bucket,
      fullStoragePath,
    );

    assert(!downloadError, `Failed to download rendered document: ${downloadError?.message}`);
    assertExists(renderedFileData, "Rendered document file data should exist");

    // Decode the rendered markdown content
    if (renderedFileData === null) {
      throw new Error("Rendered document file data is null after assertExists check");
    }
    const renderedMarkdown = new TextDecoder().decode(renderedFileData);

    // Verify the rendered document contains content from the continuation chunk
    // This proves that documentIdentity was used correctly to find all related chunks via document_relationships
    assert(
      renderedMarkdown.includes("Business Case Document - Continuation"),
      "Rendered document should contain content from continuation chunk (proving documentIdentity was used correctly for querying)"
    );
    assert(
      renderedMarkdown.includes("This is a continuation chunk that will be rendered"),
      "Rendered document should contain continuation chunk content (proving documentIdentity was used correctly for querying)"
    );
  });
});

