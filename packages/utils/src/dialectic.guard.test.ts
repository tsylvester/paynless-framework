import { describe, it, expect } from 'vitest';
import { isJson, isPlainObject, isRecord } from './dialectic.guard';

describe('isJson', () => {
    it('returns true for primitive JSON types', () => {
        expect(isJson('a string')).toBe(true);
        expect(isJson(123.45)).toBe(true);
        expect(isJson(true)).toBe(true);
        expect(isJson(false)).toBe(true);
        expect(isJson(null)).toBe(true);
    });

    it('returns true for valid JSON objects', () => {
        expect(isJson({})).toBe(true);
        expect(isJson({ key: 'value', number: 1, bool: true, nullable: null })).toBe(true);
        expect(isJson({ nested: { a: 1 } })).toBe(true);
    });

    it('returns true for valid JSON arrays', () => {
        expect(isJson([])).toBe(true);
        expect(isJson([1, 'two', false, null])).toBe(true);
        expect(isJson([{ a: 1 }, { b: 2 }])).toBe(true);
        expect(isJson([1, [2, [3]]])).toBe(true);
    });

    it('returns true for complex nested structures', () => {
        const complex = {
            a: 'string',
            b: [1, { c: true, d: [null] }],
            e: { f: { g: 'nested' } },
        };
        expect(isJson(complex)).toBe(true);
    });

    it('returns false for non-JSON primitives', () => {
        expect(isJson(undefined)).toBe(false);
        expect(isJson(Symbol('s'))).toBe(false);
        expect(isJson(BigInt(9007199254740991))).toBe(false);
    });

    it('returns false for objects containing non-JSON values', () => {
        expect(isJson({ key: undefined })).toBe(true);
        expect(isJson({ key: () => 'function' })).toBe(false);
        expect(isJson({ key: new Date() })).toBe(false);
        expect(isJson({ key: new Map() })).toBe(false);
    });

    it('returns false for arrays containing non-JSON values', () => {
        expect(isJson([1, undefined, 3])).toBe(false);
        expect(isJson([new Set()])).toBe(false);
    });

    it('returns false for class instances', () => {
        class MyClass {
            constructor(public prop: string) {}
        }
        const instance = new MyClass('test');
        expect(isJson(instance)).toBe(false);
    });
});

describe('isPlainObject', () => {
    it('returns true for a plain object', () => {
        expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('returns false for a non-object', () => {
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject('a string')).toBe(false);
        expect(isPlainObject(['a', 'b'])).toBe(false);
    });
});

describe('isRecord', () => {
    it('returns true for a standard object', () => {
        expect(isRecord({ a: 1, b: 'test' })).toBe(true);
    });

    it('returns true for an empty object', () => {
        expect(isRecord({})).toBe(true);
    });

    it('returns false for null', () => {
        expect(isRecord(null)).toBe(false);
    });

    it('returns false for an array', () => {
        expect(isRecord([1, 2, 3])).toBe(false);
    });

    it('returns false for a string', () => {
        expect(isRecord('this is a string')).toBe(false);
    });

    it('returns false for a number', () => {
        expect(isRecord(123)).toBe(false);
    });
});
