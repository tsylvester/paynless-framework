import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
    JsonSanitizationResult,
    SanitizeJsonContentFn,
} from "./jsonSanitizer.interface.ts";

Deno.test(
    "Contract: JsonSanitizationResult carries all six fields with expected runtime types",
    () => {
        const result: JsonSanitizationResult = {
            sanitized: "{}",
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: 2,
        };
        assertEquals(typeof result.sanitized, "string");
        assertEquals(typeof result.wasSanitized, "boolean");
        assertEquals(typeof result.wasStructurallyFixed, "boolean");
        assertEquals(typeof result.hasDuplicateKeys, "boolean");
        assertEquals(Array.isArray(result.duplicateKeysResolved), true);
        assertEquals(typeof result.originalLength, "number");
    },
);

Deno.test(
    "Contract: SanitizeJsonContentFn accepts a function from string to JsonSanitizationResult",
    () => {
        const sanitize: SanitizeJsonContentFn = (
            content: string,
        ): JsonSanitizationResult => ({
            sanitized: content,
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: content.length,
        });
        const out: JsonSanitizationResult = sanitize("{}");
        assertEquals(out.sanitized, "{}");
        assertEquals(out.originalLength, 2);
    },
);
