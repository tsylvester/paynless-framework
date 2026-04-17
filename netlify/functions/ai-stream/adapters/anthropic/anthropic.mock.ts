import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
} from '../ai-adapter.interface.ts';

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

export const mockAnthropicNodeAdapterConstructorParams: NodeAdapterConstructorParams = {
  modelConfig: { ...mockAnthropicNodeModelConfig },
  apiKey: 'sk-anthropic-mock',
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

export function createMockAnthropicNodeModelConfig(
  overrides?: Partial<NodeModelConfig>,
): NodeModelConfig {
  if (overrides === undefined) {
    return { ...mockAnthropicNodeModelConfig };
  }
  return { ...mockAnthropicNodeModelConfig, ...overrides };
}

export function createMockAnthropicNodeAdapterConstructorParams(
  overrides?: Partial<NodeAdapterConstructorParams>,
): NodeAdapterConstructorParams {
  if (overrides === undefined) {
    return {
      modelConfig: { ...mockAnthropicNodeAdapterConstructorParams.modelConfig },
      apiKey: mockAnthropicNodeAdapterConstructorParams.apiKey,
    };
  }
  const modelConfig: NodeModelConfig =
    overrides.modelConfig === undefined
      ? { ...mockAnthropicNodeModelConfig }
      : { ...mockAnthropicNodeModelConfig, ...overrides.modelConfig };
  const apiKey: string =
    overrides.apiKey === undefined
      ? mockAnthropicNodeAdapterConstructorParams.apiKey
      : overrides.apiKey;
  return {
    modelConfig,
    apiKey,
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

export function createMockAnthropicNodeAdapter(overrides?: Partial<AiAdapter>): AiAdapter {
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
  return { sendMessageStream };
}
