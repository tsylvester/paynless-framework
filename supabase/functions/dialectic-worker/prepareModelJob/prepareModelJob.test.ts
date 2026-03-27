import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ILogger,
} from "../../_shared/types.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import {
  RenderJobEnqueueError,
  RenderJobValidationError,
} from "../../_shared/utils/errors.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { applyInputsRequiredScope } from "../../_shared/utils/applyInputsRequiredScope.ts";
import { pickLatest } from "../../_shared/utils/pickLatest.ts";
import { validateWalletBalance } from "../../_shared/utils/validateWalletBalance.ts";
import { validateModelCostRates } from "../../_shared/utils/validateModelCostRates.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { createMockTokenWalletService } from "../../_shared/services/tokenWalletService.mock.ts";
import type { IEmbeddingClient } from "../../_shared/services/indexing_service.interface.ts";
import type {
  CountTokensDeps,
  CountableChatPayload,
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";
import type { Database, Json, Tables } from "../../types_db.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
  InputRule,
  PromptConstructionPayload,
  RelevanceRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  BoundExecuteModelCallAndSaveFn,
} from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import {
  isExecuteModelCallAndSaveParams,
  isExecuteModelCallAndSavePayload,
} from "../executeModelCallAndSave/executeModelCallAndSave.interface.guard.ts";
import type {
  BoundEnqueueRenderJobFn,
} from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
  isEnqueueRenderJobParams,
  isEnqueueRenderJobPayload,
} from "../enqueueRenderJob/enqueueRenderJob.interface.guards.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import {
  isPrepareModelJobErrorReturn,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.guard.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import type { ITokenWalletService } from "../../_shared/types/tokenWallet.types.ts";

function buildExecuteJobPayload(): DialecticExecuteJobPayload {
  return {
    prompt_template_id: "contract-pt",
    inputs: {},
    output_type: FileType.HeaderContext,
    document_key: "header_context",
    projectId: "project-contract",
    sessionId: "session-contract",
    stageSlug: "thesis",
    model_id: "model-contract",
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: "wallet-contract",
    user_jwt: "jwt.contract",
    canonicalPathParams: {
      contributionType: "thesis",
      stageSlug: "thesis",
    },
    idempotencyKey: "contract-idem",
  };
}

function buildDialecticJobRow(payload: DialecticExecuteJobPayload): DialecticJobRow {
  if (!isJson(payload)) {
    throw new Error("Contract test payload must be Json-compatible");
  }
  const base: Tables<"dialectic_generation_jobs"> = {
    id: "job-contract-1",
    session_id: "session-contract",
    stage_slug: "thesis",
    iteration_number: 1,
    status: "pending",
    user_id: "user-contract",
    attempt_count: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
    error_details: null,
    max_retries: 3,
    parent_job_id: null,
    payload,
    prerequisite_job_id: null,
    results: null,
    started_at: null,
    target_contribution_id: null,
    is_test_job: false,
    job_type: "EXECUTE",
    idempotency_key: null,
  };
  return base;
}

function buildDialecticSessionRow(): DialecticSessionRow {
  return {
    id: "session-contract",
    project_id: "project-contract",
    session_description: "contract session",
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: ["model-contract"],
    status: "in-progress",
    associated_chat_id: null,
    current_stage_id: "stage-contract-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    viewing_stage_id: null,
    idempotency_key: "session-contract-idem",
  };
}

function buildDefaultAiProvidersRow(): Tables<"ai_providers"> {
  return buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()));
}

function buildDialecticContributionRow(): DialecticContributionRow {
  return {
    id: "contrib-contract-1",
    session_id: "session-contract",
    stage: "thesis",
    iteration_number: 1,
    model_id: "model-contract",
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: "model_contribution_main",
    created_at: new Date().toISOString(),
    error: null,
    file_name: "contract.txt",
    mime_type: "text/plain",
    model_name: "Contract AI",
    original_model_contribution_id: null,
    processing_time_ms: 10,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 10,
    storage_bucket: "contract-bucket",
    storage_path: "contract/path",
    target_contribution_id: null,
    tokens_used_input: 1,
    tokens_used_output: 2,
    updated_at: new Date().toISOString(),
    user_id: "user-contract",
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
  };
}

function buildPromptConstructionPayload(): PromptConstructionPayload {
  return {
    conversationHistory: [],
    resourceDocuments: [],
    currentUserPrompt: "contract user prompt",
    source_prompt_resource_id: "source-prompt-resource-contract",
  };
}

function buildExtendedModelFixture(): AiModelExtendedConfig {
  return {
    api_identifier: "contract-api-v1",
    input_token_cost_rate: 0.01,
    output_token_cost_rate: 0.01,
    tokenization_strategy: {
      type: "tiktoken",
      tiktoken_encoding_name: "cl100k_base",
    },
    hard_cap_output_tokens: 500,
    provider_max_output_tokens: 500,
    context_window_tokens: 128000,
    provider_max_input_tokens: 128000,
  };
}

function modelConfigToJson(cfg: AiModelExtendedConfig): Json {
  const serialized: unknown = JSON.parse(JSON.stringify(cfg));
  if (!isJson(serialized)) {
    throw new Error("Fixture model config must serialize to Json");
  }
  return serialized;
}

function buildAiProviderRow(config: Json | null): Tables<"ai_providers"> {
  return {
    id: "model-contract",
    name: "Contract AI",
    api_identifier: "contract-api-v1",
    provider: "contract-provider",
    description: null,
    is_active: true,
    is_default_generation: false,
    is_default_embedding: false,
    is_enabled: true,
    config,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildTokenWalletRow(
  overrides: Partial<Tables<"token_wallets">>,
): Tables<"token_wallets"> {
  const base: Tables<"token_wallets"> = {
    balance: 100000,
    created_at: new Date().toISOString(),
    currency: "TOK",
    organization_id: null,
    updated_at: new Date().toISOString(),
    user_id: "user-contract",
    wallet_id: "wallet-contract",
  };
  return { ...base, ...overrides };
}

const defaultCountTokens: CountTokensFn = (
  _deps: CountTokensDeps,
  payload: CountableChatPayload,
  _modelConfig: AiModelExtendedConfig,
): number => {
  const fromMessage: string = typeof payload.message === "string" ? payload.message : "";
  if (fromMessage.length > 30000) {
    return 200000;
  }
  return 100;
};

type PrepareModelJobDepsOverrides = {
  executeModelCallAndSave: BoundExecuteModelCallAndSaveFn;
  enqueueRenderJob: BoundEnqueueRenderJobFn;
  countTokens?: CountTokensFn;
  tokenWalletService?: ITokenWalletService;
  downloadFromStorage?: DownloadFromStorageFn;
};

function buildPrepareModelJobDeps(overrides: PrepareModelJobDepsOverrides): PrepareModelJobDeps {
  const logger: ILogger = new MockLogger();
  const mockDownloadFn: DownloadFromStorageFn = overrides.downloadFromStorage !== undefined
    ? overrides.downloadFromStorage
    : createMockDownloadFromStorage({
      mode: "success",
      data: new ArrayBuffer(0),
    });
  const ragService = new MockRagService();
  const tokenWalletService: ITokenWalletService = overrides.tokenWalletService !== undefined
    ? overrides.tokenWalletService
    : createMockTokenWalletService().instance;
  const embeddingClient: IEmbeddingClient = {
    getEmbedding: async () => ({
      embedding: [],
      usage: { prompt_tokens: 0, total_tokens: 0 },
    }),
  };
  const countTokens: CountTokensFn = overrides.countTokens !== undefined
    ? overrides.countTokens
    : defaultCountTokens;
  return {
    logger,
    pickLatest,
    downloadFromStorage: mockDownloadFn,
    applyInputsRequiredScope,
    countTokens,
    tokenWalletService,
    validateWalletBalance,
    validateModelCostRates,
    ragService,
    embeddingClient,
    executeModelCallAndSave: overrides.executeModelCallAndSave,
    enqueueRenderJob: overrides.enqueueRenderJob,
  };
}

function malformedPayloadMissingStageSlug(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.stageSlug;
  return rec as unknown as DialecticExecuteJobPayload;
}

function malformedPayloadMissingWalletId(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.walletId;
  return rec as unknown as DialecticExecuteJobPayload;
}

function malformedPayloadMissingIterationNumber(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.iterationNumber;
  return rec as unknown as DialecticExecuteJobPayload;
}

function assertEmcasFirstCallShape(emcas: Spy<BoundExecuteModelCallAndSaveFn>): void {
  assertEquals(emcas.calls.length >= 1, true);
  const first = emcas.calls[0];
  assertExists(first);
  assertEquals(first.args.length >= 2, true);
  const paramArg: unknown = first.args[0];
  const payloadArg: unknown = first.args[1];
  assertEquals(isExecuteModelCallAndSaveParams(paramArg), true);
  assertEquals(isExecuteModelCallAndSavePayload(payloadArg), true);
}

function assertEnqueueFirstCallShape(enqueue: Spy<BoundEnqueueRenderJobFn>): void {
  assertEquals(enqueue.calls.length >= 1, true);
  const first = enqueue.calls[0];
  assertExists(first);
  assertEquals(first.args.length >= 2, true);
  const paramArg: unknown = first.args[0];
  const payloadArg: unknown = first.args[1];
  assertEquals(isEnqueueRenderJobParams(paramArg), true);
  assertEquals(isEnqueueRenderJobPayload(payloadArg), true);
}

Deno.test(
  "prepareModelJob calls deps.executeModelCallAndSave with a ChatApiRequest payload after Zone A-D processing",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    assertEquals(isChatApiRequest(chat), true);
    assertExists(payloadArg.preflightInputTokens);
    assertEquals(typeof payloadArg.preflightInputTokens, "number");
    assertEquals(payloadArg.preflightInputTokens > 0, true);
  },
);

Deno.test(
  "prepareModelJob calls deps.enqueueRenderJob after EMCAS succeeds with params and payload from job context and EMCAS success",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const contribution: DialecticContributionRow = buildDialecticContributionRow();
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution,
      needsContinuation: true,
      stageRelationshipForStage: "doc-identity-1",
      documentKey: FileType.HeaderContext,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: "render-job-1" }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(emcas.calls.length >= 1, true);
    assertEnqueueFirstCallShape(enqueue);
    const encFirst = enqueue.calls[0];
    assertExists(encFirst);
    const encParamsUnknown: unknown = encFirst.args[0];
    if (!isEnqueueRenderJobParams(encParamsUnknown)) {
      throw new Error("expected EnqueueRenderJobParams");
    }
    const encParams = encParamsUnknown;
    assertEquals(encParams.jobId, job.id);
    assertEquals(encParams.sessionId, "session-contract");
    assertEquals(encParams.stageSlug, DialecticStageSlug.Thesis);
    assertEquals(encParams.iterationNumber, 1);
    assertEquals(encParams.projectId, "project-contract");
    assertEquals(encParams.projectOwnerUserId, "owner-contract");
    assertEquals(encParams.userAuthToken, "jwt.contract");
    assertEquals(encParams.modelId, "model-contract");
    assertEquals(encParams.walletId, "wallet-contract");
    assertEquals(encParams.isTestJob, false);
    const encPayloadUnknown: unknown = encFirst.args[1];
    if (!isEnqueueRenderJobPayload(encPayloadUnknown)) {
      throw new Error("expected EnqueueRenderJobPayload");
    }
    const encPayload = encPayloadUnknown;
    assertEquals(encPayload.contributionId, contribution.id);
    assertEquals(encPayload.needsContinuation, true);
    assertEquals(encPayload.stageRelationshipForStage, "doc-identity-1");
    assertEquals(encPayload.documentKey, FileType.HeaderContext);
    assertEquals(encPayload.fileType, FileType.HeaderContext);
    assertEquals(encPayload.storageFileType, FileType.ModelContributionRawJson);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobSuccessReturn with contribution, needsContinuation, and renderJobId from enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const contribution: DialecticContributionRow = buildDialecticContributionRow();
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution,
      needsContinuation: true,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: "render-job-99" }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (isPrepareModelJobSuccessReturn(result)) {
      assertEquals(result.contribution.id, contribution.id);
      assertEquals(result.needsContinuation, true);
      assertEquals(result.renderJobId, "render-job-99");
    }
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required stageSlug",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = malformedPayloadMissingStageSlug();
    const job: DialecticJobRow = buildDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required walletId",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = malformedPayloadMissingWalletId();
    const job: DialecticJobRow = buildDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required iterationNumber",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = malformedPayloadMissingIterationNumber();
    const job: DialecticJobRow = buildDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when provider config is not AiModelExtendedConfig",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildAiProviderRow({ not_valid: true } as Json),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn with ContextWindowError when input exceeds context and compression is unavailable",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildAiProviderRow(
        modelConfigToJson({
          ...buildExtendedModelFixture(),
          context_window_tokens: 50,
        }),
      ),
      sessionData: buildDialecticSessionRow(),
    };
    const failingCompression: ICompressionStrategy = async () => {
      throw new ContextWindowError("compression unavailable");
    };
    const hugePrompt: PromptConstructionPayload = {
      conversationHistory: [],
      resourceDocuments: [],
      currentUserPrompt: "x".repeat(2000),
      source_prompt_resource_id: "source-prompt-resource-id",
    };
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: hugePrompt,
      compressionStrategy: failingCompression,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error instanceof ContextWindowError, true);
    }
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob applies compression when oversized and passes reduced token load in ChatApiRequest to EMCAS",
  async () => {
    const longPrompt: string = "y".repeat(130000);
    const longEncoded: Uint8Array = new TextEncoder().encode(longPrompt);
    const longDocBuffer: ArrayBuffer = new ArrayBuffer(longEncoded.byteLength);
    new Uint8Array(longDocBuffer).set(longEncoded);
    const downloadFromStorage: DownloadFromStorageFn = createMockDownloadFromStorage({
      mode: "success",
      data: longDocBuffer,
    });
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
        dialectic_project_resources: {
          select: () =>
            Promise.resolve({
              data: [
                {
                  id: "c1",
                  project_id: "project-contract",
                  session_id: "session-contract",
                  iteration_number: 1,
                  stage_slug: "thesis",
                  resource_type: "rendered_document",
                  storage_path:
                    "project-contract/session_session-contract/iteration_1/1_thesis/documents",
                  file_name: "model-contract_1_header_context.md",
                  storage_bucket: "contract-bucket",
                  created_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
        },
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const inputsRequired: InputRule[] = [
      {
        type: "document",
        slug: "thesis",
        required: true,
        document_key: FileType.HeaderContext,
      },
    ];
    const inputsRelevance: RelevanceRule[] = [
      { document_key: FileType.HeaderContext, relevance: 0.5 },
    ];
    const replacementCompression: ICompressionStrategy = async () => [
      {
        id: "c1",
        content: "short",
        sourceType: "document",
        originalIndex: 0,
        valueScore: 1,
        effectiveScore: 1,
      },
    ];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: "hi",
        source_prompt_resource_id: "source-prompt-resource-compress",
      },
      compressionStrategy: replacementCompression,
      inputsRelevance,
      inputsRequired,
    };
    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => {
      const msg: string = typeof payload.message === "string" ? payload.message : "";
      const docs = payload.resourceDocuments ?? [];
      let docLen = 0;
      for (let i = 0; i < docs.length; i++) {
        const c = docs[i].content;
        docLen += typeof c === "string" ? c.length : 0;
      }
      return msg.length + docLen;
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      countTokens,
      downloadFromStorage,
      tokenWalletService: createMockTokenWalletService({
        getBalance: () => Promise.resolve("10000000"),
      }).instance,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    assertEquals(chat.message.length < longPrompt.length, true);
    assertExists(chat.resourceDocuments);
    assertEquals(chat.resourceDocuments.length >= 1, true);
    const compressedContent: string = chat.resourceDocuments[0].content;
    assertEquals(compressedContent.length < longPrompt.length, true);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when wallet balance cannot afford estimated cost",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({ balance: 0 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const tokenWalletService: ITokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("0"),
    }).instance;
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      tokenWalletService,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob sets max_tokens_to_generate from getMaxOutputTokens on non-oversized path",
  async () => {
    const mockLogger: MockLogger = new MockLogger();
    const extended: AiModelExtendedConfig = buildExtendedModelFixture();
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(extended))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({ balance: 100000 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    const promptTokens = 100;
    const expected: number = getMaxOutputTokens(100000, promptTokens, extended, mockLogger);
    assertExists(chat.max_tokens_to_generate);
    assertEquals(chat.max_tokens_to_generate, expected);
  },
);

Deno.test(
  "prepareModelJob passes preflightInputTokens equal to counted input tokens on non-oversized path",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({ balance: 100000 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const fixedTokenCount = 42;
    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => fixedTokenCount;
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      countTokens,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    assertEquals(payloadArg.preflightInputTokens, fixedTokenCount);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when gatherArtifacts cannot find a required document",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
        dialectic_project_resources: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
        dialectic_contributions: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
        dialectic_feedback: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const inputsRequired: InputRule[] = [
      {
        type: "document",
        slug: "thesis",
        required: true,
        document_key: FileType.HeaderContext,
      },
    ];
    const inputsRelevance: RelevanceRule[] = [];
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
      inputsRequired,
      inputsRelevance,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error.message.length > 0, true);
    }
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns ExecuteModelCallAndSave error as PrepareModelJobErrorReturn without calling enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      error: new Error("emcas failed"),
      retriable: false,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length >= 1, true);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when enqueueRenderJob fails after EMCAS succeeds",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({
      error: new RenderJobEnqueueError("enqueue failed"),
      retriable: false,
    }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length >= 1, true);
    assertEquals(enqueue.calls.length >= 1, true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(
        result.error instanceof RenderJobEnqueueError ||
          result.error instanceof RenderJobValidationError,
        true,
      );
    }
  },
);
