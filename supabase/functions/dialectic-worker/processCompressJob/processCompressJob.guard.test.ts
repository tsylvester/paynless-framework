import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isBoundProcessCompressJobFn,
  isProcessCompressJobDeps,
  isProcessCompressJobErrorReturn,
  isProcessCompressJobFn,
  isProcessCompressJobParams,
  isProcessCompressJobPayload,
  isProcessCompressJobReturn,
  isProcessCompressJobSuccessReturn,
} from "./processCompressJob.guard.ts";
import {
  buildProcessCompressJobDeps,
  buildProcessCompressJobErrorReturn,
  buildProcessCompressJobParams,
  buildProcessCompressJobPayload,
  buildProcessCompressJobSuccessReturn,
  invalidateProcessCompressJobDeps,
  invalidateProcessCompressJobErrorReturn,
  invalidateProcessCompressJobParams,
  invalidateProcessCompressJobPayload,
  invalidateProcessCompressJobSuccessReturn,
  mockBoundProcessCompressJob,
  mockProcessCompressJob,
} from "./processCompressJob.mock.ts";

// ── isProcessCompressJobDeps ──────────────────────────────────────────────────

/** isProcessCompressJobDeps accepts the builder's valid default. */
Deno.test("isProcessCompressJobDeps accepts valid default", () => {
  assertEquals(isProcessCompressJobDeps(buildProcessCompressJobDeps()), true);
});

/** isProcessCompressJobDeps accepts valid overrides. */
Deno.test("isProcessCompressJobDeps accepts valid overrides", () => {
  assertEquals(
    isProcessCompressJobDeps(
      buildProcessCompressJobDeps({
        prepareModelJob: async () => ({ queued: true }),
      }),
    ),
    true,
  );
});

/** isProcessCompressJobDeps rejects null, undefined, primitives, and arrays. */
Deno.test("isProcessCompressJobDeps rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobDeps(x), false);
  }
});

/** isProcessCompressJobDeps rejects each corrupted property. */
Deno.test("isProcessCompressJobDeps rejects each corrupted property", () => {
  assertEquals(isProcessCompressJobDeps(invalidateProcessCompressJobDeps({ assembleCompressionPrompt: "not-a-function" })), false);
  assertEquals(isProcessCompressJobDeps(invalidateProcessCompressJobDeps({ assembleContinuationPrompt: 42 })), false);
  assertEquals(isProcessCompressJobDeps(invalidateProcessCompressJobDeps({ prepareModelJob: null })), false);
  assertEquals(isProcessCompressJobDeps(invalidateProcessCompressJobDeps({ constructStoragePath: 123 })), false);
  assertEquals(isProcessCompressJobDeps(invalidateProcessCompressJobDeps({ logger: "not-a-logger" })), false);
});

/** isProcessCompressJobDeps rejects each omitted required property. */
Deno.test("isProcessCompressJobDeps rejects each omitted required property", () => {
  const base = buildProcessCompressJobDeps();
  const { assembleCompressionPrompt: _a, ...withoutAssembleCompression } = base;
  assertEquals(isProcessCompressJobDeps(withoutAssembleCompression), false);
  const { assembleContinuationPrompt: _c, ...withoutAssembleContinuation } = base;
  assertEquals(isProcessCompressJobDeps(withoutAssembleContinuation), false);
  const { prepareModelJob: _p, ...withoutPrepareModelJob } = base;
  assertEquals(isProcessCompressJobDeps(withoutPrepareModelJob), false);
  const { constructStoragePath: _s, ...withoutConstructStoragePath } = base;
  assertEquals(isProcessCompressJobDeps(withoutConstructStoragePath), false);
  const { logger: _l, ...withoutLogger } = base;
  assertEquals(isProcessCompressJobDeps(withoutLogger), false);
});

/** isProcessCompressJobDeps accepts a deps object carrying none of the four removed members. */
Deno.test("isProcessCompressJobDeps accepts deps without the four removed members", () => {
  const deps = buildProcessCompressJobDeps();
  assertEquals("enqueueModelCall" in deps, false);
  assertEquals("countTokens" in deps, false);
  assertEquals("getEncoding" in deps, false);
  assertEquals("countTokensAnthropic" in deps, false);
  assertEquals(isProcessCompressJobDeps(deps), true);
});

// ── isProcessCompressJobParams ────────────────────────────────────────────────

/** isProcessCompressJobParams accepts the builder's valid default. */
Deno.test("isProcessCompressJobParams accepts valid default", () => {
  assertEquals(isProcessCompressJobParams(buildProcessCompressJobParams()), true);
});

/** isProcessCompressJobParams rejects null, undefined, primitives, and arrays. */
Deno.test("isProcessCompressJobParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobParams(x), false);
  }
});

/** isProcessCompressJobParams rejects corrupted dbClient. */
Deno.test("isProcessCompressJobParams rejects corrupted dbClient", () => {
  assertEquals(isProcessCompressJobParams(invalidateProcessCompressJobParams({ dbClient: null })), false);
  assertEquals(isProcessCompressJobParams(invalidateProcessCompressJobParams({ dbClient: "not-a-client" })), false);
});

/** isProcessCompressJobParams rejects omitted dbClient. */
Deno.test("isProcessCompressJobParams rejects omitted dbClient", () => {
  const { dbClient: _, ...withoutDbClient } = buildProcessCompressJobParams();
  assertEquals(isProcessCompressJobParams(withoutDbClient), false);
});

/** isProcessCompressJobParams accepts params carrying none of the three retired members. */
Deno.test("isProcessCompressJobParams accepts params without the three retired members", () => {
  const params = buildProcessCompressJobParams();
  assertEquals("job" in params, false);
  assertEquals("projectOwnerUserId" in params, false);
  assertEquals("authToken" in params, false);
  assertEquals(isProcessCompressJobParams(params), true);
});

// ── isProcessCompressJobPayload ───────────────────────────────────────────────

/** isProcessCompressJobPayload accepts a payload with a valid job record. */
Deno.test("isProcessCompressJobPayload accepts valid default", () => {
  assertEquals(isProcessCompressJobPayload(buildProcessCompressJobPayload()), true);
});

/** isProcessCompressJobPayload rejects null, undefined, primitives, and arrays. */
Deno.test("isProcessCompressJobPayload rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobPayload(x), false);
  }
});

/** isProcessCompressJobPayload rejects corrupted job. */
Deno.test("isProcessCompressJobPayload rejects corrupted job", () => {
  assertEquals(isProcessCompressJobPayload(invalidateProcessCompressJobPayload({ job: null })), false);
  assertEquals(isProcessCompressJobPayload(invalidateProcessCompressJobPayload({ job: "not-a-record" })), false);
});

/** isProcessCompressJobPayload rejects omitted job. */
Deno.test("isProcessCompressJobPayload rejects omitted job", () => {
  const { job: _, ...withoutJob } = buildProcessCompressJobPayload();
  assertEquals(isProcessCompressJobPayload(withoutJob), false);
});

// ── isProcessCompressJobSuccessReturn ─────────────────────────────────────────

/** isProcessCompressJobSuccessReturn accepts the builder's valid default. */
Deno.test("isProcessCompressJobSuccessReturn accepts valid default", () => {
  assertEquals(
    isProcessCompressJobSuccessReturn(buildProcessCompressJobSuccessReturn()),
    true,
  );
});

/** isProcessCompressJobSuccessReturn rejects null, undefined, primitives, and arrays. */
Deno.test("isProcessCompressJobSuccessReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobSuccessReturn(x), false);
  }
});

/** isProcessCompressJobSuccessReturn rejects undefined queued. */
Deno.test("isProcessCompressJobSuccessReturn rejects undefined queued", () => {
  assertEquals(
    isProcessCompressJobSuccessReturn(
      buildProcessCompressJobSuccessReturn({ queued: undefined }),
    ),
    false,
  );
});

/** isProcessCompressJobSuccessReturn rejects null queued. */
Deno.test("isProcessCompressJobSuccessReturn rejects null queued", () => {
  assertEquals(
    isProcessCompressJobSuccessReturn(
      invalidateProcessCompressJobSuccessReturn({ queued: null }),
    ),
    false,
  );
});

/** isProcessCompressJobSuccessReturn rejects an error-present value. */
Deno.test("isProcessCompressJobSuccessReturn rejects error-present value", () => {
  assertEquals(
    isProcessCompressJobSuccessReturn(buildProcessCompressJobErrorReturn()),
    false,
  );
});

// ── isProcessCompressJobErrorReturn ───────────────────────────────────────────

/** isProcessCompressJobErrorReturn accepts the builder's valid default. */
Deno.test("isProcessCompressJobErrorReturn accepts valid default", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(buildProcessCompressJobErrorReturn()),
    true,
  );
});

/** isProcessCompressJobErrorReturn rejects null, undefined, primitives, and arrays. */
Deno.test("isProcessCompressJobErrorReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobErrorReturn(x), false);
  }
});

/** isProcessCompressJobErrorReturn rejects undefined error. */
Deno.test("isProcessCompressJobErrorReturn rejects undefined error", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(
      buildProcessCompressJobErrorReturn({ error: undefined }),
    ),
    false,
  );
});

/** isProcessCompressJobErrorReturn rejects null error. */
Deno.test("isProcessCompressJobErrorReturn rejects null error", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(
      invalidateProcessCompressJobErrorReturn({ error: null }),
    ),
    false,
  );
});

/** isProcessCompressJobErrorReturn rejects undefined retriable. */
Deno.test("isProcessCompressJobErrorReturn rejects undefined retriable", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(
      buildProcessCompressJobErrorReturn({ retriable: undefined }),
    ),
    false,
  );
});

/** isProcessCompressJobErrorReturn rejects null retriable. */
Deno.test("isProcessCompressJobErrorReturn rejects null retriable", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(
      invalidateProcessCompressJobErrorReturn({ retriable: null }),
    ),
    false,
  );
});

/** isProcessCompressJobErrorReturn rejects a success-present value. */
Deno.test("isProcessCompressJobErrorReturn rejects success-present value", () => {
  assertEquals(
    isProcessCompressJobErrorReturn(buildProcessCompressJobSuccessReturn()),
    false,
  );
});

// ── isProcessCompressJobReturn ────────────────────────────────────────────────

/** isProcessCompressJobReturn accepts a success return. */
Deno.test("isProcessCompressJobReturn accepts success return", () => {
  assertEquals(
    isProcessCompressJobReturn(buildProcessCompressJobSuccessReturn()),
    true,
  );
});

/** isProcessCompressJobReturn accepts an error return. */
Deno.test("isProcessCompressJobReturn accepts error return", () => {
  assertEquals(
    isProcessCompressJobReturn(buildProcessCompressJobErrorReturn()),
    true,
  );
});

/** isProcessCompressJobReturn rejects null, undefined, primitives, and arrays. */
Deno.test("isProcessCompressJobReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobReturn(x), false);
  }
});

// ── isProcessCompressJobFn ────────────────────────────────────────────────────

/** isProcessCompressJobFn accepts the owned function mock. */
Deno.test("isProcessCompressJobFn accepts full fn", () => {
  assertEquals(isProcessCompressJobFn(mockProcessCompressJob), true);
});

/** isProcessCompressJobFn rejects non-function roots. */
Deno.test("isProcessCompressJobFn rejects non-function roots", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isProcessCompressJobFn(x), false);
  }
});

// ── isBoundProcessCompressJobFn ───────────────────────────────────────────────

/** isBoundProcessCompressJobFn accepts the owned bound function mock. */
Deno.test("isBoundProcessCompressJobFn accepts full fn", () => {
  assertEquals(isBoundProcessCompressJobFn(mockBoundProcessCompressJob), true);
});

/** isBoundProcessCompressJobFn rejects non-function roots. */
Deno.test("isBoundProcessCompressJobFn rejects non-function roots", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isBoundProcessCompressJobFn(x), false);
  }
});
