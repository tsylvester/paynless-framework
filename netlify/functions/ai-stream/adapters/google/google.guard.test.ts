import { describe, it, expect } from 'vitest';
import { isGoogleStreamChunk, isGoogleUsageMetadata } from './google.guard.ts';
import { mockGoogleStreamChunk, mockGoogleUsageMetadata } from './google.mock.ts';

describe('google.guard', () => {
  describe('isGoogleUsageMetadata', () => {
    it('accepts valid GoogleUsageMetadata', () => {
      expect(isGoogleUsageMetadata(mockGoogleUsageMetadata())).toBe(true);
    });

    it('rejects negative promptTokenCount', () => {
      const negativePrompt = {
        promptTokenCount: -1,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      };
      expect(isGoogleUsageMetadata(negativePrompt)).toBe(false);
    });

    it('rejects negative candidatesTokenCount', () => {
      const negativeCandidates = {
        promptTokenCount: 0,
        candidatesTokenCount: -1,
        totalTokenCount: 0,
      };
      expect(isGoogleUsageMetadata(negativeCandidates)).toBe(false);
    });

    it('rejects negative totalTokenCount', () => {
      const negativeTotal = {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: -1,
      };
      expect(isGoogleUsageMetadata(negativeTotal)).toBe(false);
    });

    it('rejects non-integer counts', () => {
      const fractional = {
        promptTokenCount: 1.5,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      };
      expect(isGoogleUsageMetadata(fractional)).toBe(false);
    });

    it('rejects missing fields', () => {
      const missingFields = {
        promptTokenCount: 1,
        candidatesTokenCount: 2,
      };
      expect(isGoogleUsageMetadata(missingFields)).toBe(false);
    });
  });

  describe('isGoogleStreamChunk', () => {
    it('accepts a chunk with text function', () => {
      expect(isGoogleStreamChunk(mockGoogleStreamChunk())).toBe(true);
    });

    it('accepts a chunk with text function and usageMetadata', () => {
      expect(
        isGoogleStreamChunk(
          mockGoogleStreamChunk({
            usageMetadata: mockGoogleUsageMetadata(),
          }),
        ),
      ).toBe(true);
    });

    it('rejects missing text', () => {
      const missingText = {
        usageMetadata: mockGoogleUsageMetadata(),
      };
      expect(isGoogleStreamChunk(missingText)).toBe(false);
    });

    it('rejects non-function text', () => {
      const textNotFunction = {
        text: 'not-a-function',
        usageMetadata: undefined,
      };
      expect(isGoogleStreamChunk(textNotFunction)).toBe(false);
    });
  });
});
