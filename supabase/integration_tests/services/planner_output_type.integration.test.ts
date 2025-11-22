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
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { getStageRecipe } from "../../functions/dialectic-service/getStageRecipe.ts";
import { planComplexStage } from "../../functions/dialectic-worker/task_isolator.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { getGranularityPlanner } from "../../functions/dialectic-worker/strategies/granularity.strategies.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { isModelContributionFileType } from "../../functions/_shared/utils/type-guards/type_guards.file_manager.ts";
import { isDialecticExecuteJobPayload } from "../../functions/_shared/utils/type_guards.ts";
import { isDialecticStageRecipeStep, isOutputRule } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
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
    
    // Map documentKey to FileType by finding the enum key where the value matches
    // This avoids typecasting and uses proper type guards
    const enumKey = Object.keys(FileType).find(
      (key): key is keyof typeof FileType => {
        const value = FileType[key as keyof typeof FileType];
        return value === documentKey;
      }
    );
    
    if (!enumKey) {
      throw new Error(`Invalid documentKey '${documentKey}': does not map to any FileType enum value`);
    }
    
    const fileTypeValue = FileType[enumKey];
    
    // Use type guard to ensure fileType is valid and is a ModelContributionFileType
    if (!isFileType(fileTypeValue)) {
      throw new Error(`Invalid fileType value for documentKey '${documentKey}': ${String(fileTypeValue)}`);
    }
    
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
   * Test helper that creates minimal contributions and tests planComplexStage
   */
  async function testPlannerWithRecipeStep(
    stageSlug: string,
    stepSlug: string,
    granularityStrategy: string,
    sourceDocumentSpecs: Array<{ contributionType: ContributionType; documentKey: string; sourceGroup?: string }>,
  ): Promise<{ recipeStep: StageRecipeStepDto; childJobs: DialecticJobRow[] }> {
    // 1. Fetch real recipe steps from database
    const recipeResult = await getStageRecipe({ stageSlug }, adminClient);
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
    // These will be found by findSourceDocuments when planComplexStage runs
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

    // 7. Convert StageRecipeStepDto to DialecticStageRecipeStep for planComplexStage
    // StageRecipeStepDto has outputs_required as OutputRule[], but DialecticStageRecipeStep needs OutputRule (single)
    // We'll use the first element from the array
    if (!recipeStep.outputs_required || recipeStep.outputs_required.length === 0) {
      throw new Error(`Recipe step '${stepSlug}' has no outputs_required`);
    }
    const singleOutputRule = recipeStep.outputs_required[0];
    if (!isOutputRule(singleOutputRule)) {
      throw new Error(`Recipe step '${stepSlug}' outputs_required[0] is not a valid OutputRule`);
    }
    
    // Construct DialecticStageRecipeStep from StageRecipeStepDto
    const dialecticRecipeStep: DialecticStageRecipeStep = {
      id: recipeStep.id,
      instance_id: "", // Not available in DTO, but planComplexStage may not need it
      template_step_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      step_key: recipeStep.step_key,
      step_slug: recipeStep.step_slug,
      step_name: recipeStep.step_name,
      execution_order: recipeStep.execution_order,
      parallel_group: recipeStep.parallel_group ?? null,
      branch_key: recipeStep.branch_key ?? null,
      job_type: recipeStep.job_type,
      prompt_type: recipeStep.prompt_type,
      prompt_template_id: recipeStep.prompt_template_id ?? null,
      output_type: recipeStep.output_type,
      granularity_strategy: recipeStep.granularity_strategy,
      config_override: {},
      is_skipped: false,
      object_filter: {},
      output_overrides: {},
      inputs_required: recipeStep.inputs_required,
      inputs_relevance: recipeStep.inputs_relevance ?? [],
      outputs_required: singleOutputRule,
      step_description: "",
    };
    
    // Verify the constructed step is valid using type guard
    if (!isDialecticStageRecipeStep(dialecticRecipeStep)) {
      throw new Error(`Failed to construct valid DialecticStageRecipeStep from StageRecipeStepDto for step '${stepSlug}'`);
    }

    // 8. Create PLAN job
    const planJob = createPlanJob(recipeStep, stageSlug);

    // 9. Call planComplexStage
    // findSourceDocuments will query the database and find our minimal contributions
    const childJobs = await planComplexStage(
      adminClient,
      planJob,
      testDeps,
      dialecticRecipeStep,
      testUserJwt
    );

    // 10. Assert planComplexStage returned an array
    assert(Array.isArray(childJobs), "planComplexStage should return an array");

    // 11. Assert at least one child job was created
    assert(childJobs.length > 0, `planComplexStage should create at least one child job for step '${stepSlug}'`);

    // 12. For each child job, verify critical properties
    for (const childJob of childJobs) {
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
      assertEquals(payload.projectId, planJob.payload.projectId, "Child job projectId should match parent");
      assertEquals(payload.sessionId, planJob.payload.sessionId, "Child job sessionId should match parent");
      assertEquals(payload.stageSlug, planJob.payload.stageSlug, "Child job stageSlug should match parent");
      assertEquals(payload.iterationNumber, planJob.payload.iterationNumber, "Child job iterationNumber should match parent");

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

    return { recipeStep, childJobs };
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

  describe("assembleTurnPrompt with document_key (step 17.b.iii)", () => {
    it("should process EXECUTE job with document_key and find document in headerContext.files_to_generate", async () => {
      // 1. Set up PLAN job, call planner to create EXECUTE jobs with document_key (step 17.b.i)
      const { recipeStep, childJobs } = await testPlannerWithRecipeStep(
        "thesis",
        "generate-business-case",
        "per_source_document",
        [{ contributionType: "header_context", documentKey: "header_context" }]
      );

      // 2. Verify EXECUTE job payloads have document_key set (step 17.b.ii)
      assert(childJobs.length > 0, "Should have at least one child EXECUTE job");
      const firstChildJob = childJobs[0];
      assert(
        isDialecticExecuteJobPayload(firstChildJob.payload),
        "Child job payload should be a valid DialecticExecuteJobPayload"
      );
      if (!isDialecticExecuteJobPayload(firstChildJob.payload)) {
        throw new Error("Child job payload is not a valid DialecticExecuteJobPayload");
      }
      const payload: DialecticExecuteJobPayload = firstChildJob.payload;
      assertExists(
        payload.document_key,
        "EXECUTE job payload should have document_key set"
      );

      // Extract expected document_key from recipe step
      if (!recipeStep.outputs_required || !Array.isArray(recipeStep.outputs_required) || recipeStep.outputs_required.length === 0) {
        throw new Error("Recipe step is missing outputs_required");
      }
      const firstOutputRule = recipeStep.outputs_required[0];
      if (!isOutputRule(firstOutputRule)) {
        throw new Error("Recipe step outputs_required[0] is not a valid OutputRule");
      }
      if (!firstOutputRule.documents || !Array.isArray(firstOutputRule.documents) || firstOutputRule.documents.length === 0) {
        throw new Error("Recipe step outputs_required[0].documents is not a non-empty array");
      }
      const expectedDocumentKey = firstOutputRule.documents[0].document_key;
      assertExists(
        expectedDocumentKey,
        "Recipe step should have document_key in outputs_required.documents[0].document_key"
      );

      assertEquals(
        payload.document_key,
        expectedDocumentKey,
        `EXECUTE job payload document_key should match recipe step outputs_required.documents[0].document_key`
      );

      // 3. Create header context contribution with files_to_generate containing the document_key (step 17.b.iii)
      const headerContextContent = {
        system_materials: {
          shared_plan: "Test shared plan for document_key verification"
        },
        files_to_generate: [
          {
            document_key: expectedDocumentKey,
            template_filename: "test_template.md"
          }
        ]
      };

      const headerContextContributionId = await createMinimalContribution(
        "header_context",
        "thesis",
        "header_context"
      );

      // Update the header context contribution to include the files_to_generate
      const headerContextContentString = JSON.stringify(headerContextContent);
      const headerContextBytes = new TextEncoder().encode(headerContextContentString);

      // Get the contribution record to find its storage path
      const { data: headerContrib, error: contribFetchError } = await adminClient
        .from("dialectic_contributions")
        .select("storage_bucket, storage_path, file_name")
        .eq("id", headerContextContributionId)
        .single();

      if (contribFetchError || !headerContrib) {
        throw new Error(`Failed to fetch header context contribution: ${contribFetchError?.message}`);
      }

      // Upload the header context content to storage
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

      // 3.5. Upload template file to storage bucket (required by assembleTurnPrompt)
      // assembleTurnPrompt downloads the template from SB_CONTENT_STORAGE_BUCKET
      const templateBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
      if (!templateBucket) {
        throw new Error("SB_CONTENT_STORAGE_BUCKET environment variable is not set - fail loud and hard, no fallbacks");
      }
      
      const templateContent = `# Document Template

## Project Executive Summary

Cover these points:
- Problem
- Solution  
- Market

This is a test template for document generation.`;
      const templateBytes = new TextEncoder().encode(templateContent);
      
      const { data: templateBlob, error: templateUploadError } = await adminClient.storage
        .from(templateBucket)
        .upload("test_template.md", templateBytes, { contentType: "text/markdown", upsert: true });
      
      if (templateUploadError || !templateBlob) {
        throw new Error(`Failed to upload template file to ${templateBucket}: ${templateUploadError?.message}`);
      }

      // 4. Create a DialecticJobRow with the EXECUTE job payload
      // Note: payload.model_id is the slug, but assembleTurnPrompt needs the UUID
      const executePayloadWithInputs = {
        ...payload,
        model_id: testModelId, // Use actual model UUID instead of slug
        inputs: {
          ...payload.inputs,
          header_context_id: headerContextContributionId,
        },
      };

      if (!isJson(executePayloadWithInputs)) {
        throw new Error("Execute payload with inputs is not valid JSON");
      }

      const executeJobRow: DialecticJobRow = {
        id: crypto.randomUUID(),
        job_type: "EXECUTE",
        user_id: testUserId,
        session_id: testSession.id,
        stage_slug: "thesis",
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
        payload: executePayloadWithInputs,
        is_test_job: true,
      };

      // 5. Fetch project context from database
      const { data: projectRecord, error: projectError } = await adminClient
        .from("dialectic_projects")
        .select("*, dialectic_domains(name)")
        .eq("id", testProject.id)
        .single();

      if (projectError || !projectRecord) {
        throw new Error(`Failed to fetch project: ${projectError?.message}`);
      }

      // 6. Fetch session context from database
      const { data: sessionRecord, error: sessionError } = await adminClient
        .from("dialectic_sessions")
        .select("*")
        .eq("id", testSession.id)
        .single();

      if (sessionError || !sessionRecord) {
        throw new Error(`Failed to fetch session: ${sessionError?.message}`);
      }

      // 7. Fetch stage context from database
      const { data: stageRecord, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("*")
        .eq("slug", "thesis")
        .single();

      if (stageError || !stageRecord) {
        throw new Error(`Failed to fetch stage: ${stageError?.message}`);
      }

      // 8. Get recipe step for stage context
      const recipeResult = await getStageRecipe({ stageSlug: "thesis" }, adminClient);
      if (recipeResult.error || !recipeResult.data) {
        throw new Error(`Failed to fetch recipe: ${recipeResult.error?.message}`);
      }

      const foundRecipeStep = recipeResult.data.steps.find(
        (step) => step.step_slug === "generate-business-case" && step.job_type === "EXECUTE"
      );
      if (!foundRecipeStep) {
        throw new Error("Could not find recipe step for assembleTurnPrompt test");
      }
      if (!foundRecipeStep.outputs_required || !Array.isArray(foundRecipeStep.outputs_required) || foundRecipeStep.outputs_required.length === 0) {
        throw new Error("Recipe step is missing outputs_required for assembleTurnPrompt test");
      }
      const recipeOutputRule = foundRecipeStep.outputs_required[0];
      if (!isOutputRule(recipeOutputRule)) {
        throw new Error("Recipe step outputs_required[0] is not a valid OutputRule");
      }

      // Build DialecticRecipeStep for stage context
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

      // 9. Fetch system prompts for stage context
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

      // Build stage context - assembleTurnPrompt doesn't use overlays, so set to empty array
      const stageContext = {
        ...stageRecord,
        recipe_step: dialecticRecipeStep,
        system_prompts: systemPrompt ? { prompt_text: systemPrompt.prompt_text } : null,
        domain_specific_prompt_overlays: [],
      };

      // 10. Import and call assembleTurnPrompt
      const { assembleTurnPrompt } = await import("../../functions/_shared/prompt-assembler/assembleTurnPrompt.ts");

      // Call assembleTurnPrompt - it should successfully find the document in headerContext.files_to_generate
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

      // 11. Verify assembleTurnPrompt succeeded (no error means it found the document)
      assertExists(result, "assembleTurnPrompt should return a result");
      assertExists(
        result.promptContent,
        "assembleTurnPrompt should return prompt content"
      );
      assertExists(
        result.source_prompt_resource_id,
        "assembleTurnPrompt should return source prompt resource id"
      );
    });
  });
});

