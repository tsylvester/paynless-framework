import { describe, expect, it } from 'vitest';
import {
  isGoogleCandidate,
  isGoogleContent,
  isGoogleFinalResponse,
  isGoogleFinishReason,
  isGooglePart,
  isGoogleStreamChunk,
  isGoogleUsageMetadata,
} from './google.guard.ts';

describe('google.guard', () => {
  describe('isGoogleFinishReason', () => {
    it('accepts STOP', () => {
      expect(isGoogleFinishReason('STOP')).toBe(true);
    });

    it('accepts MAX_TOKENS', () => {
      expect(isGoogleFinishReason('MAX_TOKENS')).toBe(true);
    });

    it('accepts SAFETY', () => {
      expect(isGoogleFinishReason('SAFETY')).toBe(true);
    });

    it('accepts RECITATION', () => {
      expect(isGoogleFinishReason('RECITATION')).toBe(true);
    });

    it('rejects unrecognized string', () => {
      expect(isGoogleFinishReason('foo')).toBe(false);
    });

    it('rejects null', () => {
      expect(isGoogleFinishReason(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isGoogleFinishReason(undefined)).toBe(false);
    });

    it('rejects non-string', () => {
      expect(isGoogleFinishReason(1)).toBe(false);
    });
  });

  describe('isGooglePart', () => {
    it('accepts part with text string', () => {
      const value: unknown = { text: 'x' };
      expect(isGooglePart(value)).toBe(true);
    });

    it('accepts empty part object', () => {
      const value: unknown = {};
      expect(isGooglePart(value)).toBe(true);
    });

    it('rejects non-string text', () => {
      const value: unknown = { text: 123 };
      expect(isGooglePart(value)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isGooglePart('not-object')).toBe(false);
    });

    it('rejects null', () => {
      expect(isGooglePart(null)).toBe(false);
    });
  });

  describe('isGoogleContent', () => {
    it('accepts content with empty parts array', () => {
      const value: unknown = { parts: [] };
      expect(isGoogleContent(value)).toBe(true);
    });

    it('accepts content with parts containing valid part', () => {
      const value: unknown = { parts: [{ text: 'x' }] };
      expect(isGoogleContent(value)).toBe(true);
    });

    it('rejects missing parts', () => {
      const value: unknown = {};
      expect(isGoogleContent(value)).toBe(false);
    });

    it('rejects non-array parts', () => {
      const value: unknown = { parts: {} };
      expect(isGoogleContent(value)).toBe(false);
    });

    it('rejects parts containing non-part element', () => {
      const value: unknown = { parts: [{ text: 1 }] };
      expect(isGoogleContent(value)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isGoogleContent(1)).toBe(false);
    });
  });

  describe('isGoogleCandidate', () => {
    it('accepts candidate with finishReason STOP', () => {
      const value: unknown = { finishReason: 'STOP' };
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('accepts candidate with finishReason MAX_TOKENS', () => {
      const value: unknown = { finishReason: 'MAX_TOKENS' };
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('accepts candidate with finishReason SAFETY', () => {
      const value: unknown = { finishReason: 'SAFETY' };
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('accepts candidate with finishReason RECITATION', () => {
      const value: unknown = { finishReason: 'RECITATION' };
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('accepts candidate with finishReason and content both omitted', () => {
      const value: unknown = {};
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('accepts candidate with finishReason omitted and content present', () => {
      const value: unknown = { content: { parts: [{ text: 'x' }] } };
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('accepts candidate with valid content', () => {
      const value: unknown = {
        content: { parts: [{ text: 'x' }] },
        finishReason: 'STOP',
      };
      expect(isGoogleCandidate(value)).toBe(true);
    });

    it('rejects invalid content shape', () => {
      const value: unknown = { content: { parts: 'not-array' } };
      expect(isGoogleCandidate(value)).toBe(false);
    });

    it('rejects invalid finishReason string', () => {
      const value: unknown = { finishReason: 'UNKNOWN_REASON' };
      expect(isGoogleCandidate(value)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isGoogleCandidate(1)).toBe(false);
    });
  });

  describe('isGoogleUsageMetadata', () => {
    it('accepts valid usage metadata', () => {
      const value: unknown = {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      };
      expect(isGoogleUsageMetadata(value)).toBe(true);
    });

    it('rejects negative promptTokenCount', () => {
      const value: unknown = {
        promptTokenCount: -1,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      };
      expect(isGoogleUsageMetadata(value)).toBe(false);
    });

    it('rejects negative candidatesTokenCount', () => {
      const value: unknown = {
        promptTokenCount: 10,
        candidatesTokenCount: -1,
        totalTokenCount: 30,
      };
      expect(isGoogleUsageMetadata(value)).toBe(false);
    });

    it('rejects missing field', () => {
      const value: unknown = {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
      };
      expect(isGoogleUsageMetadata(value)).toBe(false);
    });

    it('rejects non-integer token count', () => {
      const value: unknown = {
        promptTokenCount: 10.5,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      };
      expect(isGoogleUsageMetadata(value)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isGoogleUsageMetadata(null)).toBe(false);
    });
  });

  describe('isGoogleStreamChunk', () => {
    it('accepts chunk with candidates array', () => {
      const value: unknown = { candidates: [{ finishReason: 'STOP' }] };
      expect(isGoogleStreamChunk(value)).toBe(true);
    });

    it('accepts chunk with candidates omitted', () => {
      const value: unknown = {};
      expect(isGoogleStreamChunk(value)).toBe(true);
    });

    it('rejects non-array candidates', () => {
      const value: unknown = { candidates: {} };
      expect(isGoogleStreamChunk(value)).toBe(false);
    });

    it('rejects candidates containing non-candidate', () => {
      const value: unknown = { candidates: [{ finishReason: 'not-valid' }] };
      expect(isGoogleStreamChunk(value)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isGoogleStreamChunk(1)).toBe(false);
    });
  });

  describe('isGoogleFinalResponse', () => {
    it('accepts response with candidates and usageMetadata', () => {
      const value: unknown = {
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };
      expect(isGoogleFinalResponse(value)).toBe(true);
    });

    it('accepts response without candidates', () => {
      const value: unknown = {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };
      expect(isGoogleFinalResponse(value)).toBe(true);
    });

    it('accepts response with usageMetadata null', () => {
      const value: unknown = { usageMetadata: null };
      expect(isGoogleFinalResponse(value)).toBe(true);
    });

    it('accepts response with usageMetadata omitted', () => {
      const value: unknown = {};
      expect(isGoogleFinalResponse(value)).toBe(true);
    });

    it('rejects invalid usageMetadata shape', () => {
      const value: unknown = {
        usageMetadata: {
          promptTokenCount: '10',
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };
      expect(isGoogleFinalResponse(value)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isGoogleFinalResponse(null)).toBe(false);
    });
  });

  describe('guard alignment with google.interface contract shapes', () => {
    it('accepts interface-shaped GooglePart with text', () => {
      const value: unknown = { text: 'chunk' };
      expect(isGooglePart(value)).toBe(true);
    });

    it('accepts interface-shaped GooglePart empty', () => {
      const value: unknown = {};
      expect(isGooglePart(value)).toBe(true);
    });

    it('accepts interface-shaped GoogleContent', () => {
      const value: unknown = { parts: [{ text: 'x' }] };
      expect(isGoogleContent(value)).toBe(true);
    });

    it('accepts interface-shaped GoogleStreamChunk with candidates', () => {
      const value: unknown = { candidates: [{ finishReason: 'STOP' }] };
      expect(isGoogleStreamChunk(value)).toBe(true);
    });

    it('accepts interface-shaped GoogleFinalResponse with usageMetadata null', () => {
      const value: unknown = { usageMetadata: null };
      expect(isGoogleFinalResponse(value)).toBe(true);
    });
  });
});
