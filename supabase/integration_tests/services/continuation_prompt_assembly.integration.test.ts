/**
 * Continuation prompt assembly integration (Node 9 checklist).
 *
 * Boundary: real `assembleChunks` → `gatherContinuationInputs` → `assembleContinuationPrompt` →
 * `processSimpleJob` message routing → `executeModelCallAndSave` building the `ChatApiRequest` passed
 * to `callUnifiedAIModel`. Mocks: `callUnifiedAIModel` (captures request), `tokenWalletService`,
 * `ragService`. Real: Supabase DB/storage, `FileManagerService` (with `assembleChunks`),
 * `PromptAssembler`, `continueJob`, `retryJob`, `executeModelCallAndSave`.
 */
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
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  setSharedAdminClient,
  testLogger,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticExecuteJobPayload,
  DialecticProject,
  Job,
  StartSessionPayload,
  StartSessionSuccessResponse,
  ContextForDocument,
  ContentToInclude,
  HeaderContext,
  HeaderContextArtifact,
  SystemMaterials,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { FileType, PathContext } from "../../functions/_shared/types/file_manager.types.ts";
import { isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { assembleChunks } from "../../functions/_shared/utils/assembleChunks/assembleChunks.ts";
import { PromptAssembler } from "../../functions/_shared/prompt-assembler/prompt-assembler.ts";
import { processSimpleJob } from "../../functions/dialectic-worker/processSimpleJob.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { createJobContext } from "../../functions/dialectic-worker/createJobContext.ts";
import { IJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { ChatApiRequest } from "../../functions/_shared/types.ts";
import { UnifiedAIResponse } from "../../functions/dialectic-service/dialectic.interface.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { getSeedPromptForStage } from "../../functions/_shared/utils/dialectic_utils.ts";
import { getExtensionFromMimeType } from "../../functions/_shared/path_utils.ts";
import { extractSourceGroupFragment } from "../../functions/_shared/utils/path_utils.ts";
import { shouldEnqueueRenderJob } from "../../functions/_shared/utils/shouldEnqueueRenderJob.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { createMockTokenWalletService } from "../../functions/_shared/services/tokenWalletService.mock.ts";
import { getAiProviderAdapter, defaultProviderMap } from "../../functions/_shared/ai_service/factory.ts";
import { DummyAdapter } from "../../functions/_shared/ai_service/dummy_adapter.ts";
import { planComplexStage } from "../../functions/dialectic-worker/task_isolator.ts";
import { findSourceDocuments } from "../../functions/dialectic-worker/findSourceDocuments.ts";
import { getGranularityPlanner } from "../../functions/dialectic-worker/strategies/granularity.strategies.ts";
import { IDocumentRenderer } from "../../functions/_shared/services/document_renderer.interface.ts";
import {
  isDialecticExecuteJobPayload,
  isContentToInclude,
  isContextForDocument,
  isHeaderContext,
} from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { isJson, isAiModelExtendedConfig } from "../../functions/_shared/utils/type_guards.ts";
import type {
  ResourceUploadContext,
  FileManagerResponse,
  ContributionMetadata,
  ModelContributionUploadContext,
} from "../../functions/_shared/types/file_manager.types.ts";
import type { AiModelExtendedConfig } from "../../functions/_shared/types.ts";
import type { GetAiProviderConfigFn } from "../../functions/dialectic-service/dialectic.interface.ts";

const CHUNK_RAW_TRUNCATED = "{\"executive_summary\":\"The project aims to";
const CHUNK_WITH_META =
  "{\"executive_summary\":\" deliver value\",\"methodology\":\"Agile\",\"continuation_needed\":true,\"resume_cursor\":{\"document_key\":\"methodology\",\"section_id\":\"overview\"}}";
const CHUNK_FINAL = "{\"methodology\":\" framework with iterative sprints\",\"timeline\":\"6 months\"}";

const SEED_TEXT =
  "Continuation integration seed — write the business_case document per stage instructions.";

/** Minimal valid HeaderContext JSON (matches planner_output_type.integration.test.ts) for storage + assembleTurnPrompt. */
const minimalSystemMaterials: SystemMaterials = {
  stage_rationale: "",
  agent_notes_to_self: "",
  input_artifacts_summary: "",
};
const minimalHeaderContextArtifact: HeaderContextArtifact = {
  type: "header_context",
  document_key: "header_context",
  artifact_class: "header_context",
  file_type: "json",
};
const contentToIncludeBusinessCase: ContentToInclude = {
  threats: "",
  strengths: "",
  next_steps: "",
  weaknesses: "",
  opportunities: "",
  executive_summary: "",
  market_opportunity: "",
  "risks_&_mitigation": "",
  proposal_references: [],
  competitive_analysis: "",
  user_problem_validation: "",
  "differentiation_&_value_proposition": "",
};
assert(isContentToInclude(contentToIncludeBusinessCase), "contentToIncludeBusinessCase");
const contentToIncludeFeatureSpec: ContentToInclude = {
  features: [
    {
      dependencies: [],
      feature_name: "",
      user_stories: [],
      success_metrics: [],
      feature_objective: "",
      acceptance_criteria: [],
    },
  ],
};
assert(isContentToInclude(contentToIncludeFeatureSpec), "contentToIncludeFeatureSpec");
const contentToIncludeTechnicalApproach: ContentToInclude = {
  data: "",
  components: "",
  deployment: "",
  sequencing: "",
  architecture: "",
  open_questions: "",
  risk_mitigation: "",
};
assert(isContentToInclude(contentToIncludeTechnicalApproach), "contentToIncludeTechnicalApproach");
const contentToIncludeSuccessMetrics: ContentToInclude = {
  ownership: "",
  guardrails: "",
  next_steps: "",
  data_sources: [],
  primary_kpis: "",
  risk_signals: "",
  escalation_plan: "",
  measurement_plan: "",
  north_star_metric: "",
  outcome_alignment: "",
  reporting_cadence: "",
  lagging_indicators: "",
  leading_indicators: "",
};
assert(isContentToInclude(contentToIncludeSuccessMetrics), "contentToIncludeSuccessMetrics");
const minimalContextForDocuments: ContextForDocument[] = [
  { document_key: FileType.business_case, content_to_include: contentToIncludeBusinessCase },
  { document_key: FileType.feature_spec, content_to_include: contentToIncludeFeatureSpec },
  { document_key: FileType.technical_approach, content_to_include: contentToIncludeTechnicalApproach },
  { document_key: FileType.success_metrics, content_to_include: contentToIncludeSuccessMetrics },
];
for (const ctx of minimalContextForDocuments) {
  assert(isContextForDocument(ctx), `minimalContextForDocuments ${ctx.document_key}`);
}
const minimalHeaderContextObject: HeaderContext = {
  system_materials: minimalSystemMaterials,
  header_context_artifact: minimalHeaderContextArtifact,
  context_for_documents: minimalContextForDocuments,
};
assert(isHeaderContext(minimalHeaderContextObject), "minimalHeaderContextObject");
const MINIMAL_HEADER_CONTEXT_JSON: string = JSON.stringify(minimalHeaderContextObject);

const fetchAiProviderConfig: GetAiProviderConfigFn = async (
  dbClient: SupabaseClient<Database>,
  modelId: string,
): Promise<AiModelExtendedConfig> => {
  const { data, error } = await dbClient.from("ai_providers").select("*").eq("id", modelId).single();
  if (error || !data) {
    throw new Error("Failed to fetch AI provider config");
  }
  if (!isAiModelExtendedConfig(data.config)) {
    throw new Error("Failed to fetch AI provider config");
  }
  return data.config;
};

describe("continuation_prompt_assembly.integration", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testJwt: string;
  let walletId: string;
  let testModelId: string;
  let storageBucket: string;
  let fileManager: FileManagerService;
  let promptAssembler: PromptAssembler;
  let thesisExecuteStepId: string;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
    testUserId = userId;
    testJwt = jwt;
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user required");
    testUser = user;

    await coreEnsureTestUserAndWallet(testUserId, 1_000_000, "local");
    const { data: walletRow, error: walletErr } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    assert(!walletErr, walletErr?.message);
    assertExists(walletRow?.wallet_id);
    walletId = walletRow.wallet_id;

    const bucketEnv: string | undefined = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
    if (!bucketEnv) {
      throw new Error("SB_CONTENT_STORAGE_BUCKET must be set");
    }
    storageBucket = bucketEnv;

    fileManager = new FileManagerService(adminClient, {
      constructStoragePath,
      logger: testLogger,
      assembleChunks,
    });
    promptAssembler = new PromptAssembler(adminClient, fileManager);

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
      assert(!createError, createError?.message);
      assertExists(newModel);
      model = newModel;
    } else {
      const { error: updateError } = await adminClient
        .from("ai_providers")
        .update({ config: validConfig })
        .eq("id", model.id);
      assert(!updateError, updateError?.message);
    }
    testModelId = model.id;

    const thesisStage = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", "thesis")
      .single();
    assert(!thesisStage.error, thesisStage.error?.message);
    assertExists(thesisStage.data?.active_recipe_instance_id);
    const instanceId: string = thesisStage.data.active_recipe_instance_id;
    const instanceRow = await adminClient
      .from("dialectic_stage_recipe_instances")
      .select("id, is_cloned, template_id")
      .eq("id", instanceId)
      .single();
    assert(!instanceRow.error, instanceRow.error?.message);
    assertExists(instanceRow.data);

    const getFirstExecuteStepId = async (): Promise<string> => {
      if (instanceRow.data!.is_cloned === true) {
        const r = await adminClient
          .from("dialectic_stage_recipe_steps")
          .select("id")
          .eq("instance_id", instanceId)
          .eq("job_type", "EXECUTE")
          .limit(1)
          .single();
        assert(!r.error, r.error?.message);
        assertExists(r.data);
        return r.data.id;
      }
      const templateId = instanceRow.data!.template_id;
      const r = await adminClient
        .from("dialectic_recipe_template_steps")
        .select("id")
        .eq("template_id", templateId)
        .eq("job_type", "EXECUTE")
        .limit(1)
        .single();
      assert(!r.error, r.error?.message);
      assertExists(r.data);
      return r.data.id;
    };

    thesisExecuteStepId = await getFirstExecuteStepId();
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  const createUniqueProjectAndSession = async (
    label: string,
  ): Promise<{ project: DialecticProject; session: StartSessionSuccessResponse }> => {
    const formData = new FormData();
    formData.append(
      "projectName",
      `continuation_prompt_assembly ${label} ${crypto.randomUUID()}`,
    );
    formData.append("initialUserPromptText", "Integration test project seed.");
    formData.append("idempotencyKey", crypto.randomUUID());
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, domainError?.message);
    assertExists(domain);
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error || !projectResult.data) {
      throw new Error(`createProject failed: ${projectResult.error?.message}`);
    }
    const project: DialecticProject = projectResult.data;

    const sessionPayload: StartSessionPayload = {
      projectId: project.id,
      selectedModels: [{ id: testModelId, displayName: "Test Model" }],
      idempotencyKey: crypto.randomUUID(),
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`startSession failed: ${sessionResult.error?.message}`);
    }
    return { project, session: sessionResult.data };
  };

  const cleanupProjectAndSession = async (
    projectId: string,
    sessionId: string,
  ): Promise<void> => {
    await adminClient.from("dialectic_sessions").delete().eq("id", sessionId);
    await adminClient.from("dialectic_projects").delete().eq("id", projectId);
  };

  const uploadSeedPrompt = async (
    projectId: string,
    sessionId: string,
  ): Promise<void> => {
    const seedBytes: Uint8Array = new TextEncoder().encode(SEED_TEXT);
    const seedContext: ResourceUploadContext = {
      pathContext: {
        fileType: FileType.SeedPrompt,
        projectId,
        sessionId,
        iteration: 1,
        stageSlug: "thesis",
      },
      fileContent: SEED_TEXT,
      mimeType: "text/markdown",
      sizeBytes: seedBytes.byteLength,
      userId: testUserId,
      description: "continuation_prompt_assembly seed",
      resourceTypeForDb: "seed_prompt",
    };
    const seedResult: FileManagerResponse = await fileManager.uploadAndRegisterFile(seedContext);
    assert(!seedResult.error, seedResult.error?.message);
  };

  const createContinuationChain = async (
    sessionId: string,
    projectId: string,
    chunks: { content: string }[],
  ): Promise<{ rootId: string; lastId: string; allIds: string[] }> => {
    const stageSlug = "thesis";
    const iterationNumber = 1;
    const documentKey: FileType = FileType.business_case;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const allIds: string[] = [];
    let previousId: string | null = null;
    const rootId: string = crypto.randomUUID();

    for (let i = 0; i < chunks.length; i++) {
      const contributionId: string = i === 0 ? rootId : crypto.randomUUID();
      const pathContext: PathContext = {
        projectId,
        fileType: FileType.ModelContributionRawJson,
        sessionId,
        iteration: iterationNumber,
        stageSlug,
        modelSlug,
        attemptCount: 0,
        documentKey,
        isContinuation: i > 0,
        turnIndex: i,
      };
      const constructed = constructStoragePath(pathContext);
      const storagePath: string = constructed.storagePath;
      const fileName: string = constructed.fileName;
      const fullPath = `${storagePath}/${fileName}`;

      const { error: uploadError } = await adminClient.storage
        .from(storageBucket)
        .upload(fullPath, chunks[i].content, {
          contentType: "application/json",
          upsert: true,
        });
      assert(!uploadError, uploadError?.message);

      const { error: insertError } = await adminClient.from("dialectic_contributions").insert({
        id: contributionId,
        session_id: sessionId,
        user_id: testUserId,
        stage: stageSlug,
        iteration_number: iterationNumber,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        file_name: fileName,
        target_contribution_id: previousId,
        is_latest_edit: i === 0,
        contribution_type: "model_contribution",
        mime_type: "application/json",
        document_relationships: {
          thesis: rootId,
          turnIndex: i,
        },
      });
      assert(!insertError, insertError?.message);

      allIds.push(contributionId);
      previousId = contributionId;
    }

    const lastId: string = allIds[allIds.length - 1];
    return { rootId, lastId, allIds };
  };

  const registerHeaderContextContribution = async (
    projectId: string,
    sessionId: string,
  ): Promise<string> => {
    const modelSlug: string = MOCK_MODEL_CONFIG.api_identifier;
    const contributionMetadata: ContributionMetadata = {
      sessionId,
      modelIdUsed: testModelId,
      modelNameDisplay: modelSlug,
      stageSlug: "thesis",
      iterationNumber: 1,
      contributionType: "header_context",
      editVersion: 1,
      isLatestEdit: true,
      document_relationships: null,
    };
    const uploadContext: ModelContributionUploadContext = {
      pathContext: {
        projectId,
        sessionId,
        iteration: 1,
        stageSlug: "thesis",
        fileType: FileType.HeaderContext,
        originalFileName: `${FileType.HeaderContext}_test.json`,
        modelSlug,
        attemptCount: 1,
        documentKey: FileType.HeaderContext,
        contributionType: "header_context",
      },
      fileContent: MINIMAL_HEADER_CONTEXT_JSON,
      mimeType: "application/json",
      sizeBytes: new TextEncoder().encode(MINIMAL_HEADER_CONTEXT_JSON).byteLength,
      userId: testUserId,
      description: "continuation_prompt_assembly header_context",
      contributionMetadata,
    };
    const result: FileManagerResponse = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(!result.error, result.error?.message ?? "header_context upload failed");
    const record = result.record;
    assertExists(record);
    if (record === null) {
      throw new Error("header_context contribution record was null");
    }
    if (!("id" in record) || typeof record.id !== "string") {
      throw new Error("header_context contribution record missing id");
    }
    return record.id;
  };

  const buildMockDocumentRenderer = (): IDocumentRenderer => ({
    renderDocument: () =>
      Promise.resolve({
        pathContext: {
          fileType: FileType.HeaderContext,
          projectId: "",
          sessionId: "",
          iteration: 0,
          stageSlug: "",
          modelSlug: "",
        },
        renderedBytes: new Uint8Array(),
        error: null,
      }),
  });

  it("3-message continuation path: ChatApiRequest has seed + assistant history and separate continuation instruction", async () => {
    let captured: ChatApiRequest | null = null;
    const fixedAiResponse: UnifiedAIResponse = {
      content: '{"executive_summary":"done","methodology":"x","timeline":"y","budget":"z"}',
      contentType: "application/json",
      inputTokens: 10,
      outputTokens: 20,
      processingTimeMs: 50,
      rawProviderResponse: { finish_reason: "stop" },
      finish_reason: "stop",
    };

    const mockWallet = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const depsBase: IJobContext = createJobContext({
      logger: testLogger,
      fileManager,
      downloadFromStorage: (supabase, bucket, path) =>
        downloadFromStorage(supabase, bucket, path),
      deleteFromStorage: () => Promise.resolve({ error: null }),
      callUnifiedAIModel: async () => {
        throw new Error("callUnifiedAIModel should be replaced by capturing mock");
      },
      getAiProviderAdapter: (deps) =>
        getAiProviderAdapter({
          ...deps,
          providerMap: { ...defaultProviderMap, "dummy-": DummyAdapter },
        }),
      getAiProviderConfig: fetchAiProviderConfig,
      ragService: {
        getContextForModel: async () => ({
          context: "",
          tokensUsedForIndexing: 0,
          error: undefined,
        }),
      },
      indexingService: {
        indexDocument: async () => ({ success: true, tokensUsed: 0 }),
      },
      embeddingClient: {
        getEmbedding: async () => ({
          embedding: [],
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      },
      countTokens,
      tokenWalletService: mockWallet,
      notificationService: new NotificationService(adminClient),
      getSeedPromptForStage,
      promptAssembler,
      getExtensionFromMimeType,
      extractSourceGroupFragment,
      randomUUID: () => crypto.randomUUID(),
      shouldEnqueueRenderJob,
      getGranularityPlanner,
      planComplexStage,
      findSourceDocuments,
      documentRenderer: buildMockDocumentRenderer(),
      continueJob,
      retryJob,
      executeModelCallAndSave,
    });

    const ctx: IJobContext = {
      ...depsBase,
      callUnifiedAIModel: async (req) => {
        captured = req;
        return fixedAiResponse;
      },
    };

    const { project, session } = await createUniqueProjectAndSession("3msg");
    try {
      await uploadSeedPrompt(project.id, session.id);
      const headerCtxId: string = await registerHeaderContextContribution(project.id, session.id);

      const { rootId, lastId } = await createContinuationChain(session.id, project.id, [
        { content: CHUNK_RAW_TRUNCATED },
        { content: CHUNK_WITH_META },
        { content: CHUNK_FINAL },
      ]);

      const contentToInclude: ContentToInclude = {
        executive_summary: "",
        methodology: "",
        timeline: "",
        budget: "",
      };
      const contextForDocuments: ContextForDocument = {
        document_key: FileType.business_case,
        content_to_include: contentToInclude,
      };

      const executePayload: DialecticExecuteJobPayload = {
        prompt_template_id: crypto.randomUUID(),
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        canonicalPathParams: { contributionType: "thesis", stageSlug: "thesis" },
        inputs: {
          header_context_id: headerCtxId,
        },
        model_id: testModelId,
        model_slug: MOCK_MODEL_CONFIG.api_identifier,
        projectId: project.id,
        sessionId: session.id,
        iterationNumber: 1,
        stageSlug: "thesis",
        walletId,
        user_jwt: testJwt,
        idempotencyKey: crypto.randomUUID(),
        continueUntilComplete: true,
        continuation_count: 3,
        target_contribution_id: lastId,
        document_relationships: {
          source_group: "550e8400-e29b-41d4-a716-446655440000",
          thesis: rootId,
        },
        planner_metadata: {
          recipe_step_id: thesisExecuteStepId,
          stage_slug: "thesis",
        },
        context_for_documents: [contextForDocuments],
      };

      if (!isDialecticExecuteJobPayload(executePayload)) {
        throw new Error("Invalid execute payload");
      }
      if (!isJson(executePayload)) {
        throw new Error("Payload must be JSON-serializable");
      }

      const { data: jobRow, error: jobErr } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          session_id: session.id,
          user_id: testUserId,
          stage_slug: "thesis",
          job_type: "EXECUTE",
          status: "pending",
          payload: executePayload,
          iteration_number: 1,
          is_test_job: true,
          max_retries: 3,
          attempt_count: 0,
          target_contribution_id: lastId,
        })
        .select()
        .single();

      assert(!jobErr, jobErr?.message);
      assertExists(jobRow);

      const payloadParsed = jobRow.payload;
      if (!isRecord(payloadParsed) || !isDialecticExecuteJobPayload(payloadParsed)) {
        throw new Error("Job payload invalid");
      }
      const job: Job & { payload: DialecticExecuteJobPayload } = {
        ...jobRow,
        payload: payloadParsed,
      };

      await processSimpleJob(adminClient, job, testUserId, ctx, testJwt);

      assertExists(captured, "callUnifiedAIModel should capture ChatApiRequest");
      if (captured === null) {
        throw new Error("Captured ChatApiRequest was null after assertExists");
      }
      const chat: ChatApiRequest = captured;

      const messages = chat.messages;
      if (messages === undefined || messages.length < 2) {
        throw new Error("ChatApiRequest.messages must have 2 entries for continuation path");
      }
      assertEquals(messages.length, 2, "history: seed user + assembled assistant");

      const firstMsg = messages[0];
      const secondMsg = messages[1];
      assertEquals(firstMsg.role, "user");
      assertEquals(firstMsg.content.trim(), SEED_TEXT.trim());

      assertEquals(secondMsg.role, "assistant");
      const assistantParsed: unknown = JSON.parse(secondMsg.content);
      if (!isRecord(assistantParsed)) {
        throw new Error("assistant message should be JSON object string");
      }
      assertEquals(
        assistantParsed.executive_summary,
        "The project aims to deliver value",
      );
      assertEquals(
        assistantParsed.methodology,
        "Agile framework with iterative sprints",
      );
      assertEquals(assistantParsed.timeline, "6 months");

      assertEquals(assistantParsed.continuation_needed, undefined);
      assertEquals(assistantParsed.stop_reason, undefined);
      assertEquals(assistantParsed.resume_cursor, undefined);

      const currentPrompt: string = chat.message;
      assert(
        !currentPrompt.includes(SEED_TEXT.slice(0, 20)),
        "current user prompt should not duplicate the full seed",
      );
      assert(
        !currentPrompt.includes(secondMsg.content.slice(0, 40)),
        "current user prompt should not embed the assembled JSON blob",
      );
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });

  it("non-continuation EXECUTE: empty messages history, single user message", async () => {
    let captured: ChatApiRequest | null = null;
    const fixedAiResponse: UnifiedAIResponse = {
      content: '{"executive_summary":"only"}',
      contentType: "application/json",
      inputTokens: 5,
      outputTokens: 5,
      processingTimeMs: 20,
      rawProviderResponse: { finish_reason: "stop" },
      finish_reason: "stop",
    };

    const mockWallet = createMockTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const depsBase: IJobContext = createJobContext({
      logger: testLogger,
      fileManager,
      downloadFromStorage: (supabase, bucket, path) =>
        downloadFromStorage(supabase, bucket, path),
      deleteFromStorage: () => Promise.resolve({ error: null }),
      callUnifiedAIModel: async () => fixedAiResponse,
      getAiProviderAdapter: (deps) =>
        getAiProviderAdapter({
          ...deps,
          providerMap: { ...defaultProviderMap, "dummy-": DummyAdapter },
        }),
      getAiProviderConfig: fetchAiProviderConfig,
      ragService: {
        getContextForModel: async () => ({
          context: "",
          tokensUsedForIndexing: 0,
          error: undefined,
        }),
      },
      indexingService: {
        indexDocument: async () => ({ success: true, tokensUsed: 0 }),
      },
      embeddingClient: {
        getEmbedding: async () => ({
          embedding: [],
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      },
      countTokens,
      tokenWalletService: mockWallet,
      notificationService: new NotificationService(adminClient),
      getSeedPromptForStage,
      promptAssembler,
      getExtensionFromMimeType,
      extractSourceGroupFragment,
      randomUUID: () => crypto.randomUUID(),
      shouldEnqueueRenderJob,
      getGranularityPlanner,
      planComplexStage,
      findSourceDocuments,
      documentRenderer: buildMockDocumentRenderer(),
      continueJob,
      retryJob,
      executeModelCallAndSave,
    });

    const ctx: IJobContext = {
      ...depsBase,
      callUnifiedAIModel: async (req) => {
        captured = req;
        return fixedAiResponse;
      },
    };

    const { project, session } = await createUniqueProjectAndSession("no-continuation");
    try {
      await uploadSeedPrompt(project.id, session.id);
      const headerCtxId: string = await registerHeaderContextContribution(project.id, session.id);

      const executePayload: DialecticExecuteJobPayload = {
        prompt_template_id: crypto.randomUUID(),
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        canonicalPathParams: { contributionType: "thesis", stageSlug: "thesis" },
        inputs: {
          header_context_id: headerCtxId,
        },
        model_id: testModelId,
        model_slug: MOCK_MODEL_CONFIG.api_identifier,
        projectId: project.id,
        sessionId: session.id,
        iterationNumber: 1,
        stageSlug: "thesis",
        walletId,
        user_jwt: testJwt,
        idempotencyKey: crypto.randomUUID(),
        continueUntilComplete: false,
        document_relationships: {
          source_group: "550e8400-e29b-41d4-a716-446655440000",
        },
        planner_metadata: {
          recipe_step_id: thesisExecuteStepId,
          stage_slug: "thesis",
        },
      };

      if (!isDialecticExecuteJobPayload(executePayload)) {
        throw new Error("Invalid execute payload");
      }
      if (!isJson(executePayload)) {
        throw new Error("Payload must be JSON-serializable");
      }

      const { data: jobRow, error: jobErr } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          session_id: session.id,
          user_id: testUserId,
          stage_slug: "thesis",
          job_type: "EXECUTE",
          status: "pending",
          payload: executePayload,
          iteration_number: 1,
          is_test_job: true,
          max_retries: 3,
          attempt_count: 0,
          target_contribution_id: null,
        })
        .select()
        .single();

      assert(!jobErr, jobErr?.message);
      assertExists(jobRow);

      const payloadParsed = jobRow.payload;
      if (!isRecord(payloadParsed) || !isDialecticExecuteJobPayload(payloadParsed)) {
        throw new Error("Job payload invalid");
      }
      const job: Job & { payload: DialecticExecuteJobPayload } = {
        ...jobRow,
        payload: payloadParsed,
      };

      await processSimpleJob(adminClient, job, testUserId, ctx, testJwt);

      assertExists(captured);
      if (captured === null) {
        throw new Error("Captured ChatApiRequest was null after assertExists");
      }
      const cap: ChatApiRequest = captured;
      const msgs = cap.messages;
      assert(
        msgs === undefined || msgs.length === 0,
        "non-continuation path should not populate conversation history",
      );
      assertEquals(typeof cap.message, "string");
      assert(cap.message.length > 0);
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });
});
