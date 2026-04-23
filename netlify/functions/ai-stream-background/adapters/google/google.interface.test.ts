import { describe, expect, it } from 'vitest';
import type {
  GoogleCandidate,
  GoogleContent,
  GoogleFinalResponse,
  GoogleFinishReason,
  GooglePart,
  GoogleStreamChunk,
  GoogleUsageMetadata,
} from './google.interface.ts';

describe('google.interface contract', () => {
  it('accepts GooglePart with text chunk', () => {
    const literal: GooglePart = { text: 'chunk' };
    expect(typeof literal.text).toBe('string');
  });

  it('accepts GooglePart with text omitted', () => {
    const literal: GooglePart = {};
    expect(literal).toBeDefined();
  });

  it('accepts GoogleContent with parts array', () => {
    const literal: GoogleContent = { parts: [{ text: 'x' }] };
    expect(Array.isArray(literal.parts)).toBe(true);
  });

  it('accepts GoogleCandidate with finishReason STOP', () => {
    const tag: GoogleFinishReason = 'STOP';
    const literal: GoogleCandidate = { finishReason: tag };
    expect(literal.finishReason).toBe(tag);
  });

  it('accepts GoogleCandidate with finishReason MAX_TOKENS', () => {
    const tag: GoogleFinishReason = 'MAX_TOKENS';
    const literal: GoogleCandidate = { finishReason: tag };
    expect(literal.finishReason).toBe(tag);
  });

  it('accepts GoogleCandidate with finishReason SAFETY', () => {
    const tag: GoogleFinishReason = 'SAFETY';
    const literal: GoogleCandidate = { finishReason: tag };
    expect(literal.finishReason).toBe(tag);
  });

  it('accepts GoogleCandidate with finishReason RECITATION', () => {
    const tag: GoogleFinishReason = 'RECITATION';
    const literal: GoogleCandidate = { finishReason: tag };
    expect(literal.finishReason).toBe(tag);
  });

  it('accepts GoogleCandidate with content and finishReason omitted', () => {
    const literal: GoogleCandidate = {};
    expect(literal).toBeDefined();
  });

  it('accepts GoogleUsageMetadata with numeric token counts', () => {
    const literal: GoogleUsageMetadata = {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    };
    expect(typeof literal.promptTokenCount).toBe('number');
    expect(typeof literal.candidatesTokenCount).toBe('number');
    expect(typeof literal.totalTokenCount).toBe('number');
  });

  it('accepts GoogleStreamChunk with candidates array', () => {
    const inner: GoogleCandidate = { finishReason: 'STOP' };
    const literal: GoogleStreamChunk = { candidates: [inner] };
    expect(Array.isArray(literal.candidates)).toBe(true);
  });

  it('accepts GoogleStreamChunk with candidates omitted', () => {
    const literal: GoogleStreamChunk = {};
    expect(literal).toBeDefined();
  });

  it('accepts GoogleFinalResponse with candidates and usageMetadata', () => {
    const usage: GoogleUsageMetadata = {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    };
    const inner: GoogleCandidate = {
      content: { parts: [{ text: 'x' }] },
      finishReason: 'STOP',
    };
    const literal: GoogleFinalResponse = {
      candidates: [inner],
      usageMetadata: usage,
    };
    expect(Array.isArray(literal.candidates)).toBe(true);
    expect(literal.usageMetadata).toBe(usage);
  });

  it('accepts GoogleFinalResponse with usageMetadata null', () => {
    const literal: GoogleFinalResponse = { usageMetadata: null };
    expect(literal.usageMetadata).toBe(null);
  });
});
