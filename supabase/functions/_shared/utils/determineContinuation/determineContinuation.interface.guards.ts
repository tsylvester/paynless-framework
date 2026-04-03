import type {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from "./determineContinuation.interface.ts";
import { isContextForDocumentArray } from "../type-guards/type_guards.dialectic.ts";
import { isRecord } from "../type-guards/type_guards.common.ts";

/**
 * Validates that `value` satisfies `DetermineContinuationParams`: all six fields present with correct types.
 */
export function isDetermineContinuationParams(
    value: unknown,
): value is DetermineContinuationParams {
    if (!isRecord(value)) return false;
    if (
        !("finishReasonContinue" in value) ||
        typeof value.finishReasonContinue !== "boolean"
    ) {
        return false;
    }
    if (
        !("wasStructurallyFixed" in value) ||
        typeof value.wasStructurallyFixed !== "boolean"
    ) {
        return false;
    }
    if (!("parsedContent" in value)) {
        return false;
    }
    if (
        !("continueUntilComplete" in value) ||
        typeof value.continueUntilComplete !== "boolean"
    ) {
        return false;
    }
    if (!("documentKey" in value)) {
        return false;
    }
    const documentKey: unknown = value.documentKey;
    if (documentKey !== undefined && typeof documentKey !== "string") {
        return false;
    }
    if (!("contextForDocuments" in value)) {
        return false;
    }
    const contextForDocuments: unknown = value.contextForDocuments;
    if (
        contextForDocuments !== undefined &&
        !isContextForDocumentArray(contextForDocuments)
    ) {
        return false;
    }
    return true;
}

/**
 * Validates that `value` satisfies `DetermineContinuationResult`: `shouldContinue` is a boolean (sole property).
 */
export function isDetermineContinuationResult(
    value: unknown,
): value is DetermineContinuationResult {
    if (!isRecord(value)) return false;
    if (!("shouldContinue" in value) || typeof value.shouldContinue !== "boolean") {
        return false;
    }
    const keys: string[] = Object.keys(value);
    if (keys.length !== 1) {
        return false;
    }
    return true;
}
