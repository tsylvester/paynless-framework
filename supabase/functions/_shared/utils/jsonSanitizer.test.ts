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
            originalLength: originalLength,
        };

        assertEquals(result.sanitized, expected.sanitized);
        assertEquals(result.wasSanitized, expected.wasSanitized);
        assertEquals(result.originalLength, expected.originalLength);
    });

    await t.step('should trim whitespace-only changes and mark as sanitized', () => {
        const rawContent = '  {"key": "value"}  ';
        const originalLength = rawContent.length;

        const result: JsonSanitizationResult = sanitizeJsonContent(rawContent);

        const expected: JsonSanitizationResult = {
            sanitized: '{"key": "value"}',
            wasSanitized: true,
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
            originalLength: originalLength2,
        };

        assertEquals(result2.sanitized, expected2.sanitized);
        assertEquals(result2.wasSanitized, expected2.wasSanitized);
        assertEquals(result2.originalLength, expected2.originalLength);
    });
});

