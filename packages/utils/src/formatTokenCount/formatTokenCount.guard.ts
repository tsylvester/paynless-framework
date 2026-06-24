import type {
    FormatTokenCountPayload,
    FormatTokenCountSuccessReturn,
    FormatTokenCountErrorReturn,
} from './formatTokenCount.interface';
import { isRecord } from '../dialectic.guard';
import { isApiError } from '../type_guards';

export function isFormatTokenCountPayload(
    value: unknown,
): value is FormatTokenCountPayload {
    if (!isRecord(value)) {
        return false;
    }
    const tokenCount: unknown = value['tokenCount'];
    if (typeof tokenCount !== 'number' || !Number.isFinite(tokenCount)) {
        return false;
    }
    if (tokenCount < 0) {
        return false;
    }
    return true;
}

export function isFormatTokenCountSuccessReturn(
    value: unknown,
): value is FormatTokenCountSuccessReturn {
    if (!isRecord(value)) {
        return false;
    }
    const formatted: unknown = value['formatted'];
    if (typeof formatted !== 'string') {
        return false;
    }
    return true;
}

export function isFormatTokenCountErrorReturn(
    value: unknown,
): value is FormatTokenCountErrorReturn {
    if (!isRecord(value)) {
        return false;
    }
    const error: unknown = value['error'];
    return isApiError(error) || error instanceof Error;
}
