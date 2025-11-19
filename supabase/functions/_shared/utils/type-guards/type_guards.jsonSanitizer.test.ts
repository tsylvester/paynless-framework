import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    isJsonSanitizationResult,
    isValidJsonString,
} from './type_guards.jsonSanitizer.ts';
import type { JsonSanitizationResult } from '../../types/jsonSanitizer.interface.ts';

// --- Mocks ---

const validJsonSanitizationResult: JsonSanitizationResult = {
    sanitized: '{"key": "value"}',
    wasSanitized: true,
    originalLength: 25,
};

const validJsonSanitizationResultNotSanitized: JsonSanitizationResult = {
    sanitized: '{"key": "value"}',
    wasSanitized: false,
    originalLength: 18,
};

Deno.test('Type Guard: isJsonSanitizationResult', async (t) => {
    await t.step('should return true for objects matching JsonSanitizationResult interface', () => {
        assert(isJsonSanitizationResult(validJsonSanitizationResult));
        assert(isJsonSanitizationResult(validJsonSanitizationResultNotSanitized));
    });

    await t.step('should return false for objects missing required properties', () => {
        // Test missing originalLength
        const missingOriginalLength = {
            sanitized: validJsonSanitizationResult.sanitized,
            wasSanitized: validJsonSanitizationResult.wasSanitized,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingOriginalLength));

        // Test missing wasSanitized
        const missingWasSanitized = {
            sanitized: validJsonSanitizationResult.sanitized,
            originalLength: validJsonSanitizationResult.originalLength,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingWasSanitized));

        // Test missing sanitized
        const missingSanitized = {
            wasSanitized: validJsonSanitizationResult.wasSanitized,
            originalLength: validJsonSanitizationResult.originalLength,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingSanitized));
    });

    await t.step('should return false for objects with incorrect types', () => {
        // sanitized is not string
        const invalidSanitizedType = {
            sanitized: 123,
            wasSanitized: true,
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidSanitizedType));

        // wasSanitized is not boolean
        const invalidWasSanitizedType = {
            sanitized: '{"key": "value"}',
            wasSanitized: 'true',
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidWasSanitizedType));

        // originalLength is not number
        const invalidOriginalLengthType = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            originalLength: '25',
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidOriginalLengthType));
    });

    await t.step('should return false for non-objects', () => {
        assert(!isJsonSanitizationResult(null));
        assert(!isJsonSanitizationResult('string'));
        assert(!isJsonSanitizationResult(123));
        assert(!isJsonSanitizationResult(true));
        assert(!isJsonSanitizationResult([]));
        assert(!isJsonSanitizationResult(undefined));
    });
});

Deno.test('Type Guard: isValidJsonString', async (t) => {
    await t.step('should return true for strings that can be parsed as JSON objects', () => {
        assert(isValidJsonString('{"key": "value"}'));
        assert(isValidJsonString('{}'));
        assert(isValidJsonString('{"nested": {"a": 1}}'));
    });

    await t.step('should return true for strings that can be parsed as JSON arrays', () => {
        assert(isValidJsonString('[1, 2, 3]'));
        assert(isValidJsonString('[]'));
        assert(isValidJsonString('[{"a": 1}, {"b": 2}]'));
    });

    await t.step('should return true for strings that can be parsed as JSON primitives', () => {
        assert(isValidJsonString('"string"'));
        assert(isValidJsonString('123'));
        assert(isValidJsonString('true'));
        assert(isValidJsonString('false'));
        assert(isValidJsonString('null'));
    });

    await t.step('should return false for strings with malformed syntax', () => {
        assert(!isValidJsonString('{"key": "value"'));
        assert(!isValidJsonString('{"key": value}'));
        assert(!isValidJsonString('{key: "value"}'));
        assert(!isValidJsonString('{"key": "value",}'));
    });

    await t.step('should return false for incomplete objects', () => {
        assert(!isValidJsonString('{"key":'));
        assert(!isValidJsonString('{"key": "value"'));
        assert(!isValidJsonString('{'));
    });

    await t.step('should return false for non-JSON content', () => {
        assert(!isValidJsonString('not json'));
        assert(!isValidJsonString(''));
        assert(!isValidJsonString('undefined'));
    });
});

