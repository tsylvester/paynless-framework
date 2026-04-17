import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AiAdapter,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
} from '../ai-adapter.interface.ts';
import { isAiAdapter } from '../getNodeAiAdapter.guard.ts';
import { createOpenAINodeAdapter } from './openai.ts';
import {
  asyncIterableFromSdkChunks,
  collectNodeAdapterStreamChunks,
  createMockNodeAdapterConstructorParams,
  createMockNodeChatApiRequest,
  createMockNodeModelConfig,
  createMockOpenAIUsageDelta,
  createMockOpenAINodeAdapter,
} from './openai.mock.ts';

const { chatCompletionsCreate } = vi.hoisted(() => {
  return {
    chatCompletionsCreate: vi.fn(),
  };
});

vi.mock('openai', () => {
  class APIError extends Error {
    public status: number | undefined;

    public constructor(message?: string) {
      super(message);
      this.name = 'APIError';
    }
  }

  class OpenAI {
    public static APIError: typeof APIError = APIError;

    public chat: {
      completions: {
        create: typeof chatCompletionsCreate;
      };
    };

    public constructor() {
      this.chat = {
        completions: {
          create: chatCompletionsCreate,
        },
      };
    }
  }

  return {
    default: OpenAI,
  };
});

describe('createOpenAINodeAdapter', () => {
  beforeEach(() => {
    chatCompletionsCreate.mockReset();
  });

  it('yields text_delta chunks with correct text for a sequence of stream chunks', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'hello' }, finish_reason: null }],
      },
      {
        choices: [{ delta: { content: ' world' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta({
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        }),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const textDeltas: string[] = [];
    for (const chunk of chunks) {
      if (chunk.type === 'text_delta') {
        textDeltas.push(chunk.text);
      }
    }
    expect(textDeltas).toEqual(['hello', ' world']);
  });

  it('yields usage chunk with correct NodeTokenUsage when final chunk includes usage', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const usage = createMockOpenAIUsageDelta({
      prompt_tokens: 5,
      completion_tokens: 6,
      total_tokens: 11,
    });
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'ok' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage,
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const usageChunk = chunks.find((c) => c.type === 'usage');
    expect(usageChunk !== undefined).toBe(true);
    if (usageChunk !== undefined && usageChunk.type === 'usage') {
      expect(usageChunk.tokenUsage.prompt_tokens).toBe(5);
      expect(usageChunk.tokenUsage.completion_tokens).toBe(6);
      expect(usageChunk.tokenUsage.total_tokens).toBe(11);
    }
  });

  it('throws when stream ends without usage data', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'only' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'openai-gpt-4o'),
      ),
    ).rejects.toThrow('OpenAI response did not include usage data.');
  });

  it('throws when assembled content is only whitespace', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: '   \n\t' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'openai-gpt-4o'),
      ),
    ).rejects.toThrow('OpenAI response content is empty or missing.');
  });

  it('yields done with finish_reason stop when SDK finish_reason is stop', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('stop');
    }
  });

  it('yields done with finish_reason length when SDK finish_reason is length', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'length' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('length');
    }
  });

  it('yields done with finish_reason tool_calls when SDK finish_reason is tool_calls', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('tool_calls');
    }
  });

  it('yields done with finish_reason content_filter when SDK finish_reason is content_filter', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'content_filter' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('content_filter');
    }
  });

  it('yields done with finish_reason function_call when SDK finish_reason is function_call', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'function_call' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('function_call');
    }
  });

  it('yields done with finish_reason equal to provider finish_reason string', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [
          {
            delta: {},
            finish_reason: 'nonstandard_sdk_value',
          },
        ],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('nonstandard_sdk_value');
    }
  });

  it('propagates errors when the SDK stream throws mid-iteration', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    async function* failingStream() {
      yield {
        choices: [{ delta: { content: 'a' }, finish_reason: null }],
      };
      throw new Error('mock openai stream failure');
    }
    chatCompletionsCreate.mockResolvedValue(failingStream());
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'openai-gpt-4o'),
      ),
    ).rejects.toThrow('mock openai stream failure');
  });

  it('calls chat.completions.create with model stripped from openai- prefix', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'x' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
      }),
    );
  });

  it('throws when apiIdentifier model does not match modelConfig api_identifier', async () => {
    const params = createMockNodeAdapterConstructorParams({
      modelConfig: createMockNodeModelConfig({ api_identifier: 'openai-gpt-4-turbo' }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'openai-gpt-4o'),
      ),
    ).rejects.toThrow(/Model mismatch/);
  });

  it('maps messages, injects resource documents, and appends request.message as final user message', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest({
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
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'r' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'sys-line' },
          { role: 'user', content: 'earlier-user' },
          {
            role: 'user',
            content:
              '[Document: business_case from thesis]\ndoc-body',
          },
          { role: 'user', content: 'final-user' },
        ],
      }),
    );
  });

  it('throws when resource document has empty document_key', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest({
      resourceDocuments: [
        {
          id: 'doc-1',
          content: 'c',
          document_key: '',
          stage_slug: 's',
        },
      ],
    });
    const stream = asyncIterableFromSdkChunks([]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'openai-gpt-4o'),
      ),
    ).rejects.toThrow('ResourceDocument has empty document_key');
  });

  it('resolves token cap using Math.min of hard_cap_output_tokens and provider_max_output_tokens', async () => {
    const params = createMockNodeAdapterConstructorParams({
      modelConfig: createMockNodeModelConfig({
        hard_cap_output_tokens: 50,
        provider_max_output_tokens: 200,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_completion_tokens: 50,
      }),
    );
  });

  it('uses max_completion_tokens for gpt-4o when applying max_tokens_to_generate', async () => {
    const params = createMockNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest({
      max_tokens_to_generate: 777,
    });
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_completion_tokens: 777,
      }),
    );
  });

  it('uses max_tokens for legacy gpt-4 model name when applying token cap', async () => {
    const params = createMockNodeAdapterConstructorParams({
      modelConfig: createMockNodeModelConfig({
        api_identifier: 'openai-gpt-4',
        hard_cap_output_tokens: 50,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4'),
    );
    const firstCall = chatCompletionsCreate.mock.calls[0];
    const firstArg = firstCall[0];
    expect(firstArg).toEqual(
      expect.objectContaining({
        max_tokens: 50,
      }),
    );
    expect(Object.prototype.hasOwnProperty.call(firstArg, 'max_completion_tokens')).toBe(
      false,
    );
  });

  it('uses max_tokens for gpt-3.5-turbo model name when applying token cap', async () => {
    const params = createMockNodeAdapterConstructorParams({
      modelConfig: createMockNodeModelConfig({
        api_identifier: 'openai-gpt-3.5-turbo-16k',
        hard_cap_output_tokens: 50,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = createMockNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: createMockOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-3.5-turbo-16k'),
    );
    const firstCall = chatCompletionsCreate.mock.calls[0];
    const firstArg = firstCall[0];
    expect(firstArg).toEqual(
      expect.objectContaining({
        max_tokens: 50,
      }),
    );
  });
});
describe('createMockOpenAINodeAdapter', () => {
  it('returns AiAdapter satisfying isAiAdapter with default stream chunks', async () => {
    const adapter: AiAdapter = createMockOpenAINodeAdapter();
    expect(isAiAdapter(adapter)).toBe(true);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(createMockNodeChatApiRequest(), 'openai-gpt-4o'),
    );
    expect(chunks).toEqual([
      { type: 'text_delta', text: 'mock openai response' },
      {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      },
      { type: 'done', finish_reason: 'stop' },
    ]);
  });

  it('allows sendMessageStream override that throws mock openai stream error', async () => {
    const adapter: AiAdapter = createMockOpenAINodeAdapter({
      sendMessageStream: async function* (
        _request: NodeChatApiRequest,
        _apiIdentifier: string,
      ): AsyncGenerator<NodeAdapterStreamChunk> {
        const first: NodeAdapterStreamChunk = {
          type: 'text_delta',
          text: '',
        };
        yield first;
        throw new Error('mock openai stream error');
      },
    });
    expect(isAiAdapter(adapter)).toBe(true);
    await expect(async () => {
      const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
        createMockNodeChatApiRequest(),
        'openai-gpt-4o',
      );
      await stream.next();
      await stream.next();
    }).rejects.toThrow('mock openai stream error');
  });
});

