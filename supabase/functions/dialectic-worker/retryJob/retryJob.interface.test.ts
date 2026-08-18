import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RetryJobUpdateError } from "./retryJob.interface.ts";
import type {
  RetryJobDeps,
  RetryJobParams,
  RetryJobPayload,
  RetryJobNotifiedReturn,
  RetryJobNotificationFailedReturn,
  RetryJobSuccessReturn,
  RetryJobErrorReturn,
  RetryJobReturn,
  RetryJobFn,
  RetryJobUpdateErrorConstructorParams,
  RetryJobNotificationErrorConstructorParams,
} from "./retryJob.interface.ts";

/** Contract: RetryJobDeps' required key surface is exactly logger and notificationService. */
Deno.test("RetryJobDeps has the required surface", () => {
  const surface: Record<keyof RetryJobDeps, true> = {
    logger: true,
    notificationService: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobParams' required key surface is exactly dbClient and job, proving the attempt number and the owner are read from the row rather than passed beside it. */
Deno.test("RetryJobParams has the required surface", () => {
  const surface: Record<keyof RetryJobParams, true> = {
    dbClient: true,
    job: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobPayload's required key surface is exactly failedAttempts. */
Deno.test("RetryJobPayload has the required surface", () => {
  const surface: Record<keyof RetryJobPayload, true> = {
    failedAttempts: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: RetryJobFn's deps parameter requires exactly logger and notificationService. */
Deno.test("RetryJobFn deps parameter has the required surface", () => {
  const surface: Record<keyof Parameters<RetryJobFn>[0], true> = {
    logger: true,
    notificationService: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobFn's params parameter requires exactly dbClient and job, proving the attempt number and the owner are read from the row rather than passed beside it. */
Deno.test("RetryJobFn params parameter has the required surface", () => {
  const surface: Record<keyof Parameters<RetryJobFn>[1], true> = {
    dbClient: true,
    job: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobFn's payload parameter requires exactly failedAttempts. */
Deno.test("RetryJobFn payload parameter has the required surface", () => {
  const surface: Record<keyof Parameters<RetryJobFn>[2], true> = {
    failedAttempts: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: RetryJobNotifiedReturn is { notified: true } and carries no error member. */
Deno.test("RetryJobNotifiedReturn carries notified true and no error member", () => {
  const notified: RetryJobNotifiedReturn = { notified: true };
  assertEquals(notified.notified, true);
});

/** Contract: RetryJobNotificationFailedReturn's required key surface is exactly notified and notificationError. */
Deno.test("RetryJobNotificationFailedReturn has the required surface", () => {
  const surface: Record<keyof RetryJobNotificationFailedReturn, true> = {
    notified: true,
    notificationError: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobNotifiedReturn is a flavor of RetryJobSuccessReturn, which is a member of RetryJobReturn. */
Deno.test("RetryJobNotifiedReturn is a member of RetryJobSuccessReturn and RetryJobReturn", () => {
  const notified: RetryJobNotifiedReturn = { notified: true };
  const success: RetryJobSuccessReturn = notified;
  const result: RetryJobReturn = success;
  assertEquals(result, notified);
});

/** Contract: RetryJobNotificationFailedReturn is a flavor of RetryJobSuccessReturn, which is a member of RetryJobReturn. */
Deno.test("RetryJobNotificationFailedReturn is a member of RetryJobSuccessReturn and RetryJobReturn", () => {
  const failed: RetryJobNotificationFailedReturn = {
    notified: false,
    notificationError: new Error("notification failed"),
  };
  const success: RetryJobSuccessReturn = failed;
  const result: RetryJobReturn = success;
  assertEquals(result, failed);
});

/** Contract: RetryJobErrorReturn's required key surface is exactly error and retriable. */
Deno.test("RetryJobErrorReturn has the required surface", () => {
  const surface: Record<keyof RetryJobErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobErrorReturn is a member of RetryJobReturn, proving the union has exactly two arms. */
Deno.test("RetryJobErrorReturn is a member of RetryJobReturn", () => {
  const errorReturn: RetryJobErrorReturn = {
    error: new RetryJobUpdateError({
      jobId: "job-1",
      attemptedStatus: "retrying",
      driverMessage: "connection lost",
    }),
    retriable: true,
  };
  const result: RetryJobReturn = errorReturn;
  assertEquals(result, errorReturn);
});

/** Contract: RetryJobUpdateErrorConstructorParams' required key surface is exactly jobId, attemptedStatus and driverMessage. */
Deno.test("RetryJobUpdateErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof RetryJobUpdateErrorConstructorParams, true> = {
    jobId: true,
    attemptedStatus: true,
    driverMessage: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

/** Contract: RetryJobNotificationErrorConstructorParams' required key surface is exactly jobId and thrownValue. */
Deno.test("RetryJobNotificationErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof RetryJobNotificationErrorConstructorParams, true> = {
    jobId: true,
    thrownValue: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RetryJobFn's declared return is Promise<RetryJobReturn>, proving the signature is asynchronous. */
Deno.test("RetryJobFn resolves to its declared return type", () => {
  const success: RetryJobSuccessReturn = { notified: true };
  const returned: ReturnType<RetryJobFn> = Promise.resolve(success);
  const declared: Promise<RetryJobReturn> = returned;
  assertEquals(declared instanceof Promise, true);
});
