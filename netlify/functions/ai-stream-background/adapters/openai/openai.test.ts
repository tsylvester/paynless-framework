import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AiAdapter,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeEmbeddingRequest,
} from '../ai-adapter.interface.ts';
import { isAiAdapter } from '../getNodeAiAdapter.guard.ts';
import { createOpenAINodeAdapter } from './openai.ts';
import {
  asyncIterableFromSdkChunks,
  asyncIterableFromSdkShapedChunks,
  collectNodeAdapterStreamChunks,
  buildOpenAISdkStreamChunk,
  buildOpenAIEmbeddingDatum,
  buildOpenAIEmbeddingResponse,
  buildOpenAIEmbeddingUsage,
  buildNodeAdapterConstructorParams,
  buildNodeChatApiRequest,
  buildNodeModelConfig,
  buildOpenAIUsageDelta,
  buildOpenAINodeAdapter,
} from './openai.mock.ts';

const { chatCompletionsCreate, embeddingsCreate } = vi.hoisted(() => {
  return {
    chatCompletionsCreate: vi.fn(),
    embeddingsCreate: vi.fn(),
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

    public embeddings: {
      create: typeof embeddingsCreate;
    };

    public constructor() {
      this.chat = {
        completions: {
          create: chatCompletionsCreate,
        },
      };
      this.embeddings = {
        create: embeddingsCreate,
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
    embeddingsCreate.mockReset();
  });

  it('yields text_delta chunks with correct text for a sequence of stream chunks', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'hello' }, finish_reason: null }],
      },
      {
        choices: [{ delta: { content: ' world' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta({
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const usage = buildOpenAIUsageDelta({
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: '   \n\t' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'length' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'content_filter' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'function_call' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkShapedChunks([
      buildOpenAISdkStreamChunk({
        choices: [{ delta: { content: 'body' }, finish_reason: null }],
      }),
      buildOpenAISdkStreamChunk({
        choices: [{ delta: {}, finish_reason: 'nonstandard_sdk_value' }],
        usage: buildOpenAIUsageDelta(),
      }),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'x' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams({
      modelConfig: buildNodeModelConfig({ api_identifier: 'openai-gpt-4-turbo' }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'openai-gpt-4o'),
      ),
    ).rejects.toThrow(/Model mismatch/);
  });

  it('maps messages, injects resource documents, and appends request.message as final user message', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest({
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
        usage: buildOpenAIUsageDelta(),
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
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest({
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

  it('applies binding cap as min of hard_cap and provider_max when tier_output_cap_tokens is null and request has no max', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildNodeModelConfig({
        hard_cap_output_tokens: 50,
        provider_max_output_tokens: 200,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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

  it('uses max_completion_tokens for gpt-4o when max_tokens_to_generate binds and tier_output_cap_tokens is null', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest({
      max_tokens_to_generate: 777,
    });
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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

  it('uses max_tokens for legacy gpt-4 model name when hard cap binds and tier_output_cap_tokens is null', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildNodeModelConfig({
        api_identifier: 'openai-gpt-4',
        hard_cap_output_tokens: 50,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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

  it('uses max_tokens for gpt-3.5-turbo model name when hard cap binds and tier_output_cap_tokens is null', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildNodeModelConfig({
        api_identifier: 'openai-gpt-3.5-turbo-16k',
        hard_cap_output_tokens: 50,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
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

  it('sets max_completion_tokens to tier cap when tier_output_cap_tokens binds over request and hard cap', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: 32_768 },
      modelConfig: buildNodeModelConfig({
        hard_cap_output_tokens: 131_072,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest({
      max_tokens_to_generate: 50_000,
    });
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_completion_tokens: 32_768,
      }),
    );
  });

  it('sets max_completion_tokens to request max when tier_output_cap_tokens is null and request binds', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildNodeModelConfig({
        hard_cap_output_tokens: 131_072,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest({
      max_tokens_to_generate: 50_000,
    });
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_completion_tokens: 50_000,
      }),
    );
  });

  it('sets max_completion_tokens to hard cap when hard cap binds and request has no max', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: 131_072 },
      modelConfig: buildNodeModelConfig({
        hard_cap_output_tokens: 64_000,
      }),
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_completion_tokens: 64_000,
      }),
    );
  });

  it('omits max_completion_tokens and max_tokens when no positive cap inputs are provided', async () => {
    const params = buildNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
    });
    const adapter = createOpenAINodeAdapter(params);
    const request = buildNodeChatApiRequest();
    const stream = asyncIterableFromSdkChunks([
      {
        choices: [{ delta: { content: 'z' }, finish_reason: null }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: buildOpenAIUsageDelta(),
      },
    ]);
    chatCompletionsCreate.mockResolvedValue(stream);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'openai-gpt-4o'),
    );
    const firstCall = chatCompletionsCreate.mock.calls[0];
    const firstArg = firstCall[0];
    expect(Object.prototype.hasOwnProperty.call(firstArg, 'max_completion_tokens')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(firstArg, 'max_tokens')).toBe(false);
  });

  it('calls embeddings.create with resolved model and request input', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'embed this text' };
    embeddingsCreate.mockResolvedValue(
      buildOpenAIEmbeddingResponse({
        data: [buildOpenAIEmbeddingDatum()],
        usage: buildOpenAIEmbeddingUsage(),
      }),
    );

    await adapter.getEmbedding!(request, 'openai-gpt-4o');

    expect(embeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        input: 'embed this text',
      }),
    );
  });

  it('returns first embedding vector and normalized token usage', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'normalize me' };
    embeddingsCreate.mockResolvedValue(
      buildOpenAIEmbeddingResponse({
        data: [
          buildOpenAIEmbeddingDatum({ embedding: [0.11, 0.22, 0.33] }),
          buildOpenAIEmbeddingDatum({ embedding: [9, 9, 9] }),
        ],
        usage: buildOpenAIEmbeddingUsage({ prompt_tokens: 8, total_tokens: 8 }),
      }),
    );

    const response = await adapter.getEmbedding!(request, 'openai-gpt-4o');

    expect(response.embedding).toEqual([0.11, 0.22, 0.33]);
    expect(response.tokenUsage).toEqual({
      prompt_tokens: 8,
      completion_tokens: 0,
      total_tokens: 8,
    });
  });

  it('throws on model mismatch before API call', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'model mismatch' };

    await expect(adapter.getEmbedding!(request, 'openai-other-model')).rejects.toThrow(
      'Model mismatch',
    );
    expect(embeddingsCreate).not.toHaveBeenCalled();
  });

  it('throws on missing usage', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'missing usage' };
    embeddingsCreate.mockResolvedValue({
      data: [buildOpenAIEmbeddingDatum()],
    });

    await expect(adapter.getEmbedding!(request, 'openai-gpt-4o')).rejects.toThrow(
      'OpenAI response did not include usage data.',
    );
  });

  it('throws on empty embedding data', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'empty embedding data' };
    embeddingsCreate.mockResolvedValue(
      buildOpenAIEmbeddingResponse({ data: [] }),
    );

    await expect(adapter.getEmbedding!(request, 'openai-gpt-4o')).rejects.toThrow(
      'OpenAI response did not include embedding data.',
    );
  });

  it('surfaces normalized API errors consistently with existing style', async () => {
    const params = buildNodeAdapterConstructorParams();
    const adapter = createOpenAINodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'api error' };
    const error = new Error('API exploded');
    error.name = 'APIError';
    embeddingsCreate.mockRejectedValue(error);

    await expect(adapter.getEmbedding!(request, 'openai-gpt-4o')).rejects.toThrow(
      'OpenAI API error',
    );
  });
});

describe('buildOpenAINodeAdapter', () => {
  it('returns AiAdapter satisfying isAiAdapter with default stream chunks', async () => {
    const adapter: AiAdapter = buildOpenAINodeAdapter();
    expect(isAiAdapter(adapter)).toBe(true);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(buildNodeChatApiRequest(), 'openai-gpt-4o'),
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
    const adapter: AiAdapter = buildOpenAINodeAdapter({
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
        buildNodeChatApiRequest(),
        'openai-gpt-4o',
      );
      await stream.next();
      await stream.next();
    }).rejects.toThrow('mock openai stream error');
  });
});

