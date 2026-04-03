// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.mock.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ILogger,
  Messages,
  ResourceDocument,
  ResourceDocuments,
} from "../../_shared/types.ts";
import type {
  CountTokensDeps,
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";
import type { IEmbeddingClient } from "../../_shared/services/indexing_service.interface.ts";
import { EmbeddingClient } from "../../_shared/services/indexing_service.ts";
import { mockOpenAiAdapter } from "../../_shared/ai_service/openai_adapter.mock.ts";
import type { ITokenWalletService } from "../../_shared/types/tokenWallet.types.ts";
import type { IRagService } from "../../_shared/services/rag_service.interface.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { createMockTokenWalletService } from "../../_shared/services/tokenWalletService.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { RelevanceRule } from "../../dialectic-service/dialectic.interface.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { IMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { Database } from "../../types_db.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
  CompressPromptSuccessReturn,
} from "./compressPrompt.interface.ts";
import { compressPrompt } from "./compressPrompt.ts";
import { isCompressPromptErrorReturn } from "./compressPrompt.guard.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";

export type CompressPromptParamsOverrides = {
  extendedModelConfig?: AiModelExtendedConfig;
  inputsRelevance?: RelevanceRule[];
  jobId?: string;
  projectOwnerUserId?: string;
  sessionId?: string;
  stageSlug?: string;
  walletId?: string;
  inputRate?: number;
  outputRate?: number;
  isContinuationFlowInitial?: boolean;
  finalTargetThreshold?: number;
  balanceAfterCompression?: number;
  walletBalance?: number;
};

export function buildResourceDocument(
  overrides?: Partial<ResourceDocument>,
): ResourceDocument {
  const base: ResourceDocument = {
    id: "contract-resource-1",
    content: "contract original body",
    document_key: "header_context",
    stage_slug: "thesis",
    type: "document",
  };
  return { ...base, ...overrides };
}

export function buildChatApiRequest(
  resourceDocuments: ResourceDocuments,
  currentUserPrompt: string,
  overrides?: Partial<ChatApiRequest>,
): ChatApiRequest {
  const base: ChatApiRequest = {
    message: currentUserPrompt,
    providerId: "00000000-0000-4000-8000-000000000001",
    promptId: "__none__",
    walletId: "00000000-0000-4000-8000-000000000002",
    resourceDocuments,
    messages: [{ role: "user", content: "contract history turn" }],
    systemInstruction: "contract system instruction",
  };
  return { ...base, ...overrides };
}

export function buildTokenizerDeps(): CountTokensDeps {
  return {
    getEncoding: (_name: string) => ({
      encode: (input: string) =>
        Array.from(input ?? "", (_ch, index: number) => index),
    }),
    countTokensAnthropic: (text: string) => (text ?? "").length,
    logger: {
      warn: (_message: string) => {
        return;
      },
      error: (_message: string) => {
        return;
      },
    },
  };
}

const defaultCompressionStrategy: ICompressionStrategy = async () => {
  return [];
};

export function DbClient(client: IMockSupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

export function buildCompressPromptParams(
  dbClient: SupabaseClient<Database>,
  overrides?: CompressPromptParamsOverrides,
): CompressPromptParams {
  const extendedModelConfig: AiModelExtendedConfig = overrides?.extendedModelConfig !== undefined
    ? overrides.extendedModelConfig
    : buildExtendedModelConfig();
  const inputsRelevance: RelevanceRule[] = overrides?.inputsRelevance !== undefined
    ? overrides.inputsRelevance
    : [{ document_key: FileType.HeaderContext, relevance: 1 }];
  return {
    dbClient,
    jobId: overrides?.jobId !== undefined ? overrides.jobId : "contract-job-id",
    projectOwnerUserId: overrides?.projectOwnerUserId !== undefined
      ? overrides.projectOwnerUserId
      : "-owner-id",
    sessionId: overrides?.sessionId !== undefined ? overrides.sessionId : "contract-session-id",
    stageSlug: overrides?.stageSlug !== undefined ? overrides.stageSlug : "thesis",
    walletId: overrides?.walletId !== undefined ? overrides.walletId : "contract-wallet-id",
    extendedModelConfig,
    inputsRelevance,
    inputRate: overrides?.inputRate !== undefined ? overrides.inputRate : 0.01,
    outputRate: overrides?.outputRate !== undefined ? overrides.outputRate : 0.01,
    isContinuationFlowInitial: overrides?.isContinuationFlowInitial !== undefined
      ? overrides.isContinuationFlowInitial
      : false,
    finalTargetThreshold: overrides?.finalTargetThreshold !== undefined
      ? overrides.finalTargetThreshold
      : 50000,
    balanceAfterCompression: overrides?.balanceAfterCompression !== undefined
      ? overrides.balanceAfterCompression
      : 900000,
    walletBalance: overrides?.walletBalance !== undefined ? overrides.walletBalance : 1_000_000,
  };
}

export type CompressPromptPayloadOverrides = {
  compressionStrategy?: ICompressionStrategy;
  resourceDocuments?: ResourceDocuments;
  conversationHistory?: Messages[];
  currentUserPrompt?: string;
  chatApiRequest?: ChatApiRequest;
  tokenizerDeps?: CountTokensDeps;
};

export function buildCompressPromptPayload(
  overrides?: CompressPromptPayloadOverrides,
): CompressPromptPayload {
  const resourceDocuments: ResourceDocuments = overrides?.resourceDocuments !== undefined
    ? overrides.resourceDocuments
    : [buildResourceDocument()];
  const currentUserPrompt: string = overrides?.currentUserPrompt !== undefined
    ? overrides.currentUserPrompt
    : "contract user prompt text";
  const chatApiRequest: ChatApiRequest = overrides?.chatApiRequest !== undefined
    ? overrides.chatApiRequest
    : buildChatApiRequest(resourceDocuments, currentUserPrompt);
  const tokenizerDeps: CountTokensDeps = overrides?.tokenizerDeps !== undefined
    ? overrides.tokenizerDeps
    : buildTokenizerDeps();
  const compressionStrategy: ICompressionStrategy = overrides?.compressionStrategy !== undefined
    ? overrides.compressionStrategy
    : defaultCompressionStrategy;
  const conversationHistory: Messages[] = overrides?.conversationHistory !== undefined
    ? overrides.conversationHistory
    : [];
  return {
    compressionStrategy,
    resourceDocuments,
    conversationHistory,
    currentUserPrompt,
    chatApiRequest,
    tokenizerDeps,
  };
}

export function buildCompressPromptSuccessReturn(
  value: CompressPromptSuccessReturn,
): CompressPromptSuccessReturn {
  return {
    chatApiRequest: value.chatApiRequest,
    resolvedInputTokenCount: value.resolvedInputTokenCount,
    resourceDocuments: value.resourceDocuments,
  };
}

export function buildCompressPromptErrorReturn(
  error: Error,
  retriable: boolean,
): CompressPromptErrorReturn {
  return { error, retriable };
}

export type CompressPromptDepsOverrides = {
  logger?: ILogger;
  ragService?: IRagService;
  embeddingClient?: IEmbeddingClient;
  tokenWalletService?: ITokenWalletService;
  countTokens?: CountTokensFn;
};

export function buildCompressPromptDeps(
  overrides?: CompressPromptDepsOverrides,
): CompressPromptDeps {
  const logger: ILogger = overrides?.logger !== undefined
    ? overrides.logger
    : new MockLogger();
  const ragService: IRagService = overrides?.ragService !== undefined
    ? overrides.ragService
    : new MockRagService();
  const embeddingClient: IEmbeddingClient = overrides?.embeddingClient !== undefined
    ? overrides.embeddingClient
    : new EmbeddingClient(mockOpenAiAdapter);
  const tokenWalletService: ITokenWalletService = overrides?.tokenWalletService !== undefined
    ? overrides.tokenWalletService
    : createMockTokenWalletService().instance;
  const countTokens: CountTokensFn = overrides?.countTokens !== undefined
    ? overrides.countTokens
    : createMockCountTokens();
  return {
    logger,
    ragService,
    embeddingClient,
    tokenWalletService,
    countTokens,
  };
}

export type CreateCompressPromptMockOptions = {
  handler?: BoundCompressPromptFn;
  result?: CompressPromptReturn;
};

export type CompressPromptMockCall = {
  params: CompressPromptParams;
  payload: CompressPromptPayload;
};

export function createCompressPromptMock(
  options: CreateCompressPromptMockOptions,
): {
  compressPrompt: BoundCompressPromptFn;
  calls: CompressPromptMockCall[];
} {
  const calls: CompressPromptMockCall[] = [];
  const compressPrompt: BoundCompressPromptFn = async (
    params: CompressPromptParams,
    payload: CompressPromptPayload,
  ): Promise<CompressPromptReturn> => {
    calls.push({ params, payload });
    if (options.handler !== undefined) {
      return options.handler(params, payload);
    }
    if (options.result !== undefined) {
      return options.result;
    }
    const fallbackPayload: CompressPromptPayload = payload;
    const fallbackSuccess: CompressPromptSuccessReturn = {
      chatApiRequest: fallbackPayload.chatApiRequest,
      resolvedInputTokenCount: 0,
      resourceDocuments: fallbackPayload.resourceDocuments,
    };
    return fallbackSuccess;
  };
  return { compressPrompt, calls };
}

/** Bound `compressPrompt` with `buildCompressPromptDeps(overrides)` — for wiring tests without a second builder surface. */
export function buildBoundCompressPromptFn(
  depsOverrides?: CompressPromptDepsOverrides,
): BoundCompressPromptFn {
  const deps: CompressPromptDeps = buildCompressPromptDeps(depsOverrides);
  return async (
    params: CompressPromptParams,
    payload: CompressPromptPayload,
  ): Promise<CompressPromptReturn> => {
    return compressPrompt(deps, params, payload);
  };
}

export function describeCompressPromptReturnForTestFailure(value: unknown): string {
  if (isCompressPromptErrorReturn(value)) {
    return `CompressPromptErrorReturn: ${value.error.message} (retriable=${value.retriable})`;
  }
  if (value === undefined) {
    return "value is undefined";
  }
  if (value === null) {
    return "value is null";
  }
  if (typeof value !== "object") {
    return `value is ${typeof value}`;
  }
  const keys: string[] = Object.keys(value);
  return `unexpected shape (keys=${keys.join(",")})`;
}
