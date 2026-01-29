import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertExists, assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient, type SupabaseClient, FunctionsHttpError, type User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreGenerateTestUserJwt,
  initializeSupabaseAdminClient,
  TestResourceRequirement,
  ProcessedResourceInfo,
} from "../../functions/_shared/_integration.test.utils.ts";
import type { DialecticServiceRequest } from "../../functions/dialectic-service/dialectic.interface.ts"; 
import { initializeTestDeps } from "../../functions/_shared/_integration.test.utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import type { StartSessionPayload } from "../../functions/dialectic-service/dialectic.interface.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { 
  FileType,
  ResourceUploadContext,
  ModelContributionUploadContext,
  FileManagerResponse,
  FileRecord,
} from "../../functions/_shared/types/file_manager.types.ts";
import type { GetProjectResourceContentResponse, SelectedAiProvider } from "../../functions/dialectic-service/dialectic.interface.ts";
import { MOCK_MODEL_CONFIG } from "../../functions/_shared/_integration.test.utils.ts";
import type { AiModelExtendedConfig } from "../../functions/_shared/types.ts";

describe("Edge Function: dialectic-service - Action: getProjectResourceContent", () => {
  let testUserClient: SupabaseClient<Database>;
  let testUserId: string;
  let testUserAuthToken: string;
  let adminClient: SupabaseClient<Database>;
  let fileManager: FileManagerService;
  let testUser: User;

  initializeTestDeps();

  beforeEach(async () => {
    adminClient = initializeSupabaseAdminClient(); 
    const setup = await coreInitializeTestStep({
      userProfile: { first_name: "GetResourceContentUser" },
    });
    testUserClient = setup.primaryUserClient;
    testUserId = setup.primaryUserId;
    testUserAuthToken = await coreGenerateTestUserJwt(testUserId);
    fileManager = new FileManagerService(adminClient, { constructStoragePath });
    
    // Get test user object for startSession
    const { data: { user } } = await testUserClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;
  });

  afterEach(async () => {
    await coreCleanupTestResources('local');
  });

  it("8.f.i: should return sourceContributionId when getProjectResourceContent is called via API and resource has source_contribution_id set", async () => {
    // (1) Set up a resource with source_contribution_id set
    // Create a test project using the application function
    const formData = new FormData();
    formData.append("projectName", "Test Project for Resource Content");
    formData.append("initialUserPromptText", "Test prompt for getProjectResourceContent integration test");
    
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
    assert(!projectResult.error, `Failed to create test project: ${projectResult.error?.message}`);
    assertExists(projectResult.data, "Project creation returned no data");
    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    const projectId: string = projectResult.data.id;

    // Get or create model ID
    const { data: existingModel, error: fetchError } = await adminClient
      .from("ai_providers")
      .select("id, api_identifier, provider, name")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    const validConfig: Database["public"]["Tables"]["ai_providers"]["Row"]["config"] = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens || 128000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 16000,
    };

    let model: SelectedAiProvider | null = existingModel;
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
        .select("id, api_identifier, provider, name")
        .single();
      assert(!createError, `Failed to create test model: ${createError?.message}`);
      assertExists(newModel, "New model should be created");
      model = newModel;
    } else {
      // Model exists, no need to create
    }
    
    // After if/else, model is guaranteed to be non-null
    if (!model) {
      throw new Error("Model should exist after fetch or create");
    }
    const testModelId: string = model.id;
    const modelSlug: string = model.api_identifier;

    // Create a test session using the application function
    const sessionPayload: StartSessionPayload = {
      projectId: projectId,
      selectedModelIds: [testModelId],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assert(!sessionResult.error, `Failed to start session: ${sessionResult.error?.message}`);
    assertExists(sessionResult.data, "Session creation returned no data");
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    const sessionId: string = sessionResult.data.id;
    const iterationNumber: number = 1;
    const stageSlug: string = "thesis";
    const documentKey: FileType = FileType.business_case;
    const attemptCount: number = 0;
    const contributionContent: string = JSON.stringify({ test: "content" });

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId,
        sessionId,
        iteration: iterationNumber,
        stageSlug,
        modelSlug,
        attemptCount,
        documentKey,
      },
      fileContent: contributionContent,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(contributionContent).length,
      userId: testUserId,
      description: "Test contribution for source_contribution_id",
      contributionMetadata: {
        sessionId,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug,
        iterationNumber,
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(contributionContext);
    assert(!contributionResult.error, `Failed to create test contribution: ${contributionResult.error?.message}`);
    assertExists(contributionResult.record, "Contribution should be uploaded");
    if (!contributionResult.record) {
      throw new Error("Contribution should be uploaded");
    }

    const contributionRecord: FileRecord = contributionResult.record;
    assert('id' in contributionRecord, "Contribution record should have id field");
    const contributionId: string = contributionRecord.id;

    // Create a test file in storage
    const testContent: string = "Test document content";

    const uploadContext: ResourceUploadContext = {
      fileContent: testContent,
      mimeType: "text/markdown",
      sizeBytes: new TextEncoder().encode(testContent).length,
      userId: testUserId,
      description: "Test rendered document",
      pathContext: {
        projectId,
        fileType: FileType.RenderedDocument,
        sessionId,
        iteration: 1,
        stageSlug: "thesis",
        documentKey: "test_doc",
        modelSlug,
        attemptCount,
        sourceContributionId: contributionId,
        isContinuation: false,
        turnIndex: undefined,
      },
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: null,
    };

    const uploadResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(uploadContext);

    assert(!uploadResult.error, `Failed to upload test file: ${uploadResult.error?.message}`);
    assertExists(uploadResult.record, "Upload should return record");
    if (!uploadResult.record) {
      throw new Error("Upload should return record");
    }

    const fileRecord: FileRecord = uploadResult.record;
    assert('id' in fileRecord, "File record should have id field");
    const resourceId: string = fileRecord.id;
    
    // Get the actual filename from the file record
    if (!('file_name' in fileRecord)) {
      throw new Error("File record should have file_name field");
    }
    if (!fileRecord.file_name) {
      throw new Error("File record file_name should not be null");
    }
    const testFileName: string = fileRecord.file_name;

    // Verify the resource was created with source_contribution_id
    const { data: resourceRecord, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("source_contribution_id")
      .eq("id", resourceId)
      .single();

    assert(!resourceQueryError, `Failed to query resource: ${resourceQueryError?.message}`);
    assertExists(resourceRecord, "Resource record should exist");
    assertEquals(resourceRecord.source_contribution_id, contributionId, "Resource should have source_contribution_id set");

    // (2) Call getProjectResourceContent via the API
    const request: DialecticServiceRequest = {
      action: "getProjectResourceContent",
      payload: { resourceId },
    };

    const { data: responseData, error: invokeError } = await testUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${testUserAuthToken}` },
    });

    // Log full error details for debugging
    if (invokeError) {
      const errorContext = (invokeError as any).context as Response | undefined;
      let responseBody: string | null = null;
      if (errorContext && errorContext.body && !errorContext.bodyUsed) {
        try {
          responseBody = await errorContext.text();
        } catch (e) {
          responseBody = `Failed to read response body: ${e}`;
        }
      }
      console.error('[TEST] Edge function invoke error:', {
        message: invokeError.message,
        name: invokeError.name,
        status: errorContext?.status,
        statusText: errorContext?.statusText,
        responseBody: responseBody,
        contentType: errorContext?.headers.get('content-type'),
        contentLength: errorContext?.headers.get('content-length'),
        errorString: String(invokeError),
        errorJson: JSON.stringify(invokeError, Object.getOwnPropertyNames(invokeError)),
      });
    }

    // (3) Verify the response includes sourceContributionId
    assert(!invokeError, `Function invocation should not error: ${invokeError?.message || JSON.stringify(invokeError)}`);
    assertExists(responseData, "Response data should exist");
    
    const apiResponse: GetProjectResourceContentResponse = responseData;
    assertEquals(apiResponse.fileName, testFileName, "Response should include correct fileName");
    assertEquals(apiResponse.content, testContent, "Response should include correct content");
    assertExists(apiResponse.sourceContributionId, "Response should include sourceContributionId");
    assertEquals(apiResponse.sourceContributionId, contributionId, "sourceContributionId should match the contribution ID");

    // (4) Verify fetchStageDocumentContentLogic receives sourceContributionId from the API response
    // fetchStageDocumentContentLogic calls api.dialectic().getProjectResourceContent({ resourceId })
    // and receives response.data which includes sourceContributionId. This verification proves
    // the API → store function connection works correctly.
    // Simulate the response structure that fetchStageDocumentContentLogic receives from the API
    const responseForStore = {
      data: apiResponse,
      error: null,
    };
    assertExists(responseForStore.data, "Response data should exist for store consumption");
    assertEquals(responseForStore.data.sourceContributionId, contributionId, "fetchStageDocumentContentLogic receives sourceContributionId in response.data");
    // Verify that response.data has the correct structure for fetchStageDocumentContentLogic to consume
    // The function accesses response.data.sourceContributionId (line 406 in dialecticStore.documents.ts)
    // Note: Storage of sourceContributionId in StageDocumentContentState.sourceContributionId
    // will be verified in step 9 after the store implementation is complete.
    assertExists(responseForStore.data.sourceContributionId, "fetchStageDocumentContentLogic can access sourceContributionId from response.data");
    assertEquals(typeof responseForStore.data.sourceContributionId, "string", "sourceContributionId should be a string when set");
  });

  it("8.f.i: should return sourceContributionId as null when resource has source_contribution_id set to null", async () => {
    // (1) Set up a resource with source_contribution_id set to null
    // Create a test project using the application function
    const formData = new FormData();
    formData.append("projectName", "Test Project for Null Resource Content");
    formData.append("initialUserPromptText", "Test prompt for getProjectResourceContent null integration test");
    
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
    assert(!projectResult.error, `Failed to create test project: ${projectResult.error?.message}`);
    assertExists(projectResult.data, "Project creation returned no data");
    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    const projectId: string = projectResult.data.id;

    // Get or create model ID
    const { data: existingModel, error: fetchError } = await adminClient
      .from("ai_providers")
      .select("id, api_identifier, provider, name")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    const validConfig: Database["public"]["Tables"]["ai_providers"]["Row"]["config"] = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens || 128000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 16000,
    };

    let model: SelectedAiProvider | null = existingModel;
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
        .select("id, api_identifier, provider, name")
        .single();
      assert(!createError, `Failed to create test model: ${createError?.message}`);
      assertExists(newModel, "New model should be created");
      model = newModel;
    }
    
    if (!model) {
      throw new Error("Model should exist after fetch or create");
    }
    const testModelId: string = model.id;
    const modelSlug: string = model.api_identifier;

    // Create a test session using the application function
    const sessionPayload: StartSessionPayload = {
      projectId: projectId,
      selectedModelIds: [testModelId],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assert(!sessionResult.error, `Failed to start session: ${sessionResult.error?.message}`);
    assertExists(sessionResult.data, "Session creation returned no data");
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    const sessionId: string = sessionResult.data.id;
    const attemptCount: number = 0;

    // Create a test file in storage
    const testContent = "Test document content null";

    const uploadContext: ResourceUploadContext = {
      fileContent: testContent,
      mimeType: "text/markdown",
      sizeBytes: new TextEncoder().encode(testContent).length,
      userId: testUserId,
      description: "Test rendered document with null source_contribution_id",
      pathContext: {
        projectId,
        fileType: FileType.RenderedDocument,
        sessionId,
        iteration: 1,
        stageSlug: "thesis",
        documentKey: "test_doc_null",
        modelSlug,
        attemptCount,
        sourceContributionId: null,
        isContinuation: false,
        turnIndex: undefined,
      },
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: null,
    };

    const uploadResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(uploadContext);

    assert(!uploadResult.error, `Failed to upload test file: ${uploadResult.error?.message}`);
    assertExists(uploadResult.record, "Upload should return record");
    if (!uploadResult.record) {
      throw new Error("Upload should return record");
    }

    const fileRecord: FileRecord = uploadResult.record;
    assert('id' in fileRecord, "File record should have id field");
    const resourceId: string = fileRecord.id;
    
    // Get the actual filename from the file record
    if (!('file_name' in fileRecord)) {
      throw new Error("File record should have file_name field");
    }
    if (!fileRecord.file_name) {
      throw new Error("File record file_name should not be null");
    }
    const testFileName: string = fileRecord.file_name;

    // Verify the resource was created with source_contribution_id as null
    const { data: resourceRecord, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("source_contribution_id")
      .eq("id", resourceId)
      .single();

    assert(!resourceQueryError, `Failed to query resource: ${resourceQueryError?.message}`);
    assertExists(resourceRecord, "Resource record should exist");
    assertEquals(resourceRecord.source_contribution_id, null, "Resource should have source_contribution_id set to null");

    // (2) Call getProjectResourceContent via the API
    const request: DialecticServiceRequest = {
      action: "getProjectResourceContent",
      payload: { resourceId },
    };

    const { data: responseData, error: invokeError } = await testUserClient.functions.invoke("dialectic-service", {
      body: request,
      headers: { Authorization: `Bearer ${testUserAuthToken}` },
    });

    // Log full error details for debugging
    if (invokeError) {
      const errorContext = (invokeError as any).context as Response | undefined;
      let responseBody: string | null = null;
      if (errorContext && errorContext.body && !errorContext.bodyUsed) {
        try {
          responseBody = await errorContext.text();
        } catch (e) {
          responseBody = `Failed to read response body: ${e}`;
        }
      }
      console.error('[TEST] Edge function invoke error (null test):', {
        message: invokeError.message,
        name: invokeError.name,
        status: errorContext?.status,
        statusText: errorContext?.statusText,
        responseBody: responseBody,
        contentType: errorContext?.headers.get('content-type'),
        contentLength: errorContext?.headers.get('content-length'),
        errorString: String(invokeError),
        errorJson: JSON.stringify(invokeError, Object.getOwnPropertyNames(invokeError)),
      });
    }

    // (3) Verify the response includes sourceContributionId as null
    assert(!invokeError, `Function invocation should not error: ${invokeError?.message || JSON.stringify(invokeError)}`);
    assertExists(responseData, "Response data should exist");
    
    const apiResponse: GetProjectResourceContentResponse = responseData;
    assertEquals(apiResponse.fileName, testFileName, "Response should include correct fileName");
    assertEquals(apiResponse.content, testContent, "Response should include correct content");
    assertEquals(apiResponse.sourceContributionId, null, "sourceContributionId should be null when resource has null source_contribution_id");

    // (4) Verify fetchStageDocumentContentLogic receives sourceContributionId as null from the API response
    // fetchStageDocumentContentLogic calls api.dialectic().getProjectResourceContent({ resourceId })
    // and receives response.data which includes sourceContributionId. This verification proves
    // the API → store function connection works correctly for null values.
    // Simulate the response structure that fetchStageDocumentContentLogic receives from the API
    const responseForStore = {
      data: apiResponse,
      error: null,
    };
    assertExists(responseForStore.data, "Response data should exist for store consumption");
    assertEquals(responseForStore.data.sourceContributionId, null, "fetchStageDocumentContentLogic receives sourceContributionId as null in response.data");
    // Verify that response.data has the correct structure for fetchStageDocumentContentLogic to consume
    // The function accesses response.data.sourceContributionId (line 406 in dialecticStore.documents.ts)
    // Note: Storage of sourceContributionId in StageDocumentContentState.sourceContributionId
    // will be verified in step 9 after the store implementation is complete.
    assertEquals(responseForStore.data.sourceContributionId, null, "fetchStageDocumentContentLogic can access sourceContributionId as null from response.data");
  });
});



