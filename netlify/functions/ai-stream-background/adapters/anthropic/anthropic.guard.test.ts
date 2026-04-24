import { describe, expect, it } from 'vitest';
import type {
  AnthropicFinalMessage,
  AnthropicUsage,
} from './anthropic.interface.ts';
import {
  isAnthropicContentBlockDeltaEvent,
  isAnthropicFinalMessage,
  isAnthropicStopReason,
  isAnthropicTextDelta,
  isAnthropicUsage,
} from './anthropic.guard.ts';

describe('anthropic.guard', () => {
  describe('isAnthropicStopReason', () => {
    it('accepts end_turn', () => {
      expect(isAnthropicStopReason('end_turn')).toBe(true);
    });

    it('accepts stop_sequence', () => {
      expect(isAnthropicStopReason('stop_sequence')).toBe(true);
    });

    it('accepts max_tokens', () => {
      expect(isAnthropicStopReason('max_tokens')).toBe(true);
    });

    it('accepts tool_use', () => {
      expect(isAnthropicStopReason('tool_use')).toBe(true);
    });

    it('rejects unrecognized string', () => {
      expect(isAnthropicStopReason('foo')).toBe(false);
    });

    it('rejects null', () => {
      expect(isAnthropicStopReason(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isAnthropicStopReason(undefined)).toBe(false);
    });

    it('rejects non-string', () => {
      expect(isAnthropicStopReason(1)).toBe(false);
    });
  });

  describe('isAnthropicTextDelta', () => {
    it('accepts text_delta with string text', () => {
      expect(isAnthropicTextDelta({ type: 'text_delta', text: 'x' })).toBe(true);
    });

    it('rejects wrong type', () => {
      expect(isAnthropicTextDelta({ type: 'other', text: 'x' })).toBe(false);
    });

    it('rejects non-string text', () => {
      expect(isAnthropicTextDelta({ type: 'text_delta', text: 1 })).toBe(false);
    });

    it('rejects missing text field', () => {
      expect(isAnthropicTextDelta({ type: 'text_delta' })).toBe(false);
    });

    it('rejects missing type field', () => {
      expect(isAnthropicTextDelta({ text: 'x' })).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isAnthropicTextDelta('not-object')).toBe(false);
    });

    it('rejects null', () => {
      expect(isAnthropicTextDelta(null)).toBe(false);
    });
  });

  describe('isAnthropicContentBlockDeltaEvent', () => {
    it('accepts valid content_block_delta with text_delta', () => {
      expect(
        isAnthropicContentBlockDeltaEvent({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'x' },
        }),
      ).toBe(true);
    });

    it('rejects wrong event type', () => {
      expect(
        isAnthropicContentBlockDeltaEvent({
          type: 'message_start',
          delta: { type: 'text_delta', text: 'x' },
        }),
      ).toBe(false);
    });

    it('rejects missing delta', () => {
      expect(isAnthropicContentBlockDeltaEvent({ type: 'content_block_delta' })).toBe(
        false,
      );
    });

    it('rejects delta that fails isAnthropicTextDelta', () => {
      expect(
        isAnthropicContentBlockDeltaEvent({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 1 },
        }),
      ).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isAnthropicContentBlockDeltaEvent(1)).toBe(false);
    });
  });

  describe('isAnthropicUsage', () => {
    it('accepts valid usage', () => {
      expect(isAnthropicUsage({ input_tokens: 10, output_tokens: 20 })).toBe(true);
    });

    it('rejects negative input_tokens', () => {
      expect(isAnthropicUsage({ input_tokens: -1, output_tokens: 1 })).toBe(false);
    });

    it('rejects negative output_tokens', () => {
      expect(isAnthropicUsage({ input_tokens: 1, output_tokens: -1 })).toBe(false);
    });

    it('rejects non-integer input_tokens', () => {
      expect(isAnthropicUsage({ input_tokens: 1.5, output_tokens: 1 })).toBe(false);
    });

    it('rejects non-integer output_tokens', () => {
      expect(isAnthropicUsage({ input_tokens: 1, output_tokens: 1.5 })).toBe(false);
    });

    it('rejects missing input_tokens', () => {
      expect(isAnthropicUsage({ output_tokens: 1 })).toBe(false);
    });

    it('rejects missing output_tokens', () => {
      expect(isAnthropicUsage({ input_tokens: 1 })).toBe(false);
    });
  });

  describe('isAnthropicFinalMessage', () => {
    it('accepts final message with stop_reason end_turn', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 10, output_tokens: 20 },
          stop_reason: 'end_turn',
        }),
      ).toBe(true);
    });

    it('accepts final message with stop_reason stop_sequence', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 10, output_tokens: 20 },
          stop_reason: 'stop_sequence',
        }),
      ).toBe(true);
    });

    it('accepts final message with stop_reason max_tokens', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 10, output_tokens: 20 },
          stop_reason: 'max_tokens',
        }),
      ).toBe(true);
    });

    it('accepts final message with stop_reason tool_use', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 10, output_tokens: 20 },
          stop_reason: 'tool_use',
        }),
      ).toBe(true);
    });

    it('accepts final message with stop_reason null', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 10, output_tokens: 20 },
          stop_reason: null,
        }),
      ).toBe(true);
    });

    it('rejects missing usage', () => {
      expect(isAnthropicFinalMessage({ stop_reason: 'end_turn' })).toBe(false);
    });

    it('rejects invalid usage', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: -1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      ).toBe(false);
    });

    it('rejects missing stop_reason field', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
      ).toBe(false);
    });

    it('rejects unrecognized stop_reason string', () => {
      expect(
        isAnthropicFinalMessage({
          usage: { input_tokens: 1, output_tokens: 2 },
          stop_reason: 'not_a_stop_reason',
        }),
      ).toBe(false);
    });
  });

  describe('guard alignment with interface contract shapes', () => {
    it('accepts AnthropicTextDelta shapes exercised by anthropic.interface.test', () => {
      expect(isAnthropicTextDelta({ type: 'text_delta', text: 'chunk' })).toBe(true);
    });

    it('accepts AnthropicContentBlockDeltaEvent shapes exercised by anthropic.interface.test', () => {
      expect(
        isAnthropicContentBlockDeltaEvent({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'chunk' },
        }),
      ).toBe(true);
    });

    it('accepts AnthropicUsage shape exercised by anthropic.interface.test', () => {
      expect(isAnthropicUsage({ input_tokens: 10, output_tokens: 20 })).toBe(true);
    });

    it('accepts AnthropicFinalMessage shapes exercised by anthropic.interface.test', () => {
      const usage: AnthropicUsage = {
        input_tokens: 10,
        output_tokens: 20,
      };
      const endTurn: AnthropicFinalMessage = {
        usage,
        stop_reason: 'end_turn',
      };
      const stopSequence: AnthropicFinalMessage = {
        usage,
        stop_reason: 'stop_sequence',
      };
      const maxTokens: AnthropicFinalMessage = {
        usage,
        stop_reason: 'max_tokens',
      };
      const toolUse: AnthropicFinalMessage = {
        usage,
        stop_reason: 'tool_use',
      };
      const nullReason: AnthropicFinalMessage = {
        usage,
        stop_reason: null,
      };
      expect(isAnthropicFinalMessage(endTurn)).toBe(true);
      expect(isAnthropicFinalMessage(stopSequence)).toBe(true);
      expect(isAnthropicFinalMessage(maxTokens)).toBe(true);
      expect(isAnthropicFinalMessage(toolUse)).toBe(true);
      expect(isAnthropicFinalMessage(nullReason)).toBe(true);
    });
  });
});
