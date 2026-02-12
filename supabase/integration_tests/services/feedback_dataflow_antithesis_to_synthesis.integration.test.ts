import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../functions/types_db.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  testLogger,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import {
  type DialecticProject,
  type DialecticJobRow,
  type DialecticPlanJobPayload,
  ContributionType,
  type InputRule,
  type StartSessionPayload,
  type StartSessionSuccessResponse,
  type SubmitStageDocumentFeedbackPayload,
  type SubmitStageResponsesDependencies,
  type SubmitStageResponsesPayload,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { submitStageDocumentFeedback } from "../../functions/dialectic-service/submitStageDocumentFeedback.ts";
import { getStageDocumentFeedback } from "../../functions/dialectic-service/getStageDocumentFeedback.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { gatherInputsForStage } from "../../functions/_shared/prompt-assembler/gatherInputsForStage.ts";
import type {
  ProjectContext,
  SessionContext,
  StageContext,
} from "../../functions/_shared/prompt-assembler/prompt-assembler.interface.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import type {
  FileManagerResponse,
  FileRecord,
  ModelContributionUploadContext,
  ModelContributionFileTypes,
  ResourceUploadContext,
} from "../../functions/_shared/types/file_manager.types.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { findSourceDocuments } from "../../functions/dialectic-worker/findSourceDocuments.ts";
import { MockIndexingService } from "../../functions/_shared/services/indexing_service.mock.ts";
import { EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { getMockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
import { isJson } from "../../functions/_shared/utils/type_guards.ts";
import { isInputRule } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isContributionType, isDatabaseRecipeSteps } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionFileType } from "../../functions/_shared/utils/type-guards/type_guards.file_manager.ts";
import { mapToStageWithRecipeSteps } from "../../functions/_shared/utils/mappers.ts";

describe("feedback dataflow integration (antithesis → synthesis)", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let fileManager: FileManagerService;
  let renderedA: { contributionId: string };
  let renderedB: { contributionId: string };

  let modelAId: string;
  let modelBId: string;
  let antithesisStageId: string;

  const stageSlug = "antithesis";
  const antithesisContributionType: ContributionType = "antithesis";
  const nextStageSlug = "synthesis";
  const iterationNumber = 1;
  const documentKey = FileType.business_case_critique;
  const modelASlug = "mock-model-a";
  const modelBSlug = "mock-model-b";
  let renderedA_for_step1: { contributionId: string };
  let renderedB_for_step1: { contributionId: string };

  function createSubmitDeps(): SubmitStageResponsesDependencies {
    const indexingService = new MockIndexingService();
    const validMockConfig = { ...MOCK_MODEL_CONFIG, output_token_cost_rate: 0.001 };
    const { instance: mockAdapter } = getMockAiProviderAdapter(testLogger, validMockConfig);
    const adapterWithEmbedding = {
      ...mockAdapter,
      getEmbedding: async (_text: string) => ({
        embedding: Array(1536).fill(0.1),
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    };
    const embeddingClient = new EmbeddingClient(adapterWithEmbedding);
    return {
      logger: testLogger,
      fileManager,
      downloadFromStorage,
      indexingService,
      embeddingClient,
    };
  }

  async function ensureAiProvider(apiIdentifier: string): Promise<string> {
    const { data: existingModel, error: fetchError } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", apiIdentifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    assert(!fetchError, `Failed to query ai_providers: ${fetchError?.message}`);

    const validConfig: Database["public"]["Tables"]["ai_providers"]["Row"]["config"] = {
      api_identifier: apiIdentifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens ?? 128000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 16000,
    };

    if (existingModel && typeof existingModel.id === "string" && existingModel.id.length > 0) {
      return existingModel.id;
    }

    const { data: newModel, error: createError } = await adminClient
      .from("ai_providers")
      .insert({
        api_identifier: apiIdentifier,
        provider: "test-provider",
        name: `Test Model (${apiIdentifier})`,
        config: validConfig,
        is_active: true,
        is_enabled: true,
      })
      .select("id")
      .single();
    assert(!createError, `Failed to create ai_provider: ${createError?.message}`);
    assertExists(newModel, "New model should be created");
    assertExists(newModel.id, "New model record should have an id");
    return newModel.id;
  }

  async function createRenderedDocumentForModel(
    modelId: string,
    modelSlug: string,
    contentMarkdown: string,
    renderedStageSlug: string,
    renderedDocumentKey: ModelContributionFileTypes,
  ): Promise<{ contributionId: string }> {
    const attemptCount = 0;

    const contributionContext: ModelContributionUploadContext = {
      pathContext: {
        fileType: renderedDocumentKey,
        projectId: testProject.id,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: renderedStageSlug,
        modelSlug,
        attemptCount,
        documentKey: renderedDocumentKey,
      },
      fileContent: JSON.stringify({ content: "chunk" }),
      mimeType: "application/json",
      sizeBytes: 24,
      userId: testUserId,
      description: "Contribution for feedback dataflow test",
      contributionMetadata: {
        sessionId: testSession.id,
        modelIdUsed: modelId,
        modelNameDisplay: modelSlug,
        stageSlug: renderedStageSlug,
        iterationNumber,
        contributionType: antithesisContributionType,
        editVersion: 1,
        isLatestEdit: true,
      },
    };

    const contributionResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(
      contributionContext,
    );
    assert(!contributionResult.error, `Contribution upload failed: ${contributionResult.error?.message}`);
    assertExists(contributionResult.record, "Contribution record required");
    if (!contributionResult.record) throw new Error("Contribution record required");
    const contributionRecord: FileRecord = contributionResult.record;
    assert("id" in contributionRecord, "Contribution must have id");
    const contributionId: string = contributionRecord.id;

    const uploadContext: ResourceUploadContext = {
      fileContent: contentMarkdown,
      mimeType: "text/markdown",
      sizeBytes: new TextEncoder().encode(contentMarkdown).length,
      userId: testUserId,
      description: "Rendered document for feedback dataflow test",
      pathContext: {
        projectId: testProject.id,
        fileType: FileType.RenderedDocument,
        sessionId: testSession.id,
        iteration: iterationNumber,
        stageSlug: renderedStageSlug,
        documentKey: renderedDocumentKey,
        modelSlug,
        attemptCount,
        sourceContributionId: contributionId,
        isContinuation: false,
        turnIndex: undefined,
      },
      resourceTypeForDb: "rendered_document",
      resourceDescriptionForDb: {
        document_key: renderedDocumentKey,
      },
    };

    const docUploadResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(
      uploadContext,
    );
    assert(!docUploadResult.error, `Rendered doc upload failed: ${docUploadResult.error?.message}`);
    assertExists(docUploadResult.record, "Rendered doc record required");

    return { contributionId };
  }

  async function seedSynthesisPreconditions(): Promise<void> {
    const { data: synthesisStage, error: stageError } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", nextStageSlug)
      .single();
    assert(!stageError, `Failed to fetch synthesis stage: ${stageError?.message}`);
    assertExists(
      synthesisStage?.active_recipe_instance_id,
      "synthesis stage must have active_recipe_instance_id",
    );

    const instanceId: string = synthesisStage.active_recipe_instance_id;
    const { data: recipeSteps, error: recipeError } = await adminClient
      .from("dialectic_stage_recipe_steps")
      .select("inputs_required")
      .eq("instance_id", instanceId)
      .order("execution_order", { ascending: true });
    assert(!recipeError, `Failed to fetch synthesis recipe steps: ${recipeError?.message}`);
    assertExists(recipeSteps, "synthesis recipe steps must be returned");

    const firstStep = recipeSteps[0];
    assertExists(firstStep, "synthesis recipe must have at least one step");
    const raw = firstStep.inputs_required;
    if (!Array.isArray(raw)) {
      throw new Error("inputs_required must be an array");
    }
    const inputsRequired: InputRule[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (!isInputRule(item)) {
        throw new Error(`Invalid input rule at index ${i} for synthesis first step`);
      }
      inputsRequired.push(item);
    }

    const thesisDocKeys = new Set<ModelContributionFileTypes>();
    const antithesisDocKeys = new Set<ModelContributionFileTypes>();
    const requiredContributions = new Set<ModelContributionFileTypes>();
    const feedbackDocKeys = new Set<ModelContributionFileTypes>();
    const seedPromptSlugs = new Set<string>();
    const headerContextDocumentKeys = new Set<string>();
    for (const input of inputsRequired) {
      if (
        input.type === "document" &&
        input.document_key &&
        isModelContributionFileType(input.document_key) &&
        typeof input.slug === "string"
      ) {
        if (input.slug === "thesis") {
          thesisDocKeys.add(input.document_key);
        } else if (input.slug === "antithesis") {
          antithesisDocKeys.add(input.document_key);
        }
      }
      if (
        input.type === "contribution" &&
        input.document_key &&
        isModelContributionFileType(input.document_key)
      ) {
        requiredContributions.add(input.document_key);
      }
      if (
        input.type === "feedback" &&
        input.document_key &&
        isModelContributionFileType(input.document_key)
      ) {
        feedbackDocKeys.add(input.document_key);
      }
      if (
        input.type === "seed_prompt" &&
        typeof input.slug === "string" &&
        input.slug.length > 0
      ) {
        seedPromptSlugs.add(input.slug);
      }
      if (
        input.type === "header_context" &&
        typeof input.document_key === "string" &&
        input.document_key.length > 0
      ) {
        headerContextDocumentKeys.add(input.document_key);
      }
    }

    if (thesisDocKeys.size > 0) {
      for (const docKey of Array.from(thesisDocKeys)) {
        await createRenderedDocumentForModel(
          modelAId,
          modelASlug,
          `# Seeded thesis doc for ${docKey}`,
          "thesis",
          docKey,
        );
      }
    }

    const antithesisContributionIdByDocKey = new Map<
      ModelContributionFileTypes,
      string
    >();
    if (antithesisDocKeys.size > 0) {
      for (const docKey of Array.from(antithesisDocKeys)) {
        const rendered = await createRenderedDocumentForModel(
          modelAId,
          modelASlug,
          `# Seeded antithesis doc for ${docKey}`,
          "antithesis",
          docKey,
        );
        antithesisContributionIdByDocKey.set(docKey, rendered.contributionId);
      }
    }

    for (const docKey of Array.from(feedbackDocKeys)) {
      const sourceContributionId =
        antithesisContributionIdByDocKey.get(docKey);
      if (!sourceContributionId) continue;
      const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
        sessionId: testSession.id,
        stageSlug,
        iterationNumber,
        documentKey: docKey,
        modelId: modelAId,
        feedbackContent: `Integration test feedback seed for ${docKey}`,
        feedbackType: "user_feedback",
        userId: testUserId,
        projectId: testProject.id,
        sourceContributionId,
      };
      const feedbackResult = await submitStageDocumentFeedback(
        feedbackPayload,
        adminClient,
        { fileManager, logger: testLogger },
      );
      assert(
        !feedbackResult.error,
        `Seed feedback for ${docKey} failed: ${feedbackResult.error?.message}`,
      );
    }

    for (const slug of Array.from(seedPromptSlugs)) {
      const seedContent = "# Seeded seed_prompt for integration test";
      const seedBytes = new TextEncoder().encode(seedContent);
      const seedContext: ResourceUploadContext = {
        pathContext: {
          fileType: FileType.SeedPrompt,
          projectId: testProject.id,
          sessionId: testSession.id,
          iteration: iterationNumber,
          stageSlug: slug,
        },
        fileContent: seedContent,
        mimeType: "text/markdown",
        sizeBytes: seedBytes.byteLength,
        userId: testUserId,
        description: "Seed prompt for synthesis precondition (integration test)",
        resourceTypeForDb: "seed_prompt",
      };
      const seedResult: FileManagerResponse =
        await fileManager.uploadAndRegisterFile(seedContext);
      assert(
        !seedResult.error,
        `Seed prompt upload failed: ${seedResult.error?.message}`,
      );
    }

    if (requiredContributions.size > 0) {
      for (const docKey of Array.from(requiredContributions)) {
        const content = JSON.stringify({ content: `${docKey} seed (integration test)` });
        const bytes = new TextEncoder().encode(content);
        const context: ModelContributionUploadContext = {
          pathContext: {
            fileType: docKey,
            projectId: testProject.id,
            sessionId: testSession.id,
            iteration: iterationNumber,
            stageSlug,
            modelSlug: modelASlug,
            attemptCount: 0,
            documentKey: docKey,
          },
          fileContent: content,
          mimeType: "application/json",
          sizeBytes: bytes.byteLength,
          userId: testUserId,
          description: `${docKey} contribution for synthesis pairwise step (integration test)`,
          contributionMetadata: {
            sessionId: testSession.id,
            modelIdUsed: modelAId,
            modelNameDisplay: modelASlug,
            stageSlug,
            iterationNumber,
            contributionType: antithesisContributionType,
            editVersion: 1,
            isLatestEdit: true,
          },
        };
        const result: FileManagerResponse = await fileManager.uploadAndRegisterFile(context);
        assert(!result.error, `${docKey} upload failed: ${result.error?.message}`);
      }
    }

    headerContextDocumentKeys.add("header_context_pairwise");
    const documentKeys = Array.from(headerContextDocumentKeys);
    for (const documentKeyForHeaderContext of documentKeys) {
      const headerContextContent = JSON.stringify({
        content: `header_context seed (integration test) for ${documentKeyForHeaderContext}`,
      });
      const headerContextBytes = new TextEncoder().encode(headerContextContent);
      const headerContextContributionContext: ModelContributionUploadContext = {
        pathContext: {
          fileType: FileType.HeaderContext,
          projectId: testProject.id,
          sessionId: testSession.id,
          iteration: iterationNumber,
          stageSlug: nextStageSlug,
          modelSlug: modelASlug,
          attemptCount: 0,
          documentKey: documentKeyForHeaderContext,
        },
        fileContent: headerContextContent,
        mimeType: "application/json",
        sizeBytes: headerContextBytes.byteLength,
        userId: testUserId,
        description: "Header context for synthesis prompt assembly (integration test)",
        contributionMetadata: {
          sessionId: testSession.id,
          modelIdUsed: modelAId,
          modelNameDisplay: modelASlug,
          stageSlug: nextStageSlug,
          iterationNumber,
          contributionType: "header_context",
          editVersion: 1,
          isLatestEdit: true,
        },
      };

      const headerContextResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(
        headerContextContributionContext,
      );
      assert(
        !headerContextResult.error,
        `Header context upload failed: ${headerContextResult.error?.message}`,
      );
    }
  }

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

    fileManager = new FileManagerService(adminClient, {
      constructStoragePath,
      logger: testLogger,
    });

    const formData = new FormData();
    formData.append("projectName", `Feedback Dataflow Integration Test Project ${crypto.randomUUID()}`);
    formData.append("initialUserPromptText", "Test prompt for feedback dataflow integration");
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
    if (!projectResult.data) throw new Error("Project creation returned no data");
    testProject = projectResult.data;

    modelAId = await ensureAiProvider(MOCK_MODEL_CONFIG.api_identifier);
    modelBId = await ensureAiProvider(`${MOCK_MODEL_CONFIG.api_identifier}-second`);

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [modelAId, modelBId],
      stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    assert(!sessionResult.error, `Failed to start session: ${sessionResult.error?.message}`);
    assertExists(sessionResult.data, "Session creation returned no data");
    if (!sessionResult.data) throw new Error("Session creation returned no data");
    testSession = sessionResult.data;

    const { data: stages, error: stagesError } = await adminClient
      .from("dialectic_stages")
      .select("id, slug")
      .in("slug", [stageSlug, nextStageSlug]);
    assert(!stagesError, `Failed to fetch stages: ${stagesError?.message}`);
    assertExists(stages, "Stages must exist");
    antithesisStageId = stages.find((s) => s.slug === stageSlug)?.id ?? "";
    assertExists(antithesisStageId, "antithesis stage not found");

    // Create all shared artifacts once to avoid 409 collisions in parallel/sequential test runs.
    await seedSynthesisPreconditions();

    renderedA = await createRenderedDocumentForModel(
      modelAId,
      modelASlug,
      "# Antithesis rendered doc for Model A (shared)",
      "antithesis",
      documentKey,
    );
    renderedB = await createRenderedDocumentForModel(
      modelBId,
      modelBSlug,
      "# Antithesis rendered doc for Model B (shared)",
      "antithesis",
      documentKey,
    );
  });

  afterAll(async () => {
    await coreCleanupTestResources("local");
  });

  it("should persist per-document feedback across both save paths and stage advancement", async () => {
    const { error: updateError } = await adminClient
      .from("dialectic_sessions")
      .update({ status: `${stageSlug}_completed`, current_stage_id: antithesisStageId })
      .eq("id", testSession.id);
    assert(!updateError, `Failed to set session status: ${updateError?.message}`);

    const feedbackContentA = "Feedback content A (model A; save feedback button path)";
    const saveA: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey,
      modelId: modelAId,
      feedbackContent: feedbackContentA,
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: renderedA.contributionId,
    };

    const saveAResult = await submitStageDocumentFeedback(saveA, adminClient, {
      fileManager,
      logger: testLogger,
    });
    assert(!saveAResult.error, `submitStageDocumentFeedback(A) failed: ${saveAResult.error?.message}`);
    assertExists(saveAResult.data, "Expected feedback row for model A");

    const feedbackAResult = await getStageDocumentFeedback(
      {
        sessionId: testSession.id,
        stageSlug,
        iterationNumber,
        modelId: modelAId,
        documentKey,
      },
      adminClient,
      { logger: testLogger },
    );
    assert(!feedbackAResult.error, `getStageDocumentFeedback(A) failed: ${feedbackAResult.error?.message}`);
    assertExists(feedbackAResult.data, "Expected feedback data array for model A");
    if (!feedbackAResult.data) throw new Error("Expected feedback data array for model A");
    assertEquals(feedbackAResult.data.length, 1, "Expected exactly one feedback record for model A");
    assertEquals(
      feedbackAResult.data[0]?.content,
      feedbackContentA,
      "Expected persisted feedback content to match saved content (model A)",
    );

    const feedbackContentB = "Feedback content B (model B; submit responses dirty flush path)";
    const saveB: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey,
      modelId: modelBId,
      feedbackContent: feedbackContentB,
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: renderedB.contributionId,
    };
    const saveBResult = await submitStageDocumentFeedback(saveB, adminClient, {
      fileManager,
      logger: testLogger,
    });
    assert(!saveBResult.error, `submitStageDocumentFeedback(B) failed: ${saveBResult.error?.message}`);
    assertExists(saveBResult.data, "Expected feedback row for model B");

    const submitPayload: SubmitStageResponsesPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug,
      currentIterationNumber: iterationNumber,
      responses: [],
    };
    const submitResult = await submitStageResponses(
      submitPayload,
      adminClient,
      testUser,
      createSubmitDeps(),
    );
    assertEquals(submitResult.status, 200);
    assertExists(submitResult.data, "submitStageResponses should return data");
    if (!submitResult.data) throw new Error("submitStageResponses should return data");
    assertExists(submitResult.data.updatedSession, "submitStageResponses should return updatedSession");
    assertEquals(
      submitResult.data.updatedSession.status,
      `pending_${nextStageSlug}`,
      "Expected stage advancement to set pending status for the next stage",
    );

    const feedbackAAfterAdvance = await getStageDocumentFeedback(
      {
        sessionId: testSession.id,
        stageSlug,
        iterationNumber,
        modelId: modelAId,
        documentKey,
      },
      adminClient,
      { logger: testLogger },
    );
    assert(
      !feedbackAAfterAdvance.error,
      `getStageDocumentFeedback(A, after advance) failed: ${feedbackAAfterAdvance.error?.message}`,
    );
    assertExists(feedbackAAfterAdvance.data, "Expected feedback data array for model A after advance");
    if (!feedbackAAfterAdvance.data) throw new Error("Expected feedback data array for model A after advance");
    assertEquals(feedbackAAfterAdvance.data.length, 1, "Expected exactly one feedback record for model A after advance");
    assertEquals(
      feedbackAAfterAdvance.data[0]?.content,
      feedbackContentA,
      "Expected model A feedback to remain intact after stage advancement",
    );

    const feedbackBAfterAdvance = await getStageDocumentFeedback(
      {
        sessionId: testSession.id,
        stageSlug,
        iterationNumber,
        modelId: modelBId,
        documentKey,
      },
      adminClient,
      { logger: testLogger },
    );
    assert(
      !feedbackBAfterAdvance.error,
      `getStageDocumentFeedback(B, after advance) failed: ${feedbackBAfterAdvance.error?.message}`,
    );
    assertExists(feedbackBAfterAdvance.data, "Expected feedback data array for model B after advance");
    if (!feedbackBAfterAdvance.data) throw new Error("Expected feedback data array for model B after advance");
    assertEquals(feedbackBAfterAdvance.data.length, 1, "Expected exactly one feedback record for model B after advance");
    assertEquals(
      feedbackBAfterAdvance.data[0]?.content,
      feedbackContentB,
      "Expected model B feedback to remain intact after stage advancement",
    );
  });

  it("should select feedback scoped to the executing model (findSourceDocuments expected behavior; currently a gap)", async () => {
    const feedbackContentA = "Feedback for Model A (expected to be used when model_id = A)";
    const feedbackContentB = "Feedback for Model B (newer; should NOT be selected for model A)";

    const saveA: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey,
      modelId: modelAId,
      feedbackContent: feedbackContentA,
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: renderedA.contributionId,
    };
    const saveAResult = await submitStageDocumentFeedback(saveA, adminClient, {
      fileManager,
      logger: testLogger,
    });
    assert(!saveAResult.error, `submitStageDocumentFeedback(A) failed: ${saveAResult.error?.message}`);
    assertExists(saveAResult.data, "Expected feedback row for model A");
    if (!saveAResult.data) throw new Error("Expected feedback row for model A");
    const feedbackRowAId: string = saveAResult.data.id;

    // Save Model B feedback second so it's "newer" in created_at ordering.
    const saveB: SubmitStageDocumentFeedbackPayload = {
      sessionId: testSession.id,
      stageSlug,
      iterationNumber,
      documentKey,
      modelId: modelBId,
      feedbackContent: feedbackContentB,
      feedbackType: "user_feedback",
      userId: testUserId,
      projectId: testProject.id,
      sourceContributionId: renderedB.contributionId,
    };
    const saveBResult = await submitStageDocumentFeedback(saveB, adminClient, {
      fileManager,
      logger: testLogger,
    });
    assert(!saveBResult.error, `submitStageDocumentFeedback(B) failed: ${saveBResult.error?.message}`);
    assertExists(saveBResult.data, "Expected feedback row for model B");

    const inputsRequired: InputRule[] = [
      { type: "feedback", slug: stageSlug, document_key: documentKey, required: true },
    ];

    const parentPayload: DialecticPlanJobPayload = {
      sessionId: testSession.id,
      projectId: testProject.id,
      stageSlug,
      iterationNumber,
      walletId: "",
      user_jwt: testUserJwt,
      model_id: modelAId,
    };

    if (!isJson(parentPayload)) throw new Error("Parent payload is not a valid JSON object");
    const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
      id: crypto.randomUUID(),
      parent_job_id: null,
      session_id: testSession.id,
      user_id: testUserId,
      stage_slug: stageSlug,
      iteration_number: iterationNumber,
      status: "pending",
      max_retries: 0,
      attempt_count: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: null,
      prerequisite_job_id: null,
      payload: parentPayload,
      is_test_job: true,
      job_type: "PLAN",
    };

    const sources = await findSourceDocuments(adminClient, parentJob, inputsRequired);
    const feedbackDocs = sources.filter((d) => d.contribution_type === "feedback");

    assertEquals(feedbackDocs.length, 1, "Expected exactly one feedback SourceDocument for the rule");
    assertEquals(
      feedbackDocs[0]?.id,
      feedbackRowAId,
      "Expected feedback selected for model A, not the newest feedback across all models",
    );
  });

  it("should gather feedback per model for a single document when the session has two models (gatherInputsForStage expected behavior; currently a gap)", async () => {
    const feedbackContentA = "Feedback content A (model A)";
    const feedbackContentB = "Feedback content B (model B)";

    await submitStageDocumentFeedback(
      {
        sessionId: testSession.id,
        stageSlug,
        iterationNumber,
        documentKey,
        modelId: modelAId,
        feedbackContent: feedbackContentA,
        feedbackType: "user_feedback",
        userId: testUserId,
        projectId: testProject.id,
        sourceContributionId: renderedA.contributionId,
      },
      adminClient,
      { fileManager, logger: testLogger },
    );
    await submitStageDocumentFeedback(
      {
        sessionId: testSession.id,
        stageSlug,
        iterationNumber,
        documentKey,
        modelId: modelBId,
        feedbackContent: feedbackContentB,
        feedbackType: "user_feedback",
        userId: testUserId,
        projectId: testProject.id,
        sourceContributionId: renderedB.contributionId,
      },
      adminClient,
      { fileManager, logger: testLogger },
    );

    // Build minimal typed contexts for gatherInputsForStage.
    const { data: projectRow, error: projectError } = await adminClient
      .from("dialectic_projects")
      .select("*, dialectic_domains(name)")
      .eq("id", testProject.id)
      .single();
    assert(!projectError, `Failed to fetch project row: ${projectError?.message}`);
    assertExists(projectRow, "Project row required");

    const { data: sessionRow, error: sessionError } = await adminClient
      .from("dialectic_sessions")
      .select("*")
      .eq("id", testSession.id)
      .single();
    assert(!sessionError, `Failed to fetch session row: ${sessionError?.message}`);
    assertExists(sessionRow, "Session row required");

    const projectContext: ProjectContext = {
      ...projectRow,
      dialectic_domains: { name: projectRow.dialectic_domains?.name ?? "Software Development" },
    };
    const sessionContext: SessionContext = sessionRow;

    const { data: stageDef, error: stageError } = await adminClient
      .from("dialectic_stages")
      .select("*, dialectic_stage_recipe_instances!dialectic_stage_recipe_instances_stage_id_fkey!inner(*, dialectic_stage_recipe_steps!inner(*))")
      .eq("slug", nextStageSlug)
      .single();
    assert(!stageError, `Failed to fetch synthesis stage row: ${stageError?.message}`);
    assertExists(stageDef, "Synthesis stage row required");
    assert(isDatabaseRecipeSteps(stageDef), "Stage definition must be valid DatabaseRecipeSteps");

    const stageDto = mapToStageWithRecipeSteps(stageDef);
    const pairwiseStep = stageDto.dialectic_stage_recipe_steps.find((s) =>
      s.step_key === "synthesis_pairwise_business_case"
    );
    assertExists(pairwiseStep, "Expected synthesis_pairwise_business_case recipe step to exist");
    if (!pairwiseStep) throw new Error("Expected synthesis_pairwise_business_case recipe step to exist");

    const stageContext: StageContext = {
      ...stageDto.dialectic_stage,
      recipe_step: pairwiseStep,
      system_prompts: null,
      domain_specific_prompt_overlays: [],
    };

    // Seed required inputs for the pairwise step so gatherInputsForStage can reach feedback assertions.
    // This seeding is now handled in `beforeAll` by `seedSynthesisPreconditions`.

    const gatheredForModelA = await gatherInputsForStage(
      adminClient,
      async (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      stageContext,
      projectContext,
      sessionContext,
      iterationNumber,
      modelAId,
    );

    const feedbackDocsForModelA = gatheredForModelA.sourceDocuments.filter((d) => d.type === "feedback");
    assertEquals(
      feedbackDocsForModelA.length,
      1,
      "Expected feedback gathered for only the executing model when modelId is provided",
    );

    const gatheredForAllModels = await gatherInputsForStage(
      adminClient,
      async (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      stageContext,
      projectContext,
      sessionContext,
      iterationNumber,
    );

    const feedbackDocsAllModels = gatheredForAllModels.sourceDocuments.filter((d) => d.type === "feedback");
    assertEquals(
      feedbackDocsAllModels.length,
      2,
      "Expected feedback gathered for BOTH models when modelId is not provided",
    );
  });
});

