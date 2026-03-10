import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assert,
  assertExists,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../functions/types_db.ts";
import {
  coreCleanupTestResources,
  coreInitializeTestStep,
  initializeSupabaseAdminClient,
  MOCK_MODEL_CONFIG,
  testLogger,
} from "../../functions/_shared/_integration.test.utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import {
  downloadFromStorage,
  uploadToStorage,
} from "../../functions/_shared/supabase_storage_utils.ts";
import {
  FileType,
  type FileRecord,
  type FileManagerResponse,
  type ModelContributionUploadContext,
  type ResourceUploadContext,
} from "../../functions/_shared/types/file_manager.types.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import type {
  DialecticProject,
  StartSessionPayload,
  StartSessionSuccessResponse,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { submitStageDocumentFeedback } from "../../functions/dialectic-service/submitStageDocumentFeedback.ts";
import type { SubmitStageDocumentFeedbackPayload } from "../../functions/dialectic-service/dialectic.interface.ts";
import { initializeTestDeps } from "../../functions/_shared/_integration.test.utils.ts";

describe("submitStageDocumentFeedback integration", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let fileManager: FileManagerService;
  let testModelId: string;

  beforeEach(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    const setup = await coreInitializeTestStep(
      { userProfile: { first_name: "SubmitFeedbackUser" } },
      "local",
    );
    testUserId = setup.primaryUserId;
    const { data: { user } } = await setup.primaryUserClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    fileManager = new FileManagerService(adminClient, {
      constructStoragePath,
      logger: testLogger,
    });

    const formData = new FormData();
    formData.append("projectName", "SubmitFeedback Integration Test Project");
    formData.append(
      "initialUserPromptText",
      "Test prompt for submitStageDocumentFeedback integration test",
    );
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    assert(
      !projectResult.error,
      `Failed to create test project: ${projectResult.error?.message}`,
    );
    assertExists(projectResult.data, "Project creation returned no data");
    if (!projectResult.data) throw new Error("Project creation returned no data");
    testProject = projectResult.data;

    const { data: existingModel, error: fetchError } = await adminClient
      .from("ai_providers")
      .select("id, api_identifier")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();

    const validConfig: Database["public"]["Tables"]["ai_providers"]["Row"]["config"] = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens ?? 128000,
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
        .select("id, api_identifier")
        .single();
      assert(!createError, `Failed to create test model: ${createError?.message}`);
      assertExists(newModel, "New model should be created");
      model = newModel;
    }
    assertExists(model, "Model must exist");
    testModelId = model.id;

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assert(
      !sessionResult.error,
      `Failed to start session: ${sessionResult.error?.message}`,
    );
    assertExists(sessionResult.data, "Session creation returned no data");
    if (!sessionResult.data) throw new Error("Session creation returned no data");
    testSession = sessionResult.data;
  });

  afterEach(async () => {
    await coreCleanupTestResources("local");
  });

  it("feedback file created alongside original rendered document", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;
    const documentKey = FileType.business_case;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug,
        modelSlug,
        attemptCount,
        documentKey,
      },
      fileContent: JSON.stringify({ content: "chunk" }),
      mimeType: "application/json",
      sizeBytes: 24,
      userId: testUserId,
      description: "Contribution for feedback test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug,
        iterationNumber,
        contributionType: "thesis",
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(
      contributionContext,
    );
    assert(
      !contributionResult.error,
      `Contribution upload failed: ${contributionResult.error?.message}`,
    );
    assertExists(contributionResult.record, "Contribution record required");
    if (!contributionResult.record) throw new Error("Contribution record required");
    const contributionRecord: FileRecord = contributionResult.record;
    assert("id" in contributionRecord, "Contribution must have id");
    const contributionId: string = contributionRecord.id;

    const docContent = "# Rendered document content";
    const uploadContext: ResourceUploadContext = {
      fileContent: docContent,
      mimeType: "text/markdown",
      sizeBytes: new TextEncoder().encode(docContent).length,
      userId: testUserId,
      description: "Rendered document for feedback test",
      pathContext: {
        projectId: testProject.id,
        fileType: FileType.RenderedDocument,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug,
        documentKey: "business_case",
        modelSlug,
        attemptCount,
        sourceContributionId: contributionId,
        isContinuation: false,
        turnIndex: undefined,
      },
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: null,
    };

    const docUploadResult = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(
      !docUploadResult.error,
      `Rendered doc upload failed: ${docUploadResult.error?.message}`,
    );
    assertExists(docUploadResult.record, "Rendered doc record required");
    if (!docUploadResult.record) throw new Error("Rendered doc record required");
    const resourceRecord = docUploadResult.record;
    assert("storage_path" in resourceRecord, "Resource must have storage_path");
    assert("file_name" in resourceRecord, "Resource must have file_name");
    const rawPath = resourceRecord.storage_path;
    const rawName = resourceRecord.file_name;
    if (typeof rawPath !== "string" || typeof rawName !== "string") {
      throw new Error("Resource must have storage_path and file_name as strings");
    }
    const originalStoragePath: string = rawPath;
    const originalFileName: string = rawName;
    const originalBaseName = originalFileName.endsWith(".md")
      ? originalFileName.slice(0, -3)
      : originalFileName;

    const feedbackContent = "User feedback for the document.";
    const payload: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey: "business_case",
      modelId: testModelId,
      feedbackContent,
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: contributionId,
    };

    const result = await submitStageDocumentFeedback(
      payload,
      adminClient,
      { fileManager, logger: testLogger },
    );

    assert(!result.error, `submitStageDocumentFeedback failed: ${result.error?.message}`);
    assertExists(result.data, "Feedback record should be returned");

    const bucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
    assertExists(bucket, "SB_CONTENT_STORAGE_BUCKET required");
    const feedbackPath = `${originalStoragePath}/${originalBaseName}_feedback.md`;
    const downloadResult = await downloadFromStorage(
      adminClient,
      bucket,
      feedbackPath,
    );
    assert(
      !downloadResult.error,
      `Feedback file should exist in storage: ${downloadResult.error?.message}`,
    );
    assertExists(downloadResult.data, "Feedback file data required");
    if (!downloadResult.data) throw new Error("Feedback file data required");
    const downloadedContent = new TextDecoder().decode(downloadResult.data);
    assertEquals(downloadedContent, feedbackContent, "Feedback file content must match");
  });

  it("feedback filename is {original}_feedback.md", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;
    const documentKey = FileType.business_case;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug,
        modelSlug,
        attemptCount,
        documentKey,
      },
      fileContent: JSON.stringify({ content: "chunk" }),
      mimeType: "application/json",
      sizeBytes: 24,
      userId: testUserId,
      description: "Contribution for filename test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug,
        iterationNumber,
        contributionType: "thesis",
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult = await fileManager.uploadAndRegisterFile(
      contributionContext,
    );
    assert(!contributionResult.error, String(contributionResult.error?.message));
    assertExists(contributionResult.record);
    if (!contributionResult.record) throw new Error("Contribution record required");
    const contributionId: string = contributionResult.record.id;

    const uploadContext: ResourceUploadContext = {
      fileContent: "# Doc",
      mimeType: "text/markdown",
      sizeBytes: 6,
      userId: testUserId,
      description: "Rendered doc",
      pathContext: {
        projectId: testProject.id,
        fileType: FileType.RenderedDocument,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug,
        documentKey: "business_case",
        modelSlug,
        attemptCount,
        sourceContributionId: contributionId,
        isContinuation: false,
        turnIndex: undefined,
      },
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: null,
    };

    const docResult = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(!docResult.error, String(docResult.error?.message));
    assertExists(docResult.record);
    if (!docResult.record) throw new Error("Rendered doc record required");
    const resourceRecord: FileRecord = docResult.record;
    const rawFileName = resourceRecord.file_name;
    if (typeof rawFileName !== "string") throw new Error("Resource file_name required");
    const originalFileName: string = rawFileName;
    const expectedFeedbackFileName = originalFileName.endsWith(".md")
      ? `${originalFileName.slice(0, -3)}_feedback.md`
      : `${originalFileName}_feedback.md`;

    const payload: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey: "business_case",
      modelId: testModelId,
      feedbackContent: "Feedback",
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: contributionId,
    };

    const result = await submitStageDocumentFeedback(
      payload,
      adminClient,
      { fileManager, logger: testLogger },
    );

    assert(!result.error, String(result.error?.message));
    assertExists(result.data);
    if (!result.data) throw new Error("Feedback record required");
    assert("file_name" in result.data, "Feedback row must have file_name");
    assertEquals(
      result.data.file_name,
      expectedFeedbackFileName,
      "Feedback file_name must be {originalBaseName}_feedback.md",
    );
  });

  it("seed_prompt.md in same stage directory is not affected", async () => {
    const stageSlug = "thesis";
    const iterationNumber = 1;
    const documentKey = FileType.business_case;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: documentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug,
        modelSlug,
        attemptCount,
        documentKey,
      },
      fileContent: JSON.stringify({ content: "chunk" }),
      mimeType: "application/json",
      sizeBytes: 24,
      userId: testUserId,
      description: "Contribution for seed_prompt test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: testModelId,
        modelNameDisplay: modelSlug,
        stageSlug,
        iterationNumber,
        contributionType: "thesis",
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult = await fileManager.uploadAndRegisterFile(
      contributionContext,
    );
    assert(!contributionResult.error, String(contributionResult.error?.message));
    assertExists(contributionResult.record);
    if (!contributionResult.record) throw new Error("Contribution record required");
    const contributionId: string = contributionResult.record.id;

    const uploadContext: ResourceUploadContext = {
      fileContent: "# Rendered",
      mimeType: "text/markdown",
      sizeBytes: 10,
      userId: testUserId,
      description: "Rendered doc",
      pathContext: {
        projectId: testProject.id,
        fileType: FileType.RenderedDocument,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug,
        documentKey: "business_case",
        modelSlug,
        attemptCount,
        sourceContributionId: contributionId,
        isContinuation: false,
        turnIndex: undefined,
      },
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: null,
    };

    const docResult = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(!docResult.error, String(docResult.error?.message));
    assertExists(docResult.record);
    if (!docResult.record) throw new Error("Rendered doc record required");
    const resourceRecord: FileRecord = docResult.record;
    const rawStoragePath = resourceRecord.storage_path;
    if (typeof rawStoragePath !== "string") throw new Error("Resource storage_path required");
    const storagePath: string = rawStoragePath;
    const stageRootPath = storagePath.replace(/\/documents$/, "");

    const bucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
    assertExists(bucket, "SB_CONTENT_STORAGE_BUCKET required");
    const seedPromptPath = `${stageRootPath}/seed_prompt.md`;
    const seedContent = "# Seed prompt content";
    const uploadSeedResult = await uploadToStorage(
      adminClient,
      bucket,
      seedPromptPath,
      seedContent,
      { contentType: "text/markdown", upsert: true },
    );
    assert(!uploadSeedResult.error, `Seed upload failed: ${uploadSeedResult.error?.message}`);

    const payload: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey: "business_case",
      modelId: testModelId,
      feedbackContent: "Feedback",
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: contributionId,
    };

    const result = await submitStageDocumentFeedback(
      payload,
      adminClient,
      { fileManager, logger: testLogger },
    );

    assert(!result.error, String(result.error?.message));

    const seedDownloadResult = await downloadFromStorage(
      adminClient,
      bucket,
      seedPromptPath,
    );
    assert(
      !seedDownloadResult.error,
      `seed_prompt.md should still exist: ${seedDownloadResult.error?.message}`,
    );
    assertExists(seedDownloadResult.data, "seed_prompt.md content required");
    if (!seedDownloadResult.data) throw new Error("seed_prompt.md content required");
    assertEquals(
      new TextDecoder().decode(seedDownloadResult.data),
      seedContent,
      "seed_prompt.md content must be unchanged",
    );
  });
});
