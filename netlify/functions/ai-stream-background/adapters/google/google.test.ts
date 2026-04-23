import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeAdapterStreamChunk } from '../ai-adapter.interface.ts';
import type { GoogleFinalResponse, GoogleStreamChunk } from './google.interface.ts';
import { createGoogleNodeAdapter } from './google.ts';
import {
  collectNodeAdapterStreamChunks,
  createGoogleStreamResult,
  createGoogleStreamResultWithSdkShapedResponse,
  createMockGoogleNodeAdapterConstructorParams,
  createMockGoogleNodeChatApiRequest,
  createMockGoogleNodeModelConfig,
  createMockGoogleSdkFinalResponse,
} from './google.mock.ts';

const googleSdk = vi.hoisted(() => {
  return {
    getGenerativeModel: vi.fn(),
    startChat: vi.fn(),
    sendMessageStream: vi.fn(),
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
    googleSdk.getGenerativeModel.mockReturnValue({
      startChat: googleSdk.startChat,
    });
    googleSdk.startChat.mockReturnValue({
      sendMessageStream: googleSdk.sendMessageStream,
    });
  });

  it('yields text_delta chunks from stream candidates with text parts', async () => {
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunkA: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'hello' }] } }],
    };
    const chunkB: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: ' world' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunkA, chunkB],
      response: createMockGoogleSdkFinalResponse(),
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse({
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const responseWithoutUsage: GoogleFinalResponse = {
      candidates: [{ finishReason: 'STOP' }],
    };
    const streamResult = createGoogleStreamResult({
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResultWithSdkShapedResponse({
      chunks: [chunk],
      responseBody: {
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const streamResult = createGoogleStreamResult({
      chunks: [],
      response: createMockGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('Google Gemini stream completed with no assistant text.');
  });

  it('yields done with finish_reason stop when candidate finishReason is STOP', async () => {
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse({ candidates: [{ finishReason: 'STOP' }] }),
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse({
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse({
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse({
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse({
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'body' }] } }],
    };
    const streamResult = createGoogleStreamResultWithSdkShapedResponse({
      chunks: [chunk],
      responseBody: {
        candidates: [{ finishReason: 'OTHER_SDK', content: { parts: [{ text: 'x' }] } }],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
      },
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    async function* failingStream(): AsyncGenerator<GoogleStreamChunk> {
      yield {
        candidates: [{ content: { parts: [{ text: 'a' }] } }],
      };
      throw new Error('mock google stream failure');
    }
    const streamResult: {
      stream: AsyncIterable<GoogleStreamChunk>;
      response: Promise<GoogleFinalResponse>;
    } = {
      stream: failingStream(),
      response: Promise.resolve(createMockGoogleSdkFinalResponse()),
    };
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('mock google stream failure');
  });

  it('calls getGenerativeModel with model name stripped of google- prefix', async () => {
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'x' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse(),
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
    const params = createMockGoogleNodeAdapterConstructorParams({
      modelConfig: createMockGoogleNodeModelConfig({
        hard_cap_output_tokens: 1024,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest({
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
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse(),
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
    const params = createMockGoogleNodeAdapterConstructorParams();
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest({
      message: '',
      messages: [{ role: 'assistant', content: 'only-assistant' }],
    });
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'x' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await expect(
      collectNodeAdapterStreamChunks(
        adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
      ),
    ).rejects.toThrow('Cannot send request to Google Gemini: message history format invalid.');
  });

  it('uses request.max_tokens_to_generate over modelConfig.hard_cap_output_tokens for maxOutputTokens', async () => {
    const params = createMockGoogleNodeAdapterConstructorParams({
      modelConfig: createMockGoogleNodeModelConfig({
        hard_cap_output_tokens: 200,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest({
      max_tokens_to_generate: 777,
    });
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse(),
    });
    googleSdk.sendMessageStream.mockResolvedValue(streamResult);
    await collectNodeAdapterStreamChunks(
      adapter.sendMessageStream(request, 'google-gemini-2-5-pro'),
    );
    expect(googleSdk.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: { maxOutputTokens: 777 },
      }),
    );
  });

  it('uses modelConfig.hard_cap_output_tokens when max_tokens_to_generate is omitted', async () => {
    const params = createMockGoogleNodeAdapterConstructorParams({
      modelConfig: createMockGoogleNodeModelConfig({
        hard_cap_output_tokens: 200,
      }),
    });
    const adapter = createGoogleNodeAdapter(params);
    const request = createMockGoogleNodeChatApiRequest();
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'z' }] } }],
    };
    const streamResult = createGoogleStreamResult({
      chunks: [chunk],
      response: createMockGoogleSdkFinalResponse(),
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
});
