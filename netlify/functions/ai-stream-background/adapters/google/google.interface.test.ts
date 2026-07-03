import { describe, expect, it } from 'vitest';
import type {
  GoogleCandidate,
  GoogleContent,
  GoogleEmbeddingResponse,
  GoogleFinalResponse,
  GoogleFinishReason,
  GooglePart,
  GoogleStreamChunk,
  GoogleTokenCountResponse,
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

  it('accepts GoogleEmbeddingResponse with embedding.values numeric vector output', () => {
    const literal: GoogleEmbeddingResponse = {
      embedding: {
        values: [0.12, 0.34, 0.56],
      },
    };
    expect(Array.isArray(literal.embedding.values)).toBe(true);
    const allNumeric: boolean = literal.embedding.values.every((value) => {
      return typeof value === 'number';
    });
    expect(allNumeric).toBe(true);
  });

  it('accepts GoogleTokenCountResponse with numeric total token count', () => {
    const literal: GoogleTokenCountResponse = {
      totalTokenCount: 42,
    };
    expect(typeof literal.totalTokenCount).toBe('number');
  });

  it('invalid embedding fixture: missing vector property', () => {
    const literal = {
      embedding: {},
    };
    expect('values' in literal.embedding).toBe(false);
  });

  it('invalid embedding fixture: non-numeric vector elements', () => {
    const literal = {
      embedding: {
        values: [0.1, 'oops', 0.3],
      },
    };
    const allNumeric: boolean = literal.embedding.values.every((value) => {
      return typeof value === 'number';
    });
    expect(allNumeric).toBe(false);
  });

  it('invalid token-count fixture: missing token total', () => {
    const literal = {};
    expect('totalTokenCount' in literal).toBe(false);
  });

  it('invalid token-count fixture: non-numeric token total', () => {
    const literal = {
      totalTokenCount: '42',
    };
    expect(typeof literal.totalTokenCount).not.toBe('number');
  });
});
