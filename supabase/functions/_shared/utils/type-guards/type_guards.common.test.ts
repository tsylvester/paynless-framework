import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    isJson, 
    isKeyOf,
    isPlainObject,
    isPostgrestError,
    isRecord, 
    isStringRecord 
} from "./type_guards.common.ts";

Deno.test('Type Guard: isJson', async (t) => {
    await t.step('should return true for primitive JSON types', () => {
        assert(isJson('a string'));
        assert(isJson(123.45));
        assert(isJson(true));
        assert(isJson(false));
        assert(isJson(null));
    });

    await t.step('should return true for valid JSON objects', () => {
        assert(isJson({}));
        assert(isJson({ key: 'value', number: 1, bool: true, nullable: null }));
        assert(isJson({ nested: { a: 1 } }));
    });

    await t.step('should return true for valid JSON arrays', () => {
        assert(isJson([]));
        assert(isJson([1, 'two', false, null]));
        assert(isJson([{ a: 1 }, { b: 2 }]));
        assert(isJson([1, [2, [3]]]));
    });

    await t.step('should return true for complex nested structures', () => {
        const complex = {
            a: 'string',
            b: [1, { c: true, d: [null] }],
            e: { f: { g: 'nested' } }
        };
        assert(isJson(complex));
    });

    await t.step('should return false for non-JSON primitives', () => {
        assert(!isJson(undefined));
        assert(!isJson(Symbol('s')));
        // deno-lint-ignore no-explicit-any
        assert(!isJson(BigInt(9007199254740991)));
    });

    await t.step('should return false for objects containing non-JSON values', () => {
        assert(isJson({ key: undefined }));
        assert(!isJson({ key: () => 'function' }));
        assert(!isJson({ key: new Date() }));
        assert(!isJson({ key: new Map() }));
    });

    await t.step('should return false for arrays containing non-JSON values', () => {
        assert(!isJson([1, undefined, 3]));
        assert(!isJson([new Set()]));
    });

    await t.step('should return false for class instances', () => {
        class MyClass {
            // deno-lint-ignore no-explicit-any
            constructor(public prop: any) {}
        }
        const instance = new MyClass('test');
        assert(!isJson(instance));
    });
});

Deno.test('Type Guard: isKeyOf', async (t) => {
    await t.step('should return true for a valid key', () => {
        assert(isKeyOf({ a: 1 }, 'a'));
    });
});

Deno.test('Type Guard: isPlainObject', async (t) => {
    await t.step('should return true for a plain object', () => {
        assert(isPlainObject({ a: 1 }));
    });
    await t.step('should return false for a non-object', () => {
        assert(!isPlainObject(null));
        assert(!isPlainObject('a string'));
        assert(!isPlainObject(['a', 'b']));
    });
});

Deno.test('Type Guard: isPostgrestError', async (t) => {
    await t.step('should return true for a valid postgrest error', () => {
        assert(isPostgrestError({ message: 'error', code: 'error', details: 'error', hint: 'error' }));
    });
    await t.step('should return false for a non-object', () => {
        assert(!isPostgrestError(null));
        assert(!isPostgrestError('a string'));
        assert(!isPostgrestError(['a', 'b']));
    });
});

Deno.test('Type Guard: isRecord', async (t) => {
    await t.step('should return true for a standard object', () => {
        assert(isRecord({ a: 1, b: 'test' }));
    });

    await t.step('should return true for an empty object', () => {
        assert(isRecord({}));
    });

    await t.step('should return false for null', () => {
        assert(!isRecord(null));
    });

    await t.step('should return false for an array', () => {
        assert(!isRecord([1, 2, 3]));
    });

    await t.step('should return false for a string', () => {
        assert(!isRecord('this is a string'));
    });

    await t.step('should return false for a number', () => {
        assert(!isRecord(123));
    });
});

Deno.test('Type Guard: isStringRecord', async (t) => {
    await t.step('should return true for a record with only string values', () => {
        const record = { key1: 'value1', key2: 'value2' };
        assert(isStringRecord(record));
    });

    await t.step('should return true for an empty record', () => {
        const record = {};
        assert(isStringRecord(record));
    });

    await t.step('should return false for a record with a non-string value', () => {
        const record = { key1: 'value1', key2: 123 };
        assert(!isStringRecord(record));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isStringRecord(null));
        assert(!isStringRecord('a string'));
        assert(!isStringRecord(['a', 'b']));
    });
});
