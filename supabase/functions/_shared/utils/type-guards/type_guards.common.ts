// supabase/functions/_shared/utils/type_guards.ts
import type { Json } from "../../../types_db.ts";
import type { PostgrestError } from "npm:@supabase/supabase-js@2";
import type { ILogger } from "../../types.ts";

export function isJson(value: unknown, isObjectProperty = false): value is Json {
    const typeOfValue = typeof value;

    if (typeOfValue === 'undefined') {
        return isObjectProperty;
    }

    if (value === null || typeOfValue === 'boolean' || typeOfValue === 'number' || typeOfValue === 'string') {
        return true;
    }

    if (typeOfValue === 'object') {
        if (Array.isArray(value)) {
            return value.every((item) => isJson(item, false));
        }
        
        if (isPlainObject(value)) {
            return Object.values(value).every((v) => isJson(v, true));
        }
    }

    return false;
}

export function isKeyOf<T extends object>(obj: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    // It's a plain object if its prototype is Object.prototype or it has no prototype (e.g., Object.create(null)).
    return proto === Object.prototype || proto === null;
}

export function isPostgrestError(error: unknown): error is PostgrestError {
    if (!isRecord(error)) {
        return false;
    }

    return (
        'message' in error && typeof error.message === 'string' &&
        'code' in error && typeof error.code === 'string' &&
        'details' in error && typeof error.details === 'string' &&
        'hint' in error && typeof error.hint === 'string'
    );
}

export function isRecord(item: unknown): item is Record<PropertyKey, unknown> {
    return (item !== null && typeof item === 'object' && !Array.isArray(item));
} 

export function isStringRecord(obj: unknown): obj is Record<string, string> {
    if (!isRecord(obj)) return false;
    return Object.values(obj).every(value => typeof value === 'string');
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value !== "";
}

export function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isLoggerShape(value: unknown): value is ILogger {
    if (!isRecord(value)) {
        return false;
    }
    return (
        typeof value.debug === "function" &&
        typeof value.info === "function" &&
        typeof value.warn === "function" &&
        typeof value.error === "function"
    );
}

export function isSupabaseClientShape(value: unknown): value is { from: (table: string) => unknown } {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.from === "function";
}

