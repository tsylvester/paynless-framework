import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  BoundPrepareModelJobFn,
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobPendingReturn,
  PrepareModelJobQueuedReturn,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
import { PrepareModelJobExecutionError } from "./prepareModelJob.interface.ts";

/** PrepareModelJobDeps requires exactly eight keys including compressPrompt. */
Deno.test("PrepareModelJobDeps declares eight dependency keys", () => {
  const surface: Record<keyof PrepareModelJobDeps, true> = {
    logger: true,
    applyInputsRequiredScope: true,
    tokenWalletService: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    calculateAffordability: true,
    enqueueModelCall: true,
    compressPrompt: true,
  };
  assertEquals(Object.keys(surface).length, 8);
});

/** PrepareModelJobParams requires exactly one key — dbClient — proving job, projectOwnerUserId, providerRow, authToken and sessionData are gone. */
Deno.test("PrepareModelJobParams declares one field (dbClient only)", () => {
  const surface: Record<keyof PrepareModelJobParams, true> = {
    dbClient: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** PrepareModelJobPayload requires exactly five keys — job and providerRow here, compressionStrategy gone. */
Deno.test("PrepareModelJobPayload declares five fields", () => {
  const surface: Record<keyof PrepareModelJobPayload, true> = {
    job: true,
    providerRow: true,
    promptConstructionPayload: true,
    inputsRelevance: true,
    inputsRequired: true,
  };
  assertEquals(Object.keys(surface).length, 5);
});

/** PrepareModelJobSuccessReturn is the union of the queued and pending flavors; each flavor assigns to PrepareModelJobSuccessReturn and to PrepareModelJobReturn; PrepareModelJobErrorReturn assigns to PrepareModelJobReturn. */
Deno.test("PrepareModelJobSuccessReturn is two-arm and each arm plus error assigns to PrepareModelJobReturn", () => {
  const queued: PrepareModelJobQueuedReturn = { queued: true };
  const pending: PrepareModelJobPendingReturn = { waiting_for_children: true };
  const queuedAsSuccess: PrepareModelJobSuccessReturn = queued;
  const pendingAsSuccess: PrepareModelJobSuccessReturn = pending;
  const queuedAsReturn: PrepareModelJobReturn = queuedAsSuccess;
  const pendingAsReturn: PrepareModelJobReturn = pendingAsSuccess;
  const err: PrepareModelJobErrorReturn = { error: new Error("contract-err"), retriable: false };
  const errAsReturn: PrepareModelJobReturn = err;
  assertEquals(queuedAsReturn === queued, true);
  assertEquals(pendingAsReturn === pending, true);
  assertEquals(errAsReturn === err, true);
});

/** each flavor's typed literal carries only its own discriminant. */
Deno.test("PrepareModelJobQueuedReturn and PrepareModelJobPendingReturn flavor literals are mutually exclusive", () => {
  const queued: PrepareModelJobQueuedReturn = { queued: true };
  const pending: PrepareModelJobPendingReturn = { waiting_for_children: true };
  assertEquals("queued" in queued && !("waiting_for_children" in queued), true);
  assertEquals("waiting_for_children" in pending && !("queued" in pending), true);
});

/** PrepareModelJobErrorReturn has error and retriable. */
Deno.test("PrepareModelJobErrorReturn has error and retriable", () => {
  const err: PrepareModelJobErrorReturn = {
    error: new Error("contract-err"),
    retriable: false,
  };
  assertEquals(err.error instanceof Error, true);
  assertEquals(typeof err.retriable, "boolean");
});

/** PrepareModelJobFn's declared Promise return admits its success arm. */
Deno.test("PrepareModelJobFn resolves to its declared success type", () => {
  const success: PrepareModelJobSuccessReturn = { queued: true };
  const returned: ReturnType<PrepareModelJobFn> = Promise.resolve(success);
  const declared: Promise<PrepareModelJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** PrepareModelJobFn's declared Promise return admits its error arm. */
Deno.test("PrepareModelJobFn resolves to its declared error type", () => {
  const error: PrepareModelJobErrorReturn = { error: new Error("e"), retriable: false };
  const returned: ReturnType<PrepareModelJobFn> = Promise.resolve(error);
  const declared: Promise<PrepareModelJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** PrepareModelJobExecutionError constructs with name, retriable, causeError. */
Deno.test("PrepareModelJobExecutionError constructs with name, retriable, causeError", () => {
  const cause: Error = new Error("cause");
  const err: PrepareModelJobExecutionError = new PrepareModelJobExecutionError(
    "wrapped",
    true,
    cause,
  );
  assertEquals(err.name, "PrepareModelJobExecutionError");
  assertEquals(typeof err.retriable, "boolean");
  assertEquals(err.causeError instanceof Error, true);
  assertEquals(err instanceof Error, true);
});

/** BoundPrepareModelJobFn's declared Promise return admits its success arm. */
Deno.test("BoundPrepareModelJobFn resolves to its declared success type", () => {
  const success: PrepareModelJobSuccessReturn = { queued: true };
  const returned: ReturnType<BoundPrepareModelJobFn> = Promise.resolve(success);
  const declared: Promise<PrepareModelJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** BoundPrepareModelJobFn's declared Promise return admits its error arm. */
Deno.test("BoundPrepareModelJobFn resolves to its declared error type", () => {
  const error: PrepareModelJobErrorReturn = { error: new Error("e"), retriable: false };
  const returned: ReturnType<BoundPrepareModelJobFn> = Promise.resolve(error);
  const declared: Promise<PrepareModelJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});
