import { describe, it, expect } from 'vitest';
import type { NodeTokenUsage } from '../ai-adapter.interface.ts';
import type { GoogleStreamChunk, GoogleUsageMetadata } from './google.interface.ts';
import { mockGoogleStreamChunk, mockGoogleUsageMetadata } from './google.mock.ts';

describe('google.interface contract', () => {
  it('valid GoogleUsageMetadata: promptTokenCount, candidatesTokenCount, totalTokenCount are non-negative integers', () => {
    const usage: GoogleUsageMetadata = mockGoogleUsageMetadata();
    expect(Number.isInteger(usage.promptTokenCount)).toBe(true);
    expect(usage.promptTokenCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(usage.candidatesTokenCount)).toBe(true);
    expect(usage.candidatesTokenCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(usage.totalTokenCount)).toBe(true);
    expect(usage.totalTokenCount).toBeGreaterThanOrEqual(0);
  });

  it('valid GoogleStreamChunk: has text function returning string; usageMetadata is optional GoogleUsageMetadata', () => {
    const withUsage: GoogleStreamChunk = mockGoogleStreamChunk({
      usageMetadata: mockGoogleUsageMetadata(),
    });
    const withoutUsage: GoogleStreamChunk = mockGoogleStreamChunk({
      usageMetadata: undefined,
    });
    expect(typeof withUsage.text).toBe('function');
    expect(typeof withUsage.text()).toBe('string');
    expect(typeof withoutUsage.text).toBe('function');
    expect(typeof withoutUsage.text()).toBe('string');
  });

  it('mapping: usageMetadata fields map to NodeTokenUsage prompt_tokens, completion_tokens, total_tokens', () => {
    const usageMetadata: GoogleUsageMetadata = mockGoogleUsageMetadata({
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    });
    const mapped: NodeTokenUsage = {
      prompt_tokens: usageMetadata.promptTokenCount,
      completion_tokens: usageMetadata.candidatesTokenCount,
      total_tokens: usageMetadata.totalTokenCount,
    };
    expect(mapped.prompt_tokens).toBe(10);
    expect(mapped.completion_tokens).toBe(20);
    expect(mapped.total_tokens).toBe(30);
  });

  it('missing usageMetadata on all chunks leaves token_usage null', () => {
    const first: GoogleStreamChunk = mockGoogleStreamChunk({
      usageMetadata: undefined,
    });
    const second: GoogleStreamChunk = mockGoogleStreamChunk({
      usageMetadata: undefined,
    });
    const chunks: GoogleStreamChunk[] = [first, second];
    let token_usage: NodeTokenUsage | null = null;
    for (const chunk of chunks) {
      if (chunk.usageMetadata !== undefined) {
        const usageMetadata: GoogleUsageMetadata = chunk.usageMetadata;
        const mapped: NodeTokenUsage = {
          prompt_tokens: usageMetadata.promptTokenCount,
          completion_tokens: usageMetadata.candidatesTokenCount,
          total_tokens: usageMetadata.totalTokenCount,
        };
        token_usage = mapped;
      }
    }
    expect(token_usage).toBe(null);
  });

  it('invalid: usageMetadata with negative counts violates the non-negative contract', () => {
    const bad: GoogleUsageMetadata = mockGoogleUsageMetadata({
      promptTokenCount: -1,
    });
    expect(bad.promptTokenCount).toBeLessThan(0);
  });

  it('invalid: chunk missing text function is structurally unusable as GoogleStreamChunk', () => {
    const missingText: Record<string, unknown> = {
      usageMetadata: mockGoogleUsageMetadata(),
    };
    const hasTextFunction: boolean = typeof missingText['text'] === 'function';
    expect(hasTextFunction).toBe(false);
  });
});
