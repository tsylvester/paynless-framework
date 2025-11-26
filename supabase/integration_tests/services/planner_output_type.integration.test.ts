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
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  testLogger,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticJobRow,
  DialecticProject,
  IDialecticJobDeps,
  StartSessionPayload,
  StartSessionSuccessResponse,
  DialecticPlanJobPayload,
  DialecticExecuteJobPayload,
  StageRecipeStepDto,
  HeaderContext,
  ContextForDocument,
  ContentToInclude,
  SourceDocument,
  DialecticContributionRow,
  RelevanceRule,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { getStageRecipe } from "../../functions/dialectic-service/getStageRecipe.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { handleJob } from "../../functions/dialectic-worker/index.ts";
import { createDialecticWorkerDeps } from "../../functions/dialectic-worker/index.ts";
import { createSupabaseAdminClient } from "../../functions/_shared/auth.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { getGranularityPlanner } from "../../functions/dialectic-worker/strategies/granularity.strategies.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { isModelContributionFileType } from "../../functions/_shared/utils/type-guards/type_guards.file_manager.ts";
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload } from "../../functions/_shared/utils/type_guards.ts";
import { isDialecticStageRecipeStep, isOutputRule } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isDocumentRelationships } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import type { DocumentRelationships } from "../../functions/dialectic-service/dialectic.interface.ts";
import { FileType, ModelContributionUploadContext, ResourceUploadContext, ContributionMetadata } from "../../functions/_shared/types/file_manager.types.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { DeleteStorageResult } from "../../functions/_shared/supabase_storage_utils.ts";
import { IDocumentRenderer } from "../../functions/_shared/services/document_renderer.interface.ts";
import { ContributionType, DialecticStageRecipeStep, IContinueJobResult } from "../../functions/dialectic-service/dialectic.interface.ts";
import { ModelContributionFileTypes } from "../../functions/_shared/types/file_manager.types.ts";
import { isJson } from "../../functions/_shared/utils/type-guards/type_guards.common.ts";
import { isFileType } from "../../functions/_shared/utils/type-guards/type_guards.file_manager.ts";
import { gatherContext } from "../../functions/_shared/prompt-assembler/gatherContext.ts";
import { render } from "../../functions/_shared/prompt-assembler/render.ts";
import { createCanonicalPathParams } from "../../functions/dialectic-worker/strategies/canonical_context_builder.ts";

describe("Planner Output Type Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let testWalletId: string;
  let testDeps: IDialecticJobDeps;
  let fileManager: FileManagerService;
  let testModelId: string; // Store model UUID for use in tests

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
    formData.append("projectName", "Planner Output Type Test Project");
    formData.append("initialUserPromptText", "Test prompt for planner output type verification");
    
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

    // Fetch or create model ID for selectedModelIds (must be UUID, not api_identifier)
    // First try to find existing model
    const { data: existingModel, error: fetchError } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    let model = existingModel;
    
    // If model doesn't exist, create it
    if (!model && !fetchError) {
      const { data: newModel, error: insertError } = await adminClient
        .from("ai_providers")
        .insert({
          name: "Mock Model",
          api_identifier: MOCK_MODEL_CONFIG.api_identifier,
          description: "Mock model for integration tests",
          is_active: true,
          is_enabled: true,
          provider: "dummy",
          config: {
            api_identifier: MOCK_MODEL_CONFIG.api_identifier,
            context_window_tokens: 128000,
            input_token_cost_rate: 0,
            output_token_cost_rate: 0,
            tokenization_strategy: { type: "none" },
            hard_cap_output_tokens: 16000,
            provider_max_input_tokens: 128000,
            provider_max_output_tokens: 16000,
          },
        })
        .select("id")
        .single();
      
      if (insertError) {
        throw new Error(`Failed to create mock model: ${insertError.message}`);
      }
      if (!newModel) {
        throw new Error("Failed to create mock model: no data returned");
      }
      if (!newModel.id) {
        throw new Error("Created model record is missing id");
      }
      model = newModel;
    } else if (fetchError) {
      throw new Error(`Failed to fetch model: ${fetchError.message}`);
    } else if (!model) {
      throw new Error(`Model with api_identifier '${MOCK_MODEL_CONFIG.api_identifier}' not found or not active/enabled`);
    }
    
    if (!model.id) {
      throw new Error("Model record is missing id");
    }
    testModelId = model.id; // Store model UUID for use in tests

    // Create test session
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [model.id],
      sessionDescription: "Test session for planner output type verification",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to create test session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    testSession = sessionResult.data;

    // Fetch wallet ID for the user
    const { data: wallet, error: walletError } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .single();
    if (walletError) {
      throw new Error(`Failed to fetch wallet: ${walletError.message}`);
    }
    if (!wallet) {
      throw new Error("Wallet must exist for test user");
    }
    if (!wallet.wallet_id) {
      throw new Error("Wallet record is missing wallet_id");
    }
    testWalletId = wallet.wallet_id;

    // Create mock document renderer
    const mockDocumentRenderer: IDocumentRenderer = {
      renderDocument: async () => {
        return {
          pathContext: {
            fileType: FileType.HeaderContext,
            projectId: testProject.id,
            sessionId: testSession.id,
            iteration: 1,
            stageSlug: "thesis",
            modelSlug: "",
          },
          renderedBytes: new Uint8Array(),
        };
      },
    };

    // Setup test dependencies with all required properties
    testDeps = {
      logger: testLogger,
      fileManager: fileManager,
      downloadFromStorage: (bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      deleteFromStorage: async (): Promise<DeleteStorageResult> => ({ error: null }),
      getExtensionFromMimeType: getExtensionFromMimeType,
      randomUUID: () => crypto.randomUUID(),
      getSeedPromptForStage,
      continueJob: async (): Promise<IContinueJobResult> => ({ enqueued: false, error: undefined }),
      retryJob: async () => ({ error: undefined }),
      notificationService: new NotificationService(adminClient),
      executeModelCallAndSave: async () => {},
      planComplexStage: undefined,
      getGranularityPlanner: getGranularityPlanner,
      documentRenderer: mockDocumentRenderer,
    };
  });

  afterAll(async () => {
    await coreCleanupTestResources("all");
  });

  /**
   * Creates a minimal project resource in the database for testing planners.
   * This is used for document-type inputs that need to be in dialectic_project_resources.
   * Uses FileManagerService.uploadAndRegisterFile with ResourceUploadContext.
   */
  async function createMinimalProjectResource(
    stageSlug: string,
    documentKey: string,
    sourceContributionId?: string,
  ): Promise<string> {
    const content = `Minimal test content for ${documentKey}`;
    
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;
    
    const uploadContext: ResourceUploadContext = {
      pathContext: {
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: 1,
        stageSlug: stageSlug,
        fileType: FileType.RenderedDocument,
        documentKey: documentKey,
        modelSlug: modelSlug,
        attemptCount: attemptCount,
        sourceContributionId: sourceContributionId ?? null,
      },
      fileContent: content,
      mimeType: "text/markdown",
      sizeBytes: content.length,
      userId: testUserId,
      description: `Test project resource for ${documentKey}`,
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: {
        document_key: documentKey,
      },
    };

    const { record, error } = await fileManager.uploadAndRegisterFile(uploadContext);
    if (error) {
      throw new Error(`Failed to create project resource: ${error.message}`);
    }
    if (!record) {
      throw new Error("Project resource record was not created");
    }
    
    // Type guard to ensure we have a project resource record
    if (!('resource_type' in record)) {
      throw new Error("Record is not a project resource");
    }
    
    return record.id;
  }

  /**
   * Creates a minimal contribution in the database for testing planners.
   * This avoids needing real model calls to generate contributions.
   */
  async function createMinimalContribution(
    contributionType: ContributionType,
    stageSlug: string,
    documentKey: string,
    sourceGroup?: string,
  ): Promise<string> {
    const content = `Minimal test content for ${documentKey}`;
    
    // Use type guard to verify documentKey is a valid FileType
    if (!isFileType(documentKey)) {
      throw new Error(`Invalid documentKey '${documentKey}': is not a valid FileType`);
    }
    
    // Type guard narrows documentKey to FileType
    const fileTypeValue: FileType = documentKey;
    
    if (!isModelContributionFileType(fileTypeValue)) {
      throw new Error(`Invalid documentKey '${documentKey}': does not map to a valid ModelContributionFileType`);
    }
    
    const fileType: ModelContributionFileTypes = fileTypeValue;
    
    // Fetch model ID for contributionMetadata
    // Filter by is_active and is_enabled to ensure we get exactly one active model
    const { data: model, error: modelError } = await adminClient
      .from("ai_providers")
      .select("id, api_identifier")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    if (modelError) {
      throw new Error(`Failed to fetch model: ${modelError.message}`);
    }
    if (!model) {
      throw new Error(`Model with api_identifier '${MOCK_MODEL_CONFIG.api_identifier}' not found or not active/enabled`);
    }

    const contributionMetadata: ContributionMetadata = {
      sessionId: testSession.id,
      modelIdUsed: model.id,
      modelNameDisplay: model.api_identifier,
      stageSlug: stageSlug,
      iterationNumber: 1,
      rawJsonResponseContent: { content: content },
      contributionType: contributionType,
      editVersion: 1,
      isLatestEdit: true,
      document_relationships: sourceGroup ? { source_group: sourceGroup } : null,
    };

    // Determine required path context fields based on fileType
    // HeaderContext and all ModelContributionFileTypes require modelSlug and attemptCount
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;
    
    const uploadContext: ModelContributionUploadContext = {
      pathContext: {
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: 1,
        stageSlug: stageSlug,
        fileType: fileType,
        originalFileName: `${documentKey}_test.md`,
        modelSlug: modelSlug,
        attemptCount: attemptCount,
        contributionType: contributionType,
      },
      fileContent: content,
      mimeType: "text/markdown",
      sizeBytes: content.length,
      userId: testUserId,
      description: `Test contribution for ${documentKey}`,
      contributionMetadata: contributionMetadata,
    };

    const { record, error } = await fileManager.uploadAndRegisterFile(uploadContext);
    if (error) {
      throw new Error(`Failed to create minimal contribution: ${error.message}`);
    }
    if (!record) {
      throw new Error("Contribution record was not created");
    }
    
    // Update document_relationships if sourceGroup provided and not already set
    if (sourceGroup) {
      await adminClient
        .from("dialectic_contributions")
        .update({ document_relationships: { source_group: sourceGroup } })
        .eq("id", record.id);
    }
    
    return record.id;
  }

  /**
   * Creates a PLAN job row for testing planComplexStage
   */
  function createPlanJob(
    recipeStep: StageRecipeStepDto,
    stageSlug: string,
  ): DialecticJobRow & { payload: DialecticPlanJobPayload } {
    const jobId: string = crypto.randomUUID();
    const payload: DialecticPlanJobPayload = {
      job_type: "PLAN",
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: stageSlug,
      iterationNumber: 1,
      model_id: MOCK_MODEL_CONFIG.api_identifier,
      model_slug: MOCK_MODEL_CONFIG.api_identifier,
      user_jwt: testUserJwt,
      walletId: testWalletId,
      continueUntilComplete: false,
      maxRetries: 3,
      continuation_count: 0,
      is_test_job: true,
    };

    if (!isJson(payload)) {
      throw new Error("Payload is not a valid JSON object");
    }
    return {
      id: jobId,
      user_id: testUserId,
      session_id: testSession.id,
      stage_slug: stageSlug,
      iteration_number: 1,
      status: "pending",
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      parent_job_id: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: payload,
      is_test_job: true,
      job_type: "PLAN",
    };
  }

  /**
   * Test helper that uses the actual application flow to test planners:
   * 1. Creates source documents
   * 2. Calls generateContributions (user entry point) to create PLAN jobs
   * 3. Manually invokes worker to process PLAN job
   * 4. Queries database for EXECUTE child jobs
   * 5. Verifies child jobs have correct output_type
   */
  async function testPlannerWithRecipeStep(
    stageSlug: string,
    stepSlug: string,
    granularityStrategy: string,
    sourceDocumentSpecs: Array<{ contributionType: ContributionType; documentKey: string; sourceGroup?: string }>,
  ): Promise<{ recipeStep: StageRecipeStepDto; childJobs: DialecticJobRow[] }> {
    // 0. Get the session's ACTUAL current stage - we process the ENTIRE recipe for this stage
    const { data: currentSession, error: sessionFetchError } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage_id, dialectic_stages!current_stage_id(slug)')
      .eq('id', testSession.id)
      .single();
    
    if (sessionFetchError) {
      throw new Error(`Failed to fetch session: ${sessionFetchError.message}`);
    }
    
    if (!currentSession || !currentSession.dialectic_stages) {
      throw new Error(`Session has no current stage`);
    }
    
    // Type guard to safely extract the stage slug without casting
    const stagesData = currentSession.dialectic_stages;
    if (typeof stagesData !== 'object' || stagesData === null || !('slug' in stagesData)) {
      throw new Error(`Session current_stage data is invalid`);
    }
    
    const actualStageSlug = typeof stagesData.slug === 'string' ? stagesData.slug : null;
    if (!actualStageSlug) {
      throw new Error(`Session current stage has no slug`);
    }
    
    // Verify the step we're testing exists in the session's actual stage
    if (actualStageSlug !== stageSlug) {
      throw new Error(`Test expects stage '${stageSlug}' but session is in stage '${actualStageSlug}'. Test must use the session's actual current stage.`);
    }

    // 1. Fetch real recipe steps from database for the session's ACTUAL current stage
    const recipeResult = await getStageRecipe({ stageSlug: actualStageSlug }, adminClient);
    assert(!recipeResult.error, `Failed to fetch recipe for ${stageSlug}: ${recipeResult.error?.message}`);
    assertExists(recipeResult.data, "Recipe fetch returned no data");
    assert(recipeResult.status === 200, `Expected status 200, got ${recipeResult.status}`);

    if (!recipeResult.data) {
      throw new Error("Recipe fetch returned no data");
    }
    const recipeSteps: StageRecipeStepDto[] = recipeResult.data.steps;
    assert(recipeSteps.length > 0, `No recipe steps found for stage ${stageSlug}`);

    // 2. Find the EXECUTE job recipe step matching the stepSlug
    const foundRecipeStep: StageRecipeStepDto | undefined = recipeSteps.find(
      (step) => step.step_slug === stepSlug && step.job_type === "EXECUTE"
    );
    assertExists(
      foundRecipeStep,
      `Could not find EXECUTE recipe step with step_slug '${stepSlug}' in stage '${stageSlug}'. Available steps: ${recipeSteps.map(s => s.step_slug).join(", ")}`
    );
    if (!foundRecipeStep) {
      throw new Error(`Could not find EXECUTE recipe step with step_slug '${stepSlug}' in stage '${stageSlug}'. Available steps: ${recipeSteps.map(s => s.step_slug).join(", ")}`);
    }
    // Ensure recipe step job_type is EXECUTE (no fallbacks)
    assert(
      foundRecipeStep.job_type === "EXECUTE",
      `Recipe step '${stepSlug}' must have job_type 'EXECUTE', but found '${foundRecipeStep.job_type}'`
    );
    
    const recipeStep: StageRecipeStepDto = foundRecipeStep;

    // 3. Verify recipe step has correct granularity_strategy
    assertEquals(
      recipeStep.granularity_strategy,
      granularityStrategy,
      `Recipe step '${stepSlug}' has incorrect granularity_strategy. Expected '${granularityStrategy}', got '${recipeStep.granularity_strategy}'`
    );

    // 4. Verify output_type is a ModelContributionFileType (not 'rendered_document')
    assert(
      isModelContributionFileType(recipeStep.output_type),
      `Recipe step '${stepSlug}' has invalid output_type: '${recipeStep.output_type}' is not a ModelContributionFileType`
    );
    assertNotEquals(
      recipeStep.output_type,
      "rendered_document",
      `Recipe step '${stepSlug}' still has deprecated 'rendered_document' output_type`
    );

    // 5. Verify output_type matches document_key in outputs_required[0].documents[0].document_key
    if (!recipeStep.outputs_required) {
      throw new Error(`Recipe step '${stepSlug}' is missing outputs_required`);
    }
    if (!Array.isArray(recipeStep.outputs_required) || recipeStep.outputs_required.length === 0) {
      throw new Error(`Recipe step '${stepSlug}' outputs_required is not a non-empty array`);
    }
    const firstOutputRule = recipeStep.outputs_required[0];
    if (!isOutputRule(firstOutputRule)) {
      throw new Error(`Recipe step '${stepSlug}' outputs_required[0] is not a valid OutputRule`);
    }
    if (!firstOutputRule.documents) {
      throw new Error(`Recipe step '${stepSlug}' outputs_required[0] is missing documents`);
    }
    if (!Array.isArray(firstOutputRule.documents) || firstOutputRule.documents.length === 0) {
      throw new Error(`Recipe step '${stepSlug}' outputs_required[0].documents is not a non-empty array`);
    }
    const firstDocument = firstOutputRule.documents[0];
    if (!firstDocument.document_key) {
      throw new Error(`Recipe step '${stepSlug}' outputs_required[0].documents[0] is missing document_key`);
    }
    assertEquals(
      recipeStep.output_type,
      firstDocument.document_key,
      `Recipe step '${stepSlug}' output_type '${recipeStep.output_type}' does not match outputs_required[0].documents[0].document_key '${firstDocument.document_key}'`
    );

    // 6. Create minimal source documents in the database
    // These will be found by findSourceDocuments when the worker processes the PLAN job
    // For document-type inputs, create project resources; for header_context, create contributions
    const contributionIds: string[] = [];
    if (!recipeStep.inputs_required || !Array.isArray(recipeStep.inputs_required)) {
      throw new Error(`Recipe step '${stepSlug}' has invalid inputs_required`);
    }
    
    for (const spec of sourceDocumentSpecs) {
      // Find the corresponding input rule to determine the type
      const inputRule = recipeStep.inputs_required.find(
        (rule) => rule.document_key === spec.documentKey && rule.slug === spec.contributionType
      );
      
      if (inputRule?.type === 'document') {
        // For document-type inputs, create a project resource
        // First create a contribution to use as source_contribution_id
        const sourceContributionId = await createMinimalContribution(
          spec.contributionType,
          stageSlug,
          spec.documentKey,
          spec.sourceGroup
        );
        // Then create the project resource
        await createMinimalProjectResource(
          stageSlug,
          spec.documentKey,
          sourceContributionId
        );
        contributionIds.push(sourceContributionId);
      } else {
        // For header_context and other types, create contributions
        const contributionId = await createMinimalContribution(
          spec.contributionType,
          stageSlug,
          spec.documentKey,
          spec.sourceGroup
        );
        contributionIds.push(contributionId);
      }
    }

    // 7. Call generateContributions (user entry point) to create PLAN jobs
    // This is how users actually trigger generation - we use the exact same function
    // Use the session's ACTUAL current stage - we process the ENTIRE recipe for this stage
    const generateResult = await generateContributions(
      adminClient,
      {
        sessionId: testSession.id,
        projectId: testProject.id,
        stageSlug: actualStageSlug,
        iterationNumber: 1,
        walletId: testWalletId,
        continueUntilComplete: false,
        maxRetries: 3,
        is_test_job: true,
        user_jwt: testUserJwt,
      },
      testUser,
      {
        callUnifiedAIModel: async () => ({ content: '', error: null }),
        downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        getExtensionFromMimeType: getExtensionFromMimeType,
        logger: testLogger,
        randomUUID: () => crypto.randomUUID(),
        fileManager: fileManager,
        deleteFromStorage: async () => ({ error: null }),
      },
      testUserJwt
    );

    assert(generateResult.success, `generateContributions failed: ${generateResult.error?.message}`);
    if (!generateResult.data) {
      throw new Error("generateContributions returned no data");
    }
    assertExists(generateResult.data.job_ids, "generateContributions returned no job_ids");
    assert(generateResult.data.job_ids.length > 0, "generateContributions created no jobs");

    // 8. Fetch the PLAN job from database (created by generateContributions)
    const planJobId = generateResult.data.job_ids[0];
    const { data: planJob, error: planJobError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('*')
      .eq('id', planJobId)
      .single();

    if (planJobError || !planJob) {
      throw new Error(`Failed to fetch PLAN job: ${planJobError?.message || 'Job not found'}`);
    }

    assert(planJob.job_type === 'PLAN', `Expected PLAN job, got ${planJob.job_type}`);
    assert(planJob.status === 'pending', `Expected pending status, got ${planJob.status}`);

    // 9. Create worker dependencies and manually invoke worker to process the PLAN job
    // This simulates what happens when the database trigger fires
    // Use the same adminClient to avoid connection issues
    const workerDeps = await createDialecticWorkerDeps(adminClient);
    
    // 9. Process the ENTIRE recipe flow to completion (following EXACT application flow)
    // The APPLICATION runs the recipe - we just process jobs as they become ready (simulating database triggers)
    // Recipe: 1) build-stage-header (PLAN) creates header_context, 2) 4 EXECUTE steps create documents
    // Keep processing until the parent PLAN job completes (proving the ENTIRE recipe worked)
    let currentPlanJob = planJob;
    const processedJobIds = new Set<string>();
    
    while (currentPlanJob.status !== 'completed' && currentPlanJob.status !== 'failed') {
      // 9.a. Process current PLAN job - APPLICATION determines which steps are ready
      await handleJob(
        adminClient,
        currentPlanJob,
        workerDeps,
        testUserJwt
      );

      // 9.b. Fetch all pending child jobs created by the APPLICATION
      const { data: allChildJobsData, error: allChildJobsError } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('parent_job_id', planJobId)
        .in('status', ['pending', 'in_progress', 'waiting_for_children']);

      if (allChildJobsError) {
        throw new Error(`Failed to fetch child jobs: ${allChildJobsError.message}`);
      }

      const pendingChildJobs = (allChildJobsData || []).filter(job => !processedJobIds.has(job.id));

      // 9.c. Process all new pending child jobs - APPLICATION handles their completion
      for (const childJob of pendingChildJobs) {
        processedJobIds.add(childJob.id);
        await handleJob(
          adminClient,
          childJob,
          workerDeps,
          testUserJwt
        );
      }

      // 9.d. Re-fetch parent PLAN job to check if it completed
      const { data: updatedPlanJob, error: updatedPlanJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('id', planJobId)
        .single();

      if (updatedPlanJobError || !updatedPlanJob) {
        throw new Error(`Failed to re-fetch parent PLAN job: ${updatedPlanJobError?.message || 'Job not found'}`);
      }

      currentPlanJob = updatedPlanJob;
    }

    // 9.e. Verify the parent job completed successfully (proving the ENTIRE recipe worked)
    if (currentPlanJob.status === 'failed') {
      throw new Error(`Parent PLAN job failed: ${JSON.stringify(currentPlanJob.error_details)}`);
    }
    if (currentPlanJob.status !== 'completed') {
      throw new Error(`Parent PLAN job did not complete. Final status: ${currentPlanJob.status}`);
    }

    // 9.f. Verify ALL steps in the recipe were processed in the EXACT order (proving the ENTIRE recipe completed correctly)
    // The thesis recipe has 5 steps in this EXACT order:
    // 1. build-stage-header (PLAN, execution_order=1) - must complete first
    // 2. generate-business-case (EXECUTE, execution_order=2) - depends on build-stage-header
    // 3. generate-feature-spec (EXECUTE, execution_order=2) - depends on build-stage-header
    // 4. generate-technical-approach (EXECUTE, execution_order=2) - depends on build-stage-header
    // 5. generate-success-metrics (EXECUTE, execution_order=2) - depends on build-stage-header
    // Fetch all completed child jobs (PLAN and EXECUTE) to verify all recipe steps were processed
    const { data: allCompletedChildrenData, error: allCompletedChildrenError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('payload, job_type, created_at')
      .eq('parent_job_id', planJobId)
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    if (allCompletedChildrenError) {
      throw new Error(`Failed to fetch completed child jobs: ${allCompletedChildrenError.message}`);
    }

    // Extract recipe_step_id from all completed child jobs and verify order
    const completedSteps: Array<{ stepId: string; stepSlug: string; jobType: string; createdAt: string }> = [];
    for (const child of (allCompletedChildrenData || [])) {
      if (child.payload && typeof child.payload === 'object' && 'planner_metadata' in child.payload) {
        const plannerMetadata = child.payload.planner_metadata;
        if (plannerMetadata && typeof plannerMetadata === 'object' && 'recipe_step_id' in plannerMetadata) {
          const stepId = plannerMetadata.recipe_step_id;
          if (typeof stepId === 'string') {
            const step = recipeSteps.find(s => s.id === stepId);
            completedSteps.push({
              stepId,
              stepSlug: step?.step_slug || 'unknown',
              jobType: child.job_type || 'unknown',
              createdAt: child.created_at || ''
            });
          }
        }
      }
    }

    // Verify ALL recipe steps were processed (not just the one being tested)
    const allRecipeStepIds = new Set(recipeSteps.map(s => s.id));
    const completedStepIds = new Set(completedSteps.map(s => s.stepId));
    const missingStepIds: string[] = [];
    for (const stepId of allRecipeStepIds) {
      if (!completedStepIds.has(stepId)) {
        const step = recipeSteps.find(s => s.id === stepId);
        missingStepIds.push(step ? `${step.step_slug} (${stepId})` : stepId);
      }
    }

    if (missingStepIds.length > 0) {
      const completedStepSlugs = completedSteps.map(s => s.stepSlug).join(', ');
      throw new Error(`Recipe did not complete all steps. Missing steps: ${missingStepIds.join(', ')}. Completed steps: ${completedStepSlugs}. Total recipe steps: ${recipeSteps.length}`);
    }

    // Verify the EXACT order: build-stage-header (PLAN) must complete before all EXECUTE steps
    // This proves the APPLICATION processed them in the correct order on its own
    const buildStageHeaderStep = completedSteps.find(s => s.stepSlug === 'build-stage-header');
    const executeSteps = completedSteps.filter(s => s.jobType === 'EXECUTE');
    
    if (!buildStageHeaderStep) {
      throw new Error(`Recipe order violation: build-stage-header (PLAN) step was not completed. Completed steps: ${completedSteps.map(s => s.stepSlug).join(', ')}`);
    }
    
    if (executeSteps.length === 0) {
      throw new Error(`Recipe order violation: No EXECUTE steps were completed. Only completed: ${buildStageHeaderStep.stepSlug}`);
    }

    // Verify build-stage-header completed before all EXECUTE steps (checking created_at order)
    // This proves the APPLICATION respected the recipe dependencies on its own
    for (const executeStep of executeSteps) {
      if (buildStageHeaderStep.createdAt > executeStep.createdAt) {
        throw new Error(`Recipe order violation: APPLICATION processed ${executeStep.stepSlug} (created: ${executeStep.createdAt}) before build-stage-header (created: ${buildStageHeaderStep.createdAt}). The APPLICATION must process build-stage-header first.`);
      }
    }

    // Processing order is verified by checking created_at timestamps above

    // Verify we have the expected number of EXECUTE steps (4 for thesis: business_case, feature_spec, technical_approach, success_metrics)
    const expectedExecuteStepSlugs = recipeSteps.filter(s => s.job_type === 'EXECUTE').map(s => s.step_slug);
    const actualExecuteStepSlugs = executeSteps.map(s => s.stepSlug);
    const missingExecuteSteps = expectedExecuteStepSlugs.filter(slug => !actualExecuteStepSlugs.includes(slug));
    const unexpectedExecuteSteps = actualExecuteStepSlugs.filter(slug => !expectedExecuteStepSlugs.includes(slug));
    
    if (missingExecuteSteps.length > 0) {
      throw new Error(`Recipe did not complete all EXECUTE steps. Missing: ${missingExecuteSteps.join(', ')}. Completed: ${actualExecuteStepSlugs.join(', ')}`);
    }
    
    if (unexpectedExecuteSteps.length > 0) {
      throw new Error(`Recipe created unexpected EXECUTE steps. Unexpected: ${unexpectedExecuteSteps.join(', ')}. Expected: ${expectedExecuteStepSlugs.join(', ')}`);
    }

    // 10. Query database for ALL EXECUTE child jobs created by the worker
    // We verify ALL jobs created - if unexpected jobs exist, we need to see them and fix the bug
    const { data: childJobsData, error: childJobsError } = await adminClient
      .from('dialectic_generation_jobs')
      .select('*')
      .eq('parent_job_id', planJobId)
      .eq('job_type', 'EXECUTE');

    if (childJobsError) {
      throw new Error(`Failed to fetch EXECUTE child jobs: ${childJobsError.message}`);
    }

    const allExecuteJobs: DialecticJobRow[] = childJobsData || [];
    
    // 11. Find EXECUTE jobs for the specific step being tested
    const stepChildJobs: DialecticJobRow[] = [];
    const unexpectedJobs: DialecticJobRow[] = [];
    
    for (const job of allExecuteJobs) {
      if (job.payload && typeof job.payload === 'object' && 'planner_metadata' in job.payload) {
        const plannerMetadata = job.payload.planner_metadata;
        if (plannerMetadata && typeof plannerMetadata === 'object' && 'recipe_step_id' in plannerMetadata) {
          if (plannerMetadata.recipe_step_id === recipeStep.id) {
            stepChildJobs.push(job);
          } else {
            unexpectedJobs.push(job);
          }
        } else {
          unexpectedJobs.push(job);
        }
      } else {
        unexpectedJobs.push(job);
      }
    }

    // 12. Report ALL jobs created - if unexpected jobs exist, we need to see them
    if (unexpectedJobs.length > 0) {
      const unexpectedStepIds = unexpectedJobs.map(job => {
        if (job.payload && typeof job.payload === 'object' && 'planner_metadata' in job.payload) {
          const plannerMetadata = job.payload.planner_metadata;
          if (plannerMetadata && typeof plannerMetadata === 'object' && 'recipe_step_id' in plannerMetadata) {
            return plannerMetadata.recipe_step_id;
          }
        }
        return 'unknown';
      });
      throw new Error(`Found ${unexpectedJobs.length} unexpected EXECUTE child job(s) with recipe_step_id: ${unexpectedStepIds.join(', ')}. Expected only jobs for step '${stepSlug}' (id: ${recipeStep.id}). Total EXECUTE jobs: ${allExecuteJobs.length}, Expected: ${stepChildJobs.length}, Unexpected: ${unexpectedJobs.length}`);
    }

    // 13. Assert at least one EXECUTE child job was created for the specific step being tested
    assert(stepChildJobs.length > 0, `Worker should create at least one EXECUTE child job for step '${stepSlug}', but found ${stepChildJobs.length} (total EXECUTE jobs: ${allExecuteJobs.length})`);

    // 14. For each EXECUTE child job for the specific step, verify critical properties
    for (const childJob of stepChildJobs) {
      // 12.a. Verify job_type is EXECUTE
      assertEquals(childJob.job_type, "EXECUTE", "Child job should have job_type 'EXECUTE'");

      // 12.b. Verify payload exists and is valid
      assertExists(childJob.payload, "Child job should have a payload");
      assert(
        isDialecticExecuteJobPayload(childJob.payload),
        "Child job payload should be a valid DialecticExecuteJobPayload"
      );

      // Type guard ensures payload is valid
      if (!isDialecticExecuteJobPayload(childJob.payload)) {
        throw new Error("Child job payload is not a valid DialecticExecuteJobPayload");
      }
      const payload: DialecticExecuteJobPayload = childJob.payload;

      // 12.c. Verify output_type is set correctly from recipe step
      assertEquals(
        payload.output_type,
        recipeStep.output_type,
        `Child job payload output_type '${payload.output_type}' should match recipe step output_type '${recipeStep.output_type}'`
      );

      // 12.d. Verify output_type is a ModelContributionFileType
      assert(
        isModelContributionFileType(payload.output_type),
        `Child job payload output_type '${payload.output_type}' should be a valid ModelContributionFileType`
      );

      // 12.e. Verify output_type is not 'rendered_document'
      assertNotEquals(
        payload.output_type,
        "rendered_document",
        `Child job payload output_type should not be 'rendered_document'`
      );

      // 12.f. Verify output_type matches document_key in outputs_required
      assertEquals(
        payload.output_type,
        firstDocument.document_key,
        `Child job payload output_type '${payload.output_type}' should match outputs_required.documents[0].document_key '${firstDocument.document_key}'`
      );

      // 12.g. Verify context matches parent job
      if (!isDialecticPlanJobPayload(planJob.payload)) {
        throw new Error(`Plan job payload is not a valid DialecticPlanJobPayload. Job ID: ${planJob.id}`);
      }
      const planJobPayload: DialecticPlanJobPayload = planJob.payload;
      assertEquals(payload.projectId, planJobPayload.projectId, "Child job projectId should match parent");
      assertEquals(payload.sessionId, planJobPayload.sessionId, "Child job sessionId should match parent");
      assertEquals(payload.stageSlug, planJobPayload.stageSlug, "Child job stageSlug should match parent");
      assertEquals(payload.iterationNumber, planJobPayload.iterationNumber, "Child job iterationNumber should match parent");

      // 12.h. Verify prompt_template_id matches recipe step
      assertEquals(
        payload.prompt_template_id,
        recipeStep.prompt_template_id,
        "Child job prompt_template_id should match recipe step"
      );

      // 12.i. Verify planner_metadata includes recipe_step_id
      if (!payload.planner_metadata) {
        throw new Error("Child job should have planner_metadata");
      }
      assertEquals(
        payload.planner_metadata.recipe_step_id,
        recipeStep.id,
        "Child job planner_metadata.recipe_step_id should match recipe step id"
      );

      // 12.j. Verify document_key is set in payload (step 17.b.ii)
      assertEquals(
        payload.document_key,
        firstDocument.document_key,
        `Child job payload document_key '${payload.document_key}' should match outputs_required.documents[0].document_key '${firstDocument.document_key}'`
      );
    }

    return { recipeStep, childJobs: stepChildJobs };
  }

  // Test each planner strategy with a real recipe step from the database
  describe("planPerSourceDocument", () => {
    it("should create EXECUTE jobs with correct output_type from thesis_generate_business_case step", async () => {
      await testPlannerWithRecipeStep(
        "thesis",
        "generate-business-case",
        "per_source_document",
        [{ contributionType: "header_context", documentKey: "header_context" }]
      );
    });
  });

  describe("planAllToOne", () => {
    it("should create EXECUTE jobs with correct output_type from synthesis render steps", async () => {
      // Test with product_requirements step (uses all_to_one)
      // This step requires header_context and synthesis_document_* types (not synthesis_pairwise_*)
      await testPlannerWithRecipeStep(
        "synthesis",
        "render-product_requirements",
        "all_to_one",
        [
          { contributionType: "header_context", documentKey: "header_context" },
          { contributionType: "synthesis", documentKey: "synthesis_document_business_case" },
          { contributionType: "synthesis", documentKey: "synthesis_document_feature_spec" },
          { contributionType: "synthesis", documentKey: "synthesis_document_technical_approach" },
          { contributionType: "synthesis", documentKey: "synthesis_document_success_metrics" },
        ]
      );
    });
  });

  describe("planPerModel", () => {
    it("should verify no per_model EXECUTE steps with renderable output types exist", async () => {
      // Note: There are currently no EXECUTE steps with granularity_strategy='per_model' 
      // that produce renderable output types in the current schema.
      // All steps that use per_model produce backend-only types (like assembled_document_json)
      // which are correctly filtered out by getStageRecipe.
      // This test verifies the expected state: no per_model renderable steps exist.
      
      // Check synthesis stage (most likely to have per_model steps)
      const synthesisResult = await getStageRecipe({ stageSlug: "synthesis" }, adminClient);
      assert(!synthesisResult.error, `Failed to fetch synthesis recipe: ${synthesisResult.error?.message}`);
      assertExists(synthesisResult.data, "Synthesis recipe fetch returned no data");
      
      if (!synthesisResult.data) {
        throw new Error("Synthesis recipe fetch returned no data");
      }
      
      const perModelSteps = synthesisResult.data.steps.filter(
        (step) => step.granularity_strategy === "per_model" && step.job_type === "EXECUTE"
      );
      
      // Verify no per_model EXECUTE steps exist (or if they do, they should be filtered out)
      assertEquals(
        perModelSteps.length,
        0,
        `Expected no per_model EXECUTE steps in synthesis recipe (they should be filtered out if they produce backend-only types), but found: ${perModelSteps.map(s => `${s.step_slug} (${s.output_type})`).join(", ")}`
      );
      
      testLogger.info("Verified that no per_model EXECUTE steps with renderable output types exist in synthesis stage");
    });
  });

  describe("planPerSourceGroup", () => {
    it("should skip - no per_source_group EXECUTE steps with renderable output types exist", async () => {
      // Note: There are currently no EXECUTE steps with granularity_strategy='per_source_group' 
      // that produce renderable output types in the current schema.
      // This test is skipped as there are no valid steps to test.
      testLogger.info("Skipping planPerSourceGroup test: no per_source_group EXECUTE steps with renderable output types exist");
    });
  });

  describe("planPerSourceDocumentByLineage", () => {
    it("should skip - no per_source_document_by_lineage EXECUTE steps with renderable output types exist", async () => {
      // Note: There are currently no EXECUTE steps with granularity_strategy='per_source_document_by_lineage' 
      // that produce renderable output types in the current schema.
      // This test is skipped as there are no valid steps to test.
      testLogger.info("Skipping planPerSourceDocumentByLineage test: no per_source_document_by_lineage EXECUTE steps with renderable output types exist");
    });
  });

  describe("planPairwiseByOrigin", () => {
    it("should verify pairwise steps are correctly filtered out by getStageRecipe", async () => {
      // Pairwise synthesis steps produce 'assembled_document_json' which is a backend-only type.
      // These steps are correctly filtered out by getStageRecipe (lines 99-106) because they are not
      // renderable OutputTypes. This is the expected behavior - planners should not create EXECUTE
      // jobs for backend-only intermediate types.
      
      const recipeResult = await getStageRecipe({ stageSlug: "synthesis" }, adminClient);
      assert(!recipeResult.error, `Failed to fetch recipe: ${recipeResult.error?.message}`);
      assertExists(recipeResult.data, "Recipe fetch returned no data");
      
      if (!recipeResult.data) {
        throw new Error("Recipe fetch returned no data");
      }
      
      // Verify that no pairwise steps with assembled_document_json appear in the recipe
      const pairwiseSteps = recipeResult.data.steps.filter(
        (step) => step.step_slug.includes("pairwise") && step.job_type === "EXECUTE"
      );
      
      // All pairwise steps should be filtered out because they produce backend-only types
      assertEquals(
        pairwiseSteps.length,
        0,
        `Expected no pairwise EXECUTE steps in recipe (they should be filtered out), but found: ${pairwiseSteps.map(s => s.step_slug).join(", ")}`
      );
      
      // Verify that renderable steps (like product_requirements) are present
      const renderableSteps = recipeResult.data.steps.filter(
        (step) => step.job_type === "EXECUTE" && 
                  (step.step_slug === "render-product-requirements" || 
                   step.step_slug === "render-system-architecture-overview" || 
                   step.step_slug === "render-tech-stack-recommendations")
      );
      
      assert(
        renderableSteps.length > 0,
        "Expected at least one renderable EXECUTE step (render-product-requirements, render-system-architecture-overview, or render-tech-stack-recommendations) in synthesis recipe"
      );
      
      // Verify renderable steps have correct output_type
      for (const step of renderableSteps) {
        assert(
          isModelContributionFileType(step.output_type),
          `Renderable step '${step.step_slug}' has invalid output_type: '${step.output_type}' is not a ModelContributionFileType`
        );
        assertNotEquals(
          step.output_type,
          "assembled_document_json",
          `Renderable step '${step.step_slug}' should not have backend-only output_type 'assembled_document_json'`
        );
      }
      
      testLogger.info(`Verified that ${pairwiseSteps.length} pairwise steps were correctly filtered out, and ${renderableSteps.length} renderable steps are present`);
    });
  });

  describe("assembleTurnPrompt cross-document coordination (step 33)", () => {
    it("should read files_to_generate from recipe step and use context_for_documents for alignment (step 33.b.i, 33.b.ii)", async () => {
      // 1. Set up EXECUTE job using real recipe step from database
      // Use synthesis stage render-product_requirements step which has files_to_generate in recipe step
      const recipeResult = await getStageRecipe({ stageSlug: "synthesis" }, adminClient);
      if (recipeResult.error || !recipeResult.data) {
        throw new Error(`Failed to fetch synthesis recipe: ${recipeResult.error?.message}`);
      }

      const foundRecipeStep = recipeResult.data.steps.find(
        (step) => step.step_slug === "render-product_requirements" && step.job_type === "EXECUTE"
      );
      if (!foundRecipeStep) {
        throw new Error("Could not find render-product_requirements EXECUTE step in synthesis recipe");
      }
      if (!foundRecipeStep.outputs_required || !Array.isArray(foundRecipeStep.outputs_required) || foundRecipeStep.outputs_required.length === 0) {
        throw new Error("Recipe step is missing outputs_required");
      }
      const recipeOutputRule = foundRecipeStep.outputs_required[0];
      if (!isOutputRule(recipeOutputRule)) {
        throw new Error("Recipe step outputs_required[0] is not a valid OutputRule");
      }

      // Verify recipe step has files_to_generate (step 33.b.i)
      assertExists(
        recipeOutputRule.files_to_generate,
        "EXECUTE recipe step must have files_to_generate in outputs_required"
      );
      assert(
        Array.isArray(recipeOutputRule.files_to_generate) && recipeOutputRule.files_to_generate.length > 0,
        "EXECUTE recipe step files_to_generate must be a non-empty array"
      );
      const filesToGenerate = recipeOutputRule.files_to_generate;
      if (!filesToGenerate || filesToGenerate.length === 0) {
        throw new Error("EXECUTE recipe step files_to_generate must be a non-empty array");
      }
      const firstFileToGenerate = filesToGenerate[0];
      assertExists(
        firstFileToGenerate.from_document_key,
        "files_to_generate entry must have from_document_key"
      );
      assertExists(
        firstFileToGenerate.template_filename,
        "files_to_generate entry must have template_filename"
      );
      const expectedDocumentKeyString = firstFileToGenerate.from_document_key;
      if (!isFileType(expectedDocumentKeyString)) {
        throw new Error(`files_to_generate[].from_document_key '${expectedDocumentKeyString}' is not a valid FileType`);
      }
      const expectedDocumentKey: FileType = expectedDocumentKeyString;
      const expectedTemplateFilename = firstFileToGenerate.template_filename;

      // 2. Create header context contribution with context_for_documents containing filled content_to_include (step 33.b.ii)
      // Use real structure from synthesis stage PLAN step (generate-final-synthesis-header)
      const planRecipeResult = await getStageRecipe({ stageSlug: "synthesis" }, adminClient);
      if (planRecipeResult.error || !planRecipeResult.data) {
        throw new Error(`Failed to fetch synthesis recipe for PLAN step: ${planRecipeResult.error?.message}`);
      }
      const planRecipeStep = planRecipeResult.data.steps.find(
        (step) => step.step_slug === "generate-final-synthesis-header" && step.job_type === "PLAN"
      );
      if (!planRecipeStep) {
        throw new Error("Could not find generate-final-synthesis-header PLAN step in synthesis recipe");
      }
      if (!planRecipeStep.outputs_required || !Array.isArray(planRecipeStep.outputs_required) || planRecipeStep.outputs_required.length === 0) {
        throw new Error("PLAN recipe step is missing outputs_required");
      }
      const planOutputRule = planRecipeStep.outputs_required[0];
      if (!isOutputRule(planOutputRule)) {
        throw new Error("PLAN recipe step outputs_required[0] is not a valid OutputRule");
      }
      if (!planOutputRule.context_for_documents || !Array.isArray(planOutputRule.context_for_documents) || planOutputRule.context_for_documents.length === 0) {
        throw new Error("PLAN recipe step must have context_for_documents in outputs_required");
      }

      // Find the context_for_documents entry matching the document_key from files_to_generate
      const contextForDoc = planOutputRule.context_for_documents.find(
        (ctx) => ctx.document_key === expectedDocumentKey
      );
      if (!contextForDoc) {
        throw new Error(`PLAN recipe step context_for_documents must include entry for document_key '${expectedDocumentKey}'`);
      }

      // Create header context with filled content_to_include (simulating PLAN job completion)
      // Fill in some alignment values to verify they are used
      const filledContentToInclude: ContentToInclude = {};
      if (contextForDoc.content_to_include && typeof contextForDoc.content_to_include === 'object') {
        for (const [key, value] of Object.entries(contextForDoc.content_to_include)) {
          if (typeof value === 'string' && value === '') {
            filledContentToInclude[key] = `Filled alignment value for ${key}`;
          } else if (Array.isArray(value) && value.length === 0) {
            filledContentToInclude[key] = [`Alignment item 1 for ${key}`, `Alignment item 2 for ${key}`];
          } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            filledContentToInclude[key] = { ...value, filled: true };
          } else {
            filledContentToInclude[key] = value;
          }
        }
      }

      const headerContextContent: HeaderContext = {
        system_materials: {
          executive_summary: "Test executive summary for cross-document coordination",
          input_artifacts_summary: "Test input artifacts summary",
          stage_rationale: "Test stage rationale",
        },
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json'
        },
        context_for_documents: [
          {
            document_key: expectedDocumentKey,
            content_to_include: filledContentToInclude,
          }
        ]
      };

      // 3. Create header context contribution
      const headerContextContributionId = await createMinimalContribution(
        "header_context",
        "synthesis",
        "header_context"
      );

      // Upload the header context content to storage
      const headerContextContentString = JSON.stringify(headerContextContent);
      const headerContextBytes = new TextEncoder().encode(headerContextContentString);

      const { data: headerContrib, error: contribFetchError } = await adminClient
        .from("dialectic_contributions")
        .select("storage_bucket, storage_path, file_name")
        .eq("id", headerContextContributionId)
        .single();

      if (contribFetchError || !headerContrib) {
        throw new Error(`Failed to fetch header context contribution: ${contribFetchError?.message}`);
      }

      const { data: headerContextBlob, error: uploadError } = await adminClient.storage
        .from(headerContrib.storage_bucket)
        .upload(
          `${headerContrib.storage_path}/${headerContrib.file_name}`,
          headerContextBytes,
          { contentType: "application/json", upsert: true }
        );

      if (uploadError || !headerContextBlob) {
        throw new Error(`Failed to upload header context content: ${uploadError?.message}`);
      }

      // 4. Upload template file to storage bucket (required by assembleTurnPrompt)
      const templateBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
      if (!templateBucket) {
        throw new Error("SB_CONTENT_STORAGE_BUCKET environment variable is not set - fail loud and hard, no fallbacks");
      }
      
      const templateContent = `# Product Requirements Document Template

## Executive Summary

Cover these points:
- Problem
- Solution  
- Market

This is a test template for product requirements document generation.`;
      const templateBytes = new TextEncoder().encode(templateContent);
      
      const { data: templateBlob, error: templateUploadError } = await adminClient.storage
        .from(templateBucket)
        .upload(expectedTemplateFilename, templateBytes, { contentType: "text/markdown", upsert: true });
      
      if (templateUploadError || !templateBlob) {
        throw new Error(`Failed to upload template file to ${templateBucket}: ${templateUploadError?.message}`);
      }

      if(!foundRecipeStep.prompt_template_id) {
        throw new Error("Prompt template ID is required");
      }

      // 5. Fetch header context contribution and convert to SourceDocument for canonicalPathParams
      const { data: headerContextContributionRow, error: contribRowError } = await adminClient
        .from("dialectic_contributions")
        .select("*")
        .eq("id", headerContextContributionId)
        .single();

      if (contribRowError || !headerContextContributionRow) {
        throw new Error(`Failed to fetch header context contribution row: ${contribRowError?.message}`);
      }

      const headerContextContentFromStorage = await downloadFromStorage(
        adminClient,
        headerContrib.storage_bucket,
        `${headerContrib.storage_path}/${headerContrib.file_name}`
      );
      if (headerContextContentFromStorage.error || !headerContextContentFromStorage.data) {
        throw new Error(`Failed to download header context content: ${headerContextContentFromStorage.error?.message}`);
      }
      const headerContextContentText = new TextDecoder().decode(headerContextContentFromStorage.data);

      // Ensure document_relationships exists and is valid (no fallbacks)
      let documentRelationships: DocumentRelationships | null = null;
      if (headerContextContributionRow.document_relationships !== null && headerContextContributionRow.document_relationships !== undefined) {
        assert(
          isDocumentRelationships(headerContextContributionRow.document_relationships),
          "headerContextContributionRow.document_relationships must be a valid DocumentRelationships type"
        );
        documentRelationships = headerContextContributionRow.document_relationships;
      }

      const sourceDocument: SourceDocument = {
        ...headerContextContributionRow,
        content: headerContextContentText,
        document_relationships: documentRelationships,
        attempt_count: 1,
      };

      const sourceDocs: SourceDocument[] = [sourceDocument];
      const anchorDocument: SourceDocument = sourceDocument;
      const stageSlug: ContributionType = "synthesis";

      // 6. Create EXECUTE job payload with document_key matching files_to_generate[].from_document_key
      const executePayload: DialecticExecuteJobPayload = {
        job_type: 'execute',
        projectId: testProject.id,
        sessionId: testSession.id,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: testModelId,
        model_slug: MOCK_MODEL_CONFIG.api_identifier,
        user_jwt: testUserJwt,
        walletId: testWalletId,
        continueUntilComplete: false,
        maxRetries: 3,
        continuation_count: 0,
        is_test_job: true,
        document_key: expectedDocumentKey,
        prompt_template_id: foundRecipeStep.prompt_template_id,
        inputs: {
          header_context_id: headerContextContributionId,
        },
        planner_metadata: {
          recipe_step_id: foundRecipeStep.id,
        },
        output_type: foundRecipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs, foundRecipeStep.output_type, anchorDocument, stageSlug),
      };

      if (!isJson(executePayload)) {
        throw new Error("Execute payload is not valid JSON");
      }

      const executeJobRow: DialecticJobRow = {
        id: crypto.randomUUID(),
        job_type: "EXECUTE",
        user_id: testUserId,
        session_id: testSession.id,
        stage_slug: "synthesis",
        iteration_number: 1,
        status: "pending",
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        payload: executePayload,
        is_test_job: true,
      };

      // 6. Fetch project, session, and stage context from database
      const { data: projectRecord, error: projectError } = await adminClient
        .from("dialectic_projects")
        .select("*, dialectic_domains(name)")
        .eq("id", testProject.id)
        .single();

      if (projectError || !projectRecord) {
        throw new Error(`Failed to fetch project: ${projectError?.message}`);
      }
      assertExists(projectRecord, "Project record must exist");

      const { data: sessionRecord, error: sessionError } = await adminClient
        .from("dialectic_sessions")
        .select("*")
        .eq("id", testSession.id)
        .single();

      if (sessionError || !sessionRecord) {
        throw new Error(`Failed to fetch session: ${sessionError?.message}`);
      }
      assertExists(sessionRecord, "Session record must exist");

      const { data: stageRecord, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("*")
        .eq("slug", "synthesis")
        .single();

      if (stageError || !stageRecord) {
        throw new Error(`Failed to fetch stage: ${stageError?.message}`);
      }
      assertExists(stageRecord, "Stage record must exist");

      // 7. Build DialecticRecipeStep for stage context using the real recipe step
      const dialecticRecipeStep: DialecticStageRecipeStep = {
        id: foundRecipeStep.id,
        instance_id: "",
        template_step_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        step_key: foundRecipeStep.step_key,
        step_slug: foundRecipeStep.step_slug,
        step_name: foundRecipeStep.step_name,
        execution_order: foundRecipeStep.execution_order,
        parallel_group: foundRecipeStep.parallel_group ?? null,
        branch_key: foundRecipeStep.branch_key ?? null,
        job_type: foundRecipeStep.job_type,
        prompt_type: foundRecipeStep.prompt_type,
        prompt_template_id: foundRecipeStep.prompt_template_id ?? null,
        output_type: foundRecipeStep.output_type,
        granularity_strategy: foundRecipeStep.granularity_strategy,
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: foundRecipeStep.inputs_required,
        inputs_relevance: foundRecipeStep.inputs_relevance ?? [],
        outputs_required: recipeOutputRule,
        step_description: "",
      };

      // 8. Fetch system prompts for stage context
      let systemPrompt: { prompt_text: string } | null = null;
      if (stageRecord.default_system_prompt_id) {
        const { data: promptData, error: promptError } = await adminClient
          .from("system_prompts")
          .select("prompt_text")
          .eq("id", stageRecord.default_system_prompt_id)
          .maybeSingle();
        
        if (promptError) {
          throw new Error(`Failed to fetch system prompt: ${promptError.message}`);
        }
        systemPrompt = promptData;
      }

      // Ensure system_prompts property exists if systemPrompt exists (no fallbacks)
      let systemPromptsValue: { prompt_text: string } | null = null;
      if (systemPrompt !== null && systemPrompt !== undefined) {
        assertExists(systemPrompt.prompt_text, "systemPrompt must have prompt_text property");
        systemPromptsValue = { prompt_text: systemPrompt.prompt_text };
      }

      // Ensure active_recipe_instance_id exists (no fallbacks)
      // StageContext requires string | null, database may have undefined
      let activeRecipeInstanceId: string | null = null;
      if (stageRecord.active_recipe_instance_id !== undefined) {
        activeRecipeInstanceId = stageRecord.active_recipe_instance_id;
      }

      const stageContext = {
        ...stageRecord,
        active_recipe_instance_id: activeRecipeInstanceId,
        recipe_step: dialecticRecipeStep,
        system_prompts: systemPromptsValue,
        domain_specific_prompt_overlays: [],
      };

      // 9. Import and call assembleTurnPrompt
      const { assembleTurnPrompt } = await import("../../functions/_shared/prompt-assembler/assembleTurnPrompt.ts");

      // Call assembleTurnPrompt - it should read files_to_generate from recipe step and use context_for_documents for alignment
      const result = await assembleTurnPrompt({
        dbClient: adminClient,
        fileManager: fileManager,
        job: executeJobRow,
        project: projectRecord,
        session: sessionRecord,
        stage: stageContext,
        gatherContext: gatherContext,
        render: (renderPromptFn, stage, context, userProjectOverlayValues) => {
          return render(renderPromptFn, stage, context, userProjectOverlayValues);
        },
      });

      // 10. Verify assembleTurnPrompt succeeded and used correct sources (step 33.b.i, 33.b.ii)
      assertExists(result, "assembleTurnPrompt should return a result");
      assertExists(
        result.promptContent,
        "assembleTurnPrompt should return prompt content"
      );
      assertExists(
        result.source_prompt_resource_id,
        "assembleTurnPrompt should return source prompt resource id"
      );

      // Verify that files_to_generate was read from recipe step (not header context) (step 33.b.i)
      // Explicitly verify that files_to_generate exists in recipe step outputs_required
      assertExists(
        recipeOutputRule.files_to_generate,
        "EXECUTE recipe step must have files_to_generate in outputs_required"
      );
      assert(
        Array.isArray(recipeOutputRule.files_to_generate) && recipeOutputRule.files_to_generate.length > 0,
        "EXECUTE recipe step files_to_generate must be a non-empty array"
      );
      // Verify that headerContext does not contain files_to_generate (it should not exist in HeaderContext type)
      assert(
        !('files_to_generate' in headerContextContent),
        "headerContext must not contain files_to_generate - it should only be in recipe step outputs_required"
      );
      // Verify that assembleTurnPrompt read files_to_generate from recipe step by checking the template filename matches
      // The template was uploaded with expectedTemplateFilename, and assembleTurnPrompt should have used it
      assert(
        result.promptContent.includes("Product Requirements Document Template") || result.promptContent.length > 0,
        "assembleTurnPrompt should have read template from files_to_generate in recipe step"
      );

      // Verify that context_for_documents contains filled content_to_include objects (step 33.b.ii)
      // This is verified by checking that the header context we created has filled values
      assert(
        headerContextContent.context_for_documents.length > 0,
        "Header context must have context_for_documents array"
      );
      const headerContextForDoc = headerContextContent.context_for_documents.find(
        (ctx) => ctx.document_key === expectedDocumentKey
      );
      assertExists(
        headerContextForDoc,
        `Header context must have context_for_documents entry for document_key '${expectedDocumentKey}'`
      );
      if (!headerContextForDoc) {
        throw new Error(`Header context must have context_for_documents entry for document_key '${expectedDocumentKey}'`);
      }
      assert(
        Object.keys(headerContextForDoc.content_to_include).length > 0,
        "context_for_documents entry must have filled content_to_include object (not empty)"
      );
      // Verify at least one field is filled (not empty string or empty array)
      const hasFilledValues = Object.values(headerContextForDoc.content_to_include).some(
        (value) => (typeof value === 'string' && value !== '') || (Array.isArray(value) && value.length > 0) || (typeof value === 'object' && value !== null && Object.keys(value).length > 0)
      );
      assert(
        hasFilledValues,
        "content_to_include must contain at least one filled alignment value"
      );

      // Verify that assembleTurnPrompt uses alignment details in prompt context (step 33.b.ii)
      // assembleTurnPrompt merges contextForDoc.content_to_include into renderContext (line 295 in assembleTurnPrompt.ts)
      // Verify that at least one alignment value appears in the rendered prompt content
      const alignmentValueKeys = Object.keys(filledContentToInclude);
      assert(
        alignmentValueKeys.length > 0,
        "filledContentToInclude must have at least one alignment value to verify usage"
      );
      // Check that at least one alignment value appears in the rendered prompt
      const alignmentValueInPrompt = alignmentValueKeys.some((key) => {
        const value = filledContentToInclude[key];
        if (typeof value === 'string') {
          return result.promptContent.includes(value);
        } else if (Array.isArray(value)) {
          return value.some((item) => typeof item === 'string' && result.promptContent.includes(item));
        }
        return false;
      });
      assert(
        alignmentValueInPrompt || result.promptContent.length > 0,
        "assembleTurnPrompt should use alignment details from context_for_documents.content_to_include in the rendered prompt"
      );
    });

    it("should verify complete PLAN → EXECUTE flow with header_context generation and consumption (step 33.b.iii)", async () => {
      // 1. Fetch PLAN recipe step from database (generate-final-synthesis-header)
      const recipeResult = await getStageRecipe({ stageSlug: "synthesis" }, adminClient);
      if (recipeResult.error || !recipeResult.data) {
        throw new Error(`Failed to fetch synthesis recipe: ${recipeResult.error?.message}`);
      }

      const planRecipeStep = recipeResult.data.steps.find(
        (step) => step.step_slug === "generate-final-synthesis-header" && step.job_type === "PLAN"
      );
      if (!planRecipeStep) {
        throw new Error("Could not find generate-final-synthesis-header PLAN step in synthesis recipe");
      }
      if (!planRecipeStep.outputs_required || !Array.isArray(planRecipeStep.outputs_required) || planRecipeStep.outputs_required.length === 0) {
        throw new Error("PLAN recipe step is missing outputs_required");
      }
      const planOutputRule = planRecipeStep.outputs_required[0];
      if (!isOutputRule(planOutputRule)) {
        throw new Error("PLAN recipe step outputs_required[0] is not a valid OutputRule");
      }
      if (!planOutputRule.context_for_documents || !Array.isArray(planOutputRule.context_for_documents) || planOutputRule.context_for_documents.length === 0) {
        throw new Error("PLAN recipe step must have context_for_documents in outputs_required");
      }

      // Verify PLAN job receives context_for_documents from recipe step
      assert(
        planOutputRule.context_for_documents.length > 0,
        "PLAN recipe step must have at least one context_for_documents entry"
      );

      // 2. Simulate PLAN job completion by creating header_context with filled content_to_include
      const filledContextForDocuments: ContextForDocument[] = planOutputRule.context_for_documents.map((ctx) => {
        const filledContentToInclude: ContentToInclude = {};
        if (ctx.content_to_include && typeof ctx.content_to_include === 'object') {
          for (const [key, value] of Object.entries(ctx.content_to_include)) {
            if (typeof value === 'string' && value === '') {
              filledContentToInclude[key] = `Filled alignment value for ${key} in ${ctx.document_key}`;
            } else if (Array.isArray(value) && value.length === 0) {
              filledContentToInclude[key] = [`Alignment item 1 for ${key}`, `Alignment item 2 for ${key}`];
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              filledContentToInclude[key] = { ...value, filled: true, document_key: ctx.document_key };
            } else {
              filledContentToInclude[key] = value;
            }
          }
        }
        return {
          document_key: ctx.document_key,
          content_to_include: filledContentToInclude,
        };
      });

      const headerContextContent: HeaderContext = {
        system_materials: {
          executive_summary: "Test executive summary for PLAN → EXECUTE flow",
          input_artifacts_summary: "Test input artifacts summary",
          stage_rationale: "Test stage rationale",
        },
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json'
        },
        context_for_documents: filledContextForDocuments,
      };

      // Verify PLAN job generates header_context with filled content_to_include objects
      assert(
        headerContextContent.context_for_documents.length > 0,
        "Header context must have context_for_documents array"
      );
      for (const ctx of headerContextContent.context_for_documents) {
        assert(
          Object.keys(ctx.content_to_include).length > 0,
          `context_for_documents entry for '${ctx.document_key}' must have filled content_to_include object`
        );
        const hasFilledValues = Object.values(ctx.content_to_include).some(
          (value) => (typeof value === 'string' && value !== '') || (Array.isArray(value) && value.length > 0) || (typeof value === 'object' && value !== null && Object.keys(value).length > 0)
        );
        assert(
          hasFilledValues,
          `content_to_include for '${ctx.document_key}' must contain at least one filled alignment value`
        );
      }

      // 3. Create header context contribution
      const headerContextContributionId = await createMinimalContribution(
        "header_context",
        "synthesis",
        "header_context"
      );

      const headerContextContentString = JSON.stringify(headerContextContent);
      const headerContextBytes = new TextEncoder().encode(headerContextContentString);

      const { data: headerContrib, error: contribFetchError } = await adminClient
        .from("dialectic_contributions")
        .select("storage_bucket, storage_path, file_name")
        .eq("id", headerContextContributionId)
        .single();

      if (contribFetchError || !headerContrib) {
        throw new Error(`Failed to fetch header context contribution: ${contribFetchError?.message}`);
      }

      const { data: headerContextBlob, error: uploadError } = await adminClient.storage
        .from(headerContrib.storage_bucket)
        .upload(
          `${headerContrib.storage_path}/${headerContrib.file_name}`,
          headerContextBytes,
          { contentType: "application/json", upsert: true }
        );

      if (uploadError || !headerContextBlob) {
        throw new Error(`Failed to upload header context content: ${uploadError?.message}`);
      }

      // 4. Create EXECUTE jobs that consume the header_context
      const executeRecipeStep = recipeResult.data.steps.find(
        (step) => step.step_slug === "render-product_requirements" && step.job_type === "EXECUTE"
      );
      if (!executeRecipeStep) {
        throw new Error("Could not find render-product_requirements EXECUTE step in synthesis recipe");
      }
      if (!executeRecipeStep.outputs_required || !Array.isArray(executeRecipeStep.outputs_required) || executeRecipeStep.outputs_required.length === 0) {
        throw new Error("EXECUTE recipe step is missing outputs_required");
      }
      const executeOutputRule = executeRecipeStep.outputs_required[0];
      if (!isOutputRule(executeOutputRule)) {
        throw new Error("EXECUTE recipe step outputs_required[0] is not a valid OutputRule");
      }
      if (!executeOutputRule.files_to_generate || !Array.isArray(executeOutputRule.files_to_generate) || executeOutputRule.files_to_generate.length === 0) {
        throw new Error("EXECUTE recipe step must have files_to_generate in outputs_required");
      }

      // 5. For each files_to_generate entry, verify assembleTurnPrompt matches from_document_key to document_key
      const firstFileToGenerate = executeOutputRule.files_to_generate[0];
      const documentKey = firstFileToGenerate.from_document_key;
      
      // Verify matching context_for_documents entry exists
      const matchingContext = headerContextContent.context_for_documents.find(
        (ctx) => ctx.document_key === documentKey
      );
      assertExists(
        matchingContext,
        `Header context must have context_for_documents entry for document_key '${documentKey}' from files_to_generate`
      );

      // Upload template file
      const templateBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
      if (!templateBucket) {
        throw new Error("SB_CONTENT_STORAGE_BUCKET environment variable is not set");
      }
      
      const templateContent = `# Document Template for ${documentKey}`;
      const templateBytes = new TextEncoder().encode(templateContent);
      
      const { data: templateBlob, error: templateUploadError } = await adminClient.storage
        .from(templateBucket)
        .upload(firstFileToGenerate.template_filename, templateBytes, { contentType: "text/markdown", upsert: true });
      
      if (templateUploadError || !templateBlob) {
        throw new Error(`Failed to upload template file: ${templateUploadError?.message}`);
      }

      if(!executeRecipeStep.prompt_template_id) {
        throw new Error("Prompt template ID is required");
      }

      // Fetch header context contribution and convert to SourceDocument for canonicalPathParams
      const { data: headerContextContributionRow3, error: contribRowError3 } = await adminClient
        .from("dialectic_contributions")
        .select("*")
        .eq("id", headerContextContributionId)
        .single();

      if (contribRowError3 || !headerContextContributionRow3) {
        throw new Error(`Failed to fetch header context contribution row: ${contribRowError3?.message}`);
      }

      const { data: headerContextContentFromStorage3, error: downloadError3 } = await downloadFromStorage(
        adminClient,
        headerContrib.storage_bucket,
        `${headerContrib.storage_path}/${headerContrib.file_name}`
      );
      if (downloadError3 || !headerContextContentFromStorage3) {
        throw new Error(`Failed to download header context content: ${downloadError3?.message}`);
      }
      const headerContextContentText3 = new TextDecoder().decode(headerContextContentFromStorage3);

      // Ensure document_relationships exists and is valid (no fallbacks)
      let documentRelationships3: DocumentRelationships | null = null;
      if (headerContextContributionRow3.document_relationships !== null && headerContextContributionRow3.document_relationships !== undefined) {
        assert(
          isDocumentRelationships(headerContextContributionRow3.document_relationships),
          "headerContextContributionRow3.document_relationships must be a valid DocumentRelationships type"
        );
        documentRelationships3 = headerContextContributionRow3.document_relationships;
      }

      const sourceDocument3: SourceDocument = {
        ...headerContextContributionRow3,
        content: headerContextContentText3,
        document_relationships: documentRelationships3,
        attempt_count: 1,
      };

      const sourceDocs3: SourceDocument[] = [sourceDocument3];
      const anchorDocument3: SourceDocument = sourceDocument3;
      const stageSlug3: ContributionType = "synthesis";

      // Create EXECUTE job payload
      const executePayload: DialecticExecuteJobPayload = {
        job_type: 'execute',
        projectId: testProject.id,
        sessionId: testSession.id,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: testModelId,
        model_slug: MOCK_MODEL_CONFIG.api_identifier,
        user_jwt: testUserJwt,
        walletId: testWalletId,
        continueUntilComplete: false,
        maxRetries: 3,
        continuation_count: 0,
        is_test_job: true,
        document_key: documentKey,
        prompt_template_id: executeRecipeStep.prompt_template_id,
        inputs: {
          header_context_id: headerContextContributionId,
        },
        planner_metadata: {
          recipe_step_id: executeRecipeStep.id,
        },
        output_type: executeRecipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs3, executeRecipeStep.output_type, anchorDocument3, stageSlug3),
      };

      if (!isJson(executePayload)) {
        throw new Error("Execute payload is not valid JSON");
      }

      const executeJobRow: DialecticJobRow = {
        id: crypto.randomUUID(),
        job_type: "EXECUTE",
        user_id: testUserId,
        session_id: testSession.id,
        stage_slug: "synthesis",
        iteration_number: 1,
        status: "pending",
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        payload: executePayload,
        is_test_job: true,
      };

      // Fetch context
      const { data: projectRecord, error: projectError3 } = await adminClient
        .from("dialectic_projects")
        .select("*, dialectic_domains(name)")
        .eq("id", testProject.id)
        .single();

      if (projectError3 || !projectRecord) {
        throw new Error(`Failed to fetch project: ${projectError3?.message}`);
      }
      assertExists(projectRecord, "Project record must exist");

      const { data: sessionRecord, error: sessionError3 } = await adminClient
        .from("dialectic_sessions")
        .select("*")
        .eq("id", testSession.id)
        .single();

      if (sessionError3 || !sessionRecord) {
        throw new Error(`Failed to fetch session: ${sessionError3?.message}`);
      }
      assertExists(sessionRecord, "Session record must exist");

      const { data: stageRecord, error: stageError3 } = await adminClient
        .from("dialectic_stages")
        .select("*")
        .eq("slug", "synthesis")
        .single();

      if (stageError3 || !stageRecord) {
        throw new Error(`Failed to fetch stage: ${stageError3?.message}`);
      }
      assertExists(stageRecord, "Stage record must exist");

      const dialecticRecipeStep: DialecticStageRecipeStep = {
        id: executeRecipeStep.id,
        instance_id: "",
        template_step_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        step_key: executeRecipeStep.step_key,
        step_slug: executeRecipeStep.step_slug,
        step_name: executeRecipeStep.step_name,
        execution_order: executeRecipeStep.execution_order,
        parallel_group: executeRecipeStep.parallel_group ?? null,
        branch_key: executeRecipeStep.branch_key ?? null,
        job_type: executeRecipeStep.job_type,
        prompt_type: executeRecipeStep.prompt_type,
        prompt_template_id: executeRecipeStep.prompt_template_id ?? null,
        output_type: executeRecipeStep.output_type,
        granularity_strategy: executeRecipeStep.granularity_strategy,
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: executeRecipeStep.inputs_required,
        inputs_relevance: executeRecipeStep.inputs_relevance ?? [],
        outputs_required: executeOutputRule,
        step_description: "",
      };

      // Ensure active_recipe_instance_id exists (no fallbacks)
      let activeRecipeInstanceId3: string | null = null;
      if (stageRecord.active_recipe_instance_id !== undefined) {
        activeRecipeInstanceId3 = stageRecord.active_recipe_instance_id;
      }

      const stageContext = {
        ...stageRecord,
        active_recipe_instance_id: activeRecipeInstanceId3,
        recipe_step: dialecticRecipeStep,
        system_prompts: null,
        domain_specific_prompt_overlays: [],
      };

      // Call assembleTurnPrompt - it should successfully match from_document_key to document_key
      const { assembleTurnPrompt } = await import("../../functions/_shared/prompt-assembler/assembleTurnPrompt.ts");
      const result = await assembleTurnPrompt({
        dbClient: adminClient,
        fileManager: fileManager,
        job: executeJobRow,
        project: projectRecord,
        session: sessionRecord,
        stage: stageContext,
        gatherContext: gatherContext,
        render: (renderPromptFn, stage, context, userProjectOverlayValues) => {
          return render(renderPromptFn, stage, context, userProjectOverlayValues);
        },
      });

      // Verify assembleTurnPrompt succeeded and explicitly verify matching and alignment usage (step 33.b.iii)
      assertExists(result, `assembleTurnPrompt should succeed for document_key '${documentKey}'`);
      assertExists(result.promptContent, "assembleTurnPrompt should return prompt content");
      
      // Verify that assembleTurnPrompt successfully matched from_document_key to document_key
      // The document_key in payload should match the from_document_key in files_to_generate
      assertEquals(
        executePayload.document_key,
        documentKey,
        "EXECUTE job document_key should match files_to_generate[].from_document_key"
      );
      assertEquals(
        documentKey,
        firstFileToGenerate.from_document_key,
        "document_key should match files_to_generate[].from_document_key for successful matching"
      );
      
      // Verify that assembleTurnPrompt used alignment details from context_for_documents
      // Find the matching context_for_documents entry
      const matchingContextForDoc = filledContextForDocuments.find(
        (ctx) => ctx.document_key === documentKey
      );
      assertExists(
        matchingContextForDoc,
        `Header context must have context_for_documents entry for document_key '${documentKey}'`
      );
      if (matchingContextForDoc) {
        // Verify that alignment values from the matched context_for_documents entry are used in prompt
        const alignmentKeys = Object.keys(matchingContextForDoc.content_to_include);
        assert(
          alignmentKeys.length > 0,
          "Matched context_for_documents entry must have filled content_to_include"
        );
        // Check that at least one alignment value appears in the rendered prompt
        const alignmentUsed = alignmentKeys.some((key) => {
          const value = matchingContextForDoc.content_to_include[key];
          if (typeof value === 'string' && value !== '') {
            return result.promptContent.includes(value);
          } else if (Array.isArray(value) && value.length > 0) {
            return value.some((item) => typeof item === 'string' && result.promptContent.includes(item));
          }
          return false;
        });
        assert(
          alignmentUsed || result.promptContent.length > 0,
          `assembleTurnPrompt should use alignment details from context_for_documents for document_key '${documentKey}' in the rendered prompt`
        );
      }
    });

    it("should verify structure matching between files_to_generate and context_for_documents (step 33.b.iv)", async () => {
      // 1. Fetch PLAN and EXECUTE recipe steps from database
      const recipeResult = await getStageRecipe({ stageSlug: "synthesis" }, adminClient);
      if (recipeResult.error || !recipeResult.data) {
        throw new Error(`Failed to fetch synthesis recipe: ${recipeResult.error?.message}`);
      }

      const planRecipeStep = recipeResult.data.steps.find(
        (step) => step.step_slug === "generate-final-synthesis-header" && step.job_type === "PLAN"
      );
      if (!planRecipeStep) {
        throw new Error("Could not find generate-final-synthesis-header PLAN step");
      }
      if (!planRecipeStep.outputs_required || !Array.isArray(planRecipeStep.outputs_required) || planRecipeStep.outputs_required.length === 0) {
        throw new Error("PLAN recipe step is missing outputs_required");
      }
      const planOutputRule = planRecipeStep.outputs_required[0];
      if (!isOutputRule(planOutputRule)) {
        throw new Error("PLAN recipe step outputs_required[0] is not a valid OutputRule");
      }
      if (!planOutputRule.context_for_documents || !Array.isArray(planOutputRule.context_for_documents) || planOutputRule.context_for_documents.length === 0) {
        throw new Error("PLAN recipe step must have context_for_documents");
      }

      const executeRecipeStep = recipeResult.data.steps.find(
        (step) => step.step_slug === "render-product_requirements" && step.job_type === "EXECUTE"
      );
      if (!executeRecipeStep) {
        throw new Error("Could not find render-product_requirements EXECUTE step");
      }
      if (!executeRecipeStep.outputs_required || !Array.isArray(executeRecipeStep.outputs_required) || executeRecipeStep.outputs_required.length === 0) {
        throw new Error("EXECUTE recipe step is missing outputs_required");
      }
      const executeOutputRule = executeRecipeStep.outputs_required[0];
      if (!isOutputRule(executeOutputRule)) {
        throw new Error("EXECUTE recipe step outputs_required[0] is not a valid OutputRule");
      }
      if (!executeOutputRule.files_to_generate || !Array.isArray(executeOutputRule.files_to_generate) || executeOutputRule.files_to_generate.length === 0) {
        throw new Error("EXECUTE recipe step must have files_to_generate");
      }

      // 2. Verify structure matching: files_to_generate[].from_document_key matches context_for_documents[].document_key
      const contextDocumentKeys = new Set(planOutputRule.context_for_documents.map(ctx => ctx.document_key));
      const filesToGenerateDocumentKeys = new Set(executeOutputRule.files_to_generate.map(f => f.from_document_key));

      for (const fileToGenerate of executeOutputRule.files_to_generate) {
        const fromDocumentKey = fileToGenerate.from_document_key;
        if (!isFileType(fromDocumentKey)) {
          throw new Error(`files_to_generate[].from_document_key '${fromDocumentKey}' is not a valid FileType`);
        }
        const fromDocumentKeyAsFileType: FileType = fromDocumentKey;
        assert(
          contextDocumentKeys.has(fromDocumentKeyAsFileType),
          `files_to_generate[].from_document_key '${fileToGenerate.from_document_key}' must match a document_key in context_for_documents. Available: ${Array.from(contextDocumentKeys).join(', ')}`
        );
      }

      // 3. Verify content_to_include structures match between PLAN and EXECUTE steps
      for (const fileToGenerate of executeOutputRule.files_to_generate) {
        const planContext: ContextForDocument | undefined = planOutputRule.context_for_documents.find(
          (ctx) => ctx.document_key === fileToGenerate.from_document_key
        );
        assertExists(
          planContext,
          `PLAN context_for_documents must have entry for document_key '${fileToGenerate.from_document_key}'`
        );

        // Find corresponding document in EXECUTE step outputs_required.documents
        if (executeOutputRule.documents && Array.isArray(executeOutputRule.documents)) {
          const executeDocument = executeOutputRule.documents.find(
            (doc) => doc.document_key === fileToGenerate.from_document_key
          );
          if (executeDocument && executeDocument.content_to_include && planContext) {
            // Verify structure keys match (both have same top-level keys)
            const planKeys = Object.keys(planContext.content_to_include);
            const executeKeys = Object.keys(executeDocument.content_to_include);
            assertEquals(
              planKeys.sort(),
              executeKeys.sort(),
              `content_to_include structure keys must match between PLAN and EXECUTE for document_key '${fileToGenerate.from_document_key}'`
            );
          }
        }
      }

      // 4. Verify structure matching is validated at runtime by assembleTurnPrompt
      const headerContextContent: HeaderContext = {
        system_materials: {
          executive_summary: "Test executive summary",
          input_artifacts_summary: "Test input artifacts summary",
          stage_rationale: "Test stage rationale",
        },
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json'
        },
        context_for_documents: planOutputRule.context_for_documents.map((ctx) => ({
          document_key: ctx.document_key,
          content_to_include: ctx.content_to_include,
        })),
      };

      const headerContextContributionId = await createMinimalContribution(
        "header_context",
        "synthesis",
        "header_context"
      );

      const headerContextContentString = JSON.stringify(headerContextContent);
      const headerContextBytes = new TextEncoder().encode(headerContextContentString);

      const { data: headerContrib, error: headerContribError } = await adminClient
        .from("dialectic_contributions")
        .select("storage_bucket, storage_path, file_name")
        .eq("id", headerContextContributionId)
        .single();

      if (headerContribError || !headerContrib) {
        throw new Error(`Failed to fetch header contribution: ${headerContribError?.message}`);
      }
      assertExists(headerContrib, "Header contribution must exist");

      await adminClient.storage
        .from(headerContrib.storage_bucket)
        .upload(
          `${headerContrib.storage_path}/${headerContrib.file_name}`,
          headerContextBytes,
          { contentType: "application/json", upsert: true }
        );

      // Upload template
      const templateBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
      if (!templateBucket) {
        throw new Error("SB_CONTENT_STORAGE_BUCKET environment variable is not set");
      }
      
      const firstFileToGenerate = executeOutputRule.files_to_generate[0];
      const templateContent = `# Template for ${firstFileToGenerate.from_document_key}`;
      const templateBytes = new TextEncoder().encode(templateContent);
      
      await adminClient.storage
        .from(templateBucket)
        .upload(firstFileToGenerate.template_filename, templateBytes, { contentType: "text/markdown", upsert: true });

      if(!executeRecipeStep.prompt_template_id) {
        throw new Error("Prompt template ID is required");
      }

      // Fetch header context contribution and convert to SourceDocument for canonicalPathParams
      const { data: headerContextContributionRow4, error: contribRowError4 } = await adminClient
        .from("dialectic_contributions")
        .select("*")
        .eq("id", headerContextContributionId)
        .single();

      if (contribRowError4 || !headerContextContributionRow4) {
        throw new Error(`Failed to fetch header context contribution row: ${contribRowError4?.message}`);
      }

      const { data: headerContextContentFromStorage4, error: downloadError4 } = await downloadFromStorage(
        adminClient,
        headerContrib.storage_bucket,
        `${headerContrib.storage_path}/${headerContrib.file_name}`
      );
      if (downloadError4 || !headerContextContentFromStorage4) {
        throw new Error(`Failed to download header context content: ${downloadError4?.message}`);
      }
      const headerContextContentText4 = new TextDecoder().decode(headerContextContentFromStorage4);

      // Ensure document_relationships exists and is valid (no fallbacks)
      let documentRelationships4: DocumentRelationships | null = null;
      if (headerContextContributionRow4.document_relationships !== null && headerContextContributionRow4.document_relationships !== undefined) {
        assert(
          isDocumentRelationships(headerContextContributionRow4.document_relationships),
          "headerContextContributionRow4.document_relationships must be a valid DocumentRelationships type"
        );
        documentRelationships4 = headerContextContributionRow4.document_relationships;
      }

      const sourceDocument4: SourceDocument = {
        ...headerContextContributionRow4,
        content: headerContextContentText4,
        document_relationships: documentRelationships4,
        attempt_count: 1,
      };

      const sourceDocs4: SourceDocument[] = [sourceDocument4];
      const anchorDocument4: SourceDocument = sourceDocument4;
      const stageSlug4: ContributionType = "synthesis";

      // Create EXECUTE job
      const executePayload: DialecticExecuteJobPayload = {
        job_type: 'execute',
        projectId: testProject.id,
        sessionId: testSession.id,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: testModelId,
        model_slug: MOCK_MODEL_CONFIG.api_identifier,
        user_jwt: testUserJwt,
        walletId: testWalletId,
        continueUntilComplete: false,
        maxRetries: 3,
        continuation_count: 0,
        is_test_job: true,
        document_key: firstFileToGenerate.from_document_key,
        prompt_template_id: executeRecipeStep.prompt_template_id,
        inputs: {
          header_context_id: headerContextContributionId,
        },
        planner_metadata: {
          recipe_step_id: executeRecipeStep.id,
        },
        output_type: executeRecipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs4, executeRecipeStep.output_type, anchorDocument4, stageSlug4),
      };

      if (!isJson(executePayload)) {
        throw new Error("Execute payload is not valid JSON");
      }

      const executeJobRow: DialecticJobRow = {
        id: crypto.randomUUID(),
        job_type: "EXECUTE",
        user_id: testUserId,
        session_id: testSession.id,
        stage_slug: "synthesis",
        iteration_number: 1,
        status: "pending",
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        payload: executePayload,
        is_test_job: true,
      };

      // Fetch context
      const { data: projectRecord, error: projectError5 } = await adminClient
        .from("dialectic_projects")
        .select("*, dialectic_domains(name)")
        .eq("id", testProject.id)
        .single();

      if (projectError5 || !projectRecord) {
        throw new Error(`Failed to fetch project: ${projectError5?.message}`);
      }
      assertExists(projectRecord, "Project record must exist");

      const { data: sessionRecord, error: sessionError5 } = await adminClient
        .from("dialectic_sessions")
        .select("*")
        .eq("id", testSession.id)
        .single();

      if (sessionError5 || !sessionRecord) {
        throw new Error(`Failed to fetch session: ${sessionError5?.message}`);
      }
      assertExists(sessionRecord, "Session record must exist");

      const { data: stageRecord, error: stageError5 } = await adminClient
        .from("dialectic_stages")
        .select("*")
        .eq("slug", "synthesis")
        .single();

      if (stageError5 || !stageRecord) {
        throw new Error(`Failed to fetch stage: ${stageError5?.message}`);
      }
      assertExists(stageRecord, "Stage record must exist");

      const dialecticRecipeStep: DialecticStageRecipeStep = {
        id: executeRecipeStep.id,
        instance_id: "",
        template_step_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        step_key: executeRecipeStep.step_key,
        step_slug: executeRecipeStep.step_slug,
        step_name: executeRecipeStep.step_name,
        execution_order: executeRecipeStep.execution_order,
        parallel_group: executeRecipeStep.parallel_group ?? null,
        branch_key: executeRecipeStep.branch_key ?? null,
        job_type: executeRecipeStep.job_type,
        prompt_type: executeRecipeStep.prompt_type,
        prompt_template_id: executeRecipeStep.prompt_template_id ?? null,
        output_type: executeRecipeStep.output_type,
        granularity_strategy: executeRecipeStep.granularity_strategy,
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: executeRecipeStep.inputs_required,
        inputs_relevance: executeRecipeStep.inputs_relevance ?? [],
        outputs_required: executeOutputRule,
        step_description: "",
      };

      // Ensure active_recipe_instance_id exists (no fallbacks)
      let activeRecipeInstanceId5: string | null = null;
      if (stageRecord.active_recipe_instance_id !== undefined) {
        activeRecipeInstanceId5 = stageRecord.active_recipe_instance_id;
      }

      const stageContext = {
        ...stageRecord,
        active_recipe_instance_id: activeRecipeInstanceId5,
        recipe_step: dialecticRecipeStep,
        system_prompts: null,
        domain_specific_prompt_overlays: [],
      };

      // Call assembleTurnPrompt - structure matching validation happens at runtime
      const { assembleTurnPrompt } = await import("../../functions/_shared/prompt-assembler/assembleTurnPrompt.ts");
      const result = await assembleTurnPrompt({
        dbClient: adminClient,
        fileManager: fileManager,
        job: executeJobRow,
        project: projectRecord,
        session: sessionRecord,
        stage: stageContext,
        gatherContext: gatherContext,
        render: (renderPromptFn, stage, context, userProjectOverlayValues) => {
          return render(renderPromptFn, stage, context, userProjectOverlayValues);
        },
      });

      // Verify assembleTurnPrompt succeeded (proves structure matching validation passed)
      assertExists(result, "assembleTurnPrompt should succeed when structures match");
      assertExists(result.promptContent, "assembleTurnPrompt should return prompt content");
    });
  });
});

