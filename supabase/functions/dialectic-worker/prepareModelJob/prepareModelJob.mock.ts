// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.mock.ts

import type {
  AiModelExtendedConfig,
  ILogger,
} from "../../_shared/types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
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
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";
import type { Json, Tables } from "../../types_db.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
  PromptConstructionPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  BoundExecuteModelCallAndSaveFn,
} from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import type {
  BoundEnqueueRenderJobFn,
} from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
import type { ITokenWalletService } from "../../_shared/types/tokenWallet.types.ts";
import { EmbeddingClient } from "../../_shared/services/indexing_service.ts";
import { mockOpenAiAdapter } from "../../_shared/ai_service/openai_adapter.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";

export type PrepareModelJobDepsOverrides = {
  executeModelCallAndSave: BoundExecuteModelCallAndSaveFn;
  enqueueRenderJob: BoundEnqueueRenderJobFn;
  countTokens?: CountTokensFn;
  tokenWalletService?: ITokenWalletService;
  downloadFromStorage?: DownloadFromStorageFn;
};

export type PrepareModelJobMockCall = {
  deps: PrepareModelJobDeps;
  params: PrepareModelJobParams;
  payload: PrepareModelJobPayload;
};

/**
 * Options for {@link createPrepareModelJobMock}. Supply either `handler` or `result` to
 * fully control behavior; otherwise a configurable success fallback is used.
 */
export type CreatePrepareModelJobMockOptions = {
  /** When set, invoked after recording the call; overrides `result` and default success. */
  handler?: PrepareModelJobFn;
  /** When set (and no `handler`), returned after recording the call. */
  result?: PrepareModelJobReturn;
  /** Contribution row for the default success path (no `handler` / `result`). */
  successContribution?: DialecticContributionRow;
  /** Default success only: `needsContinuation` (defaults to `false`). */
  needsContinuation?: boolean;
  /** Default success only: `renderJobId` (defaults to `null`). */
  renderJobId?: string | null;
};

function defaultMockContribution(): DialecticContributionRow {
  const now: string = new Date().toISOString();
  return {
    id: "mock-prepare-model-job-contribution",
    session_id: "mock-session",
    stage: "thesis",
    iteration_number: 1,
    model_id: "mock-model",
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: "model_contribution_main",
    created_at: now,
    error: null,
    file_name: "mock.txt",
    mime_type: "text/plain",
    model_name: "Mock Model",
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 0,
    storage_bucket: "mock-bucket",
    storage_path: "mock/path",
    target_contribution_id: null,
    tokens_used_input: 0,
    tokens_used_output: 0,
    updated_at: now,
    user_id: "mock-user",
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
  };
}

export function buildExecuteJobPayload(): DialecticExecuteJobPayload {
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

export function buildDialecticJobRow(payload: DialecticExecuteJobPayload): DialecticJobRow {
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

export function buildDialecticSessionRow(): DialecticSessionRow {
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

export function buildExtendedModelFixture(): AiModelExtendedConfig {
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

export function buildAiProviderRow(config: AiModelExtendedConfig): Tables<"ai_providers"> {
  if (!isJson(config)) {
    throw new Error("Contract test config must serialize to Json");
  }
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

export function buildDefaultAiProvidersRow(): Tables<"ai_providers"> {
  return buildAiProviderRow(buildExtendedModelFixture());
}

export function buildDialecticContributionRow(): DialecticContributionRow {
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

export function buildPromptConstructionPayload(): PromptConstructionPayload {
  return {
    conversationHistory: [],
    resourceDocuments: [],
    currentUserPrompt: "contract user prompt",
    source_prompt_resource_id: "source-prompt-resource-contract",
  };
}

export function buildTokenWalletRow(
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

export function buildPrepareModelJobDeps(
  overrides: PrepareModelJobDepsOverrides,
): PrepareModelJobDeps {
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
  const embeddingClient: IEmbeddingClient = new EmbeddingClient(mockOpenAiAdapter);
  const countTokens: CountTokensFn = overrides.countTokens !== undefined
    ? overrides.countTokens
    : createMockCountTokens();
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

export function malformedPayloadMissingStageSlug(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.stageSlug;
  return rec as unknown as DialecticExecuteJobPayload;
}

export function malformedPayloadMissingWalletId(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.walletId;
  return rec as unknown as DialecticExecuteJobPayload;
}

export function malformedPayloadMissingIterationNumber(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.iterationNumber;
  return rec as unknown as DialecticExecuteJobPayload;
}

export function malformedPayloadMissingUserJwt(): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const rec: Record<string, unknown> = { ...base };
  delete rec.user_jwt;
  return rec as unknown as DialecticExecuteJobPayload;
}

/**
 * Factory for a test double of {@link PrepareModelJobFn}: records each invocation
 * and returns a configured result, delegates to an optional handler, or defaults
 * to a success return with a stub contribution.
 */
export function createPrepareModelJobMock(
  options?: CreatePrepareModelJobMockOptions,
): {
  prepareModelJob: PrepareModelJobFn;
  calls: PrepareModelJobMockCall[];
} {
  const calls: PrepareModelJobMockCall[] = [];

  const prepareModelJob: PrepareModelJobFn = async (
    deps: PrepareModelJobDeps,
    params: PrepareModelJobParams,
    payload: PrepareModelJobPayload,
  ): Promise<PrepareModelJobReturn> => {
    calls.push({ deps, params, payload });
    if (options?.handler !== undefined) {
      return await options.handler(deps, params, payload);
    }
    if (options?.result !== undefined) {
      return options.result;
    }
    const contribution: DialecticContributionRow = options?.successContribution !== undefined
      ? options.successContribution
      : defaultMockContribution();
    const needsContinuation: boolean = options?.needsContinuation !== undefined
      ? options.needsContinuation
      : false;
    const renderJobId: string | null = options?.renderJobId !== undefined
      ? options.renderJobId
      : null;
    const fallback: PrepareModelJobSuccessReturn = {
      contribution,
      needsContinuation,
      renderJobId,
    };
    return fallback;
  };

  return { prepareModelJob, calls };
}
