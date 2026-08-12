import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ContinueJobValidationError,
  ContinueJobEnqueueError,
  ContinueJobDeps,
  ContinueJobParams,
  ContinueJobPayload,
  ContinueJobEnqueuedReturn,
  ContinueJobLimitReachedReturn,
  ContinueJobErrorReturn,
  ContinueJobSuccessReturn,
  ContinueJobReturn,
  ContinueJobFn,
} from "./continueJob.interface.ts";

/** Contract: ContinueJobDeps declares exactly logger. */
Deno.test("ContinueJobDeps declares exactly logger", () => {
  const surface: Record<keyof ContinueJobDeps, true> = {
    logger: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: ContinueJobParams declares dbClient and projectOwnerUserId. */
Deno.test("ContinueJobParams declares dbClient and projectOwnerUserId", () => {
  const surface: Record<keyof ContinueJobParams, true> = {
    dbClient: true,
    projectOwnerUserId: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinueJobPayload declares job and savedOutput. */
Deno.test("ContinueJobPayload declares job and savedOutput", () => {
  const surface: Record<keyof ContinueJobPayload, true> = {
    job: true,
    savedOutput: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinueJobEnqueuedReturn declares exactly enqueued. */
Deno.test("ContinueJobEnqueuedReturn declares exactly enqueued", () => {
  const surface: Record<keyof ContinueJobEnqueuedReturn, true> = {
    enqueued: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: ContinueJobLimitReachedReturn declares enqueued and reason. */
Deno.test("ContinueJobLimitReachedReturn declares enqueued and reason", () => {
  const surface: Record<keyof ContinueJobLimitReachedReturn, true> = {
    enqueued: true,
    reason: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinueJobErrorReturn declares error and retriable. */
Deno.test("ContinueJobErrorReturn declares error and retriable", () => {
  const surface: Record<keyof ContinueJobErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinueJobFn's deps parameter requires exactly logger. */
Deno.test("ContinueJobFn deps parameter requires exactly logger", () => {
  const surface: Record<keyof Parameters<ContinueJobFn>[0], true> = {
    logger: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: ContinueJobFn's params parameter requires dbClient and projectOwnerUserId. */
Deno.test("ContinueJobFn params parameter requires dbClient and projectOwnerUserId", () => {
  const surface: Record<keyof Parameters<ContinueJobFn>[1], true> = {
    dbClient: true,
    projectOwnerUserId: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinueJobFn's payload parameter requires job and savedOutput. */
Deno.test("ContinueJobFn payload parameter requires job and savedOutput", () => {
  const surface: Record<keyof Parameters<ContinueJobFn>[2], true> = {
    job: true,
    savedOutput: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinueJobEnqueuedReturn is a flavor of ContinueJobSuccessReturn and a member of ContinueJobReturn. */
Deno.test("ContinueJobEnqueuedReturn is a flavor of ContinueJobSuccessReturn and a member of ContinueJobReturn", () => {
  const enqueued: ContinueJobEnqueuedReturn = { enqueued: true };
  const success: ContinueJobSuccessReturn = enqueued;
  const result: ContinueJobReturn = success;
  assertEquals(result, enqueued);
});

/** Contract: ContinueJobLimitReachedReturn is a flavor of ContinueJobSuccessReturn and a member of ContinueJobReturn. */
Deno.test("ContinueJobLimitReachedReturn is a flavor of ContinueJobSuccessReturn and a member of ContinueJobReturn", () => {
  const limit: ContinueJobLimitReachedReturn = { enqueued: false, reason: "continuation_limit_reached" };
  const success: ContinueJobSuccessReturn = limit;
  const result: ContinueJobReturn = success;
  assertEquals(result, limit);
});

/** Contract: ContinueJobErrorReturn carrying each owned error class is a member of ContinueJobReturn. */
Deno.test("ContinueJobErrorReturn carrying each owned error class is a member of ContinueJobReturn", () => {
  const validationErrorReturn: ContinueJobErrorReturn = { error: new ContinueJobValidationError("validation failed"), retriable: false };
  const enqueueErrorReturn: ContinueJobErrorReturn = { error: new ContinueJobEnqueueError("enqueue failed"), retriable: true };
  const result1: ContinueJobReturn = validationErrorReturn;
  const result2: ContinueJobReturn = enqueueErrorReturn;
  assertEquals(result1, validationErrorReturn);
  assertEquals(result2, enqueueErrorReturn);
});

/** Contract: ContinueJobFn's declared Promise return admits the enqueued arm. */
Deno.test("ContinueJobFn declared Promise return admits the enqueued arm", () => {
  const enqueued: ContinueJobEnqueuedReturn = { enqueued: true };
  const returned: ReturnType<ContinueJobFn> = Promise.resolve(enqueued);
  const declared: Promise<ContinueJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** Contract: ContinueJobFn's declared Promise return admits the limit-reached arm. */
Deno.test("ContinueJobFn declared Promise return admits the limit-reached arm", () => {
  const limit: ContinueJobLimitReachedReturn = { enqueued: false, reason: "continuation_limit_reached" };
  const returned: ReturnType<ContinueJobFn> = Promise.resolve(limit);
  const declared: Promise<ContinueJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});

/** Contract: ContinueJobFn's declared Promise return admits the error arm. */
Deno.test("ContinueJobFn declared Promise return admits the error arm", () => {
  const errorReturn: ContinueJobErrorReturn = { error: new Error("mock-continue-job-error"), retriable: false };
  const returned: ReturnType<ContinueJobFn> = Promise.resolve(errorReturn);
  const declared: Promise<ContinueJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});
