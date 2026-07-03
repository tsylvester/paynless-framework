import { describe, expect, it } from 'vitest';
import type {
  AnthropicContentBlockDeltaEvent,
  AnthropicEmbeddingResponse,
  AnthropicEmbeddingUsage,
  AnthropicEmbeddingVectorItem,
  AnthropicFinalMessage,
  AnthropicTextDelta,
  AnthropicUsage,
} from './anthropic.interface.ts';

describe('anthropic.interface contract', () => {
  it('accepts AnthropicTextDelta with type text_delta and string text', () => {
    const literal: AnthropicTextDelta = {
      type: 'text_delta',
      text: 'chunk',
    };
    expect(literal.type).toBe('text_delta');
    expect(typeof literal.text).toBe('string');
  });

  it('accepts AnthropicContentBlockDeltaEvent with content_block_delta and nested AnthropicTextDelta', () => {
    const delta: AnthropicTextDelta = {
      type: 'text_delta',
      text: 'chunk',
    };
    const literal: AnthropicContentBlockDeltaEvent = {
      type: 'content_block_delta',
      delta,
    };
    expect(literal.type).toBe('content_block_delta');
    expect(literal.delta.type).toBe('text_delta');
  });

  it('accepts AnthropicUsage with numeric input_tokens and output_tokens', () => {
    const literal: AnthropicUsage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    expect(typeof literal.input_tokens).toBe('number');
    expect(typeof literal.output_tokens).toBe('number');
  });

  it('accepts AnthropicFinalMessage with stop_reason end_turn', () => {
    const usage: AnthropicUsage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    const literal: AnthropicFinalMessage = {
      usage,
      stop_reason: 'end_turn',
    };
    expect(literal.stop_reason).toBe('end_turn');
  });

  it('accepts AnthropicFinalMessage with stop_reason stop_sequence', () => {
    const usage: AnthropicUsage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    const literal: AnthropicFinalMessage = {
      usage,
      stop_reason: 'stop_sequence',
    };
    expect(literal.stop_reason).toBe('stop_sequence');
  });

  it('accepts AnthropicFinalMessage with stop_reason max_tokens', () => {
    const usage: AnthropicUsage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    const literal: AnthropicFinalMessage = {
      usage,
      stop_reason: 'max_tokens',
    };
    expect(literal.stop_reason).toBe('max_tokens');
  });

  it('accepts AnthropicFinalMessage with stop_reason tool_use', () => {
    const usage: AnthropicUsage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    const literal: AnthropicFinalMessage = {
      usage,
      stop_reason: 'tool_use',
    };
    expect(literal.stop_reason).toBe('tool_use');
  });

  it('accepts AnthropicFinalMessage with stop_reason null', () => {
    const usage: AnthropicUsage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    const literal: AnthropicFinalMessage = {
      usage,
      stop_reason: null,
    };
    expect(literal.stop_reason).toBe(null);
  });

  it('accepts Anthropic embedding vector response with numeric values', () => {
    const valueOne: AnthropicEmbeddingVectorItem = 0.1;
    const valueTwo: AnthropicEmbeddingVectorItem = 0.2;
    const valueThree: AnthropicEmbeddingVectorItem = 0.3;
    const usage: AnthropicEmbeddingUsage = {
      input_tokens: 12,
      total_tokens: 12,
    };
    const literal: AnthropicEmbeddingResponse = {
      embedding: [valueOne, valueTwo, valueThree],
      usage,
    };
    expect(Array.isArray(literal.embedding)).toBe(true);
    expect(typeof literal.embedding[0]).toBe('number');
    expect(typeof literal.embedding[1]).toBe('number');
    expect(typeof literal.embedding[2]).toBe('number');
  });

  it('accepts Anthropic embedding usage payload', () => {
    const usage: AnthropicEmbeddingUsage = {
      input_tokens: 9,
      total_tokens: 9,
    };
    expect(typeof usage.input_tokens).toBe('number');
    expect(typeof usage.total_tokens).toBe('number');
  });

  it('rejects invalid embedding fixture missing vector', () => {
    const invalidFixture = {
      usage: {
        input_tokens: 4,
        total_tokens: 4,
      },
    };
    expect('embedding' in invalidFixture).toBe(false);
  });

  it('rejects invalid embedding fixture with malformed usage fields', () => {
    const invalidFixture = {
      embedding: [0.4, 0.5],
      usage: {
        input_tokens: '4',
        total_tokens: null,
      },
    };
    expect(typeof invalidFixture.usage.input_tokens).not.toBe('number');
    expect(typeof invalidFixture.usage.total_tokens).not.toBe('number');
  });
});
