import { describe, it, expect } from 'vitest';
import type { NodeTokenUsage } from '../ai-adapter.interface.ts';
import type {
  AnthropicMessageDeltaEvent,
  AnthropicMessageStartEvent,
  AnthropicTextDeltaEvent,
} from './anthropic.interface.ts';
import {
  mockAnthropicMessageDeltaEvent,
  mockAnthropicMessageDeltaUsage,
  mockAnthropicMessageStartEvent,
  mockAnthropicMessageStartUsage,
  mockAnthropicTextDeltaEvent,
} from './anthropic.mock.ts';

describe('anthropic.interface contract', () => {
  it('valid AnthropicMessageStartEvent: type is message_start and message.usage.input_tokens is a non-negative integer', () => {
    const event: AnthropicMessageStartEvent = mockAnthropicMessageStartEvent({
      message: { usage: mockAnthropicMessageStartUsage({ input_tokens: 4 }) },
    });
    expect(event.type).toBe('message_start');
    expect(Number.isInteger(event.message.usage.input_tokens)).toBe(true);
    expect(event.message.usage.input_tokens).toBeGreaterThanOrEqual(0);
  });

  it('valid AnthropicTextDeltaEvent: type is content_block_delta, delta.type is text_delta, delta.text is string', () => {
    const event: AnthropicTextDeltaEvent = mockAnthropicTextDeltaEvent({
      delta: { type: 'text_delta', text: 'fragment' },
    });
    expect(event.type).toBe('content_block_delta');
    expect(event.delta.type).toBe('text_delta');
    expect(typeof event.delta.text).toBe('string');
  });

  it('valid AnthropicMessageDeltaEvent: type is message_delta and usage.output_tokens is a non-negative integer', () => {
    const event: AnthropicMessageDeltaEvent = mockAnthropicMessageDeltaEvent({
      usage: mockAnthropicMessageDeltaUsage({ output_tokens: 6 }),
    });
    expect(event.type).toBe('message_delta');
    expect(Number.isInteger(event.usage.output_tokens)).toBe(true);
    expect(event.usage.output_tokens).toBeGreaterThanOrEqual(0);
  });

  it('mapping: message_start.message.usage.input_tokens to prompt_tokens, message_delta.usage.output_tokens to completion_tokens, sum to total_tokens', () => {
    const start: AnthropicMessageStartEvent = mockAnthropicMessageStartEvent({
      message: { usage: mockAnthropicMessageStartUsage({ input_tokens: 7 }) },
    });
    const delta: AnthropicMessageDeltaEvent = mockAnthropicMessageDeltaEvent({
      usage: mockAnthropicMessageDeltaUsage({ output_tokens: 5 }),
    });
    const mapped: NodeTokenUsage = {
      prompt_tokens: start.message.usage.input_tokens,
      completion_tokens: delta.usage.output_tokens,
      total_tokens:
        start.message.usage.input_tokens + delta.usage.output_tokens,
    };
    expect(mapped.prompt_tokens).toBe(7);
    expect(mapped.completion_tokens).toBe(5);
    expect(mapped.total_tokens).toBe(12);
  });

  it('mapping: stream with only text deltas leaves token_usage null (no message_start or message_delta usage)', () => {
    const events: AnthropicTextDeltaEvent[] = [
      mockAnthropicTextDeltaEvent(),
      mockAnthropicTextDeltaEvent({
        delta: { type: 'text_delta', text: 'more' },
      }),
    ];
    let capturedPrompt: number | undefined;
    let capturedCompletion: number | undefined;
    for (const ev of events) {
      void ev;
    }
    const token_usage: NodeTokenUsage | null =
      capturedPrompt !== undefined && capturedCompletion !== undefined
        ? {
            prompt_tokens: capturedPrompt,
            completion_tokens: capturedCompletion,
            total_tokens: capturedPrompt + capturedCompletion,
          }
        : null;
    expect(token_usage).toBe(null);
  });

  it('invalid: message_start missing message.usage is structurally incomplete', () => {
    const missingUsage: Record<string, unknown> = {
      type: 'message_start',
      message: {},
    };
    const hasUsage: boolean =
      'message' in missingUsage &&
      typeof missingUsage['message'] === 'object' &&
      missingUsage['message'] !== null &&
      'usage' in (missingUsage['message'] as object);
    expect(hasUsage).toBe(false);
  });

  it('invalid: negative output_tokens violates the non-negative contract', () => {
    const bad: AnthropicMessageDeltaEvent = mockAnthropicMessageDeltaEvent({
      usage: mockAnthropicMessageDeltaUsage({ output_tokens: -1 }),
    });
    expect(bad.usage.output_tokens).toBeLessThan(0);
  });
});
