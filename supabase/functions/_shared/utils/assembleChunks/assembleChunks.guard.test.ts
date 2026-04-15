import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMockSanitizeJsonContent } from "../jsonSanitizer/jsonSanitizer.mock.ts";
import { SanitizeJsonContentFn } from "../jsonSanitizer/jsonSanitizer.interface.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";
import { AssembleChunksDeps } from "./assembleChunks.interface.ts";
import { isAssembleChunksDeps } from "./assembleChunks.interface.guards.ts";
import { createMockAssembleChunksDeps } from "./assembleChunks.mock.ts";

Deno.test(
    "Type Guard: isAssembleChunksDeps returns true for mock deps with SanitizeJsonContentFn sanitizeJsonContent",
    () => {
        const deps: AssembleChunksDeps = createMockAssembleChunksDeps();
        assertEquals(isAssembleChunksDeps(deps), true);
        if (isAssembleChunksDeps(deps)) {
            const sanitizeJsonContent: SanitizeJsonContentFn =
                deps.sanitizeJsonContent;
            const out = sanitizeJsonContent("{}");
            assertEquals(typeof out.sanitized, "string");
        }
    },
);

Deno.test(
    "Type Guard: isAssembleChunksDeps returns false when sanitizeJsonContent is absent",
    () => {
        const value: { isRecord: typeof isRecord } = { isRecord };
        assertEquals(isAssembleChunksDeps(value), false);
    },
);

Deno.test(
    "Type Guard: isAssembleChunksDeps returns false when isRecord is absent",
    () => {
        const value: { sanitizeJsonContent: SanitizeJsonContentFn } = {
            sanitizeJsonContent: createMockSanitizeJsonContent(),
        };
        assertEquals(isAssembleChunksDeps(value), false);
    },
);

Deno.test(
    "Type Guard: isAssembleChunksDeps returns false when sanitizeJsonContent is not a function",
    () => {
        const value: {
            sanitizeJsonContent: string;
            isRecord: typeof isRecord;
        } = {
            sanitizeJsonContent: "not-a-function",
            isRecord,
        };
        assertEquals(isAssembleChunksDeps(value), false);
    },
);

Deno.test(
    "Type Guard: isAssembleChunksDeps returns false for null and non-record roots",
    () => {
        assertEquals(isAssembleChunksDeps(null), false);
        assertEquals(isAssembleChunksDeps(0), false);
        assertEquals(isAssembleChunksDeps([]), false);
    },
);
