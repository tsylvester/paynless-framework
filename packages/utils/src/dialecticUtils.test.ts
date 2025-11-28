import { describe, it, expect } from 'vitest';
import { buildFocusedDocumentKey, isDocumentHighlighted } from './dialecticUtils';
import type { FocusedStageDocumentState } from '@paynless/types';

describe('buildFocusedDocumentKey', () => {
  it('should return correct format `${sessionId}:${stageSlug}:${modelId}` for valid inputs', () => {
    const sessionId = 'session-123';
    const stageSlug = 'thesis';
    const modelId = 'model-456';
    const expected = 'session-123:thesis:model-456';
    expect(buildFocusedDocumentKey(sessionId, stageSlug, modelId)).toBe(expected);
  });

  it('should handle empty strings correctly', () => {
    expect(buildFocusedDocumentKey('', '', '')).toBe('::');
    expect(buildFocusedDocumentKey('session-1', '', 'model-1')).toBe('session-1::model-1');
    expect(buildFocusedDocumentKey('', 'thesis', 'model-1')).toBe(':thesis:model-1');
    expect(buildFocusedDocumentKey('session-1', 'thesis', '')).toBe('session-1:thesis:');
  });

  it('should handle special characters in IDs correctly', () => {
    const sessionId = 'session-123:with:colons';
    const stageSlug = 'stage_with_underscores';
    const modelId = 'model-456/with/slashes';
    const expected = 'session-123:with:colons:stage_with_underscores:model-456/with/slashes';
    expect(buildFocusedDocumentKey(sessionId, stageSlug, modelId)).toBe(expected);
  });
});

describe('isDocumentHighlighted', () => {
  it('should return true when `focusedStageDocumentMap[focusKey]?.documentKey === documentKey` matches', () => {
    const sessionId = 'session-123';
    const stageSlug = 'thesis';
    const modelId = 'model-456';
    const documentKey = 'business_case';
    const focusKey = buildFocusedDocumentKey(sessionId, stageSlug, modelId);
    const focusedStageDocumentMap: Record<string, FocusedStageDocumentState | null> = {
      [focusKey]: {
        modelId: 'model-456',
        documentKey: 'business_case',
      },
    };
    expect(isDocumentHighlighted(sessionId, stageSlug, modelId, documentKey, focusedStageDocumentMap)).toBe(true);
  });

  it('should return false when `focusKey` does not exist in map', () => {
    const sessionId = 'session-123';
    const stageSlug = 'thesis';
    const modelId = 'model-456';
    const documentKey = 'business_case';
    const focusedStageDocumentMap: Record<string, FocusedStageDocumentState | null> = {
      'other-session:other-stage:other-model': {
        modelId: 'other-model',
        documentKey: 'business_case',
      },
    };
    expect(isDocumentHighlighted(sessionId, stageSlug, modelId, documentKey, focusedStageDocumentMap)).toBe(false);
  });

  it('should return false when `documentKey` does not match', () => {
    const sessionId = 'session-123';
    const stageSlug = 'thesis';
    const modelId = 'model-456';
    const documentKey = 'business_case';
    const focusKey = buildFocusedDocumentKey(sessionId, stageSlug, modelId);
    const focusedStageDocumentMap: Record<string, FocusedStageDocumentState | null> = {
      [focusKey]: {
        modelId: 'model-456',
        documentKey: 'feature_spec',
      },
    };
    expect(isDocumentHighlighted(sessionId, stageSlug, modelId, documentKey, focusedStageDocumentMap)).toBe(false);
  });

  it('should return false when `sessionId`, `stageSlug`, or `modelId` are empty/missing', () => {
    const documentKey = 'business_case';
    const focusedStageDocumentMap: Record<string, FocusedStageDocumentState | null> = {
      'session-123:thesis:model-456': {
        modelId: 'model-456',
        documentKey: 'business_case',
      },
    };
    expect(isDocumentHighlighted('', 'thesis', 'model-456', documentKey, focusedStageDocumentMap)).toBe(false);
    expect(isDocumentHighlighted('session-123', '', 'model-456', documentKey, focusedStageDocumentMap)).toBe(false);
    expect(isDocumentHighlighted('session-123', 'thesis', '', documentKey, focusedStageDocumentMap)).toBe(false);
  });

  it('should return false when `focusedStageDocumentMap` is `undefined` or `null`', () => {
    const sessionId = 'session-123';
    const stageSlug = 'thesis';
    const modelId = 'model-456';
    const documentKey = 'business_case';
    expect(isDocumentHighlighted(sessionId, stageSlug, modelId, documentKey, undefined)).toBe(false);
    expect(isDocumentHighlighted(sessionId, stageSlug, modelId, documentKey, null as unknown as Record<string, FocusedStageDocumentState | null>)).toBe(false);
  });

  it('should return false when `focusedStageDocumentMap[focusKey]` is `null`', () => {
    const sessionId = 'session-123';
    const stageSlug = 'thesis';
    const modelId = 'model-456';
    const documentKey = 'business_case';
    const focusKey = buildFocusedDocumentKey(sessionId, stageSlug, modelId);
    const focusedStageDocumentMap: Record<string, FocusedStageDocumentState | null> = {
      [focusKey]: null,
    };
    expect(isDocumentHighlighted(sessionId, stageSlug, modelId, documentKey, focusedStageDocumentMap)).toBe(false);
  });
});

