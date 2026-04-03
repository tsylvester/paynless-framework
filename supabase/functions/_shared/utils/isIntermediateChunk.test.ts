import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FinishReason } from "../types.ts";
import { isIntermediateChunk } from "./isIntermediateChunk.ts";

/** Values that `isDialecticContinueReason` accepts per `isContinueReason` + dialectic string list in type_guards.dialectic. */
const dialecticContinueFinishReasons: readonly FinishReason[] = [
    "length",
    "max_tokens",
    "content_truncated",
    "unknown",
    "next_document",
    "tool_calls",
    "function_call",
    "content_filter",
];

Deno.test("isIntermediateChunk", async (t: Deno.TestContext) => {
    await t.step(
        "returns true when resolvedFinish is a dialectic continue reason and continueUntilComplete is true",
        () => {
            const resolvedFinish: FinishReason = "length";
            const result: boolean = isIntermediateChunk(resolvedFinish, true);
            assertEquals(result, true);
        },
    );

    await t.step(
        "returns false when resolvedFinish is a dialectic continue reason but continueUntilComplete is false",
        () => {
            const resolvedFinish: FinishReason = "length";
            const result: boolean = isIntermediateChunk(resolvedFinish, false);
            assertEquals(result, false);
        },
    );

    await t.step(
        "returns false when resolvedFinish is stop even if continueUntilComplete is true",
        () => {
            const resolvedFinish: FinishReason = "stop";
            const result: boolean = isIntermediateChunk(resolvedFinish, true);
            assertEquals(result, false);
        },
    );

    await t.step(
        "returns false when resolvedFinish is null even if continueUntilComplete is true",
        () => {
            const resolvedFinish: FinishReason = null;
            const result: boolean = isIntermediateChunk(resolvedFinish, true);
            assertEquals(result, false);
        },
    );

    await t.step(
        "returns true for each dialectic continue reason when continueUntilComplete is true",
        async (st: Deno.TestContext) => {
            for (const reason of dialecticContinueFinishReasons) {
                await st.step(`finish_reason ${reason}`, () => {
                    const result: boolean = isIntermediateChunk(reason, true);
                    assertEquals(result, true);
                });
            }
        },
    );
});
