import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterFactory,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeProviderMap,
} from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';

export const defaultNodeChatApiRequest: NodeChatApiRequest = {
  message: 'hello',
  providerId: 'prov-1',
  promptId: 'prompt-1',
};

export const defaultNodeModelConfig: NodeModelConfig = {
  api_identifier: 'openai-gpt-4o',
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

export const mockAiAdapter: AiAdapter = {
  async *sendMessageStream(
    _request: NodeChatApiRequest,
    _apiIdentifier: string,
  ): AsyncGenerator<NodeAdapterStreamChunk> {
    const textDelta: NodeAdapterStreamChunk = { type: 'text_delta', text: 'x' };
    yield textDelta;
    const usage: NodeAdapterStreamChunk = {
      type: 'usage',
      tokenUsage: {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      },
    };
    yield usage;
    const done: NodeAdapterStreamChunk = {
      type: 'done',
      finish_reason: 'stop',
    };
    yield done;
  },
};

const defaultNodeAdapterFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return mockAiAdapter;
};

const defaultNodeProviderMap: NodeProviderMap = {
  'openai-': defaultNodeAdapterFactory,
  'anthropic-': defaultNodeAdapterFactory,
  'google-': defaultNodeAdapterFactory,
};

export function createMockNodeProviderMap(
  overrides?: Partial<NodeProviderMap>,
): NodeProviderMap {
  const result: Record<string, NodeAdapterFactory> = { ...defaultNodeProviderMap };
  if (overrides === undefined) {
    return result;
  }
  for (const entry of Object.entries(overrides)) {
    const key: string = entry[0];
    const value: NodeAdapterFactory | undefined = entry[1];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function createMockGetNodeAiAdapterDeps(
  overrides?: Partial<GetNodeAiAdapterDeps>,
): GetNodeAiAdapterDeps {
  const providerMap: NodeProviderMap =
    overrides?.providerMap === undefined
      ? { ...defaultNodeProviderMap }
      : overrides.providerMap;
  return {
    providerMap,
  };
}

export function createMockGetNodeAiAdapterParams(
  overrides?: Partial<GetNodeAiAdapterParams>,
): GetNodeAiAdapterParams {
  const apiIdentifier: string =
    overrides?.apiIdentifier === undefined
      ? 'openai-gpt-4o'
      : overrides.apiIdentifier;
  const apiKey: string =
    overrides?.apiKey === undefined ? 'sk-test' : overrides.apiKey;
  const modelConfig: NodeModelConfig =
    overrides?.modelConfig === undefined
      ? { ...defaultNodeModelConfig }
      : overrides.modelConfig;
  return {
    apiIdentifier,
    apiKey,
    modelConfig,
  };
}
