// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.mock.ts

import { MockLogger } from "../../_shared/logger.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { applyInputsRequiredScope } from "../../_shared/utils/applyInputsRequiredScope.ts";
import { validateWalletBalance } from "../../_shared/utils/validateWalletBalance.ts";
import { validateModelCostRates } from "../../_shared/utils/validateModelCostRates.ts";
import { mockCompressionStrategy } from "../../_shared/utils/vector_utils.mock.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
  PromptConstructionPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import { buildMockBoundCalculateAffordabilityFn } from "../calculateAffordability/calculateAffordability.mock.ts";
import type {
  BoundEnqueueModelCallFn,
  EnqueueModelCallReturn,
} from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";

// ── Shared DB row / domain object builders ────────────────────────────────────

export type MockDialecticExecuteJobPayloadOverrides = {
  [K in keyof DialecticExecuteJobPayload]?: DialecticExecuteJobPayload[K];
};

export function mockDialecticExecuteJobPayload(
  overrides?: MockDialecticExecuteJobPayloadOverrides,
): DialecticExecuteJobPayload {
  const base: DialecticExecuteJobPayload = {
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
  return { ...base, ...overrides };
}

export type MockDialecticJobRowOverrides = {
  [K in keyof DialecticJobRow]?: DialecticJobRow[K];
};

export function mockDialecticJobRow(
  payload?: DialecticExecuteJobPayload,
  overrides?: MockDialecticJobRowOverrides,
): DialecticJobRow {
  const resolvedPayload = payload ?? mockDialecticExecuteJobPayload();
  if (!isJson(resolvedPayload)) {
    throw new Error("mockDialecticJobRow payload must be Json-compatible");
  }
  const base: DialecticJobRow = {
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
    payload: resolvedPayload,
    prerequisite_job_id: null,
    results: null,
    started_at: null,
    target_contribution_id: null,
    is_test_job: false,
    job_type: "EXECUTE",
    idempotency_key: null,
  };
  return { ...base, ...overrides };
}

export type MockDialecticSessionRowOverrides = {
  [K in keyof DialecticSessionRow]?: DialecticSessionRow[K];
};

export function mockDialecticSessionRow(
  overrides?: MockDialecticSessionRowOverrides,
): DialecticSessionRow {
  const base: DialecticSessionRow = {
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
  return { ...base, ...overrides };
}

export type MockAiProvidersRowOverrides = {
  [K in keyof Tables<"ai_providers">]?: Tables<"ai_providers">[K];
};

export function mockAiProvidersRow(
  overrides?: MockAiProvidersRowOverrides,
): Tables<"ai_providers"> {
  const config = buildExtendedModelConfig();
  const base: Tables<"ai_providers"> = {
    id: "model-contract",
    provider: "contract-provider",
    name: "Contract AI",
    api_identifier: config.api_identifier,
    config: {
      tokenization_strategy: config.tokenization_strategy,
      context_window_tokens: config.context_window_tokens,
      input_token_cost_rate: config.input_token_cost_rate,
      output_token_cost_rate: config.output_token_cost_rate,
      provider_max_input_tokens: config.provider_max_input_tokens,
      provider_max_output_tokens: config.provider_max_output_tokens,
      api_identifier: config.api_identifier,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_default_embedding: false,
    is_default_generation: false,
    is_enabled: true,
  };
  return { ...base, ...overrides };
}

export function mockAiProvidersRowFromConfig(
  config: AiModelExtendedConfig,
  overrides?: Omit<MockAiProvidersRowOverrides, "config">,
): Tables<"ai_providers"> {
  const base: Tables<"ai_providers"> = {
    id: "model-contract",
    provider: "contract-provider",
    name: "Contract AI",
    api_identifier: config.api_identifier,
    config: {
      tokenization_strategy: config.tokenization_strategy,
      context_window_tokens: config.context_window_tokens,
      input_token_cost_rate: config.input_token_cost_rate,
      output_token_cost_rate: config.output_token_cost_rate,
      provider_max_input_tokens: config.provider_max_input_tokens,
      provider_max_output_tokens: config.provider_max_output_tokens,
      api_identifier: config.api_identifier,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_default_embedding: false,
    is_default_generation: false,
    is_enabled: true,
  };
  return { ...base, ...overrides };
}

export type MockPromptConstructionPayloadOverrides = {
  [K in keyof PromptConstructionPayload]?: PromptConstructionPayload[K];
};

export function mockPromptConstructionPayload(
  overrides?: MockPromptConstructionPayloadOverrides,
): PromptConstructionPayload {
  const base: PromptConstructionPayload = {
    conversationHistory: [],
    resourceDocuments: [],
    currentUserPrompt: "contract user prompt",
    source_prompt_resource_id: "source-prompt-resource-contract",
  };
  return { ...base, ...overrides };
}

export type MockTokenWalletRowOverrides = {
  [K in keyof Tables<"token_wallets">]?: Tables<"token_wallets">[K];
};

export function mockTokenWalletRow(
  overrides?: MockTokenWalletRowOverrides,
): Tables<"token_wallets"> {
  const now = new Date().toISOString();
  const base: Tables<"token_wallets"> = {
    wallet_id: "wallet-contract",
    user_id: "user-contract",
    organization_id: null,
    balance: 1000,
    currency: "credits",
    created_at: now,
    updated_at: now,
  };
  return { ...base, ...overrides };
}

export type MockDialecticContributionRowOverrides = {
  [K in keyof DialecticContributionRow]?: DialecticContributionRow[K];
};

export function mockDialecticContributionRow(
  overrides?: MockDialecticContributionRowOverrides,
): DialecticContributionRow {
  const now = new Date().toISOString();
  const base: DialecticContributionRow = {
    id: "contribution-contract-1",
    session_id: "session-contract",
    stage: "thesis",
    iteration_number: 1,
    model_id: "model-contract",
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: "model_contribution_main",
    created_at: now,
    error: null,
    file_name: "model-contract_1_header_context.json",
    mime_type: "application/json",
    model_name: "Contract AI",
    original_model_contribution_id: null,
    processing_time_ms: 10,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 120,
    storage_bucket: "dialectic-contributions",
    storage_path: "project-contract/session_session-contract/iteration_1/thesis/documents",
    target_contribution_id: null,
    tokens_used_input: 5,
    tokens_used_output: 10,
    updated_at: now,
    user_id: "user-contract",
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
  };
  return { ...base, ...overrides };
}

// ── BoundEnqueueModelCallFn default ──────────────────────────────────────────

function _defaultBoundEnqueueModelCallFn(): BoundEnqueueModelCallFn {
  return async (): Promise<EnqueueModelCallReturn> => ({ queued: true });
}

// ── Public override types ─────────────────────────────────────────────────────

export type MockPrepareModelJobDepsOverrides = {
  [K in keyof PrepareModelJobDeps]?: PrepareModelJobDeps[K];
};

export type MockPrepareModelJobParamsOverrides = {
  [K in keyof PrepareModelJobParams]?: PrepareModelJobParams[K];
};

export type MockPrepareModelJobPayloadOverrides = {
  [K in keyof PrepareModelJobPayload]?: PrepareModelJobPayload[K];
};

export type MockPrepareModelJobSuccessReturnOverrides = {
  [K in keyof PrepareModelJobSuccessReturn]?: PrepareModelJobSuccessReturn[K];
};

export type MockPrepareModelJobErrorReturnOverrides = {
  [K in keyof PrepareModelJobErrorReturn]?: PrepareModelJobErrorReturn[K];
};

export type MockPrepareModelJobFnCall = {
  deps: PrepareModelJobDeps;
  params: PrepareModelJobParams;
  payload: PrepareModelJobPayload;
};

export type MockPrepareModelJobFnOptions = {
  handler?: PrepareModelJobFn;
  result?: PrepareModelJobReturn;
};

// ── Mock builders ─────────────────────────────────────────────────────────────

export function mockPrepareModelJobDeps(
  overrides?: MockPrepareModelJobDepsOverrides,
): PrepareModelJobDeps {
  const base: PrepareModelJobDeps = {
    logger: new MockLogger(),
    applyInputsRequiredScope,
    tokenWalletService: createMockUserTokenWalletService().instance,
    validateWalletBalance,
    validateModelCostRates,
    calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
    enqueueModelCall: _defaultBoundEnqueueModelCallFn(),
  };
  return { ...base, ...overrides };
}

export function mockPrepareModelJobParams(
  overrides?: MockPrepareModelJobParamsOverrides,
): PrepareModelJobParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: PrepareModelJobParams = {
    dbClient,
    authToken: "token-contract",
    job: mockDialecticJobRow(),
    projectOwnerUserId: "owner-contract",
    providerRow: mockAiProvidersRow(),
    sessionData: mockDialecticSessionRow(),
  };
  return { ...base, ...overrides };
}

export function mockPrepareModelJobPayload(
  overrides?: MockPrepareModelJobPayloadOverrides,
): PrepareModelJobPayload {
  const base: PrepareModelJobPayload = {
    promptConstructionPayload: mockPromptConstructionPayload(),
    compressionStrategy: mockCompressionStrategy,
  };
  return { ...base, ...overrides };
}

export function mockPrepareModelJobSuccessReturn(
  overrides?: MockPrepareModelJobSuccessReturnOverrides,
): PrepareModelJobSuccessReturn {
  const base: PrepareModelJobSuccessReturn = { queued: true };
  return { ...base, ...overrides };
}

export function mockPrepareModelJobErrorReturn(
  overrides?: MockPrepareModelJobErrorReturnOverrides,
): PrepareModelJobErrorReturn {
  const base: PrepareModelJobErrorReturn = {
    error: new Error("mock-prepare-error"),
    retriable: false,
  };
  return { ...base, ...overrides };
}

export function mockPrepareModelJobFn(
  options?: MockPrepareModelJobFnOptions,
): { fn: PrepareModelJobFn; calls: MockPrepareModelJobFnCall[] } {
  const calls: MockPrepareModelJobFnCall[] = [];
  const fn: PrepareModelJobFn = async (
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
    const success: PrepareModelJobSuccessReturn = { queued: true };
    return success;
  };
  return { fn, calls };
}
