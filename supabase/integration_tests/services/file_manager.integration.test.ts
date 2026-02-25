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
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage, uploadToStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { FileType, ModelContributionUploadContext, ResourceUploadContext } from "../../functions/_shared/types/file_manager.types.ts";
import { isDialecticContribution } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";

describe("FileManagerService Integration Tests", () => {
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

    fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });

    // Create test project using FormData
    const formData = new FormData();
    formData.append("projectName", "FileManagerService Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for file_manager integration test");
    
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

  it("should save root and continuation chunk raw JSON files to separate storage paths without collision", async () => {
    // Producer Setup: Create root chunk context
    const stageSlug = "thesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const rootJsonContent = JSON.stringify({
      content: "# Root Chunk Content\n\nThis is the root chunk content."
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
      description: "Root chunk raw JSON for file_manager integration test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: "Test Model",
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        contributionType: "thesis",
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

    // Producer Setup: Create continuation chunk context
    const continuationJsonContent = JSON.stringify({
      content: "\n\n## Continuation Chunk Content\n\nThis is the continuation chunk content."
    });

    if(!rootContribution) {
      throw new Error("Root contribution not found");
    }
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
      description: "Continuation chunk raw JSON for file_manager integration test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: "Test Model",
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        contributionType: "thesis",
        target_contribution_id: rootContribution.id,
        tokensUsedInput: 100,
        tokensUsedOutput: 200,
        processingTimeMs: 500,
      },
    };

    // Test Subject: Upload continuation chunk
    const continuationUploadResult = await fileManager.uploadAndRegisterFile(continuationContext);
    assert(!continuationUploadResult.error, `Continuation chunk upload failed: ${continuationUploadResult.error?.message}`);
    assertExists(continuationUploadResult.record, "Continuation chunk upload should return a record");
    assert(isDialecticContribution(continuationUploadResult.record), "Continuation chunk upload should return a dialectic_contribution");
    const continuationContribution = continuationUploadResult.record;

    // Consumer Assertion: Query database to get both contribution records
    const { data: rootRecord, error: rootQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("id, raw_response_storage_path, storage_bucket")
      .eq("id", rootContribution.id)
      .single();
    assert(!rootQueryError, `Failed to query root contribution: ${rootQueryError?.message}`);
    assertExists(rootRecord, "Root contribution record should exist");
    assertExists(rootRecord.raw_response_storage_path, "Root contribution should have raw_response_storage_path");
    assertExists(rootRecord.storage_bucket, "Root contribution should have storage_bucket");

    if(!continuationContribution) {
      throw new Error("Continuation contribution not found");
    }
    const { data: continuationRecord, error: continuationQueryError } = await adminClient
      .from("dialectic_contributions")
      .select("id, raw_response_storage_path, storage_bucket")
      .eq("id", continuationContribution.id)
      .single();
    assert(!continuationQueryError, `Failed to query continuation contribution: ${continuationQueryError?.message}`);
    assertExists(continuationRecord, "Continuation contribution record should exist");
    assertExists(continuationRecord.raw_response_storage_path, "Continuation contribution should have raw_response_storage_path");
    assertExists(continuationRecord.storage_bucket, "Continuation contribution should have storage_bucket");

    // Consumer Assertion: Verify root chunk path does NOT contain /_work/ and does NOT contain _continuation_
    const rootPath = rootRecord.raw_response_storage_path;
    assert(!rootPath.includes("/_work/"), `Root chunk path should not contain '/_work/', got: ${rootPath}`);
    assert(!rootPath.includes("_continuation_"), `Root chunk path should not contain '_continuation_', got: ${rootPath}`);

    // Consumer Assertion: Verify continuation chunk path DOES contain /_work/raw_responses/ and DOES contain _continuation_1
    const continuationPath = continuationRecord.raw_response_storage_path;
    assert(continuationPath.includes("/_work/raw_responses/"), `Continuation chunk path should contain '/_work/raw_responses/', got: ${continuationPath}`);
    assert(continuationPath.includes("_continuation_1"), `Continuation chunk path should contain '_continuation_1', got: ${continuationPath}`);

    // Consumer Assertion: Download root chunk file from storage
    const rootBucket = rootRecord.storage_bucket;
    if (!rootBucket) {
      throw new Error("Root contribution storage_bucket is missing");
    }
    const rootFileResult = await downloadFromStorage(adminClient, rootBucket, rootPath);
    assert(!rootFileResult.error, `Failed to download root chunk file from bucket '${rootBucket}' at path '${rootPath}': ${rootFileResult.error?.message}`);
    assertExists(rootFileResult.data, "Root chunk file should exist in storage");
    if(!rootFileResult.data) {
      throw new Error("Root chunk file not found in storage");
    }
    const rootFileContent = new TextDecoder().decode(rootFileResult.data);

    // Consumer Assertion: Verify root chunk file contains valid JSON (single object, not concatenated)
    let rootParsedJson: unknown;
    try {
      rootParsedJson = JSON.parse(rootFileContent);
    } catch (parseError) {
      throw new Error(`Root chunk file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}. Content: ${rootFileContent.substring(0, 200)}`);
    }
    assert(typeof rootParsedJson === "object" && rootParsedJson !== null && !Array.isArray(rootParsedJson), `Root chunk file should contain a single JSON object, got: ${typeof rootParsedJson}`);

    // Consumer Assertion: Download continuation chunk file from storage
    const continuationBucket = continuationRecord.storage_bucket;
    if (!continuationBucket) {
      throw new Error("Continuation contribution storage_bucket is missing");
    }
    const continuationFileResult = await downloadFromStorage(adminClient, continuationBucket, continuationPath);
    assert(!continuationFileResult.error, `Failed to download continuation chunk file from bucket '${continuationBucket}' at path '${continuationPath}': ${continuationFileResult.error?.message}`);
    assertExists(continuationFileResult.data, "Continuation chunk file should exist in storage");
    if(!continuationFileResult.data) {
      throw new Error("Continuation chunk file not found in storage");
    }
    const continuationFileContent = new TextDecoder().decode(continuationFileResult.data);

    // Consumer Assertion: Verify continuation chunk file contains valid JSON (single object, not concatenated)
    let continuationParsedJson: unknown;
    try {
      continuationParsedJson = JSON.parse(continuationFileContent);
    } catch (parseError) {
      throw new Error(`Continuation chunk file does not contain valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}. Content: ${continuationFileContent.substring(0, 200)}`);
    }
    assert(typeof continuationParsedJson === "object" && continuationParsedJson !== null && !Array.isArray(continuationParsedJson), `Continuation chunk file should contain a single JSON object, got: ${typeof continuationParsedJson}`);

    // Consumer Assertion: Verify root and continuation chunk file contents are different
    assert(rootFileContent !== continuationFileContent, "Root and continuation chunk files should have different content (proving they are separate files)");

    // Consumer Assertion: Verify root chunk file content matches original root JSON content
    assertEquals(rootFileContent, rootJsonContent, "Root chunk file content should match the original root JSON content");

    // Consumer Assertion: Verify continuation chunk file content matches original continuation JSON content
    assertEquals(continuationFileContent, continuationJsonContent, "Continuation chunk file content should match the original continuation JSON content");
  });

  it("cleanup on DB error removes only the specific uploaded file", async () => {
    const bucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
    assert(bucket, "SB_CONTENT_STORAGE_BUCKET must be set for integration tests");

    const nonExistentProjectId = "00000000-0000-0000-0000-000000000001";
    const context: ResourceUploadContext = {
      pathContext: {
        fileType: FileType.GeneralResource,
        projectId: nonExistentProjectId,
        sessionId: testSession.id,
        stageSlug: "thesis",
        iteration: 1,
        originalFileName: "cleanup_integration_test.txt",
      },
      fileContent: "content that will be cleaned up",
      mimeType: "text/plain",
      sizeBytes: 32,
      userId: testUserId,
      description: "Integration test for cleanup on DB error",
    };

    const pathParts = constructStoragePath(context.pathContext);
    const expectedFullPath = `${pathParts.storagePath}/${pathParts.fileName}`;

    const result = await fileManager.uploadAndRegisterFile(context);
    assert(result.error, "Expected DB insert to fail (invalid project_id FK) and return error");
    assertEquals(result.record, null);

    const downloadResult = await downloadFromStorage(adminClient, bucket, expectedFullPath);
    assert(downloadResult.error, "Uploaded file should have been removed by cleanup; download should fail");
  });

  it("pre-existing sibling file survives cleanup after DB error", async () => {
    const bucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
    assert(bucket, "SB_CONTENT_STORAGE_BUCKET must be set for integration tests");

    const nonExistentProjectId = "00000000-0000-0000-0000-000000000002";
    const pathParts = constructStoragePath({
      fileType: FileType.GeneralResource,
      projectId: nonExistentProjectId,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iteration: 1,
      originalFileName: "placeholder.txt",
    });
    const siblingPath = `${pathParts.storagePath}/seed_prompt.md`;
    const siblingContent = "sibling file that must survive cleanup";

    const uploadSiblingResult = await uploadToStorage(
      adminClient,
      bucket,
      siblingPath,
      siblingContent,
      { contentType: "text/markdown", upsert: true }
    );
    assert(!uploadSiblingResult.error, `Failed to upload sibling file: ${uploadSiblingResult.error?.message}`);
    assertExists(uploadSiblingResult.path);

    const context: ResourceUploadContext = {
      pathContext: {
        fileType: FileType.GeneralResource,
        projectId: nonExistentProjectId,
        sessionId: testSession.id,
        stageSlug: "thesis",
        iteration: 1,
        originalFileName: "cleanup_sibling_test.txt",
      },
      fileContent: "uploaded file that will be removed on DB error",
      mimeType: "text/plain",
      sizeBytes: 44,
      userId: testUserId,
      description: "Integration test for sibling preservation",
    };

    const result = await fileManager.uploadAndRegisterFile(context);
    assert(result.error, "Expected DB insert to fail and return error");
    assertEquals(result.record, null);

    const siblingDownloadResult = await downloadFromStorage(adminClient, bucket, siblingPath);
    if(!siblingDownloadResult.data) {
      throw new Error("Sibling file not found in storage");
    }
    assert(!siblingDownloadResult.error, "Sibling file must still exist after cleanup");
    assertExists(siblingDownloadResult.data);
    assertEquals(
      new TextDecoder().decode(siblingDownloadResult.data),
      siblingContent,
      "Sibling file content must be unchanged"
    );

    const removedFilePath = `${pathParts.storagePath}/cleanup_sibling_test.txt`;
    const removedDownloadResult = await downloadFromStorage(adminClient, bucket, removedFilePath);
    assert(removedDownloadResult.error, "Uploaded file should have been removed by cleanup");
  });
});

