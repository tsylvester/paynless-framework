import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeChatApiRequest,
  NodeModelConfig,
} from './adapters/ai-adapter.interface.ts';
import {
  createValidAiAdapter,
  createValidNodeChatApiRequest,
  createValidNodeModelConfig,
  createValidNodeTokenUsage,
} from './adapters/ai-adapter.mock.ts';
import type {
  AiStreamDeps,
  AiStreamErrorReturn,
  AiStreamEvent,
  AiStreamInvocationPayload,
  AiStreamParams,
  AiStreamPayload,
  AiStreamSuccessReturn,
} from './ai-stream.interface.ts';

export function createValidAiStreamEvent(
  overrides?: Partial<AiStreamEvent>,
): AiStreamEvent {
  const extended_model_config: NodeModelConfig = createValidNodeModelConfig();
  const chat_api_request: NodeChatApiRequest = createValidNodeChatApiRequest();
  const base: AiStreamEvent = {
    job_id: 'contract-job-id',
    api_identifier: 'openai-contract-model',
    extended_model_config,
    chat_api_request,
    user_jwt: 'contract-user-jwt',
  };
  if (overrides === undefined) {
    return base;
  }
  const mergedModel: NodeModelConfig =
    overrides.extended_model_config !== undefined
      ? overrides.extended_model_config
      : base.extended_model_config;
  const mergedChat: NodeChatApiRequest =
    overrides.chat_api_request !== undefined
      ? overrides.chat_api_request
      : base.chat_api_request;
  const merged: AiStreamEvent = {
    ...base,
    ...overrides,
    extended_model_config: mergedModel,
    chat_api_request: mergedChat,
  };
  return merged;
}

export function createValidAiStreamPayload(
  overrides?: Partial<AiStreamPayload>,
): AiStreamPayload {
  const base: AiStreamPayload = {
    job_id: 'contract-job-id',
    assembled_content: 'contract-assembled-content',
    token_usage: createValidNodeTokenUsage(),
  };
  if (overrides === undefined) {
    return base;
  }
  const merged: AiStreamPayload = {
    ...base,
    ...overrides,
  };
  return merged;
}

export function mockAiStreamDeps(overrides?: Partial<AiStreamDeps>): AiStreamDeps {
  const adapter: AiAdapter = createValidAiAdapter();
  const base: AiStreamDeps = {
    openaiAdapter: adapter,
    anthropicAdapter: adapter,
    googleAdapter: adapter,
    Url: 'http://localhost/mock-saveResponse',
    getApiKey(apiIdentifier: string): string {
      void apiIdentifier;
      return 'mock-key';
    },
  };
  if (overrides === undefined) {
    return base;
  }
  return {
    openaiAdapter:
      overrides.openaiAdapter !== undefined
        ? overrides.openaiAdapter
        : base.openaiAdapter,
    anthropicAdapter:
      overrides.anthropicAdapter !== undefined
        ? overrides.anthropicAdapter
        : base.anthropicAdapter,
    googleAdapter:
      overrides.googleAdapter !== undefined
        ? overrides.googleAdapter
        : base.googleAdapter,
    Url: overrides.Url !== undefined ? overrides.Url : base.Url,
    getApiKey:
      overrides.getApiKey !== undefined ? overrides.getApiKey : base.getApiKey,
  };
}

export function mockAiStreamParams(overrides?: Partial<AiStreamParams>): AiStreamParams {
  const event: AiStreamEvent =
    overrides?.event !== undefined
      ? overrides.event
      : createValidAiStreamEvent();
  return { event };
}

export function mockAiStreamInvocationPayload(
  overrides?: Partial<AiStreamInvocationPayload>,
): AiStreamInvocationPayload {
  const base: AiStreamInvocationPayload = {
    workloadVersion: 'v1',
  };
  if (overrides === undefined) {
    return base;
  }
  return {
    workloadVersion:
      overrides.workloadVersion !== undefined
        ? overrides.workloadVersion
        : base.workloadVersion,
  };
}

export function mockAiStreamSuccessReturn(
  overrides?: Partial<AiStreamSuccessReturn>,
): AiStreamSuccessReturn {
  const requestBody: AiStreamPayload =
    overrides?.requestBody !== undefined
      ? overrides.requestBody
      : createValidAiStreamPayload();
  return {
    outcome: 'success',
    requestBody,
  };
}

export function mockAiStreamErrorReturn(
  overrides?: Partial<AiStreamErrorReturn>,
): AiStreamErrorReturn {
  const base: AiStreamErrorReturn = {
    outcome: 'error',
    error: new Error('contract-guard-error'),
    retriable: false,
  };
  if (overrides === undefined) {
    return base;
  }
  return {
    outcome: 'error',
    error: overrides.error !== undefined ? overrides.error : base.error,
    retriable:
      overrides.retriable !== undefined ? overrides.retriable : base.retriable,
  };
}

function createCountingAdapter(
  tallies: { openai: number; anthropic: number; google: number },
  which: 'openai' | 'anthropic' | 'google',
  result: AiAdapterResult,
): AiAdapter {
  return {
    stream: async (params: AiAdapterParams): Promise<AiAdapterResult> => {
      void params;
      if (which === 'openai') {
        tallies.openai = tallies.openai + 1;
      } else if (which === 'anthropic') {
        tallies.anthropic = tallies.anthropic + 1;
      } else {
        tallies.google = tallies.google + 1;
      }
      return result;
    },
  };
}

export function createStreamTallies(): {
  openai: number;
  anthropic: number;
  google: number;
} {
  return { openai: 0, anthropic: 0, google: 0 };
}

export function createNullUsageAdapterResult(
  assembledContent: string,
): AiAdapterResult {
  const result: AiAdapterResult = {
    assembled_content: assembledContent,
    token_usage: null,
  };
  return result;
}

export function createThrowingStreamAdapter(message: string): AiAdapter {
  return {
    stream: async (params: AiAdapterParams): Promise<AiAdapterResult> => {
      void params;
      throw new Error(message);
    },
  };
}

export function mockAiStreamDepsWithPerAdapterResults(
  tallies: { openai: number; anthropic: number; google: number },
  results: {
    openai: AiAdapterResult;
    anthropic: AiAdapterResult;
    google: AiAdapterResult;
  },
  overrides?: Partial<AiStreamDeps>,
): AiStreamDeps {
  const adapterOverrides: Partial<AiStreamDeps> = {
    openaiAdapter: createCountingAdapter(tallies, 'openai', results.openai),
    anthropicAdapter: createCountingAdapter(
      tallies,
      'anthropic',
      results.anthropic,
    ),
    googleAdapter: createCountingAdapter(tallies, 'google', results.google),
  };
  const merged: Partial<AiStreamDeps> = {
    ...adapterOverrides,
    ...overrides,
  };
  return mockAiStreamDeps(merged);
}
