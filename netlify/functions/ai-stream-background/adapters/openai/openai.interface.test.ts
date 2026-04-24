import { describe, expect, it } from 'vitest';
import type {
  OpenAIDelta,
  OpenAIChatCompletionChunk,
  OpenAIChoice,
  OpenAIFinishReason,
  OpenAIUsageDelta,
} from './openai.interface.ts';

describe('openai.interface contract', () => {
  it('accepts OpenAIDelta with string content', () => {
    const literal: OpenAIDelta = {
      content: 'text',
    };
    expect(typeof literal.content === 'string').toBe(true);
  });

  it('accepts OpenAIDelta with null content', () => {
    const literal: OpenAIDelta = {
      content: null,
    };
    expect(literal.content === null).toBe(true);
  });

  it('accepts OpenAIDelta with content omitted', () => {
    const literal: OpenAIDelta = {};
    expect('content' in literal).toBe(false);
  });

  it('accepts OpenAIChoice with finish_reason stop', () => {
    const literal: OpenAIChoice = {
      delta: { content: 'a' },
      finish_reason: 'stop',
    };
    const tag: OpenAIFinishReason = 'stop';
    expect(literal.finish_reason).toBe(tag);
  });

  it('accepts OpenAIChoice with finish_reason length', () => {
    const literal: OpenAIChoice = {
      delta: { content: 'a' },
      finish_reason: 'length',
    };
    const tag: OpenAIFinishReason = 'length';
    expect(literal.finish_reason).toBe(tag);
  });

  it('accepts OpenAIChoice with finish_reason tool_calls', () => {
    const literal: OpenAIChoice = {
      delta: { content: 'a' },
      finish_reason: 'tool_calls',
    };
    const tag: OpenAIFinishReason = 'tool_calls';
    expect(literal.finish_reason).toBe(tag);
  });

  it('accepts OpenAIChoice with finish_reason content_filter', () => {
    const literal: OpenAIChoice = {
      delta: { content: 'a' },
      finish_reason: 'content_filter',
    };
    const tag: OpenAIFinishReason = 'content_filter';
    expect(literal.finish_reason).toBe(tag);
  });

  it('accepts OpenAIChoice with finish_reason function_call', () => {
    const literal: OpenAIChoice = {
      delta: { content: 'a' },
      finish_reason: 'function_call',
    };
    const tag: OpenAIFinishReason = 'function_call';
    expect(literal.finish_reason).toBe(tag);
  });

  it('accepts OpenAIChoice with finish_reason null', () => {
    const literal: OpenAIChoice = {
      delta: {},
      finish_reason: null,
    };
    expect(literal.finish_reason === null).toBe(true);
  });

  it('accepts OpenAIUsageDelta with integer token fields', () => {
    const literal: OpenAIUsageDelta = {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    };
    expect(typeof literal.prompt_tokens === 'number').toBe(true);
    expect(typeof literal.completion_tokens === 'number').toBe(true);
    expect(typeof literal.total_tokens === 'number').toBe(true);
  });

  it('accepts OpenAIChatCompletionChunk with non-empty choices and usage', () => {
    const choice: OpenAIChoice = {
      delta: { content: 'x' },
      finish_reason: null,
    };
    const usage: OpenAIUsageDelta = {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    };
    const literal: OpenAIChatCompletionChunk = {
      choices: [choice],
      usage,
    };
    expect(Array.isArray(literal.choices) && literal.choices.length > 0).toBe(true);
  });

  it('accepts OpenAIChatCompletionChunk with empty choices', () => {
    const literal: OpenAIChatCompletionChunk = {
      choices: [],
    };
    expect(Array.isArray(literal.choices) && literal.choices.length === 0).toBe(true);
  });

  it('accepts OpenAIChatCompletionChunk with usage null', () => {
    const choice: OpenAIChoice = {
      delta: {},
      finish_reason: null,
    };
    const literal: OpenAIChatCompletionChunk = {
      choices: [choice],
      usage: null,
    };
    expect(literal.usage === null).toBe(true);
  });

  it('accepts OpenAIChatCompletionChunk with usage omitted', () => {
    const choice: OpenAIChoice = {
      delta: { content: 'y' },
      finish_reason: null,
    };
    const literal: OpenAIChatCompletionChunk = {
      choices: [choice],
    };
    expect('usage' in literal).toBe(false);
  });
});
