import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isContinueJobDeps,
  isContinueJobEnqueuedReturn,
  isContinueJobErrorReturn,
  isContinueJobLimitReachedReturn,
  isContinueJobParams,
  isContinueJobPayload,
  isContinueJobSuccessReturn,
} from "./continueJob.guard.ts";
import {
  buildContinueJobDeps,
  buildContinueJobEnqueuedReturn,
  buildContinueJobErrorReturn,
  buildContinueJobLimitReachedReturn,
  buildContinueJobParams,
  buildContinueJobPayload,
  invalidateContinueJobDeps,
  invalidateContinueJobEnqueuedReturn,
  invalidateContinueJobErrorReturn,
  invalidateContinueJobLimitReachedReturn,
  invalidateContinueJobParams,
  invalidateContinueJobPayload,
} from "./continueJob.mock.ts";

// --- isContinueJobDeps ---

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isContinueJobDeps accepts the valid default", () => {
  assertEquals(isContinueJobDeps(buildContinueJobDeps()), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isContinueJobDeps accepts valid overrides", () => {
  const base = buildContinueJobDeps();
  assertEquals(isContinueJobDeps({ ...base, logger: base.logger }), true);
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isContinueJobDeps rejects non-objects", () => {
  assertEquals(isContinueJobDeps(null), false);
  assertEquals(isContinueJobDeps(undefined), false);
  assertEquals(isContinueJobDeps(7), false);
  assertEquals(isContinueJobDeps("x"), false);
  assertEquals(isContinueJobDeps([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isContinueJobDeps rejects each corrupted property", () => {
  assertEquals(isContinueJobDeps(invalidateContinueJobDeps({ logger: null })), false);
  assertEquals(isContinueJobDeps(invalidateContinueJobDeps({ logger: {} })), false);
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isContinueJobDeps rejects each omitted required property", () => {
  const { logger: _omit, ...missingLogger } = buildContinueJobDeps();
  assertEquals(isContinueJobDeps(missingLogger), false);
});

// --- isContinueJobParams ---

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isContinueJobParams accepts the valid default", () => {
  assertEquals(isContinueJobParams(buildContinueJobParams()), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isContinueJobParams accepts valid overrides", () => {
  const base = buildContinueJobParams();
  assertEquals(isContinueJobParams({ ...base, projectOwnerUserId: "user-2" }), true);
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isContinueJobParams rejects non-objects", () => {
  assertEquals(isContinueJobParams(null), false);
  assertEquals(isContinueJobParams(undefined), false);
  assertEquals(isContinueJobParams(7), false);
  assertEquals(isContinueJobParams("x"), false);
  assertEquals(isContinueJobParams([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isContinueJobParams rejects each corrupted property", () => {
  assertEquals(isContinueJobParams(invalidateContinueJobParams({ dbClient: null })), false);
  assertEquals(isContinueJobParams(invalidateContinueJobParams({ dbClient: {} })), false);
  assertEquals(isContinueJobParams(invalidateContinueJobParams({ projectOwnerUserId: null })), false);
  assertEquals(isContinueJobParams(invalidateContinueJobParams({ projectOwnerUserId: 7 })), false);
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isContinueJobParams rejects each omitted required property", () => {
  const { dbClient: _omitDb, ...missingDb } = buildContinueJobParams();
  assertEquals(isContinueJobParams(missingDb), false);
  const { projectOwnerUserId: _omitOwner, ...missingOwner } = buildContinueJobParams();
  assertEquals(isContinueJobParams(missingOwner), false);
});

// --- isContinueJobPayload ---

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isContinueJobPayload accepts the valid default", () => {
  assertEquals(isContinueJobPayload(buildContinueJobPayload()), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isContinueJobPayload accepts valid overrides", () => {
  const base = buildContinueJobPayload();
  assertEquals(isContinueJobPayload({ ...base, job: base.job }), true);
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isContinueJobPayload rejects non-objects", () => {
  assertEquals(isContinueJobPayload(null), false);
  assertEquals(isContinueJobPayload(undefined), false);
  assertEquals(isContinueJobPayload(7), false);
  assertEquals(isContinueJobPayload("x"), false);
  assertEquals(isContinueJobPayload([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isContinueJobPayload rejects each corrupted property", () => {
  assertEquals(isContinueJobPayload(invalidateContinueJobPayload({ job: null })), false);
  assertEquals(isContinueJobPayload(invalidateContinueJobPayload({ job: {} })), false);
  assertEquals(isContinueJobPayload(invalidateContinueJobPayload({ savedOutput: null })), false);
  assertEquals(isContinueJobPayload(invalidateContinueJobPayload({ savedOutput: {} })), false);
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isContinueJobPayload rejects each omitted required property", () => {
  const { job: _omitJob, ...missingJob } = buildContinueJobPayload();
  assertEquals(isContinueJobPayload(missingJob), false);
  const { savedOutput: _omitSaved, ...missingSaved } = buildContinueJobPayload();
  assertEquals(isContinueJobPayload(missingSaved), false);
});

// --- isContinueJobEnqueuedReturn ---

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isContinueJobEnqueuedReturn accepts the valid default", () => {
  assertEquals(isContinueJobEnqueuedReturn(buildContinueJobEnqueuedReturn()), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isContinueJobEnqueuedReturn accepts valid overrides", () => {
  assertEquals(isContinueJobEnqueuedReturn(buildContinueJobEnqueuedReturn({ enqueued: true })), true);
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isContinueJobEnqueuedReturn rejects non-objects", () => {
  assertEquals(isContinueJobEnqueuedReturn(null), false);
  assertEquals(isContinueJobEnqueuedReturn(undefined), false);
  assertEquals(isContinueJobEnqueuedReturn(7), false);
  assertEquals(isContinueJobEnqueuedReturn("x"), false);
  assertEquals(isContinueJobEnqueuedReturn([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isContinueJobEnqueuedReturn rejects each corrupted property", () => {
  assertEquals(isContinueJobEnqueuedReturn(invalidateContinueJobEnqueuedReturn({ enqueued: null })), false);
  assertEquals(isContinueJobEnqueuedReturn(invalidateContinueJobEnqueuedReturn({ enqueued: false })), false);
  assertEquals(isContinueJobEnqueuedReturn(invalidateContinueJobEnqueuedReturn({ enqueued: "true" })), false);
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isContinueJobEnqueuedReturn rejects each omitted required property", () => {
  const { enqueued: _omit, ...missingEnqueued } = buildContinueJobEnqueuedReturn();
  assertEquals(isContinueJobEnqueuedReturn(missingEnqueued), false);
});

/** Contract: isContinueJobEnqueuedReturn rejects both other arms. */
Deno.test("isContinueJobEnqueuedReturn rejects the limit-reached and error arms", () => {
  assertEquals(isContinueJobEnqueuedReturn(buildContinueJobLimitReachedReturn()), false);
  assertEquals(isContinueJobEnqueuedReturn(buildContinueJobErrorReturn()), false);
});

/** Contract: isContinueJobEnqueuedReturn rejects a value carrying error. */
Deno.test("isContinueJobEnqueuedReturn rejects a value carrying error", () => {
  assertEquals(isContinueJobEnqueuedReturn({ ...buildContinueJobEnqueuedReturn(), error: new Error("x") }), false);
});

// --- isContinueJobLimitReachedReturn ---

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isContinueJobLimitReachedReturn accepts the valid default", () => {
  assertEquals(isContinueJobLimitReachedReturn(buildContinueJobLimitReachedReturn()), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isContinueJobLimitReachedReturn accepts valid overrides", () => {
  assertEquals(
    isContinueJobLimitReachedReturn(buildContinueJobLimitReachedReturn({ enqueued: false, reason: "continuation_limit_reached" })),
    true,
  );
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isContinueJobLimitReachedReturn rejects non-objects", () => {
  assertEquals(isContinueJobLimitReachedReturn(null), false);
  assertEquals(isContinueJobLimitReachedReturn(undefined), false);
  assertEquals(isContinueJobLimitReachedReturn(7), false);
  assertEquals(isContinueJobLimitReachedReturn("x"), false);
  assertEquals(isContinueJobLimitReachedReturn([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isContinueJobLimitReachedReturn rejects each corrupted property", () => {
  assertEquals(isContinueJobLimitReachedReturn(invalidateContinueJobLimitReachedReturn({ enqueued: null })), false);
  assertEquals(isContinueJobLimitReachedReturn(invalidateContinueJobLimitReachedReturn({ enqueued: true })), false);
  assertEquals(isContinueJobLimitReachedReturn(invalidateContinueJobLimitReachedReturn({ reason: null })), false);
  assertEquals(isContinueJobLimitReachedReturn(invalidateContinueJobLimitReachedReturn({ reason: 7 })), false);
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isContinueJobLimitReachedReturn rejects each omitted required property", () => {
  const { enqueued: _omitEnq, ...missingEnq } = buildContinueJobLimitReachedReturn();
  assertEquals(isContinueJobLimitReachedReturn(missingEnq), false);
  const { reason: _omitReason, ...missingReason } = buildContinueJobLimitReachedReturn();
  assertEquals(isContinueJobLimitReachedReturn(missingReason), false);
});

/** Contract: isContinueJobLimitReachedReturn rejects reason absent or any other string. */
Deno.test("isContinueJobLimitReachedReturn rejects reason absent or any other string", () => {
  assertEquals(isContinueJobLimitReachedReturn({ enqueued: false }), false);
  assertEquals(isContinueJobLimitReachedReturn({ enqueued: false, reason: "other" }), false);
  assertEquals(isContinueJobLimitReachedReturn({ enqueued: false, reason: "" }), false);
});

/** Contract: isContinueJobLimitReachedReturn rejects both other arms. */
Deno.test("isContinueJobLimitReachedReturn rejects the enqueued and error arms", () => {
  assertEquals(isContinueJobLimitReachedReturn(buildContinueJobEnqueuedReturn()), false);
  assertEquals(isContinueJobLimitReachedReturn(buildContinueJobErrorReturn()), false);
});

// --- isContinueJobErrorReturn ---

/** Contract: case 1 — the builder's valid default is accepted. */
Deno.test("isContinueJobErrorReturn accepts the valid default", () => {
  assertEquals(isContinueJobErrorReturn(buildContinueJobErrorReturn()), true);
});

/** Contract: case 2 — valid overrides are accepted. */
Deno.test("isContinueJobErrorReturn accepts valid overrides", () => {
  const base = buildContinueJobErrorReturn();
  assertEquals(isContinueJobErrorReturn({ ...base, retriable: true }), true);
});

/** Contract: case 3 — null, undefined, primitives, and arrays are rejected. */
Deno.test("isContinueJobErrorReturn rejects non-objects", () => {
  assertEquals(isContinueJobErrorReturn(null), false);
  assertEquals(isContinueJobErrorReturn(undefined), false);
  assertEquals(isContinueJobErrorReturn(7), false);
  assertEquals(isContinueJobErrorReturn("x"), false);
  assertEquals(isContinueJobErrorReturn([]), false);
});

/** Contract: case 4 — each property, corrupted in turn, is rejected. */
Deno.test("isContinueJobErrorReturn rejects each corrupted property", () => {
  assertEquals(isContinueJobErrorReturn(invalidateContinueJobErrorReturn({ error: null })), false);
  assertEquals(isContinueJobErrorReturn(invalidateContinueJobErrorReturn({ error: "x" })), false);
  assertEquals(isContinueJobErrorReturn(invalidateContinueJobErrorReturn({ retriable: null })), false);
  assertEquals(isContinueJobErrorReturn(invalidateContinueJobErrorReturn({ retriable: "true" })), false);
});

/** Contract: case 5 — each required property, omitted in turn, is rejected. */
Deno.test("isContinueJobErrorReturn rejects each omitted required property", () => {
  const { error: _omitErr, ...missingErr } = buildContinueJobErrorReturn();
  assertEquals(isContinueJobErrorReturn(missingErr), false);
  const { retriable: _omitRet, ...missingRet } = buildContinueJobErrorReturn();
  assertEquals(isContinueJobErrorReturn(missingRet), false);
});

/** Contract: isContinueJobErrorReturn rejects a value carrying enqueued. */
Deno.test("isContinueJobErrorReturn rejects a value carrying enqueued", () => {
  assertEquals(isContinueJobErrorReturn({ ...buildContinueJobErrorReturn(), enqueued: false }), false);
  assertEquals(isContinueJobErrorReturn({ ...buildContinueJobErrorReturn(), enqueued: true }), false);
});

/** Contract: isContinueJobErrorReturn rejects both success arms. */
Deno.test("isContinueJobErrorReturn rejects the enqueued and limit-reached arms", () => {
  assertEquals(isContinueJobErrorReturn(buildContinueJobEnqueuedReturn()), false);
  assertEquals(isContinueJobErrorReturn(buildContinueJobLimitReachedReturn()), false);
});

// --- isContinueJobSuccessReturn ---

/** Contract: isContinueJobSuccessReturn accepts the enqueued flavor. */
Deno.test("isContinueJobSuccessReturn accepts the enqueued flavor", () => {
  assertEquals(isContinueJobSuccessReturn(buildContinueJobEnqueuedReturn()), true);
});

/** Contract: isContinueJobSuccessReturn accepts the limit-reached flavor. */
Deno.test("isContinueJobSuccessReturn accepts the limit-reached flavor", () => {
  assertEquals(isContinueJobSuccessReturn(buildContinueJobLimitReachedReturn()), true);
});

/** Contract: isContinueJobSuccessReturn rejects the error arm. */
Deno.test("isContinueJobSuccessReturn rejects the error arm", () => {
  assertEquals(isContinueJobSuccessReturn(buildContinueJobErrorReturn()), false);
});

/** Contract: isContinueJobSuccessReturn rejects non-objects. */
Deno.test("isContinueJobSuccessReturn rejects non-objects", () => {
  assertEquals(isContinueJobSuccessReturn(null), false);
  assertEquals(isContinueJobSuccessReturn(undefined), false);
  assertEquals(isContinueJobSuccessReturn(7), false);
  assertEquals(isContinueJobSuccessReturn("x"), false);
  assertEquals(isContinueJobSuccessReturn([]), false);
});
