import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isRetryJobDeps,
  isRetryJobParams,
  isRetryJobPayload,
  isRetryJobNotifiedReturn,
  isRetryJobNotificationFailedReturn,
  isRetryJobErrorReturn,
  isRetryJobUpdateError,
  isRetryJobNotificationError,
} from "./retryJob.guard.ts";
import {
  buildRetryJobDeps,
  invalidateRetryJobDeps,
  buildRetryJobParams,
  invalidateRetryJobParams,
  buildRetryJobPayload,
  invalidateRetryJobPayload,
  buildRetryJobNotifiedReturn,
  invalidateRetryJobNotifiedReturn,
  buildRetryJobNotificationFailedReturn,
  invalidateRetryJobNotificationFailedReturn,
  buildRetryJobErrorReturn,
  invalidateRetryJobErrorReturn,
  buildRetryJobUpdateError,
  buildRetryJobNotificationError,
} from "./retryJob.mock.ts";
import {
  buildDialecticJobRow,
  invalidateDialecticJobRow,
  invalidateFailedAttemptError,
} from "../../_shared/dialectic.mock.ts";

// --- isRetryJobDeps ---

const baseDeps = buildRetryJobDeps();

Deno.test("isRetryJobDeps accepts the built deps", () => {
  assertEquals(isRetryJobDeps(baseDeps), true);
});

Deno.test("isRetryJobDeps rejects logger absent", () => {
  const { logger: _, ...withoutLogger } = baseDeps;
  assertEquals(isRetryJobDeps(withoutLogger), false);
});

Deno.test("isRetryJobDeps rejects logger non-object", () => {
  assertEquals(isRetryJobDeps(invalidateRetryJobDeps({ logger: "not-an-object" })), false);
});

Deno.test("isRetryJobDeps rejects notificationService absent", () => {
  const { notificationService: _, ...withoutNotificationService } = baseDeps;
  assertEquals(isRetryJobDeps(withoutNotificationService), false);
});

Deno.test("isRetryJobDeps rejects notificationService non-object", () => {
  assertEquals(isRetryJobDeps(invalidateRetryJobDeps({ notificationService: "not-an-object" })), false);
});

Deno.test("isRetryJobDeps rejects notificationService without sendContributionRetryingEvent", () => {
  assertEquals(isRetryJobDeps(invalidateRetryJobDeps({ notificationService: {} })), false);
});

Deno.test("isRetryJobDeps rejects a non-record root", () => {
  assertEquals(isRetryJobDeps(null), false);
  assertEquals(isRetryJobDeps(undefined), false);
  assertEquals(isRetryJobDeps(42), false);
  assertEquals(isRetryJobDeps("string"), false);
});

// --- isRetryJobParams ---

const baseParams = buildRetryJobParams();

Deno.test("isRetryJobParams accepts the built params", () => {
  assertEquals(isRetryJobParams(baseParams), true);
});

Deno.test("isRetryJobParams rejects dbClient absent", () => {
  const { dbClient: _, ...withoutDbClient } = baseParams;
  assertEquals(isRetryJobParams(withoutDbClient), false);
});

Deno.test("isRetryJobParams rejects dbClient a string", () => {
  assertEquals(isRetryJobParams(invalidateRetryJobParams({ dbClient: "not-a-client" })), false);
});

Deno.test("isRetryJobParams rejects job set to invalidateDialecticJobRow({ id: 42 })", () => {
  assertEquals(isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ id: 42 }) })), false);
});

Deno.test("isRetryJobParams rejects a row whose attempt_count is non-numeric", () => {
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ attempt_count: "not-a-number" }) })),
    false,
  );
});

Deno.test("isRetryJobParams rejects a row whose attempt_count is non-finite", () => {
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ attempt_count: NaN }) })),
    false,
  );
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ attempt_count: Infinity }) })),
    false,
  );
});

Deno.test("isRetryJobParams rejects a row whose attempt_count is negative", () => {
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ attempt_count: -1 }) })),
    false,
  );
});

Deno.test("isRetryJobParams rejects a row whose user_id is absent", () => {
  const { user_id: _, ...rowWithoutUserId } = buildDialecticJobRow();
  assertEquals(isRetryJobParams(invalidateRetryJobParams({ job: rowWithoutUserId })), false);
});

Deno.test("isRetryJobParams rejects a row whose user_id is non-string", () => {
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ user_id: 42 }) })),
    false,
  );
});

Deno.test("isRetryJobParams rejects a row whose user_id is the empty string", () => {
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ user_id: "" }) })),
    false,
  );
});

Deno.test("isRetryJobParams rejects a row whose user_id is whitespace-only", () => {
  assertEquals(
    isRetryJobParams(invalidateRetryJobParams({ job: invalidateDialecticJobRow({ user_id: "   " }) })),
    false,
  );
});

Deno.test("isRetryJobParams rejects a non-record root", () => {
  assertEquals(isRetryJobParams(null), false);
  assertEquals(isRetryJobParams(undefined), false);
  assertEquals(isRetryJobParams(42), false);
  assertEquals(isRetryJobParams("string"), false);
});

// --- isRetryJobPayload ---

const basePayload = buildRetryJobPayload();

Deno.test("isRetryJobPayload accepts the built payload", () => {
  assertEquals(isRetryJobPayload(basePayload), true);
});

Deno.test("isRetryJobPayload rejects a payload whose failedAttempts is an empty array", () => {
  assertEquals(isRetryJobPayload(buildRetryJobPayload({ failedAttempts: [] })), false);
});

Deno.test("isRetryJobPayload rejects failedAttempts absent", () => {
  const { failedAttempts: _, ...withoutFailedAttempts } = basePayload;
  assertEquals(isRetryJobPayload(withoutFailedAttempts), false);
});

Deno.test("isRetryJobPayload rejects failedAttempts a non-array", () => {
  assertEquals(isRetryJobPayload(invalidateRetryJobPayload({ failedAttempts: "not-an-array" })), false);
});

Deno.test("isRetryJobPayload rejects an array containing invalidateFailedAttemptError({ modelId: 42 })", () => {
  assertEquals(
    isRetryJobPayload(invalidateRetryJobPayload({ failedAttempts: [invalidateFailedAttemptError({ modelId: 42 })] })),
    false,
  );
});

Deno.test("isRetryJobPayload rejects a non-record root", () => {
  assertEquals(isRetryJobPayload(null), false);
  assertEquals(isRetryJobPayload(undefined), false);
  assertEquals(isRetryJobPayload(42), false);
  assertEquals(isRetryJobPayload("string"), false);
});

// --- isRetryJobNotifiedReturn ---

Deno.test("isRetryJobNotifiedReturn accepts its own flavor", () => {
  assertEquals(isRetryJobNotifiedReturn(buildRetryJobNotifiedReturn()), true);
});

Deno.test("isRetryJobNotifiedReturn rejects notified absent", () => {
  assertEquals(isRetryJobNotifiedReturn({}), false);
});

Deno.test("isRetryJobNotifiedReturn rejects notified not exactly true", () => {
  assertEquals(isRetryJobNotifiedReturn(invalidateRetryJobNotifiedReturn({ notified: false })), false);
  assertEquals(isRetryJobNotifiedReturn(invalidateRetryJobNotifiedReturn({ notified: "true" })), false);
});

Deno.test("isRetryJobNotifiedReturn rejects the notification-failed flavor", () => {
  assertEquals(isRetryJobNotifiedReturn(buildRetryJobNotificationFailedReturn()), false);
});

Deno.test("isRetryJobNotifiedReturn rejects a non-record root", () => {
  assertEquals(isRetryJobNotifiedReturn(null), false);
  assertEquals(isRetryJobNotifiedReturn(undefined), false);
  assertEquals(isRetryJobNotifiedReturn(42), false);
  assertEquals(isRetryJobNotifiedReturn("string"), false);
});

// --- isRetryJobNotificationFailedReturn ---

Deno.test("isRetryJobNotificationFailedReturn accepts the built flavor", () => {
  assertEquals(isRetryJobNotificationFailedReturn(buildRetryJobNotificationFailedReturn()), true);
});

Deno.test("isRetryJobNotificationFailedReturn accepts a plain Error as notificationError", () => {
  assertEquals(
    isRetryJobNotificationFailedReturn(buildRetryJobNotificationFailedReturn({ notificationError: new Error("plain") })),
    true,
  );
});

Deno.test("isRetryJobNotificationFailedReturn rejects notified not exactly false", () => {
  assertEquals(
    isRetryJobNotificationFailedReturn(invalidateRetryJobNotificationFailedReturn({ notified: true })),
    false,
  );
});

Deno.test("isRetryJobNotificationFailedReturn rejects notificationError absent", () => {
  const { notificationError: _, ...withoutError } = buildRetryJobNotificationFailedReturn();
  assertEquals(isRetryJobNotificationFailedReturn(withoutError), false);
});

Deno.test("isRetryJobNotificationFailedReturn rejects notificationError null", () => {
  assertEquals(
    isRetryJobNotificationFailedReturn(invalidateRetryJobNotificationFailedReturn({ notificationError: null })),
    false,
  );
});

Deno.test("isRetryJobNotificationFailedReturn rejects notificationError a string", () => {
  assertEquals(
    isRetryJobNotificationFailedReturn(invalidateRetryJobNotificationFailedReturn({ notificationError: "string" })),
    false,
  );
});

Deno.test("isRetryJobNotificationFailedReturn rejects notificationError a plain object", () => {
  assertEquals(
    isRetryJobNotificationFailedReturn(invalidateRetryJobNotificationFailedReturn({ notificationError: { message: "plain" } })),
    false,
  );
});

Deno.test("isRetryJobNotificationFailedReturn rejects the notified flavor", () => {
  assertEquals(isRetryJobNotificationFailedReturn(buildRetryJobNotifiedReturn()), false);
});

Deno.test("isRetryJobNotificationFailedReturn rejects a non-record root", () => {
  assertEquals(isRetryJobNotificationFailedReturn(null), false);
  assertEquals(isRetryJobNotificationFailedReturn(undefined), false);
  assertEquals(isRetryJobNotificationFailedReturn(42), false);
  assertEquals(isRetryJobNotificationFailedReturn("string"), false);
});

// --- isRetryJobErrorReturn ---

Deno.test("isRetryJobErrorReturn accepts the built error return", () => {
  assertEquals(isRetryJobErrorReturn(buildRetryJobErrorReturn()), true);
});

Deno.test("isRetryJobErrorReturn rejects error absent", () => {
  const { error: _, ...withoutError } = buildRetryJobErrorReturn();
  assertEquals(isRetryJobErrorReturn(withoutError), false);
});

Deno.test("isRetryJobErrorReturn rejects error a plain object", () => {
  assertEquals(isRetryJobErrorReturn(invalidateRetryJobErrorReturn({ error: { message: "plain" } })), false);
});

Deno.test("isRetryJobErrorReturn rejects error a plain Error that is not a RetryJobUpdateError", () => {
  assertEquals(isRetryJobErrorReturn(invalidateRetryJobErrorReturn({ error: new Error("plain") })), false);
});

Deno.test("isRetryJobErrorReturn rejects retriable absent", () => {
  const { retriable: _, ...withoutRetriable } = buildRetryJobErrorReturn();
  assertEquals(isRetryJobErrorReturn(withoutRetriable), false);
});

Deno.test("isRetryJobErrorReturn rejects retriable non-boolean", () => {
  assertEquals(isRetryJobErrorReturn(invalidateRetryJobErrorReturn({ retriable: "true" })), false);
});

Deno.test("isRetryJobErrorReturn rejects a non-record root", () => {
  assertEquals(isRetryJobErrorReturn(null), false);
  assertEquals(isRetryJobErrorReturn(undefined), false);
  assertEquals(isRetryJobErrorReturn(42), false);
  assertEquals(isRetryJobErrorReturn("string"), false);
});

// --- isRetryJobUpdateError ---

Deno.test("isRetryJobUpdateError accepts buildRetryJobUpdateError()", () => {
  assertEquals(isRetryJobUpdateError(buildRetryJobUpdateError()), true);
});

Deno.test("isRetryJobUpdateError rejects a plain Error", () => {
  assertEquals(isRetryJobUpdateError(new Error("plain")), false);
});

Deno.test("isRetryJobUpdateError rejects a plain object carrying the same three members", () => {
  const plainObject = {
    jobId: "job-1",
    attemptedStatus: "retrying",
    driverMessage: "connection lost",
  };
  assertEquals(isRetryJobUpdateError(plainObject), false);
});

Deno.test("isRetryJobUpdateError rejects null", () => {
  assertEquals(isRetryJobUpdateError(null), false);
});

Deno.test("isRetryJobUpdateError rejects a primitive", () => {
  assertEquals(isRetryJobUpdateError("string"), false);
  assertEquals(isRetryJobUpdateError(42), false);
});

// --- isRetryJobNotificationError ---

Deno.test("isRetryJobNotificationError accepts buildRetryJobNotificationError()", () => {
  assertEquals(isRetryJobNotificationError(buildRetryJobNotificationError()), true);
});

Deno.test("isRetryJobNotificationError rejects a plain Error", () => {
  assertEquals(isRetryJobNotificationError(new Error("plain")), false);
});

Deno.test("isRetryJobNotificationError rejects a plain object carrying the same two members", () => {
  const plainObject = {
    jobId: "job-1",
    thrownValue: "string thrown value",
  };
  assertEquals(isRetryJobNotificationError(plainObject), false);
});

Deno.test("isRetryJobNotificationError rejects buildRetryJobUpdateError()", () => {
  assertEquals(isRetryJobNotificationError(buildRetryJobUpdateError()), false);
});

Deno.test("isRetryJobNotificationError rejects null", () => {
  assertEquals(isRetryJobNotificationError(null), false);
});

Deno.test("isRetryJobNotificationError rejects a primitive", () => {
  assertEquals(isRetryJobNotificationError("string"), false);
  assertEquals(isRetryJobNotificationError(42), false);
});
