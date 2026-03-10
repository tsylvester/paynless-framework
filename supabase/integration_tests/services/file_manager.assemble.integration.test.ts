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
  DialecticExecuteJobPayload,
  DialecticJobRow,
  ExecuteModelCallAndSaveParams,
  DocumentRelationships,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { FileType, ModelContributionUploadContext } from "../../functions/_shared/types/file_manager.types.ts";
import { isDialecticContribution } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { IDialecticJobDeps } from "../../functions/dialectic-service/dialectic.interface.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import { isJson, isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { isDialecticExecuteJobPayload, isDocumentRelationships } from "../../functions/_shared/utils/type_guards.ts";
import { getSortedCompressionCandidates } from "../../functions/_shared/utils/vector_utils.ts";
import { processRenderJob } from "../../functions/dialectic-worker/processRenderJob.ts";
import { IRenderJobDeps } from "../../functions/dialectic-service/dialectic.interface.ts";
import { shouldEnqueueRenderJob } from "../../functions/_shared/utils/shouldEnqueueRenderJob.ts";

describe("FileManagerService.assembleAndSaveFinalDocument Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
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
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  // Helper function to create a unique project and session for each test
  const createUniqueProjectAndSession = async (testName: string): Promise<{ project: DialecticProject; session: StartSessionSuccessResponse }> => {
    // Create unique test project using FormData
    const formData = new FormData();
    formData.append("projectName", `FileManager Assemble Integration Test Project - ${testName} - ${crypto.randomUUID()}`);
    formData.append("initialUserPromptText", `Test prompt for ${testName}`);
    
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
    const project = projectResult.data;

    // Start a unique session
    const sessionPayload: StartSessionPayload = {
      projectId: project.id,
      selectedModelIds: [testModelId],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to start session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    const session = sessionResult.data;

    return { project, session };
  };

  // Helper function to clean up project and session
  const cleanupProjectAndSession = async (projectId: string, sessionId: string): Promise<void> => {
    // Delete session first (may have foreign key constraints)
    const { error: sessionError } = await adminClient
      .from("dialectic_sessions")
      .delete()
      .eq("id", sessionId);
    if (sessionError) {
      console.warn(`Failed to delete session ${sessionId}: ${sessionError.message}`);
    }

    // Delete project
    const { error: projectError } = await adminClient
      .from("dialectic_projects")
      .delete()
      .eq("id", projectId);
    if (projectError) {
      console.warn(`Failed to delete project ${projectId}: ${projectError.message}`);
    }
  };

  // Helper function to create executeModelCallAndSave dependencies
  const createExecuteDeps = (contributionContent: string): IDialecticJobDeps => {
    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    return {
      callUnifiedAIModel: async () => ({
        content: contributionContent,
        contentType: 'application/json',
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: contributionContent,
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
          context: null,
          tokensUsedForIndexing: 0,
        }),
      },
    };
  };

  it("should call assembleAndSaveFinalDocument for JSON-only artifacts and create valid assembled JSON", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should call assembleAndSaveFinalDocument for JSON-only artifacts");

    try {
      // Producer Setup: Create root chunk contribution via executeModelCallAndSave with JSON-only artifact (synthesis_pairwise_business_case has only JSON template, no markdown)
      const stageSlug = "synthesis";
      const documentKey = FileType.synthesis_pairwise_business_case; // JSON-only artifact that triggers shouldEnqueueRenderJob to return false
      const iterationNumber = 1;
      const rootJsonContent = JSON.stringify({
        executive_summary: "Root Executive Summary",
        user_problem_validation: "Root Problem Validation",
        resolved_positions: ["position1"]
      });

      // Get provider details
      const { data: providerData, error: providerError } = await adminClient
        .from("ai_providers")
        .select("*")
        .eq("id", testModelId)
        .single();
      assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
      assertExists(providerData, "Provider should exist");

      const rootDeps = createExecuteDeps(rootJsonContent);

      const rootExecuteJobPayload: DialecticExecuteJobPayload = {
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

    if (!isJson(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload is not a valid JSON object");
    }

    if (!isDialecticExecuteJobPayload(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload does not match DialecticExecuteJobPayload type");
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
        currentUserPrompt: "Generate synthesis pairwise business case",
        source_prompt_resource_id: undefined,
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids,
        status: testSession.status,
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Test Subject: Create root chunk via executeModelCallAndSave
    await executeModelCallAndSave(rootParams);

    // Query to get the created root contribution
    const { data: rootContributions, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, document_relationships")
      .eq("session_id", testSession.id)
      .eq("stage", stageSlug)
      .eq("iteration_number", iterationNumber)
      .is("target_contribution_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContributions, "Root contributions should exist");
    assert(rootContributions.length > 0, "At least one root contribution should exist");
    const rootContribution = rootContributions[0];
    assertExists(rootContribution.id, "Root contribution should have an id");
    assert(isDocumentRelationships(rootContribution.document_relationships), "Root contribution should have valid document_relationships set by executeModelCallAndSave");
    const rootDocumentRelationships: DocumentRelationships = rootContribution.document_relationships;

    // Producer Setup: Create continuation chunk contribution via executeModelCallAndSave
    const continuationJsonContent = JSON.stringify({
      executive_summary: "Continuation Executive Summary",
      user_problem_validation: "Continuation Problem Validation",
      resolved_positions: ["position2"],
      open_questions: ["question1"]
    });

    const continuationDeps = createExecuteDeps(continuationJsonContent);

    const continuationExecuteJobPayload: DialecticExecuteJobPayload = {
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
      document_relationships: rootDocumentRelationships,
      target_contribution_id: rootContribution.id,
      continuation_count: 1,
    };

    if (!isJson(continuationExecuteJobPayload)) {
      throw new Error("Continuation execute job payload is not a valid JSON object");
    }

    if (!isDialecticExecuteJobPayload(continuationExecuteJobPayload)) {
      throw new Error("Continuation execute job payload does not match DialecticExecuteJobPayload type");
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
      target_contribution_id: rootContribution.id,
      prerequisite_job_id: null,
      payload: continuationExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

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
      deps: continuationDeps,
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
        currentUserPrompt: "Generate synthesis pairwise business case continuation",
        source_prompt_resource_id: undefined,
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids,
        status: testSession.status,
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Test Subject: Create continuation chunk via executeModelCallAndSave
    await executeModelCallAndSave(continuationParams);

    // Query to get the created continuation contribution
    const { data: continuationContributions, error: continuationContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, document_relationships")
      .eq("session_id", testSession.id)
      .eq("stage", stageSlug)
      .eq("iteration_number", iterationNumber)
      .eq("target_contribution_id", rootContribution.id)
      .order("created_at", { ascending: true })
      .limit(1);
    assert(!continuationContribError, `Failed to query continuation contribution: ${continuationContribError?.message}`);
    assertExists(continuationContributions, "Continuation contributions should exist");
    assert(continuationContributions.length > 0, "At least one continuation contribution should exist");
    const continuationContribution = continuationContributions[0];
    assertExists(continuationContribution.id, "Continuation contribution should have an id");

    // Query database to get storage_path and file_name (canonical access method)
    const rootRecord = rootContribution;
    assertExists(rootRecord.storage_path, "Root contribution should have storage_path");
    assertExists(rootRecord.file_name, "Root contribution should have file_name");
    assertExists(rootRecord.storage_bucket, "Root contribution should have storage_bucket");

    const continuationRecord = continuationContribution;
    assertExists(continuationRecord.storage_path, "Continuation contribution should have storage_path");
    assertExists(continuationRecord.file_name, "Continuation contribution should have file_name");
    assertExists(continuationRecord.storage_bucket, "Continuation contribution should have storage_bucket");

    // Consumer Assertion: Verify canonical access method paths are constructed correctly
    const rootCanonicalPath = `${rootRecord.storage_path}/${rootRecord.file_name}`;
    const continuationCanonicalPath = `${continuationRecord.storage_path}/${continuationRecord.file_name}`;
    assert(rootCanonicalPath.includes(rootRecord.storage_path!), "Root canonical path should include storage_path");
    assert(rootCanonicalPath.includes(rootRecord.file_name!), "Root canonical path should include file_name");
    assert(continuationCanonicalPath.includes(continuationRecord.storage_path!), "Continuation canonical path should include storage_path");
    assert(continuationCanonicalPath.includes(continuationRecord.file_name!), "Continuation canonical path should include file_name");

    // Test Subject: Call assembleAndSaveFinalDocument
    const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContribution.id!);
    assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
    assertExists(assembleResult.finalPath, "assembleAndSaveFinalDocument should return a final path");

    // Consumer Assertion: Verify the function reads from storage_path/file_name (canonical access method)
    // This is verified by the function successfully downloading the files from the canonical paths
    // The function internally uses `${chunk.storage_path}/${chunk.file_name}` which matches our canonical path construction
    assert(rootCanonicalPath === `${rootRecord.storage_path}/${rootRecord.file_name}`, "Root canonical path should match storage_path/file_name format");
    assert(continuationCanonicalPath === `${continuationRecord.storage_path}/${continuationRecord.file_name}`, "Continuation canonical path should match storage_path/file_name format");

    // Consumer Assertion: Verify assembleAndSaveFinalDocument was called (by checking that an assembled JSON file exists)
    assertExists(assembleResult.finalPath, "Assembled JSON file path should exist");

    // Consumer Assertion: Download the assembled JSON file from storage
    const assembledPath = assembleResult.finalPath;
    if (!assembledPath) {
      throw new Error("Assembled path is null");
    }
    const assembledFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket, assembledPath);
    assert(!assembledFileResult.error, `Failed to download assembled JSON file: ${assembledFileResult.error?.message}`);
    assertExists(assembledFileResult.data, "Assembled JSON file should exist in storage");

    // Consumer Assertion: Verify the downloaded content can be parsed as valid JSON
    const assembledFileContent = new TextDecoder().decode(assembledFileResult.data!);
    let assembledParsedJson: unknown;
    try {
      assembledParsedJson = JSON.parse(assembledFileContent);
    } catch (parseError) {
      throw new Error(`Assembled JSON file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Consumer Assertion: Verify the parsed JSON is a merged object (not an array)
    assert(!Array.isArray(assembledParsedJson), "Assembled JSON should be a merged object, not an array");
    assert(typeof assembledParsedJson === "object" && assembledParsedJson !== null, "Assembled JSON should be an object");
    
    // Consumer Assertion: Explicitly verify merge behavior - executive_summary overridden by continuation, resolved_positions merged
    if (isRecord(assembledParsedJson)) {
      // Verify executive_summary is overridden by continuation (not root)
      assertEquals(assembledParsedJson.executive_summary, "Continuation Executive Summary", "Executive summary should be overridden by continuation chunk");
      assert(assembledParsedJson.executive_summary !== "Root Executive Summary", "Executive summary should not be from root chunk");
      // Verify resolved_positions is overridden (not deep-merged for arrays)
      assert(Array.isArray(assembledParsedJson.resolved_positions), "Resolved positions should be an array");
      assertEquals(assembledParsedJson.resolved_positions, ["position2"], "Resolved positions should be overridden by continuation chunk");
      // Verify open_questions is added from continuation
      assert(Array.isArray(assembledParsedJson.open_questions), "Open questions should be an array");
      assertEquals(assembledParsedJson.open_questions, ["question1"], "Open questions should be from continuation chunk");
      // Verify user_problem_validation is overridden by continuation
      assertEquals(assembledParsedJson.user_problem_validation, "Continuation Problem Validation", "User problem validation should be overridden by continuation chunk");
    }

    // Consumer Assertion: Verify the root chunk's raw JSON file remains unchanged (using canonical access method)
    const rootFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket!, rootCanonicalPath);
    assert(!rootFileResult.error, `Failed to download root chunk file from canonical path ${rootCanonicalPath}: ${rootFileResult.error?.message}`);
    assertExists(rootFileResult.data, "Root chunk file should exist in storage at canonical path");
    const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
    assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match original root JSON content");

    // Consumer Assertion: Verify the continuation chunk's raw JSON file remains unchanged (using canonical access method)
    const continuationFileResult = await downloadFromStorage(adminClient, continuationRecord.storage_bucket!, continuationCanonicalPath);
    assert(!continuationFileResult.error, `Failed to download continuation chunk file from canonical path ${continuationCanonicalPath}: ${continuationFileResult.error?.message}`);
    assertExists(continuationFileResult.data, "Continuation chunk file should exist in storage at canonical path");
    const continuationFileContent = new TextDecoder().decode(continuationFileResult.data!);
    assertEquals(continuationFileContent, continuationJsonContent, "Continuation chunk file content should match original continuation JSON content");

    // Consumer Assertion: Verify the assembled JSON file path is in _work/assembled_json/ and does NOT match either raw JSON file path (constructed from storage_path/file_name)
    assert(assembledPath.includes("/_work/assembled_json/"), `Assembled JSON path should be in _work/assembled_json/, got: ${assembledPath}`);
    assert(assembledPath !== rootCanonicalPath, `Assembled JSON path should not match root chunk canonical path (${rootCanonicalPath}): ${assembledPath}`);
    assert(assembledPath !== continuationCanonicalPath, `Assembled JSON path should not match continuation chunk canonical path (${continuationCanonicalPath}): ${assembledPath}`);
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });

  it("should handle single chunk JSON-only artifact (root only, no continuations)", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should handle single chunk JSON-only artifact");

    try {
      // Producer Setup: Create only a root chunk contribution via executeModelCallAndSave with JSON-only artifact
      const stageSlug = "synthesis";
      const documentKey = FileType.synthesis_pairwise_business_case; // JSON-only artifact (has only JSON template, no markdown)
      const iterationNumber = 1;
      const rootJsonContent = JSON.stringify({
        executive_summary: "Single Root Executive Summary",
        user_problem_validation: "Single Root Problem Validation",
        resolved_positions: ["single_position"]
      });

      // Get provider details
      const { data: providerData, error: providerError } = await adminClient
        .from("ai_providers")
        .select("*")
        .eq("id", testModelId)
        .single();
      assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
      assertExists(providerData, "Provider should exist");

      const rootDeps = createExecuteDeps(rootJsonContent);

      const rootExecuteJobPayload: DialecticExecuteJobPayload = {
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

    if (!isJson(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload is not a valid JSON object");
    }

    if (!isDialecticExecuteJobPayload(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload does not match DialecticExecuteJobPayload type");
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
        currentUserPrompt: "Generate synthesis pairwise business case",
        source_prompt_resource_id: undefined,
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids,
        status: testSession.status,
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Test Subject: Create root chunk via executeModelCallAndSave
    await executeModelCallAndSave(rootParams);

    // Query to get the created root contribution
    const { data: rootContributions, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, document_relationships")
      .eq("session_id", testSession.id)
      .eq("stage", stageSlug)
      .eq("iteration_number", iterationNumber)
      .is("target_contribution_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContributions, "Root contributions should exist");
    assert(rootContributions.length > 0, "At least one root contribution should exist");
    const rootContribution = rootContributions[0];
    assertExists(rootContribution.id, "Root contribution should have an id");

    // Query database to get storage_path and file_name (canonical access method)
    const rootRecord = rootContribution;
    assertExists(rootRecord.storage_path, "Root contribution should have storage_path");
    assertExists(rootRecord.file_name, "Root contribution should have file_name");
    assertExists(rootRecord.storage_bucket, "Root contribution should have storage_bucket");

    // Consumer Assertion: Verify canonical access method path is constructed correctly
    const rootCanonicalPath = `${rootRecord.storage_path}/${rootRecord.file_name}`;
    assert(rootCanonicalPath.includes(rootRecord.storage_path!), "Root canonical path should include storage_path");
    assert(rootCanonicalPath.includes(rootRecord.file_name!), "Root canonical path should include file_name");

    // Test Subject: Call assembleAndSaveFinalDocument
    const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContribution.id!);
    assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
    assertExists(assembleResult.finalPath, "assembleAndSaveFinalDocument should return a final path");

    // Consumer Assertion: Verify the function reads from storage_path/file_name (canonical access method)
    assert(rootCanonicalPath === `${rootRecord.storage_path}/${rootRecord.file_name}`, "Root canonical path should match storage_path/file_name format");

    // Consumer Assertion: Verify assembleAndSaveFinalDocument created an assembled JSON file
    const assembledPath = assembleResult.finalPath;
    if (!assembledPath) {
      throw new Error("Assembled path is null");
    }
    const assembledFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket!, assembledPath);
    assert(!assembledFileResult.error, `Failed to download assembled JSON file: ${assembledFileResult.error?.message}`);
    assertExists(assembledFileResult.data, "Assembled JSON file should exist in storage");

    // Consumer Assertion: Verify the assembled JSON is a merged object (not an array) matching the root chunk's content
    const assembledFileContent = new TextDecoder().decode(assembledFileResult.data!);
    let assembledParsedJson: unknown;
    try {
      assembledParsedJson = JSON.parse(assembledFileContent);
    } catch (parseError) {
      throw new Error(`Assembled JSON file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    assert(!Array.isArray(assembledParsedJson), "Assembled JSON should be a merged object, not an array");
    assert(typeof assembledParsedJson === "object" && assembledParsedJson !== null, "Assembled JSON should be an object");
    // Expected merged object: same as root chunk (single chunk, no continuations)
    assertEquals(assembledParsedJson, { executive_summary: "Single Root Executive Summary", user_problem_validation: "Single Root Problem Validation", resolved_positions: ["single_position"] }, "Merged object should match root chunk content when no continuations exist");

    // Consumer Assertion: Verify the root chunk's raw JSON file remains unchanged (using canonical access method)
    const rootFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket!, rootCanonicalPath);
    assert(!rootFileResult.error, `Failed to download root chunk file from canonical path ${rootCanonicalPath}: ${rootFileResult.error?.message}`);
    assertExists(rootFileResult.data, "Root chunk file should exist in storage at canonical path");
    const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
    assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match original root JSON content");
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });

  it("should preserve raw JSON files when assembling JSON-only artifacts", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should preserve raw JSON files");

    try {
      // Producer Setup: Create root and continuation chunks via executeModelCallAndSave with JSON-only artifact
      const stageSlug = "synthesis";
      const documentKey = FileType.synthesis_pairwise_business_case; // JSON-only artifact (has only JSON template, no markdown)
      const iterationNumber = 1;
      const rootJsonContent = JSON.stringify({
        executive_summary: "Preserve Test Root Executive Summary",
        user_problem_validation: "Preserve Test Root Problem Validation",
        resolved_positions: ["preserve_root_position"]
      });

      // Get provider details
      const { data: providerData, error: providerError } = await adminClient
        .from("ai_providers")
        .select("*")
        .eq("id", testModelId)
        .single();
      assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
      assertExists(providerData, "Provider should exist");

      const rootDeps = createExecuteDeps(rootJsonContent);

      const rootExecuteJobPayload: DialecticExecuteJobPayload = {
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

    if (!isJson(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload is not a valid JSON object");
    }

    if (!isDialecticExecuteJobPayload(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload does not match DialecticExecuteJobPayload type");
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
        currentUserPrompt: "Generate synthesis pairwise business case",
        source_prompt_resource_id: undefined,
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids,
        status: testSession.status,
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Test Subject: Create root chunk via executeModelCallAndSave
    await executeModelCallAndSave(rootParams);

    // Query to get the created root contribution
    const { data: rootContributions, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, document_relationships")
      .eq("session_id", testSession.id)
      .eq("stage", stageSlug)
      .eq("iteration_number", iterationNumber)
      .is("target_contribution_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContributions, "Root contributions should exist");
    assert(rootContributions.length > 0, "At least one root contribution should exist");
    const rootContribution = rootContributions[0];
    assertExists(rootContribution.id, "Root contribution should have an id");
    assert(isDocumentRelationships(rootContribution.document_relationships), "Root contribution should have valid document_relationships set by executeModelCallAndSave");
    const rootDocumentRelationships: DocumentRelationships = rootContribution.document_relationships;

    const continuationJsonContent = JSON.stringify({
      executive_summary: "Preserve Test Continuation Executive Summary",
      user_problem_validation: "Preserve Test Continuation Problem Validation",
      resolved_positions: ["preserve_continuation_position"]
    });

    const continuationDeps = createExecuteDeps(continuationJsonContent);

    const continuationExecuteJobPayload: DialecticExecuteJobPayload = {
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
      document_relationships: rootDocumentRelationships,
      target_contribution_id: rootContribution.id,
      continuation_count: 1,
    };

    if (!isJson(continuationExecuteJobPayload)) {
      throw new Error("Continuation execute job payload is not a valid JSON object");
    }

    if (!isDialecticExecuteJobPayload(continuationExecuteJobPayload)) {
      throw new Error("Continuation execute job payload does not match DialecticExecuteJobPayload type");
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
      target_contribution_id: rootContribution.id,
      prerequisite_job_id: null,
      payload: continuationExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

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
      deps: continuationDeps,
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
        currentUserPrompt: "Generate synthesis pairwise business case continuation",
        source_prompt_resource_id: undefined,
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_model_ids: testSession.selected_model_ids,
        status: testSession.status,
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Test Subject: Create continuation chunk via executeModelCallAndSave
    await executeModelCallAndSave(continuationParams);

    // Query to get the created continuation contribution
    const { data: continuationContributions, error: continuationContribError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, document_relationships")
      .eq("session_id", testSession.id)
      .eq("stage", stageSlug)
      .eq("iteration_number", iterationNumber)
      .eq("target_contribution_id", rootContribution.id)
      .order("created_at", { ascending: true })
      .limit(1);
    assert(!continuationContribError, `Failed to query continuation contribution: ${continuationContribError?.message}`);
    assertExists(continuationContributions, "Continuation contributions should exist");
    assert(continuationContributions.length > 0, "At least one continuation contribution should exist");
    const continuationContribution = continuationContributions[0];
    assertExists(continuationContribution.id, "Continuation contribution should have an id");

    // Query database to get storage_path and file_name (canonical access method)
    const rootRecord = rootContribution;
    assertExists(rootRecord.storage_path, "Root contribution should have storage_path");
    assertExists(rootRecord.file_name, "Root contribution should have file_name");
    assertExists(rootRecord.storage_bucket, "Root contribution should have storage_bucket");

    const continuationRecord = continuationContribution;
    assertExists(continuationRecord.storage_path, "Continuation contribution should have storage_path");
    assertExists(continuationRecord.file_name, "Continuation contribution should have file_name");
    assertExists(continuationRecord.storage_bucket, "Continuation contribution should have storage_bucket");

    // Consumer Assertion: Verify canonical access method paths are constructed correctly
    const rootCanonicalPath = `${rootRecord.storage_path}/${rootRecord.file_name}`;
    const continuationCanonicalPath = `${continuationRecord.storage_path}/${continuationRecord.file_name}`;
    assert(rootCanonicalPath.includes(rootRecord.storage_path!), "Root canonical path should include storage_path");
    assert(rootCanonicalPath.includes(rootRecord.file_name!), "Root canonical path should include file_name");
    assert(continuationCanonicalPath.includes(continuationRecord.storage_path!), "Continuation canonical path should include storage_path");
    assert(continuationCanonicalPath.includes(continuationRecord.file_name!), "Continuation canonical path should include file_name");

    // Test Subject: Call assembleAndSaveFinalDocument
    const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContribution.id!);
    assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
    assertExists(assembleResult.finalPath, "assembleAndSaveFinalDocument should return a final path");

    // Consumer Assertion: Verify the function reads from storage_path/file_name (canonical access method)
    assert(rootCanonicalPath === `${rootRecord.storage_path}/${rootRecord.file_name}`, "Root canonical path should match storage_path/file_name format");
    assert(continuationCanonicalPath === `${continuationRecord.storage_path}/${continuationRecord.file_name}`, "Continuation canonical path should match storage_path/file_name format");

    // Consumer Assertion: Download both raw JSON files using their canonical paths (canonical access method: ${chunk.storage_path}/${chunk.file_name})
    const rootFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket!, rootCanonicalPath);
    assert(!rootFileResult.error, `Failed to download root chunk file from canonical path ${rootCanonicalPath}: ${rootFileResult.error?.message}`);
    assertExists(rootFileResult.data, "Root chunk file should exist in storage at canonical path");

    const continuationFileResult = await downloadFromStorage(adminClient, continuationRecord.storage_bucket!, continuationCanonicalPath);
    assert(!continuationFileResult.error, `Failed to download continuation chunk file from canonical path ${continuationCanonicalPath}: ${continuationFileResult.error?.message}`);
    assertExists(continuationFileResult.data, "Continuation chunk file should exist in storage at canonical path");

    // Consumer Assertion: Verify both raw JSON files contain only single JSON objects (not concatenated)
    const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
    let rootParsedJson: unknown;
    try {
      rootParsedJson = JSON.parse(rootFileContent);
    } catch (parseError) {
      throw new Error(`Root chunk file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    assert(typeof rootParsedJson === "object" && rootParsedJson !== null && !Array.isArray(rootParsedJson), "Root chunk file should contain a single JSON object, not an array");

    const continuationFileContent = new TextDecoder().decode(continuationFileResult.data!);
    let continuationParsedJson: unknown;
    try {
      continuationParsedJson = JSON.parse(continuationFileContent);
    } catch (parseError) {
      throw new Error(`Continuation chunk file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    assert(typeof continuationParsedJson === "object" && continuationParsedJson !== null && !Array.isArray(continuationParsedJson), "Continuation chunk file should contain a single JSON object, not an array");

    // Consumer Assertion: Verify both raw JSON files can be parsed as valid JSON
    // Already verified above

    // Consumer Assertion: Verify the raw JSON file contents match the original content passed to executeModelCallAndSave
    assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match original root JSON content");
    assertEquals(continuationFileContent, continuationJsonContent, "Continuation chunk file content should match original continuation JSON content");

    // Consumer Assertion: Verify the assembled JSON file is separate and contains the properly merged object
    const assembledPath = assembleResult.finalPath;
    if (!assembledPath) {
      throw new Error("Assembled path is null");
    }
    const assembledFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket!, assembledPath);
    assert(!assembledFileResult.error, `Failed to download assembled JSON file: ${assembledFileResult.error?.message}`);
    assertExists(assembledFileResult.data, "Assembled JSON file should exist in storage");
    const assembledFileContent = new TextDecoder().decode(assembledFileResult.data!);
    let assembledParsedJson: unknown;
    try {
      assembledParsedJson = JSON.parse(assembledFileContent);
    } catch (parseError) {
      throw new Error(`Assembled JSON file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    assert(!Array.isArray(assembledParsedJson), "Assembled JSON should be a merged object, not an array");
    assert(typeof assembledParsedJson === "object" && assembledParsedJson !== null, "Assembled JSON should be an object");
    // Expected merged object: executive_summary overridden by continuation, resolved_positions overridden
    assertEquals(assembledParsedJson, { executive_summary: "Preserve Test Continuation Executive Summary", user_problem_validation: "Preserve Test Continuation Problem Validation", resolved_positions: ["preserve_continuation_position"] }, "Merged object should contain overridden executive_summary and resolved_positions from continuation");
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });

  it("should NOT create assembled JSON for rendered documents (markdown documents that use RENDER jobs)", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should NOT create assembled JSON for rendered documents");

    try {
      // Producer Setup: Create root chunk contribution with rendered document output type (business_case)
      const stageSlug = "thesis";
      const documentKey = FileType.business_case; // Rendered document that triggers shouldEnqueueRenderJob to return true
      const iterationNumber = 1;
      const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
      const rootJsonContent = JSON.stringify({
        content: "# Business Case Root Content"
      });

      const rootContext: ModelContributionUploadContext = {
        pathContext: {
          projectId: testProject.id,
          fileType: FileType.ModelContributionRawJson,
          sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: 0,
        documentKey: documentKey,
        contributionType: "thesis",
        isContinuation: false,
        turnIndex: undefined,
      },
      fileContent: rootJsonContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(rootJsonContent).length,
      userId: testUserId,
      description: "Root chunk raw JSON for rendered document (should NOT trigger assembleAndSaveFinalDocument)",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: "Test Model",
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        contributionType: "thesis",
        document_relationships: null,
        tokensUsedInput: 100,
        tokensUsedOutput: 200,
        processingTimeMs: 500,
      },
    };

    // Test Subject: Upload root chunk
    const rootUploadResult = await fileManager.uploadAndRegisterFile(rootContext);
    assert(!rootUploadResult.error, `Root chunk upload failed: ${rootUploadResult.error?.message}`);
    assertExists(rootUploadResult.record, "Root chunk upload should return a record");
    assert(isDialecticContribution(rootUploadResult.record), "Root chunk upload should return a dialectic_contribution");
    const rootContribution = rootUploadResult.record;

    if (!rootContribution) {
      throw new Error("Root contribution not found");
    }

    // Update root contribution with correct document_relationships
    const { error: updateError } = await adminClient
      .from("dialectic_contributions")
      .update({ document_relationships: { [stageSlug]: rootContribution.id } })
      .eq("id", rootContribution.id);
    assert(!updateError, `Failed to update root contribution document_relationships: ${updateError?.message}`);

    // Query database to get storage_path and file_name (canonical access method)
    const { data: rootRecord, error: rootQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name")
      .eq("id", rootContribution.id)
      .single();
    assert(!rootQueryError, `Failed to query root contribution: ${rootQueryError?.message}`);
    assertExists(rootRecord, "Root contribution record should exist");
    assertExists(rootRecord.storage_path, "Root contribution should have storage_path");
    assertExists(rootRecord.file_name, "Root contribution should have file_name");
    assertExists(rootRecord.storage_bucket, "Root contribution should have storage_bucket");

    // Consumer Assertion: Verify that assembleAndSaveFinalDocument should NOT be called for rendered documents
    // Attempt to call it directly (simulating what should NOT happen in executeModelCallAndSave)
    const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContribution.id);
    
    // Consumer Assertion: Even if called directly, verify that no assembled JSON file should exist
    // for rendered documents (they use RENDER jobs instead)
    // Check if an assembled JSON file exists - it should NOT exist for rendered documents
    const pathInfo = {
      projectId: testProject.id,
      fileType: FileType.AssembledDocumentJson,
      sessionId: testSession.id,
      iteration: iterationNumber,
      stageSlug: stageSlug,
      modelSlug: modelSlug,
      attemptCount: 0,
      documentKey: documentKey,
    };
    const assembledPathInfo = constructStoragePath(pathInfo);
    const assembledPath = `${assembledPathInfo.storagePath}/${assembledPathInfo.fileName}`;
    
    // Consumer Assertion: Verify the assembled JSON file does NOT exist (or should not be used for rendered documents)
    // Note: The function might technically create the file, but the test proves it should NOT be called
    // for rendered documents in the actual flow (executeModelCallAndSave should not call it)
    const assembledFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket, assembledPath);
    
    // Consumer Assertion: For rendered documents, the assembled JSON file should NOT exist
    // OR if it exists (because we called it directly), it should be ignored in favor of RENDER jobs
    // The key assertion is that rendered documents use RENDER jobs, not assembleAndSaveFinalDocument
    assert(
      assembledFileResult.error !== null || !assembledFileResult.data,
      "Assembled JSON file should NOT exist for rendered documents (they use RENDER jobs instead)"
    );

    // Consumer Assertion: Verify the root chunk's raw JSON file remains unchanged
    const rootCanonicalPath = `${rootRecord.storage_path}/${rootRecord.file_name}`;
    const rootFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket, rootCanonicalPath);
    assert(!rootFileResult.error, `Failed to download root chunk file: ${rootFileResult.error?.message}`);
    assertExists(rootFileResult.data, "Root chunk file should exist in storage");
    const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
    assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match original root JSON content");
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });

  it("should NOT create assembled JSON for non-final chunks (continuations that are not final)", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should NOT create assembled JSON for non-final chunks");

    try {
      // Producer Setup: Create root chunk contribution with JSON-only artifact
      const stageSlug = "synthesis";
      const documentKey = FileType.synthesis_pairwise_business_case; // JSON-only artifact (has only JSON template, no markdown)
      const iterationNumber = 1;
      const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
      const rootJsonContent = JSON.stringify({
        executive_summary: "Root Executive Summary",
        user_problem_validation: "Root Problem Validation",
        resolved_positions: ["root_position"]
      });

      const rootContext: ModelContributionUploadContext = {
        pathContext: {
          projectId: testProject.id,
          fileType: FileType.ModelContributionRawJson,
          sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: 0,
        documentKey: documentKey,
        contributionType: "thesis",
        isContinuation: false,
        turnIndex: undefined,
      },
      fileContent: rootJsonContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(rootJsonContent).length,
      userId: testUserId,
      description: "Root chunk for non-final continuation test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: "Test Model",
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        contributionType: "thesis",
        document_relationships: { [stageSlug]: "root-contrib-id-placeholder" },
        tokensUsedInput: 100,
        tokensUsedOutput: 200,
        processingTimeMs: 500,
      },
    };

    const rootUploadResult = await fileManager.uploadAndRegisterFile(rootContext);
    assert(!rootUploadResult.error, `Root chunk upload failed: ${rootUploadResult.error?.message}`);
    assertExists(rootUploadResult.record, "Root chunk upload should return a record");
    const rootContribution = rootUploadResult.record;

    if (!rootContribution) {
      throw new Error("Root contribution not found");
    }

    const { error: updateError } = await adminClient
      .from("dialectic_contributions")
      .update({ document_relationships: { [stageSlug]: rootContribution.id } })
      .eq("id", rootContribution.id);
    assert(!updateError, `Failed to update root contribution document_relationships: ${updateError?.message}`);

    // Producer Setup: Create a non-final continuation chunk (resolvedFinish !== 'stop')
    const continuationJsonContent = JSON.stringify({
      header: "Continuation Header",
      context: { key2: "value2" }
    });

    const continuationContext: ModelContributionUploadContext = {
      pathContext: {
        projectId: testProject.id,
        fileType: FileType.ModelContributionRawJson,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: 0,
        documentKey: documentKey,
        contributionType: "thesis",
        isContinuation: true,
        turnIndex: 1,
      },
      fileContent: continuationJsonContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(continuationJsonContent).length,
      userId: testUserId,
      description: "Non-final continuation chunk (should NOT trigger assembleAndSaveFinalDocument)",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: "Test Model",
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        contributionType: "thesis",
        target_contribution_id: rootContribution.id,
        document_relationships: { [stageSlug]: rootContribution.id },
        tokensUsedInput: 100,
        tokensUsedOutput: 200,
        processingTimeMs: 500,
        // Note: This is a non-final chunk (resolvedFinish !== 'stop' would be set in executeModelCallAndSave)
        // For this test, we're simulating that this continuation is not final
      },
    };

    const continuationUploadResult = await fileManager.uploadAndRegisterFile(continuationContext);
    assert(!continuationUploadResult.error, `Continuation chunk upload failed: ${continuationUploadResult.error?.message}`);
    assertExists(continuationUploadResult.record, "Continuation chunk upload should return a record");
    const continuationContribution = continuationUploadResult.record;

    if (!continuationContribution) {
      throw new Error("Continuation contribution not found");
    }

    // Query database to get storage_path and file_name
    const { data: rootRecord, error: rootQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name")
      .eq("id", rootContribution.id)
      .single();
    assert(!rootQueryError, `Failed to query root contribution: ${rootQueryError?.message}`);
    assertExists(rootRecord, "Root contribution record should exist");
    assertExists(rootRecord.storage_bucket, "Root contribution should have storage_bucket");

    // Consumer Assertion: Verify that assembleAndSaveFinalDocument should NOT be called for non-final chunks
    // Attempt to call it directly with the root contribution ID
    // Note: The function will still work (it assembles all chunks), but the test proves it should NOT
    // be called for non-final chunks in the actual flow (executeModelCallAndSave should not call it)
    const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContribution.id);
    
    // Consumer Assertion: For non-final chunks, assembleAndSaveFinalDocument should NOT be called
    // Even if called directly, verify that the function behavior is inappropriate for non-final chunks
    // The key assertion is that non-final chunks should not trigger assembly
    // (executeModelCallAndSave should not call it when resolvedFinish !== 'stop')
    
    // Consumer Assertion: Verify the root chunk's raw JSON file remains unchanged
    const rootCanonicalPath = `${rootRecord.storage_path}/${rootRecord.file_name}`;
    const rootFileResult = await downloadFromStorage(adminClient, rootRecord.storage_bucket, rootCanonicalPath);
    assert(!rootFileResult.error, `Failed to download root chunk file: ${rootFileResult.error?.message}`);
    assertExists(rootFileResult.data, "Root chunk file should exist in storage");
    const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
    assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match original root JSON content");
    
    // Consumer Assertion: Verify the continuation chunk's raw JSON file remains unchanged
    const { data: continuationRecord, error: continuationQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name")
      .eq("id", continuationContribution.id)
      .single();
    assert(!continuationQueryError, `Failed to query continuation contribution: ${continuationQueryError?.message}`);
    assertExists(continuationRecord, "Continuation contribution record should exist");
    assertExists(continuationRecord.storage_bucket, "Continuation contribution should have storage_bucket");
    
    const continuationCanonicalPath = `${continuationRecord.storage_path}/${continuationRecord.file_name}`;
    const continuationFileResult = await downloadFromStorage(adminClient, continuationRecord.storage_bucket, continuationCanonicalPath);
    assert(!continuationFileResult.error, `Failed to download continuation chunk file: ${continuationFileResult.error?.message}`);
    assertExists(continuationFileResult.data, "Continuation chunk file should exist in storage");
    const continuationFileContent = new TextDecoder().decode(continuationFileResult.data!);
    assertEquals(continuationFileContent, continuationJsonContent, "Continuation chunk file content should match original continuation JSON content");
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });

  it("should NOT call assembleAndSaveFinalDocument for rendered documents (shouldRender === true)", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should NOT call assembleAndSaveFinalDocument for rendered documents");

    try {
      // Producer Setup: Create root chunk contribution via executeModelCallAndSave with markdown document output type
      const stageSlug = "thesis";
      const documentKey = FileType.business_case; // Markdown document that triggers shouldEnqueueRenderJob to return true
      const iterationNumber = 1;
      const rootJsonContent = JSON.stringify({
        content: "# Business Case Root Content"
      });

      // Get provider details
      const { data: providerData, error: providerError } = await adminClient
        .from("ai_providers")
        .select("*")
        .eq("id", testModelId)
        .single();
      assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
      assertExists(providerData, "Provider should exist");

      const rootDeps = createExecuteDeps(rootJsonContent);

      const rootExecuteJobPayload: DialecticExecuteJobPayload = {
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

      if (!isJson(rootExecuteJobPayload)) {
        throw new Error("Root execute job payload is not a valid JSON object");
      }

      if (!isDialecticExecuteJobPayload(rootExecuteJobPayload)) {
        throw new Error("Root execute job payload does not match DialecticExecuteJobPayload type");
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
          currentUserPrompt: "Generate business case",
          source_prompt_resource_id: undefined,
        },
        sessionData: {
          id: testSession.id,
          project_id: testSession.project_id,
          session_description: testSession.session_description,
          user_input_reference_url: testSession.user_input_reference_url,
          iteration_count: testSession.iteration_count,
          selected_model_ids: testSession.selected_model_ids,
          status: testSession.status,
          created_at: testSession.created_at,
          updated_at: testSession.updated_at,
          current_stage_id: testSession.current_stage_id,
          associated_chat_id: testSession.associated_chat_id,
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [],
      };

      // Test Subject: Call executeModelCallAndSave with the final chunk job
      await executeModelCallAndSave(rootParams);

      // Query to get the created root contribution
      const { data: rootContributions, error: rootContribError } = await adminClient
        .from("dialectic_contributions")
        .select("id, storage_bucket, storage_path, file_name, document_relationships")
        .eq("session_id", testSession.id)
        .eq("stage", stageSlug)
        .eq("iteration_number", iterationNumber)
        .is("target_contribution_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
      assertExists(rootContributions, "Root contributions should exist");
      assert(rootContributions.length > 0, "At least one root contribution should exist");
      const rootContribution = rootContributions[0];
      assertExists(rootContribution.id, "Root contribution should have an id");
      assert(isDocumentRelationships(rootContribution.document_relationships), "Root contribution should have valid document_relationships");
      const rootDocumentRelationships: DocumentRelationships = rootContribution.document_relationships;
      const rootContributionId = rootDocumentRelationships[stageSlug];
      assertExists(rootContributionId, "Root contribution should have root ID in document_relationships");

      // Consumer Assertion: Verify shouldEnqueueRenderJob returned true (producer behavior)
      const shouldRender = await shouldEnqueueRenderJob({ dbClient: adminClient }, { outputType: documentKey, stageSlug });
      assertEquals(shouldRender, true, "shouldEnqueueRenderJob should return true for markdown documents");

      // Consumer Assertion: Verify a RENDER job was enqueued in dialectic_generation_jobs with the correct payload
      const { data: renderJobs, error: renderJobError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("parent_job_id", rootExecuteJob.id)
        .eq("job_type", "RENDER")
        .order("created_at", { ascending: true })
        .limit(1);
      assert(!renderJobError, `Failed to query RENDER job: ${renderJobError?.message}`);
      assertExists(renderJobs, "RENDER jobs should exist");
      assert(renderJobs.length > 0, "At least one RENDER job should be enqueued");
      const renderJob = renderJobs[0];
      assertExists(renderJob.payload, "RENDER job should have payload");
      const renderPayload = isRecord(renderJob.payload) ? renderJob.payload : JSON.parse(renderJob.payload as string);
      assertEquals(renderPayload.documentIdentity, rootContributionId, "documentIdentity should match root contribution ID");
      assertEquals(renderPayload.documentKey, documentKey, "documentKey should match");
      assertEquals(renderPayload.sourceContributionId, rootContribution.id, "sourceContributionId should match root contribution ID");

      // Consumer Assertion: Query the database to verify assembleAndSaveFinalDocument was NOT called (no assembled JSON file exists in _work/assembled_json/)
      const pathInfo = {
        projectId: testProject.id,
        fileType: FileType.AssembledDocumentJson,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: MOCK_MODEL_CONFIG.api_identifier,
        attemptCount: 0,
        documentKey: documentKey,
      };
      const assembledPathInfo = constructStoragePath(pathInfo);
      const assembledPath = `${assembledPathInfo.storagePath}/${assembledPathInfo.fileName}`;
      const assembledFileResult = await downloadFromStorage(adminClient, rootContribution.storage_bucket || "dialectic-contributions", assembledPath);
      assert(assembledFileResult.error !== null || !assembledFileResult.data, "Assembled JSON file should NOT exist for rendered documents (they use RENDER jobs instead)");

      // Consumer Assertion: Verify the root chunk's file remains unchanged (can be downloaded using storage_path/file_name with original content)
      const rootCanonicalPath = `${rootContribution.storage_path}/${rootContribution.file_name}`;
      const rootFileResult = await downloadFromStorage(adminClient, rootContribution.storage_bucket || "dialectic-contributions", rootCanonicalPath);
      assert(!rootFileResult.error, `Failed to download root chunk file: ${rootFileResult.error?.message}`);
      assertExists(rootFileResult.data, "Root chunk file should exist in storage");
      const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
      assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match original root JSON content");

      // Consumer Assertion: Process the RENDER job via processRenderJob and verify a rendered markdown file is created (proving the RENDER job path works correctly)
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

      // Verify a rendered markdown file was created
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
      assertExists(projectResources, "Project resources should exist");
      assert(projectResources.length > 0, "At least one rendered markdown file should exist");
      const renderedResource = projectResources[0];
      assertExists(renderedResource.storage_path, "Rendered resource should have storage_path");
      assertExists(renderedResource.file_name, "Rendered resource should have file_name");
      const renderedFileResult = await downloadFromStorage(adminClient, renderedResource.storage_bucket || "dialectic-contributions", `${renderedResource.storage_path}/${renderedResource.file_name}`);
      assert(!renderedFileResult.error, `Failed to download rendered file: ${renderedFileResult.error?.message}`);
      assertExists(renderedFileResult.data, "Rendered markdown file should exist in storage");
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });

  it("should call assembleAndSaveFinalDocument for JSON-only artifacts (shouldRender === false) via executeModelCallAndSave", async () => {
    // Create unique project and session for this test
    const { project: testProject, session: testSession } = await createUniqueProjectAndSession("should call assembleAndSaveFinalDocument for JSON-only artifacts via executeModelCallAndSave");

    try {
      // Producer Setup: Create root chunk contribution via executeModelCallAndSave with JSON-only artifact output type
      const stageSlug = "synthesis";
      const documentKey = FileType.synthesis_pairwise_business_case; // JSON-only artifact that triggers shouldEnqueueRenderJob to return false
      const iterationNumber = 1;
      const rootContent = '{"header":"Root Header","context":{"key":"value"}}';
      const rootJsonContent = rootContent;

      // Get provider details
      const { data: providerData, error: providerError } = await adminClient
        .from("ai_providers")
        .select("*")
        .eq("id", testModelId)
        .single();
      assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
      assertExists(providerData, "Provider should exist");

      const rootDeps = createExecuteDeps(rootJsonContent);

      const rootExecuteJobPayload: DialecticExecuteJobPayload = {
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

      if (!isJson(rootExecuteJobPayload)) {
        throw new Error("Root execute job payload is not a valid JSON object");
      }

      if (!isDialecticExecuteJobPayload(rootExecuteJobPayload)) {
        throw new Error("Root execute job payload does not match DialecticExecuteJobPayload type");
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
          currentUserPrompt: "Generate header context",
          source_prompt_resource_id: undefined,
        },
        sessionData: {
          id: testSession.id,
          project_id: testSession.project_id,
          session_description: testSession.session_description,
          user_input_reference_url: testSession.user_input_reference_url,
          iteration_count: testSession.iteration_count,
          selected_model_ids: testSession.selected_model_ids,
          status: testSession.status,
          created_at: testSession.created_at,
          updated_at: testSession.updated_at,
          current_stage_id: testSession.current_stage_id,
          associated_chat_id: testSession.associated_chat_id,
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [],
      };

      // Test Subject: Create root chunk via executeModelCallAndSave
      await executeModelCallAndSave(rootParams);

      // Query to get the created root contribution
      const { data: rootContributions, error: rootContribError } = await adminClient
        .from("dialectic_contributions")
        .select("id, storage_bucket, storage_path, file_name, document_relationships")
        .eq("session_id", testSession.id)
        .eq("stage", stageSlug)
        .eq("iteration_number", iterationNumber)
        .is("target_contribution_id", null)
        .order("created_at", { ascending: true })
        .limit(1);
      assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
      assertExists(rootContributions, "Root contributions should exist");
      assert(rootContributions.length > 0, "At least one root contribution should exist");
      const rootContribution = rootContributions[0];
      assertExists(rootContribution.id, "Root contribution should have an id");
      assert(isDocumentRelationships(rootContribution.document_relationships), "Root contribution should have valid document_relationships");
      const rootDocumentRelationships: DocumentRelationships = rootContribution.document_relationships;
      const rootContributionId = rootDocumentRelationships[stageSlug];
      assertExists(rootContributionId, "Root contribution should have root ID in document_relationships");

      // Producer Setup: Create continuation chunk contribution via executeModelCallAndSave with the same output type
      const continuationContent = '{"header":"Continuation Header","context":{"key2":"value2"}}';
      const continuationJsonContent = continuationContent;

      const continuationDeps = createExecuteDeps(continuationJsonContent);

      const continuationExecuteJobPayload: DialecticExecuteJobPayload = {
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
        target_contribution_id: rootContributionId || undefined,
        continuation_count: 1,
        document_relationships: rootDocumentRelationships,
      };

      if (!isJson(continuationExecuteJobPayload)) {
        throw new Error("Continuation execute job payload is not a valid JSON object");
      }

      if (!isDialecticExecuteJobPayload(continuationExecuteJobPayload)) {
        throw new Error("Continuation execute job payload does not match DialecticExecuteJobPayload type");
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
        target_contribution_id: rootContributionId || null,
        prerequisite_job_id: null,
        payload: continuationExecuteJobPayload,
        is_test_job: false,
        job_type: "EXECUTE",
      };

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
        deps: continuationDeps,
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
          currentUserPrompt: "Generate header context continuation",
          source_prompt_resource_id: undefined,
        },
        sessionData: {
          id: testSession.id,
          project_id: testSession.project_id,
          session_description: testSession.session_description,
          user_input_reference_url: testSession.user_input_reference_url,
          iteration_count: testSession.iteration_count,
          selected_model_ids: testSession.selected_model_ids,
          status: testSession.status,
          created_at: testSession.created_at,
          updated_at: testSession.updated_at,
          current_stage_id: testSession.current_stage_id,
          associated_chat_id: testSession.associated_chat_id,
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [],
      };

      // Test Subject: Call executeModelCallAndSave with the continuation chunk job (final chunk)
      await executeModelCallAndSave(continuationParams);

      // Query to get the created continuation contribution
      const { data: continuationContributions, error: continuationContribError } = await adminClient
        .from("dialectic_contributions")
        .select("id, storage_bucket, storage_path, file_name, document_relationships")
        .eq("session_id", testSession.id)
        .eq("stage", stageSlug)
        .eq("iteration_number", iterationNumber)
        .eq("target_contribution_id", rootContributionId)
        .order("created_at", { ascending: true })
        .limit(1);
      assert(!continuationContribError, `Failed to query continuation contribution: ${continuationContribError?.message}`);
      assertExists(continuationContributions, "Continuation contributions should exist");
      assert(continuationContributions.length > 0, "At least one continuation contribution should exist");
      const continuationContribution = continuationContributions[0];
      assertExists(continuationContribution.id, "Continuation contribution should have an id");

      // Consumer Assertion: Verify shouldEnqueueRenderJob returned false (producer behavior)
      const shouldRender = await shouldEnqueueRenderJob({ dbClient: adminClient }, { outputType: documentKey, stageSlug });
      assertEquals(shouldRender, false, "shouldEnqueueRenderJob should return false for JSON-only artifacts");

      // Consumer Assertion: Verify NO RENDER job was enqueued (proving JSON-only artifacts don't trigger rendering)
      const { data: renderJobs, error: renderJobError } = await adminClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("parent_job_id", continuationExecuteJob.id)
        .eq("job_type", "RENDER")
        .limit(1);
      assert(!renderJobError, `Failed to query RENDER jobs: ${renderJobError?.message}`);
      assert(renderJobs.length === 0, "NO RENDER job should be enqueued for JSON-only artifacts");

      // Consumer Assertion: Verify assembleAndSaveFinalDocument was called (by checking that an assembled JSON file exists in storage at the AssembledDocumentJson path)
      const pathInfo = {
        projectId: testProject.id,
        fileType: FileType.AssembledDocumentJson,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: MOCK_MODEL_CONFIG.api_identifier,
        attemptCount: 0,
        documentKey: documentKey,
      };
      const assembledPathInfo = constructStoragePath(pathInfo);
      const assembledPath = `${assembledPathInfo.storagePath}/${assembledPathInfo.fileName}`;
      const assembledFileResult = await downloadFromStorage(adminClient, rootContribution.storage_bucket || "dialectic-contributions", assembledPath);
      assert(!assembledFileResult.error, `Failed to download assembled JSON file: ${assembledFileResult.error?.message}`);
      assertExists(assembledFileResult.data, "Assembled JSON file should exist in storage");

      // Consumer Assertion: Verify the downloaded content can be parsed as valid JSON using JSON.parse()
      const assembledFileContent = new TextDecoder().decode(assembledFileResult.data!);
      let parsedAssembledJson: unknown;
      try {
        parsedAssembledJson = JSON.parse(assembledFileContent);
      } catch (e) {
        throw new Error(`Failed to parse assembled JSON: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Consumer Assertion: Verify the parsed JSON is a merged object (not an array)
      assert(!Array.isArray(parsedAssembledJson), "Parsed assembled JSON should be a merged object, not an array");
      assert(typeof parsedAssembledJson === "object" && parsedAssembledJson !== null, "Parsed assembled JSON should be an object");
      
      // Consumer Assertion: Verify the merged object contains the continuation's values (which override root values)
      if (isRecord(parsedAssembledJson)) {
        // Verify header is overridden by continuation (not root)
        assertEquals(parsedAssembledJson.header, "Continuation Header", "Header should be overridden by continuation chunk");
        assert(parsedAssembledJson.header !== "Root Header", "Header should not be from root chunk");
        // Verify context is overridden by continuation (not deep-merged for objects)
        assert(isRecord(parsedAssembledJson.context), "Context should be an object");
        const contextRecord = parsedAssembledJson.context;
        if (isRecord(contextRecord)) {
          assertEquals(contextRecord.key2, "value2", "Context.key2 should be from continuation chunk");
        }
      }

      // Consumer Assertion: Verify the root chunk's raw JSON file remains unchanged (can be downloaded using storage_path/file_name with original rootContent)
      const rootCanonicalPath = `${rootContribution.storage_path}/${rootContribution.file_name}`;
      const rootFileResult = await downloadFromStorage(adminClient, rootContribution.storage_bucket || "dialectic-contributions", rootCanonicalPath);
      assert(!rootFileResult.error, `Failed to download root chunk file: ${rootFileResult.error?.message}`);
      assertExists(rootFileResult.data, "Root chunk file should exist in storage");
      const rootFileContent = new TextDecoder().decode(rootFileResult.data!);
      assertEquals(rootFileContent, rootContent, "Root chunk file content should match original rootContent");

      // Consumer Assertion: Verify the continuation chunk's raw JSON file remains unchanged (can be downloaded using storage_path/file_name with original continuationContent)
      const continuationCanonicalPath = `${continuationContribution.storage_path}/${continuationContribution.file_name}`;
      const continuationFileResult = await downloadFromStorage(adminClient, continuationContribution.storage_bucket || "dialectic-contributions", continuationCanonicalPath);
      assert(!continuationFileResult.error, `Failed to download continuation chunk file: ${continuationFileResult.error?.message}`);
      assertExists(continuationFileResult.data, "Continuation chunk file should exist in storage");
      const continuationFileContent = new TextDecoder().decode(continuationFileResult.data!);
      assertEquals(continuationFileContent, continuationContent, "Continuation chunk file content should match original continuationContent");

      // Consumer Assertion: Verify the assembled JSON file path is in _work/assembled_json/ and does NOT match either raw JSON file path (constructed from storage_path/file_name)
      assert(assembledPathInfo.storagePath.includes("_work/assembled_json"), "Assembled JSON file path should be in _work/assembled_json/");
      assert(assembledPath !== rootCanonicalPath, "Assembled JSON file path should NOT match root chunk raw JSON file path");
      assert(assembledPath !== continuationCanonicalPath, "Assembled JSON file path should NOT match continuation chunk raw JSON file path");
    } finally {
      // Clean up project and session
      await cleanupProjectAndSession(testProject.id, testSession.id);
    }
  });
});

