import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NodeAdapterFactory,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeEmbeddingRequest,
  NodeEmbeddingResponse,
  NodeProviderMap,
} from '../ai-adapter.interface.ts';
import { getNodeAiAdapter } from '../getNodeAiAdapter.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from '../getNodeAiAdapter.interface.ts';
import {
  isAiAdapter,
  isAiAdapterWithEmbedding,
  isNodeAdapterStreamChunk,
} from '../getNodeAiAdapter.guard.ts';
import { createAnthropicNodeAdapter } from './anthropic.ts';

const { embeddingsCreate, messagesStream } = vi.hoisted(() => {
  return {
    embeddingsCreate: vi.fn(),
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

    public embeddings: {
      create: typeof embeddingsCreate;
    };

    public constructor() {
      this.messages = {
        stream: messagesStream,
      };
      this.embeddings = {
        create: embeddingsCreate,
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
    embeddingsCreate.mockReset();
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
      userConfig: { tier_output_cap_tokens: null },
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

  it('calls messages.stream with max_tokens from binding tier cap over request and hard cap', async () => {
    const params: NodeAdapterConstructorParams = {
      modelConfig: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 131_072,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      apiKey: 'sk-integration-anthropic-tier-cap',
      userConfig: { tier_output_cap_tokens: 32_768 },
    };
    const adapter = createAnthropicNodeAdapter(params);

    messagesStream.mockReturnValue(createIntegrationAnthropicStream());

    const request: NodeChatApiRequest = {
      message: 'integration tier cap message',
      providerId: 'prov-integration-tier',
      promptId: 'prompt-integration-tier',
      max_tokens_to_generate: 50_000,
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

    expect(messagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 32_768,
      }),
    );
  });

  it('resolves provider map -> selector -> adapter and returns normalized embedding response', async () => {
    const anthropicFactory: NodeAdapterFactory = createAnthropicNodeAdapter;
    const providerMap: NodeProviderMap = {
      anthropic: anthropicFactory,
    };
    const deps: GetNodeAiAdapterDeps = { providerMap };
    const params: GetNodeAiAdapterParams = {
      apiIdentifier: 'anthropic-claude-3-5-sonnet',
      apiKey: 'sk-integration-anthropic-embedding',
      modelConfig: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'embedding',
    };

    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter !== null).toBe(true);
    if (adapter === null) {
      throw new Error('Expected adapter from selector for anthropic provider.');
    }

    expect(isAiAdapter(adapter)).toBe(true);
    expect(isAiAdapterWithEmbedding(adapter)).toBe(true);

    embeddingsCreate.mockResolvedValue({
      embedding: [0.12, 0.34, 0.56],
      usage: {
        input_tokens: 8,
        total_tokens: 8,
      },
    });

    expect(adapter.getEmbedding !== undefined).toBe(true);
    if (adapter.getEmbedding === undefined) {
      throw new Error('Expected embedding-capable adapter from selector.');
    }

    const request: NodeEmbeddingRequest = { input: 'integration embedding input' };
    const response: NodeEmbeddingResponse = await adapter.getEmbedding(
      request,
      params.apiIdentifier,
    );

    expect(response).toEqual({
      embedding: [0.12, 0.34, 0.56],
      tokenUsage: {
        prompt_tokens: 8,
        completion_tokens: 0,
        total_tokens: 8,
      },
    });

    expect(embeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-5-sonnet',
        input: 'integration embedding input',
      }),
    );
  });
});
