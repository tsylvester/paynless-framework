import { describe, it, expect } from 'vitest';
import {
    isFormatTokenCountPayload,
    isFormatTokenCountSuccessReturn,
    isFormatTokenCountErrorReturn,
} from './formatTokenCount.guard';
import { ApiError } from 'packages/types/src/api.types.js';

describe('isFormatTokenCountPayload', () => {
    it('returns true for tokenCount zero', () => {
        expect(isFormatTokenCountPayload({ tokenCount: 0 })).toBe(true);
    });

    it('returns true for tokenCount 39_015', () => {
        expect(isFormatTokenCountPayload({ tokenCount: 39_015 })).toBe(true);
    });

    it('returns true for tokenCount 1_139_238', () => {
        expect(isFormatTokenCountPayload({ tokenCount: 1_139_238 })).toBe(true);
    });

    it('returns false when tokenCount is NaN', () => {
        expect(isFormatTokenCountPayload({ tokenCount: Number.NaN })).toBe(false);
    });

    it('returns false when tokenCount is Infinity', () => {
        expect(
            isFormatTokenCountPayload({ tokenCount: Number.POSITIVE_INFINITY }),
        ).toBe(false);
    });

    it('returns false when tokenCount is negative', () => {
        expect(isFormatTokenCountPayload({ tokenCount: -1 })).toBe(false);
    });

    it('returns false when tokenCount is not a number', () => {
        expect(
            isFormatTokenCountPayload({
                tokenCount: 'not-a-number',
            }),
        ).toBe(false);
    });

    it('returns false when tokenCount is missing', () => {
        expect(isFormatTokenCountPayload({})).toBe(false);
    });

    it('returns false for null', () => {
        expect(isFormatTokenCountPayload(null)).toBe(false);
    });
});

describe('isFormatTokenCountSuccessReturn', () => {
    it('returns true for a valid formatted success object', () => {
        expect(
            isFormatTokenCountSuccessReturn({
                formatted: '1.1M',
            }),
        ).toBe(true);
    });

    it('returns false when formatted is missing', () => {
        expect(isFormatTokenCountSuccessReturn({})).toBe(false);
    });

    it('returns false when formatted is not a string', () => {
        expect(
            isFormatTokenCountSuccessReturn({
                formatted: 123,
            }),
        ).toBe(false);
    });

    it('returns false for null', () => {
        expect(isFormatTokenCountSuccessReturn(null)).toBe(false);
    });
});

describe('isFormatTokenCountErrorReturn', () => {
    it('returns true for an error wrapper with a valid ApiError shape', () => {
        const apiError: ApiError = {
            code: 'VALIDATION',
            message: 'tokenCount must be a finite non-negative number.',
        };
        expect(
            isFormatTokenCountErrorReturn({
                error: apiError,
            }),
        ).toBe(true);
    });

    it('returns true when error is a standard Error instance', () => {
        const standardError: Error = new Error('unexpected failure');
        expect(
            isFormatTokenCountErrorReturn({
                error: standardError,
            }),
        ).toBe(true);
    });

    it('returns false when error is missing', () => {
        expect(isFormatTokenCountErrorReturn({})).toBe(false);
    });

    it('returns false when error fails ApiError validation', () => {
        expect(
            isFormatTokenCountErrorReturn({
                error: {
                    code: 123,
                    message: 'tokenCount must be a finite non-negative number.',
                },
            }),
        ).toBe(false);
    });

    it('returns false for null', () => {
        expect(isFormatTokenCountErrorReturn(null)).toBe(false);
    });
});
