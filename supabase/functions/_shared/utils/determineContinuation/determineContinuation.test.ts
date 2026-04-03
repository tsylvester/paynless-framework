import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { ContextForDocument } from "../../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type {
    DetermineContinuationParams,
    DetermineContinuationResult,
} from "./determineContinuation.interface.ts";
import { determineContinuation } from "./determineContinuation.ts";

Deno.test(
    "returns shouldContinue: true when finishReasonContinue is true (trigger 1 pass-through)",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: true,
            wasStructurallyFixed: false,
            parsedContent: {},
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when wasStructurallyFixed is true AND continueUntilComplete is true, even if finishReasonContinue is false (trigger 2)",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: true,
            parsedContent: {},
            continueUntilComplete: true,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "does NOT trigger continuation from wasStructurallyFixed when continueUntilComplete is false",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: true,
            parsedContent: {},
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has continuation_needed: true (trigger 3)",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: { continuation_needed: true },
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has stop_reason: 'continuation' (trigger 3)",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: { stop_reason: "continuation" },
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has stop_reason: 'token_limit' (trigger 3)",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: { stop_reason: "token_limit" },
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has a non-empty resume_cursor string (trigger 3)",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: { resume_cursor: "cursor-token" },
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "does NOT trigger continuation from content flags when parsedContent is not a record",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: "not a record",
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "returns shouldContinue: true when parsed content is missing keys from contextForDocuments[].content_to_include AND continueUntilComplete is true (trigger 4)",
    () => {
        const contextForDocuments: ContextForDocument[] = [
            {
                document_key: FileType.business_case,
                content_to_include: { alpha: "", beta: "" },
            },
        ];
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: {},
            continueUntilComplete: true,
            documentKey: "business_case",
            contextForDocuments,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "does NOT check missing keys when continueUntilComplete is false",
    () => {
        const contextForDocuments: ContextForDocument[] = [
            {
                document_key: FileType.business_case,
                content_to_include: { alpha: "", beta: "" },
            },
        ];
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: {},
            continueUntilComplete: false,
            documentKey: "business_case",
            contextForDocuments,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "does NOT check missing keys when documentKey is undefined",
    () => {
        const contextForDocuments: ContextForDocument[] = [
            {
                document_key: FileType.business_case,
                content_to_include: { alpha: "", beta: "" },
            },
        ];
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: {},
            continueUntilComplete: true,
            documentKey: undefined,
            contextForDocuments,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "does NOT check missing keys when contextForDocuments is undefined",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: {},
            continueUntilComplete: true,
            documentKey: "business_case",
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "does NOT trigger missing-keys continuation when all expected keys are present in parsed content",
    () => {
        const contextForDocuments: ContextForDocument[] = [
            {
                document_key: FileType.business_case,
                content_to_include: { alpha: "", beta: "" },
            },
        ];
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: { alpha: "x", beta: "y" },
            continueUntilComplete: true,
            documentKey: "business_case",
            contextForDocuments,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "returns shouldContinue: false when no triggers match and finishReasonContinue is false",
    () => {
        const params: DetermineContinuationParams = {
            finishReasonContinue: false,
            wasStructurallyFixed: false,
            parsedContent: { idle: true },
            continueUntilComplete: false,
            documentKey: undefined,
            contextForDocuments: undefined,
        };
        const result: DetermineContinuationResult = determineContinuation(params);
        assertEquals(result.shouldContinue, false);
    },
);
