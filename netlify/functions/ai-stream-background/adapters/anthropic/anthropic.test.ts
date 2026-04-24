import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AiAdapter,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
} from '../ai-adapter.interface.ts';
import { isAiAdapter } from '../getNodeAiAdapter.guard.ts';
import { createAnthropicNodeAdapter } from './anthropic.ts';
import {
  type AnthropicSdkFinalMessagePayload,
  type AnthropicSdkStreamEvent,
  collectNodeAdapterStreamChunks,
  createAnthropicMessagesStreamResult,
  createMockAnthropicNodeAdapter,
  createMockAnthropicNodeAdapterConstructorParams,
  createMockAnthropicNodeChatApiRequest,
  createMockAnthropicNodeModelConfig,
  createMockAnthropicSdkFinalMessagePayload,
} from './anthropic.mock.ts';

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

describe('createAnthropicNodeAdapter', () => {
  beforeEach(() => {
    messagesStream.mockReset();
  });

  it('yields text_delta chunks for content_block_delta text_delta events', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'hello' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: ' world' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const texts: string[] = [];
    for (const chunk of chunks) {
      if (chunk.type === 'text_delta') {
        texts.push(chunk.text);
      }
    }
    expect(texts).toEqual(['hello', ' world']);
  });

  it('yields usage chunk with NodeTokenUsage mapped from finalMessage usage', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'ok' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload({
        usage: { input_tokens: 5, output_tokens: 6 },
        stop_reason: 'end_turn',
      }),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const usageChunk = chunks.find((c) => c.type === 'usage');
    expect(usageChunk !== undefined).toBe(true);
    if (usageChunk !== undefined && usageChunk.type === 'usage') {
      expect(usageChunk.tokenUsage.prompt_tokens).toBe(5);
      expect(usageChunk.tokenUsage.completion_tokens).toBe(6);
      expect(usageChunk.tokenUsage.total_tokens).toBe(11);
    }
  });

  it('yields done with finish_reason stop when finalMessage stop_reason is end_turn', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload({
        stop_reason: 'end_turn',
      }),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('stop');
    }
  });

  it('yields done with finish_reason stop when finalMessage stop_reason is stop_sequence', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload({
        stop_reason: 'stop_sequence',
      }),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('stop');
    }
  });

  it('yields done with finish_reason max_tokens when finalMessage stop_reason is max_tokens', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload({
        stop_reason: 'max_tokens',
      }),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('max_tokens');
    }
  });

  it('yields done with finish_reason tool_use when finalMessage stop_reason is tool_use', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload({
        stop_reason: 'tool_use',
      }),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('tool_use');
    }
  });

  it('yields done with finish_reason unknown when finalMessage stop_reason is null', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload({
        stop_reason: null,
      }),
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('unknown');
    }
  });

  it('yields done with finish_reason unknown when stop_reason is absent on finalMessage', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: {
        usage: {
          input_tokens: 1,
          output_tokens: 2,
        },
      },
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('unknown');
    }
  });

  it('yields done with finish_reason unknown when stop_reason is unrecognized', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'body' },
        },
      ],
      finalMessage: {
        usage: {
          input_tokens: 1,
          output_tokens: 2,
        },
        stop_reason: 'alien_sdk_value',
      },
    });
    messagesStream.mockReturnValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('unknown');
    }
  });

  it('propagates errors when the SDK stream throws mid-iteration', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const streamResult: {
      finalMessage: () => Promise<AnthropicSdkFinalMessagePayload>;
      [Symbol.asyncIterator](): AsyncGenerator<AnthropicSdkStreamEvent, void, undefined>;
    } = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'a' },
        };
        throw new Error('mock anthropic stream failure');
      },
      finalMessage: async () => {
        return { usage: { input_tokens: 0, output_tokens: 0 } };
      },
    };
    messagesStream.mockReturnValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
      ),
    ).rejects.toThrow('mock anthropic stream failure');
  });

  it('calls messages.stream with model stripped from anthropic- prefix', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams();
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'x' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    expect(messagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-5-sonnet',
      }),
    );
  });

  it('throws when no max tokens can be resolved for the payload', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams({
      modelConfig: createMockAnthropicNodeModelConfig({
        hard_cap_output_tokens: undefined,
      }),
    });
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
      ),
    ).rejects.toThrow('AnthropicAdapter: No max tokens for payload');
  });

  it('maps system prompt, merges user messages, injects resource documents, and appends request.message', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams({
      modelConfig: createMockAnthropicNodeModelConfig({
        hard_cap_output_tokens: 1024,
      }),
    });
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest({
      messages: [
        { role: 'system', content: 'sys-line' },
        { role: 'user', content: 'earlier-user' },
      ],
      resourceDocuments: [
        {
          id: 'doc-1',
          content: 'doc-body',
          document_key: 'business_case',
          stage_slug: 'thesis',
        },
      ],
      message: 'final-user',
    });
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'r' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    expect(messagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'sys-line',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'text',
                  media_type: 'text/plain',
                  data: 'doc-body',
                },
                title: 'business_case',
                context: 'thesis',
              },
              { type: 'text', text: 'earlier-user\n\nfinal-user' },
            ],
          },
        ],
      }),
    );
  });

  it('resolves max_tokens from request.max_tokens_to_generate when provided', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams({
      modelConfig: createMockAnthropicNodeModelConfig({
        hard_cap_output_tokens: 200,
      }),
    });
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest({
      max_tokens_to_generate: 777,
    });
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'z' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    expect(messagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 777,
      }),
    );
  });

  it('resolves max_tokens from modelConfig.hard_cap_output_tokens when request omits max_tokens_to_generate', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams({
      modelConfig: createMockAnthropicNodeModelConfig({
        hard_cap_output_tokens: 512,
      }),
    });
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest();
    const stream = createAnthropicMessagesStreamResult({
      events: [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'z' },
        },
      ],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
    );
    expect(messagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 512,
      }),
    );
  });

  it('throws when resource document has empty document_key', async () => {
    const params = createMockAnthropicNodeAdapterConstructorParams({
      modelConfig: createMockAnthropicNodeModelConfig({
        hard_cap_output_tokens: 100,
      }),
    });
    const adapter = createAnthropicNodeAdapter(params);
    const request = createMockAnthropicNodeChatApiRequest({
      resourceDocuments: [
        {
          id: 'doc-1',
          content: 'c',
          document_key: '',
          stage_slug: 's',
        },
      ],
    });
    const stream = createAnthropicMessagesStreamResult({
      events: [],
      finalMessage: createMockAnthropicSdkFinalMessagePayload(),
    });
    messagesStream.mockReturnValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'anthropic-claude-3-5-sonnet'),
      ),
    ).rejects.toThrow('Invalid resource document');
  });
});

describe('createMockAnthropicNodeAdapter', () => {
  it('returns AiAdapter satisfying isAiAdapter with default stream chunks', async () => {
    const adapter: AiAdapter = createMockAnthropicNodeAdapter();
    expect(isAiAdapter(adapter)).toBe(true);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(
        createMockAnthropicNodeChatApiRequest(),
        'anthropic-claude-3-5-sonnet',
      ),
    );
    expect(chunks).toEqual([
      { type: 'text_delta', text: 'mock anthropic response' },
      {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
      },
      { type: 'done', finish_reason: 'stop' },
    ]);
  });

  it('allows sendMessageStream override that throws', async () => {
    const adapter: AiAdapter = createMockAnthropicNodeAdapter({
      sendMessageStream: async function* (
        _request: NodeChatApiRequest,
        _apiIdentifier: string,
      ): AsyncGenerator<NodeAdapterStreamChunk> {
        const first: NodeAdapterStreamChunk = {
          type: 'text_delta',
          text: '',
        };
        yield first;
        throw new Error('mock anthropic stream error');
      },
    });
    expect(isAiAdapter(adapter)).toBe(true);
    await expect(async () => {
      const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
        createMockAnthropicNodeChatApiRequest(),
        'anthropic-claude-3-5-sonnet',
      );
      await stream.next();
      await stream.next();
    }).rejects.toThrow('mock anthropic stream error');
  });
});
