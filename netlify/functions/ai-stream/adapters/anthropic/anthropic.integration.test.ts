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
import type {
  AnthropicMessageDeltaEvent,
  AnthropicMessageStartEvent,
  AnthropicTextDeltaEvent,
} from './anthropic.interface.ts';
import { createAnthropicNodeAdapter } from './anthropic.ts';

const { mockStream } = vi.hoisted(() => ({
  mockStream: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor(_opts: { apiKey: string }) {
      void _opts;
    }
    messages = {
      stream: mockStream,
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
    model: 'claude-3-5-sonnet',
    max_tokens: 50,
  };
  const modelConfig: NodeModelConfig = {
    model_identifier: 'claude-3-5-sonnet',
    max_tokens: 50,
  };
  const params: AiAdapterParams = {
    chatApiRequest,
    modelConfig,
    apiKey: 'sk-integration',
  };
  return params;
}

async function* integrationMockAnthropicStream(): AsyncIterable<
  AnthropicMessageStartEvent | AnthropicTextDeltaEvent | AnthropicMessageDeltaEvent
> {
  const start: AnthropicMessageStartEvent = {
    type: 'message_start',
    message: {
      usage: {
        input_tokens: 2,
      },
    },
  };
  const deltaA: AnthropicTextDeltaEvent = {
    type: 'content_block_delta',
    delta: {
      type: 'text_delta',
      text: 'a',
    },
  };
  const deltaB: AnthropicTextDeltaEvent = {
    type: 'content_block_delta',
    delta: {
      type: 'text_delta',
      text: 'b',
    },
  };
  const end: AnthropicMessageDeltaEvent = {
    type: 'message_delta',
    usage: {
      output_tokens: 3,
    },
  };
  yield start;
  yield deltaA;
  yield deltaB;
  yield end;
}

describe('anthropic adapter integration', () => {
  beforeEach(() => {
    mockStream.mockReset();
  });

  it('createAnthropicNodeAdapter returns an object that satisfies isAiAdapter', () => {
    const adapter: AiAdapter = createAnthropicNodeAdapter();
    expect(isAiAdapter(adapter)).toBe(true);
  });

  it('dispatches anthropic-claude-3-5-sonnet through getNodeAiAdapter, streams with mock params, returns AiAdapterResult', async () => {
    mockStream.mockResolvedValue(integrationMockAnthropicStream());
    const deps: GetNodeAiAdapterDeps = {
      providerMap: {
        'anthropic-': (_apiKey: string): AiAdapter => createAnthropicNodeAdapter(),
      },
    };
    const workload: GetNodeAiAdapterParams = {
      apiIdentifier: 'anthropic-claude-3-5-sonnet',
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
