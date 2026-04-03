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

    // --- Stream truncation repair tests ---
    // These test the sanitizer's ability to repair JSON truncated at arbitrary
    // points during streaming, as happens when a network error, model crash,
    // or timeout interrupts an API response mid-stream.

    await t.step('stream truncation: should close unclosed string value and containers', () => {
        // Stream cut inside a string value — most common truncation point
        const rawContent = '{"executive_summary":"The project aims to deliver';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.executive_summary, "The project aims to deliver");
    });

    await t.step('stream truncation: should remove partial key and close containers', () => {
        // Stream cut inside a key name — partial key must be removed, not guessed
        const rawContent = '{"complete_key":"value","partial_ke';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.complete_key, "value");
        assertEquals(parsed.partial_ke, undefined);
    });

    await t.step('stream truncation: should remove trailing comma and close containers', () => {
        // Stream cut right after a comma — trailing comma is invalid JSON
        const rawContent = '{"key":"value",';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.key, "value");
    });

    await t.step('stream truncation: should remove key with no value (truncated after colon)', () => {
        // Stream cut right after a colon — we do not know what value was intended
        const rawContent = '{"complete":"done","missing_value":';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.complete, "done");
        assertEquals(parsed.missing_value, undefined);
    });

    await t.step('stream truncation: should close multiple unclosed containers at any depth', () => {
        // Stream cut deep inside nested objects — all open containers must be closed
        const rawContent = '{"level1":{"level2":{"level3":"deep_value"';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.level1.level2.level3, "deep_value");
    });

    await t.step('stream truncation: should remove key with truncated keyword value', () => {
        // Stream cut mid-boolean/null literal — we do not pretend to know the value
        const rawContent = '{"complete":"done","flag":tru';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.complete, "done");
        assertEquals(parsed.flag, undefined);
    });

    await t.step('stream truncation: should handle dangling escape sequence in string value', () => {
        // Stream cut mid-escape sequence — backslash must be resolved
        const rawContent = '{"key":"value with \\';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        // Key should be present with the string closed (escape resolved)
        assert(typeof parsed.key === "string");
    });

    await t.step('stream truncation: should remove key with truncated array containing partial string', () => {
        // Stream cut inside a string inside an array — remove the key entirely
        const rawContent = '{"complete":"done","items":["partial';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.complete, "done");
        assertEquals(parsed.items, undefined);
    });

    await t.step('stream truncation: unclosed string + unclosed object combined', () => {
        // The exact case from the integration test mixed chain
        const rawContent = '{"executive_summary":"Started the analysis';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.executive_summary, "Started the analysis");
    });

    await t.step('stream truncation: multiple complete keys before truncation are preserved', () => {
        // Verify that repair preserves all complete key-value pairs
        const rawContent = '{"a":"alpha","b":"beta","c":"gamm';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.a, "alpha");
        assertEquals(parsed.b, "beta");
        // "c" may be present with truncated value or absent — either is acceptable
        // as long as the result is valid JSON with a and b preserved
    });

    await t.step('stream truncation: nested object with unclosed string at leaf', () => {
        const rawContent = '{"outer":{"inner":"partial value';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.outer.inner, "partial value");
    });

    await t.step('stream truncation: array of objects truncated mid-object', () => {
        const rawContent = '{"items":[{"name":"first"},{"name":"seco';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        // First complete array element must survive
        assert(Array.isArray(parsed.items));
        assertEquals(parsed.items[0].name, "first");
    });

    await t.step('stream truncation: truncated number value should preserve key', () => {
        // Numbers are valid as-is when the only issue is missing containers
        const rawContent = '{"score":3.1';
        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        assertEquals(result.wasStructurallyFixed, true);
        assertEquals(result.wasSanitized, true);
        const parsed = JSON.parse(result.sanitized);
        assertEquals(parsed.score, 3.1);
    });
});
