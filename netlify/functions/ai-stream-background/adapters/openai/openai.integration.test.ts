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
import { createOpenAINodeAdapter } from './openai.ts';

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

async function* integrationSdkStream(): AsyncGenerator<unknown, void, undefined> {
  yield {
    choices: [{ delta: { content: 'integration' }, finish_reason: null }],
  };
  yield {
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };
}

describe('createOpenAINodeAdapter (integration)', () => {
  beforeEach(() => {
    chatCompletionsCreate.mockReset();
  });

  it('constructs an adapter that satisfies isAiAdapter, streams through mocked SDK for openai-gpt-4o, and yields NodeAdapterStreamChunk values', async () => {
    const params: NodeAdapterConstructorParams = {
      modelConfig: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      apiKey: 'sk-integration-openai',
      userConfig: { tier_output_cap_tokens: null },
    };
    const adapter = createOpenAINodeAdapter(params);
    expect(isAiAdapter(adapter)).toBe(true);

    chatCompletionsCreate.mockResolvedValue(integrationSdkStream());

    const request: NodeChatApiRequest = {
      message: 'integration dispatch message',
      providerId: 'prov-integration',
      promptId: 'prompt-integration',
    };
    const apiIdentifier: string = 'openai-gpt-4o';

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
      .filter((c): c is Extract<NodeAdapterStreamChunk, { type: 'text_delta' }> => c.type === 'text_delta')
      .map((c) => c.text);
    expect(textDeltas).toContain('integration');

    const usageChunks = collected.filter((c) => c.type === 'usage');
    expect(usageChunks.length).toBe(1);
    if (usageChunks[0] !== undefined && usageChunks[0].type === 'usage') {
      expect(usageChunks[0].tokenUsage.prompt_tokens).toBe(10);
      expect(usageChunks[0].tokenUsage.completion_tokens).toBe(20);
      expect(usageChunks[0].tokenUsage.total_tokens).toBe(30);
    }

    const doneChunks = collected.filter((c) => c.type === 'done');
    expect(doneChunks.length).toBe(1);
  });

  it('calls chat.completions.create with max_completion_tokens from binding tier cap over request and hard cap', async () => {
    const params: NodeAdapterConstructorParams = {
      modelConfig: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        hard_cap_output_tokens: 131_072,
      },
      apiKey: 'sk-integration-openai-tier-cap',
      userConfig: { tier_output_cap_tokens: 32_768 },
    };
    const adapter = createOpenAINodeAdapter(params);

    chatCompletionsCreate.mockResolvedValue(integrationSdkStream());

    const request: NodeChatApiRequest = {
      message: 'integration tier cap message',
      providerId: 'prov-integration-tier',
      promptId: 'prompt-integration-tier',
      max_tokens_to_generate: 50_000,
    };
    const apiIdentifier: string = 'openai-gpt-4o';

    const stream: AsyncGenerator<NodeAdapterStreamChunk> = adapter.sendMessageStream(
      request,
      apiIdentifier,
    );
    const collected: NodeAdapterStreamChunk[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected.length >= 1).toBe(true);

    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_completion_tokens: 32_768,
      }),
    );
  });
});
