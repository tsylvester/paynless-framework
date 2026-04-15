import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
} from '../ai-adapter.interface.ts';
import { isAiAdapter, isAiAdapterResult } from '../getNodeAiAdapter.guard.ts';
import type { GetNodeAiAdapterDeps, GetNodeAiAdapterParams } from '../getNodeAiAdapter.interface.ts';
import { getNodeAiAdapter } from '../getNodeAiAdapter.ts';
import type { OpenAIChatCompletionChunk } from './openai.interface.ts';
import { createOpenAINodeAdapter } from './openai.ts';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class {
    constructor(_opts: { apiKey: string }) {
      void _opts;
    }
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

function integrationAdapterParams(): AiAdapterParams {
  const message: NodeChatMessage = {
    role: 'user',
    content: 'integration',
  };
  const chatApiRequest: NodeChatApiRequest = {
    messages: [message],
    model: 'gpt-4o',
    max_tokens: 50,
  };
  const modelConfig: NodeModelConfig = {
    model_identifier: 'gpt-4o',
    max_tokens: 50,
  };
  const params: AiAdapterParams = {
    chatApiRequest,
    modelConfig,
    apiKey: 'sk-integration',
  };
  return params;
}

async function* integrationMockOpenAIStream(): AsyncIterable<OpenAIChatCompletionChunk> {
  const first: OpenAIChatCompletionChunk = {
    choices: [{ delta: { content: 'a' } }],
    usage: undefined,
  };
  const second: OpenAIChatCompletionChunk = {
    choices: [{ delta: { content: 'b' } }],
    usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
  };
  yield first;
  yield second;
}

describe('openai adapter integration', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('createOpenAINodeAdapter returns an object that satisfies isAiAdapter', () => {
    const adapter: AiAdapter = createOpenAINodeAdapter();
    expect(isAiAdapter(adapter)).toBe(true);
  });

  it('dispatches openai-gpt-4o through getNodeAiAdapter, streams with mock params, returns AiAdapterResult', async () => {
    mockCreate.mockResolvedValue(integrationMockOpenAIStream());
    const deps: GetNodeAiAdapterDeps = {
      providerMap: {
        'openai-': (_apiKey: string): AiAdapter => createOpenAINodeAdapter(),
      },
    };
    const workload: GetNodeAiAdapterParams = {
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-workload',
    };
    const adapter: AiAdapter | null = getNodeAiAdapter(deps, workload);
    expect(adapter).not.toBe(null);
    if (adapter === null) {
      return;
    }
    expect(isAiAdapter(adapter)).toBe(true);
    const result: AiAdapterResult = await adapter.stream(integrationAdapterParams());
    expect(isAiAdapterResult(result)).toBe(true);
    expect(result.assembled_content).toBe('ab');
    expect(result.token_usage).not.toBe(null);
    if (result.token_usage !== null) {
      expect(result.token_usage.prompt_tokens).toBe(2);
      expect(result.token_usage.completion_tokens).toBe(3);
      expect(result.token_usage.total_tokens).toBe(5);
    }
  });
});
