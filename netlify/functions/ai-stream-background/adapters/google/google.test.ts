import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NodeAdapterStreamChunk,
  NodeEmbeddingRequest,
} from '../ai-adapter.interface.ts';
import type { GoogleFinalResponse, GoogleStreamChunk } from './google.interface.ts';
import type { GoogleSdkFinalResponse } from './google.mock.ts';
import { createGoogleNodeAdapter } from './google.ts';
import {
  collectNodeAdapterStreamChunks,
  buildGoogleStreamResult,
  buildGoogleEmbeddingResponse,
  buildGoogleTokenCountResponse,
  buildGoogleNodeAdapterConstructorParams,
  buildGoogleNodeChatApiRequest,
  buildGoogleNodeModelConfig,
  buildGoogleSdkFinalResponse,
} from './google.mock.ts';

const googleSdk = vi.hoisted(() => {
  return {
    getGenerativeModel: vi.fn(),
    startChat: vi.fn(),
    sendMessageStream: vi.fn(),
    embedContent: vi.fn(),
    countTokens: vi.fn(),
  };
});

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    public getGenerativeModel: typeof googleSdk.getGenerativeModel;

    public constructor() {
      this.getGenerativeModel = googleSdk.getGenerativeModel;
    }
  }

  return {
    GoogleGenerativeAI,
  };
});

describe('createGoogleNodeAdapter', () => {
  beforeEach(() => {
    googleSdk.getGenerativeModel.mockReset();
    googleSdk.startChat.mockReset();
    googleSdk.sendMessageStream.mockReset();
    googleSdk.embedContent.mockReset();
    googleSdk.countTokens.mockReset();
    googleSdk.getGenerativeModel.mockReturnValue({
      startChat: googleSdk.startChat,
      embedContent: googleSdk.embedContent,
      countTokens: googleSdk.countTokens,
    });
    googleSdk.startChat.mockReturnValue({
      sendMessageStream: googleSdk.sendMessageStream,
    });
  });

  it('yields text_delta chunks from stream candidates with text parts', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunkA: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'hello' }] } }],
    };
    const chunkB: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: ' world' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunkA, chunkB],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const texts: string[] = [];
    for (const chunk of chunks) {
      if (chunk.type === 'text_delta') {
        texts.push(chunk.text);
      }
    }
    expect(texts).toEqual(['hello', ' world']);
  });

  it('yields usage chunk with NodeTokenUsage mapped from response usageMetadata', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 6,
          totalTokenCount: 11,
        },
      }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const usageChunk = chunks.find((c) => c.type === 'usage');
    expect(usageChunk !== undefined).toBe(true);
    if (usageChunk !== undefined && usageChunk.type === 'usage') {
      expect(usageChunk.tokenUsage.prompt_tokens).toBe(5);
      expect(usageChunk.tokenUsage.completion_tokens).toBe(6);
      expect(usageChunk.tokenUsage.total_tokens).toBe(11);
    }
  });

  it('throws when response omits usageMetadata', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const responseWithoutUsage: GoogleFinalResponse = {
      candidates: [{ finishReason: 'STOP' }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: responseWithoutUsage,
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('Google Gemini response did not include usageMetadata.');
  });

  it('throws when usageMetadata token counts are not all numbers', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: {
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: {
          promptTokenCount: '10',
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      },
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('Google Gemini response usageMetadata is incomplete.');
  });

  it('throws when stream yields no non-empty assistant text', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const streamResult = buildGoogleStreamResult({
      chunks: [],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('Google Gemini stream completed with no assistant text.');
  });

  it('yields done with finish_reason stop when candidate finishReason is STOP', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({ candidates: [{ finishReason: 'STOP' }] }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('stop');
    }
  });

  it('yields done with finish_reason length when candidate finishReason is MAX_TOKENS', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({
        candidates: [{ finishReason: 'MAX_TOKENS' }],
      }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('length');
    }
  });

  it('yields done with finish_reason content_filter when candidate finishReason is SAFETY', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({
        candidates: [{ finishReason: 'SAFETY' }],
      }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('content_filter');
    }
  });

  it('yields done with finish_reason content_filter when candidate finishReason is RECITATION', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({
        candidates: [{ finishReason: 'RECITATION' }],
      }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('content_filter');
    }
  });

  it('yields done with finish_reason unknown when candidate omits finishReason', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({
        candidates: [{ content: { parts: [{ text: 'x' }] } }],
      }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('unknown');
    }
  });

  it('yields done with finish_reason unknown when candidate finishReason is unrecognized', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse({
        candidates: [{ finishReason: 'OTHER_SDK', content: { parts: [{ text: 'x' }] } }],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
      }),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    const chunks: NodeAdapterStreamChunk[] = await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk !== undefined).toBe(true);
    if (doneChunk !== undefined && doneChunk.type === 'done') {
      expect(doneChunk.finish_reason).toBe('unknown');
    }
  });

  it('propagates errors when the SDK stream throws mid-iteration', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    async function* failingStream(): AsyncGenerator<GoogleStreamChunk> {
      yield {
        candidates: [{ content: { parts: [{ text: 'a' }] } }],
      };
      throw new Error('mock google stream failure');
    }
    const streamResult: {
      stream: AsyncIterable<GoogleStreamChunk>;
      response: Promise<GoogleSdkFinalResponse>;
    } = {
      stream: failingStream(),
      response: Promise.resolve(buildGoogleSdkFinalResponse()),
    };
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('mock google stream failure');
  });

  it('calls getGenerativeModel with model name stripped of google- prefix', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'x' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2-5-pro',
      }),
    );
  });

  it('maps assistant to model, skips system, injects resource documents, and ends with user parts', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: 1024,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest({
      messages: [
        { role: 'system', content: 'ignored-system' },
        { role: 'user', content: 'earlier-user' },
        { role: 'assistant', content: 'assistant-line' },
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
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'r' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [
          { role: 'user', parts: [{ text: 'earlier-user' }] },
          { role: 'model', parts: [{ text: 'assistant-line' }] },
        ],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    );
    expect(googleSdk.sendMessageStream).toHaveBeenCalledWith([
      { text: '[Document: business_case from thesis]' },
      { text: 'doc-body' },
      { text: 'final-user' },
    ]);
  });

  it('throws when history does not end with a user message after preparation', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest({
      message: '',
      messages: [{ role: 'assistant', content: 'only-assistant' }],
    });
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'x' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('Cannot send request to Google Gemini: message history format invalid.');
  });

  it('sets maxOutputTokens to min of request max and hard cap when tier_output_cap_tokens is null', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: 200,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest({
      max_tokens_to_generate: 777,
    });
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: { maxOutputTokens: 200 },
      }),
    );
  });

  it('uses modelConfig.hard_cap_output_tokens when max_tokens_to_generate is omitted', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: 200,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: { maxOutputTokens: 200 },
      }),
    );
  });

  it('sets maxOutputTokens to tier cap when tier_output_cap_tokens binds over request and hard cap', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: 32_768 },
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: 131_072,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest({
      max_tokens_to_generate: 50_000,
    });
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: { maxOutputTokens: 32_768 },
      }),
    );
  });

  it('sets maxOutputTokens to request max when tier_output_cap_tokens is null and request binds', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: 131_072,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest({
      max_tokens_to_generate: 50_000,
    });
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: { maxOutputTokens: 50_000 },
      }),
    );
  });

  it('sets maxOutputTokens to hard cap when hard cap binds and request has no max', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: 131_072 },
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: 64_000,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: { maxOutputTokens: 64_000 },
      }),
    );
  });

  it('passes generationConfig undefined when no positive cap inputs are provided', async () => {
    const params = buildGoogleNodeAdapterConstructorParams({
      userConfig: { tier_output_cap_tokens: null },
      modelConfig: buildGoogleNodeModelConfig({
        hard_cap_output_tokens: undefined,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = buildGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = buildGoogleStreamResult({
      chunks: [chunk],
      response: buildGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: undefined,
      }),
    );
  });

  it('invokes Google embedContent API with resolved model and input text', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'embed this text' };
    googleSdk.embedContent.mockResolvedValue(buildGoogleEmbeddingResponse());
    googleSdk.countTokens.mockResolvedValue(buildGoogleTokenCountResponse());

    await adapter.getEmbedding!(request, 'google-gemini-2-5-pro');

    expect(googleSdk.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2-5-pro',
      }),
    );
    expect(googleSdk.embedContent).toHaveBeenCalledWith('embed this text');
  });

  it('invokes Google token-count path required for embedding usage normalization', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'count this input' };
    googleSdk.embedContent.mockResolvedValue(buildGoogleEmbeddingResponse());
    googleSdk.countTokens.mockResolvedValue(buildGoogleTokenCountResponse());

    await adapter.getEmbedding!(request, 'google-gemini-2-5-pro');

    expect(googleSdk.countTokens).toHaveBeenCalledWith('count this input');
  });

  it('returns normalized NodeEmbeddingResponse with first embedding vector and token usage', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'normalize this embedding' };
    googleSdk.embedContent.mockResolvedValue(
      buildGoogleEmbeddingResponse({
        embedding: {
          values: [0.11, 0.22, 0.33],
        },
      }),
    );
    googleSdk.countTokens.mockResolvedValue(
      buildGoogleTokenCountResponse({
        totalTokenCount: 8,
      }),
    );

    const response = await adapter.getEmbedding!(request, 'google-gemini-2-5-pro');

    expect(response).toEqual({
      embedding: [0.11, 0.22, 0.33],
      tokenUsage: {
        prompt_tokens: 8,
        completion_tokens: 0,
        total_tokens: 8,
      },
    });
  });

  it('throws on malformed embedding payload', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'malformed embedding payload' };
    const malformedEmbeddingResponse = {
      ...buildGoogleEmbeddingResponse(),
      embedding: {
        values: [0.101, 'bad'],
      },
    };
    googleSdk.embedContent.mockResolvedValue(malformedEmbeddingResponse);
    googleSdk.countTokens.mockResolvedValue(buildGoogleTokenCountResponse());

    await expect(adapter.getEmbedding!(request, 'google-gemini-2-5-pro')).rejects.toThrow(
      'Google Gemini embedding response was malformed.',
    );
  });

  it('throws on missing or invalid token-count payload', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'invalid token-count payload' };
    googleSdk.embedContent.mockResolvedValue(buildGoogleEmbeddingResponse());
    const malformedTokenCountResponse = {
      ...buildGoogleTokenCountResponse(),
      totalTokenCount: '9',
    };
    googleSdk.countTokens.mockResolvedValue(malformedTokenCountResponse);

    await expect(adapter.getEmbedding!(request, 'google-gemini-2-5-pro')).rejects.toThrow(
      'Google Gemini token-count response was malformed.',
    );
  });

  it('surfaces SDK embedding failures', async () => {
    const params = buildGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request: NodeEmbeddingRequest = { input: 'sdk embedding failure' };
    googleSdk.embedContent.mockRejectedValue(new Error('mock google embedding failure'));

    await expect(adapter.getEmbedding!(request, 'google-gemini-2-5-pro')).rejects.toThrow(
      'mock google embedding failure',
    );
  });
});
