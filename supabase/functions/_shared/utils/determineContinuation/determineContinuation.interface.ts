import type { ContextForDocument } from "../../../dialectic-service/dialectic.interface.ts";

/**
 * Inputs for continuation decision (EMCAS triggers 1 pass-through and 2–4).
 * All values are precomputed at the call site; this module performs no I/O.
 */
export interface DetermineContinuationParams {
    /** Trigger 1: same as `isDialecticContinueReason(resolvedFinish)` at the EMCAS call site. */
    finishReasonContinue: boolean;
    /** Whether the JSON sanitizer performed structural repair (trigger 2). */
    wasStructurallyFixed: boolean;
    /** Parsed JSON after sanitization (trigger 3–4 inspect this when it is a record). */
    parsedContent: unknown;
    /** From `job.payload.continueUntilComplete`. */
    continueUntilComplete: boolean;
    /** From `job.payload.document_key` (trigger 4 matches against `contextForDocuments`). */
    documentKey: string | null | undefined;
    /** From `job.payload.context_for_documents` (trigger 4 missing-keys check). */
    contextForDocuments: ContextForDocument[] | null | undefined;
}

/**
 * Outcome: whether the job should continue (union of trigger 1 pass-through and triggers 2–4).
 */
export interface DetermineContinuationResult {
    shouldContinue: boolean;
}
