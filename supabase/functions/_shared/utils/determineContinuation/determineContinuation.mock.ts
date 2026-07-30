import type {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from "./determineContinuation.interface.ts";
import { FileType } from "../../types/file_manager.types.ts";
import { buildContextForDocument } from "../../dialectic.mock.ts";

// --- DetermineContinuationParams Factory ---

export type DetermineContinuationParamsOverrides = Partial<DetermineContinuationParams>;

export function buildDetermineContinuationParams(
    overrides?: DetermineContinuationParamsOverrides,
): DetermineContinuationParams {
    const base: DetermineContinuationParams = {
        finishReasonContinue: false,
        wasStructurallyFixed: false,
        parsedContent: { field: "" },
        continueUntilComplete: false,
        documentKey: FileType.business_case,
        contextForDocuments: [buildContextForDocument()],
        sourceObject: { field: "" },
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type DetermineContinuationParamsCorruptions = { [K in keyof DetermineContinuationParams]?: unknown };

export function invalidateDetermineContinuationParams(
    corruptions: DetermineContinuationParamsCorruptions,
): unknown {
    return { ...buildDetermineContinuationParams(), ...corruptions };
}

// --- DetermineContinuationResult Factory ---

export type DetermineContinuationResultOverrides = Partial<DetermineContinuationResult>;

export function buildDetermineContinuationResult(
    overrides?: DetermineContinuationResultOverrides,
): DetermineContinuationResult {
    const base: DetermineContinuationResult = {
        shouldContinue: false,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type DetermineContinuationResultCorruptions = { [K in keyof DetermineContinuationResult]?: unknown };

export function invalidateDetermineContinuationResult(
    corruptions: DetermineContinuationResultCorruptions,
): unknown {
    return { ...buildDetermineContinuationResult(), ...corruptions };
}
