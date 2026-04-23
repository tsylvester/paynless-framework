import { describe, expect, it } from 'vitest';
import type { OpenAIChatCompletionChunk } from './openai.interface.ts';
import {
  createMockOpenAIChatCompletionChunk,
  createMockOpenAIChoice,
  createMockOpenAIDelta,
  createMockOpenAIUsageDelta,
} from './openai.mock.ts';
import {
  isOpenAIChatCompletionChunk,
  isOpenAIChoice,
  isOpenAIDelta,
  isOpenAIFinishReason,
  isOpenAIUsageDelta,
} from './openai.guard.ts';

describe('openai.guard', () => {
  describe('isOpenAIFinishReason', () => {
    it('accepts stop', () => {
      expect(isOpenAIFinishReason('stop')).toBe(true);
    });

    it('accepts length', () => {
      expect(isOpenAIFinishReason('length')).toBe(true);
    });

    it('accepts tool_calls', () => {
      expect(isOpenAIFinishReason('tool_calls')).toBe(true);
    });

    it('accepts content_filter', () => {
      expect(isOpenAIFinishReason('content_filter')).toBe(true);
    });

    it('accepts function_call', () => {
      expect(isOpenAIFinishReason('function_call')).toBe(true);
    });

    it('rejects unrecognized string', () => {
      expect(isOpenAIFinishReason('foo')).toBe(false);
    });

    it('rejects null', () => {
      expect(isOpenAIFinishReason(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isOpenAIFinishReason(undefined)).toBe(false);
    });

    it('rejects non-string', () => {
      expect(isOpenAIFinishReason(1)).toBe(false);
    });
  });

  describe('isOpenAIDelta', () => {
    it('accepts delta with string content', () => {
      expect(isOpenAIDelta({ content: 'text' })).toBe(true);
    });

    it('accepts delta with null content', () => {
      expect(isOpenAIDelta({ content: null })).toBe(true);
    });

    it('accepts empty delta object', () => {
      expect(isOpenAIDelta({})).toBe(true);
    });

    it('accepts valid delta from default mock factory', () => {
      expect(isOpenAIDelta(createMockOpenAIDelta())).toBe(true);
    });

    it('rejects content with wrong type', () => {
      expect(isOpenAIDelta({ content: 123 })).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isOpenAIDelta('not-object')).toBe(false);
    });

    it('rejects null', () => {
      expect(isOpenAIDelta(null)).toBe(false);
    });
  });

  describe('isOpenAIChoice', () => {
    it('accepts choice with finish_reason stop', () => {
      expect(
        isOpenAIChoice(
          createMockOpenAIChoice({ finish_reason: 'stop', delta: { content: 'a' } }),
        ),
      ).toBe(true);
    });

    it('accepts choice with finish_reason length', () => {
      expect(
        isOpenAIChoice(
          createMockOpenAIChoice({ finish_reason: 'length', delta: { content: 'a' } }),
        ),
      ).toBe(true);
    });

    it('accepts choice with finish_reason tool_calls', () => {
      expect(
        isOpenAIChoice(
          createMockOpenAIChoice({
            finish_reason: 'tool_calls',
            delta: { content: 'a' },
          }),
        ),
      ).toBe(true);
    });

    it('accepts choice with finish_reason content_filter', () => {
      expect(
        isOpenAIChoice(
          createMockOpenAIChoice({
            finish_reason: 'content_filter',
            delta: { content: 'a' },
          }),
        ),
      ).toBe(true);
    });

    it('accepts choice with finish_reason function_call', () => {
      expect(
        isOpenAIChoice(
          createMockOpenAIChoice({
            finish_reason: 'function_call',
            delta: { content: 'a' },
          }),
        ),
      ).toBe(true);
    });

    it('accepts choice with finish_reason null', () => {
      expect(isOpenAIChoice(createMockOpenAIChoice({ finish_reason: null }))).toBe(true);
    });

    it('rejects object missing delta field', () => {
      expect(isOpenAIChoice({ finish_reason: null })).toBe(false);
    });

    it('rejects invalid delta', () => {
      expect(
        isOpenAIChoice({
          delta: { content: 123 },
          finish_reason: null,
        }),
      ).toBe(false);
    });

    it('rejects missing finish_reason field', () => {
      expect(isOpenAIChoice({ delta: {} })).toBe(false);
    });

    it('rejects unrecognized finish_reason string', () => {
      expect(
        isOpenAIChoice({
          delta: {},
          finish_reason: 'foo',
        }),
      ).toBe(false);
    });
  });

  describe('isOpenAIUsageDelta', () => {
    it('accepts valid usage from default mock factory', () => {
      expect(isOpenAIUsageDelta(createMockOpenAIUsageDelta())).toBe(true);
    });

    it('rejects usage with missing field', () => {
      expect(
        isOpenAIUsageDelta({
          prompt_tokens: 1,
          completion_tokens: 2,
        }),
      ).toBe(false);
    });

    it('rejects negative prompt_tokens', () => {
      expect(
        isOpenAIUsageDelta(
          createMockOpenAIUsageDelta({ prompt_tokens: -1 }),
        ),
      ).toBe(false);
    });

    it('rejects non-integer total_tokens', () => {
      expect(
        isOpenAIUsageDelta(
          createMockOpenAIUsageDelta({ total_tokens: 1.5 }),
        ),
      ).toBe(false);
    });
  });

  describe('isOpenAIChatCompletionChunk', () => {
    it('accepts valid chunk from default mock factory', () => {
      expect(isOpenAIChatCompletionChunk(createMockOpenAIChatCompletionChunk())).toBe(
        true,
      );
    });

    it('accepts chunk with usage null', () => {
      expect(
        isOpenAIChatCompletionChunk(
          createMockOpenAIChatCompletionChunk({ usage: null }),
        ),
      ).toBe(true);
    });

    it('accepts chunk with usage property omitted', () => {
      const chunkUsageOmitted: OpenAIChatCompletionChunk = {
        choices: [createMockOpenAIChoice({ delta: { content: 'y' }, finish_reason: null })],
      };
      expect(isOpenAIChatCompletionChunk(chunkUsageOmitted)).toBe(true);
    });

    it('accepts chunk with empty choices', () => {
      expect(
        isOpenAIChatCompletionChunk(
          createMockOpenAIChatCompletionChunk({ choices: [] }),
        ),
      ).toBe(true);
    });

    it('rejects object missing choices array', () => {
      expect(isOpenAIChatCompletionChunk({})).toBe(false);
    });

    it('rejects non-array choices', () => {
      expect(isOpenAIChatCompletionChunk({ choices: 'not-array' })).toBe(false);
    });

    it('rejects choices containing non-choice element', () => {
      expect(
        isOpenAIChatCompletionChunk({
          choices: [{}],
        }),
      ).toBe(false);
    });

    it('rejects usage present with invalid shape', () => {
      const validChoice: OpenAIChatCompletionChunk['choices'][number] =
        createMockOpenAIChoice({ finish_reason: null });
      expect(
        isOpenAIChatCompletionChunk({
          choices: [validChoice],
          usage: { prompt_tokens: -1, completion_tokens: 0, total_tokens: 0 },
        }),
      ).toBe(false);
    });
  });

  describe('guard alignment with interface contract shapes', () => {
    it('accepts OpenAIDelta shapes exercised by openai.interface.test', () => {
      expect(isOpenAIDelta({ content: 'text' })).toBe(true);
      expect(isOpenAIDelta({ content: null })).toBe(true);
      expect(isOpenAIDelta({})).toBe(true);
    });

    it('accepts OpenAIFinishReason tags exercised by openai.interface.test', () => {
      expect(isOpenAIFinishReason('stop')).toBe(true);
      expect(isOpenAIFinishReason('length')).toBe(true);
      expect(isOpenAIFinishReason('tool_calls')).toBe(true);
      expect(isOpenAIFinishReason('content_filter')).toBe(true);
      expect(isOpenAIFinishReason('function_call')).toBe(true);
    });

    it('accepts OpenAIChoice shapes exercised by openai.interface.test', () => {
      expect(
        isOpenAIChoice({
          delta: { content: 'a' },
          finish_reason: 'stop',
        }),
      ).toBe(true);
      expect(
        isOpenAIChoice({
          delta: {},
          finish_reason: null,
        }),
      ).toBe(true);
    });

    it('accepts OpenAIUsageDelta shape exercised by openai.interface.test', () => {
      expect(
        isOpenAIUsageDelta(
          createMockOpenAIUsageDelta({
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          }),
        ),
      ).toBe(true);
    });

    it('accepts OpenAIChatCompletionChunk shapes exercised by openai.interface.test', () => {
      const choice: OpenAIChatCompletionChunk['choices'][number] = {
        delta: { content: 'x' },
        finish_reason: null,
      };
      const usage = createMockOpenAIUsageDelta({
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      });
      expect(
        isOpenAIChatCompletionChunk({
          choices: [choice],
          usage,
        }),
      ).toBe(true);
      expect(
        isOpenAIChatCompletionChunk({
          choices: [],
        }),
      ).toBe(true);
      expect(
        isOpenAIChatCompletionChunk({
          choices: [
            {
              delta: {},
              finish_reason: null,
            },
          ],
          usage: null,
        }),
      ).toBe(true);
      const chunkOmitted: OpenAIChatCompletionChunk = {
        choices: [
          {
            delta: { content: 'y' },
            finish_reason: null,
          },
        ],
      };
      expect(isOpenAIChatCompletionChunk(chunkOmitted)).toBe(true);
    });
  });
});
