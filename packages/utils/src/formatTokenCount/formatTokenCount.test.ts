import { describe, it, expect } from 'vitest';
import { formatTokenCount } from './formatTokenCount';
import {
    buildFormatTokenCountDeps,
    buildFormatTokenCountParams,
    buildFormatTokenCountPayload,
} from './formatTokenCount.mock';
import { isApiError } from '../type_guards';

describe('formatTokenCount', () => {
    it('formats 1_139_238 as 1.1M', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 1_139_238 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '1.1M' });
    });

    it('formats 39_015 as 39K', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 39_015 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '39K' });
    });

    it('formats 1_000_000_000 as 1.0B', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 1_000_000_000 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '1.0B' });
    });

    it('formats 999_999 as 1.0M', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 999_999 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '1.0M' });
    });

    it('formats 1_500 as 2K', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 1_500 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '2K' });
    });

    it('formats 1_000 as 1K', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 1_000 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '1K' });
    });

    it('formats 512 as 512', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 512 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '512' });
    });

    it('formats 0 as 0', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: 0 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(false);
        if ('error' in result) {
            return;
        }
        expect(result).toEqual({ formatted: '0' });
    });

    it('returns VALIDATION error when tokenCount is NaN', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: Number.NaN });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(true);
        if (!('error' in result)) {
            return;
        }
        expect(isApiError(result.error)).toBe(true);
        if (!isApiError(result.error)) {
            return;
        }
        expect(result.error).toEqual({
            code: 'VALIDATION',
            message: 'tokenCount must be a finite non-negative number.',
        });
    });

    it('returns VALIDATION error when tokenCount is negative', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({ tokenCount: -100 });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(true);
        if (!('error' in result)) {
            return;
        }
        expect(isApiError(result.error)).toBe(true);
        if (!isApiError(result.error)) {
            return;
        }
        expect(result.error).toEqual({
            code: 'VALIDATION',
            message: 'tokenCount must be a finite non-negative number.',
        });
    });

    it('returns VALIDATION error when tokenCount is Infinity', () => {
        const deps = buildFormatTokenCountDeps();
        const params = buildFormatTokenCountParams();
        const payload = buildFormatTokenCountPayload({
            tokenCount: Number.POSITIVE_INFINITY,
        });
        const result = formatTokenCount(deps, params, payload);
        expect('error' in result).toBe(true);
        if (!('error' in result)) {
            return;
        }
        expect(isApiError(result.error)).toBe(true);
        if (!isApiError(result.error)) {
            return;
        }
        expect(result.error).toEqual({
            code: 'VALIDATION',
            message: 'tokenCount must be a finite non-negative number.',
        });
    });
});
