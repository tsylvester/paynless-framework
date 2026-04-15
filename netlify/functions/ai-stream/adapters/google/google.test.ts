import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGoogleNodeAdapter } from './google.ts';
import {
  mockAiAdapterParams,
  mockGoogleAsyncIterableFromChunks,
  mockGoogleAsyncIterableYieldThenThrow,
  mockGoogleStreamChunk,
  mockGoogleStreamChunks,
  mockGoogleUsageMetadata,
} from './google.mock.ts';

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

describe('createGoogleNodeAdapter', () => {
  beforeEach(() => {
    mockGenerateContentStream.mockReset();
  });

  it('assembles streamed text from chunks with usageMetadata on the final chunk', async () => {
    const chunks: ReturnType<typeof mockGoogleStreamChunks> = mockGoogleStreamChunks(
      ['He', 'llo'],
      mockGoogleUsageMetadata(),
    );
    mockGenerateContentStream.mockResolvedValue({
      stream: mockGoogleAsyncIterableFromChunks(chunks),
    });
    const adapter = createGoogleNodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.assembled_content).toBe('Hello');
  });

  it('maps usageMetadata to token_usage with correct counts', async () => {
    const usage: ReturnType<typeof mockGoogleUsageMetadata> = mockGoogleUsageMetadata({
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    });
    const chunks: ReturnType<typeof mockGoogleStreamChunks> = mockGoogleStreamChunks([], usage);
    mockGenerateContentStream.mockResolvedValue({
      stream: mockGoogleAsyncIterableFromChunks(chunks),
    });
    const adapter = createGoogleNodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.token_usage).not.toBe(null);
    if (result.token_usage !== null) {
      expect(result.token_usage.prompt_tokens).toBe(10);
      expect(result.token_usage.completion_tokens).toBe(20);
      expect(result.token_usage.total_tokens).toBe(30);
    }
  });

  it('sets token_usage to null when the stream has no usageMetadata', async () => {
    const chunks: ReturnType<typeof mockGoogleStreamChunks> = mockGoogleStreamChunks(
      ['only', 'text'],
      null,
    );
    mockGenerateContentStream.mockResolvedValue({
      stream: mockGoogleAsyncIterableFromChunks(chunks),
    });
    const adapter = createGoogleNodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.token_usage).toBe(null);
  });

  it('propagates errors thrown while iterating the stream', async () => {
    const first: ReturnType<typeof mockGoogleStreamChunk> = mockGoogleStreamChunk({
      text: (): string => 'x',
      usageMetadata: undefined,
    });
    mockGenerateContentStream.mockResolvedValue({
      stream: mockGoogleAsyncIterableYieldThenThrow(first),
    });
    const adapter = createGoogleNodeAdapter();
    await expect(
      adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' })),
    ).rejects.toThrow('mock stream error');
  });
});
