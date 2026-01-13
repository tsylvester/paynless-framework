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
  DialecticRenderJobPayload,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { IRenderJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { deconstructStoragePath } from "../../functions/_shared/utils/path_deconstructor.ts";
import { downloadFromStorage, deleteFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileType, ModelContributionUploadContext } from "../../functions/_shared/types/file_manager.types.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import { processRenderJob } from "../../functions/dialectic-worker/processRenderJob.ts";
import { isJson, isRecord } from "../../functions/_shared/utils/type_guards.ts";

describe("document_renderer Integration Tests", () => {
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
    formData.append("projectName", "Document Renderer Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for document_renderer integration test");
    
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

  it("5.e.i: should process RENDER job successfully for root chunks where sourceContributionId equals documentIdentity", async () => {
    // Test 5.e.i: Verify processRenderJob → renderDocument integration for root chunks
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    // 1) Set up a root chunk contribution
    const docIdentity = crypto.randomUUID();

    const contributionContent = JSON.stringify({
      content: JSON.stringify({
        executive_summary: "Root chunk executive summary content",
        market_opportunity: "Root chunk market opportunity content",
      })
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
      description: `Test root chunk contribution for ${stageSlug} ${documentKey}`,
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

    const uploadResult = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!uploadResult.error, `Failed to upload contribution: ${uploadResult.error?.message}`);
    assertExists(uploadResult.record, "Contribution should be uploaded");

    // Get the actual contribution ID from the uploaded record
    const contributionRecord = uploadResult.record;
    if (!contributionRecord || !('id' in contributionRecord)) {
      throw new Error("Contribution record is missing or missing id field");
    }
    const actualRootContributionId = contributionRecord.id;

    // Update document_relationships to use the actual contribution ID (for root chunks, documentIdentity equals contribution.id)
    const { error: updateRelationshipsError } = await adminClient
      .from("dialectic_contributions")
      .update({
        document_relationships: { [stageSlug]: actualRootContributionId },
      })
      .eq("id", actualRootContributionId);

    assert(!updateRelationshipsError, `Failed to update root chunk document_relationships: ${updateRelationshipsError?.message}`);

    const documentIdentity = actualRootContributionId; // For root chunks, documentIdentity equals contribution.id

    // 2) Create a RENDER job with payload containing sourceContributionId: rootContributionId and documentIdentity: rootContributionId (both equal)
    const renderJobPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      iterationNumber: iterationNumber,
      stageSlug: stageSlug,
      model_id: testModelId,
      documentIdentity: actualRootContributionId,
      documentKey: documentKey,
      sourceContributionId: actualRootContributionId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      template_filename: "thesis_business_case.md",
    };

    if(!isJson(renderJobPayload)) {
      throw new Error("RENDER job payload is not a JSON object");
    }   
    const jobInsert: Database["public"]["Tables"]["dialectic_generation_jobs"]["Insert"] = {
      job_type: "RENDER",
      session_id: testSession.id,
      iteration_number: iterationNumber,
      stage_slug: stageSlug,
      status: "pending",
      payload: renderJobPayload,
      user_id: testUserId,
    };

    const { data: renderJob, error: renderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert(jobInsert)
      .select("*")
      .single();

    assert(!renderJobError, `Failed to create RENDER job: ${renderJobError?.message}`);
    assertExists(renderJob, "RENDER job should be created");
    const typedRenderJob: DialecticJobRow = renderJob;

    // 3) Call processRenderJob with the job
    const renderJobDeps: IRenderJobContext = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      deleteFromStorage: deleteFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    let processError: Error | null = null;
    try {
      await processRenderJob(
        adminClient,
        typedRenderJob,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // 4) Verify renderDocument was called with correct parameters
    // (This is verified implicitly by the fact that processRenderJob succeeded and the job was marked completed)

    // 5) Verify the job is marked completed with results.pathContext.sourceContributionId matching the root's contribution.id
    const { data: updatedRenderJob, error: updatedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", typedRenderJob.id)
      .single();

    assert(!updatedJobError, `Failed to query updated RENDER job: ${updatedJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    const typedUpdatedRenderJob: DialecticJobRow = updatedRenderJob;
    assertEquals(typedUpdatedRenderJob.status, "completed", "RENDER job status should be 'completed'");
    assertExists(typedUpdatedRenderJob.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(typedUpdatedRenderJob.results, "RENDER job should have results");

    if (!isRecord(typedUpdatedRenderJob.results)) {
      throw new Error("RENDER job results is not a record");
    }

    const results = typedUpdatedRenderJob.results;
    assertExists(results.pathContext, "RENDER job results should have pathContext");

    if (!isRecord(results.pathContext)) {
      throw new Error("RENDER job results.pathContext is not a record");
    }

    const pathContext = results.pathContext;
    assertEquals(pathContext.sourceContributionId, actualRootContributionId, "pathContext.sourceContributionId should match the root's contribution.id");
    assertEquals(pathContext.sourceContributionId, renderJobPayload.documentIdentity, "For root chunks, sourceContributionId should equal documentIdentity");
  });

  it("5.e.ii: should process RENDER job successfully for continuation chunks where sourceContributionId differs from documentIdentity", async () => {
    // Test 5.e.ii: Verify processRenderJob → renderDocument integration for continuation chunks
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    // 1) Set up a root chunk and a continuation chunk sharing the same documentIdentity
    const docIdentity = crypto.randomUUID();

    // Create root chunk
    const rootContributionContent = JSON.stringify({
      content: JSON.stringify({
        executive_summary: "Root chunk executive summary",
        market_opportunity: "Root chunk market opportunity",
      })
    });

    const rootContributionContext: ModelContributionUploadContext = {
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
      fileContent: rootContributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(rootContributionContent).length,
      userId: testUserId,
      description: `Test root chunk contribution for ${stageSlug} ${documentKey}`,
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

    const rootUploadResult = await fileManager.uploadAndRegisterFile(rootContributionContext);
    assert(!rootUploadResult.error, `Failed to upload root contribution: ${rootUploadResult.error?.message}`);
    assertExists(rootUploadResult.record, "Root contribution should be uploaded");

    // Get the actual root contribution ID
    const rootContributionRecord = rootUploadResult.record;
    if (!rootContributionRecord || !('id' in rootContributionRecord)) {
      throw new Error("Root contribution record is missing or missing id field");
    }
    const actualRootContributionId = rootContributionRecord.id;

    // Update root chunk's document_relationships to use the actual contribution ID (for root chunks, documentIdentity equals contribution.id)
    const { error: updateRootRelationshipsError } = await adminClient
      .from("dialectic_contributions")
      .update({
        document_relationships: { [stageSlug]: actualRootContributionId },
      })
      .eq("id", actualRootContributionId);

    assert(!updateRootRelationshipsError, `Failed to update root chunk document_relationships: ${updateRootRelationshipsError?.message}`);

    const documentIdentity = actualRootContributionId; // Semantic identifier shared by both chunks

    // Create continuation chunk
    const continuationContributionContent = JSON.stringify({
      content: JSON.stringify({
        executive_summary: "Continuation chunk executive summary",
        market_opportunity: "Continuation chunk market opportunity",
      })
    });

    const continuationContributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: attemptCount + 1,
        documentKey: documentKey,
      },
      fileContent: continuationContributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(continuationContributionContent).length,
      userId: testUserId,
      description: `Test continuation chunk contribution for ${stageSlug} ${documentKey}`,
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        document_relationships: { [stageSlug]: documentIdentity }, // Same semantic identifier as root
        target_contribution_id: actualRootContributionId, // Points to root chunk
        editVersion: 2,
        isLatestEdit: true,
      },
    };

    const continuationUploadResult = await fileManager.uploadAndRegisterFile(continuationContributionContext);
    assert(!continuationUploadResult.error, `Failed to upload continuation contribution: ${continuationUploadResult.error?.message}`);
    assertExists(continuationUploadResult.record, "Continuation contribution should be uploaded");

    // Get the actual continuation contribution ID
    const continuationContributionRecord = continuationUploadResult.record;
    if (!continuationContributionRecord || !('id' in continuationContributionRecord)) {
      throw new Error("Continuation contribution record is missing or missing id field");
    }
    const actualContinuationContributionId = continuationContributionRecord.id;

    // Update the continuation chunk's document_relationships to use the actual root contribution ID
    const { error: updateRelationshipsError } = await adminClient
      .from("dialectic_contributions")
      .update({
        document_relationships: { [stageSlug]: actualRootContributionId },
      })
      .eq("id", actualContinuationContributionId);

    assert(!updateRelationshipsError, `Failed to update continuation chunk document_relationships: ${updateRelationshipsError?.message}`);

    // 2) Create a RENDER job with payload containing sourceContributionId: continuationContributionId and documentIdentity: rootContributionId (different values)
    const renderJobPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      iterationNumber: iterationNumber,
      stageSlug: stageSlug,
      model_id: testModelId,
      documentIdentity: actualRootContributionId, // Root's contribution.id (semantic identifier)
      documentKey: documentKey,
      sourceContributionId: actualContinuationContributionId, // Continuation chunk's contribution.id (different from documentIdentity)
      walletId: testWalletId,
      user_jwt: testUserJwt,
      template_filename: "thesis_business_case.md",
    };

    // Explicitly verify that sourceContributionId !== documentIdentity for continuation chunks
    assert(renderJobPayload.sourceContributionId !== renderJobPayload.documentIdentity, "For continuation chunks, sourceContributionId should not equal documentIdentity");
    if(!isJson(renderJobPayload)) {
      throw new Error("RENDER job payload is not a JSON object");
    }
    const jobInsert2: Database["public"]["Tables"]["dialectic_generation_jobs"]["Insert"] = {
      job_type: "RENDER",
      session_id: testSession.id,
      iteration_number: iterationNumber,
      stage_slug: stageSlug,
      status: "pending",
      payload: renderJobPayload,
      user_id: testUserId,
    };

    const { data: renderJob, error: renderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert(jobInsert2)
      .select("*")
      .single();

    assert(!renderJobError, `Failed to create RENDER job: ${renderJobError?.message}`);
    assertExists(renderJob, "RENDER job should be created");
    const typedRenderJob2: DialecticJobRow = renderJob;

    // 3) Call processRenderJob with the job
    const renderJobDeps: IRenderJobContext = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      deleteFromStorage: deleteFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    let processError: Error | null = null;
    try {
      await processRenderJob(
        adminClient,
        typedRenderJob2,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // 4) Verify renderDocument was called with correct parameters and finds both chunks
    // (This is verified implicitly by the fact that processRenderJob succeeded and the job was marked completed)

    // 5) Verify the rendered document contains content from both chunks
    // Query for the rendered document resource record
    const { data: renderedResource, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", FileType.RenderedDocument)
      .eq("source_contribution_id", actualContinuationContributionId)
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

    // Verify the rendered document contains content from both root and continuation chunks
    assert(
      renderedMarkdown.includes("Root chunk executive summary"),
      "Rendered document should contain content from root chunk"
    );
    assert(
      renderedMarkdown.includes("Root chunk market opportunity"),
      "Rendered document should contain content from root chunk"
    );
    assert(
      renderedMarkdown.includes("Continuation chunk executive summary"),
      "Rendered document should contain content from continuation chunk"
    );
    assert(
      renderedMarkdown.includes("Continuation chunk market opportunity"),
      "Rendered document should contain content from continuation chunk"
    );

    // 6) Verify the job is marked completed with results.pathContext.sourceContributionId matching the continuation chunk's contribution.id (not the documentIdentity)
    const { data: updatedRenderJob, error: updatedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", typedRenderJob2.id)
      .single();

    assert(!updatedJobError, `Failed to query updated RENDER job: ${updatedJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    const typedUpdatedRenderJob2: DialecticJobRow = updatedRenderJob;
    assertEquals(typedUpdatedRenderJob2.status, "completed", "RENDER job status should be 'completed'");
    assertExists(typedUpdatedRenderJob2.completed_at, "RENDER job should have completed_at timestamp");
    assertExists(typedUpdatedRenderJob2.results, "RENDER job should have results");

    if (!isRecord(typedUpdatedRenderJob2.results)) {
      throw new Error("RENDER job results is not a record");
    }

    const results = typedUpdatedRenderJob2.results;
    assertExists(results.pathContext, "RENDER job results should have pathContext");

    if (!isRecord(results.pathContext)) {
      throw new Error("RENDER job results.pathContext is not a record");
    }

    const pathContext = results.pathContext;
    assertEquals(pathContext.sourceContributionId, actualContinuationContributionId, "pathContext.sourceContributionId should match the continuation chunk's contribution.id, not the documentIdentity");
    assert(pathContext.sourceContributionId !== renderJobPayload.documentIdentity, "For continuation chunks, pathContext.sourceContributionId should not equal documentIdentity");
  });

  // Test 73.f.i: Fragment appears in rendered document filename when source_group is present
  it("73.f.i: fragment appears in saved filename when source_group is present", async () => {
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;
    const testSourceGroup = 'test-uuid-1234-5678-90ab-cdef12345678';
    const expectedFragment = 'testuuid'; // First 8 chars after hyphen removal

    // 1) Create a root chunk contribution with source_group in document_relationships
    const docIdentity = crypto.randomUUID();

    const contributionContent = JSON.stringify({
      content: JSON.stringify({
        executive_summary: "Test executive summary with fragment",
        market_opportunity: "Test market opportunity with fragment",
      })
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
      description: `Test root chunk contribution with source_group for ${stageSlug} ${documentKey}`,
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        document_relationships: { 
          [stageSlug]: docIdentity,
          source_group: testSourceGroup,
        },
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const uploadResult = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!uploadResult.error, `Failed to upload contribution: ${uploadResult.error?.message}`);
    assertExists(uploadResult.record, "Contribution should be uploaded");

    const contributionRecord = uploadResult.record;
    if (!contributionRecord || !('id' in contributionRecord)) {
      throw new Error("Contribution record is missing or missing id field");
    }
    const actualRootContributionId = contributionRecord.id;

    // Update document_relationships to use the actual contribution ID and ensure source_group is preserved
    const { error: updateRelationshipsError } = await adminClient
      .from("dialectic_contributions")
      .update({
        document_relationships: { 
          [stageSlug]: actualRootContributionId,
          source_group: testSourceGroup,
        },
      })
      .eq("id", actualRootContributionId);

    assert(!updateRelationshipsError, `Failed to update root chunk document_relationships: ${updateRelationshipsError?.message}`);

    const documentIdentity = actualRootContributionId;

    // 2) Create a RENDER job
    const renderJobPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      iterationNumber: iterationNumber,
      stageSlug: stageSlug,
      model_id: testModelId,
      documentIdentity: actualRootContributionId,
      documentKey: documentKey,
      sourceContributionId: actualRootContributionId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      template_filename: "thesis_business_case.md",
    };

    if(!isJson(renderJobPayload)) {
      throw new Error("RENDER job payload is not a JSON object");
    }
    const jobInsert: Database["public"]["Tables"]["dialectic_generation_jobs"]["Insert"] = {
      job_type: "RENDER",
      session_id: testSession.id,
      iteration_number: iterationNumber,
      stage_slug: stageSlug,
      status: "pending",
      payload: renderJobPayload,
      user_id: testUserId,
    };

    const { data: renderJob, error: renderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert(jobInsert)
      .select("*")
      .single();

    assert(!renderJobError, `Failed to create RENDER job: ${renderJobError?.message}`);
    assertExists(renderJob, "RENDER job should be created");
    const typedRenderJob: DialecticJobRow = renderJob;

    // 3) Process the RENDER job
    const renderJobDeps: IRenderJobContext = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      deleteFromStorage: deleteFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    let processError: Error | null = null;
    try {
      await processRenderJob(
        adminClient,
        typedRenderJob,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // 4) Verify the rendered document file in storage has fragment in filename
    const { data: renderedResource, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", FileType.RenderedDocument)
      .eq("source_contribution_id", actualRootContributionId)
      .maybeSingle();

    assert(!resourceError, `Failed to query rendered document resource: ${resourceError?.message}`);
    assertExists(renderedResource, "Rendered document resource should exist");
    assertExists(renderedResource.storage_path, "Rendered document resource should have storage_path");
    assertExists(renderedResource.file_name, "Rendered document resource should have file_name");

    // Verify fragment is present in filename
    // Pattern: {modelSlug}_{attemptCount}_{documentKey}[_{fragment}].md
    // Expected filename should contain: _{expectedFragment}.md
    const fragmentSuffix = `_${expectedFragment}.md`;
    assert(
      renderedResource.file_name.endsWith(fragmentSuffix),
      `Filename should end with fragment suffix '${fragmentSuffix}'. Actual filename: ${renderedResource.file_name}`
    );

    // Extract fragment from filename for verification
    // Pattern: {modelSlug}_{attemptCount}_{documentKey}_{fragment}.md
    const filenameWithoutExt = renderedResource.file_name.replace(/\.md$/, '');
    const parts = filenameWithoutExt.split('_');
    // Last part should be the fragment (after documentKey)
    const extractedFragment = parts[parts.length - 1];
    
    assertEquals(
      extractedFragment,
      expectedFragment,
      `Fragment extracted from filename should match expected value. Expected: ${expectedFragment}, Actual: ${extractedFragment}, Filename: ${renderedResource.file_name}`
    );

    // Verify the fragment is exactly 8 characters
    assert(
      extractedFragment.length === 8,
      `Fragment should be exactly 8 characters: ${extractedFragment}`
    );

    // Also try deconstructStoragePath (may not extract fragment from simple patterns, but should work for antithesis)
    const deconstructed = deconstructStoragePath({
      storageDir: renderedResource.storage_path,
      fileName: renderedResource.file_name,
    });
    
    // If deconstructor extracted fragment, verify it matches
    if (deconstructed.sourceGroupFragment) {
      assertEquals(
        deconstructed.sourceGroupFragment,
        expectedFragment,
        `Deconstructed fragment should match expected value. Expected: ${expectedFragment}, Actual: ${deconstructed.sourceGroupFragment}`
      );
    }
  });

  // Test 73.f.ii: Antithesis RenderedDocument preserves sourceAnchorModelSlug
  it("73.f.ii: antithesis RenderedDocument preserves sourceAnchorModelSlug", async () => {
    const stageSlug = "antithesis";
    const iterationNumber = 1;
    const critiquingModelSlug = "claude-3-opus";
    const sourceAnchorModelSlug = "gpt-4";
    const attemptCount = 1;
    const testSourceGroup = '98765432-1234-5678-90ab-cdef12345678';
    const expectedFragment = '98765432'; // First 8 chars after hyphen removal

    // 1) Query for a specific existing document template for antithesis stage
    // Use the template that exists in the migration: antithesis_business_case_critique
    const templateName = "antithesis_business_case_critique";
    const documentKey = FileType.business_case_critique;
    
    const { data: existingTemplate, error: templateQueryError } = await adminClient
      .from("dialectic_document_templates")
      .select("*")
      .eq("domain_id", testProject.selected_domain_id)
      .eq("is_active", true)
      .eq("name", templateName)
      .maybeSingle();

    assert(!templateQueryError, `Failed to query template: ${templateQueryError?.message}`);
    assertExists(
      existingTemplate,
      `Template '${templateName}' not found for domain '${testProject.selected_domain_id}'. Templates should exist in the database.`
    );

    // 2) Create an antithesis contribution using FileManagerService with the template's document key
    // The filename should follow the pattern: {modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}_critique_raw.json
    const docIdentity = crypto.randomUUID();

    const contributionContent = JSON.stringify({
      content: JSON.stringify({
        executive_summary: "Antithesis critique executive summary",
        market_opportunity: "Antithesis critique market opportunity",
      })
    });

    // Use FileManagerService to create the contribution with proper antithesis pattern
    // The pathContext must include sourceAnchorModelSlug and sourceGroupFragment for antithesis pattern
    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: FileType.ModelContributionRawJson,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: critiquingModelSlug,
        attemptCount: attemptCount,
        documentKey: documentKey,
        sourceGroupFragment: expectedFragment,
        sourceAnchorModelSlug: sourceAnchorModelSlug, // Required for antithesis pattern
      },
      fileContent: contributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(contributionContent).length,
      userId: testUserId,
      description: `Test antithesis contribution with critiquing pattern`,
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: critiquingModelSlug,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        document_relationships: { 
          [stageSlug]: docIdentity,
          source_group: testSourceGroup,
        },
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const uploadResult = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!uploadResult.error, `Failed to upload antithesis contribution: ${uploadResult.error?.message}`);
    assertExists(uploadResult.record, "Antithesis contribution should be uploaded");

    const contributionRecord = uploadResult.record;
    if (!contributionRecord || !('id' in contributionRecord)) {
      throw new Error("Contribution record is missing or missing id field");
    }
    const actualRootContributionId = contributionRecord.id;

    // Update document_relationships to use the actual contribution ID
    const { error: updateRelationshipsError } = await adminClient
      .from("dialectic_contributions")
      .update({
        document_relationships: { 
          [stageSlug]: actualRootContributionId,
          source_group: testSourceGroup,
        },
      })
      .eq("id", actualRootContributionId);

    assert(!updateRelationshipsError, `Failed to update antithesis contribution document_relationships: ${updateRelationshipsError?.message}`);

    // 3) Create a RENDER job for the antithesis contribution using the template's document key
    const renderJobPayload: DialecticRenderJobPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      iterationNumber: iterationNumber,
      stageSlug: stageSlug,
      model_id: testModelId,
      documentIdentity: actualRootContributionId,
      documentKey: documentKey,
      sourceContributionId: actualRootContributionId,
      walletId: testWalletId,
      user_jwt: testUserJwt,
      template_filename: "antithesis_business_case_critique.md",
    };

    if(!isJson(renderJobPayload)) {
      throw new Error("RENDER job payload is not a JSON object");
    }
    const jobInsert: Database["public"]["Tables"]["dialectic_generation_jobs"]["Insert"] = {
      job_type: "RENDER",
      session_id: testSession.id,
      iteration_number: iterationNumber,
      stage_slug: stageSlug,
      status: "pending",
      payload: renderJobPayload,
      user_id: testUserId,
    };

    const { data: renderJob, error: renderJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert(jobInsert)
      .select("*")
      .single();

    assert(!renderJobError, `Failed to create RENDER job: ${renderJobError?.message}`);
    assertExists(renderJob, "RENDER job should be created");
    const typedRenderJob: DialecticJobRow = renderJob;

    // 3) Process the RENDER job
    const renderJobDeps: IRenderJobContext = {
      documentRenderer: {
        renderDocument: renderDocument,
      },
      downloadFromStorage: downloadFromStorage,
      deleteFromStorage: deleteFromStorage,
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      logger: testLogger,
    };

    let processError: Error | null = null;
    try {
      await processRenderJob(
        adminClient,
        typedRenderJob,
        testUserId,
        renderJobDeps,
        testUserJwt,
      );
    } catch (e) {
      processError = e instanceof Error ? e : new Error(String(e));
    }

    assert(processError === null, `processRenderJob should not throw errors, but got: ${processError?.message}`);

    // 4) Fetch the contribution created by FileManagerService to get actual storage path and filename
    const { data: contribution, error: contribFetchError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("id", actualRootContributionId)
      .single();

    assert(!contribFetchError, `Failed to fetch contribution: ${contribFetchError?.message}`);
    assertExists(contribution, "Contribution should exist");
    assertExists(contribution.storage_path, "Contribution should have storage_path");
    assertExists(contribution.file_name, "Contribution should have file_name");

    // Verify deconstructed path extracts sourceAnchorModelSlug correctly
    const deconstructedBasePath = deconstructStoragePath({
      storageDir: contribution.storage_path,
      fileName: contribution.file_name,
    });

    assertExists(
      deconstructedBasePath.sourceAnchorModelSlug,
      `Base contribution path should extract sourceAnchorModelSlug. Filename: ${contribution.file_name}`
    );
    assertEquals(
      deconstructedBasePath.sourceAnchorModelSlug,
      sourceAnchorModelSlug,
      `sourceAnchorModelSlug should equal '${sourceAnchorModelSlug}'. Actual: ${deconstructedBasePath.sourceAnchorModelSlug}`
    );

    // Verify the base contribution filename uses critiquing pattern
    assert(
      contribution.file_name.includes("critiquing"),
      `Base contribution filename should use critiquing pattern. Actual filename: ${contribution.file_name}`
    );
    assert(
      contribution.file_name.includes(sourceAnchorModelSlug),
      `Base contribution filename should include sourceAnchorModelSlug '${sourceAnchorModelSlug}'. Actual filename: ${contribution.file_name}`
    );

    // 5) Verify rendered document PathContext includes sourceAnchorModelSlug
    const { data: updatedRenderJob, error: updatedJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("id", typedRenderJob.id)
      .single();

    assert(!updatedJobError, `Failed to query updated RENDER job: ${updatedJobError?.message}`);
    assertExists(updatedRenderJob, "Updated RENDER job should exist");
    const typedUpdatedRenderJob: DialecticJobRow = updatedRenderJob;
    assertExists(typedUpdatedRenderJob.results, "RENDER job should have results");

    if (!isRecord(typedUpdatedRenderJob.results)) {
      throw new Error("RENDER job results is not a record");
    }

    const results = typedUpdatedRenderJob.results;
    assertExists(results.pathContext, "RENDER job results should have pathContext");

    if (!isRecord(results.pathContext)) {
      throw new Error("RENDER job results.pathContext is not a record");
    }

    const pathContext = results.pathContext;
    assertExists(
      pathContext.sourceAnchorModelSlug,
      "PathContext should include sourceAnchorModelSlug for antithesis patterns"
    );
    assertEquals(
      pathContext.sourceAnchorModelSlug,
      sourceAnchorModelSlug,
      `PathContext.sourceAnchorModelSlug should equal '${sourceAnchorModelSlug}'. Actual: ${pathContext.sourceAnchorModelSlug}`
    );

    // 6) Verify final rendered document filename uses antithesis pattern with fragment
    const { data: renderedResource, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("project_id", testProject.id)
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", stageSlug)
      .eq("resource_type", FileType.RenderedDocument)
      .eq("source_contribution_id", actualRootContributionId)
      .maybeSingle();

    assert(!resourceError, `Failed to query rendered document resource: ${resourceError?.message}`);
    assertExists(renderedResource, "Rendered document resource should exist");
    assertExists(renderedResource.storage_path, "Rendered document resource should have storage_path");
    assertExists(renderedResource.file_name, "Rendered document resource should have file_name");

    // Deconstruct the rendered document path
    const deconstructedRendered = deconstructStoragePath({
      storageDir: renderedResource.storage_path,
      fileName: renderedResource.file_name,
    });

    // Verify the rendered document filename uses antithesis pattern with fragment
    // Expected pattern: {modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}_critique.md
    assert(
      renderedResource.file_name.includes("critiquing"),
      `Rendered document filename should use critiquing pattern. Actual filename: ${renderedResource.file_name}`
    );
    assert(
      renderedResource.file_name.includes(sourceAnchorModelSlug),
      `Rendered document filename should include sourceAnchorModelSlug '${sourceAnchorModelSlug}'. Actual filename: ${renderedResource.file_name}`
    );

    // Verify fragment is present in rendered document filename
    assertExists(
      deconstructedRendered.sourceGroupFragment,
      `Rendered document filename should contain fragment. Filename: ${renderedResource.file_name}`
    );
    assertEquals(
      deconstructedRendered.sourceGroupFragment,
      expectedFragment,
      `Rendered document fragment should match expected value. Expected: ${expectedFragment}, Actual: ${deconstructedRendered.sourceGroupFragment}`
    );

    // Verify sourceAnchorModelSlug is present in deconstructed rendered document path
    assertExists(
      deconstructedRendered.sourceAnchorModelSlug,
      `Rendered document path should extract sourceAnchorModelSlug. Filename: ${renderedResource.file_name}`
    );
    assertEquals(
      deconstructedRendered.sourceAnchorModelSlug,
      sourceAnchorModelSlug,
      `Rendered document sourceAnchorModelSlug should equal '${sourceAnchorModelSlug}'. Actual: ${deconstructedRendered.sourceAnchorModelSlug}`
    );
  });
});


