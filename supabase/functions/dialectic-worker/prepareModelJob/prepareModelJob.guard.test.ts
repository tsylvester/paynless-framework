import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPrepareModelJobDeps,
  isPrepareModelJobErrorReturn,
  isPrepareModelJobParams,
  isPrepareModelJobPayload,
  isPrepareModelJobPendingReturn,
  isPrepareModelJobQueuedReturn,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.guard.ts";
import {
  buildPrepareModelJobDeps,
  buildPrepareModelJobErrorReturn,
  buildPrepareModelJobParams,
  buildPrepareModelJobPayload,
  buildPrepareModelJobPendingReturn,
  buildPrepareModelJobQueuedReturn,
  invalidatePrepareModelJobDeps,
  invalidatePrepareModelJobErrorReturn,
  invalidatePrepareModelJobParams,
  invalidatePrepareModelJobPayload,
  invalidatePrepareModelJobPendingReturn,
  invalidatePrepareModelJobQueuedReturn,
} from "./prepareModelJob.mock.ts";

// ── isPrepareModelJobDeps ─────────────────────────────────────────────────────

/** isPrepareModelJobDeps accepts the builder's valid default. */
Deno.test("isPrepareModelJobDeps accepts valid default", () => {
  assertEquals(isPrepareModelJobDeps(buildPrepareModelJobDeps()), true);
});

/** isPrepareModelJobDeps accepts valid overrides. */
Deno.test("isPrepareModelJobDeps accepts valid overrides", () => {
  assertEquals(
    isPrepareModelJobDeps(buildPrepareModelJobDeps({
      compressPrompt: async () => ({ fits: true, resourceDocuments: [], conversationHistory: [], resolvedInputTokenCount: 0 }),
    })),
    true,
  );
});

/** isPrepareModelJobDeps rejects null, undefined, primitives, and arrays. */
Deno.test("isPrepareModelJobDeps rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isPrepareModelJobDeps(x), false);
  }
});

/** isPrepareModelJobDeps rejects each corrupted property. */
Deno.test("isPrepareModelJobDeps rejects each corrupted property", () => {
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ logger: null })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ applyInputsRequiredScope: 42 })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ tokenWalletService: "not-a-service" })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ validateWalletBalance: null })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ validateModelCostRates: 7 })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ calculateAffordability: "not-a-function" })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ enqueueModelCall: 123 })), false);
  assertEquals(isPrepareModelJobDeps(invalidatePrepareModelJobDeps({ compressPrompt: "not-a-function" })), false);
});

/** isPrepareModelJobDeps rejects each omitted required property. */
Deno.test("isPrepareModelJobDeps rejects each omitted required property", () => {
  const base = buildPrepareModelJobDeps();
  const { logger: _l, ...withoutLogger } = base;
  assertEquals(isPrepareModelJobDeps(withoutLogger), false);
  const { applyInputsRequiredScope: _a, ...withoutApply } = base;
  assertEquals(isPrepareModelJobDeps(withoutApply), false);
  const { tokenWalletService: _t, ...withoutWallet } = base;
  assertEquals(isPrepareModelJobDeps(withoutWallet), false);
  const { validateWalletBalance: _v, ...withoutValidateWallet } = base;
  assertEquals(isPrepareModelJobDeps(withoutValidateWallet), false);
  const { validateModelCostRates: _m, ...withoutValidateRates } = base;
  assertEquals(isPrepareModelJobDeps(withoutValidateRates), false);
  const { calculateAffordability: _c, ...withoutAfford } = base;
  assertEquals(isPrepareModelJobDeps(withoutAfford), false);
  const { enqueueModelCall: _e, ...withoutEnqueue } = base;
  assertEquals(isPrepareModelJobDeps(withoutEnqueue), false);
  const { compressPrompt: _p, ...withoutCompress } = base;
  assertEquals(isPrepareModelJobDeps(withoutCompress), false);
});

/** isPrepareModelJobDeps rejects compressPrompt absent and non-function. */
Deno.test("isPrepareModelJobDeps rejects compressPrompt absent and non-function", () => {
  const { compressPrompt: _, ...withoutCompress } = buildPrepareModelJobDeps();
  assertEquals(isPrepareModelJobDeps(withoutCompress), false);
  assertEquals(
    isPrepareModelJobDeps({ ...buildPrepareModelJobDeps(), compressPrompt: "not-a-function" }),
    false,
  );
});

// ── isPrepareModelJobParams ───────────────────────────────────────────────────

/** isPrepareModelJobParams accepts the builder's valid default. */
Deno.test("isPrepareModelJobParams accepts valid default", () => {
  assertEquals(isPrepareModelJobParams(buildPrepareModelJobParams()), true);
});

/** isPrepareModelJobParams rejects null, undefined, primitives, and arrays. */
Deno.test("isPrepareModelJobParams rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isPrepareModelJobParams(x), false);
  }
});

/** isPrepareModelJobParams rejects dbClient corrupted. */
Deno.test("isPrepareModelJobParams rejects corrupted dbClient", () => {
  assertEquals(isPrepareModelJobParams(invalidatePrepareModelJobParams({ dbClient: null })), false);
  assertEquals(isPrepareModelJobParams(invalidatePrepareModelJobParams({ dbClient: "not-a-client" })), false);
});

/** isPrepareModelJobParams rejects dbClient omitted. */
Deno.test("isPrepareModelJobParams rejects omitted dbClient", () => {
  const { dbClient: _, ...withoutDbClient } = buildPrepareModelJobParams();
  assertEquals(isPrepareModelJobParams(withoutDbClient), false);
});

/** isPrepareModelJobParams accepts params carrying none of the five retired members. */
Deno.test("isPrepareModelJobParams accepts params without retired members", () => {
  const params = buildPrepareModelJobParams();
  assertEquals("job" in params, false);
  assertEquals("projectOwnerUserId" in params, false);
  assertEquals("providerRow" in params, false);
  assertEquals("authToken" in params, false);
  assertEquals("sessionData" in params, false);
  assertEquals(isPrepareModelJobParams(params), true);
});

// ── isPrepareModelJobPayload ──────────────────────────────────────────────────

/** isPrepareModelJobPayload accepts the builder's valid default. */
Deno.test("isPrepareModelJobPayload accepts valid default", () => {
  assertEquals(isPrepareModelJobPayload(buildPrepareModelJobPayload()), true);
});

/** isPrepareModelJobPayload accepts valid overrides. */
Deno.test("isPrepareModelJobPayload accepts valid overrides", () => {
  assertEquals(
    isPrepareModelJobPayload(buildPrepareModelJobPayload({
      inputsRelevance: [],
      inputsRequired: [],
    })),
    true,
  );
});

/** isPrepareModelJobPayload rejects null, undefined, primitives, and arrays. */
Deno.test("isPrepareModelJobPayload rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isPrepareModelJobPayload(x), false);
  }
});

/** isPrepareModelJobPayload rejects each corrupted property. */
Deno.test("isPrepareModelJobPayload rejects each corrupted property", () => {
  assertEquals(isPrepareModelJobPayload(invalidatePrepareModelJobPayload({ job: null })), false);
  assertEquals(isPrepareModelJobPayload(invalidatePrepareModelJobPayload({ providerRow: 42 })), false);
  assertEquals(isPrepareModelJobPayload(invalidatePrepareModelJobPayload({ promptConstructionPayload: "not-an-object" })), false);
  assertEquals(isPrepareModelJobPayload(invalidatePrepareModelJobPayload({ inputsRelevance: "not-an-array" })), false);
  assertEquals(isPrepareModelJobPayload(invalidatePrepareModelJobPayload({ inputsRequired: 7 })), false);
});

/** isPrepareModelJobPayload rejects a job whose id is non-string, proving the isDialecticJobRow delegation. */
Deno.test("isPrepareModelJobPayload rejects a job with a corrupted member via isDialecticJobRow", () => {
  const base = buildPrepareModelJobPayload();
  const corruptedJob = { ...base.job, id: 123 };
  assertEquals(isPrepareModelJobPayload({ ...base, job: corruptedJob }), false);
});

/** isPrepareModelJobPayload rejects a providerRow whose id is non-string, proving the isSelectedAiProvider delegation. */
Deno.test("isPrepareModelJobPayload rejects a providerRow with a corrupted member via isSelectedAiProvider", () => {
  const base = buildPrepareModelJobPayload();
  const corruptedProvider = { ...base.providerRow, id: 123 };
  assertEquals(isPrepareModelJobPayload({ ...base, providerRow: corruptedProvider }), false);
});

/** isPrepareModelJobPayload rejects each omitted required property. */
Deno.test("isPrepareModelJobPayload rejects each omitted required property", () => {
  const base = buildPrepareModelJobPayload();
  const { job: _j, ...withoutJob } = base;
  assertEquals(isPrepareModelJobPayload(withoutJob), false);
  const { providerRow: _p, ...withoutProvider } = base;
  assertEquals(isPrepareModelJobPayload(withoutProvider), false);
  const { promptConstructionPayload: _c, ...withoutPrompt } = base;
  assertEquals(isPrepareModelJobPayload(withoutPrompt), false);
});

/** isPrepareModelJobPayload accepts optional properties absent. */
Deno.test("isPrepareModelJobPayload accepts optional properties absent", () => {
  const { inputsRelevance: _r, inputsRequired: _q, ...withoutOptionals } = buildPrepareModelJobPayload();
  assertEquals(isPrepareModelJobPayload(withoutOptionals), true);
});

/** isPrepareModelJobPayload accepts a payload carrying no compressionStrategy. */
Deno.test("isPrepareModelJobPayload accepts payload without compressionStrategy", () => {
  const payload = buildPrepareModelJobPayload();
  assertEquals("compressionStrategy" in payload, false);
  assertEquals(isPrepareModelJobPayload(payload), true);
});

// ── isPrepareModelJobQueuedReturn ─────────────────────────────────────────────

/** isPrepareModelJobQueuedReturn accepts the builder's valid default. */
Deno.test("isPrepareModelJobQueuedReturn accepts valid default", () => {
  assertEquals(isPrepareModelJobQueuedReturn(buildPrepareModelJobQueuedReturn()), true);
});

/** isPrepareModelJobQueuedReturn rejects null, undefined, primitives, and arrays. */
Deno.test("isPrepareModelJobQueuedReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isPrepareModelJobQueuedReturn(x), false);
  }
});

/** isPrepareModelJobQueuedReturn rejects queued corrupted. */
Deno.test("isPrepareModelJobQueuedReturn rejects corrupted queued", () => {
  assertEquals(isPrepareModelJobQueuedReturn(invalidatePrepareModelJobQueuedReturn({ queued: false })), false);
  assertEquals(isPrepareModelJobQueuedReturn(invalidatePrepareModelJobQueuedReturn({ queued: "true" })), false);
});

/** isPrepareModelJobQueuedReturn rejects queued omitted. */
Deno.test("isPrepareModelJobQueuedReturn rejects omitted queued", () => {
  const { queued: _, ...withoutQueued } = buildPrepareModelJobQueuedReturn();
  assertEquals(isPrepareModelJobQueuedReturn(withoutQueued), false);
});

/** isPrepareModelJobQueuedReturn rejects the pending flavor. */
Deno.test("isPrepareModelJobQueuedReturn rejects the pending flavor", () => {
  assertEquals(isPrepareModelJobQueuedReturn(buildPrepareModelJobPendingReturn()), false);
});

// ── isPrepareModelJobPendingReturn ────────────────────────────────────────────

/** isPrepareModelJobPendingReturn accepts the builder's valid default. */
Deno.test("isPrepareModelJobPendingReturn accepts valid default", () => {
  assertEquals(isPrepareModelJobPendingReturn(buildPrepareModelJobPendingReturn()), true);
});

/** isPrepareModelJobPendingReturn rejects null, undefined, primitives, and arrays. */
Deno.test("isPrepareModelJobPendingReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isPrepareModelJobPendingReturn(x), false);
  }
});

/** isPrepareModelJobPendingReturn rejects waiting_for_children corrupted. */
Deno.test("isPrepareModelJobPendingReturn rejects corrupted waiting_for_children", () => {
  assertEquals(isPrepareModelJobPendingReturn(invalidatePrepareModelJobPendingReturn({ waiting_for_children: false })), false);
  assertEquals(isPrepareModelJobPendingReturn(invalidatePrepareModelJobPendingReturn({ waiting_for_children: "true" })), false);
});

/** isPrepareModelJobPendingReturn rejects waiting_for_children omitted. */
Deno.test("isPrepareModelJobPendingReturn rejects omitted waiting_for_children", () => {
  const { waiting_for_children: _, ...withoutPending } = buildPrepareModelJobPendingReturn();
  assertEquals(isPrepareModelJobPendingReturn(withoutPending), false);
});

/** isPrepareModelJobPendingReturn rejects the queued flavor. */
Deno.test("isPrepareModelJobPendingReturn rejects the queued flavor", () => {
  assertEquals(isPrepareModelJobPendingReturn(buildPrepareModelJobQueuedReturn()), false);
});

// ── isPrepareModelJobSuccessReturn ────────────────────────────────────────────

/** isPrepareModelJobSuccessReturn accepts the queued flavor. */
Deno.test("isPrepareModelJobSuccessReturn accepts { queued: true }", () => {
  assertEquals(isPrepareModelJobSuccessReturn({ queued: true }), true);
});

/** isPrepareModelJobSuccessReturn accepts the pending flavor. */
Deno.test("isPrepareModelJobSuccessReturn accepts { waiting_for_children: true }", () => {
  assertEquals(isPrepareModelJobSuccessReturn({ waiting_for_children: true }), true);
});

/** isPrepareModelJobSuccessReturn rejects a built error return. */
Deno.test("isPrepareModelJobSuccessReturn rejects error return", () => {
  assertEquals(isPrepareModelJobSuccessReturn(buildPrepareModelJobErrorReturn()), false);
});

/** isPrepareModelJobSuccessReturn rejects a record carrying neither discriminant. */
Deno.test("isPrepareModelJobSuccessReturn rejects record with neither discriminant", () => {
  assertEquals(isPrepareModelJobSuccessReturn({ foo: "bar" }), false);
  assertEquals(isPrepareModelJobSuccessReturn(null), false);
});

// ── isPrepareModelJobErrorReturn ──────────────────────────────────────────────

/** isPrepareModelJobErrorReturn accepts the builder's valid default. */
Deno.test("isPrepareModelJobErrorReturn accepts valid default", () => {
  assertEquals(isPrepareModelJobErrorReturn(buildPrepareModelJobErrorReturn()), true);
});

/** isPrepareModelJobErrorReturn rejects null, undefined, primitives, and arrays. */
Deno.test("isPrepareModelJobErrorReturn rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) {
    assertEquals(isPrepareModelJobErrorReturn(x), false);
  }
});

/** isPrepareModelJobErrorReturn rejects each corrupted property. */
Deno.test("isPrepareModelJobErrorReturn rejects each corrupted property", () => {
  assertEquals(isPrepareModelJobErrorReturn(invalidatePrepareModelJobErrorReturn({ error: "not-an-error" })), false);
  assertEquals(isPrepareModelJobErrorReturn(invalidatePrepareModelJobErrorReturn({ retriable: "not-a-boolean" })), false);
});

/** isPrepareModelJobErrorReturn rejects each omitted required property. */
Deno.test("isPrepareModelJobErrorReturn rejects each omitted required property", () => {
  const base = buildPrepareModelJobErrorReturn();
  const { error: _e, ...withoutError } = base;
  assertEquals(isPrepareModelJobErrorReturn(withoutError), false);
  const { retriable: _r, ...withoutRetriable } = base;
  assertEquals(isPrepareModelJobErrorReturn(withoutRetriable), false);
});

/** isPrepareModelJobErrorReturn rejects success-shaped objects, including the pending flavor. */
Deno.test("isPrepareModelJobErrorReturn rejects success shapes including waiting_for_children", () => {
  assertEquals(isPrepareModelJobErrorReturn({ queued: true }), false);
  assertEquals(isPrepareModelJobErrorReturn({ waiting_for_children: true }), false);
});
