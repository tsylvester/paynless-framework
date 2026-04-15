import { describe, it, expect } from 'vitest';
import {
  isAnthropicMessageDeltaEvent,
  isAnthropicMessageStartEvent,
  isAnthropicTextDeltaEvent,
} from './anthropic.guard.ts';
import {
  mockAnthropicMessageDeltaEvent,
  mockAnthropicMessageStartEvent,
  mockAnthropicTextDeltaEvent,
} from './anthropic.mock.ts';

describe('anthropic.guard', () => {
  describe('isAnthropicMessageStartEvent', () => {
    it('accepts a valid AnthropicMessageStartEvent', () => {
      expect(isAnthropicMessageStartEvent(mockAnthropicMessageStartEvent())).toBe(
        true,
      );
    });

    it('rejects missing type', () => {
      const missingType = {
        message: {
          usage: {
            input_tokens: 1,
          },
        },
      };
      expect(isAnthropicMessageStartEvent(missingType)).toBe(false);
    });

    it('rejects wrong type string', () => {
      const wrongType = {
        type: 'not_message_start',
        message: {
          usage: {
            input_tokens: 1,
          },
        },
      };
      expect(isAnthropicMessageStartEvent(wrongType)).toBe(false);
    });

    it('rejects missing message.usage', () => {
      const missingUsage = {
        type: 'message_start',
        message: {},
      };
      expect(isAnthropicMessageStartEvent(missingUsage)).toBe(false);
    });

    it('rejects non-integer input_tokens', () => {
      const fractionalInput = {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 1.5,
          },
        },
      };
      expect(isAnthropicMessageStartEvent(fractionalInput)).toBe(false);
    });
  });

  describe('isAnthropicTextDeltaEvent', () => {
    it('accepts a valid AnthropicTextDeltaEvent', () => {
      expect(isAnthropicTextDeltaEvent(mockAnthropicTextDeltaEvent())).toBe(true);
    });

    it('rejects wrong outer type', () => {
      const wrongOuterType = {
        type: 'not_content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'hello',
        },
      };
      expect(isAnthropicTextDeltaEvent(wrongOuterType)).toBe(false);
    });

    it('rejects missing delta', () => {
      const missingDelta = {
        type: 'content_block_delta',
      };
      expect(isAnthropicTextDeltaEvent(missingDelta)).toBe(false);
    });

    it('rejects missing delta.text', () => {
      const missingText = {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
        },
      };
      expect(isAnthropicTextDeltaEvent(missingText)).toBe(false);
    });

    it('rejects wrong delta.type', () => {
      const wrongDeltaType = {
        type: 'content_block_delta',
        delta: {
          type: 'not_text_delta',
          text: 'hello',
        },
      };
      expect(isAnthropicTextDeltaEvent(wrongDeltaType)).toBe(false);
    });
  });

  describe('isAnthropicMessageDeltaEvent', () => {
    it('accepts a valid AnthropicMessageDeltaEvent', () => {
      expect(isAnthropicMessageDeltaEvent(mockAnthropicMessageDeltaEvent())).toBe(
        true,
      );
    });

    it('rejects missing usage', () => {
      const missingUsage = {
        type: 'message_delta',
      };
      expect(isAnthropicMessageDeltaEvent(missingUsage)).toBe(false);
    });

    it('rejects non-integer output_tokens', () => {
      const fractionalOutput = {
        type: 'message_delta',
        usage: {
          output_tokens: 2.5,
        },
      };
      expect(isAnthropicMessageDeltaEvent(fractionalOutput)).toBe(false);
    });
  });
});
