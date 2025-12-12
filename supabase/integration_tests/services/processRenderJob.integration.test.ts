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
  DocumentRelationships,
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
import { isJson, isRecord, isDocumentRelationships } from "../../functions/_shared/utils/type_guards.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { getSortedCompressionCandidates } from "../../functions/_shared/utils/vector_utils.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";
import { handleJob } from "../../functions/dialectic-worker/index.ts";
import { createDialecticWorkerDeps } from "../../functions/dialectic-worker/index.ts";
import { isFileType } from "../../functions/_shared/utils/type-guards/type_guards.file_manager.ts";

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

  it("should process RENDER jobs end-to-end when payload includes ALL required fields", async () => {
    // (1) Producer Setup: Create root chunk contribution via executeModelCallAndSave with markdown document output type
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;

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

    // Create an EXECUTE job with user_jwt in payload and resolvedFinish: 'stop' to make it final
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

    // Get the actual contribution ID that was created
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

    // (2) Producer Assertion: Verify RENDER job is enqueued with ALL 8 required fields
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
    
    // Verify ALL 8 required fields are present with correct types
    assertExists(renderPayload.user_jwt, "renderPayload should have user_jwt (field 1)");
    assert(typeof renderPayload.user_jwt === 'string', "user_jwt must be a string");
    assertEquals(renderPayload.user_jwt, testUserJwt, "user_jwt must match parent job payload user_jwt");

    assertExists(renderPayload.projectId, "renderPayload should have projectId (field 2)");
    assert(typeof renderPayload.projectId === 'string', "projectId must be a string");

    assertExists(renderPayload.sessionId, "renderPayload should have sessionId (field 3)");
    assert(typeof renderPayload.sessionId === 'string', "sessionId must be a string");

    assertExists(renderPayload.iterationNumber, "renderPayload should have iterationNumber (field 4)");
    assert(typeof renderPayload.iterationNumber === 'number', "iterationNumber must be a number");

    assertExists(renderPayload.stageSlug, "renderPayload should have stageSlug (field 5)");
    assert(typeof renderPayload.stageSlug === 'string', "stageSlug must be a string");

    assertExists(renderPayload.documentIdentity, "renderPayload should have documentIdentity (field 6)");
    assert(typeof renderPayload.documentIdentity === 'string', "documentIdentity must be a string");

    assertExists(renderPayload.documentKey, "renderPayload should have documentKey (field 7)");
    assert(isFileType(renderPayload.documentKey), "documentKey must be a valid FileType");

    assertExists(renderPayload.sourceContributionId, "renderPayload should have sourceContributionId (field 8)");
    assert(typeof renderPayload.sourceContributionId === 'string', "sourceContributionId must be a string");

    // (3) Trigger Simulation: Query dialectic_trigger_logs to verify trigger fired with jwt_exists: true
    // Wait a moment for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: triggerLogs, error: triggerLogError } = await adminClient
      .from("dialectic_trigger_logs")
      .select("*")
      .eq("job_id", renderJob.id)
      .order("created_at", { ascending: false })
      .limit(10);

    assert(!triggerLogError, `Failed to query trigger logs: ${triggerLogError?.message}`);
    // Note: Trigger may not fire in test environment, so we check if logs exist but don't require them

    if (triggerLogs && triggerLogs.length > 0) {
      const latestLog = triggerLogs[0];
      if (latestLog.error_details && typeof latestLog.error_details === 'string') {
        try {
          const errorDetails = JSON.parse(latestLog.error_details);
          if (typeof errorDetails === 'object' && errorDetails !== null && 'jwt_exists' in errorDetails) {
            assert(errorDetails.jwt_exists === true, "Trigger log should show jwt_exists: true");
          }
        } catch (e) {
          // Error details may not be JSON, skip this check
        }
      }
    }

    // (4) Worker Entry: Call handleJob directly with the RENDER job record and valid auth token
    const workerDeps = await createDialecticWorkerDeps(adminClient);
    
    let handleJobError: Error | null = null;
    try {
      await handleJob(adminClient, renderJob, workerDeps, testUserJwt);
    } catch (e) {
      handleJobError = e instanceof Error ? e : new Error(String(e));
    }

    assert(handleJobError === null, `handleJob should not throw errors, but got: ${handleJobError?.message}`);

    // (5) Routing Assertion: Verify processRenderJob was called (job should be completed)
    // (6) Processing Assertion: Verify processRenderJob successfully validated ALL payload fields and processed
    const { data: completedRenderJob, error: completedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", renderJob.id)
      .single();

    assert(!completedJobError, `Failed to query completed RENDER job: ${completedJobError?.message}`);
    assertExists(completedRenderJob, "Completed RENDER job should exist");
    assertEquals(completedRenderJob.status, "completed", "RENDER job status should be 'completed'");
    assertExists(completedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(completedRenderJob.results, "RENDER job should have results");

    if (!isRecord(completedRenderJob.results)) {
      throw new Error("RENDER job results is not a record");
    }

    const results = completedRenderJob.results;
    assertExists(results.pathContext, "RENDER job results should have pathContext");

    // (7) Consumer Assertion: Verify rendered markdown file is saved to storage
    // (8) Consumer Assertion: Verify dialectic_project_resources record is created
    const { data: projectResources, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .order("created_at", { ascending: false })
      .limit(1);

    assert(!resourceError, `Failed to query project resources: ${resourceError?.message}`);
    assertExists(projectResources, "Project resources query should return data");
    assert(projectResources.length >= 1, "At least one rendered document resource should exist");

    const renderedResource = projectResources[0];
    assertExists(renderedResource, "Rendered document resource should exist");
    assertEquals(renderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(renderedResource.session_id, testSession.id, "Resource session_id should match");
    assertEquals(renderedResource.iteration_number, iterationNumber, "Resource iteration_number should match");
    assertEquals(renderedResource.stage_slug, stageSlug, "Resource stage_slug should match");
    assertExists(renderedResource.file_name, "Resource should have file_name");
    assertEquals(renderedResource.source_contribution_id, renderPayload.sourceContributionId, "Resource source_contribution_id should match payload sourceContributionId");

    // Verify the rendered file exists in storage
    assertExists(renderedResource.storage_bucket, "Resource should have storage_bucket");
    assertExists(renderedResource.storage_path, "Resource should have storage_path");
    const fullStoragePath = `${renderedResource.storage_path}/${renderedResource.file_name}`;
    const { data: renderedFileData, error: downloadError } = await downloadFromStorage(
      adminClient,
      renderedResource.storage_bucket,
      fullStoragePath,
    );

    assert(!downloadError, `Failed to download rendered document: ${downloadError?.message}`);
    assertExists(renderedFileData, "Rendered document file data should exist");
  });

  it("should fail to process RENDER jobs when payload lacks user_jwt (negative test)", async () => {
    // (1) Producer Setup: Create RENDER job directly in database with payload missing user_jwt
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;

    const renderJobPayloadWithoutJwt = {
      projectId: testProject.id,
      sessionId: testSession.id,
      iterationNumber: iterationNumber,
      stageSlug: stageSlug,
      documentIdentity: crypto.randomUUID(),
      documentKey: documentKey,
      sourceContributionId: crypto.randomUUID(),
      // user_jwt is intentionally omitted
    };

    const { data: renderJob, error: insertError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        job_type: "RENDER",
        session_id: testSession.id,
        user_id: testUserId,
        stage_slug: stageSlug,
        iteration_number: iterationNumber,
        status: "pending",
        max_retries: 3,
        attempt_count: 0,
        payload: renderJobPayloadWithoutJwt,
        is_test_job: false,
      })
      .select("*")
      .single();

    assert(!insertError, `Failed to insert RENDER job: ${insertError?.message}`);
    assertExists(renderJob, "RENDER job should be inserted");

    // (2) Trigger Simulation: Verify trigger logs show jwt_exists: false or warning about missing user_jwt
    // Wait a moment for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: triggerLogs, error: triggerLogError } = await adminClient
      .from("dialectic_trigger_logs")
      .select("*")
      .eq("job_id", renderJob.id)
      .order("created_at", { ascending: false })
      .limit(10);

    assert(!triggerLogError, `Failed to query trigger logs: ${triggerLogError?.message}`);

    if (triggerLogs && triggerLogs.length > 0) {
      // Check if any log mentions missing user_jwt
      const hasJwtWarning = triggerLogs.some(log => {
        if (log.log_message && typeof log.log_message === 'string') {
          return log.log_message.includes('user_jwt was not found') || log.log_message.includes('user_jwt is not found');
        }
        if (log.error_details && typeof log.error_details === 'string') {
          try {
            const errorDetails = JSON.parse(log.error_details);
            if (typeof errorDetails === 'object' && errorDetails !== null) {
              return errorDetails.jwt_exists === false || errorDetails.jwt_exists === null;
            }
          } catch (e) {
            // Error details may not be JSON, skip
          }
        }
        return false;
      });
      // Note: In test environment, trigger may not fire, so we don't strictly require this
    }

    // (3) Worker Entry: Attempt to call handleJob with the RENDER job
    const workerDeps = await createDialecticWorkerDeps(adminClient);
    
    // Since the job payload lacks user_jwt, handleJob will validate the payload and fail
    // because isDialecticJobPayload type guard will reject the payload as invalid
    let handleJobError: Error | null = null;
    try {
      // Call handleJob - it will fail payload validation because user_jwt is missing
      await handleJob(adminClient, renderJob, workerDeps, testUserJwt);
    } catch (e) {
      handleJobError = e instanceof Error ? e : new Error(String(e));
    }

    // handleJob doesn't throw - it marks the job as 'failed' when payload validation fails
    // This proves that jobs without user_jwt cannot be processed

    // (4) Consumer Assertion: Verify RENDER job is marked as 'failed' due to invalid payload (not processed)
    const { data: failedJob, error: failedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", renderJob.id)
      .single();

    assert(!failedJobError, `Failed to query RENDER job: ${failedJobError?.message}`);
    assertExists(failedJob, "RENDER job should exist");
    // The job should be marked as 'failed' because without user_jwt, the payload validation fails
    // and handleJob marks it as failed before processing
    assertEquals(failedJob.status, "failed", "RENDER job should be marked as 'failed' when user_jwt is missing from payload");
    assertExists(failedJob.error_details, "RENDER job should have error_details when validation fails");
    if (isRecord(failedJob.error_details)) {
      const errorDetails = failedJob.error_details;
      assertExists(errorDetails.message, "Error details should include a message");
      assert(
        typeof errorDetails.message === 'string' && errorDetails.message.includes('Invalid payload'),
        "Error message should indicate invalid payload"
      );
    }

    // (5) Consumer Assertion: Verify no rendered document resource was created
    const { data: projectResources, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", renderJobPayloadWithoutJwt.sourceContributionId);

    assert(!resourceError, `Failed to query project resources: ${resourceError?.message}`);
    assert(projectResources === null || projectResources.length === 0, "No rendered document resource should be created when user_jwt is missing");
  });

  it("20.e.i: should process RENDER jobs end-to-end for root chunks with correct documentIdentity extraction sequencing", async () => {
    // Assert that when executeModelCallAndSave (producer) creates a root chunk contribution and enqueues a RENDER job
    // with the correct documentIdentity (extracted after document_relationships initialization), processRenderJob (test subject)
    // successfully processes it, calls renderDocument with documentIdentity, and renderDocument (consumer) successfully queries
    // contributions using .contains("document_relationships", { [stageSlug]: documentIdentity }) and finds the root chunk.

    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;

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

    const rootContributionContent = JSON.stringify({
      content: `# Root Business Case Document\n\nThis is a root chunk for sequencing test.`
    });

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: rootContributionContent,
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: rootContributionContent,
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

    // (1) Create a root chunk via executeModelCallAndSave
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
      // Omit document_relationships to create a root chunk - executeModelCallAndSave will initialize it
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

    // Call executeModelCallAndSave - this should initialize document_relationships and enqueue a RENDER job
    await executeModelCallAndSave(params);

    // (2) Get the actual contribution ID from the EXECUTE job results
    const { data: updatedExecuteJob, error: executeJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", executeJob.id)
      .single();

    assert(!executeJobQueryError, `Failed to query updated EXECUTE job: ${executeJobQueryError?.message}`);
    assertExists(updatedExecuteJob, "Updated EXECUTE job should exist");
    assertExists(updatedExecuteJob.results, "EXECUTE job should have results");

    let rootContributionId: string | undefined;
    if (typeof updatedExecuteJob.results === 'string') {
      const results = JSON.parse(updatedExecuteJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedExecuteJob.results)) {
      const results = updatedExecuteJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(rootContributionId, "Contribution ID should be available from job results");

    // (3) Verify document_relationships is initialized BEFORE the RENDER job is created
    // Query the contribution by its specific ID to verify document_relationships was set
    const { data: rootContribution, error: contribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, document_relationships")
      .eq("id", rootContributionId)
      .single();

    assert(!contribError, `Failed to query contribution: ${contribError?.message}`);
    assertExists(rootContribution, "Root contribution should exist");
    assertEquals(rootContribution.id, rootContributionId, "Queried contribution ID should match job results");

    // Verify document_relationships is initialized
    assert(isDocumentRelationships(rootContribution.document_relationships), "Root contribution should have valid document_relationships initialized");
    const rootDocumentRelationships: DocumentRelationships = rootContribution.document_relationships;
    assertExists(rootDocumentRelationships[stageSlug], "document_relationships[stageSlug] should exist");
    assertEquals(rootDocumentRelationships[stageSlug], rootContributionId, "document_relationships[stageSlug] should equal root contribution.id");

    // (4) Verify the RENDER job payload contains documentIdentity extracted from document_relationships[stageSlug]
    const { data: renderJobs, error: renderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("parent_job_id", executeJob.id)
      .eq("job_type", "RENDER")
      .order("created_at", { ascending: true })
      .limit(1);

    assert(!renderJobError, `Failed to query RENDER job: ${renderJobError?.message}`);
    assertExists(renderJobs, "RENDER jobs should exist");
    assert(renderJobs.length > 0, "At least one RENDER job should be enqueued");
    const renderJob = renderJobs[0];
    assertExists(renderJob.payload, "RENDER job should have payload");

    const renderPayload = isRecord(renderJob.payload) ? renderJob.payload : JSON.parse(renderJob.payload as string);
    assertExists(renderPayload.documentIdentity, "renderPayload should have documentIdentity");
    assertEquals(renderPayload.documentIdentity, rootDocumentRelationships[stageSlug], "documentIdentity should equal document_relationships[stageSlug]");
    assertEquals(renderPayload.documentIdentity, rootContributionId, "documentIdentity should equal root contribution.id for root chunks");

    // (5) Process the RENDER job via processRenderJob
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

    // (6) Verify renderDocument successfully queries and finds the root chunk
    // Query the updated RENDER job to get results
    const { data: updatedRenderJob, error: updatedRenderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", renderJob.id)
      .single();

    assert(!updatedRenderJobError, `Failed to query updated RENDER job: ${updatedRenderJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    assertEquals(updatedRenderJob.status, "completed", "RENDER job status should be 'completed'");
    assertExists(updatedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(updatedRenderJob.results, "RENDER job should have results");

    // (7) Verify the document is rendered successfully
    // Verify a rendered document resource was created
    const { data: renderedResources, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", rootContributionId)
      .order("created_at", { ascending: false })
      .limit(1);

    assert(!resourceError, `Failed to query rendered document resource: ${resourceError?.message}`);
    assertExists(renderedResources, "Rendered resources should exist");
    assert(renderedResources.length > 0, "At least one rendered document resource should exist");
    const renderedResource = renderedResources[0];
    assertExists(renderedResource.file_name, "Rendered resource should have file_name");

    // Download and verify the rendered markdown file
    const renderedFilePath = `${renderedResource.storage_path}/${renderedResource.file_name}`;
    const downloadResult = await downloadFromStorage(adminClient, renderedResource.storage_bucket || "dialectic-contributions", renderedFilePath);
    assert(!downloadResult.error, `Failed to download rendered document: ${downloadResult.error?.message}`);
    assertExists(downloadResult.data, "Rendered document should exist in storage");

    if(!downloadResult.data) {
      throw new Error("Rendered document data is null after assertExists check");
    }
    const renderedMarkdown = new TextDecoder().decode(downloadResult.data);
    assert(renderedMarkdown.includes("Root Business Case Document"), "Rendered document should contain root chunk content");
  });

  it("20.e.ii: should process RENDER jobs end-to-end for continuation chunks with correct documentIdentity extraction sequencing", async () => {
    // Assert that when executeModelCallAndSave (producer) creates a continuation chunk contribution and enqueues a RENDER job
    // with the correct documentIdentity (root's ID extracted from document_relationships[stageSlug] after persistence),
    // processRenderJob (test subject) successfully processes it, calls renderDocument with documentIdentity, and renderDocument
    // (consumer) successfully queries contributions using documentIdentity and finds ALL related chunks (root and continuation)
    // in the document chain.

    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;

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

    const rootContributionContent = JSON.stringify({
      content: `# Root Business Case Document\n\nThis is a root chunk for continuation sequencing test.`
    });

    const continuationContributionContent = JSON.stringify({
      content: `\n\n## Continuation Section\n\nThis is a continuation chunk for sequencing test.`
    });

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: continuationContributionContent,
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: continuationContributionContent,
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

    // (1) Create a root chunk and a continuation chunk via executeModelCallAndSave
    // First, create the root chunk
    const rootExecuteJobPayload: DialecticExecuteJobPayload = {
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

    if(!isJson(rootExecuteJobPayload)) {
      throw new Error("Root EXECUTE job payload is not a valid JSON object");
    }
    const rootExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
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
      payload: rootExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the root EXECUTE job
    const { data: insertedRootJob, error: insertRootError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: rootExecuteJob.id,
        parent_job_id: rootExecuteJob.parent_job_id,
        session_id: rootExecuteJob.session_id,
        user_id: rootExecuteJob.user_id,
        stage_slug: rootExecuteJob.stage_slug,
        iteration_number: rootExecuteJob.iteration_number,
        status: rootExecuteJob.status,
        max_retries: rootExecuteJob.max_retries,
        attempt_count: rootExecuteJob.attempt_count,
        created_at: rootExecuteJob.created_at,
        started_at: rootExecuteJob.started_at,
        completed_at: rootExecuteJob.completed_at,
        results: rootExecuteJob.results,
        error_details: rootExecuteJob.error_details,
        target_contribution_id: rootExecuteJob.target_contribution_id,
        prerequisite_job_id: rootExecuteJob.prerequisite_job_id,
        payload: rootExecuteJob.payload,
        is_test_job: rootExecuteJob.is_test_job,
        job_type: rootExecuteJob.job_type,
      })
      .select("*")
      .single();

    assert(!insertRootError, `Failed to insert root EXECUTE job: ${insertRootError?.message}`);
    assertExists(insertedRootJob, "Root EXECUTE job should be inserted");

    // Create root deps with root content
    const rootDeps: IDialecticJobDeps = {
      ...deps,
      callUnifiedAIModel: async () => ({
        content: rootContributionContent,
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: rootContributionContent,
            },
          }],
          finish_reason: 'stop',
        },
      }),
    };

    const rootParams: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps: rootDeps,
      authToken: testUserJwt,
      job: rootExecuteJob,
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

    // Create root chunk
    await executeModelCallAndSave(rootParams);

    // Get the actual root contribution ID from the root EXECUTE job results
    const { data: updatedRootExecuteJob, error: rootExecuteJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", rootExecuteJob.id)
      .single();

    assert(!rootExecuteJobQueryError, `Failed to query updated root EXECUTE job: ${rootExecuteJobQueryError?.message}`);
    assertExists(updatedRootExecuteJob, "Updated root EXECUTE job should exist");
    assertExists(updatedRootExecuteJob.results, "Root EXECUTE job should have results");

    let rootContributionId: string | undefined;
    if (typeof updatedRootExecuteJob.results === 'string') {
      const results = JSON.parse(updatedRootExecuteJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedRootExecuteJob.results)) {
      const results = updatedRootExecuteJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(rootContributionId, "Root contribution ID should be available from job results");
    
    // TypeScript narrowing: after assertExists, we know rootContributionId is defined
    const rootContributionIdString: string = rootContributionId!;

    // Query the root contribution by its specific ID to verify document_relationships
    const { data: rootContribution, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, document_relationships")
      .eq("id", rootContributionIdString)
      .single();

    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContribution, "Root contribution should exist");
    assertEquals(rootContribution.id, rootContributionIdString, "Queried root contribution ID should match job results");

    // Verify root chunk has document_relationships[stageSlug] set to root's contribution.id
    assert(isDocumentRelationships(rootContribution.document_relationships), "Root contribution should have valid document_relationships");
    const rootDocumentRelationships: DocumentRelationships = rootContribution.document_relationships;
    assertEquals(rootDocumentRelationships[stageSlug], rootContributionIdString, "Root chunk document_relationships[stageSlug] should equal root contribution.id");

    // Now create the continuation chunk
    const continuationExecuteJobPayload: DialecticExecuteJobPayload = {
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
      target_contribution_id: rootContributionIdString,
      continuation_count: 1,
      document_relationships: { [stageSlug]: rootContributionIdString }, // Pass root's ID for continuation chunk
    };

    if(!isJson(continuationExecuteJobPayload)) {
      throw new Error("Continuation EXECUTE job payload is not a valid JSON object");
    }
    const continuationExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
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
      target_contribution_id: rootContributionIdString,
      prerequisite_job_id: null,
      payload: continuationExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the continuation EXECUTE job
    const { data: insertedContinuationJob, error: insertContinuationError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: continuationExecuteJob.id,
        parent_job_id: continuationExecuteJob.parent_job_id,
        session_id: continuationExecuteJob.session_id,
        user_id: continuationExecuteJob.user_id,
        stage_slug: continuationExecuteJob.stage_slug,
        iteration_number: continuationExecuteJob.iteration_number,
        status: continuationExecuteJob.status,
        max_retries: continuationExecuteJob.max_retries,
        attempt_count: continuationExecuteJob.attempt_count,
        created_at: continuationExecuteJob.created_at,
        started_at: continuationExecuteJob.started_at,
        completed_at: continuationExecuteJob.completed_at,
        results: continuationExecuteJob.results,
        error_details: continuationExecuteJob.error_details,
        target_contribution_id: continuationExecuteJob.target_contribution_id,
        prerequisite_job_id: continuationExecuteJob.prerequisite_job_id,
        payload: continuationExecuteJob.payload,
        is_test_job: continuationExecuteJob.is_test_job,
        job_type: continuationExecuteJob.job_type,
      })
      .select("*")
      .single();

    assert(!insertContinuationError, `Failed to insert continuation EXECUTE job: ${insertContinuationError?.message}`);
    assertExists(insertedContinuationJob, "Continuation EXECUTE job should be inserted");

    const continuationParams: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: continuationExecuteJob,
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
        currentUserPrompt: "Continue the business case document",
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

    // Create continuation chunk - this should persist document_relationships and enqueue a RENDER job
    await executeModelCallAndSave(continuationParams);

    // (2) Get the actual continuation contribution ID from the continuation EXECUTE job results
    const { data: updatedContinuationExecuteJob, error: continuationExecuteJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", continuationExecuteJob.id)
      .single();

    assert(!continuationExecuteJobQueryError, `Failed to query updated continuation EXECUTE job: ${continuationExecuteJobQueryError?.message}`);
    assertExists(updatedContinuationExecuteJob, "Updated continuation EXECUTE job should exist");
    assertExists(updatedContinuationExecuteJob.results, "Continuation EXECUTE job should have results");

    let continuationContributionId: string | undefined;
    if (typeof updatedContinuationExecuteJob.results === 'string') {
      const results = JSON.parse(updatedContinuationExecuteJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedContinuationExecuteJob.results)) {
      const results = updatedContinuationExecuteJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(continuationContributionId, "Continuation contribution ID should be available from job results");

    // (3) Verify both chunks have document_relationships[stageSlug] set to the root's contribution.id
    // Query the continuation contribution by its specific ID
    const { data: continuationContribution, error: continuationContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, document_relationships")
      .eq("id", continuationContributionId)
      .single();

    assert(!continuationContribError, `Failed to query continuation contribution: ${continuationContribError?.message}`);
    assertExists(continuationContribution, "Continuation contribution should exist");
    assertEquals(continuationContribution.id, continuationContributionId, "Queried continuation contribution ID should match job results");

    // Verify continuation chunk has document_relationships[stageSlug] set to root's contribution.id
    assert(isDocumentRelationships(continuationContribution.document_relationships), "Continuation contribution should have valid document_relationships persisted");
    const continuationDocumentRelationships: DocumentRelationships = continuationContribution.document_relationships;
    assertEquals(continuationDocumentRelationships[stageSlug], rootContributionIdString, "Continuation chunk document_relationships[stageSlug] should equal root's contribution.id");

    // Also verify the root chunk still has the correct document_relationships (re-query to be sure)
    const { data: rootContributionCheck, error: rootContribCheckError } = await adminClient
      .from("dialectic_contributions")
      .select("id, document_relationships")
      .eq("id", rootContributionIdString)
      .single();

    assert(!rootContribCheckError, `Failed to re-query root contribution: ${rootContribCheckError?.message}`);
    assertExists(rootContributionCheck, "Root contribution should still exist");
    assert(isDocumentRelationships(rootContributionCheck.document_relationships), "Root contribution should still have valid document_relationships");
    assertEquals(rootContributionCheck.document_relationships[stageSlug], rootContributionIdString, "Root chunk document_relationships[stageSlug] should still equal root's contribution.id");

    // (4) Verify the continuation chunk's RENDER job payload contains documentIdentity equal to the root's ID (not the continuation's ID)
    const { data: continuationRenderJobs, error: continuationRenderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("parent_job_id", continuationExecuteJob.id)
      .eq("job_type", "RENDER")
      .order("created_at", { ascending: true })
      .limit(1);

    assert(!continuationRenderJobError, `Failed to query continuation RENDER job: ${continuationRenderJobError?.message}`);
    assertExists(continuationRenderJobs, "Continuation RENDER jobs should exist");
    assert(continuationRenderJobs.length > 0, "At least one continuation RENDER job should be enqueued");
    const continuationRenderJob = continuationRenderJobs[0];
    assertExists(continuationRenderJob.payload, "Continuation RENDER job should have payload");

    const continuationRenderPayload = isRecord(continuationRenderJob.payload) ? continuationRenderJob.payload : JSON.parse(continuationRenderJob.payload as string);
    assertExists(continuationRenderPayload.documentIdentity, "continuationRenderPayload should have documentIdentity");
    assertEquals(continuationRenderPayload.documentIdentity, rootContributionIdString, "documentIdentity should equal root's contribution.id (extracted from document_relationships[stageSlug])");
    assert(continuationRenderPayload.documentIdentity !== continuationContributionId, "documentIdentity should NOT equal continuation's contribution.id");
    assertEquals(continuationRenderPayload.sourceContributionId, continuationContributionId, "sourceContributionId should equal continuation's contribution.id");

    // (5) Process the RENDER job via processRenderJob
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
        continuationRenderJob,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // (6) Verify renderDocument successfully queries using documentIdentity: rootId and finds both chunks
    // Query the updated RENDER job to verify it completed
    const { data: updatedContinuationRenderJob, error: updatedContinuationRenderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", continuationRenderJob.id)
      .single();

    assert(!updatedContinuationRenderJobError, `Failed to query updated continuation RENDER job: ${updatedContinuationRenderJobError?.message}`);
    assertExists(updatedContinuationRenderJob, "Updated continuation RENDER job should exist");
    assertEquals(updatedContinuationRenderJob.status, "completed", "Continuation RENDER job status should be 'completed'");
    assertExists(updatedContinuationRenderJob.completed_at, "Continuation RENDER job should have completed_at timestamp");

    // (7) Verify the document is rendered successfully with content from both chunks
    // Verify a rendered document resource was created
    const { data: continuationRenderedResources, error: continuationResourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", continuationContributionId)
      .order("created_at", { ascending: false })
      .limit(1);

    assert(!continuationResourceError, `Failed to query continuation rendered document resource: ${continuationResourceError?.message}`);
    assertExists(continuationRenderedResources, "Continuation rendered resources should exist");
    assert(continuationRenderedResources.length > 0, "At least one continuation rendered document resource should exist");
    const continuationRenderedResource = continuationRenderedResources[0];
    assertExists(continuationRenderedResource.file_name, "Continuation rendered resource should have file_name");

    // Download and verify the rendered markdown file contains content from both chunks
    const continuationRenderedFilePath = `${continuationRenderedResource.storage_path}/${continuationRenderedResource.file_name}`;
    const continuationDownloadResult = await downloadFromStorage(adminClient, continuationRenderedResource.storage_bucket || "dialectic-contributions", continuationRenderedFilePath);
    assert(!continuationDownloadResult.error, `Failed to download continuation rendered document: ${continuationDownloadResult.error?.message}`);
    assertExists(continuationDownloadResult.data, "Continuation rendered document should exist in storage");

    if(!continuationDownloadResult.data) {
      throw new Error("Continuation rendered document data is null after assertExists check");
    }
    const continuationRenderedMarkdown = new TextDecoder().decode(continuationDownloadResult.data);
    assert(continuationRenderedMarkdown.includes("Root Business Case Document"), "Rendered document should contain root chunk content");
    assert(continuationRenderedMarkdown.includes("Continuation Section"), "Rendered document should contain continuation chunk content");
  });
});

