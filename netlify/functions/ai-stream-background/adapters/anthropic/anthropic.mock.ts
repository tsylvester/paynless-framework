import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeEmbeddingRequest,
  NodeEmbeddingResponse,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeUserConfig,
} from '../ai-adapter.interface.ts';
import type {
  AnthropicEmbeddingResponse,
  AnthropicEmbeddingUsage,
} from './anthropic.interface.ts';

export type AnthropicSdkStreamEvent = {
  type: 'content_block_delta';
  delta: {
    type: 'text_delta';
    text: string;
  };
};

export interface AnthropicSdkFinalMessagePayload {
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string | null;
}

export const mockAnthropicNodeModelConfig: NodeModelConfig = {
  api_identifier: 'anthropic-claude-3-5-sonnet',
  hard_cap_output_tokens: 4096,
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

export const mockAnthropicNodeUserConfig: NodeUserConfig = {
  tier_output_cap_tokens: null,
};

export const mockAnthropicNodeAdapterConstructorParams: NodeAdapterConstructorParams = {
  modelConfig: { ...mockAnthropicNodeModelConfig },
  apiKey: 'sk-anthropic-mock',
  userConfig: { ...mockAnthropicNodeUserConfig },
};

export const mockAnthropicNodeChatApiRequest: NodeChatApiRequest = {
  message: 'unit-message',
  providerId: 'prov-anthropic',
  promptId: 'prompt-anthropic',
};

export const mockAnthropicSdkFinalMessagePayload: AnthropicSdkFinalMessagePayload = {
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  },
  stop_reason: 'end_turn',
};

export const mockAnthropicEmbeddingUsage: AnthropicEmbeddingUsage = {
  input_tokens: 9,
  total_tokens: 9,
};

export const mockAnthropicEmbeddingResponse: AnthropicEmbeddingResponse = {
  embedding: [0.101, 0.202, 0.303],
  usage: { ...mockAnthropicEmbeddingUsage },
};

export function createAnthropicMessagesStreamResult(options: {
  events: AnthropicSdkStreamEvent[];
  finalMessage: AnthropicSdkFinalMessagePayload;
}): {
  finalMessage: () => Promise<AnthropicSdkFinalMessagePayload>;
  [Symbol.asyncIterator](): AsyncGenerator<AnthropicSdkStreamEvent>;
} {
  const events: AnthropicSdkStreamEvent[] = options.events;
  const finalPayload: AnthropicSdkFinalMessagePayload = options.finalMessage;
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: async () => {
      return finalPayload;
    },
  };
}

export function createMockAnthropicSdkFinalMessagePayload(
  overrides?: Partial<AnthropicSdkFinalMessagePayload>,
): AnthropicSdkFinalMessagePayload {
  if (overrides === undefined) {
    return {
      usage: {
        input_tokens: mockAnthropicSdkFinalMessagePayload.usage.input_tokens,
        output_tokens: mockAnthropicSdkFinalMessagePayload.usage.output_tokens,
      },
      stop_reason: mockAnthropicSdkFinalMessagePayload.stop_reason,
    };
  }
  const usageInputTokens: number =
    overrides.usage === undefined
      ? mockAnthropicSdkFinalMessagePayload.usage.input_tokens
      : overrides.usage.input_tokens === undefined
        ? mockAnthropicSdkFinalMessagePayload.usage.input_tokens
        : overrides.usage.input_tokens;
  const usageOutputTokens: number =
    overrides.usage === undefined
      ? mockAnthropicSdkFinalMessagePayload.usage.output_tokens
      : overrides.usage.output_tokens === undefined
        ? mockAnthropicSdkFinalMessagePayload.usage.output_tokens
        : overrides.usage.output_tokens;
  const usage: AnthropicSdkFinalMessagePayload['usage'] = {
    input_tokens: usageInputTokens,
    output_tokens: usageOutputTokens,
  };
  const result: AnthropicSdkFinalMessagePayload = { usage };
  if ('stop_reason' in overrides) {
    result.stop_reason = overrides.stop_reason;
  } else {
    result.stop_reason = mockAnthropicSdkFinalMessagePayload.stop_reason;
  }
  return result;
}

export function createMockAnthropicEmbeddingUsage(
  overrides?: Partial<AnthropicEmbeddingUsage>,
): AnthropicEmbeddingUsage {
  if (overrides === undefined) {
    return { ...mockAnthropicEmbeddingUsage };
  }
  const input_tokens: number =
    overrides.input_tokens === undefined
      ? mockAnthropicEmbeddingUsage.input_tokens
      : overrides.input_tokens;
  const total_tokens: number =
    overrides.total_tokens === undefined
      ? mockAnthropicEmbeddingUsage.total_tokens
      : overrides.total_tokens;
  return {
    input_tokens,
    total_tokens,
  };
}

export function createMockAnthropicEmbeddingResponse(
  overrides?: Partial<AnthropicEmbeddingResponse>,
): AnthropicEmbeddingResponse {
  if (overrides === undefined) {
    return {
      embedding: [...mockAnthropicEmbeddingResponse.embedding],
      usage: createMockAnthropicEmbeddingUsage(),
    };
  }
  const embedding: number[] =
    overrides.embedding === undefined
      ? [...mockAnthropicEmbeddingResponse.embedding]
      : overrides.embedding;
  const usage: AnthropicEmbeddingUsage =
    overrides.usage === undefined
      ? createMockAnthropicEmbeddingUsage()
      : createMockAnthropicEmbeddingUsage(overrides.usage);
  return {
    embedding,
    usage,
  };
}

export function createMockAnthropicNodeModelConfig(
  overrides?: Partial<NodeModelConfig>,
): NodeModelConfig {
  if (overrides === undefined) {
    return { ...mockAnthropicNodeModelConfig };
  }
  return { ...mockAnthropicNodeModelConfig, ...overrides };
}

export function createMockAnthropicNodeUserConfig(
  overrides?: Partial<NodeUserConfig>,
): NodeUserConfig {
  if (overrides === undefined) {
    return { ...mockAnthropicNodeUserConfig };
  }
  const tier_output_cap_tokens: number | null =
    overrides.tier_output_cap_tokens === undefined
      ? mockAnthropicNodeUserConfig.tier_output_cap_tokens
      : overrides.tier_output_cap_tokens;
  return { tier_output_cap_tokens };
}

export function buildMockAnthropicNodeAdapterConstructorParams(
  overrides?: Partial<NodeAdapterConstructorParams>,
): NodeAdapterConstructorParams {
  if (overrides === undefined) {
    return {
      modelConfig: createMockAnthropicNodeModelConfig(),
      apiKey: mockAnthropicNodeAdapterConstructorParams.apiKey,
      userConfig: createMockAnthropicNodeUserConfig(),
    };
  }
  const modelConfig: NodeModelConfig =
    overrides.modelConfig === undefined
      ? createMockAnthropicNodeModelConfig()
      : createMockAnthropicNodeModelConfig(overrides.modelConfig);
  const apiKey: string =
    overrides.apiKey === undefined
      ? mockAnthropicNodeAdapterConstructorParams.apiKey
      : overrides.apiKey;
  const userConfig: NodeUserConfig =
    overrides.userConfig === undefined
      ? createMockAnthropicNodeUserConfig()
      : createMockAnthropicNodeUserConfig(overrides.userConfig);
  return {
    modelConfig,
    apiKey,
    userConfig,
  };
}

export function createMockAnthropicNodeChatApiRequest(
  overrides?: Partial<NodeChatApiRequest>,
): NodeChatApiRequest {
  if (overrides === undefined) {
    return { ...mockAnthropicNodeChatApiRequest };
  }
  return { ...mockAnthropicNodeChatApiRequest, ...overrides };
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

export const mockAnthropicGetEmbedding: AiAdapter['getEmbedding'] = async (
  _request: NodeEmbeddingRequest,
  _apiIdentifier: string,
): Promise<NodeEmbeddingResponse> => {
  return {
    embedding: [...mockAnthropicEmbeddingResponse.embedding],
    tokenUsage: {
      prompt_tokens: mockAnthropicEmbeddingUsage.input_tokens,
      completion_tokens: 0,
      total_tokens: mockAnthropicEmbeddingUsage.total_tokens,
    },
  };
};

export function buildMockAnthropicNodeAdapter(overrides?: Partial<AiAdapter>): AiAdapter {
  async function* defaultSendMessageStream(
    _request: NodeChatApiRequest,
    _apiIdentifier: string,
  ): AsyncGenerator<NodeAdapterStreamChunk> {
    const textDelta: NodeAdapterStreamChunk = {
      type: 'text_delta',
      text: 'mock anthropic response',
    };
    yield textDelta;
    const usage: NodeAdapterStreamChunk = {
      type: 'usage',
      tokenUsage: {
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40,
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
    overrides.sendMessageStream === undefined
      ? defaultSendMessageStream
      : overrides.sendMessageStream;
  const adapter: AiAdapter = { sendMessageStream };
  if (overrides.getEmbedding !== undefined) {
    adapter.getEmbedding = overrides.getEmbedding;
  }
  return adapter;
}
