import { JsonSanitizationResult } from "../jsonSanitizer/jsonSanitizer.interface.ts";

/**
 * Injected dependencies for `assembleChunks`.
 */
export interface AssembleChunksDeps {
    sanitizeJsonContent: (rawContent: string) => JsonSanitizationResult;
    isRecord: (item: unknown) => item is Record<PropertyKey, unknown>;
}

/**
 * Configuration parameters for `assembleChunks` (none; distinct empty shape).
 */
export interface AssembleChunksParams {}

/**
 * Input: ordered chunk content strings to assemble.
 */
export interface AssembleChunksPayload {
    chunks: string[];
}

/**
 * Step at which assembly failed (for diagnostics).
 */
export type AssembleChunksFailedAtStep =
    | "classification"
    | "sanitization"
    | "parse"
    | "merge";

/**
 * Successful assembly result.
 */
export interface AssembleChunksSuccess {
    success: true;
    mergedObject: Record<string, unknown>;
    chunkCount: number;
    rawGroupCount: number;
    parseableCount: number;
}

/**
 * Failed assembly result.
 */
export interface AssembleChunksError {
    success: false;
    error: string;
    failedAtStep: AssembleChunksFailedAtStep;
}

export type AssembleChunksReturn = Promise<
    AssembleChunksSuccess | AssembleChunksError
>;

export type AssembleChunksSignature = (
    deps: AssembleChunksDeps,
    params: AssembleChunksParams,
    payload: AssembleChunksPayload,
) => AssembleChunksReturn;

/** One chunk after JSON classify: parseable object document. */
export interface AssembleChunksClassifiedParsed {
    type: "parsed";
    value: Record<string, unknown>;
}

/** One chunk after JSON classify: raw fragment string. */
export interface AssembleChunksClassifiedRaw {
    type: "raw";
    content: string;
}

/** Classified chunk or grouped raw / parsed segment in the assembly pipeline. */
export type AssembleChunksClassified =
    | AssembleChunksClassifiedParsed
    | AssembleChunksClassifiedRaw;
