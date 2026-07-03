import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeUserConfig,
} from '../ai-adapter.interface.ts';
import type {
  OpenAIChatCompletionChunk,
  OpenAIChoice,
  OpenAIDelta,
  OpenAIEmbeddingDatum,
  OpenAIEmbeddingResponse,
  OpenAIEmbeddingUsage,
  OpenAIUsageDelta,
} from './openai.interface.ts';

export const mockOpenAIDelta: OpenAIDelta = {
  content: 'interface-contract',
};

export const mockOpenAIChoice: OpenAIChoice = {
  delta: { ...mockOpenAIDelta },
  finish_reason: null,
};

export const mockOpenAIUsageDelta: OpenAIUsageDelta = {
  prompt_tokens: 10,
  completion_tokens: 20,
  total_tokens: 30,
};

export const mockOpenAIEmbeddingDatum: OpenAIEmbeddingDatum = {
  embedding: [0.123, 0.456, 0.789],
};

export const mockOpenAIEmbeddingUsage: OpenAIEmbeddingUsage = {
  prompt_tokens: 10,
  total_tokens: 10,
};

export const mockOpenAIEmbeddingResponse: OpenAIEmbeddingResponse = {
  data: [mockOpenAIEmbeddingDatum],
  usage: mockOpenAIEmbeddingUsage,
};

export const mockOpenAIChatCompletionChunk: OpenAIChatCompletionChunk = {
  choices: [mockOpenAIChoice],
  usage: mockOpenAIUsageDelta,
};

export const mockNodeModelConfig: NodeModelConfig = {
  api_identifier: 'openai-gpt-4o',
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

export const mockNodeUserConfig: NodeUserConfig = {
  tier_output_cap_tokens: null,
};

export const mockNodeAdapterConstructorParams: NodeAdapterConstructorParams = {
  modelConfig: { ...mockNodeModelConfig },
  apiKey: 'sk-openai-mock',
  userConfig: { ...mockNodeUserConfig },
};

export const mockNodeChatApiRequest: NodeChatApiRequest = {
  message: 'unit-message',
  providerId: 'prov-openai',
  promptId: 'prompt-openai',
};

export type OpenAIDeltaOverrides = {
  [K in keyof OpenAIDelta]?: OpenAIDelta[K] | null;
};

export type OpenAIChoiceOverrides = {
  [K in keyof OpenAIChoice]?: OpenAIChoice[K] | null;
};

export type OpenAIUsageDeltaOverrides = {
  [K in keyof OpenAIUsageDelta]?: OpenAIUsageDelta[K] | null;
};

export type OpenAIEmbeddingDatumOverrides = {
  [K in keyof OpenAIEmbeddingDatum]?: OpenAIEmbeddingDatum[K] | null;
};

export type OpenAIEmbeddingUsageOverrides = {
  [K in keyof OpenAIEmbeddingUsage]?: OpenAIEmbeddingUsage[K] | null;
};

export type OpenAIEmbeddingResponseOverrides = {
  [K in keyof OpenAIEmbeddingResponse]?: OpenAIEmbeddingResponse[K] | null;
};

export type OpenAIChatCompletionChunkOverrides = {
  [K in keyof OpenAIChatCompletionChunk]?: OpenAIChatCompletionChunk[K] | null;
};

export type NodeModelConfigOverrides = {
  [K in keyof NodeModelConfig]?: NodeModelConfig[K] | null;
};

export type NodeUserConfigOverrides = {
  [K in keyof NodeUserConfig]?: NodeUserConfig[K] | null;
};

export type NodeAdapterConstructorParamsOverrides = {
  [K in keyof NodeAdapterConstructorParams]?: NodeAdapterConstructorParams[K] | null;
};

export type NodeChatApiRequestOverrides = {
  [K in keyof NodeChatApiRequest]?: NodeChatApiRequest[K] | null;
};

export type OpenAINodeAdapterOverrides = {
  [K in keyof AiAdapter]?: AiAdapter[K] | null;
};

export function buildOpenAIDelta(overrides?: OpenAIDeltaOverrides): OpenAIDelta {
  if (overrides === undefined) {
    return { ...mockOpenAIDelta };
  }
  return {
    content:
      overrides.content !== undefined && overrides.content !== null
        ? overrides.content
        : mockOpenAIDelta.content,
  };
}

export function buildOpenAIChoice(
  overrides?: OpenAIChoiceOverrides,
): OpenAIChoice {
  if (overrides === undefined) {
    return {
      delta: { ...mockOpenAIChoice.delta },
      finish_reason: mockOpenAIChoice.finish_reason,
    };
  }
  const delta: OpenAIDelta =
    overrides.delta !== undefined && overrides.delta !== null
      ? { ...mockOpenAIChoice.delta, ...overrides.delta }
      : { ...mockOpenAIChoice.delta };
  const finish_reason: OpenAIChoice['finish_reason'] =
    overrides.finish_reason !== undefined && overrides.finish_reason !== null
      ? overrides.finish_reason
      : mockOpenAIChoice.finish_reason;
  return {
    delta,
    finish_reason,
  };
}

export function buildOpenAIUsageDelta(
  overrides?: OpenAIUsageDeltaOverrides,
): OpenAIUsageDelta {
  if (overrides === undefined) {
    return { ...mockOpenAIUsageDelta };
  }
  return {
    prompt_tokens:
      overrides.prompt_tokens !== undefined && overrides.prompt_tokens !== null
        ? overrides.prompt_tokens
        : mockOpenAIUsageDelta.prompt_tokens,
    completion_tokens:
      overrides.completion_tokens !== undefined && overrides.completion_tokens !== null
        ? overrides.completion_tokens
        : mockOpenAIUsageDelta.completion_tokens,
    total_tokens:
      overrides.total_tokens !== undefined && overrides.total_tokens !== null
        ? overrides.total_tokens
        : mockOpenAIUsageDelta.total_tokens,
  };
}

export function buildOpenAIEmbeddingDatum(
  overrides?: OpenAIEmbeddingDatumOverrides,
): OpenAIEmbeddingDatum {
  if (overrides === undefined) {
    return { embedding: [...mockOpenAIEmbeddingDatum.embedding] };
  }
  return {
    embedding:
      overrides.embedding !== undefined && overrides.embedding !== null
        ? overrides.embedding
        : [...mockOpenAIEmbeddingDatum.embedding],
  };
}

export function buildOpenAIEmbeddingUsage(
  overrides?: OpenAIEmbeddingUsageOverrides,
): OpenAIEmbeddingUsage {
  if (overrides === undefined) {
    return { ...mockOpenAIEmbeddingUsage };
  }
  return {
    prompt_tokens:
      overrides.prompt_tokens !== undefined && overrides.prompt_tokens !== null
        ? overrides.prompt_tokens
        : mockOpenAIEmbeddingUsage.prompt_tokens,
    total_tokens:
      overrides.total_tokens !== undefined && overrides.total_tokens !== null
        ? overrides.total_tokens
        : mockOpenAIEmbeddingUsage.total_tokens,
  };
}

export function buildOpenAIEmbeddingResponse(
  overrides?: OpenAIEmbeddingResponseOverrides,
): OpenAIEmbeddingResponse {
  if (overrides === undefined) {
    return {
      data: [buildOpenAIEmbeddingDatum()],
      usage: buildOpenAIEmbeddingUsage(),
    };
  }
  const response: OpenAIEmbeddingResponse = {
    data:
      overrides.data !== undefined && overrides.data !== null
        ? overrides.data
        : [buildOpenAIEmbeddingDatum()],
    usage:
      overrides.usage !== undefined && overrides.usage !== null
        ? overrides.usage
        : buildOpenAIEmbeddingUsage(),
  };
  return response;
}

export function buildOpenAIChatCompletionChunk(
  overrides?: OpenAIChatCompletionChunkOverrides,
): OpenAIChatCompletionChunk {
  if (overrides === undefined) {
    return {
      choices: [buildOpenAIChoice()],
      usage: { ...mockOpenAIUsageDelta },
    };
  }
  const choices: OpenAIChoice[] =
    overrides.choices !== undefined && overrides.choices !== null
      ? overrides.choices
      : [buildOpenAIChoice()];
  const chunk: OpenAIChatCompletionChunk = { choices };
  if ('usage' in overrides) {
    if (overrides.usage !== null) {
      chunk.usage = overrides.usage;
    }
  } else {
    chunk.usage = { ...mockOpenAIUsageDelta };
  }
  return chunk;
}

export function buildNodeModelConfig(
  overrides?: NodeModelConfigOverrides,
): NodeModelConfig {
  if (overrides === undefined) {
    return { ...mockNodeModelConfig };
  }
  return {
    api_identifier:
      overrides.api_identifier !== undefined && overrides.api_identifier !== null
        ? overrides.api_identifier
        : mockNodeModelConfig.api_identifier,
    ...('provider_max_input_tokens' in overrides
      ? {
          provider_max_input_tokens:
            overrides.provider_max_input_tokens === null
              ? mockNodeModelConfig.provider_max_input_tokens
              : overrides.provider_max_input_tokens,
        }
      : {
          provider_max_input_tokens: mockNodeModelConfig.provider_max_input_tokens,
        }),
    ...('context_window_tokens' in overrides
      ? {
          context_window_tokens: overrides.context_window_tokens,
        }
      : {
          context_window_tokens: mockNodeModelConfig.context_window_tokens,
        }),
    ...('hard_cap_output_tokens' in overrides
      ? {
          hard_cap_output_tokens:
            overrides.hard_cap_output_tokens === null
              ? mockNodeModelConfig.hard_cap_output_tokens
              : overrides.hard_cap_output_tokens,
        }
      : {
          hard_cap_output_tokens: mockNodeModelConfig.hard_cap_output_tokens,
        }),
    ...('provider_max_output_tokens' in overrides
      ? {
          provider_max_output_tokens:
            overrides.provider_max_output_tokens === null
              ? mockNodeModelConfig.provider_max_output_tokens
              : overrides.provider_max_output_tokens,
        }
      : {
          provider_max_output_tokens: mockNodeModelConfig.provider_max_output_tokens,
        }),
    input_token_cost_rate:
      overrides.input_token_cost_rate !== undefined
        ? overrides.input_token_cost_rate
        : mockNodeModelConfig.input_token_cost_rate,
    output_token_cost_rate:
      overrides.output_token_cost_rate !== undefined
        ? overrides.output_token_cost_rate
        : mockNodeModelConfig.output_token_cost_rate,
  };
}

export function buildNodeUserConfig(
  overrides?: NodeUserConfigOverrides,
): NodeUserConfig {
  if (overrides === undefined) {
    return { ...mockNodeUserConfig };
  }
  const tier_output_cap_tokens: number | null =
    overrides.tier_output_cap_tokens !== undefined && overrides.tier_output_cap_tokens !== null
      ? overrides.tier_output_cap_tokens
      : mockNodeUserConfig.tier_output_cap_tokens;
  return { tier_output_cap_tokens };
}

export function buildNodeAdapterConstructorParams(
  overrides?: NodeAdapterConstructorParamsOverrides,
): NodeAdapterConstructorParams {
  if (overrides === undefined) {
    return {
      modelConfig: buildNodeModelConfig(),
      apiKey: mockNodeAdapterConstructorParams.apiKey,
      userConfig: buildNodeUserConfig(),
    };
  }
  const modelConfig: NodeModelConfig =
    overrides.modelConfig !== undefined && overrides.modelConfig !== null
      ? buildNodeModelConfig(overrides.modelConfig)
      : buildNodeModelConfig();
  const apiKey: string =
    overrides.apiKey !== undefined && overrides.apiKey !== null
      ? overrides.apiKey
      : mockNodeAdapterConstructorParams.apiKey;
  const userConfig: NodeUserConfig =
    overrides.userConfig !== undefined && overrides.userConfig !== null
      ? buildNodeUserConfig(overrides.userConfig)
      : buildNodeUserConfig();
  return {
    modelConfig,
    apiKey,
    userConfig,
  };
}

export function buildNodeChatApiRequest(
  overrides?: NodeChatApiRequestOverrides,
): NodeChatApiRequest {
  if (overrides === undefined) {
    return { ...mockNodeChatApiRequest };
  }
  return {
    message:
      overrides.message !== undefined && overrides.message !== null
        ? overrides.message
        : mockNodeChatApiRequest.message,
    providerId:
      overrides.providerId !== undefined && overrides.providerId !== null
        ? overrides.providerId
        : mockNodeChatApiRequest.providerId,
    promptId:
      overrides.promptId !== undefined && overrides.promptId !== null
        ? overrides.promptId
        : mockNodeChatApiRequest.promptId,
    ...('messages' in overrides
      ? {
          messages:
            overrides.messages === null
              ? mockNodeChatApiRequest.messages
              : overrides.messages,
        }
      : {
          messages: mockNodeChatApiRequest.messages,
        }),
    ...('resourceDocuments' in overrides
      ? {
          resourceDocuments:
            overrides.resourceDocuments === null
              ? mockNodeChatApiRequest.resourceDocuments
              : overrides.resourceDocuments,
        }
      : {
          resourceDocuments: mockNodeChatApiRequest.resourceDocuments,
        }),
    ...('max_tokens_to_generate' in overrides
      ? {
          max_tokens_to_generate:
            overrides.max_tokens_to_generate === null
              ? mockNodeChatApiRequest.max_tokens_to_generate
              : overrides.max_tokens_to_generate,
        }
      : {
          max_tokens_to_generate: mockNodeChatApiRequest.max_tokens_to_generate,
        }),
  };
}

export function buildOpenAINodeAdapter(overrides?: OpenAINodeAdapterOverrides): AiAdapter {
  async function* defaultSendMessageStream(
    _request: NodeChatApiRequest,
    _apiIdentifier: string,
  ): AsyncGenerator<NodeAdapterStreamChunk> {
    const textDelta: NodeAdapterStreamChunk = {
      type: 'text_delta',
      text: 'mock openai response',
    };
    yield textDelta;
    const usage: NodeAdapterStreamChunk = {
      type: 'usage',
      tokenUsage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };
    yield usage;
    const done: NodeAdapterStreamChunk = {
      type: 'done',
      finish_reason: 'stop',
    };
    yield done;
  }

  if (overrides === undefined) {
    return { sendMessageStream: defaultSendMessageStream };
  }
  const sendMessageStream: AiAdapter['sendMessageStream'] =
    overrides.sendMessageStream !== undefined && overrides.sendMessageStream !== null
      ? overrides.sendMessageStream
      : defaultSendMessageStream;
  const adapter: AiAdapter = { sendMessageStream };
  if (overrides.getEmbedding !== undefined && overrides.getEmbedding !== null) {
    adapter.getEmbedding = overrides.getEmbedding;
  }
  return adapter;
}

export async function collectNodeAdapterStreamChunks(
  stream: AsyncGenerator<NodeAdapterStreamChunk>,
): Promise<NodeAdapterStreamChunk[]> {
  const result: NodeAdapterStreamChunk[] = [];
  for await (const chunk of stream) {
    result.push(chunk);
  }
  return result;
}

export async function* asyncIterableFromSdkChunks(
  chunks: OpenAIChatCompletionChunk[],
): AsyncGenerator<OpenAIChatCompletionChunk, void, undefined> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

export function buildOpenAISdkStreamChunk(overrides?: {
  choices?: Array<Record<string, unknown>> | null;
  usage?: OpenAIUsageDelta | Record<string, unknown> | null;
}): Record<string, unknown> {
  const defaultChoice: Record<string, unknown> = {
    delta: { ...mockOpenAIChoice.delta },
    finish_reason: mockOpenAIChoice.finish_reason,
  };
  const chunk: Record<string, unknown> = {
    choices:
      overrides?.choices !== undefined && overrides.choices !== null
        ? overrides.choices
        : [defaultChoice],
  };
  if (overrides !== undefined && 'usage' in overrides) {
    chunk['usage'] = overrides.usage;
  }
  return chunk;
}

export async function* asyncIterableFromSdkShapedChunks(
  chunks: Array<Record<string, unknown>>,
): AsyncGenerator<unknown, void, undefined> {
  for (const chunk of chunks) {
    yield chunk;
  }
}
