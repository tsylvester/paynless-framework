import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPrepareModelJobDeps,
  isPrepareModelJobErrorReturn,
  isPrepareModelJobParams,
  isPrepareModelJobPayload,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.guard.ts";
import {
  mockPrepareModelJobDeps,
  mockPrepareModelJobParams,
  mockPrepareModelJobPayload,
} from "./prepareModelJob.mock.ts";

// ── isPrepareModelJobDeps ─────────────────────────────────────────────────────

Deno.test("isPrepareModelJobDeps accepts valid PrepareModelJobDeps with enqueueModelCall", () => {
  assertEquals(isPrepareModelJobDeps(mockPrepareModelJobDeps()), true);
});

Deno.test("isPrepareModelJobDeps rejects null", () => {
  assertEquals(isPrepareModelJobDeps(null), false);
});

Deno.test("isPrepareModelJobDeps rejects empty object", () => {
  assertEquals(isPrepareModelJobDeps({}), false);
});

Deno.test("isPrepareModelJobDeps rejects object missing calculateAffordability", () => {
  const base = mockPrepareModelJobDeps();
  const { calculateAffordability: _, ...without } = base;
  assertEquals(isPrepareModelJobDeps(without), false);
});

Deno.test("isPrepareModelJobDeps rejects object with non-function calculateAffordability", () => {
  const base = mockPrepareModelJobDeps();
  assertEquals(isPrepareModelJobDeps({ ...base, calculateAffordability: "not-a-function" }), false);
});

Deno.test("isPrepareModelJobDeps rejects object missing enqueueModelCall", () => {
  const base = mockPrepareModelJobDeps();
  const { enqueueModelCall: _, ...without } = base;
  assertEquals(isPrepareModelJobDeps(without), false);
});

Deno.test("isPrepareModelJobDeps rejects partial deps with only enqueueModelCall", () => {
  assertEquals(
    isPrepareModelJobDeps({ enqueueModelCall: async () => ({ queued: true }) }),
    false,
  );
});

// ── isPrepareModelJobParams ───────────────────────────────────────────────────

Deno.test("isPrepareModelJobParams accepts valid PrepareModelJobParams", () => {
  assertEquals(isPrepareModelJobParams(mockPrepareModelJobParams()), true);
});

Deno.test("isPrepareModelJobParams rejects null", () => {
  assertEquals(isPrepareModelJobParams(null), false);
});

Deno.test("isPrepareModelJobParams rejects empty object", () => {
  assertEquals(isPrepareModelJobParams({}), false);
});

// ── isPrepareModelJobPayload ──────────────────────────────────────────────────

Deno.test("isPrepareModelJobPayload accepts valid PrepareModelJobPayload", () => {
  assertEquals(isPrepareModelJobPayload(mockPrepareModelJobPayload()), true);
});

Deno.test("isPrepareModelJobPayload rejects null", () => {
  assertEquals(isPrepareModelJobPayload(null), false);
});

Deno.test("isPrepareModelJobPayload rejects empty object", () => {
  assertEquals(isPrepareModelJobPayload({}), false);
});

// ── isPrepareModelJobSuccessReturn ────────────────────────────────────────────

Deno.test("isPrepareModelJobSuccessReturn accepts { queued: true }", () => {
  assertEquals(isPrepareModelJobSuccessReturn({ queued: true }), true);
});

Deno.test("isPrepareModelJobSuccessReturn rejects old success shape with contribution", () => {
  assertEquals(
    isPrepareModelJobSuccessReturn({
      contribution: { id: "old-contrib-id" },
      needsContinuation: false,
      renderJobId: null,
    }),
    false,
  );
});

Deno.test("isPrepareModelJobSuccessReturn rejects null", () => {
  assertEquals(isPrepareModelJobSuccessReturn(null), false);
});

Deno.test("isPrepareModelJobSuccessReturn rejects error-shaped object", () => {
  assertEquals(
    isPrepareModelJobSuccessReturn({ error: new Error("x"), retriable: false }),
    false,
  );
});

// ── isPrepareModelJobErrorReturn ──────────────────────────────────────────────

Deno.test("isPrepareModelJobErrorReturn accepts valid error return", () => {
  assertEquals(
    isPrepareModelJobErrorReturn({ error: new Error("guard-err"), retriable: true }),
    true,
  );
});

Deno.test("isPrepareModelJobErrorReturn rejects null", () => {
  assertEquals(isPrepareModelJobErrorReturn(null), false);
});

Deno.test("isPrepareModelJobErrorReturn rejects old success-shaped object", () => {
  assertEquals(
    isPrepareModelJobErrorReturn({
      contribution: { id: "old-contrib-id" },
      needsContinuation: false,
      renderJobId: null,
    }),
    false,
  );
});
