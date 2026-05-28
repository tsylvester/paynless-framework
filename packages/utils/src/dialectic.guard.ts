import { Json } from '@paynless/types';


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

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    // It's a plain object if its prototype is Object.prototype or it has no prototype (e.g., Object.create(null)).
    return proto === Object.prototype || proto === null;
}

export function isRecord(item: unknown): item is Record<PropertyKey, unknown> {
    return (item !== null && typeof item === 'object' && !Array.isArray(item));
} 