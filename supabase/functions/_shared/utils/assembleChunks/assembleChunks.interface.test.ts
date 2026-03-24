import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { JsonSanitizationResult } from "../../types/jsonSanitizer.interface.ts";
import {
    AssembleChunksDeps,
    AssembleChunksError,
    AssembleChunksFailedAtStep,
    AssembleChunksParams,
    AssembleChunksPayload,
    AssembleChunksReturn,
    AssembleChunksSuccess,
} from "./assembleChunks.interface.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";

Deno.test(
    "Contract: AssembleChunksDeps requires both sanitizeJsonContent and isRecord — neither optional",
    () => {
        const sanitizeJsonContent = (
            _rawContent: string,
        ): JsonSanitizationResult => ({
            sanitized: "{}",
            wasSanitized: false,
            wasStructurallyFixed: false,
            hasDuplicateKeys: false,
            duplicateKeysResolved: [],
            originalLength: 0,
        });
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent,
            isRecord,
        };
        assertEquals("sanitizeJsonContent" in deps, true);
        assertEquals("isRecord" in deps, true);
        assertEquals(typeof deps.sanitizeJsonContent, "function");
        assertEquals(typeof deps.isRecord, "function");
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
