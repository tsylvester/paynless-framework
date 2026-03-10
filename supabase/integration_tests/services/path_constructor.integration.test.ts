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
  registerUndoAction,
} from "../../functions/_shared/_integration.test.utils.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticProject,
  StartSessionPayload,
  StartSessionSuccessResponse,
  DialecticJobRow,
  DialecticExecuteJobPayload,
  ExecuteModelCallAndSaveParams,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { IExecuteJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import {
  constructStoragePath,
  generateShortId,
  mapStageSlugToDirName,
  sanitizeForPath,
} from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileType, PathContext } from "../../functions/_shared/types/file_manager.types.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { callUnifiedAIModel } from "../../functions/dialectic-service/callModel.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { getSortedCompressionCandidates } from "../../functions/_shared/utils/vector_utils.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { isJson, isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";
import { MockPromptAssembler } from "../../functions/_shared/prompt-assembler/prompt-assembler.mock.ts";
import { MockIndexingService } from "../../functions/_shared/services/indexing_service.mock.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { extractSourceGroupFragment } from "../../functions/_shared/utils/path_utils.ts";
import { ShouldEnqueueRenderJobResult } from "../../functions/_shared/types/shouldEnqueueRenderJob.interface.ts";

describe("path_constructor Integration Tests", () => {
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

    // Create test project using FormData
    const formData = new FormData();
    formData.append("projectName", "Path Constructor Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for path_constructor integration test");
    
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

  it("11.e.i: should construct paths correctly for root and continuation chunks, preventing collisions", async () => {
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

    // Mock AI model to return successful response for root chunk
    const rootDeps: IExecuteJobContext = {
      callUnifiedAIModel: async () => {
        const structuredData = {
          business_objective: "Test business objective",
          target_audience: "Test target audience",
          success_metrics: "Test success metrics",
        };
        const contentString = JSON.stringify(structuredData);
        const responseContent = JSON.stringify({ content: contentString });
        return {
          content: responseContent,
          finish_reason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          error: undefined,
          rawProviderResponse: {
            choices: [{
              message: {
                content: responseContent,
              },
            }],
            finish_reason: 'stop',
          },
        };
      },
      getAiProviderAdapter: () => ({
        sendMessage: async () => ({
          role: "assistant" as const,
          content: "mock",
          ai_provider_id: null,
          system_prompt_id: null,
          token_usage: null,
        }),
        listModels: async () => [],
      }),
      getAiProviderConfig: async () => ({
        api_identifier: "mock-model",
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        tokenization_strategy: { type: "none" as const },
      }),
      getExtensionFromMimeType,
      logger: testLogger,
      fileManager: fileManager,
      continueJob: (deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId) => continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId),
      notificationService: new NotificationService(adminClient),
      getSeedPromptForStage: (dbClient, projectId, sessionId, stageSlug, iterationNumber, downloadFromStorageFn) => getSeedPromptForStage(dbClient, projectId, sessionId, stageSlug, iterationNumber, downloadFromStorageFn),
      retryJob: (deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId) => retryJob(deps, dbClient, job, currentAttempt, failedContributionAttempts, projectOwnerUserId),
      downloadFromStorage: (supabase: SupabaseClient<Database>, bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      randomUUID: crypto.randomUUID,
      deleteFromStorage: () => Promise.resolve({ error: null }),
      tokenWalletService: tokenWalletService,
      countTokens,
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
      indexingService: new MockIndexingService(),
      promptAssembler: new MockPromptAssembler(adminClient, fileManager),
      extractSourceGroupFragment,
      shouldEnqueueRenderJob: async (): Promise<ShouldEnqueueRenderJobResult> => ({
        shouldRender: false,
        reason: "is_json",
      }),
    };

    // (1) Call executeModelCallAndSave to create a root chunk
    const rootLineageSourceGroup = crypto.randomUUID();
    const rootExecuteJobPayload: DialecticExecuteJobPayload = {
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: stageSlug,
      model_id: testModelId,
      iterationNumber: iterationNumber,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: {
        contributionType: "thesis",
        stageSlug: stageSlug,
      },
      document_key: documentKey,
      document_relationships: { source_group: rootLineageSourceGroup },
    };

    if (!isJson(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload is not a valid JSON object");
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
        currentUserPrompt: "Create a business case document",
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_models: testSession.selected_models,
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

    await executeModelCallAndSave(rootParams);

    // Get the root contribution ID and verify storage path
    const { data: rootUpdatedJob, error: rootJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", rootExecuteJob.id)
      .single();

    assert(!rootJobQueryError, `Failed to query updated root EXECUTE job: ${rootJobQueryError?.message}`);
    assertExists(rootUpdatedJob, "Updated root EXECUTE job should exist");
    assertExists(rootUpdatedJob.results, "Root EXECUTE job should have results");

    let rootContributionId: string | undefined;
    if (typeof rootUpdatedJob.results === 'string') {
      const results = JSON.parse(rootUpdatedJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(rootUpdatedJob.results)) {
      const modelProcessingResult = rootUpdatedJob.results.modelProcessingResult;
      if (isRecord(modelProcessingResult) && typeof modelProcessingResult.contributionId === 'string') {
        rootContributionId = modelProcessingResult.contributionId;
      }
    }

    assertExists(rootContributionId, "Root contribution ID should be available");
    if (!rootContributionId) {
      throw new Error("Root contribution ID is required");
    }

    // (2) Verify the root chunk's storage path is in raw_responses/ without continuation suffix
    const { data: rootContribution, error: rootContributionError } = await adminClient
      .from("dialectic_contributions")
      .select("raw_response_storage_path, storage_bucket")
      .eq("id", rootContributionId)
      .single();

    assert(!rootContributionError, `Failed to query root contribution: ${rootContributionError?.message}`);
    assertExists(rootContribution, "Root contribution should exist");
    assertExists(rootContribution.raw_response_storage_path, "Root contribution should have raw_response_storage_path");

    const rootStoragePath = rootContribution.raw_response_storage_path;
    assert(rootStoragePath.includes("/raw_responses"), `Root chunk storage path should be in raw_responses/ directory. Got: ${rootStoragePath}`);
    assert(!rootStoragePath.includes("/_work/raw_responses"), `Root chunk storage path should NOT be in _work/raw_responses/ directory. Got: ${rootStoragePath}`);
    assert(!rootStoragePath.includes("_continuation_"), `Root chunk storage path should NOT include continuation suffix. Got: ${rootStoragePath}`);

    // Register cleanup for root chunk's storage file
    if (rootContribution.raw_response_storage_path && rootContribution.storage_bucket) {
      registerUndoAction({
        type: 'DELETE_STORAGE_OBJECT',
        bucketName: rootContribution.storage_bucket,
        path: rootContribution.raw_response_storage_path,
        scope: 'local',
      });
    }

    // Update root chunk's document_relationships to use the actual contribution ID and preserve source_group
    const { error: updateRootRelationshipsError } = await adminClient
      .from("dialectic_contributions")
      .update({
        document_relationships: { [stageSlug]: rootContributionId, source_group: rootLineageSourceGroup },
      })
      .eq("id", rootContributionId);

    assert(!updateRootRelationshipsError, `Failed to update root chunk document_relationships: ${updateRootRelationshipsError?.message}`);

    // (3) Call executeModelCallAndSave to create a continuation chunk with continuation_count: 1
    // Mock AI model to return successful response for continuation chunk
    const continuationDeps: IExecuteJobContext = {
      ...rootDeps,
      callUnifiedAIModel: async () => {
        const structuredData = {
          business_objective: "Continuation business objective",
          target_audience: "Continuation target audience",
          success_metrics: "Continuation success metrics",
        };
        const contentString = JSON.stringify(structuredData);
        const responseContent = JSON.stringify({ content: contentString });
        return {
          content: responseContent,
          finish_reason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          error: undefined,
          rawProviderResponse: {
            choices: [{
              message: {
                content: responseContent,
              },
            }],
            finish_reason: 'stop',
          },
        };
      },
    };
    const continuationExecuteJobPayload: DialecticExecuteJobPayload = {
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: stageSlug,
      model_id: testModelId,
      iterationNumber: iterationNumber,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: {
        contributionType: "thesis",
        stageSlug: stageSlug,
      },
      document_key: documentKey,
      target_contribution_id: rootContributionId,
      continuation_count: 1,
      document_relationships: { [stageSlug]: rootContributionId, source_group: rootLineageSourceGroup },
    };

    if (!isJson(continuationExecuteJobPayload)) {
      throw new Error("Continuation execute job payload is not a valid JSON object");
    }

    if (!rootContributionId) {
      throw new Error("Root contribution ID is not available");
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
      target_contribution_id: rootContributionId ?? null,
      prerequisite_job_id: null,
      payload: continuationExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the continuation EXECUTE job
    const { data: insertedContJob, error: insertContError } = await adminClient
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

    assert(!insertContError, `Failed to insert continuation EXECUTE job: ${insertContError?.message}`);
    assertExists(insertedContJob, "Continuation EXECUTE job should be inserted");

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
        currentUserPrompt: "Continue the business case document",
      },
      sessionData: {
        id: testSession.id,
        project_id: testSession.project_id,
        session_description: testSession.session_description,
        user_input_reference_url: testSession.user_input_reference_url,
        iteration_count: testSession.iteration_count,
        selected_models: testSession.selected_models,
        status: testSession.status ?? "pending_thesis",
        created_at: testSession.created_at,
        updated_at: testSession.updated_at,
        current_stage_id: testSession.current_stage_id,
        associated_chat_id: testSession.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    await executeModelCallAndSave(continuationParams);

    // Get the continuation contribution ID and verify storage path
    const { data: contUpdatedJob, error: contJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", continuationExecuteJob.id)
      .single();

    assert(!contJobQueryError, `Failed to query updated continuation EXECUTE job: ${contJobQueryError?.message}`);
    assertExists(contUpdatedJob, "Updated continuation EXECUTE job should exist");
    assertExists(contUpdatedJob.results, "Continuation EXECUTE job should have results");

    let continuationContributionId: string | undefined;
    if (typeof contUpdatedJob.results === 'string') {
      const results = JSON.parse(contUpdatedJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(contUpdatedJob.results)) {
      const modelProcessingResult = contUpdatedJob.results.modelProcessingResult;
      if (isRecord(modelProcessingResult) && typeof modelProcessingResult.contributionId === 'string') {
        continuationContributionId = modelProcessingResult.contributionId;
      }
    }

    assertExists(continuationContributionId, "Continuation contribution ID should be available");
    if (!continuationContributionId) {
      throw new Error("Continuation contribution ID is required");
    }

    // (4) Verify the continuation chunk's storage path is in _work/raw_responses/ with _continuation_1 suffix
    const { data: continuationContribution, error: continuationContributionError } = await adminClient
      .from("dialectic_contributions")
      .select("raw_response_storage_path, storage_bucket")
      .eq("id", continuationContributionId)
      .single();

    assert(!continuationContributionError, `Failed to query continuation contribution: ${continuationContributionError?.message}`);
    assertExists(continuationContribution, "Continuation contribution should exist");
    assertExists(continuationContribution.raw_response_storage_path, "Continuation contribution should have raw_response_storage_path");

    const continuationStoragePath = continuationContribution.raw_response_storage_path;
    assert(continuationStoragePath.includes("/_work/raw_responses"), `Continuation chunk storage path should be in _work/raw_responses/ directory. Got: ${continuationStoragePath}`);
    assert(continuationStoragePath.includes("_continuation_1"), `Continuation chunk storage path should include _continuation_1 suffix. Got: ${continuationStoragePath}`);
    // Verify it's NOT in the root raw_responses/ directory (without _work/)
    // Check that if /raw_responses/ appears, it must be preceded by _work/
    const rawResponsesIndex = continuationStoragePath.indexOf("/raw_responses/");
    if (rawResponsesIndex !== -1) {
      const beforeRawResponses = continuationStoragePath.substring(0, rawResponsesIndex);
      assert(beforeRawResponses.endsWith("_work"), `Continuation chunk storage path should be in _work/raw_responses/ directory, not root raw_responses/. Got: ${continuationStoragePath}`);
    }

    // Register cleanup for continuation chunk's storage file
    if (continuationContribution.raw_response_storage_path && continuationContribution.storage_bucket) {
      registerUndoAction({
        type: 'DELETE_STORAGE_OBJECT',
        bucketName: continuationContribution.storage_bucket,
        path: continuationContribution.raw_response_storage_path,
        scope: 'local',
      });
    }

    // (5) Verify the two paths are different, proving no collision
    assert(
      rootStoragePath !== continuationStoragePath,
      `Root chunk path (${rootStoragePath}) and continuation chunk path (${continuationStoragePath}) must be different to prevent collisions`
    );

    // Verify they use different directories
    assert(
      rootStoragePath.includes("/raw_responses") && !rootStoragePath.includes("/_work/raw_responses"),
      `Root chunk should use raw_responses/ directory. Got: ${rootStoragePath}`
    );
    assert(
      continuationStoragePath.includes("/_work/raw_responses"),
      `Continuation chunk should use _work/raw_responses/ directory. Got: ${continuationStoragePath}`
    );

    // Verify continuation chunk has the correct suffix
    assert(
      continuationStoragePath.includes("_continuation_1"),
      `Continuation chunk path should include _continuation_1 suffix. Got: ${continuationStoragePath}`
    );
  });

  it("full path context produces correct feedback path alongside rendered document", async () => {
    const iteration = 1;
    const stageSlug = "thesis";
    const documentKey = "business_case";
    const attemptCount = 0;

    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("api_identifier")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");
    assertExists(providerData.api_identifier, "Provider api_identifier should exist");

    const modelSlugSanitized = sanitizeForPath(providerData.api_identifier);
    const shortSessionId = generateShortId(testSession.id);
    const mappedStageDir = mapStageSlugToDirName(stageSlug);
    const stageRootPath = `${testProject.id}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
    const originalStoragePath = `${stageRootPath}/documents`;
    const sanitizedDocumentKey = sanitizeForPath(documentKey);
    const originalBaseName = `${modelSlugSanitized}_${attemptCount}_${sanitizedDocumentKey}`;

    const context: PathContext = {
      projectId: testProject.id,
      fileType: FileType.UserFeedback,
      originalStoragePath,
      originalBaseName,
    };

    const result = constructStoragePath(context);

    assertEquals(
      result.storagePath,
      originalStoragePath,
      "UserFeedback storagePath must be the same directory as the original document"
    );
    assertEquals(
      result.fileName,
      `${sanitizeForPath(originalBaseName)}_feedback.md`,
      "UserFeedback fileName must be {originalBaseName}_feedback.md"
    );
  });
});

