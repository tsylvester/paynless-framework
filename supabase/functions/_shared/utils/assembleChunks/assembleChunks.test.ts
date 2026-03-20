import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { JsonSanitizationResult } from "../../types/jsonSanitizer.interface.ts";
import {
    AssembleChunksDeps,
    AssembleChunksParams,
    AssembleChunksPayload,
} from "./assembleChunks.interface.ts";
import {
    isAssembleChunksError,
    isAssembleChunksSuccess,
} from "./assembleChunks.interface.guards.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";
import { assembleChunks } from "./assembleChunks.ts";

function makeSanitizeResult(
    sanitized: string,
    originalLength: number,
): JsonSanitizationResult {
    return {
        sanitized,
        wasSanitized: false,
        wasStructurallyFixed: false,
        hasDuplicateKeys: false,
        duplicateKeysResolved: [],
        originalLength,
    };
}

function passthroughSanitize(rawContent: string): JsonSanitizationResult {
    return makeSanitizeResult(rawContent, rawContent.length);
}

const emptyParams: AssembleChunksParams = {};

async function expectAssembleSuccess(
    deps: AssembleChunksDeps,
    payload: AssembleChunksPayload,
) {
    const r = await assembleChunks(deps, emptyParams, payload);
    if (!isAssembleChunksSuccess(r)) {
        throw new Error(`expected success, got ${JSON.stringify(r)}`);
    }
    return r;
}

async function expectAssembleError(
    deps: AssembleChunksDeps,
    payload: AssembleChunksPayload,
) {
    const r = await assembleChunks(deps, emptyParams, payload);
    if (!isAssembleChunksError(r)) {
        throw new Error(`expected error, got ${JSON.stringify(r)}`);
    }
    return r;
}

Deno.test(
    "Test: empty `chunks` array returns `AssembleChunksSuccess` with empty merged object, all counts zero",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: passthroughSanitize,
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, { chunks: [] });
        assertEquals(r.mergedObject, {});
        assertEquals(r.chunkCount, 0);
        assertEquals(r.rawGroupCount, 0);
        assertEquals(r.parseableCount, 0);
    },
);

Deno.test(
    "Test: single parseable chunk returns that chunk's parsed content as `mergedObject`",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: passthroughSanitize,
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: ['{"hello":"world"}'],
        });
        assertEquals(r.mergedObject, { hello: "world" });
    },
);

Deno.test(
    "Test: multiple parseable chunks are deep-merged in order — `content` string fields concatenated, nested objects recursively merged, primitives last-write-wins",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: passthroughSanitize,
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: [
                '{"content":"a","n":{"x":1},"k":1}',
                '{"content":"b","n":{"y":2},"k":2}',
            ],
        });
        assertEquals(r.mergedObject.content, "ab");
        assertEquals(r.mergedObject.n, { x: 1, y: 2 });
        assertEquals(r.mergedObject.k, 2);
    },
);

Deno.test(
    "Test: single raw (unparseable) chunk is sanitized then parsed — `mergedObject` contains the sanitized result",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: (_raw: string): JsonSanitizationResult => {
                return makeSanitizeResult('{"fromRaw":true}', _raw.length);
            },
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: ["this is not json"],
        });
        assertEquals(r.mergedObject, { fromRaw: true });
    },
);

Deno.test(
    "Test: adjacent raw chunks are grouped, concatenated, sanitized as one string, then parsed",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: (raw: string): JsonSanitizationResult => {
                assertEquals(raw, '{"mid":true}');
                return makeSanitizeResult(raw, raw.length);
            },
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: ['{"mid":', "true}"],
        });
        assertEquals(r.mergedObject, { mid: true });
    },
);

Deno.test(
    "Test: mixed chain — raw fragments followed by parseable chunk — raw group is sanitized, then merged with parseable chunk in order",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: (raw: string): JsonSanitizationResult => {
                if (raw === "RAW") {
                    return makeSanitizeResult('{"b":1}', raw.length);
                }
                return makeSanitizeResult(raw, raw.length);
            },
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: ["RAW", '{"c":2}'],
        });
        assertEquals(r.mergedObject, { b: 1, c: 2 });
    },
);

Deno.test(
    "Test: mixed chain — parseable chunk followed by raw fragments followed by parseable chunk — three groups merged in order",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: (raw: string): JsonSanitizationResult => {
                if (raw === '{"mid":true}') {
                    return makeSanitizeResult(raw, raw.length);
                }
                return makeSanitizeResult(raw, raw.length);
            },
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: ['{"x":0}', '{"mid":', "true}", '{"z":3}'],
        });
        assertEquals(r.mergedObject, { x: 0, mid: true, z: 3 });
    },
);

Deno.test(
    "Test: continuation metadata keys (`continuation_needed`, `stop_reason`, `resume_cursor`) are stripped from parseable chunks before merge",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: passthroughSanitize,
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: [
                '{"content":"only","continuation_needed":true,"stop_reason":"length","resume_cursor":"9"}',
            ],
        });
        assertEquals(r.mergedObject, { content: "only" });
    },
);

Deno.test(
    "Test: continuation metadata keys inside nested objects are NOT stripped (only top-level stripping)",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: passthroughSanitize,
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: ['{"outer":{"continuation_needed":true,"keep":1}}'],
        });
        assertEquals(r.mergedObject, {
            outer: { continuation_needed: true, keep: 1 },
        });
    },
);

Deno.test(
    'Test: when sanitization of a raw group fails to produce parseable JSON, returns `AssembleChunksError` with `failedAtStep: "sanitization"`',
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: (_raw: string): JsonSanitizationResult => {
                return makeSanitizeResult("<<<not-json>>>", _raw.length);
            },
            isRecord,
        };
        const r = await expectAssembleError(deps, {
            chunks: ["not parseable as json"],
        });
        assertEquals(r.success, false);
        assertEquals(r.failedAtStep, "sanitization");
    },
);

Deno.test(
    "Test: `mergedObject` preserves all non-metadata keys from all chunks",
    async () => {
        const deps: AssembleChunksDeps = {
            sanitizeJsonContent: passthroughSanitize,
            isRecord,
        };
        const r = await expectAssembleSuccess(deps, {
            chunks: [
                '{"alpha":1,"continuation_needed":true}',
                '{"beta":2}',
            ],
        });
        assertEquals(r.mergedObject.alpha, 1);
        assertEquals(r.mergedObject.beta, 2);
        assertEquals("continuation_needed" in r.mergedObject, false);
    },
);
