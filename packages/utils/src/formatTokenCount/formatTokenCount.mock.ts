import { vi, type Mock } from 'vitest';
import type { ApiError } from '@paynless/types';
import type {
    FormatTokenCountDeps,
    FormatTokenCountParams,
    FormatTokenCountPayload,
    FormatTokenCountSuccessReturn,
    FormatTokenCountErrorReturn,
    FormatTokenCountReturn,
    FormatTokenCountFn,
} from './formatTokenCount.interface';

export type FormatTokenCountDepsOverrides = {
    [K in keyof FormatTokenCountDeps]?: FormatTokenCountDeps[K] | null;
};

export type FormatTokenCountParamsOverrides = {
    [K in keyof FormatTokenCountParams]?: FormatTokenCountParams[K] | null;
};

export type FormatTokenCountPayloadOverrides = {
    [K in keyof FormatTokenCountPayload]?: FormatTokenCountPayload[K] | null;
};

export type FormatTokenCountSuccessReturnOverrides = {
    [K in keyof FormatTokenCountSuccessReturn]?: FormatTokenCountSuccessReturn[K] | null;
};

export type FormatTokenCountErrorReturnOverrides = {
    [K in keyof FormatTokenCountErrorReturn]?: FormatTokenCountErrorReturn[K] | null;
};

export interface CreateMockFormatTokenCountFnOptions {
    returnValue?: FormatTokenCountReturn;
}

export function buildFormatTokenCountDeps(
    overrides?: FormatTokenCountDepsOverrides,
): FormatTokenCountDeps {
    void overrides;
    const deps: FormatTokenCountDeps = {};
    return deps;
}

export function buildFormatTokenCountParams(
    overrides?: FormatTokenCountParamsOverrides,
): FormatTokenCountParams {
    void overrides;
    const params: FormatTokenCountParams = {};
    return params;
}

export function buildFormatTokenCountPayload(
    overrides?: FormatTokenCountPayloadOverrides,
): FormatTokenCountPayload {
    const base: FormatTokenCountPayload = {
        tokenCount: 1_139_238,
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        tokenCount:
            overrides.tokenCount !== undefined && overrides.tokenCount !== null
                ? overrides.tokenCount
                : base.tokenCount,
    };
}

export function buildFormatTokenCountSuccessReturn(
    overrides?: FormatTokenCountSuccessReturnOverrides,
): FormatTokenCountSuccessReturn {
    const base: FormatTokenCountSuccessReturn = {
        formatted: '1.1M',
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        formatted:
            overrides.formatted !== undefined && overrides.formatted !== null
                ? overrides.formatted
                : base.formatted,
    };
}

export function buildFormatTokenCountErrorReturn(
    overrides?: FormatTokenCountErrorReturnOverrides,
): FormatTokenCountErrorReturn {
    const defaultError: ApiError = {
        code: 'VALIDATION',
        message: 'tokenCount must be a finite non-negative number.',
    };
    const base: FormatTokenCountErrorReturn = {
        error: defaultError,
    };
    if (overrides === undefined) {
        return base;
    }
    return {
        error:
            overrides.error !== undefined && overrides.error !== null
                ? overrides.error
                : base.error,
    };
}

export function createMockFormatTokenCountFn(
    options?: CreateMockFormatTokenCountFnOptions,
): Mock<
    [
        deps: FormatTokenCountDeps,
        params: FormatTokenCountParams,
        payload: FormatTokenCountPayload,
    ],
    FormatTokenCountReturn
> {
    const returnValue: FormatTokenCountReturn =
        options?.returnValue ?? buildFormatTokenCountSuccessReturn();
    const fn: FormatTokenCountFn = (
        _deps: FormatTokenCountDeps,
        _params: FormatTokenCountParams,
        _payload: FormatTokenCountPayload,
    ): FormatTokenCountReturn => {
        return returnValue;
    };
    return vi.fn(fn);
}
