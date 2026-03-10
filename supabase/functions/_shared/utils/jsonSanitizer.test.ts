import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sanitizeJsonContent } from './jsonSanitizer.ts';
import type { JsonSanitizationResult } from '../types/jsonSanitizer.interface.ts';

Deno.test('sanitizeJsonContent', async (t) => {
    await t.step('should pass through valid JSON without sanitization', () => {
        const rawContent = '{"key": "value"}';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
        assertEquals(result.hasDuplicateKeys, expected.hasDuplicateKeys);
        assertEquals(result.duplicateKeysResolved, expected.duplicateKeysResolved);
    });

    await t.step('should trim whitespace-only changes and mark as sanitized', () => {
        const rawContent = '  {"key": "value"}  ';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should remove surrounding single quotes', () => {
        const rawContent = '\'{"key": "value"}\'';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should remove surrounding double quotes when not JSON', () => {
        const rawContent = '"{"key": "value"}"';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should preserve double quotes when JSON starts with object', () => {
        const rawContent = '{"key": "value"}';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
    });

    await t.step('should remove triple backticks with json language tag', () => {
        const rawContent = '```json\n{"key": "value"}\n```';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should remove triple backticks without language tag', () => {
        const rawContent = '```\n{"key": "value"}\n```';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
    });

    await t.step('should trim leading and trailing whitespace', () => {
        const rawContent = '  \n  {"key": "value"}  \n  ';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
    });

    await t.step('should handle nested wrapper patterns', () => {
        const rawContent = '\'```json\n{"key": "value"}\n```\'';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
    });

    await t.step('should preserve valid JSON array content', () => {
        const rawContent = '\'[{"key": "value"}]\'';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '[{"key": "value"}]',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
        assert(Array.isArray(JSON.parse(result.sanitized)));
    });

    await t.step('should handle empty JSON objects and arrays', () => {
        const rawContent1 = '\'{}\'';
        const originalLength1 = rawContent1.length;

        const result1: JsonSanitizationResult = sanitizeJsonContent(rawContent1);

        const expected1: JsonSanitizationResult = {
            sanitized: '{}',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength1,
        };

        assertEquals(result1.sanitized, expected1.sanitized);
        assertEquals(result1.wasSanitized, expected1.wasSanitized);
        assertEquals(result1.originalLength, expected1.originalLength);

        const rawContent2 = '\'[]\'';
        const originalLength2 = rawContent2.length;

        const result2: JsonSanitizationResult = sanitizeJsonContent(rawContent2);

        const expected2: JsonSanitizationResult = {
            sanitized: '[]',
            wasSanitized: true,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength2,
        };

        assertEquals(result2.sanitized, expected2.sanitized);
        assertEquals(result2.wasSanitized, expected2.wasSanitized);
        assertEquals(result2.originalLength, expected2.originalLength);
    });

    await t.step('should fix missing opening brace for object', () => {
        const rawContent = '"system_materials": {"key": "value"}';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"system_materials": {"key": "value"}}',
            wasSanitized: true,
            wasStructurallyFixed: true,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.wasStructurallyFixed, expected.wasStructurallyFixed);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should fix missing closing brace for object', () => {
        const rawContent = '{"key": "value"';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
            wasStructurallyFixed: true,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.wasStructurallyFixed, expected.wasStructurallyFixed);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should fix missing opening bracket for array', () => {
        const rawContent = '"item1", "item2"]';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '["item1", "item2"]',
            wasSanitized: true,
            wasStructurallyFixed: true,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.wasStructurallyFixed, expected.wasStructurallyFixed);
        assertEquals(result.originalLength, expected.originalLength);
        assert(Array.isArray(JSON.parse(result.sanitized)));
    });

    await t.step('should fix missing closing bracket for array', () => {
        const rawContent = '["item1", "item2"';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '["item1", "item2"]',
            wasSanitized: true,
            wasStructurallyFixed: true,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.wasStructurallyFixed, expected.wasStructurallyFixed);
        assertEquals(result.originalLength, expected.originalLength);
        assert(Array.isArray(JSON.parse(result.sanitized)));
    });

    await t.step('should fix missing opening brace after wrapper removal', () => {
        const rawContent = '\'"system_materials": {"key": "value"}\'';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"system_materials": {"key": "value"}}',
            wasSanitized: true,
            wasStructurallyFixed: true,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.wasStructurallyFixed, expected.wasStructurallyFixed);
        assertEquals(result.originalLength, expected.originalLength);
        assert(JSON.parse(result.sanitized));
    });

    await t.step('should not fix content that cannot be fixed by adding single brace', () => {
        const rawContent = '{"key": "value" "another": "value"}';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        // Should not be structurally fixed since adding a single brace won't make it valid
        assertEquals(result.wasStructurallyFixed, false);
        // Should still attempt wrapper sanitization
        assertEquals(result.wasSanitized, false);
    });

    await t.step('should resolve duplicate keys: array first, then empty array', () => {
        // Original failing case from Gemini
        const rawContent = `
        {
            "subsystems": ["one", "two"],
            "other": "value",
            "subsystems": []
        }`;
        const originalLength = rawContent.length;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        // Should keep the content array
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.subsystems, ["one", "two"]);
        assertEquals(parsed.other, "value");
        assertEquals(result.hasDuplicateKeys, true);
        assert(result.duplicateKeysResolved.includes("subsystems"));
    });

    await t.step('should resolve duplicate keys: empty string first, then content string', () => {
        const rawContent = `
        {
            "key": "",
            "key": "content"
        }`;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.key, "content");
        assertEquals(result.hasDuplicateKeys, true);
        assert(result.duplicateKeysResolved.includes("key"));
    });

    await t.step('should resolve duplicate keys: empty object first, then populated object', () => {
        const rawContent = `
        {
            "obj": {},
            "obj": {"a": 1}
        }`;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.obj, { a: 1 });
        assertEquals(result.hasDuplicateKeys, true);
    });

    await t.step('should deep merge duplicate populated objects', () => {
        const rawContent = `
        {
            "obj": {"a": 1, "b": 2},
            "obj": {"b": 3, "c": 4}
        }`;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        // Should have merged keys, second value wins for conflict
        assertEquals(parsed.obj.a, 1);
        assertEquals(parsed.obj.b, 2);
        assertEquals(parsed.obj.c, 4);
        assertEquals(result.hasDuplicateKeys, true);
    });

    await t.step('should concatenate duplicate populated arrays', () => {
        const rawContent = `
        {
            "arr": [1, 2],
            "arr": [3, 4]
        }`;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.arr, [1, 2, 3, 4]);
        assertEquals(result.hasDuplicateKeys, true);
    });

    await t.step('should keep first value for duplicate primitives', () => {
        const rawContent = `
        {
            "prim": "first",
            "prim": "second"
        }`;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.prim, "first");
        assertEquals(result.hasDuplicateKeys, true);
    });

    await t.step('should handle deeply nested duplicate keys', () => {
        const rawContent = `
        {
            "level1": {
                "level2": {
                    "dup": "val1",
                    "dup": ""
                }
            }
        }`;
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.level1.level2.dup, "val1");
        assertEquals(result.hasDuplicateKeys, true);
    });

    await t.step('should be fail-safe on unparseable JSON', () => {
        const rawContent = '{"broken": json}';
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        // Should return original content (wrapped in sanitization result)
        // Deduplication fails gracefully, then normal structural fix fails
        assertEquals(result.sanitized, rawContent);
        assertEquals(result.hasDuplicateKeys, false);
    });

    await t.step('should handle JSON wrapped in backticks with duplicate keys', () => {
        const rawContent = '```json\n{"key": "val1", "key": ""}\n```';
        
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);
        
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.key, "val1");
        assertEquals(result.wasSanitized, true);
        assertEquals(result.hasDuplicateKeys, true);
    });
});
