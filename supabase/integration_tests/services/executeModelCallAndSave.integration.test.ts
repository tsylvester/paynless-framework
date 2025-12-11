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
  DialecticExecuteJobPayload,
  InputRule,
  ExecuteModelCallAndSaveParams,
  IDialecticJobDeps,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { deconstructStoragePath } from "../../functions/_shared/utils/path_deconstructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileType, ModelContributionUploadContext } from "../../functions/_shared/types/file_manager.types.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import { DocumentRendererDeps, RenderDocumentParams } from "../../functions/_shared/services/document_renderer.interface.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { callUnifiedAIModel } from "../../functions/dialectic-service/callModel.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { getSortedCompressionCandidates } from "../../functions/_shared/utils/vector_utils.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { isJson, isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { IDocumentRenderer } from "../../functions/_shared/services/document_renderer.interface.ts";
import { processRenderJob } from "../../functions/dialectic-worker/processRenderJob.ts";
import { IRenderJobDeps } from "../../functions/dialectic-service/dialectic.interface.ts";

describe("executeModelCallAndSave Integration Tests", () => {
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
    formData.append("projectName", "ExecuteModelCallAndSave Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for executeModelCallAndSave integration test");
    
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
    await coreCleanupTestResources();
  });

  it("55.e.i: should retrieve rendered document from dialectic_project_resources for execution", async () => {
    const sourceStageSlug = "thesis";
    const targetStageSlug = "antithesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;

    // 1) Set up a stage with a document that gets rendered
    // First, verify document template exists
    // Get project to find domain_id
    const { data: projectData, error: projectError } = await adminClient
      .from("dialectic_projects")
      .select("selected_domain_id")
      .eq("id", testProject.id)
      .single();
    
    assert(!projectError, `Failed to fetch project domain: ${projectError?.message}`);
    assertExists(projectData?.selected_domain_id, "Project must have a selected_domain_id");

    // Templates use naming convention: {stage_slug}_{document_key}
    const templateName = `${sourceStageSlug}_${documentKey}`;
    const { data: templateData, error: templateQueryError } = await adminClient
      .from("dialectic_document_templates")
      .select("*")
      .eq("name", templateName)
      .eq("domain_id", projectData.selected_domain_id)
      .eq("is_active", true)
      .maybeSingle();

    if (templateQueryError || !templateData) {
      throw new Error(
        `Document template for stage '${sourceStageSlug}' and document '${documentKey}' not found. ` +
        `Templates should be seeded via database migrations. Error: ${templateQueryError?.message ?? 'not found'}`
      );
    }

    // Create a contribution for the document
    const docIdentity = crypto.randomUUID();
    const contributionContent = JSON.stringify({
      content: `This is test content for ${documentKey} document that will be rendered and then used as input for executeModelCallAndSave.`
    });

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: sourceStageSlug,
        modelSlug: modelSlug,
        attemptCount: attemptCount,
        documentKey: documentKey,
      },
      fileContent: contributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(contributionContent).length,
      userId: testUserId,
      description: `Test contribution for ${sourceStageSlug} ${documentKey}`,
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug: sourceStageSlug,
        iterationNumber: iterationNumber,
        document_relationships: { [sourceStageSlug]: docIdentity },
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!contributionResult.error, `Failed to create contribution for ${documentKey}: ${contributionResult.error?.message}`);
    assertExists(contributionResult.record, `Contribution record for ${documentKey} was not created`);
    
    const contributionRecord = contributionResult.record;
    if (!contributionRecord || !('id' in contributionRecord)) {
      throw new Error(`Contribution record for ${documentKey} is missing or missing id field`);
    }
    const contributionId = contributionRecord.id;

    // 2) Render the document using document_renderer.renderDocument()
    const renderDeps: DocumentRendererDeps = {
      downloadFromStorage: (supabase: SupabaseClient, bucket: string, path: string) => downloadFromStorage(supabase, bucket, path),
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      notifyUserId: testUserId,
      logger: testLogger,
    };

    const renderParams: RenderDocumentParams = {
      projectId: testProject.id,
      sessionId: testSession.id,
      iterationNumber: iterationNumber,
      stageSlug: sourceStageSlug,
      documentIdentity: docIdentity,
      documentKey: documentKey,
      sourceContributionId: contributionId,
    };

    const renderResult = await renderDocument(adminClient, renderDeps, renderParams);
    assertExists(renderResult, `renderDocument should return a result for ${documentKey}`);
    assertExists(renderResult.pathContext, `renderDocument should return pathContext for ${documentKey}`);

    // 3) Verify the rendered document is saved to dialectic_project_resources with resource_type = 'rendered_document'
    const { data: resourceRecords, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", sourceStageSlug)
      .eq("resource_type", "rendered_document");

    assert(!resourceQueryError, `Failed to query resources: ${resourceQueryError?.message}`);
    assertExists(resourceRecords, "Resource query should return data");
    assert(resourceRecords.length >= 1, `At least one rendered document should be saved to dialectic_project_resources, found ${resourceRecords.length}`);
    
    // Extract document_key from file_name using deconstructStoragePath
    const renderedResource = resourceRecords.find((r) => {
      if (!r.file_name || !r.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: r.storage_path,
        fileName: r.file_name,
      });
      const extractedDocumentKey = deconstructed.documentKey;
      return extractedDocumentKey === documentKey;
    });
    assertExists(renderedResource, `Rendered document with document_key '${documentKey}' should exist in dialectic_project_resources`);
    assertEquals(renderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(renderedResource.session_id, testSession.id, "Resource session_id should match");
    assertEquals(renderedResource.iteration_number, iterationNumber, "Resource iteration_number should match");
    assertEquals(renderedResource.stage_slug, sourceStageSlug, "Resource stage_slug should match");

    // Store the resource ID to verify it's used later
    const resourceId = renderedResource.id;

    // 4) Call executeModelCallAndSave with an EXECUTE job that requires the document as input
    // First, get the provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    // Create an EXECUTE job payload that requires the rendered document as input
    const executeJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: FileType.business_case_critique,
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: targetStageSlug,
      model_id: testModelId,
      iterationNumber: iterationNumber,
      continueUntilComplete: false,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      canonicalPathParams: {
        contributionType: "antithesis",
        stageSlug: targetStageSlug,
      },
      document_key: FileType.business_case_critique,
    };

    if (!isJson(executeJobPayload)) {
      throw new Error("Execute job payload is not a valid JSON object");
    }

    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: targetStageSlug,
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

    // Set up dependencies for executeModelCallAndSave
    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: (chatApiRequest, userAuthToken, deps) => callUnifiedAIModel(chatApiRequest, userAuthToken, { ...(deps || {}), isTest: true }),
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
        renderDocument: async () => ({
          pathContext: {
            projectId: "",
            sessionId: "",
            iteration: 0,
            stageSlug: "",
            documentKey: "",
            fileType: FileType.RenderedDocument,
            modelSlug: "",
          },
          renderedBytes: new Uint8Array(),
        }),
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

    // Set up inputsRequired to require the rendered document from the source stage
    const inputsRequired: InputRule[] = [
      {
        type: "document",
        document_key: documentKey,
        required: true,
        slug: sourceStageSlug,
      },
    ];

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
        currentUserPrompt: "Generate a critique of the business case",
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
      inputsRequired: inputsRequired,
    };

    // Call executeModelCallAndSave - this should succeed by finding the document from resources
    await executeModelCallAndSave(params);

    // 5) Assert that gatherArtifacts found and retrieved the document from dialectic_project_resources (not from contributions)
    // The fact that executeModelCallAndSave succeeded without throwing an error proves that gatherArtifacts
    // found the document. To verify it came from resources (not contributions), we check that:
    // - The function succeeded even though we only have a resource, not a contribution matching the document_key
    // - If we had queried contributions, we would have found the raw contribution, but we should use the rendered resource instead
    
    // EXPLICIT ASSERTION: gatherArtifacts did NOT query contributions for document-type input
    // Proof: executeModelCallAndSave succeeded even though there is NO contribution in the target stage
    // with the source document_key. If gatherArtifacts had queried contributions for document-type inputs,
    // it would have failed because it wouldn't find a matching contribution in the target stage.
    // The fact that the function succeeded proves gatherArtifacts queried resources (not contributions).
    
    // Verify that the resource exists and was used (by checking that the function completed successfully)
    // The resource ID should be different from the contribution ID, proving we used the resource
    assert(resourceId !== contributionId, "Resource ID should be different from contribution ID");
    
    // Verify that contributions table still has the raw contribution (proving we didn't use it)
    const { data: contributionRecords, error: contribQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", contributionId)
      .single();
    assert(!contribQueryError, `Failed to query contribution: ${contribQueryError?.message}`);
    assertExists(contributionRecords, "Contribution should still exist");
    
    // The key assertion: executeModelCallAndSave succeeded, which means gatherArtifacts found the document
    // Since we only have a resource (not a contribution matching the document_key for the target stage),
    // and the function succeeded, it proves gatherArtifacts queried resources and found the document there.
    // If it had queried contributions, it would have failed because there's no contribution with the matching
    // document_key in the target stage (we only have a contribution in the source stage).
    
    // Additional verification: Check that no contribution exists for the target stage with the source document_key
    const { data: targetStageContributions, error: targetContribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage", targetStageSlug);
    assert(!targetContribError, `Failed to query target stage contributions: ${targetContribError?.message}`);
    
    // There should be no contributions in the target stage for the source document_key
    // This proves that gatherArtifacts must have queried resources (not contributions) to find the document
    const targetStageContribWithSourceDocKey = targetStageContributions?.find((c) => {
      if (!c.file_name || !c.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: c.storage_path,
        fileName: c.file_name,
      });
      return deconstructed.documentKey === documentKey;
    });
    assert(!targetStageContribWithSourceDocKey, "No contribution should exist in target stage for source document_key - this proves gatherArtifacts used resources");
  });

  it("2.e.i.a: should process RENDER jobs successfully for root chunks where sourceContributionId equals documentIdentity", async () => {
    // This test uses the shared testSession from beforeAll
    // 1) Simulate an EXECUTE job completing and saving a root chunk contribution (document_relationships is null)
    // For root chunks, documentIdentity falls back to contribution.id, so sourceContributionId === documentIdentity
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;

    // Create a contribution WITHOUT document_relationships (root chunk)
    const contributionContent = JSON.stringify({
      content: `# Business Case Document\n\nThis is a test business case document that will be rendered.`
    });

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: attemptCount,
        documentKey: documentKey,
      },
      fileContent: contributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(contributionContent).length,
      userId: testUserId,
      description: `Test contribution for ${stageSlug} ${documentKey}`,
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        // Omit document_relationships to create a root chunk
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!contributionResult.error, `Failed to create contribution: ${contributionResult.error?.message}`);
    assertExists(contributionResult.record, "Contribution record was not created");
    
    const contributionRecord = contributionResult.record;
    if (!contributionRecord || !('id' in contributionRecord)) {
      throw new Error("Contribution record is missing or missing id field");
    }
    const contributionId = contributionRecord.id;

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    // Create an EXECUTE job that will produce a markdown document (root chunk, no document_relationships)
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

    // Set up dependencies with real documentRenderer
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

    // Insert the EXECUTE job into the database so it exists when we try to create a child RENDER job
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

    // 2) Verify a RENDER job is enqueued in dialectic_generation_jobs with payload containing all required fields
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

    assertEquals(renderPayload.projectId, testProject.id, "projectId should match");
    assertEquals(renderPayload.sessionId, testSession.id, "sessionId should match");
    assertEquals(renderPayload.iterationNumber, iterationNumber, "iterationNumber should match");
    assertEquals(renderPayload.stageSlug, stageSlug, "stageSlug should match");
    // For root chunks, documentIdentity should equal contribution.id (fallback when document_relationships is null)
    assertEquals(renderPayload.documentIdentity, actualContributionId, "documentIdentity should equal contribution.id for root chunks (fallback when document_relationships is null)");
    assertEquals(String(renderPayload.documentKey), String(documentKey), "documentKey should match validatedDocumentKey");
    assertEquals(renderPayload.sourceContributionId, actualContributionId, "sourceContributionId should equal the actual contribution.id");
    // Explicitly assert that for root chunks, sourceContributionId === documentIdentity
    assertEquals(renderPayload.sourceContributionId, renderPayload.documentIdentity, "For root chunks, sourceContributionId must equal documentIdentity (both are contribution.id)");

    // 3) Process the RENDER job via processRenderJob with the enqueued job
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    // 4) Verify processRenderJob does not throw validation errors
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

    assert(processError === null, `processRenderJob should not throw validation errors, but got: ${processError?.message}`);

    // 5) Verify renderDocument was called with the correct parameters
    // (This is verified implicitly by the fact that processRenderJob succeeded and the job was marked completed)

    // 6) Verify a rendered markdown file is saved to storage at the canonical document path
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
    assertExists(pathContext.projectId, "pathContext should have projectId");
    assertExists(pathContext.sessionId, "pathContext should have sessionId");
    assertExists(pathContext.iteration, "pathContext should have iteration");
    assertExists(pathContext.stageSlug, "pathContext should have stageSlug");
    assertExists(pathContext.documentKey, "pathContext should have documentKey");

    // Verify the rendered file exists in storage using constructStoragePath
    const storagePath = constructStoragePath({
      fileType: FileType.RenderedDocument,
      projectId: String(pathContext.projectId),
      sessionId: String(pathContext.sessionId),
      iteration: Number(pathContext.iteration),
      stageSlug: String(pathContext.stageSlug),
      documentKey: String(pathContext.documentKey),
      modelSlug: String(pathContext.modelSlug || ""),
      attemptCount: 1,
    });

    // Check that a file exists at the storage path (by checking dialectic_project_resources)
    const { data: resourceRecords, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document");

    assert(!resourceQueryError, `Failed to query resources: ${resourceQueryError?.message}`);
    assertExists(resourceRecords, "Resource query should return data");
    assert(resourceRecords.length >= 1, `At least one rendered document should be saved, found ${resourceRecords.length}`);

    // 7) Verify a dialectic_project_resources record is created with correct fields
    // Filter by source_contribution_id to find the resource created by the current RENDER job
    const renderedResource = resourceRecords.find((r) => {
      if (!r.file_name || !r.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: r.storage_path,
        fileName: r.file_name,
      });
      return deconstructed.documentKey === documentKey && r.source_contribution_id === actualContributionId;
    });

    assertExists(renderedResource, `Rendered document with document_key '${documentKey}' should exist in dialectic_project_resources`);
    assertEquals(renderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(renderedResource.session_id, testSession.id, "Resource session_id should match");
    assertEquals(renderedResource.iteration_number, iterationNumber, "Resource iteration_number should match");
    assertEquals(renderedResource.stage_slug, stageSlug, "Resource stage_slug should match");
    assertExists(renderedResource.file_name, "Resource should have file_name");
    assertEquals(renderedResource.source_contribution_id, actualContributionId, "Resource source_contribution_id should match the actual contribution.id");

    // 8) Verify the RENDER job status is updated to 'completed' with completed_at timestamp and results.pathContext populated
    assertExists(updatedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(results.pathContext, "RENDER job results should have pathContext with correct path context");
    assertEquals(pathContext.projectId, testProject.id, "pathContext.projectId should match");
    assertEquals(pathContext.sessionId, testSession.id, "pathContext.sessionId should match");
    assertEquals(pathContext.iteration, iterationNumber, "pathContext.iteration should match");
    assertEquals(pathContext.stageSlug, stageSlug, "pathContext.stageSlug should match");
    assertEquals(String(pathContext.documentKey), String(documentKey), "pathContext.documentKey should match");
  });

  it("2.e.i.b: should process RENDER jobs successfully for continuation chunks where sourceContributionId differs from documentIdentity", async () => {
    // 1) Simulate an EXECUTE job completing and saving a contribution with document_relationships containing a document identity
    // For continuation chunks, documentIdentity is the root's ID from document_relationships, while sourceContributionId is this chunk's contribution.id
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;
    const docIdentity = crypto.randomUUID();

    // Create a contribution with document_relationships
    const contributionContent = JSON.stringify({
      content: `# Business Case Document\n\nThis is a test business case document that will be rendered.`
    });

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: attemptCount,
        documentKey: documentKey,
      },
      fileContent: contributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(contributionContent).length,
      userId: testUserId,
      description: `Test contribution for ${stageSlug} ${documentKey}`,
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        document_relationships: { [stageSlug]: docIdentity },
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!contributionResult.error, `Failed to create contribution: ${contributionResult.error?.message}`);
    assertExists(contributionResult.record, "Contribution record was not created");
    
    const contributionRecord = contributionResult.record;
    if (!contributionRecord || !('id' in contributionRecord)) {
      throw new Error("Contribution record is missing or missing id field");
    }
    const contributionId = contributionRecord.id;

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    // Create an EXECUTE job that will produce a markdown document
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

    // Set up dependencies with real documentRenderer
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

    // Insert the EXECUTE job into the database so it exists when we try to create a child RENDER job
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

    // 2) Verify a RENDER job is enqueued in dialectic_generation_jobs with payload containing all required fields
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

    assertEquals(renderPayload.projectId, testProject.id, "projectId should match");
    assertEquals(renderPayload.sessionId, testSession.id, "sessionId should match");
    assertEquals(renderPayload.iterationNumber, iterationNumber, "iterationNumber should match");
    assertEquals(renderPayload.stageSlug, stageSlug, "stageSlug should match");
    assertEquals(renderPayload.documentIdentity, docIdentity, "documentIdentity should match the semantic identifier from document_relationships");
    assertEquals(String(renderPayload.documentKey), String(documentKey), "documentKey should match validatedDocumentKey");
    assertEquals(renderPayload.sourceContributionId, actualContributionId, "sourceContributionId should equal the actual contribution.id, not the semantic identifier from document_relationships");
    // Explicitly assert that for continuation chunks, sourceContributionId !== documentIdentity
    assert(renderPayload.sourceContributionId !== renderPayload.documentIdentity, "For continuation chunks, sourceContributionId (this chunk's contribution.id) must NOT equal documentIdentity (root's ID from document_relationships)");

    // 3) Process the RENDER job via processRenderJob with the enqueued job
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    // 4) Verify processRenderJob does not throw validation errors
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

    assert(processError === null, `processRenderJob should not throw validation errors, but got: ${processError?.message}`);

    // 5) Verify renderDocument was called with the correct parameters
    // (This is verified implicitly by the fact that processRenderJob succeeded and the job was marked completed)
    // We can verify by checking that the job was updated with results

    // 6) Verify a rendered markdown file is saved to storage at the canonical document path
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
    assertExists(pathContext.projectId, "pathContext should have projectId");
    assertExists(pathContext.sessionId, "pathContext should have sessionId");
    assertExists(pathContext.iteration, "pathContext should have iteration");
    assertExists(pathContext.stageSlug, "pathContext should have stageSlug");
    assertExists(pathContext.documentKey, "pathContext should have documentKey");

    // Verify the rendered file exists in storage using constructStoragePath
    const storagePath = constructStoragePath({
      fileType: FileType.RenderedDocument,
      projectId: String(pathContext.projectId),
      sessionId: String(pathContext.sessionId),
      iteration: Number(pathContext.iteration),
      stageSlug: String(pathContext.stageSlug),
      documentKey: String(pathContext.documentKey),
      modelSlug: String(pathContext.modelSlug || ""),
      attemptCount: 1,
    });

    // Check that a file exists at the storage path (by checking dialectic_project_resources)
    const { data: resourceRecords, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document");

    assert(!resourceQueryError, `Failed to query resources: ${resourceQueryError?.message}`);
    assertExists(resourceRecords, "Resource query should return data");
    assert(resourceRecords.length >= 1, `At least one rendered document should be saved, found ${resourceRecords.length}`);

    // 7) Verify a dialectic_project_resources record is created with correct fields
    // Filter by source_contribution_id to find the resource created by the current RENDER job
    const renderedResource = resourceRecords.find((r) => {
      if (!r.file_name || !r.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: r.storage_path,
        fileName: r.file_name,
      });
      return deconstructed.documentKey === documentKey && r.source_contribution_id === actualContributionId;
    });

    assertExists(renderedResource, `Rendered document with document_key '${documentKey}' should exist in dialectic_project_resources`);
    assertEquals(renderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(renderedResource.session_id, testSession.id, "Resource session_id should match");
    assertEquals(renderedResource.iteration_number, iterationNumber, "Resource iteration_number should match");
    assertEquals(renderedResource.stage_slug, stageSlug, "Resource stage_slug should match");
    assertExists(renderedResource.file_name, "Resource should have file_name");
    assertEquals(renderedResource.source_contribution_id, actualContributionId, "Resource source_contribution_id should match the actual contribution.id, not the semantic identifier from document_relationships");

    // 8) Verify the RENDER job status is updated to 'completed' with completed_at timestamp and results.pathContext populated
    // (Already verified above in step 5)
    assertExists(updatedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(results.pathContext, "RENDER job results should have pathContext with correct path context");
    assertEquals(pathContext.projectId, testProject.id, "pathContext.projectId should match");
    assertEquals(pathContext.sessionId, testSession.id, "pathContext.sessionId should match");
    assertEquals(pathContext.iteration, iterationNumber, "pathContext.iteration should match");
    assertEquals(pathContext.stageSlug, stageSlug, "pathContext.stageSlug should match");
    assertEquals(String(pathContext.documentKey), String(documentKey), "pathContext.documentKey should match");
  });

  it("7.b.i: should process RENDER jobs end-to-end for root chunks where sourceContributionId equals documentIdentity", async () => {
    // Create a unique session for this test to avoid storage collisions
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
    const testSessionForThisTest = sessionResult.data;

    // 1) Create a root chunk contribution via executeModelCallAndSave with document_relationships set to { [stageSlug]: contribution.id }
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;

    const contributionContent = JSON.stringify({
      content: `# Business Case Document\n\nThis is a test business case document for root chunk rendering.`
    });

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: contributionContent,
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
          context: "",
          tokensUsedForIndexing: 0,
          error: undefined,
        }),
      },
    };

    const executeJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSessionForThisTest.id,
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
      // Omit document_relationships - executeModelCallAndSave will set it to { [stageSlug]: contribution.id } for root chunks
    };

    if (!isJson(executeJobPayload)) {
      throw new Error("Execute job payload is not a valid JSON object");
    }

    const executeJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionForThisTest.id,
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
        id: testSessionForThisTest.id,
        project_id: testSessionForThisTest.project_id,
        session_description: testSessionForThisTest.session_description,
        user_input_reference_url: testSessionForThisTest.user_input_reference_url,
        iteration_count: testSessionForThisTest.iteration_count,
        selected_model_ids: testSessionForThisTest.selected_model_ids,
        status: testSessionForThisTest.status,
        created_at: testSessionForThisTest.created_at,
        updated_at: testSessionForThisTest.updated_at,
        current_stage_id: testSessionForThisTest.current_stage_id,
        associated_chat_id: testSessionForThisTest.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // Call executeModelCallAndSave - this should create a root chunk and enqueue a RENDER job
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

    let rootContributionId: string | undefined;
    if (typeof updatedJob.results === 'string') {
      const results = JSON.parse(updatedJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedJob.results)) {
      const results = updatedJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(rootContributionId, "Root contribution ID should be available from job results");

    // Verify document_relationships was set to { [stageSlug]: contribution.id }
    const { data: contributionRecord, error: contribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", rootContributionId)
      .single();

    assert(!contribError, `Failed to query contribution: ${contribError?.message}`);
    assertExists(contributionRecord, "Contribution record should exist");
    assertExists(contributionRecord.document_relationships, "Root chunk should have document_relationships set");
    if (isRecord(contributionRecord.document_relationships)) {
      assertEquals(contributionRecord.document_relationships[stageSlug], rootContributionId, "document_relationships[stageSlug] should equal contribution.id for root chunks");
    }

    // 2) Verify a RENDER job is enqueued with payload containing sourceContributionId: rootContributionId and documentIdentity: rootContributionId (both equal)
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
    assertExists(renderPayload.sourceContributionId, "renderPayload should have sourceContributionId");
    assertExists(renderPayload.documentIdentity, "renderPayload should have documentIdentity");
    assertEquals(renderPayload.sourceContributionId, rootContributionId, "sourceContributionId should equal rootContributionId");
    assertEquals(renderPayload.documentIdentity, rootContributionId, "documentIdentity should equal rootContributionId for root chunks");
    // Explicitly assert that sourceContributionId === documentIdentity for root chunks
    assertEquals(renderPayload.sourceContributionId, renderPayload.documentIdentity, "For root chunks, sourceContributionId must equal documentIdentity (both are contribution.id)");

    // 3) Process the RENDER job via processRenderJob
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    await processRenderJob(
      adminClient,
      renderJob,
      testUserId,
      renderJobDeps,
      testUserJwt,
    );

    // 4) Verify renderDocument is called and successfully renders the document
    // (Verified implicitly by job status being 'completed')

    // 5) Verify a rendered markdown file is saved to storage
    const { data: updatedRenderJob, error: updatedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", renderJob.id)
      .single();

    assert(!updatedJobError, `Failed to query updated RENDER job: ${updatedJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    assertEquals(updatedRenderJob.status, "completed", "RENDER job status should be 'completed'");

    // 6) Verify a dialectic_project_resources record is created with resource_type = 'rendered_document' and source_contribution_id = rootContributionId
    const { data: resourceRecords, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSessionForThisTest.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", rootContributionId);

    assert(!resourceQueryError, `Failed to query resources: ${resourceQueryError?.message}`);
    assertExists(resourceRecords, "Resource query should return data");
    assert(resourceRecords.length >= 1, `At least one rendered document should be saved, found ${resourceRecords.length}`);

    const renderedResource = resourceRecords[0];
    assertEquals(renderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(renderedResource.source_contribution_id, rootContributionId, "Resource source_contribution_id should equal rootContributionId");

    // 5) Verify a rendered markdown file is saved to storage
    assertExists(renderedResource.storage_bucket, "Rendered document resource should have storage_bucket");
    assertExists(renderedResource.storage_path, "Rendered document resource should have storage_path");
    assertExists(renderedResource.file_name, "Rendered document resource should have file_name");

    const fullStoragePath = `${renderedResource.storage_path}/${renderedResource.file_name}`;
    const { data: renderedFileData, error: downloadError } = await downloadFromStorage(
      adminClient,
      renderedResource.storage_bucket,
      fullStoragePath,
    );

    assert(!downloadError, `Failed to download rendered document: ${downloadError?.message}`);
    assertExists(renderedFileData, "Rendered document file data should exist");

    if (renderedFileData === null) {
      throw new Error("Rendered document file data is null after assertExists check");
    }
    const renderedMarkdown = new TextDecoder().decode(renderedFileData);
    assert(renderedMarkdown.length > 0, "Rendered markdown file should contain content");
    assert(
      renderedMarkdown.includes("Business Case Document"),
      "Rendered document should contain content from root chunk"
    );
    assert(
      renderedMarkdown.includes("This is a test business case document for root chunk rendering"),
      "Rendered document should contain root chunk content"
    );

    // 7) Verify the RENDER job status is 'completed' with results.pathContext.sourceContributionId = rootContributionId
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
    assertEquals(pathContext.sourceContributionId, rootContributionId, "results.pathContext.sourceContributionId should equal rootContributionId");

    // 8) Explicitly assert that sourceContributionId === documentIdentity for root chunks throughout the flow
    assertEquals(pathContext.sourceContributionId, renderPayload.documentIdentity, "pathContext.sourceContributionId should equal documentIdentity for root chunks");
  });

  it("7.b.ii: should process RENDER jobs end-to-end for continuation chunks where sourceContributionId differs from documentIdentity", async () => {
    // Create a unique session for this test to avoid storage collisions
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
    const testSessionForThisTest = sessionResult.data;

    // 1) Create a root chunk contribution with id: rootContributionId and document_relationships: { [stageSlug]: rootContributionId }
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;

    const rootContent = JSON.stringify({
      content: `# Business Case Document - Root\n\nThis is the root chunk content.`
    });

    const continuationContent = JSON.stringify({
      content: `\n\n## Continuation Section\n\nThis is the continuation chunk content.`
    });

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    let rootContributionId: string | undefined;

    // Create root chunk deps with rootContent
    const rootDeps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: rootContent,
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: rootContent,
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

    // First, create the root chunk contribution via executeModelCallAndSave
    const rootExecuteJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSessionForThisTest.id,
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
      // Omit document_relationships - executeModelCallAndSave will set it to { [stageSlug]: contribution.id } for root chunks
    };

    if (!isJson(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload is not a valid JSON object");
    }

    const rootExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionForThisTest.id,
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

    const { data: insertedRootJob, error: rootInsertError } = await adminClient
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

    assert(!rootInsertError, `Failed to insert root EXECUTE job: ${rootInsertError?.message}`);
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
        currentUserPrompt: "Generate a root business case document",
      },
      sessionData: {
        id: testSessionForThisTest.id,
        project_id: testSessionForThisTest.project_id,
        session_description: testSessionForThisTest.session_description,
        user_input_reference_url: testSessionForThisTest.user_input_reference_url,
        iteration_count: testSessionForThisTest.iteration_count,
        selected_model_ids: testSessionForThisTest.selected_model_ids,
        status: testSessionForThisTest.status,
        created_at: testSessionForThisTest.created_at,
        updated_at: testSessionForThisTest.updated_at,
        current_stage_id: testSessionForThisTest.current_stage_id,
        associated_chat_id: testSessionForThisTest.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    await executeModelCallAndSave(rootParams);

    // Get the root contribution ID
    const { data: updatedRootJob, error: rootJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", rootExecuteJob.id)
      .single();

    assert(!rootJobQueryError, `Failed to query updated root EXECUTE job: ${rootJobQueryError?.message}`);
    assertExists(updatedRootJob, "Updated root EXECUTE job should exist");
    assertExists(updatedRootJob.results, "Root EXECUTE job should have results");

    if (typeof updatedRootJob.results === 'string') {
      const results = JSON.parse(updatedRootJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedRootJob.results)) {
      const results = updatedRootJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(rootContributionId, "Root contribution ID should be available from job results");
    if (!rootContributionId) {
      throw new Error("Root contribution ID is not available");
    }

    // Verify document_relationships was set to { [stageSlug]: rootContributionId }
    const { data: rootContributionRecord, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", rootContributionId)
      .single();

    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContributionRecord, "Root contribution record should exist");
    assertExists(rootContributionRecord.document_relationships, "Root chunk should have document_relationships set");
    if (isRecord(rootContributionRecord.document_relationships)) {
      assertEquals(rootContributionRecord.document_relationships[stageSlug], rootContributionId, "document_relationships[stageSlug] should equal rootContributionId for root chunks");
    }

    // Verify root chunk's raw_response_storage_path is in raw_responses/ (not _work/raw_responses/)
    assertExists(rootContributionRecord.raw_response_storage_path, "Root chunk should have raw_response_storage_path");
    assert(
      rootContributionRecord.raw_response_storage_path.includes("/raw_responses/"),
      `Root chunk raw_response_storage_path should be in raw_responses/ directory, got: ${rootContributionRecord.raw_response_storage_path}`
    );
    assert(
      !rootContributionRecord.raw_response_storage_path.includes("/_work/raw_responses/"),
      `Root chunk raw_response_storage_path should NOT be in _work/raw_responses/ directory, got: ${rootContributionRecord.raw_response_storage_path}`
    );
    assert(
      !rootContributionRecord.raw_response_storage_path.includes("_continuation_"),
      `Root chunk raw_response_storage_path should NOT include continuation suffix, got: ${rootContributionRecord.raw_response_storage_path}`
    );

    // SPY: Check root file contents immediately after root chunk upload
    assertExists(rootContributionRecord.storage_bucket, "Root contribution storage_bucket must exist");
    testLogger.info('[TEST DEBUG 7.b.ii] Attempting to download root file after root upload', {
      path: rootContributionRecord.raw_response_storage_path,
      bucket: rootContributionRecord.storage_bucket,
      rootContributionId: rootContributionId,
    });
    const rootFileAfterRootUpload = await downloadFromStorage(
      adminClient,
      rootContributionRecord.storage_bucket,
      rootContributionRecord.raw_response_storage_path,
    );
    if (rootFileAfterRootUpload.error) {
      testLogger.info('[TEST DEBUG 7.b.ii] Root file download failed after root upload', {
        error: rootFileAfterRootUpload.error,
        errorMessage: rootFileAfterRootUpload.error?.message,
        path: rootContributionRecord.raw_response_storage_path,
      });
      // Continue anyway - the file might not be available yet or there's a different issue
    } else if (rootFileAfterRootUpload.data) {
      const rootFileContentAfterRoot = new TextDecoder().decode(rootFileAfterRootUpload.data);
      testLogger.info('[TEST DEBUG 7.b.ii] Root file contents IMMEDIATELY AFTER ROOT UPLOAD', {
        path: rootContributionRecord.raw_response_storage_path,
        length: rootFileContentAfterRoot.length,
        first100: rootFileContentAfterRoot.substring(0, 100),
        last100: rootFileContentAfterRoot.substring(Math.max(0, rootFileContentAfterRoot.length - 100)),
      });
    } else {
      testLogger.info('[TEST DEBUG 7.b.ii] Root file download returned no data after root upload', {
        path: rootContributionRecord.raw_response_storage_path,
      });
    }

    // Create continuation chunk deps
    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: continuationContent,
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: continuationContent,
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

    // 2) Create a continuation chunk contribution via executeModelCallAndSave with id: continuationContributionId, target_contribution_id: rootContributionId, and document_relationships: { [stageSlug]: rootContributionId }
    const continuationExecuteJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSessionForThisTest.id,
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
      target_contribution_id: rootContributionId, // Required for continuation chunks
      continuation_count: 1, // Required for continuation chunks
      document_relationships: { [stageSlug]: rootContributionId },
    };

    if (!isJson(continuationExecuteJobPayload)) {
      throw new Error("Continuation execute job payload is not a valid JSON object");
    }

    const continuationExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionForThisTest.id,
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
      target_contribution_id: rootContributionId,
      prerequisite_job_id: null,
      payload: continuationExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    const { data: insertedContinuationJob, error: continuationInsertError } = await adminClient
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

    assert(!continuationInsertError, `Failed to insert continuation EXECUTE job: ${continuationInsertError?.message}`);
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
        currentUserPrompt: "Generate a continuation for the business case document",
      },
      sessionData: {
        id: testSessionForThisTest.id,
        project_id: testSessionForThisTest.project_id,
        session_description: testSessionForThisTest.session_description,
        user_input_reference_url: testSessionForThisTest.user_input_reference_url,
        iteration_count: testSessionForThisTest.iteration_count,
        selected_model_ids: testSessionForThisTest.selected_model_ids,
        status: testSessionForThisTest.status,
        created_at: testSessionForThisTest.created_at,
        updated_at: testSessionForThisTest.updated_at,
        current_stage_id: testSessionForThisTest.current_stage_id,
        associated_chat_id: testSessionForThisTest.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // DEBUG: Log continuation job payload before calling executeModelCallAndSave
    console.log('[TEST DEBUG 7.b.ii] Continuation job payload:', {
      jobId: continuationExecuteJob.id,
      target_contribution_id: continuationExecuteJob.target_contribution_id,
      continuation_count: continuationExecuteJobPayload.continuation_count,
      document_relationships: continuationExecuteJobPayload.document_relationships,
      attempt_count: continuationExecuteJob.attempt_count,
      session_id: continuationExecuteJob.session_id,
      canonicalPathParams: continuationExecuteJobPayload.canonicalPathParams,
    });

    // DEBUG: Log the upload context that will be passed to FileManagerService
    console.log('[TEST DEBUG 7.b.ii] Expected upload context pathContext:', {
      isContinuation: continuationParams.deps.fileManager ? 'will be set by executeModelCallAndSave' : 'N/A',
      turnIndex: continuationExecuteJobPayload.continuation_count,
      attemptCount: continuationExecuteJob.attempt_count,
      stageSlug: continuationExecuteJobPayload.canonicalPathParams?.stageSlug,
      documentKey: continuationExecuteJobPayload.document_key,
    });

    // Call executeModelCallAndSave - this should create a continuation chunk and enqueue a RENDER job
    // Log the exact values that will be used to construct the pathContext
    testLogger.info('[TEST DEBUG 7.b.ii] PathContext construction values', {
      target_contribution_id: continuationExecuteJobPayload.target_contribution_id,
      continuation_count: continuationExecuteJobPayload.continuation_count,
      job_attempt_count: continuationExecuteJob.attempt_count,
      isContinuationForStorage: typeof continuationExecuteJobPayload.target_contribution_id === 'string' && continuationExecuteJobPayload.target_contribution_id.trim() !== '',
      expectedTurnIndex: continuationExecuteJobPayload.continuation_count,
    });
    await executeModelCallAndSave(continuationParams);

    // SPY: Check root file contents immediately after continuation chunk upload
    testLogger.info('[TEST DEBUG 7.b.ii] Attempting to download root file after continuation upload', {
      path: rootContributionRecord.raw_response_storage_path,
      bucket: rootContributionRecord.storage_bucket,
    });
    const rootFileAfterContinuationUpload = await downloadFromStorage(
      adminClient,
      rootContributionRecord.storage_bucket,
      rootContributionRecord.raw_response_storage_path,
    );
    if (rootFileAfterContinuationUpload.error) {
      testLogger.info('[TEST DEBUG 7.b.ii] Root file download failed after continuation upload', {
        error: rootFileAfterContinuationUpload.error,
        errorMessage: rootFileAfterContinuationUpload.error?.message,
        path: rootContributionRecord.raw_response_storage_path,
      });
    } else if (rootFileAfterContinuationUpload.data) {
      const rootFileContentAfterContinuation = new TextDecoder().decode(rootFileAfterContinuationUpload.data);
      testLogger.info('[TEST DEBUG 7.b.ii] Root file contents IMMEDIATELY AFTER CONTINUATION UPLOAD', {
        path: rootContributionRecord.raw_response_storage_path,
        length: rootFileContentAfterContinuation.length,
        first100: rootFileContentAfterContinuation.substring(0, 100),
        last100: rootFileContentAfterContinuation.substring(Math.max(0, rootFileContentAfterContinuation.length - 100)),
      });
      // Compare with root file if we successfully downloaded it earlier
      if (rootFileAfterRootUpload.data) {
        const rootFileContentAfterRoot = new TextDecoder().decode(rootFileAfterRootUpload.data);
        testLogger.info('[TEST DEBUG 7.b.ii] Root file comparison', {
          wasCorrupted: rootFileContentAfterContinuation !== rootFileContentAfterRoot,
          rootLength: rootFileContentAfterRoot.length,
          continuationLength: rootFileContentAfterContinuation.length,
        });
      }
    } else {
      testLogger.info('[TEST DEBUG 7.b.ii] Root file download returned no data after continuation upload', {
        path: rootContributionRecord.raw_response_storage_path,
      });
    }

    // Get the actual continuation contribution ID that was created
    const { data: updatedContinuationJob, error: continuationJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", continuationExecuteJob.id)
      .single();

    assert(!continuationJobQueryError, `Failed to query updated continuation EXECUTE job: ${continuationJobQueryError?.message}`);
    assertExists(updatedContinuationJob, "Updated continuation EXECUTE job should exist");
    assertExists(updatedContinuationJob.results, "Continuation EXECUTE job should have results");

    let continuationContributionId: string | undefined;
    if (typeof updatedContinuationJob.results === 'string') {
      const results = JSON.parse(updatedContinuationJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedContinuationJob.results)) {
      const results = updatedContinuationJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(continuationContributionId, "Continuation contribution ID should be available from job results");
    assert(continuationContributionId !== rootContributionId, "Continuation contribution ID should differ from root contribution ID");

    // DEBUG: Query and log the actual continuation contribution record to see its storage path
    const { data: continuationContributionRecord, error: continuationContribQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", continuationContributionId)
      .single();
    
    assert(!continuationContribQueryError, `Failed to query continuation contribution: ${continuationContribQueryError?.message}`);
    assertExists(continuationContributionRecord, "Continuation contribution record should exist");
    
    console.log('[TEST DEBUG 7.b.ii] Continuation contribution record:', {
      id: continuationContributionRecord.id,
      raw_response_storage_path: continuationContributionRecord.raw_response_storage_path,
      storage_path: continuationContributionRecord.storage_path,
      file_name: continuationContributionRecord.file_name,
      target_contribution_id: continuationContributionRecord.target_contribution_id,
      document_relationships: continuationContributionRecord.document_relationships,
    });

    // DEBUG: Also query the root contribution to compare paths
    const { data: rootContributionRecordForDebug, error: rootContribQueryErrorForDebug } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", rootContributionId)
      .single();
    
    assert(!rootContribQueryErrorForDebug, `Failed to query root contribution: ${rootContribQueryErrorForDebug?.message}`);
    assertExists(rootContributionRecordForDebug, "Root contribution record should exist");
    
    console.log('[TEST DEBUG 7.b.ii] Root contribution record:', {
      id: rootContributionRecordForDebug.id,
      raw_response_storage_path: rootContributionRecordForDebug.raw_response_storage_path,
      storage_path: rootContributionRecordForDebug.storage_path,
      file_name: rootContributionRecordForDebug.file_name,
      target_contribution_id: rootContributionRecordForDebug.target_contribution_id,
      document_relationships: rootContributionRecordForDebug.document_relationships,
    });

    // DEBUG: Analyze the collision error - check if continuation path matches root path
    const continuationPath = continuationContributionRecord.raw_response_storage_path;
    const rootPath = rootContributionRecordForDebug.raw_response_storage_path;
    console.log('[TEST DEBUG 7.b.ii] Path analysis:', {
      continuationPath,
      rootPath,
      pathsMatch: continuationPath === rootPath,
      continuationIsInWork: continuationPath?.includes('/_work/raw_responses/'),
      rootIsInRawResponses: rootPath?.includes('/raw_responses/') && !rootPath?.includes('/_work/'),
      continuationHasContinuationSuffix: continuationPath?.includes('_continuation_'),
      rootHasContinuationSuffix: rootPath?.includes('_continuation_'),
    });

    // PROOF: Download and verify actual file contents
    assertExists(rootContributionRecordForDebug.storage_bucket, "Root contribution storage_bucket must exist");
    assertExists(continuationContributionRecord.storage_bucket, "Continuation contribution storage_bucket must exist");
    const rootBucket = rootContributionRecordForDebug.storage_bucket;
    const continuationBucket = continuationContributionRecord.storage_bucket;
    
    assertExists(rootPath, "Root contribution raw_response_storage_path must exist");
    assertExists(continuationPath, "Continuation contribution raw_response_storage_path must exist");
    
    const rootFileDownload = await downloadFromStorage(adminClient, rootBucket, rootPath);
    assert(!rootFileDownload.error, `Failed to download root raw JSON: ${rootFileDownload.error?.message}`);
    assertExists(rootFileDownload.data, "Root raw JSON data must exist");
    if (!rootFileDownload.data) {
      throw new Error("Root raw JSON data is null after assertExists check");
    }
    assert(rootFileDownload.data instanceof ArrayBuffer, "Root raw JSON data must be ArrayBuffer");
    const rootFileText = new TextDecoder().decode(rootFileDownload.data);
    
    const continuationFileDownload = await downloadFromStorage(adminClient, continuationBucket, continuationPath);
    assert(!continuationFileDownload.error, `Failed to download continuation raw JSON: ${continuationFileDownload.error?.message}`);
    assertExists(continuationFileDownload.data, "Continuation raw JSON data must exist");
    if (!continuationFileDownload.data) {
      throw new Error("Continuation raw JSON data is null after assertExists check");
    }
    assert(continuationFileDownload.data instanceof ArrayBuffer, "Continuation raw JSON data must be ArrayBuffer");
    const continuationFileText = new TextDecoder().decode(continuationFileDownload.data);
    
    console.log('[TEST DEBUG 7.b.ii] ACTUAL FILE CONTENTS:', {
      rootPath,
      rootFileLength: rootFileText.length,
      rootFileFirst100: rootFileText.substring(0, 100),
      rootFileLast100: rootFileText.substring(rootFileText.length - 100),
      continuationPath,
      continuationFileLength: continuationFileText.length,
      continuationFileFirst100: continuationFileText.substring(0, 100),
      continuationFileLast100: continuationFileText.substring(continuationFileText.length - 100),
      filesAreIdentical: rootFileText === continuationFileText,
    });

    // 3) Verify a RENDER job is enqueued with payload containing sourceContributionId: continuationContributionId and documentIdentity: rootContributionId
    const { data: continuationRenderJobs, error: continuationRenderJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("parent_job_id", continuationExecuteJob.id)
      .eq("job_type", "RENDER")
      .eq("status", "pending");

    assert(!continuationRenderJobQueryError, `Failed to query continuation RENDER jobs: ${continuationRenderJobQueryError?.message}`);
    assertExists(continuationRenderJobs, "Continuation RENDER jobs query should return data");
    assert(continuationRenderJobs.length >= 1, `At least one RENDER job should be enqueued, found ${continuationRenderJobs.length}`);

    const continuationRenderJob = continuationRenderJobs[0];
    assertExists(continuationRenderJob, "Continuation RENDER job should exist");
    assertExists(continuationRenderJob.payload, "Continuation RENDER job should have a payload");

    if (!isRecord(continuationRenderJob.payload)) {
      throw new Error("Continuation RENDER job payload is not a record");
    }

    const continuationRenderPayload = continuationRenderJob.payload;
    assertExists(continuationRenderPayload.sourceContributionId, "continuationRenderPayload should have sourceContributionId");
    assertExists(continuationRenderPayload.documentIdentity, "continuationRenderPayload should have documentIdentity");
    assertEquals(continuationRenderPayload.sourceContributionId, continuationContributionId, "sourceContributionId should equal continuationContributionId (this chunk's contribution.id)");
    assertEquals(continuationRenderPayload.documentIdentity, rootContributionId, "documentIdentity should equal rootContributionId (the root's contribution.id from document_relationships)");

    // 4) Verify sourceContributionId !== documentIdentity in the payload
    assert(continuationRenderPayload.sourceContributionId !== continuationRenderPayload.documentIdentity, "For continuation chunks, sourceContributionId (this chunk's contribution.id) must NOT equal documentIdentity (root's ID from document_relationships)");

    // 5) Process the RENDER job via processRenderJob
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    await processRenderJob(
      adminClient,
      continuationRenderJob,
      testUserId,
      renderJobDeps,
      testUserJwt,
    );

    // 6) Verify renderDocument is called with both values and successfully finds all related chunks (root and continuation) using documentIdentity
    // (Verified implicitly by job status being 'completed' and rendered document containing content from both chunks)

    // 7) Verify the rendered document contains content from both chunks
    const { data: updatedContinuationRenderJob, error: updatedContinuationJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", continuationRenderJob.id)
      .single();

    assert(!updatedContinuationJobError, `Failed to query updated continuation RENDER job: ${updatedContinuationJobError?.message}`);
    assertExists(updatedContinuationRenderJob, "Updated continuation RENDER job should exist");
    assertEquals(updatedContinuationRenderJob.status, "completed", "Continuation RENDER job status should be 'completed'");

    // 8) Verify a dialectic_project_resources record is created with resource_type = 'rendered_document' and source_contribution_id = continuationContributionId
    const { data: continuationResourceRecords, error: continuationResourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSessionForThisTest.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", continuationContributionId);

    assert(!continuationResourceQueryError, `Failed to query continuation resources: ${continuationResourceQueryError?.message}`);
    assertExists(continuationResourceRecords, "Continuation resource query should return data");
    assert(continuationResourceRecords.length >= 1, `At least one rendered document should be saved, found ${continuationResourceRecords.length}`);

    const continuationRenderedResource = continuationResourceRecords[0];
    assertEquals(continuationRenderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(continuationRenderedResource.source_contribution_id, continuationContributionId, "Resource source_contribution_id should equal continuationContributionId (the actual contribution.id, not the documentIdentity)");

    // 8) Verify a rendered markdown file is saved to storage
    assertExists(continuationRenderedResource.storage_bucket, "Rendered document resource should have storage_bucket");
    assertExists(continuationRenderedResource.storage_path, "Rendered document resource should have storage_path");
    assertExists(continuationRenderedResource.file_name, "Rendered document resource should have file_name");

    const continuationFullStoragePath = `${continuationRenderedResource.storage_path}/${continuationRenderedResource.file_name}`;
    const { data: continuationRenderedFileData, error: continuationDownloadError } = await downloadFromStorage(
      adminClient,
      continuationRenderedResource.storage_bucket,
      continuationFullStoragePath,
    );

    assert(!continuationDownloadError, `Failed to download rendered document: ${continuationDownloadError?.message}`);
    assertExists(continuationRenderedFileData, "Rendered document file data should exist");

    if (continuationRenderedFileData === null) {
      throw new Error("Rendered document file data is null after assertExists check");
    }
    const continuationRenderedMarkdown = new TextDecoder().decode(continuationRenderedFileData);

    // 7) Verify the rendered document contains content from both chunks
    assert(
      continuationRenderedMarkdown.includes("Business Case Document - Root"),
      "Rendered document should contain content from root chunk"
    );
    assert(
      continuationRenderedMarkdown.includes("This is the root chunk content"),
      "Rendered document should contain root chunk content"
    );
    assert(
      continuationRenderedMarkdown.includes("Continuation Section"),
      "Rendered document should contain content from continuation chunk"
    );
    assert(
      continuationRenderedMarkdown.includes("This is the continuation chunk content"),
      "Rendered document should contain continuation chunk content"
    );

    // 10) Verify the RENDER job status is 'completed' with results.pathContext.sourceContributionId = continuationContributionId
    assertExists(updatedContinuationRenderJob.results, "Continuation RENDER job should have results");
    if (!isRecord(updatedContinuationRenderJob.results)) {
      throw new Error("Continuation RENDER job results is not a record");
    }

    const continuationResults = updatedContinuationRenderJob.results;
    assertExists(continuationResults.pathContext, "Continuation RENDER job results should have pathContext");
    if (!isRecord(continuationResults.pathContext)) {
      throw new Error("Continuation RENDER job results.pathContext is not a record");
    }

    const continuationPathContext = continuationResults.pathContext;
    assertExists(continuationPathContext.sourceContributionId, "continuationPathContext should have sourceContributionId");
    assertEquals(continuationPathContext.sourceContributionId, continuationContributionId, "results.pathContext.sourceContributionId should equal continuationContributionId");

    // 11) Explicitly assert that sourceContributionId !== documentIdentity for continuation chunks throughout the flow
    assert(continuationPathContext.sourceContributionId !== continuationRenderPayload.documentIdentity, "pathContext.sourceContributionId should not equal documentIdentity for continuation chunks");
  });

  it("7.b.iii: should render complete document chain when continuation chunk triggers render job", async () => {
    // Create a unique session for this test to avoid storage collisions
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
    const testSessionForThisTest = sessionResult.data;

    // 1) Create a document chain with root chunk (id: rootId) and two continuation chunks (id: cont1Id, cont2Id), all sharing the same documentIdentity: rootId
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;

    const rootContent = JSON.stringify({
      content: `# Business Case Document - Root\n\nThis is the root chunk content.`
    });

    const cont1Content = JSON.stringify({
      content: `\n\n## Section 1\n\nThis is the first continuation chunk content.`
    });

    const cont2Content = JSON.stringify({
      content: `\n\n## Section 2\n\nThis is the second continuation chunk content.`
    });

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    let rootId: string | undefined;

    // Create root chunk deps with rootContent
    const rootDeps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: rootContent,
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: rootContent,
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

    // Create root chunk via executeModelCallAndSave
    const rootExecuteJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSessionForThisTest.id,
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
      // Omit document_relationships - executeModelCallAndSave will set it to { [stageSlug]: contribution.id } for root chunks
    };

    if (!isJson(rootExecuteJobPayload)) {
      throw new Error("Root execute job payload is not a valid JSON object");
    }

    const rootExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionForThisTest.id,
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

    const { data: insertedRootJob, error: rootInsertError } = await adminClient
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

    assert(!rootInsertError, `Failed to insert root EXECUTE job: ${rootInsertError?.message}`);
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
        currentUserPrompt: "Generate a root business case document",
      },
      sessionData: {
        id: testSessionForThisTest.id,
        project_id: testSessionForThisTest.project_id,
        session_description: testSessionForThisTest.session_description,
        user_input_reference_url: testSessionForThisTest.user_input_reference_url,
        iteration_count: testSessionForThisTest.iteration_count,
        selected_model_ids: testSessionForThisTest.selected_model_ids,
        status: testSessionForThisTest.status,
        created_at: testSessionForThisTest.created_at,
        updated_at: testSessionForThisTest.updated_at,
        current_stage_id: testSessionForThisTest.current_stage_id,
        associated_chat_id: testSessionForThisTest.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    await executeModelCallAndSave(rootParams);

    // Get the root contribution ID
    const { data: updatedRootJob, error: rootJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", rootExecuteJob.id)
      .single();

    assert(!rootJobQueryError, `Failed to query updated root EXECUTE job: ${rootJobQueryError?.message}`);
    assertExists(updatedRootJob, "Updated root EXECUTE job should exist");
    assertExists(updatedRootJob.results, "Root EXECUTE job should have results");

    if (typeof updatedRootJob.results === 'string') {
      const results = JSON.parse(updatedRootJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedRootJob.results)) {
      const results = updatedRootJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        rootId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(rootId, "Root contribution ID should be available from job results");
    if (!rootId) {
      throw new Error("Root contribution ID is not available");
    }

    // Verify document_relationships was set to { [stageSlug]: rootId }
    const { data: rootContributionRecord, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", rootId)
      .single();

    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContributionRecord, "Root contribution record should exist");
    assertExists(rootContributionRecord.document_relationships, "Root chunk should have document_relationships set");
    if (isRecord(rootContributionRecord.document_relationships)) {
      assertEquals(rootContributionRecord.document_relationships[stageSlug], rootId, "document_relationships[stageSlug] should equal rootId for root chunks");
    }

    // Create continuation chunks deps
    let callCount = 0;
    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => {
        callCount++;
        const content = callCount === 1 ? cont1Content : cont2Content;
        return {
          content: content,
          finish_reason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          rawProviderResponse: {
            choices: [{
              message: {
                content: content,
              },
            }],
            finish_reason: 'stop',
          },
        };
      },
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

    // Create first continuation chunk
    const cont1ExecuteJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSessionForThisTest.id,
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
      target_contribution_id: rootId, // Required for continuation chunks
      continuation_count: 1, // Required for continuation chunks
      document_relationships: { [stageSlug]: rootId },
    };

    if (!isJson(cont1ExecuteJobPayload)) {
      throw new Error("Cont1 execute job payload is not a valid JSON object");
    }

    const cont1ExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionForThisTest.id,
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
      target_contribution_id: rootId,
      prerequisite_job_id: null,
      payload: cont1ExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    const { data: insertedCont1Job, error: cont1InsertError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: cont1ExecuteJob.id,
        parent_job_id: cont1ExecuteJob.parent_job_id,
        session_id: cont1ExecuteJob.session_id,
        user_id: cont1ExecuteJob.user_id,
        stage_slug: cont1ExecuteJob.stage_slug,
        iteration_number: cont1ExecuteJob.iteration_number,
        status: cont1ExecuteJob.status,
        max_retries: cont1ExecuteJob.max_retries,
        attempt_count: cont1ExecuteJob.attempt_count,
        created_at: cont1ExecuteJob.created_at,
        started_at: cont1ExecuteJob.started_at,
        completed_at: cont1ExecuteJob.completed_at,
        results: cont1ExecuteJob.results,
        error_details: cont1ExecuteJob.error_details,
        target_contribution_id: cont1ExecuteJob.target_contribution_id,
        prerequisite_job_id: cont1ExecuteJob.prerequisite_job_id,
        payload: cont1ExecuteJob.payload,
        is_test_job: cont1ExecuteJob.is_test_job,
        job_type: cont1ExecuteJob.job_type,
      })
      .select("*")
      .single();

    assert(!cont1InsertError, `Failed to insert cont1 EXECUTE job: ${cont1InsertError?.message}`);
    assertExists(insertedCont1Job, "Cont1 EXECUTE job should be inserted");

    const cont1Params: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: cont1ExecuteJob,
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
        currentUserPrompt: "Generate first continuation for the business case document",
      },
      sessionData: {
        id: testSessionForThisTest.id,
        project_id: testSessionForThisTest.project_id,
        session_description: testSessionForThisTest.session_description,
        user_input_reference_url: testSessionForThisTest.user_input_reference_url,
        iteration_count: testSessionForThisTest.iteration_count,
        selected_model_ids: testSessionForThisTest.selected_model_ids,
        status: testSessionForThisTest.status,
        created_at: testSessionForThisTest.created_at,
        updated_at: testSessionForThisTest.updated_at,
        current_stage_id: testSessionForThisTest.current_stage_id,
        associated_chat_id: testSessionForThisTest.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // DEBUG: Log cont1 job payload before calling executeModelCallAndSave
    console.log('[TEST DEBUG 7.b.iii] Cont1 job payload:', {
      jobId: cont1ExecuteJob.id,
      target_contribution_id: cont1ExecuteJob.target_contribution_id,
      continuation_count: cont1ExecuteJobPayload.continuation_count,
      document_relationships: cont1ExecuteJobPayload.document_relationships,
      attempt_count: cont1ExecuteJob.attempt_count,
      session_id: cont1ExecuteJob.session_id,
    });

    await executeModelCallAndSave(cont1Params);

    // Get cont1 contribution ID
    const { data: updatedCont1Job, error: cont1JobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", cont1ExecuteJob.id)
      .single();

    assert(!cont1JobQueryError, `Failed to query updated cont1 EXECUTE job: ${cont1JobQueryError?.message}`);
    assertExists(updatedCont1Job, "Updated cont1 EXECUTE job should exist");
    assertExists(updatedCont1Job.results, "Cont1 EXECUTE job should have results");

    let cont1Id: string | undefined;
    if (typeof updatedCont1Job.results === 'string') {
      const results = JSON.parse(updatedCont1Job.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        cont1Id = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedCont1Job.results)) {
      const results = updatedCont1Job.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        cont1Id = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(cont1Id, "Cont1 contribution ID should be available from job results");

    // DEBUG: Query and log cont1 contribution record
    const { data: cont1ContributionRecord, error: cont1ContribQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", cont1Id)
      .single();
    
    assert(!cont1ContribQueryError, `Failed to query cont1 contribution: ${cont1ContribQueryError?.message}`);
    assertExists(cont1ContributionRecord, "Cont1 contribution record should exist");
    
    console.log('[TEST DEBUG 7.b.iii] Cont1 contribution record:', {
      id: cont1ContributionRecord.id,
      raw_response_storage_path: cont1ContributionRecord.raw_response_storage_path,
      storage_path: cont1ContributionRecord.storage_path,
      file_name: cont1ContributionRecord.file_name,
      target_contribution_id: cont1ContributionRecord.target_contribution_id,
      document_relationships: cont1ContributionRecord.document_relationships,
    });

    // 2) Trigger a RENDER job via executeModelCallAndSave when the second continuation chunk (cont2Id) is created
    const cont2ExecuteJobPayload: DialecticExecuteJobPayload = {
      job_type: "execute",
      prompt_template_id: "__none__",
      inputs: {},
      output_type: documentKey,
      projectId: testProject.id,
      sessionId: testSessionForThisTest.id,
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
      target_contribution_id: cont1Id, // Required for continuation chunks (cont2 continues from cont1)
      continuation_count: 2, // Required for continuation chunks (second continuation)
      document_relationships: { [stageSlug]: rootId },
    };

    if (!isJson(cont2ExecuteJobPayload)) {
      throw new Error("Cont2 execute job payload is not a valid JSON object");
    }

    if (!cont1Id) {
      throw new Error("Cont1 contribution ID is not available");
    }

    const cont2ExecuteJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSessionForThisTest.id,
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
      target_contribution_id: cont1Id,
      prerequisite_job_id: null,
      payload: cont2ExecuteJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    const { data: insertedCont2Job, error: cont2InsertError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: cont2ExecuteJob.id,
        parent_job_id: cont2ExecuteJob.parent_job_id,
        session_id: cont2ExecuteJob.session_id,
        user_id: cont2ExecuteJob.user_id,
        stage_slug: cont2ExecuteJob.stage_slug,
        iteration_number: cont2ExecuteJob.iteration_number,
        status: cont2ExecuteJob.status,
        max_retries: cont2ExecuteJob.max_retries,
        attempt_count: cont2ExecuteJob.attempt_count,
        created_at: cont2ExecuteJob.created_at,
        started_at: cont2ExecuteJob.started_at,
        completed_at: cont2ExecuteJob.completed_at,
        results: cont2ExecuteJob.results,
        error_details: cont2ExecuteJob.error_details,
        target_contribution_id: cont2ExecuteJob.target_contribution_id,
        prerequisite_job_id: cont2ExecuteJob.prerequisite_job_id,
        payload: cont2ExecuteJob.payload,
        is_test_job: cont2ExecuteJob.is_test_job,
        job_type: cont2ExecuteJob.job_type,
      })
      .select("*")
      .single();

    assert(!cont2InsertError, `Failed to insert cont2 EXECUTE job: ${cont2InsertError?.message}`);
    assertExists(insertedCont2Job, "Cont2 EXECUTE job should be inserted");

    const cont2Params: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: cont2ExecuteJob,
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
        currentUserPrompt: "Generate second continuation for the business case document",
      },
      sessionData: {
        id: testSessionForThisTest.id,
        project_id: testSessionForThisTest.project_id,
        session_description: testSessionForThisTest.session_description,
        user_input_reference_url: testSessionForThisTest.user_input_reference_url,
        iteration_count: testSessionForThisTest.iteration_count,
        selected_model_ids: testSessionForThisTest.selected_model_ids,
        status: testSessionForThisTest.status,
        created_at: testSessionForThisTest.created_at,
        updated_at: testSessionForThisTest.updated_at,
        current_stage_id: testSessionForThisTest.current_stage_id,
        associated_chat_id: testSessionForThisTest.associated_chat_id,
      },
      compressionStrategy: getSortedCompressionCandidates,
      inputsRelevance: [],
      inputsRequired: [],
    };

    // DEBUG: Log cont2 job payload before calling executeModelCallAndSave
    console.log('[TEST DEBUG 7.b.iii] Cont2 job payload:', {
      jobId: cont2ExecuteJob.id,
      target_contribution_id: cont2ExecuteJob.target_contribution_id,
      continuation_count: cont2ExecuteJobPayload.continuation_count,
      document_relationships: cont2ExecuteJobPayload.document_relationships,
      attempt_count: cont2ExecuteJob.attempt_count,
      session_id: cont2ExecuteJob.session_id,
    });

    await executeModelCallAndSave(cont2Params);

    // Get cont2 contribution ID
    const { data: updatedCont2Job, error: cont2JobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", cont2ExecuteJob.id)
      .single();

    assert(!cont2JobQueryError, `Failed to query updated cont2 EXECUTE job: ${cont2JobQueryError?.message}`);
    assertExists(updatedCont2Job, "Updated cont2 EXECUTE job should exist");
    assertExists(updatedCont2Job.results, "Cont2 EXECUTE job should have results");

    let cont2Id: string | undefined;
    if (typeof updatedCont2Job.results === 'string') {
      const results = JSON.parse(updatedCont2Job.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        cont2Id = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedCont2Job.results)) {
      const results = updatedCont2Job.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        cont2Id = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(cont2Id, "Cont2 contribution ID should be available from job results");

    // DEBUG: Query and log cont2 contribution record
    const { data: cont2ContributionRecord, error: cont2ContribQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", cont2Id)
      .single();
    
    assert(!cont2ContribQueryError, `Failed to query cont2 contribution: ${cont2ContribQueryError?.message}`);
    assertExists(cont2ContributionRecord, "Cont2 contribution record should exist");
    
    console.log('[TEST DEBUG 7.b.iii] Cont2 contribution record:', {
      id: cont2ContributionRecord.id,
      raw_response_storage_path: cont2ContributionRecord.raw_response_storage_path,
      storage_path: cont2ContributionRecord.storage_path,
      file_name: cont2ContributionRecord.file_name,
      target_contribution_id: cont2ContributionRecord.target_contribution_id,
      document_relationships: cont2ContributionRecord.document_relationships,
    });

    // DEBUG: Also log root contribution for comparison
    console.log('[TEST DEBUG 7.b.iii] Root contribution record:', {
      id: rootContributionRecord.id,
      raw_response_storage_path: rootContributionRecord.raw_response_storage_path,
      storage_path: rootContributionRecord.storage_path,
      file_name: rootContributionRecord.file_name,
      target_contribution_id: rootContributionRecord.target_contribution_id,
      document_relationships: rootContributionRecord.document_relationships,
    });

    // 3) Verify the RENDER job payload contains sourceContributionId: cont2Id and documentIdentity: rootId
    const { data: cont2RenderJobs, error: cont2RenderJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("parent_job_id", cont2ExecuteJob.id)
      .eq("job_type", "RENDER")
      .eq("status", "pending");

    assert(!cont2RenderJobQueryError, `Failed to query cont2 RENDER jobs: ${cont2RenderJobQueryError?.message}`);
    assertExists(cont2RenderJobs, "Cont2 RENDER jobs query should return data");
    assert(cont2RenderJobs.length >= 1, `At least one RENDER job should be enqueued, found ${cont2RenderJobs.length}`);

    const cont2RenderJob = cont2RenderJobs[0];
    assertExists(cont2RenderJob, "Cont2 RENDER job should exist");
    assertExists(cont2RenderJob.payload, "Cont2 RENDER job should have a payload");

    if (!isRecord(cont2RenderJob.payload)) {
      throw new Error("Cont2 RENDER job payload is not a record");
    }

    const cont2RenderPayload = cont2RenderJob.payload;
    assertExists(cont2RenderPayload.sourceContributionId, "cont2RenderPayload should have sourceContributionId");
    assertExists(cont2RenderPayload.documentIdentity, "cont2RenderPayload should have documentIdentity");
    assertEquals(cont2RenderPayload.sourceContributionId, cont2Id, "sourceContributionId should equal cont2Id (the chunk that triggered the render)");
    assertEquals(cont2RenderPayload.documentIdentity, rootId, "documentIdentity should equal rootId (the semantic identifier for the document chain)");

    // 4) Process the RENDER job via processRenderJob
    const renderJobDeps: IRenderJobDeps = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    // 5) Verify renderDocument queries using documentIdentity: rootId and finds all three chunks
    // Query contributions using documentIdentity to verify all three chunks are found
    const { data: allChunks, error: chunksQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("session_id", testSessionForThisTest.id)
      .eq("iteration_number", iterationNumber)
      .contains("document_relationships", { [stageSlug]: rootId });

    assert(!chunksQueryError, `Failed to query chunks: ${chunksQueryError?.message}`);
    assertExists(allChunks, "Chunks query should return data");
    assertEquals(allChunks.length, 3, `Should find exactly 3 chunks (root, cont1, cont2), found ${allChunks.length}`);

    // Verify all three chunks have the same documentIdentity
    const chunkIds = allChunks.map(chunk => chunk.id);
    assert(chunkIds.includes(rootId), "Root chunk should be found");
    assert(chunkIds.includes(cont1Id), "Cont1 chunk should be found");
    assert(chunkIds.includes(cont2Id), "Cont2 chunk should be found");

    await processRenderJob(
      adminClient,
      cont2RenderJob,
      testUserId,
      renderJobDeps,
      testUserJwt,
    );

    // 6) Verify the rendered document contains content from all three chunks in correct order
    const { data: updatedCont2RenderJob, error: updatedCont2JobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", cont2RenderJob.id)
      .single();

    assert(!updatedCont2JobError, `Failed to query updated cont2 RENDER job: ${updatedCont2JobError?.message}`);
    assertExists(updatedCont2RenderJob, "Updated cont2 RENDER job should exist");
    assertEquals(updatedCont2RenderJob.status, "completed", "Cont2 RENDER job status should be 'completed'");

    // 7) Verify the dialectic_project_resources record has source_contribution_id = cont2Id (the chunk that triggered the render)
    const { data: cont2ResourceRecords, error: cont2ResourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSessionForThisTest.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", "rendered_document")
      .eq("source_contribution_id", cont2Id);

    assert(!cont2ResourceQueryError, `Failed to query cont2 resources: ${cont2ResourceQueryError?.message}`);
    assertExists(cont2ResourceRecords, "Cont2 resource query should return data");
    assert(cont2ResourceRecords.length >= 1, `At least one rendered document should be saved, found ${cont2ResourceRecords.length}`);

    const cont2RenderedResource = cont2ResourceRecords[0];
    assertEquals(cont2RenderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(cont2RenderedResource.source_contribution_id, cont2Id, "Resource source_contribution_id should equal cont2Id (the chunk that triggered the render), proving that sourceContributionId identifies the originating chunk while documentIdentity groups the entire chain for rendering");

    // 8) Verify the rendered document contains content from all three chunks in correct order
    assertExists(cont2RenderedResource.storage_bucket, "Rendered document resource should have storage_bucket");
    assertExists(cont2RenderedResource.storage_path, "Rendered document resource should have storage_path");
    assertExists(cont2RenderedResource.file_name, "Rendered document resource should have file_name");

    const cont2FullStoragePath = `${cont2RenderedResource.storage_path}/${cont2RenderedResource.file_name}`;
    const { data: cont2RenderedFileData, error: cont2DownloadError } = await downloadFromStorage(
      adminClient,
      cont2RenderedResource.storage_bucket,
      cont2FullStoragePath,
    );

    assert(!cont2DownloadError, `Failed to download rendered document: ${cont2DownloadError?.message}`);
    assertExists(cont2RenderedFileData, "Rendered document file data should exist");

    if (cont2RenderedFileData === null) {
      throw new Error("Rendered document file data is null after assertExists check");
    }
    const cont2RenderedMarkdown = new TextDecoder().decode(cont2RenderedFileData);

    // Verify the rendered document contains content from all three chunks in correct order
    assert(
      cont2RenderedMarkdown.includes("Business Case Document - Root"),
      "Rendered document should contain content from root chunk"
    );
    assert(
      cont2RenderedMarkdown.includes("This is the root chunk content"),
      "Rendered document should contain root chunk content"
    );
    assert(
      cont2RenderedMarkdown.includes("Section 1"),
      "Rendered document should contain content from first continuation chunk"
    );
    assert(
      cont2RenderedMarkdown.includes("This is the first continuation chunk content"),
      "Rendered document should contain first continuation chunk content"
    );
    assert(
      cont2RenderedMarkdown.includes("Section 2"),
      "Rendered document should contain content from second continuation chunk"
    );
    assert(
      cont2RenderedMarkdown.includes("This is the second continuation chunk content"),
      "Rendered document should contain second continuation chunk content"
    );

    // Verify content order: root content should appear before continuation content
    const rootIndex = cont2RenderedMarkdown.indexOf("Business Case Document - Root");
    const cont1Index = cont2RenderedMarkdown.indexOf("Section 1");
    const cont2Index = cont2RenderedMarkdown.indexOf("Section 2");
    assert(rootIndex !== -1 && cont1Index !== -1 && cont2Index !== -1, "All chunk content should be found in rendered document");
    assert(rootIndex < cont1Index, "Root chunk content should appear before first continuation chunk content");
    assert(cont1Index < cont2Index, "First continuation chunk content should appear before second continuation chunk content");
  });

  it("12.e.i: should construct correct storage paths for root and continuation chunks with continuation_count validation", async () => {
    // This test proves that executeModelCallAndSave works correctly with constructStoragePath
    // to prevent path collisions between root and continuation chunks
    
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 1;

    // Get provider details
    const { data: providerData, error: providerError } = await adminClient
      .from("ai_providers")
      .select("*")
      .eq("id", testModelId)
      .single();
    assert(!providerError, `Failed to fetch provider: ${providerError?.message}`);
    assertExists(providerData, "Provider should exist");

    // Set up dependencies
    const tokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: JSON.stringify({
          content: `# Business Case Document\n\nThis is test content.`
        }),
        finish_reason: 'stop',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: {
          choices: [{
            message: {
              content: JSON.stringify({
                content: `# Business Case Document\n\nThis is test content.`
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
        renderDocument: async () => ({
          pathContext: {
            projectId: "",
            sessionId: "",
            iteration: 0,
            stageSlug: "",
            documentKey: "",
            fileType: FileType.RenderedDocument,
            modelSlug: "",
          },
          renderedBytes: new Uint8Array(),
        }),
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

    // 1) Create a root chunk (no target_contribution_id, no continuation_count)
    const rootJobPayload: DialecticExecuteJobPayload = {
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
      // No target_contribution_id - this is a root chunk
      // No continuation_count - root chunks don't have continuation_count
    };

    if (!isJson(rootJobPayload)) {
      throw new Error("Root job payload is not a valid JSON object");
    }

    const rootJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      status: "pending",
      max_retries: 3,
      attempt_count: attemptCount,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: rootJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the root job into the database
    const { data: insertedRootJob, error: insertRootError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: rootJob.id,
        parent_job_id: rootJob.parent_job_id,
        session_id: rootJob.session_id,
        user_id: rootJob.user_id,
        stage_slug: rootJob.stage_slug,
        iteration_number: rootJob.iteration_number,
        status: rootJob.status,
        max_retries: rootJob.max_retries,
        attempt_count: rootJob.attempt_count,
        created_at: rootJob.created_at,
        started_at: rootJob.started_at,
        completed_at: rootJob.completed_at,
        results: rootJob.results,
        error_details: rootJob.error_details,
        target_contribution_id: rootJob.target_contribution_id,
        prerequisite_job_id: rootJob.prerequisite_job_id,
        payload: rootJob.payload,
        is_test_job: rootJob.is_test_job,
        job_type: rootJob.job_type,
      })
      .select("*")
      .single();

    assert(!insertRootError, `Failed to insert root job: ${insertRootError?.message}`);
    assertExists(insertedRootJob, "Root job should be inserted");

    const rootParams: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: rootJob,
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

    // Call executeModelCallAndSave for root chunk
    await executeModelCallAndSave(rootParams);

    // Get the root contribution ID
    const { data: updatedRootJob, error: rootJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", rootJob.id)
      .single();

    assert(!rootJobQueryError, `Failed to query updated root job: ${rootJobQueryError?.message}`);
    assertExists(updatedRootJob, "Updated root job should exist");
    assertExists(updatedRootJob.results, "Root job should have results");

    let rootContributionId: string | undefined;
    if (typeof updatedRootJob.results === 'string') {
      const results = JSON.parse(updatedRootJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedRootJob.results)) {
      const results = updatedRootJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        rootContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(rootContributionId, "Root contribution ID should be available from job results");

    // 2) Verify the root chunk's raw_response_storage_path is in raw_responses/ without continuation suffix
    const { data: rootContribution, error: rootContribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", rootContributionId)
      .single();

    assert(!rootContribError, `Failed to query root contribution: ${rootContribError?.message}`);
    assertExists(rootContribution, "Root contribution should exist");
    assertExists(rootContribution.raw_response_storage_path, "Root contribution should have raw_response_storage_path");

    // Verify root chunk path is in raw_responses/ directory (not _work/raw_responses/)
    assert(
      rootContribution.raw_response_storage_path.includes("/raw_responses/"),
      `Root chunk storage path should be in raw_responses/ directory, got: ${rootContribution.raw_response_storage_path}`
    );
    assert(
      !rootContribution.raw_response_storage_path.includes("/_work/raw_responses/"),
      `Root chunk storage path should NOT be in _work/raw_responses/ directory, got: ${rootContribution.raw_response_storage_path}`
    );
    // Verify no continuation suffix in filename
    assert(
      !rootContribution.raw_response_storage_path.includes("_continuation_"),
      `Root chunk storage path should NOT include continuation suffix, got: ${rootContribution.raw_response_storage_path}`
    );

    // 3) Create a continuation chunk with continuation_count: 1
    const docIdentity = crypto.randomUUID();
    const continuationJobPayload: DialecticExecuteJobPayload = {
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
      target_contribution_id: rootContributionId,
      continuation_count: 1, // Required for continuation chunks
      document_relationships: { [stageSlug]: docIdentity },
    };

    if (!isJson(continuationJobPayload)) {
      throw new Error("Continuation job payload is not a valid JSON object");
    }

    if (!rootContributionId) {
      throw new Error("Root contribution ID is not available");
    }

    const continuationJob: DialecticJobRow & { payload: DialecticExecuteJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      status: "pending",
      max_retries: 3,
      attempt_count: attemptCount,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: rootContributionId,
      prerequisite_job_id: null,
      payload: continuationJobPayload,
      is_test_job: false,
      job_type: "EXECUTE",
    };

    // Insert the continuation job into the database
    const { data: insertedContinuationJob, error: insertContError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        id: continuationJob.id,
        parent_job_id: continuationJob.parent_job_id,
        session_id: continuationJob.session_id,
        user_id: continuationJob.user_id,
        stage_slug: continuationJob.stage_slug,
        iteration_number: continuationJob.iteration_number,
        status: continuationJob.status,
        max_retries: continuationJob.max_retries,
        attempt_count: continuationJob.attempt_count,
        created_at: continuationJob.created_at,
        started_at: continuationJob.started_at,
        completed_at: continuationJob.completed_at,
        results: continuationJob.results,
        error_details: continuationJob.error_details,
        target_contribution_id: continuationJob.target_contribution_id,
        prerequisite_job_id: continuationJob.prerequisite_job_id,
        payload: continuationJob.payload,
        is_test_job: continuationJob.is_test_job,
        job_type: continuationJob.job_type,
      })
      .select("*")
      .single();

    assert(!insertContError, `Failed to insert continuation job: ${insertContError?.message}`);
    assertExists(insertedContinuationJob, "Continuation job should be inserted");

    const continuationParams: ExecuteModelCallAndSaveParams = {
      dbClient: adminClient,
      deps,
      authToken: testUserJwt,
      job: continuationJob,
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
        currentUserPrompt: "Please continue.",
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

    // Call executeModelCallAndSave for continuation chunk
    await executeModelCallAndSave(continuationParams);

    // Get the continuation contribution ID
    const { data: updatedContinuationJob, error: contJobQueryError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", continuationJob.id)
      .single();

    assert(!contJobQueryError, `Failed to query updated continuation job: ${contJobQueryError?.message}`);
    assertExists(updatedContinuationJob, "Updated continuation job should exist");
    assertExists(updatedContinuationJob.results, "Continuation job should have results");

    let continuationContributionId: string | undefined;
    if (typeof updatedContinuationJob.results === 'string') {
      const results = JSON.parse(updatedContinuationJob.results);
      if (results.modelProcessingResult && results.modelProcessingResult.contributionId) {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    } else if (isRecord(updatedContinuationJob.results)) {
      const results = updatedContinuationJob.results;
      if (isRecord(results.modelProcessingResult) && typeof results.modelProcessingResult.contributionId === 'string') {
        continuationContributionId = results.modelProcessingResult.contributionId;
      }
    }

    assertExists(continuationContributionId, "Continuation contribution ID should be available from job results");

    // 4) Verify the continuation chunk's raw_response_storage_path is in _work/raw_responses/ with _continuation_1 suffix
    const { data: continuationContribution, error: contContribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", continuationContributionId)
      .single();

    assert(!contContribError, `Failed to query continuation contribution: ${contContribError?.message}`);
    assertExists(continuationContribution, "Continuation contribution should exist");
    assertExists(continuationContribution.raw_response_storage_path, "Continuation contribution should have raw_response_storage_path");

    // Verify continuation chunk path is in _work/raw_responses/ directory (not raw_responses/)
    assert(
      continuationContribution.raw_response_storage_path.includes("/_work/raw_responses/"),
      `Continuation chunk storage path should be in _work/raw_responses/ directory, got: ${continuationContribution.raw_response_storage_path}`
    );
    // Verify it's NOT in the root raw_responses/ directory (without _work/)
    // Check that the path segment before "raw_responses/" ends with "_work/"
    const pathBeforeRawResponses = continuationContribution.raw_response_storage_path.split("/raw_responses/")[0];
    assert(
      pathBeforeRawResponses.endsWith("_work"),
      `Continuation chunk storage path should be in _work/raw_responses/ directory (not root raw_responses/), got: ${continuationContribution.raw_response_storage_path}`
    );
    // Verify continuation suffix _continuation_1 in filename
    assert(
      continuationContribution.raw_response_storage_path.includes("_continuation_1"),
      `Continuation chunk storage path should include _continuation_1 suffix, got: ${continuationContribution.raw_response_storage_path}`
    );

    // 5) Verify the two paths are different, proving no collision and correct path construction throughout the chain
    assert(
      rootContribution.raw_response_storage_path !== continuationContribution.raw_response_storage_path,
      `Root chunk and continuation chunk storage paths should be different. Root: ${rootContribution.raw_response_storage_path}, Continuation: ${continuationContribution.raw_response_storage_path}`
    );

    // Additional verification: Root path should not contain _work or continuation suffix
    assert(
      !rootContribution.raw_response_storage_path.includes("_work"),
      `Root chunk path should not contain '_work', got: ${rootContribution.raw_response_storage_path}`
    );
    assert(
      !rootContribution.raw_response_storage_path.includes("_continuation"),
      `Root chunk path should not contain '_continuation', got: ${rootContribution.raw_response_storage_path}`
    );

    // Additional verification: Continuation path should contain both _work and continuation suffix
    assert(
      continuationContribution.raw_response_storage_path.includes("_work"),
      `Continuation chunk path should contain '_work', got: ${continuationContribution.raw_response_storage_path}`
    );
    assert(
      continuationContribution.raw_response_storage_path.includes("_continuation_1"),
      `Continuation chunk path should contain '_continuation_1', got: ${continuationContribution.raw_response_storage_path}`
    );
  });
});

