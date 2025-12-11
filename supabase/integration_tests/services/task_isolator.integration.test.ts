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
  InputRule,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { deconstructStoragePath } from "../../functions/_shared/utils/path_deconstructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileType, ModelContributionUploadContext, ModelContributionFileTypes } from "../../functions/_shared/types/file_manager.types.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import type { DocumentRendererDeps, RenderDocumentParams } from "../../functions/_shared/services/document_renderer.interface.ts";
import { findSourceDocuments } from "../../functions/dialectic-worker/task_isolator.ts";
import { isJson } from "../../functions/_shared/utils/type_guards.ts";

describe("task_isolator.findSourceDocuments Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let fileManager: FileManagerService;
  let testModelId: string;

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
    formData.append("projectName", "TaskIsolator Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for task_isolator integration test");
    
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
    
    let model = existingModel;
    
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
    testModelId = model.id;

    // Create test session
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [model.id],
      sessionDescription: "Test session for task_isolator integration test",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to create test session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    testSession = sessionResult.data;
  });

  afterAll(async () => {
    await coreCleanupTestResources("all");
  });

  // Step 54.e.i: Test that verifies the end-to-end flow: document_renderer.renderDocument() saves a rendered document to dialectic_project_resources, and findSourceDocuments retrieves it for planning
  it("54.e.i: should retrieve rendered document from dialectic_project_resources for planning", async () => {
    const sourceStageSlug = "thesis";
    const targetStageSlug = "antithesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    // 1) Verify document template exists (should be seeded by migrations)
    const { data: projectData, error: projectError } = await adminClient
      .from("dialectic_projects")
      .select("selected_domain_id")
      .eq("id", testProject.id)
      .single();
    
    assert(!projectError, `Failed to fetch project domain: ${projectError?.message}`);
    assertExists(projectData?.selected_domain_id, "Project must have a selected_domain_id");

    // Check if template exists (templates are seeded via migrations)
    const templateName = `${sourceStageSlug}_${documentKey}`;
    const { data: templateRecord, error: templateQueryError } = await adminClient
      .from("dialectic_document_templates")
      .select("*")
      .eq("name", templateName)
      .eq("domain_id", projectData.selected_domain_id)
      .eq("is_active", true)
      .maybeSingle();

    if (templateQueryError || !templateRecord) {
      throw new Error(
        `Document template for stage '${sourceStageSlug}' and document '${documentKey}' not found. ` +
        `Templates should be seeded via database migrations. Error: ${templateQueryError?.message ?? 'not found'}`
      );
    }

    // 2) Create a thesis stage document using application functions
    const docIdentity = crypto.randomUUID();
    const contributionContent = JSON.stringify({
      content: `This is test content for ${documentKey} document that will be rendered.`
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

    // 3) Render the document using document_renderer.renderDocument()
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

    // 4) Verify the rendered document is saved to dialectic_project_resources with resource_type = 'rendered_document'
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

    // 5) Create a mock parent job with DialecticPlanJobPayload for findSourceDocuments
    const parentJobPayload: DialecticPlanJobPayload = {
      job_type: "PLAN",
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: targetStageSlug,
      iterationNumber: iterationNumber,
      walletId: "test-wallet-id",
      continueUntilComplete: false,
      maxRetries: 3,
      continuation_count: 0,
      model_id: testModelId,
      sourceContributionId: null,
      user_jwt: testUserJwt,
    };

    if(!isJson(parentJobPayload)) {
      throw new Error("Parent job payload is not a valid JSON object");
    }
    const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
      payload: parentJobPayload,
      is_test_job: false,
      job_type: "PLAN",
    };

    // 6) Create input rule that requires the document from the source stage
    const inputsRequired: InputRule[] = [
      {
        type: "document",
        slug: sourceStageSlug,
        document_key: documentKey,
      },
    ];

    // 7) Call findSourceDocuments for a subsequent stage that requires the document as input
    // Note: We verify indirectly that contributions are not queried by checking that the document
    // returned has the resource ID (not the contribution ID), which proves it came from resources
    const sourceDocuments = await findSourceDocuments(
      adminClient,
      parentJob,
      inputsRequired,
    );

    // 8) Assert that findSourceDocuments finds and retrieves the document from dialectic_project_resources (not from contributions)
    assertExists(sourceDocuments, "findSourceDocuments should return documents");
    assert(sourceDocuments.length >= 1, `Should find at least one document, found ${sourceDocuments.length}`);
    
    const foundDocument = sourceDocuments.find(doc => {
      // Check if the document matches our rendered resource
      if (!renderedResource.file_name || !renderedResource.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: renderedResource.storage_path,
        fileName: renderedResource.file_name,
      });
      const extractedDocumentKey = deconstructed.documentKey;
      return extractedDocumentKey === documentKey && doc.stage === sourceStageSlug;
    });
    
    assertExists(foundDocument, `Document with document_key '${documentKey}' should be found in sourceDocuments`);
    
    if (!foundDocument) {
      throw new Error("Found document is null after assertExists check");
    }

    // Verify that the document ID matches the resource ID, not the contribution ID
    // This proves it came from resources, not contributions
    assertEquals(foundDocument.id, renderedResource.id, "Document ID should match the rendered resource ID, not the contribution ID");
    assert(foundDocument.id !== contributionId, "Document ID should NOT match the contribution ID (proves it came from resources)");
    assertEquals(foundDocument.contribution_type, "rendered_document", "Document contribution_type should be 'rendered_document'");
    assertEquals(foundDocument.stage, sourceStageSlug, "Document stage should match source stage");
    assertEquals(foundDocument.iteration_number, iterationNumber, "Document iteration_number should match");

    // 9) Assert that findSourceDocuments does NOT query contributions when resources are found
    // Since we can't easily mock the Supabase client in integration tests, we verify this indirectly:
    // - The document ID matches the resource ID (not contribution ID) - already verified above
    // - The document has contribution_type 'rendered_document' (resources have this, contributions have their file type)
    // - We can query contributions table directly to verify the contribution still exists (it should)
    const { data: contributionCheck, error: contributionCheckError } = await adminClient
      .from("dialectic_contributions")
      .select("id")
      .eq("id", contributionId)
      .single();
    
    assert(!contributionCheckError, `Failed to verify contribution still exists: ${contributionCheckError?.message}`);
    assertExists(contributionCheck, "Contribution should still exist in database");
    // The fact that the contribution exists but wasn't returned proves findSourceDocuments didn't query it
    // (since it found the resource first and used it exclusively)
  });
});

