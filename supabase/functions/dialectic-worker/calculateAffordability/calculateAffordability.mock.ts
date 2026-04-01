// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.mock.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ILogger,
  Messages,
  ResourceDocuments,
} from "../../_shared/types.ts";
import type { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import type { RelevanceRule } from "../../dialectic-service/dialectic.interface.ts";
import type { Database } from "../../types_db.ts";
import type { BoundCompressPromptFn } from "../compressPrompt/compressPrompt.interface.ts";
import {
  buildBoundCompressPromptFn,
  buildChatApiRequest,
  buildResourceDocument,
} from "../compressPrompt/compressPrompt.mock.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityCompressedReturn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityDirectReturn,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityFn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityReturn,
} from "./calculateAffordability.interface.ts";

const defaultCompressionStrategy: ICompressionStrategy = async () => {
  return [];
};

export type CalculateAffordabilityDepsOverrides = {
  logger?: ILogger;
  countTokens?: CountTokensFn;
  compressPrompt?: BoundCompressPromptFn;
};

export type CalculateAffordabilityParamsOverrides = {
  jobId?: string;
  projectOwnerUserId?: string;
  sessionId?: string;
  stageSlug?: string;
  walletId?: string;
  walletBalance?: number;
  extendedModelConfig?: AiModelExtendedConfig;
  inputRate?: number;
  outputRate?: number;
  isContinuationFlowInitial?: boolean;
  inputsRelevance?: RelevanceRule[];
};

export type CalculateAffordabilityPayloadOverrides = {
  compressionStrategy?: ICompressionStrategy;
  resourceDocuments?: ResourceDocuments;
  conversationHistory?: Messages[];
  currentUserPrompt?: string;
  systemInstruction?: string;
  chatApiRequest?: ChatApiRequest;
};

export function buildCalculateAffordabilityDeps(
  overrides?: CalculateAffordabilityDepsOverrides,
): CalculateAffordabilityDeps {
  const logger: ILogger = overrides?.logger !== undefined ? overrides.logger : new MockLogger();
  const countTokens: CountTokensFn = overrides?.countTokens !== undefined
    ? overrides.countTokens
    : createMockCountTokens();
  const compressPrompt: BoundCompressPromptFn = overrides?.compressPrompt !== undefined
    ? overrides.compressPrompt
    : buildBoundCompressPromptFn();
  return { logger, countTokens, compressPrompt };
}

export function buildCalculateAffordabilityParams(
  dbClient: SupabaseClient<Database>,
  overrides?: CalculateAffordabilityParamsOverrides,
): CalculateAffordabilityParams {
  const extendedModelConfig: AiModelExtendedConfig = overrides?.extendedModelConfig !== undefined
    ? overrides.extendedModelConfig
    : buildExtendedModelConfig();
  const base: CalculateAffordabilityParams = {
    dbClient,
    jobId: overrides?.jobId !== undefined ? overrides.jobId : "contract-job-id",
    projectOwnerUserId: overrides?.projectOwnerUserId !== undefined
      ? overrides.projectOwnerUserId
      : "-owner-id",
    sessionId: overrides?.sessionId !== undefined ? overrides.sessionId : "contract-session-id",
    stageSlug: overrides?.stageSlug !== undefined ? overrides.stageSlug : "thesis",
    walletId: overrides?.walletId !== undefined ? overrides.walletId : "contract-wallet-id",
    walletBalance: overrides?.walletBalance !== undefined ? overrides.walletBalance : 1_000_000,
    extendedModelConfig,
    inputRate: overrides?.inputRate !== undefined ? overrides.inputRate : 1,
    outputRate: overrides?.outputRate !== undefined ? overrides.outputRate : 1,
    isContinuationFlowInitial: overrides?.isContinuationFlowInitial !== undefined
      ? overrides.isContinuationFlowInitial
      : false,
  };
  if (overrides?.inputsRelevance !== undefined) {
    return { ...base, inputsRelevance: overrides.inputsRelevance };
  }
  return base;
}

export function buildCalculateAffordabilityPayload(
  overrides?: CalculateAffordabilityPayloadOverrides,
): CalculateAffordabilityPayload {
  const resourceDocuments: ResourceDocuments = overrides?.resourceDocuments !== undefined
    ? overrides.resourceDocuments
    : [buildResourceDocument()];
  const currentUserPrompt: string = overrides?.currentUserPrompt !== undefined
    ? overrides.currentUserPrompt
    : "contract user prompt text";
  const systemInstruction: string = overrides?.systemInstruction !== undefined
    ? overrides.systemInstruction
    : "contract system instruction";
  const chatApiRequest: ChatApiRequest = overrides?.chatApiRequest !== undefined
    ? overrides.chatApiRequest
    : buildChatApiRequest(resourceDocuments, currentUserPrompt);
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
    systemInstruction,
    chatApiRequest,
  };
}

export type MockBoundCalculateAffordabilityFnOptions = {
  result?: CalculateAffordabilityReturn;
  resolve?: (
    params: CalculateAffordabilityParams,
    payload: CalculateAffordabilityPayload,
  ) => CalculateAffordabilityReturn | Promise<CalculateAffordabilityReturn>;
};

function isMockBoundCalculateAffordabilityFnOptions(
  value: MockBoundCalculateAffordabilityFnOptions | CalculateAffordabilityReturn,
): value is MockBoundCalculateAffordabilityFnOptions {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if ("resolve" in value || "result" in value) {
    return true;
  }
  return Object.keys(value).length === 0;
}

export function buildMockBoundCalculateAffordabilityFn(
  fixedReturn: CalculateAffordabilityReturn,
): BoundCalculateAffordabilityFn;
export function buildMockBoundCalculateAffordabilityFn(
  options?: MockBoundCalculateAffordabilityFnOptions,
): BoundCalculateAffordabilityFn;
export function buildMockBoundCalculateAffordabilityFn(
  optionsOrFixed?: MockBoundCalculateAffordabilityFnOptions | CalculateAffordabilityReturn,
): BoundCalculateAffordabilityFn {
  if (optionsOrFixed === undefined) {
    return async (
      _params: CalculateAffordabilityParams,
      _payload: CalculateAffordabilityPayload,
    ): Promise<CalculateAffordabilityReturn> => {
      return buildCalculateAffordabilityDirectReturn(0);
    };
  }
  if (isMockBoundCalculateAffordabilityFnOptions(optionsOrFixed)) {
    const options: MockBoundCalculateAffordabilityFnOptions = optionsOrFixed;
    return async (
      params: CalculateAffordabilityParams,
      payload: CalculateAffordabilityPayload,
    ): Promise<CalculateAffordabilityReturn> => {
      if (options.resolve !== undefined) {
        return await options.resolve(params, payload);
      }
      if (options.result !== undefined) {
        return options.result;
      }
      return buildCalculateAffordabilityDirectReturn(0);
    };
  }
  const fixedReturn: CalculateAffordabilityReturn = optionsOrFixed;
  return async (
    _params: CalculateAffordabilityParams,
    _payload: CalculateAffordabilityPayload,
  ): Promise<CalculateAffordabilityReturn> => {
    return fixedReturn;
  };
}

export type MockCalculateAffordabilityFnOptions = {
  result?: CalculateAffordabilityReturn;
  resolve?: (
    deps: CalculateAffordabilityDeps,
    params: CalculateAffordabilityParams,
    payload: CalculateAffordabilityPayload,
  ) => CalculateAffordabilityReturn | Promise<CalculateAffordabilityReturn>;
};

function isMockCalculateAffordabilityFnOptions(
  value: MockCalculateAffordabilityFnOptions | CalculateAffordabilityReturn,
): value is MockCalculateAffordabilityFnOptions {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if ("resolve" in value || "result" in value) {
    return true;
  }
  return Object.keys(value).length === 0;
}

export function buildMockCalculateAffordabilityFn(
  fixedReturn: CalculateAffordabilityReturn,
): CalculateAffordabilityFn;
export function buildMockCalculateAffordabilityFn(
  options?: MockCalculateAffordabilityFnOptions,
): CalculateAffordabilityFn;
export function buildMockCalculateAffordabilityFn(
  optionsOrFixed?: MockCalculateAffordabilityFnOptions | CalculateAffordabilityReturn,
): CalculateAffordabilityFn {
  if (optionsOrFixed === undefined) {
    return async (
      _deps: CalculateAffordabilityDeps,
      _params: CalculateAffordabilityParams,
      _payload: CalculateAffordabilityPayload,
    ): Promise<CalculateAffordabilityReturn> => {
      return buildCalculateAffordabilityDirectReturn(0);
    };
  }
  if (isMockCalculateAffordabilityFnOptions(optionsOrFixed)) {
    const options: MockCalculateAffordabilityFnOptions = optionsOrFixed;
    return async (
      deps: CalculateAffordabilityDeps,
      params: CalculateAffordabilityParams,
      payload: CalculateAffordabilityPayload,
    ): Promise<CalculateAffordabilityReturn> => {
      if (options.resolve !== undefined) {
        return await options.resolve(deps, params, payload);
      }
      if (options.result !== undefined) {
        return options.result;
      }
      return buildCalculateAffordabilityDirectReturn(0);
    };
  }
  const fixedReturn: CalculateAffordabilityReturn = optionsOrFixed;
  return async (
    _deps: CalculateAffordabilityDeps,
    _params: CalculateAffordabilityParams,
    _payload: CalculateAffordabilityPayload,
  ): Promise<CalculateAffordabilityReturn> => {
    return fixedReturn;
  };
}

export function buildCalculateAffordabilityDirectReturn(
  maxOutputTokens: number,
): CalculateAffordabilityDirectReturn {
  const out: CalculateAffordabilityDirectReturn = {
    wasCompressed: false,
    maxOutputTokens,
  };
  return out;
}

export type BuildCalculateAffordabilityCompressedReturnOverrides = {
  resolvedInputTokenCount?: number;
  chatApiRequest?: ChatApiRequest;
  resourceDocuments?: ResourceDocuments;
};

export function buildCalculateAffordabilityCompressedReturn(
  overrides?: BuildCalculateAffordabilityCompressedReturnOverrides,
): CalculateAffordabilityCompressedReturn {
  const resourceDocuments: ResourceDocuments = overrides?.resourceDocuments !== undefined
    ? overrides.resourceDocuments
    : [buildResourceDocument()];
  const chatApiRequest: ChatApiRequest = overrides?.chatApiRequest !== undefined
    ? overrides.chatApiRequest
    : buildChatApiRequest(resourceDocuments, "contract prompt");
  const resolvedInputTokenCount: number = overrides?.resolvedInputTokenCount !== undefined
    ? overrides.resolvedInputTokenCount
    : 100;
  const out: CalculateAffordabilityCompressedReturn = {
    wasCompressed: true,
    chatApiRequest,
    resolvedInputTokenCount,
    resourceDocuments,
  };
  return out;
}

export function buildCalculateAffordabilityErrorReturn(
  error: Error,
  retriable: boolean,
): CalculateAffordabilityErrorReturn {
  return { error, retriable };
}
