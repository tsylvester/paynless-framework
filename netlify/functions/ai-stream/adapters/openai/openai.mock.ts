import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
} from '../ai-adapter.interface.ts';
import type {
  OpenAIChatCompletionChunk,
  OpenAIChoice,
  OpenAIDelta,
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

export const mockOpenAIChatCompletionChunk: OpenAIChatCompletionChunk = {
  choices: [mockOpenAIChoice],
  usage: mockOpenAIUsageDelta,
};

export const mockNodeModelConfig: NodeModelConfig = {
  api_identifier: 'openai-gpt-4o',
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

export const mockNodeAdapterConstructorParams: NodeAdapterConstructorParams = {
  modelConfig: { ...mockNodeModelConfig },
  apiKey: 'sk-openai-mock',
};

export const mockNodeChatApiRequest: NodeChatApiRequest = {
  message: 'unit-message',
  providerId: 'prov-openai',
  promptId: 'prompt-openai',
};

export interface OpenAiSdkStreamChunk {
  choices: Array<{
    delta: {
      content?: string | null;
    };
    finish_reason: string | null;
  }>;
  usage?: OpenAIUsageDelta | null;
}

export function createMockOpenAIDelta(overrides?: Partial<OpenAIDelta>): OpenAIDelta {
  if (overrides === undefined) {
    return { ...mockOpenAIDelta };
  }
  return {
    ...mockOpenAIDelta,
    ...overrides,
  };
}

export function createMockOpenAIChoice(
  overrides?: Partial<OpenAIChoice>,
): OpenAIChoice {
  if (overrides === undefined) {
    return {
      delta: { ...mockOpenAIChoice.delta },
      finish_reason: mockOpenAIChoice.finish_reason,
    };
  }
  const delta: OpenAIDelta =
    overrides.delta === undefined
      ? { ...mockOpenAIChoice.delta }
      : { ...mockOpenAIChoice.delta, ...overrides.delta };
  const finish_reason: OpenAIChoice['finish_reason'] =
    overrides.finish_reason === undefined
      ? mockOpenAIChoice.finish_reason
      : overrides.finish_reason;
  return {
    delta,
    finish_reason,
  };
}

export function createMockOpenAIUsageDelta(
  overrides?: Partial<OpenAIUsageDelta>,
): OpenAIUsageDelta {
  if (overrides === undefined) {
    return { ...mockOpenAIUsageDelta };
  }
  return {
    prompt_tokens:
      overrides.prompt_tokens === undefined
        ? mockOpenAIUsageDelta.prompt_tokens
        : overrides.prompt_tokens,
    completion_tokens:
      overrides.completion_tokens === undefined
        ? mockOpenAIUsageDelta.completion_tokens
        : overrides.completion_tokens,
    total_tokens:
      overrides.total_tokens === undefined
        ? mockOpenAIUsageDelta.total_tokens
        : overrides.total_tokens,
  };
}

export function createMockOpenAIChatCompletionChunk(
  overrides?: Partial<OpenAIChatCompletionChunk>,
): OpenAIChatCompletionChunk {
  if (overrides === undefined) {
    return {
      choices: [createMockOpenAIChoice()],
      usage: { ...mockOpenAIUsageDelta },
    };
  }
  const choices: OpenAIChoice[] =
    overrides.choices === undefined ? [createMockOpenAIChoice()] : overrides.choices;
  const chunk: OpenAIChatCompletionChunk = { choices };
  if ('usage' in overrides) {
    chunk.usage = overrides.usage;
  } else {
    chunk.usage = { ...mockOpenAIUsageDelta };
  }
  return chunk;
}

export function createMockNodeModelConfig(
  overrides?: Partial<NodeModelConfig>,
): NodeModelConfig {
  if (overrides === undefined) {
    return { ...mockNodeModelConfig };
  }
  return { ...mockNodeModelConfig, ...overrides };
}

export function createMockNodeAdapterConstructorParams(
  overrides?: Partial<NodeAdapterConstructorParams>,
): NodeAdapterConstructorParams {
  if (overrides === undefined) {
    return {
      modelConfig: { ...mockNodeAdapterConstructorParams.modelConfig },
      apiKey: mockNodeAdapterConstructorParams.apiKey,
    };
  }
  const modelConfig: NodeModelConfig =
    overrides.modelConfig === undefined
      ? { ...mockNodeModelConfig }
      : { ...mockNodeModelConfig, ...overrides.modelConfig };
  const apiKey: string =
    overrides.apiKey === undefined ? mockNodeAdapterConstructorParams.apiKey : overrides.apiKey;
  return {
    modelConfig,
    apiKey,
  };
}

export function createMockNodeChatApiRequest(
  overrides?: Partial<NodeChatApiRequest>,
): NodeChatApiRequest {
  if (overrides === undefined) {
    return { ...mockNodeChatApiRequest };
  }
  return { ...mockNodeChatApiRequest, ...overrides };
}

export function createMockOpenAINodeAdapter(overrides?: Partial<AiAdapter>): AiAdapter {
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
    overrides.sendMessageStream === undefined
      ? defaultSendMessageStream
      : overrides.sendMessageStream;
  return { sendMessageStream };
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
  chunks: OpenAiSdkStreamChunk[],
): AsyncGenerator<OpenAiSdkStreamChunk, void, undefined> {
  for (const chunk of chunks) {
    yield chunk;
  }
}
