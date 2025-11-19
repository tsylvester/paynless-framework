import { isRecord } from './type_guards.common.ts';
import type { JsonSanitizationResult } from '../../types/jsonSanitizer.interface.ts';

export function isJsonSanitizationResult(value: unknown): value is JsonSanitizationResult {
    if (!isRecord(value)) return false;

    if (!('sanitized' in value) || typeof value.sanitized !== 'string') {
        return false;
    }

    if (!('wasSanitized' in value) || typeof value.wasSanitized !== 'boolean') {
        return false;
    }

    if (!('originalLength' in value) || typeof value.originalLength !== 'number') {
        return false;
    }

    return true;
}

export function isValidJsonString(value: unknown): boolean {
    if (typeof value !== 'string') {
        return false;
    }

    try {
        JSON.parse(value);
        return true;
    } catch {
        return false;
    }
}

