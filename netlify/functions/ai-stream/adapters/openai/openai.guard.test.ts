import { describe, it, expect } from 'vitest';
import {
  isOpenAIChatCompletionChunk,
  isOpenAIChoiceDelta,
  isOpenAIUsageDelta,
} from './openai.guard.ts';
import {
  mockOpenAIChatCompletionChunk,
  mockOpenAIChoiceDelta,
  mockOpenAIUsageDelta,
} from './openai.mock.ts';

describe('openai.guard', () => {
  describe('isOpenAIChoiceDelta', () => {
    it('accepts a valid OpenAIChoiceDelta', () => {
      expect(isOpenAIChoiceDelta(mockOpenAIChoiceDelta())).toBe(true);
    });

    it('rejects missing delta field', () => {
      const missingDelta = {
        notDelta: true,
      };
      expect(isOpenAIChoiceDelta(missingDelta)).toBe(false);
    });

    it('rejects delta with wrong types', () => {
      const deltaNotObject = {
        delta: 'not-an-object',
      };
      expect(isOpenAIChoiceDelta(deltaNotObject)).toBe(false);
    });

    it('rejects content with wrong type when present', () => {
      const badContent = {
        delta: {
          content: 123,
        },
      };
      expect(isOpenAIChoiceDelta(badContent)).toBe(false);
    });
  });

  describe('isOpenAIChatCompletionChunk', () => {
    it('accepts a valid OpenAIChatCompletionChunk', () => {
      expect(isOpenAIChatCompletionChunk(mockOpenAIChatCompletionChunk())).toBe(
        true,
      );
    });

    it('rejects missing choices array', () => {
      const missingChoices = {
        usage: null,
      };
      expect(isOpenAIChatCompletionChunk(missingChoices)).toBe(false);
    });

    it('rejects non-array choices', () => {
      const nonArrayChoices = {
        choices: 'not-an-array',
        usage: null,
      };
      expect(isOpenAIChatCompletionChunk(nonArrayChoices)).toBe(false);
    });
  });

  describe('isOpenAIUsageDelta', () => {
    it('accepts a valid OpenAIUsageDelta', () => {
      expect(isOpenAIUsageDelta(mockOpenAIUsageDelta())).toBe(true);
    });

    it('rejects negative integers', () => {
      const negativeTokens = {
        prompt_tokens: -1,
        completion_tokens: 0,
        total_tokens: 0,
      };
      expect(isOpenAIUsageDelta(negativeTokens)).toBe(false);
    });

    it('rejects non-integers', () => {
      const fractionalTokens = {
        prompt_tokens: 1.5,
        completion_tokens: 0,
        total_tokens: 0,
      };
      expect(isOpenAIUsageDelta(fractionalTokens)).toBe(false);
    });

    it('rejects missing fields', () => {
      const missingFields = {
        prompt_tokens: 1,
      };
      expect(isOpenAIUsageDelta(missingFields)).toBe(false);
    });
  });
});
