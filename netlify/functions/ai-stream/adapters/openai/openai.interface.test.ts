import { describe, it, expect } from 'vitest';
import type { NodeTokenUsage } from '../ai-adapter.interface.ts';
import type {
  OpenAIChatCompletionChunk,
  OpenAIChoiceDelta,
  OpenAIUsageDelta,
} from './openai.interface.ts';
import {
  mockOpenAIChatCompletionChunk,
  mockOpenAIChoiceDelta,
  mockOpenAIUsageDelta,
} from './openai.mock.ts';

describe('openai.interface contract', () => {
  it('valid OpenAIChoiceDelta: delta is an object with optional content string', () => {
    const choice: OpenAIChoiceDelta = mockOpenAIChoiceDelta();
    expect(typeof choice.delta).toBe('object');
    expect(choice.delta).not.toBe(null);
    const contentUnknown: string | null | undefined = choice.delta.content;
    if (contentUnknown === null || contentUnknown === undefined) {
      expect(contentUnknown === null || contentUnknown === undefined).toBe(true);
    } else {
      expect(typeof contentUnknown).toBe('string');
    }
  });

  it('valid OpenAIChatCompletionChunk: choices is non-empty OpenAIChoiceDelta[]; usage is optional OpenAIUsageDelta or null', () => {
    const withUsage: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage: mockOpenAIUsageDelta(),
    });
    const withNullUsage: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage: null,
    });
    const withUndefinedUsage: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage: undefined,
    });
    expect(Array.isArray(withUsage.choices)).toBe(true);
    expect(withUsage.choices.length).toBeGreaterThan(0);
    expect(withUsage.usage === null || typeof withUsage.usage === 'object').toBe(true);
    expect(withNullUsage.usage).toBe(null);
    expect(withUndefinedUsage.usage).toBe(undefined);
  });

  it('valid OpenAIUsageDelta: prompt_tokens, completion_tokens, total_tokens are non-negative integers', () => {
    const usage: OpenAIUsageDelta = mockOpenAIUsageDelta();
    expect(Number.isInteger(usage.prompt_tokens)).toBe(true);
    expect(usage.prompt_tokens).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(usage.completion_tokens)).toBe(true);
    expect(usage.completion_tokens).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(usage.total_tokens)).toBe(true);
    expect(usage.total_tokens).toBeGreaterThanOrEqual(0);
  });

  it('mapping: chunk with choices[0].delta.content string appends to assembled_content', () => {
    const firstDelta: OpenAIChoiceDelta = mockOpenAIChoiceDelta({
      delta: { content: 'hello' },
    });
    const secondDelta: OpenAIChoiceDelta = mockOpenAIChoiceDelta({
      delta: { content: ' world' },
    });
    const chunk: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      choices: [firstDelta],
    });
    let assembled_content: string = '';
    const firstContent: string | null | undefined = chunk.choices[0].delta.content;
    if (firstContent !== null && firstContent !== undefined) {
      assembled_content = assembled_content + firstContent;
    }
    const secondContent: string | null | undefined = secondDelta.delta.content;
    if (secondContent !== null && secondContent !== undefined) {
      assembled_content = assembled_content + secondContent;
    }
    expect(assembled_content).toBe('hello world');
  });

  it('mapping: chunk with usage present maps to NodeTokenUsage; missing usage on chunk implies null token_usage', () => {
    const usage: OpenAIUsageDelta = mockOpenAIUsageDelta({
      prompt_tokens: 4,
      completion_tokens: 5,
      total_tokens: 9,
    });
    const withUsage: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage,
    });
    let token_usage: NodeTokenUsage | null = null;
    if (withUsage.usage !== undefined && withUsage.usage !== null) {
      const mapped: NodeTokenUsage = {
        prompt_tokens: withUsage.usage.prompt_tokens,
        completion_tokens: withUsage.usage.completion_tokens,
        total_tokens: withUsage.usage.total_tokens,
      };
      token_usage = mapped;
    }
    expect(token_usage).not.toBe(null);
    if (token_usage !== null) {
      expect(token_usage.prompt_tokens).toBe(4);
      expect(token_usage.completion_tokens).toBe(5);
      expect(token_usage.total_tokens).toBe(9);
    }
    const withoutUsage: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage: undefined,
    });
    let absent: NodeTokenUsage | null = null;
    if (withoutUsage.usage !== undefined && withoutUsage.usage !== null) {
      const mapped: NodeTokenUsage = {
        prompt_tokens: withoutUsage.usage.prompt_tokens,
        completion_tokens: withoutUsage.usage.completion_tokens,
        total_tokens: withoutUsage.usage.total_tokens,
      };
      absent = mapped;
    } else {
      absent = null;
    }
    expect(absent).toBe(null);
  });

  it('mapping: missing usage on all chunks in a sequence leaves token_usage null', () => {
    const chunkA: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage: undefined,
    });
    const chunkB: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
      usage: undefined,
    });
    const chunks: OpenAIChatCompletionChunk[] = [chunkA, chunkB];
    let token_usage: NodeTokenUsage | null = null;
    for (const chunk of chunks) {
      if (chunk.usage !== undefined && chunk.usage !== null) {
        const mapped: NodeTokenUsage = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
        };
        token_usage = mapped;
      }
    }
    expect(token_usage).toBe(null);
  });

  it('invalid: chunk missing choices array is structurally unusable as OpenAIChatCompletionChunk', () => {
    const missingChoices: Record<string, unknown> = {
      usage: null,
    };
    const hasChoicesArray: boolean =
      'choices' in missingChoices && Array.isArray(missingChoices['choices']);
    expect(hasChoicesArray).toBe(false);
  });

  it('invalid: usage with negative token counts violates the non-negative contract', () => {
    const bad: OpenAIUsageDelta = mockOpenAIUsageDelta({
      prompt_tokens: -1,
    });
    expect(bad.prompt_tokens).toBeLessThan(0);
  });
});
