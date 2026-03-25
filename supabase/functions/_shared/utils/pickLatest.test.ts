import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { pickLatest } from "./pickLatest.ts";

Deno.test("pickLatest", async (t: Deno.TestContext) => {
    await t.step("returns the single element when given a one-element array", () => {
        const row: { created_at: string; id: string } = { created_at: "2026-01-15T10:00:00Z", id: "only" };
        const result: { created_at: string; id: string } = pickLatest([row]);
        assertEquals(result, row);
    });

    await t.step("returns the element with the latest created_at when given multiple elements", () => {
        const oldest: { created_at: string; id: string } = { created_at: "2025-06-01T00:00:00Z", id: "oldest" };
        const middle: { created_at: string; id: string } = { created_at: "2025-09-15T12:00:00Z", id: "middle" };
        const newest: { created_at: string; id: string } = { created_at: "2026-01-01T00:00:00Z", id: "newest" };
        const result: { created_at: string; id: string } = pickLatest([oldest, newest, middle]);
        assertEquals(result, newest);
    });

    await t.step("correctly compares ISO-8601 timestamps with varying precision", () => {
        const noMillis: { created_at: string; id: string } = { created_at: "2026-01-01T00:00:00Z", id: "no-millis" };
        const zeroMillis: { created_at: string; id: string } = { created_at: "2026-01-01T00:00:00.000Z", id: "zero-millis" };
        const halfSecond: { created_at: string; id: string } = { created_at: "2026-01-01T00:00:00.500Z", id: "half-second" };
        const result: { created_at: string; id: string } = pickLatest([noMillis, zeroMillis, halfSecond]);
        assertEquals(result, halfSecond);
    });

    await t.step("throws Error when given an empty array", () => {
        assertThrows(
            () => pickLatest<{ created_at: string }>([]),
            Error,
            "No matching rows found after filtering",
        );
    });

    await t.step("handles elements where all created_at values are identical — returns first encountered", () => {
        const first: { created_at: string; id: string } = { created_at: "2026-03-01T00:00:00Z", id: "first" };
        const second: { created_at: string; id: string } = { created_at: "2026-03-01T00:00:00Z", id: "second" };
        const third: { created_at: string; id: string } = { created_at: "2026-03-01T00:00:00Z", id: "third" };
        const result: { created_at: string; id: string } = pickLatest([first, second, third]);
        assertEquals(result, first);
    });
});
