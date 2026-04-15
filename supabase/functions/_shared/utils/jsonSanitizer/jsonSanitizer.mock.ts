import {
    JsonSanitizationResult,
    SanitizeJsonContentFn,
} from "./jsonSanitizer.interface.ts";

export function createMockSanitizeJsonContent(
    overrides?: Partial<JsonSanitizationResult>,
): SanitizeJsonContentFn {
    const mock: SanitizeJsonContentFn = (content: string): JsonSanitizationResult => {
        const defaults: JsonSanitizationResult = {
            sanitized: content,
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: content.length,
        };
        return { ...defaults, ...overrides };
    };
    return mock;
}
