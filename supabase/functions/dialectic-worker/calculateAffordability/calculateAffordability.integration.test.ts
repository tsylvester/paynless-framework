/**
 * Integration tests for `calculateAffordability`: real implementation, real `countTokens`
 * where noted, real `AiModelExtendedConfig` via `buildExtendedModelConfig`. Boundary-only
 * fakes: `MockLogger`, `createMockSupabaseClient` (db) where no real DB is required; for the
 * oversized path, real `compressPrompt` from `compressPrompt.ts` with `MockRagService` and
 * `EmbeddingClient` from `getMockAiProviderAdapter` (same pattern as `compressPrompt.integration.test.ts`).
 * Deterministic `countTokens` stubs only where the scenario requires a fixed token count (NSF test).
 */
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import type { CompressionCandidate } from "../../_shared/utils/vector_utils.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  MOCK_MODEL_CONFIG,
  setSharedAdminClient,
  testLogger,
} from "../../_shared/_integration.test.utils.ts";
import { getMockAiProviderAdapter } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { EmbeddingClient } from "../../_shared/services/indexing_service.ts";
import { UserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.ts";
import { AdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ResourceDocuments,
} from "../../_shared/types.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
} from "../../_shared/types/tokenizer.types.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import type { Database } from "../../types_db.ts";
import { createProject } from "../../dialectic-service/createProject.ts";
import type { DialecticProject, RelevanceRule, StartSessionPayload } from "../../dialectic-service/dialectic.interface.ts";
import { startSession } from "../../dialectic-service/startSession.ts";
import { compressPrompt } from "../compressPrompt/compressPrompt.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
} from "../compressPrompt/compressPrompt.interface.ts";
import { calculateAffordability } from "./calculateAffordability.ts";
import {
  isCalculateAffordabilityCompressedReturn,
  isCalculateAffordabilityDirectReturn,
  isCalculateAffordabilityErrorReturn,
} from "./calculateAffordability.guard.ts";
import type {
  CalculateAffordabilityDeps,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
} from "./calculateAffordability.interface.ts";

function buildIntegrationResourceDocuments(): ResourceDocuments {
  const docId: string = "integration-doc-id";
  const content: string = "integration resource body";
  return [
    {
      id: docId,
      content,
      document_key: "header_context",
      stage_slug: "thesis",
      type: "markdown",
    },
  ];
}

function buildIntegrationChatApiRequest(
  resourceDocuments: ResourceDocuments,
  message: string,
): ChatApiRequest {
  const chatApiRequest: ChatApiRequest = {
    message,
    providerId: "00000000-0000-4000-8000-000000000001",
    promptId: "__none__",
    resourceDocuments,
  };
  return chatApiRequest;
}

Deno.test("calculateAffordability integration: non-oversized → direct return (real config + real countTokens)", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const dbClient: SupabaseClient<Database> = client as unknown as SupabaseClient<Database>;
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 128_000,
    provider_max_input_tokens: 128_000,
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.01,
  });
  const resourceDocuments: ResourceDocuments = buildIntegrationResourceDocuments();
  const currentUserPrompt: string = "short integration prompt";
  const compressPrompt: BoundCompressPromptFn = async (
    _params: CompressPromptParams,
    _payload: CompressPromptPayload,
  ): Promise<CompressPromptReturn> => {
    throw new Error("compressPrompt must not be called on non-oversized path");
  };
  const deps: CalculateAffordabilityDeps = {
    logger,
    countTokens,
    compressPrompt,
  };
  const params: CalculateAffordabilityParams = {
    dbClient,
    jobId: "integration-job-id",
    projectOwnerUserId: "integration-owner-id",
    sessionId: "integration-session-id",
    stageSlug: "thesis",
    walletId: "integration-wallet-id",
    walletBalance: 1_000_000,
    extendedModelConfig,
    inputRate: 0.01,
    outputRate: 0.01,
    isContinuationFlowInitial: false,
  };
  const payload: CalculateAffordabilityPayload = {
    compressionStrategy: async () => [],
    resourceDocuments,
    conversationHistory: [],
    currentUserPrompt,
    systemInstruction: "integration system instruction",
    chatApiRequest: buildIntegrationChatApiRequest(resourceDocuments, currentUserPrompt),
  };
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityDirectReturn(result), true);
  if (!isCalculateAffordabilityDirectReturn(result)) {
    return;
  }
  const tokenizerDeps: CountTokensDeps = {
    getEncoding: (_name: string) => ({
      encode: (input: string) => Array.from(input ?? "", (_ch, index: number) => index),
    }),
    countTokensAnthropic: (text: string) => (text ?? "").length,
    logger,
  };
  const fullPayload: CountableChatPayload = {
    systemInstruction: payload.systemInstruction,
    message: payload.currentUserPrompt,
    messages: [],
    resourceDocuments: payload.resourceDocuments,
  };
  const initialTokenCount: number = countTokens(
    tokenizerDeps,
    fullPayload,
    extendedModelConfig,
  );
  const expectedMax: number = getMaxOutputTokens(
    params.walletBalance,
    initialTokenCount,
    extendedModelConfig,
    logger,
  );
  assertEquals(result.maxOutputTokens, expectedMax);
});

describe("calculateAffordability integration: oversized path with real compressPrompt", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testProject: DialecticProject;
  let testSessionId: string;
  let testModelId: string;
  let userWalletService: UserTokenWalletService;
  let adminWalletService: AdminTokenWalletService;
  let testWalletId: string;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;
    testUserId = userId;
    void jwt;

    await coreEnsureTestUserAndWallet(testUserId, 1_000_000, "local");
    userWalletService = new UserTokenWalletService(adminClient);
    adminWalletService = new AdminTokenWalletService(adminClient);
    const walletForSuite = await userWalletService.getWalletForContext(testUserId);
    if (walletForSuite === null) {
      throw new Error("Personal wallet must exist after coreEnsureTestUserAndWallet");
    }
    testWalletId = walletForSuite.walletId;

    const formData = new FormData();
    formData.append("projectName", "calculateAffordability integration project");
    formData.append("initialUserPromptText", "integration seed prompt");
    formData.append("idempotencyKey", crypto.randomUUID());

    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    if (domainError || !domain) {
      throw new Error(`Software Development domain required: ${domainError?.message}`);
    }
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error || !projectResult.data) {
      throw new Error(`createProject failed: ${projectResult.error?.message ?? "no data"}`);
    }
    testProject = projectResult.data;

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
          description: "calculateAffordability integration",
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
      if (insertError || !newModel?.id) {
        throw new Error(`Failed to create mock model: ${insertError?.message}`);
      }
      model = newModel;
    } else if (fetchError) {
      throw new Error(`Failed to fetch model: ${fetchError.message}`);
    }
    if (!model?.id) {
      throw new Error("Model id missing for startSession");
    }
    testModelId = model.id;

    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModels: [{ id: testModelId, displayName: "Mock Model" }],
      idempotencyKey: crypto.randomUUID(),
      sessionDescription: "calculateAffordability integration session",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`startSession failed: ${sessionResult.error?.message ?? "no data"}`);
    }
    testSessionId = sessionResult.data.id;
  });

  afterAll(async () => {
    // `auth.admin.deleteUser` fails with HTTP 500 if public rows still reference the user.
    // `token_wallet_transactions` uses ON DELETE RESTRICT on `recorded_by_user_id` → auth.users;
    // clear ledger rows for this suite's wallet and any rows recorded by the test user before undo.
    const { error: txByWalletErr } = await adminClient
      .from("token_wallet_transactions")
      .delete()
      .eq("wallet_id", testWalletId);
    if (txByWalletErr) {
      console.error(
        "[calculateAffordability integration] token_wallet_transactions delete by wallet:",
        txByWalletErr,
      );
    }
    const { error: txByRecorderErr } = await adminClient
      .from("token_wallet_transactions")
      .delete()
      .eq("recorded_by_user_id", testUserId);
    if (txByRecorderErr) {
      console.error(
        "[calculateAffordability integration] token_wallet_transactions delete by recorder:",
        txByRecorderErr,
      );
    }
    await coreCleanupTestResources("all");
  });

  it("oversized prompt → real compressPrompt → compressed return with RAG replacement", async () => {
    const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
      input_token_cost_rate: 0.0001,
      output_token_cost_rate: 0.0001,
      hard_cap_output_tokens: 100_000,
      provider_max_output_tokens: 100_000,
      context_window_tokens: 50_000,
      provider_max_input_tokens: 128_000,
    });
    const longBody: string = "word ".repeat(200_000);
    const docId: string = crypto.randomUUID();
    const resourceDocuments: ResourceDocuments = [
      {
        id: docId,
        content: longBody,
        document_key: FileType.HeaderContext,
        stage_slug: "thesis",
        type: "document",
      },
    ];
    const currentUserPrompt: string = "integration user message oversized";
    const chatApiRequest: ChatApiRequest = {
      message: currentUserPrompt,
      providerId: testModelId,
      promptId: "__none__",
      walletId: testWalletId,
      resourceDocuments,
      systemInstruction: "sys",
    };
    const inputsRelevance: RelevanceRule[] = [
      { document_key: FileType.HeaderContext, relevance: 1 },
    ];
    const candidate: CompressionCandidate = {
      id: docId,
      content: longBody,
      sourceType: "document",
      originalIndex: 0,
      valueScore: 1,
      effectiveScore: 1,
    };
    const compressionStrategy: ICompressionStrategy = async () => [candidate];
    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({
      mockContextResult: "INTEGRATION_RAG_REPLACEMENT_BODY",
      mockTokensUsed: 0,
    });
    const { instance: mockAdapter } = getMockAiProviderAdapter(testLogger, {
      ...MOCK_MODEL_CONFIG,
      output_token_cost_rate: 0.0001,
    });
    const adapterWithEmbedding = {
      ...mockAdapter,
      getEmbedding: async (_text: string) => ({
        embedding: Array(1536).fill(0.01),
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
    };
    const embeddingClient = new EmbeddingClient(adapterWithEmbedding);
    const compressPromptDeps: CompressPromptDeps = {
      logger: testLogger,
      ragService: mockRag,
      embeddingClient,
      tokenWalletService: adminWalletService,
      countTokens,
    };
    const boundCompressPrompt: BoundCompressPromptFn = (
      params: CompressPromptParams,
      payload: CompressPromptPayload,
    ) => compressPrompt(compressPromptDeps, params, payload);
    const deps: CalculateAffordabilityDeps = {
      logger: testLogger,
      countTokens,
      compressPrompt: boundCompressPrompt,
    };
    const params: CalculateAffordabilityParams = {
      dbClient: adminClient,
      jobId: crypto.randomUUID(),
      projectOwnerUserId: testUserId,
      sessionId: testSessionId,
      stageSlug: "thesis",
      walletId: testWalletId,
      walletBalance: 1_000_000,
      extendedModelConfig,
      inputRate: 0.0001,
      outputRate: 0.0001,
      isContinuationFlowInitial: false,
      inputsRelevance,
    };
    const payload: CalculateAffordabilityPayload = {
      compressionStrategy,
      resourceDocuments,
      conversationHistory: [],
      currentUserPrompt,
      systemInstruction: "sys",
      chatApiRequest,
    };
    const result = await calculateAffordability(deps, params, payload);
    assertEquals(isCalculateAffordabilityCompressedReturn(result), true);
    if (!isCalculateAffordabilityCompressedReturn(result)) {
      throw new Error("expected compressed success");
    }
    assertEquals(result.resourceDocuments[0].content, "INTEGRATION_RAG_REPLACEMENT_BODY");
    assertEquals(typeof result.resolvedInputTokenCount, "number");
    assertEquals(result.resolvedInputTokenCount > 0, true);
  });
});

Deno.test("calculateAffordability integration: NSF (non-oversized) → error return", async () => {
  const logger: MockLogger = new MockLogger();
  const { client } = createMockSupabaseClient();
  const dbClient: SupabaseClient<Database> = client as unknown as SupabaseClient<Database>;
  const extendedModelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
    context_window_tokens: 128_000,
    provider_max_input_tokens: 128_000,
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.01,
  });
  const resourceDocuments: ResourceDocuments = buildIntegrationResourceDocuments();
  const currentUserPrompt: string = "x";
  const compressPrompt: BoundCompressPromptFn = async (
    _params: CompressPromptParams,
    _payload: CompressPromptPayload,
  ): Promise<CompressPromptReturn> => {
    throw new Error("compressPrompt must not be called on NSF non-oversized path");
  };
  const countTokensFixed: CalculateAffordabilityDeps["countTokens"] = (
    _deps: CountTokensDeps,
    _payload: CountableChatPayload,
    _modelConfig: AiModelExtendedConfig,
  ): number => 1000;
  const deps: CalculateAffordabilityDeps = {
    logger,
    countTokens: countTokensFixed,
    compressPrompt,
  };
  const params: CalculateAffordabilityParams = {
    dbClient,
    jobId: "integration-job-nsf",
    projectOwnerUserId: "integration-owner-id",
    sessionId: "integration-session-id",
    stageSlug: "thesis",
    walletId: "integration-wallet-id",
    walletBalance: 5,
    extendedModelConfig,
    inputRate: 0.01,
    outputRate: 0.01,
    isContinuationFlowInitial: false,
  };
  const payload: CalculateAffordabilityPayload = {
    compressionStrategy: async () => [],
    resourceDocuments,
    conversationHistory: [],
    currentUserPrompt,
    systemInstruction: "integration system instruction",
    chatApiRequest: buildIntegrationChatApiRequest(resourceDocuments, currentUserPrompt),
  };
  const result = await calculateAffordability(deps, params, payload);
  assertEquals(isCalculateAffordabilityErrorReturn(result), true);
  if (!isCalculateAffordabilityErrorReturn(result)) {
    return;
  }
  assertEquals(result.retriable, false);
});
