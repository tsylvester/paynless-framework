import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { DetermineContinuationResult } from "./determineContinuation.interface.ts";
import { determineContinuation } from "./determineContinuation.ts";
import { buildDetermineContinuationParams } from "./determineContinuation.mock.ts";
import { buildContextForDocument } from "../../dialectic.mock.ts";

Deno.test(
    "returns shouldContinue: true when finishReasonContinue is true (trigger 1 pass-through)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                finishReasonContinue: true,
                parsedContent: {},
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when wasStructurallyFixed is true, even if finishReasonContinue is false (trigger 2)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                wasStructurallyFixed: true,
                parsedContent: {},
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "triggers continuation from wasStructurallyFixed regardless of continueUntilComplete",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                wasStructurallyFixed: true,
                parsedContent: {},
                continueUntilComplete: false,
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has continuation_needed: true (trigger 3)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { continuation_needed: true },
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has stop_reason: 'continuation' (trigger 3)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { stop_reason: "continuation" },
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has stop_reason: 'token_limit' (trigger 3)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { stop_reason: "token_limit" },
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "returns shouldContinue: true when parsedContent has a non-empty resume_cursor string (trigger 3)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { resume_cursor: "cursor-token" },
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "does NOT trigger continuation from content flags when parsedContent is not a record",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: "not a record",
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "returns shouldContinue: true when parsed content is missing keys from contextForDocuments[].content_to_include (trigger 4)",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: {},
                documentKey: "business_case",
                contextForDocuments: [
                    buildContextForDocument({
                        content_to_include: { alpha: "", beta: "" },
                    }),
                ],
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "checks missing keys regardless of continueUntilComplete",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: {},
                continueUntilComplete: false,
                documentKey: "business_case",
                contextForDocuments: [
                    buildContextForDocument({
                        content_to_include: { alpha: "", beta: "" },
                    }),
                ],
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "does NOT check missing keys when documentKey is undefined",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: {},
                continueUntilComplete: true,
                documentKey: undefined,
                contextForDocuments: [
                    buildContextForDocument({
                        content_to_include: { alpha: "", beta: "" },
                    }),
                ],
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "does NOT check missing keys when contextForDocuments is undefined",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: {},
                continueUntilComplete: true,
                documentKey: "business_case",
                contextForDocuments: undefined,
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "does NOT trigger missing-keys continuation when all expected keys are present in parsed content",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { alpha: "x", beta: "y" },
                continueUntilComplete: true,
                documentKey: "business_case",
                contextForDocuments: [
                    buildContextForDocument({
                        content_to_include: { alpha: "", beta: "" },
                    }),
                ],
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "returns shouldContinue: false when no triggers match and finishReasonContinue is false",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { idle: true },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: undefined,
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "source-object branch fires when parsedContent is missing a top-level key of sourceObject",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { alpha: "x" },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { alpha: "long", beta: "long" },
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);

Deno.test(
    "source-object branch does not fire when every top-level key survives",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { alpha: "short", beta: "short" },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { alpha: "long", beta: "long" },
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "source-object branch does not fire when parsedContent has extra keys beyond sourceObject",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { alpha: "x", beta: "y", extra: "z" },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { alpha: "long", beta: "long" },
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "source-object branch does not fire on nested divergence — top-level keys only",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { shared: { inner: "short" } },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { shared: { inner: "long", other: "long" } },
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "source-object branch does not fire on shortened arrays or condensed strings",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: { arr: ["one"], str: "short" },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { arr: ["one", "two", "three"], str: "a very long string" },
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "source-object branch does not fire when sourceObject is a non-record (undefined, string, array)",
    async (t) => {
        await t.step("sourceObject undefined", () => {
            const result: DetermineContinuationResult = determineContinuation(
                buildDetermineContinuationParams({
                    parsedContent: { alpha: "x" },
                    documentKey: undefined,
                    contextForDocuments: undefined,
                    sourceObject: undefined,
                }),
            );
            assertEquals(result.shouldContinue, false);
        });

        await t.step("sourceObject a string", () => {
            const result: DetermineContinuationResult = determineContinuation(
                buildDetermineContinuationParams({
                    parsedContent: { alpha: "x" },
                    documentKey: undefined,
                    contextForDocuments: undefined,
                    sourceObject: "not-a-record",
                }),
            );
            assertEquals(result.shouldContinue, false);
        });

        await t.step("sourceObject an array", () => {
            const result: DetermineContinuationResult = determineContinuation(
                buildDetermineContinuationParams({
                    parsedContent: { alpha: "x" },
                    documentKey: undefined,
                    contextForDocuments: undefined,
                    sourceObject: [1, 2, 3],
                }),
            );
            assertEquals(result.shouldContinue, false);
        });
    },
);

Deno.test(
    "source-object branch does not fire when parsedContent is a non-record",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                parsedContent: null,
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { alpha: "long", beta: "long" },
            }),
        );
        assertEquals(result.shouldContinue, false);
    },
);

Deno.test(
    "the two missing-keys branches do not interfere with each other",
    async (t) => {
        await t.step("recipe-step keys survive, source-object key missing → shouldContinue: true", () => {
            const result: DetermineContinuationResult = determineContinuation(
                buildDetermineContinuationParams({
                    parsedContent: { alpha: "x", beta: "y" },
                    documentKey: "business_case",
                    contextForDocuments: [
                        buildContextForDocument({
                            content_to_include: { alpha: "", beta: "" },
                        }),
                    ],
                    sourceObject: { alpha: "long", gamma: "long" },
                }),
            );
            assertEquals(result.shouldContinue, true);
        });

        await t.step("recipe-step keys missing, sourceObject undefined → shouldContinue: true", () => {
            const result: DetermineContinuationResult = determineContinuation(
                buildDetermineContinuationParams({
                    parsedContent: {},
                    documentKey: "business_case",
                    contextForDocuments: [
                        buildContextForDocument({
                            content_to_include: { alpha: "", beta: "" },
                        }),
                    ],
                    sourceObject: undefined,
                }),
            );
            assertEquals(result.shouldContinue, true);
        });
    },
);

Deno.test(
    "trigger 1 still short-circuits when sourceObject keys all survive",
    () => {
        const result: DetermineContinuationResult = determineContinuation(
            buildDetermineContinuationParams({
                finishReasonContinue: true,
                parsedContent: { alpha: "x", beta: "y" },
                documentKey: undefined,
                contextForDocuments: undefined,
                sourceObject: { alpha: "long", beta: "long" },
            }),
        );
        assertEquals(result.shouldContinue, true);
    },
);
