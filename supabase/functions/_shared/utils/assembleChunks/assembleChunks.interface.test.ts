import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SanitizeJsonContentFn } from "../jsonSanitizer/jsonSanitizer.interface.ts";
import {
    AssembleChunksDeps,
    AssembleChunksError,
    AssembleChunksFailedAtStep,
    AssembleChunksParams,
    AssembleChunksPayload,
    AssembleChunksReturn,
    AssembleChunksSuccess,
} from "./assembleChunks.interface.ts";
import { createMockAssembleChunksDeps } from "./assembleChunks.mock.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";

Deno.test(
    "Contract: valid AssembleChunksDeps uses SanitizeJsonContentFn-shaped sanitizeJsonContent — both functions present",
    () => {
        const deps: AssembleChunksDeps = createMockAssembleChunksDeps();
        const sanitizeJsonContent: SanitizeJsonContentFn = deps.sanitizeJsonContent;
        assertEquals("sanitizeJsonContent" in deps, true);
        assertEquals("isRecord" in deps, true);
        assertEquals(typeof deps.sanitizeJsonContent, "function");
        assertEquals(typeof deps.isRecord, "function");
        const sample = sanitizeJsonContent("{}");
        assertEquals(typeof sample.sanitized, "string");
    },
);

Deno.test(
    "Contract: object lacking sanitizeJsonContent is structurally incomplete for AssembleChunksDeps",
    () => {
        const incomplete: { isRecord: typeof isRecord } = { isRecord };
        assertEquals("sanitizeJsonContent" in incomplete, false);
    },
);

Deno.test(
    "Contract: sanitizeJsonContent that is not a function is wrong shape for AssembleChunksDeps",
    () => {
        const wrongShape: {
            sanitizeJsonContent: string;
            isRecord: typeof isRecord;
        } = {
            sanitizeJsonContent: "not-a-function",
            isRecord,
        };
        assertEquals(typeof wrongShape.sanitizeJsonContent === "function", false);
    },
);

Deno.test(
    "Contract: AssembleChunksPayload.chunks is string[] — not optional, not nullable",
    async (t) => {
        await t.step("chunks present, array of strings, not null", () => {
            const payload: AssembleChunksPayload = { chunks: ["a", "b"] };
            assertEquals("chunks" in payload, true);
            assertEquals(payload.chunks === null, false);
            assertEquals(Array.isArray(payload.chunks), true);
            assertEquals(typeof payload.chunks[0], "string");
            assertEquals(typeof payload.chunks[1], "string");
        });

        await t.step("empty string[] remains string[]", () => {
            const payload: AssembleChunksPayload = { chunks: [] };
            assertEquals("chunks" in payload, true);
            assertEquals(payload.chunks === null, false);
            assertEquals(Array.isArray(payload.chunks), true);
        });
    },
);

Deno.test(
    "Contract: AssembleChunksParams is an empty object — defined separately, not aliased to any other empty type",
    () => {
        const params: AssembleChunksParams = {};
        assertEquals(Object.keys(params).length, 0);
    },
);

Deno.test(
    "Contract: AssembleChunksReturn discriminates on success: true | false",
    async (t) => {
        await t.step("success === true", () => {
            const resolved: Awaited<AssembleChunksReturn> = {
                success: true,
                mergedObject: {},
                chunkCount: 0,
                rawGroupCount: 0,
                parseableCount: 0,
            };
            if (resolved.success === true) {
                assertEquals(typeof resolved.mergedObject, "object");
            } else {
                throw new Error("expected success branch");
            }
        });

        await t.step("success === false", () => {
            const resolved: Awaited<AssembleChunksReturn> = {
                success: false,
                error: "x",
                failedAtStep: "merge",
            };
            if (resolved.success === false) {
                assertEquals(resolved.failedAtStep, "merge");
            } else {
                throw new Error("expected error branch");
            }
        });
    },
);

Deno.test(
    "Contract: AssembleChunksSuccess.mergedObject is Record<string, unknown> — not optional",
    () => {
        const ok: AssembleChunksSuccess = {
            success: true,
            mergedObject: { k: 1 },
            chunkCount: 0,
            rawGroupCount: 0,
            parseableCount: 0,
        };
        assertEquals("mergedObject" in ok, true);
        assertEquals(typeof ok.mergedObject, "object");
        assertEquals(ok.mergedObject !== null, true);
        assertEquals(Array.isArray(ok.mergedObject), false);
    },
);

Deno.test(
    'Contract: AssembleChunksError.failedAtStep is a string union of exactly "classification" | "sanitization" | "parse" | "merge"',
    () => {
        const literals: AssembleChunksFailedAtStep[] = [
            "classification",
            "sanitization",
            "parse",
            "merge",
        ];
        for (let i = 0; i < literals.length; i++) {
            const step: AssembleChunksFailedAtStep = literals[i];
            const err: AssembleChunksError = {
                success: false,
                error: "e",
                failedAtStep: step,
            };
            assertEquals(err.failedAtStep, step);
        }
    },
);
