import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDetermineContinuationParams } from "./determineContinuation.guard.ts";
import {
    buildDetermineContinuationParams,
    invalidateDetermineContinuationParams,
} from "./determineContinuation.mock.ts";

Deno.test(
    "Guard: isDetermineContinuationParams validates sourceObject presence",
    async (t) => {
        await t.step("accepts the valid default", () => {
            assertEquals(isDetermineContinuationParams(buildDetermineContinuationParams()), true);
        });

        await t.step("accepts sourceObject undefined", () => {
            const params = buildDetermineContinuationParams({ sourceObject: undefined });
            assertEquals(isDetermineContinuationParams(params), true);
        });

        await t.step("accepts sourceObject as a string", () => {
            const params = buildDetermineContinuationParams({ sourceObject: "not-a-record" });
            assertEquals(isDetermineContinuationParams(params), true);
        });

        await t.step("accepts sourceObject as an array", () => {
            const params = buildDetermineContinuationParams({ sourceObject: [1, 2, 3] });
            assertEquals(isDetermineContinuationParams(params), true);
        });

        await t.step("accepts sourceObject as null", () => {
            const params = buildDetermineContinuationParams({ sourceObject: null });
            assertEquals(isDetermineContinuationParams(params), true);
        });

        await t.step("rejects the omission of sourceObject", () => {
            const { sourceObject: _omit, ...missingSourceObject } = buildDetermineContinuationParams();
            assertEquals(isDetermineContinuationParams(missingSourceObject), false);
        });

        await t.step("accepts the invalidator's corrupted sourceObject", () => {
            assertEquals(
                isDetermineContinuationParams(
                    invalidateDetermineContinuationParams({ sourceObject: 42 }),
                ),
                true,
            );
        });
    },
);
