import type { AdapterStreamChunk } from '../../types.ts';
import { isRecord } from './type_guards.common.ts';
import { isFinishReason } from './type_guards.chat.ts';

export function isTextDeltaChunk(
    value: unknown,
): value is AdapterStreamChunk & { type: 'text_delta' } {
    if (!isRecord(value)) return false;
    if (value.type !== 'text_delta') return false;
    return typeof value.text === 'string';
}

export function isUsageChunk(
    value: unknown,
): value is AdapterStreamChunk & { type: 'usage' } {
    if (!isRecord(value)) return false;
    if (value.type !== 'usage') return false;
    if (!isRecord(value.tokenUsage)) return false;
    const u: Record<PropertyKey, unknown> = value.tokenUsage;
    return (
        typeof u.prompt_tokens === 'number' &&
        typeof u.completion_tokens === 'number' &&
        typeof u.total_tokens === 'number'
    );
}

export function isDoneChunk(
    value: unknown,
): value is AdapterStreamChunk & { type: 'done' } {
    if (!isRecord(value)) return false;
    if (value.type !== 'done') return false;
    return isFinishReason(value.finish_reason);
}

export function isAdapterStreamChunk(value: unknown): value is AdapterStreamChunk {
    if (!isRecord(value)) return false;
    if (typeof value.type !== 'string') return false;
    if (value.type === 'text_delta') {
        return isTextDeltaChunk(value);
    }
    if (value.type === 'usage') {
        return isUsageChunk(value);
    }
    if (value.type === 'done') {
        return isDoneChunk(value);
    }
    return false;
}
