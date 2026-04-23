import { createMockSanitizeJsonContent } from "../jsonSanitizer/jsonSanitizer.provides.ts";
import { SanitizeJsonContentFn } from "../jsonSanitizer/jsonSanitizer.interface.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";
import {
    AssembleChunksDeps,
    AssembleChunksError,
    AssembleChunksParams,
    AssembleChunksPayload,
    AssembleChunksSignature,
    AssembleChunksSuccess,
} from "./assembleChunks.interface.ts";

export function createMockAssembleChunksDeps(
    overrides?: Partial<AssembleChunksDeps>,
): AssembleChunksDeps {
    const sanitizeJsonContent: SanitizeJsonContentFn =
        overrides?.sanitizeJsonContent !== undefined
            ? overrides.sanitizeJsonContent
            : createMockSanitizeJsonContent();
    const isRecordFn: (item: unknown) => item is Record<PropertyKey, unknown> =
        overrides?.isRecord !== undefined ? overrides.isRecord : isRecord;
    return {
        sanitizeJsonContent,
        isRecord: isRecordFn,
    };
}

export function createMockAssembleChunksParams(
    _overrides?: Partial<AssembleChunksParams>,
): AssembleChunksParams {
    return {};
}

export function createMockAssembleChunksPayload(
    overrides?: Partial<AssembleChunksPayload>,
): AssembleChunksPayload {
    const chunks: string[] =
        overrides?.chunks !== undefined ? overrides.chunks : [];
    return { chunks };
}

export function createMockAssembleChunksSuccess(
    overrides?: Partial<AssembleChunksSuccess>,
): AssembleChunksSuccess {
    const base: AssembleChunksSuccess = {
        success: true,
        mergedObject: {},
        chunkCount: 0,
        rawGroupCount: 0,
        parseableCount: 0,
    };
    return { ...base, ...overrides };
}

export function createMockAssembleChunksError(
    overrides?: Partial<AssembleChunksError>,
): AssembleChunksError {
    const base: AssembleChunksError = {
        success: false,
        error: "mock error",
        failedAtStep: "merge",
    };
    return { ...base, ...overrides };
}

export type AssembleChunksMockCall = {
    deps: AssembleChunksDeps;
    params: AssembleChunksParams;
    payload: AssembleChunksPayload;
};

export function createAssembleChunksMock(options?: {
    result?: AssembleChunksSuccess | AssembleChunksError;
    handler?: AssembleChunksSignature;
}): {
    assembleChunks: AssembleChunksSignature;
    calls: AssembleChunksMockCall[];
} {
    const calls: AssembleChunksMockCall[] = [];

    const assembleChunks: AssembleChunksSignature = async (
        deps: AssembleChunksDeps,
        params: AssembleChunksParams,
        payload: AssembleChunksPayload,
    ) => {
        calls.push({ deps, params, payload });
        if (options?.handler !== undefined) {
            return await options.handler(deps, params, payload);
        }
        if (options?.result !== undefined) {
            return options.result;
        }
        return createMockAssembleChunksSuccess({
            chunkCount: payload.chunks.length,
        });
    };

    return { assembleChunks, calls };
}
