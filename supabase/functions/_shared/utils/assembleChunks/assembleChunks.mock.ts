import {
    AssembleChunksDeps,
    AssembleChunksError,
    AssembleChunksParams,
    AssembleChunksPayload,
    AssembleChunksSignature,
    AssembleChunksSuccess,
} from "./assembleChunks.interface.ts";

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
        const fallback: AssembleChunksSuccess = {
            success: true,
            mergedObject: {},
            chunkCount: payload.chunks.length,
            rawGroupCount: 0,
            parseableCount: 0,
        };
        return fallback;
    };

    return { assembleChunks, calls };
}
