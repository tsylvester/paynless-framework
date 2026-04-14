/**
 * Integration tests for `compressPrompt`: real `compressPrompt`, real `countTokens` with
 * `buildTokenizerDeps` from `compressPrompt.mock.ts`, real `TokenWalletService`, real admin
 * `SupabaseClient` for `dialectic_memory` batch lookup.
 * Boundary-only fakes: `MockRagService` (external RAG), `EmbeddingClient` built from
 * `getMockAiProviderAdapter` (external provider API).
 */
import {
    afterAll,
    beforeAll,
    describe,
    it,
  } from "https://deno.land/std@0.208.0/testing/bdd.ts";
  import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
  import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
  import {
    coreCleanupTestResources,
    coreCreateAndSetupTestUser,
    coreEnsureTestUserAndWallet,
    initializeSupabaseAdminClient,
    initializeTestDeps,
    registerUndoAction,
    setSharedAdminClient,
    testLogger,
    MOCK_MODEL_CONFIG,
  } from "../../_shared/_integration.test.utils.ts";
  import type { Database } from "../../types_db.ts";
  import { compressPrompt } from "./compressPrompt.ts";
  import type {
    CompressPromptDeps,
    CompressPromptParams,
    CompressPromptPayload,
  } from "./compressPrompt.interface.ts";
  import {
    isCompressPromptErrorReturn,
    isCompressPromptSuccessReturn,
    } from "./compressPrompt.guard.ts";
  import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
  import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
  import { UserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.ts";
  import { AdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.ts";
  import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
  import { EmbeddingClient } from "../../_shared/services/indexing_service.ts";
  import { getMockAiProviderAdapter } from "../../_shared/ai_service/ai_provider.mock.ts";
  import type { AiModelExtendedConfig, ChatApiRequest, ResourceDocuments } from "../../_shared/types.ts";
  import { FileType, type PathContext } from "../../_shared/types/file_manager.types.ts";
  import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
  import { ContextWindowError } from "../../_shared/utils/errors.ts";
  import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
  import { createProject } from "../../dialectic-service/createProject.ts";
  import { startSession } from "../../dialectic-service/startSession.ts";
  import type {
    DialecticProject,
    RelevanceRule,
    StartSessionPayload,
  } from "../../dialectic-service/dialectic.interface.ts";
  import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
  import type { CompressionCandidate } from "../../_shared/utils/vector_utils.ts";
  import { buildTokenizerDeps } from "./compressPrompt.mock.ts";

  describe("compressPrompt integration (real DB client, real tokenizer, boundary mocks)", () => {
    let adminClient: SupabaseClient<Database>;
    let testUser: User;
    let testUserId: string;
    let testProject: DialecticProject;
    let testSessionId: string;
    let testModelId: string;
    let tokenizerDeps: CountTokensDeps;
    let userWalletService: UserTokenWalletService;
    let adminWalletService: AdminTokenWalletService;
    let testWalletId: string;
  
    beforeAll(async () => {
      initializeTestDeps();
      adminClient = initializeSupabaseAdminClient();
      setSharedAdminClient(adminClient);
      tokenizerDeps = buildTokenizerDeps();
  
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
      formData.append("projectName", "compressPrompt integration project");
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
            description: "compressPrompt integration",
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
        sessionDescription: "compressPrompt integration session",
      };
      const sessionResult = await startSession(testUser, adminClient, sessionPayload);
      if (sessionResult.error || !sessionResult.data) {
        throw new Error(`startSession failed: ${sessionResult.error?.message ?? "no data"}`);
      }
      testSessionId = sessionResult.data.id;
    });
  
    afterAll(async () => {
      await coreCleanupTestResources("all");
    });
  
    it("full compression loop: success with content replacement, resolved count, max_tokens_to_generate", async () => {
      const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0001,
        hard_cap_output_tokens: 100_000,
        provider_max_output_tokens: 100_000,
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
      const integrationHistory: NonNullable<ChatApiRequest["messages"]> = [
        { role: "user", content: "history" },
      ];
      const chatApiRequest: ChatApiRequest = {
        message: "integration user message",
        providerId: testModelId,
        promptId: "__none__",
        walletId: testWalletId,
        resourceDocuments,
        messages: integrationHistory,
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
  
      const deps: CompressPromptDeps = {
        logger: testLogger,
        ragService: mockRag,
        embeddingClient,
        tokenWalletService: adminWalletService,
        countTokens,
      };
  
      const params: CompressPromptParams = {
        dbClient: adminClient,
        jobId: crypto.randomUUID(),
        projectOwnerUserId: testUserId,
        sessionId: testSessionId,
        stageSlug: "thesis",
        walletId: testWalletId,
        extendedModelConfig: modelConfig,
        inputsRelevance,
        inputRate: 0.0001,
        outputRate: 0.0001,
        isContinuationFlowInitial: false,
        finalTargetThreshold: 50_000,
        balanceAfterCompression: 50_000_000,
        walletBalance: 50_000_000,
      };
  
      const payload: CompressPromptPayload = {
        compressionStrategy,
        resourceDocuments,
        conversationHistory: [],
        currentUserPrompt: "integration user message",
        chatApiRequest,
        tokenizerDeps,
      };
  
      const result = await compressPrompt(deps, params, payload);
      assertEquals(isCompressPromptSuccessReturn(result), true);
      if (!isCompressPromptSuccessReturn(result)) {
        throw new Error("expected success branch");
      }
      assertEquals(result.resourceDocuments[0].content, "INTEGRATION_RAG_REPLACEMENT_BODY");
      assertEquals(typeof result.resolvedInputTokenCount, "number");
      assertEquals(result.resolvedInputTokenCount > 0, true);
      const maxOut = result.chatApiRequest.max_tokens_to_generate;
      assertEquals(typeof maxOut, "number");
      if (typeof maxOut === "number") {
        assertEquals(maxOut > 0, true);
      }
    });
  
    it("dialectic_memory batch: indexed candidate skips RAG (getContextForModel not called)", async () => {
      const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0001,
      });
  
      const longBody: string = "chunk ".repeat(200_000);
      const indexedDocId: string = crypto.randomUUID();
  
      const indexedPathContext: PathContext = {
        projectId: testProject.id,
        fileType: FileType.HeaderContext,
        sessionId: testSessionId,
        iteration: 1,
        stageSlug: "thesis",
        modelSlug: MOCK_MODEL_CONFIG.api_identifier,
        attemptCount: 1,
        documentKey: FileType.HeaderContext,
      };
      const indexedConstructed = constructStoragePath(indexedPathContext);
  
      const { error: contribErr } = await adminClient
        .from("dialectic_contributions")
        .insert({
          id: indexedDocId,
          session_id: testSessionId,
          stage: "thesis",
          storage_bucket: "dialectic-contributions",
          storage_path: indexedConstructed.storagePath,
          file_name: indexedConstructed.fileName,
          mime_type: "text/plain",
          size_bytes: 10,
          user_id: testUserId,
          iteration_number: 1,
          model_id: testModelId,
        });
      if (contribErr) {
        throw new Error(`Failed to insert contribution: ${contribErr.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_contributions",
        criteria: { id: indexedDocId },
        scope: "local",
      });
  
      const { data: memRow, error: memErr } = await adminClient
        .from("dialectic_memory")
        .insert({
          session_id: testSessionId,
          content: "indexed memory row for integration",
          source_contribution_id: indexedDocId,
        })
        .select("id")
        .single();
      if (memErr || !memRow) {
        throw new Error(`Failed to insert dialectic_memory: ${memErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_memory",
        criteria: { id: memRow.id },
        scope: "local",
      });
  
      const resourceDocuments: ResourceDocuments = [
        {
          id: indexedDocId,
          content: longBody,
          document_key: FileType.HeaderContext,
          stage_slug: "thesis",
          type: "document",
        },
      ];
      const indexedHistory: NonNullable<ChatApiRequest["messages"]> = [
        { role: "user", content: "h" },
      ];
      const chatApiRequest: ChatApiRequest = {
        message: "m",
        providerId: testModelId,
        promptId: "__none__",
        walletId: testWalletId,
        resourceDocuments,
        messages: indexedHistory,
        systemInstruction: "s",
      };
  
      const candidate: CompressionCandidate = {
        id: indexedDocId,
        content: longBody,
        sourceType: "document",
        originalIndex: 0,
        valueScore: 1,
        effectiveScore: 1,
      };
      const compressionStrategy: ICompressionStrategy = async () => [candidate];
  
      const mockRag: MockRagService = new MockRagService();
      mockRag.setConfig({ mockContextResult: "should-not-run", mockTokensUsed: 0 });
      const ragSpy = spy(mockRag, "getContextForModel");
  
      const { instance: mockAdapter } = getMockAiProviderAdapter(testLogger, MOCK_MODEL_CONFIG);
      const embeddingClient = new EmbeddingClient({
        ...mockAdapter,
        getEmbedding: async (_t: string) => ({
          embedding: Array(1536).fill(0.01),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
      });
  
      const deps: CompressPromptDeps = {
        logger: testLogger,
        ragService: mockRag,
        embeddingClient,
        tokenWalletService: adminWalletService,
        countTokens,
      };
  
      const params: CompressPromptParams = {
        dbClient: adminClient,
        jobId: crypto.randomUUID(),
        projectOwnerUserId: testUserId,
        sessionId: testSessionId,
        stageSlug: "thesis",
        walletId: testWalletId,
        extendedModelConfig: modelConfig,
        inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
        inputRate: 0.0001,
        outputRate: 0.0001,
        isContinuationFlowInitial: false,
        finalTargetThreshold: 50_000,
        balanceAfterCompression: 50_000_000,
        walletBalance: 50_000_000,
      };
  
      const payload: CompressPromptPayload = {
        compressionStrategy,
        resourceDocuments,
        conversationHistory: [],
        currentUserPrompt: "m",
        chatApiRequest,
        tokenizerDeps,
      };
  
      const result = await compressPrompt(deps, params, payload);
      assertEquals(ragSpy.calls.length, 0);
      assertEquals(isCompressPromptErrorReturn(result), true);
      if (!isCompressPromptErrorReturn(result)) {
        throw new Error("expected error when only indexed candidate leaves prompt oversized");
      }
      assertEquals(result.error instanceof ContextWindowError, true);
    });
  
    it("post-compression affordability: NSF when estimated total exceeds walletBalance", async () => {
      const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig({
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        hard_cap_output_tokens: 100_000,
        provider_max_output_tokens: 100_000,
        context_window_tokens: 128000,
        provider_max_input_tokens: 128000,
      });
  
      const body: string = "z".repeat(80_000);
      const docId: string = crypto.randomUUID();
      const resourceDocuments: ResourceDocuments = [
        {
          id: docId,
          content: body,
          document_key: FileType.HeaderContext,
          stage_slug: "thesis",
          type: "document",
        },
      ];
      const emptyHistory: NonNullable<ChatApiRequest["messages"]> = [];
      const chatApiRequest: ChatApiRequest = {
        message: "u",
        providerId: testModelId,
        promptId: "__none__",
        walletId: testWalletId,
        resourceDocuments,
        messages: emptyHistory,
        systemInstruction: "s",
      };
  
      const candidate: CompressionCandidate = {
        id: docId,
        content: body,
        sourceType: "document",
        originalIndex: 0,
        valueScore: 1,
        effectiveScore: 1,
      };
      const compressionStrategy: ICompressionStrategy = async () => [candidate];
  
      const mockRag: MockRagService = new MockRagService();
      mockRag.setConfig({
        mockContextResult: "short",
        mockTokensUsed: 0,
      });
  
      const { instance: mockAdapter } = getMockAiProviderAdapter(testLogger, MOCK_MODEL_CONFIG);
      const embeddingClient = new EmbeddingClient({
        ...mockAdapter,
        getEmbedding: async (_t: string) => ({
          embedding: Array(1536).fill(0.01),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
      });
  
      const deps: CompressPromptDeps = {
        logger: testLogger,
        ragService: mockRag,
        embeddingClient,
        tokenWalletService: adminWalletService,
        countTokens,
      };
  
      const params: CompressPromptParams = {
        dbClient: adminClient,
        jobId: crypto.randomUUID(),
        projectOwnerUserId: testUserId,
        sessionId: testSessionId,
        stageSlug: "thesis",
        walletId: testWalletId,
        extendedModelConfig: modelConfig,
        inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
        inputRate: 1,
        outputRate: 1,
        isContinuationFlowInitial: false,
        finalTargetThreshold: 500,
        balanceAfterCompression: 1_000_000,
        walletBalance: 1,
      };
  
      const payload: CompressPromptPayload = {
        compressionStrategy,
        resourceDocuments,
        conversationHistory: [],
        currentUserPrompt: "u",
        chatApiRequest,
        tokenizerDeps,
      };
  
      const result = await compressPrompt(deps, params, payload);
      assertEquals(isCompressPromptErrorReturn(result), true);
      if (!isCompressPromptErrorReturn(result)) {
        throw new Error("expected NSF error branch");
      }
      assertEquals(result.retriable, false);
      assertEquals(
        result.error.message.includes("Insufficient funds"),
        true,
      );
    });
  });
  