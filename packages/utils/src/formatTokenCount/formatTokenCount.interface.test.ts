import { describe, it, expect } from 'vitest';
import type {
    FormatTokenCountDeps,
    FormatTokenCountParams,
    FormatTokenCountPayload,
    FormatTokenCountSuccessReturn,
    FormatTokenCountErrorReturn,
    FormatTokenCountReturn,
    FormatTokenCountFn,
} from './formatTokenCount.interface';
import { ApiError } from 'packages/types/src/api.types.js';

describe('formatTokenCount.interface contract', () => {
    it('FormatTokenCountPayload accepts tokenCount zero', () => {
        const payload: FormatTokenCountPayload = {
            tokenCount: 0,
        };
        expect(payload.tokenCount).toBe(0);
    });

    it('FormatTokenCountPayload accepts a large tokenCount', () => {
        const payload: FormatTokenCountPayload = {
            tokenCount: 1_139_238,
        };
        expect(payload.tokenCount).toBe(1_139_238);
    });

    it('FormatTokenCountSuccessReturn accepts a formatted abbreviation string', () => {
        const success: FormatTokenCountSuccessReturn = {
            formatted: '1.1M',
        };
        expect(success.formatted).toBe('1.1M');
    });

    it('FormatTokenCountErrorReturn accepts an error wrapper with VALIDATION code', () => {
        const apiError: ApiError = {
            code: 'VALIDATION',
            message: 'tokenCount must be a finite non-negative number.',
        };
        const errorReturn: FormatTokenCountErrorReturn = {
            error: apiError,
        };
        expect(errorReturn.error).toBe(apiError);
        expect(apiError.code).toBe('VALIDATION');
    });

    it('FormatTokenCountErrorReturn accepts a standard Error instance', () => {
        const standardError: Error = new Error('unexpected failure');
        const errorReturn: FormatTokenCountErrorReturn = {
            error: standardError,
        };
        expect(errorReturn.error).toBe(standardError);
        expect(standardError.message).toBe('unexpected failure');
    });

    it('FormatTokenCountFn accepts deps, params, payload and returns FormatTokenCountReturn', () => {
        const fn: FormatTokenCountFn = (
            deps: FormatTokenCountDeps,
            params: FormatTokenCountParams,
            payload: FormatTokenCountPayload,
        ) => {
            void deps;
            void params;
            void payload;
            const success: FormatTokenCountSuccessReturn = {
                formatted: '1.1M',
            };
            return success;
        };
        const deps: FormatTokenCountDeps = {};
        const params: FormatTokenCountParams = {};
        const payload: FormatTokenCountPayload = {
            tokenCount: 1_139_238,
        };
        const result: FormatTokenCountReturn = fn(deps, params, payload);
        expect(result).toBeDefined();
    });
});
