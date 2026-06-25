import type { ApiError } from '@paynless/types';

export interface FormatTokenCountDeps {}

export interface FormatTokenCountParams {}

export interface FormatTokenCountPayload {
    tokenCount: number;
}

export interface FormatTokenCountSuccessReturn {
    formatted: string;
}

export interface FormatTokenCountErrorReturn {
    error: Error | ApiError;
}

export type FormatTokenCountReturn =
    | FormatTokenCountSuccessReturn
    | FormatTokenCountErrorReturn;

export type FormatTokenCountFn = (
    deps: FormatTokenCountDeps,
    params: FormatTokenCountParams,
    payload: FormatTokenCountPayload,
) => FormatTokenCountReturn;
