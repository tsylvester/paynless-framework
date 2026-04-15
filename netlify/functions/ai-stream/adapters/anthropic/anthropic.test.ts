import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnthropicNodeAdapter } from './anthropic.ts';
import {
  mockAiAdapterParams,
  mockAnthropicAsyncIterableFromEvents,
  mockAnthropicAsyncIterableYieldThenThrow,
  mockAnthropicMessageDeltaEvent,
  mockAnthropicMessageDeltaUsage,
  mockAnthropicMessageStartEvent,
  mockAnthropicMessageStartUsage,
  mockAnthropicTextDeltaEvent,
} from './anthropic.mock.ts';

const { mockStream } = vi.hoisted(() => ({
  mockStream: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor(_opts: { apiKey: string }) {
      void _opts;
    }
    messages = {
      stream: mockStream,
    };
  },
}));

describe('createAnthropicNodeAdapter', () => {
  beforeEach(() => {
    mockStream.mockReset();
  });

  it('assembles text deltas and maps message_start input_tokens and message_delta output_tokens to token_usage', async () => {
    const stream = mockAnthropicAsyncIterableFromEvents([
        mockAnthropicMessageStartEvent({
          message: {
            usage: mockAnthropicMessageStartUsage({ input_tokens: 10 }),
          },
        }),
        mockAnthropicTextDeltaEvent({
          delta: { type: 'text_delta', text: 'He' },
        }),
        mockAnthropicTextDeltaEvent({
          delta: { type: 'text_delta', text: 'llo' },
        }),
        mockAnthropicMessageDeltaEvent({
          usage: mockAnthropicMessageDeltaUsage({ output_tokens: 20 }),
        }),
      ]);
    mockStream.mockResolvedValue(stream);
    const adapter = createAnthropicNodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.assembled_content).toBe('Hello');
    expect(result.token_usage).not.toBe(null);
    if (result.token_usage !== null) {
      expect(result.token_usage.prompt_tokens).toBe(10);
      expect(result.token_usage.completion_tokens).toBe(20);
      expect(result.token_usage.total_tokens).toBe(30);
    }
  });

  it('sets token_usage to null when the stream has no usage-bearing events', async () => {
    const stream = mockAnthropicAsyncIterableFromEvents([
        mockAnthropicTextDeltaEvent({
          delta: { type: 'text_delta', text: 'only' },
        }),
        mockAnthropicTextDeltaEvent({
          delta: { type: 'text_delta', text: 'text' },
        }),
      ]);
    mockStream.mockResolvedValue(stream);
    const adapter = createAnthropicNodeAdapter();
    const result = await adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' }));
    expect(result.token_usage).toBe(null);
  });

  it('propagates errors thrown while iterating the stream', async () => {
    const first = mockAnthropicTextDeltaEvent({
      delta: { type: 'text_delta', text: 'x' },
    });
    const stream = mockAnthropicAsyncIterableYieldThenThrow(first);
    mockStream.mockResolvedValue(stream);
    const adapter = createAnthropicNodeAdapter();
    await expect(
      adapter.stream(mockAiAdapterParams({ apiKey: 'test-key' })),
    ).rejects.toThrow('mock stream error');
  });
});
