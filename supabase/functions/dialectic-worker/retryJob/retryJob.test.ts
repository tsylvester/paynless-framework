import { assertObjectMatch, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { NotificationServiceType } from "../../_shared/types/notification.service.types.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { mockNotificationService, resetMockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { buildDialecticJobRow } from "../../_shared/dialectic.mock.ts";
import { retryJob } from "./retryJob.ts";
import { isRetryJobUpdateError, isRetryJobNotificationError, isRetryJobNotifiedReturn, isRetryJobNotificationFailedReturn } from "./retryJob.guard.ts";
import { buildRetryJobDeps, buildRetryJobParams, buildRetryJobPayload } from "./retryJob.mock.ts";

Deno.test("Contract: a successful update over a row built with attempt_count 3 records status retrying and attempt_count 4 with the payload's failedAttempts", async () => {
  // Arrange — update succeeds; row's attempt_count is 3, so the written value is 4
  resetMockNotificationService();
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{ id: "job-1" }], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const deps = buildRetryJobDeps();
  const params = buildRetryJobParams({ dbClient, job: buildDialecticJobRow({ attempt_count: 3 }) });
  const payload = buildRetryJobPayload();

  // Act
  const result = await retryJob(deps, params, payload);

  // Assert
  assertEquals(isRetryJobNotifiedReturn(result), true);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updateSpy);
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0][0];
  if (!isRecord(updateArgs)) {
    throw new Error("updateArgs is not a record");
  }
  assertObjectMatch(updateArgs, { status: "retrying", attempt_count: 4 });
  if (!isRecord(updateArgs.error_details)) {
    throw new Error("error_details is not a record");
  }
  assertObjectMatch(updateArgs.error_details, { failedAttempts: payload.failedAttempts });
});

Deno.test("Contract: a successful update returns the notified flavor and dispatches a notification carrying the job's identifiers to the project owner", async () => {
  // Arrange — update succeeds, notification succeeds
  resetMockNotificationService();
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{ id: "job-1" }], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const deps = buildRetryJobDeps();
  const params = buildRetryJobParams({ dbClient });
  const payload = buildRetryJobPayload();

  // Act
  const result = await retryJob(deps, params, payload);

  // Assert
  assertEquals(isRetryJobNotifiedReturn(result), true);
  assertEquals(mockNotificationService.sendContributionRetryingEvent.calls.length, 1);
  const notificationArgs = mockNotificationService.sendContributionRetryingEvent.calls[0].args[0];
  const targetUser = mockNotificationService.sendContributionRetryingEvent.calls[0].args[1];
  assertEquals(notificationArgs.job_id, params.job.id);
  assertEquals(notificationArgs.sessionId, params.job.session_id);
  assertEquals(notificationArgs.iterationNumber, params.job.iteration_number);
  assertEquals(notificationArgs.modelId, payload.failedAttempts[0].modelId);
  assertEquals(targetUser, params.job.user_id);
});

Deno.test("Contract: a notification that throws a named Error returns the notification-failed flavor carrying that exact error, and the row write still happened", async () => {
  // Arrange — update succeeds, notification throws an Error
  resetMockNotificationService();
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{ id: "job-1" }], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const thrownError = new Error("notification threw");
  const throwingSend: NotificationServiceType["sendContributionRetryingEvent"] = async () => {
    throw thrownError;
  };
  const deps = buildRetryJobDeps({
    notificationService: {
      ...mockNotificationService,
      sendContributionRetryingEvent: throwingSend,
    },
  });
  const params = buildRetryJobParams({ dbClient });
  const payload = buildRetryJobPayload();

  // Act
  const result = await retryJob(deps, params, payload);

  // Assert
  assertEquals(isRetryJobNotificationFailedReturn(result), true);
  if (isRetryJobNotificationFailedReturn(result)) {
    assertEquals(result.notificationError, thrownError);
  }
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updateSpy);
  assertEquals(updateSpy.callCount, 1);
});

Deno.test("Contract: a notification that throws a non-Error returns the notification-failed flavor carrying a RetryJobNotificationError whose thrownValue is that string", async () => {
  // Arrange — update succeeds, notification throws a string
  resetMockNotificationService();
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{ id: "job-1" }], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const thrownString = "string thrown value";
  const throwingSend: NotificationServiceType["sendContributionRetryingEvent"] = async () => {
    throw thrownString;
  };
  const deps = buildRetryJobDeps({
    notificationService: {
      ...mockNotificationService,
      sendContributionRetryingEvent: throwingSend,
    },
  });
  const params = buildRetryJobParams({ dbClient });
  const payload = buildRetryJobPayload();

  // Act
  const result = await retryJob(deps, params, payload);

  // Assert
  assertEquals(isRetryJobNotificationFailedReturn(result), true);
  if (isRetryJobNotificationFailedReturn(result)) {
    assertEquals(isRetryJobNotificationError(result.notificationError), true);
    if (isRetryJobNotificationError(result.notificationError)) {
      assertEquals(result.notificationError.thrownValue, thrownString);
    }
  }
});

Deno.test("Contract: an update returning a driver error returns the error arm carrying a RetryJobUpdateError with the job id, retrying, and the driver's message, retriable true, and no notification dispatched", async () => {
  // Arrange — update fails with a driver error
  resetMockNotificationService();
  const driverError = new Error("DB connection lost");
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: null, error: driverError },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const deps = buildRetryJobDeps();
  const params = buildRetryJobParams({ dbClient });
  const payload = buildRetryJobPayload();

  // Act
  const result = await retryJob(deps, params, payload);

  // Assert
  assertEquals("error" in result, true);
  if ("error" in result) {
    assertEquals(isRetryJobUpdateError(result.error), true);
    if (isRetryJobUpdateError(result.error)) {
      assertEquals(result.error.jobId, params.job.id);
      assertEquals(result.error.attemptedStatus, "retrying");
      assertEquals(result.error.driverMessage, driverError.message);
    }
    assertEquals(result.retriable, true);
  }
  assertEquals(mockNotificationService.sendContributionRetryingEvent.calls.length, 0);
});

Deno.test("Contract: neither the params object nor the payload array is mutated by any path", async () => {
  // Arrange — successful path, capture payload state before the call
  resetMockNotificationService();
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{ id: "job-1" }], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const deps = buildRetryJobDeps();
  const params = buildRetryJobParams({ dbClient });
  const payload = buildRetryJobPayload();
  const lengthBefore = payload.failedAttempts.length;
  const firstRecordCopy = { ...payload.failedAttempts[0] };

  // Act
  await retryJob(deps, params, payload);

  // Assert
  assertEquals(payload.failedAttempts.length, lengthBefore);
  assertEquals(payload.failedAttempts[0], firstRecordCopy);
});

Deno.test("Contract: a successful update over a row built with attempt_count 0 records attempt_count 1, proving the written value tracks the row's input rather than a constant", async () => {
  // Arrange — update succeeds; row's attempt_count is 0, so the written value is 1
  resetMockNotificationService();
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{ id: "job-1" }], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const deps = buildRetryJobDeps();
  const params = buildRetryJobParams({ dbClient, job: buildDialecticJobRow({ attempt_count: 0 }) });
  const payload = buildRetryJobPayload();

  // Act
  const result = await retryJob(deps, params, payload);

  // Assert
  assertEquals(isRetryJobNotifiedReturn(result), true);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(updateSpy);
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0][0];
  if (!isRecord(updateArgs)) {
    throw new Error("updateArgs is not a record");
  }
  assertObjectMatch(updateArgs, { attempt_count: 1 });
});
