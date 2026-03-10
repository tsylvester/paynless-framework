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

    if (!('wasStructurallyFixed' in value) || typeof value.wasStructurallyFixed !== 'boolean') {
        return false;
    }

    if (!('hasDuplicateKeys' in value) || typeof value.hasDuplicateKeys !== 'boolean') {
        return false;
    }

    if (!('duplicateKeysResolved' in value) || !Array.isArray(value.duplicateKeysResolved) || !value.duplicateKeysResolved.every((k: unknown) => typeof k === 'string')) {
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
