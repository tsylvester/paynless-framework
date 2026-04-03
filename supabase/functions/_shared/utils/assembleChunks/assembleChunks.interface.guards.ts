import {
    AssembleChunksDeps,
    AssembleChunksError,
    AssembleChunksPayload,
    AssembleChunksReturn,
    AssembleChunksSuccess,
} from "./assembleChunks.interface.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";

/**
 * `isAssembleChunksSuccess` — narrows `AssembleChunksReturn` to `AssembleChunksSuccess` via `success === true`
 */
export function isAssembleChunksSuccess(
    value: Awaited<AssembleChunksReturn>,
): value is AssembleChunksSuccess {
    if (!isRecord(value)) return false;
    if (value.success === true) {
        if (!("mergedObject" in value) || !isRecord(value.mergedObject)) {
            return false;
        }
        if (!("chunkCount" in value) || typeof value.chunkCount !== "number") {
            return false;
        }
        if (!("rawGroupCount" in value) || typeof value.rawGroupCount !== "number") {
            return false;
        }
        if (!("parseableCount" in value) || typeof value.parseableCount !== "number") {
            return false;
        }
        return true;
    }
    return false;
}

/**
 * `isAssembleChunksError` — narrows `AssembleChunksReturn` to `AssembleChunksError` via `success === false`
 */
export function isAssembleChunksError(
    value: Awaited<AssembleChunksReturn>,
): value is AssembleChunksError {
    if (!isRecord(value)) return false;
    if (value.success === false) {
        if (!("error" in value) || typeof value.error !== "string") {
            return false;
        }
        if (!("failedAtStep" in value)) {
            return false;
        }
        const step: unknown = value.failedAtStep;
        if (
            step !== "classification" &&
            step !== "sanitization" &&
            step !== "parse" &&
            step !== "merge"
        ) {
            return false;
        }
        return true;
    }
    return false;
}

/**
 * `isAssembleChunksDeps` — validates that an object satisfies `AssembleChunksDeps` (both function properties present and are functions)
 */
export function isAssembleChunksDeps(
    value: unknown,
): value is AssembleChunksDeps {
    if (!isRecord(value)) return false;
    if (
        !("sanitizeJsonContent" in value) ||
        typeof value.sanitizeJsonContent !== "function"
    ) {
        return false;
    }
    if (!("isRecord" in value) || typeof value.isRecord !== "function") {
        return false;
    }
    return true;
}

/**
 * `isAssembleChunksPayload` — validates that an object satisfies `AssembleChunksPayload` (`chunks` is an array of strings)
 */
export function isAssembleChunksPayload(
    value: unknown,
): value is AssembleChunksPayload {
    if (!isRecord(value)) return false;
    if (!("chunks" in value) || !Array.isArray(value.chunks)) {
        return false;
    }
    for (let i = 0; i < value.chunks.length; i++) {
        if (typeof value.chunks[i] !== "string") {
            return false;
        }
    }
    return true;
}
