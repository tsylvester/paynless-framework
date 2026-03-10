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
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
    originalLength: 25,
};

const validJsonSanitizationResultNotSanitized: JsonSanitizationResult = {
    sanitized: '{"key": "value"}',
    wasSanitized: false,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
    originalLength: 18,
};

Deno.test('Type Guard: isJsonSanitizationResult', async (t) => {
    await t.step('should return true for objects matching JsonSanitizationResult interface', () => {
        assert(isJsonSanitizationResult(validJsonSanitizationResult));
        assert(isJsonSanitizationResult(validJsonSanitizationResultNotSanitized));
    });

    await t.step('should return true for objects with detected duplicates', () => {
        const resultWithDuplicates: JsonSanitizationResult = {
            ...validJsonSanitizationResult,
            hasDuplicateKeys: true,
            duplicateKeysResolved: ['subsystems'],
        };
        assert(isJsonSanitizationResult(resultWithDuplicates));
    });

    await t.step('should return false for objects missing required properties', () => {
        // Test missing originalLength
        const missingOriginalLength: JsonSanitizationResult = {
            sanitized: validJsonSanitizationResult.sanitized,
            wasSanitized: validJsonSanitizationResult.wasSanitized,
            wasStructurallyFixed: validJsonSanitizationResult.wasStructurallyFixed,
            hasDuplicateKeys: validJsonSanitizationResult.hasDuplicateKeys,
            duplicateKeysResolved: validJsonSanitizationResult.duplicateKeysResolved,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingOriginalLength));

        // Test missing wasSanitized
        const missingWasSanitized: JsonSanitizationResult = {
            sanitized: validJsonSanitizationResult.sanitized,
            originalLength: validJsonSanitizationResult.originalLength,
            wasStructurallyFixed: validJsonSanitizationResult.wasStructurallyFixed,
            hasDuplicateKeys: validJsonSanitizationResult.hasDuplicateKeys,
            duplicateKeysResolved: validJsonSanitizationResult.duplicateKeysResolved,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingWasSanitized));

        // Test missing sanitized
        const missingSanitized: JsonSanitizationResult = {
            wasSanitized: validJsonSanitizationResult.wasSanitized,
            wasStructurallyFixed: validJsonSanitizationResult.wasStructurallyFixed,
            originalLength: validJsonSanitizationResult.originalLength,
            hasDuplicateKeys: validJsonSanitizationResult.hasDuplicateKeys,
            duplicateKeysResolved: validJsonSanitizationResult.duplicateKeysResolved,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingSanitized));

        // Test missing wasStructurallyFixed
        const missingWasStructurallyFixed: JsonSanitizationResult = {
            sanitized: validJsonSanitizationResult.sanitized,
            wasSanitized: validJsonSanitizationResult.wasSanitized,
            originalLength: validJsonSanitizationResult.originalLength,
            hasDuplicateKeys: validJsonSanitizationResult.hasDuplicateKeys,
            duplicateKeysResolved: validJsonSanitizationResult.duplicateKeysResolved,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingWasStructurallyFixed));

        // Test missing hasDuplicateKeys
        const missingHasDuplicateKeys: JsonSanitizationResult = {
            sanitized: validJsonSanitizationResult.sanitized,
            wasSanitized: validJsonSanitizationResult.wasSanitized,
            wasStructurallyFixed: validJsonSanitizationResult.wasStructurallyFixed,
            originalLength: validJsonSanitizationResult.originalLength,
            duplicateKeysResolved: validJsonSanitizationResult.duplicateKeysResolved,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingHasDuplicateKeys));

        // Test missing duplicateKeysResolved
        const missingDuplicateKeysResolved: JsonSanitizationResult = {
            sanitized: validJsonSanitizationResult.sanitized,
            wasSanitized: validJsonSanitizationResult.wasSanitized,
            wasStructurallyFixed: validJsonSanitizationResult.wasStructurallyFixed,
            originalLength: validJsonSanitizationResult.originalLength,
            hasDuplicateKeys: validJsonSanitizationResult.hasDuplicateKeys,
        } as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(missingDuplicateKeysResolved));
    });

    await t.step('should return false for objects with incorrect types', () => {
        // sanitized is not string
        const invalidSanitizedType: JsonSanitizationResult = {
            sanitized: 123,
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidSanitizedType));

        // wasSanitized is not boolean
        const invalidWasSanitizedType: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: 'true',
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidWasSanitizedType));

        // originalLength is not number
        const invalidOriginalLengthType: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: '25',
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidOriginalLengthType));

        // wasStructurallyFixed is not boolean
        const invalidWasStructurallyFixedType: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            wasStructurallyFixed: 'false',
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidWasStructurallyFixedType));

        // hasDuplicateKeys is not boolean
        const invalidHasDuplicateKeysType: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: 'false',
            duplicateKeysResolved: [],
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidHasDuplicateKeysType));

        // duplicateKeysResolved is not array
        const invalidDuplicateKeysResolvedType: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: '[]',
            originalLength: 25,
        } as unknown as JsonSanitizationResult;
        assert(!isJsonSanitizationResult(invalidDuplicateKeysResolvedType));
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
