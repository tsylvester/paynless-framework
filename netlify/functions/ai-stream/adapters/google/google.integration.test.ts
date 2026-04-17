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
import { createGoogleNodeAdapter } from './google.ts';
import type { GoogleFinalResponse, GoogleStreamChunk } from './google.interface.ts';

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

function createIntegrationGoogleStreamResult(): {
  stream: AsyncIterable<GoogleStreamChunk>;
  response: Promise<GoogleFinalResponse>;
} {
  async function* streamGen(): AsyncGenerator<GoogleStreamChunk> {
    const first: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'integration' }] } }],
    };
    yield first;
  }
  const streamIterable: AsyncIterable<GoogleStreamChunk> = streamGen();
  const responseBody: GoogleFinalResponse = {
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  };
  const responsePromise: Promise<GoogleFinalResponse> = Promise.resolve(responseBody);
  return {
    stream: streamIterable,
    response: responsePromise,
  };
}

describe('createGoogleNodeAdapter (integration)', () => {
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

  it('constructs an adapter that satisfies isAiAdapter, streams through mocked SDK for google-gemini-2-5-pro, and yields NodeAdapterStreamChunk values', async () => {
    const params: NodeAdapterConstructorParams = {
      modelConfig: {
        api_identifier: 'google-gemini-2-5-pro',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      apiKey: 'google-integration-key',
    };
    const adapter = createGoogleNodeAdapter(params);
    expect(isAiAdapter(adapter)).toBe(true);

    googleSdk.sendMessageStream.mockResolvedValue(createIntegrationGoogleStreamResult());

    const request: NodeChatApiRequest = {
      message: 'integration dispatch message',
      providerId: 'prov-integration',
      promptId: 'prompt-integration',
    };
    const apiIdentifier: string = 'google-gemini-2-5-pro';

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

    const usageChunks: NodeAdapterStreamChunk[] = collected.filter((c) => {
      return c.type === 'usage';
    });
    expect(usageChunks.length).toBe(1);
    if (usageChunks[0] !== undefined && usageChunks[0].type === 'usage') {
      expect(usageChunks[0].tokenUsage.prompt_tokens).toBe(10);
      expect(usageChunks[0].tokenUsage.completion_tokens).toBe(20);
      expect(usageChunks[0].tokenUsage.total_tokens).toBe(30);
    }

    const doneChunks: NodeAdapterStreamChunk[] = collected.filter((c) => {
      return c.type === 'done';
    });
    expect(doneChunks.length).toBe(1);
  });
});
