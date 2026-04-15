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
import type { GoogleStreamChunk } from './google.interface.ts';
import { createGoogleNodeAdapter } from './google.ts';

const { mockGenerateContentStream } = vi.hoisted(() => ({
  mockGenerateContentStream: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor(_opts: { apiKey: string }) {
      void _opts;
    }
    getGenerativeModel(_config: { model: string }) {
      void _config;
      return {
        generateContentStream: mockGenerateContentStream,
      };
    }
  },
}));

function integrationAdapterParams(): AiAdapterParams {
  const message: NodeChatMessage = {
    role: 'user',
    content: 'integration',
  };
  const chatApiRequest: NodeChatApiRequest = {
    messages: [message],
    model: 'gemini-2.5-pro',
    max_tokens: 50,
  };
  const modelConfig: NodeModelConfig = {
    model_identifier: 'google-gemini-2-5-pro',
    max_tokens: 50,
  };
  const params: AiAdapterParams = {
    chatApiRequest,
    modelConfig,
    apiKey: 'sk-integration',
  };
  return params;
}

async function* integrationMockGoogleStream(): AsyncIterable<GoogleStreamChunk> {
  const first: GoogleStreamChunk = {
    text: (): string => 'a',
    usageMetadata: undefined,
  };
  const second: GoogleStreamChunk = {
    text: (): string => 'b',
    usageMetadata: {
      promptTokenCount: 2,
      candidatesTokenCount: 3,
      totalTokenCount: 5,
    },
  };
  yield first;
  yield second;
}

describe('google adapter integration', () => {
  beforeEach(() => {
    mockGenerateContentStream.mockReset();
  });

  it('createGoogleNodeAdapter returns an object that satisfies isAiAdapter', () => {
    const adapter: AiAdapter = createGoogleNodeAdapter();
    expect(isAiAdapter(adapter)).toBe(true);
  });

  it('dispatches google-gemini-2-5-pro through getNodeAiAdapter, streams with mock params, returns AiAdapterResult', async () => {
    mockGenerateContentStream.mockResolvedValue({
      stream: integrationMockGoogleStream(),
    });
    const deps: GetNodeAiAdapterDeps = {
      providerMap: {
        'google-': (_apiKey: string): AiAdapter => createGoogleNodeAdapter(),
      },
    };
    const workload: GetNodeAiAdapterParams = {
      apiIdentifier: 'google-gemini-2-5-pro',
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
