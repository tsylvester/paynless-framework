import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOpenAINodeAdapter } from './openai.ts';
import {
  mockAiAdapterParams,
  mockOpenAIAsyncIterableFromChunks,
  mockOpenAIAsyncIterableYieldThenThrow,
  mockOpenAIChatCompletionChunk,
  mockOpenAIChoiceDelta,
  mockOpenAIStreamChunks,
  mockOpenAIUsageDelta,
} from './openai.mock.ts';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class {
    constructor(_opts: { apiKey: string }) {
      void _opts;
    }
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

describe('createOpenAINodeAdapter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('assembles streamed text delta chunks then usage chunk into assembled_content', async () => {
    const chunks: ReturnType<typeof mockOpenAIStreamChunks> = mockOpenAIStreamChunks(
      ['He', 'llo'],
      mockOpenAIUsageDelta(),
    );
    mockCreate.mockResolvedValue(mockOpenAIAsyncIterableFromChunks(chunks));
    const adapter = createOpenAINodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.assembled_content).toBe('Hello');
  });

  it('maps final usage chunk to token_usage with correct counts', async () => {
    const usage: ReturnType<typeof mockOpenAIUsageDelta> = mockOpenAIUsageDelta({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    });
    const chunks: ReturnType<typeof mockOpenAIStreamChunks> = mockOpenAIStreamChunks(
      [],
      usage,
    );
    mockCreate.mockResolvedValue(mockOpenAIAsyncIterableFromChunks(chunks));
    const adapter = createOpenAINodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.token_usage).not.toBe(null);
    if (result.token_usage !== null) {
      expect(result.token_usage.prompt_tokens).toBe(10);
      expect(result.token_usage.completion_tokens).toBe(20);
      expect(result.token_usage.total_tokens).toBe(30);
    }
  });

  it('sets token_usage to null when the stream has no usage data', async () => {
    const chunks: ReturnType<typeof mockOpenAIStreamChunks> = mockOpenAIStreamChunks(
      ['only', 'text'],
      null,
    );
    mockCreate.mockResolvedValue(mockOpenAIAsyncIterableFromChunks(chunks));
    const adapter = createOpenAINodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.token_usage).toBe(null);
  });

  it('propagates errors thrown while iterating the stream', async () => {
    const first: ReturnType<typeof mockOpenAIChatCompletionChunk> = mockOpenAIChatCompletionChunk({
      choices: [
        mockOpenAIChoiceDelta({
          delta: { content: 'x' },
        }),
      ],
      usage: undefined,
    });
    mockCreate.mockResolvedValue(mockOpenAIAsyncIterableYieldThenThrow(first));
    const adapter = createOpenAINodeAdapter();
    await expect(
      adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' })),
    ).rejects.toThrow('mock stream error');
  });
});
