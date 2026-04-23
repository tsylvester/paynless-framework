import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
} from '../ai-adapter.interface.ts';
import {
  isAiAdapter,
  isNodeAdapterStreamChunk,
} from '../getNodeAiAdapter.guard.ts';
import { createAnthropicNodeAdapter } from './anthropic.ts';

const { messagesStream } = vi.hoisted(() => {
  return {
    messagesStream: vi.fn(),
  };
});

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    public status: number | undefined;

    public constructor(message?: string) {
      super(message);
      this.name = 'APIError';
    }
  }

  class Anthropic {
    public static APIError: typeof APIError = APIError;

    public messages: {
      stream: typeof messagesStream;
    };

    public constructor() {
      this.messages = {
        stream: messagesStream,
      };
    }
  }

  return {
    default: Anthropic,
  };
});

function createIntegrationAnthropicStream(): {
  finalMessage: () => Promise<{
    usage: { input_tokens: number; output_tokens: number };
    stop_reason: string;
  }>;
  [Symbol.asyncIterator](): AsyncGenerator<
    {
      type: 'content_block_delta';
      delta: { type: 'text_delta'; text: string };
    },
    void,
    undefined
  >;
} {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'integration' },
      };
    },
    finalMessage: async () => {
      return {
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      };
    },
  };
}

describe('createAnthropicNodeAdapter (integration)', () => {
  beforeEach(() => {
    messagesStream.mockReset();
  });

  it('constructs an adapter that satisfies isAiAdapter, streams through mocked SDK for anthropic-claude-3-5-sonnet, and yields NodeAdapterStreamChunk values', async () => {
    const params: NodeAdapterConstructorParams = {
      modelConfig: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      apiKey: 'sk-integration-anthropic',
    };
    const adapter = createAnthropicNodeAdapter(params);
    expect(isAiAdapter(adapter)).toBe(true);

    messagesStream.mockReturnValue(createIntegrationAnthropicStream());

    const request: NodeChatApiRequest = {
      message: 'integration dispatch message',
      providerId: 'prov-integration',
      promptId: 'prompt-integration',
    };
    const apiIdentifier: string = 'anthropic-claude-3-5-sonnet';

    const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
      request,
      apiIdentifier,
    );

    const collected: NodeAdapterStreamChunk[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }

    expect(collected.length >= 1).toBe(true);
    for (const chunk of collected) {
      expect(isNodeAdapterStreamChunk(chunk)).toBe(true);
    }

    const textDeltas: string[] = collected
      .filter((c): c is Extract<NodeAdapterStreamChunk, { type: 'text_delta' }> => {
        return c.type === 'text_delta';
      })
      .map((c) => {
        return c.text;
      });
    expect(textDeltas).toContain('integration');

    const usageChunks = collected.filter((c) => {
      return c.type === 'usage';
    });
    expect(usageChunks.length).toBe(1);
    if (usageChunks[0] !== undefined && usageChunks[0].type === 'usage') {
      expect(usageChunks[0].tokenUsage.prompt_tokens).toBe(10);
      expect(usageChunks[0].tokenUsage.completion_tokens).toBe(20);
      expect(usageChunks[0].tokenUsage.total_tokens).toBe(30);
    }

    const doneChunks = collected.filter((c) => {
      return c.type === 'done';
    });
    expect(doneChunks.length).toBe(1);
  });
});
