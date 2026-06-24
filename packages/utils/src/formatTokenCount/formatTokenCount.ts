import type {
    FormatTokenCountDeps,
    FormatTokenCountParams,
    FormatTokenCountPayload,
    FormatTokenCountReturn,
    FormatTokenCountSuccessReturn,
    FormatTokenCountErrorReturn,
} from './formatTokenCount.interface';
import { isFormatTokenCountPayload } from './formatTokenCount.guard';

export function formatTokenCount(
    _deps: FormatTokenCountDeps,
    _params: FormatTokenCountParams,
    payload: FormatTokenCountPayload,
): FormatTokenCountReturn {
    if (!isFormatTokenCountPayload(payload)) {
        const errorResult: FormatTokenCountErrorReturn = {
            error: {
                code: 'VALIDATION',
                message: 'tokenCount must be a finite non-negative number.',
            },
        };
        return errorResult;
    }

    const tokenCount: number = payload.tokenCount;
    let formatted: string;

    if (tokenCount >= 1_000_000_000) {
        formatted = `${(tokenCount / 1_000_000_000).toFixed(1)}B`;
    } else if (
        tokenCount >= 1_000_000 ||
        (tokenCount >= 1_000 &&
            parseFloat((tokenCount / 1_000_000).toFixed(1)) >= 1.0)
    ) {
        formatted = `${(tokenCount / 1_000_000).toFixed(1)}M`;
    } else if (tokenCount >= 1_000) {
        formatted = `${Math.round(tokenCount / 1_000)}K`;
    } else {
        formatted = new Intl.NumberFormat('en-US').format(tokenCount);
    }

    const success: FormatTokenCountSuccessReturn = {
        formatted,
    };
    return success;
}
