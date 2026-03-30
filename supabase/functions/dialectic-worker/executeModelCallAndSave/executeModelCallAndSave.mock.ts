// supabase/functions/dialectic-worker/executeModelCallAndSave/executeModelCallAndSave.mock.ts

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Tables } from '../../types_db.ts';
import type { ChatMessageInsert, ServiceError } from '../../_shared/types.ts';
import type {
  AdapterStreamChunk,
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  ChatApiRequest,
  FactoryDependencies,
  FinishReason,
  GetAiProviderAdapterFn,
  TokenUsage,
} from '../../_shared/types.ts';
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
} from '../../dialectic-service/dialectic.interface.ts';
import type {
  DebitTokens,
  DebitTokensDeps,
  DebitTokensPayload,
  DebitTokensParams,
  DebitTokensReturn,
} from '../../_shared/utils/debitTokens.interface.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { isJson } from '../../_shared/utils/type_guards.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { createMockTokenWalletService } from '../../_shared/services/tokenWalletService.mock.ts';
import { mockNotificationService } from '../../_shared/utils/notification.service.mock.ts';
import { resolveFinishReason } from '../../_shared/utils/resolveFinishReason.ts';
import { isIntermediateChunk } from '../../_shared/utils/isIntermediateChunk.ts';
import { determineContinuation } from '../../_shared/utils/determineContinuation/determineContinuation.ts';
import { buildUploadContext } from '../../_shared/utils/buildUploadContext/buildUploadContext.ts';
import {
  getMockAiProviderAdapter,
  type MockAiProviderAdapterControls,
} from '../../_shared/ai_service/ai_provider.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
} from './executeModelCallAndSave.interface.ts';

export type ExecuteModelCallAndSaveDepsOverrides = {
  [K in keyof ExecuteModelCallAndSaveDeps]?: ExecuteModelCallAndSaveDeps[K];
};

export type ExecuteModelCallAndSaveParamsOverrides = {
  [K in keyof ExecuteModelCallAndSaveParams]?: ExecuteModelCallAndSaveParams[K];
};

export type ExecuteModelCallAndSavePayloadOverrides = {
  [K in keyof ExecuteModelCallAndSavePayload]?: ExecuteModelCallAndSavePayload[K];
};

export type ChatApiRequestOverrides = {
  [K in keyof ChatApiRequest]?: ChatApiRequest[K];
};

export type AiModelExtendedConfigOverrides = {
  [K in keyof AiModelExtendedConfig]?: AiModelExtendedConfig[K];
};

export type DialecticJobRowOverrides = {
  [K in keyof DialecticJobRow]?: DialecticJobRow[K];
};

export type DialecticSessionRowOverrides = {
  [K in keyof DialecticSessionRow]?: DialecticSessionRow[K];
};

export type MockAiProviderAdapterOverrides = {
  sendMessage?: AiProviderAdapterInstance['sendMessage'];
  sendMessageStream?: AiProviderAdapterInstance['sendMessageStream'];
  listModels?: AiProviderAdapterInstance['listModels'];
  getEmbedding?: AiProviderAdapterInstance['getEmbedding'];
};

/**
 * One factory for adapter streaming: ordered text deltas, usage chunk, finish_reason.
 * `tokenUsage`: omitted → default 1/2/3 totals; `null` → no `usage` chunk (debit null-path tests).
 * For adapter errors, use {@link createMockEmcasAiAdapterHarness} and `controls.setMockError`.
 */
export type MockEmcasStreamParams = {
  textDeltas?: string[];
  tokenUsage?: TokenUsage | null;
  finishReason?: FinishReason;
};

export type CreateMockFileManagerForEmcasOptions =
  | { outcome: 'success'; contribution: DialecticContributionRow }
  | { outcome: 'failure'; message: string };

export type CreateMockDebitTokensFnParams =
  | { kind: 'success' }
  | { kind: 'failure'; message: string; retriable: boolean }
  | { kind: 'recording'; sink: DebitTokensParams[] };

export type FactoryDependenciesOverrides = {
  [K in keyof FactoryDependencies]?: FactoryDependencies[K];
};

export type AiProvidersRowOverrides = {
  [K in keyof Tables<'ai_providers'>]?: Tables<'ai_providers'>[K];
};

export type ChatMessageInsertOverrides = {
  [K in keyof ChatMessageInsert]?: ChatMessageInsert[K];
};

export type CreateMockExecuteModelCallAndSaveParamsOptions = {
  dbClient?: SupabaseClient<Database>;
  jobRowOverrides?: DialecticJobRowOverrides;
};

export type CreateMockDebitTokensOverrides = {
  impl?: DebitTokens;
};

export type CreateMockDialecticContributionRowOverrides = {
  [K in keyof Tables<'dialectic_contributions'>]?: Tables<'dialectic_contributions'>[K];
};

export type CreateMockDialecticProjectResourcesRowOverrides = {
  [K in keyof Tables<'dialectic_project_resources'>]?: Tables<'dialectic_project_resources'>[K];
};

export const mockFullProviderConfig: AiModelExtendedConfig = {
  tokenization_strategy: { type: 'rough_char_count' },
  context_window_tokens: 10000,
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
  provider_max_input_tokens: 100,
  provider_max_output_tokens: 50,
  api_identifier: 'mock-ai-v1',
};

export const mockSessionRow: DialecticSessionRow = {
  id: 'session-456',
  project_id: 'project-abc',
  session_description: 'A mock session',
  user_input_reference_url: null,
  iteration_count: 1,
  selected_model_ids: ['model-def'],
  status: 'in-progress',
  associated_chat_id: 'chat-789',
  current_stage_id: 'stage-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  idempotency_key: 'session-456_render',
  viewing_stage_id: null,
};

export const testPayload: DialecticExecuteJobPayload = {
  prompt_template_id: 'test-prompt',
  inputs: {},
  output_type: FileType.HeaderContext,
  document_key: 'header_context',
  projectId: 'project-abc',
  sessionId: 'session-456',
  stageSlug: 'thesis',
  model_id: 'model-def',
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: 'wallet-ghi',
  user_jwt: 'jwt.token.here',
  canonicalPathParams: {
    contributionType: 'thesis',
    stageSlug: 'thesis',
  },
  idempotencyKey: 'job-id-123_render',
};

export const testPayloadContinuation: DialecticExecuteJobPayload = {
  ...testPayload,
  continueUntilComplete: true,
  continuation_count: 1,
  target_contribution_id: 'parent-contrib-1',
  document_relationships: {
    thesis: 'parent-contrib-1',
    source_group: '00000000-0000-4000-8000-000000000001',
  },
  canonicalPathParams: {
    ...testPayload.canonicalPathParams,
  },
};

export const testPayloadDocumentArtifact: DialecticExecuteJobPayload = {
  ...testPayload,
  output_type: FileType.business_case,
  document_key: 'business_case',
  document_relationships: {
    thesis: 'contrib-test-1',
    source_group: '00000000-0000-4000-8000-000000000002',
  },
  canonicalPathParams: {
    ...testPayload.canonicalPathParams,
  },
};

export function createMockJob(
  payload: DialecticJobPayload,
  overrides: DialecticJobRowOverrides = {},
): DialecticJobRow {
  if (!isJson(payload)) {
    throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
  }

  const baseJob: Tables<'dialectic_generation_jobs'> = {
    id: 'job-id-123',
    session_id: 'session-id-123',
    stage_slug: 'thesis',
    iteration_number: 1,
    status: 'pending',
    user_id: 'user-id-123',
    attempt_count: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
    error_details: null,
    max_retries: 3,
    parent_job_id: null,
    prerequisite_job_id: null,
    results: null,
    started_at: null,
    target_contribution_id: null,
    payload: payload,
    is_test_job: false,
    job_type: 'PLAN',
    idempotency_key: null,
    ...overrides,
  };

  return baseJob;
}

export function createMockAiProvidersRow(
  overrides?: AiProvidersRowOverrides,
): Tables<'ai_providers'> {
  if (!isJson(mockFullProviderConfig)) {
    throw new Error('Mock full provider config is not valid JSON');
  }
  const base: Tables<'ai_providers'> = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
    created_at: new Date().toISOString(),
    config: mockFullProviderConfig,
    description: null,
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    is_default_generation: false,
    updated_at: new Date().toISOString(),
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockAiModelExtendedConfig(
  overrides?: AiModelExtendedConfigOverrides,
): AiModelExtendedConfig {
  const base: AiModelExtendedConfig = {
    ...mockFullProviderConfig,
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockFactoryDependencies(
  overrides?: FactoryDependenciesOverrides,
): FactoryDependencies {
  const logger: FactoryDependencies['logger'] = new MockLogger();
  const base: FactoryDependencies = {
    provider: createMockAiProvidersRow(),
    apiKey: 'test-api-key',
    logger,
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

/**
 * Default EMCAS `getAiProviderAdapter` — uses shared `getMockAiProviderAdapter` (new instance per call).
 * For stable `instance` + `controls` (setMockResponse / setMockError), use {@link createMockEmcasAiAdapterHarness}.
 * For custom chunk order, use {@link createMockSendMessageStreamFromParams} via {@link createMockAiProviderAdapterInstance}.
 */
export function createMockEmcasGetAiProviderAdapter(
  modelConfig?: AiModelExtendedConfig,
): GetAiProviderAdapterFn {
  const config: AiModelExtendedConfig = modelConfig ?? mockFullProviderConfig;
  const fn: GetAiProviderAdapterFn = (factoryDeps: FactoryDependencies) => {
    const { instance } = getMockAiProviderAdapter(factoryDeps.logger, config);
    return instance;
  };
  return fn;
}

/**
 * Single harness: one adapter instance and `controls` from `getMockAiProviderAdapter` for response/error injection.
 */
export function createMockEmcasAiAdapterHarness(
  modelConfig?: AiModelExtendedConfig,
): {
  getAiProviderAdapter: GetAiProviderAdapterFn;
  controls: MockAiProviderAdapterControls;
} {
  const config: AiModelExtendedConfig = modelConfig ?? mockFullProviderConfig;
  const logger: FactoryDependencies['logger'] = new MockLogger();
  const { instance, controls } = getMockAiProviderAdapter(logger, config);
  const getAiProviderAdapter: GetAiProviderAdapterFn = (
    _factoryDeps: FactoryDependencies,
  ) => instance;
  return { getAiProviderAdapter, controls };
}

/** Default `usage` chunk totals when `MockEmcasStreamParams.tokenUsage` is omitted. */
export const mockEmcasDefaultStreamTokenUsage: TokenUsage = {
  prompt_tokens: 1,
  completion_tokens: 2,
  total_tokens: 3,
};

/**
 * Builds `sendMessageStream` from one params object (no per-scenario named generators).
 */
export function createMockSendMessageStreamFromParams(
  params?: MockEmcasStreamParams,
): AiProviderAdapterInstance['sendMessageStream'] {
  const textDeltas: string[] = params?.textDeltas ?? [''];
  const finishReason: FinishReason = params?.finishReason ?? 'stop';
  const tokenUsageParam: TokenUsage | null | undefined = params?.tokenUsage;
  const omitUsageChunk: boolean = tokenUsageParam === null;
  const usageForChunk: TokenUsage = tokenUsageParam !== undefined &&
      tokenUsageParam !== null
    ? tokenUsageParam
    : mockEmcasDefaultStreamTokenUsage;
  const stream: AiProviderAdapterInstance['sendMessageStream'] = async function* (
    _request: ChatApiRequest,
    _modelIdentifier: string,
  ): AsyncGenerator<AdapterStreamChunk> {
    for (const text of textDeltas) {
      yield { type: 'text_delta', text };
    }
    if (!omitUsageChunk) {
      yield { type: 'usage', tokenUsage: usageForChunk };
    }
    yield { type: 'done', finish_reason: finishReason };
  };
  return stream;
}

export function createMockAiProviderAdapterInstance(
  overrides?: MockAiProviderAdapterOverrides,
): AiProviderAdapterInstance {
  const base: AiProviderAdapterInstance = {
    sendMessage: async () => ({
      role: 'assistant',
      content: 'mock',
      ai_provider_id: null,
      system_prompt_id: null,
      token_usage: null,
    }),
    sendMessageStream: createMockSendMessageStreamFromParams(),
    listModels: async () => [],
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockChatApiRequest(
  overrides?: ChatApiRequestOverrides,
): ChatApiRequest {
  const base: ChatApiRequest = {
    message: 'hello',
    providerId: 'model-def',
    promptId: '__none__',
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockExecuteModelCallAndSavePayload(
  overrides?: ExecuteModelCallAndSavePayloadOverrides,
): ExecuteModelCallAndSavePayload {
  const base: ExecuteModelCallAndSavePayload = {
    chatApiRequest: createMockChatApiRequest(),
    preflightInputTokens: 100,
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockDialecticSessionRow(
  overrides?: DialecticSessionRowOverrides,
): DialecticSessionRow {
  const base: DialecticSessionRow = { ...mockSessionRow };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockChatMessageInsert(
  overrides?: ChatMessageInsertOverrides,
): ChatMessageInsert {
  const base: ChatMessageInsert = {
    content: 'mock-message',
    role: 'assistant',
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockDebitTokensSuccessFn(
  overrides?: CreateMockDebitTokensOverrides,
): DebitTokens {
  if (overrides?.impl) {
    return overrides.impl;
  }
  const fn: DebitTokens = async (
    _deps: DebitTokensDeps,
    _params: DebitTokensParams,
    _payload: DebitTokensPayload,
  ): Promise<DebitTokensReturn> => ({
    result: {
      userMessage: createMockChatMessageInsert({ role: 'user' }),
      assistantMessage: createMockChatMessageInsert({ role: 'assistant' }),
    },
    transactionRecordedSuccessfully: true,
  });
  return fn;
}

/**
 * Single entry for debit behavior: success, failure, or recording calls into `sink`.
 */
export function createMockDebitTokensFn(
  params?: CreateMockDebitTokensFnParams,
): DebitTokens {
  if (!params || params.kind === 'success') {
    return createMockDebitTokensSuccessFn();
  }
  if (params.kind === 'failure') {
    const message: string = params.message;
    const retriable: boolean = params.retriable;
    return createMockDebitTokensSuccessFn({
      impl: async (
        _deps: DebitTokensDeps,
        _p: DebitTokensParams,
        _pay: DebitTokensPayload,
      ): Promise<DebitTokensReturn> => ({
        error: new Error(message),
        retriable,
      }),
    });
  }
  const sink: DebitTokensParams[] = params.sink;
  const inner: DebitTokens = createMockDebitTokensSuccessFn();
  const fn: DebitTokens = async (
    deps: DebitTokensDeps,
    p: DebitTokensParams,
    pay: DebitTokensPayload,
  ): Promise<DebitTokensReturn> => {
    sink.push(p);
    return inner(deps, p, pay);
  };
  return fn;
}

export function createMockFileManagerForEmcas(
  options: CreateMockFileManagerForEmcasOptions,
): MockFileManagerService {
  const fm: MockFileManagerService = new MockFileManagerService();
  if (options.outcome === 'success') {
    fm.setUploadAndRegisterFileResponse(options.contribution, null);
    return fm;
  }
  const err: ServiceError = { message: options.message };
  fm.setUploadAndRegisterFileResponse(null, err);
  return fm;
}

export function createMockExecuteModelCallAndSaveDeps(
  overrides?: ExecuteModelCallAndSaveDepsOverrides,
): ExecuteModelCallAndSaveDeps {
  const tokenWalletService = createMockTokenWalletService().instance;
  const base: ExecuteModelCallAndSaveDeps = {
    logger: new MockLogger(),
    fileManager: new MockFileManagerService(),
    getAiProviderAdapter: createMockEmcasGetAiProviderAdapter(),
    tokenWalletService,
    notificationService: mockNotificationService,
    continueJob: async () => ({ enqueued: false }),
    retryJob: async () => ({}),
    resolveFinishReason,
    isIntermediateChunk,
    determineContinuation,
    buildUploadContext,
    debitTokens: createMockDebitTokensSuccessFn(),
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockExecuteModelCallAndSaveParams(
  overrides?: ExecuteModelCallAndSaveParamsOverrides,
  options?: CreateMockExecuteModelCallAndSaveParamsOptions,
): ExecuteModelCallAndSaveParams {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(undefined, {});
  const dbClient: SupabaseClient<Database> = options?.dbClient ??
    mockSetup.client as unknown as SupabaseClient<Database>;
  const job: DialecticJobRow = createMockJob(
    testPayload,
    options?.jobRowOverrides ?? {},
  );
  const base: ExecuteModelCallAndSaveParams = {
    dbClient,
    job,
    providerRow: createMockAiProvidersRow(),
    sourcePromptResourceId: 'source-prompt-resource-id',
    userAuthToken: 'jwt.token.here',
    sessionData: createMockDialecticSessionRow(),
    projectOwnerUserId: 'user-789',
    stageSlug: 'thesis',
    iterationNumber: 1,
    projectId: 'project-abc',
    sessionId: 'session-456',
    model_id: 'model-def',
    walletId: 'wallet-ghi',
    output_type: 'header_context',
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

/**
 * Full valid `dialectic_contributions` row for EMCAS unit tests (fileManager success paths).
 */
export function createMockDialecticContributionRow(
  overrides?: CreateMockDialecticContributionRowOverrides,
): DialecticContributionRow {
  const base: Tables<'dialectic_contributions'> = {
    id: 'contrib-test-1',
    citations: null,
    contribution_type: 'thesis',
    created_at: new Date().toISOString(),
    document_relationships: { thesis: 'contrib-test-1' },
    edit_version: 1,
    error: null,
    file_name: null,
    is_header: false,
    is_latest_edit: true,
    iteration_number: 1,
    mime_type: 'application/json',
    model_id: 'model-def',
    model_name: null,
    original_model_contribution_id: null,
    processing_time_ms: 1,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    session_id: 'session-456',
    size_bytes: 10,
    source_prompt_resource_id: null,
    stage: 'thesis',
    storage_bucket: 'test-bucket',
    storage_path: 'test/path.json',
    target_contribution_id: null,
    tokens_used_input: 1,
    tokens_used_output: 1,
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

/**
 * Full valid `dialectic_project_resources` row for EMCAS unit tests (e.g. prompt resource update spies).
 */
export function createMockDialecticProjectResourcesRow(
  overrides?: CreateMockDialecticProjectResourcesRowOverrides,
): Tables<'dialectic_project_resources'> {
  const nowIso: string = new Date().toISOString();
  const base: Tables<'dialectic_project_resources'> = {
    id: 'mock-dialectic-project-resource-id',
    created_at: nowIso,
    updated_at: nowIso,
    file_name: 'prompt.txt',
    iteration_number: null,
    mime_type: 'text/plain',
    project_id: 'project-abc',
    resource_description: null,
    resource_type: 'prompt',
    session_id: 'session-456',
    size_bytes: 100,
    source_contribution_id: null,
    stage_slug: null,
    storage_bucket: 'test-bucket',
    storage_path: 'path/to/prompt',
    user_id: 'user-789',
  };
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}
